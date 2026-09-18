/**
 * Production entry for a single-service deploy (e.g. Render).
 *
 * The assessment's mock API in `server/` is a stateful, long-running Node server
 * (in-memory dataset, rate-limit windows, SSE broadcasts). It must NOT be
 * modified, and it cannot run as a stateless serverless function. So in
 * production we run it as-is on an internal port, and this thin front server:
 *   - serves the built SPA from `dist/`
 *   - proxies everything under `/api` to the mock API (including SSE)
 *   - falls back to `index.html` for client-side routes
 *
 * Locally you still use `npm run dev` (Vite + the mock API) exactly as before;
 * this file is only used by the deployed build. Nothing in `server/` changes.
 *
 * CHAOS and LATENCY stay ON (the mock API's defaults) so the deployed app
 * behaves the way the brief says it will be graded.
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, 'dist');
const PUBLIC_PORT = Number(process.env.PORT ?? 3000);
const API_PORT = Number(process.env.INTERNAL_API_PORT ?? 8799); // internal, not exposed

// 1. Start the untouched mock API on an internal port.
const api = spawn(process.execPath, [join(__dirname, 'server', 'index.mjs')], {
  env: { ...process.env, PORT: String(API_PORT) },
  stdio: 'inherit',
});
api.on('exit', (code) => {
  console.error(`mock api exited with ${code}`);
  process.exit(code ?? 1);
});

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

function proxy(req, res) {
  const options = {
    hostname: '127.0.0.1',
    port: API_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };
  const upstream = http.request(options, (up) => {
    res.writeHead(up.statusCode ?? 502, up.headers);
    up.pipe(res);
  });
  upstream.on('error', () => {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'proxy_error', message: 'API unavailable.' } }));
  });
  req.pipe(upstream);
}

async function serveStatic(req, res) {
  // Prevent path traversal; default to index.html for SPA routes.
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const safe = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(DIST, safe);

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    filePath = join(DIST, 'index.html'); // SPA fallback
  }

  try {
    const body = await readFile(filePath);
    const ext = filePath.slice(filePath.lastIndexOf('.'));
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }
}

const front = http.createServer((req, res) => {
  if ((req.url ?? '').startsWith('/api')) return proxy(req, res);
  return serveStatic(req, res);
});

front.listen(PUBLIC_PORT, () => {
  console.log(`front server → http://localhost:${PUBLIC_PORT} (api proxied internally on ${API_PORT})`);
});
