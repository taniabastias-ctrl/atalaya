/* ============================================================
   Atalaya · Carrera de licitaciones (página pública, sin sesión)
   Cada licitación es un caballito que corre desde su publicación
   hasta la meta: el cierre de ofertas.
   ============================================================ */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DAY = 86400000;
  const now = () => new Date();
  const sod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  function parse(s) {
    if (!s) return null;
    const [d, t = '00:00'] = s.split('T');
    const [y, m, dd] = d.split('-').map(Number);
    const [h, mi] = t.split(':').map(Number);
    return new Date(y, m - 1, dd, h || 0, mi || 0);
  }
  const dd = (d) => Math.round((sod(d) - sod(now())) / DAY);
  const fDate = (d) => d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  const fTime = (d) => d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const fDT = (d) => `${fDate(d)} · ${fTime(d)}`;

  const ESTADO = {
    nueva: ['Nueva', 'var(--e-nueva)'], evaluacion: ['En evaluación', 'var(--e-evaluacion)'], preparacion: ['En preparación', 'var(--e-preparacion)'],
    presentada: ['Presentada', 'var(--e-presentada)'], adjudicada: ['Adjudicada', 'var(--e-adjudicada)'],
  };
  const HITOS = [
    ['finPreguntas', 'Cierre de preguntas', '❓'], ['respuestas', 'Respuestas publicadas', '💬'], ['visitaTerreno', 'Visita a terreno', '📍'],
    ['aperturaTecnica', 'Apertura técnica', '📂'], ['adjudicacion', 'Adjudicación estimada', '🏆'],
  ];
  const ui = { filtro: 'carrera', resp: '', q: '' };
  let DATA = null;

  function urg(c) {
    if (c < now()) return 'closed';
    const n = dd(c);
    return n <= 2 ? 'crit' : n <= 5 ? 'high' : n <= 10 ? 'mid' : 'ok';
  }
  function faltan(c) {
    let ms = c - now();
    if (ms <= 0) return null;
    const d = Math.floor(ms / DAY); ms -= d * DAY;
    const h = Math.floor(ms / 3600000); ms -= h * 3600000;
    const m = Math.floor(ms / 60000);
    return { d, h, m };
  }
  const pista = (l) => {
    const pub = parse(l.fechas.publicacion) || new Date(parse(l.fechas.cierre) - 14 * DAY);
    const fin = parse(l.fechas.cierre);
    const pos = (d) => Math.max(0, Math.min(100, ((d - pub) / (fin - pub)) * 100));
    return { pub, fin, pos };
  };

  function lane(l) {
    const { pub, fin, pos } = pista(l);
    const u = urg(fin);
    const [estLabel, estColor] = ESTADO[l.estado] || ESTADO.nueva;
    const llego = fin < now();
    const avance = llego ? 100 : pos(now());
    const f = faltan(fin);
    const meta = l.estado === 'adjudicada' ? '🏆' : l.estado === 'presentada' ? '✅' : '🏁';
    const marcas = HITOS.filter(([k]) => l.fechas[k]).map(([k, label, emo]) => {
      const d = parse(l.fechas[k]);
      if (d > fin) return '';
      return `<span class="hito ${d <= now() ? 'past' : ''}" style="left:${pos(d)}%" title="${esc(label)} · ${esc(fDT(d))}">${emo}</span>`;
    }).join('');
    return `<article class="rlane ${u}">
      <div class="rlane-info">
        <span class="mono lane-cod">${esc(l.codigo)}</span>
        <h3>${esc(l.nombre)}</h3>
        <p class="rlane-org">${esc(l.organismo)}</p>
        <div class="rlane-meta">
          <span class="st" style="--c:${estColor}">${estLabel}</span>
          <span class="jinete ${l.responsable ? '' : 'none'}">${l.responsable ? `🧑‍💼 ${esc(l.responsable)}` : 'Sin jinete asignado'}</span>
        </div>
      </div>
      <div class="track" aria-label="Avance hacia el cierre: ${Math.round(avance)}%">
        <div class="turf"></div>
        <span class="gate" title="Publicación · ${esc(fDT(pub))}">🚩</span>
        ${marcas}
        <span class="horse ${llego ? 'arrived' : u === 'crit' ? 'sprint' : ''}" style="left:${avance}%" title="${llego ? 'Llegó a la meta' : `${Math.round(avance)}% del plazo recorrido`}">🏇</span>
        <span class="goal" title="Cierre de ofertas · ${esc(fDT(fin))}">${meta}</span>
        <div class="track-dates"><span>Salida ${esc(fDate(pub))}</span><span>Meta ${esc(fDT(fin))}</span></div>
      </div>
      <div class="rlane-left">${llego
        ? `<b>${l.estado === 'presentada' ? 'Presentada' : l.estado === 'adjudicada' ? '¡Ganada!' : 'Cerró'}</b><small>${esc(fDate(fin))}</small>`
        : f.d === 0 ? `<b>${f.h}h ${String(f.m).padStart(2, '0')}m</b><small>¡cierra hoy!</small>`
        : `<b>${f.d}</b><small>${f.d === 1 ? 'día para la meta' : 'días para la meta'}</small>`}</div>
    </article>`;
  }

  function render() {
    const v = $('#view');
    if (!DATA) return;
    const todos = DATA.licitaciones.map((l) => ({ ...l, _fin: parse(l.fechas.cierre) }));
    const enCarrera = todos.filter((l) => l._fin > now() && !['presentada', 'adjudicada'].includes(l.estado));
    const q = ui.q.trim().toLowerCase();
    let lista = ui.filtro === 'carrera' ? enCarrera : todos;
    if (ui.resp === '__none') lista = lista.filter((l) => !l.responsable);
    else if (ui.resp) lista = lista.filter((l) => l.responsable === ui.resp);
    if (q) lista = lista.filter((l) => `${l.codigo} ${l.nombre} ${l.organismo} ${l.responsable || ''}`.toLowerCase().includes(q));
    const cerrada = (l) => (l._fin < now() ? 1 : 0);
    lista.sort((a, b) => cerrada(a) - cerrada(b) || a._fin - b._fin);
    const urgentes = enCarrera.filter((l) => dd(l._fin) <= 2).length;
    const sinJinete = enCarrera.filter((l) => !l.responsable).length;
    const personas = [...new Set(todos.map((l) => l.responsable).filter(Boolean))].sort();
    const act = parse(DATA.actualizado);

    const foco = document.activeElement && document.activeElement.id === 'rq' ? document.activeElement.selectionStart : null;
    v.innerHTML = `
      <div class="head rise">
        <div><span class="kicker">Línea de tiempo pública${act ? ` · actualizada ${esc(fDT(act))}` : ''}</span>
          <h1>🏇 La carrera de licitaciones</h1>
          <p>Cada caballito es una licitación que corre desde su publicación 🚩 hasta su meta 🏁, el cierre de ofertas. Mientras más cerca de la meta, menos tiempo queda.</p></div>
      </div>
      <div class="race-stats">
        <div class="rs"><b>${enCarrera.length}</b><span>en carrera</span></div>
        <div class="rs hot"><b>${urgentes}</b><span>llegan a la meta en 2 días o menos</span></div>
        <div class="rs"><b>${sinJinete}</b><span>sin jinete (responsable)</span></div>
      </div>
      <div class="filters">
        <div class="pills" id="rf" style="margin:0">
          <button data-f="carrera" class="${ui.filtro === 'carrera' ? 'on' : ''}">En carrera<em>${enCarrera.length}</em></button>
          <button data-f="todas" class="${ui.filtro === 'todas' ? 'on' : ''}">Todas<em>${todos.length}</em></button>
        </div>
        <label class="select"><span aria-hidden="true">🧑‍💼</span><select id="rr"><option value="">Todos los jinetes</option><option value="__none" ${ui.resp === '__none' ? 'selected' : ''}>Sin jinete</option>${personas.map((p) => `<option ${ui.resp === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
        <label class="select" style="flex:1;max-width:340px"><span aria-hidden="true">🔎</span><input id="rq" class="bare" placeholder="Buscar licitación u organismo…" value="${esc(ui.q)}"></label>
      </div>
      <div class="race">${lista.length ? lista.map(lane).join('') : '<div class="box empty"><h3>No hay caballitos en esta pista</h3><p>Prueba con otro filtro.</p></div>'}</div>
      <div class="race-legend">
        <span>🚩 Publicación</span><span>❓ Cierre de preguntas</span><span>💬 Respuestas</span><span>📂 Apertura</span><span>🏆 Adjudicación</span><span>🏁 Meta: cierre de ofertas</span><span>✅ Presentada</span>
        <span class="sw crit">≤ 2 días</span><span class="sw high">≤ 5 días</span><span class="sw mid">≤ 10 días</span><span class="sw ok">más de 10</span>
      </div>`;
    $('#rf').onclick = (e) => { const b = e.target.closest('button'); if (b) { ui.filtro = b.dataset.f; render(); } };
    $('#rr').onchange = (e) => { ui.resp = e.target.value; render(); };
    const rq = $('#rq');
    rq.oninput = () => { ui.q = rq.value; render(); };
    if (foco !== null) { const n = $('#rq'); n.focus(); n.setSelectionRange(foco, foco); }
  }

  async function cargar() {
    try {
      const r = await fetch('/api/publico/linea', { headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error(r.status);
      DATA = await r.json();
      render();
    } catch (e) {
      if (!DATA) $('#view').innerHTML = '<div class="box empty"><h3>No pudimos cargar la carrera</h3><p>Inténtalo de nuevo en unos minutos.</p></div>';
    }
  }

  const tb = $('#themeBtn');
  const pintarTema = () => { tb.textContent = document.documentElement.dataset.theme === 'dark' ? '☀️' : '🌙'; };
  tb.onclick = () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('atalaya.theme', t); } catch (e) { /* sin almacenamiento */ }
    pintarTema();
  };
  pintarTema();
  cargar();
  setInterval(cargar, 5 * 60000);           // datos nuevos cada 5 minutos
  setInterval(() => { if (document.activeElement?.id !== 'rq') render(); }, 60000); // los caballitos avanzan
})();
