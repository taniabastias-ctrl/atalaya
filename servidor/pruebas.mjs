// Pruebas de la API de Atalaya contra una base SQLite en memoria y un almacén de archivos temporal.
//   node servidor/pruebas.mjs
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from './api.mjs';
import { crearDB } from './db-sqlite.mjs';
import { crearAlmacen } from './archivos-disco.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirArchivos = mkdtempSync(path.join(tmpdir(), 'atalaya-pruebas-'));
const env = {
  DB: crearDB(':memory:'),
  FILES: crearAlmacen(dirArchivos),
  SCHEMA_SQL: readFileSync(path.join(RAIZ, 'servidor', 'schema.sql'), 'utf8'),
  SESSION_SECRET: 'x'.repeat(40), AGENT_TOKEN: 'a'.repeat(30),
  ADMIN_EMAILS: 'camila.rojas@sermaluc.cl', DEMO: '1',
  DEMO_DATA: JSON.parse(readFileSync(path.join(RAIZ, 'data', 'demo.json'), 'utf8')),
};
const B = 'http://localhost:8080';
let cookie = '';
async function call(method, p, body, headers = {}) {
  const isForm = body instanceof FormData;
  const r = await handle(new Request(B + p, {
    method, body: body == null ? undefined : isForm ? body : JSON.stringify(body),
    headers: { ...(isForm || body == null ? {} : { 'content-type': 'application/json' }), origin: B, cookie, ...headers },
  }), env);
  const sc = (r.headers.getSetCookie?.() || []).find((c) => c.startsWith('atalaya_sesion=')); if (sc) cookie = sc.split(';')[0];
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, data: ct.includes('json') ? await r.json() : await r.arrayBuffer(), headers: r.headers };
}
const datos = async () => (await call('GET', '/api/datos')).data;
let n = 0;
const ok = (msg) => console.log(`  ✔ ${msg}`) || n++;

try {
  console.log('Sesión');
  assert.equal((await call('GET', '/api/datos')).status, 401); ok('sin sesión → 401');
  assert.equal((await call('POST', '/api/activar', { email: 'camila.rojas@gmail.com', password: 'secreta12345' })).status, 400); ok('activar: rechaza correos que no son @sermaluc.cl');
  assert.equal((await call('POST', '/api/activar', { email: 'no.registrado@sermaluc.cl', password: 'secreta12345' })).status, 403); ok('activar: rechaza correos no registrados');
  assert.equal((await call('POST', '/api/activar', { email: 'camila.rojas@sermaluc.cl', password: 'corta' })).status, 400); ok('activar: exige 10 caracteres');
  assert.equal((await call('POST', '/api/activar', { email: 'camila.rojas@sermaluc.cl', password: 'secreta12345' })).status, 200); ok('activa la cuenta sin clave del equipo');
  assert.equal((await call('POST', '/api/activar', { email: 'camila.rojas@sermaluc.cl', password: 'otra12345678' })).status, 409); ok('no permite re-activar una cuenta ya activada');
  const r = await call('POST', '/api/ingresar', { email: 'camila.rojas@sermaluc.cl', password: 'secreta12345' });
  assert.equal(r.data.usuario.rol, 'admin'); ok('ingresa y devuelve el usuario');

  console.log('Modelo relacional y datos');
  let d = await datos();
  assert.equal(d.licitaciones.length, 12); ok('12 licitaciones de la demo');
  const l = d.licitaciones.find((x) => x.codigo === '1509-45-LP26');
  assert.equal(l.organismo, 'Servicio de Salud Metropolitano Oriente');
  assert.ok(l.fechas.cierre && l.fechas.finPreguntas); ok('organismo y fechas desde sus tablas');
  assert.equal(l.documentos.length, 10); assert.equal(l.criterios.length, 4); ok('checklist y criterios desde sus tablas');
  assert.equal(d.seguimiento['1509-45-LP26'].responsable, 'camila.rojas@sermaluc.cl'); ok('seguimiento con responsable');
  assert.deepEqual(d.licitaciones.filter((x) => x.nueva).map((x) => x.codigo).sort(), ['2190-33-LR26', '3398-21-LE26', '4410-88-LP26', '7710-15-LE26']); ok('"nueva" según el primer reporte');
  const fk = await env.DB.prepare('PRAGMA foreign_key_check').all();
  assert.equal(fk.results.length, 0); ok('sin violaciones de claves foráneas');

  console.log('Trabajo del equipo');
  assert.equal((await call('POST', '/api/licitaciones/4021-9-L126/responsable', { responsable: 'matias.fuentes@sermaluc.cl' })).status, 200);
  assert.equal((await call('POST', '/api/licitaciones/4021-9-L126/documentos', { doc: 'd1', listo: true })).status, 200);
  d = await datos();
  assert.equal(d.seguimiento['4021-9-L126'].estado, 'preparacion'); ok('asignar + marcar documento → en preparación');
  assert.equal((await call('POST', '/api/licitaciones/4021-9-L126/documentos', { doc: 'zz', listo: true })).status, 400); ok('documento inexistente → 400');
  assert.equal((await call('POST', '/api/licitaciones/4021-9-L126/estado', { estado: 'inventado' })).status, 400); ok('estado inválido → 400');

  console.log('Checklist agregado por el equipo');
  assert.equal((await call('POST', '/api/licitaciones/4021-9-L126/requeridos', { nombre: 'Anexo N°7 · Boleta de garantía', tipo: 'Administrativo' })).status, 200);
  d = await datos();
  const extra = d.licitaciones.find((x) => x.codigo === '4021-9-L126').documentos.find((x) => x.origen === 'equipo');
  assert.ok(extra && extra.id.startsWith('eq-')); ok('agrega un documento al checklist');
  assert.equal((await call('DELETE', '/api/licitaciones/4021-9-L126/requeridos/d1')).status, 400); ok('no se pueden quitar documentos del agente');

  console.log('Archivos');
  const fd = new FormData();
  fd.append('archivo', new File(['%PDF-1.4 bases de prueba'], 'Bases técnicas.pdf', { type: 'application/pdf' }));
  fd.append('categoria', 'bases');
  assert.equal((await call('POST', '/api/licitaciones/4021-9-L126/archivos', fd)).status, 200); ok('sube un PDF');
  const fd2 = new FormData();
  fd2.append('archivo', new File(['MZ'], 'virus.exe'));
  assert.equal((await call('POST', '/api/licitaciones/4021-9-L126/archivos', fd2)).status, 415); ok('rechaza .exe');
  const fd3 = new FormData();
  fd3.append('archivo', new File(['hola'], 'anexo7.docx')); fd3.append('categoria', 'preparado'); fd3.append('doc_id', extra.id);
  assert.equal((await call('POST', '/api/licitaciones/4021-9-L126/archivos', fd3)).status, 200); ok('sube un archivo asociado a un documento del checklist');
  d = await datos();
  const arch = d.licitaciones.find((x) => x.codigo === '4021-9-L126').archivos;
  assert.equal(arch.length, 2);
  const pdf = arch.find((a) => a.nombre === 'Bases técnicas.pdf');
  const dl = await call('GET', `/api/archivos/${pdf.id}`);
  assert.equal(dl.status, 200);
  assert.equal(new TextDecoder().decode(dl.data), '%PDF-1.4 bases de prueba');
  assert.match(dl.headers.get('content-disposition'), /^attachment;/); ok('descarga el archivo como adjunto');
  assert.equal((await call('DELETE', `/api/licitaciones/4021-9-L126/requeridos/${extra.id}`)).status, 200);
  d = await datos();
  assert.equal(d.licitaciones.find((x) => x.codigo === '4021-9-L126').archivos.find((a) => a.nombre === 'anexo7.docx').docId, null); ok('al quitar el documento, su archivo queda en la licitación');
  assert.equal((await call('DELETE', `/api/archivos/${pdf.id}`)).status, 200);
  assert.equal((await call('GET', `/api/archivos/${pdf.id}`)).status, 404); ok('borra el archivo');

  console.log('Reporte del agente');
  const tok = { authorization: 'Bearer ' + 'a'.repeat(30) };
  const base = d.licitaciones.find((x) => x.codigo === '4021-9-L126');
  const rep = { meta: { generado: '2026-11-07T08:00', revisadas: 10, palabrasClave: ['cloud', 'analítica de datos'] },
    licitaciones: [{ ...base, nombre: 'Nombre actualizado', organismoCodigo: '7777', documentos: base.documentos.filter((x) => x.origen === 'agente' && x.id !== 'd4') },
      { codigo: '9999-1-LE26', nombre: 'Nueva prueba', organismo: 'Organismo X', unidad: 'Compras', region: 'Biobío', fechas: { cierre: '2026-11-30T15:00' }, documentos: [{ id: 'd1', nombre: 'Anexo' }], palabrasClave: ['cloud'], montoEstimado: 1 }] };
  const ing = await call('POST', '/api/reporte', rep, tok);
  assert.equal(ing.status, 200); assert.equal(ing.data.nuevas, 1); ok('carga el reporte (1 nueva)');
  d = await datos();
  const act = d.licitaciones.find((x) => x.codigo === '4021-9-L126');
  assert.equal(act.nombre, 'Nombre actualizado'); assert.equal(act.organismoCodigo, '7777'); ok('actualiza datos y código de organismo');
  assert.equal(d.seguimiento['4021-9-L126'].estado, 'preparacion'); assert.ok(d.seguimiento['4021-9-L126'].docs.d1); ok('conserva el trabajo del equipo');
  assert.ok(!act.documentos.some((x) => x.id === 'd4')); assert.ok(act.documentos.some((x) => x.id === 'd1')); ok('quita documentos del agente que ya no vienen (sin tocar los marcados)');
  assert.deepEqual(d.meta.palabrasClave, ['analítica de datos', 'cloud']); ok('palabras clave del último reporte');
  assert.equal(d.licitaciones.find((x) => x.codigo === '9999-1-LE26').region, 'Biobío'); ok('crea organismo y unidad nuevos');
  assert.equal((await call('POST', '/api/reporte', { licitaciones: [{ codigo: '!!' }] }, tok)).status, 422); ok('rechaza reportes inválidos');
  const fk2 = await env.DB.prepare('PRAGMA foreign_key_check').all();
  assert.equal(fk2.results.length, 0); ok('sigue sin violaciones de claves foráneas');

  console.log('Configuración: palabras clave');
  let pal = (await call('GET', '/api/configuracion/palabras')).data.palabras;
  assert.ok(pal.length >= 50 && pal.some((x) => x.palabra === 'mesa de ayuda' && x.peso === 3)); ok('lista inicial con las palabras del agente');
  assert.equal((await call('POST', '/api/configuracion/palabras', { palabra: '  Inteligencia   de Negocios ', peso: 2 })).status, 200);
  assert.equal((await call('POST', '/api/configuracion/palabras', { palabra: 'inteligencia de negocios', peso: 2 })).status, 409); ok('agrega una palabra (normalizada) y evita duplicados');
  assert.equal((await call('POST', '/api/configuracion/palabras', { palabra: 'x', peso: 0 })).status, 400); ok('peso 0 → 400');
  assert.equal((await call('PATCH', '/api/configuracion/palabras/' + encodeURIComponent('impresion'), { activa: false })).status, 200);
  assert.equal((await call('DELETE', '/api/configuracion/palabras/' + encodeURIComponent('plataforma'))).status, 200); ok('pausa y elimina palabras');
  const pa = await call('GET', '/api/agente/palabras', null, { authorization: 'Bearer ' + 'a'.repeat(30) });
  assert.equal(pa.data.positivas['inteligencia de negocios'], 2);
  assert.ok(!('plataforma' in pa.data.positivas) && !('impresion' in pa.data.negativas) && pa.data.negativas.insumos === -3); ok('el agente recibe solo las activas, separadas en suman/restan');
  assert.equal((await call('GET', '/api/agente/palabras', null, { authorization: 'Bearer malo' })).status, 401); ok('el agente necesita su token');

  console.log('Configuración: usuarios');
  assert.equal((await call('POST', '/api/equipo', { email: 'nueva.persona@sermaluc.cl', nombre: 'Nueva Persona', cargo: 'KAM', rol: 'equipo' })).status, 200);
  assert.equal((await call('POST', '/api/equipo', { email: 'nueva.persona@sermaluc.cl', nombre: 'Otra' })).status, 409); ok('crea usuario y evita duplicados');
  assert.equal((await call('PATCH', '/api/equipo/nueva.persona%40sermaluc.cl', { rol: 'admin', cargo: 'Gerente' })).status, 200);
  d = await datos();
  assert.equal(d.equipo.find((x) => x.id === 'nueva.persona@sermaluc.cl').rol, 'admin'); ok('edita cargo y rol');
  assert.equal((await call('PATCH', '/api/equipo/camila.rojas%40sermaluc.cl', { rol: 'equipo' })).status, 400); ok('no puede quitarse su propio rol');
  assert.equal((await call('DELETE', '/api/equipo/nueva.persona%40sermaluc.cl')).status, 200); ok('elimina usuario');

  console.log('Ingreso con Google');
  assert.equal((await call('GET', '/api/config')).data.google, false); ok('sin credenciales, el botón de Google no se ofrece');
  env.GOOGLE_CLIENT_ID = 'cliente-123.apps.googleusercontent.com'; env.GOOGLE_CLIENT_SECRET = 'secreto';
  const sesionAdmin = cookie; cookie = '';
  const ini = await call('GET', '/api/auth/google');
  const loc = new URL(ini.headers.get('location'));
  assert.equal(loc.host, 'accounts.google.com'); assert.equal(loc.searchParams.get('hd'), 'sermaluc.cl'); assert.ok(loc.searchParams.get('code_challenge')); ok('redirige a Google con PKCE y dominio');
  const oauthCookie = ini.headers.getSetCookie()[0].split(';')[0];
  const fetchReal = globalThis.fetch;
  const idToken = (claims) => 'x.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.y';
  const gBase = { iss: 'https://accounts.google.com', aud: env.GOOGLE_CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 300, email_verified: true, hd: 'sermaluc.cl' };
  const vuelta = async (claims, state = loc.searchParams.get('state')) => {
    globalThis.fetch = async () => new Response(JSON.stringify({ id_token: idToken(claims) }), { status: 200, headers: { 'content-type': 'application/json' } });
    cookie = oauthCookie;
    try { return await call('GET', `/api/auth/google/callback?code=abc&state=${state}`); } finally { globalThis.fetch = fetchReal; }
  };
  let v = await vuelta({ ...gBase, email: 'matias.fuentes@sermaluc.cl' });
  assert.equal(v.headers.get('location'), '/');
  assert.equal((await call('GET', '/api/datos')).data.usuario.email, 'matias.fuentes@sermaluc.cl'); ok('ingresa con Google un usuario registrado (aunque no tenga contraseña)');
  v = await vuelta({ ...gBase, email: 'desconocido@sermaluc.cl' });
  assert.match(v.headers.get('location'), /error_login=no_registrado/); ok('rechaza correos no registrados');
  v = await vuelta({ ...gBase, email: 'alguien@gmail.com', hd: undefined });
  assert.match(v.headers.get('location'), /error_login=dominio/); ok('rechaza otros dominios');
  v = await vuelta({ ...gBase, email: 'matias.fuentes@sermaluc.cl' }, 'estado-falso');
  assert.match(v.headers.get('location'), /error_login=estado/); ok('rechaza un state manipulado');
  v = await vuelta({ ...gBase, aud: 'otro-cliente', email: 'matias.fuentes@sermaluc.cl' });
  assert.match(v.headers.get('location'), /error_login=google/); ok('rechaza tokens para otra aplicación');
  cookie = sesionAdmin;

  console.log('Adjuntos en Mercado Público');
  globalThis.fetch = async () => new Response(`<img id="imgAdjuntos" onclick="open(&#39;../Attachment/ViewAttachment.aspx?enc=AbC%2fd%2bE%3d&#39;,&#39;MercadoPublico&#39;)">`, { status: 200 });
  let adj = await call('GET', '/api/licitaciones/1509-45-LP26/adjuntos');
  assert.equal(adj.headers.get('location'), 'https://www.mercadopublico.cl/Procurement/Modules/Attachment/ViewAttachment.aspx?enc=AbC%2fd%2bE%3d'); ok('va directo a la pantalla de adjuntos con un enlace recién generado');
  globalThis.fetch = async () => { throw new Error('sin red'); };
  adj = await call('GET', '/api/licitaciones/1509-45-LP26/adjuntos');
  assert.match(adj.headers.get('location'), /DetailsAcquisition\.aspx\?idlicitacion=1509-45-LP26$/); ok('si Mercado Público no responde, abre la ficha');
  globalThis.fetch = fetchReal;
  assert.equal((await call('GET', '/api/licitaciones/NO-EXISTE/adjuntos')).status, 404); ok('solo licitaciones conocidas (no es un proxy abierto)');

  console.log('Registro de actividad');
  const log = (await call('GET', '/api/auditoria?limite=200')).data.registros;
  const tiene = (re) => log.some((x) => re.test(x.descripcion));
  assert.ok(tiene(/Camila Rojas ingresó con contraseña/)); ok('registra ingresos');
  assert.ok(tiene(/cambió el estado de «.*» \(4021-9-L126\)|asignó «.*» \(4021-9-L126\) a Matías Fuentes/)); ok('registra cambios en licitaciones con su nombre');
  assert.ok(tiene(/subió «Bases técnicas\.pdf»/) && tiene(/descargó «Bases técnicas\.pdf»/) && tiene(/borró «Bases técnicas\.pdf»/)); ok('registra subir, descargar y borrar archivos');
  assert.ok(tiene(/agregó la palabra clave «inteligencia de negocios»/) && tiene(/creó el usuario Nueva Persona/)); ok('registra cambios de configuración');
  assert.ok(tiene(/Matías Fuentes ingresó con Google/) && tiene(/Ingreso con Google rechazado para desconocido@sermaluc\.cl/)); ok('registra ingresos con Google, también los rechazados');
  assert.ok(tiene(/El agente cargó su reporte/) && tiene(/El agente descargó las palabras clave/)); ok('registra la actividad del agente');
  const err1 = log.find((x) => x.resultado === 'error' && /Intento de cambiar el estado/.test(x.descripcion));
  assert.ok(err1 && /Estado inválido/.test(err1.descripcion)); ok('registra los intentos fallidos con el motivo');
  const conDetalle = log.find((x) => x.accion === 'licitacion.responsable' && x.resultado === 'ok');
  assert.ok(conDetalle.detalle.metodo === 'POST' && conDetalle.detalle.ruta && 'ip' in conDetalle.detalle && conDetalle.detalle.respuesta === 200); ok('guarda el detalle técnico aparte');
  assert.ok(!JSON.stringify(log).includes('secreta12345')); ok('nunca guarda contraseñas');
  const fil = (await call('GET', '/api/auditoria?q=palabra%20clave')).data.registros;
  assert.ok(fil.length && fil.every((x) => /palabra clave/i.test(x.descripcion))); ok('filtra por texto');
  const pag = (await call('GET', '/api/auditoria?limite=10')).data;
  const pag2 = (await call('GET', `/api/auditoria?limite=10&antes=${encodeURIComponent(pag.registros.at(-1).fecha)}`)).data;
  assert.ok(pag.hayMas && pag2.registros.length && pag2.registros[0].fecha < pag.registros.at(-1).fecha); ok('pagina hacia atrás');

  console.log('Línea de tiempo pública');
  const sesionGuardada = cookie; cookie = '';
  const pub = await call('GET', '/api/publico/linea');
  assert.equal(pub.status, 200); ok('se abre sin sesión');
  const txt = JSON.stringify(pub.data);
  assert.ok(!txt.includes('@sermaluc.cl') && !txt.includes('montoEstimado') && !txt.includes('documentos')); ok('no expone correos, montos ni documentos');
  const c1509 = pub.data.licitaciones.find((x) => x.codigo === '1509-45-LP26');
  assert.equal(c1509.responsable, 'Camila Rojas'); assert.ok(c1509.fechas.cierre); ok('muestra el nombre del responsable y las fechas');
  assert.ok(!pub.data.licitaciones.some((x) => x.estado === 'descartada')); ok('omite las descartadas');
  cookie = sesionGuardada;

  console.log('Seguridad');
  assert.equal((await call('POST', '/api/licitaciones/4021-9-L126/notas', { texto: 'x' }, { origin: 'https://otro.example' })).status, 403); ok('rechaza otro origen (CSRF)');
  assert.equal((await call('GET', '/api/archivos/../../etc')).status, 404); ok('id de archivo inválido → 404');
  assert.equal((await call('POST', '/api/salir')).status, 200);
  assert.equal((await call('GET', '/api/datos')).status, 401); ok('cerrar sesión');
  console.log(`\n${n} pruebas OK`);
} finally {
  rmSync(dirArchivos, { recursive: true, force: true });
}
