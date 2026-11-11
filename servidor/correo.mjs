// Atalaya · envío de correos por SMTP (sin dependencias).
// Funciona en Cloudflare Workers (cloudflare:sockets) y en Node (node:tls): quien crea el cliente
// entrega `conectar(host, puerto)`, que devuelve un socket TLS con { readable, writable, close() } (Web Streams).
//
// Usa TLS directo (puerto 465), que soportan Google Workspace, Microsoft 365 y la mayoría de los proveedores.
//
//   const correo = crearSmtp({ host, puerto, usuario, clave, remitente, conectar });
//   await correo.enviar({ para: ['a@sermaluc.cl'], asunto, html, texto, responderA });

const enc = new TextEncoder();
const dec = new TextDecoder();

// Quita saltos de línea y caracteres de control: evita inyectar cabeceras o comandos SMTP
const limpio = (s) => String(s ?? '').replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').trim();
const RE_CORREO = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}$/;

function b64(texto) {
  const bytes = enc.encode(texto);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const b64Lineas = (texto) => b64(texto).replace(/.{1,76}/g, '$&\r\n');
// Cabecera con acentos (RFC 2047)
const cab = (texto) => (/^[\x20-\x7e]*$/.test(texto) ? texto : `=?UTF-8?B?${b64(texto)}?=`);
const direccion = (nombre, correo) => (nombre ? `${cab(limpio(nombre).replace(/"/g, "'"))} <${correo}>` : `<${correo}>`);

export function armarMensaje({ de, deNombre, para, asunto, html, texto, responderA, dominio }) {
  const limite = 'atalaya-' + crypto.randomUUID();
  const cabeceras = [
    `From: ${direccion(deNombre, de)}`,
    `To: ${para.map((p) => `<${p}>`).join(', ')}`,
    ...(responderA ? [`Reply-To: <${responderA}>`] : []),
    `Subject: ${cab(limpio(asunto))}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomUUID()}@${dominio || 'atalaya'}>`,
    'MIME-Version: 1.0',
    'X-Mailer: Atalaya',
    `Content-Type: multipart/alternative; boundary="${limite}"`,
  ];
  return [
    ...cabeceras, '',
    `--${limite}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64Lineas(texto),
    `--${limite}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64Lineas(html),
    `--${limite}--`, '',
  ].join('\r\n');
}

// Lector de respuestas SMTP ("250-..." continúa, "250 ..." termina)
function lectorSmtp(readable) {
  const reader = readable.getReader();
  let buf = '';
  return async function leer(esperado, paso) {
    for (;;) {
      const lineas = buf.split('\r\n');
      for (let i = 0; i < lineas.length - 1; i++) {
        if (/^\d{3} /.test(lineas[i]) || /^\d{3}$/.test(lineas[i])) {
          const respuesta = lineas.slice(0, i + 1).join('\n');
          buf = lineas.slice(i + 1).join('\r\n');
          const codigo = Number(lineas[i].slice(0, 3));
          if (!esperado.includes(codigo)) {
            const e = new Error(`El servidor de correo rechazó ${paso}: ${respuesta.replace(/\n/g, ' ').slice(0, 300)}`);
            e.codigo = codigo;
            throw e;
          }
          return respuesta;
        }
      }
      const { value, done } = await reader.read();
      if (done) throw new Error(`El servidor de correo cerró la conexión durante ${paso}.`);
      buf += dec.decode(value, { stream: true });
    }
  };
}

export function crearSmtp({ host, puerto = 465, usuario, clave, remitente, remitenteNombre = 'Atalaya', conectar, timeoutMs = 20000 }) {
  const de = (remitente || usuario || '').trim().toLowerCase();
  if (!host || !usuario || !clave || !RE_CORREO.test(de) || typeof conectar !== 'function') return null;
  const dominio = de.split('@')[1];

  async function enviar({ para, asunto, html, texto, responderA }) {
    const destinos = [...new Set((para || []).map((p) => String(p).trim().toLowerCase()).filter((p) => RE_CORREO.test(p)))];
    if (!destinos.length) throw new Error('No hay destinatarios válidos.');
    const responder = responderA && RE_CORREO.test(responderA) ? responderA : null;
    const mensaje = armarMensaje({ de, deNombre: remitenteNombre, para: destinos, asunto, html, texto, responderA: responder, dominio })
      .replace(/\r\n\./g, '\r\n..'); // "dot-stuffing": una línea que empieza con punto no termina el mensaje

    const socket = await conectar(host, Number(puerto));
    const writer = socket.writable.getWriter();
    const leer = lectorSmtp(socket.readable);
    const escribir = (linea) => writer.write(enc.encode(linea + '\r\n'));
    let reloj;
    const limite = new Promise((_, no) => { reloj = setTimeout(() => no(new Error(`El servidor de correo no respondió en ${timeoutMs / 1000} s.`)), timeoutMs); });
    const conversacion = (async () => {
      await leer([220], 'el saludo');
      await escribir(`EHLO ${dominio}`); await leer([250], 'EHLO');
      await escribir('AUTH LOGIN'); await leer([334], 'la autenticación');
      await escribir(b64(usuario)); await leer([334], 'el usuario');
      await escribir(b64(clave)); await leer([235], 'la contraseña (revise SMTP_USER y SMTP_PASSWORD)');
      await escribir(`MAIL FROM:<${de}>`); await leer([250], 'el remitente');
      for (const d of destinos) { await escribir(`RCPT TO:<${d}>`); await leer([250, 251], `el destinatario ${d}`); }
      await escribir('DATA'); await leer([354], 'el inicio del mensaje');
      await writer.write(enc.encode(mensaje + '\r\n.\r\n')); await leer([250], 'el mensaje');
      await escribir('QUIT');
    })();
    try {
      await Promise.race([conversacion, limite]);
    } finally {
      clearTimeout(reloj);
      conversacion.catch(() => {});
      try { writer.releaseLock(); } catch { /* ya liberado */ }
      try { await socket.close(); } catch { /* ya cerrado */ }
    }
    return { destinatarios: destinos };
  }

  return { activo: true, remitente: de, enviar };
}

/* ---------------- plantillas con la identidad de Atalaya ---------------- */
const C = {
  ink: '#0B1530', muted: '#76829C', bg: '#F4F6FA', paper: '#FFFFFF', line: '#E4E8F0',
  signal: '#0071FF', signalSoft: '#E8F1FF', sweep: '#22C3EE',
  red: '#EE3B55', redSoft: '#FDE9EC', amber: '#F29A0B', amberSoft: '#FEF3DF', green: '#0EA672', greenSoft: '#E2F6EE',
};
const COLOR_ESTADO = { nueva: '#22C3EE', evaluacion: '#7B61FF', preparacion: '#0071FF', presentada: '#0E9F9A', adjudicada: '#0EA672', noadjudicada: '#8C95A8', descartada: '#B3BBCB' };
const FUENTE = "Manrope, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "'JetBrains Mono', Consolas, 'Courier New', monospace";
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Fechas de Mercado Público: "AAAA-MM-DDTHH:MM" en hora de Chile
export function fechaChile(f) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(f || '');
  if (!m) return null;
  const [, a, mes, d, hh = '00', mm = '00'] = m;
  const dia = new Date(Date.UTC(+a, +mes - 1, +d)).getUTCDay();
  return { texto: `${DIAS[dia]} ${+d} ${MESES[+mes - 1]} ${a} · ${hh}:${mm} h`, ms: Date.parse(`${a}-${mes}-${d}T${hh}:${mm}:00-03:00`) };
}
export function plazo(cierre, ahora = Date.now()) {
  const f = fechaChile(cierre);
  if (!f) return { texto: 'Sin fecha de cierre', color: C.muted, fondo: C.bg };
  const dias = (f.ms - ahora) / 86400000;
  if (dias < 0) return { texto: 'Cerrada', color: C.muted, fondo: C.bg, fecha: f.texto };
  const n = Math.floor(dias);
  const texto = n === 0 ? `Cierra hoy · quedan ${Math.max(1, Math.round(dias * 24))} h` : n === 1 ? 'Queda 1 día' : `Quedan ${n} días`;
  const [color, fondo] = dias <= 2 ? [C.red, C.redSoft] : dias <= 5 ? [C.amber, C.amberSoft] : dias <= 10 ? [C.signal, C.signalSoft] : [C.green, C.greenSoft];
  return { texto, color, fondo, fecha: f.texto };
}

function marco({ preencabezado, etiqueta, titulo, intro, cuerpo, boton, pie }) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${h(titulo)}</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg}">${h(preencabezado)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
  <tr><td style="background:${C.ink};border-radius:16px 16px 0 0;padding:22px 28px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-family:${FUENTE};color:#FFFFFF;font-size:20px;font-weight:800;letter-spacing:3px">
        <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${C.sweep};box-shadow:0 0 0 4px rgba(34,195,238,.25);margin-right:10px;vertical-align:middle"></span>ATALAYA</td>
      <td align="right" style="font-family:${MONO};color:${C.sweep};font-size:11px;letter-spacing:1.5px;text-transform:uppercase">Vigila · Prioriza · Gana</td>
    </tr></table>
  </td></tr>
  <tr><td style="height:4px;background:${C.signal};background-image:linear-gradient(90deg,${C.signal},${C.sweep});font-size:0;line-height:0">&nbsp;</td></tr>
  <tr><td style="background:${C.paper};padding:30px 28px 8px;font-family:${FUENTE};color:${C.ink}">
    <div style="font-family:${MONO};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${C.signal};font-weight:500">${h(etiqueta)}</div>
    <h1 style="margin:8px 0 10px;font-size:24px;line-height:1.25;font-weight:800;color:${C.ink}">${h(titulo)}</h1>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#3A4560">${intro}</p>
    ${cuerpo}
  </td></tr>
  <tr><td style="background:${C.paper};padding:8px 28px 30px" align="left">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:10px;background:${C.signal}">
      <a href="${h(boton.url)}" style="display:inline-block;padding:13px 24px;font-family:${FUENTE};font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:10px">${h(boton.texto)} &rarr;</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="background:${C.paper};border-top:1px solid ${C.line};border-radius:0 0 16px 16px;padding:18px 28px;font-family:${FUENTE};font-size:12px;line-height:1.6;color:${C.muted}">
    ${pie}<br>Atalaya · Radar de licitaciones de Sermaluc. Este es un aviso automático.
  </td></tr>
</table></td></tr></table></body></html>`;
}

function tarjeta(l, { estadoLabel, responsable }) {
  const p = plazo(l.cierre);
  const color = COLOR_ESTADO[l.estado] || C.signal;
  const fila = (k, v) => v ? `<tr><td style="padding:5px 0;font-size:12px;color:${C.muted};width:120px;vertical-align:top">${k}</td><td style="padding:5px 0;font-size:14px;color:${C.ink};font-weight:600">${v}</td></tr>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line};border-radius:14px;border-left:4px solid ${color};margin:0 0 22px">
  <tr><td style="padding:18px 20px">
    <div style="font-family:${MONO};font-size:12px;color:${C.muted}">${h(l.codigo)}</div>
    <div style="margin:4px 0 12px;font-size:17px;line-height:1.35;font-weight:800;color:${C.ink}">${h(l.nombre)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px"><tr>
      <td style="background:${p.fondo};color:${p.color};border-radius:999px;padding:5px 12px;font-size:12px;font-weight:700;white-space:nowrap">⏱ ${h(p.texto)}</td>
      <td style="width:8px"></td>
      <td style="background:${C.bg};color:${color};border-radius:999px;padding:5px 12px;font-size:12px;font-weight:700;white-space:nowrap">● ${h(estadoLabel)}</td>
    </tr></table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${FUENTE}">
      ${fila('Organismo', h(l.organismo))}
      ${fila('Cierre de ofertas', p.fecha ? h(p.fecha) : '')}
      ${fila('Responsable', h(responsable || 'Sin asignar'))}
      ${l.pendientes ? fila('Documentos', `<span style="color:${C.amber}">${l.pendientes} obligatorio${l.pendientes === 1 ? '' : 's'} pendiente${l.pendientes === 1 ? '' : 's'}</span>`) : ''}
    </table>
  </td></tr></table>`;
}

const textoLic = (l, estadoLabel, responsable) => {
  const p = plazo(l.cierre);
  return [`${l.nombre} (${l.codigo})`, l.organismo && `Organismo: ${l.organismo}`, p.fecha && `Cierre de ofertas: ${p.fecha} (${p.texto})`,
    `Estado: ${estadoLabel}`, `Responsable: ${responsable || 'Sin asignar'}`].filter(Boolean).join('\n');
};

// Aviso a la persona a quien se asignó una licitación
export function correoAsignacion({ lic, estadoLabel, destino, asignador, url }) {
  const p = plazo(lic.cierre);
  const primer = (destino.nombre || '').split(' ')[0] || 'Hola';
  return {
    asunto: `Te asignaron una licitación: ${lic.nombre}`.slice(0, 180),
    html: marco({
      preencabezado: `${asignador.nombre} te asignó ${lic.codigo}. ${p.texto}.`,
      etiqueta: 'Nueva asignación',
      titulo: `${primer}, tienes una licitación a cargo`,
      intro: `<b>${h(asignador.nombre)}</b> te asignó esta licitación en Atalaya. Revisa las bases, el checklist de documentos y las fechas clave para comenzar la gestión.`,
      cuerpo: tarjeta(lic, { estadoLabel, responsable: destino.nombre }),
      boton: { texto: 'Abrir la ficha en Atalaya', url },
      pie: `Recibes este correo porque te asignaron como responsable.`,
    }),
    texto: `${primer}, tienes una licitación a cargo.\n\n${asignador.nombre} te asignó esta licitación en Atalaya:\n\n${textoLic(lic, estadoLabel, destino.nombre)}\n\nAbrir en Atalaya: ${url}\n\n— Atalaya · Radar de licitaciones de Sermaluc`,
  };
}

// Nota compartida con todo el equipo
export function correoNota({ lic, estadoLabel, responsable, autor, nota, url }) {
  const parrafos = h(nota).replace(/\r?\n/g, '<br>');
  return {
    asunto: `Nueva nota en ${lic.codigo}: ${lic.nombre}`.slice(0, 180),
    html: marco({
      preencabezado: `${autor.nombre}: ${nota.replace(/\s+/g, ' ').slice(0, 110)}`,
      etiqueta: 'Nota del equipo',
      titulo: `${autor.nombre} dejó una nota`,
      intro: `Hay una nueva nota en una licitación que sigue el equipo. Revísala y coordina la gestión en Atalaya.${responsable ? '' : ' <b>Esta licitación aún no tiene responsable.</b>'}`,
      cuerpo: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px"><tr>
        <td style="background:${C.signalSoft};border-radius:14px;padding:18px 20px;font-family:${FUENTE};font-size:15px;line-height:1.65;color:${C.ink}">
          <div style="font-size:12px;font-weight:700;color:${C.signal};margin:0 0 6px">💬 ${h(autor.nombre)}${autor.cargo ? ` · ${h(autor.cargo)}` : ''}</div>${parrafos}
        </td></tr></table>${tarjeta(lic, { estadoLabel, responsable })}`,
      boton: { texto: 'Ver la licitación y responder', url },
      pie: `Recibes este correo porque formas parte del equipo comercial en Atalaya. Si respondes este correo, la respuesta le llega a ${h(autor.nombre)}.`,
    }),
    texto: `${autor.nombre} dejó una nota:\n\n"${nota}"\n\n${textoLic(lic, estadoLabel, responsable)}\n\nVer en Atalaya: ${url}\n\n— Atalaya · Radar de licitaciones de Sermaluc`,
  };
}

// Correo de prueba desde Configuración
export function correoPrueba({ persona, url }) {
  return {
    asunto: 'Prueba de avisos por correo de Atalaya',
    html: marco({
      preencabezado: 'Los avisos por correo de Atalaya están funcionando.',
      etiqueta: 'Prueba de configuración',
      titulo: '¡Los avisos por correo funcionan!',
      intro: `Hola ${h((persona.nombre || '').split(' ')[0])}, este es un correo de prueba. Desde ahora Atalaya avisará por correo:<br><br>
        <b>• A la persona asignada</b>, cuando se le asigna una licitación.<br><b>• A todo el equipo</b>, cuando alguien agrega una nota a una licitación.`,
      cuerpo: '',
      boton: { texto: 'Ir a Atalaya', url },
      pie: 'Enviado desde Configuración → Notificaciones.',
    }),
    texto: `Hola, este es un correo de prueba de Atalaya. Los avisos por correo están funcionando.\n\n${url}`,
  };
}
