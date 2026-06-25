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

  // Glowing lava fissures — only on the Volcanic theme. Structured (not random): a molten
  // core at the center with fissures radiating outward into the lower/shaded area, evenly
  // spread, so they read as a deliberate "cracked from within" pattern rather than stray lines.
  if (tc.lavaGlow) {
    // Molten core glow
    ctx.fillStyle = 'rgba(255,102,0,0.22)';
    ctx.beginPath(); ctx.arc(cx, cy, rx * 0.26, 0, Math.PI * 2); ctx.fill();

    const crackN = 3;
    for (let k = 0; k < crackN; k++) {
      // Evenly fan across the lower arc (0.15π → 0.85π = down toward the shaded facet),
      // with only a tiny hash jitter so the structure stays intact.
      const a   = Math.PI * (0.15 + (k / (crackN - 1)) * 0.70 + (hash(hBase + 60 + k) - 0.5) * 0.10);
      const len = rx * (0.55 + hash(hBase + 64 + k) * 0.28);
      const bx  = cx + Math.cos(a) * len;
      const by  = cy + Math.sin(a) * len * (ry / rx);
      ctx.strokeStyle = hexToRgba(tc.rockCrack, 0.85); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bx, by); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,150,40,0.55)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bx, by); ctx.stroke();
    }
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
function cylTopCap(ctx, cx, topY, w, tc) {
  const rx = w / 2, ry = w * 0.16;
  ctx.beginPath();
  ctx.ellipse(cx, topY, rx, ry, 0, 0, Math.PI * 2);
  const rg = ctx.createRadialGradient(cx - rx * 0.3, topY - ry * 0.5, rx * 0.1, cx, topY, rx);
  rg.addColorStop(0,   hexToRgba(shade(tc.pillarCap, 1.18), 1));
  rg.addColorStop(0.7, hexToRgba(tc.pillarCap, 1));
  rg.addColorStop(1,   hexToRgba(shade(tc.pillarCap, 0.78), 1));
  ctx.fillStyle = rg; ctx.fill();
  ctx.strokeStyle = hexToRgba(shade(tc.pillarCap, 0.65), 0.6); ctx.lineWidth = 1.2; ctx.stroke();
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
  roundRectPath(ctx, -pw / 2, -ph, pw, ph, corner);
  const cyl = ctx.createLinearGradient(-pw / 2, 0, pw / 2, 0);
  cyl.addColorStop(0.00, hexToRgba(shade(tc.pillarBody, 0.82), 1)); // left rim
  cyl.addColorStop(0.28, hexToRgba(shade(tc.pillarBody, 1.20), 1)); // lit core
  cyl.addColorStop(0.60, hexToRgba(tc.pillarBody, 1));              // body
  cyl.addColorStop(1.00, hexToRgba(shade(tc.pillarBody, 0.55), 1)); // shadow edge
  ctx.fillStyle = cyl; ctx.fill();
  ctx.strokeStyle = hexToRgba(tc.pillarDark, 0.60); ctx.lineWidth = 1.5; ctx.stroke();

  // Vertical weathering cracks — structured (top→base in the central band, slight waver).
  const crackCount = 2 + Math.floor(hash(40) * 2); // 2–3
  for (let k = 0; k < crackCount; k++) {
    const chh = 41 + k * 6;
    const cxk = -pw * 0.30 + hash(chh) * pw * 0.60;
    const top = -ph * (0.55 + hash(chh + 1) * 0.30);
    const bot = -ph * (0.05 + hash(chh + 2) * 0.10);
    const wav = (hash(chh + 3) - 0.5) * pw * 0.10;
    ctx.strokeStyle = hexToRgba(tc.pillarCrack, tc.lavaGlow ? 0.85 : 0.55);
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(cxk, top); ctx.quadraticCurveTo(cxk + wav, (top + bot) / 2, cxk, bot); ctx.stroke();
    if (tc.lavaGlow) {
      ctx.strokeStyle = 'rgba(255,102,0,0.45)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(cxk, top); ctx.quadraticCurveTo(cxk + wav, (top + bot) / 2, cxk, bot); ctx.stroke();
    }
  }

  // Rounded 3D top cap on every variant (variants differ by height only — no flat tops).
  cylTopCap(ctx, 0, -ph, pw, tc);

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
  const padTop    = 6;
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

  // Trunk cylinder — horizontal gradient (dark left rim → lit core → body → shadow right)
  roundRectPath(ctx, -tr, -tTop, tr * 2, tH, tr * 0.5);
  const cyl = ctx.createLinearGradient(-tr, 0, tr, 0);
  cyl.addColorStop(0.00, hexToRgba(shade(tc.trunkBody, 0.72), 1));
  cyl.addColorStop(0.28, hexToRgba(shade(tc.trunkBody, 1.18), 1));
  cyl.addColorStop(0.60, hexToRgba(tc.trunkBody, 1));
  cyl.addColorStop(1.00, hexToRgba(shade(tc.trunkBody, 0.50), 1));
  ctx.fillStyle = cyl; ctx.fill();
  ctx.strokeStyle = hexToRgba(tc.trunkDark, 0.70); ctx.lineWidth = 1.5; ctx.stroke();

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
