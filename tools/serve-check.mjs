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

console.log(failures ? `\n  ${failures} failed\n` : '\n  all server gates passed\n');
process.exit(failures ? 1 : 0);
