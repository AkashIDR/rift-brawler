/**
 * ArenaShapes.js
 *
 * One shape class — `OrganicShape` — wraps a single closed polygon (potentially
 * non-convex) and exposes the interface every consumer in the codebase already uses:
 *   - bounds                   { x, y, w, h }
 *   - area                     px²
 *   - containsPoint(px, py, r) inside polygon AND ≥ r away from every edge
 *   - getPerimeterPolygon()    closed list of {x, y}
 *
 * The previous primitive-stacking system (RectShape / EllipseShape / BlobShape /
 * CompositeShape with connector-rect hacks) was replaced because every junction
 * was a rendering bug. Arenas are now generated as a single procedural polygon
 * by `ArenaGenerator` (metaball field → marching squares → Chaikin smoothing).
 */

// ── Base ─────────────────────────────────────────────────────────────────────
export class ArenaShape {
  containsPoint(_px, _py, _r = 0) { return false; }
  getPerimeterPolygon() { return []; }
  get bounds() { return { x: 0, y: 0, w: 0, h: 0 }; }
  get area() { return 0; }
  get center() {
    const b = this.bounds;
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }
}

// ── Organic single-polygon arena ─────────────────────────────────────────────
export class OrganicShape extends ArenaShape {
  /**
   * @param {Array<{x:number,y:number}>} polygon — closed (don't repeat first point), CCW or CW
   */
  constructor(polygon) {
    super();
    this._poly = polygon;
    this._bounds = _boundingBox(polygon);
    this._area = Math.abs(_polygonArea(polygon));
    this._edges = _buildEdges(polygon);
  }

  containsPoint(px, py, r = 0) {
    if (!_pointInPolygon(px, py, this._poly)) return false;
    if (r <= 0) return true;
    return _minDistToEdges(px, py, this._edges) >= r;
  }

  getPerimeterPolygon() { return this._poly; }
  get bounds() { return this._bounds; }
  get area() { return this._area; }
}

// ── Geometry helpers (also used by ArenaGenerator) ───────────────────────────

/** Winding-number point-in-polygon. Works on any simple polygon (convex or not). */
export function _pointInPolygon(px, py, poly) {
  let winding = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
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

/** Signed polygon area (shoelace). Negative if vertices are clockwise. */
export function _polygonArea(pts) {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return area / 2;
}

/** Axis-aligned bounding box of a point list. */
export function _boundingBox(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Pre-computed edge data for fast point-to-edge distance.
 * Stores ax, ay, dx, dy (segment vector) and lenSq for each segment.
 */
function _buildEdges(poly) {
  const n = poly.length;
  const edges = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    edges[i] = { ax: a.x, ay: a.y, dx, dy, lenSq: dx * dx + dy * dy };
  }
  return edges;
}

/** Minimum Euclidean distance from (px, py) to the polygon edge ring. */
function _minDistToEdges(px, py, edges) {
  let minSq = Infinity;
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    let t = e.lenSq > 0
      ? ((px - e.ax) * e.dx + (py - e.ay) * e.dy) / e.lenSq
      : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const cx = e.ax + e.dx * t - px;
    const cy = e.ay + e.dy * t - py;
    const dSq = cx * cx + cy * cy;
    if (dSq < minSq) minSq = dSq;
  }
  return Math.sqrt(minSq);
}
