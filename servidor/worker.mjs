// Atalaya en Cloudflare Workers: la API (/api/*) usa D1 como base de datos;
// el resto se sirve desde los archivos estáticos de /site.
import { handle } from './api.mjs';
import SCHEMA_SQL from './schema.sql';
import { connect } from 'cloudflare:sockets';
import { crearSmtp } from './correo.mjs';

// Socket TLS de Cloudflare para el servidor de correo (puerto 465)
async function conectar(host, puerto) {
  const s = connect({ hostname: host, port: puerto }, { secureTransport: 'on', allowHalfOpen: false });
  await s.opened;
  return s;
}
const correo = (env) => crearSmtp({
  host: env.SMTP_HOST, puerto: env.SMTP_PORT || 465, usuario: env.SMTP_USER, clave: env.SMTP_PASSWORD,
  remitente: env.MAIL_FROM, conectar,
});

const SEGURIDAD = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'strict-transport-security': 'max-age=31536000',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const res = url.pathname.startsWith('/api/')
      ? await handle(req, { ...env, SCHEMA_SQL, CORREO: correo(env), EN_SEGUNDO_PLANO: (p) => ctx.waitUntil(p) })
      : await env.ASSETS.fetch(req);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(SEGURIDAD)) out.headers.set(k, v);
    return out;
  },
};
