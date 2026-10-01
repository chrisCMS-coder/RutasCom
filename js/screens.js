/* Pantallas: Hoy, Clientes, Ficha, Visita, Pedido, Pedidos, Mapa */
const SCREENS = {};

/* ---------- utilidades de pantalla ---------- */
/* static: la pantalla tiene un formulario o un proceso en curso y no debe repintarse sola cuando cambian los datos */
function screen(html, { nav = true, static: st = false } = {}) { return UI.el(`<div class="screen${nav ? '' : ' no-nav'}"${st ? ' data-static' : ''}>${html}</div>`); }
function topbar(titulo, right = '') {
  return `<div class="topbar"><button class="iconbtn" data-back aria-label="Volver">${I.svg(I.back)}</button><div class="title">${U.esc(titulo)}</div>${right || '<span style="width:44px"></span>'}</div>`;
}
function wireBack(el) { el.querySelectorAll('[data-back]').forEach(b => b.onclick = () => APP.back()); }
function wireGo(el) { el.querySelectorAll('[data-go]').forEach(b => b.onclick = e => { e.preventDefault(); const [n, p] = b.dataset.go.split(':'); APP.go(n, p ? { id: p } : {}); }); }
function clienteItem(c, right) {
  const e = U.estado(c);
  return `<button class="item" data-go="ficha:${c.id}">${UI.dot(e.key)}<div class="col grow"><div class="name">${U.esc(c.nombre)}</div><div class="meta">${U.esc([c.localidad, U.tamanoLabel(c.tamano)].filter(Boolean).join(' · '))}</div></div><div class="right tx-${e.key}">${right != null ? right : (e.dias == null ? 'nuevo' : e.dias + ' d')}</div></button>`;
}
async function clientesById() { const cs = await DB.clientes(); return Object.fromEntries(cs.map(c => [c.id, c])); }

/* ======================= HOY ======================= */
SCREENS.hoy = async () => {
  const hoy = U.today();
  const [clientes, ruta, pedidosHoy, pendientes, lastBackup, demo] = await Promise.all([DB.clientes(), DB.rutaDelDia(hoy), DB.pedidosDelDia(hoy), DB.pedidosPendientes(), DB.get('lastBackup', null), DB.get('demoCargada', false)]);
  const byId = Object.fromEntries(clientes.map(c => [c.id, c]));
  const cont = { rojo: 0, ambar: 0, verde: 0, azul: 0 };
  for (const c of clientes) cont[U.estado(c).key]++;
  const sinCoord = clientes.filter(c => !c.lat).length;
  const d = new Date();
  let banners = '';
  if (clientes.length && SYNC.estado !== 'ok') {
    const dias = lastBackup ? U.daysSince(lastBackup.slice(0, 10)) : null;
    if (dias == null || dias >= 7) banners += `<div class="banner" data-go="ajustes">${I.svg(I.warn, 18)}<span>${dias == null ? 'Todavía no has hecho ninguna copia de seguridad.' : `Última copia de seguridad hace ${dias} días.`} Toca para hacerla.</span></div>`;
  }
  if (SYNC.estado === 'ok' && SYNC.error) banners += `<div class="banner" data-go="ajustes">${I.svg(I.cloud, 18)}<span>${U.esc(SYNC.error)}. Los datos siguen guardados en el móvil.</span></div>`;
  if (sinCoord) banners += `<div class="banner info" data-go="ajustes">${I.svg(I.pin, 18)}<span>${sinCoord} cliente${sinCoord > 1 ? 's' : ''} sin ubicación en el mapa. Toca para resolverlo.</span></div>`;

  let rutaHtml;
  const pend = ruta ? ruta.paradas.filter(p => !p.hecho) : [];
  if (ruta && ruta.paradas.length) {
    const next = pend[0]; const nc = next && byId[next.clienteId];
    rutaHtml = `<div class="section"><div class="row between"><div class="section-title">Ruta de hoy</div><a href="#" data-go="ruta:${ruta.id}" class="bold small">Ver ruta</a></div>
      <div class="map mini" id="miniMap"></div>
      <div class="muted small bold">${ruta.paradas.length} visitas · ${U.fmtKm(ruta.km)} · ${U.fmtDur(ruta.conduccion)} de conducción${ruta.estimado ? ' (estimado)' : ''}</div>
      ${nc ? `<div class="card accent"><div class="row between"><div class="col grow"><div class="small bold" style="letter-spacing:.05em;text-transform:uppercase;color:var(--accent)">Siguiente · ${U.fmtTime(next.inicio)}</div><div class="bold" style="font-size:17px">${U.esc(nc.nombre)}</div><div class="muted small">${U.esc(U.direccion(nc).full)}</div></div></div>
        <div class="btn-row" style="margin-top:12px"><a class="btn primary" href="${U.mapsUrl(nc)}" target="_blank" rel="noopener">${I.svg(I.nav, 18)} Iniciar visita</a><button class="btn" data-visita="${nc.id}" data-parada="${ruta.id}">Registrar</button></div></div>`
        : `<div class="card"><div class="bold">Ruta completada</div><div class="muted small">Todas las visitas están registradas.</div></div>`}
    </div>`;
  } else {
    rutaHtml = `<div class="section"><div class="section-title">Ruta de hoy</div>
      <div class="card"><div class="bold">Sin ruta planificada</div><div class="muted small">Crea una ruta con los clientes que toca visitar.</div></div>
      <button class="btn primary big" data-go="nuevaRuta">${I.svg(I.plus, 20, 2.4)} Crear ruta</button>
      <button class="btn big" data-cerca>${I.svg(I.locate, 20)} Clientes cerca de mí</button></div>`;
  }
  const pedHtml = `<div class="section"><div class="row between"><div class="section-title">Pedidos</div><a href="#" data-go="pedidos" class="bold small">Ver todos</a></div>
    <div class="card"><div class="row between"><div class="col"><div class="bold" style="font-size:17px">${pedidosHoy.length} pedido${pedidosHoy.length === 1 ? '' : 's'} hoy</div><div class="muted small">${pendientes.length ? `${pendientes.length} pendiente${pendientes.length === 1 ? '' : 's'} de enviar` : 'Nada pendiente de enviar'}</div></div>
    ${pendientes.length ? `<button class="btn sm primary" data-go="pedidos">${I.svg(I.share, 16)} Enviar Excel</button>` : ''}</div></div></div>`;
  const carteraHtml = clientes.length ? `<div class="section"><div class="section-title">Cartera · ${clientes.length} clientes</div>
    <div class="row wrap" style="gap:8px">
      <button class="chip" data-filtro="rojo">${UI.dot('rojo')} ${cont.rojo} fuera de plazo</button><button class="chip" data-filtro="ambar">${UI.dot('ambar')} ${cont.ambar} próximos</button>
      <button class="chip" data-filtro="verde">${UI.dot('verde')} ${cont.verde} al día</button>${cont.azul ? `<button class="chip" data-filtro="azul">${UI.dot('azul')} ${cont.azul} sin visitar</button>` : ''}</div></div>` : '';
  const bienvenida = !clientes.length ? `<div class="section"><div class="card accent"><div class="bold" style="font-size:18px">Empezar</div><p class="muted small" style="margin:6px 0 12px">Importa tus clientes desde Excel o carga 200 librerías de Cataluña como datos de prueba (direcciones reales, datos comerciales inventados).</p>
    <div class="col" style="gap:8px"><button class="btn primary" data-go="importar">${I.svg(I.file, 18)} Importar clientes desde Excel</button><button class="btn" data-demo>Cargar datos de prueba</button></div></div></div>` : '';

  const el = screen(`<div class="hdr"><div class="hdr-row"><div class="col"><div class="eyebrow">${U.esc(U.fmtDateLong(d))}</div><h1>Hoy</h1></div><button class="iconbtn" data-go="ajustes" aria-label="Ajustes">${I.svg(I.gear, 22)}</button></div>
    ${clientes.length ? `<div class="sub">${cont.rojo ? `${cont.rojo} clientes fuera de plazo` : 'Todos los clientes al día'}</div>` : ''}</div>
    ${banners}${bienvenida}${clientes.length ? rutaHtml + pedHtml : ''}${carteraHtml}`);
  wireGo(el);
  el.querySelectorAll('[data-filtro]').forEach(b => b.onclick = () => APP.go('clientes', { filtro: b.dataset.filtro }));
  el.querySelector('[data-demo]')?.addEventListener('click', async e => { e.target.disabled = true; UI.toast('Cargando datos de prueba…'); const n = await APP.cargarDemo(); UI.toast(`${n} clientes de prueba cargados`); });
  el.querySelector('[data-cerca]')?.addEventListener('click', () => APP.go('mapa', { cerca: true }));
  el.querySelectorAll('[data-visita]').forEach(b => b.onclick = () => sheetVisita(b.dataset.visita, { rutaId: b.dataset.parada }));
  el._afterMount = () => {
    const mm = el.querySelector('#miniMap');
    if (mm && ruta) {
      const map = UI.map(mm, { dragging: false, scrollWheelZoom: false, touchZoom: false, doubleClickZoom: false });
      const pts = [];
      if (ruta.origen?.lat) { L.marker([ruta.origen.lat, ruta.origen.lng], { icon: UI.pin('origen') }).addTo(map); pts.push([ruta.origen.lat, ruta.origen.lng]); }
      ruta.paradas.forEach((p, i) => { const c = byId[p.clienteId]; if (c && c.lat) { L.marker([c.lat, c.lng], { icon: UI.pin(p.hecho ? 'gris' : U.estado(c).key, i + 1) }).addTo(map); pts.push([c.lat, c.lng]); } });
      if (pts.length) { L.polyline(pts.concat(ruta.destino?.lat ? [[ruta.destino.lat, ruta.destino.lng]] : []), { color: '#17323F', weight: 3, opacity: .6, dashArray: '6 6' }).addTo(map); map.fitBounds(pts, { padding: [24, 24] }); }
      mm.onclick = () => APP.go('ruta', { id: ruta.id });
    }
  };
  return el;
};

/* ======================= CLIENTES ======================= */
SCREENS.clientes = async (params) => {
  const clientes = await DB.clientes();
  const st = SCREENS._cl = SCREENS._cl || { q: '', filtro: 'todos' };
  if (params.filtro) { st.filtro = params.filtro; params.filtro = null; }
  const FILTROS = [['todos', 'Todos'], ['rojo', 'Fuera de plazo'], ['ambar', 'Próximos'], ['verde', 'Al día'], ['azul', 'Sin visitar'], ['grande', 'Grandes']];
  const el = screen(`<div class="hdr"><div class="hdr-row"><h1>Clientes</h1><div class="muted bold">${clientes.length}</div></div></div>
    <div class="search">${I.svg(I.search, 20)}<input id="q" type="search" placeholder="Buscar nombre, localidad o CP" value="${U.esc(st.q)}" autocomplete="off"></div>
    <div class="chips">${FILTROS.map(([k, l]) => `<button class="chip ${st.filtro === k ? 'on' : ''}" data-f="${k}">${['rojo', 'ambar', 'verde', 'azul'].includes(k) ? UI.dot(k) : ''}${l}</button>`).join('')}</div>
    <div class="list" id="lista"></div>
    <button class="fab" data-go="editarCliente" aria-label="Nuevo cliente">${I.svg(I.plus, 24, 2.4)}<span class="sr-only">Nuevo cliente</span></button>`);
  const lista = el.querySelector('#lista');
  const pintar = () => {
    const q = U.norm(st.q);
    let cs = clientes.filter(c => !q || U.norm(c.nombre + ' ' + c.localidad + ' ' + c.cp + ' ' + (c.contacto || '')).includes(q));
    if (['rojo', 'ambar', 'verde', 'azul'].includes(st.filtro)) cs = cs.filter(c => U.estado(c).key === st.filtro);
    if (st.filtro === 'grande') cs = cs.filter(c => c.tamano === 'grande');
    const ord = { rojo: 0, ambar: 1, azul: 2, verde: 3 };
    cs.sort((a, b) => { const ea = U.estado(a), eb = U.estado(b); if (ea.key !== eb.key) return ord[ea.key] - ord[eb.key]; if (ea.key === 'azul') return a.nombre.localeCompare(b.nombre); return (eb.dias || 0) - (ea.dias || 0); });
    if (!cs.length) { lista.innerHTML = `<div class="empty">${clientes.length ? 'Ningún cliente coincide' : 'Todavía no hay clientes'}</div>`; return; }
    let html = '', grupo = null;
    const titulos = { rojo: 'Fuera de plazo', ambar: 'Próximos a vencer', azul: 'Sin visitar', verde: 'Al día' };
    const n = {}; cs.forEach(c => { const k = U.estado(c).key; n[k] = (n[k] || 0) + 1; });
    for (const c of cs.slice(0, 400)) {
      const k = U.estado(c).key;
      if (st.filtro === 'todos' && k !== grupo) { grupo = k; html += `<div class="group-title">${titulos[k]} · ${n[k]}</div>`; }
      html += clienteItem(c);
    }
    lista.innerHTML = html; wireGo(lista);
  };
  pintar();
  el.querySelector('#q').addEventListener('input', U.debounce(e => { st.q = e.target.value; pintar(); }, 120));
  el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { st.filtro = b.dataset.f; el.querySelectorAll('[data-f]').forEach(x => x.classList.toggle('on', x === b)); pintar(); });
  wireGo(el);
  return el;
};

/* ======================= FICHA ======================= */
SCREENS.ficha = async ({ id }) => {
  const c = await DB.cliente(id);
  if (!c) return screen(topbar('Cliente') + '<div class="empty">Cliente no encontrado</div>', { nav: false });
  const [visitas, pedidos] = await Promise.all([DB.visitasDe(id), DB.pedidosDe(id)]);
  const e = U.estado(c); const dir = U.direccion(c);
  const RES = { pedido: 'Pedido', no_interesado: 'Sin interés', ausente: 'Ausente', revisar: 'A revisar', visita: 'Visita' };
  const frase = U.estadoFrase(c);
  const sub = e.key === 'azul' ? `Frecuencia ${U.frecuenciaLabel(c.frecuenciaDias).toLowerCase()}` : e.key === 'rojo' ? `${U.frecuenciaLabel(c.frecuenciaDias)} · venció hace ${e.dias - e.limite} días` : `${U.frecuenciaLabel(c.frecuenciaDias)} · próxima en ${e.restante} días`;
  const colorCard = e.key === 'rojo' ? 'rojo' : e.key === 'ambar' ? '' : 'accent';
  const h = c.horario || {}; const hor = [];
  if (h.lunesCerrado) hor.push('lunes mañana cerrado'); if (h.lunesTodoCerrado) hor.push('lunes cerrado'); if (h.cierraSabado) hor.push('sábado cerrado');
  if (h.abre || h.cierra) hor.push(`${h.abre || APP.ajustes.horario.abre}–${h.cierra || APP.ajustes.horario.cierra}`); if (h.cierraMediodia === false) hor.push('no cierra al mediodía');
  const el = screen(topbar('', `<button class="iconbtn" data-go="editarCliente:${c.id}" aria-label="Editar">${I.svg(I.edit, 20)}</button>`) + `
    <div class="section" style="padding-top:4px"><div class="row wrap" style="gap:10px"><h1 style="font-size:24px;font-weight:800;letter-spacing:-.02em;line-height:1.15">${U.esc(c.nombre)}</h1><span class="pill">${U.tamanoLabel(c.tamano)}</span>${c.codigo ? `<span class="muted small">#${U.esc(c.codigo)}</span>` : ''}</div>
      <div class="card ${colorCard}" style="${e.key === 'ambar' ? 'background:#FBF3E4;color:#6B4A0F' : ''}"><div class="row">${UI.dot(e.key)}<div class="col"><div class="bold" style="font-size:16px">${frase}</div><div class="small bold" style="opacity:.85">${sub}</div></div></div></div></div>
    <div class="section"><div class="row" style="align-items:flex-start">${I.svg(I.pin, 20)}<div class="col grow"><div class="bold">${U.esc(dir.l1) || '<span class="muted">Sin dirección</span>'}</div><div class="muted small">${U.esc(dir.l2)}${c.provincia ? ' · ' + U.esc(c.provincia) : ''}</div>${!c.lat ? `<button class="btn sm outline" data-go="ubicacion:${c.id}" style="margin-top:6px;align-self:flex-start">Situar en el mapa</button>` : (c.geocodeStatus === 'aprox' ? `<button class="btn sm outline" data-go="ubicacion:${c.id}" style="margin-top:6px;align-self:flex-start">Ubicación aproximada · corregir</button>` : '')}</div></div>
      ${c.telefono || c.contacto ? `<div class="row">${I.svg(I.phone, 20)}<div class="row wrap grow" style="gap:6px">${c.telefono ? `<a class="bold" href="tel:${U.esc(c.telefono)}">${U.esc(c.telefono)}</a>` : ''}${c.contacto ? `<span class="muted">${c.telefono ? '· ' : ''}${U.esc(c.contacto)}</span>` : ''}</div></div>` : ''}
      ${hor.length ? `<div class="row">${I.svg(I.clock, 20)}<div class="muted small">${U.esc(hor.join(' · '))}</div></div>` : ''}</div>
    <div class="section"><div class="row between"><div class="section-title">Notas</div><button class="btn sm outline" data-nota>${c.nota ? 'Editar' : '+ Nota'}</button></div>
      ${c.nota ? `<div class="card" style="white-space:pre-wrap">${U.esc(c.nota)}</div>` : '<div class="muted small">Lo que hay que recordar: gustos, persona de contacto, qué preguntar la próxima vez.</div>'}</div>
    <div class="section"><div class="section-title">Últimas visitas</div>
      ${visitas.length ? visitas.slice(0, 8).map(v => `<div class="row" style="align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--line)"><div class="muted small bold" style="width:64px;flex-shrink:0">${U.fmtDate(v.fecha)}</div><div class="col grow"><div class="bold small">${RES[v.resultado] || v.resultado}${v.pedidoId ? ' · <a href="#" data-go="pedido:' + v.pedidoId + '">ver pedido</a>' : ''}</div>${v.nota ? `<div class="small" style="white-space:pre-wrap">${U.esc(v.nota)}</div>` : ''}</div></div>`).join('') : '<div class="muted small">Todavía sin visitas registradas.</div>'}</div>
    ${pedidos.length ? `<div class="section"><div class="section-title">Pedidos</div>${pedidos.slice(0, 5).map(p => `<button class="item" data-go="pedido:${p.id}"><div class="col grow"><div class="name" style="font-size:15px">${U.fmtDate(p.fecha)} · ${(p.lineas || []).length} líneas · ${(p.lineas || []).reduce((s, l) => s + l.cantidad, 0)} uds</div><div class="meta">${p.enviado ? 'Enviado' : 'Pendiente de enviar'}</div></div>${I.svg(I.back, 16).replace('M15 5l-7 7 7 7', 'M9 5l7 7-7 7')}</button>`).join('')}</div>` : ''}
    <div style="height:160px"></div>
    <div style="position:fixed;left:0;right:0;bottom:0;padding:10px 16px calc(14px + env(safe-area-inset-bottom,0px));background:var(--bg);border-top:1px solid var(--line);display:flex;flex-direction:column;gap:8px;z-index:3">
      <a class="btn primary big" href="${U.mapsUrl(c)}" target="_blank" rel="noopener">${I.svg(I.nav, 20)} Iniciar visita</a>
      <div class="btn-row"><button class="btn" data-ruta>Añadir a ruta</button><button class="btn" data-visita>Registrar visita</button><button class="btn" data-go="pedido:nuevo-${c.id}">Pedido</button></div></div>`, { nav: false });
  wireBack(el); wireGo(el);
  el.querySelector('[data-nota]').onclick = async () => { const v = await promptNota('Notas del cliente', c.nota || ''); if (v != null) { c.nota = v; await DB.save('clientes', c); } };
  el.querySelector('[data-visita]').onclick = () => sheetVisita(c.id);
  el.querySelector('[data-ruta]').onclick = () => sheetAnadirRuta(c);
  return el;
};

/* nota con dictado */
function promptNota(titulo, valor) {
  return new Promise(res => {
    const s = UI.sheet(`<div class="grip"></div><h2>${U.esc(titulo)}</h2><div class="field"><div class="row"><textarea id="nv" class="grow" placeholder="Escribe o dicta…">${U.esc(valor)}</textarea>${UI.micBtn('nv')}</div></div>
      <div class="btn-row"><button class="btn" data-a="c">Cancelar</button><button class="btn primary" data-a="ok">Guardar</button></div>`, { onClose: () => res(null) });
    UI.wireMics(s);
    s.querySelector('[data-a=ok]').onclick = async () => { const v = s.querySelector('#nv').value.trim(); UI._sheet.onClose = null; await UI.closeSheet(); res(v); };
    s.querySelector('[data-a=c]').onclick = () => UI.closeSheet();
  });
}

/* ---------- registrar visita ---------- */
async function sheetVisita(clienteId, { rutaId = null } = {}) {
  const c = await DB.cliente(clienteId); if (!c) return;
  let resultado = null;
  const s = UI.sheet(`<div class="grip"></div><h2>Registrar visita</h2><div class="muted bold">${U.esc(c.nombre)}</div>
    <div class="seg c2" id="res">
      <button class="big" data-r="pedido"><span style="font-size:22px">🛒</span>Pedido</button><button class="big" data-r="revisar"><span style="font-size:22px">🔁</span>A revisar</button>
      <button class="big" data-r="no_interesado"><span style="font-size:22px">✋</span>Sin interés</button><button class="big" data-r="ausente"><span style="font-size:22px">🚪</span>Ausente</button></div>
    <div class="muted small" id="hint">«Ausente» no cuenta como visita: el plazo sigue corriendo.</div>
    <div class="field"><label for="vn">Nota (opcional)</label><div class="row"><textarea id="vn" class="grow" placeholder="Qué ha pasado, qué preguntar la próxima vez…"></textarea>${UI.micBtn('vn')}</div></div>
    <button class="btn primary big" data-ok disabled>Guardar visita</button>`);
  UI.wireMics(s);
  const ok = s.querySelector('[data-ok]');
  s.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { resultado = b.dataset.r; s.querySelectorAll('[data-r]').forEach(x => x.classList.toggle('on', x === b)); ok.disabled = false; ok.textContent = resultado === 'pedido' ? 'Continuar con el pedido' : 'Guardar visita'; });
  ok.onclick = async () => {
    const nota = s.querySelector('#vn').value.trim();
    if (resultado === 'pedido') { APP.go('pedido', { id: 'nuevo-' + c.id, nota, rutaId }); return; }
    await DB.registrarVisita({ clienteId: c.id, resultado, nota });
    if (rutaId) await marcarParadaHecha(rutaId, c.id);
    UI.closeSheet(); UI.toast(resultado === 'ausente' ? 'Anotado: ausente' : 'Visita guardada');
  };
}
async function marcarParadaHecha(rutaId, clienteId) {
  const r = await db.rutas.get(rutaId); if (!r) return;
  const p = r.paradas.find(p => p.clienteId === clienteId); if (!p || p.hecho) return;
  p.hecho = true; const n = new Date(); p.hechoA = n.getHours() * 60 + n.getMinutes();
  await DB.save('rutas', r);
}

/* ---------- añadir a ruta (hora fija opcional) ---------- */
async function sheetAnadirRuta(c) {
  const hoy = U.today();
  let fecha = hoy, fija = false, dur = APP.ajustes.duracion;
  const s = UI.sheet(`<div class="grip"></div><h2>Añadir a la ruta</h2><div class="row muted bold">${UI.dot(U.estado(c).key)} ${U.esc(c.nombre)} · ${U.esc(c.localidad || '')}</div>
    <div class="field"><label for="af">Día</label><input type="date" id="af" value="${hoy}" min="${hoy}"></div>
    <div class="card" style="display:flex;flex-direction:column;gap:10px"><div class="switch-row" style="padding:0"><div class="col"><span class="bold">Hora fija</span><span class="muted small">Solo si el cliente te espera a una hora</span></div><button class="switch" id="sw" role="switch" aria-checked="false" aria-label="Hora fija"></button></div>
      <div class="row hidden" id="hf"><label for="ah" class="muted bold small">A las</label>${UI.horaInput('ah', '10:00')}</div><div class="muted small hidden" id="hft">La ruta se organizará alrededor de esta cita.</div></div>
    <div class="field"><label>Duración de la visita</label><div class="seg c4" id="dur">${[15, 30, 45, 60].map(m => `<button data-m="${m}" class="${m === dur ? 'on' : ''}">${m === 60 ? '1 h' : m + ' min'}</button>`).join('')}</div></div>
    <button class="btn primary big" data-ok>Añadir a la ruta</button>`);
  s.querySelector('#af').onchange = e => fecha = e.target.value;
  s.querySelector('#sw').onclick = e => { fija = !fija; e.currentTarget.setAttribute('aria-checked', fija); s.querySelector('#hf').classList.toggle('hidden', !fija); s.querySelector('#hft').classList.toggle('hidden', !fija); };
  s.querySelectorAll('#dur button').forEach(b => b.onclick = () => { dur = +b.dataset.m; s.querySelectorAll('#dur button').forEach(x => x.classList.toggle('on', x === b)); });
  s.querySelector('[data-ok]').onclick = async e => {
    e.target.disabled = true;
    if (!c.lat) { UI.toast('Este cliente no tiene ubicación: sitúalo en el mapa primero'); e.target.disabled = false; return; }
    const r = await APP.anadirARuta(c.id, { horaFija: fija ? s.querySelector('#ah').value : null, duracion: dur, fecha });
    UI.closeSheet(); UI.toast(fecha === hoy ? 'Añadido a la ruta de hoy' : 'Añadido a la ruta del ' + U.fmtDate(fecha));
    if (r.noCaben.includes(c.id)) UI.toast('Ojo: no cabe en el horario de la ruta', 4000);
  };
}

/* ======================= PEDIDO ======================= */
SCREENS.pedido = async ({ id, nota, rutaId }) => {
  let p, c, nuevo = false;
  if (String(id).startsWith('nuevo-')) { nuevo = true; c = await DB.cliente(id.slice(6)); p = { id: U.uuid(), clienteId: c.id, fecha: U.now(), lineas: [], nota: '', enviado: false }; }
  else { p = await db.pedidos.get(id); if (!p) return screen(topbar('Pedido') + '<div class="empty">Pedido no encontrado</div>', { nav: false }); c = await DB.cliente(p.clienteId); }
  const catalogo = await DB.catalogo();
  const catN = catalogo.map(k => ({ k, n: U.norm(k.titulo + ' ' + k.ref + ' ' + (k.autor || '') + ' ' + (k.editorial || '')) }));
  const el = screen(topbar(nuevo ? 'Nuevo pedido' : 'Pedido', nuevo ? '' : `<button class="iconbtn" data-del aria-label="Eliminar">${I.svg(I.trash, 20)}</button>`) + `
    <div class="section" style="padding-top:4px"><div class="bold" style="font-size:20px">${U.esc(c.nombre)}</div><div class="muted small">${U.esc(c.localidad || '')} · ${U.fmtDate(p.fecha, { day: 'numeric', month: 'short', year: 'numeric' })}${p.enviado ? ' · <b>enviado</b>' : ''}</div></div>
    <div class="section"><div class="section-title">Añadir artículo</div>
      <div class="search" style="margin:0">${I.svg(I.search, 20)}<input id="q" placeholder="${catalogo.length ? 'Título, referencia o ISBN' : 'Sin catálogo: escribe el título'}" autocomplete="off"></div>
      <div class="results hidden" id="res"></div>
      <button class="btn sm outline" data-libre style="align-self:flex-start">+ Línea libre</button></div>
    <div class="section"><div class="section-title">Líneas · <span id="nl">${p.lineas.length}</span></div><div id="lineas"></div></div>
    <div class="section"><div class="field"><label for="pn">Nota del pedido</label><div class="row"><textarea id="pn" class="grow" placeholder="Entrega, condiciones, observaciones…">${U.esc(p.nota || nota || '')}</textarea>${UI.micBtn('pn')}</div></div></div>
    <div class="section"><div class="row between"><div class="muted bold">Total</div><div class="bold" id="tot"></div></div><button class="btn primary big" data-ok>${nuevo ? 'Guardar pedido' : 'Guardar cambios'}</button></div>`, { nav: false, static: true });
  wireBack(el); UI.wireMics(el);
  const lineasEl = el.querySelector('#lineas');
  const pintar = () => {
    el.querySelector('#nl').textContent = p.lineas.length;
    let tot = 0, uds = 0, sinPrecio = false;
    lineasEl.innerHTML = p.lineas.length ? p.lineas.map((l, i) => { if (l.precio != null) tot += l.precio * l.cantidad; else sinPrecio = true; uds += l.cantidad; return `<div class="oline"><div class="t"><div class="ti">${U.esc(l.titulo)}</div><div class="ref">${U.esc(l.ref || '')}${l.precio != null ? ` · ${l.precio.toFixed(2)} €` : ''}</div></div>${UI.stepper(i, l.cantidad)}<button class="iconbtn flat" data-rm="${i}" aria-label="Quitar">${I.svg(I.x, 18)}</button></div>`; }).join('') : '<div class="muted small">Busca en el catálogo o añade una línea libre.</div>';
    el.querySelector('#tot').textContent = `${uds} uds${tot ? ' · ' + tot.toFixed(2) + ' €' : ''}${sinPrecio && tot ? ' (parcial)' : ''}`;
    lineasEl.querySelectorAll('[data-stepper]').forEach(st => st.querySelectorAll('button').forEach(b => b.onclick = () => { const i = +st.dataset.stepper; p.lineas[i].cantidad = Math.max(1, p.lineas[i].cantidad + (+b.dataset.d)); pintar(); }));
    lineasEl.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { p.lineas.splice(+b.dataset.rm, 1); pintar(); });
  };
  pintar();
  const q = el.querySelector('#q'), res = el.querySelector('#res');
  const addLinea = (l) => { const ex = p.lineas.find(x => x.ref && x.ref === l.ref); if (ex) ex.cantidad++; else p.lineas.push(l); q.value = ''; res.classList.add('hidden'); pintar(); };
  q.addEventListener('input', () => {
    const t = U.norm(q.value); if (!t) { res.classList.add('hidden'); return; }
    const hits = catN.filter(x => x.n.includes(t)).slice(0, 20);
    res.innerHTML = hits.map((h, i) => `<button data-i="${i}"><span class="bold">${U.esc(h.k.titulo)}</span><span class="muted small">${U.esc(h.k.ref)}${h.k.autor ? ' · ' + U.esc(h.k.autor) : ''}${h.k.precio != null ? ' · ' + h.k.precio.toFixed(2) + ' €' : ''}</span></button>`).join('') + `<button data-i="libre"><span class="bold">+ «${U.esc(q.value)}» como línea libre</span></button>`;
    res.classList.remove('hidden');
    res.querySelectorAll('button').forEach(b => b.onclick = () => { if (b.dataset.i === 'libre') addLinea({ ref: '', titulo: q.value.trim(), cantidad: 1, precio: null }); else { const k = hits[+b.dataset.i].k; addLinea({ ref: k.ref, titulo: k.titulo, cantidad: 1, precio: k.precio }); } });
  });
  el.querySelector('[data-libre]').onclick = async () => { const t = await UI.prompt('Línea libre', { placeholder: 'Título o descripción', ok: 'Añadir' }); if (t && t.trim()) addLinea({ ref: '', titulo: t.trim(), cantidad: 1, precio: null }); };
  el.querySelector('[data-ok]').onclick = async e => {
    if (!p.lineas.length) { UI.toast('Añade al menos un artículo'); return; }
    e.target.disabled = true; p.nota = el.querySelector('#pn').value.trim();
    await DB.save('pedidos', p);
    if (nuevo) { await DB.registrarVisita({ clienteId: c.id, resultado: 'pedido', nota: nota || '', pedidoId: p.id }); if (rutaId) await marcarParadaHecha(rutaId, c.id); }
    UI.toast('Pedido guardado'); APP.go('ficha', { id: c.id }, true);
  };
  el.querySelector('[data-del]')?.addEventListener('click', async () => { if (await UI.confirm('¿Eliminar este pedido?', '', { ok: 'Eliminar', danger: true })) { await DB.softDelete('pedidos', p.id); APP.back(); } });
  return el;
};

/* ======================= PEDIDOS ======================= */
SCREENS.pedidos = async () => {
  const st = SCREENS._pd = SCREENS._pd || { vista: 'pendientes' };
  const [todos, byId] = await Promise.all([db.pedidos.toArray(), clientesById()]);
  const vivos = todos.filter(p => !p.deleted).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const pendientes = vivos.filter(p => !p.enviado);
  const hoy = U.today(), ahora = new Date();
  const diaDe = p => U.isoDate(new Date(p.fecha)); // fecha guardada en UTC: se agrupa por el día local
  const lunes = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - (ahora.getDay() + 6) % 7);
  const rangos = { hoy: [hoy, hoy], semana: [U.isoDate(lunes), hoy], mes: [hoy.slice(0, 8) + '01', hoy] };
  if (!st.desde) { st.desde = rangos.mes[0]; st.hasta = hoy; }
  if (st.vista === 'rango' && st.desde > st.hasta) [st.desde, st.hasta] = [st.hasta, st.desde];
  const r = st.vista === 'rango' ? [st.desde, st.hasta] : rangos[st.vista];
  const lista = st.vista === 'pendientes' ? pendientes : r ? vivos.filter(p => { const d = diaDe(p); return d >= r[0] && d <= r[1]; }) : vivos;
  const importe = lista.reduce((s, p) => s + (p.lineas || []).reduce((t, l) => t + (l.precio || 0) * (l.cantidad || 0), 0), 0);
  const unidades = lista.reduce((s, p) => s + (p.lineas || []).reduce((t, l) => t + (l.cantidad || 0), 0), 0);
  let html = '', dia = null;
  for (const p of lista.slice(0, 300)) {
    const d = diaDe(p); if (d !== dia) { dia = d; html += `<div class="group-title">${d === hoy ? 'Hoy' : U.fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' })}</div>`; }
    const c = byId[p.clienteId] || { nombre: '(cliente eliminado)' }; const uds = (p.lineas || []).reduce((s, l) => s + l.cantidad, 0);
    html += `<button class="item" data-go="pedido:${p.id}"><div class="col grow"><div class="name">${U.esc(c.nombre)}</div><div class="meta">${(p.lineas || []).length} líneas · ${uds} uds · ${new Date(p.fecha).toTimeString().slice(0, 5)}${p.nota ? ' · ' + U.esc(p.nota.slice(0, 40)) : ''}</div></div><div class="right ${p.enviado ? 'tx-verde' : 'tx-ambar'}">${p.enviado ? 'Enviado' : 'Pendiente'}</div></button>`;
  }
  const el = screen(`<div class="hdr"><div class="hdr-row"><h1>Pedidos</h1><div class="muted bold">${pendientes.length} pendientes</div></div></div>
    <div class="chips">${[['pendientes', 'Pendientes de enviar'], ['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['rango', 'Fechas…'], ['todos', 'Todos']].map(([k, l]) => `<button class="chip ${st.vista === k ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div>
    ${st.vista === 'rango' ? `<div class="section" style="padding-top:4px"><div class="field-row"><div class="field"><label for="pdd">Desde</label><input type="date" id="pdd" value="${st.desde}" max="${hoy}"></div><div class="field"><label for="pdh">Hasta</label><input type="date" id="pdh" value="${st.hasta}"></div></div></div>` : ''}
    ${lista.length ? `<div class="section" style="padding-top:4px"><div class="muted small bold">${lista.length} pedido${lista.length === 1 ? '' : 's'} · ${unidades} uds${importe ? ' · ' + importe.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : ''}</div></div>` : ''}
    ${lista.length ? `<div class="section" style="padding-top:8px"><button class="btn primary big" data-enviar>${I.svg(I.share, 20)} Enviar Excel · ${lista.length} pedido${lista.length === 1 ? '' : 's'}</button><div class="muted small center">Se abre el menú de compartir del móvil (WhatsApp, Gmail, Drive…)</div></div>` : ''}
    <div class="list">${html || '<div class="empty">No hay pedidos aquí</div>'}</div>`);
  wireGo(el);
  el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { st.vista = b.dataset.v; APP.render(); });
  requestAnimationFrame(() => { const on = el.querySelector('.chips .chip.on'); if (on) on.parentElement.scrollLeft = on.offsetLeft - 20; });
  [['pdd', 'desde'], ['pdh', 'hasta']].forEach(([id, k]) => el.querySelector('#' + id)?.addEventListener('change', e => { if (e.target.value) { st[k] = e.target.value; APP.render(); } }));
  el.querySelector('[data-enviar]')?.addEventListener('click', async e => {
    e.target.disabled = true;
    // se exporta exactamente la selección del filtro, en orden cronológico
    const sel = [...lista].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const data = XIO.pedidosXlsx(sel, byId);
    const sufijo = st.vista === 'pendientes' ? 'pendientes_' + hoy : st.vista === 'todos' ? 'todos_' + hoy : r[0] === r[1] ? r[0] : `${r[0]}_a_${r[1]}`;
    const res = await XIO.compartir(data, `pedidos_${sufijo}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Pedidos ' + sufijo.replace(/_/g, ' '));
    e.target.disabled = false;
    if (res === 'cancelado') return;
    const sinEnviar = sel.filter(p => !p.enviado);
    if (sinEnviar.length && await UI.confirm('¿Marcar como enviados?', `${sinEnviar.length} pedido${sinEnviar.length === 1 ? '' : 's'} pasará${sinEnviar.length === 1 ? '' : 'n'} a «enviado». Seguirán en el historial.`, { ok: 'Sí, marcar' })) {
      for (const p of sinEnviar) { p.enviado = true; p.enviadoAt = U.now(); }
      await DB.bulkSave('pedidos', sinEnviar); UI.toast('Pedidos marcados como enviados');
    }
  });
  return el;
};

/* ======================= MAPA ======================= */
SCREENS.mapa = async (params) => {
  const clientes = await DB.clientes();
  const st = SCREENS._mp = SCREENS._mp || { off: new Set(), view: null };
  const el = screen(`<div class="map-screen"><div class="map-wrap"><div class="map full" id="bigMap"></div>
    <div class="map-overlay">${[['rojo', 'Fuera de plazo'], ['ambar', 'Próximos'], ['verde', 'Al día'], ['azul', 'Sin visitar']].map(([k, l]) => `<button class="legend-chip ${st.off.has(k) ? 'off' : ''}" data-k="${k}">${UI.dot(k)}${l}</button>`).join('')}</div>
    <button class="map-fab" data-loc aria-label="Mi ubicación">${I.svg(I.locate, 22)}</button></div></div>`);
  el.classList.add('flush'); el.style.paddingBottom = 'calc(var(--nav-h) + env(safe-area-inset-bottom, 0px))';
  el._afterMount = async () => {
    const map = UI.map(el.querySelector('#bigMap'));
    const grupo = L.layerGroup().addTo(map);
    const pintar = () => {
      grupo.clearLayers();
      for (const c of clientes) {
        if (!c.lat) continue; const e = U.estado(c); if (st.off.has(e.key)) continue;
        const m = L.marker([c.lat, c.lng], { icon: UI.pin(e.key) }).addTo(grupo);
        m.bindPopup(`<div class="popup"><div class="name">${U.esc(c.nombre)}</div><div class="meta">${U.esc(c.localidad || '')} · ${U.tamanoLabel(c.tamano)} · ${e.dias == null ? 'sin visitar' : e.dias + ' días sin visita'}</div><div class="row" style="gap:6px"><button class="btn primary" data-go="ficha:${c.id}">Ficha</button><button class="btn" data-ar="${c.id}">Añadir a ruta</button></div></div>`);
      }
    };
    map.on('popupopen', ev => { const n = ev.popup.getElement(); wireGo(n); n.querySelectorAll('[data-ar]').forEach(b => b.onclick = () => { const c = clientes.find(x => x.id === b.dataset.ar); map.closePopup(); sheetAnadirRuta(c); }); });
    map.on('moveend', () => { st.view = { c: map.getCenter(), z: map.getZoom() }; });
    pintar();
    const pts = clientes.filter(c => c.lat).map(c => [c.lat, c.lng]);
    if (st.view && !params.cerca) map.setView(st.view.c, st.view.z); else if (pts.length) map.fitBounds(pts, { padding: [30, 30] }); else map.setView([41.6, 1.9], 8);
    el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { const k = b.dataset.k; st.off.has(k) ? st.off.delete(k) : st.off.add(k); b.classList.toggle('off', st.off.has(k)); pintar(); });
    const localizar = async () => {
      try {
        UI.toast('Buscando tu ubicación…', 1500);
        const p = await GEO.miUbicacion();
        L.circleMarker([p.lat, p.lng], { radius: 9, color: '#fff', weight: 3, fillColor: '#2563EB', fillOpacity: 1 }).addTo(map);
        map.setView([p.lat, p.lng], 12);
        const cerca = clientes.filter(c => c.lat && U.haversineKm(p, c) <= 10).map(c => ({ c, km: U.haversineKm(p, c) })).sort((a, b) => a.km - b.km);
        const n = { rojo: 0, ambar: 0, verde: 0, azul: 0 }; cerca.forEach(x => n[U.estado(x.c).key]++);
        const s = UI.sheet(`<div class="grip"></div><h2>Clientes a menos de 10 km</h2><div class="row wrap" style="gap:8px"><span class="pill rojo">${n.rojo} fuera de plazo</span><span class="pill" style="background:#FBF3E4;color:#6B4A0F">${n.ambar} próximos</span><span class="pill" style="background:#E6F4EC;color:#14532D">${n.verde} al día</span></div>
          <div class="list" style="padding:0">${cerca.length ? cerca.slice(0, 30).map(x => clienteItem(x.c, x.km.toFixed(1) + ' km')).join('') : '<div class="empty">Ningún cliente cerca</div>'}</div>`);
        wireGo(s);
      } catch (e) { UI.toast('No se pudo obtener la ubicación'); }
    };
    el.querySelector('[data-loc]').onclick = localizar;
    if (params.cerca) { params.cerca = false; localizar(); }
  };
  return el;
};
