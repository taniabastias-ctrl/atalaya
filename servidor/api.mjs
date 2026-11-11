import { correoAsignacion, correoNota, correoPrueba } from './correo.mjs';
import { crearZip } from './zip.mjs';

// Atalaya · Licitaciones Sermaluc — API
// Recibe una Request web estándar y devuelve una Response (la expone servidor/server.mjs).
// La base de datos llega en env.DB con una interfaz mínima:
//   env.DB.prepare(sql).bind(...).first() / .all() -> { results } / .run()
//
// Variables (env):
//   DB              base de datos (obligatoria)
//   SCHEMA_SQL      texto de schema.sql (se aplica al primer uso)
//   SESSION_SECRET  secreto para firmar sesiones (mín. 32 caracteres, obligatorio)
//   AGENT_TOKEN     token con el que el agente carga el reporte diario (mín. 24 caracteres)
//   ADMIN_EMAILS    correos con rol de administración, separados por coma
//   ALLOWED_DOMAIN  dominio permitido para cuentas (por defecto sermaluc.cl)
//   DEMO            "1" para cargar los datos de demostración si la base está vacía
//   DEMO_DATA       objeto con los datos de demostración (lo entrega server.mjs)
//   FILES           almacén de archivos con interfaz de R2: put(clave, datos, opciones) / get(clave) / delete(clave)
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET  credenciales OAuth de Google (opcional: activa "Ingresar con Google")
//   CORREO          cliente de correo (servidor/correo.mjs) creado con SMTP_*; sin él no se envían avisos
//   EN_SEGUNDO_PLANO(promesa)  mantiene viva una tarea después de responder (ctx.waitUntil en Cloudflare)
//   APP_URL         dirección pública de Atalaya para los enlaces de los correos (por defecto, la de la solicitud)

const enc = new TextEncoder();
const ESTADOS = ['nueva', 'evaluacion', 'preparacion', 'presentada', 'adjudicada', 'noadjudicada', 'descartada'];
const ESTADO_LABEL = { nueva: 'Nueva', evaluacion: 'En evaluación', preparacion: 'En preparación', presentada: 'Presentada', adjudicada: 'Adjudicada', noadjudicada: 'No adjudicada', descartada: 'Descartada' };
const COOKIE = 'atalaya_sesion';
const SESSION_MS = 30 * 24 * 3600 * 1000;
const RE_CODIGO = /^[0-9A-Za-z][0-9A-Za-z\-]{2,39}$/;
const RE_DOC = /^[0-9A-Za-z_\-]{1,40}$/;
const RE_EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}$/;
const RE_ID = /^[0-9a-f-]{36}$/;
const TIPOS_DOC = ['Administrativo', 'Técnico', 'Económico'];
const MAX_ARCHIVO = 25 * 1024 * 1024; // 25 MB
// Extensiones permitidas -> tipo MIME que se guarda (no se confía en el que envía el navegador)
const MIME = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet',
  csv: 'text/csv', txt: 'text/plain', zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
};

/* ---------------- utilidades ---------------- */
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const err = (status, mensaje) => json({ error: mensaje }, status);
const nowIso = () => new Date().toISOString();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uText = (s) => b64u(enc.encode(s));
const fromB64uText = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const uid = () => crypto.randomUUID();

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}
async function pbkdf2(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = Uint8Array.from(saltHex.match(/../g), (h) => parseInt(h, 16));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256));
}
async function readJson(req, max = 2_000_000) {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > max) throw new HttpError(413, 'La solicitud es demasiado grande.');
  const text = await req.text();
  if (text.length > max) throw new HttpError(413, 'La solicitud es demasiado grande.');
  try { return JSON.parse(text || '{}'); } catch { throw new HttpError(400, 'JSON inválido.'); }
}
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
function cookies(req) {
  const out = {};
  for (const p of (req.headers.get('cookie') || '').split(';')) {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
  return out;
}
const clientIp = (req) => req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';

/* ---------------- configuración ---------------- */
function config(env) {
  if (!env.DB) throw new Error('Falta la base de datos (env.DB).');
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET debe tener al menos 32 caracteres.');
  return {
    domain: (env.ALLOWED_DOMAIN || 'sermaluc.cl').toLowerCase(),
    admins: (env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean),
  };
}

/* ---------------- esquema y datos iniciales ---------------- */
let ready = null;
function ensureReady(env) {
  if (!ready) ready = (async () => {
    const cfg = config(env);
    // Un solo viaje a la base: asegura las cuentas de administración. Si las tablas no existen
    // (base nueva), se aplica el esquema y se reintenta.
    const admins = () => cfg.admins.map((email) => env.DB
      .prepare("INSERT INTO usuarios (email, nombre, cargo, rol, creado) VALUES (?, ?, 'Administración', 'admin', ?) ON CONFLICT (email) DO UPDATE SET rol = 'admin'")
      .bind(email, nombreDesdeCorreo(email), nowIso()));
    const verificar = () => batch(env, [env.DB.prepare("SELECT v FROM kv WHERE k = 'version'"), ...admins()]);
    try {
      await verificar();
    } catch (e) {
      if (!env.SCHEMA_SQL) throw e;
      const stmts = env.SCHEMA_SQL.replace(/--[^\n]*/g, '').split(';').map((x) => x.trim()).filter(Boolean);
      await batch(env, stmts.map((x) => env.DB.prepare(x)));
      await verificar();
    }
    if (env.DEMO === '1' && env.DEMO_DATA) {
      const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM reportes').first();
      if (!Number(r?.n)) await cargarDemo(env, env.DEMO_DATA);
    }
  })().catch((e) => { ready = null; throw e; });
  return ready;
}
function nombreDesdeCorreo(email) {
  return email.split('@')[0].split(/[._-]/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');
}

// Hoy en Chile (AAAA-MM-DD), para desplazar las fechas de la demo
function hoyChile() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function moverFecha(s, dias) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
  const [d, t] = s.split('T');
  const [y, m, dd] = d.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, dd + dias));
  return x.toISOString().slice(0, 10) + (t ? 'T' + t : '');
}
function moverIsoUtc(s, dias) { return new Date(new Date(s).getTime() + dias * 86400000).toISOString(); }

async function cargarDemo(env, demo) {
  const ref = demo.meta.fechaReferencia;
  const dias = Math.round((Date.parse(hoyChile()) - Date.parse(ref)) / 86400000);
  const lics = demo.licitaciones.map((l) => {
    const fechas = Object.fromEntries(Object.entries(l.fechas || {}).map(([k, v]) => [k, moverFecha(v, dias)]));
    return { ...l, fechas, publicada: moverFecha(l.publicada, dias) };
  });
  // Reporte anterior (sin las nuevas) y reporte de hoy: así "nueva" se calcula igual que con datos reales
  const ayer = new Date(Date.now() - 86400000).toISOString();
  await ingerirReporte(env, { meta: { ...demo.meta, generado: moverFecha(demo.meta.generado, dias - 1) }, licitaciones: lics.filter((l) => !l.nueva) }, ayer);
  await ingerirReporte(env, { meta: { ...demo.meta, generado: moverFecha(demo.meta.generado, dias) }, licitaciones: lics }, nowIso());
  const st = [];
  for (const p of demo.equipo || []) {
    st.push(env.DB.prepare("INSERT INTO usuarios (email, nombre, cargo, rol, creado) VALUES (?, ?, ?, 'equipo', ?) ON CONFLICT (email) DO UPDATE SET nombre = excluded.nombre, cargo = excluded.cargo")
      .bind(p.email.toLowerCase(), p.nombre, p.cargo || '', nowIso()));
  }
  for (const [codigo, sg] of Object.entries(demo.demoSeguimiento || {})) {
    st.push(env.DB.prepare('INSERT INTO seguimiento (codigo, estado, responsable, actualizado, actualizado_por) VALUES (?, ?, ?, ?, ?) ON CONFLICT (codigo) DO NOTHING')
      .bind(codigo, sg.estado, sg.responsable || null, nowIso(), sg.responsable || ''));
    for (const d of sg.docs || []) {
      st.push(env.DB.prepare('INSERT INTO documentos_listos (codigo, doc_id, por, fecha) VALUES (?, ?, ?, ?) ON CONFLICT (codigo, doc_id) DO NOTHING')
        .bind(codigo, d, sg.responsable || '', nowIso()));
    }
    for (const n of sg.notas || []) {
      const fecha = moverIsoUtc(new Date(n.fecha + ':00-03:00').toISOString(), dias);
      st.push(env.DB.prepare("INSERT INTO eventos (id, codigo, tipo, autor, texto, fecha) VALUES (?, ?, 'nota', ?, ?, ?)").bind(uid(), codigo, n.autor, n.texto, fecha));
    }
  }
  await batch(env, st);
  await bump(env);
}

/* ---------------- reporte del agente ---------------- */
function validarLicitacion(l) {
  if (!l || typeof l !== 'object') return 'registro vacío';
  if (!RE_CODIGO.test(l.codigo || '')) return `código inválido (${String(l.codigo).slice(0, 40)})`;
  if (!str(l.nombre)) return `${l.codigo}: falta el nombre`;
  if (!l.fechas || typeof l.fechas !== 'object' || !l.fechas.cierre) return `${l.codigo}: falta fechas.cierre`;
  if (!Array.isArray(l.documentos)) return `${l.codigo}: documentos debe ser una lista`;
  for (const d of l.documentos) if (!RE_DOC.test(d?.id || '') || !str(d?.nombre)) return `${l.codigo}: documento sin id o nombre válido`;
  return null;
}
const HITOS = ['publicacion', 'visitaTerreno', 'finPreguntas', 'respuestas', 'cierre', 'aperturaTecnica', 'aperturaEconomica', 'adjudicacion'];
const RE_FECHA = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

// Sentencias que guardan una licitación del agente en el modelo relacional (se ejecutan en un solo viaje).
// No toca el trabajo del equipo (seguimiento, documentos marcados, archivos, bitácora ni documentos agregados a mano).
function sentenciasLicitacion(env, l, reporteId) {
  const D = env.DB;
  const cod = l.codigo;
  const org = str(l.organismo, 300);
  const uni = str(l.unidad, 300);
  const out = [];
  if (org) {
    out.push(D.prepare('INSERT INTO organismos (nombre) VALUES (?) ON CONFLICT (nombre) DO NOTHING').bind(org));
    const oc = str(String(l.organismoCodigo ?? ''), 40);
    if (oc) out.push(D.prepare('UPDATE organismos SET codigo = ? WHERE nombre = ? AND codigo IS NULL AND NOT EXISTS (SELECT 1 FROM organismos WHERE codigo = ?)').bind(oc, org, oc));
    out.push(D.prepare(`INSERT INTO unidades_compra (organismo_id, nombre, region, codigo) VALUES ((SELECT id FROM organismos WHERE nombre = ?), ?, ?, ?)
      ON CONFLICT (organismo_id, nombre) DO UPDATE SET region = excluded.region, codigo = COALESCE(excluded.codigo, unidades_compra.codigo)`)
      .bind(org, uni, str(l.region, 120), str(String(l.unidadCodigo ?? ''), 40) || null));
  }
  const monto = Math.round(Number(l.montoEstimado) || 0);
  const original = l.montoOriginal == null || l.montoOriginal === '' ? null : Number(l.montoOriginal) || null;
  out.push(D.prepare(`INSERT INTO licitaciones (codigo, nombre, descripcion, organismo_id, unidad_id, tipo, moneda, monto_estimado, monto_original,
        duracion, coincidencia, url, contacto_nombre, contacto_email, primer_reporte, ultimo_reporte)
      VALUES (?, ?, ?, (SELECT id FROM organismos WHERE nombre = ?),
        (SELECT u.id FROM unidades_compra u JOIN organismos o ON o.id = u.organismo_id WHERE o.nombre = ? AND u.nombre = ?),
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (codigo) DO UPDATE SET nombre = excluded.nombre, descripcion = excluded.descripcion, organismo_id = excluded.organismo_id,
        unidad_id = excluded.unidad_id, tipo = excluded.tipo, moneda = excluded.moneda, monto_estimado = excluded.monto_estimado,
        monto_original = excluded.monto_original, duracion = excluded.duracion, coincidencia = excluded.coincidencia, url = excluded.url,
        contacto_nombre = excluded.contacto_nombre, contacto_email = excluded.contacto_email, ultimo_reporte = excluded.ultimo_reporte`)
    .bind(cod, str(l.nombre, 500), str(l.descripcion, 8000), org, org, uni,
      str(l.tipo, 10), str(l.moneda, 10) || 'CLP', monto, original, str(l.duracion, 60),
      Math.max(0, Math.min(100, Math.round(Number(l.match) || 0))),
      /^https:\/\//.test(l.url || '') ? str(l.url, 500) : null,
      str(l.contacto?.nombre, 200), str(l.contacto?.email, 200), reporteId, reporteId));
  out.push(D.prepare('INSERT INTO reporte_licitaciones (reporte_id, codigo) VALUES (?, ?) ON CONFLICT DO NOTHING').bind(reporteId, cod));

  out.push(D.prepare('DELETE FROM licitacion_fechas WHERE codigo = ?').bind(cod));
  for (const h of HITOS) {
    const f = str(l.fechas?.[h], 20);
    if (f && RE_FECHA.test(f)) out.push(D.prepare('INSERT INTO licitacion_fechas (codigo, hito, fecha) VALUES (?, ?, ?)').bind(cod, h, f));
  }
  out.push(D.prepare('DELETE FROM licitacion_palabras WHERE codigo = ?').bind(cod));
  for (const k of new Set((l.palabrasClave || []).map((x) => str(x, 80)).filter(Boolean))) {
    out.push(D.prepare('INSERT INTO palabras_clave (palabra) VALUES (?) ON CONFLICT DO NOTHING').bind(k));
    out.push(D.prepare('INSERT INTO licitacion_palabras (codigo, palabra) VALUES (?, ?) ON CONFLICT DO NOTHING').bind(cod, k));
  }
  out.push(D.prepare('DELETE FROM criterios_evaluacion WHERE codigo = ?').bind(cod));
  (l.criterios || []).filter((c) => str(c?.nombre)).slice(0, 50).forEach((c, i) =>
    out.push(D.prepare('INSERT INTO criterios_evaluacion (codigo, orden, nombre, peso) VALUES (?, ?, ?, ?)').bind(cod, i, str(c.nombre, 200), Number(c.peso) || 0)));
  out.push(D.prepare('DELETE FROM garantias WHERE codigo = ?').bind(cod));
  (l.garantias || []).filter((g) => str(g?.tipo)).slice(0, 20).forEach((g, i) =>
    out.push(D.prepare('INSERT INTO garantias (codigo, orden, tipo, monto, vigencia) VALUES (?, ?, ?, ?, ?)').bind(cod, i, str(g.tipo, 200), str(g.monto, 100), str(g.vigencia, 200))));

  const ids = [];
  (l.documentos || []).slice(0, 200).forEach((d, i) => {
    ids.push(d.id);
    out.push(D.prepare(`INSERT INTO documentos_requeridos (codigo, doc_id, nombre, tipo, obligatorio, orden, origen) VALUES (?, ?, ?, ?, ?, ?, 'agente')
      ON CONFLICT (codigo, doc_id) DO UPDATE SET nombre = excluded.nombre, tipo = excluded.tipo, obligatorio = excluded.obligatorio, orden = excluded.orden
      WHERE documentos_requeridos.origen = 'agente'`)
      .bind(cod, d.id, str(d.nombre, 300), TIPOS_DOC.includes(d.tipo) ? d.tipo : 'Administrativo', d.obligatorio === false ? 0 : 1, i));
  });
  // Documentos del agente que ya no vienen: se quitan solo si nadie los marcó como listos
  out.push(D.prepare(`DELETE FROM documentos_requeridos WHERE codigo = ? AND origen = 'agente'
      AND doc_id NOT IN (SELECT value FROM json_each(?)) AND doc_id NOT IN (SELECT doc_id FROM documentos_listos WHERE codigo = ?)`)
    .bind(cod, JSON.stringify(ids), cod));
  return out;
}

async function ingerirReporte(env, body, recibido = nowIso()) {
  const lics = Array.isArray(body?.licitaciones) ? body.licitaciones : null;
  if (!lics) throw new HttpError(400, 'El reporte debe traer "licitaciones" (lista).');
  if (lics.length > 2000) throw new HttpError(413, 'Demasiadas licitaciones en un reporte.');
  const errores = lics.map(validarLicitacion).filter(Boolean);
  if (errores.length) throw new HttpError(422, 'Reporte con errores: ' + errores.slice(0, 5).join('; '));
  const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
  const palabras = [...new Set((Array.isArray(meta.palabrasClave) ? meta.palabrasClave : []).map((k) => str(k, 80)).filter(Boolean))].slice(0, 200);
  const D = env.DB;
  await batch(env, [
    D.prepare('INSERT INTO reportes (id, generado, agente, fuente, revisadas) VALUES (?, ?, ?, ?, ?)')
      .bind(recibido, str(meta.generado, 40) || recibido, str(meta.agente, 120), str(meta.fuente, 160), Math.max(0, Math.round(Number(meta.revisadas) || 0))),
    ...palabras.flatMap((k) => [
      D.prepare('INSERT INTO palabras_clave (palabra) VALUES (?) ON CONFLICT DO NOTHING').bind(k),
      D.prepare('INSERT INTO reporte_palabras (reporte_id, palabra) VALUES (?, ?) ON CONFLICT DO NOTHING').bind(recibido, k),
    ]),
  ]);
  const existentes = new Set((await D.prepare('SELECT codigo FROM licitaciones').all()).results.map((r) => r.codigo));
  let nuevas = 0;
  for (const l of lics) {
    if (!existentes.has(l.codigo)) nuevas++;
    await batch(env, sentenciasLicitacion(env, l, recibido));
  }
  await bump(env);
  return { reporte: recibido, recibidas: lics.length, nuevas };
}

/* ---------------- varias consultas en un solo viaje a la base ---------------- */
async function batch(env, stmts) {
  if (!stmts.length) return [];
  if (typeof env.DB.batch === 'function') return env.DB.batch(stmts);
  const out = [];
  for (const st of stmts) out.push(await st.all());
  return out;
}

/* ---------------- contador de cambios ---------------- */
async function bump(env) {
  await env.DB.prepare("INSERT INTO kv (k, v) VALUES ('version', 1) ON CONFLICT (k) DO UPDATE SET v = kv.v + 1").run();
}
async function version(env) {
  const r = await env.DB.prepare("SELECT v FROM kv WHERE k = 'version'").first();
  return Number(r?.v || 0);
}

/* ---------------- límites de intentos ---------------- */
// Suma un intento y devuelve la consulta (para agruparla con otras en un solo viaje).
function intento(env, clave, ventanaMs) {
  const t = Date.now();
  return env.DB.prepare(`INSERT INTO limites (clave, conteo, desde) VALUES (?, 1, ?)
    ON CONFLICT (clave) DO UPDATE SET
      conteo = CASE WHEN ? - limites.desde > ? THEN 1 ELSE limites.conteo + 1 END,
      desde  = CASE WHEN ? - limites.desde > ? THEN excluded.desde ELSE limites.desde END
    RETURNING conteo`).bind(clave, t, t, ventanaMs, t, ventanaMs);
}
function revisarIntentos(resultado, max) {
  if (Number(resultado?.results?.[0]?.conteo) > max) throw new HttpError(429, 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.');
}
async function limitar(env, clave, max, ventanaMs) {
  const [r] = await batch(env, [intento(env, clave, ventanaMs)]);
  revisarIntentos(r, max);
}

/* ---------------- sesiones ---------------- */
async function crearSesion(env, email, req) {
  const payload = b64uText(JSON.stringify({ e: email, iat: Date.now(), exp: Date.now() + SESSION_MS }));
  const token = `${payload}.${await hmac(env.SESSION_SECRET, payload)}`;
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${secure}`;
}
async function usuarioSesion(env, req) {
  const tok = cookies(req)[COOKIE];
  if (!tok || !tok.includes('.')) return null;
  const [payload, firma] = tok.split('.');
  if (!safeEqual(firma, await hmac(env.SESSION_SECRET, payload))) return null;
  let p; try { p = JSON.parse(fromB64uText(payload)); } catch { return null; }
  if (!p.e || !(p.exp > Date.now())) return null;
  const u = await env.DB.prepare('SELECT email, nombre, cargo, rol, revocado_desde FROM usuarios WHERE email = ?').bind(p.e).first();
  if (!u || p.iat < Number(u.revocado_desde)) return null;
  return { email: u.email, nombre: u.nombre, cargo: u.cargo, rol: u.rol };
}
const borrarCookie = `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

/* ---------------- lectura de datos ---------------- */
// Arma la respuesta para el navegador a partir de las tablas relacionales (un solo viaje a la base).
async function datos(env) {
  const D = env.DB;
  const [ult, rpal, lics, fec, lpal, crit, gar, req, seg, listos, arch, evs, eq, todas, ver] = await batch(env, [
    D.prepare('SELECT id, generado, agente, fuente, revisadas FROM reportes ORDER BY id DESC LIMIT 1'),
    D.prepare('SELECT palabra FROM reporte_palabras WHERE reporte_id = (SELECT MAX(id) FROM reportes) ORDER BY palabra'),
    D.prepare(`SELECT l.*, o.nombre AS organismo, o.codigo AS organismo_codigo, u.nombre AS unidad, u.region AS region
      FROM licitaciones l LEFT JOIN organismos o ON o.id = l.organismo_id LEFT JOIN unidades_compra u ON u.id = l.unidad_id`),
    D.prepare('SELECT codigo, hito, fecha FROM licitacion_fechas'),
    D.prepare('SELECT codigo, palabra FROM licitacion_palabras ORDER BY palabra'),
    D.prepare('SELECT codigo, nombre, peso FROM criterios_evaluacion ORDER BY codigo, orden'),
    D.prepare('SELECT codigo, tipo, monto, vigencia FROM garantias ORDER BY codigo, orden'),
    D.prepare('SELECT codigo, doc_id, nombre, tipo, obligatorio, origen FROM documentos_requeridos ORDER BY codigo, orden, doc_id'),
    D.prepare("SELECT codigo, estado, COALESCE(responsable, '') AS responsable, actualizado, actualizado_por FROM seguimiento"),
    D.prepare('SELECT codigo, doc_id FROM documentos_listos'),
    D.prepare('SELECT id, codigo, doc_id, categoria, nombre, tipo_mime, tamano, subido_por, fecha FROM archivos ORDER BY fecha DESC'),
    D.prepare('SELECT id, codigo, tipo, autor, texto, fecha FROM eventos ORDER BY fecha DESC LIMIT 5000'),
    D.prepare("SELECT email, nombre, cargo, rol, CASE WHEN hash = '' THEN 0 ELSE 1 END AS clave, ultimo_ingreso, creado FROM usuarios ORDER BY nombre"),
    D.prepare('SELECT palabra FROM palabras_clave ORDER BY palabra'),
    D.prepare("SELECT v FROM kv WHERE k = 'version'"),
  ]);
  const agrupar = (rows, fn) => { const m = {}; for (const r of rows.results) (m[r.codigo] ||= []).push(fn(r)); return m; };
  const F = {}; for (const r of fec.results) (F[r.codigo] ||= {})[r.hito] = r.fecha;
  const P = agrupar(lpal, (r) => r.palabra);
  const C = agrupar(crit, (r) => ({ nombre: r.nombre, peso: r.peso }));
  const G = agrupar(gar, (r) => ({ tipo: r.tipo, monto: r.monto, vigencia: r.vigencia }));
  const R = agrupar(req, (r) => ({ id: r.doc_id, nombre: r.nombre, tipo: r.tipo, obligatorio: !!Number(r.obligatorio), origen: r.origen }));
  const A = agrupar(arch, (r) => ({ id: r.id, docId: r.doc_id, categoria: r.categoria, nombre: r.nombre, tipo: r.tipo_mime, tamano: r.tamano, por: r.subido_por, fecha: r.fecha }));
  const ultimo = ult.results[0] || null;

  const seguimiento = {};
  for (const x of seg.results) seguimiento[x.codigo] = { estado: x.estado, responsable: x.responsable, actualizado: x.actualizado, actualizadoPor: x.actualizado_por, docs: {} };
  for (const d of listos.results) (seguimiento[d.codigo] ||= { estado: 'nueva', responsable: '', docs: {} }).docs[d.doc_id] = true;
  const eventos = agrupar(evs, (e) => ({ id: e.id, tipo: e.tipo, autor: e.autor, texto: e.texto, fecha: e.fecha }));

  return {
    version: Number(ver.results[0]?.v || 0),
    meta: ultimo
      ? { recibido: ultimo.id, generado: ultimo.generado, agente: ultimo.agente, fuente: ultimo.fuente, revisadas: Number(ultimo.revisadas) || 0,
          palabrasClave: rpal.results.length ? rpal.results.map((r) => r.palabra) : todas.results.map((r) => r.palabra) }
      : { palabrasClave: [], revisadas: 0 },
    equipo: eq.results.map((u) => ({ id: u.email, nombre: u.nombre, cargo: u.cargo, rol: u.rol, conClave: !!Number(u.clave),
      activo: !!Number(u.clave) || !!u.ultimo_ingreso, ultimoIngreso: u.ultimo_ingreso, creado: u.creado })),
    licitaciones: lics.results.map((l) => ({
      codigo: l.codigo, nombre: l.nombre, descripcion: l.descripcion,
      organismo: l.organismo || '', organismoCodigo: l.organismo_codigo || null, unidad: l.unidad || '', region: l.region || '',
      tipo: l.tipo, moneda: l.moneda, montoEstimado: Number(l.monto_estimado) || 0, montoOriginal: l.monto_original,
      duracion: l.duracion, match: Number(l.coincidencia) || 0, url: l.url,
      contacto: { nombre: l.contacto_nombre, email: l.contacto_email },
      fechas: F[l.codigo] || {}, publicada: (F[l.codigo] || {}).publicacion || null,
      palabrasClave: P[l.codigo] || [], criterios: C[l.codigo] || [], garantias: G[l.codigo] || [],
      documentos: R[l.codigo] || [], archivos: A[l.codigo] || [],
      nueva: !!ultimo && l.primer_reporte === ultimo.id,
      enReporte: !!ultimo && l.ultimo_reporte === ultimo.id,
      primeraVez: l.primer_reporte,
    })),
    seguimiento,
    eventos,
  };
}

/* ---------------- escrituras del equipo ---------------- */
async function licitacionOr404(env, codigo) {
  if (!RE_CODIGO.test(codigo || '')) throw new HttpError(404, 'Licitación no encontrada.');
  const r = await env.DB.prepare('SELECT codigo, nombre FROM licitaciones WHERE codigo = ?').bind(codigo).first();
  if (!r) throw new HttpError(404, 'Licitación no encontrada.');
  return r;
}
async function seg(env, codigo) {
  await env.DB.prepare("INSERT INTO seguimiento (codigo, estado, responsable, actualizado) VALUES (?, 'nueva', NULL, ?) ON CONFLICT (codigo) DO NOTHING").bind(codigo, nowIso()).run();
  return env.DB.prepare("SELECT estado, COALESCE(responsable, '') AS responsable FROM seguimiento WHERE codigo = ?").bind(codigo).first();
}
async function registrar(env, codigo, autor, texto, tipo = 'sistema') {
  await env.DB.prepare('INSERT INTO eventos (id, codigo, tipo, autor, texto, fecha) VALUES (?, ?, ?, ?, ?, ?)').bind(uid(), codigo, tipo, autor, texto, nowIso()).run();
}
async function setEstado(env, codigo, estado, u) {
  const s = await seg(env, codigo);
  if (s.estado === estado) return;
  await env.DB.prepare('UPDATE seguimiento SET estado = ?, actualizado = ?, actualizado_por = ? WHERE codigo = ?').bind(estado, nowIso(), u.email, codigo).run();
  await registrar(env, codigo, u.email, `${u.nombre} cambió el estado de «${ESTADO_LABEL[s.estado]}» a «${ESTADO_LABEL[estado]}»`);
}
const okVersion = async (env) => { await bump(env); return json({ ok: true, version: await version(env) }); };

async function rutasLicitacion(env, req, u, codigo, accion) {
  const lic = await licitacionOr404(env, codigo);
  const body = await readJson(req, 20000);
  const L = nombreLic(lic);
  if (accion === 'estado') {
    const estado = str(body.estado, 20);
    if (!ESTADOS.includes(estado)) throw new HttpError(400, 'Estado inválido.');
    const antes = (await seg(env, codigo)).estado;
    await setEstado(env, codigo, estado, u);
    anotar(req, 'licitacion.estado', antes === estado ? `${u.nombre} dejó ${L} en «${ESTADO_LABEL[estado]}» (sin cambios)` : `${u.nombre} cambió el estado de ${L} de «${ESTADO_LABEL[antes]}» a «${ESTADO_LABEL[estado]}»`, { codigo, datos: { antes, despues: estado } });
  } else if (accion === 'responsable') {
    const resp = str(body.responsable, 254).toLowerCase();
    let destino = null;
    if (resp) {
      destino = await env.DB.prepare('SELECT email, nombre FROM usuarios WHERE email = ?').bind(resp).first();
      if (!destino) throw new HttpError(400, 'Esa persona no pertenece al equipo.');
    }
    const s = await seg(env, codigo);
    if (s.responsable !== resp) {
      await env.DB.prepare('UPDATE seguimiento SET responsable = ?, actualizado = ?, actualizado_por = ? WHERE codigo = ?').bind(resp || null, nowIso(), u.email, codigo).run();
      await registrar(env, codigo, u.email, destino ? `${u.nombre} asignó la licitación a ${destino.nombre}` : `${u.nombre} quitó el responsable`);
      if (destino && s.estado === 'nueva') await setEstado(env, codigo, 'evaluacion', u);
    }
    if (destino && destino.email !== u.email && s.responsable !== resp) {
      const l = await datosAviso(env, codigo);
      avisar(env, req, {
        accion: 'correo.asignacion', codigo, usuario: u.email, para: [destino.email],
        descripcion: `Atalaya avisó por correo a ${destino.nombre} que se le asignó ${L}`,
        descripcionError: `Atalaya no pudo avisar por correo a ${destino.nombre} que se le asignó ${L}`,
        mensaje: correoAsignacion({ lic: l, estadoLabel: ESTADO_LABEL[l.estado] || l.estado, destino, asignador: u, url: enlaceLic(env, req, codigo) }),
      });
    }
    anotar(req, 'licitacion.responsable', destino ? `${u.nombre} asignó ${L} a ${destino.nombre}` : `${u.nombre} dejó ${L} sin responsable`, { codigo, datos: { antes: s.responsable || null, despues: resp || null } });
  } else if (accion === 'documentos') {
    const doc = str(body.doc, 40);
    const existe = await env.DB.prepare('SELECT nombre FROM documentos_requeridos WHERE codigo = ? AND doc_id = ?').bind(codigo, doc).first();
    if (!existe) throw new HttpError(400, 'Documento inválido.');
    anotar(req, 'licitacion.documento', `${u.nombre} marcó «${existe.nombre}» como ${body.listo === true ? 'listo' : 'pendiente'} en ${L}`, { codigo, datos: { doc, listo: body.listo === true } });
    const s = await seg(env, codigo);
    if (body.listo === true) {
      await env.DB.prepare('INSERT INTO documentos_listos (codigo, doc_id, por, fecha) VALUES (?, ?, ?, ?) ON CONFLICT (codigo, doc_id) DO NOTHING').bind(codigo, doc, u.email, nowIso()).run();
      if (s.estado === 'nueva' || s.estado === 'evaluacion') {
        await registrar(env, codigo, u.email, `${u.nombre} comenzó la preparación`);
        await setEstado(env, codigo, 'preparacion', u);
      }
    } else {
      await env.DB.prepare('DELETE FROM documentos_listos WHERE codigo = ? AND doc_id = ?').bind(codigo, doc).run();
    }
  } else if (accion === 'notas') {
    const texto = str(body.texto, 4000);
    if (!texto) throw new HttpError(400, 'La nota está vacía.');
    await registrar(env, codigo, u.email, texto, 'nota');
    const [l, eq] = await Promise.all([datosAviso(env, codigo), env.DB.prepare('SELECT email FROM usuarios WHERE email <> ? ORDER BY email').bind(u.email).all()]);
    const para = eq.results.map((x) => x.email).filter((e) => e.endsWith('@' + config(env).domain));
    avisar(env, req, {
      accion: 'correo.nota', codigo, usuario: u.email, para,
      descripcion: `Atalaya envió por correo la nota de ${u.nombre} sobre ${L} a ${para.length} persona${para.length === 1 ? '' : 's'} del equipo`,
      descripcionError: `Atalaya no pudo enviar por correo la nota de ${u.nombre} sobre ${L}`,
      mensaje: correoNota({ lic: l, estadoLabel: ESTADO_LABEL[l.estado] || l.estado, responsable: l.responsable_nombre, autor: u, nota: texto, url: enlaceLic(env, req, codigo) }),
    });
    anotar(req, 'licitacion.nota', `${u.nombre} escribió una nota en ${L}`, { codigo, datos: { texto: texto.slice(0, 500) } });
  } else if (accion === 'requeridos') {
    // Documento del checklist agregado a mano por el equipo (p. ej. tras leer las bases)
    const nombre = str(body.nombre, 300);
    if (!nombre) throw new HttpError(400, 'Escribe el nombre del documento.');
    const tipo = TIPOS_DOC.includes(body.tipo) ? body.tipo : 'Administrativo';
    const docId = 'eq-' + uid().slice(0, 8);
    await env.DB.prepare(`INSERT INTO documentos_requeridos (codigo, doc_id, nombre, tipo, obligatorio, orden, origen)
        VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(orden), 0) + 1 FROM documentos_requeridos WHERE codigo = ?), 'equipo')`)
      .bind(codigo, docId, nombre, tipo, body.obligatorio === false ? 0 : 1, codigo).run();
    await registrar(env, codigo, u.email, `${u.nombre} agregó al checklist «${nombre}»`);
    anotar(req, 'licitacion.checklist', `${u.nombre} agregó «${nombre}» al checklist de ${L}`, { codigo, datos: { docId, tipo, obligatorio: body.obligatorio !== false } });
  } else {
    throw new HttpError(404, 'Ruta no encontrada.');
  }
  return okVersion(env);
}

async function quitarRequerido(env, req, u, codigo, docId) {
  const lic = await licitacionOr404(env, codigo);
  const d = await env.DB.prepare('SELECT nombre, origen FROM documentos_requeridos WHERE codigo = ? AND doc_id = ?').bind(codigo, docId).first();
  if (!d) throw new HttpError(404, 'Documento no encontrado.');
  if (d.origen !== 'equipo') throw new HttpError(400, 'Solo se pueden quitar los documentos agregados por el equipo.');
  await batch(env, [
    env.DB.prepare('UPDATE archivos SET doc_id = NULL WHERE codigo = ? AND doc_id = ?').bind(codigo, docId),
    env.DB.prepare('DELETE FROM documentos_requeridos WHERE codigo = ? AND doc_id = ?').bind(codigo, docId),
  ]);
  await registrar(env, codigo, u.email, `${u.nombre} quitó del checklist «${d.nombre}»`);
  anotar(req, 'licitacion.checklist', `${u.nombre} quitó «${d.nombre}» del checklist de ${nombreLic(lic)}`, { codigo, datos: { docId } });
  return okVersion(env);
}

/* ---------------- archivos ---------------- */
function nombreSeguro(n) {
  const base = String(n || 'archivo').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').trim();
  return (base || 'archivo').slice(-150);
}
async function subirArchivo(env, req, u, codigo) {
  if (!env.FILES) throw new HttpError(503, 'El almacenamiento de archivos no está configurado.');
  const lic = await licitacionOr404(env, codigo);
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_ARCHIVO + 1024 * 1024) throw new HttpError(413, 'El archivo supera los 25 MB.');
  let form;
  try { form = await req.formData(); } catch { throw new HttpError(400, 'Formulario inválido.'); }
  const f = form.get('archivo');
  if (!f || typeof f === 'string') throw new HttpError(400, 'Adjunta un archivo.');
  if (!f.size) throw new HttpError(400, 'El archivo está vacío.');
  if (f.size > MAX_ARCHIVO) throw new HttpError(413, 'El archivo supera los 25 MB.');
  const nombre = nombreSeguro(f.name);
  const ext = (nombre.match(/\.([a-z0-9]{1,5})$/i) || [])[1]?.toLowerCase();
  if (!ext || !MIME[ext]) throw new HttpError(415, 'Tipo de archivo no permitido. Usa PDF, Word, Excel, PowerPoint, ZIP, imagen o texto.');
  const categoria = form.get('categoria') === 'preparado' ? 'preparado' : 'bases';
  let docId = str(form.get('doc_id'), 40) || null;
  if (docId) {
    const ok = await env.DB.prepare('SELECT 1 AS x FROM documentos_requeridos WHERE codigo = ? AND doc_id = ?').bind(codigo, docId).first();
    if (!ok) throw new HttpError(400, 'Documento del checklist inválido.');
  }
  const id = uid();
  const clave = `licitaciones/${codigo}/${id}`;
  await env.FILES.put(clave, await f.arrayBuffer(), { httpMetadata: { contentType: MIME[ext] }, customMetadata: { nombre, codigo, por: u.email } });
  try {
    await env.DB.prepare(`INSERT INTO archivos (id, codigo, doc_id, categoria, nombre, tipo_mime, tamano, clave_almacen, subido_por, fecha)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, codigo, docId, categoria, nombre, MIME[ext], f.size, clave, u.email, nowIso()).run();
  } catch (e) {
    await env.FILES.delete(clave); // no dejar archivos huérfanos
    throw e;
  }
  await registrar(env, codigo, u.email, `${u.nombre} subió «${nombre}»`);
  anotar(req, 'archivo.subir', `${u.nombre} subió «${nombre}» a ${nombreLic(lic)}`, { codigo, datos: { id, tamano: f.size, tipo: MIME[ext], categoria, docId } });
  return okVersion(env);
}
async function archivoOr404(env, id) {
  if (!RE_ID.test(id)) throw new HttpError(404, 'Archivo no encontrado.');
  const a = await env.DB.prepare('SELECT id, codigo, nombre, tipo_mime, clave_almacen, subido_por FROM archivos WHERE id = ?').bind(id).first();
  if (!a) throw new HttpError(404, 'Archivo no encontrado.');
  return a;
}
async function descargarArchivo(env, req, u, id) {
  if (!env.FILES) throw new HttpError(503, 'El almacenamiento de archivos no está configurado.');
  const a = await archivoOr404(env, id);
  anotar(req, 'archivo.descargar', `${u.nombre} descargó «${a.nombre}» (${a.codigo})`, { codigo: a.codigo, datos: { id } });
  const obj = await env.FILES.get(a.clave_almacen);
  if (!obj) throw new HttpError(404, 'El archivo ya no está disponible.');
  const ascii = a.nombre.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  return new Response(obj.body, {
    headers: {
      'content-type': a.tipo_mime,
      'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(a.nombre)}`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
// Todos los archivos adjuntos a los documentos del checklist, en un ZIP con una carpeta por documento
const MAX_ZIP = 90 * 1024 * 1024; // margen bajo la memoria de un Worker de Cloudflare (128 MB)
const nombreZip = (s, max = 80) => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim().slice(0, max).replace(/[ .]+$/, '') || 'documento';
async function exportarDocumentos(env, req, u, codigo) {
  if (!env.FILES) throw new HttpError(503, 'El almacenamiento de archivos no está configurado.');
  const lic = await licitacionOr404(env, codigo);
  const [docs, arch, listos] = await batch(env, [
    env.DB.prepare('SELECT doc_id, nombre, tipo, obligatorio FROM documentos_requeridos WHERE codigo = ? ORDER BY orden, doc_id').bind(codigo),
    env.DB.prepare(`SELECT a.id, a.doc_id, a.nombre, a.tamano, a.clave_almacen, a.fecha FROM archivos a
      JOIN documentos_requeridos d ON d.codigo = a.codigo AND d.doc_id = a.doc_id WHERE a.codigo = ? ORDER BY a.fecha`).bind(codigo),
    env.DB.prepare('SELECT doc_id FROM documentos_listos WHERE codigo = ?').bind(codigo),
  ]);
  if (!arch.results.length) throw new HttpError(404, 'Aún no hay archivos adjuntos a los documentos del checklist.');
  const total = arch.results.reduce((s, a) => s + Number(a.tamano || 0), 0);
  if (total > MAX_ZIP) throw new HttpError(413, `Los documentos suman ${Math.round(total / 1048576)} MB y superan el máximo de ${MAX_ZIP / 1048576} MB para un solo ZIP. Descárgalos por separado.`);

  const listo = new Set(listos.results.map((r) => r.doc_id));
  const entradas = [];
  const indice = [`Documentos de la licitación ${lic.codigo}`, lic.nombre, `Exportado desde Atalaya por ${u.nombre} el ${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}`, ''];
  let faltan = 0;
  docs.results.forEach((d, i) => {
    const propios = arch.results.filter((a) => a.doc_id === d.doc_id);
    const carpeta = `${String(i + 1).padStart(2, '0')} - ${nombreZip(d.nombre)}`;
    indice.push(`${String(i + 1).padStart(2, '0')}. ${d.nombre} [${d.tipo}${Number(d.obligatorio) ? ', obligatorio' : ''}] — ${listo.has(d.doc_id) ? 'LISTO' : 'pendiente'}`);
    if (!propios.length) { indice.push('    (sin archivo adjunto)'); return; }
    const usados = new Set();
    for (const a of propios) {
      let n = nombreZip(a.nombre, 120);
      for (let k = 2; usados.has(n.toLowerCase()); k++) n = nombreZip(a.nombre, 120).replace(/(\.[^.]+)?$/, ` (${k})$1`);
      usados.add(n.toLowerCase());
      entradas.push({ ruta: `${carpeta}/${n}`, a });
      indice.push(`    - ${n}`);
    }
  });
  for (const e of entradas) {
    const obj = await env.FILES.get(e.a.clave_almacen);
    if (!obj) { faltan++; e.datos = null; continue; }
    e.datos = new Uint8Array(await new Response(obj.body).arrayBuffer());
  }
  if (faltan) indice.push('', `Atención: ${faltan} archivo(s) registrados ya no estaban disponibles en el almacenamiento.`);
  const zip = crearZip([
    { nombre: '00 - Índice de documentos.txt', datos: new TextEncoder().encode(indice.join('\r\n') + '\r\n') },
    ...entradas.filter((e) => e.datos).map((e) => ({ nombre: e.ruta, datos: e.datos, fecha: new Date(e.a.fecha) })),
  ]);
  const archivo = `${lic.codigo} - documentos.zip`;
  anotar(req, 'archivo.exportar', `${u.nombre} descargó en un ZIP los ${entradas.length - faltan} archivos del checklist de ${nombreLic(lic)}`, { codigo, datos: { archivos: entradas.length - faltan, bytes: zip.length } });
  return new Response(zip, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${archivo.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(archivo)}`,
      'content-length': String(zip.length),
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
async function borrarArchivo(env, req, u, id) {
  const a = await archivoOr404(env, id);
  if (a.subido_por !== u.email && u.rol !== 'admin') throw new HttpError(403, 'Solo quien subió el archivo o la administración pueden borrarlo.');
  await env.DB.prepare('DELETE FROM archivos WHERE id = ?').bind(id).run();
  if (env.FILES) await env.FILES.delete(a.clave_almacen);
  await registrar(env, a.codigo, u.email, `${u.nombre} borró «${a.nombre}»`);
  anotar(req, 'archivo.borrar', `${u.nombre} borró «${a.nombre}» de ${a.codigo}`, { codigo: a.codigo, datos: { id } });
  return okVersion(env);
}

/* ---------------- registro de actividad (auditoría) ---------------- */
// Cada solicitud lleva un objeto "aud" donde las acciones anotan una frase legible.
// Al terminar, handle() lo guarda junto al detalle técnico (método, ruta, respuesta, IP, navegador, duración).
const AUD = new WeakMap();
const aud = (req) => AUD.get(req) || {};
function anotar(req, accion, descripcion, extra = {}) {
  const a = AUD.get(req);
  if (a) Object.assign(a, { accion, descripcion, ...extra });
}
const nombreLic = (l) => (l ? `«${l.nombre}» (${l.codigo})` : '');
// Frases para solicitudes que fallan antes de que la acción alcance a anotarse
const ACCION_POR_RUTA = [
  [/^\/api\/ingresar$/, 'sesion.ingreso', 'Intento de ingreso con contraseña'],
  [/^\/api\/activar$/, 'sesion.activacion', 'Intento de activar una cuenta'],
  [/^\/api\/reporte$/, 'agente.reporte', 'Intento de carga del reporte del agente'],
  [/\/estado$/, 'licitacion.estado', 'Intento de cambiar el estado de una licitación'],
  [/\/responsable$/, 'licitacion.responsable', 'Intento de cambiar el responsable de una licitación'],
  [/\/documentos$/, 'licitacion.documento', 'Intento de marcar un documento'],
  [/\/notas$/, 'licitacion.nota', 'Intento de guardar una nota'],
  [/\/requeridos/, 'licitacion.checklist', 'Intento de modificar el checklist'],
  [/\/archivos/, 'archivo', 'Intento de operar con un archivo'],
  [/^\/api\/equipo/, 'usuarios', 'Intento de modificar usuarios'],
  [/^\/api\/configuracion\/palabras/, 'palabras', 'Intento de modificar las palabras clave'],
];
async function guardarAuditoria(env, req, res, inicio) {
  const a = aud(req);
  const url = new URL(req.url);
  const ok = res.status < 400 && !a.fallo;
  let { accion, descripcion } = a;
  if (!descripcion) {
    if (ok) return; // lecturas y consultas sin efecto: no se registran
    if (req.method === 'GET' || [401].includes(res.status) && !/^\/api\/(ingresar|activar|reporte)$/.test(url.pathname)) return;
    const hit = ACCION_POR_RUTA.find(([re]) => re.test(url.pathname));
    if (!hit) return;
    [, accion, descripcion] = hit;
  }
  let error = null;
  if (!ok) { try { error = (await res.clone().json()).error; } catch { /* sin cuerpo */ } }
  const quien = a.usuario || 'anónimo';
  const detalle = {
    metodo: req.method, ruta: url.pathname, respuesta: res.status, duracion_ms: Date.now() - inicio,
    ip: clientIp(req), navegador: (req.headers.get('user-agent') || '').slice(0, 300),
    ...(error ? { error } : {}), ...(a.datos ? { datos: a.datos } : {}),
  };
  try {
    await env.DB.prepare('INSERT INTO auditoria (id, fecha, usuario, accion, descripcion, codigo, resultado, detalle) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(uid(), nowIso(), quien, accion || 'otro', ok ? descripcion : `${descripcion}${error ? ` — no se pudo: ${error}` : ''}`,
        a.codigo || null, ok ? 'ok' : 'error', JSON.stringify(detalle)).run();
  } catch (e) { console.error('[auditoria]', e); }
}
async function leerAuditoria(env, url) {
  const limite = Math.min(200, Math.max(10, Number(url.searchParams.get('limite')) || 50));
  const antes = str(url.searchParams.get('antes'), 40);
  const q = str(url.searchParams.get('q'), 100).toLowerCase();
  const usuario = str(url.searchParams.get('usuario'), 254).toLowerCase();
  const resultado = url.searchParams.get('resultado');
  const cond = [], args = [];
  if (antes) { cond.push('fecha < ?'); args.push(antes); }
  if (usuario) { cond.push('usuario = ?'); args.push(usuario); }
  if (resultado === 'error' || resultado === 'ok') { cond.push('resultado = ?'); args.push(resultado); }
  if (q) { cond.push('(lower(descripcion) LIKE ? OR lower(COALESCE(codigo, \'\')) LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
  const r = await env.DB.prepare(`SELECT id, fecha, usuario, accion, descripcion, codigo, resultado, detalle FROM auditoria
      ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY fecha DESC LIMIT ?`).bind(...args, limite + 1).all();
  const filas = r.results.slice(0, limite).map((x) => ({ ...x, detalle: x.detalle ? JSON.parse(x.detalle) : null }));
  return { registros: filas, hayMas: r.results.length > limite };
}

/* ---------------- ingreso con Google (OpenID Connect) ---------------- */
const OAUTH_COOKIE = 'atalaya_oauth';
const googleOn = (env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
const redir = (to, cookiesSet = []) => {
  const h = new Headers({ location: to, 'cache-control': 'no-store' });
  for (const c of cookiesSet) h.append('set-cookie', c);
  return new Response(null, { status: 302, headers: h });
};
async function googleInicio(env, req) {
  if (!googleOn(env)) return redir('/?error_login=google_off');
  const url = new URL(req.url);
  const state = b64u(crypto.getRandomValues(new Uint8Array(24)));
  const verifier = b64u(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64u(await crypto.subtle.digest('SHA-256', enc.encode(verifier)));
  const exp = Date.now() + 10 * 60000;
  const val = `${state}.${verifier}.${exp}`;
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  const cookie = `${OAUTH_COOKIE}=${val}.${await hmac(env.SESSION_SECRET, 'oauth:' + val)}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: `${url.origin}/api/auth/google/callback`, response_type: 'code',
    scope: 'openid email profile', state, code_challenge: challenge, code_challenge_method: 'S256',
    prompt: 'select_account', hd: config(env).domain,
  });
  return redir(`https://accounts.google.com/o/oauth2/v2/auth?${q}`, [cookie]);
}
async function googleVuelta(env, req) {
  const url = new URL(req.url);
  const cfg = config(env);
  const limpiar = `${OAUTH_COOKIE}=; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=0`;
  const fallo = (codigo, motivo, usuario) => {
    anotar(req, 'sesion.google', `Ingreso con Google rechazado${usuario ? ` para ${usuario}` : ''}: ${motivo}`, { usuario: usuario || 'anónimo', datos: { motivo: codigo } });
    AUD.get(req).fallo = true;
    return redir(`/?error_login=${codigo}`, [limpiar]);
  };
  if (!googleOn(env)) return fallo('google_off', 'el ingreso con Google no está configurado');
  if (url.searchParams.get('error')) return fallo('cancelado', 'la persona canceló en Google');
  const raw = cookies(req)[OAUTH_COOKIE] || '';
  const partes = raw.split('.');
  if (partes.length !== 4) return fallo('estado', 'la sesión de Google expiró o no es válida');
  const [state, verifier, exp, firma] = partes;
  if (!safeEqual(firma, await hmac(env.SESSION_SECRET, `oauth:${state}.${verifier}.${exp}`)) || Number(exp) < Date.now()
    || !safeEqual(url.searchParams.get('state') || '', state)) return fallo('estado', 'la sesión de Google expiró o no es válida');
  const code = url.searchParams.get('code');
  if (!code) return fallo('google', 'Google no entregó un código');
  let tok;
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${url.origin}/api/auth/google/callback`, grant_type: 'authorization_code', code_verifier: verifier }),
    });
    tok = await r.json();
    if (!r.ok || !tok.id_token) return fallo('google', 'Google rechazó el código');
  } catch { return fallo('google', 'no se pudo contactar a Google'); }
  // El id_token llega directo desde Google por TLS (OIDC Core 3.1.3.7): basta validar sus campos.
  let c;
  try { c = JSON.parse(fromB64uText(tok.id_token.split('.')[1])); } catch { return fallo('google', 'respuesta de Google inválida'); }
  const email = String(c.email || '').toLowerCase();
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(c.iss) || c.aud !== env.GOOGLE_CLIENT_ID || !(c.exp * 1000 > Date.now()))
    return fallo('google', 'el token de Google no es válido', email);
  if (c.email_verified !== true && c.email_verified !== 'true') return fallo('verificado', 'el correo no está verificado en Google', email);
  if (!email.endsWith('@' + cfg.domain) || (c.hd && c.hd !== cfg.domain)) return fallo('dominio', `el correo no es @${cfg.domain}`, email);
  const u = await env.DB.prepare('SELECT email, nombre FROM usuarios WHERE email = ?').bind(email).first();
  if (!u) return fallo('no_registrado', 'el correo no está registrado en el equipo', email);
  await env.DB.prepare('UPDATE usuarios SET ultimo_ingreso = ? WHERE email = ?').bind(nowIso(), email).run();
  anotar(req, 'sesion.google', `${u.nombre} ingresó con Google`, { usuario: email });
  return redir('/', [limpiar, await crearSesion(env, email, req)]);
}

/* ---------------- configuración: palabras clave del agente ---------------- */
const RE_PALABRA = /^[\p{L}\p{N}][\p{L}\p{N} .\-\/+#&]{0,78}$/u;
async function listaPalabras(env) {
  const r = await env.DB.prepare('SELECT palabra, peso, activa, creada_por, creada FROM palabras_vigiladas ORDER BY peso < 0, palabra').all();
  return r.results.map((x) => ({ palabra: x.palabra, peso: Number(x.peso), activa: !!Number(x.activa), creadaPor: x.creada_por, creada: x.creada }));
}
async function rutasPalabras(env, req, u, palabra) {
  if (req.method === 'GET' && !palabra) return json({ palabras: await listaPalabras(env) });
  if (u.rol !== 'admin') throw new HttpError(403, 'Solo la administración puede cambiar las palabras clave.');
  if (req.method === 'POST' && !palabra) {
    const b = await readJson(req, 2000);
    const p = str(b.palabra, 80).toLowerCase().replace(/\s+/g, ' ');
    if (!RE_PALABRA.test(p)) throw new HttpError(400, 'Escribe una palabra o frase válida (letras, números y espacios).');
    const peso = Math.round(Number(b.peso));
    if (!peso || peso < -5 || peso > 5) throw new HttpError(400, 'El peso debe estar entre -5 y 5, distinto de 0.');
    const ya = await env.DB.prepare('SELECT peso FROM palabras_vigiladas WHERE palabra = ?').bind(p).first();
    if (ya) throw new HttpError(409, `«${p}» ya está en la lista.`);
    await env.DB.prepare('INSERT INTO palabras_vigiladas (palabra, peso, activa, creada_por, creada) VALUES (?, ?, 1, ?, ?)').bind(p, peso, u.email, nowIso()).run();
    anotar(req, 'palabras.agregar', `${u.nombre} agregó la palabra clave «${p}» (${peso > 0 ? 'suma' : 'resta'} ${Math.abs(peso)})`, { datos: { palabra: p, peso } });
    return okVersion(env);
  }
  const p = decodeURIComponent(palabra || '').toLowerCase();
  const actual = await env.DB.prepare('SELECT peso, activa FROM palabras_vigiladas WHERE palabra = ?').bind(p).first();
  if (!actual) throw new HttpError(404, 'Esa palabra clave no existe.');
  if (req.method === 'PATCH') {
    const b = await readJson(req, 2000);
    const peso = b.peso === undefined ? Number(actual.peso) : Math.round(Number(b.peso));
    if (!peso || peso < -5 || peso > 5) throw new HttpError(400, 'El peso debe estar entre -5 y 5, distinto de 0.');
    const activa = b.activa === undefined ? !!Number(actual.activa) : !!b.activa;
    await env.DB.prepare('UPDATE palabras_vigiladas SET peso = ?, activa = ? WHERE palabra = ?').bind(peso, activa ? 1 : 0, p).run();
    const cambios = [];
    if (peso !== Number(actual.peso)) cambios.push(`peso ${actual.peso} → ${peso}`);
    if (activa !== !!Number(actual.activa)) cambios.push(activa ? 'reactivada' : 'pausada');
    anotar(req, 'palabras.editar', `${u.nombre} modificó la palabra clave «${p}»${cambios.length ? ': ' + cambios.join(', ') : ''}`, { datos: { palabra: p, antes: actual, despues: { peso, activa } } });
    return okVersion(env);
  }
  if (req.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM palabras_vigiladas WHERE palabra = ?').bind(p).run();
    anotar(req, 'palabras.eliminar', `${u.nombre} eliminó la palabra clave «${p}»`, { datos: { palabra: p, peso: Number(actual.peso) } });
    return okVersion(env);
  }
  throw new HttpError(405, 'Método no permitido.');
}

/* ---------------- adjuntos de Mercado Público ---------------- */
// El enlace a los adjuntos lleva un token que cambia en cada visita: se lee la ficha en el momento y se redirige.
async function irAdjuntos(env, req, u, codigo) {
  const l = await licitacionOr404(env, codigo);
  const ficha = `https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${encodeURIComponent(codigo)}`;
  let destino = ficha;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 10000);
    const r = await fetch(ficha, { signal: ctl.signal, headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', 'accept-language': 'es-CL,es;q=0.9' } });
    clearTimeout(t);
    const html = (await r.text()).replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    const m = html.match(/ViewAttachment\.aspx\?enc=([A-Za-z0-9%+/=._-]+)/);
    if (m) destino = `https://www.mercadopublico.cl/Procurement/Modules/Attachment/ViewAttachment.aspx?enc=${m[1]}`;
  } catch { /* si Mercado Público no responde, se abre la ficha */ }
  anotar(req, 'licitacion.adjuntos', `${u.nombre} abrió los adjuntos de ${nombreLic(l)} en Mercado Público`, { codigo, datos: { directo: destino !== ficha } });
  return redir(destino);
}

/* ---------------- línea de tiempo pública (sin sesión) ---------------- */
// Solo lo necesario para la "carrera de licitaciones": sin correos, montos, notas, documentos ni archivos.
async function lineaPublica(env) {
  const D = env.DB;
  const [lics, fec, ult] = await batch(env, [
    D.prepare(`SELECT l.codigo, l.nombre, o.nombre AS organismo, COALESCE(s.estado, 'nueva') AS estado, u.nombre AS responsable
      FROM licitaciones l
      LEFT JOIN organismos o ON o.id = l.organismo_id
      LEFT JOIN seguimiento s ON s.codigo = l.codigo
      LEFT JOIN usuarios u ON u.email = s.responsable
      WHERE COALESCE(s.estado, 'nueva') NOT IN ('descartada', 'noadjudicada')`),
    D.prepare('SELECT codigo, hito, fecha FROM licitacion_fechas'),
    D.prepare('SELECT generado FROM reportes ORDER BY id DESC LIMIT 1'),
  ]);
  const F = {};
  for (const r of fec.results) (F[r.codigo] ||= {})[r.hito] = r.fecha;
  return {
    actualizado: ult.results[0]?.generado || null,
    licitaciones: lics.results
      .map((l) => ({ codigo: l.codigo, nombre: l.nombre, organismo: l.organismo || '', estado: l.estado, responsable: l.responsable || null, fechas: F[l.codigo] || {} }))
      .filter((l) => l.fechas.cierre),
  };
}

/* ---------------- administración del equipo ---------------- */
async function rutasEquipo(env, req, u, cfg, email) {
  if (u.rol !== 'admin') throw new HttpError(403, 'Solo la administración puede gestionar los usuarios.');
  if (req.method === 'POST' && !email) {
    const b = await readJson(req, 5000);
    const correo = str(b.email, 254).toLowerCase();
    if (!RE_EMAIL.test(correo) || !correo.endsWith('@' + cfg.domain)) throw new HttpError(400, `El correo debe ser @${cfg.domain}.`);
    const ya = await env.DB.prepare('SELECT email FROM usuarios WHERE email = ?').bind(correo).first();
    if (ya) throw new HttpError(409, 'Ese correo ya está registrado.');
    const nombre = str(b.nombre, 80) || nombreDesdeCorreo(correo);
    const rol = b.rol === 'admin' ? 'admin' : 'equipo';
    await env.DB.prepare('INSERT INTO usuarios (email, nombre, cargo, rol, creado) VALUES (?, ?, ?, ?, ?)').bind(correo, nombre, str(b.cargo, 80), rol, nowIso()).run();
    anotar(req, 'usuarios.crear', `${u.nombre} creó el usuario ${nombre} (${correo}) con rol ${rol === 'admin' ? 'administración' : 'equipo'}`, { datos: { email: correo, nombre, cargo: str(b.cargo, 80), rol } });
    await bump(env);
    return json({ ok: true });
  }
  const correo = decodeURIComponent(email || '').toLowerCase();
  const actual = await env.DB.prepare('SELECT email, nombre, cargo, rol FROM usuarios WHERE email = ?').bind(correo).first();
  if (!actual) throw new HttpError(404, 'Usuario no encontrado.');
  if (req.method === 'PATCH') {
    const b = await readJson(req, 5000);
    const nombre = str(b.nombre, 80) || actual.nombre;
    const cargo = b.cargo === undefined ? actual.cargo : str(b.cargo, 80);
    const rol = b.rol === undefined ? actual.rol : b.rol === 'admin' ? 'admin' : 'equipo';
    if (rol !== actual.rol && correo === u.email) throw new HttpError(400, 'No puedes cambiar tu propio rol.');
    if (rol !== 'admin' && cfg.admins.includes(correo)) throw new HttpError(400, 'Esta cuenta es administradora por configuración del servidor (ADMIN_EMAILS).');
    await env.DB.prepare('UPDATE usuarios SET nombre = ?, cargo = ?, rol = ? WHERE email = ?').bind(nombre, cargo, rol, correo).run();
    const cambios = [];
    if (nombre !== actual.nombre) cambios.push(`nombre «${actual.nombre}» → «${nombre}»`);
    if (cargo !== actual.cargo) cambios.push(`cargo «${actual.cargo || '—'}» → «${cargo || '—'}»`);
    if (rol !== actual.rol) cambios.push(`rol ${actual.rol} → ${rol}`);
    anotar(req, 'usuarios.editar', `${u.nombre} modificó el usuario ${nombre}${cambios.length ? ': ' + cambios.join(', ') : ''}`, { datos: { email: correo, antes: actual, despues: { nombre, cargo, rol } } });
    await bump(env);
    return json({ ok: true });
  }
  if (req.method === 'DELETE') {
    if (correo === u.email) throw new HttpError(400, 'No puedes eliminar tu propia cuenta.');
    if (cfg.admins.includes(correo)) throw new HttpError(400, 'Las cuentas de ADMIN_EMAILS se gestionan en la configuración del servidor.');
    await batch(env, [
      env.DB.prepare('UPDATE seguimiento SET responsable = NULL WHERE responsable = ?').bind(correo),
      env.DB.prepare('DELETE FROM usuarios WHERE email = ?').bind(correo),
    ]);
    anotar(req, 'usuarios.eliminar', `${u.nombre} eliminó al usuario ${actual.nombre} (${correo}); sus licitaciones quedaron sin responsable`, { datos: { email: correo } });
    await bump(env);
    return json({ ok: true });
  }
  if (req.method === 'POST') { // restablecer acceso: borra la contraseña y cierra sus sesiones
    await env.DB.prepare("UPDATE usuarios SET hash = '', salt = '', revocado_desde = ? WHERE email = ?").bind(Date.now(), correo).run();
    anotar(req, 'usuarios.restablecer', `${u.nombre} restableció el acceso de ${actual.nombre}: se cerraron sus sesiones y deberá activar su cuenta otra vez`, { datos: { email: correo } });
    await bump(env);
    return json({ ok: true });
  }
  throw new HttpError(405, 'Método no permitido.');
}

/* ---------------- avisos por correo ---------------- */
// Los correos salen en segundo plano: guardar una nota o asignar no espera al servidor de correo.
// El resultado de cada envío queda en el registro de actividad (correo.asignacion / correo.nota).
const baseUrl = (env, req) => (env.APP_URL || new URL(req.url).origin).replace(/\/$/, '');
const enlaceLic = (env, req, codigo) => `${baseUrl(env, req)}/#/licitacion/${encodeURIComponent(codigo)}`;
async function datosAviso(env, codigo) {
  return env.DB.prepare(`SELECT l.codigo, l.nombre, o.nombre AS organismo, COALESCE(s.estado, 'nueva') AS estado,
      (SELECT fecha FROM licitacion_fechas f WHERE f.codigo = l.codigo AND f.hito = 'cierre') AS cierre,
      u.nombre AS responsable_nombre,
      (SELECT COUNT(*) FROM documentos_requeridos d WHERE d.codigo = l.codigo AND d.obligatorio = 1
         AND NOT EXISTS (SELECT 1 FROM documentos_listos x WHERE x.codigo = d.codigo AND x.doc_id = d.doc_id)) AS pendientes
    FROM licitaciones l LEFT JOIN organismos o ON o.id = l.organismo_id LEFT JOIN seguimiento s ON s.codigo = l.codigo
    LEFT JOIN usuarios u ON u.email = s.responsable WHERE l.codigo = ?`).bind(codigo).first();
}
function avisar(env, req, { accion, codigo, usuario, para, descripcion, descripcionError, mensaje }) {
  if (!env.CORREO || !para.length) return;
  const tarea = (async () => {
    let error = null;
    try { await env.CORREO.enviar({ para, ...mensaje, responderA: accion === 'correo.nota' ? usuario : undefined }); }
    catch (e) { error = String(e.message || e).slice(0, 400); console.error('[correo]', error); }
    await env.DB.prepare('INSERT INTO auditoria (id, fecha, usuario, accion, descripcion, codigo, resultado, detalle) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(uid(), nowIso(), usuario, accion, error ? `${descripcionError}: ${error}` : descripcion, codigo || null,
        error ? 'error' : 'ok', JSON.stringify({ destinatarios: para, asunto: mensaje.asunto, ...(error ? { error } : {}) })).run();
  })().catch((e) => console.error('[correo]', e));
  if (typeof env.EN_SEGUNDO_PLANO === 'function') env.EN_SEGUNDO_PLANO(tarea);
}
async function rutasCorreo(env, req, u, accion) {
  if (!accion && req.method === 'GET') {
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM usuarios').first();
    return json({ activo: !!env.CORREO, remitente: env.CORREO?.remitente || null, equipo: Number(n.n) });
  }
  if (accion === 'prueba' && req.method === 'POST') {
    if (u.rol !== 'admin') throw new HttpError(403, 'Solo la administración puede enviar correos de prueba.');
    if (!env.CORREO) throw new HttpError(503, 'El correo no está configurado en el servidor (faltan SMTP_HOST, SMTP_USER o SMTP_PASSWORD).');
    try {
      await env.CORREO.enviar({ para: [u.email], ...correoPrueba({ persona: u, url: baseUrl(env, req) }) });
    } catch (e) {
      anotar(req, 'correo.prueba', `${u.nombre} intentó enviar un correo de prueba`, { fallo: true, datos: { error: String(e.message || e).slice(0, 400) } });
      throw new HttpError(502, `No se pudo enviar: ${e.message}`);
    }
    anotar(req, 'correo.prueba', `${u.nombre} envió un correo de prueba a ${u.email}`);
    return json({ ok: true, para: u.email });
  }
  throw new HttpError(405, 'Método no permitido.');
}

/* ---------------- enrutador ---------------- */
export async function handle(req, env) {
  const inicio = Date.now();
  AUD.set(req, {});
  let res;
  try {
    res = await rutear(req, env);
  } catch (e) {
    if (e instanceof HttpError) res = err(e.status, e.message);
    else { console.error('[api]', e); res = err(500, 'Error interno del servidor.'); }
  }
  if (env.DB && ready) await guardarAuditoria(env, req, res, inicio);
  return res;
}

async function rutear(req, env) {
  const url = new URL(req.url);
  const path = url.pathname;
  {
    const cfg = config(env);
    // Rutas que no necesitan la base de datos: responden al instante
    if (path === '/api/salud') return json({ ok: true });
    await ensureReady(env);
    // Configuración pública de la pantalla de ingreso
    if (path === '/api/config') return json({ google: googleOn(env), dominio: cfg.domain });
    if (path === '/api/publico/linea' && req.method === 'GET') return json(await lineaPublica(env), 200, { 'cache-control': 'public, max-age=60' });
    if (path === '/api/auth/google') return await googleInicio(env, req);
    if (path === '/api/auth/google/callback') return await googleVuelta(env, req);
    if (path === '/api/salir' && req.method === 'POST') {
      const quien = await usuarioSesion(env, req);
      if (quien) anotar(req, 'sesion.salida', `${quien.nombre} cerró sesión`, { usuario: quien.email });
      return json({ ok: true }, 200, { 'set-cookie': borrarCookie });
    }

    // Palabras clave para el agente (autenticado con token)
    if (path === '/api/agente/palabras' && req.method === 'GET') {
      if (!env.AGENT_TOKEN || !safeEqual(req.headers.get('authorization') || '', `Bearer ${env.AGENT_TOKEN}`)) {
        await limitar(env, 'agente:' + clientIp(req), 20, 15 * 60000);
        return err(401, 'Token del agente inválido.');
      }
      const ps = (await listaPalabras(env)).filter((x) => x.activa);
      anotar(req, 'agente.palabras', `El agente descargó las palabras clave para su consulta (${ps.filter((x) => x.peso > 0).length} que suman, ${ps.filter((x) => x.peso < 0).length} que restan)`, { usuario: 'agente' });
      return json({ positivas: Object.fromEntries(ps.filter((x) => x.peso > 0).map((x) => [x.palabra, x.peso])),
        negativas: Object.fromEntries(ps.filter((x) => x.peso < 0).map((x) => [x.palabra, x.peso])) });
    }

    // Reporte diario del agente (autenticado con token, sin cookie)
    if (path === '/api/reporte') {
      if (req.method !== 'POST') return err(405, 'Usa POST.');
      if (!env.AGENT_TOKEN || env.AGENT_TOKEN.length < 24) return err(503, 'AGENT_TOKEN no está configurado en el servidor.');
      const auth = req.headers.get('authorization') || '';
      if (!safeEqual(auth, `Bearer ${env.AGENT_TOKEN}`)) {
        anotar(req, 'agente.reporte', 'Intento de carga del reporte con un token inválido', { usuario: 'anónimo' });
        await limitar(env, 'agente:' + clientIp(req), 20, 15 * 60000);
        return err(401, 'Token del agente inválido.');
      }
      anotar(req, 'agente.reporte', 'Intento de carga del reporte del agente', { usuario: 'agente' });
      const r = await ingerirReporte(env, await readJson(req, 10_000_000));
      anotar(req, 'agente.reporte', `El agente cargó su reporte: ${r.recibidas} licitaciones (${r.nuevas} nuevas)`, { usuario: 'agente', datos: r });
      return json({ ok: true, ...r });
    }

    // Protección CSRF para escrituras desde el navegador
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = req.headers.get('origin');
      if ((origin && origin !== url.origin) || req.headers.get('sec-fetch-site') === 'cross-site') return err(403, 'Origen no permitido.');
    }

    if (path === '/api/ingresar' && req.method === 'POST') {
      const b = await readJson(req, 5000);
      const email = str(b.email, 254).toLowerCase(), pass = typeof b.password === 'string' ? b.password : '';
      anotar(req, 'sesion.ingreso', `Intento de ingreso con contraseña de ${email || '(sin correo)'}`, { usuario: email || 'anónimo' });
      const [rIp, rMail, rUser] = await batch(env, [
        intento(env, 'ip:' + clientIp(req), 15 * 60000),
        intento(env, 'login:' + email, 15 * 60000),
        env.DB.prepare('SELECT email, nombre, cargo, rol, hash, salt FROM usuarios WHERE email = ?').bind(email),
      ]);
      revisarIntentos(rIp, 30);
      revisarIntentos(rMail, 5);
      const u = rUser.results[0];
      const ok = u && u.hash && safeEqual(await pbkdf2(pass, u.salt), u.hash);
      if (!ok) return err(401, u && !u.hash ? 'Tu cuenta aún no está activada. Usa "Activar mi cuenta".' : 'Correo o contraseña incorrectos.');
      await batch(env, [
        env.DB.prepare('DELETE FROM limites WHERE clave = ?').bind('login:' + email),
        env.DB.prepare('UPDATE usuarios SET ultimo_ingreso = ? WHERE email = ?').bind(nowIso(), email),
      ]);
      anotar(req, 'sesion.ingreso', `${u.nombre} ingresó con contraseña`, { usuario: email });
      return json({ ok: true, usuario: { email: u.email, nombre: u.nombre, cargo: u.cargo, rol: u.rol } }, 200, { 'set-cookie': await crearSesion(env, email, req) });
    }

    if (path === '/api/activar' && req.method === 'POST') {
      const b = await readJson(req, 5000);
      const email = str(b.email, 254).toLowerCase(), pass = typeof b.password === 'string' ? b.password : '';
      anotar(req, 'sesion.activacion', `Intento de activar la cuenta ${email || '(sin correo)'}`, { usuario: email || 'anónimo' });
      await limitar(env, 'activar:' + clientIp(req), 10, 15 * 60000);
      // Solo correos del dominio de la empresa, registrados por la administración y aún sin contraseña
      if (!RE_EMAIL.test(email) || !email.endsWith('@' + cfg.domain)) return err(400, `Solo se aceptan correos @${cfg.domain}.`);
      if (pass.length < 10) return err(400, 'La contraseña debe tener al menos 10 caracteres.');
      const u = await env.DB.prepare('SELECT hash FROM usuarios WHERE email = ?').bind(email).first();
      if (!u) return err(403, 'Ese correo no está registrado en el equipo. Pide a la administración que te agregue.');
      if (u.hash) return err(409, 'Esa cuenta ya está activada. Si olvidaste la contraseña, pide a la administración que restablezca tu acceso.');
      const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
      await env.DB.prepare('UPDATE usuarios SET hash = ?, salt = ?, revocado_desde = ?, ultimo_ingreso = ? WHERE email = ? AND hash = \'\'')
        .bind(await pbkdf2(pass, salt), salt, Date.now() - 1, nowIso(), email).run();
      anotar(req, 'sesion.activacion', `${email} activó su cuenta y creó su contraseña`, { usuario: email });
      await bump(env);
      return json({ ok: true }, 200, { 'set-cookie': await crearSesion(env, email, req) });
    }

    const u = await usuarioSesion(env, req);
    if (!u) return err(401, 'Debes ingresar.');
    aud(req).usuario = u.email;

    if (path === '/api/sesion') return json({ usuario: u });
    if (path === '/api/version') return json({ version: await version(env) });
    if (path === '/api/datos' && req.method === 'GET') return json({ usuario: u, ...(await datos(env)) });

    let m = path.match(/^\/api\/licitaciones\/([^/]+)\/(estado|responsable|documentos|notas|requeridos)$/);
    if (m && req.method === 'POST') return await rutasLicitacion(env, req, u, decodeURIComponent(m[1]), m[2]);
    m = path.match(/^\/api\/licitaciones\/([^/]+)\/requeridos\/([^/]+)$/);
    if (m && req.method === 'DELETE') return await quitarRequerido(env, req, u, decodeURIComponent(m[1]), decodeURIComponent(m[2]));
    m = path.match(/^\/api\/licitaciones\/([^/]+)\/adjuntos$/);
    if (m && req.method === 'GET') return await irAdjuntos(env, req, u, decodeURIComponent(m[1]));
    m = path.match(/^\/api\/licitaciones\/([^/]+)\/documentos\.zip$/);
    if (m && req.method === 'GET') return await exportarDocumentos(env, req, u, decodeURIComponent(m[1]));
    m = path.match(/^\/api\/licitaciones\/([^/]+)\/archivos$/);
    if (m && req.method === 'POST') return await subirArchivo(env, req, u, decodeURIComponent(m[1]));
    m = path.match(/^\/api\/archivos\/([^/]+)$/);
    if (m && req.method === 'GET') return await descargarArchivo(env, req, u, m[1]);
    if (m && req.method === 'DELETE') return await borrarArchivo(env, req, u, m[1]);
    m = path.match(/^\/api\/configuracion\/palabras(?:\/([^/]+))?$/);
    if (m) return await rutasPalabras(env, req, u, m[1]);
    if (path === '/api/auditoria' && req.method === 'GET') return json(await leerAuditoria(env, url));

    m = path.match(/^\/api\/correo(?:\/(prueba))?$/);
    if (m) return await rutasCorreo(env, req, u, m[1]);
    m = path.match(/^\/api\/equipo(?:\/([^/]+))?$/);
    if (m) return await rutasEquipo(env, req, u, cfg, m[1]);

    return err(404, 'Ruta no encontrada.');
  }
}

export { ingerirReporte };
