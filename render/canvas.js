// L5: presentation. Reads everything, changes nothing.

import { roomTiles, COLS, ROWS, TILE, T } from '../core/gen.js';
import { UNITS, px } from '../sim/state.js';
import { P, TONES, HUD, LIGHT_BANDS, LIGHT_BEYOND, LIGHT_DOWNSCALE, FLICKER,
         LAMP_BACK, lampShape, SURFACE_LIFT } from '../core/palette.js';
import { h } from '../core/addr.js';
import { tonedSheet, drawsFor, shadeTone, variantFor, glazeFor } from './tileset.js';
import { visible, containerItems, roomView } from '../sim/room.js';
import { prompt } from '../sim/prompt.js';
import { carriedBulk, tier, hitBox, PACK_COLS, PACK_ROWS, CONT_COLS, CONT_ROWS, STASH_COLS, STASH_ROWS, BULK_BUDGET, STASH_SLOTS } from '../sim/carry.js';
import { itemValue, assessed, readOut, marksFor, leadFor, placeLabel, atPlace, APPRAISAL_FEE } from '../sim/record.js';
import { campStations } from '../core/camp.js';
import { FOE } from '../core/foes.js';
import { blastOf } from '../core/items.js';
import { liveBlasts, capsHere } from '../sim/blast.js';
import { MAX_HP, FADE_TICKS, POP_TICKS, swingPhase, saying, lampVec, surface } from '../sim/state.js';
import { isContainer, labelOf, bulkOf, KIND, SLOTS } from '../core/items.js';

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
    // Daylight above ground. No lamp pass at all — not a wider radius, not a
    // brighter band: the overlay simply does not run, so the surface renders at
    // the tiles' own value. `design/palette.md`'s no-ambient-term law is about
    // the DARK; it is a law for rooms with no source in them, and the sky is a
    // source. Skipping the pass is also free, which is the cheapest possible
    // answer to a hub that felt like another delve.
    if (surface(s)) return;

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

  function drawRoom(grid, era, lift = 1) {
    const tone = shadeTone(TONES[era.name] || TONES['Recent'], lift);
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
            for (const [sheetName, gx, gy, shade, fixed] of draws) {
              const sheet = tonedSheet(pack, sheetName, shadeTone(fixed || tone, shade));
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

  // The floor, remembered: where a cap broke furniture. An overlay through the
  // pack, drawn after the room so the floor variant under it is already there.
  function drawScars(s, era, lift = 1) {
    const scars = roomView(s).scars;
    const def = pack && pack.decals && pack.decals.scar;
    if (!scars.size || !def) return;
    const tone = shadeTone(TONES[era.name] || TONES['Recent'], lift);
    for (const t of scars) {
      const tx = t % COLS, ty = (t / COLS) | 0;
      const [sheetName, gx, gy] = variantFor(def.cells, tx, ty);
      const sheet = tonedSheet(pack, sheetName, shadeTone(def.tone || tone, def.shade === undefined ? 1 : def.shade));
      if (sheet) ctx.drawImage(sheet, gx*pack.tile, gy*pack.tile, pack.tile, pack.tile, tx*TILE, ty*TILE, TILE, TILE);
    }
  }

  function drawItems(s, tone) {
    for (const c of visible(s)) {
      const tx = c.tile % COLS, ty = (c.tile / COLS) | 0;
      const def = pack && pack.items && pack.items[c.kind];
      if (def) {
        const cells = (c.open && def.opened) ? def.opened : def.cells;
        const [sh, gx, gy] = variantFor(cells, tx, ty);
        // A fixed tone wins over the stratum's: wood is wood at every depth, and
        // a glazed pot keeps the glaze it was fired with wherever it ends up.
        const fixed = def.tone || glazeFor(pack, c.kind, c.key);
        const sheet = tonedSheet(pack, sh, shadeTone(fixed || tone, def.shade === undefined ? 1 : def.shade));
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
    const key = ref && ref.key;
    ctx.fillStyle = selected ? '#2e2921' : '#191714';
    ctx.fillRect(x, y, PLATE, PLATE);
    ctx.strokeStyle = selected ? P.lantern : '#332d26';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, PLATE - 1, PLATE - 1);
    if (!kind) return;
    const def = pack && pack.items && pack.items[kind];
    if (def) {
      const [sh, gx, gy] = variantFor(def.cells, idx, 0);
      // The glaze follows the object into your pack, which is the whole tell.
      const sheet = tonedSheet(pack, sh, def.tone || glazeFor(pack, kind, key) || tone);
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
    const isPack = s.screen === 'pack';
    if (s.screen === 'status') { drawStatus(s, tone); return; }
    // The pack page carries the equipment row above the grid, so it sits higher.
    const ROW_H = isPack ? 38 : 0;
    const y0 = isPack ? 68 : 96;

    if (two) {
      const title = isStash
        ? `STASH \u00b7 ${cont.length}/${STASH_SLOTS}`
        : (cont.length ? `CONTAINER \u00b7 ${cont.length} left` : 'CONTAINER \u00b7 empty');
      drawPanel(x0, y0, lCols, lRows, title, cont, tone, s.side === 0 ? s.cur : -1);
    }
    const px = two ? x0 + contW + 12 : x0;
    const bulk = carriedBulk(s);

    // The equipment row: five labelled slots, worn or wielded, above the pack.
    if (isPack) {
      const pitch = Math.floor(packW / SLOTS.length);
      const rx = px + Math.floor((packW - pitch * SLOTS.length) / 2);
      ctx.fillStyle = 'rgba(12,11,9,0.97)';
      ctx.fillRect(px, y0, packW, ROW_H);
      ctx.strokeStyle = '#3d372f'; ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, y0 + 0.5, packW - 1, ROW_H - 1);
      ctx.font = '8px ui-monospace, monospace'; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
      const LABEL = { weapon: 'WEAP', tool: 'TOOL', armor: 'ARMR', helm: 'HELM', accessory: 'ACCS' };
      for (const [i, slot] of SLOTS.entries()) {
        const cx = rx + i * pitch + (pitch >> 1);
        ctx.fillStyle = s.side === 2 && s.cur === i ? P.lantern : '#6b6357';
        ctx.fillText(LABEL[slot], cx, y0 + 3);
        drawCell(cx - (PLATE >> 1), y0 + 13, s.equipped[slot], i, tone, s.side === 2 && s.cur === i);
      }
      ctx.textAlign = 'start';
    }

    drawPanel(px, y0 + ROW_H, PACK_COLS, PACK_ROWS,
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
               : s.side === 2 ? 'A unequip   \u00b7   \u2193 pack   \u00b7   Tab status   \u00b7   Esc close'
                              : 'A equip / put down   \u00b7   Y put all down   \u00b7   \u2191 gear   \u00b7   Tab status   \u00b7   Esc close';
    ctx.fillText(hint, W / 2, y0 + ROW_H + PACK_ROWS * CELL + PAD * 2 + TITLE + 10);

    // What the cursor is on: its name, its weight, its price, and as much of
    // its history as this character can actually read.
    const under = s.side === 0 ? cont[s.cur] : s.side === 2 ? s.equipped[SLOTS[s.cur]] : s.carried[s.cur];
    if (s.side === 2 && !under) {
      ctx.fillStyle = '#6b6357';
      ctx.fillText(`${SLOTS[s.cur]} \u2014 empty`, W / 2, y0 - 26);
    }
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

  // The other page of the menu: who you are and what state you are in. No
  // cursor, nothing to move — it is read, not operated.
  function drawStatus(s, tone) {
    const w = 300, hgt = 176;
    const x = Math.round((W - w) / 2), y = 72;
    ctx.fillStyle = 'rgba(12,11,9,0.97)';
    ctx.fillRect(x, y, w, hgt);
    ctx.strokeStyle = '#3d372f'; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, hgt - 1);
    ctx.font = '8px ui-monospace, monospace';
    ctx.textBaseline = 'top'; ctx.textAlign = 'start';

    ctx.fillStyle = P.parchment;
    ctx.fillText('WORKER', x + PAD, y + 6);
    ctx.fillStyle = '#6b6357';
    ctx.fillText('the Company\u2019s, for now', x + PAD + 48, y + 6);

    const bulk = carriedBulk(s);
    const wielding = s.equipped.weapon ? labelOf(s.equipped.weapon.kind) : 'fists';
    const worn = SLOTS.filter((k) => k !== 'weapon' && s.equipped[k]).map((k) => labelOf(s.equipped[k].kind));
    const left = [
      ['might', s.stats.might], ['finesse', s.stats.finesse], ['vigor', s.stats.vigor],
      ['lore', s.stats.lore], ['keen', s.stats.keen], ['bearing', s.stats.bearing],
    ];
    const right = [
      ['health', `${s.hp}/${MAX_HP}`], ['scrap', s.scrap],
      ['bulk', `${bulk}/${BULK_BUDGET} ${tier(bulk)}`], ['deaths', s.deaths || 0],
      ['rooms', s.moves], ['records read', s.known.length],
    ];
    const col = (rows, cx) => rows.forEach(([k, v], i) => {
      ctx.fillStyle = '#6b6357'; ctx.fillText(k.toUpperCase(), cx, y + 26 + i * 12);
      ctx.fillStyle = P.bone;    ctx.fillText(String(v), cx + 78, y + 26 + i * 12);
    });
    col(left, x + PAD);
    col(right, x + PAD + 140);

    ctx.fillStyle = '#6b6357';
    ctx.fillText('WIELDING', x + PAD, y + 108);
    ctx.fillStyle = P.bone; ctx.fillText(wielding, x + PAD + 78, y + 108);
    ctx.fillStyle = '#6b6357';
    ctx.fillText('WEARING', x + PAD, y + 120);
    ctx.fillStyle = P.bone; ctx.fillText(worn.length ? worn.join(', ') : 'nothing', x + PAD + 78, y + 120);

    ctx.fillStyle = '#4a443c';
    ctx.fillText('Keen is the eye. Lore is the education. Neither moves yet.', x + PAD, y + 140);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#6b6357';
    ctx.fillText('Tab pack   \u00b7   Esc / B close', W / 2, y + hgt + 10);
    ctx.textAlign = 'start';
  }

  // The front door: three save files, or a fresh world in an empty one.
  function drawTitle(t) {
    ctx.fillStyle = P.void; ctx.fillRect(0, 0, W, H);
    ctx.font = 'bold 15px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = P.parchment;
    ctx.fillText('P A R A M Y T H', W / 2, 54);
    ctx.font = '8px ui-monospace, monospace';
    ctx.fillStyle = '#6b6357';
    ctx.fillText('a salvage game in the Barrowlands', W / 2, 76);

    const w = 320, rowH = 30, x = Math.round((W - w) / 2), y0 = 118;
    for (const [i, slot] of t.slots.entries()) {
      const y = y0 + i * rowH, sel = i === t.cur;
      ctx.fillStyle = sel ? '#1e1b17' : '#121110';
      ctx.fillRect(x, y, w, rowH - 4);
      ctx.strokeStyle = sel ? P.lantern : '#2b2824'; ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, rowH - 5);
      ctx.textAlign = 'start';
      ctx.fillStyle = sel ? P.parchment : '#8a7f70';
      ctx.fillText(`${sel ? '\u25b8' : ' '} SLOT ${i + 1}`, x + 8, y + 5);
      ctx.fillStyle = slot.bad ? '#b5553f' : slot.summary ? P.bone : '#5b5348';
      const line = t.confirm === i ? 'press X again to delete \u00b7 any other key keeps it'
                 : slot.bad ? 'an older save \u2014 cannot be opened; delete it'
                 : slot.summary
                   ? `${slot.summary.scrap} scrap \u00b7 ${slot.summary.deaths} deaths \u00b7 ${slot.summary.moves} rooms \u00b7 ${slot.summary.where}`
                   : '\u2014 empty \u2014 a new world';
      ctx.fillText(line, x + 8, y + 15);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#6b6357';
    ctx.fillText('A play   \u00b7   X delete   \u00b7   \u2191\u2193 choose', W / 2, y0 + t.slots.length * rowH + 8);
    ctx.fillStyle = '#4a443c';
    ctx.fillText(t.note || '', W / 2, y0 + t.slots.length * rowH + 22);
    ctx.textAlign = 'start';
  }

  function drawStations(s, tone) {
    if (s.floor >= 0 || !pack || !pack.stations) return;
    for (const st of campStations()) {
      const def = pack.stations[st.kind];
      if (!def) continue;
      const tx = st.tile % COLS, ty = (st.tile / COLS) | 0;
      const [sh, gx, gy] = variantFor(def.cells, tx, ty);
      const sheet = tonedSheet(pack, sh, def.tone || tone);
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
      // The telegraph: step 3 of plans/foe-behaviour.md. Every mode has a
      // shape and a colour, so the machine is readable by a person and not
      // only by a gate. All of it is a function of the delta (mode, modeAt,
      // tick), so two draws of one state are identical.
      //   asleep   dim, still
      //   circle   warm, upright
      //   crouch   SQUASHED and bright — it is about to spring at where you are
      //   dash     STRETCHED along its line — committed, cannot turn
      //   recover  flat and dull — the window
      //   stagger  shuddering, pale
      const age = s.tick - f.modeAt;
      const crouch = f.mode === 'lunge' && def && age < def.lungeWindup;
      const dash = f.mode === 'lunge' && !crouch;
      const stagger = f.mode === 'stagger';
      // The kind's own colour comes from the pack; the modes tint over it.
      let sx = 1, sy = 1, dy = 0, colour = (art && art.tone) || '#c2836b';
      if (f.mode === 'asleep') colour = '#6b6357';
      else if (crouch) { sx = 1.3; sy = 0.65; dy = 3; colour = P.ember; }
      else if (dash) { const alongX = Math.abs(f.aimX - f.x) >= Math.abs(f.aimY - f.y); sx = alongX ? 1.45 : 0.8; sy = alongX ? 0.8 : 1.45; colour = P.ember; }
      else if (f.mode === 'recover') { sy = 0.85; dy = 1; colour = '#8f6a58'; }
      else if (stagger) colour = P.parchment;
      const x = Math.round(px(f.x)) + (stagger ? ((s.tick & 1) ? 1 : -1) : 0), y = Math.round(px(f.y)) + dy;
      // In the crouch, the line it will spring along: dots from it to the end
      // of its dash. The line is fixed the moment the crouch begins, so the
      // dots are a promise: be off the line when the crouch ends and it misses.
      if (crouch) {
        const x0 = Math.round(px(f.x)), y0 = Math.round(px(f.y));
        const x1 = Math.round(px(f.aimX)), y1 = Math.round(px(f.aimY));
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        ctx.fillStyle = P.lanternDeep;
        for (let k = 8; k < n; k += 6) ctx.fillRect(x0 + Math.round(((x1 - x0) * k) / n), y0 + Math.round(((y1 - y0) * k) / n), 1, 1);
      }
      ctx.save();
      ctx.translate(x, y); ctx.scale(sx, sy);
      ctx.font = 'bold 15px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = P.void; ctx.fillText(g, 1, 1);
      ctx.fillStyle = colour; ctx.fillText(g, 0, 0);
      ctx.restore();
      ctx.textAlign = 'start';
    }
  }

  // The dithered fade after a change of floor: an ordered 4x4 Bayer dither
  // whose coverage falls from all to none across FADE_TICKS. Seventeen pattern
  // tiles built once; a level is one fillRect. Keyed to arrivedAt, so a
  // fixed state draws the same fade twice.
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const fadeTiles = [];
  for (let level = 0; level <= 16; level++) {
    const t = document.createElement('canvas'); t.width = 4; t.height = 4;
    const tx = t.getContext('2d'); tx.fillStyle = P.void;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (BAYER[y][x] < level) tx.fillRect(x, y, 1, 1);
    fadeTiles.push(ctx.createPattern(t, 'repeat'));
  }
  function drawFade(s) {
    const age = s.tick - (s.arrivedAt ?? -FADE_TICKS);
    if (age < 0 || age >= FADE_TICKS) return;
    const level = Math.ceil(16 * (1 - age / FADE_TICKS));
    if (level <= 0) return;
    ctx.fillStyle = fadeTiles[level];
    ctx.fillRect(0, 0, W, VIEW_H);
  }

  // Where something died: a one-pixel ring, by the midpoint circle so it is
  // crisp pixels and not an anti-aliased arc, growing from the spot. Whole
  // for the first half of its life, then every other pixel: the bubble
  // thins and breaks. The colour is the kind's, from the pack.
  function drawPops(s) {
    for (const p of s.pops) {
      const age = s.tick - p.at;
      if (age < 0 || age >= POP_TICKS) continue;
      const art = pack && pack.foes && pack.foes[p.kind];
      ctx.fillStyle = (art && art.pop) || P.rot;
      const cx = Math.round(px(p.x)), cy = Math.round(px(p.y)), r = 2 + age * 2;
      const broken = age >= POP_TICKS / 2;
      let x = r, y = 0, err = 1 - r, i = 0;
      const dot = (dx, dy) => { if (!broken || (i++ & 1) === 0) ctx.fillRect(cx + dx, cy + dy, 1, 1); };
      while (x >= y) {
        dot(x, y); dot(y, x); dot(-y, x); dot(-x, y); dot(-x, -y); dot(-y, -x); dot(y, -x); dot(x, -y);
        y++;
        if (err < 0) err += 2 * y + 1; else { x--; err += 2 * (y - x) + 1; }
      }
    }
  }

  // A set cap: a small ember square that blinks, faster as the fuse runs down.
  // Keyed to the tick, so it draws the same twice. The blink IS the warning.
  function drawCharges(s) {
    for (const c of capsHere(s)) {
      const def = blastOf(c.kind); if (!def) continue;
      const age = s.tick - c.at, left = def.fuse - age;
      const on = left <= 12 ? (age & 1) === 0 : ((age >> 3) & 1) === 0;
      const x = Math.round(px(c.x)), y = Math.round(px(c.y));
      ctx.fillStyle = P.void; ctx.fillRect(x - 2, y - 2, 5, 5);
      ctx.fillStyle = on ? P.ember : P.lanternDeep; ctx.fillRect(x - 1, y - 1, 3, 3);
    }
  }

  // The blast. Its box is drawn for exactly the ticks it hurts, like the
  // swing: bright at the instant, then fading through the linger. What you
  // see is the hitbox, and the hitbox is what you see.
  function drawBlasts(s) {
    for (const b of liveBlasts(s)) {
      const age = s.tick - b.at;
      const x0 = Math.round(px(b.x - b.r)), y0 = Math.round(px(b.y - b.r)), w = Math.round(px(2 * b.r));
      const a = age < 2 ? 0.6 : Math.max(0.1, 0.36 - (age - 2) * 0.03);
      ctx.fillStyle = `rgba(240,163,64,${a.toFixed(2)})`;
      ctx.fillRect(x0, y0, w, w);
      ctx.strokeStyle = age < 2 ? P.parchment : P.ember; ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, w - 1);
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
    title(t) { drawTitle(t); },
    draw(state, hud) {
      const world = roomTiles(state.seed, state.site, state.floor, state.room);
      const tone = TONES[world.era.name] || TONES['Recent'];
      ctx.fillStyle = P.void; ctx.fillRect(0, 0, W, H);
      // The room view's grid, not the generator's: rubble a cap has broken is floor.
      drawRoom(roomView(state).grid, world.era, surface(state) ? SURFACE_LIFT : 1);
      drawScars(state, world.era, surface(state) ? SURFACE_LIFT : 1);
      drawStations(state, tone);
      drawItems(state, tone);
      drawCharges(state);
      drawFoes(state);
      drawPops(state);
      drawSwing(state);
      drawBlasts(state);
      drawPlayer(state);
      drawLight(state);
      // Over the world and the light, under the interface: you arrive in the dark
      // and it resolves; the health bar and the toast never dither.
      drawFade(state);
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
