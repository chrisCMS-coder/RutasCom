/* Arranque, navegación y lógica compartida (rutas, geocodificación en cola). */
const APP = {
  VERSION: '1.0.0',
  state: { name: 'hoy', params: {} },
  TABS: [['hoy', 'Hoy', I.home], ['clientes', 'Clientes', I.users], ['mapa', 'Mapa', I.map], ['rutas', 'Rutas', I.route], ['pedidos', 'Pedidos', I.box]],
  ajustes: {},
  installPrompt: null,

  async init() {
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { }
    await APP.cargarAjustes();
    window.addEventListener('popstate', () => {
      if (UI._ignorePop) { UI._ignorePop = false; return; }
      if (UI._sheet) { UI._sheet.el.remove(); const s = UI._sheet; UI._sheet = null; if (s.onClose) s.onClose(); if (APP._dirty) { APP._dirty = false; APP.render(); } return; }
      const st = history.state && history.state.name ? history.state : { name: 'hoy', params: {} };
      APP.state = st; APP.render();
    });
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); APP.installPrompt = e; });
    DB.onChange(U.debounce(() => { if (document.querySelector('#app .screen[data-static]')) return; if (!UI._sheet) APP.render(); else APP._dirty = true; }, 150));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { SYNC.programar(500); APP.render(); } });
    history.replaceState({ name: 'hoy', params: {} }, '');
    APP.render();
    SYNC.init();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          nw && nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) UI.toast('Nueva versión lista: cierra y vuelve a abrir la app', 5000); });
        });
      }).catch(e => console.warn('sw', e));
    }
  },
  async cargarAjustes() {
    const def = {
      origen: { nombre: 'Barcelona', lat: 41.3874, lng: 2.1686 }, salida: '08:30', limite: '18:00', duracion: 30, frecuenciaDias: 30,
      horario: { abre: '09:30', cierra: '20:00', cierraMediodia: true, mediodiaDe: '13:30', mediodiaA: '17:00', lunesCerrado: false, cierraSabado: false },
      nombre: '',
    };
    const a = await DB.get('ajustes', {});
    APP.ajustes = Object.assign({}, def, a, { horario: Object.assign({}, def.horario, a.horario || {}) });
  },
  async guardarAjustes(patch) { Object.assign(APP.ajustes, patch); await DB.set('ajustes', APP.ajustes); },

  go(name, params = {}, replace = false) {
    if (UI._sheet) { UI.closeSheet(true); if (history.state && history.state.sheet) replace = true; }
    APP.state = { name, params };
    if (replace) history.replaceState(APP.state, ''); else history.pushState(APP.state, '');
    APP.render();
    document.querySelector('.screen')?.scrollTo(0, 0);
  },
  back() { if (history.length > 1) history.back(); else APP.go('hoy', {}, true); },
  tab(name) { APP.go(name, {}, APP.TABS.some(t => t[0] === APP.state.name)); },

  async render() {
    const { name, params } = APP.state;
    const fn = SCREENS[name] || SCREENS.hoy;
    const app = document.getElementById('app');
    const scroll = app.querySelector('.screen')?.scrollTop || 0;
    let el;
    try { el = await fn(params); } catch (e) { console.error(e); el = UI.el(`<div class="screen"><div class="empty">Error: ${U.esc(e.message)}</div></div>`); }
    if (APP.state.name !== name) return; // navegó mientras cargaba
    app.replaceChildren(el);
    if (APP.TABS.some(t => t[0] === name)) app.appendChild(await APP.nav(name));
    if (el.classList.contains('screen') && scroll && APP._lastName === name) el.scrollTop = scroll;
    APP._lastName = name;
    if (el._afterMount) el._afterMount();
  },
  async nav(active) {
    const pend = (await DB.pedidosPendientes()).length;
    const nav = UI.el(`<nav class="tabs">${APP.TABS.map(([k, label, icon]) => `<button class="${k === active ? 'on' : ''}" data-tab="${k}">${I.svg(icon, 22, k === active ? 2.2 : 2)}${label}${k === 'pedidos' && pend ? `<span class="badge">${pend}</span>` : ''}</button>`).join('')}</nav>`);
    nav.querySelectorAll('button').forEach(b => b.onclick = () => APP.tab(b.dataset.tab));
    return nav;
  },

  /* ---------- rutas: planificación ---------- */
  async replanRuta(ruta, { desdeAhora = false } = {}) {
    const clientes = await DB.clientes(); const byId = Object.fromEntries(clientes.map(c => [c.id, c]));
    const hechas = ruta.paradas.filter(p => p.hecho);
    const pendientes = ruta.paradas.filter(p => !p.hecho && byId[p.clienteId] && byId[p.clienteId].lat);
    const sinCoord = ruta.paradas.filter(p => !p.hecho && !(byId[p.clienteId] && byId[p.clienteId].lat));
    const dow = U.parseDate(ruta.fecha).getDay();
    let inicio = ruta.origen, salida = U.parseTime(ruta.salida);
    if (hechas.length) {
      const last = byId[hechas[hechas.length - 1].clienteId]; if (last && last.lat) inicio = { nombre: last.nombre, lat: last.lat, lng: last.lng };
      salida = Math.max(salida, hechas[hechas.length - 1].fin || salida);
    }
    if (desdeAhora && ruta.fecha === U.today()) { const n = new Date(); salida = Math.max(salida, n.getHours() * 60 + n.getMinutes()); }
    const stops = pendientes.map(p => { const c = byId[p.clienteId]; let hf = p.horaFija != null ? U.parseTime(p.horaFija) : null; if (hf != null && hf + 10 < salida) hf = null; /* cita ya pasada: se trata como visita normal */
      return { id: c.id, lat: c.lat, lng: c.lng, horaFija: hf, duracion: p.duracion || ruta.duracion || APP.ajustes.duracion, ventanas: ROUTE.ventanas(c.horario, APP.ajustes.horario, dow) }; });
    const points = [inicio, ...stops, ruta.destino];
    const m = stops.length ? await GEO.matrix(points) : { dur: [[0, 0], [0, 0]], dist: [[0, 0], [0, 0]], estimado: false };
    const r = stops.length ? ROUTE.planificar(stops, { salida, limite: U.parseTime(ruta.limite), dur: m.dur, dist: m.dist }) : { orden: [], plan: [], km: 0, conduccion: 0, fin: salida, ok: true, noCaben: [] };
    const nuevas = r.plan.map(pl => { const p = pendientes[pl.i]; return Object.assign({}, p, { llegada: pl.llegada, inicio: pl.inicio, fin: pl.fin, viaje: pl.viaje }); });
    ruta.paradas = [...hechas, ...nuevas];
    ruta.noCaben = r.noCaben.map(i => pendientes[i].clienteId).concat(sinCoord.map(p => p.clienteId));
    ruta.km = r.km; ruta.conduccion = r.conduccion; ruta.fin = r.fin; ruta.ok = r.ok; ruta.estimado = m.estimado;
    await DB.save('rutas', ruta);
    return ruta;
  },
  async nuevaRutaBase(fecha) {
    const a = APP.ajustes;
    return { id: U.uuid(), fecha: fecha || U.today(), origen: a.origen, destino: a.origen, salida: a.salida, limite: a.limite, duracion: a.duracion, paradas: [], noCaben: [] };
  },
  /* Añade un cliente a la ruta de hoy (creándola si no existe) */
  async anadirARuta(clienteId, { horaFija = null, duracion = null, fecha = null } = {}) {
    fecha = fecha || U.today();
    let ruta = await DB.rutaDelDia(fecha);
    if (!ruta) ruta = await APP.nuevaRutaBase(fecha);
    if (ruta.paradas.some(p => p.clienteId === clienteId)) { UI.toast('Ya está en la ruta'); return ruta; }
    ruta.paradas.push({ clienteId, horaFija, duracion: duracion || ruta.duracion, hecho: false });
    await APP.replanRuta(ruta);
    return ruta;
  },

  /* ---------- geocodificación en cola ---------- */
  geo: { activo: false, hechos: 0, total: 0, parar: false },
  async geocodificarPendientes(onProgress) {
    if (APP.geo.activo) return;
    const pend = (await DB.clientes()).filter(c => !c.lat && c.geocodeStatus !== 'fallo' && c.geocodeStatus !== 'manual');
    APP.geo = { activo: true, hechos: 0, total: pend.length, parar: false };
    for (const c of pend) {
      if (APP.geo.parar || !navigator.onLine) break;
      try {
        const r = await GEO.geocode(c);
        if (r) { c.lat = r.lat; c.lng = r.lng; c.geocodeStatus = r.precision === 'localidad' ? 'aprox' : 'ok'; }
        else c.geocodeStatus = 'fallo';
      } catch (e) { c.geocodeStatus = 'fallo'; }
      await db.clientes.put(c); await db.outbox.put({ kind: 'clientes', id: c.id, at: U.now() });
      APP.geo.hechos++; if (onProgress) onProgress(APP.geo);
    }
    APP.geo.activo = false; DB.changed('clientes');
    return APP.geo;
  },

  /* ---------- datos de prueba ---------- */
  async cargarDemo() {
    const r = await fetch('data/demo-clientes.json'); const demo = await r.json();
    const recs = demo.map(d => Object.assign({}, d, { geocodeStatus: 'ok', demo: true, horario: d.horario || null }));
    await DB.bulkSave('clientes', recs);
    // algunas visitas y un pedido de ejemplo
    const vis = [];
    for (const c of recs.slice(0, 60)) if (c.ultimaVisita) vis.push({ id: U.uuid(), clienteId: c.id, fecha: c.ultimaVisita + 'T10:30:00', resultado: ['pedido', 'revisar', 'no_interesado', 'visita'][vis.length % 4], nota: ['Pedido pequeño de novedades.', 'Volver con el catálogo de otoño.', 'Sin interés este mes.', 'Visita rápida, todo en orden.'][vis.length % 4] });
    await DB.bulkSave('visitas', vis);
    const cat = [
      { ref: '9788400000011', titulo: 'El bosc de les paraules', autor: 'M. Vila', editorial: 'Demo', precio: 18.9 }, { ref: '9788400000028', titulo: 'Cuentos para dormir', autor: 'A. Serra', editorial: 'Demo', precio: 14.5 },
      { ref: '9788400000035', titulo: 'Atlas ilustrado de Catalunya', autor: 'VV.AA.', editorial: 'Demo', precio: 29.9 }, { ref: '9788400000042', titulo: 'La casa del far', autor: 'J. Pons', editorial: 'Demo', precio: 21 },
      { ref: '9788400000059', titulo: 'Recetas de temporada', autor: 'L. Mas', editorial: 'Demo', precio: 24.95 }, { ref: '9788400000066', titulo: 'Novela negra en Barcelona', autor: 'R. Font', editorial: 'Demo', precio: 19.5 },
      { ref: '9788400000073', titulo: 'Agenda escolar 2026-27', autor: '', editorial: 'Demo', precio: 9.95 }, { ref: '9788400000080', titulo: 'Diccionari escolar', autor: '', editorial: 'Demo', precio: 16 },
    ].map(x => Object.assign(x, { updatedAt: U.now() }));
    await db.catalogo.bulkPut(cat); await db.outbox.bulkPut(cat.map(c => ({ kind: 'catalogo', id: c.ref, at: U.now() })));
    await DB.set('demoCargada', true);
    DB.changed('all');
    return recs.length;
  },
};

document.addEventListener('DOMContentLoaded', () => APP.init());
