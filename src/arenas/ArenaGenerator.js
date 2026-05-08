/**
 * ArenaGenerator.js
 *
 * Procedural arena generator. Each arena is ONE organic, non-convex polygon
 * produced by:
 *   1. seeding metaballs (count/spread/radius scale with level)
 *   2. evaluating their scalar field (+ optional Perlin noise) on a grid
 *   3. extracting the iso=1.0 contour via marching squares
 *   4. picking the largest connected polygon
 *   5. smoothing it with 2 passes of Chaikin's corner-cutting
 *   6. validating area + inscribed-circle radius
 *
 * Result: a smooth, unique, never-rectangular silhouette with no internal
 * seams. Replaces the old primitive-stacking system entirely.
 */

import { ARENA, OBSTACLES } from '../config/gameConfig.js';
import {
  OrganicShape,
  _pointInPolygon,
  _polygonArea,
  _boundingBox,
} from './ArenaShapes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Generator
// ─────────────────────────────────────────────────────────────────────────────
export default class ArenaGenerator {
  static generate(level) {
    const params = _paramsForLevel(level);

    let polygon = null;
    // Generous retry budget — circularity + thickness gates can reject several
    // candidates before a satisfying lobed-and-roomy polygon is produced.
    for (let tries = 0; tries < 16 && !polygon; tries++) {
      const seeds = _seedMetaballs(params);
      const field = _buildField(seeds, params);
      const polys = _marchingSquares(field);
      const main = _largestPolygon(polys);
      if (!main || main.length < 8) continue;
      const smoothed = _chaikin(main, 2);
      // Marching-squares output is oriented "inside on LEFT of edge direction"
      // (negative shoelace area in screen coords). _shrinkPts in ArenaScene assumes
      // the opposite convention (inside on RIGHT, like the old RectShape did),
      // so reverse here to match. Inner-ring/vignette insets then work as expected.
      if (_polygonArea(smoothed) < 0) smoothed.reverse();
      if (_validateArena(smoothed, params)) polygon = smoothed;
    }
    if (!polygon) polygon = _fallbackOval(params);

    // Translate polygon to positive world coords with a margin around bounds.
    const bb0 = _boundingBox(polygon);
    const margin = 100;
    const dx = margin - bb0.x;
    const dy = margin - bb0.y;
    for (const p of polygon) { p.x += dx; p.y += dy; }

    const shape = new OrganicShape(polygon);
    const altarPoint = _pickAltarPoint(shape);
    const spawnPoint = _pickSpawnPoint(shape, altarPoint);

    const b = shape.bounds;
    const worldW = Math.ceil(b.x + b.w + margin);
    const worldH = Math.ceil(b.y + b.h + margin);

    const arena = {
      worldW,
      worldH,
      shape,
      padding: ARENA.PADDING,
      spawnPoint,
      altarPoint,
      obstacles: [],
      containsPoint(px, py, r = 0) { return shape.containsPoint(px, py, r); },
    };
    arena.obstacles = this._placeObstacles(arena, level);
    return arena;
  }

  // ── Obstacle placement ────────────────────────────────────────────────────
  static _placeObstacles(arena, level) {
    const { shape, spawnPoint, altarPoint } = arena;
    const bounds = shape.bounds;
    const clusters = this._generateClusters(arena, level);
    const themeIdx = _themeIndexForLevel(level);

    const STEP = 82;
    const candidates = [];
    const maxR = Math.max(OBSTACLES.ROCK_RADIUS, OBSTACLES.TREE_TRUNK_RADIUS) + 20;

    for (let gx = bounds.x + STEP; gx < bounds.x + bounds.w - STEP; gx += STEP) {
      for (let gy = bounds.y + STEP; gy < bounds.y + bounds.h - STEP; gy += STEP) {
        const jx = gx + _rnd(-STEP * 0.35, STEP * 0.35);
        const jy = gy + _rnd(-STEP * 0.35, STEP * 0.35);

        if (!shape.containsPoint(jx, jy, maxR)) continue;
        if (Math.hypot(jx - spawnPoint.x, jy - spawnPoint.y) < OBSTACLES.CLEAR_RADIUS_SPAWN) continue;
        if (Math.hypot(jx - altarPoint.x, jy - altarPoint.y) < OBSTACLES.CLEAR_RADIUS_ALTAR) continue;
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

    // Spire pass — theme-specific tall props, ~1 per 600 000 px² of floor
    const spireCount = Math.max(1, Math.floor(shape.area * OBSTACLES.SPIRE_DENSITY));
    let spiresPlaced = 0;
    _shuffle(candidates);
    for (const c of candidates) {
      if (spiresPlaced >= spireCount) break;
      const tooClose = placed.some(p => Math.hypot(c.x - p.x, c.y - p.y) < OBSTACLES.MIN_OBSTACLE_GAP);
      if (tooClose) continue;
      // Spires are tall (canopy fades on occlusion) and carry the themeIdx
      placed.push({ x: c.x, y: c.y, type: 'spire', tall: true, themeIdx });
      spiresPlaced++;
    }

    for (const cluster of clusters) {
      const clusterObs = this._fillCluster(cluster, shape, spawnPoint, altarPoint, placed);
      placed.push(...clusterObs);
    }
    return placed;
  }

  static _generateClusters(arena, level) {
    const { shape, spawnPoint, altarPoint } = arena;
    if (level < OBSTACLES.CLUSTER_MIN_LEVEL || shape.area < OBSTACLES.CLUSTER_MIN_AREA) return [];

    const maxClusters = level >= 8 ? _rndInt(2, 4) : _rndInt(1, 2);
    const clusters = [];
    const THEMES = ['forest', 'rocky'];
    const bounds = shape.bounds;

    for (let attempt = 0; attempt < maxClusters * 10 && clusters.length < maxClusters; attempt++) {
      const radius = _rnd(OBSTACLES.CLUSTER_RADIUS_MIN, OBSTACLES.CLUSTER_RADIUS_MAX);
      const cx = bounds.x + _rnd(0.15, 0.85) * bounds.w;
      const cy = bounds.y + _rnd(0.15, 0.85) * bounds.h;

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

  static _fillCluster(cluster, shape, spawnPoint, altarPoint, existingObs) {
    const { x: cx, y: cy, radius, theme } = cluster;
    const placed = [];
    const count = _rndInt(OBSTACLES.CLUSTER_COUNT_MIN, OBSTACLES.CLUSTER_COUNT_MAX);

    for (let tries = 0; tries < count * 10 && placed.length < count; tries++) {
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

/** Theme bracket from level — must match THEMES order in gameConfig.js */
function _themeIndexForLevel(level) {
  if (level <= 5)  return 0;
  if (level <= 10) return 1;
  if (level <= 15) return 2;
  if (level <= 20) return 3;
  return 4;
}

// ─────────────────────────────────────────────────────────────────────────────
// Procedural pipeline
// ─────────────────────────────────────────────────────────────────────────────

/** Continuous parameter interpolation across level brackets.
 *
 * `maxCircularity` rejects too-round shapes (1.0 = perfect circle).
 * Levels 1–2 allow simple round arenas; levels 3+ require visible asymmetry/lobes.
 *
 * `minLocalRadius` is the thickness floor — interior sample points closer than
 * this to any wall are flagged as "narrow"; if too many samples are narrow,
 * the shape is rejected (prevents pinched/threaded arenas with no maneuver room).
 */
function _paramsForLevel(level) {
  const points = [
    // lvl  seeds  radius  spread  noise  minLocalR  maxCirc
    { lvl: 1,  seedCount: 3, worldRadius: 1300, seedSpread: 0.18, noiseAmp: 0.10, minLocalRadius: 110, maxCircularity: 1.00 },
    { lvl: 3,  seedCount: 4, worldRadius: 1450, seedSpread: 0.35, noiseAmp: 0.15, minLocalRadius: 100, maxCircularity: 0.85 },
    { lvl: 5,  seedCount: 4, worldRadius: 1600, seedSpread: 0.45, noiseAmp: 0.18, minLocalRadius:  95, maxCircularity: 0.78 },
    { lvl: 8,  seedCount: 5, worldRadius: 1800, seedSpread: 0.55, noiseAmp: 0.20, minLocalRadius:  90, maxCircularity: 0.70 },
    { lvl: 12, seedCount: 6, worldRadius: 1950, seedSpread: 0.60, noiseAmp: 0.22, minLocalRadius:  85, maxCircularity: 0.65 },
    { lvl: 20, seedCount: 8, worldRadius: 2200, seedSpread: 0.65, noiseAmp: 0.25, minLocalRadius:  80, maxCircularity: 0.60 },
  ];

  let lo = points[0], hi = points[0];
  if (level >= points[points.length - 1].lvl) {
    lo = hi = points[points.length - 1];
  } else {
    for (let i = 0; i < points.length - 1; i++) {
      if (level >= points[i].lvl && level <= points[i + 1].lvl) {
        lo = points[i];
        hi = points[i + 1];
        break;
      }
    }
  }
  const t = lo.lvl === hi.lvl ? 0 : (level - lo.lvl) / (hi.lvl - lo.lvl);

  return {
    seedCount:          Math.round(_lerp(lo.seedCount, hi.seedCount, t)),
    worldRadius:        _lerp(lo.worldRadius, hi.worldRadius, t),
    seedSpread:         _lerp(lo.seedSpread, hi.seedSpread, t),
    noiseAmp:           _lerp(lo.noiseAmp, hi.noiseAmp, t),
    minLocalRadius:     _lerp(lo.minLocalRadius, hi.minLocalRadius, t),
    maxCircularity:     _lerp(lo.maxCircularity, hi.maxCircularity, t),
    cellSize:           24,
    minArea:            1_400_000,
    minInscribedRadius: 220,
  };
}

/** First seed at origin; rest scattered within `seedSpread × worldRadius`. */
function _seedMetaballs(p) {
  const seeds = [{
    x: 0, y: 0,
    r: p.worldRadius * _rnd(0.35, 0.55),
  }];
  for (let i = 1; i < p.seedCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = _rnd(0.3, 1.0) * p.seedSpread * p.worldRadius;
    seeds.push({
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      r: p.worldRadius * _rnd(0.30, 0.50),
    });
  }
  return seeds;
}

/** Sample the metaball + noise field on a square grid covering all seeds. */
function _buildField(seeds, p) {
  let maxAbs = 0;
  for (const s of seeds) {
    maxAbs = Math.max(maxAbs, Math.abs(s.x) + s.r, Math.abs(s.y) + s.r);
  }
  const buffer = p.cellSize * 3;
  const half = Math.ceil((maxAbs + buffer) / p.cellSize) * p.cellSize;
  const min = -half;
  const cols = Math.round((2 * half) / p.cellSize) + 1;
  const rows = cols;
  const data = new Float32Array(cols * rows);

  for (let j = 0; j < rows; j++) {
    const wy = min + j * p.cellSize;
    for (let i = 0; i < cols; i++) {
      const wx = min + i * p.cellSize;
      let v = 0;
      for (let k = 0; k < seeds.length; k++) {
        const s = seeds[k];
        const dx = wx - s.x, dy = wy - s.y;
        const dSq = dx * dx + dy * dy + 0.0001;
        v += (s.r * s.r) / dSq;
      }
      if (p.noiseAmp > 0) {
        v += (_perlin(wx * 0.0018, wy * 0.0018) - 0.5) * p.noiseAmp * 2;
      }
      data[j * cols + i] = v;
    }
  }

  return { data, cols, rows, min, cell: p.cellSize };
}

// ── Value-noise (smooth 2D pseudo-Perlin, no external dep) ──────────────────
function _hash2(ix, iy) {
  let h = (ix | 0) * 374761393 + (iy | 0) * 668265263;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}
function _smoothstep(t) { return t * t * (3 - 2 * t); }
function _perlin(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const v00 = _hash2(ix,     iy);
  const v10 = _hash2(ix + 1, iy);
  const v01 = _hash2(ix,     iy + 1);
  const v11 = _hash2(ix + 1, iy + 1);
  const sx = _smoothstep(fx), sy = _smoothstep(fy);
  const a = v00 + (v10 - v00) * sx;
  const b = v01 + (v11 - v01) * sx;
  return a + (b - a) * sy;
}

// ── Marching squares ────────────────────────────────────────────────────────
/** Returns a list of polygons (each a closed list of {x,y}) at iso=1.0. */
function _marchingSquares(field) {
  const { data, cols, rows, min, cell } = field;
  const iso = 1.0;
  const segments = [];

  const f = (i, j) => data[j * cols + i];
  const wxAt = (i) => min + i * cell;
  const wyAt = (j) => min + j * cell;

  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const fTL = f(i,     j);
      const fTR = f(i + 1, j);
      const fBR = f(i + 1, j + 1);
      const fBL = f(i,     j + 1);

      let idx = 0;
      if (fTL > iso) idx |= 8;
      if (fTR > iso) idx |= 4;
      if (fBR > iso) idx |= 2;
      if (fBL > iso) idx |= 1;
      if (idx === 0 || idx === 15) continue;

      const xL = wxAt(i), xR = wxAt(i + 1), yT = wyAt(j), yB = wyAt(j + 1);
      const N = () => ({ x: xL + cell * _t(fTL, fTR, iso), y: yT });
      const E = () => ({ x: xR,                            y: yT + cell * _t(fTR, fBR, iso) });
      const S = () => ({ x: xL + cell * _t(fBL, fBR, iso), y: yB });
      const W = () => ({ x: xL,                            y: yT + cell * _t(fTL, fBL, iso) });

      switch (idx) {
        case  1: segments.push([W(), S()]); break;
        case  2: segments.push([S(), E()]); break;
        case  3: segments.push([W(), E()]); break;
        case  4: segments.push([N(), E()]); break;
        case  5: { // saddle: TR + BL
          const c = (fTL + fTR + fBR + fBL) * 0.25;
          if (c > iso) { segments.push([N(), E()]); segments.push([W(), S()]); }
          else         { segments.push([N(), W()]); segments.push([S(), E()]); }
          break;
        }
        case  6: segments.push([N(), S()]); break;
        case  7: segments.push([N(), W()]); break;
        case  8: segments.push([N(), W()]); break;
        case  9: segments.push([N(), S()]); break;
        case 10: { // saddle: TL + BR
          const c = (fTL + fTR + fBR + fBL) * 0.25;
          if (c > iso) { segments.push([N(), W()]); segments.push([S(), E()]); }
          else         { segments.push([N(), E()]); segments.push([W(), S()]); }
          break;
        }
        case 11: segments.push([N(), E()]); break;
        case 12: segments.push([W(), E()]); break;
        case 13: segments.push([S(), E()]); break;
        case 14: segments.push([W(), S()]); break;
      }
    }
  }
  return _stitchSegments(segments);
}

function _t(fA, fB, iso) {
  const denom = fB - fA;
  if (Math.abs(denom) < 1e-9) return 0.5;
  let t = (iso - fA) / denom;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return t;
}

/** Walk segments end-to-end via shared endpoints (quantized) into closed polygons. */
function _stitchSegments(segments) {
  const polygons = [];
  if (segments.length === 0) return polygons;

  const PREC = 100;
  const key = (p) => `${Math.round(p.x * PREC)},${Math.round(p.y * PREC)}`;
  const map = new Map();
  for (const seg of segments) {
    const ka = key(seg[0]);
    const kb = key(seg[1]);
    if (!map.has(ka)) map.set(ka, []);
    if (!map.has(kb)) map.set(kb, []);
    map.get(ka).push({ seg, end: 0 });
    map.get(kb).push({ seg, end: 1 });
  }

  const visited = new Set();
  for (const startSeg of segments) {
    if (visited.has(startSeg)) continue;

    const poly = [startSeg[0], startSeg[1]];
    visited.add(startSeg);
    let next = startSeg[1];
    const startKey = key(startSeg[0]);

    let safety = 0;
    while (safety++ < 200000) {
      const nk = key(next);
      const candidates = map.get(nk) || [];
      let nextSeg = null;
      let nextEnd = -1;
      for (const c of candidates) {
        if (visited.has(c.seg)) continue;
        nextSeg = c.seg;
        nextEnd = c.end;
        break;
      }
      if (!nextSeg) break;
      visited.add(nextSeg);
      const otherEnd = nextSeg[1 - nextEnd];
      if (key(otherEnd) === startKey) break;  // closed without duplicating start
      poly.push(otherEnd);
      next = otherEnd;
    }
    if (poly.length >= 4) polygons.push(poly);
  }
  return polygons;
}

// ── Smoothing & post-processing ─────────────────────────────────────────────
function _chaikin(poly, passes) {
  let pts = poly;
  for (let p = 0; p < passes; p++) {
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    pts = out;
  }
  return pts;
}

function _largestPolygon(polys) {
  if (!polys.length) return null;
  let best = polys[0];
  let bestArea = Math.abs(_polygonArea(best));
  for (let i = 1; i < polys.length; i++) {
    const a = Math.abs(_polygonArea(polys[i]));
    if (a > bestArea) { best = polys[i]; bestArea = a; }
  }
  return best;
}

function _validateArena(poly, p) {
  const area = Math.abs(_polygonArea(poly));
  if (area < p.minArea) return false;

  const bb = _boundingBox(poly);
  const edges = poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    return { ax: a.x, ay: a.y, dx, dy, lenSq: dx * dx + dy * dy };
  });
  const distToEdges = (px, py) => {
    let minD = Infinity;
    for (const e of edges) {
      let t = e.lenSq > 0 ? ((px - e.ax) * e.dx + (py - e.ay) * e.dy) / e.lenSq : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const ex = e.ax + e.dx * t - px;
      const ey = e.ay + e.dy * t - py;
      const d = Math.sqrt(ex * ex + ey * ey);
      if (d < minD) minD = d;
    }
    return minD;
  };

  // ── Inscribed-radius check: at least one interior point ≥ minInscribedRadius ──
  let maxR = 0;
  let cx = 0, cy = 0;
  for (const pt of poly) { cx += pt.x; cy += pt.y; }
  cx /= poly.length; cy /= poly.length;
  if (_pointInPolygon(cx, cy, poly)) maxR = distToEdges(cx, cy);
  for (let j = 1; j <= 4; j++) {
    for (let i = 1; i <= 4; i++) {
      const sx = bb.x + (i / 5) * bb.w, sy = bb.y + (j / 5) * bb.h;
      if (!_pointInPolygon(sx, sy, poly)) continue;
      const d = distToEdges(sx, sy);
      if (d > maxR) maxR = d;
    }
  }
  if (maxR < p.minInscribedRadius) return false;

  // ── Thickness check: most interior points must be ≥ minLocalRadius from any wall.
  // Catches pinched/threaded arenas where the inscribed circle passes but most of
  // the playable area is too narrow to maneuver in.
  if (p.minLocalRadius > 0) {
    const TARGET = 60;
    let valid = 0, narrow = 0, attempts = 0;
    while (valid < TARGET && attempts < TARGET * 6) {
      attempts++;
      const sx = bb.x + Math.random() * bb.w;
      const sy = bb.y + Math.random() * bb.h;
      if (!_pointInPolygon(sx, sy, poly)) continue;
      valid++;
      if (distToEdges(sx, sy) < p.minLocalRadius) narrow++;
    }
    if (valid >= 20 && narrow / valid > 0.30) return false; // > 30% narrow → reject
  }

  // ── Circularity check: 4πA / P². 1.0 = perfect circle, smaller = more lobed.
  // Forces level 3+ arenas to have visible asymmetry instead of looking like
  // generic circles or ovals.
  if (p.maxCircularity > 0 && p.maxCircularity < 1) {
    let perim = 0;
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      perim += Math.hypot(b.x - a.x, b.y - a.y);
    }
    if (perim > 0) {
      const circ = (4 * Math.PI * area) / (perim * perim);
      if (circ > p.maxCircularity) return false;
    }
  }

  return true;
}

function _pickAltarPoint(shape) {
  const poly = shape.getPerimeterPolygon();
  let cx = 0, cy = 0;
  for (const pt of poly) { cx += pt.x; cy += pt.y; }
  cx /= poly.length; cy /= poly.length;
  if (shape.containsPoint(cx, cy, 120)) return { x: cx, y: cy };

  const b = shape.bounds;
  for (let tries = 0; tries < 200; tries++) {
    const u = Math.random(), v = Math.random();
    const tx = b.x + b.w * (0.5 + (u - 0.5) * 0.6);
    const ty = b.y + b.h * (0.5 + (v - 0.5) * 0.6);
    if (shape.containsPoint(tx, ty, 120)) return { x: tx, y: ty };
  }
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

function _pickSpawnPoint(shape, altar) {
  const b = shape.bounds;
  const diameter = Math.max(b.w, b.h);
  const offset = diameter * 0.30;
  // Prefer "south" of altar; also try other directions if blocked
  const angles = [
    Math.PI / 2,         // due south
    Math.PI / 2.4,
    Math.PI / 1.7,
    Math.PI / 3,
    Math.PI / 1.5,
    Math.PI / 4,
    Math.PI * 3 / 4,
    0, Math.PI,
  ];
  for (const a of angles) {
    for (let scale = 1.0; scale >= 0.4; scale -= 0.15) {
      const sx = altar.x + Math.cos(a) * offset * scale;
      const sy = altar.y + Math.sin(a) * offset * scale;
      if (shape.containsPoint(sx, sy, 60)) return { x: sx, y: sy };
    }
  }
  for (let tries = 0; tries < 100; tries++) {
    const tx = b.x + Math.random() * b.w;
    const ty = b.y + Math.random() * b.h;
    if (shape.containsPoint(tx, ty, 60) && Math.hypot(tx - altar.x, ty - altar.y) > 200) {
      return { x: tx, y: ty };
    }
  }
  return { x: altar.x + 100, y: altar.y + 100 };
}

function _fallbackOval(p) {
  const r = p.worldRadius * 0.8;
  const pts = [];
  const steps = 64;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return pts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Obstacle helpers (kept verbatim from previous implementation)
// ─────────────────────────────────────────────────────────────────────────────

function _distToEdge(px, py, bounds) {
  return Math.min(
    px - bounds.x,
    (bounds.x + bounds.w) - px,
    py - bounds.y,
    (bounds.y + bounds.h) - py,
  );
}

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

function _pickClusterType(theme) {
  if (theme === 'forest') {
    const r = Math.random();
    if (r < 0.55) return { type: 'tree',  tall: true,  baseRadius: OBSTACLES.TREE_TRUNK_RADIUS, canopyRadius: OBSTACLES.TREE_CANOPY_RADIUS };
    if (r < 0.85) return { type: 'stump', tall: false, baseRadius: OBSTACLES.STUMP_RADIUS,      canopyRadius: 0 };
    return               { type: 'rock',  tall: false, baseRadius: OBSTACLES.ROCK_RADIUS,       canopyRadius: 0 };
  }
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

// ── Tiny utilities ──────────────────────────────────────────────────────────
function _rnd(min, max) { return min + Math.random() * (max - min); }
function _rndInt(min, max) { return Math.floor(_rnd(min, max + 1)); }
function _lerp(a, b, t) { return a + (b - a) * t; }
