// Atalaya · servidor Node.js (sin dependencias). Sirve el sitio (../site) y la API (/api/*).
//   node servidor/server.mjs          (lee la configuración de variables de entorno o de .env)
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from './api.mjs';
import { crearDB } from './db-sqlite.mjs';
import { crearAlmacen } from './archivos-disco.mjs';
import { crearSmtp } from './correo.mjs';
import tls from 'node:tls';
import { Duplex } from 'node:stream';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(RAIZ, 'site');

// .env sencillo (CLAVE=valor), sin sobrescribir variables ya definidas
const envFile = path.join(RAIZ, '.env');
if (existsSync(envFile)) {
  for (const linea of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const rutaDB = process.env.DB_PATH || path.join(RAIZ, 'datos', 'atalaya.db');
mkdirSync(path.dirname(rutaDB), { recursive: true });

const env = {
  DB: crearDB(rutaDB),
  FILES: crearAlmacen(process.env.FILES_PATH || path.join(path.dirname(rutaDB), 'archivos')),
  SCHEMA_SQL: readFileSync(path.join(RAIZ, 'servidor', 'schema.sql'), 'utf8'),
  SESSION_SECRET: process.env.SESSION_SECRET,
  AGENT_TOKEN: process.env.AGENT_TOKEN,
  ADMIN_EMAILS: process.env.ADMIN_EMAILS,
  ALLOWED_DOMAIN: process.env.ALLOWED_DOMAIN,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  DEMO: process.env.DEMO,
  APP_URL: process.env.APP_URL,
  // Avisos por correo (opcional): TLS directo al servidor SMTP, puerto 465
  CORREO: crearSmtp({
    host: process.env.SMTP_HOST, puerto: process.env.SMTP_PORT || 465, usuario: process.env.SMTP_USER,
    clave: process.env.SMTP_PASSWORD, remitente: process.env.MAIL_FROM,
    conectar: (host, puerto) => new Promise((ok, no) => {
      const s = tls.connect({ host, port: puerto, servername: host }, () => {
        s.on('error', (e) => console.error('[correo]', e.message)); // nunca derribar el servidor por el correo
        const { readable, writable } = Duplex.toWeb(s);
        ok({ readable, writable, close: () => s.destroy() });
      });
      s.once('error', no);
    }),
  }),
  EN_SEGUNDO_PLANO: (p) => p,
  DEMO_DATA: process.env.DEMO === '1' ? JSON.parse(readFileSync(path.join(RAIZ, 'data', 'demo.json'), 'utf8')) : null,
};
if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
  console.error('ERROR: define SESSION_SECRET (mínimo 32 caracteres) en el entorno o en .env');
  process.exit(1);
}

const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.ico': 'image/x-icon' };
const SEGURIDAD = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

async function estatico(req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  if (/\/_/.test(rel)) { res.writeHead(404).end(); return; }
  const archivo = path.normalize(path.join(SITE, rel));
  if (!archivo.startsWith(SITE + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const st = await stat(archivo);
    if (!st.isFile()) throw new Error('no es archivo');
    const etag = `"${st.size.toString(16)}-${st.mtimeMs.toString(16)}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, SEGURIDAD).end(); return; }
    res.writeHead(200, { ...SEGURIDAD, 'content-type': TIPOS[path.extname(archivo)] || 'application/octet-stream', etag, 'cache-control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : await readFile(archivo));
  } catch {
    res.writeHead(404, { ...SEGURIDAD, 'content-type': 'text/plain; charset=utf-8' }).end('No encontrado');
  }
}

const servidor = http.createServer(async (req, res) => {
  const inicio = Date.now();
  try {
    if (req.url === '/healthz') { res.writeHead(200).end('ok'); return; }
    if (!req.url.startsWith('/api/')) { await estatico(req, res); return; }
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const url = `${proto}://${req.headers.host}${req.url}`;
    const chunks = [];
    let total = 0;
    for await (const c of req) {
      total += c.length;
      if (total > 27 * 1024 * 1024) { res.writeHead(413, { 'content-type': 'application/json' }).end('{"error":"El archivo supera los 25 MB."}'); req.destroy(); return; }
      chunks.push(c);
    }
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    // Fuera de Cloudflare esta cabecera la podría inventar el cliente para esquivar los límites por IP
    headers.delete('cf-connecting-ip');
    if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', req.socket.remoteAddress || '');
    const respuesta = await handle(new Request(url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
    const h = { ...SEGURIDAD };
    respuesta.headers.forEach((v, k) => { h[k] = v; });
    res.writeHead(respuesta.status, h);
    res.end(Buffer.from(await respuesta.arrayBuffer()));
    if (process.env.LOG !== '0') console.log(`${req.method} ${req.url.split('?')[0]} ${respuesta.status} ${Date.now() - inicio}ms`);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500).end('Error interno');
  }
});

const puerto = Number(process.env.PORT || 8080);
servidor.listen(puerto, () => console.log(`Atalaya escuchando en http://localhost:${puerto} (base de datos: ${rutaDB})`));
