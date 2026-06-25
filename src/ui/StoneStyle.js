// Stone slab UI — shared texture generators.
// Canvas-baked gradient textures (Phaser Graphics can't gradient-fill rounded shapes).
// A texture-backed `scene.add.image(key)` is a single sprite draw → satisfies the
// "bake static visuals" performance rule by construction.

export const S = {
  // Warm-neutral stone grays (desaturated, slightly warm) — reads as rock, not steel.
  BEVEL_DARK:   0x302f2c,   // bottom-right shadow edge
  BEVEL_MID:    0x5e5c56,   // main bevel face
  BEVEL_LIGHT:  0x908d84,   // top-left catch light
  BEVEL_HI:     0xa9a59a,   // brightest catch-light (muted, matte)
  FACE:         0x47453f,   // inner panel surface
  FACE_HI:      0x524f48,   // lit top of inner face (gradient)
  FACE_LO:      0x393732,   // shadowed bottom of inner face (gradient)
  CRACK:        0x232119,   // crack channel / dark recess lip
  BOLT_SHINE:   0xb0aec8,   // bright accent (used by the StartScene glow ring)
  TEXT:         '#e0e0f0',
  TEXT_SHADOW:  '#111120',
};

// ── Typography ───────────────────────────────────────────────────────────────
export const FONT = "'Lilita One', sans-serif";        // primary display/UI font
export const FONT_SYMBOL = "'Nunito', sans-serif";     // fallback for ⛶/⏸ glyphs Lilita One lacks
export const LETTER_SPACING = 1.5;                     // universal letter tracking

// ── Canvas color helper ──────────────────────────────────────────────────────
function css(int, a = 1) {
  const r = (int >> 16) & 0xff, g = (int >> 8) & 0xff, b = int & 0xff;
  return `rgba(${r},${g},${b},${a})`;
}

// Trace the outer silhouette path (rounded rect, chamfered octagon, or circle) — no fill/stroke.
function traceSlab(ctx, x, y, w, h, shape, r, c) {
  ctx.beginPath();
  if (shape === 'circle') {
    const R = Math.min(w, h) / 2;
    ctx.arc(x + w / 2, y + h / 2, R, 0, Math.PI * 2);
    ctx.closePath();
  } else if (shape === 'chamfered') {
    ctx.moveTo(x + c,     y);
    ctx.lineTo(x + w - c, y);
    ctx.lineTo(x + w,     y + c);
    ctx.lineTo(x + w,     y + h - c);
    ctx.lineTo(x + w - c, y + h);
    ctx.lineTo(x + c,     y + h);
    ctx.lineTo(x,         y + h - c);
    ctx.lineTo(x,         y + c);
    ctx.closePath();
  } else {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y,     x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x,     y + h, rr);
    ctx.arcTo(x,     y + h, x,     y,     rr);
    ctx.arcTo(x,     y,     x + w, y,     rr);
    ctx.closePath();
  }
}

// Small deterministic PRNG (mulberry32-ish) so each seed gives a stable, unique layout.
function rng(seed) {
  let s = (seed + 1) * 0x6d2b79f5 >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Subtle mottled stone texture: soft blotches + faint sediment striations.
function addStoneMottle(ctx, x, y, w, h, seed) {
  const rnd = rng(seed * 31 + 11);
  const n = Math.round((w * h) / 2400);
  for (let i = 0; i < n; i++) {
    const bx = x + rnd() * w, by = y + rnd() * h;
    const rr = 5 + rnd() * 16;
    const col = rnd() > 0.5 ? S.FACE_LO : S.FACE_HI;
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, rr);
    g.addColorStop(0, css(col, 0.16));
    g.addColorStop(1, css(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(bx, by, rr, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = css(S.FACE_LO, 0.08);
  ctx.lineWidth = 1;
  for (let yy = y + 6; yy < y + h - 2; yy += 6 + Math.floor(rnd() * 7)) {
    const jit = (rnd() - 0.5) * 2;
    ctx.beginPath(); ctx.moveTo(x, yy + jit); ctx.lineTo(x + w, yy - jit); ctx.stroke();
  }
}

// Returns a Phaser text style object for stone-etched text.
export function stoneTextStyle(size, color = S.TEXT) {
  return {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color,
    stroke: S.TEXT_SHADOW,
    strokeThickness: Math.max(2, Math.round(size / 8)),
    letterSpacing: LETTER_SPACING,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas-baked stone textures — true gradient shading. Light source is top-left.
// Returns the texture key; no-op if the key already exists, so callers can share
// textures across identical elements.
// ─────────────────────────────────────────────────────────────────────────────

const PAD = 16; // canvas padding around the slab for the baked drop shadow

// Build (or reuse) a stone slab texture and return its key.
// shape: 'rounded' | 'chamfered' | 'circle'. accentRing (color int) strokes a vivid ring
// just inside the face edge (used by the skill slots).
export function makeStoneTexture(scene, key, {
  w, h, shape = 'rounded', radius = 12, chamfer = 22, bevel = 6, seed = 0,
  accentRing = null,
} = {}) {
  if (scene.textures.exists(key)) return key;

  const cw = w + PAD * 2, ch = h + PAD * 2;
  const tex = scene.textures.createCanvas(key, cw, ch);
  const ctx = tex.getContext();
  const x = PAD, y = PAD;
  const r = radius, c = chamfer;

  // 1. Soft baked drop shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 9;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 5;
  traceSlab(ctx, x, y, w, h, shape, r, c);
  ctx.fillStyle = css(S.BEVEL_DARK, 1);
  ctx.fill();
  ctx.restore();

  // 2. Outer rim base
  traceSlab(ctx, x, y, w, h, shape, r, c);
  ctx.fillStyle = css(S.BEVEL_DARK, 1);
  ctx.fill();

  // 3. Bevel face — top→bottom gradient, then left→right light modulation (clipped)
  ctx.save();
  traceSlab(ctx, x + 1, y + 1, w - 2, h - 2, shape, Math.max(r - 1, 2), Math.max(c - 1, 2));
  ctx.clip();
  // Matte stone bevel: lower-contrast gradient (no bright chrome highlight)
  const bevGrad = ctx.createLinearGradient(0, y, 0, y + h);
  bevGrad.addColorStop(0, css(S.BEVEL_LIGHT, 1));
  bevGrad.addColorStop(0.5, css(S.BEVEL_MID, 1));
  bevGrad.addColorStop(1, css(S.BEVEL_DARK, 1));
  ctx.fillStyle = bevGrad;
  ctx.fillRect(x, y, w, h);
  // Gentle directional light (soft, not a metal sheen)
  const lr = ctx.createLinearGradient(x, 0, x + w, 0);
  lr.addColorStop(0, 'rgba(255,255,255,0.05)');
  lr.addColorStop(0.5, 'rgba(255,255,255,0)');
  lr.addColorStop(1, 'rgba(0,0,0,0.10)');
  ctx.fillStyle = lr;
  ctx.fillRect(x, y, w, h);
  // Mottle the rim so it reads as rough rock
  addStoneMottle(ctx, x, y, w, h, seed + 99);
  ctx.restore();

  // 4. Inner recessed face — top-lit gradient + top/left ambient occlusion
  const fi = bevel;
  const fr = Math.max(r - bevel * 0.6, 3);
  const fc = Math.max(c - bevel, 6);
  const fx = x + fi, fy = y + fi, fw = w - fi * 2, fh = h - fi * 2;
  ctx.save();
  traceSlab(ctx, fx, fy, fw, fh, shape, fr, fc);
  ctx.clip();
  if (shape === 'circle') {
    // Flat recessed face inside a prominent raised rim. The rim casts a soft shadow onto
    // the top-left inner edge; the lower-right inner edge catches the top-left light. The
    // shading is confined to the rim band so the interior surface reads FLAT (not a bowl).
    const cxF = fx + fw / 2, cyF = fy + fh / 2, Rf = Math.min(fw, fh) / 2;
    // Flat stone base
    ctx.fillStyle = css(S.FACE, 1); ctx.fillRect(fx, fy, fw, fh);
    // Soft ambient occlusion hugging the upper-left inner rim only — a wide, feathered
    // full-circle stroke whose gradient is dark at the top-left and clears through the
    // sides to nothing on the lit lower-right. No fill across the face → stays flat.
    const aoGrad = ctx.createLinearGradient(cxF - Rf, cyF - Rf, cxF + Rf, cyF + Rf);
    aoGrad.addColorStop(0.0, 'rgba(0,0,0,0.55)');  // shadow on the upper-left inner rim
    aoGrad.addColorStop(0.5, 'rgba(0,0,0,0)');
    aoGrad.addColorStop(1.0, 'rgba(0,0,0,0)');     // lower-right stays clear
    ctx.strokeStyle = aoGrad; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(cxF, cyF, Rf - 4, 0, Math.PI * 2); ctx.stroke();
    // Soft sheen feathering inward from the lit lower-right rim (wide, low-alpha glow).
    const sheenGrad = ctx.createLinearGradient(cxF - Rf, cyF - Rf, cxF + Rf, cyF + Rf);
    sheenGrad.addColorStop(0.0, css(S.BEVEL_HI, 0));
    sheenGrad.addColorStop(0.5, css(S.BEVEL_HI, 0));
    sheenGrad.addColorStop(1.0, css(S.BEVEL_HI, 0.50));  // lower-right sheen
    ctx.strokeStyle = sheenGrad; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(cxF, cyF, Rf - 4.5, 0, Math.PI * 2); ctx.stroke();
    // Crisp carved lip — full-circle gradient stroke: faint dark on the upper-left rim,
    // bright catch on the lower-right rim, fading through the sides (no arc endpoints).
    const lipGrad = ctx.createLinearGradient(cxF - Rf, cyF - Rf, cxF + Rf, cyF + Rf);
    lipGrad.addColorStop(0.0, css(S.CRACK, 0.45));
    lipGrad.addColorStop(0.5, css(S.BEVEL_HI, 0));
    lipGrad.addColorStop(1.0, css(S.BEVEL_HI, 1));  // brighter catch sheen
    ctx.strokeStyle = lipGrad; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cxF, cyF, Rf - 1.5, 0, Math.PI * 2); ctx.stroke();
  } else {
    const faceGrad = ctx.createLinearGradient(0, fy, 0, fy + fh);
    faceGrad.addColorStop(0, css(S.FACE_LO, 1));     // recessed lip shadow at very top
    faceGrad.addColorStop(0.18, css(S.FACE_HI, 1));  // lit upper face
    faceGrad.addColorStop(1, css(S.FACE_LO, 1));     // shadowed bottom
    ctx.fillStyle = faceGrad;
    ctx.fillRect(fx, fy, fw, fh);
    // Ambient occlusion along top + left inner edges
    const aoT = ctx.createLinearGradient(0, fy, 0, fy + 12);
    aoT.addColorStop(0, 'rgba(0,0,0,0.35)');
    aoT.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = aoT; ctx.fillRect(fx, fy, fw, 12);
    const aoL = ctx.createLinearGradient(fx, 0, fx + 12, 0);
    aoL.addColorStop(0, 'rgba(0,0,0,0.28)');
    aoL.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = aoL; ctx.fillRect(fx, fy, 12, fh);
    // Bottom + right inner walls face the top-left light → bright catch that reads as a
    // sharp drop from the recessed flat face down to the raised rim (depth cue).
    // Tight falloff + a crisp bright lip + a thin shadow line above it = a sharp carved edge.
    const hiB = ctx.createLinearGradient(0, fy + fh - 8, 0, fy + fh);
    hiB.addColorStop(0, css(S.BEVEL_HI, 0));
    hiB.addColorStop(1, css(S.BEVEL_HI, 0.34));
    ctx.fillStyle = hiB; ctx.fillRect(fx, fy + fh - 8, fw, 8);
    const hiR = ctx.createLinearGradient(fx + fw - 7, 0, fx + fw, 0);
    hiR.addColorStop(0, css(S.BEVEL_HI, 0));
    hiR.addColorStop(1, css(S.BEVEL_HI, 0.26));
    ctx.fillStyle = hiR; ctx.fillRect(fx + fw - 7, fy, 7, fh);
    // Crisp lit lips
    ctx.fillStyle = css(S.BEVEL_HI, 0.85);
    ctx.fillRect(fx, fy + fh - 2, fw, 2);
    ctx.fillRect(fx + fw - 2, fy, 2, fh);
    // Thin shadow just inside each lip → defines the sharp edge
    ctx.fillStyle = css(S.CRACK, 0.32);
    ctx.fillRect(fx, fy + fh - 3, fw, 1);
    ctx.fillRect(fx + fw - 3, fy, 1, fh);
  }
  // Rough stone texture on the face
  addStoneMottle(ctx, fx, fy, fw, fh, seed);
  ctx.restore();

  // Groove between rim and face — dark line + lit edge just outside (engraved)
  traceSlab(ctx, fx, fy, fw, fh, shape, fr, fc);
  ctx.strokeStyle = css(S.CRACK, 0.7); ctx.lineWidth = 1; ctx.stroke();
  traceSlab(ctx, fx - 1, fy - 1, fw + 2, fh + 2, shape, fr + 1, fc + 1);
  ctx.strokeStyle = css(S.BEVEL_HI, 0.22); ctx.lineWidth = 1; ctx.stroke();

  // Accent ring — per-slot "gem glow" stroked just inside the face edge (stays vivid)
  if (accentRing !== null) {
    traceSlab(ctx, fx + 2, fy + 2, fw - 4, fh - 4, shape, Math.max(fr - 2, 2), Math.max(fc - 2, 4));
    ctx.strokeStyle = css(accentRing, 0.8); ctx.lineWidth = 2.5; ctx.stroke();
  }

  tex.refresh();
  return key;
}

// NineSlice-ready stone rim frame. Reuses the SAME bevel recipe as makeStoneTexture's
// buttons/slabs — trace the whole rounded silhouette and lay down one continuous
// top→bottom bevel gradient (BEVEL_LIGHT→MID→DARK over a BEVEL_DARK base) so the corners
// read as a single chiselled rim with no seams — then punch a transparent rectangular hole
// for the center. The hole's top starts at `header` (instead of `rim`) so the top of the
// rim is a tall band that holds the panel title. Light source is top-left.
// Outer corners are rounded (radius `rim`) so they land inside the NineSlice corner regions;
// the inner hole is square so it doesn't distort when the center stretches.
// Pass the same `rim`/`header` to scene.add.nineslice().
export function makeStoneFrameTexture(scene, key, { rim = 10, header = 28 } = {}) {
  if (scene.textures.exists(key)) return key;
  const stretch = 8;                       // minimum center region for the NineSlice
  const w = rim * 2 + stretch;
  const h = header + rim + stretch;
  const r = rim;                           // outer corner radius
  const tex = scene.textures.createCanvas(key, w, h);
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);

  // Outer rim base (1px BEVEL_DARK edge shows under the bevel) — same as makeStoneTexture.
  traceSlab(ctx, 0, 0, w, h, 'rounded', r, 0);
  ctx.fillStyle = css(S.BEVEL_DARK, 1);
  ctx.fill();

  // One continuous bevel gradient over the whole shape (identical stops to the buttons).
  ctx.save();
  traceSlab(ctx, 1, 1, w - 2, h - 2, 'rounded', Math.max(r - 1, 2), 0);
  ctx.clip();
  const bevGrad = ctx.createLinearGradient(0, 0, 0, h);
  bevGrad.addColorStop(0, css(S.BEVEL_LIGHT, 1));
  bevGrad.addColorStop(0.5, css(S.BEVEL_MID, 1));
  bevGrad.addColorStop(1, css(S.BEVEL_DARK, 1));
  ctx.fillStyle = bevGrad;
  ctx.fillRect(0, 0, w, h);
  // Gentle top-left directional light, matching the buttons.
  const lr = ctx.createLinearGradient(0, 0, w, 0);
  lr.addColorStop(0, 'rgba(255,255,255,0.05)');
  lr.addColorStop(0.5, 'rgba(255,255,255,0)');
  lr.addColorStop(1, 'rgba(0,0,0,0.10)');
  ctx.fillStyle = lr;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // Punch the transparent center hole (square so it stretches cleanly).
  const hx = rim, hy = header, hw = w - rim * 2, hh = h - header - rim;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillRect(hx, hy, hw, hh);
  ctx.restore();

  // Carve the hole edge with the buttons' depth cue (top-left light): dark recess lip on the
  // top + left inner edges, bright catch on the bottom + right inner edges. Each line sits
  // just inside the rim (not in the transparent center) and is uniform along its axis so the
  // NineSlice edge regions keep it crisp when stretched.
  ctx.fillStyle = css(S.CRACK, 0.7);
  ctx.fillRect(0, hy - 1, w, 1);            // top inner lip (bottom of header band)
  ctx.fillRect(hx - 1, hy, 1, hh);          // left inner lip
  ctx.fillStyle = css(S.BEVEL_HI, 0.5);
  ctx.fillRect(hx + hw, hy, 1, hh);         // right inner lip (faces the light)
  ctx.fillRect(0, hy + hh, w, 1);           // bottom inner lip (faces the light)

  tex.refresh();
  return key;
}
