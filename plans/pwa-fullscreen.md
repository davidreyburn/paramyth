# Fullscreen, and an installable app

*2026-09-25. DJ: "is the app already set up to save as PWA? I need it to try to
get fullscreen view." It was not: no manifest, no worker, no icons, no
fullscreen handling. Built the same day; the sword is the icon.*

## The constraint

A PWA needs a **secure context**. `http://<workstation>:3140` on the Retroid is
not one: Chrome will not register a worker or offer *Install* there, and a
manifest's `display: fullscreen` applies only to an installed app. So the
fullscreen the device gets today comes from the Fullscreen API on a gesture,
and the installable app is for localhost, https, and the APK.

## 1. Fullscreen on a gesture (works over plain http)

`app/fullscreen.js`. On the first key or tap at the title, and on **F** at any
time, `requestFullscreen({ navigationUI: 'hide' })` then a landscape lock where
the platform allows one. A gamepad button is not a user activation the browser
honours, which is why the title says *tap the screen*. Every refusal is printed
on the title screen, never thrown and never silent. In fullscreen the integer
scale snaps to 3× on a 1920×1080 screen — 640×360 exactly — which is the whole
reason for that resolution.

## 2. Installable

`app/manifest.webmanifest` (fullscreen, landscape, black, the sword at 192 and
512, maskable), linked from `index.html` with the theme and Apple meta tags. A
service worker that **caches nothing**: it exists to satisfy installability,
and a cache in front of a zero-build module graph would go stale during
development — the same rule as "the world is regenerated, never stored",
applied to code. Registered only in a secure context. Icons are built from the
project sheet's text by `tools/build-icons.mjs`; the PNG writer is shared with
the sheet builder in `tools/png.mjs`.

## 3. Deferred: the device as a secure context

A self-signed cert on `serve.mjs` plus trusting it on the Retroid, or Chrome's
`unsafely-treat-insecure-origin-as-secure` flag, would make 2 apply on the
device. Not worth it: the Capacitor APK (build-approach, spike 2) is the device
answer and is fullscreen by construction. Revisit only if the APK slips.

## Gates

`tools/serve-check.mjs`: the page links the manifest; the manifest is served
as `application/manifest+json`; it asks for fullscreen and landscape; every icon
it names resolves as a PNG; the worker and the fullscreen module load; the
worker caches nothing. The running dev server must be restarted to pick up the
new MIME type.

## Open

- Does the Retroid's Chrome hide the navigation bar under `requestFullscreen`?
  Some Android skins keep it unless the app is immersive, which only an APK
  controls. To be measured on the device (backlog 11).
