/* ============================================================
   ATALAYA · Radar de licitaciones Sermaluc
   Aplicación de una página, sin dependencias. Datos desde /api.
   ============================================================ */
(() => {
  'use strict';

  /* ---------------- Catálogos ---------------- */
  const ESTADOS = [
    { id: 'nueva',        label: 'Nueva',          c: 'var(--e-nueva)',        activo: true },
    { id: 'evaluacion',   label: 'En evaluación',  c: 'var(--e-evaluacion)',   activo: true },
    { id: 'preparacion',  label: 'En preparación', c: 'var(--e-preparacion)',  activo: true },
    { id: 'presentada',   label: 'Presentada',     c: 'var(--e-presentada)',   activo: false },
    { id: 'adjudicada',   label: 'Adjudicada',     c: 'var(--e-adjudicada)',   activo: false },
    { id: 'noadjudicada', label: 'No adjudicada',  c: 'var(--e-noadjudicada)', activo: false },
    { id: 'descartada',   label: 'Descartada',     c: 'var(--e-descartada)',   activo: false }
  ];
  const EST = Object.fromEntries(ESTADOS.map(e => [e.id, e]));
  const TIPOS = {
    L1: 'Menor a 100 UTM', LE: 'Entre 100 y 1.000 UTM', LP: 'Entre 1.000 y 2.000 UTM',
    LQ: 'Entre 2.000 y 5.000 UTM', LR: 'Igual o superior a 5.000 UTM'
  };
  const HITOS = [
    { k: 'publicacion',       label: 'Publicación',               c: 'var(--e-nueva)' },
    { k: 'visitaTerreno',     label: 'Visita a terreno',          c: 'var(--amber)' },
    { k: 'finPreguntas',      label: 'Cierre de preguntas',       c: 'var(--e-evaluacion)' },
    { k: 'respuestas',        label: 'Publicación de respuestas', c: '#6C8CFF' },
    { k: 'cierre',            label: 'Cierre de ofertas',         c: 'var(--red)', key: true },
    { k: 'aperturaTecnica',   label: 'Apertura técnica',          c: 'var(--e-presentada)' },
    { k: 'aperturaEconomica', label: 'Apertura económica',        c: 'var(--e-presentada)' },
    { k: 'adjudicacion',      label: 'Adjudicación estimada',     c: 'var(--green)' }
  ];
  const HITO = Object.fromEntries(HITOS.map(h => [h.k, h]));
  const U_COLOR = { crit: 'var(--red)', high: 'var(--amber)', mid: 'var(--blue)', ok: 'var(--green)', closed: 'var(--line-strong)' };

  /* ---------------- Iconos ---------------- */
  const P = {
    radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12 18.5 5.5"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
    board: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="17" y="4" width="4" height="13" rx="1.5"/>',
    timeline: '<path d="M3 6h8M7 12h10M5 18h7"/><path d="M3 3v18" opacity=".4"/>',
    team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    bell: '<path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9"/><path d="M10 21h4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.6 1 2.5 2 3 0-3 0-5.5 1-8.5Z"/>',
    alert: '<path d="M12 3 2 20h20Z"/><path d="M12 10v4M12 17h.01"/>',
    file: '<path d="M14 3H6v18h12V7Z"/><path d="M14 3v4h4M9 13h6M9 17h4"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    back: '<path d="M15 18 9 12l6-6"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    tag: '<path d="M3 12V3h9l9 9-9 9Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    chat: '<path d="M4 5h16v11H9l-5 4Z"/><path d="M8 9.5h8M8 12.5h5"/>',
    shield: '<path d="M12 3 4 6v6c0 5 4 8 8 9 4-1 8-4 8-9V6Z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>',
    clip: '<path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    log: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
    code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    google: '<path d="M21.8 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.3c1.9-1.8 3-4.4 3-7.5Z" fill="#4285F4" stroke="none"/><path d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.6c-.9.6-2.1 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3v2.6A10 10 0 0 0 12 22Z" fill="#34A853" stroke="none"/><path d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3a10 10 0 0 0 0 9Z" fill="#FBBC05" stroke="none"/><path d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3 7.5l3.4 2.6C7.2 7.8 9.4 6 12 6Z" fill="#EA4335" stroke="none"/>'
  };
  const ic = (n, cls = '') => `<span class="ico ${cls}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[n] || ''}</svg></span>`;

  /* ---------------- Utilidades ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DAY = 86400000;
  const now = () => new Date();
  const sod = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  function parseLocal(s) {
    if (!s || typeof s !== 'string') return null;
    if (/Z$|[+-]\d\d:\d\d$/.test(s)) return new Date(s);
    const [d, t = '00:00'] = s.split('T');
    const [y, m, dd] = d.split('-').map(Number);
    const [h, mi] = t.split(':').map(Number);
    return new Date(y, m - 1, dd, h || 0, mi || 0);
  }
  const dd = d => Math.round((sod(d) - sod(now())) / DAY);
  const fDate = d => d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  const fTime = d => d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const fDT = d => `${fDate(d)} · ${fTime(d)}`;
  const fLong = d => d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  const CLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
  function money(n, short) {
    n = Number(n) || 0;
    if (!n) return 'No informado';
    if (!short) return CLP.format(n);
    if (n >= 1e9) return '$' + (n / 1e9).toLocaleString('es-CL', { maximumFractionDigits: 2 }) + ' mil MM';
    if (n >= 1e6) return '$' + Math.round(n / 1e6).toLocaleString('es-CL') + ' MM';
    return CLP.format(n);
  }
  function rel(d) {
    const n = dd(d);
    if (n === 0) return 'hoy';
    if (n === 1) return 'mañana';
    if (n === -1) return 'ayer';
    return n > 0 ? `en ${n} días` : `hace ${-n} días`;
  }
  const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const ini = n => String(n).split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
  const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------------- Estado ---------------- */
  let DATA = null, TEAM = {}, LICS = [], BY = {}, ME = null, REPORT_AT = new Date();
  const ui = { estado: 'activas', resp: '', kw: '', orden: 'cierre', urg: false, q: '', tab: 'resumen' };
  let ticker = null; // intervalo del reloj de la ficha

  function apply(d) {
    DATA = d;
    TEAM = Object.fromEntries(d.equipo.map(p => [p.id, p]));
    REPORT_AT = parseLocal(d.meta.generado) || new Date(d.meta.recibido || Date.now());
    LICS = d.licitaciones.map(l => {
      const fechas = {};
      for (const [k, v] of Object.entries(l.fechas || {})) { const x = parseLocal(v); if (x) fechas[k] = x; }
      return {
        ...l, fechas,
        palabrasClave: l.palabrasClave || [], documentos: l.documentos || [], criterios: l.criterios || [],
        garantias: l.garantias || [], contacto: l.contacto || {}, archivos: l.archivos || [],
        pub: parseLocal(l.publicada) || fechas.publicacion || new Date()
      };
    });
    BY = Object.fromEntries(LICS.map(l => [l.codigo, l]));
  }
  function seg(cod) {
    const s = DATA.seguimiento[cod] || {};
    const ev = DATA.eventos[cod] || [];
    return { estado: s.estado || 'nueva', responsable: s.responsable || '', docs: s.docs || {}, eventos: ev };
  }
  const activa = l => EST[seg(l.codigo).estado].activo;
  function urg(l) {
    const c = l.fechas.cierre;
    if (!c || c < now()) return 'closed';
    const n = dd(c);
    return n <= 2 ? 'crit' : n <= 5 ? 'high' : n <= 10 ? 'mid' : 'ok';
  }
  function docs(l) {
    const s = seg(l.codigo);
    const total = l.documentos.length;
    const done = l.documentos.filter(d => s.docs[d.id]).length;
    const req = l.documentos.filter(d => d.obligatorio && !s.docs[d.id]).length;
    return { total, done, req, pct: total ? Math.round(done / total * 100) : 0 };
  }
  function dueText(l) {
    const c = l.fechas.cierre;
    if (!c) return 'Sin fecha';
    if (c < now()) return 'Cerrada';
    const n = dd(c);
    if (n === 0) return `Cierra hoy ${fTime(c)}`;
    if (n === 1) return `Mañana ${fTime(c)}`;
    return `${n} días`;
  }
  const due = l => { const u = urg(l); return `<span class="due ${u}">${ic(u === 'crit' ? 'flame' : 'clock')}${dueText(l)}</span>`; };
  const est = id => `<span class="st" style="--c:${EST[id].c}">${EST[id].label}</span>`;
  const member = id => TEAM[id] || null;
  function av(id, lg) {
    const p = member(id);
    if (!p) return `<span class="av none ${lg ? 'lg' : ''}" title="Sin responsable">${ic('user')}</span>`;
    return `<span class="av ${lg ? 'lg' : ''}" style="--h:${hue(p.id)}" title="${esc(p.nombre)}">${ini(p.nombre)}</span>`;
  }
  const nameOf = id => member(id)?.nombre || id || 'Equipo';
  const match = m => `<span class="match" style="--m:${m}%">${m}%</span>`;
  function segs(l) {
    const s = seg(l.codigo), di = docs(l);
    return `<div class="segs ${di.pct === 100 ? 'full' : ''}">${l.documentos.map(d => `<i class="${s.docs[d.id] ? 'on' : ''} ${d.obligatorio ? 'req' : ''}"></i>`).join('')}</div>`;
  }
  const href = cod => `#/licitacion/${encodeURIComponent(cod)}`;

  function alerts() {
    const out = [];
    for (const l of LICS) {
      if (!activa(l)) continue;
      const u = urg(l);
      if (u === 'crit' || u === 'high' || u === 'mid') out.push({ l, u, k: 'cierre', d: l.fechas.cierre });
      const fp = l.fechas.finPreguntas;
      if (fp && fp > now() && dd(fp) <= 2) out.push({ l, u: 'mid', k: 'preguntas', d: fp });
    }
    const w = { crit: 0, high: 1, mid: 2 };
    return out.sort((a, b) => (a.k === b.k ? 0 : a.k === 'cierre' ? -1 : 1) || w[a.u] - w[b.u] || a.d - b.d);
  }

  /* ---------------- API ---------------- */
  async function api(path, { method = 'GET', body, form, quiet } = {}) {
    const r = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: form || (body ? JSON.stringify(body) : undefined) });
    let data = null; try { data = await r.json(); } catch (e) { /* vacío */ }
    if (r.status === 401 && !quiet) { stopPolling(); showLogin(); throw Object.assign(new Error('Sesión expirada'), { silent: true }); }
    if (!r.ok) throw new Error((data && data.error) || `Error ${r.status}`);
    return data;
  }
  async function reload() { const d = await api('/api/datos'); if (d.usuario) ME = d.usuario; apply(d); }
  async function act(cod, accion, body, okT, okM) {
    try {
      await api(`/api/licitaciones/${encodeURIComponent(cod)}/${accion}`, { method: 'POST', body });
      await reload();
      if (okT) toast(okT, okM, 'ok');
    } catch (e) {
      if (!e.silent) toast('No se pudo guardar', e.message, 'crit');
      try { await reload(); } catch (_) { /* noop */ }
    }
    render();
  }

  /* ---------------- Shell ---------------- */
  function shell() {
    $('#root').innerHTML = `
      <header class="top">
        <div class="top-in">
          <button class="ibtn burger" id="burger" aria-label="Menú">${ic('menu')}</button>
          <a class="logo" href="#/"><img src="assets/atalaya.svg" alt=""><span><b>Atalaya</b><small>Radar de licitaciones</small></span></a>
          <nav class="tabs" id="tabs">
            <a href="#/" data-r="radar">${ic('radar')}Radar</a>
            <a href="#/licitaciones" data-r="licitaciones">${ic('list')}Licitaciones <span class="n" id="nAct"></span></a>
            <a href="#/tablero" data-r="tablero">${ic('board')}Tablero</a>
            <a href="#/equipo" data-r="equipo">${ic('team')}Equipo</a>
            <a href="#/configuracion" data-r="configuracion">${ic('gear')}Configuración</a>
          </nav>
          <div class="top-r">
            <button class="find" id="findBtn">${ic('search')}<span>Buscar licitación…</span><kbd>Ctrl K</kbd></button>
            <div class="pop-w"><button class="ibtn" id="bellBtn" aria-label="Alertas">${ic('bell')}<span class="dot" id="bellN" hidden></span></button><div class="pop" id="bellPop" hidden></div></div>
            <button class="ibtn" id="themeBtn" aria-label="Cambiar tema"></button>
            <div class="pop-w"><button class="me" id="meBtn"></button><div class="pop" id="mePop" hidden style="width:260px"></div></div>
          </div>
        </div>
      </header>
      <div class="ticker"><div class="ticker-in" id="ticker"></div></div>
      <main class="page" id="view" tabindex="-1"></main>`;
    $('#burger').onclick = () => $('#tabs').classList.toggle('open');
    $('#findBtn').onclick = openPalette;
    $('#bellBtn').onclick = e => { e.stopPropagation(); togglePop('#bellPop'); };
    $('#meBtn').onclick = e => { e.stopPropagation(); togglePop('#mePop'); };
    $('#themeBtn').onclick = () => {
      const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = t; localStorage.setItem('atalaya.theme', t); paintTop();
    };
    $('#mePop').onclick = async e => {
      if (e.target.closest('#logout')) {
        // Se cierra al instante en pantalla; la cookie se borra en segundo plano
        stopPolling(); DATA = null; ME = null; showLogin();
        fetch('/api/salir', { method: 'POST', credentials: 'same-origin', keepalive: true }).catch(() => {});
      }
    };
  }
  function togglePop(id) { const el = $(id), was = el.hidden; closePops(); el.hidden = !was; }
  function closePops() { $$('.pop').forEach(p => { p.hidden = true; }); }

  function paintTop() {
    const nAct = LICS.filter(activa).length;
    $('#nAct').textContent = nAct;
    $('#themeBtn').innerHTML = ic(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon');
    $('#meBtn').innerHTML = `${av(ME.email)}<span>${esc(ME.nombre.split(' ')[0])}</span>`;
    $('#mePop').innerHTML = `
      <div class="pop-t">Sesión</div>
      <div class="pop-i">${av(ME.email, true)}<div><b>${esc(ME.nombre)}</b><small>${esc(ME.email)}</small></div></div>
      <a class="pop-i" href="#/configuracion">${ic('gear')}<div><b>Configuración</b><small>${ME.rol === 'admin' ? 'Palabras clave, usuarios y registro' : 'Palabras clave y registro de actividad'}</small></div></a>
      <button class="pop-i" id="logout">${ic('logout')}<div><b>Cerrar sesión</b></div></button>`;

    const al = alerts();
    const hot = al.filter(a => a.k === 'cierre' && (a.u === 'crit' || a.u === 'high'));
    $('#bellN').hidden = !hot.length; $('#bellN').textContent = hot.length;
    $('#bellPop').innerHTML = `<div class="pop-t">Alertas de plazo</div>` + (al.length ? al.map(a => {
      const n = dd(a.d), s = seg(a.l.codigo);
      return `<a class="pop-i" href="${href(a.l.codigo)}"><span class="pop-n ${a.u}">${n}<small>${n === 1 ? 'DÍA' : 'DÍAS'}</small></span><div>
        <b>${esc(a.l.nombre)}</b>
        <small>${a.k === 'cierre' ? 'Cierre de ofertas' : 'Cierre de preguntas'} · ${fDT(a.d)}</small>
        ${a.k === 'cierre' && !s.responsable ? '<small style="color:var(--red);font-weight:700">Sin responsable</small>' : ''}
      </div></a>`;
    }).join('') : `<div class="empty" style="padding:28px">Sin plazos urgentes.</div>`);

    const m = DATA.meta, nuevas = LICS.filter(l => l.nueva).length;
    const crit = al.filter(a => a.k === 'cierre' && a.u === 'crit');
    if (!m.recibido) { $('#ticker').innerHTML = '<span class="live"><i></i>Agente</span><span>Esperando el primer reporte del agente de licitaciones…</span>'; return; }
    $('#ticker').innerHTML = `
      <span class="live"><i></i>Agente</span>
      <span>Último reporte <b>${rel(REPORT_AT)} ${fTime(REPORT_AT)}</b></span><span class="sep"></span>
      <span><b>${(m.revisadas || 0).toLocaleString('es-CL')}</b> revisadas en Mercado Público</span><span class="sep"></span>
      <span><b>${LICS.filter(l => l.enReporte).length}</b> calzan con nuestras palabras clave</span><span class="sep"></span>
      <span><b>${nuevas}</b> ${nuevas === 1 ? 'nueva' : 'nuevas'}</span>
      ${crit.length ? `<span class="sep"></span><a class="hot" href="${href(crit[0].l.codigo)}">${ic('flame')}${plural(crit.length, 'cierra', 'cierran')} en menos de 48 h</a>` : ''}
      ${m.demo ? '<span class="demo">DATOS DE DEMOSTRACIÓN</span>' : ''}`;
  }

  /* ---------------- Vista: Radar ---------------- */
  function radarSvg(items, opts = {}) {
    const C = 200, R0 = 16, R1 = 178, MAX = 30;
    const rOf = d => R0 + Math.pow(Math.min(Math.max(d, 0), MAX + 4) / (MAX + 4), 0.62) * (R1 - R0);
    const rings = [[3, '3 d'], [7, '7 d'], [14, '14 d'], [30, '30 d']];
    const n = items.length || 1;
    const blips = items.map((l, i) => {
      const d = Math.max(0, (l.fechas.cierre - now()) / DAY);
      const a = (-90 + 25 + i * (360 / n)) * Math.PI / 180;
      const r = rOf(d);
      const x = C + r * Math.cos(a), y = C + r * Math.sin(a);
      const u = urg(l), size = 5 + Math.min(6, Math.log10(Math.max(l.montoEstimado || 1, 1e6) / 1e6 + 1) * 4);
      // La posición va en el grupo exterior y el efecto de agrandar en el interior:
      // así el punto no se mueve al pasar el mouse (eso causaba el parpadeo de la tarjeta).
      return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><g class="blip ${u}" data-cod="${esc(l.codigo)}">
        <circle class="hit" r="${size + 7}"/>
        <circle class="halo" r="${size}" fill="${U_COLOR[u]}" opacity="0"/>
        <circle class="core" r="${size}" fill="${U_COLOR[u]}"/>
      </g></g>`;
    }).join('');
    return `<svg class="radar" viewBox="0 0 400 400" aria-label="Radar de licitaciones por días al cierre">
      <defs>
        <linearGradient id="sw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#22C3EE" stop-opacity="0"/><stop offset="1" stop-color="#22C3EE" stop-opacity=".38"/></linearGradient>
      </defs>
      <line class="axis" x1="${C}" y1="${C - R1}" x2="${C}" y2="${C + R1}"/><line class="axis" x1="${C - R1}" y1="${C}" x2="${C + R1}" y2="${C}"/>
      ${rings.map(([d, t]) => `<circle class="ring" cx="${C}" cy="${C}" r="${rOf(d)}"/><text class="rl" x="${C + 4}" y="${C - rOf(d) + 11}">${t}</text>`).join('')}
      <circle class="ring" cx="${C}" cy="${C}" r="${R1}"/>
      <circle class="ring today" cx="${C}" cy="${C}" r="${R0}"/>
      <g class="sweep"><path d="M${C} ${C} L${C} ${C - R1} A${R1} ${R1} 0 0 1 ${C + R1 * Math.sin(Math.PI / 4)} ${C - R1 * Math.cos(Math.PI / 4)} Z" fill="url(#sw)"/></g>
      <circle cx="${C}" cy="${C}" r="3.5" fill="#fff"/>
      ${opts.noBlips ? '' : blips}
    </svg>`;
  }

  function vRadar() {
    const act = LICS.filter(activa);
    const open = act.filter(l => l.fechas.cierre > now()).sort((a, b) => a.fechas.cierre - b.fechas.cierre);
    const in7 = open.filter(l => dd(l.fechas.cierre) <= 7);
    const crit = open.filter(l => urg(l) === 'crit');
    const prep = LICS.filter(l => seg(l.codigo).estado === 'preparacion');
    const reqPend = prep.reduce((s, l) => s + docs(l).req, 0);
    const sinResp = act.filter(l => !seg(l.codigo).responsable).length;
    const monto = act.reduce((s, l) => s + (Number(l.montoEstimado) || 0), 0);
    const nuevas = LICS.filter(l => l.nueva);
    const mine = act.filter(l => seg(l.codigo).responsable === ME.email);
    const h = now().getHours();
    const hola = h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';

    // agenda 7 días
    const evs = [];
    for (const l of LICS) {
      const st = seg(l.codigo).estado;
      if (st === 'descartada' || st === 'noadjudicada') continue;
      for (const [k, d] of Object.entries(l.fechas)) if (k !== 'publicacion' && d >= sod(now()) && dd(d) <= 7) evs.push({ l, k, d });
    }
    evs.sort((a, b) => a.d - b.d);
    const days = new Map();
    for (const e of evs) { const key = sod(e.d).getTime(); if (!days.has(key)) days.set(key, []); days.get(key).push(e); }

    const kws = DATA.meta.palabrasClave.map(k => ({ k, n: act.filter(l => l.palabrasClave.includes(k)).length })).filter(k => k.n).sort((a, b) => b.n - a.n).slice(0, 12);
    const kmax = Math.max(1, ...kws.map(k => k.n));

    return `
    <div class="deck rise">
      <section class="scope" id="scope">
        <div class="scope-h">
          <div><h2>Radar de cierres</h2><p>Centro = hoy. Mientras más cerca del centro, menos días quedan para presentar.</p></div>
          <div class="scope-legend">
            <span style="--c:var(--red)"><i></i>≤ 2 días</span><span style="--c:var(--amber)"><i></i>≤ 5 días</span>
            <span style="--c:var(--blue)"><i></i>≤ 10 días</span><span style="--c:var(--green)"><i></i>Más de 10</span>
          </div>
        </div>
        ${radarSvg(open)}
        <div class="scope-foot"><span>${plural(open.length, 'licitación abierta', 'licitaciones abiertas')} en carrera</span><span>Tamaño del punto = monto estimado</span></div>
        <div class="scope-tip" id="tip" hidden></div>
      </section>

      <section class="today">
        <div class="box">
          <div class="hello">
            <span class="date">${cap(fLong(now()))}</span>
            <h1>${hola}, ${esc(ME.nombre.split(' ')[0])}.</h1>
            ${!DATA.meta.recibido ? `<p>El radar está listo. Apenas el agente envíe su primer reporte desde Mercado Público, aquí verás las licitaciones que calzan con las palabras clave de Sermaluc.</p>` : `<p>Hoy hay <b>${plural(in7.length, 'licitación que cierra', 'licitaciones que cierran')} esta semana</b>${mine.length ? ` y tienes <b>${plural(mine.length, 'a tu cargo', 'a tu cargo')}</b>` : ''}. El agente sumó <b>${plural(nuevas.length, 'oportunidad nueva', 'oportunidades nuevas')}</b> en su último reporte.</p>`}
            <div class="acts">
              <a class="btn pri" href="#/licitaciones?estado=nueva">${ic('sparkle')}Revisar nuevas</a>
              ${mine.length ? `<a class="btn" href="#/licitaciones?resp=${encodeURIComponent(ME.email)}">${ic('user')}Mis licitaciones</a>` : ''}
            </div>
          </div>
          <div class="stats">
            <div class="stat"><div class="v">${act.length}</div><div class="l">En carrera</div><div class="x ${sinResp ? 'red' : ''}">${sinResp ? plural(sinResp, 'sin responsable', 'sin responsable') : 'Todas asignadas'}</div></div>
            <div class="stat"><div class="v ${crit.length ? 'red' : ''}">${in7.length}</div><div class="l">Cierran en ≤ 7 días</div><div class="x ${crit.length ? 'red' : ''}">${crit.length} en menos de 48 h</div></div>
            <div class="stat"><div class="v">${reqPend}</div><div class="l">Documentos obligatorios pendientes</div><div class="x">${plural(prep.length, 'licitación', 'licitaciones')} en preparación</div></div>
            <div class="stat"><div class="v">${money(monto, true)}</div><div class="l">Monto estimado en juego</div><div class="x">${plural(LICS.filter(l => seg(l.codigo).estado === 'adjudicada').length, 'adjudicada', 'adjudicadas')}</div></div>
          </div>
        </div>
      </section>
    </div>

    <section class="sect">
      <div class="sect-h"><div><h2>Cuenta regresiva</h2><span>Licitaciones en carrera, de la más urgente a la menos urgente</span></div></div>
      ${open.length ? `<div class="strip">${open.map(l => {
        const s = seg(l.codigo), di = docs(l), u = urg(l), n = dd(l.fechas.cierre);
        const warn = !s.responsable ? 'Sin responsable' : (di.req && s.estado !== 'nueva') ? `${di.req} obligatorio${di.req === 1 ? '' : 's'} pendiente${di.req === 1 ? '' : 's'}` : '';
        return `<a class="cd" style="--u:${U_COLOR[u]}" href="${href(l.codigo)}">
          <div class="cd-top"><div class="cd-num"><b>${n}</b><span>${n === 1 ? 'día' : 'días'}<br>${fTime(l.fechas.cierre)}</span></div>${av(s.responsable)}</div>
          <h3>${esc(l.nombre)}</h3><div class="org">${esc(l.organismo)}</div>
          ${segs(l)}
          <div class="cd-foot">${est(s.estado)}<small>${di.done}/${di.total} docs</small></div>
          ${warn ? `<div class="warn">${ic('alert')}${warn}</div>` : ''}
        </a>`;
      }).join('')}</div>` : `<div class="box empty">No hay licitaciones abiertas en carrera.</div>`}
    </section>

    <section class="trio">
      <div class="box">
        <div class="box-h"><h2>${ic('sparkle')}Nuevas en el último reporte</h2><a class="lnk" href="#/licitaciones?estado=nueva">Ver todas</a></div>
        ${nuevas.length ? nuevas.map(l => `<a class="rowlink" href="${href(l.codigo)}">${match(l.match || 0)}<div><b>${esc(l.nombre)}</b><small>${esc(l.organismo)} · ${money(l.montoEstimado, true)}</small></div>${due(l)}</a>`).join('') : '<div class="empty">Sin nuevas en el último reporte.</div>'}
      </div>
      <div class="box">
        <div class="box-h"><h2>${ic('clock')}Próximos 7 días</h2></div>
        <div style="padding-bottom:10px">${days.size ? Array.from(days.entries()).map(([k, list]) => {
          const d = new Date(+k), n = dd(d);
          return `<div class="daylbl ${n === 0 ? 'hoy' : ''}">${n === 0 ? 'Hoy' : n === 1 ? 'Mañana' : fDate(d)}</div>` + list.map(e => `<a class="ev" href="${href(e.l.codigo)}" style="--c:${HITO[e.k].c}"><time>${fTime(e.d)}</time><i></i><div><b>${HITO[e.k].label}</b><small>${esc(e.l.nombre)}</small></div></a>`).join('');
        }).join('') : '<div class="empty">Sin hitos esta semana.</div>'}</div>
      </div>
      <div class="box">
        <div class="box-h"><h2>${ic('tag')}Palabras clave</h2><span class="mono" style="color:var(--muted)">en carrera</span></div>
        <div style="padding:8px 0">${kws.length ? '' : '<div class="empty">Sin coincidencias todavía.</div>'}${kws.map(k => `<a class="kwb" href="#/licitaciones?kw=${encodeURIComponent(k.k)}"><span>${esc(k.k)}</span><b>${k.n}</b><div class="bar"><i style="width:${k.n / kmax * 100}%"></i></div></a>`).join('')}</div>
      </div>
    </section>`;
  }
  function bindRadar() {
    const scope = $('#scope'), tip = $('#tip');
    if (!scope) return;
    $$('.blip', scope).forEach(b => {
      b.addEventListener('mouseenter', () => {
        const l = BY[b.dataset.cod], s = seg(l.codigo);
        const r = b.getBoundingClientRect(), sr = scope.getBoundingClientRect();
        tip.innerHTML = `<span class="mono">${esc(l.codigo)}</span><b>${esc(l.nombre)}</b>${due(l)} &nbsp;${est(s.estado)}<div style="margin-top:6px;color:#5A6787">${esc(l.organismo)} · ${money(l.montoEstimado, true)}</div>`;
        tip.style.left = (r.left + r.width / 2 - sr.left) + 'px';
        tip.style.top = (r.top - sr.top) + 'px';
        tip.hidden = false;
      });
      b.addEventListener('mouseleave', () => { tip.hidden = true; });
      b.addEventListener('click', () => { location.hash = href(b.dataset.cod); });
    });
  }

  /* ---------------- Vista: Licitaciones ---------------- */
  function vLista(params) {
    if (params) {
      ui.estado = params.get('estado') || (params.has('kw') || params.has('resp') ? 'todas' : 'activas');
      ui.kw = params.get('kw') || ''; ui.resp = params.get('resp') || '';
      ui.orden = params.get('orden') || 'cierre'; ui.urg = params.get('urg') === '1';
    }
    const opts = [{ id: 'activas', label: 'En carrera' }, { id: 'todas', label: 'Todas' }, ...ESTADOS];
    const count = id => id === 'todas' ? LICS.length : id === 'activas' ? LICS.filter(activa).length : LICS.filter(l => seg(l.codigo).estado === id).length;
    return `
    <div class="head rise"><div><span class="kicker">Mercado Público · ${LICS.length} detectadas</span><h1>Licitaciones</h1><p>Todo lo que el agente detectó para Sermaluc, con estado, responsable y plazo.</p></div></div>
    <div class="pills" id="pills">${opts.map(o => `<button data-e="${o.id}" class="${ui.estado === o.id ? 'on' : ''}">${o.label}<em>${count(o.id)}</em></button>`).join('')}</div>
    <div class="filters">
      <label class="select">${ic('user')}<select id="fResp"><option value="">Cualquier responsable</option><option value="__none" ${ui.resp === '__none' ? 'selected' : ''}>Sin responsable</option>${DATA.equipo.map(p => `<option value="${esc(p.id)}" ${ui.resp === p.id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label>
      <label class="select">${ic('tag')}<select id="fKw"><option value="">Todas las palabras clave</option>${DATA.meta.palabrasClave.map(k => `<option ${ui.kw === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></label>
      <label class="select">${ic('clock')}<select id="fOrden">
        ${[['cierre', 'Cierre más próximo'], ['match', 'Mayor coincidencia'], ['monto', 'Mayor monto'], ['pub', 'Publicación reciente']].map(([v, t]) => `<option value="${v}" ${ui.orden === v ? 'selected' : ''}>${t}</option>`).join('')}
      </select></label>
      <button class="toggle ${ui.urg ? 'on' : ''}" id="fUrg">${ic('flame')}Cierran en ≤ 7 días</button>
      <span class="count" id="cnt"></span>
    </div>
    <div id="tbl"></div>`;
  }
  function listFiltered() {
    const q = ui.q.trim().toLowerCase();
    const arr = LICS.filter(l => {
      const s = seg(l.codigo);
      if (ui.estado === 'activas' && !activa(l)) return false;
      if (!['todas', 'activas'].includes(ui.estado) && s.estado !== ui.estado) return false;
      if (ui.resp === '__none' ? !!s.responsable : ui.resp && s.responsable !== ui.resp) return false;
      if (ui.kw && !l.palabrasClave.includes(ui.kw)) return false;
      if (ui.urg && !(activa(l) && l.fechas.cierre > now() && dd(l.fechas.cierre) <= 7)) return false;
      if (q && !`${l.codigo} ${l.nombre} ${l.organismo} ${l.palabrasClave.join(' ')}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const closed = l => (!l.fechas.cierre || l.fechas.cierre < now()) ? 1 : 0;
    arr.sort((a, b) => ui.orden === 'match' ? (b.match || 0) - (a.match || 0)
      : ui.orden === 'monto' ? (b.montoEstimado || 0) - (a.montoEstimado || 0)
      : ui.orden === 'pub' ? b.pub - a.pub
      : (closed(a) - closed(b)) || (activa(b) - activa(a)) || ((a.fechas.cierre || 0) - (b.fechas.cierre || 0)));
    return arr;
  }
  function paintList() {
    const arr = listFiltered();
    $('#cnt').textContent = `${arr.length} resultado${arr.length === 1 ? '' : 's'}`;
    $('#tbl').innerHTML = arr.length ? `<table class="grid"><thead><tr>
        <th style="padding:0;width:4px"></th><th>Licitación</th><th class="c-kw">Palabras clave</th><th class="c-monto">Monto</th><th>Cierre</th><th class="c-docs">Documentos</th><th class="c-est">Estado</th><th class="c-resp">Responsable</th>
      </tr></thead><tbody>${arr.map(l => {
        const s = seg(l.codigo), di = docs(l), a = activa(l), u = urg(l);
        return `<tr data-h="${href(l.codigo)}" class="${a ? '' : 'dim'}">
          <td class="u" style="--u:${a ? U_COLOR[u] : 'transparent'}"></td>
          <td><div class="meta"><span class="mono">${esc(l.codigo)}</span>${l.nueva ? '<span class="tag new">NUEVA</span>' : ''}${match(l.match || 0)}</div><div class="nm">${esc(l.nombre)}</div><div class="og">${esc(l.organismo)}</div></td>
          <td class="c-kw"><div class="kws">${l.palabrasClave.map(k => `<span class="tag k">${esc(k)}</span>`).join('')}</div></td>
          <td class="c-monto"><div class="amt">${money(l.montoEstimado, true)}</div><div class="sub">${esc(l.tipo || '')} · ${esc(l.duracion || '')}</div></td>
          <td>${a || u === 'closed' ? due(l) : ''}<div class="sub">${l.fechas.cierre ? fDT(l.fechas.cierre) : ''}</div></td>
          <td class="c-docs docs">${segs(l)}<small>${di.done}/${di.total}${di.req ? ` · ${di.req} oblig.` : ''}</small></td>
          <td class="c-est">${est(s.estado)}</td>
          <td class="c-resp"><div class="person">${av(s.responsable)}<div><b>${s.responsable ? esc(nameOf(s.responsable)) : 'Sin asignar'}</b></div></div></td>
        </tr>`;
      }).join('')}</tbody></table>` : `<div class="box empty">${radarSvg([], { noBlips: true }).replace('class="radar"', 'class="radar" style="width:120px;filter:invert(.8)"')}<h3>Nada en el radar con esos filtros</h3><p>Quita algún filtro o prueba con otra búsqueda.</p></div>`;
    $$('#tbl tr[data-h]').forEach(tr => tr.onclick = () => { location.hash = tr.dataset.h; });
  }
  function bindLista() {
    $('#pills').onclick = e => { const b = e.target.closest('button'); if (!b) return; ui.estado = b.dataset.e; $$('#pills button').forEach(x => x.classList.toggle('on', x === b)); paintList(); };
    $('#fResp').onchange = e => { ui.resp = e.target.value; paintList(); };
    $('#fKw').onchange = e => { ui.kw = e.target.value; paintList(); };
    $('#fOrden').onchange = e => { ui.orden = e.target.value; paintList(); };
    $('#fUrg').onclick = e => { ui.urg = !ui.urg; e.currentTarget.classList.toggle('on', ui.urg); paintList(); };
    paintList();
  }

  /* ---------------- Vista: Ficha ---------------- */
  function vFicha(cod) {
    const l = BY[cod];
    if (!l) return `<a class="crumb" href="#/licitaciones">${ic('back')}Licitaciones</a><div class="box empty"><h3>No encontramos esa licitación</h3><p>Puede que el código no exista o que ya no esté en el radar.</p></div>`;
    const s = seg(cod), di = docs(l), u = urg(l), a = activa(l);
    const url = /^https:\/\/www\.mercadopublico\.cl\//.test(l.url || '') ? l.url : `https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${encodeURIComponent(cod)}`;
    const notas = s.eventos.filter(e => e.tipo === 'nota').length;
    const C = 2 * Math.PI * 26;
    let msg = '';
    if (a && l.fechas.cierre > now()) {
      const parts = [];
      if (!s.responsable) parts.push('no tiene responsable');
      if (di.req) parts.push(`faltan ${plural(di.req, 'documento obligatorio', 'documentos obligatorios')}`);
      if (parts.length && u !== 'ok') msg = `<div class="clock-msg">${ic('alert')}<span>Atención: ${parts.join(' y ')}.</span></div>`;
    }
    const tab = ui.tab;
    return `
    <a class="crumb" href="#/licitaciones">${ic('back')}Licitaciones</a>
    <div class="f-title rise">
      <div class="tagline"><span class="mono" style="color:var(--muted)">${esc(cod)}</span><span class="tag k">${esc(l.tipo || '')} · ${esc(TIPOS[l.tipo] || 'Licitación pública')}</span>${l.nueva ? '<span class="tag new">NUEVA</span>' : ''}${match(l.match || 0)}</div>
      <h1>${esc(l.nombre)}</h1>
      <div class="org">${esc(l.organismo)} <span>· ${esc(l.unidad || '')}${l.region ? ' · ' + esc(l.region) : ''}</span></div>
    </div>
    <div class="f-wrap">
      <aside class="f-side">
        <div class="clock ${l.fechas.cierre && l.fechas.cierre > now() ? '' : 'closed'}" style="--u:${U_COLOR[u]}">
          <div class="clock-h"><span>Cierre de ofertas</span><b>${l.fechas.cierre ? fDT(l.fechas.cierre) : '—'}</b></div>
          <div class="clock-n" id="clockN" data-t="${l.fechas.cierre ? l.fechas.cierre.getTime() : ''}">${clockCells(l.fechas.cierre)}</div>
          ${msg}
        </div>
        <div class="box side-box">
          <span class="lbl">Estado</span>
          <label class="select full"><span style="width:10px;height:10px;border-radius:3px;background:${EST[s.estado].c}"></span><select id="sEst">${ESTADOS.map(e => `<option value="${e.id}" ${e.id === s.estado ? 'selected' : ''}>${e.label}</option>`).join('')}</select></label>
          <span class="lbl">Responsable</span>
          <label class="select full">${ic('user')}<select id="sResp"><option value="">Sin asignar</option>${DATA.equipo.map(p => `<option value="${esc(p.id)}" ${p.id === s.responsable ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label>
          ${s.responsable !== ME.email ? `<button class="btn ink" id="take">${ic('user')}Asignármela</button>` : ''}
          <div class="side-links"><a class="btn" href="${url}" target="_blank" rel="noopener" title="Ficha de la licitación en Mercado Público">${ic('ext')}Ficha</a><a class="btn" href="/api/licitaciones/${encodeURIComponent(cod)}/adjuntos" target="_blank" rel="noopener" title="Pantalla de descarga de adjuntos">${ic('download')}Adjuntos</a><button class="btn" id="copy" title="Copiar código">${ic('copy')}</button></div>
        </div>
        <div class="box side-box">
          <div class="prog">
            <svg class="donut ${di.pct === 100 ? 'full' : ''}" viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="26"/><circle class="fg" cx="32" cy="32" r="26" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - di.pct / 100)}"/><text x="32" y="33">${di.pct}%</text></svg>
            <div><b>${di.done} de ${di.total} documentos</b><small>${di.pct === 100 ? 'Todo listo para presentar' : di.req ? `${plural(di.req, 'obligatorio pendiente', 'obligatorios pendientes')}` : 'Faltan solo opcionales'}</small></div>
          </div>
        </div>
      </aside>

      <section class="box">
        <div class="ftabs" id="ftabs">
          <button data-t="resumen" class="${tab === 'resumen' ? 'on' : ''}">Resumen</button>
          <button data-t="documentos" class="${tab === 'documentos' ? 'on' : ''}">Documentación <em class="${di.req && a ? 'red' : ''}">${di.done}/${di.total}</em>${l.archivos.length ? `<em title="Archivos subidos">${ic('clip')}${l.archivos.length}</em>` : ''}</button>
          <button data-t="fechas" class="${tab === 'fechas' ? 'on' : ''}">Fechas importantes</button>
          <button data-t="bitacora" class="${tab === 'bitacora' ? 'on' : ''}">Bitácora <em>${notas}</em></button>
        </div>
        <div class="fpane">${tab === 'documentos' ? paneDocs(l) : tab === 'fechas' ? paneFechas(l) : tab === 'bitacora' ? paneLog(l) : paneResumen(l)}</div>
      </section>
    </div>`;
  }
  function clockCells(c) {
    let ms = c ? Math.max(0, c - now()) : 0;
    const d = Math.floor(ms / DAY); ms -= d * DAY;
    const h = Math.floor(ms / 3600000); ms -= h * 3600000;
    const m = Math.floor(ms / 60000); ms -= m * 60000;
    const s = Math.floor(ms / 1000);
    const p = v => String(v).padStart(2, '0');
    return `<div><strong>${d}</strong><span>días</span></div><div><strong>${p(h)}</strong><span>horas</span></div><div><strong>${p(m)}</strong><span>min</span></div><div><strong>${p(s)}</strong><span>seg</span></div>`;
  }
  function paneResumen(l) {
    return `
      <p class="desc">${esc(l.descripcion || 'Sin descripción.')}</p>
      <div class="facts">
        <div><span>Monto estimado</span><b>${l.moneda && l.moneda !== 'CLP' && l.montoOriginal ? `${Number(l.montoOriginal).toLocaleString('es-CL')} ${esc(l.moneda)}` : money(l.montoEstimado)}</b></div>
        <div><span>Duración</span><b>${esc(l.duracion || '—')}</b></div>
        <div><span>Publicada</span><b>${fDate(l.pub)}</b></div>
        <div><span>Coincidencia</span><b>${l.match || 0}%</b></div>
      </div>
      <div class="two">
        <div>
          <div class="mini-h">Criterios de evaluación</div>
          ${l.criterios.length ? l.criterios.map(c => `<div class="criterio"><span>${esc(c.nombre)}</span><b>${Number(c.peso) || 0}%</b><div class="bar"><i style="width:${Number(c.peso) || 0}%"></i></div></div>`).join('') : '<p style="color:var(--muted)">No informados.</p>'}
        </div>
        <div>
          <div class="mini-h">Garantías y contacto</div>
          ${l.garantias.map(g => `<div class="info">${ic('shield')}<div><b>${esc(g.tipo)} · ${esc(g.monto)}</b><small>Vigencia: ${esc(g.vigencia)}</small></div></div>`).join('')}
          <div class="info">${ic('mail')}<div><b>${esc(l.contacto.nombre || 'Organismo')}</b><small>${esc(l.contacto.email || '')}</small></div></div>
          <div class="info">${ic('tag')}<div><b>Palabras clave detectadas</b><div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">${l.palabrasClave.map(k => `<a class="tag k" href="#/licitaciones?kw=${encodeURIComponent(k)}">${esc(k)}</a>`).join('')}</div></div></div>
        </div>
      </div>`;
  }
  const mpUrl = l => /^https:\/\/www\.mercadopublico\.cl\//.test(l.url || '') ? l.url : `https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${encodeURIComponent(l.codigo)}`;
  const fSize = b => b >= 1048576 ? (b / 1048576).toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const EXT_OK = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.csv,.txt,.zip,.rar,.7z,.jpg,.jpeg,.png';
  function fileRow(a) {
    const puede = a.por === ME.email || ME.rol === 'admin';
    return `<div class="file">
      <span class="file-ic">${ic('file')}</span>
      <div class="file-t"><a href="/api/archivos/${esc(a.id)}" download>${esc(a.nombre)}</a><small>${fSize(a.tamano)} · ${esc(nameOf(a.por))} · ${fDT(new Date(a.fecha))}</small></div>
      <a class="ibtn sm" href="/api/archivos/${esc(a.id)}" download title="Descargar">${ic('download')}</a>
      ${puede ? `<button class="ibtn sm" data-del-file="${esc(a.id)}" data-name="${esc(a.nombre)}" title="Borrar">${ic('trash')}</button>` : ''}
    </div>`;
  }
  function paneDocs(l) {
    const s = seg(l.codigo);
    const ids = new Set(l.documentos.map(d => d.id));
    const sueltos = l.archivos.filter(a => !a.docId || !ids.has(a.docId));
    const porDoc = id => l.archivos.filter(a => a.docId === id);
    const groups = ['Administrativo', 'Técnico', 'Económico'].map(g => ({ g, d: l.documentos.filter(x => (x.tipo || 'Administrativo') === g) })).filter(x => x.d.length);
    return `
    <section class="bases">
      <div class="bases-h">
        <div><h3>${ic('clip')}Bases y anexos de la licitación</h3>
        <p>El botón abre directo la pantalla de descarga de adjuntos de Mercado Público (allí puede pedirte una verificación anti-robots). Descárgalos y súbelos aquí para que todo el equipo los tenga a mano.</p></div>
        <a class="btn pri" href="/api/licitaciones/${encodeURIComponent(l.codigo)}/adjuntos" target="_blank" rel="noopener">${ic('download')}Abrir adjuntos en Mercado Público</a>
      </div>
      <div class="drop" id="drop" tabindex="0" role="button" aria-label="Subir archivos">
        ${ic('upload')}<b>Arrastra aquí los archivos o haz clic para elegirlos</b>
        <small>PDF, Word, Excel, PowerPoint, ZIP o imágenes · hasta 25 MB cada uno</small>
      </div>
      ${sueltos.length ? `<div class="files">${sueltos.map(fileRow).join('')}</div>` : ''}
    </section>
    <h3 class="chk-h">${ic('check')}Checklist de documentos a presentar</h3>
    ${groups.map(gr => `<div class="dgroup"><h4><span>${gr.g}</span><span>${gr.d.filter(d => s.docs[d.id]).length}/${gr.d.length}</span></h4>
      ${gr.d.map(d => {
        const fs = porDoc(d.id);
        return `<div class="doc-wrap">
        <div class="doc-row">
          <label class="doc"><input type="checkbox" data-doc="${esc(d.id)}" ${s.docs[d.id] ? 'checked' : ''}><span class="box2">${ic('check')}</span><span class="dn">${esc(d.nombre)}${d.origen === 'equipo' ? ' <span class="opt">agregado por el equipo</span>' : ''}</span>${d.obligatorio ? '<span class="req">Obligatorio</span>' : '<span class="opt">Opcional</span>'}</label>
          <button class="ibtn sm" data-attach="${esc(d.id)}" title="Adjuntar el documento preparado">${ic('clip')}${fs.length ? `<span class="cnt">${fs.length}</span>` : ''}</button>
          ${d.origen === 'equipo' ? `<button class="ibtn sm" data-del-req="${esc(d.id)}" data-name="${esc(d.nombre)}" title="Quitar del checklist">${ic('x')}</button>` : ''}
        </div>
        ${fs.length ? `<div class="files sub">${fs.map(fileRow).join('')}</div>` : ''}
      </div>`;
      }).join('')}
    </div>`).join('') || '<div class="empty">Aún no hay documentos en el checklist.</div>'}
    ${(() => {
      const enChk = l.archivos.filter(a => a.docId && ids.has(a.docId));
      if (!l.documentos.length) return '';
      const conArchivo = new Set(enChk.map(a => a.docId)).size;
      const peso = enChk.reduce((t, a) => t + (a.tamano || 0), 0);
      return `<div class="export-docs ${enChk.length ? '' : 'off'}">
        <div><b>${ic('download')}Exportar documentos del checklist</b>
        <small>${enChk.length ? `${enChk.length} archivo${enChk.length === 1 ? '' : 's'} en ${conArchivo} de ${l.documentos.length} documentos · ${fSize(peso)} · un ZIP con una carpeta por documento y un índice` : 'Adjunta archivos a los documentos con el clip para poder exportarlos juntos'}</small></div>
        ${enChk.length ? `<a class="btn pri" href="/api/licitaciones/${encodeURIComponent(l.codigo)}/documentos.zip" download>${ic('download')}Descargar todos (ZIP)</a>` : `<button class="btn" disabled>${ic('download')}Descargar todos (ZIP)</button>`}
      </div>`;
    })()}
    <form class="add-req" id="addReq">
      <input class="input" name="nombre" maxlength="300" placeholder="Agregar un documento que piden las bases (p. ej. Anexo N°7 · Boleta de garantía)" required>
      <label class="select"><select name="tipo"><option>Administrativo</option><option>Técnico</option><option>Económico</option></select></label>
      <label class="chk"><input type="checkbox" name="obligatorio" checked> Obligatorio</label>
      <button class="btn pri">${ic('plus')}Agregar</button>
    </form>
    <input type="file" id="fileIn" multiple accept="${EXT_OK}" hidden>`;
  }
  async function subir(cod, files, docId = '') {
    files = [...files];
    if (!files.length) return;
    let okN = 0;
    for (const f of files) {
      if (f.size > 25 * 1024 * 1024) { toast('Archivo muy grande', `${f.name} supera los 25 MB`, 'crit'); continue; }
      const fd = new FormData();
      fd.append('archivo', f);
      fd.append('categoria', docId ? 'preparado' : 'bases');
      if (docId) fd.append('doc_id', docId);
      toast('Subiendo…', f.name);
      try { await api(`/api/licitaciones/${encodeURIComponent(cod)}/archivos`, { method: 'POST', form: fd }); okN++; }
      catch (e) { if (!e.silent) toast('No se pudo subir', `${f.name}: ${e.message}`, 'crit'); }
    }
    try { await reload(); } catch (_) { /* noop */ }
    render();
    if (okN) toast(okN === 1 ? 'Archivo subido' : `${okN} archivos subidos`, 'Ya está disponible para todo el equipo.', 'ok');
  }
  function bindDocs(cod) {
    const input = $('#fileIn'), drop = $('#drop');
    if (!input) return;
    let destino = '';
    const elegir = docId => { destino = docId; input.value = ''; input.click(); };
    input.onchange = () => subir(cod, input.files, destino);
    drop.onclick = () => elegir('');
    drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(''); } };
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); subir(cod, e.dataTransfer.files, ''); };
    $$('[data-attach]').forEach(b => b.onclick = () => elegir(b.dataset.attach));
    $$('[data-del-file]').forEach(b => b.onclick = async () => {
      if (!confirm(`¿Borrar «${b.dataset.name}»? Se elimina para todo el equipo.`)) return;
      try { await api('/api/archivos/' + encodeURIComponent(b.dataset.delFile), { method: 'DELETE' }); await reload(); toast('Archivo borrado', b.dataset.name, 'ok'); }
      catch (e) { if (!e.silent) toast('No se pudo borrar', e.message, 'crit'); }
      render();
    });
    $$('[data-del-req]').forEach(b => b.onclick = async () => {
      if (!confirm(`¿Quitar «${b.dataset.name}» del checklist? Sus archivos quedan en la licitación.`)) return;
      try { await api(`/api/licitaciones/${encodeURIComponent(cod)}/requeridos/${encodeURIComponent(b.dataset.delReq)}`, { method: 'DELETE' }); await reload(); toast('Documento quitado', b.dataset.name, 'ok'); }
      catch (e) { if (!e.silent) toast('No se pudo quitar', e.message, 'crit'); }
      render();
    });
    $('#addReq').onsubmit = e => {
      e.preventDefault();
      const f = new FormData(e.target);
      act(cod, 'requeridos', { nombre: f.get('nombre'), tipo: f.get('tipo'), obligatorio: !!f.get('obligatorio') }, 'Documento agregado', String(f.get('nombre')));
    };
  }
  function paneFechas(l) {
    const hs = HITOS.filter(h => l.fechas[h.k]).map(h => ({ ...h, d: l.fechas[h.k] })).sort((a, b) => a.d - b.d);
    const nx = hs.findIndex(h => h.d > now());
    return `<div class="tl">${hs.map((h, i) => `<div class="tl-i ${h.d <= now() ? 'past' : ''} ${i === nx ? 'next' : ''} ${h.key ? 'key' : ''}">
      <div class="tl-d"><b>${fDate(h.d)}</b>${fTime(h.d)}</div>
      <span class="tl-m">${h.d <= now() ? ic('check') : ''}</span>
      <div class="tl-n">${h.label}</div>
      <span class="tl-r">${rel(h.d)}</span>
    </div>`).join('')}</div>`;
  }
  function paneLog(l) {
    const s = seg(l.codigo);
    return `
      <form class="log-form" id="logForm">${av(ME.email, true)}<textarea id="logTxt" placeholder="Escribe un avance, una duda o un acuerdo del equipo… (Ctrl+Enter para guardar)" maxlength="4000"></textarea><button class="btn pri" type="submit">Guardar</button></form>
      <div class="log">${s.eventos.length ? s.eventos.map(e => e.tipo === 'nota'
        ? `<div class="log-i">${av(e.autor, true)}<div><header><b>${esc(nameOf(e.autor))}</b><time>${fDT(new Date(e.fecha))}</time></header><p>${esc(e.texto)}</p></div></div>`
        : `<div class="log-i sys"><span class="mk"><i></i></span><div>${esc(e.texto)}<time>${fDT(new Date(e.fecha))}</time></div></div>`).join('') : '<p style="color:var(--muted)">Todavía no hay registros. Deja aquí los avances para que todo el equipo esté al día.</p>'}</div>`;
  }
  function bindFicha(cod) {
    const l = BY[cod]; if (!l) return;
    $('#ftabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; ui.tab = b.dataset.t; render(); };
    $('#sEst').onchange = e => act(cod, 'estado', { estado: e.target.value }, 'Estado actualizado', `${cod} → ${EST[e.target.value].label}`);
    $('#sResp').onchange = e => act(cod, 'responsable', { responsable: e.target.value }, e.target.value ? 'Responsable asignado' : 'Responsable quitado', e.target.value ? `${nameOf(e.target.value)} está a cargo de ${cod}` : cod);
    const take = $('#take'); if (take) take.onclick = () => act(cod, 'responsable', { responsable: ME.email }, 'Licitación asignada', `Ahora estás a cargo de ${cod}`);
    $('#copy').onclick = () => { navigator.clipboard?.writeText(cod); toast('Código copiado', cod, 'ok'); };
    bindDocs(cod);
    $$('input[data-doc]').forEach(ch => ch.onchange = async () => {
      ch.closest('.doc').classList.add('busy');
      const before = docs(l).pct;
      await act(cod, 'documentos', { doc: ch.dataset.doc, listo: ch.checked });
      if (before < 100 && docs(l).pct === 100) toast('Documentación completa', 'Ya puedes subir la oferta a Mercado Público.', 'ok');
    });
    const f = $('#logForm');
    if (f) {
      const t = $('#logTxt');
      t.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) f.requestSubmit(); });
      f.onsubmit = e => { e.preventDefault(); const v = t.value.trim(); if (v) act(cod, 'notas', { texto: v }, 'Nota guardada'); };
    }
    const cn = $('#clockN');
    if (cn && cn.dataset.t) {
      const c = new Date(+cn.dataset.t);
      ticker = setInterval(() => { if (!document.body.contains(cn)) return clearInterval(ticker); cn.innerHTML = clockCells(c); }, 1000);
    }
  }

  /* ---------------- Vista: Tablero ---------------- */
  function vTablero() {
    const opts = [{ id: 'activas', label: 'En carrera' }, { id: 'todas', label: 'Todas' }, ...ESTADOS];
    const count = id => id === 'todas' ? LICS.length : id === 'activas' ? LICS.filter(activa).length : LICS.filter(l => seg(l.codigo).estado === id).length;
    const f = ui.tEstado || 'activas';
    const closed = l => (!l.fechas.cierre || l.fechas.cierre < now()) ? 1 : 0;
    const list = LICS.filter(l => f === 'todas' ? true : f === 'activas' ? activa(l) : seg(l.codigo).estado === f)
      .sort((x, y) => (closed(x) - closed(y)) || (activa(y) - activa(x)) || ((x.fechas.cierre || 0) - (y.fechas.cierre || 0)));
    return `
    <div class="head rise"><div><span class="kicker">Seguimiento</span><h1>Tablero</h1><p>Cada licitación con su estado y el reloj hasta el cierre de ofertas. Cambia el estado directo en la tarjeta.</p></div></div>
    <div class="pills" id="tPills">${opts.map(o => `<button data-e="${o.id}" class="${f === o.id ? 'on' : ''}">${o.label}<em>${count(o.id)}</em></button>`).join('')}</div>
    ${list.length ? `<div class="tgrid">${list.map(tCard).join('')}</div>` : '<div class="box empty"><h3>No hay licitaciones en este estado</h3><p>Elige otro filtro arriba.</p></div>'}`;
  }
  function tCard(l) {
    const s = seg(l.codigo), di = docs(l), a = activa(l);
    const c = l.fechas.cierre, abierta = c && c > now();
    const u = a ? urg(l) : 'closed';
    return `<article class="tcard ${abierta ? '' : 'off'}" style="--u:${a ? U_COLOR[u] : 'var(--line-strong)'};--c:${EST[s.estado].c}" data-h="${href(l.codigo)}">
      <header class="tc-h">
        <span class="mono">${esc(l.codigo)}</span>${l.nueva ? '<span class="tag new">NUEVA</span>' : ''}
        <label class="tc-st" title="Cambiar estado"><i></i><select data-cod="${esc(l.codigo)}" aria-label="Estado">${ESTADOS.map(e => `<option value="${e.id}" ${e.id === s.estado ? 'selected' : ''}>${e.label}</option>`).join('')}</select></label>
      </header>
      <h3>${esc(l.nombre)}</h3>
      <div class="org">${esc(l.organismo)}</div>
      <div class="tc-clock ${u}" ${abierta ? `data-t="${c.getTime()}"` : ''}>${abierta ? clockMini(c) : `<div class="tc-closed">${c ? `Cerró el ${fDate(c)} · ${fTime(c)}` : 'Sin fecha de cierre'}</div>`}</div>
      <div class="tc-row"><span>${ic('clock')}Cierre ${c ? fDT(c) : '—'}</span><span>${money(l.montoEstimado, true)}</span></div>
      <div class="tc-docs">${segs(l)}<small>${di.done}/${di.total} documentos${di.req && a ? ` · <b>${di.req} oblig. pendiente${di.req === 1 ? '' : 's'}</b>` : ''}</small></div>
      <footer class="tc-f"><div class="person">${av(s.responsable)}<div><b>${s.responsable ? esc(nameOf(s.responsable)) : 'Sin responsable'}</b></div></div><a class="lnk" href="${href(l.codigo)}">Ver ficha →</a></footer>
    </article>`;
  }
  function clockMini(c) {
    let ms = Math.max(0, c - now());
    const d = Math.floor(ms / DAY); ms -= d * DAY;
    const h = Math.floor(ms / 3600000); ms -= h * 3600000;
    const m = Math.floor(ms / 60000); ms -= m * 60000;
    const sg = Math.floor(ms / 1000);
    const p = v => String(v).padStart(2, '0');
    return `<div class="tc-d"><b>${d}</b><span>${d === 1 ? 'día' : 'días'}</span></div><div class="tc-hms"><b>${p(h)}</b><i>:</i><b>${p(m)}</b><i>:</i><b>${p(sg)}</b><span>horas · min · seg</span></div>`;
  }
  function bindTablero() {
    $('#tPills').onclick = e => { const b = e.target.closest('button'); if (!b) return; ui.tEstado = b.dataset.e; render(); };
    $$('.tcard').forEach(card => card.addEventListener('click', e => {
      if (e.target.closest('select, a, label')) return;
      location.hash = card.dataset.h;
    }));
    $$('.tc-st select').forEach(sel => sel.onchange = () => act(sel.dataset.cod, 'estado', { estado: sel.value }, 'Estado actualizado', `${sel.dataset.cod} → ${EST[sel.value].label}`));
    const clocks = $$('.tc-clock[data-t]');
    if (clocks.length) ticker = setInterval(() => {
      if (!document.body.contains(clocks[0])) return clearInterval(ticker);
      for (const el of clocks) el.innerHTML = clockMini(new Date(+el.dataset.t));
    }, 1000);
  }

  /* ---------------- Vista: Equipo ---------------- */
  function vEquipo() {
    const load = id => LICS.filter(l => activa(l) && seg(l.codigo).responsable === id);
    return `
    <div class="head rise"><div><span class="kicker">Equipo comercial</span><h1>Equipo</h1><p>Quién está a cargo de qué y cuál es su próximo cierre.</p></div>
      ${ME.rol === 'admin' ? `<a class="btn" href="#/configuracion?tab=usuarios">${ic('gear')}Administrar usuarios</a>` : ''}</div>
    <div class="tblwrap"><table class="grid members"><thead><tr><th>Integrante</th><th>A cargo</th><th class="c-nx">Próximo cierre</th></tr></thead><tbody>
    ${DATA.equipo.map(p => {
      const ls = load(p.id).sort((a, b) => a.fechas.cierre - b.fechas.cierre);
      const nx = ls.find(l => l.fechas.cierre > now());
      return `<tr>
        <td><div class="person">${av(p.id, true)}<div><b>${esc(p.nombre)}${p.rol === 'admin' ? ' <span class="mono" style="color:var(--signal)">ADMIN</span>' : ''}</b><small>${esc(p.cargo || '')} · ${esc(p.id)}</small></div></div></td>
        <td><div class="load" title="${ls.length} en carrera">${ls.map(l => `<i style="--c:${U_COLOR[urg(l)]}"></i>`).join('') || '<span style="color:var(--muted)">—</span>'}</div></td>
        <td class="c-nx">${nx ? `<a href="${href(nx.codigo)}" style="display:flex;flex-direction:column;align-items:flex-start;gap:4px">${due(nx)}<small style="color:var(--muted);max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(nx.nombre)}</small></a>` : '<span style="color:var(--muted)">—</span>'}</td>
      </tr>`;
    }).join('')}
    </tbody></table></div>`;
  }
  function bindEquipo() { }

  /* ---------------- Vista: Configuración ---------------- */
  const cfg = { palabras: null, filtroPal: '', log: [], logMas: false, logQ: '', logUser: '', logRes: '', logCargando: false, abierto: new Set(), editUser: '', correo: null };
  const accesoDe = p => p.conClave ? 'Con contraseña' : p.ultimoIngreso ? 'Solo Google' : 'Pendiente';
  function vConfig(params) {
    if (params && params.get('tab')) ui.cfgTab = params.get('tab');
    const t = ui.cfgTab || 'palabras';
    const admin = ME.rol === 'admin';
    return `
    <div class="head rise"><div><span class="kicker">Ajustes de la plataforma</span><h1>Configuración</h1>
      <p>${admin ? 'Palabras clave del agente, usuarios, avisos por correo y registro de todo lo que pasa en Atalaya.' : 'Palabras clave que usa el agente y registro de actividad. Solo la administración puede modificarlas.'}</p></div></div>
    <div class="pills" id="cfgTabs">
      <button data-t="palabras" class="${t === 'palabras' ? 'on' : ''}">${ic('tag')}Palabras clave</button>
      <button data-t="usuarios" class="${t === 'usuarios' ? 'on' : ''}">${ic('team')}Usuarios<em>${DATA.equipo.length}</em></button>
      <button data-t="notificaciones" class="${t === 'notificaciones' ? 'on' : ''}">${ic('mail')}Notificaciones</button>
      <button data-t="registro" class="${t === 'registro' ? 'on' : ''}">${ic('log')}Registro de actividad</button>
    </div>
    <div id="cfgBody">${cuerpoCfg(t)}</div>`;
  }

  const cuerpoCfg = t => t === 'usuarios' ? cfgUsuarios() : t === 'registro' ? cfgRegistro() : t === 'notificaciones' ? cfgNotificaciones() : cfgPalabras();

  function cfgNotificaciones() {
    const admin = ME.rol === 'admin';
    const c = cfg.correo;
    if (!c) return '<div class="box empty">Revisando la configuración de correo…</div>';
    const destinatarios = DATA.equipo.filter(p => p.id.endsWith('@sermaluc.cl'));
    const aviso = (icono, titulo, quien, texto) => `<div class="ntf"><span class="ntf-i">${ic(icono)}</span><div><b>${titulo}</b><small>${quien}</small><p>${texto}</p></div></div>`;
    return `
    <div class="box box-b cfg-intro ntf-estado ${c.activo ? 'on' : 'off'}">
      <div class="ntf-head"><span class="${c.activo ? 'pill-ok' : 'pill-wait'}">${c.activo ? 'CORREO ACTIVO' : 'CORREO SIN CONFIGURAR'}</span>
        ${c.activo ? `<span class="mono" style="color:var(--muted)">Envía: ${esc(c.remitente)}</span>` : ''}</div>
      <p>${c.activo
        ? 'Atalaya avisa por correo a los usuarios <b>@sermaluc.cl</b> registrados en <b>Configuración → Usuarios</b>. Los envíos quedan en el registro de actividad.'
        : 'Los avisos se activan cuando la administración del servidor configura la cuenta de envío (SMTP_HOST, SMTP_USER y SMTP_PASSWORD). Mientras tanto, Atalaya funciona igual, sin enviar correos.'}</p>
      ${admin && c.activo ? `<button class="btn" id="correoPrueba">${ic('mail')}Enviarme un correo de prueba</button>` : ''}
    </div>
    <div class="ntf-grid">
      ${aviso('user', 'Asignación de una licitación', 'A la persona asignada', 'Cuando alguien asigna una licitación a otra persona, le llega un correo con la licitación, el plazo de cierre, los documentos pendientes y el enlace directo a la ficha.')}
      ${aviso('chat', 'Nueva nota en una licitación', `A todo el equipo (${destinatarios.length} personas, menos quien la escribe)`, 'Cada nota se envía completa para coordinar la gestión. Si alguien responde el correo, la respuesta le llega a quien escribió la nota.')}
    </div>
    <section class="box" style="margin-top:16px"><div class="box-h"><h2>${ic('team')}Destinatarios del equipo <span class="mono" style="color:var(--muted)">${destinatarios.length}</span></h2></div>
      <div class="ntf-people">${destinatarios.map(p => `<div class="person">${av(p.id)}<div><b>${esc(p.nombre)}</b><small>${esc(p.id)}</small></div></div>`).join('') || '<div class="empty">No hay usuarios registrados.</div>'}</div>
    </section>`;
  }

  function cfgPalabras() {
    const admin = ME.rol === 'admin';
    if (!cfg.palabras) return '<div class="box empty">Cargando palabras clave…</div>';
    const f = cfg.filtroPal.trim().toLowerCase();
    const lista = cfg.palabras.filter(x => !f || x.palabra.includes(f));
    const fila = x => `<div class="kwrow ${x.activa ? '' : 'off'}">
      <span class="kw-name">${esc(x.palabra)}</span>
      ${admin ? `<label class="select kw-peso" title="Cuánto suma o resta"><select data-peso="${esc(x.palabra)}">${(x.peso > 0 ? [1, 2, 3, 4, 5] : [-1, -2, -3, -4, -5]).map(n => `<option value="${n}" ${n === x.peso ? 'selected' : ''}>${n > 0 ? '+' + n : n}</option>`).join('')}</select></label>`
        : `<span class="mono kw-peso-ro">${x.peso > 0 ? '+' + x.peso : x.peso}</span>`}
      ${admin ? `<button class="toggle sm ${x.activa ? 'on-ok' : ''}" data-activa="${esc(x.palabra)}" title="${x.activa ? 'Pausar' : 'Reactivar'}">${x.activa ? 'Activa' : 'Pausada'}</button>
        <button class="ibtn sm" data-del-pal="${esc(x.palabra)}" title="Eliminar">${ic('trash')}</button>` : (x.activa ? '' : '<span class="opt">Pausada</span>')}
    </div>`;
    const pos = lista.filter(x => x.peso > 0), neg = lista.filter(x => x.peso < 0);
    return `
    <div class="box box-b cfg-intro">
      <p>El agente descarga esta lista <b>antes de cada consulta diaria</b> a Mercado Público. Cada palabra que aparece en el nombre o la descripción de una licitación <b>suma</b> o <b>resta</b> puntaje, y solo se informan las que llegan al mínimo de relevancia. Las mayúsculas y las tildes no importan.</p>
      ${admin ? `<form class="add-kw" id="addKw">
        <input class="input" name="palabra" maxlength="80" placeholder="Nueva palabra o frase (p. ej. inteligencia de negocios)" required>
        <label class="select"><select name="efecto"><option value="1">Suma (es relevante)</option><option value="-1">Resta (no es para Sermaluc)</option></select></label>
        <label class="select"><select name="peso"><option value="1">Peso 1 · leve</option><option value="2" selected>Peso 2 · medio</option><option value="3">Peso 3 · fuerte</option></select></label>
        <button class="btn pri">${ic('plus')}Agregar</button>
      </form>` : ''}
    </div>
    <div class="filters" style="margin-top:16px"><label class="select" style="flex:1;max-width:360px">${ic('search')}<input id="fPal" class="bare" placeholder="Buscar palabra…" value="${esc(cfg.filtroPal)}"></label>
      <span class="count">${cfg.palabras.filter(x => x.activa).length} activas de ${cfg.palabras.length}</span></div>
    <div class="kw-cols">
      <section class="box"><div class="box-h"><h2>${ic('plus')}Suman puntaje <span class="mono" style="color:var(--muted)">${pos.length}</span></h2></div><div class="kwlist">${pos.map(fila).join('') || '<div class="empty">Sin resultados.</div>'}</div></section>
      <section class="box"><div class="box-h"><h2 style="--signal:var(--red)">${ic('x')}Restan puntaje <span class="mono" style="color:var(--muted)">${neg.length}</span></h2></div><div class="kwlist">${neg.map(fila).join('') || '<div class="empty">Sin resultados.</div>'}</div></section>
    </div>`;
  }

  function cfgUsuarios() {
    const admin = ME.rol === 'admin';
    return `<div class="team">
      <div class="tblwrap"><table class="grid members"><thead><tr><th>Usuario</th><th>Rol</th><th class="c-cta">Acceso</th><th class="c-nx">Último ingreso</th>${admin ? '<th></th>' : ''}</tr></thead><tbody>
      ${DATA.equipo.map(p => {
        const ed = admin && cfg.editUser === p.id;
        return `<tr>
          <td>${ed ? `<div class="edit-u"><input class="input" id="eNombre" value="${esc(p.nombre)}" maxlength="80"><input class="input" id="eCargo" value="${esc(p.cargo || '')}" maxlength="80" placeholder="Cargo"><small>${esc(p.id)}</small></div>`
            : `<div class="person">${av(p.id, true)}<div><b>${esc(p.nombre)}</b><small>${esc(p.cargo || 'Sin cargo')} · ${esc(p.id)}</small></div></div>`}</td>
          <td>${ed && p.id !== ME.email ? `<label class="select"><select id="eRol"><option value="equipo" ${p.rol === 'equipo' ? 'selected' : ''}>Equipo</option><option value="admin" ${p.rol === 'admin' ? 'selected' : ''}>Administración</option></select></label>`
            : `<span class="${p.rol === 'admin' ? 'pill-ok' : 'mono'}">${p.rol === 'admin' ? 'ADMINISTRACIÓN' : 'EQUIPO'}</span>`}</td>
          <td class="c-cta"><span class="${p.activo ? 'pill-ok' : 'pill-wait'}">${accesoDe(p).toUpperCase()}</span></td>
          <td class="c-nx">${p.ultimoIngreso ? `<span title="${esc(fDT(new Date(p.ultimoIngreso)))}">${cap(rel(new Date(p.ultimoIngreso)))}</span>` : '<span style="color:var(--muted)">Nunca</span>'}</td>
          ${admin ? `<td><div class="acts">${ed
            ? `<button class="btn sm pri" data-save-u="${esc(p.id)}">Guardar</button><button class="btn sm" data-cancel-u>Cancelar</button>`
            : `<button class="ibtn sm" data-edit-u="${esc(p.id)}" title="Editar">${ic('edit')}</button>${p.id !== ME.email ? `<button class="ibtn sm" data-reset="${esc(p.id)}" title="Restablecer acceso (cierra sus sesiones y borra su contraseña)">${ic('key')}</button><button class="ibtn sm" data-del="${esc(p.id)}" title="Eliminar">${ic('trash')}</button>` : ''}`}</div></td>` : ''}
        </tr>`;
      }).join('')}
      </tbody></table></div>
      ${admin ? `<form class="box side-box" id="addForm">
        <h2 style="font-size:15px;font-weight:800">Crear usuario</h2>
        <label class="f">Correo<input class="input" name="email" type="email" required placeholder="nombre@sermaluc.cl"></label>
        <label class="f">Nombre<input class="input" name="nombre" required maxlength="80"></label>
        <label class="f">Cargo<input class="input" name="cargo" maxlength="80" placeholder="KAM, Preventa…"></label>
        <label class="f">Rol<label class="select full"><select name="rol"><option value="equipo">Equipo</option><option value="admin">Administración</option></select></label></label>
        <button class="btn pri block">${ic('plus')}Crear usuario</button>
        <p class="hint" style="font-size:12.5px;color:var(--muted)">La persona puede entrar con <b>Google</b> (si está configurado) o activar su cuenta con su correo @sermaluc.cl y crear su contraseña.</p>
      </form>` : '<div class="box box-b" style="color:var(--muted)">Solo la administración puede crear o modificar usuarios.</div>'}
    </div>`;
  }

  function cfgRegistro() {
    const usuarios = [...DATA.equipo.map(p => [p.id, p.nombre]), ['agente', 'Agente de licitaciones'], ['anónimo', 'Sin sesión']];
    const nom = u => u === 'agente' ? 'Agente de licitaciones' : u === 'anónimo' ? 'Sin sesión' : nameOf(u);
    return `
    <div class="filters">
      <label class="select" style="flex:1;max-width:380px">${ic('search')}<input id="fLogQ" class="bare" placeholder="Buscar en el registro (texto o código)…" value="${esc(cfg.logQ)}"></label>
      <label class="select">${ic('user')}<select id="fLogU"><option value="">Todas las personas</option>${usuarios.map(([id, n]) => `<option value="${esc(id)}" ${cfg.logUser === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      <label class="select">${ic('alert')}<select id="fLogR"><option value="">Todo</option><option value="error" ${cfg.logRes === 'error' ? 'selected' : ''}>Solo intentos fallidos</option></select></label>
    </div>
    <div class="box logbox">
      ${cfg.log.length ? cfg.log.map(r => `
        <div class="lg ${r.resultado === 'error' ? 'err' : ''}">
          <time title="${esc(fDT(new Date(r.fecha)))}">${esc(fDate(new Date(r.fecha)))}<b>${esc(fTime(new Date(r.fecha)))}</b></time>
          ${r.usuario === 'agente' ? `<span class="av" style="--h:190">${ic('radar')}</span>` : r.usuario === 'anónimo' ? `<span class="av none">${ic('user')}</span>` : av(r.usuario)}
          <div class="lg-t">
            <p>${r.resultado === 'error' ? `<span class="req">Fallido</span> ` : ''}${esc(r.descripcion)}</p>
            <small>${esc(nom(r.usuario))}${r.codigo && BY[r.codigo] ? ` · <a href="${href(r.codigo)}">${esc(r.codigo)}</a>` : r.codigo ? ` · ${esc(r.codigo)}` : ''}</small>
            ${cfg.abierto.has(r.id) ? `<pre class="tech">${esc(JSON.stringify(r.detalle, null, 2))}</pre>` : ''}
          </div>
          ${r.detalle ? `<button class="btn sm" data-tech="${esc(r.id)}">${ic('code')}${cfg.abierto.has(r.id) ? 'Ocultar detalle' : 'Detalle técnico'}</button>` : ''}
        </div>`).join('') : `<div class="empty">${cfg.logCargando ? 'Cargando registro…' : 'No hay actividad con esos filtros.'}</div>`}
      ${cfg.logMas ? `<div style="padding:14px;text-align:center"><button class="btn" id="logMas">Cargar más</button></div>` : ''}
    </div>`;
  }

  async function cargarPalabras() {
    try { cfg.palabras = (await api('/api/configuracion/palabras')).palabras; } catch (e) { if (!e.silent) toast('No se pudieron cargar las palabras', e.message, 'crit'); cfg.palabras = []; }
  }
  async function cargarLog(mas = false) {
    cfg.logCargando = true;
    const q = new URLSearchParams({ limite: 50 });
    if (cfg.logQ.trim()) q.set('q', cfg.logQ.trim());
    if (cfg.logUser) q.set('usuario', cfg.logUser);
    if (cfg.logRes) q.set('resultado', cfg.logRes);
    if (mas && cfg.log.length) q.set('antes', cfg.log[cfg.log.length - 1].fecha);
    try {
      const r = await api('/api/auditoria?' + q);
      cfg.log = mas ? cfg.log.concat(r.registros) : r.registros;
      cfg.logMas = r.hayMas;
    } catch (e) { if (!e.silent) toast('No se pudo cargar el registro', e.message, 'crit'); }
    cfg.logCargando = false;
  }
  const pintarCfg = () => { const b = $('#cfgBody'); if (!b) return; const y = window.scrollY; b.innerHTML = cuerpoCfg(ui.cfgTab); bindCfgBody(); window.scrollTo(0, y); };
  async function cfgAccion(fn, okT, okM) {
    try { await fn(); if (okT) toast(okT, okM || '', 'ok'); }
    catch (e) { if (!e.silent) toast('No se pudo completar', e.message, 'crit'); }
  }
  function bindConfig() {
    ui.cfgTab = ui.cfgTab || 'palabras';
    $('#cfgTabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; ui.cfgTab = b.dataset.t; render(); };
    bindCfgBody();
    if (ui.cfgTab === 'palabras' && !cfg.palabras) cargarPalabras().then(pintarCfg);
    if (ui.cfgTab === 'notificaciones') api('/api/correo').then(r => { cfg.correo = r; pintarCfg(); }).catch(e => { if (!e.silent) toast('No se pudo revisar el correo', e.message, 'crit'); });
    if (ui.cfgTab === 'registro' && !cfg.logCargando) { cfg.logCargando = !cfg.log.length; cargarLog().then(pintarCfg); }
  }
  function bindCfgBody() {
    const t = ui.cfgTab;
    if (t === 'palabras') {
      const fp = $('#fPal'); if (fp) fp.oninput = () => { cfg.filtroPal = fp.value; const pos = fp.selectionStart; pintarCfg(); const n = $('#fPal'); n.focus(); n.setSelectionRange(pos, pos); };
      const add = $('#addKw');
      if (add) add.onsubmit = e => {
        e.preventDefault();
        const f = new FormData(add);
        const peso = Number(f.get('efecto')) * Number(f.get('peso'));
        cfgAccion(async () => { await api('/api/configuracion/palabras', { method: 'POST', body: { palabra: f.get('palabra'), peso } }); await cargarPalabras(); pintarCfg(); }, 'Palabra agregada', `El agente la usará en su próxima consulta`);
      };
      $$('[data-peso]').forEach(sel => sel.onchange = () => cfgAccion(async () => { await api('/api/configuracion/palabras/' + encodeURIComponent(sel.dataset.peso), { method: 'PATCH', body: { peso: Number(sel.value) } }); await cargarPalabras(); pintarCfg(); }, 'Peso actualizado', sel.dataset.peso));
      $$('[data-activa]').forEach(b => b.onclick = () => {
        const x = cfg.palabras.find(p => p.palabra === b.dataset.activa);
        cfgAccion(async () => { await api('/api/configuracion/palabras/' + encodeURIComponent(x.palabra), { method: 'PATCH', body: { activa: !x.activa } }); await cargarPalabras(); pintarCfg(); }, x.activa ? 'Palabra pausada' : 'Palabra reactivada', x.palabra);
      });
      $$('[data-del-pal]').forEach(b => b.onclick = () => {
        if (!confirm(`¿Eliminar «${b.dataset.delPal}»? El agente dejará de usarla desde su próxima consulta.`)) return;
        cfgAccion(async () => { await api('/api/configuracion/palabras/' + encodeURIComponent(b.dataset.delPal), { method: 'DELETE' }); await cargarPalabras(); pintarCfg(); }, 'Palabra eliminada', b.dataset.delPal);
      });
    }
    if (t === 'usuarios') {
      const f = $('#addForm');
      if (f) f.onsubmit = e => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(f));
        cfgAccion(async () => { await api('/api/equipo', { method: 'POST', body: fd }); await reload(); render(); }, 'Usuario creado', `${fd.nombre} ya puede ingresar`);
      };
      $$('[data-edit-u]').forEach(b => b.onclick = () => { cfg.editUser = b.dataset.editU; pintarCfg(); $('#eNombre')?.focus(); });
      $$('[data-cancel-u]').forEach(b => b.onclick = () => { cfg.editUser = ''; pintarCfg(); });
      $$('[data-save-u]').forEach(b => b.onclick = () => {
        const body = { nombre: $('#eNombre').value, cargo: $('#eCargo').value };
        if ($('#eRol')) body.rol = $('#eRol').value;
        cfgAccion(async () => { await api('/api/equipo/' + encodeURIComponent(b.dataset.saveU), { method: 'PATCH', body }); cfg.editUser = ''; await reload(); render(); }, 'Usuario actualizado', body.nombre);
      });
      $$('[data-reset]').forEach(b => b.onclick = () => {
        if (!confirm(`¿Restablecer el acceso de ${nameOf(b.dataset.reset)}? Se cerrarán sus sesiones y, si usaba contraseña, deberá activar su cuenta otra vez.`)) return;
        cfgAccion(async () => { await api('/api/equipo/' + encodeURIComponent(b.dataset.reset), { method: 'POST' }); await reload(); render(); }, 'Acceso restablecido', nameOf(b.dataset.reset));
      });
      $$('[data-del]').forEach(b => b.onclick = () => {
        if (!confirm(`¿Eliminar a ${nameOf(b.dataset.del)}? Sus licitaciones quedarán sin responsable.`)) return;
        const n = nameOf(b.dataset.del);
        cfgAccion(async () => { await api('/api/equipo/' + encodeURIComponent(b.dataset.del), { method: 'DELETE' }); await reload(); render(); }, 'Usuario eliminado', n);
      });
    }
    if (t === 'notificaciones') {
      const b = $('#correoPrueba');
      if (b) b.onclick = () => { b.disabled = true; cfgAccion(async () => { const r = await api('/api/correo/prueba', { method: 'POST' }); return r; }, 'Correo de prueba enviado', `Revisa la bandeja de ${ME.email}`).finally(() => { b.disabled = false; }); };
    }
    if (t === 'registro') {
      let tq;
      const q = $('#fLogQ');
      q.oninput = () => { clearTimeout(tq); tq = setTimeout(async () => { cfg.logQ = q.value; await cargarLog(); const pos = q.selectionStart; pintarCfg(); const n = $('#fLogQ'); n.focus(); n.setSelectionRange(pos, pos); }, 350); };
      $('#fLogU').onchange = async e => { cfg.logUser = e.target.value; await cargarLog(); pintarCfg(); };
      $('#fLogR').onchange = async e => { cfg.logRes = e.target.value; await cargarLog(); pintarCfg(); };
      $$('[data-tech]').forEach(b => b.onclick = () => { const id = b.dataset.tech; cfg.abierto.has(id) ? cfg.abierto.delete(id) : cfg.abierto.add(id); pintarCfg(); });
      const m = $('#logMas'); if (m) m.onclick = async () => { m.disabled = true; await cargarLog(true); pintarCfg(); };
    }
  }

  /* ---------------- Paleta de búsqueda ---------------- */
  function openPalette() {
    if ($('.palette-bg')) return;
    const bg = document.createElement('div');
    bg.className = 'palette-bg';
    bg.innerHTML = `<div class="palette" role="dialog" aria-label="Buscar"><div class="palette-in">${ic('search')}<input id="pq" placeholder="Código, nombre, organismo o palabra clave…" autocomplete="off"></div><div class="palette-l" id="pl"></div><div class="palette-f"><span>↑↓ moverse</span><span>Enter abrir</span><span>Esc cerrar</span></div></div>`;
    document.body.appendChild(bg);
    let sel = 0, res = [];
    const paint = () => {
      const q = $('#pq').value.trim().toLowerCase();
      res = LICS.filter(l => !q || `${l.codigo} ${l.nombre} ${l.organismo} ${l.palabrasClave.join(' ')}`.toLowerCase().includes(q))
        .sort((a, b) => (activa(b) - activa(a)) || ((a.fechas.cierre || 0) - (b.fechas.cierre || 0))).slice(0, 12);
      sel = Math.min(sel, Math.max(0, res.length - 1));
      $('#pl').innerHTML = res.length ? res.map((l, i) => `<a href="${href(l.codigo)}" class="${i === sel ? 'sel' : ''}">${av(seg(l.codigo).responsable)}<div><b>${esc(l.nombre)}</b><small><span class="mono">${esc(l.codigo)}</span> · ${esc(l.organismo)}</small></div>${activa(l) ? due(l) : est(seg(l.codigo).estado)}</a>`).join('') : '<div class="empty">Sin coincidencias.</div>';
    };
    const close = () => bg.remove();
    bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('a')) close(); });
    $('#pq').addEventListener('input', () => { sel = 0; paint(); });
    $('#pq').addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, res.length - 1); paint(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); paint(); e.preventDefault(); }
      if (e.key === 'Enter' && res[sel]) { location.hash = href(res[sel].codigo); close(); }
      if (e.key === 'Escape') close();
    });
    paint(); $('#pq').focus();
  }

  /* ---------------- Toasts ---------------- */
  function toast(t, m = '', kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = `<div><b>${esc(t)}</b>${m ? `<span>${m.includes('<br>') ? m : esc(m)}</span>` : ''}</div>`;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, kind === 'crit' ? 7000 : 3000);
  }

  /* ---------------- Ingreso ---------------- */
  const ERRORES_LOGIN = {
    no_registrado: 'Tu correo de Google no está registrado en Atalaya. Pide a la administración que te agregue.',
    dominio: 'Solo se puede ingresar con una cuenta de Google de Sermaluc.',
    verificado: 'Tu correo no está verificado en Google.',
    estado: 'El ingreso con Google expiró. Inténtalo de nuevo.',
    cancelado: 'Cancelaste el ingreso con Google.',
    google: 'Google no pudo confirmar tu identidad. Inténtalo de nuevo.',
    google_off: 'El ingreso con Google no está habilitado.',
  };
  let LOGIN_CFG = null;
  function showLogin(modo = 'ingresar', error = '') {
    clearInterval(ticker);
    const qs = new URLSearchParams(location.search);
    if (!error && qs.get('error_login')) {
      error = ERRORES_LOGIN[qs.get('error_login')] || 'No se pudo ingresar.';
      history.replaceState(null, '', location.pathname + location.hash);
    }
    if (!LOGIN_CFG) api('/api/config', { quiet: true }).then(c => { LOGIN_CFG = c; if ($('#lf') && c.google) showLogin(modo, error); }).catch(() => { LOGIN_CFG = { google: false }; });
    $('#root').innerHTML = `
    <div class="login">
      <section class="login-art">
        <span class="logo"><img src="assets/atalaya.svg" alt=""><span><b>Atalaya</b><small>Radar de licitaciones</small></span></span>
        ${radarSvg([], { noBlips: true })}
        <div class="claim"><h1>Vigila. Prioriza.<br><em>Gana.</em></h1><p>Cada mañana el agente revisa Mercado Público y trae aquí las licitaciones en las que Sermaluc puede competir. El equipo decide, se reparte el trabajo y no se le pasa ningún plazo.</p></div>
      </section>
      <section class="login-form">
        <form class="login-card" id="lf" novalidate>
          <h2>${modo === 'ingresar' ? 'Ingresa a Atalaya' : 'Activa tu cuenta'}</h2>
          <p>${modo === 'ingresar' ? 'Usa tu correo de Sermaluc.' : 'Primera vez: escribe tu correo @sermaluc.cl y crea tu contraseña.'}</p>
          <div class="pills"><button type="button" data-m="ingresar" class="${modo === 'ingresar' ? 'on' : ''}">Ingresar</button><button type="button" data-m="activar" class="${modo === 'activar' ? 'on' : ''}">Activar mi cuenta</button></div>
          ${error ? `<div class="error">${esc(error)}</div>` : ''}
          ${LOGIN_CFG?.google && modo === 'ingresar' ? `<a class="btn gbtn block" href="/api/auth/google">${ic('google')}Ingresar con Google</a><div class="or"><span>o con tu contraseña</span></div>` : ''}
          <label class="f">Correo<input class="input" name="email" type="email" autocomplete="username" placeholder="nombre@sermaluc.cl" required></label>
          <label class="f">${modo === 'activar' ? 'Crea tu contraseña (mín. 10 caracteres)' : 'Contraseña'}<input class="input" name="password" type="password" autocomplete="${modo === 'activar' ? 'new-password' : 'current-password'}" required></label>
          <button class="btn pri block" type="submit">${modo === 'ingresar' ? 'Ingresar' : 'Activar y entrar'}</button>
          <p class="hint">${modo === 'ingresar' ? '¿Primera vez? Elige "Activar mi cuenta". ¿Olvidaste tu contraseña? Pide a la administración que restablezca tu acceso.' : 'Solo pueden activar su cuenta los correos registrados por la administración.'}</p>
          <a class="btn block race-btn" href="/linea/">🏇 Ver la carrera de licitaciones <span>sin ingresar</span></a>
          <span class="by">Una plataforma de Sermaluc</span>
        </form>
      </section>
    </div>`;
    $$('.login-card .pills button').forEach(b => b.onclick = () => showLogin(b.dataset.m));
    $('#lf').onsubmit = async e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const btn = e.target.querySelector('[type=submit]');
      btn.disabled = true;
      btn.innerHTML = `<span class="spin"></span>${modo === 'ingresar' ? 'Ingresando…' : 'Activando…'}`;
      try {
        await api(modo === 'ingresar' ? '/api/ingresar' : '/api/activar', { method: 'POST', body: fd, quiet: true });
        await start();
      } catch (er) { showLogin(modo, er.message); const em = $('#lf [name=email]'); if (em) em.value = fd.email || ''; }
    };
    $('#lf [name=email]').focus();
  }

  /* ---------------- Router ---------------- */
  function render() {
    if (!DATA || !$('#view')) return;
    clearInterval(ticker);
    const scroll = window.scrollY;
    const h = location.hash.slice(1) || '/';
    const [path, qs] = h.split('?');
    const parts = path.split('/').filter(Boolean);
    const params = qs !== undefined ? new URLSearchParams(qs) : null;
    const v = $('#view');
    let r = 'radar';
    if (parts[0] === 'licitaciones') { r = 'licitaciones'; v.innerHTML = vLista(consumeParams(params)); bindLista(); }
    else if (parts[0] === 'licitacion') { r = 'licitaciones'; const c = decodeURIComponent(parts[1] || ''); v.innerHTML = vFicha(c); bindFicha(c); }
    else if (parts[0] === 'tablero') { r = 'tablero'; v.innerHTML = vTablero(); bindTablero(); }
    else if (parts[0] === 'equipo') { r = 'equipo'; v.innerHTML = vEquipo(); bindEquipo(); }
    else if (parts[0] === 'configuracion') { r = 'configuracion'; v.innerHTML = vConfig(consumeParams(params)); bindConfig(); }
    else { v.innerHTML = vRadar(); bindRadar(); }
    $$('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.r === r));
    $('#tabs').classList.remove('open');
    paintTop();
    window.scrollTo(0, scroll);
  }
  // Los parámetros de la URL se aplican una sola vez por navegación (no en cada actualización automática)
  let lastParams = null;
  function consumeParams(p) {
    const key = location.hash;
    if (!p || key === lastParams) return null;
    lastParams = key; return p;
  }
  let lastBase = '';
  window.addEventListener('hashchange', () => {
    const base = location.hash.split('?')[0];
    if (base !== lastBase) { window.scrollTo(0, 0); ui.tab = 'resumen'; }
    lastBase = base;
    lastParams = null;
    render();
  });
  document.addEventListener('click', e => { if (!e.target.closest('.pop-w')) closePops(); });
  document.addEventListener('keydown', e => {
    const typing = /input|textarea|select/i.test(document.activeElement.tagName);
    if (DATA && ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing))) { e.preventDefault(); openPalette(); }
    if (e.key === 'Escape') closePops();
  });

  /* ---------------- Sincronización con el equipo ---------------- */
  let poll = null;
  function startPolling() {
    stopPolling();
    poll = setInterval(sync, 15000);
  }
  function stopPolling() { clearInterval(poll); poll = null; }
  async function sync() {
    if (document.hidden || !DATA) return;
    try {
      const { version } = await api('/api/version');
      if (version === DATA.version) return;
      const typing = document.activeElement && /textarea|input/i.test(document.activeElement.tagName) && document.activeElement.value;
      if (typing || $('.palette-bg')) return; // no interrumpir a quien está escribiendo
      await reload(); render();
      toast('Radar actualizado', 'Hay cambios del equipo o del agente.');
    } catch (e) { /* sin conexión: se reintenta en el próximo ciclo */ }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });

  /* ---------------- Inicio ---------------- */
  async function start() {
    try {
      // Una sola solicitud: los datos traen también al usuario de la sesión
      const d = await api('/api/datos', { quiet: true });
      ME = d.usuario;
      apply(d);
    } catch (e) {
      showLogin(); return;
    }
    shell();
    lastBase = location.hash.split('?')[0];
    render();
    startPolling();
    const crit = alerts().filter(a => a.k === 'cierre' && a.u === 'crit');
    if (crit.length) setTimeout(() => toast(`${plural(crit.length, 'licitación cierra', 'licitaciones cierran')} en menos de 48 h`, crit.slice(0, 3).map(a => `${esc(a.l.nombre)} — ${dueText(a.l).toLowerCase()}`).join('<br>'), 'crit'), 600);
  }
  start();
})();
