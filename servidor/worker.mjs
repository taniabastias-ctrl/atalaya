// Atalaya en Cloudflare Workers: la API (/api/*) usa D1 como base de datos;
// el resto se sirve desde los archivos estáticos de /site.
import { handle } from './api.mjs';
import SCHEMA_SQL from './schema.sql';

const SEGURIDAD = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'strict-transport-security': 'max-age=31536000',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const res = url.pathname.startsWith('/api/')
      ? await handle(req, { ...env, SCHEMA_SQL })
      : await env.ASSETS.fetch(req);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(SEGURIDAD)) out.headers.set(k, v);
    return out;
  },
};
