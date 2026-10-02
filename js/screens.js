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
const ESTADOS = { rojo: 'Fuera de plazo', ambar: 'Próximos a vencer', azul: 'Sin visitar', verde: 'Al día', prospecto: 'Prospectos', inactivo: 'Inactivos' };
function clienteItem(c, right, { neutro = false } = {}) {
  const e = U.estado(c);
  const meta = [c.localidad, U.tamanoLabel(c.tamano), c.codAgrup ? 'Cadena · ' + c.codAgrup : ''].filter(Boolean).join(' · ');
  return `<button class="item" data-go="ficha:${c.id}">${UI.dot(e.key)}<div class="col grow"><div class="name">${U.esc(c.nombre)}</div><div class="meta">${U.esc(meta)}</div></div><div class="right ${neutro ? '' : 'tx-' + e.key}">${right != null ? right : (e.dias == null ? (e.key === 'prospecto' ? 'prospecto' : e.key === 'inactivo' ? 'inactivo' : 'nuevo') : e.dias + ' d')}</div></button>`;
}
async function clientesById() { const cs = await DB.clientes(); return Object.fromEntries(cs.map(c => [c.id, c])); }
/* Días sin pedidos (desde el último pedido de la app o, si no tiene, desde que se añadió). Prospectos e inactivos: sin alerta. */
function diasSinPedido(c, ultimos) {
  if (c.prospecto || c.inactivo) return null;
  const base = ultimos.get(c.id) || c.createdAt; if (!base) return null;
  return U.daysSince(U.isoDate(new Date(base)));
}
function alertaSinPedidos(c, ultimos) { const d = diasSinPedido(c, ultimos); return d != null && d >= Math.round((APP.ajustes.alertaMeses || 6) * 30.4); }
function haceTexto(dias) { if (dias == null) return ''; if (dias < 1) return 'hoy'; if (dias < 45) return `hace ${dias} día${dias === 1 ? '' : 's'}`; const m = Math.round(dias / 30.4); return `hace ${m} mes${m === 1 ? '' : 'es'}`; }
function totalPedido(p) { return (p.lineas || []).reduce((s, l) => s + (l.precio || 0) * (l.cantidad || 0), 0); }
function udsPedido(p) { return (p.lineas || []).reduce((s, l) => s + (l.cantidad || 0), 0); }

/* ======================= HOY ======================= */
SCREENS.hoy = async () => {
  const hoy = U.today();
  const [clientes, ruta, pedidosHoy, lastBackup, tareas, ultimos] = await Promise.all([DB.clientes(), DB.rutaDelDia(hoy), DB.pedidosDelDia(hoy), DB.get('lastBackup', null), DB.tareasAbiertas(), DB.ultimosPedidos()]);
  const byId = Object.fromEntries(clientes.map(c => [c.id, c]));
  const cont = { rojo: 0, ambar: 0, verde: 0, azul: 0, prospecto: 0, inactivo: 0 };
  for (const c of clientes) cont[U.estado(c).key]++;
  const sinPed = clientes.filter(c => alertaSinPedidos(c, ultimos)).length;
  const sinCoord = clientes.filter(c => !c.lat).length;
  const d = new Date();
  let banners = '';
  if (clientes.length && SYNC.estado !== 'ok') {
    const dias = lastBackup ? U.daysSince(lastBackup.slice(0, 10)) : null;
    if (dias == null || dias >= 7) banners += `<div class="banner" data-go="ajustes">${I.svg(I.warn, 18)}<span>${dias == null ? 'Todavía no has hecho ninguna copia de seguridad.' : `Última copia de seguridad hace ${dias} días.`} Toca para hacerla.</span></div>`;
  }
  if (SYNC.estado === 'sin-sesion') banners += `<div class="banner" data-login>${I.svg(I.cloud, 18)}<span>La copia en línea no tiene la sesión iniciada: los cambios no se están copiando. Toca para iniciar sesión.</span></div>`;
  if (SYNC.estado === 'ok' && SYNC.error) banners += `<div class="banner" data-go="ajustes">${I.svg(I.cloud, 18)}<span>${U.esc(SYNC.error)}. Los datos siguen guardados en el móvil.</span></div>`;
  if (sinCoord) banners += `<div class="banner info" data-go="ajustes">${I.svg(I.pin, 18)}<span>${sinCoord} cliente${sinCoord > 1 ? 's' : ''} sin ubicación en el mapa. Toca para resolverlo.</span></div>`;

  // tareas de hoy y vencidas (tres como mucho)
  const urgentes = tareas.filter(t => t.fecha && t.fecha <= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const tareasHtml = urgentes.length ? `<div class="section"><div class="row between"><div class="section-title">Tareas para hoy · ${urgentes.length}</div><a href="#" data-go="tareas" class="bold small">Ver todas</a></div><div class="card" style="padding:4px 16px">${urgentes.slice(0, 3).map(t => tareaItem(t, byId)).join('')}</div></div>` : '';

  let rutaHtml;
  const plan = ruta ? ruta.paradas.filter(p => !p.noCabe) : []; // las que no caben no cuentan como visitas del día
  const pend = plan.filter(p => !p.hecho && byId[p.clienteId]);
  const noCabenHoy = ruta ? ruta.paradas.filter(p => p.noCabe && !p.hecho).length : 0;
  if (ruta && ruta.paradas.length) {
    const next = pend[0]; const nc = next && byId[next.clienteId];
    const comida = ruta.pausa ? ` · comida ${U.fmtTime(ruta.pausa.inicio)}–${U.fmtTime(ruta.pausa.fin)}` : ruta.jornadaContinua ? ' · jornada continua' : '';
    rutaHtml = `<div class="section"><div class="row between"><div class="section-title">Ruta de hoy</div><a href="#" data-go="ruta:${ruta.id}" class="bold small">Ver ruta</a></div>
      <div class="map mini" id="miniMap"></div>
      <div class="muted small bold">${plan.length} visitas · ${U.fmtKm(ruta.km)} · ${U.fmtDur(ruta.conduccion)} de conducción${ruta.estimado ? ' (estimado)' : ''}${comida}</div>
      ${noCabenHoy ? `<div class="card rojo small bold" data-go="ruta:${ruta.id}">${noCabenHoy} cliente${noCabenHoy > 1 ? 's' : ''} no cabe${noCabenHoy > 1 ? 'n' : ''} en el horario. Toca para ver la ruta.</div>` : ''}
      ${nc ? `<div class="card accent"><div class="row between"><div class="col grow"><div class="small bold" style="letter-spacing:.05em;text-transform:uppercase;color:var(--accent)">Siguiente · ${U.fmtTime(next.inicio)}</div><div class="bold" style="font-size:18px">${U.esc(nc.nombre)}</div><div class="muted small">${U.esc(U.direccion(nc).full)}</div></div></div>
        <div class="btn-row" style="margin-top:12px"><a class="btn primary" href="${U.mapsUrl(nc)}" target="_blank" rel="noopener">${I.svg(I.nav, 18)} Iniciar visita</a><button class="btn" data-visita="${nc.id}" data-parada="${ruta.id}">Registrar</button></div></div>`
        : `<div class="card"><div class="bold">${noCabenHoy ? 'Sin más visitas dentro del horario' : 'Ruta completada'}</div><div class="muted small">${noCabenHoy ? 'Quedan clientes que no caben: amplía el límite o recalcula la ruta.' : 'Todas las visitas están registradas.'}</div></div>`}
    </div>`;
  } else {
    rutaHtml = `<div class="section"><div class="section-title">Ruta de hoy</div>
      <div class="card"><div class="bold">Sin ruta planificada</div><div class="muted small">Crea una ruta con los clientes que toca visitar.</div></div>
      <button class="btn primary big" data-go="nuevaRuta">${I.svg(I.plus, 20, 2.4)} Crear ruta</button>
      <button class="btn big" data-cerca>${I.svg(I.locate, 20)} Clientes cerca de mí</button></div>`;
  }
  const pedHtml = `<div class="section"><div class="row between"><div class="section-title">Pedidos</div><a href="#" data-go="pedidos" class="bold small">Ver todos</a></div>
    <button class="card" data-go="pedidos" style="border:0;text-align:left;color:inherit"><div class="bold" style="font-size:18px">${pedidosHoy.length} pedido${pedidosHoy.length === 1 ? '' : 's'} hoy</div><div class="muted small">${pedidosHoy.length ? `${pedidosHoy.reduce((s, p) => s + udsPedido(p), 0)} uds · ${U.fmtEur(pedidosHoy.reduce((s, p) => s + totalPedido(p), 0), 2)}` : 'Todavía ninguno'}</div></button></div>`;
  const alertas = sinPed ? `<div class="section"><button class="card ambar" data-filtro="sinpedidos" style="border:0;text-align:left"><div class="bold">${sinPed} cliente${sinPed === 1 ? '' : 's'} sin pedidos desde hace ${APP.ajustes.alertaMeses || 6} meses</div><div class="small">Toca para ver la lista</div></button></div>` : '';
  const conVentas = clientes.filter(VENTAS.tieneDatos), cmp = conVentas.length ? VENTAS.comparativa(VENTAS.agregar(conVentas)) : null;
  const ventasHtml = cmp ? `<div class="section"><div class="row between"><div class="section-title">Ventas</div><a href="#" data-go="ventas" class="bold small">Ver detalle</a></div>
    <button class="card" data-go="ventas" style="border:0;text-align:left;color:inherit"><div class="muted small bold">${U.esc(cmp.periodo)}</div><div class="bold" style="font-size:22px">${U.fmtEur(cmp.actual)}</div><div class="small bold ${cmp.pct > 0 ? 'tx-verde' : cmp.pct < 0 ? 'tx-rojo' : 'muted'}">${cmp.pct == null ? 'Sin datos del año anterior' : `${U.fmtPct(cmp.pct)} vs ${cmp.anio - 1} mismo periodo`}</div></button></div>` : '';
  const chip = k => cont[k] ? `<button class="chip" data-filtro="${k}">${UI.dot(k)} ${cont[k]} ${{ rojo: 'fuera de plazo', ambar: 'próximos', verde: 'al día', azul: 'sin visitar', prospecto: 'prospectos', inactivo: 'inactivos' }[k]}</button>` : '';
  const carteraHtml = clientes.length ? `<div class="section"><div class="section-title">Cartera · ${clientes.length} clientes</div>
    <div class="row wrap" style="gap:8px">${['rojo', 'ambar', 'verde', 'azul', 'prospecto', 'inactivo'].map(chip).join('')}</div></div>` : '';
  const bienvenida = !clientes.length ? `<div class="section"><div class="card accent"><div class="bold" style="font-size:18px">Empezar</div><p class="muted small" style="margin:6px 0 12px">Importa tus clientes desde Excel o carga unas 160 librerías de Cataluña como datos de prueba (direcciones reales, datos comerciales inventados).</p>
    <div class="col" style="gap:8px"><button class="btn primary" data-importar>${I.svg(I.file, 18)} Importar clientes desde Excel</button><button class="btn" data-demo>Cargar datos de prueba</button></div></div></div>` : '';

  const el = screen(`<div class="hdr"><div class="hdr-row"><div class="col"><div class="eyebrow">${U.esc(U.fmtDateLong(d))}</div><h1>Hoy</h1></div>
      <div class="row" style="gap:8px"><button class="iconbtn" data-go="tareas" aria-label="Tareas (${tareas.length} pendientes)">${I.svg(I.check, 22)}${tareas.length ? `<span class="badge-inline">${tareas.length}</span>` : ''}</button><button class="iconbtn" data-go="ajustes" aria-label="Ajustes">${I.svg(I.gear, 22)}</button></div></div>
    ${clientes.length ? `<div class="sub">${cont.rojo ? `${cont.rojo} clientes fuera de plazo` : 'Todos los clientes al día'}</div>` : ''}</div>
    ${banners}${bienvenida}${tareasHtml}${clientes.length ? rutaHtml + alertas + pedHtml + ventasHtml : ''}${carteraHtml}`);
  wireGo(el); wireTareas(el);
  el.querySelectorAll('[data-filtro]').forEach(b => b.onclick = () => APP.go('clientes', { filtro: b.dataset.filtro }));
  el.querySelector('[data-login]')?.addEventListener('click', async () => { await APP.login(); APP.render(); });
  el.querySelector('[data-demo]')?.addEventListener('click', async e => { e.currentTarget.disabled = true; UI.toast('Cargando datos de prueba…'); const n = await APP.cargarDemo(); UI.toast(`${n} clientes de prueba cargados`); });
  el.querySelector('[data-cerca]')?.addEventListener('click', () => APP.go('mapa', { cerca: true }));
  el.querySelector('[data-importar]')?.addEventListener('click', () => APP.go('ajustes', { abrir: 'clientes' }));
  el.querySelectorAll('[data-visita]').forEach(b => b.onclick = () => sheetVisita(b.dataset.visita, { rutaId: b.dataset.parada }));
  el._afterMount = () => {
    const mm = el.querySelector('#miniMap');
    if (mm && ruta) {
      const map = UI.map(mm, { dragging: false, scrollWheelZoom: false, touchZoom: false, doubleClickZoom: false });
      el._cleanup = () => map.remove();
      const pts = [];
      if (ruta.origen?.lat) { L.marker([ruta.origen.lat, ruta.origen.lng], { icon: UI.pin('origen') }).addTo(map); pts.push([ruta.origen.lat, ruta.origen.lng]); }
      plan.forEach((p, i) => { const c = byId[p.clienteId]; if (c && c.lat) { L.marker([c.lat, c.lng], { icon: UI.pin(p.hecho ? 'gris' : U.estado(c).key, i + 1) }).addTo(map); pts.push([c.lat, c.lng]); } });
      if (pts.length) { L.polyline(pts.concat(ruta.destino?.lat ? [[ruta.destino.lat, ruta.destino.lng]] : []), { color: APP.cssVar('--accent'), weight: 3, opacity: .7, dashArray: '6 6' }).addTo(map); map.fitBounds(pts, { padding: [24, 24] }); }
      mm.onclick = () => APP.go('ruta', { id: ruta.id });
    }
  };
  return el;
};

/* ======================= CLIENTES ======================= */
SCREENS.clientes = async (params) => {
  const [clientes, ultimos] = await Promise.all([DB.clientes(), DB.ultimosPedidos()]);
  const st = SCREENS._cl = SCREENS._cl || { q: '', filtro: 'todos', zona: '', cadena: '' };
  if (params.filtro) { st.filtro = params.filtro; params.filtro = null; }
  const meses = APP.ajustes.alertaMeses || 6;
  const FILTROS = [['todos', 'Todos'], ['rojo', 'Fuera de plazo'], ['ambar', 'Próximos'], ['verde', 'Al día'], ['azul', 'Sin visitar'], ['sinpedidos', `Sin pedidos ${meses} m`], ['prospecto', 'Prospectos'], ['inactivo', 'Inactivos'], ['grande', 'Grandes']];
  const cadenas = [...new Set(clientes.map(c => c.codAgrup).filter(Boolean))].sort();
  const el = screen(`<div class="hdr"><div class="hdr-row"><h1>Clientes</h1><div class="muted bold" id="ncli">${clientes.length}</div></div></div>
    <div class="search">${I.svg(I.search, 20)}<input id="q" type="search" placeholder="Buscar nombre, localidad, CP o comarca" value="${U.esc(st.q)}" autocomplete="off"></div>
    <div class="row" style="gap:8px;padding:8px 20px 0"><select class="sel grow" id="cz" aria-label="Zona">${ZONAS.opciones(clientes, st.zona)}</select>${cadenas.length ? `<select class="sel grow" id="cc" aria-label="Cadena"><option value="">Todas las cadenas</option><option value="__si" ${st.cadena === '__si' ? 'selected' : ''}>Solo cadenas</option>${cadenas.map(k => `<option ${k === st.cadena ? 'selected' : ''}>${U.esc(k)}</option>`).join('')}</select>` : ''}</div>
    <div class="chips">${FILTROS.map(([k, l]) => `<button class="chip ${st.filtro === k ? 'on' : ''}" data-f="${k}">${ESTADOS[k] ? UI.dot(k) : ''}${l}</button>`).join('')}</div>
    <div class="list" id="lista"></div>
    <button class="fab" data-go="editarCliente" aria-label="Nuevo cliente" style="color:var(--on-accent)">${I.svg(I.plus, 24, 2.4)}<span class="sr-only">Nuevo cliente</span></button>`);
  const lista = el.querySelector('#lista');
  const pintar = () => {
    const q = U.norm(st.q);
    let cs = clientes.filter(c => (!q || U.norm(c.nombre + ' ' + c.localidad + ' ' + c.cp + ' ' + (c.contacto || '') + ' ' + U.comarca(c) + ' ' + (c.codAgrup || '')).includes(q)) && ZONAS.cumple(c, st.zona) && (!st.cadena || (st.cadena === '__si' ? !!c.codAgrup : c.codAgrup === st.cadena)));
    if (ESTADOS[st.filtro]) cs = cs.filter(c => U.estado(c).key === st.filtro);
    if (st.filtro === 'grande') cs = cs.filter(c => c.tamano === 'grande');
    if (st.filtro === 'sinpedidos') cs = cs.filter(c => alertaSinPedidos(c, ultimos)).sort((a, b) => diasSinPedido(b, ultimos) - diasSinPedido(a, ultimos));
    const ord = { rojo: 0, ambar: 1, azul: 2, verde: 3, prospecto: 4, inactivo: 5 };
    if (st.filtro !== 'sinpedidos') cs.sort((a, b) => { const ea = U.estado(a), eb = U.estado(b); if (ea.key !== eb.key) return ord[ea.key] - ord[eb.key]; if (ea.key === 'azul' || ea.dias == null) return a.nombre.localeCompare(b.nombre); return (eb.dias || 0) - (ea.dias || 0); });
    el.querySelector('#ncli').textContent = cs.length === clientes.length ? clientes.length : `${cs.length} de ${clientes.length}`;
    if (!cs.length) { lista.innerHTML = `<div class="empty">${clientes.length ? 'Ningún cliente coincide' : 'Todavía no hay clientes'}</div>`; return; }
    let html = '', grupo = null;
    const n = {}; cs.forEach(c => { const k = U.estado(c).key; n[k] = (n[k] || 0) + 1; });
    for (const c of cs.slice(0, 400)) {
      const k = U.estado(c).key;
      if (st.filtro === 'todos' && k !== grupo) { grupo = k; html += `<div class="group-title">${ESTADOS[k]} · ${n[k]}</div>`; }
      html += clienteItem(c, st.filtro === 'sinpedidos' ? haceTexto(diasSinPedido(c, ultimos)).replace('hace ', '') : null);
    }
    if (cs.length > 400) html += `<div class="empty">Se muestran 400 de ${cs.length} clientes · usa la búsqueda o los filtros para ver el resto</div>`;
    lista.innerHTML = html; wireGo(lista);
  };
  pintar();
  el.querySelector('#q').addEventListener('input', U.debounce(e => { st.q = e.target.value; pintar(); }, 120));
  el.querySelector('#cz').onchange = e => { st.zona = e.target.value; pintar(); };
  el.querySelector('#cc')?.addEventListener('change', e => { st.cadena = e.target.value; pintar(); });
  el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { st.filtro = b.dataset.f; el.querySelectorAll('[data-f]').forEach(x => x.classList.toggle('on', x === b)); pintar(); });
  requestAnimationFrame(() => { const on = el.querySelector('.chips .chip.on'); if (on) on.parentElement.scrollLeft = on.offsetLeft - 20; });
  wireGo(el);
  return el;
};

/* ======================= FICHA ======================= */
SCREENS.ficha = async ({ id }) => {
  const c = await DB.cliente(id);
  if (!c || c.deleted) { const v = screen(topbar('Cliente') + '<div class="empty">Cliente no encontrado</div>', { nav: false }); wireBack(v); return v; }
  const st = SCREENS._fi = SCREENS._fi && SCREENS._fi.id === id ? SCREENS._fi : { id, todosPedidos: false };
  const [visitas, pedidos, tareas, ultimos] = await Promise.all([DB.visitasDe(id), DB.pedidosDe(id), DB.tareasAbiertas(id), DB.ultimosPedidos()]);
  const e = U.estado(c); const dir = U.direccion(c);
  const RES = { pedido: 'Pedido', no_interesado: 'Sin interés', ausente: 'Ausente', revisar: 'A revisar', visita: 'Visita' };
  const frase = U.estadoFrase(c);
  const sub = e.key === 'prospecto' ? 'Sin alertas de visita hasta que compre' : e.key === 'inactivo' ? 'Sin ventas en el último año completo · sin alertas' : e.key === 'azul' ? `Frecuencia ${U.frecuenciaLabel(c.frecuenciaDias).toLowerCase()}` : e.key === 'rojo' ? `${U.frecuenciaLabel(c.frecuenciaDias)} · venció hace ${e.dias - e.limite} días` : `${U.frecuenciaLabel(c.frecuenciaDias)} · próxima en ${e.restante} días`;
  const colorCard = e.key === 'rojo' ? 'rojo' : e.key === 'ambar' ? 'ambar' : e.key === 'prospecto' || e.key === 'inactivo' ? '' : 'accent';
  const dow = new Date().getDay();
  const horarioHoy = ROUTE.textoHorario(c.horario, APP.ajustes.horario, dow);
  const semana = [1, 2, 3, 4, 5, 6, 0].map(d => `<div class="row between small"><span class="bold">${ROUTE.DIAS[d]}</span><span class="muted">${ROUTE.textoHorario(c.horario, APP.ajustes.horario, d)}</span></div>`).join('');
  const dSin = diasSinPedido(c, ultimos), ultPed = ultimos.get(c.id);
  const comarca = U.comarca(c);
  const movil = U.movil(c), tel = c.telefono || movil;
  const ventas = VENTAS.tieneDatos(c) ? VENTAS.comparativa(c.ventas) : null;
  const pedidoFila = p => `<button class="item" data-go="pedido:${p.id}"><div class="col grow"><div class="name" style="font-size:16px">${U.fmtDate(p.fecha, { day: 'numeric', month: 'short', year: 'numeric' })} · ${udsPedido(p)} uds${totalPedido(p) ? ' · ' + U.fmtEur(totalPedido(p), 2) : ''}</div><div class="meta">${(p.lineas || []).length} líneas${p.modificadoAt ? ' · modificado el ' + U.fmtDate(p.modificadoAt) : ''}${p.nota ? ' · ' + U.esc(p.nota.slice(0, 40)) : ''}</div></div>${I.svg(I.back, 16).replace('M15 5l-7 7 7 7', 'M9 5l7 7-7 7')}</button>`;
  const el = screen(topbar('', `<button class="iconbtn" data-go="editarCliente:${c.id}" aria-label="Editar">${I.svg(I.edit, 20)}</button>`) + `
    <div class="section" style="padding-top:4px"><div class="row wrap" style="gap:8px"><h1 style="font-size:25px;font-weight:800;letter-spacing:-.02em;line-height:1.15">${U.esc(c.nombre)}</h1><span class="pill" title="${c.tamanoOrigen === 'ventas' ? 'Calculado con las ventas de ' + (c.clasificacion || '') : 'Tamaño'}">${U.tamanoLabel(c.tamano)}${c.tamanoOrigen === 'ventas' ? ' · ventas ' + (c.clasificacion || '') : ''}</span>${c.prospecto ? '<span class="pill violeta">Prospecto</span>' : ''}${c.inactivo ? '<span class="pill gris">Inactivo</span>' : ''}${c.codAgrup ? `<span class="pill">Cadena · ${U.esc(c.codAgrup)}</span>` : ''}${c.codigo ? `<span class="muted small">#${U.esc(c.codigo)}</span>` : ''}</div>
      <div class="card ${colorCard}"><div class="row">${UI.dot(e.key)}<div class="col"><div class="bold" style="font-size:17px">${frase}</div><div class="small bold" style="opacity:.85">${sub}</div></div></div></div>
      ${alertaSinPedidos(c, ultimos) ? `<div class="card ambar small bold">Sin pedidos desde hace ${Math.round(dSin / 30.4)} meses${ultPed ? '' : ' (ninguno registrado en la app)'}</div>` : ''}
      <div class="muted small bold">${ultPed ? `Último pedido ${haceTexto(U.daysSince(U.isoDate(new Date(ultPed))))} · ${U.fmtDate(ultPed, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Sin pedidos registrados en la app'}</div></div>
    <div class="section"><div class="row" style="align-items:flex-start">${I.svg(I.pin, 20)}<div class="col grow"><div class="bold">${U.esc(dir.l1) || '<span class="muted">Sin dirección</span>'}</div><div class="muted small">${U.esc(dir.l2)}${comarca ? ' · ' + U.esc(comarca) : ''}</div>${!c.lat ? `<button class="btn sm outline" data-go="ubicacion:${c.id}" style="margin-top:6px;align-self:flex-start">Situar en el mapa</button>` : (c.geocodeStatus === 'aprox' ? `<button class="btn sm outline" data-go="ubicacion:${c.id}" style="margin-top:6px;align-self:flex-start">Ubicación aproximada · corregir</button>` : '')}</div></div>
      ${tel || c.contacto ? `<button class="row" data-tel style="background:none;border:0;padding:0;text-align:left;color:inherit">${I.svg(I.phone, 20)}<div class="col grow"><span class="bold" style="color:var(--accent)">${U.esc([c.telefono, movil && movil !== c.telefono ? movil : ''].filter(Boolean).join(' · ') || 'Sin teléfono')}</span><span class="muted small">${U.esc(c.contacto || '')}${U.canal(c) ? (c.contacto ? ' · ' : '') + (U.canal(c) === 'whatsapp' ? 'WhatsApp' : 'SMS') : ''}</span></div></button>` : ''}
      <details><summary class="row" style="list-style:none;cursor:pointer">${I.svg(I.clock, 20)}<span class="small"><b>Hoy:</b> ${U.esc(horarioHoy)}</span><span class="muted small">· semana</span></summary><div class="col" style="gap:4px;padding:8px 0 0 32px">${semana}</div></details></div>
    <div class="section"><div class="row between"><div class="section-title">Tareas${tareas.length ? ' · ' + tareas.length : ''}</div><button class="btn sm outline" data-tarea>+ Tarea</button></div>
      ${tareas.length ? `<div class="card" style="padding:4px 16px">${tareas.sort((a, b) => (a.fecha || '9').localeCompare(b.fecha || '9')).map(t => tareaItem(t, {}, { conCliente: false })).join('')}</div>` : ''}</div>
    <div class="section"><div class="row between"><div class="section-title">Notas</div><button class="btn sm outline" data-nota>${c.nota ? 'Editar' : '+ Nota'}</button></div>
      ${c.nota ? `<div class="card" style="white-space:pre-wrap">${U.esc(c.nota)}</div>` : '<div class="muted small">Lo que hay que recordar: gustos, persona de contacto, qué preguntar la próxima vez.</div>'}</div>
    ${ventas ? `<div class="section"><div class="section-title">Ventas</div><div class="kpis">
      <div class="kpi"><span class="k">${U.esc(ventas.periodo)}</span><span class="v">${U.fmtEur(ventas.actual)}</span><span class="d">${ventas.pct == null ? '' : `${U.fmtPct(ventas.pct)} vs ${ventas.anio - 1} mismo periodo`}</span></div>
      <div class="kpi"><span class="k">Año ${ventas.anio - 1}</span><span class="v">${U.fmtEur(VENTAS.totalAnio(c.ventas, ventas.anio - 1))}</span><span class="d">${ventas.anterior == null ? 'sin datos' : ''}</span></div></div>
      ${VENTAS.grafico(c.ventas, { meses: 12 })}</div>` : ''}
    <div class="section"><div class="section-title">Últimas visitas</div>
      ${visitas.length ? visitas.slice(0, 8).map(v => `<div class="row" style="align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--line)"><div class="muted small bold" style="width:64px;flex-shrink:0">${U.fmtDate(v.fecha)}</div><div class="col grow"><div class="bold small">${RES[v.resultado] || v.resultado}${v.pedidoId ? ' · <a href="#" data-go="pedido:' + v.pedidoId + '">ver pedido</a>' : ''}</div>${v.nota ? `<div class="small" style="white-space:pre-wrap">${U.esc(v.nota)}</div>` : ''}</div></div>`).join('') : '<div class="muted small">Todavía sin visitas registradas.</div>'}</div>
    ${pedidos.length ? `<div class="section"><div class="section-title">Pedidos · ${pedidos.length}</div>${(st.todosPedidos ? pedidos : pedidos.slice(0, 5)).map(pedidoFila).join('')}${pedidos.length > 5 ? `<button class="btn outline" data-todos>${st.todosPedidos ? 'Ver solo los últimos' : `Ver todos (${pedidos.length})`}</button>` : ''}</div>` : ''}
    <div style="height:160px"></div>
    <div style="position:fixed;left:0;right:0;bottom:0;padding:10px 16px calc(14px + env(safe-area-inset-bottom,0px));background:var(--bg);border-top:1px solid var(--line);display:flex;flex-direction:column;gap:8px;z-index:3">
      <a class="btn primary big" href="${U.mapsUrl(c)}" target="_blank" rel="noopener">${I.svg(I.nav, 20)} Iniciar visita</a>
      <div class="btn-row"><button class="btn" data-ruta>Añadir a ruta</button><button class="btn" data-visita>Registrar visita</button><button class="btn" data-go="pedido:nuevo-${c.id}">Pedido</button></div></div>`, { nav: false });
  wireBack(el); wireGo(el); wireTareas(el); VENTAS.wireGrafico(el);
  el.querySelector('[data-nota]').onclick = async () => { const v = await promptNota('Notas del cliente', c.nota || ''); if (v != null) { c.nota = v; await DB.save('clientes', c); } };
  el.querySelector('[data-tarea]').onclick = () => sheetTarea({ clienteId: c.id });
  el.querySelector('[data-tel]')?.addEventListener('click', () => sheetTelefono(c));
  el.querySelector('[data-todos]')?.addEventListener('click', () => { st.todosPedidos = !st.todosPedidos; APP.render(); });
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

/* ---------- registrar visita (con tarea opcional para después) ---------- */
async function sheetVisita(clienteId, { rutaId = null } = {}) {
  const c = await DB.cliente(clienteId); if (!c) return;
  let resultado = null, fTarea = 'manana';
  const s = UI.sheet(`<div class="grip"></div><h2>Registrar visita</h2><div class="muted bold">${U.esc(c.nombre)}</div>
    <div class="seg c2" id="res">
      <button class="big" data-r="pedido"><span style="font-size:22px">🛒</span>Pedido</button><button class="big" data-r="revisar"><span style="font-size:22px">🔁</span>A revisar</button>
      <button class="big" data-r="no_interesado"><span style="font-size:22px">✋</span>Sin interés</button><button class="big" data-r="ausente"><span style="font-size:22px">🚪</span>Ausente</button></div>
    <div class="muted small" id="hint">«Ausente» no cuenta como visita: el plazo sigue corriendo.</div>
    <div class="field"><label for="vn">Nota (opcional)</label><div class="row"><textarea id="vn" class="grow" placeholder="Qué ha pasado, qué preguntar la próxima vez…"></textarea>${UI.micBtn('vn')}</div></div>
    <div class="field"><label for="vt">Tarea para después (opcional)</label><div class="row"><textarea id="vt" class="grow" style="min-height:56px" placeholder="Ej.: enviar presupuesto"></textarea>${UI.micBtn('vt')}</div>
      <div class="seg c3" id="vtf"><button type="button" data-f="hoy">Hoy</button><button type="button" data-f="manana" class="on">Mañana</button><button type="button" data-f="sin">Sin fecha</button></div></div>
    <button class="btn primary big" data-ok disabled>Guardar visita</button>`);
  UI.wireMics(s);
  const ok = s.querySelector('[data-ok]');
  s.querySelectorAll('#vtf button').forEach(b => b.onclick = () => { fTarea = b.dataset.f; s.querySelectorAll('#vtf button').forEach(x => x.classList.toggle('on', x === b)); });
  s.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { resultado = b.dataset.r; s.querySelectorAll('[data-r]').forEach(x => x.classList.toggle('on', x === b)); ok.disabled = false; ok.textContent = resultado === 'pedido' ? 'Continuar con el pedido' : 'Guardar visita'; });
  ok.onclick = async () => {
    if (ok.disabled) return;
    ok.disabled = true; // evita guardar dos veces con un doble toque
    const nota = s.querySelector('#vn').value.trim(), texto = s.querySelector('#vt').value.trim();
    if (texto) {
      const fecha = fTarea === 'hoy' ? U.today() : fTarea === 'manana' ? U.isoDate(new Date(Date.now() + 86400000)) : null;
      await DB.save('tareas', { id: U.uuid(), texto, fecha, clienteId: c.id, hechaAt: null });
    }
    if (resultado === 'pedido') { APP.go('pedido', { id: 'nuevo-' + c.id, nota, rutaId }); return; }
    await DB.registrarVisita({ clienteId: c.id, resultado, nota });
    const info = await APP.marcarParadaHecha(rutaId, c.id); // sin rutaId: la ruta de hoy, si el cliente está en ella
    await UI.closeSheet(); UI.toast(resultado === 'ausente' ? 'Anotado: ausente' : 'Visita guardada' + (texto ? ' · tarea anotada' : ''));
    APP.avisoRuta(info);
  };
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
    const b = e.currentTarget; b.disabled = true;
    if (!c.lat) { UI.toast('Este cliente no tiene ubicación: sitúalo en el mapa primero'); b.disabled = false; return; }
    const { ruta, yaEstaba, sinCambios } = await APP.anadirARuta(c.id, { horaFija: fija ? s.querySelector('#ah').value : null, duracion: dur, fecha });
    await UI.closeSheet();
    const dia = fecha === hoy ? 'de hoy' : 'del ' + U.fmtDate(fecha);
    if (sinCambios) UI.toast(`Ya está en la ruta ${dia} y la visita está hecha`);
    else if ((ruta.noCaben || []).includes(c.id)) UI.toast(`${yaEstaba ? 'Actualizado en' : 'Añadido a'} la ruta ${dia}, pero no cabe en el horario`, 4000);
    else UI.toast(yaEstaba ? `Ya estaba en la ruta ${dia}: hora y duración actualizadas` : `Añadido a la ruta ${dia}`);
  };
}

/* ======================= PEDIDO =======================
   Nuevo: se escribe y se «Valida». Validado: se abre en lectura; «Modificar» pasa a edición (Guardar cambios / Cancelar,
   Eliminar solo ahí) y salir con cambios sin guardar pide confirmación. */
SCREENS.pedido = async ({ id, nota, rutaId, editar }) => {
  let p, c, nuevo = false;
  if (String(id).startsWith('nuevo-')) {
    nuevo = true; c = await DB.cliente(id.slice(6));
    if (!c || c.deleted) { const v = screen(topbar('Nuevo pedido') + '<div class="empty">Cliente no encontrado</div>', { nav: false }); wireBack(v); return v; }
    p = { id: U.uuid(), clienteId: c.id, fecha: U.now(), lineas: [], nota: '' };
  } else {
    p = await db.pedidos.get(id);
    if (!p || p.deleted) { const v = screen(topbar('Pedido') + '<div class="empty">Pedido no encontrado</div>', { nav: false }); wireBack(v); return v; }
    c = (await DB.cliente(p.clienteId)) || { id: p.clienteId, nombre: '(cliente eliminado)', localidad: '' };
  }
  const fechaTxt = U.fmtDate(p.fecha, { day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' + new Date(p.fecha).toTimeString().slice(0, 5);
  const cab = `<div class="section" style="padding-top:4px"><div class="bold" style="font-size:21px">${U.esc(c.nombre)}</div><div class="muted small">${U.esc(c.localidad || '')} · ${fechaTxt}${p.modificadoAt ? ` · <b>modificado el ${U.fmtDate(p.modificadoAt, { day: 'numeric', month: 'short' })} a las ${new Date(p.modificadoAt).toTimeString().slice(0, 5)}</b>` : ''}</div></div>`;
  const totTxt = () => { const t = totalPedido(p), sinPrecio = (p.lineas || []).some(l => l.precio == null); return `${udsPedido(p)} uds${t ? ' · ' + U.fmtEur(t, 2) : ''}${sinPrecio && t ? ' (parcial)' : ''}`; };

  // ---- lectura
  if (!nuevo && !editar) {
    const el = screen(topbar('Pedido', `<button class="iconbtn" data-share aria-label="Compartir este pedido">${I.svg(I.share, 20)}</button>`) + cab + `
      <div class="section"><div class="section-title">Líneas · ${(p.lineas || []).length}</div>
        ${(p.lineas || []).map(l => `<div class="oline"><div class="t"><div class="ti" style="white-space:normal">${U.esc(l.titulo)}</div><div class="ref">${U.esc(l.ref || '')}${l.precio != null ? ` · ${U.fmtEur(l.precio, 2)}` : ''}</div></div><div class="bold" style="font-size:17px">× ${l.cantidad}</div></div>`).join('')}</div>
      ${p.nota ? `<div class="section"><div class="section-title">Nota</div><div class="card" style="white-space:pre-wrap">${U.esc(p.nota)}</div></div>` : ''}
      <div class="section"><div class="row between"><div class="muted bold">Total</div><div class="bold">${totTxt()}</div></div>
        <button class="btn primary big" data-editar>${I.svg(I.edit, 20)} Modificar</button>
        <button class="btn big" data-share2>${I.svg(I.share, 20)} Compartir este pedido (Excel)</button>
        ${c.id ? `<button class="btn outline" data-go="ficha:${c.id}">Ver ficha del cliente</button>` : ''}</div>`, { nav: false });
    wireBack(el); wireGo(el);
    const compartir = async () => { const byId = { [c.id]: c }; await XIO.compartir(XIO.pedidosXlsx([p], byId), `pedido_${U.isoDate(new Date(p.fecha))}_${U.norm(c.nombre).replace(/[^a-z0-9]+/g, '-').slice(0, 30)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Pedido ' + c.nombre); };
    el.querySelector('[data-share]').onclick = compartir; el.querySelector('[data-share2]').onclick = compartir;
    el.querySelector('[data-editar]').onclick = () => APP.go('pedido', { id: p.id, editar: 1 }, true);
    return el;
  }

  // ---- edición (nuevo o «Modificar»)
  const original = JSON.stringify({ lineas: p.lineas, nota: p.nota || '' });
  p = JSON.parse(JSON.stringify(p)); // se trabaja sobre una copia: «Cancelar» no deja rastro
  const catalogo = await DB.catalogo();
  const catN = catalogo.map(k => ({ k, n: U.norm(k.titulo + ' ' + k.ref + ' ' + (k.autor || '') + ' ' + (k.editorial || '')) }));
  const el = screen(topbar(nuevo ? 'Nuevo pedido' : 'Modificar pedido') + cab + `
    <div class="section"><div class="section-title">Añadir artículo</div>
      <div class="search" style="margin:0">${I.svg(I.search, 20)}<input id="q" placeholder="${catalogo.length ? 'Título, referencia o ISBN' : 'Sin catálogo: escribe el título'}" autocomplete="off"></div>
      <div class="results hidden" id="res"></div>
      <button class="btn sm outline" data-libre style="align-self:flex-start">+ Línea libre</button></div>
    <div class="section"><div class="section-title">Líneas · <span id="nl">${p.lineas.length}</span></div><div id="lineas"></div></div>
    <div class="section"><div class="field"><label for="pn">Nota del pedido</label><div class="row"><textarea id="pn" class="grow" placeholder="Entrega, condiciones, observaciones…">${U.esc(p.nota || nota || '')}</textarea>${UI.micBtn('pn')}</div></div></div>
    <div class="section"><div class="row between"><div class="muted bold">Total</div><div class="bold" id="tot"></div></div>
      <button class="btn primary big" data-ok>${nuevo ? 'Validar pedido' : 'Guardar cambios'}</button>
      ${nuevo ? '' : '<div class="btn-row"><button class="btn" data-cancelar>Cancelar</button><button class="btn danger" data-del>Eliminar pedido</button></div>'}</div>`, { nav: false, static: true });
  UI.wireMics(el);
  const sucio = () => JSON.stringify({ lineas: p.lineas, nota: el.querySelector('#pn').value.trim() }) !== (nuevo ? JSON.stringify({ lineas: [], nota: (nota || '').trim() }) : original);
  // salir: si hay cambios, se pregunta (también con el botón Atrás del móvil, ver APP._salida)
  const salir = () => (nuevo ? APP.back() : APP.go('pedido', { id: p.id }, true));
  const salirConfirmando = async () => { if (!sucio() || await UI.confirm('¿Descartar cambios?', 'Los cambios de este pedido no se guardarán.', { ok: 'Descartar', danger: true })) { APP._salida = null; salir(); } };
  el.querySelector('[data-back]').onclick = salirConfirmando;
  el.querySelector('[data-cancelar]')?.addEventListener('click', salirConfirmando);
  APP._salida = { sucio };
  const lineasEl = el.querySelector('#lineas');
  const pintar = () => {
    el.querySelector('#nl').textContent = p.lineas.length;
    lineasEl.innerHTML = p.lineas.length ? p.lineas.map((l, i) => `<div class="oline"><div class="t"><div class="ti">${U.esc(l.titulo)}</div><div class="ref">${U.esc(l.ref || '')}${l.precio != null ? ` · ${U.fmtEur(l.precio, 2)}` : ''}</div></div>${UI.stepper(i, l.cantidad)}<button class="iconbtn flat" data-rm="${i}" aria-label="Quitar">${I.svg(I.x, 18)}</button></div>`).join('') : '<div class="muted small">Busca en el catálogo o añade una línea libre.</div>';
    el.querySelector('#tot').textContent = totTxt();
    lineasEl.querySelectorAll('[data-stepper]').forEach(st => st.querySelectorAll('button').forEach(b => b.onclick = () => { const i = +st.dataset.stepper; p.lineas[i].cantidad = Math.max(1, p.lineas[i].cantidad + (+b.dataset.d)); pintar(); }));
    lineasEl.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { p.lineas.splice(+b.dataset.rm, 1); pintar(); });
  };
  pintar();
  const q = el.querySelector('#q'), res = el.querySelector('#res');
  const addLinea = (l) => { const ex = p.lineas.find(x => x.ref && x.ref === l.ref); if (ex) ex.cantidad++; else p.lineas.push(l); q.value = ''; res.classList.add('hidden'); pintar(); };
  q.addEventListener('input', () => {
    const t = U.norm(q.value); if (!t) { res.classList.add('hidden'); return; }
    const hits = catN.filter(x => x.n.includes(t)).slice(0, 20);
    res.innerHTML = hits.map((h, i) => `<button data-i="${i}"><span class="bold">${U.esc(h.k.titulo)}</span><span class="muted small">${U.esc(h.k.ref)}${h.k.autor ? ' · ' + U.esc(h.k.autor) : ''}${h.k.precio != null ? ' · ' + U.fmtEur(h.k.precio, 2) : ''}</span></button>`).join('') + `<button data-i="libre"><span class="bold">+ «${U.esc(q.value)}» como línea libre</span></button>`;
    res.classList.remove('hidden');
    res.querySelectorAll('button').forEach(b => b.onclick = () => { if (b.dataset.i === 'libre') addLinea({ ref: '', titulo: q.value.trim(), cantidad: 1, precio: null }); else { const k = hits[+b.dataset.i].k; addLinea({ ref: k.ref, titulo: k.titulo, cantidad: 1, precio: k.precio }); } });
  });
  el.querySelector('[data-libre]').onclick = async () => { const t = await UI.prompt('Línea libre', { placeholder: 'Título o descripción', ok: 'Añadir' }); if (t && t.trim()) addLinea({ ref: '', titulo: t.trim(), cantidad: 1, precio: null }); };
  el.querySelector('[data-ok]').onclick = async e => {
    if (!p.lineas.length) { UI.toast('Añade al menos un artículo'); return; }
    const b = e.currentTarget; if (b.disabled) return; b.disabled = true;
    p.nota = el.querySelector('#pn').value.trim();
    if (!nuevo && JSON.stringify({ lineas: p.lineas, nota: p.nota }) !== original) p.modificadoAt = U.now();
    delete p.enviado; delete p.enviadoAt; // ya no se sigue el envío
    await DB.save('pedidos', p); APP._salida = null;
    if (nuevo) {
      await DB.registrarVisita({ clienteId: c.id, resultado: 'pedido', nota: nota || '', pedidoId: p.id });
      const info = await APP.marcarParadaHecha(rutaId, c.id);
      UI.toast('Pedido validado');
      // abierto desde la ficha del mismo cliente: se vuelve a ella (sin duplicarla en el historial)
      const prev = history.state && history.state.prev;
      if (prev && prev.name === 'ficha' && prev.params && prev.params.id === c.id) APP.back(); else APP.go('ficha', { id: c.id }, true);
      setTimeout(() => APP.avisoRuta(info), 400);
    } else { UI.toast('Cambios guardados'); APP.go('pedido', { id: p.id }, true); }
  };
  el.querySelector('[data-del]')?.addEventListener('click', async () => { if (await UI.confirm('¿Eliminar este pedido?', 'Se borra de la lista de pedidos.', { ok: 'Eliminar', danger: true })) { await DB.softDelete('pedidos', p.id); APP._salida = null; UI.toast('Pedido eliminado'); APP.go('pedidos', {}, true); } });
  return el;
};

/* ======================= PEDIDOS ======================= */
SCREENS.pedidos = async () => {
  const st = SCREENS._pd = SCREENS._pd || { vista: 'hoy', q: '' };
  if (st.vista === 'pendientes') st.vista = 'hoy';
  const [todos, byId] = await Promise.all([db.pedidos.toArray(), clientesById()]);
  const vivos = todos.filter(p => !p.deleted).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const hoy = U.today(), ahora = new Date();
  const diaDe = p => U.isoDate(new Date(p.fecha)); // fecha guardada en UTC: se agrupa por el día local
  const lunes = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - (ahora.getDay() + 6) % 7);
  const rangos = { hoy: [hoy, hoy], semana: [U.isoDate(lunes), hoy], mes: [hoy.slice(0, 8) + '01', hoy] };
  if (!st.desde) { st.desde = rangos.mes[0]; st.hasta = hoy; }
  if (st.vista === 'rango' && st.desde > st.hasta) [st.desde, st.hasta] = [st.hasta, st.desde];
  const r = st.vista === 'rango' ? [st.desde, st.hasta] : rangos[st.vista];
  const enRango = vivos.filter(p => { const d = diaDe(p); return !r || (d >= r[0] && d <= r[1]); });
  const busc = Object.fromEntries(Object.values(byId).map(c => [c.id, U.norm(c.nombre + ' ' + (c.localidad || ''))]));
  const el = screen(`<div class="hdr"><div class="hdr-row"><h1>Pedidos</h1><div class="muted bold">${vivos.length}</div></div></div>
    <div class="search">${I.svg(I.search, 20)}<input id="pq" type="search" placeholder="Buscar por cliente" value="${U.esc(st.q)}" autocomplete="off"></div>
    <div class="chips">${[['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['rango', 'Fechas…'], ['todos', 'Todos']].map(([k, l]) => `<button class="chip ${st.vista === k ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div>
    ${st.vista === 'rango' ? `<div class="section" style="padding-top:4px"><div class="field-row"><div class="field"><label for="pdd">Desde</label><input type="date" id="pdd" value="${st.desde}" max="${hoy}"></div><div class="field"><label for="pdh">Hasta</label><input type="date" id="pdh" value="${st.hasta}"></div></div></div>` : ''}
    <div id="pdres"></div>`);
  const res = el.querySelector('#pdres');
  let lista = [];
  // la búsqueda filtra en memoria y solo repinta la lista (el campo de texto no se toca)
  const pintar = () => {
    const qn = U.norm(st.q);
    lista = qn ? enRango.filter(p => (busc[p.clienteId] || '').includes(qn)) : enRango;
    const importe = lista.reduce((s, p) => s + totalPedido(p), 0), unidades = lista.reduce((s, p) => s + udsPedido(p), 0);
    let html = '', dia = null;
    for (const p of lista.slice(0, 300)) {
      const d = diaDe(p); if (d !== dia) { dia = d; html += `<div class="group-title">${d === hoy ? 'Hoy' : U.fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' })}</div>`; }
      const c = byId[p.clienteId] || { nombre: '(cliente eliminado)' };
      html += `<button class="item" data-go="pedido:${p.id}"><div class="col grow"><div class="name">${U.esc(c.nombre)}</div><div class="meta">${(p.lineas || []).length} líneas · ${udsPedido(p)} uds · ${new Date(p.fecha).toTimeString().slice(0, 5)}${p.modificadoAt ? ' · modificado' : ''}${p.nota ? ' · ' + U.esc(p.nota.slice(0, 40)) : ''}</div></div><div class="right">${totalPedido(p) ? U.fmtEur(totalPedido(p)) : ''}</div></button>`;
    }
    res.innerHTML = `${lista.length ? `<div class="section" style="padding-top:4px"><div class="muted small bold">${lista.length} pedido${lista.length === 1 ? '' : 's'} · ${unidades} uds${importe ? ' · ' + U.fmtEur(importe, 2) : ''}</div>
      <button class="btn primary big" data-exportar>${I.svg(I.share, 20)} Exportar Excel · ${lista.length} pedido${lista.length === 1 ? '' : 's'}</button><div class="muted small center">Se abre el menú de compartir del móvil (WhatsApp, Gmail, Drive…)</div></div>` : ''}
      <div class="list">${html || '<div class="empty">No hay pedidos aquí</div>'}${lista.length > 300 ? `<div class="empty">Se muestran 300 de ${lista.length} pedidos · elige un rango de fechas para ver el resto (el Excel los incluye todos)</div>` : ''}</div>`;
    wireGo(res);
    res.querySelector('[data-exportar]')?.addEventListener('click', async e => {
      const btn = e.currentTarget; if (btn.disabled) return; btn.disabled = true;
      // se exporta exactamente la selección (filtro y búsqueda), en orden cronológico; no se marca nada
      const sel = [...lista].sort((a, b) => a.fecha.localeCompare(b.fecha));
      const sufijo = st.vista === 'todos' ? 'todos_' + hoy : r[0] === r[1] ? r[0] : `${r[0]}_a_${r[1]}`;
      await XIO.compartir(XIO.pedidosXlsx(sel, byId), `pedidos_${sufijo}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Pedidos ' + sufijo.replace(/_/g, ' '));
      btn.disabled = false;
    });
  };
  pintar();
  el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { st.vista = b.dataset.v; APP.render(); });
  el.querySelector('#pq').addEventListener('input', U.debounce(e => { st.q = e.target.value; pintar(); }, 150));
  requestAnimationFrame(() => { const on = el.querySelector('.chips .chip.on'); if (on) on.parentElement.scrollLeft = on.offsetLeft - 20; });
  [['pdd', 'desde'], ['pdh', 'hasta']].forEach(([id, k]) => el.querySelector('#' + id)?.addEventListener('change', e => { if (e.target.value) { st[k] = e.target.value; APP.render(); } }));
  return el;
};

/* ======================= MAPA ======================= */
SCREENS.mapa = async (params) => {
  const clientes = await DB.clientes();
  const st = SCREENS._mp = SCREENS._mp || { off: new Set(), view: null, zona: '', porZona: false };
  const LEY = [['rojo', 'Fuera de plazo'], ['ambar', 'Próximos'], ['verde', 'Al día'], ['azul', 'Sin visitar'], ['prospecto', 'Prospectos'], ['inactivo', 'Inactivos']];
  const el = screen(`<div class="map-screen"><div class="map-wrap"><div class="map full" id="bigMap"></div>
    <div class="map-overlay"><select class="sel legend-chip" id="mz" aria-label="Zona" style="height:34px">${ZONAS.opciones(clientes, st.zona)}</select>${ZONAS.lista().length ? `<button class="legend-chip ${st.porZona ? '' : 'off'}" data-porzona>Color por zona</button>` : ''}
      ${LEY.map(([k, l]) => `<button class="legend-chip ${st.off.has(k) ? 'off' : ''}" data-k="${k}">${UI.dot(k)}${l}</button>`).join('')}</div>
    <button class="map-fab" data-loc aria-label="Mi ubicación">${I.svg(I.locate, 22)}</button></div></div>`);
  el.classList.add('flush'); el.style.paddingBottom = 'calc(var(--nav-h) + env(safe-area-inset-bottom, 0px))';
  el._afterMount = async () => {
    const map = UI.map(el.querySelector('#bigMap'));
    el._cleanup = () => map.remove();
    const grupo = L.layerGroup().addTo(map);
    const pintar = () => {
      grupo.clearLayers();
      for (const c of clientes) {
        if (!c.lat || !ZONAS.cumple(c, st.zona)) continue; const e = U.estado(c); if (st.off.has(e.key)) continue;
        const zc = st.porZona ? ZONAS.color(c) : null;
        const icon = zc ? L.divIcon({ className: '', html: `<div class="pin zona" style="background:${zc}"></div>`, iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -12] }) : UI.pin(e.key);
        const m = L.marker([c.lat, c.lng], { icon }).addTo(grupo);
        const zonas = ZONAS.de(c).map(z => z.nombre).join(', ');
        m.bindPopup(`<div class="popup"><div class="name">${U.esc(c.nombre)}</div><div class="meta">${U.esc(c.localidad || '')} · ${U.tamanoLabel(c.tamano)} · ${e.key === 'prospecto' || e.key === 'inactivo' ? e.label : e.dias == null ? 'sin visitar' : e.dias + ' días sin visita'}${zonas ? ' · ' + U.esc(zonas) : ''}</div><div class="row" style="gap:6px"><button class="btn primary" data-go="ficha:${c.id}">Ficha</button><button class="btn" data-ar="${c.id}">Añadir a ruta</button></div></div>`);
      }
    };
    map.on('popupopen', ev => { const n = ev.popup.getElement(); wireGo(n); n.querySelectorAll('[data-ar]').forEach(b => b.onclick = () => { const c = clientes.find(x => x.id === b.dataset.ar); map.closePopup(); sheetAnadirRuta(c); }); });
    map.on('moveend', () => { st.view = { c: map.getCenter(), z: map.getZoom() }; });
    pintar();
    const pts = clientes.filter(c => c.lat).map(c => [c.lat, c.lng]);
    if (st.view && !params.cerca) map.setView(st.view.c, st.view.z); else if (pts.length) map.fitBounds(pts, { padding: [30, 30] }); else map.setView([41.6, 1.9], 8);
    el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { const k = b.dataset.k; st.off.has(k) ? st.off.delete(k) : st.off.add(k); b.classList.toggle('off', st.off.has(k)); pintar(); });
    el.querySelector('#mz').onchange = e => { st.zona = e.target.value; pintar(); const z = clientes.filter(c => c.lat && ZONAS.cumple(c, st.zona)).map(c => [c.lat, c.lng]); if (z.length) map.fitBounds(z, { padding: [30, 30], maxZoom: 13 }); };
    el.querySelector('[data-porzona]')?.addEventListener('click', e => { st.porZona = !st.porZona; e.currentTarget.classList.toggle('off', !st.porZona); pintar(); });
    const localizar = async () => {
      try {
        UI.toast('Buscando tu ubicación…', 1500);
        const p = await GEO.miUbicacion();
        L.circleMarker([p.lat, p.lng], { radius: 9, color: APP.cssVar('--surface-pin'), weight: 3, fillColor: APP.cssVar('--azul'), fillOpacity: 1 }).addTo(map);
        map.setView([p.lat, p.lng], 12);
        const cerca = clientes.filter(c => c.lat && U.haversineKm(p, c) <= 10).map(c => ({ c, km: U.haversineKm(p, c) })).sort((a, b) => a.km - b.km);
        const n = { rojo: 0, ambar: 0, verde: 0, azul: 0, prospecto: 0, inactivo: 0 }; cerca.forEach(x => n[U.estado(x.c).key]++);
        const s = UI.sheet(`<div class="grip"></div><h2>Clientes a menos de 10 km</h2><div class="row wrap" style="gap:8px"><span class="pill rojo">${n.rojo} fuera de plazo</span><span class="pill ambar">${n.ambar} próximos</span><span class="pill verde">${n.verde} al día</span>${n.prospecto ? `<span class="pill violeta">${n.prospecto} prospectos</span>` : ''}</div>
          <div class="list" style="padding:0">${cerca.length ? cerca.slice(0, 30).map(x => clienteItem(x.c, x.km.toFixed(1) + ' km')).join('') : '<div class="empty">Ningún cliente cerca</div>'}</div>`);
        wireGo(s);
      } catch (e) { UI.toast('No se pudo obtener la ubicación'); }
    };
    el.querySelector('[data-loc]').onclick = localizar;
    if (params.cerca) { params.cerca = false; localizar(); }
  };
  return el;
};
