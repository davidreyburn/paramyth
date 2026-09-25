// Which on-screen controls to show, if any. A pure function of what the device
// reports, so it can be gated without a DOM and its verdicts are enumerable.
//
//   'portrait'  — the Game Boy: the view on top, a pad and buttons below it
//   'landscape' — the overlay: a translucent pad and buttons over the view
//   'none'      — a keyboard or a controller is in play, or the pointer is fine
//
// A phone is "a coarse pointer with touch points". A controller is "a gamepad
// has been seen", which in Chrome means a button was pressed at least once —
// so a device with both (the Retroid) shows the overlay at the title until the
// first pad press, then hides it. A pressed key hides it too. The preference
// wins over all of it, because detection will be wrong for someone.

export const PREFS = ['auto', 'on', 'off'];

export function controlsFor({ coarse = false, touchPoints = 0, padSeen = false, keySeen = false, portrait = false, pref = 'auto' } = {}) {
  if (pref === 'off') return 'none';
  const phone = coarse && touchPoints > 0;
  if (pref === 'auto' && (!phone || padSeen || keySeen)) return 'none';
  if (pref === 'on' && !touchPoints) return 'none';       // no touch, no point
  return portrait ? 'portrait' : 'landscape';
}
