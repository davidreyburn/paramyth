// Fullscreen, on a gesture. The API needs a real user activation — a key, a
// touch, a click; a gamepad button is NOT one, which is why the title screen
// asks for a tap. Every refusal is returned as words, never thrown and never
// silent: on a page that cannot go fullscreen you see why.
export async function goFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement) return { ok: true, already: true };
  if (!el.requestFullscreen) return { ok: false, why: 'this browser has no fullscreen API' };
  try {
    await el.requestFullscreen({ navigationUI: 'hide' });
  } catch (e) {
    return { ok: false, why: (e && e.message) || 'refused' };
  }
  // Landscape, where the platform lets a page ask. A refusal here is not a failure.
  try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch {}
  return { ok: true };
}

export async function toggleFullscreen() {
  if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch {} return { ok: true, exited: true }; }
  return goFullscreen();
}

export const isFullscreen = () => !!document.fullscreenElement;
export const standalone = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
