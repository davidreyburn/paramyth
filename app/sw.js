// The smallest service worker that makes the app installable. It caches
// NOTHING: a zero-build module graph served straight from disk would go stale
// behind a cache, and "the world is regenerated, never stored" is a rule this
// project keeps for code too. Offline play is the APK's job. If this file ever
// grows a cache, it has changed what the app is.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});   // a fetch handler is what installability looks for
