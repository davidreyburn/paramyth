// Zero-dependency static server. Prints the LAN URL, because the dev loop is
// "open this on the handheld", not "rebuild an APK".

import { createServer, get } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = Number(process.env.PORT) || 3140;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};

const server = createServer(async (req, res) => {
  let path = decodeURIComponent(req.url.split('?')[0]);

  // REDIRECT, never rewrite. Serving /app/index.html at '/' would leave the
  // document base URL at '/', so every relative module import resolves against
  // the root and 404s. The page then renders black with no error on screen.
  if (path === '/') {
    res.writeHead(302, { location: '/app/' });
    return res.end();
  }
  if (path.endsWith('/')) path += 'index.html';

  const file = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ''));
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('404 ' + path);
  }
});

// A port in use is the commonest way this fails, and a raw EADDRINUSE stack
// trace says nothing about what to do. Usually it is a previous paramyth
// server still running — from an earlier terminal, or a gate run that left one
// behind — in which case the right answer is "just open it". Probe and say so.
server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  const url = `http://localhost:${PORT}`;
  get(url + '/app/', (res) => {
    let body = '';
    res.on('data', (c) => { body += c; });
    res.on('end', () => {
      const ours = res.statusCode === 200 && /paramyth/i.test(body);
      console.error(ours
        ? `\n  a paramyth server is already running at ${url}\n  open it, or stop it first:  pkill -f tools/serve.mjs\n`
        : `\n  port ${PORT} is in use by something else\n  pick another:  PORT=${PORT + 1} npm start\n`);
      process.exit(1);
    });
  }).on('error', () => {
    console.error(`\n  port ${PORT} is in use and not answering as a web server\n  pick another:  PORT=${PORT + 1} npm start\n`);
    process.exit(1);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`\n  paramyth  →  http://localhost:${PORT}`);
  for (const a of lan) console.log(`  handheld  →  http://${a}:${PORT}`);
  console.log('');
});
