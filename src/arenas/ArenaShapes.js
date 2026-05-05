/**
 * ArenaShapes.js
 * Shape classes used by ArenaGenerator. Each shape knows:
 *   - containsPoint(px, py, r) — whether a circle of radius r fits inside
 *   - getPerimeterPolygon()    — ordered [{x,y}] vertices for wall rendering
 *   - bounds                   — { x, y, w, h } bounding box
 */

// ── Base ──────────────────────────────────────────────────────────────────────
export class ArenaShape {
  containsPoint(_px, _py, _r = 0) { return false; }
  getPerimeterPolygon() { return []; }
  get bounds() { return { x: 0, y: 0, w: 0, h: 0 }; }
  /** Approximate floor area in px² */
  get area() { return this.bounds.w * this.bounds.h; }
  /** Center point */
  get center() {
    const b = this.bounds;
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }
}

// ── Rectangle ────────────────────────────────────────────────────────────────
export class RectShape extends ArenaShape {
  constructor(x, y, w, h, padding = 0, isConnector = false) {
    super();
    this._x = x; this._y = y; this._w = w; this._h = h;
    this._pad = padding;
    this.isConnector = isConnector;
  }

  containsPoint(px, py, r = 0) {
    const p = this._pad + r;
    return px >= this._x + p && px <= this._x + this._w - p &&
           py >= this._y + p && py <= this._y + this._h - p;
  }

  getPerimeterPolygon() {
    const { _x: x, _y: y, _w: w, _h: h, _pad: p } = this;
    return [
      { x: x + p, y: y + p },
      { x: x + w - p, y: y + p },
      { x: x + w - p, y: y + h - p },
      { x: x + p, y: y + h - p },
    ];
  }

  get bounds() { return { x: this._x, y: this._y, w: this._w, h: this._h }; }
  get area() {
    const p = this._pad;
    return Math.max(0, (this._w - p * 2) * (this._h - p * 2));
  }
}

// ── Ellipse ──────────────────────────────────────────────────────────────────
export class EllipseShape extends ArenaShape {
  constructor(cx, cy, rx, ry, padding = 0) {
    super();
    this._cx = cx; this._cy = cy; this._rx = rx; this._ry = ry;
    this._pad = padding;
  }

  containsPoint(px, py, r = 0) {
    const a = this._rx - this._pad - r;
    const b = this._ry - this._pad - r;
    if (a <= 0 || b <= 0) return false;
    const dx = px - this._cx, dy = py - this._cy;
    return (dx * dx) / (a * a) + (dy * dy) / (b * b) <= 1;
  }

  getPerimeterPolygon(steps = 72) {
    const pts = [];
    const a = this._rx - this._pad;
    const b = this._ry - this._pad;
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      pts.push({ x: this._cx + Math.cos(t) * a, y: this._cy + Math.sin(t) * b });
    }
    return pts;
  }

  get bounds() {
    return {
      x: this._cx - this._rx,
      y: this._cy - this._ry,
      w: this._rx * 2,
      h: this._ry * 2,
    };
  }

  get area() {
    const a = this._rx - this._pad, b = this._ry - this._pad;
    return Math.PI * a * b;
  }
}

// ── Convex Blob (irregular organic polygon) ───────────────────────────────────
export class BlobShape extends ArenaShape {
  /**
   * points — array of {x,y} in clockwise or counter-clockwise order, CONVEX
   * padding — inward shrink for containment
   */
  constructor(points, padding = 0) {
    super();
    this._pts = points;
    this._pad = padding;
    this._shrunk = padding > 0 ? _shrinkPolygon(points, padding) : points;
    this._bbox = _boundingBox(points);
  }

  containsPoint(px, py, r = 0) {
    const poly = r > 0 ? _shrinkPolygon(this._shrunk, r) : this._shrunk;
    return _pointInPolygon(px, py, poly);
  }

  getPerimeterPolygon() { return this._pts; }

  get bounds() { return this._bbox; }
  get area() { return Math.abs(_polygonArea(this._pts)); }
}

// ── Composite (union of shapes) ───────────────────────────────────────────────
export class CompositeShape extends ArenaShape {
  constructor(shapes) {
    super();
    this._shapes = shapes;
  }

  containsPoint(px, py, r = 0) {
    return this._shapes.some(s => s.containsPoint(px, py, r));
  }

  /**
   * Returns approximate union perimeter — concatenates outlines of each child shape.
   * For rendering, this works fine even if the outline overlaps itself.
   */
  getPerimeterPolygon() {
    // For rendering we return each shape's perimeter as a separate "ring"
    // but since Phaser strokePoints just draws connected points, we separate
    // them with a gap. Callers iterate _shapes directly for rendering.
    return this._shapes.flatMap(s => s.getPerimeterPolygon());
  }

  get shapes() { return this._shapes; }

  get bounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of this._shapes) {
      const b = s.bounds;
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.w > maxX) maxX = b.x + b.w;
      if (b.y + b.h > maxY) maxY = b.y + b.h;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  get area() { return this._shapes.reduce((sum, s) => sum + s.area, 0); }
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

/** Winding-number point-in-polygon (works for any simple polygon) */
function _pointInPolygon(px, py, poly) {
  let winding = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    if (a.y <= py) {
      if (b.y > py && _cross2(a, b, px, py) > 0) winding++;
    } else {
      if (b.y <= py && _cross2(a, b, px, py) < 0) winding--;
    }
  }
  return winding !== 0;
}

function _cross2(a, b, px, py) {
  return (b.x - a.x) * (py - a.y) - (px - a.x) * (b.y - a.y);
}

/** Move each edge inward by `d` pixels (only reliable for convex polygons) */
function _shrinkPolygon(pts, d) {
  const n = pts.length;
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    // Inward normal from averaged edge directions
    const nx1 = -(p.y - prev.y), ny1 = p.x - prev.x;
    const nx2 = -(next.y - p.y), ny2 = next.x - p.x;
    const len1 = Math.hypot(nx1, ny1) || 1;
    const len2 = Math.hypot(nx2, ny2) || 1;
    const nx = nx1 / len1 + nx2 / len2;
    const ny = ny1 / len1 + ny2 / len2;
    const len = Math.hypot(nx, ny) || 1;
    return { x: p.x + (nx / len) * d, y: p.y + (ny / len) * d };
  });
}

function _boundingBox(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  pts.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  });
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function _polygonArea(pts) {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return area / 2;
}
