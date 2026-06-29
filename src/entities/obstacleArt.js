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
  const aboveH = r * 2.6  + pad;
  const belowH = r * 1.0  + pad;
  const cw = Math.ceil(halfW * 2);
  const ch = Math.ceil(aboveH + belowH);
  const ox = Math.floor(cw / 2);
  const oy = Math.ceil(aboveH);

  if (scene.textures.exists(key)) return { key, originX: ox / cw, originY: oy / ch };
  const tex = scene.textures.createCanvas(key, cw, ch);
  const ctx = tex.getContext();
  ctx.save();
  ctx.translate(ox, oy);

  // Ground shadow — scale ctx so radial gradient follows the ellipse edge, not a circle
  ctx.save();
  ctx.translate(4, r * 0.5);
  ctx.scale(1.0, 0.30);  // squash matches ellipse ry/rx ratio
  const sg = ctx.createRadialGradient(0, 0, r * 0.18, 0, 0, r * 1.30);
  sg.addColorStop(0,    'rgba(0,0,0,0.52)');
  sg.addColorStop(0.55, 'rgba(0,0,0,0.24)');
  sg.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.30, 0, Math.PI * 2);
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
  roundRectPath(ctx, -r * 0.85, -r * 2.5, r * 1.7, r * 3, r * 0.3);
  const cyl = ctx.createLinearGradient(-r * 0.85, 0, r * 0.85, 0);
  cyl.addColorStop(0,    hexToRgba(shade(col, 0.60), 1));
  cyl.addColorStop(0.28, hexToRgba(shade(col, 1.25), 1));
  cyl.addColorStop(0.58, hexToRgba(col, 1));
  cyl.addColorStop(1,    hexToRgba(shade(col, 0.50), 1));
  ctx.fillStyle = cyl; ctx.fill();
  // Shadow-side overlay
  ctx.save();
  roundRectPath(ctx, -r * 0.85, -r * 2.5, r * 1.7, r * 3, r * 0.3);
  ctx.clip();
  const sG = ctx.createLinearGradient(0, 0, r * 0.85, 0);
  sG.addColorStop(0, hexToRgba(0x2e261c, 0));
  sG.addColorStop(1, hexToRgba(0x2e261c, 0.45));
  ctx.fillStyle = sG; ctx.fillRect(-r, -r * 2.6, r * 2, r * 3.5);
  ctx.restore();
  roundRectPath(ctx, -r * 0.85, -r * 2.5, r * 1.7, r * 3, r * 0.3);
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

// Theme 1 — Crystal Caves: dark anchor rock (4 overlapping circles)
function _spireCCTrunk(ctx, r, hash) {
  for (let i = 0; i < 4; i++) {
    const cx2 = (i - 1.5) * r * 0.45;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx2, 0, r * 0.85, 0, Math.PI * 2); ctx.clip();
    const rg = ctx.createRadialGradient(cx2 - r * 0.28, -r * 0.28, 0, cx2, 0, r * 0.85);
    rg.addColorStop(0,   hexToRgba(shade(0x1a1830, 1.55), 1));
    rg.addColorStop(0.6, hexToRgba(0x1a1830, 1));
    rg.addColorStop(1,   hexToRgba(shade(0x1a1830, 0.55), 1));
    ctx.fillStyle = rg; ctx.fillRect(cx2 - r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
    ctx.restore();
  }
  ctx.strokeStyle = hexToRgba(0x0a0820, 0.85); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(-r * 0.5, 0, r * 0.85, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(r * 0.5, 0, r * 0.85, 0, Math.PI * 2); ctx.stroke();
}

// Theme 2 — Volcanic: charred basalt outcrop
function _spireVolTrunk(ctx, r, hash) {
  const segs = 8, pts = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2, radR = r * (0.95 + (i % 2) * 0.18);
    pts.push({ x: Math.cos(a) * radR, y: Math.sin(a) * radR * 0.55 - r * 0.4 });
  }
  const topY = pts.reduce((m, p) => Math.min(m, p.y), Infinity);
  const botY = pts.reduce((m, p) => Math.max(m, p.y), -Infinity);
  pathPoly(ctx, pts);
  const lg = ctx.createLinearGradient(0, topY, 0, botY);
  lg.addColorStop(0,    hexToRgba(0x120804, 1));
  lg.addColorStop(0.65, hexToRgba(0x251008, 1));
  lg.addColorStop(1,    hexToRgba(0x3d1808, 1));
  ctx.fillStyle = lg; ctx.fill();
  pathPoly(ctx, pts);
  ctx.strokeStyle = hexToRgba(0x100804, 0.9); ctx.lineWidth = 1.5; ctx.stroke();
  const c1G = ctx.createLinearGradient(-r * 0.5, -r * 0.7, r * 0.2, -r * 0.2);
  c1G.addColorStop(0, hexToRgba(0xff4400, 0));
  c1G.addColorStop(0.45, hexToRgba(0xff6600, 0.75));
  c1G.addColorStop(1, hexToRgba(0xff4400, 0));
  ctx.strokeStyle = c1G; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 0.7); ctx.lineTo(r * 0.2, -r * 0.2); ctx.stroke();
  ctx.strokeStyle = hexToRgba(0xff4400, 0.65); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(r * 0.1, -r * 0.5); ctx.lineTo(r * 0.6, -r * 0.1); ctx.stroke();
}

// Theme 3 — Celestial: smooth stone pillar
function _spireCelTrunk(ctx, r, hash) {
  const col = 0x1c1c3a;
  roundRectPath(ctx, -r * 0.75, -r * 2.4, r * 1.5, r * 3, r * 0.25);
  const cyl = ctx.createLinearGradient(-r * 0.75, 0, r * 0.75, 0);
  cyl.addColorStop(0,    hexToRgba(shade(col, 0.50), 1));
  cyl.addColorStop(0.28, hexToRgba(shade(col, 1.45), 1));
  cyl.addColorStop(0.60, hexToRgba(col, 1));
  cyl.addColorStop(1,    hexToRgba(shade(col, 0.38), 1));
  ctx.fillStyle = cyl; ctx.fill();
  ctx.save();
  roundRectPath(ctx, -r * 0.75, -r * 2.4, r * 1.5, r * 3, r * 0.25);
  ctx.clip();
  const sG = ctx.createLinearGradient(0, 0, r * 0.75, 0);
  sG.addColorStop(0, hexToRgba(0x0a0a20, 0));
  sG.addColorStop(1, hexToRgba(0x0a0a20, 0.48));
  ctx.fillStyle = sG; ctx.fillRect(-r, -r * 2.5, r * 2, r * 3.5);
  ctx.restore();
  roundRectPath(ctx, -r * 0.75, -r * 2.4, r * 1.5, r * 3, r * 0.25);
  ctx.strokeStyle = hexToRgba(0x05051a, 0.9); ctx.lineWidth = 1.5; ctx.stroke();
  const goldG = ctx.createLinearGradient(0, -r * 2.2, 0, -r * 0.3);
  goldG.addColorStop(0,   hexToRgba(0xffd700, 0));
  goldG.addColorStop(0.2, hexToRgba(0xffd700, 0.55));
  goldG.addColorStop(0.8, hexToRgba(0xffd700, 0.55));
  goldG.addColorStop(1,   hexToRgba(0xffd700, 0));
  ctx.strokeStyle = goldG; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(0, -r * 2.2); ctx.lineTo(0, -r * 0.3); ctx.stroke();
}

// Theme 4 — Chaos: fractured dark-purple rock
function _spireChaosTrunk(ctx, r, hash) {
  const segs = 7, pts = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2, rr = r * (0.85 + Math.sin(i * 1.7) * 0.3);
    pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr * 0.55 - r * 0.4 });
  }
  const topY = pts.reduce((m, p) => Math.min(m, p.y), Infinity);
  const botY = pts.reduce((m, p) => Math.max(m, p.y), -Infinity);
  pathPoly(ctx, pts);
  const lg = ctx.createLinearGradient(-r * 0.5, topY, r * 0.5, botY);
  lg.addColorStop(0,   hexToRgba(shade(0x2a0a30, 0.55), 1));
  lg.addColorStop(0.5, hexToRgba(0x2a0a30, 1));
  lg.addColorStop(1,   hexToRgba(shade(0x2a0a30, 0.80), 1));
  ctx.fillStyle = lg; ctx.fill();
  pathPoly(ctx, pts);
  ctx.strokeStyle = hexToRgba(0xff00ff, 0.55); ctx.lineWidth = 1.5; ctx.stroke();
  ctx.strokeStyle = hexToRgba(0xff00ff, 0.70); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 0.6); ctx.lineTo(r * 0.4, -r * 0.1); ctx.stroke();
}

// ── Canopy ────────────────────────────────────────────────────────────────

export function bakeSpireCanopyTexture(scene, key, themeIdx, r, hash) {
  const pad = 8;
  let cw, ch, ox, oy;
  if (themeIdx === 1) {
    // Crystal shards are tall — origin at bottom center (shard bases at y=0)
    cw = Math.ceil(r * 2.4 + pad * 2);
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
  } else {
    // Compact centered; Chaos needs extra margin for 360° rotation
    const margin = themeIdx === 4 ? r * 1.05 : r * 1.1;
    cw = Math.ceil(margin * 2 + pad * 2);
    ch = Math.ceil(margin * 2 + pad * 2);
    ox = Math.floor(cw / 2);
    oy = Math.floor(ch / 2);
  }

  if (scene.textures.exists(key)) return { key, originX: ox / cw, originY: oy / ch };
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
}

// Theme 2 — Volcanic: glowing ember cluster
function _spireVolCanopy(ctx, r, hash) {
  const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.95);
  bg.addColorStop(0, hexToRgba(0x8a2818, 1));
  bg.addColorStop(1, hexToRgba(0x4a1808, 1));
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.9, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const ex = Math.cos(a) * r * 0.55, ey = Math.sin(a) * r * 0.22 - r * 0.15;
    const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, r * 0.22);
    eg.addColorStop(0, hexToRgba(0xff6622, 0.65));
    eg.addColorStop(1, hexToRgba(0xff4400, 0));
    ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(ex, ey, r * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hexToRgba(0xffaa44, 0.95); ctx.beginPath(); ctx.arc(ex, ey, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hexToRgba(0xffee88, 0.90); ctx.beginPath(); ctx.arc(ex, ey, 1.2, 0, Math.PI * 2); ctx.fill();
  }
}

// Theme 3 — Celestial: dark starfield dome
function _spireCelCanopy(ctx, r, hash) {
  const domeG = ctx.createRadialGradient(0, -r * 0.05, 0, 0, 0, r * 0.9);
  domeG.addColorStop(0, hexToRgba(0x1a1850, 0.95));
  domeG.addColorStop(1, hexToRgba(0x0d0d2a, 0.98));
  ctx.fillStyle = domeG;
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.85, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 8; i++) {
    const ang = hash(300 + i) * Math.PI * 2, dist = hash(310 + i) * r * 0.6;
    const sx = Math.cos(ang) * dist, sy = Math.sin(ang) * dist * 0.4 - r * 0.1;
    const sz = 0.8 + hash(320 + i) * 1.5;
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sz * 2.8);
    sg.addColorStop(0, hexToRgba(0xffeebb, 0.70));
    sg.addColorStop(1, hexToRgba(0xffeebb, 0));
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, sz * 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hexToRgba(0xffffff, 0.95); ctx.beginPath(); ctx.arc(sx, sy, sz, 0, Math.PI * 2); ctx.fill();
  }
}

// Theme 4 — Chaos: 3 orbiting fragment triangles (rotation tween applied to image in Obstacle.js)
function _spireChaosCanopy(ctx, r, hash) {
  const fragments = [
    { ox: -r * 0.5, oy: -r * 0.2, size: 4, c: 0xff44ff },
    { ox:  r * 0.4, oy: -r * 0.4, size: 5, c: 0xff00ff },
    { ox:  0,       oy: -r * 0.7, size: 3, c: 0xee88ff },
  ];
  fragments.forEach(({ ox, oy, size, c }) => {
    const tri = [
      { x: ox,        y: oy - size },
      { x: ox + size, y: oy + size * 0.5 },
      { x: ox - size, y: oy + size * 0.5 },
    ];
    const fg = ctx.createLinearGradient(ox, oy - size, ox, oy + size * 0.5);
    fg.addColorStop(0, hexToRgba(shade(c, 1.35), 0.95));
    fg.addColorStop(1, hexToRgba(c, 0.85));
    pathPoly(ctx, tri); ctx.fillStyle = fg; ctx.fill();
    pathPoly(ctx, tri);
    ctx.strokeStyle = hexToRgba(0xffffff, 0.70); ctx.lineWidth = 0.8; ctx.stroke();
  });
}
