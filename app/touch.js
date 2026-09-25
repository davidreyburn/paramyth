// L5: on-screen controls. A d-pad that is really a stick — direction from the
// vector to its centre, eight ways with a deadzone, updated as the thumb slides
// — and buttons that stay pressed while a pointer is on them and hand the
// press over when it slides onto a neighbour. Every pointer is tracked by id,
// so stick-plus-button is the normal case.
//
// It is DOM, not canvas: the canvas stays the pure view the determinism gate
// expects. It reduces to the same verbs the pad does, through `input.hold` and
// `input.free`, and the frame is still one int.

import { VERB } from '../sim/frame.js';

// Button → verbs, the pad's own mapping (app/input.js PADS), and the glyph:
// a cell of the project sheet, with the pad letter beneath.
const BUTTONS = [
  { id: 'a', label: 'A', verbs: [VERB.INTERACT], cell: 5, title: 'interact' },
  { id: 'b', label: 'B', verbs: [VERB.DODGE, VERB.CANCEL], cell: 6, title: 'dodge / back' },
  { id: 'x', label: 'X', verbs: [VERB.ATTACK], cell: 0, title: 'attack' },
  { id: 'y', label: 'Y', verbs: [VERB.TOOL], cell: 1, title: 'tool' },
  { id: 'l', label: 'L', verbs: [VERB.GUARD], cell: 9, title: 'guard' },
  { id: 'r', label: 'R', verbs: [VERB.SPRINT], cell: 10, title: 'sprint' },
  { id: 'select', label: 'SELECT', verbs: [VERB.DROP], cell: 8, title: 'drop the load' },
  { id: 'start', label: 'START', verbs: [VERB.INVENTORY], cell: 7, title: 'pack' },
];
const DIRS = [VERB.UP, VERB.DOWN, VERB.LEFT, VERB.RIGHT];
const DEAD = 12;                 // px from the pad's centre that means "nothing"
const OCTANT = 0.414;            // tan 22.5°: the diagonal's share

export function attachTouch(input, root = document.body, sheetUrl = '../assets/sheets/paramyth-20.png') {
  const el = document.createElement('div');
  el.id = 'touch';
  el.innerHTML = `
    <div class="pad" data-role="pad" aria-label="move"><div class="nub"></div></div>
    <div class="cluster">
      ${BUTTONS.filter((b) => 'abxy'.includes(b.id)).map((b) => btn(b)).join('')}
    </div>
    <div class="shoulders">${['l', 'r'].map((id) => btn(BUTTONS.find((b) => b.id === id))).join('')}</div>
    <div class="row">${['select', 'start'].map((id) => btn(BUTTONS.find((b) => b.id === id))).join('')}</div>`;
  for (const g of el.querySelectorAll('.glyph')) {
    g.style.backgroundImage = `url(${new URL(sheetUrl, import.meta.url).href})`;
    g.style.backgroundPosition = `${-Number(g.dataset.cell) * 40}px 0`;
  }
  root.appendChild(el);

  const pad = el.querySelector('.pad'), nub = el.querySelector('.nub');
  const pointers = new Map();          // pointerId -> { kind: 'pad' } | { kind: 'btn', el }

  const steer = (dx, dy) => {
    const len = Math.hypot(dx, dy);
    for (const v of DIRS) input.free(v);
    if (len < DEAD) { nub.style.transform = ''; return; }
    if (Math.abs(dx) >= OCTANT * len) input.hold(dx > 0 ? VERB.RIGHT : VERB.LEFT);
    if (Math.abs(dy) >= OCTANT * len) input.hold(dy > 0 ? VERB.DOWN : VERB.UP);
    const k = Math.min(1, len / 40);
    nub.style.transform = `translate(${(dx / len) * 18 * k}px, ${(dy / len) * 18 * k}px)`;
  };
  const padVector = (e) => { const r = pad.getBoundingClientRect(); return [e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)]; };

  const press = (b) => { b.classList.add('down'); for (const v of BUTTONS.find((x) => x.id === b.dataset.id).verbs) input.hold(v); };
  const release = (b) => { b.classList.remove('down'); for (const v of BUTTONS.find((x) => x.id === b.dataset.id).verbs) input.free(v); };
  const buttonAt = (x, y) => { const t = document.elementFromPoint(x, y); return t && t.closest ? t.closest('.btn') : null; };

  el.addEventListener('pointerdown', (e) => {
    const b = e.target.closest && e.target.closest('.btn');
    if (b) { pointers.set(e.pointerId, { kind: 'btn', el: b }); press(b); }
    else if (e.target.closest('.pad')) { pointers.set(e.pointerId, { kind: 'pad' }); steer(...padVector(e)); }
    else return;
    try { el.setPointerCapture(e.pointerId); } catch {}     // a synthetic pointer has no capture
    e.preventDefault();
  });
  el.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (p.kind === 'pad') steer(...padVector(e));
    else {
      const under = buttonAt(e.clientX, e.clientY);
      if (under && under !== p.el) { release(p.el); p.el = under; press(under); }   // the slide
    }
    e.preventDefault();
  });
  const end = (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    if (p.kind === 'pad') steer(0, 0); else release(p.el);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  return { el, buttons: BUTTONS, steer, pointers };
}

const btn = (b) => `<div class="btn" data-id="${b.id}" title="${b.title}"><div class="glyph" data-cell="${b.cell}"></div><div class="label">${b.label}</div></div>`;
