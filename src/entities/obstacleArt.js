// Obstacle art — canvas-baked gradient textures for gameplay obstacles.
// Phaser Graphics can't gradient-fill, so each obstacle is drawn into a canvas 2D context
// with real gradients (cylinder / dome / faceted) and shown as a single Image — dimensional
// shading + a perf win over live Graphics. Behavior (occlusion, sway, break) stays in Obstacle.js.

// ── Color helpers ─────────────────────────────────────────────────────────────
export function hexToRgba(int, a = 1) {
  const r = (int >> 16) & 0xff, g = (int >> 8) & 0xff, b = int & 0xff;
  return `rgba(${r},${g},${b},${a})`;
}

// Multiply an 0xRRGGBB color's channels by f (clamped) → lighter (f>1) / darker (f<1) variant.
export function shade(int, f) {
  const r = Math.min(255, Math.round(((int >> 16) & 0xff) * f));
  const g = Math.min(255, Math.round(((int >> 8) & 0xff) * f));
  const b = Math.min(255, Math.round((int & 0xff) * f));
  return (r << 16) | (g << 8) | b;
}

// Linear blend of two 0xRRGGBB colors (t: 0 → c1, 1 → c2).
export function lerpColor(c1, c2, t) {
  const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
  return (Math.round(r1 + (r2 - r1) * t) << 16)
       | (Math.round(g1 + (g2 - g1) * t) << 8)
       |  Math.round(b1 + (b2 - b1) * t);
}

// Trace a closed polygon path from a vertex list (no fill/stroke).
function pathPoly(ctx, verts) {
  ctx.beginPath();
  verts.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
  ctx.closePath();
}

// Trace a rounded-rect path (arcTo — matches StoneStyle's approach; no fill/stroke).
function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y,     x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x,     y + h, rr);
  ctx.arcTo(x,     y + h, x,     y,     rr);
  ctx.arcTo(x,     y,     x + w, y,     rr);
  ctx.closePath();
}

// Same as roundRectPath but the flat bottom edge is replaced with a shallow downward bulge
// (3 inserted points, same technique as the volcanic trunk's rounded base) so the column's
// contact with the ground reads as a rounded contour instead of a flat, square-cut edge.
function roundRectBulgeBottomPath(ctx, x, y, w, h, rTop, bulge) {
  const rr = Math.max(0, Math.min(rTop, w / 2, h / 2));
  const left = x, right = x + w, top = y, bottom = y + h;
  ctx.beginPath();
  ctx.moveTo(left + rr, top);
  ctx.lineTo(right - rr, top);
  ctx.arcTo(right, top, right, top + rr, rr);
  ctx.lineTo(right, bottom);
  ctx.lineTo(left + w * 0.75, bottom + bulge * 0.7);
  ctx.lineTo(left + w * 0.5,  bottom + bulge);
  ctx.lineTo(left + w * 0.25, bottom + bulge * 0.7);
  ctx.lineTo(left, bottom);
  ctx.lineTo(left, top + rr);
  ctx.arcTo(left, top, left + rr, top, rr);
  ctx.closePath();
}

// Trace a triangle path (no fill/stroke).
function triPath(ctx, x1, y1, x2, y2, x3, y3) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath();
}

// ─────────────────────────────────────────────────────────────────────────────
// Rock — jagged faceted boulder. Light from top-left.
// A smooth radial dome would kill the angular read, so the jagged polygon is filled
// with a DIRECTIONAL linear gradient along the light axis (rockHL → rockBody → rockShade),
// then softened per-facet shade/highlight sub-polygons + crack lines on top.
// ─────────────────────────────────────────────────────────────────────────────

function traceJagged(ctx, cx, cy, rx, ry, ptCount, hashOff, hash) {
  const verts = [];
  for (let i = 0; i < ptCount; i++) {
    const baseA  = (i / ptCount) * Math.PI * 2;
    const jitter = (hash(hashOff + i * 2) - 0.5) * (Math.PI * 2 / ptCount) * 0.55;
    const rScale = 0.62 + hash(hashOff + i * 2 + 1) * 0.38;
    verts.push({
      x: cx + Math.cos(baseA + jitter) * rx * rScale,
      y: cy + Math.sin(baseA + jitter) * ry * rScale,
    });
  }
  pathPoly(ctx, verts);
  return verts;
}

function drawOneRock(ctx, cx, cy, rx, ry, ptCount, hBase, tc, hash) {
  // Contact shadow — layered ellipses (wide+faint → narrow+dark) for a soft fade.
  const shx = cx + rx * 0.15, shy = cy + ry * 0.62;
  ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.beginPath(); ctx.ellipse(shx, shy, rx * 0.95, ry * 0.34, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.beginPath(); ctx.ellipse(shx, shy, rx * 0.78, ry * 0.27, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(shx, shy, rx * 0.58, ry * 0.20, 0, 0, Math.PI * 2); ctx.fill();

  // Base jagged polygon — mostly body with a SUBTLE darkening toward the bottom-right
  // (keeps depth without smoothing the rock into a dome; the hard facets below do the shading).
  const verts = traceJagged(ctx, cx, cy, rx, ry, ptCount, hBase, hash);
  const grad = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
  grad.addColorStop(0,   hexToRgba(tc.rockBody, 1));
  grad.addColorStop(0.6, hexToRgba(tc.rockBody, 1));
  grad.addColorStop(1,   hexToRgba(tc.rockShade, 1));
  ctx.fillStyle = grad;
  ctx.fill();

  // Strong hard-edged shade facet — the dark plane (bottom-right). Crisp edge = faceted look.
  const shadeV = verts.map(v => ({
    x: cx + (v.x - cx) * 0.72 + rx * 0.20,
    y: cy + (v.y - cy) * 0.72 + ry * 0.15,
  }));
  ctx.fillStyle = hexToRgba(tc.rockShade, 0.88);
  pathPoly(ctx, shadeV); ctx.fill();

  // Strong hard-edged highlight facet — the lit plane (top-left).
  const hlV = verts.map(v => ({
    x: cx + (v.x - cx) * 0.38 - rx * 0.22,
    y: cy + (v.y - cy) * 0.38 - ry * 0.28,
  }));
  ctx.fillStyle = hexToRgba(tc.rockHL, 0.60);
  pathPoly(ctx, hlV); ctx.fill();

  // Glowing crack network — Volcanic (molten lava, warm hardcoded orange) or any theme
  // with `tc.crackGlow` set (e.g. Chaos, using tc.rockCrack instead — this is what makes
  // Chaos rocks show a magenta crack-glow instead of ONLY the cyan highlight facet above,
  // which is otherwise the sole accent a rock can carry). Clipped strictly to the rock's
  // own jagged silhouette (verts) so a crack can NEVER bleed past the rock edge. Glow
  // varies ACROSS each stroke's width, not along its length: 3 concentric solid-color
  // strokes, widest+dimmest underneath down to narrowest+brightest on top (same outer/mid/
  // inner layering this project already uses for telegraph glows). Main cracks fork into
  // thinner branches (sometimes branches fork again) so the whole face reads as one
  // connected network, not a couple of isolated lines.
  if (tc.lavaGlow || tc.crackGlow) {
    ctx.save();
    pathPoly(ctx, verts);
    ctx.clip(); // hard guarantee: nothing below can render outside the rock

    // Volcanic keeps its literal molten-lava orange; any other crackGlow theme derives its
    // glow palette from tc.rockCrack so the crack reads as that theme's own accent color.
    const warm       = tc.lavaGlow;
    const coreGlow    = warm ? 'rgba(255,102,0,0.14)'   : hexToRgba(tc.rockCrack, 0.16);
    const midColor    = warm ? 'rgba(255,140,40,0.70)'  : hexToRgba(shade(tc.rockCrack, 1.25), 0.70);
    const coreColor   = warm ? 'rgba(255,225,150,0.98)' : hexToRgba(shade(tc.rockCrack, 1.6), 0.98);
    const poolCore    = warm ? 'rgba(255,225,150,0.85)' : hexToRgba(shade(tc.rockCrack, 1.6), 0.85);
    const poolMid     = warm ? 'rgba(255,140,30,0.55)'  : hexToRgba(tc.rockCrack, 0.55);
    const poolEdge    = warm ? 'rgba(255,80,0,0)'       : hexToRgba(tc.rockCrack, 0);

    // Molten/energy core glow — small and subtle.
    ctx.fillStyle = coreGlow;
    ctx.beginPath(); ctx.arc(cx, cy, rx * 0.16, 0, Math.PI * 2); ctx.fill();

    // 3-layer glow stroke, width scaled by `w` (1.0 = main crack, smaller = a branch).
    // Brighter/wider than before across the board — the whole point is more glow.
    const glowStroke = (pts, w) => {
      const strokePath = () => {
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      };
      ctx.strokeStyle = hexToRgba(tc.rockCrack, 0.32); ctx.lineWidth = rx * 0.22 * w;
      strokePath(); ctx.stroke();
      ctx.strokeStyle = midColor; ctx.lineWidth = rx * 0.10 * w;
      strokePath(); ctx.stroke();
      ctx.strokeStyle = coreColor; ctx.lineWidth = Math.max(0.6, 0.9 * w);
      strokePath(); ctx.stroke();
    };

    // A jagged multi-segment path starting at (px,py) heading roughly `ang0`.
    const buildPath = (px, py, ang0, segs, totalLen, saltBase) => {
      const pts = [{ x: px, y: py }];
      let ang = ang0;
      for (let s = 0; s < segs; s++) {
        ang += (hash(saltBase + s) - 0.5) * 1.3; // strong per-segment bend — jagged, not a spoke
        const segLen = (totalLen / segs) * (0.7 + hash(saltBase + 20 + s) * 0.6);
        px += Math.cos(ang) * segLen;
        py += Math.sin(ang) * segLen * (ry / rx);
        pts.push({ x: px, y: py });
      }
      return { pts, lastAng: ang };
    };

    // A branch off `pts[fromIdx]`, continuing at a divergent angle from the parent's heading.
    const addBranch = (pts, fromIdx, parentAng, w, saltBase) => {
      const branchAng = parentAng + (hash(saltBase) < 0.5 ? 1 : -1) * (0.6 + hash(saltBase + 1) * 0.5);
      const branchLen = rx * (0.18 + hash(saltBase + 2) * 0.14);
      const { pts: bpts } = buildPath(pts[fromIdx].x, pts[fromIdx].y, branchAng, 2, branchLen, saltBase + 4);
      glowStroke(bpts, w);
      return bpts;
    };

    const crackN = 2 + Math.floor(hash(hBase + 58) * 2); // 2-3 main cracks
    for (let k = 0; k < crackN; k++) {
      // Origin near the TOP of the rock (not the center) — cracks should read as running
      // down from a high ridge toward the base, matching the reference art's verticality.
      const originX = cx + (hash(hBase + 60 + k) - 0.5) * rx * 0.9;
      const originY = cy - ry * (0.55 + hash(hBase + 62 + k) * 0.20);

      // Predominantly DOWNWARD heading (π/2 = straight down), fanned only slightly left/
      // right — the previous 0.15π-0.85π range was measured from horizontal and read as
      // sideways lines with barely any downward tilt, which is why it looked wrong.
      const fan = (k - (crackN - 1) / 2) * 0.5; // spread multiple cracks apart a bit
      const baseAng  = Math.PI / 2 + fan + (hash(hBase + 68 + k) - 0.5) * 0.4;
      const segs     = 3 + Math.floor(hash(hBase + 64 + k) * 2); // 3-4 jagged segments
      const totalLen = ry * (0.85 + hash(hBase + 66 + k) * 0.35); // scaled to the rock's HEIGHT now
      const { pts, lastAng } = buildPath(originX, originY, baseAng, segs, totalLen, hBase + 100 + k * 30);
      glowStroke(pts, 1.0);

      // First branch — likely, off an early-mid segment.
      if (hash(hBase + 90 + k) < 0.65 && pts.length > 2) {
        const fromIdx = 1 + Math.floor(hash(hBase + 91 + k) * (pts.length - 2));
        const branchPts = addBranch(pts, fromIdx, lastAng, 0.6, hBase + 130 + k * 30);
        // Occasional second-level fork off that branch, thinner still — deepens the network.
        if (hash(hBase + 95 + k) < 0.35 && branchPts.length > 1) {
          addBranch(branchPts, branchPts.length - 1, lastAng, 0.4, hBase + 140 + k * 30);
        }
      }

      // Molten/energy pool glow where the crack reaches the base — a soft bright blob,
      // matching the reference art's lava pooling at the bottom of each fissure (or, for
      // crackGlow themes, an equivalent glow in that theme's own crack color).
      const tip = pts[pts.length - 1];
      const poolR = rx * 0.13;
      const pool = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, poolR);
      pool.addColorStop(0,   poolCore);
      pool.addColorStop(0.5, poolMid);
      pool.addColorStop(1,   poolEdge);
      ctx.fillStyle = pool;
      ctx.beginPath(); ctx.arc(tip.x, tip.y, poolR, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

// Bake a rock cluster texture. params: { r, variant, ptCount, scaleMult }. hash(salt)→[0,1).
// The Image is centered (origin 0.5) on the obstacle position, so draw in centered local coords.
export function bakeRockTexture(scene, key, params, tc, hash) {
  const { r, variant, ptCount, scaleMult } = params;
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const cw = Math.ceil(r * 4.4), ch = Math.ceil(r * 4.0);
  const tex = scene.textures.createCanvas(key, cw, ch);
  const ctx = tex.getContext();
  ctx.save();
  ctx.translate(cw / 2, ch / 2);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  switch (variant) {
    case 0: { // Solo boulder
      const rx = r * scaleMult, ry = rx * 0.78;
      drawOneRock(ctx, 0, 0, rx, ry, ptCount, 100, tc, hash);
      break;
    }
    case 1: { // Twin cluster
      const ang = hash(10) * Math.PI;
      const rx0 = r * scaleMult,                       ry0 = rx0 * 0.78;
      const rx1 = rx0 * (0.72 + hash(11) * 0.18),      ry1 = rx1 * 0.78;
      const d   = r * (0.55 + hash(12) * 0.20);
      drawOneRock(ctx, -Math.cos(ang) * d * 0.40, -Math.sin(ang) * d * 0.20, rx0, ry0, ptCount, 100, tc, hash);
      drawOneRock(ctx,  Math.cos(ang) * d * 0.60,  Math.sin(ang) * d * 0.25, rx1, ry1, ptCount, 150, tc, hash);
      break;
    }
    case 2: { // Main + 2 satellites
      const ang1 = hash(10) * Math.PI * 2;
      const ang2 = ang1 + Math.PI * (0.5 + hash(11) * 0.60);
      const rx0  = r * scaleMult,                      ry0 = rx0 * 0.78;
      const rx1  = rx0 * (0.66 + hash(12) * 0.14),     ry1 = rx1 * 0.78;
      const rx2  = rx0 * (0.58 + hash(13) * 0.14),     ry2 = rx2 * 0.78;
      drawOneRock(ctx, 0, 0, rx0, ry0, ptCount, 100, tc, hash);
      drawOneRock(ctx, Math.cos(ang1) * r * (0.60 + hash(14) * 0.15), Math.sin(ang1) * r * 0.30, rx1, ry1, ptCount, 150, tc, hash);
      drawOneRock(ctx, Math.cos(ang2) * r * (0.52 + hash(15) * 0.15), Math.sin(ang2) * r * 0.25, rx2, ry2, ptCount, 200, tc, hash);
      break;
    }
    case 3: { // Flat slab
      const rx = r * scaleMult * 1.30, ry = rx * 0.52;
      drawOneRock(ctx, 0, 0, rx, ry, ptCount, 100, tc, hash);
      break;
    }
  }

  ctx.restore();
  tex.refresh();
  return key;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pillar — stone column. The shaft is a CYLINDER: a horizontal gradient across the
// width (lit core left-of-center, shadow on the right edge) replaces the old flat body +
// flat dark band. Cap/broken-top variants and vertical weathering cracks on top.
// Returns { key, originX, originY } — the Image origin so local (0,0) = the pillar base.
// ─────────────────────────────────────────────────────────────────────────────

// Rounded 3D cylinder top — a domed, top-lit ellipse cap (like the stump's cut face).
function cylTopCap(ctx, cx, topY, w, color) {
  const rx = w / 2, ry = w * 0.16;
  ctx.beginPath();
  ctx.ellipse(cx, topY, rx, ry, 0, 0, Math.PI * 2);
  const rg = ctx.createRadialGradient(cx - rx * 0.3, topY - ry * 0.5, rx * 0.1, cx, topY, rx);
  rg.addColorStop(0,   hexToRgba(shade(color, 1.18), 1));
  rg.addColorStop(0.7, hexToRgba(color, 1));
  rg.addColorStop(1,   hexToRgba(shade(color, 0.78), 1));
  ctx.fillStyle = rg; ctx.fill();
  ctx.strokeStyle = hexToRgba(shade(color, 0.65), 0.6); ctx.lineWidth = 1.2; ctx.stroke();
}

export function bakePillarTexture(scene, key, { r, pw, ph, phVariant }, tc, hash) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const padX   = pw * 0.62 + 6;
  const padTop = pw * 0.30 + 8;   // top-cap / jagged-break overhang above the shaft
  const padBot = 8;               // small margin (ground shadow is a separate graphic)
  const cw = Math.ceil(padX * 2);
  const ch = Math.ceil(padTop + ph + padBot);
  const ox = padX, oy = padTop + ph;   // local (0,0) = pillar base center
  const tex = scene.textures.createCanvas(key, cw, ch);
  const ctx = tex.getContext();
  ctx.save();
  ctx.translate(ox, oy);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  // Main shaft — column with SLIGHTLY rounded corners (like the mossy spire: enough to feel
  // soft, not so much it looks like it could tip) + a cylinder gradient across the width.
  const corner = r * 0.28;
  roundRectBulgeBottomPath(ctx, -pw / 2, -ph, pw, ph, corner, r * 0.16);
  const cyl = ctx.createLinearGradient(-pw / 2, 0, pw / 2, 0);
  cyl.addColorStop(0.00, hexToRgba(shade(tc.pillarBody, 0.82), 1)); // left rim
  cyl.addColorStop(0.28, hexToRgba(shade(tc.pillarBody, 1.20), 1)); // lit core
  cyl.addColorStop(0.60, hexToRgba(tc.pillarBody, 1));              // body
  cyl.addColorStop(1.00, hexToRgba(shade(tc.pillarBody, 0.55), 1)); // shadow edge
  ctx.fillStyle = cyl; ctx.fill();
  ctx.strokeStyle = hexToRgba(tc.pillarDark, 0.60); ctx.lineWidth = 1.5; ctx.stroke();

  // Vertical weathering cracks — structured (top→base in the central band, slight waver).
  // A single thin 0.55-alpha line reads as barely-there next to the solid full-alpha top
  // cap, so any crackGlow theme (not just Volcanic) also gets a soft outer glow underneath
  // the core line — same "give the crack real presence" fix applied to rocks above.
  const crackCount = 2 + Math.floor(hash(40) * 2); // 2–3
  for (let k = 0; k < crackCount; k++) {
    const chh = 41 + k * 6;
    const cxk = -pw * 0.30 + hash(chh) * pw * 0.60;
    const top = -ph * (0.55 + hash(chh + 1) * 0.30);
    const bot = -ph * (0.05 + hash(chh + 2) * 0.10);
    const wav = (hash(chh + 3) - 0.5) * pw * 0.10;
    const strokeCrack = () => {
      ctx.beginPath(); ctx.moveTo(cxk, top); ctx.quadraticCurveTo(cxk + wav, (top + bot) / 2, cxk, bot); ctx.stroke();
    };
    if (tc.crackGlow) {
      ctx.strokeStyle = hexToRgba(tc.pillarCrack, 0.30); ctx.lineWidth = pw * 0.35; strokeCrack();
      ctx.strokeStyle = hexToRgba(shade(tc.pillarCrack, 1.3), 0.85); ctx.lineWidth = 1.6; strokeCrack();
    } else {
      ctx.strokeStyle = hexToRgba(tc.pillarCrack, tc.lavaGlow ? 0.85 : 0.55); ctx.lineWidth = 1.4; strokeCrack();
    }
    if (tc.lavaGlow) {
      ctx.strokeStyle = 'rgba(255,102,0,0.45)'; ctx.lineWidth = 0.8;
      strokeCrack();
    }
  }

  // Rounded 3D top cap on every variant (variants differ by height only — no flat tops).
  cylTopCap(ctx, 0, -ph, pw, tc.pillarCap);

  ctx.restore();
  tex.refresh();
  return { key, originX: ox / cw, originY: oy / ch };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tree trunk — cylinder gradient, 2 organic tapered root buttresses at base
// (left and right only — never 360° spokes), soft layered ground shadow, bark
// streaks, optional lava embers.
// Returns { key, originX, originY } — local (0,0) = trunk base center.
// ─────────────────────────────────────────────────────────────────────────────
export function bakeTreeTrunkTexture(scene, key, { tr, tTop, tH }, tc, hash) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const rootExt   = tr * 1.50;
  const padX      = rootExt + 5;
  // The new domed top cap (cylTopCap) rises tr*0.32 above -tTop — headroom must clear that
  // (was a flat 6px pad, sized for a flat-topped trunk with no cap overshoot).
  const padTop    = tr * 0.32 + 6;
  const belowBase = Math.ceil(tH - tTop + tr * 0.55);
  const cw = Math.ceil(padX * 2);
  const ch = Math.ceil(padTop + tTop + belowBase);
  const ox = Math.ceil(padX);
  const oy = Math.ceil(padTop + tTop);   // local (0,0) = trunk base center
  const tex = scene.textures.createCanvas(key, cw, ch);
  const ctx = tex.getContext();
  ctx.save();
  ctx.translate(ox, oy);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  // Soft layered ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.beginPath(); ctx.ellipse(tr * 0.12, tr * 0.36, tr * 1.22, tr * 0.35, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.beginPath(); ctx.ellipse(tr * 0.12, tr * 0.36, tr * 1.00, tr * 0.28, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(tr * 0.12, tr * 0.36, tr * 0.74, tr * 0.21, 0, 0, Math.PI * 2); ctx.fill();

  // Root buttresses — 2 tapered ridges, left and right only (never upward).
  // Bezier curves give an organic wedge that swells at trunk edge and tapers to tip.
  for (let i = 0; i < 2; i++) {
    const side   = i === 0 ? -1 : 1;
    const spread = tr * (0.88 + hash(70 + i) * 0.35);
    const dip    = tr * (0.05 + hash(71 + i) * 0.10);
    const thick  = tr * (0.22 + hash(72 + i) * 0.14);
    const sx     = side * tr * 0.50;
    ctx.beginPath();
    ctx.moveTo(sx, -thick * 0.30);                                                              // above base at trunk edge
    ctx.bezierCurveTo(sx * 1.55, -thick * 0.08, side * spread * 0.62, dip * 0.42, side * spread, dip);   // top edge → tip
    ctx.bezierCurveTo(side * spread * 0.62, dip + thick * 0.35, sx * 1.55, thick * 0.18, sx, 0);         // back → trunk base
    ctx.closePath();
    ctx.fillStyle = hexToRgba(shade(tc.roots, 0.82), 1); ctx.fill();
    ctx.strokeStyle = hexToRgba(tc.trunkDark, 0.35); ctx.lineWidth = 0.8; ctx.stroke();
  }

  // Trunk cylinder — horizontal gradient (dark left rim → lit core → body → shadow right).
  // Bottom uses the same rounded downward-bulge ground contact as the spire/pillar trunks
  // (was a flat-cut roundRectPath edge — the "flat lines" look this replaces). Corner radius
  // dropped from tr*0.5 to tr*0.22 (matching the pillar's proportion) — the old large value
  // was tuned to fake roundness on a FLAT top; now that a real domed cap sits on top, that
  // oversized corner curve fought the dome's own curve and read as a separate oval welded on.
  roundRectBulgeBottomPath(ctx, -tr, -tTop, tr * 2, tH, tr * 0.22, tr * 0.16);
  const cyl = ctx.createLinearGradient(-tr, 0, tr, 0);
  cyl.addColorStop(0.00, hexToRgba(shade(tc.trunkBody, 0.72), 1));
  cyl.addColorStop(0.28, hexToRgba(shade(tc.trunkBody, 1.18), 1));
  cyl.addColorStop(0.60, hexToRgba(tc.trunkBody, 1));
  cyl.addColorStop(1.00, hexToRgba(shade(tc.trunkBody, 0.50), 1));
  ctx.fillStyle = cyl; ctx.fill();
  ctx.strokeStyle = hexToRgba(tc.trunkDark, 0.70); ctx.lineWidth = 1.5; ctx.stroke();

  // Rounded 3D top cap — same domed technique as the pillar's cylTopCap, so the trunk's
  // top reads as a rounded cylinder instead of a flat-cut edge.
  cylTopCap(ctx, 0, -tTop, tr * 2, tc.trunkBody);

  // Bark highlight streaks
  ctx.strokeStyle = hexToRgba(tc.trunkBody, 0.32); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-tr * 0.30, -tTop * 0.88); ctx.lineTo(-tr * 0.30, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo( tr * 0.18, -tTop * 0.88); ctx.lineTo( tr * 0.18, 0); ctx.stroke();

  // Volcanic embers
  if (tc.lavaGlow) {
    for (let i = 0; i < 4; i++) {
      const ex = -tr * 0.5 + hash(75 + i * 2) * tr;
      const ey = -tTop + hash(76 + i * 2) * tH;
      ctx.fillStyle = `rgba(255,102,0,${0.45 + hash(77 + i) * 0.22})`;
      ctx.beginPath(); ctx.arc(ex, ey, 1.2 + hash(77 + i) * 1.2, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.restore();
  tex.refresh();
  return { key, originX: ox / cw, originY: oy / ch };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tree canopy — ONE soft foliage mass, not N shaded spheres. The canopy is defined
// as a union silhouette of overlapping ellipse lobes (round / wide / cluster styles),
// then lit by a SINGLE radial gradient clipped to the whole mass — so the light reads
// continuously across every lobe (no per-lobe billiard-ball domes, no overlap rings).
// Canvas is symmetric around local (0,0) so the Image uses setOrigin(0.5).
// ─────────────────────────────────────────────────────────────────────────────
export function bakeTreeCanopyTexture(scene, key, { cr2, cOffX, cOffY }, tc, hash) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const CR    = cr2;
  const style = hash(0);  // matches _buildTree's this._h(0): <0.33 round, <0.66 wide, else cluster

  // ── 1. Crown shape — a vertical WIDTH PROFILE (ribs) so each style tapers naturally. `w` is the
  // half-width fraction at normalized height `u` (0 top → 1 bottom). Tall = teardrop (narrow top).
  let H, W, ribs;
  if (style < 0.34) {
    H = CR * 1.85; W = CR * 0.95;
    ribs = [[0, 0.34], [0.20, 0.72], [0.40, 0.95], [0.50, 1.0], [0.60, 0.97], [0.80, 0.78], [1, 0.46]]; // round
  } else if (style < 0.67) {
    H = CR * 2.15; W = CR * 0.80;
    ribs = [[0, 0.30], [0.22, 0.50], [0.45, 0.72], [0.66, 0.92], [0.85, 1.0], [1, 0.70]]; // teardrop
  } else {
    H = CR * 1.70; W = CR * 1.15;
    ribs = [[0, 0.46], [0.22, 0.84], [0.45, 1.0], [0.62, 0.95], [0.82, 0.80], [1, 0.52]]; // broad
  }
  const cX = cOffX, cY = cOffY, topY = cY - H / 2, botY = cY + H / 2;
  const halfWidthAt = (y) => {
    const u = Math.max(0, Math.min(1, (y - topY) / H));
    for (let i = 1; i < ribs.length; i++) {
      if (u <= ribs[i][0]) {
        const [u0, w0] = ribs[i - 1], [u1, w1] = ribs[i];
        return W * (w0 + (w1 - w0) * (u - u0) / (u1 - u0));
      }
    }
    return W * ribs[ribs.length - 1][1];
  };
  const insideArea = (x, y, s) =>
    y >= topY - 2 && y <= botY + 2 && Math.abs(x - cX) < halfWidthAt(y) * s;

  const clumps = [];
  let seed = 1000;

  // ── 2a. EDGE RING — defines the silhouette: clumps placed at EVEN arc-length spacing along the
  // crown contour with near-uniform radius → a clean rhythmic cauliflower edge (not random pokeout).
  const CSTEPS = 48;
  const bnd = [];
  for (let i = 0; i <= CSTEPS; i++) { const y = topY + (H * i) / CSTEPS; bnd.push([cX - halfWidthAt(y), y]); } // left top→bot
  for (let i = CSTEPS; i >= 0; i--) { const y = topY + (H * i) / CSTEPS; bnd.push([cX + halfWidthAt(y), y]); } // right bot→top
  const cum = [0];
  for (let i = 0; i < bnd.length; i++) {
    const a = bnd[i], b = bnd[(i + 1) % bnd.length];
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const L = cum[cum.length - 1];
  const pointAt = (s) => {
    s = ((s % L) + L) % L;
    let i = 0; while (i < bnd.length && cum[i + 1] < s) i++;
    const a = bnd[i], b = bnd[(i + 1) % bnd.length];
    const t = (s - cum[i]) / ((cum[i + 1] - cum[i]) || 1);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  const Ne = Math.max(10, Math.round(L / (CR * 0.30)));
  for (let e = 0; e < Ne; e++) {
    const p = pointAt((e + (hash(700 + e) - 0.5) * 0.30) * L / Ne); // even spacing, tiny jitter
    const edgeR = CR * (0.19 + hash(720 + e) * 0.06);               // near-uniform → even scallops
    const ox = p[0] - cX, oy = p[1] - cY, dl = Math.hypot(ox, oy) || 1;
    clumps.push({
      x: p[0] - (ox / dl) * edgeR * 0.42,   // pull in so each bulges out an equal, controlled amount
      y: p[1] - (oy / dl) * edgeR * 0.42,
      rx: edgeR, ry: edgeR * (0.92 + hash(740 + e) * 0.16),
      seed: (seed += 17),
    });
  }

  // ── 2b. INTERIOR — jittered grid kept WELL INSIDE (scale 0.82) so it adds texture without
  // disturbing the silhouette. Moderate size variation + ~15% larger feature clumps.
  const spacing = CR * 0.24;
  let ki = 0;
  for (let yy = topY - spacing; yy <= botY + spacing; yy += spacing) {
    for (let xx = cX - W - spacing; xx <= cX + W + spacing; xx += spacing) {
      const cx = xx + (hash(400 + ki) - 0.5) * spacing * 0.45;
      const cy = yy + (hash(440 + ki) - 0.5) * spacing * 0.45;
      ki++;
      if (!insideArea(cx, cy, 0.82)) continue;
      const feature = hash(500 + ki) < 0.15;
      const r  = feature ? CR * (0.30 + hash(480 + ki) * 0.06)
                         : CR * (0.17 + hash(480 + ki) * 0.10);
      const ar = 0.88 + hash(520 + ki) * 0.24;
      clumps.push({ x: cx, y: cy, rx: r, ry: r / ar, seed: (seed += 17) });
    }
  }

  // Smoothed lumpy-blob path for one clump at `scale` (radius wobbled by hash(seed+i)). Appends a
  // subpath (moveTo + quadraticCurveTo through midpoints) — caller does beginPath/fill.
  const NB = 12;
  const addBlob = (c, scale) => {
    const pts = [];
    for (let i = 0; i < NB; i++) {
      const a  = (i / NB) * Math.PI * 2;
      const rr = (1 + (hash(c.seed + i) - 0.5) * 0.10) * scale;
      pts.push([c.x + Math.cos(a) * c.rx * rr, c.y + Math.sin(a) * c.ry * rr]);
    }
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const m0 = mid(pts[NB - 1], pts[0]);
    ctx.moveTo(m0[0], m0[1]);
    for (let i = 0; i < NB; i++) {
      const m = mid(pts[i], pts[(i + 1) % NB]);
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
    }
  };
  const traceAll = (scale) => { ctx.beginPath(); for (const c of clumps) addBlob(c, scale); };

  // Append the smooth crown-profile polygon (from the rib widths) as a subpath — the solid
  // interior backstop so a clump gap can never expose a dark hole.
  const PSTEPS = 24;
  const addProfile = () => {
    ctx.moveTo(cX - halfWidthAt(topY), topY);
    for (let i = 1; i <= PSTEPS; i++) { const y = topY + (H * i) / PSTEPS; ctx.lineTo(cX - halfWidthAt(y), y); }
    for (let i = PSTEPS; i >= 0; i--) { const y = topY + (H * i) / PSTEPS; ctx.lineTo(cX + halfWidthAt(y), y); }
    ctx.closePath();
  };

  // ── 3. Bounding box (symmetric canvas about origin) — from the clumps ──
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of clumps) {
    minX = Math.min(minX, c.x - c.rx * 1.35); maxX = Math.max(maxX, c.x + c.rx * 1.35);
    minY = Math.min(minY, c.y - c.ry * 1.35); maxY = Math.max(maxY, c.y + c.ry * 1.35);
  }
  const pad   = 8;
  const halfW = Math.max(Math.abs(minX), Math.abs(maxX)) + pad;
  const halfH = Math.max(Math.abs(minY), Math.abs(maxY)) + pad;
  const cw = Math.ceil(halfW * 2), ch = Math.ceil(halfH * 2);
  const tex = scene.textures.createCanvas(key, cw, ch);
  const ctx = tex.getContext();
  ctx.save();
  ctx.translate(cw / 2, ch / 2);

  const bw = maxX - minX, bh = maxY - minY;
  const fillBox = () => ctx.fillRect(minX - pad, minY - pad, bw + pad * 2, bh + pad * 2);

  // Vertical tone ramp — bright green at the top → dark green at the bottom (darkest at trunk).
  const toneAt = (vf) => vf < 0.5
    ? lerpColor(tc.canopyC, tc.canopyB, vf * 2)
    : lerpColor(tc.canopyB, tc.canopyA, (vf - 0.5) * 2);

  // ── 4. Rim underlay — clean dark lumpy outline (peeks only at the true outer edge).
  traceAll(1.10); ctx.fillStyle = hexToRgba(tc.canopyRim, 1); ctx.fill();

  // ── 5. Base — vertical gradient, filled in TWO separate passes so the profile (CCW) and the
  // clump blobs (CW) never cancel under nonzero winding. Profile = solid mid-green interior
  // backstop (no holes); clump fill covers the bumps beyond the profile.
  const baseG = ctx.createLinearGradient(0, minY, 0, maxY);
  baseG.addColorStop(0.00, hexToRgba(tc.canopyC, 1));
  baseG.addColorStop(0.50, hexToRgba(tc.canopyB, 1));
  baseG.addColorStop(0.85, hexToRgba(tc.canopyA, 1));
  baseG.addColorStop(1.00, hexToRgba(shade(tc.canopyA, 0.70), 1));
  ctx.fillStyle = baseG;
  ctx.beginPath(); addProfile(); ctx.fill();   // solid interior backstop
  traceAll(1.0); ctx.fill();                    // clump bumps beyond the profile

  // ── 6. Clip to the clump union (consistent winding → proper union) for the shaded passes ──
  ctx.save();
  traceAll(1.0); ctx.clip();

  // ── 7. Opaque shingled lumpy clump-domes (the core) — back-to-front (top→bottom). Each clump is
  // an opaque lumpy blob with a VERTICAL gradient (subtle light top → its vertical tone → subtle
  // dark bottom). Varied sizes + satellites + lumpy shapes ⇒ organic, non-uniform overlap. Low
  // blend factors keep the value range tight (cohesive, not jumpy).
  const sorted = clumps.slice().sort((p, q) => p.y - q.y);
  for (const c of sorted) {
    const vf     = Math.max(0, Math.min(1, (c.y - minY) / bh));
    const tone   = toneAt(vf);
    const topCol = lerpColor(tone, tc.canopyD, 0.26); // subtle top light
    const botCol = shade(tone, 0.84);                 // gentle base shadow (avoid muddy crevices)
    const g = ctx.createLinearGradient(0, c.y - c.ry, 0, c.y + c.ry);
    g.addColorStop(0.0, hexToRgba(topCol, 1));
    g.addColorStop(0.5, hexToRgba(tone, 1));
    g.addColorStop(1.0, hexToRgba(botCol, 1));
    ctx.fillStyle = g;
    ctx.beginPath(); addBlob(c, 1.0); ctx.fill();
  }

  // ── 7b. Cross-width roundness — a radial light model ON TOP of the vertical shingle shading so
  // the canopy reads as a lit sphere (not a flat top→bottom gradient). Light-facing center is
  // upper-left; the sides + far edge fall into shadow.
  const lcx = cX - W * 0.12, lcy = topY + H * 0.32;
  // Light bloom — brighten the lit (upper-left) cheek.
  const lbR = W * 0.78;
  const lb = ctx.createRadialGradient(lcx, lcy, 1, lcx, lcy, lbR);
  lb.addColorStop(0, hexToRgba(tc.canopyD, 0.16));
  lb.addColorStop(1, hexToRgba(tc.canopyD, 0));
  ctx.fillStyle = lb; fillBox();
  // Rim shadow — an ELLIPTICAL radial matching this tree's actual proportions (≈ W wide × H/2 tall),
  // so it adapts to any width/height. Dark at the rim → clear toward the center (a radial's direction
  // is unambiguous); the beyond-outer dark region is clipped to the CLUMPS, so the real bumpy edge is
  // shaded — not the inset profile. Centered slightly ABOVE the middle → top rim lighter, bottom rim
  // heavier (per the requested look).
  const sy = (H * 0.52) / W;
  ctx.save();
  ctx.translate(cX, cY - H * 0.10);
  ctx.scale(1, sy);
  const rimG = ctx.createRadialGradient(0, 0, W * 0.70, 0, 0, W * 1.04);
  rimG.addColorStop(0, hexToRgba(shade(tc.canopyA, 0.62), 0));    // clear center (large)
  rimG.addColorStop(1, hexToRgba(shade(tc.canopyA, 0.62), 0.26)); // gentle dark only at the rim
  ctx.fillStyle = rimG;
  ctx.fillRect(-cw, -ch / sy, cw * 2, (ch / sy) * 2);
  ctx.restore();

  // ── 8. Bottom emphasis — soft dark band over the lower ~35% so the darkest is consistently at
  // the bottom / trunk junction.
  const sg = ctx.createLinearGradient(0, maxY - bh * 0.30, 0, maxY);
  sg.addColorStop(0, hexToRgba(shade(tc.canopyA, 0.7), 0));
  sg.addColorStop(1, hexToRgba(shade(tc.canopyA, 0.7), 0.30));
  ctx.fillStyle = sg; fillBox();

  // Volcanic embers (clipped to the mass)
  if (tc.lavaGlow) {
    for (let i = 0; i < 6; i++) {
      const ea = hash(80 + i * 2) * Math.PI * 2;
      const ed = hash(81 + i * 2) * CR * 0.7;
      ctx.fillStyle = `rgba(255,102,0,${0.60 + hash(82 + i) * 0.30})`;
      ctx.beginPath(); ctx.arc(Math.cos(ea) * ed, Math.sin(ea) * ed, 1.5 + hash(83 + i) * 1.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.restore();
  ctx.restore();
  tex.refresh();
  return { key };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stump — 2.5D cylinder: front bark band (cylinder gradient across the width) + top cut
// face (top-lit radial dome) with growth rings/grain. Soft layered ground shadow baked in.
// Returns { key, originX, originY }; local (0,0) = the stump base.
// ─────────────────────────────────────────────────────────────────────────────

export function bakeStumpTexture(scene, key, { r, variant, frontH, topW, topH, topCY }, tc, hash) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const ox = Math.ceil(r * 1.2 + 6);
  const oy = Math.ceil(frontH + topH * 0.5 + 8);  // local (0,0) = base
  const cw = ox * 2;
  const ch = oy + Math.ceil(r * 0.4 + 8);
  const tex = scene.textures.createCanvas(key, cw, ch);
  const ctx = tex.getContext();
  ctx.save();
  ctx.translate(ox, oy);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  const trx = topW / 2, tryy = topH / 2;

  // Soft layered ground shadow (wide+faint → narrow+dark)
  ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.beginPath(); ctx.ellipse(0, 4, r * 1.28, r * 0.32, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.beginPath(); ctx.ellipse(0, 4, r * 1.08, r * 0.26, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(0, 4, r * 0.80, r * 0.19, 0, 0, Math.PI * 2); ctx.fill();

  // Front bark face — cylinder gradient across the width
  const cyl = ctx.createLinearGradient(-r, 0, r, 0);
  cyl.addColorStop(0.00, hexToRgba(shade(tc.stumpBark, 0.78), 1));
  cyl.addColorStop(0.28, hexToRgba(shade(tc.stumpBark, 1.20), 1));
  cyl.addColorStop(0.60, hexToRgba(tc.stumpBark, 1));
  cyl.addColorStop(1.00, hexToRgba(shade(tc.stumpBark, 0.55), 1));
  // Bark face — elliptical bottom arc instead of flat line for proper cylinder perspective.
  ctx.beginPath();
  ctx.moveTo(-r, topCY);
  ctx.lineTo( r, topCY);
  ctx.lineTo( r * 0.85, 0);
  ctx.ellipse(0, 0, r * 0.85, r * 0.13, 0, 0, Math.PI); // curves downward (bottom rim of cylinder)
  ctx.closePath();
  ctx.fillStyle = cyl; ctx.fill();
  // Bottom-rim lip shadow
  ctx.strokeStyle = hexToRgba(shade(tc.stumpBark, 0.65), 0.55); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.85, r * 0.13, 0, 0, Math.PI); ctx.stroke();

  // Horizontal bark lines
  const barkLines = variant === 2 ? 5 : (variant === 3 ? 2 : 4);
  for (let i = 1; i <= barkLines; i++) {
    const ly = topCY + frontH * i / (barkLines + 1);
    const xEdge = r * (1.0 - 0.15 * ((ly - topCY) / frontH));
    ctx.strokeStyle = hexToRgba(tc.stumpRing, 0.30 + hash(20 + i) * 0.15); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-xEdge, ly); ctx.lineTo(xEdge, ly); ctx.stroke();
  }

  // Vertical fissures
  const fissureCount = 1 + Math.floor(hash(30) * 2);
  for (let i = 0; i < fissureCount; i++) {
    const fx = (hash(31 + i) - 0.5) * r * 1.4;
    const fLen = frontH * (0.35 + hash(32 + i) * 0.50);
    const fTop = topCY + frontH * (0.05 + hash(33 + i) * 0.2);
    const fTilt = (hash(34 + i) - 0.5) * 4;
    ctx.strokeStyle = hexToRgba(tc.stumpRing, 0.50); ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(fx, fTop); ctx.lineTo(fx + fTilt, fTop + fLen); ctx.stroke();
  }

  // Knots (variant 2)
  if (variant === 2) {
    for (let k = 0; k < 2; k++) {
      const kx = (hash(40 + k * 2) - 0.5) * r * 1.2;
      const ky = topCY + frontH * (0.25 + hash(41 + k * 2) * 0.50);
      ctx.fillStyle = hexToRgba(tc.stumpRing, 0.55);
      ctx.beginPath(); ctx.ellipse(kx, ky, r * 0.14, r * 0.10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = hexToRgba(tc.stumpBark, 0.70); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(kx, ky, r * 0.14, r * 0.10, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // Top rim shadow line (front face meets top face)
  ctx.strokeStyle = hexToRgba(tc.stumpBark, 0.70); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-r, topCY); ctx.lineTo(r, topCY); ctx.stroke();

  // Top cut face — top-lit radial dome
  ctx.beginPath(); ctx.ellipse(0, topCY, trx, tryy, 0, 0, Math.PI * 2);
  const tg = ctx.createRadialGradient(-trx * 0.3, topCY - tryy * 0.4, trx * 0.1, 0, topCY, trx);
  tg.addColorStop(0,   hexToRgba(shade(tc.stumpWood, 1.15), 1));
  tg.addColorStop(0.7, hexToRgba(tc.stumpWood, 1));
  tg.addColorStop(1,   hexToRgba(shade(tc.stumpWood, 0.80), 1));
  ctx.fillStyle = tg; ctx.fill();

  // Moss (variant 1)
  if (variant === 1 && tc.canopyA) {
    ctx.fillStyle = hexToRgba(tc.canopyA, 0.25);
    ctx.beginPath(); ctx.ellipse(-topW * 0.15, topCY - topH * 0.05, topW * 0.275, topH * 0.25, 0, 0, Math.PI * 2); ctx.fill();
  }

  // Growth rings
  const ringScales = variant === 1 ? [0.70, 0.46] : [0.72, 0.50, 0.32];
  ringScales.forEach((rs, ri) => {
    const offX = (hash(50 + ri) - 0.5) * 2;
    const offY = (hash(51 + ri) - 0.5) * 2;
    ctx.strokeStyle = hexToRgba(tc.stumpRing, tc.lavaGlow ? 0.75 : 0.50); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(offX, topCY + offY, trx * rs, tryy * rs, 0, 0, Math.PI * 2); ctx.stroke();
  });

  // Radial grain lines
  const grainCount = 4 + Math.floor(hash(60) * 3);
  ctx.strokeStyle = hexToRgba(tc.lavaGlow ? 0xff5500 : tc.stumpRing, 0.45); ctx.lineWidth = 1;
  for (let i = 0; i < grainCount; i++) {
    const ga = (i / grainCount) * Math.PI * 2 + hash(61 + i) * 0.8;
    ctx.beginPath(); ctx.moveTo(0, topCY); ctx.lineTo(Math.cos(ga) * trx * 0.84, topCY + Math.sin(ga) * tryy * 0.84); ctx.stroke();
  }

  // Top rim highlight
  ctx.strokeStyle = hexToRgba(tc.stumpRing, 0.55); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(0, topCY, trx, tryy, 0, 0, Math.PI * 2); ctx.stroke();

  // Center / lava pool
  if (tc.lavaGlow) {
    ctx.fillStyle = 'rgba(255,102,0,0.18)'; ctx.beginPath(); ctx.ellipse(0, topCY, trx * 0.55, tryy * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,136,0,0.28)'; ctx.beginPath(); ctx.ellipse(0, topCY, trx * 0.28, tryy * 0.28, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = hexToRgba(tc.stumpBark, 0.80); ctx.beginPath(); ctx.ellipse(0, topCY, trx * 0.12, tryy * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore();
  tex.refresh();
  return { key, originX: ox / cw, originY: oy / ch };
}

// ─────────────────────────────────────────────────────────────────────────────
// Spire — theme-specific tall props. Two textures: trunk (base + ground shadow)
// and canopy (top element). Replaces the live Graphics _spireXxx methods in
// Obstacle.js. All Math.random() calls replaced with hash(salt) for determinism.
// ─────────────────────────────────────────────────────────────────────────────

// Universal canvas: generous enough for the tallest column + widest rock base.
// Local (0,0) = base center. Column tops sit at y = −r*2.5.
export function bakeSpireTrunkTexture(scene, key, themeIdx, r, hash) {
  const pad    = 8;
  const halfW  = r * 1.65 + pad;
  // CC's jagged stalagmite, the volcanic monolith, the celestial obelisk, and the chaos
  // floating monolith are all taller than the default — headroom so peaks aren't clipped.
  const aboveH = (themeIdx === 1 ? r * 4.9 : themeIdx === 2 ? r * 4.1 : themeIdx === 3 ? r * 3.3 : themeIdx === 4 ? r * 3.4 : r * 2.6) + pad;
  const belowH = r * 1.0  + pad;
  const cw = Math.ceil(halfW * 2);
  const ch = Math.ceil(aboveH + belowH);
  const ox = Math.floor(cw / 2);
  const oy = Math.ceil(aboveH);

  // Always rebake — a stale cached texture from a prior canvas-size/shape would otherwise be
  // reused as-is while these freshly-computed origin fractions assume the NEW dimensions.
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, cw, ch);
  const ctx = tex.getContext();
  ctx.save();
  ctx.translate(ox, oy);

  // Ground shadow — scale ctx so radial gradient follows the ellipse edge, not a circle.
  // CC's stalagmite, the volcanic monolith, and the celestial obelisk all sit flush at
  // y=0, so their shadows center directly on the base instead of the offset/larger shadow
  // the squat themes use. Sized/darkened up and nudged down a touch so it still reads
  // clearly even where a trunk's rounded base bulge covers more of the shadow's upper half.
  const flushBase = themeIdx === 1 || themeIdx === 2 || themeIdx === 3 || themeIdx === 4;
  ctx.save();
  const shDX = flushBase ? 0 : 4;
  const shDY = flushBase ? r * 0.10 : r * 0.5;
  // Chaos's monolith HOVERS above the ground — a floating object casts a tighter shadow,
  // which is also part of what sells the hover (big soft shadow = grounded read).
  const shR  = themeIdx === 4 ? r * 0.85 : flushBase ? r * 1.15 : r * 1.30;
  ctx.translate(shDX, shDY);
  ctx.scale(1.0, 0.30);  // squash matches ellipse ry/rx ratio
  // Extra mid/late stops (instead of jumping straight from the 0.55 stop to 0) so the
  // outer rim tapers off gradually — a hard 2-stop falloff was reading as a visible ring.
  const sg = ctx.createRadialGradient(0, 0, r * 0.18, 0, 0, shR);
  sg.addColorStop(0,    flushBase ? 'rgba(0,0,0,0.62)' : 'rgba(0,0,0,0.52)');
  sg.addColorStop(0.45, flushBase ? 'rgba(0,0,0,0.34)' : 'rgba(0,0,0,0.24)');
  sg.addColorStop(0.70, flushBase ? 'rgba(0,0,0,0.16)' : 'rgba(0,0,0,0.11)');
  sg.addColorStop(0.88, flushBase ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.03)');
  sg.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(0, 0, shR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  switch (themeIdx) {
    case 0: _spireGFTrunk(ctx, r, hash);    break;
    case 1: _spireCCTrunk(ctx, r, hash);    break;
    case 2: _spireVolTrunk(ctx, r, hash);   break;
    case 3: _spireCelTrunk(ctx, r, hash);   break;
    case 4: _spireChaosTrunk(ctx, r, hash); break;
    default: _spireGFTrunk(ctx, r, hash);
  }

  ctx.restore();
  tex.refresh();
  return { key, originX: ox / cw, originY: oy / ch };
}

// Theme 0 — Green Fields: mossy stone column
function _spireGFTrunk(ctx, r, hash) {
  const col = 0x4a4030;
  // Bottom edge replaced with a shallow downward bulge (same technique as the volcanic
  // trunk's base) so the column's ground contact reads as rounded, not flat/square.
  roundRectBulgeBottomPath(ctx, -r * 0.85, -r * 2.5, r * 1.7, r * 3, r * 0.3, r * 0.16);
  const cyl = ctx.createLinearGradient(-r * 0.85, 0, r * 0.85, 0);
  cyl.addColorStop(0,    hexToRgba(shade(col, 0.60), 1));
  cyl.addColorStop(0.28, hexToRgba(shade(col, 1.25), 1));
  cyl.addColorStop(0.58, hexToRgba(col, 1));
  cyl.addColorStop(1,    hexToRgba(shade(col, 0.50), 1));
  ctx.fillStyle = cyl; ctx.fill();
  // Shadow-side overlay
  ctx.save();
  roundRectBulgeBottomPath(ctx, -r * 0.85, -r * 2.5, r * 1.7, r * 3, r * 0.3, r * 0.16);
  ctx.clip();
  const sG = ctx.createLinearGradient(0, 0, r * 0.85, 0);
  sG.addColorStop(0, hexToRgba(0x2e261c, 0));
  sG.addColorStop(1, hexToRgba(0x2e261c, 0.45));
  ctx.fillStyle = sG; ctx.fillRect(-r, -r * 2.6, r * 2, r * 3.5);
  ctx.restore();
  roundRectBulgeBottomPath(ctx, -r * 0.85, -r * 2.5, r * 1.7, r * 3, r * 0.3, r * 0.16);
  ctx.strokeStyle = hexToRgba(0x1a1610, 0.85); ctx.lineWidth = 1.5; ctx.stroke();
  // Mossy patches
  [[-r * 0.4, -r * 1.8, r * 0.35, r * 0.2], [r * 0.3, -r * 0.6, r * 0.25, r * 0.15]]
    .forEach(([mx, my, mw, mh]) => {
      const mg = ctx.createRadialGradient(mx, my, 0, mx, my, mw * 1.2);
      mg.addColorStop(0, hexToRgba(0x4a7028, 0.85));
      mg.addColorStop(1, hexToRgba(0x4a7028, 0));
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.ellipse(mx, my, mw, mh, 0, 0, Math.PI * 2); ctx.fill();
    });
  ctx.strokeStyle = hexToRgba(0x0f0a05, 0.6); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 2.3); ctx.lineTo(r * 0.1, -r * 0.5); ctx.stroke();
}

// Theme 1 — Crystal Caves: tall jagged stalagmite column
function _spireCCTrunk(ctx, r, hash) {
  const H = r * 4.5; // tall jagged spire

  // Jagged silhouette — ±r*0.18 x-jitter, visible at render scale. The base row (i=steps)
  // is forced flush to y=0 with no vertical jitter so the column actually touches the
  // ground line the shadow sits at — no floating gap.
  const steps = 8;
  const rightPts = [{ x: (hash(501) - 0.5) * r * 0.08, y: -H }];
  const leftPts  = [];
  for (let i = 1; i <= steps; i++) {
    const t  = i / steps;
    const w  = r * 0.82 * t;
    const isBase = i === steps;
    const yV = -H + H * t;
    rightPts.push({ x:  w + (hash(510 + i) - 0.5) * r * 0.18, y: isBase ? 0 : yV + (hash(520 + i) - 0.5) * r * 0.10 });
    leftPts.push({  x: -w + (hash(530 + i) - 0.5) * r * 0.18, y: isBase ? 0 : yV + (hash(540 + i) - 0.5) * r * 0.10 });
  }
  const pts = [rightPts[0], ...rightPts.slice(1), ...leftPts.slice().reverse()];

  // Body gradient — lighter base so shade() math produces a visible lit/shadow range
  const baseCol = 0x2a2448;
  const lg = ctx.createLinearGradient(-r * 0.82, 0, r * 0.82, 0);
  lg.addColorStop(0,    hexToRgba(shade(baseCol, 0.40), 1));
  lg.addColorStop(0.22, hexToRgba(shade(baseCol, 1.60), 1)); // lit left-center face
  lg.addColorStop(0.55, hexToRgba(baseCol, 1));
  lg.addColorStop(1,    hexToRgba(shade(baseCol, 0.30), 1));
  pathPoly(ctx, pts); ctx.fillStyle = lg; ctx.fill();

  // Lit facet overlay — angled plane on the upper-left face
  const faceLG = ctx.createLinearGradient(-r * 0.4, -H, 0, -H * 0.4);
  faceLG.addColorStop(0, hexToRgba(shade(baseCol, 1.80), 0.55));
  faceLG.addColorStop(1, hexToRgba(shade(baseCol, 1.80), 0));
  ctx.fillStyle = faceLG;
  ctx.beginPath();
  ctx.moveTo(rightPts[0].x, rightPts[0].y);
  ctx.lineTo(rightPts[0].x - r * 0.35, -H * 0.55);
  ctx.lineTo(rightPts[0].x - r * 0.55, -H * 0.15);
  ctx.closePath(); ctx.fill();

  // Dark outline
  pathPoly(ctx, pts);
  ctx.strokeStyle = hexToRgba(0x080614, 1.0); ctx.lineWidth = 2; ctx.stroke();

  // Crack lines — lavender against the dark body (high contrast)
  ctx.lineWidth = 1.2; ctx.strokeStyle = hexToRgba(0x6655aa, 0.70);
  ctx.beginPath();
  ctx.moveTo(-r * 0.25, -H * 0.85); ctx.lineTo(-r * 0.18, -H * 0.42); ctx.lineTo(-r * 0.32, -H * 0.10);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(r * 0.12, -H * 0.68); ctx.lineTo(r * 0.20, -H * 0.28);
  ctx.stroke();
  // Dark companion line (carved channel depth)
  ctx.lineWidth = 0.8; ctx.strokeStyle = hexToRgba(0x0a0818, 0.80);
  ctx.beginPath();
  ctx.moveTo(-r * 0.22, -H * 0.84); ctx.lineTo(-r * 0.15, -H * 0.41); ctx.lineTo(-r * 0.29, -H * 0.09);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(r * 0.15, -H * 0.67); ctx.lineTo(r * 0.23, -H * 0.27);
  ctx.stroke();
}

// Theme 2 — Volcanic: basalt monolith with a ragged, broken crown of peaks around a
// crater notch. The notch is where the canopy's magma pool nests (see CANOPY_OFFSETS[2]
// in Obstacle.js), so the rock and the lava read as one chiseled volcanic formation.
function _spireVolTrunk(ctx, r, hash) {
  const H = r * 4.0; // a genuinely tall body, not just tall spikes

  // Ragged crown — 4 jagged peaks (2 per side) sitting near the TOP of a tall solid body,
  // with only shallow undulation between them (peaks only modestly above the notch). Most
  // of H is solid rock below the crown — that's what reads as "tall," not the spike height.
  const jx = (i) => (hash(700 + i) - 0.5) * r * 0.10;
  const jy = (i) => (hash(710 + i) - 0.5) * r * 0.05;
  const ridge = [
    { x:  r * 0.62 + jx(1), y: -H * 0.83 + jy(1) },  // R2 — outer right peak
    { x:  r * 0.47 + jx(2), y: -H * 0.80 + jy(2) },  // valley
    { x:  r * 0.31 + jx(3), y: -H * 0.88 + jy(3) },  // R1 — inner right peak
    { x:  r * 0.09 + jx(4), y: -H * 0.76 + jy(4) },  // crater notch, right edge
    { x: -r * 0.09 + jx(5), y: -H * 0.78 + jy(5) },  // crater notch, left edge
    { x: -r * 0.33 + jx(6), y: -H * 0.90 + jy(6) },  // L1 — inner left peak (tallest)
    { x: -r * 0.49 + jx(7), y: -H * 0.81 + jy(7) },  // valley
    { x: -r * 0.64 + jx(8), y: -H * 0.85 + jy(8) },  // L2 — outer left peak
  ];

  // Flanks taper from the outer peaks down through the tall solid body to the base, flush
  // at y=0. Intermediate points sit exactly on the straight peak-to-base interpolation (no
  // jitter) so the taper reads as a clean angular edge, not a wavy curve — only the base
  // point gets a touch of jitter, for natural irregularity right at the ground line.
  const baseW = r * 0.80;
  const flankSteps = 4;
  const rightFlank = [];
  for (let i = 1; i <= flankSteps; i++) {
    const t = i / flankSteps;
    const w = ridge[0].x + (baseW - ridge[0].x) * t;
    const isBase = i === flankSteps;
    rightFlank.push({ x: w + (isBase ? jx(10 + i) : 0), y: isBase ? 0 : ridge[0].y * (1 - t) });
  }
  const leftFlank = [];
  for (let i = 1; i <= flankSteps; i++) {
    const t = i / flankSteps;
    const w = ridge[7].x + (-baseW - ridge[7].x) * t;
    const isBase = i === flankSteps;
    leftFlank.push({ x: w + (isBase ? jx(30 + i) : 0), y: isBase ? 0 : ridge[7].y * (1 - t) });
  }

  // Rounded base — closing straight from base-left back to base-right gives a flat, square
  // bottom edge. Insert a shallow downward bulge between them (same technique as the stump's
  // elliptical bottom arc) so the rock's contact with the ground reads as a rounded contour.
  const baseLeftX  = leftFlank[leftFlank.length - 1].x;
  const baseRightX = rightFlank[rightFlank.length - 1].x;
  const bulge = r * 0.16;
  const bottomBulge = [
    { x: baseLeftX * 0.55,  y: bulge * 0.7 },
    { x: 0,                 y: bulge },
    { x: baseRightX * 0.55, y: bulge * 0.7 },
  ];

  const pts = [...rightFlank.slice().reverse(), ...ridge, ...leftFlank, ...bottomBulge];

  // Body — directional facet gradient (dark rim → lit center-left → dark rim), basalt tones.
  const baseCol = 0x1c1208;
  const lg = ctx.createLinearGradient(-r * 0.8, 0, r * 0.8, 0);
  lg.addColorStop(0,    hexToRgba(shade(baseCol, 0.45), 1));
  lg.addColorStop(0.25, hexToRgba(shade(baseCol, 1.55), 1));
  lg.addColorStop(0.55, hexToRgba(baseCol, 1));
  lg.addColorStop(1,    hexToRgba(shade(baseCol, 0.35), 1));
  pathPoly(ctx, pts); ctx.fillStyle = lg; ctx.fill();

  // Lit facet overlay on the upper-left peaks — angled plane catching light
  const faceLG = ctx.createLinearGradient(-r * 0.40, -H, -r * 0.05, -H * 0.78);
  faceLG.addColorStop(0, hexToRgba(shade(baseCol, 1.85), 0.50));
  faceLG.addColorStop(1, hexToRgba(shade(baseCol, 1.85), 0));
  ctx.fillStyle = faceLG;
  ctx.beginPath();
  ctx.moveTo(ridge[5].x, ridge[5].y);
  ctx.lineTo(ridge[5].x + r * 0.32, -H * 0.88);
  ctx.lineTo(ridge[5].x + r * 0.48, -H * 0.66);
  ctx.closePath(); ctx.fill();

  // Hexagonal-column joint lines — basalt's signature vertical facets, running most of the
  // way up the tall body to just below the crater rim.
  ctx.strokeStyle = hexToRgba(0x000000, 0.32); ctx.lineWidth = 1;
  [-r * 0.40, -r * 0.06, r * 0.20, r * 0.50].forEach((bx2, j) => {
    ctx.beginPath();
    ctx.moveTo(bx2, 0);
    ctx.lineTo(bx2 * 0.55 + (hash(650 + j) - 0.5) * r * 0.08, -H * 0.70);
    ctx.stroke();
  });

  // Dark outline
  pathPoly(ctx, pts);
  ctx.strokeStyle = hexToRgba(0x0a0602, 1.0); ctx.lineWidth = 2; ctx.stroke();

  // Glowing lava crack — bleeds all the way down from the crater notch through the tall
  // body, fading out well before it reaches the base.
  const crackG = ctx.createLinearGradient(0, -H * 0.75, r * 0.20, -H * 0.10);
  crackG.addColorStop(0,    hexToRgba(0xffcc66, 0.95));
  crackG.addColorStop(0.40, hexToRgba(0xff6622, 0.70));
  crackG.addColorStop(1,    hexToRgba(0xff3300, 0));
  ctx.strokeStyle = crackG; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -H * 0.75);
  ctx.lineTo(r * 0.12, -H * 0.55); ctx.lineTo(r * 0.05, -H * 0.35); ctx.lineTo(r * 0.20, -H * 0.12);
  ctx.stroke();
  // Secondary fainter crack on the other flank
  const crack2G = ctx.createLinearGradient(0, -H * 0.76, -r * 0.24, -H * 0.30);
  crack2G.addColorStop(0,   hexToRgba(0xff8844, 0.55));
  crack2G.addColorStop(1,   hexToRgba(0xff3300, 0));
  ctx.strokeStyle = crack2G; ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-r * 0.04, -H * 0.76); ctx.lineTo(-r * 0.20, -H * 0.40);
  ctx.stroke();
}

// Theme 3 — Celestial: tapered obelisk shaft with a flat top (the starfield dome seats on
// it — see _spireCelCanopy / CANOPY_OFFSETS[3] in Obstacle.js) and a rounded ground contact.
function _spireCelTrunk(ctx, r, hash) {
  const H = r * 2.8;
  const baseW = r * 0.72, topW = r * 0.48; // wider overall + gentler taper (was 0.62/0.34)
  const jx = (i) => (hash(950 + i) - 0.5) * r * 0.05; // subtle — dressed stone, not jagged rock

  const steps = 5;
  const rightPts = [], leftPts = [];
  for (let i = 0; i <= steps; i++) {
    const t  = i / steps; // 0 = top, 1 = base
    const w  = topW + (baseW - topW) * t;
    const yV = -H + H * t;
    rightPts.push({ x:  w + jx(i),      y: yV });
    leftPts.push({  x: -w + jx(10 + i), y: yV });
  }
  // Rounded ground contact — same 3-point downward-bulge technique used on the GF and
  // volcanic trunks this session, applied here since this is a custom polygon, not a
  // roundRectPath call.
  const bulge = r * 0.14;
  const baseR = rightPts[rightPts.length - 1].x, baseL = leftPts[leftPts.length - 1].x;
  const bottomBulge = [
    { x: baseR * 0.55, y: bulge * 0.7 },
    { x: 0,            y: bulge },
    { x: baseL * 0.55, y: bulge * 0.7 },
  ];
  const pts = [...rightPts, ...bottomBulge, ...leftPts.slice().reverse()];

  const col = 0x1c1c3a;
  pathPoly(ctx, pts);
  const cyl = ctx.createLinearGradient(-r * 0.75, 0, r * 0.75, 0);
  cyl.addColorStop(0,    hexToRgba(shade(col, 0.50), 1));
  cyl.addColorStop(0.28, hexToRgba(shade(col, 1.45), 1));
  cyl.addColorStop(0.60, hexToRgba(col, 1));
  cyl.addColorStop(1,    hexToRgba(shade(col, 0.38), 1));
  ctx.fillStyle = cyl; ctx.fill();
  ctx.save();
  pathPoly(ctx, pts);
  ctx.clip();
  const sG = ctx.createLinearGradient(0, 0, r * 0.75, 0);
  sG.addColorStop(0, hexToRgba(0x0a0a20, 0));
  sG.addColorStop(1, hexToRgba(0x0a0a20, 0.48));
  ctx.fillStyle = sG; ctx.fillRect(-r, -H - r * 0.1, r * 2, H + r * 0.3);
  ctx.restore();
  pathPoly(ctx, pts);
  ctx.strokeStyle = hexToRgba(0x05051a, 0.9); ctx.lineWidth = 1.5; ctx.stroke();

  // Lit-edge highlight — a thin bright line tracing the lit (left) side of the taper,
  // separate from the inlay, so the cut-stone facets actually catch light.
  ctx.strokeStyle = hexToRgba(shade(col, 2.0), 0.35); ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rightPts[0].x * -1, rightPts[0].y);
  for (let i = 1; i <= steps; i++) ctx.lineTo(leftPts[i].x, leftPts[i].y);
  ctx.stroke();

  // Carved horizontal bands — 3 clearly visible monument-segment grooves, each centered on
  // a small carved diamond (a celestial motif echoed from the dome, so the shaft itself
  // reads as more than a flat tapered cone).
  [0.24, 0.50, 0.76].forEach((t, bi) => {
    const yV = -H + H * t;
    const w = topW + (baseW - topW) * t;
    ctx.strokeStyle = hexToRgba(0x05051a, 0.55); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-w * 0.90, yV); ctx.lineTo(w * 0.90, yV); ctx.stroke();
    ctx.strokeStyle = hexToRgba(shade(col, 1.9), 0.30); ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-w * 0.90, yV + 1.2); ctx.lineTo(w * 0.90, yV + 1.2); ctx.stroke();
    // Small carved diamond at the band's center
    const dr = r * 0.07;
    ctx.strokeStyle = hexToRgba(0xffd700, 0.45); ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, yV - dr); ctx.lineTo(dr, yV); ctx.lineTo(0, yV + dr); ctx.lineTo(-dr, yV); ctx.closePath();
    ctx.stroke();
  });

  // Gold inlay — bolder vertical engraved band down the face, nearly the full shaft height
  const goldG = ctx.createLinearGradient(0, -H * 0.92, 0, -bulge * 0.5);
  goldG.addColorStop(0,    hexToRgba(0xffd700, 0));
  goldG.addColorStop(0.12, hexToRgba(0xffd700, 0.75));
  goldG.addColorStop(0.88, hexToRgba(0xffd700, 0.75));
  goldG.addColorStop(1,    hexToRgba(0xffd700, 0));
  ctx.strokeStyle = goldG; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(0, -H * 0.92); ctx.lineTo(0, 0); ctx.stroke();
  // Thin bright core so the inlay reads as a lit groove, not a flat painted stripe
  const goldCore = ctx.createLinearGradient(0, -H * 0.92, 0, -bulge * 0.5);
  goldCore.addColorStop(0,    hexToRgba(0xfff3b0, 0));
  goldCore.addColorStop(0.15, hexToRgba(0xfff3b0, 0.85));
  goldCore.addColorStop(0.85, hexToRgba(0xfff3b0, 0.85));
  goldCore.addColorStop(1,    hexToRgba(0xfff3b0, 0));
  ctx.strokeStyle = goldCore; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(0, -H * 0.92); ctx.lineTo(0, 0); ctx.stroke();

  // Domed top cap — a real dome (not a flat disc/mushroom), the SAME width as the shaft's
  // top so it reads as the shaft continuing into a rounded roof, not a wider cap flaring
  // out past the taper. Flat-bottomed half-ellipse (bottom edge fused into the shaft top,
  // same technique used for the volcanic magma pool / celestial star ornament's own base).
  const domeRX = topW, domeRY = topW * 0.85;
  const domeTopY = -H - domeRY;
  const domeG = ctx.createRadialGradient(-domeRX * 0.3, -H - domeRY * 0.6, domeRX * 0.1, 0, -H, domeRX * 1.1);
  domeG.addColorStop(0,   hexToRgba(shade(col, 1.7), 1));
  domeG.addColorStop(0.6, hexToRgba(shade(col, 1.15), 1));
  domeG.addColorStop(1,   hexToRgba(shade(col, 0.65), 1));
  ctx.beginPath(); ctx.ellipse(0, -H, domeRX, domeRY, 0, Math.PI, Math.PI * 2); ctx.closePath();
  ctx.fillStyle = domeG; ctx.fill();
  ctx.strokeStyle = hexToRgba(0x05051a, 0.8); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(0, -H, domeRX, domeRY, 0, Math.PI, Math.PI * 2); ctx.stroke();
  // Subtle rim-light along the dome's lit (upper-left) curve
  ctx.strokeStyle = hexToRgba(shade(col, 2.0), 0.4); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(0, -H, domeRX * 0.95, domeRY * 0.95, 0, Math.PI * 1.05, Math.PI * 1.55); ctx.stroke();
}

// Theme 4 — Chaos: fractured dark-purple rock
function _spireChaosTrunk(ctx, r, hash) {
  // Floating rift-torn obelisk: the body HOVERS — its ragged bottom tip ends at botY,
  // leaving a visible gap to the ground line at y=0 (where the shadow sits). The bottom
  // is an irregular torn taper, NOT a flat/rounded ground contact — it was ripped free.
  const topY = -r * 3.2, botY = -r * 0.55;
  const baseCol = 0x2a0a30;
  const jx = (i) => (hash(700 + i) - 0.5) * r * 0.14;
  const jy = (i) => (hash(720 + i) - 0.5) * r * 0.10;

  // Silhouette — jagged top, widest at the lower third, ragged point at the bottom.
  // Traced clockwise from the top point: down the right flank, bottom tip, up the left.
  const pts = [
    { x:  r * 0.10 + jx(1), y: topY },                          // jagged top tip
    { x:  r * 0.38 + jx(2), y: topY + r * 0.35 + jy(2) },       // right shoulder
    { x:  r * 0.30 + jx(3), y: topY + r * 0.95 + jy(3) },       // right notch
    { x:  r * 0.58 + jx(4), y: topY + r * 1.55 + jy(4) },       // right mid
    { x:  r * 0.65 + jx(5), y: topY + r * 2.05 + jy(5) },       // widest right
    { x:  r * 0.34 + jx(6), y: botY - r * 0.28 + jy(6) },       // right underside tooth
    { x:  r * 0.06 + jx(7), y: botY },                           // torn bottom tip
    { x: -r * 0.26 + jx(8), y: botY - r * 0.22 + jy(8) },       // left underside tooth
    { x: -r * 0.62 + jx(9), y: topY + r * 2.10 + jy(9) },       // widest left
    { x: -r * 0.54 + jx(10), y: topY + r * 1.45 + jy(10) },     // left mid
    { x: -r * 0.34 + jx(11), y: topY + r * 0.90 + jy(11) },     // left notch
    { x: -r * 0.30 + jx(12), y: topY + r * 0.30 + jy(12) },     // left shoulder
  ];

  // Body — directional facet gradient (lit upper-left → dark lower-right), chaos purple.
  // Contrast pushed further than before (0.42/1.65 → 0.30/2.1) — the flatter range was
  // reading as a smooth blob instead of a faceted gem.
  pathPoly(ctx, pts);
  const lg = ctx.createLinearGradient(-r * 0.6, topY, r * 0.6, botY);
  lg.addColorStop(0,    hexToRgba(shade(baseCol, 2.10), 1));
  lg.addColorStop(0.40, hexToRgba(baseCol, 1));
  lg.addColorStop(1,    hexToRgba(shade(baseCol, 0.30), 1));
  ctx.fillStyle = lg; ctx.fill();

  // Lit facet plane — a bright angled triangle on the upper-left, same technique used on
  // the CC/volcanic trunks, so the body reads as cut gem faces catching light, not a
  // smoothly-shaded blob.
  ctx.save();
  pathPoly(ctx, pts); ctx.clip();
  const faceLG = ctx.createLinearGradient(-r * 0.5, topY, r * 0.1, topY + r * 1.4);
  faceLG.addColorStop(0, hexToRgba(shade(baseCol, 2.4), 0.65));
  faceLG.addColorStop(1, hexToRgba(shade(baseCol, 2.4), 0));
  ctx.fillStyle = faceLG;
  ctx.beginPath();
  ctx.moveTo(pts[11].x, pts[11].y);
  ctx.lineTo(pts[0].x, pts[0].y);
  ctx.lineTo(pts[0].x - r * 0.05, topY + r * 1.5);
  ctx.lineTo(pts[11].x - r * 0.10, topY + r * 1.1);
  ctx.closePath(); ctx.fill();

  // Internal facet lines — a few hash-jittered fracture edges dividing the body into
  // distinct gem planes, so it doesn't read as one smooth mass.
  ctx.strokeStyle = hexToRgba(0x0a0210, 0.55); ctx.lineWidth = 1;
  const facetLines = [
    [{ x: pts[1].x, y: pts[1].y }, { x: r * 0.02 + jx(40), y: topY + r * 1.30 + jy(40) }, { x: pts[5].x, y: pts[5].y }],
    [{ x: pts[10].x, y: pts[10].y }, { x: -r * 0.10 + jx(41), y: topY + r * 1.70 + jy(41) }, { x: pts[8].x, y: pts[8].y }],
    [{ x: r * 0.02 + jx(40), y: topY + r * 1.30 + jy(40) }, { x: -r * 0.10 + jx(41), y: topY + r * 1.70 + jy(41) }],
  ];
  facetLines.forEach((line) => {
    ctx.beginPath(); ctx.moveTo(line[0].x, line[0].y);
    for (let i = 1; i < line.length; i++) ctx.lineTo(line[i].x, line[i].y);
    ctx.stroke();
  });
  ctx.restore();

  pathPoly(ctx, pts);
  ctx.strokeStyle = hexToRgba(0xff00ff, 0.55); ctx.lineWidth = 1.5; ctx.stroke();

  // Rift tear — jagged vertical split down the middle, rendered with the game's rift-tear
  // layer recipe (wide glow → mid glow → bright core), clipped to the body so the glow
  // never bleeds past the silhouette.
  ctx.save();
  pathPoly(ctx, pts);
  ctx.clip();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const riftPts = [];
  const riftSegs = 5;
  for (let i = 0; i <= riftSegs; i++) {
    const t = i / riftSegs;
    riftPts.push({
      x: (hash(760 + i) - 0.5) * r * 0.28,
      y: (topY + r * 0.30) + (botY - r * 0.10 - topY - r * 0.30) * t,
    });
  }
  const traceRift = () => {
    ctx.beginPath();
    ctx.moveTo(riftPts[0].x, riftPts[0].y);
    for (let i = 1; i < riftPts.length; i++) ctx.lineTo(riftPts[i].x, riftPts[i].y);
  };
  ctx.strokeStyle = hexToRgba(0xff00ff, 0.30); ctx.lineWidth = r * 0.26; traceRift(); ctx.stroke();
  ctx.strokeStyle = hexToRgba(0xff44ff, 0.55); ctx.lineWidth = r * 0.13; traceRift(); ctx.stroke();
  ctx.strokeStyle = hexToRgba(0xffccff, 0.90); ctx.lineWidth = r * 0.05; traceRift(); ctx.stroke();
  ctx.restore();

  // Floating debris is NOT baked here — it's a separate rotating image (see
  // bakeSpireChaosDebrisTexture + Obstacle.js _buildSpire) so the torn-off chunks can
  // actually tumble/orbit in the hover gap instead of sitting frozen in the static trunk.
}

// Chaos floating debris — ONE small torn-off chunk. Baked once per size (shared/reused,
// same bake-once pattern as bakeChaosFragmentTexture) rather than baking all 3 chunks into
// a single rigid image — that made them move in lockstep as a fixed triangle formation
// instead of each tracing the SAME orbit path at a different phase, following one another
// around the loop (see Obstacle.js _buildSpire, theme 4).
export function bakeChaosDebrisShardTexture(scene, size) {
  const key = `fx-chaos-debris-${size}`;
  if (scene.textures.exists(key)) return key;
  const baseCol = 0x2a0a30;
  const glowR = size * 2.0;
  const S = Math.ceil(glowR * 2 + 4);
  const cx = S / 2, cy = S / 2;
  const tex = scene.textures.createCanvas(key, S, S);
  const ctx = tex.getContext();

  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
  glow.addColorStop(0, hexToRgba(0xff44ff, 0.35));
  glow.addColorStop(1, hexToRgba(0xff44ff, 0));
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(cx, cy, glowR, 0, Math.PI * 2); ctx.fill();

  const tri = [0, 1, 2].map(k => {
    const a = (k / 3) * Math.PI * 2;
    return { x: cx + Math.cos(a) * size, y: cy + Math.sin(a) * size * 0.8 };
  });
  const dg = ctx.createLinearGradient(cx, cy - size, cx, cy + size * 0.5);
  dg.addColorStop(0, hexToRgba(shade(baseCol, 1.9), 1));
  dg.addColorStop(1, hexToRgba(shade(baseCol, 0.9), 1));
  pathPoly(ctx, tri); ctx.fillStyle = dg; ctx.fill();
  pathPoly(ctx, tri);
  ctx.strokeStyle = hexToRgba(0xff66ff, 0.75); ctx.lineWidth = 1.2; ctx.stroke();

  tex.refresh();
  return key;
}

// ── Canopy ────────────────────────────────────────────────────────────────

export function bakeSpireCanopyTexture(scene, key, themeIdx, r, hash) {
  const pad = 8;
  let cw, ch, ox, oy;
  if (themeIdx === 1) {
    // Two crystal clusters flank the base — wider canvas so neither side clips.
    cw = Math.ceil(r * 3.6 + pad * 2);
    ch = Math.ceil(r * 2.6 + pad * 2);
    ox = Math.floor(cw / 2);
    oy = ch - pad;
  } else if (themeIdx === 0) {
    // GF grass blades extend tall — needs extra vertical room
    const marginX = r * 1.4;
    const marginY = r * 1.6;
    cw = Math.ceil(marginX * 2 + pad * 2);
    ch = Math.ceil(marginY * 2 + pad * 2);
    ox = Math.floor(cw / 2);
    oy = Math.floor(ch / 2);
  } else if (themeIdx === 2) {
    // Magma pool seated in the trunk's crater notch — rising embers need headroom above it,
    // and the soft heat-halo bleeds a little below the pool so it gets extra bottom margin.
    cw = Math.ceil(r * 2.0 + pad * 2);
    ch = Math.ceil(r * 1.6 + pad * 3);
    ox = Math.floor(cw / 2);
    oy = ch - pad * 2;
  } else if (themeIdx === 3) {
    // Star ornament sitting on top of the obelisk's dome — bottom-anchored (like the other
    // integrated canopies above) so it sits flush; its halo bleeds well above/below.
    const aboveRoom = r * 2.35, belowRoom = r * 1.0;
    cw = Math.ceil(r * 3.0 + pad * 2);
    ch = Math.ceil(aboveRoom + belowRoom + pad * 2);
    ox = Math.floor(cw / 2);
    oy = Math.ceil(ch - belowRoom - pad);
  } else {
    // Compact centered; Chaos needs extra margin for 360° rotation — the image rotates, so
    // the square margin must cover the widest fragment reach (varied rings up to r*1.15,
    // plus each fragment's own glow halo).
    const margin = themeIdx === 4 ? r * 1.75 : r * 1.1;
    cw = Math.ceil(margin * 2 + pad * 2);
    ch = Math.ceil(margin * 2 + pad * 2);
    ox = Math.floor(cw / 2);
    oy = Math.floor(ch / 2);
  }

  // Always rebake — see matching note in bakeSpireTrunkTexture.
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, cw, ch);
  const ctx = tex.getContext();
  ctx.save();
  ctx.translate(ox, oy);

  switch (themeIdx) {
    case 0: _spireGFCanopy(ctx, r, hash);    break;
    case 1: _spireCCCanopy(ctx, r, hash);    break;
    case 2: _spireVolCanopy(ctx, r, hash);   break;
    case 3: _spireCelCanopy(ctx, r, hash);   break;
    case 4: _spireChaosCanopy(ctx, r, hash); break;
    default: _spireGFCanopy(ctx, r, hash);
  }

  ctx.restore();
  tex.refresh();
  return { key, originX: ox / cw, originY: oy / ch };
}

// Volcanic front crater teeth — baked into their own texture (same canvas size/origin as the
// theme-2 canopy so it overlays exactly) so it can be layered IN FRONT of the live ember
// sprites. The embers then read as rising from inside the crater, behind this front rim.
export function bakeSpireVolTeethTexture(scene, key, r, hash) {
  const pad = 8;
  const cw = Math.ceil(r * 2.0 + pad * 2);
  const ch = Math.ceil(r * 1.6 + pad * 3);
  const ox = Math.floor(cw / 2);
  const oy = ch - pad * 2;

  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, cw, ch);
  const ctx = tex.getContext();
  ctx.save();
  ctx.translate(ox, oy);

  // 3 separate triangles along the bottom of the pool's oval (left, center, right). Each
  // triangle's two base corners are literal points ON the ellipse (so the base follows the
  // oval's curvature/angle at that spot); the tip juts straight UPWARDS. Solid dark auburn.
  const poolCY2 = -r * 0.05, poolRX2 = r * 0.62, poolRY2 = r * 0.24;
  const teethCol = 0x5a2810;
  const onEllipse = (phi) => ({ x: poolRX2 * Math.sin(phi), y: poolCY2 + poolRY2 * Math.cos(phi) });
  [-0.66, 0, 0.66].forEach((phiC, i) => {
    const delta = 0.22 + hash(900 + i) * 0.04;
    const baseL = onEllipse(phiC - delta);
    const baseR = onEllipse(phiC + delta);
    const baseMid = { x: (baseL.x + baseR.x) / 2, y: (baseL.y + baseR.y) / 2 };
    const h = r * (0.34 + hash(910 + i) * 0.14);
    const tip = { x: baseMid.x, y: baseMid.y - h };
    const tri = [baseL, tip, baseR];
    // Opaque flat body (clearly darker than the lava → reads as solid occluding rock)
    pathPoly(ctx, tri); ctx.fillStyle = hexToRgba(teethCol, 1); ctx.fill();
    // Subtle lit sheen on the upper-left face only
    const sheen = ctx.createLinearGradient(baseL.x, 0, baseR.x, 0);
    sheen.addColorStop(0,    hexToRgba(shade(teethCol, 1.55), 0.55));
    sheen.addColorStop(0.45, hexToRgba(shade(teethCol, 1.55), 0));
    pathPoly(ctx, tri); ctx.fillStyle = sheen; ctx.fill();
    // Crisp dark-auburn outline
    ctx.strokeStyle = hexToRgba(shade(teethCol, 0.45), 0.95); ctx.lineWidth = 1.2;
    pathPoly(ctx, tri); ctx.stroke();
  });

  ctx.restore();
  tex.refresh();
  return { key, originX: ox / cw, originY: oy / ch };
}

// Theme 0 — Green Fields: grass tuft cluster
function _spireGFCanopy(ctx, r, hash) {
  // Mound center at y = r*0.10 — aligns with column top in world space.
  // Mound rx = r*0.85 matches column half-width exactly for a seamless join.
  const mCX = 0, mCY = -r * 0.04, mRX = r * 0.85, mRY = r * 0.28;

  // Dark underside contact shadow so mound "sits into" the column top
  const shadow = ctx.createRadialGradient(mCX, mCY + mRY * 0.5, 0, mCX, mCY + mRY * 0.4, mRX * 0.9);
  shadow.addColorStop(0, 'rgba(0,0,0,0.30)');
  shadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadow;
  ctx.beginPath(); ctx.ellipse(mCX, mCY + mRY * 0.3, mRX, mRY * 0.55, 0, 0, Math.PI * 2); ctx.fill();

  // Mound body — radial gradient lit from top-left
  const body = ctx.createRadialGradient(mCX - mRX * 0.25, mCY - mRY * 0.55, 0, mCX, mCY, mRX);
  body.addColorStop(0,    hexToRgba(0x6ec84a, 1));
  body.addColorStop(0.45, hexToRgba(0x4a8c30, 1));
  body.addColorStop(1,    hexToRgba(shade(0x3a6020, 0.72), 1));
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(mCX, mCY, mRX, mRY, 0, 0, Math.PI * 2); ctx.fill();

  // Blades spread across the mound ellipse surface — each blade roots at its own surface point.
  // Three layers drawn back-to-front: dark → mid → vivid lime.
  // Front blades have wide length variance so short ones let darker blades show through.

  // Helper: place blade root on the mound ellipse at a given x fraction (-1..1)
  // Returns [bx, by] on the top surface of the mound
  const surfaceBase = (xFrac, jY) => {
    const bx = mCX + xFrac * mRX * 0.90;
    const clamped = Math.max(-1, Math.min(1, (bx - mCX) / mRX));
    const halfH = mRY * Math.sqrt(1 - clamped * clamped);
    // Root on top surface of mound, offset downward into mound by jY (clamped so root stays inside)
    const by = mCY - halfH + Math.min(halfH * 1.8, Math.max(0, jY));
    return [bx, by];
  };

  // Layer 0 — dark back, wide fan so outer blades are visible beyond the lime cluster
  ctx.fillStyle = hexToRgba(0x2e6614, 0.92);
  for (let i = 0; i < 26; i++) {
    const xFrac = -0.85 + (i / 25) * 1.70 + (hash(350 + i) - 0.5) * 0.16;
    const [bx, by] = surfaceBase(xFrac, hash(360 + i) * mRY * 2.5);
    const ang  = xFrac * 1.30 + (hash(300 + i) - 0.5) * 0.28;
    const bLen = r * 0.32 * (0.85 + hash(370 + i) * 0.30);
    const hw   = r * 0.090;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const bow = ang < 0 ? -0.34 : ang > 0 ? 0.34 : (hash(375 + i) - 0.5) * 0.24;
    const ctrlX = bx + sa * bLen * 0.65 + bow * bLen * ca;
    const ctrlY = by - ca * bLen * 0.65 + bow * bLen * sa;
    ctx.beginPath();
    ctx.moveTo(bx - ca * hw, by - sa * hw);
    ctx.quadraticCurveTo(ctrlX - ca * hw * 0.35, ctrlY - sa * hw * 0.35, bx + sa * bLen, by - ca * bLen);
    ctx.lineTo(bx + ca * hw, by + sa * hw);
    ctx.closePath();
    ctx.fill();
  }

  // Layer 1 — medium green, mid fan
  ctx.fillStyle = hexToRgba(0x4ea828, 0.94);
  for (let i = 0; i < 22; i++) {
    const xFrac = -0.72 + (i / 21) * 1.44 + (hash(380 + i) - 0.5) * 0.20;
    const [bx, by] = surfaceBase(xFrac, hash(390 + i) * mRY * 2.0);
    const ang  = xFrac * 1.00 + (hash(320 + i) - 0.5) * 0.26;
    const bLen = r * 0.42 * (0.85 + hash(400 + i) * 0.28);
    const hw   = r * 0.075;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const bow = ang < 0 ? -0.30 : ang > 0 ? 0.30 : (hash(405 + i) - 0.5) * 0.22;
    const ctrlX = bx + sa * bLen * 0.65 + bow * bLen * ca;
    const ctrlY = by - ca * bLen * 0.65 + bow * bLen * sa;
    ctx.beginPath();
    ctx.moveTo(bx - ca * hw, by - sa * hw);
    ctx.quadraticCurveTo(ctrlX - ca * hw * 0.35, ctrlY - sa * hw * 0.35, bx + sa * bLen, by - ca * bLen);
    ctx.lineTo(bx + ca * hw, by + sa * hw);
    ctx.closePath();
    ctx.fill();
  }

  // Layer 2 — vivid lime front, narrower fan, wide length variance so dark shows through
  ctx.fillStyle = hexToRgba(0x8ee820, 1.00);
  for (let i = 0; i < 18; i++) {
    const xFrac = -0.48 + (i / 17) * 0.96 + (hash(410 + i) - 0.5) * 0.18;
    const [bx, by] = surfaceBase(xFrac, hash(420 + i) * mRY * 5.0);
    const ang  = xFrac * 0.72 + (hash(340 + i) - 0.5) * 0.22;
    const bLen = r * 0.52 * (0.78 + hash(430 + i) * 0.38);
    const hw   = r * 0.062;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const bow = ang < 0 ? -0.26 : ang > 0 ? 0.26 : (hash(435 + i) - 0.5) * 0.20;
    const ctrlX = bx + sa * bLen * 0.65 + bow * bLen * ca;
    const ctrlY = by - ca * bLen * 0.65 + bow * bLen * sa;
    ctx.beginPath();
    ctx.moveTo(bx - ca * hw, by - sa * hw);
    ctx.quadraticCurveTo(ctrlX - ca * hw * 0.35, ctrlY - sa * hw * 0.35, bx + sa * bLen, by - ca * bLen);
    ctx.lineTo(bx + ca * hw, by + sa * hw);
    ctx.closePath();
    ctx.fill();
  }
}

// Theme 1 — Crystal Caves: 4 shards with length-wise gradient
function _spireCCCanopy(ctx, r, hash) {
  const shards = [
    { x: 0,         h: r * 2.4, tilt:  0,    c1: 0x99eeff, c2: 0x336688 },
    { x: -r * 0.5,  h: r * 1.7, tilt: -0.15, c1: 0x77ddee, c2: 0x224455 },
    { x:  r * 0.5,  h: r * 1.8, tilt:  0.18, c1: 0xaaeeff, c2: 0x338899 },
    { x: -r * 0.2,  h: r * 1.3, tilt:  0.05, c1: 0x88ccdd, c2: 0x225566 },
  ];
  // Two identical clusters flanking the spire base — one shifted left, one right — so
  // crystals appear to erupt from the ground all around the spire. Each is scaled to 0.6
  // anchored at its base point (orientation and shape untouched).
  const clusterOffsets = [-r * 0.36, r * 0.36];
  for (const dx of clusterOffsets) {
  ctx.save();
  ctx.translate(dx, 0);
  ctx.scale(0.6, 0.6);
  [...shards].sort((a, b) => b.h - a.h).forEach(({ x, h, tilt, c1, c2 }) => {
    const w = r * 0.32, cos = Math.cos(tilt), sin = Math.sin(tilt);
    const tip   = { x: x + sin * h, y: -h * cos };
    const right = { x: x + cos * w, y: -w * sin };
    const left  = { x: x - cos * w, y:  w * sin };
    const base  = { x, y: 0 };
    const grad = ctx.createLinearGradient(base.x, base.y, tip.x, tip.y);
    grad.addColorStop(0,   hexToRgba(c2, 0.90));
    grad.addColorStop(0.5, hexToRgba(c1, 0.90));
    grad.addColorStop(1,   hexToRgba(shade(c1, 1.30), 0.70));
    pathPoly(ctx, [base, right, tip, left]);
    ctx.fillStyle = grad; ctx.fill();
    // Lit-face overlay
    const faceG = ctx.createLinearGradient(left.x, 0, right.x, 0);
    faceG.addColorStop(0, hexToRgba(0xffffff, 0.22));
    faceG.addColorStop(0.45, hexToRgba(0xffffff, 0));
    pathPoly(ctx, [base, right, tip, left]);
    ctx.fillStyle = faceG; ctx.fill();
    ctx.strokeStyle = hexToRgba(0xffffff, 0.55); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    ctx.fillStyle = hexToRgba(0xffffff, 0.45);
    ctx.beginPath(); ctx.arc(tip.x, tip.y, 1.5, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
  }
}

// Theme 2 — Volcanic: a magma pool seated in the trunk's crater notch, with embers rising
// off it. Local (0,0) = the notch (bottom-anchored), matching the trunk's notch point.
function _spireVolCanopy(ctx, r, hash) {
  // Ambient heat glow — soft wash lighting the inside of the crater and the horn flanks
  const halo = ctx.createRadialGradient(0, -r * 0.20, 0, 0, -r * 0.20, r * 1.15);
  halo.addColorStop(0, hexToRgba(0xff5500, 0.22));
  halo.addColorStop(1, hexToRgba(0xff3300, 0));
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(0, -r * 0.20, r * 1.15, 0, Math.PI * 2); ctx.fill();

  // Magma pool — bright molten core fading to charred rock at the rim
  const pool = ctx.createRadialGradient(-r * 0.08, -r * 0.10, 0, 0, -r * 0.05, r * 0.62);
  pool.addColorStop(0,    hexToRgba(0xffee99, 1));
  pool.addColorStop(0.35, hexToRgba(0xff9933, 1));
  pool.addColorStop(0.70, hexToRgba(0xcc3300, 1));
  pool.addColorStop(1,    hexToRgba(0x330800, 1));
  ctx.fillStyle = pool;
  ctx.beginPath(); ctx.ellipse(0, -r * 0.05, r * 0.62, r * 0.24, 0, 0, Math.PI * 2); ctx.fill();
  // Crater lip — dark rim stroke grounding the pool into the rock
  ctx.strokeStyle = hexToRgba(0x1a0800, 0.85); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(0, -r * 0.05, r * 0.62, r * 0.24, 0, 0, Math.PI * 2); ctx.stroke();
  // Bright front lip catching the glow
  ctx.strokeStyle = hexToRgba(0xffaa44, 0.55); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(0, -r * 0.05, r * 0.58, r * 0.20, 0, 0.15, Math.PI - 0.15); ctx.stroke();

  // Front crater teeth are NOT drawn here — they are baked into a separate texture
  // (bakeSpireVolTeethTexture) that sits IN FRONT of the live ember sprites, so the embers
  // read as spawning down inside the crater (behind the front rim) rather than on top of it.

  // Embers are live tweened sprites (see Obstacle.js _buildSpire) so they can actually
  // rise and fade — not baked here, since this texture is static.

  // Thin rising smoke wisps for atmosphere
  ctx.strokeStyle = hexToRgba(0x554a44, 0.20); ctx.lineWidth = 3; ctx.lineCap = 'round';
  [-r * 0.22, r * 0.18].forEach((wx, j) => {
    ctx.beginPath();
    ctx.moveTo(wx, -r * 0.15);
    ctx.quadraticCurveTo(wx + (hash(690 + j) - 0.5) * r * 0.3, -r * 0.7, wx * 0.5, -r * 1.15);
    ctx.stroke();
  });
}

// Theme 3 — Celestial: a single glowing 4-pointed star ornament sitting on top of the
// obelisk's domed cap (the dome itself is baked into the trunk texture — see
// _spireCelTrunk — so the two fuse into one continuous shape with no visible seam; no
// separate seating ring is needed here anymore). The dome/constellation from earlier
// iterations is gone — the "starfield" is now live orbiting sprites, spawned in
// Obstacle.js, that circle the shaft (including passing behind it), not baked here.
function _spireCelCanopy(ctx, r, hash) {
  // Local (0,0) = world y = -H (the shaft top / dome's flat base, same anchor as before).
  // The dome itself rises `domeRY` above that — the star sits just above the dome's apex.
  const topW = r * 0.48, domeRY = topW * 0.85; // must match _spireCelTrunk's dome exactly
  const starR = r * 0.55, cy = -domeRY - starR * 1.05;

  // Ambient glow halo behind the ornament
  const halo = ctx.createRadialGradient(0, cy, 0, 0, cy, starR * 2.6);
  halo.addColorStop(0,    hexToRgba(0x9988ff, 0.40));
  halo.addColorStop(0.6,  hexToRgba(0x7766dd, 0.15));
  halo.addColorStop(1,    hexToRgba(0x6655cc, 0));
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(0, cy, starR * 2.6, 0, Math.PI * 2); ctx.fill();

  // 4-pointed "sparkle" star — long points on the axes, short concave points between them
  const starPts = (cx, cyy, rOuter, rInner) => ([
    { x: cx,               y: cyy - rOuter },
    { x: cx + rInner * 0.35, y: cyy - rInner * 0.35 },
    { x: cx + rOuter,      y: cyy },
    { x: cx + rInner * 0.35, y: cyy + rInner * 0.35 },
    { x: cx,               y: cyy + rOuter },
    { x: cx - rInner * 0.35, y: cyy + rInner * 0.35 },
    { x: cx - rOuter,      y: cyy },
    { x: cx - rInner * 0.35, y: cyy - rInner * 0.35 },
  ]);
  const pts = starPts(0, cy, starR, starR * 0.50); // thicker arms (was 0.34)
  const starG = ctx.createRadialGradient(0, cy, 0, 0, cy, starR);
  starG.addColorStop(0, hexToRgba(0xfff8e0, 1));
  starG.addColorStop(0.6, hexToRgba(0xd9c9ff, 0.95));
  starG.addColorStop(1, hexToRgba(0x8866dd, 0.85));
  pathPoly(ctx, pts); ctx.fillStyle = starG; ctx.fill();
  ctx.strokeStyle = hexToRgba(0x4a3a9c, 0.6); ctx.lineWidth = 1;
  pathPoly(ctx, pts); ctx.stroke();

  // Thin secondary cross-sparkle overlay for shimmer
  ctx.strokeStyle = hexToRgba(0xffffff, 0.55); ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-starR * 0.55, cy); ctx.lineTo(starR * 0.55, cy);
  ctx.moveTo(0, cy - starR * 0.55); ctx.lineTo(0, cy + starR * 0.55);
  ctx.stroke();
}

// Theme 4 — Chaos: the fragment ring is NOT baked here anymore. A whole-image `angle`
// rotation looks like orbiting but is actually a flat 2D spin — any point at a fixed
// distance from the image's pivot traces a true CIRCLE, which breaks the 2.5D illusion the
// fragments' squashed-ring positions were built for (see the "2.5D perspective governs
// every orbit/rotation" rule in this project's CLAUDE.md). The 3 fragments are now live
// sprites (bakeChaosFragmentTexture, spawned in Obstacle.js) driven by real elliptical
// per-frame math, same technique as the celestial spire's orbiting stars.
function _spireChaosCanopy(ctx, r, hash) {
  // Intentionally empty — nothing to bake for this theme's canopy layer.
}

// Shared small triangle-fragment texture for the Chaos spire's live orbiting fragments.
// Fixed key per (size, color) pair so it's baked once and reused across instances, same
// bake-once pattern as bakeEmberParticleTexture / bakeCelestialOrbiterTexture.
export function bakeChaosFragmentTexture(scene, size, color) {
  const key = `fx-chaos-frag-${color.toString(16)}-${size}`;
  if (scene.textures.exists(key)) return key;
  const glowR = size * 2.2;
  const S = Math.ceil(glowR * 2 + 4);
  const cx = S / 2, cy = S / 2;
  const tex = scene.textures.createCanvas(key, S, S);
  const ctx = tex.getContext();

  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
  glow.addColorStop(0, hexToRgba(color, 0.30));
  glow.addColorStop(1, hexToRgba(color, 0));
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(cx, cy, glowR, 0, Math.PI * 2); ctx.fill();

  const tri = [
    { x: cx,          y: cy - size },
    { x: cx + size,   y: cy + size * 0.5 },
    { x: cx - size,   y: cy + size * 0.5 },
  ];
  const fg = ctx.createLinearGradient(cx, cy - size, cx, cy + size * 0.5);
  fg.addColorStop(0, hexToRgba(shade(color, 1.35), 0.95));
  fg.addColorStop(1, hexToRgba(color, 0.85));
  pathPoly(ctx, tri); ctx.fillStyle = fg; ctx.fill();
  pathPoly(ctx, tri);
  ctx.strokeStyle = hexToRgba(0xffffff, 0.70); ctx.lineWidth = 0.8; ctx.stroke();

  tex.refresh();
  return key;
}

// ── Shared FX sprites ────────────────────────────────────────────────────────

// A single small glowing-dot texture reused by every live ember sprite (e.g. the volcanic
// spire's rising embers in Obstacle.js). Fixed size/shape, baked once and cached globally —
// unlike the per-instance spire textures above, this key never needs to change dimensions,
// so a simple exists-check guard is correct here (no stale-size risk).
export function bakeEmberParticleTexture(scene) {
  const key = 'fx-ember-glow';
  if (scene.textures.exists(key)) return key;
  const size = 24, c = size / 2;
  const tex = scene.textures.createCanvas(key, size, size);
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0,    hexToRgba(0xffee99, 1));
  g.addColorStop(0.35, hexToRgba(0xff9933, 0.85));
  g.addColorStop(1,    hexToRgba(0xff4400, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(c, c, c, 0, Math.PI * 2); ctx.fill();
  tex.refresh();
  return key;
}

// Same fixed-key/bake-once pattern as bakeEmberParticleTexture, but a cool white/lavender
// palette — used by the celestial spire's live orbiting star sprites (see Obstacle.js).
// Layered the same way the player's projectile sphere is (outer glow → mid glow → a
// hard-edge-clipped sphere body with an offset highlight) instead of one flat centered
// gradient, so it reads as a real shaded orb rather than a soft flat blob.
export function bakeCelestialOrbiterTexture(scene) {
  const key = 'fx-star-glow';
  if (scene.textures.exists(key)) return key;
  const radius = 10, glow = radius * 2.6;
  const S = Math.ceil(glow) * 2 + 4;
  const tex = scene.textures.createCanvas(key, S, S);
  const ctx = tex.getContext();
  const cx = S / 2, cy = S / 2;

  // Layer 1 — outer soft glow cloud
  const outerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glow);
  outerGlow.addColorStop(0.00, hexToRgba(0xaaccff, 0.30));
  outerGlow.addColorStop(0.40, hexToRgba(0xaaccff, 0.16));
  outerGlow.addColorStop(0.75, hexToRgba(0xaaccff, 0.06));
  outerGlow.addColorStop(1.00, hexToRgba(0xaaccff, 0));
  ctx.fillStyle = outerGlow; ctx.fillRect(0, 0, S, S);

  // Layer 2 — mid glow
  const midGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.9);
  midGlow.addColorStop(0.00, hexToRgba(0xccddff, 0.55));
  midGlow.addColorStop(0.60, hexToRgba(0xccddff, 0.25));
  midGlow.addColorStop(1.00, hexToRgba(0xccddff, 0));
  ctx.fillStyle = midGlow; ctx.fillRect(0, 0, S, S);

  // Layer 3 — sphere body (hard-edge clipped, offset focal point for real 3D shading)
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.clip();
  const sphere = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, 0, cx, cy, radius);
  sphere.addColorStop(0.00, hexToRgba(0xffffff, 1));
  sphere.addColorStop(0.20, hexToRgba(0xeaf0ff, 1));
  sphere.addColorStop(0.55, hexToRgba(0xaebfff, 1));
  sphere.addColorStop(0.85, hexToRgba(0x6677cc, 0.90));
  sphere.addColorStop(1.00, hexToRgba(0x6677cc, 0));
  ctx.fillStyle = sphere; ctx.fillRect(0, 0, S, S);
  ctx.restore();

  tex.refresh();
  return key;
}
