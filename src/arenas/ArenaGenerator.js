import { ARENA, OBSTACLES } from '../config/gameConfig.js';
import { RectShape, EllipseShape, BlobShape, CompositeShape } from './ArenaShapes.js';

// ── Shape type catalogue ──────────────────────────────────────────────────────
const SHAPES = [
  'RECT', 'WIDE', 'TALL', 'OVAL', 'CIRCLE',
  'BLOB', 'L_SHAPE', 'TWO_ROOMS',
  'T_SHAPE', 'CROSS', 'FIGURE_8', 'STAR_BLOB',
];

/** Weights per shape type by level bracket [early, mid, late] */
const SHAPE_WEIGHTS = {
  RECT:      [8, 4, 2],
  WIDE:      [5, 3, 2],
  TALL:      [5, 3, 2],
  OVAL:      [6, 4, 3],
  CIRCLE:    [5, 3, 2],
  BLOB:      [0, 5, 4],
  L_SHAPE:   [0, 4, 3],
  TWO_ROOMS: [0, 3, 3],
  T_SHAPE:   [0, 0, 4],
  CROSS:     [0, 0, 4],
  FIGURE_8:  [0, 0, 4],
  STAR_BLOB: [0, 0, 3],
};

function bracketIdx(level) {
  if (level <= 4) return 0;
  if (level <= 9) return 1;
  return 2;
}

function weightedRandom(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function rnd(min, max) { return min + Math.random() * (max - min); }
function rndInt(min, max) { return Math.floor(rnd(min, max + 1)); }
function lerp(a, b, t) { return a + (b - a) * t; }

// ── Main generator ────────────────────────────────────────────────────────────
export default class ArenaGenerator {
  static generate(level) {
    const bracket = bracketIdx(level);
    const weights = SHAPES.map(s => SHAPE_WEIGHTS[s][bracket]);
    const shapeKey = weightedRandom(SHAPES, weights);

    // World size scales gradually with level
    const t = Math.min(1, (level - 1) / 20);
    const baseW = lerp(ARENA.MIN_WORLD_W, ARENA.MAX_WORLD_W, t) * rnd(0.85, 1.15);
    const baseH = lerp(ARENA.MIN_WORLD_H, ARENA.MAX_WORLD_H, t) * rnd(0.85, 1.15);

    const data = this._buildShape(shapeKey, baseW, baseH);

    data.obstacles = this._placeObstacles(data, level);
    return data;
  }

  // ── Shape builders ──────────────────────────────────────────────────────────

  static _buildShape(key, ww, wh) {
    const P = ARENA.PADDING;
    let shape, worldW, worldH, spawnPoint, altarPoint;

    switch (key) {
      // ── Single rectangles ────────────────────────────────────────────────
      case 'RECT': {
        const w = Math.round(ww), h = Math.round(wh);
        worldW = w; worldH = h;
        shape = new RectShape(0, 0, w, h, P);
        altarPoint = { x: w / 2, y: h / 2 };
        spawnPoint = { x: w / 2, y: h - P - 120 };
        break;
      }
      case 'WIDE': {
        const w = Math.round(ww * rnd(1.4, 1.7));
        const h = Math.round(wh * rnd(0.55, 0.7));
        worldW = w; worldH = h;
        shape = new RectShape(0, 0, w, h, P);
        altarPoint = { x: w / 2, y: h / 2 };
        spawnPoint = { x: w / 2, y: h - P - 100 };
        break;
      }
      case 'TALL': {
        const w = Math.round(ww * rnd(0.55, 0.7));
        const h = Math.round(wh * rnd(1.4, 1.7));
        worldW = w; worldH = h;
        shape = new RectShape(0, 0, w, h, P);
        altarPoint = { x: w / 2, y: h / 2 };
        spawnPoint = { x: w / 2, y: h - P - 100 };
        break;
      }

      // ── Ellipses ─────────────────────────────────────────────────────────
      case 'OVAL': {
        const rx = Math.round(ww / 2 * rnd(1.1, 1.3));
        const ry = Math.round(wh / 2 * rnd(0.7, 0.9));
        worldW = rx * 2; worldH = ry * 2;
        shape = new EllipseShape(rx, ry, rx, ry, P);
        altarPoint = { x: rx, y: ry };
        spawnPoint = { x: rx, y: ry * 1.6 };
        break;
      }
      case 'CIRCLE': {
        const r = Math.round(Math.min(ww, wh) / 2 * rnd(0.9, 1.1));
        worldW = r * 2; worldH = r * 2;
        shape = new EllipseShape(r, r, r, r, P);
        altarPoint = { x: r, y: r };
        spawnPoint = { x: r, y: r * 1.6 };
        break;
      }

      // ── Organic blob ─────────────────────────────────────────────────────
      case 'BLOB': {
        const cx = Math.round(ww / 2), cy = Math.round(wh / 2);
        const pts = _generateBlob(cx, cy, ww * 0.42, wh * 0.42, rndInt(9, 13), 0.28);
        worldW = Math.round(ww); worldH = Math.round(wh);
        shape = new BlobShape(pts, P);
        altarPoint = { x: cx, y: cy };
        spawnPoint = { x: cx, y: cy + wh * 0.28 };
        break;
      }

      // ── Star blob (convex with shallow notches) ───────────────────────────
      case 'STAR_BLOB': {
        const cx = Math.round(ww / 2), cy = Math.round(wh / 2);
        const pts = _generateStarBlob(cx, cy, ww * 0.44, wh * 0.44, rndInt(5, 8), 0.32);
        worldW = Math.round(ww); worldH = Math.round(wh);
        shape = new BlobShape(pts, P);
        altarPoint = { x: cx, y: cy };
        spawnPoint = { x: cx, y: cy + wh * 0.26 };
        break;
      }

      // ── L-shape ──────────────────────────────────────────────────────────
      case 'L_SHAPE': {
        const w1 = Math.round(ww * rnd(0.55, 0.65));
        const h1 = Math.round(wh);
        const w2 = Math.round(ww - w1);
        const h2 = Math.round(wh * rnd(0.45, 0.55));
        worldW = Math.round(ww); worldH = h1;
        const lConn = 2 * P; // 140px — bridges 2×padding dead zone at the corner
        shape = new CompositeShape([
          new RectShape(0, 0, w1, h1, P),
          new RectShape(w1 - lConn, h1 - h2, lConn * 2, h2, 0, true), // corner connector
          new RectShape(w1, h1 - h2, w2, h2, P),
        ]);
        altarPoint = { x: w1 / 2, y: h1 / 2 };
        spawnPoint = { x: w1 / 2, y: h1 - P - 110 };
        break;
      }

      // ── Two rooms + corridor ──────────────────────────────────────────────
      case 'TWO_ROOMS': {
        const cw = Math.max(ARENA.MIN_CORRIDOR_W, Math.round(ww * rnd(0.14, 0.2)));
        const room1W = Math.round((ww - cw) / 2 * rnd(0.9, 1.1));
        const room2W = Math.round(ww - cw - room1W);
        const roomH = Math.round(wh * rnd(0.8, 1.0));
        const corrH = Math.round(wh * rnd(0.28, 0.42));
        const corrY = Math.round((roomH - corrH) / 2);
        worldW = room1W + cw + room2W; worldH = roomH;
        const twConn = 2 * P; // extend 140px into each room to bridge the padding dead zone
        shape = new CompositeShape([
          new RectShape(0, 0, room1W, roomH, P),
          new RectShape(room1W - twConn, corrY, cw + twConn * 2, corrH, 0, true), // corridor connector
          new RectShape(room1W + cw, 0, room2W, roomH, P),
        ]);
        altarPoint = { x: worldW / 2, y: roomH / 2 };
        spawnPoint = { x: room1W / 2, y: roomH - P - 110 };
        break;
      }

      // ── T-shape ──────────────────────────────────────────────────────────
      case 'T_SHAPE': {
        const topW = Math.round(ww);
        const topH = Math.round(wh * rnd(0.35, 0.45));
        const stemW = Math.max(ARENA.MIN_CORRIDOR_W, Math.round(ww * rnd(0.32, 0.42)));
        const stemH = Math.round(wh - topH);
        const stemX = Math.round((topW - stemW) / 2);
        worldW = topW; worldH = Math.round(wh);
        const tConn = 2 * P; // bridges the top-bar ↔ stem padding dead zone
        shape = new CompositeShape([
          new RectShape(0, 0, topW, topH, P),
          new RectShape(stemX, topH - tConn, stemW, tConn * 2, 0, true), // junction connector
          new RectShape(stemX, topH, stemW, stemH, P),
        ]);
        altarPoint = { x: topW / 2, y: topH / 2 };
        spawnPoint = { x: topW / 2 + stemW * 0.1, y: topH + stemH - P - 110 };
        break;
      }

      // ── Cross / plus ─────────────────────────────────────────────────────
      case 'CROSS': {
        const armW = Math.max(ARENA.MIN_CORRIDOR_W, Math.round(ww * rnd(0.3, 0.38)));
        const armH = Math.max(ARENA.MIN_CORRIDOR_W, Math.round(wh * rnd(0.3, 0.38)));
        const cx2 = Math.round((ww - armW) / 2);
        const cy2 = Math.round((wh - armH) / 2);
        worldW = Math.round(ww); worldH = Math.round(wh);
        shape = new CompositeShape([
          new RectShape(cx2, 0, armW, wh, P),            // vertical bar
          new RectShape(0, cy2, ww, armH, P),            // horizontal bar
        ]);
        altarPoint = { x: worldW / 2, y: worldH / 2 };
        spawnPoint = { x: worldW / 2, y: worldH - P - 110 };
        break;
      }

      // ── Figure-8 (two ovals sharing a narrow overlap) ────────────────────
      case 'FIGURE_8': {
        const ovalW = Math.round(ww / 2 * rnd(0.9, 1.1));
        const ovalH = Math.round(wh * rnd(0.45, 0.55));
        const overlap = Math.round(ovalW * rnd(0.12, 0.22));
        const rx = ovalW / 2, ry = ovalH / 2;
        const leftCX = rx;
        const rightCX = ovalW * 2 - overlap - rx;
        const cy3 = ry;
        worldW = Math.round(ovalW * 2 - overlap);
        worldH = Math.round(ovalH);
        shape = new CompositeShape([
          new EllipseShape(leftCX, cy3, rx, ry, P),
          new EllipseShape(rightCX, cy3, rx, ry, P),
        ]);
        altarPoint = { x: worldW / 2, y: worldH / 2 };
        spawnPoint = { x: leftCX, y: ovalH - P - 100 };
        break;
      }

      // ── Fallback ──────────────────────────────────────────────────────────
      default: {
        const w = Math.round(ww), h = Math.round(wh);
        worldW = w; worldH = h;
        shape = new RectShape(0, 0, w, h, P);
        altarPoint = { x: w / 2, y: h / 2 };
        spawnPoint = { x: w / 2, y: h - P - 120 };
      }
    }

    const arena = {
      shapeKey: key,
      worldW,
      worldH,
      shape,
      padding: P,
      spawnPoint,
      altarPoint,
      obstacles: [], // filled in separately
      containsPoint(px, py, r = 0) { return shape.containsPoint(px, py, r); },
    };

    return arena;
  }

  // ── Obstacle placement ─────────────────────────────────────────────────────
  static _placeObstacles(arena, level) {
    const { shape, spawnPoint, altarPoint } = arena;
    const bounds = shape.bounds;

    // Generate cluster zones first so background pass can avoid them
    const clusters = this._generateClusters(arena, level);

    // ── Background sparse pass ──────────────────────────────────────────────
    const STEP = 82;
    const candidates = [];
    const maxR = Math.max(OBSTACLES.ROCK_RADIUS, OBSTACLES.TREE_TRUNK_RADIUS) + 20;

    for (let gx = bounds.x + STEP; gx < bounds.x + bounds.w - STEP; gx += STEP) {
      for (let gy = bounds.y + STEP; gy < bounds.y + bounds.h - STEP; gy += STEP) {
        const jx = gx + rnd(-STEP * 0.35, STEP * 0.35);
        const jy = gy + rnd(-STEP * 0.35, STEP * 0.35);

        if (!shape.containsPoint(jx, jy, maxR)) continue;
        if (Math.hypot(jx - spawnPoint.x, jy - spawnPoint.y) < OBSTACLES.CLEAR_RADIUS_SPAWN) continue;
        if (Math.hypot(jx - altarPoint.x, jy - altarPoint.y) < OBSTACLES.CLEAR_RADIUS_ALTAR) continue;
        // Leave cluster zones to the cluster pass
        if (clusters.some(cl => Math.hypot(jx - cl.x, jy - cl.y) < cl.radius + 40)) continue;

        candidates.push({ x: jx, y: jy });
      }
    }

    _shuffle(candidates);
    const maxCount = Math.floor(shape.area * OBSTACLES.DENSITY);
    const placed = [];

    for (const c of candidates) {
      if (placed.length >= maxCount) break;
      const tooClose = placed.some(p => Math.hypot(c.x - p.x, c.y - p.y) < OBSTACLES.MIN_OBSTACLE_GAP);
      if (tooClose) continue;
      placed.push({ x: c.x, y: c.y, ..._pickType(c.x, c.y, bounds) });
    }

    // ── Cluster passes ──────────────────────────────────────────────────────
    for (const cluster of clusters) {
      const clusterObs = this._fillCluster(cluster, shape, spawnPoint, altarPoint, placed);
      placed.push(...clusterObs);
    }

    return placed;
  }

  // ── Cluster zone generation ────────────────────────────────────────────────
  static _generateClusters(arena, level) {
    const { shape, spawnPoint, altarPoint } = arena;
    const area = shape.area;

    if (level < OBSTACLES.CLUSTER_MIN_LEVEL || area < OBSTACLES.CLUSTER_MIN_AREA) return [];

    // More clusters as level and size grow
    const maxClusters = level >= 8 ? rndInt(2, 4) : rndInt(1, 2);
    const clusters = [];
    const THEMES = ['forest', 'rocky'];
    const bounds = shape.bounds;

    for (let attempt = 0; attempt < maxClusters * 10 && clusters.length < maxClusters; attempt++) {
      const radius = rnd(OBSTACLES.CLUSTER_RADIUS_MIN, OBSTACLES.CLUSTER_RADIUS_MAX);
      const cx = bounds.x + rnd(0.15, 0.85) * bounds.w;
      const cy = bounds.y + rnd(0.15, 0.85) * bounds.h;

      if (!shape.containsPoint(cx, cy, radius * 0.5)) continue;
      if (Math.hypot(cx - spawnPoint.x, cy - spawnPoint.y) < radius + 220) continue;
      if (Math.hypot(cx - altarPoint.x, cy - altarPoint.y) < radius + 180) continue;
      if (clusters.some(c => Math.hypot(cx - c.x, cy - c.y) < radius + c.radius + 100)) continue;

      clusters.push({
        x: cx, y: cy, radius,
        theme: THEMES[Math.floor(Math.random() * THEMES.length)],
      });
    }

    return clusters;
  }

  // ── Fill one cluster with themed obstacles ─────────────────────────────────
  static _fillCluster(cluster, shape, spawnPoint, altarPoint, existingObs) {
    const { x: cx, y: cy, radius, theme } = cluster;
    const placed = [];
    const count = rndInt(OBSTACLES.CLUSTER_COUNT_MIN, OBSTACLES.CLUSTER_COUNT_MAX);

    for (let tries = 0; tries < count * 10 && placed.length < count; tries++) {
      // Uniform random point within the cluster circle
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(Math.random()) * radius;
      const px = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist;

      if (!shape.containsPoint(px, py, 30)) continue;
      if (Math.hypot(px - spawnPoint.x, py - spawnPoint.y) < OBSTACLES.CLEAR_RADIUS_SPAWN) continue;
      if (Math.hypot(px - altarPoint.x, py - altarPoint.y) < OBSTACLES.CLEAR_RADIUS_ALTAR) continue;

      const allSoFar = existingObs.concat(placed);
      if (allSoFar.some(p => Math.hypot(px - p.x, py - p.y) < OBSTACLES.CLUSTER_OBSTACLE_GAP)) continue;

      placed.push({ x: px, y: py, ..._pickClusterType(theme) });
    }

    return placed;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate an irregular convex blob (perturbed ellipse) */
function _generateBlob(cx, cy, rx, ry, numPts, perturbFactor) {
  const pts = [];
  for (let i = 0; i < numPts; i++) {
    const angle = (i / numPts) * Math.PI * 2;
    const pr = rnd(1 - perturbFactor, 1 + perturbFactor);
    pts.push({
      x: cx + Math.cos(angle) * rx * pr,
      y: cy + Math.sin(angle) * ry * pr,
    });
  }
  return _makeConvex(pts);
}

/** Generate a star-blob — alternating large/small radii (shallow star) */
function _generateStarBlob(cx, cy, rx, ry, numPoints, notchDepth) {
  const pts = [];
  const total = numPoints * 2;
  for (let i = 0; i < total; i++) {
    const angle = (i / total) * Math.PI * 2;
    const isOuter = i % 2 === 0;
    const radiusFactor = isOuter ? 1 : (1 - notchDepth);
    pts.push({
      x: cx + Math.cos(angle) * rx * radiusFactor,
      y: cy + Math.sin(angle) * ry * radiusFactor,
    });
  }
  return pts; // BlobShape handles containment via winding number
}

/** Compute convex hull (Graham scan) to ensure the blob is convex */
function _makeConvex(pts) {
  if (pts.length < 3) return pts;
  const sorted = [...pts].sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);
  const hull = [];
  // Lower hull
  for (const p of sorted) {
    while (hull.length >= 2 && _cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0)
      hull.pop();
    hull.push(p);
  }
  // Upper hull
  const lower = hull.length + 1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (hull.length >= lower && _cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0)
      hull.pop();
    hull.push(p);
  }
  hull.pop();
  return hull;
}

function _cross(O, A, B) {
  return (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);
}

function _distToEdge(px, py, bounds) {
  const left = px - bounds.x;
  const right = (bounds.x + bounds.w) - px;
  const top = py - bounds.y;
  const bottom = (bounds.y + bounds.h) - py;
  return Math.min(left, right, top, bottom);
}

/** Background obstacle type — tall trees biased toward edges */
function _pickType(px, py, bounds) {
  const edgeFactor = Math.max(0, 1 - _distToEdge(px, py, bounds) / 300);
  const tall = Math.random() < 0.2 + edgeFactor * 0.35;
  if (tall) {
    return { type: 'tree', tall: true, baseRadius: OBSTACLES.TREE_TRUNK_RADIUS, canopyRadius: OBSTACLES.TREE_CANOPY_RADIUS };
  }
  const r = Math.random();
  if (r < 0.55) return { type: 'rock',   tall: false, baseRadius: OBSTACLES.ROCK_RADIUS,   canopyRadius: 0 };
  if (r < 0.80) return { type: 'stump',  tall: false, baseRadius: OBSTACLES.STUMP_RADIUS,  canopyRadius: 0 };
  return               { type: 'pillar', tall: false, baseRadius: OBSTACLES.PILLAR_RADIUS, canopyRadius: 0 };
}

/** Cluster obstacle type — biased by theme (forest / rocky) */
function _pickClusterType(theme) {
  if (theme === 'forest') {
    const r = Math.random();
    if (r < 0.55) return { type: 'tree',  tall: true,  baseRadius: OBSTACLES.TREE_TRUNK_RADIUS, canopyRadius: OBSTACLES.TREE_CANOPY_RADIUS };
    if (r < 0.85) return { type: 'stump', tall: false, baseRadius: OBSTACLES.STUMP_RADIUS,      canopyRadius: 0 };
    return               { type: 'rock',  tall: false, baseRadius: OBSTACLES.ROCK_RADIUS,       canopyRadius: 0 };
  }
  // rocky
  const r = Math.random();
  if (r < 0.60) return { type: 'rock',   tall: false, baseRadius: OBSTACLES.ROCK_RADIUS,   canopyRadius: 0 };
  if (r < 0.85) return { type: 'pillar', tall: false, baseRadius: OBSTACLES.PILLAR_RADIUS, canopyRadius: 0 };
  return               { type: 'stump',  tall: false, baseRadius: OBSTACLES.STUMP_RADIUS,  canopyRadius: 0 };
}

function _shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
