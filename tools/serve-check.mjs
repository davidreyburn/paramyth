// Gate for the class of bug that renders a black page with no error:
// the document base URL must match where the modules actually live.

const PORT = Number(process.env.PORT) || 3140;
const base = `http://localhost:${PORT}`;
let failures = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? '  ok  ' : '  FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!cond) failures++;
};

const r = await fetch(base + '/', { redirect: 'manual' });
ok("'/' redirects rather than rewriting", r.status === 302, `${r.status} -> ${r.headers.get('location')}`);

const page = await fetch(base + '/');
const html = await page.text();
ok("'/' lands on a page", page.ok && html.includes('<canvas'));

// Every relative src/href on the entry page must resolve from the final URL.
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
  .filter((u) => !u.startsWith('http') && !u.startsWith('data:'));
for (const ref of refs) {
  const resolved = new URL(ref, page.url).href;
  const res = await fetch(resolved);
  ok(`resolves from the document base: ${ref}`, res.ok, `${res.status} ${resolved}`);
}

// And the module graph one level deep, which is where the 404 actually bit.
const mainUrl = new URL('./main.js', page.url).href;
const main = await (await fetch(mainUrl)).text();
for (const m of main.matchAll(/from '([^']+)'/g)) {
  const resolved = new URL(m[1], mainUrl).href;
  const res = await fetch(resolved);
  ok(`main.js import resolves: ${m[1]}`, res.ok, `${res.status}`);
}

// Every tool page must FAIL LOUDLY. A page whose only failure mode is a blank
// screen has cost this project three debugging sessions: the '/' rewrite, the
// atlas' silent module throw, and the contact sheet's empty img.onerror.
import { readdir, readFile } from 'node:fs/promises';
const toolsDir = new URL('.', import.meta.url);
for (const f of (await readdir(toolsDir)).filter((n) => n.endsWith('.html'))) {
  const src = await readFile(new URL(f, toolsDir), 'utf8');
  const loud = /onerror\s*=/.test(src) || /addEventListener\(\s*['"]error['"]/.test(src);
  ok(`tool page reports its own failure: ${f}`, loud,
     loud ? '' : 'a blank page is not an error message');
}

// And a relative asset path, so opening from the file system degrades to a
// message rather than to nothing.
for (const f of ['tileset-sheet.html']) {
  const src = await readFile(new URL(f, toolsDir), 'utf8');
  ok(`${f} uses a relative asset path`, !/src\s*=\s*['"]\//.test(src) && !/=\s*['"]\/inbox/.test(src));
}

// A second server on a busy port must say so and get out of the way — not
// dump an EADDRINUSE stack trace. This gate starts one against the server it
// is already talking to.
{
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [new URL('serve.mjs', import.meta.url).pathname],
    { env: { ...process.env, PORT: String(PORT) }, encoding: 'utf8', timeout: 8000 });
  ok('a second server on a busy port exits instead of hanging', r.status === 1, `exit ${r.status}`);
  ok('and it names the cause and the fix', /already running/.test(r.stderr) && /pkill|open it/.test(r.stderr),
     (r.stderr || '').trim().split('\n')[1] || '(silent)');
  ok('with no stack trace', !/EADDRINUSE|at Server\./.test(r.stderr));
}

// Installable. The manifest is linked, served as a manifest, names icons that
// resolve, and the worker and the fullscreen module load. Over http on a LAN
// none of this makes the app installable — only fullscreen-on-gesture works
// there — but on localhost, https and in the APK it is what "Install" reads.
{
  const index = await (await fetch(`${base}/app/`)).text();
  ok('the page links a manifest', /<link rel="manifest" href="\.\/manifest\.webmanifest">/.test(index));
  const m = await fetch(`${base}/app/manifest.webmanifest`);
  ok('the manifest is served as one', m.ok && /manifest\+json/.test(m.headers.get('content-type') || ''), m.headers.get('content-type'));
  const man = m.ok ? await m.json() : {};
  ok('and asks for fullscreen, landscape', man.display === 'fullscreen' && man.orientation === 'landscape');
  let icons = 0;
  for (const ic of man.icons || []) { const r = await fetch(`${base}/app/${ic.src}`); if (r.ok && /image\/png/.test(r.headers.get('content-type') || '')) icons++; }
  ok('every icon it names resolves as a PNG', icons === (man.icons || []).length && icons >= 2, `${icons} icons`);
  for (const f of ['sw.js', 'fullscreen.js']) { const r = await fetch(`${base}/app/${f}`); ok(`app/${f} loads`, r.ok && /javascript/.test(r.headers.get('content-type') || '')); }
  const sw = await (await fetch(`${base}/app/sw.js`)).text();
  ok('the worker caches nothing', !/caches\.|cache\.put|CacheStorage/.test(sw), 'a cache would go stale behind a zero-build module graph');
}

// Location-independent. Nothing the app ships may name the site root: an
// absolute `/app/` or `/assets/` works on the dev server and breaks at
// `/paramyth/` on GitHub Pages and inside the APK's shell. Tools pages are
// dev-only and exempt; the pack gate covers sheet paths.
{
  const { readdir: rd, readFile: rf } = await import('node:fs/promises');
  const root = new URL('../', import.meta.url);
  const bad = [];
  for (const dir of ['app', 'render', 'sim', 'core', 'systems']) {
    for (const f of await rd(new URL(dir + '/', root))) {
      if (!/\.(js|html|webmanifest)$/.test(f)) continue;
      const src = await rf(new URL(`${dir}/${f}`, root), 'utf8');
      for (const m of src.matchAll(/['"](\/(?:app|assets|inbox|tools|core|sim|render|systems)\/[^'"]*)['"]/g)) bad.push(`${dir}/${f}: ${m[1]}`);
    }
  }
  ok('nothing shipped names the site root', bad.length === 0, bad.join(' | ') || 'app, render, sim, core, systems');
  const man = JSON.parse(await rf(new URL('app/manifest.webmanifest', root), 'utf8'));
  ok('the manifest scopes itself relatively', man.start_url === './' && man.scope === './');
  const rootPage = await fetch(base + '/index.html');
  ok('a root index.html forwards to app/ where no server can redirect', rootPage.ok && /url=app\//.test(await rootPage.text()));
}

// The notice. A licence file that quietly goes missing before a release is the
// kind of thing this project gates; so is the credit the art's licence asks for.
{
  const { readFile: rf } = await import('node:fs/promises');
  const root = new URL('../', import.meta.url);
  const lic = await rf(new URL('LICENSE', root), 'utf8').catch(() => '');
  const notice = await rf(new URL('NOTICE', root), 'utf8').catch(() => '');
  const ignore = await rf(new URL('.gitignore', root), 'utf8').catch(() => '');
  const title = await rf(new URL('render/canvas.js', root), 'utf8');
  ok('LICENSE names the holder and the year', /Copyright \(c\) 2026 David Reyburn/.test(lic) && /All rights reserved/.test(lic));
  ok('and excludes the third-party art', /THIRD-PARTY ART/.test(lic) && /schwarnhild/.test(lic));
  ok('NOTICE credits the tileset and links the page', /Playdate Dungeon Tileset/.test(notice) && /schwarnhild\.itch\.io/.test(notice));
  ok('the tileset is ignored, never committed', /^inbox\/1-bit tileset\/$/m.test(ignore));
  ok('the title screen carries the credit', /Playdate Dungeon Tileset by schwarnhild/.test(title));
}

console.log(failures ? `\n  ${failures} failed\n` : '\n  all server gates passed\n');
process.exit(failures ? 1 : 0);
