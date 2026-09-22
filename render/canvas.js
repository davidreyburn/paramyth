// L5: presentation. Reads everything, changes nothing.

import { roomTiles, COLS, ROWS, TILE, T } from '../core/gen.js';
import { UNITS, px } from '../sim/state.js';
import { P, TONES, HUD, LIGHT_BANDS, LIGHT_BEYOND, LIGHT_DOWNSCALE, FLICKER,
         LAMP_BACK, lampShape } from '../core/palette.js';
import { h } from '../core/addr.js';
import { tonedSheet, drawsFor, shadeTone, variantFor } from './tileset.js';
import { visible, prompt, containerItems, carriedBulk, tier,
         itemValue, assessed, readOut, marksFor, leadFor, placeLabel, atPlace, hitBox, APPRAISAL_FEE,
         PACK_COLS, PACK_ROWS, CONT_COLS, CONT_ROWS, STASH_COLS, STASH_ROWS,
         BULK_BUDGET, STASH_SLOTS } from '../sim/interact.js';
import { campStations } from '../core/camp.js';
import { FOE } from '../core/foes.js';
import { MAX_HP, swingPhase, saying, lampVec } from '../sim/state.js';
import { isContainer, labelOf, bulkOf, KIND } from '../core/items.js';

export const W = 640, H = 360, VIEW_H = 320;
// The HUD strip, and how much of it a line of 8px text needs. HUD_LINES is
// derived, never guessed, and drawHud asserts against it.
const HUD_TOP = 4, HUD_LINE = 9;
export const HUD_LINES = Math.floor((H - VIEW_H - HUD_TOP) / HUD_LINE);
const TAU = Math.PI * 2;

const NAME = Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k]));

// Flat-colour fallback, used when no pack is loaded. The game must run without
// assets — that is what makes the pack swappable rather than required.
const FLAT = {
  FLOOR:[P.umbra, P.pitch], WALL:[P.stoneMid, P.stoneShadow], RUBBLE:[P.stoneShadow, P.umbra],
  SARC:[P.stone, P.stoneMid], NICHE:[P.void, P.pitch], PILLAR:[P.stone, P.stoneMid],
  STAIR_D:[P.pitch, P.void], STAIR_U:[P.stone, P.bone],
};

export function createRenderer(canvas, pack = null) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;

  // Light renders at 1/4 and upscales with nearest neighbour, so light shares
  // the pixel grid with everything else instead of floating above it.
  const LW = (W / LIGHT_DOWNSCALE) | 0, LH = (VIEW_H / LIGHT_DOWNSCALE) | 0;
  const mk = () => { const c = document.createElement('canvas'); c.width = LW; c.height = LH; return c; };
  const warmBuf = mk(), darkBuf = mk();
  const wx = warmBuf.getContext('2d'), dx = darkBuf.getContext('2d');

  let scale = 1;
  function resize() {
    scale = Math.max(1, Math.floor(Math.min(window.innerWidth / W, window.innerHeight / H)));
    canvas.style.width = W * scale + 'px';
    canvas.style.height = H * scale + 'px';
  }
  window.addEventListener('resize', resize);
  resize();

  // Per-pixel, so every band edge is exact. Canvas arcs anti-alias and would
  // put a soft ramp back into a design whose rule is that there is no gradient.
  const warmImg = wx.createImageData(LW, LH), darkImg = dx.createImageData(LW, LH);
  const BR2 = LIGHT_BANDS.map((b) => b.r * b.r);

  function drawLight(s) {
    // Flicker keyed to the tick, never to a clock: replay must reproduce the
    // exact frame, and a wall-clock flame would have broken that silently.
    const chunk = (s.tick / (60 / FLICKER.hz)) | 0;
    const pulse = 1 + ((h(chunk, 0x11) % 201) / 100 - 1) * FLICKER.pulse;

    const cx = px(s.x) / LIGHT_DOWNSCALE, cy = px(s.y) / LIGHT_DOWNSCALE;
    const R = Math.max(1, (px(s.lamp) / LIGHT_DOWNSCALE) * pulse), R2 = R * R;
    const wd = warmImg.data, dd = darkImg.data;
    const n = LIGHT_BANDS.length, last = n - 1;
    // Where the lamp is pointing THIS tick — eased in the delta, not here, so
    // two draws of one state are identical and replay reproduces the frame.
    const [fx, fy] = lampVec(s.lampDir);

    for (let y = 0; y < LH; y++) {
      const ddy = y + 0.5 - cy, dy2 = ddy * ddy;
      for (let x = 0; x < LW; x++) {
        const ddx = x + 0.5 - cx;
        const d2 = ddx * ddx + dy2;
        // The egg. One sqrt per light-buffer pixel, and the buffer is quarter
        // scale in both axes, so this is 1/16th of the pixels on the screen.
        const dist = Math.sqrt(d2);
        const sh = dist > 1e-6 ? lampShape((ddx * fx + ddy * fy) / dist) : 1;
        const t2 = d2 / (R2 * sh * sh);
        const i = (y * LW + x) << 2;

        // Per-pixel jitter on the outer boundary only, so the lamp's limit
        // gutters and crumbles instead of the whole disc throbbing.
        let r = (x * 73856093) ^ (y * 19349663) ^ (chunk * 83492791);
        r = Math.imul(r ^ (r >>> 13), 1274126177) >>> 0;
        const edge = 1 + (((r >>> 16) % 201) / 100 - 1) * FLICKER.edge;

        let b = -1;
        for (let k = 0; k < n; k++) {
          const lim = k === last ? BR2[k] * edge * edge : BR2[k];
          if (t2 <= lim) { b = k; break; }
        }

        if (b < 0) {
          wd[i+3] = 0;
          dd[i] = 0; dd[i+1] = 0; dd[i+2] = 0; dd[i+3] = (LIGHT_BEYOND * 255) | 0;
        } else {
          const band = LIGHT_BANDS[b], w = band.warm;
          wd[i] = w[0]; wd[i+1] = w[1]; wd[i+2] = w[2]; wd[i+3] = (w[3] * 255) | 0;
          dd[i] = 0; dd[i+1] = 0; dd[i+2] = 0; dd[i+3] = (band.dark * 255) | 0;
        }
      }
    }
    wx.putImageData(warmImg, 0, 0);
    dx.putImageData(darkImg, 0, 0);

    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(warmBuf, 0, 0, LW, LH, 0, 0, W, VIEW_H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(darkBuf, 0, 0, LW, LH, 0, 0, W, VIEW_H);
  }

  function drawRoom(grid, era) {
    const tone = TONES[era.name] || TONES['Recent'];
    const at = (tx, ty) =>
      tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS ? -1 : grid[ty*COLS + tx];

    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        const t = grid[ty*COLS + tx];
        const name = NAME[t] || 'FLOOR';

        if (pack) {
          const same = (nx, ny) => { const o = at(nx, ny); return o === -1 || o === t; };
          const draws = drawsFor(pack, name, tx, ty, [
            same(tx, ty-1), same(tx+1, ty), same(tx, ty+1), same(tx-1, ty),
            same(tx-1, ty-1), same(tx+1, ty-1), same(tx+1, ty+1), same(tx-1, ty+1)]);
          if (draws) {
            let drew = false;
            for (const [sheetName, gx, gy, shade] of draws) {
              const sheet = tonedSheet(pack, sheetName, shadeTone(tone, shade));
              if (!sheet) continue;
              ctx.drawImage(sheet, gx*pack.tile, gy*pack.tile, pack.tile, pack.tile,
                            tx*TILE, ty*TILE, TILE, TILE);
              drew = true;
            }
            if (drew) continue;
          }
        }

        const f = FLAT[name] || FLAT.FLOOR;
        ctx.fillStyle = f[(tx + ty) & 1];
        ctx.fillRect(tx*TILE, ty*TILE, TILE, TILE);
      }
    }
  }

  function drawItems(s, tone) {
    for (const c of visible(s)) {
      const tx = c.tile % COLS, ty = (c.tile / COLS) | 0;
      const def = pack && pack.items && pack.items[c.kind];
      if (def) {
        const cells = (c.open && def.opened) ? def.opened : def.cells;
        const [sh, gx, gy] = variantFor(cells, tx, ty);
        const sheet = tonedSheet(pack, sh, shadeTone(tone, def.shade === undefined ? 1 : def.shade));
        if (sheet) {
          ctx.drawImage(sheet, gx*pack.tile, gy*pack.tile, pack.tile, pack.tile,
                        tx*TILE, ty*TILE, TILE, TILE);
          continue;
        }
      }
      ctx.fillStyle = isContainer(c.kind) ? P.stone : P.parchment;
      ctx.fillRect(tx*TILE + 6, ty*TILE + 6, TILE - 12, TILE - 12);
    }
  }

  // One line, bottom centre, over the light because it is interface. The verb
  // is the whole interaction: one button, one thing it does.
  function drawToast(p) {
    if (!p) return;
    ctx.font = '8px ui-monospace, monospace';
    const w = Math.ceil(ctx.measureText(p.text).width) + 18;
    const x = Math.round((W - w) / 2), y = VIEW_H - 28;
    ctx.fillStyle = 'rgba(8,7,6,0.93)';
    ctx.fillRect(x, y, w, 16);
    ctx.strokeStyle = p.refuse ? '#9a5140' : '#4a443c';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 15);
    ctx.fillStyle = p.refuse ? '#c2836b' : P.parchment;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.text, W / 2, y + 8.5);
    ctx.textAlign = 'start'; ctx.textBaseline = 'top';
  }

  // Pixel grids: one square per item, its own tile drawn on a plate. The whole
  // screen is a cursor, one button to take, one to take everything.
  const CELL = 24, ICON = 20, PLATE = 22, TITLE = 12, PAD = 8;

  function drawCell(x, y, ref, idx, tone, selected) {
    const kind = ref && (ref.kind || ref);
    ctx.fillStyle = selected ? '#2e2921' : '#191714';
    ctx.fillRect(x, y, PLATE, PLATE);
    ctx.strokeStyle = selected ? P.lantern : '#332d26';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, PLATE - 1, PLATE - 1);
    if (!kind) return;
    const def = pack && pack.items && pack.items[kind];
    if (def) {
      const [sh, gx, gy] = variantFor(def.cells, idx, 0);
      const sheet = tonedSheet(pack, sh, tone);
      if (sheet) {
        ctx.drawImage(sheet, gx*pack.tile, gy*pack.tile, pack.tile, pack.tile,
                      x + ((PLATE - ICON) >> 1), y + ((PLATE - ICON) >> 1), ICON, ICON);
        return;
      }
    }
    ctx.fillStyle = P.parchment;
    ctx.fillRect(x + 7, y + 7, PLATE - 14, PLATE - 14);
  }

  function drawPanel(x, y, cols, rows, title, items, tone, activeIdx) {
    const w = cols * CELL + PAD * 2, hgt = rows * CELL + PAD * 2 + TITLE;
    ctx.fillStyle = 'rgba(12,11,9,0.97)';
    ctx.fillRect(x, y, w, hgt);
    ctx.strokeStyle = '#3d372f'; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, hgt - 1);
    ctx.font = '8px ui-monospace, monospace';
    ctx.textBaseline = 'top'; ctx.textAlign = 'start';
    ctx.fillStyle = '#9d9284';
    ctx.fillText(title, x + PAD, y + 4);
    for (let i = 0; i < cols * rows; i++) {
      const cx = x + PAD + (i % cols) * CELL, cy = y + PAD + TITLE + ((i / cols) | 0) * CELL;
      drawCell(cx, cy, items[i], i, tone, i === activeIdx);
    }
    return { w, h: hgt };
  }

  function drawScreen(s, tone) {
    if (!s.screen) return;
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(0, 0, W, VIEW_H);

    const isStash = s.screen === 'stash';
    const isAppraiser = s.screen === 'appraiser';
    const two = s.screen === 'container' || isStash;
    // References, not bare kinds: the panel needs the kind to draw and the key
    // to read a history off, and dropping the key here is what kept a
    // container's contents from ever showing their own provenance.
    const cont = s.screen === 'container' ? containerItems(s, s.screenKey)
               : isStash ? s.stash : [];
    const lCols = isStash ? STASH_COLS : CONT_COLS;
    const lRows = isStash ? STASH_ROWS : CONT_ROWS;
    const contW = lCols * CELL + PAD * 2;
    const packW = PACK_COLS * CELL + PAD * 2;
    const total = two ? contW + 12 + packW : packW;
    const x0 = Math.round((W - total) / 2);
    const y0 = 96;

    if (two) {
      const title = isStash
        ? `STASH \u00b7 ${cont.length}/${STASH_SLOTS}`
        : (cont.length ? `CONTAINER \u00b7 ${cont.length} left` : 'CONTAINER \u00b7 empty');
      drawPanel(x0, y0, lCols, lRows, title, cont, tone, s.side === 0 ? s.cur : -1);
    }
    const px = two ? x0 + contW + 12 : x0;
    const bulk = carriedBulk(s);
    drawPanel(px, y0, PACK_COLS, PACK_ROWS,
      isAppraiser ? `APPRAISER \u00b7 you have ${s.scrap} scrap`
                  : `PACK \u00b7 ${bulk}/${BULK_BUDGET} ${tier(bulk).toUpperCase()}`,
      s.carried, tone, s.side === 1 ? s.cur : -1);

    ctx.font = '8px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#6b6357';
    const hint = isStash     ? 'A move   \u00b7   Y move all   \u00b7   Esc / B close'
               : isAppraiser  ? `A appraise (${APPRAISAL_FEE} scrap)   \u00b7   Esc / B close`
               : two          ? (s.side === 0 ? 'A take   \u00b7   Y take all   \u00b7   Esc / B close'
                                              : 'A put down   \u00b7   Y put all down   \u00b7   Esc / B close')
                              : 'A put down   \u00b7   Y put all down   \u00b7   G drop everything   \u00b7   Esc close';
    ctx.fillText(hint, W / 2, y0 + PACK_ROWS * CELL + PAD * 2 + TITLE + 10);

    // What the cursor is on: its name, its weight, its price, and as much of
    // its history as this character can actually read.
    const under = s.side === 0 ? cont[s.cur] : s.carried[s.cur];
    if (under && under.kind) {
      const val = itemValue(s, under);
      const know = assessed(s, under.key);
      ctx.fillStyle = P.parchment;
      ctx.fillText(`${labelOf(under.kind)}  \u00b7  bulk ${bulkOf(under.kind)}  \u00b7  ${val} scrap${know ? '' : ' (base)'}`,
                   W / 2, y0 - 26);
      ctx.fillStyle = know ? '#9aa87e' : '#7d7060';
      ctx.fillText(readOut(s, under.key), W / 2, y0 - 15);

      // The lead. A mark you can read names a person, that person lies
      // somewhere, and the somewhere is a room you can walk to.
      const lead = leadFor(s, under.key);
      if (lead) {
        const there = atPlace(s, lead.place);
        ctx.fillStyle = there ? P.lantern : '#b09a63';
        ctx.fillText(`\u2192 ${lead.actor.name} ${lead.actor.house} \u00b7 ${lead.act} \u00b7 ${there ? 'HERE' : placeLabel(lead.place)}`,
                     W / 2, y0 - 4);
      }
    }
    ctx.textAlign = 'start';
  }

  function drawStations(s, tone) {
    if (s.floor >= 0 || !pack || !pack.stations) return;
    for (const st of campStations()) {
      const def = pack.stations[st.kind];
      if (!def) continue;
      const tx = st.tile % COLS, ty = (st.tile / COLS) | 0;
      const [sh, gx, gy] = variantFor(def.cells, tx, ty);
      const sheet = tonedSheet(pack, sh, tone);
      if (sheet) ctx.drawImage(sheet, gx*pack.tile, gy*pack.tile, pack.tile, pack.tile,
                               tx*TILE, ty*TILE, TILE, TILE);
    }
  }

  // Enemies, drawn the way the player is: a glyph with a hard shadow, so they
  // read against the floor at any stratum tone without an animation system and
  // without another sheet of unlicensed art.
  function drawFoes(s) {
    for (const f of s.foes) {
      const def = FOE[f.kind];
      const art = pack && pack.foes && pack.foes[f.kind];
      const g = (art && art.glyph) || (def && def.glyph) || '?';
      const x = Math.round(px(f.x)), y = Math.round(px(f.y));
      ctx.font = 'bold 15px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = P.void; ctx.fillText(g, x + 1, y + 1);
      // A sleeping dog is dim. Waking it is a thing that visibly happens.
      ctx.fillStyle = f.awake ? '#c2836b' : '#6b6357';
      ctx.fillText(g, x, y);
      ctx.textAlign = 'start';
    }
  }

  // The swing. Only the ACTIVE frames draw, so what you see on the screen is
  // exactly the window in which the hitbox is live — no tell that lies.
  function drawSwing(s) {
    if (swingPhase(s) !== 'active') return;
    const b = hitBox(s);
    const x0 = px(b.x0), y0 = px(b.y0);
    ctx.fillStyle = 'rgba(232,215,170,0.30)';
    ctx.fillRect(Math.round(x0), Math.round(y0), Math.round(px(b.x1) - x0), Math.round(px(b.y1) - y0));
    ctx.strokeStyle = P.parchment; ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5,
                   Math.round(px(b.x1) - x0) - 1, Math.round(px(b.y1) - y0) - 1);
  }

  // Health, as pips in the corner of the view. It stays out of the HUD strip,
  // which holds four lines and is full.
  function drawHealth(s) {
    const W_ = 4, H_ = 7, GAP = 2;
    for (let i = 0; i < MAX_HP; i++) {
      const x = 6 + i * (W_ + GAP), y = 6;
      ctx.fillStyle = i < s.hp ? '#c2836b' : '#2a2622';
      ctx.fillRect(x, y, W_, H_);
    }
  }

  function drawPlayer(s) {
    const x = Math.round(px(s.x)), y = Math.round(px(s.y));
    const pl = pack && pack.player;

    if (!pl || pl.glyph) {
      const g = (pl && pl.glyph) || '@';
      ctx.font = 'bold 15px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = P.void;      ctx.fillText(g, x + 1, y + 1);
      ctx.fillStyle = P.parchment; ctx.fillText(g, x, y);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'top';
      return;
    }

    const spr = pack.sheets[pl.sheet];
    if (!spr) return;
    const frame = s.moving ? pl.walk[(s.tick >> 3) % pl.walk.length] : pl.idle;
    const sheet = tonedSheet(pack, pl.sheet, { light: P.parchment, dark: '#3a2f24' }) || spr;
    const flip = pl.flipWhenFacingLeft && s.facing === 3;
    ctx.save();
    if (flip) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
    ctx.drawImage(sheet, frame*pl.w, 0, pl.w, pl.h, x - (pl.w>>1), y - pl.h + 6, pl.w, pl.h);
    ctx.restore();
  }

  function drawHud(lines) {
    // The strip is 40px and a line is 9. Five lines fitted in the array and
    // four fitted on the screen, so the fifth drew below the canvas and was
    // invisible — the bottom-edge gate never saw it because it was not clipped,
    // it was gone. Bound the two constants together so that cannot recur.
    if (lines.length > HUD_LINES)
      throw new Error(`${lines.length} HUD lines, ${HUD_LINES} fit in ${H - VIEW_H}px`);
    ctx.fillStyle = HUD.bg; ctx.fillRect(0, VIEW_H, W, H - VIEW_H);
    ctx.fillStyle = HUD.rule; ctx.fillRect(0, VIEW_H, W, 1);
    ctx.font = '8px ui-monospace, monospace';
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => {
      ctx.fillStyle = l.color || HUD.dim;
      ctx.fillText(l.text, 6, VIEW_H + HUD_TOP + i * HUD_LINE);
    });
  }

  return {
    get scale() { return scale; },
    get pack() { return pack; },
    // For gates: the light buffers, so band count can be measured on the light
    // and not on the composite, where tile brightness confounds it.
    get lightBuffers() { return { warm: warmBuf, dark: darkBuf, w: LW, h: LH }; },
    draw(state, hud) {
      const world = roomTiles(state.seed, state.site, state.floor, state.room);
      const tone = TONES[world.era.name] || TONES['Recent'];
      ctx.fillStyle = P.void; ctx.fillRect(0, 0, W, H);
      drawRoom(world.grid, world.era);
      drawStations(state, tone);
      drawItems(state, tone);
      drawFoes(state);
      drawSwing(state);
      drawPlayer(state);
      drawLight(state);
      // Over the light, because it is interface: a health bar you cannot read in
      // the dark is a health bar that tells you nothing at the moment it matters.
      if (state.floor >= 0) drawHealth(state);
      // What the world just said outranks what you are standing next to: a
      // refusal you asked for is more urgent than a verb you did not.
      if (state.screen) drawScreen(state, tone);
      else drawToast(saying(state) ? { text: saying(state).text, refuse: true } : prompt(state));
      drawHud(hud);
      return world;
    },
  };
}
