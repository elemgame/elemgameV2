#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const listenPort = Number(process.env.HOST_PROXY_PORT ?? 8080);
const spacetimeHost = process.env.HOST_PROXY_SPACETIME_HOST ?? '127.0.0.1';
const spacetimePort = Number(process.env.HOST_PROXY_SPACETIME_PORT ?? 3000);
const paymentsHost = process.env.HOST_PROXY_PAYMENTS_HOST ?? '127.0.0.1';
const paymentsPort = Number(process.env.HOST_PROXY_PAYMENTS_PORT ?? 3002);
const staticRoot = path.resolve(process.env.HOST_PROXY_STATIC_ROOT ?? path.join(repoRoot, 'apps/tma/dist'));

const paymentPrefixes = ['/payments/', '/admin/', '/telegram/webhook'];
const paymentExact = new Set(['/health']);
const spacetimePrefixes = ['/v1/database/', '/v1/identity/'];

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.webp', 'image/webp'],
  ['.map', 'application/json; charset=utf-8'],
]);

const server = http.createServer((req, res) => {
  const requestPath = parsePath(req.url);
  if (isPaymentPath(requestPath)) return proxyHttp(req, res, paymentsHost, paymentsPort);
  if (isSpacetimePath(requestPath)) return proxyHttp(req, res, spacetimeHost, spacetimePort);
  return serveStatic(requestPath, res);
});

server.on('upgrade', (req, socket, head) => {
  const requestPath = parsePath(req.url);
  if (isSpacetimePath(requestPath)) {
    proxyUpgrade(req, socket, head, spacetimeHost, spacetimePort);
    return;
  }
  socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
  socket.destroy();
});

server.listen(listenPort, () => {
  console.log(
    `[host-proxy] listening on ${listenPort}, spacetime=${spacetimeHost}:${spacetimePort}, payments=${paymentsHost}:${paymentsPort}, static=${staticRoot}`,
  );
});

function parsePath(url) {
  try {
    return new URL(url ?? '/', 'http://localhost').pathname;
  } catch {
    return '/';
  }
}

function isPaymentPath(requestPath) {
  return paymentExact.has(requestPath) || paymentPrefixes.some(prefix => requestPath.startsWith(prefix));
}

function isSpacetimePath(requestPath) {
  return spacetimePrefixes.some(prefix => requestPath.startsWith(prefix));
}

function proxyHttp(req, res, host, port) {
  const headers = { ...req.headers, host: `${host}:${port}` };
  const upstream = http.request(
    {
      host,
      port,
      method: req.method,
      path: req.url,
      headers,
    },
    upstreamRes => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on('error', err => {
    console.error(`[host-proxy] upstream error ${host}:${port}`, err);
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    }
    res.end('Bad Gateway');
  });

  req.pipe(upstream);
}

function proxyUpgrade(req, socket, head, host, port) {
  const upstream = net.connect(port, host, () => {
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`);
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) upstream.write(`${name}: ${item}\r\n`);
      } else if (name.toLowerCase() === 'host') {
        upstream.write(`host: ${host}:${port}\r\n`);
      } else {
        upstream.write(`${name}: ${value}\r\n`);
      }
    }
    upstream.write('\r\n');
    if (head.length > 0) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });

  upstream.on('error', err => {
    console.error(`[host-proxy] websocket upstream error ${host}:${port}`, err);
    socket.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
    socket.destroy();
  });
}

function serveStatic(requestPath, res) {
  const safePath = requestPath === '/' ? '/index.html' : decodeURIComponent(requestPath);
  const filePath = path.resolve(staticRoot, `.${safePath}`);
  if (!filePath.startsWith(staticRoot)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  const finalPath = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
    ? filePath
    : path.join(staticRoot, 'index.html');

  fs.createReadStream(finalPath)
    .on('open', () => {
      res.writeHead(200, {
        'content-type': mimeTypes.get(path.extname(finalPath)) ?? 'application/octet-stream',
      });
    })
    .on('error', () => {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    })
    .pipe(res);
}
