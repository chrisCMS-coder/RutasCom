/* Arranque, navegación y lógica compartida (rutas, geocodificación en cola). */
const APP = {
  VERSION: '1.3.1',
  state: { name: 'hoy', params: {} },
  TABS: [['hoy', 'Hoy', I.home], ['clientes', 'Clientes', I.users], ['mapa', 'Mapa', I.map], ['rutas', 'Rutas', I.route], ['pedidos', 'Pedidos', I.box]],
  ajustes: {},
  installPrompt: null,

  async init() {
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { }
    await APP.cargarAjustes();
    window.addEventListener('popstate', () => {
      if (UI._ignorePop) { UI._ignorePop = false; const r = UI._popResolve; UI._popResolve = null; if (r) r(); return; }
      if (UI._sheet) { UI._sheet.el.remove(); const s = UI._sheet; UI._sheet = null; if (s.onClose) s.onClose(); if (APP._dirty) { APP._dirty = false; APP.render(); } return; }
      const st = history.state && history.state.name ? history.state : { name: 'hoy', params: {} };
      APP.state = st; APP.render();
    });
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); APP.installPrompt = e; });
    DB.onChange(U.debounce(() => { if (document.querySelector('#app .screen[data-static]')) return; if (!UI._sheet) APP.render(); else APP._dirty = true; }, 150));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { APP._hiddenAt = Date.now(); return; }
      SYNC.programar(500);
      if (APP.pin && Date.now() - (APP._hiddenAt || 0) > 5 * 60 * 1000) APP.lock(); else APP.render();
    });
    history.replaceState({ name: 'hoy', params: {} }, '');
    await SYNC.init();
    if (SYNC.estado === 'sin-sesion') await APP.login();
    APP.pin = await DB.get('pin', null);
    if (APP.pin) await APP.lock();
    APP.render();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          nw && nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) UI.toast('Nueva versión lista: cierra y vuelve a abrir la app', 5000); });
        });
      }).catch(e => console.warn('sw', e));
    }
  },
  /* ---------- inicio de sesión (copia en línea), antes del PIN ---------- */
  async login() {
    const email = await DB.get('syncEmail', '');
    return new Promise(res => {
      const el = UI.el(`<div class="lock"><form class="pinpad" novalidate>
        <div class="col center" style="gap:6px;align-items:center"><div class="pin-title">Rutas Comerciales</div><div class="muted small" style="text-align:center">Inicia sesión para tener tus datos en todos tus dispositivos</div></div>
        <div class="field"><label for="le">Email</label><input id="le" type="email" autocomplete="username" value="${U.esc(email)}"></div>
        <div class="field"><label for="lp">Contraseña</label><input id="lp" type="password" autocomplete="current-password"></div>
        <div class="small" data-err style="color:var(--rojo);min-height:1.2em;text-align:center"></div>
        <button class="btn primary block" type="submit">Iniciar sesión</button>
        <button type="button" class="pin-foot hidden" data-offline style="background:none;border:0">Sin conexión · seguir con los datos de este dispositivo</button>
      </form></div>`);
      const err = el.querySelector('[data-err]'), off = el.querySelector('[data-offline]'), btn = el.querySelector('[type=submit]');
      const fin = () => { el.remove(); res(); };
      off.classList.toggle('hidden', navigator.onLine);
      off.onclick = fin;
      el.querySelector('form').onsubmit = async e => {
        e.preventDefault();
        const em = el.querySelector('#le').value.trim(), pw = el.querySelector('#lp').value;
        if (!em || !pw) { err.textContent = 'Escribe tu email y tu contraseña'; return; }
        btn.disabled = true; err.textContent = '';
        try { await SYNC.login(em, pw); fin(); }
        catch (x) {
          if (SYNC.esRed(x) || !navigator.onLine) { err.textContent = 'Sin conexión. Inténtalo de nuevo.'; off.classList.remove('hidden'); }
          else err.textContent = /invalid login/i.test(x.message || '') ? 'Email o contraseña incorrectos' : (x.message || String(x));
          btn.disabled = false;
        }
      };
      document.getElementById('overlay').appendChild(el);
      setTimeout(() => el.querySelector(email ? '#lp' : '#le').focus(), 50);
    });
  },
  /* ---------- PIN de bloqueo ---------- */
  async pinHash(pin, salt) { return U.hash(salt + ':' + pin); },
  async setPin(pin) { const salt = U.randomHex(); APP.pin = { salt, hash: await APP.pinHash(pin, salt) }; await DB.set('pin', APP.pin); },
  async clearPin() { APP.pin = null; await DB.set('pin', null); },
  async checkPin(pin) { return !!APP.pin && (await APP.pinHash(pin, APP.pin.salt)) === APP.pin.hash; },
  lock() {
    if (APP._lockEl) return APP._lockP;
    let fallos = 0;
    APP._lockP = new Promise(res => {
      const el = UI.pinPad({ titulo: 'Introduce tu PIN', sub: 'Rutas Comerciales', fullscreen: true, auto: APP.pin.len || 0,
        extra: '<button type="button" class="pin-foot" data-olvido style="background:none;border:0">¿Has olvidado el PIN?</button>',
        onEnter: async pin => {
          if (fallos >= 5) { await U.sleep(3000); }
          if (await APP.checkPin(pin)) { el.remove(); APP._lockEl = null; res(true); return true; }
          fallos++; return fallos >= 5 ? 'PIN incorrecto · espera unos segundos' : 'PIN incorrecto';
        } });
      el.querySelector('[data-olvido]').onclick = () => {
        const s = UI.sheet(`<div class="grip"></div><h2>PIN olvidado</h2><p class="muted small" style="margin:0">El PIN no se puede recuperar. La única salida es borrar los datos de este móvil y volver a empezar: después podrás restaurar una copia de seguridad o iniciar sesión en la copia en línea.</p>
          <div class="btn-row"><button class="btn" data-a="c">Cancelar</button><button class="btn danger" data-a="ok">Borrar datos y quitar PIN</button></div>`);
        s.querySelector('[data-a=c]').onclick = () => UI.closeSheet();
        s.querySelector('[data-a=ok]').onclick = async () => { await DB.wipe(); await DB.set('demoCargada', false); await APP.clearPin(); UI.closeSheet(true); el.remove(); APP._lockEl = null; res(true); APP.go('hoy', {}, true); };
      };
      document.getElementById('overlay').appendChild(el); APP._lockEl = el;
    });
    return APP._lockP;
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

  /* Elimina los clientes de prueba (y sus visitas, pedidos y paradas de ruta) en bloque */
  async eliminarDemo() {
    const cs = (await db.clientes.toArray()).filter(c => c.demo && !c.deleted);
    const ids = new Set(cs.map(c => c.id));
    const vs = (await db.visitas.toArray()).filter(v => ids.has(v.clienteId) && !v.deleted);
    const ps = (await db.pedidos.toArray()).filter(p => ids.has(p.clienteId) && !p.deleted);
    const rs = (await db.rutas.toArray()).filter(r => !r.deleted && (r.paradas || []).some(p => ids.has(p.clienteId)));
    for (const x of [...cs, ...vs, ...ps]) x.deleted = true;
    for (const r of rs) { r.paradas = r.paradas.filter(p => !ids.has(p.clienteId)); if (!r.paradas.length) r.deleted = true; }
    if (cs.length) await DB.bulkSave('clientes', cs);
    if (vs.length) await DB.bulkSave('visitas', vs);
    if (ps.length) await DB.bulkSave('pedidos', ps);
    if (rs.length) await DB.bulkSave('rutas', rs);
    await DB.set('demoCargada', false);
    DB.changed('all');
    return cs.length;
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
