/* Arranque, navegación y lógica compartida (rutas, geocodificación en cola). */
const APP = {
  VERSION: '1.5.1',
  state: { name: 'hoy', params: {} },
  TABS: [['hoy', 'Hoy', I.home], ['clientes', 'Clientes', I.users], ['mapa', 'Mapa', I.map], ['rutas', 'Rutas', I.route], ['pedidos', 'Pedidos', I.box]],
  ajustes: {},
  installPrompt: null,

  async init() {
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { }
    // el service worker se registra lo primero: así la app queda guardada para abrir sin conexión aunque no se inicie sesión
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          nw && nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) UI.toast('Nueva versión lista: cierra y vuelve a abrir la app', 5000); });
        });
      }).catch(e => console.warn('sw', e));
    }
    await APP.cargarAjustes();
    window.addEventListener('popstate', () => {
      if (UI._ignorePop) { UI._ignorePop = false; const r = UI._popResolve; UI._popResolve = null; if (r) r(); return; }
      if (UI._sheet) { UI._sheet.el.remove(); const s = UI._sheet; UI._sheet = null; if (s.onClose) s.onClose(); if (APP._dirty) { APP._dirty = false; APP.refrescar(); } return; }
      // formulario con cambios sin guardar (p. ej. un pedido): se vuelve a la pantalla y se pregunta
      if (APP._salida && APP._salida.sucio()) {
        const salida = APP._salida; history.pushState(APP.state, '');
        UI.confirm('¿Descartar cambios?', 'Los cambios no se guardarán.', { ok: 'Descartar', danger: true }).then(ok => { if (ok && APP._salida === salida) { APP._salida = null; history.back(); } });
        return;
      }
      const st = history.state && history.state.name ? history.state : { name: 'hoy', params: {} };
      APP.state = st; APP.render();
    });
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); APP.installPrompt = e; });
    DB.onChange(U.debounce(() => APP.refrescar(), 150));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { APP._hiddenAt = Date.now(); return; }
      SYNC.programar(500);
      if (APP.pin && Date.now() - (APP._hiddenAt || 0) > 5 * 60 * 1000) APP.lock(); else APP.refrescar();
    });
    history.replaceState({ name: 'hoy', params: {} }, '');
    await APP.migrarHorarios();
    await SYNC.init();
    if (SYNC.estado === 'sin-sesion') await APP.login();
    APP.pin = await DB.get('pin', null);
    if (APP.pin) await APP.lock();
    APP.render();
  },
  /* Repinta la pantalla actual por un cambio de datos o al volver a la app, salvo si hay un formulario o un
     proceso en curso (pantalla data-static) o una hoja abierta (se repinta al cerrarla). */
  refrescar() {
    if (document.querySelector('#app .screen[data-static]')) return;
    if (UI._sheet) { APP._dirty = true; return; }
    APP.render();
  },
  /* Mientras está el bloqueo o el inicio de sesión, la app de debajo no se puede tocar ni leer (TalkBack) */
  _tapar(on) { const app = document.getElementById('app'); app.inert = on; if (on) app.setAttribute('aria-hidden', 'true'); else app.removeAttribute('aria-hidden'); },
  /* ---------- inicio de sesión (copia en línea), antes del PIN ---------- */
  async login() {
    const [email, uid, salioAProposito] = await Promise.all([DB.get('syncEmail', ''), DB.get('syncUid', null), DB.get('syncSalida', false)]);
    // «seguir sin conexión» solo para quien ya usaba este móvil y no cerró sesión a propósito
    const puedeSeguir = !!uid && !salioAProposito;
    APP._tapar(true);
    return new Promise(res => {
      const el = UI.el(`<div class="lock"><form class="pinpad" novalidate>
        <div class="col center" style="gap:6px;align-items:center"><div class="pin-title">Rutas Comerciales</div><div class="muted small" style="text-align:center">Inicia sesión para tener tus datos en todos tus dispositivos</div></div>
        <div class="field"><label for="le">Email</label><input id="le" type="email" autocomplete="username" value="${U.esc(email)}"></div>
        <div class="field"><label for="lp">Contraseña</label><input id="lp" type="password" autocomplete="current-password"></div>
        <div class="small" data-err style="color:var(--rojo);min-height:1.2em;text-align:center"></div>
        <button class="btn primary block" type="submit">Iniciar sesión</button>
        <button type="button" class="pin-foot hidden" data-offline style="background:none;border:0">Sin conexión · seguir con los datos de este dispositivo</button>
        <button type="button" class="pin-foot" data-local style="background:none;border:0">Usar sin copia en línea</button>
      </form></div>`);
      const err = el.querySelector('[data-err]'), off = el.querySelector('[data-offline]'), btn = el.querySelector('[type=submit]');
      const fin = () => { el.remove(); APP._tapar(false); res(); };
      off.onclick = fin;
      el.querySelector('[data-local]').onclick = async () => {
        if (!await UI.confirm('¿Usar sin copia en línea?', 'Los datos se guardarán solo en este móvil. Acuérdate de hacer copias de seguridad desde Ajustes. Podrás activar la copia en línea más adelante.', { ok: 'Usar sin copia' })) return;
        await SYNC.desactivar(); fin();
      };
      const entrar = async (em, pw, forzar) => {
        try { await SYNC.login(em, pw, { forzar }); fin(); }
        catch (x) {
          if (x.code === 'pendientes') {
            const ok = await UI.confirm('Cambios sin subir de otra cuenta', `Este móvil tiene ${x.n} cambio${x.n === 1 ? '' : 's'} de la cuenta anterior que todavía no se han subido. Si entras con esta cuenta se borrarán de este móvil. Para no perderlos, cancela y entra con la cuenta anterior cuando haya conexión.`, { ok: 'Borrar y entrar', danger: true });
            if (ok) return entrar(em, pw, true);
            err.textContent = 'Entrada cancelada';
          } else if (SYNC.esRed(x)) { err.textContent = `Sin conexión. Inténtalo de nuevo. (${x.message || x.name})`; if (puedeSeguir) off.classList.remove('hidden'); }
          else err.textContent = /invalid login/i.test(x.message || '') ? 'Email o contraseña incorrectos' : (x.message || String(x));
          btn.disabled = false;
        }
      };
      el.querySelector('form').onsubmit = async e => {
        e.preventDefault();
        const em = el.querySelector('#le').value.trim(), pw = el.querySelector('#lp').value;
        if (!em || !pw) { err.textContent = 'Escribe tu email y tu contraseña'; return; }
        btn.disabled = true; err.textContent = '';
        await entrar(em, pw, false);
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
    APP._tapar(true);
    APP._lockP = new Promise(res => {
      const abrir = () => { el.remove(); APP._lockEl = null; APP._tapar(false); res(true); };
      const el = UI.pinPad({ titulo: 'Introduce tu PIN', sub: 'Rutas Comerciales', fullscreen: true, auto: APP.pin.len || 0,
        extra: '<button type="button" class="pin-foot" data-olvido style="background:none;border:0">¿Has olvidado el PIN?</button>',
        onEnter: async pin => {
          if (fallos >= 5) { await U.sleep(3000); }
          if (await APP.checkPin(pin)) { abrir(); return true; }
          fallos++; return fallos >= 5 ? 'PIN incorrecto · espera unos segundos' : 'PIN incorrecto';
        } });
      el.querySelector('[data-olvido]').onclick = () => {
        const s = UI.sheet(`<div class="grip"></div><h2>PIN olvidado</h2><p class="muted small" style="margin:0">El PIN no se puede recuperar. La única salida es borrar los datos de este móvil y volver a empezar: después podrás restaurar una copia de seguridad o iniciar sesión en la copia en línea.</p>
          <div class="btn-row"><button class="btn" data-a="c">Cancelar</button><button class="btn danger" data-a="ok">Borrar datos y quitar PIN</button></div>`);
        s.querySelector('[data-a=c]').onclick = () => UI.closeSheet();
        s.querySelector('[data-a=ok]').onclick = async e => {
          e.currentTarget.disabled = true;
          await UI.closeSheet(true);
          if (await APP.borrarTodoPreguntando() === false) return; // también cierra la sesión de la copia en línea
          await APP.clearPin(); abrir();
          if (SYNC.estado === 'sin-sesion') await APP.login();
          APP.go('hoy', {}, true);
        };
      };
      document.getElementById('overlay').appendChild(el); APP._lockEl = el;
    });
    return APP._lockP;
  },
  /* Borra los datos de este móvil. Con copia en línea: antes se sube lo pendiente y después se cierra la sesión,
     así los datos no vuelven a bajar solos y nadie sigue conectado a la cuenta. Al volver a entrar se recupera todo. */
  /* Sin forzar: si quedan cambios que no se han podido subir (sin conexión), lanza {code:'pendientes', n}
     para que la pantalla pregunte antes de perderlos. */
  async borrarTodo({ forzar = false } = {}) {
    const conCopia = SYNC.estado === 'ok';
    if (conCopia) { await SYNC.esperar(); await SYNC.ahora().catch(() => { }); }
    const n = await db.outbox.count();
    if (n && !forzar) throw Object.assign(new Error('Hay cambios sin subir'), { code: 'pendientes', n, conCopia });
    if (conCopia) await SYNC.logout({ aProposito: false });
    await SYNC.esperar();
    await DB.wipe(); await DB.set('demoCargada', false);
    return conCopia;
  },
  /* borrarTodo con la pregunta si hay cambios sin subir. Devuelve false si se cancela. */
  async borrarTodoPreguntando() {
    try { return await APP.borrarTodo(); }
    catch (e) {
      if (e.code !== 'pendientes') throw e;
      const ok = await UI.confirm('Cambios sin subir', `Hay ${e.n} cambio${e.n === 1 ? '' : 's'} que todavía no se ha${e.n === 1 ? '' : 'n'} podido copiar en línea (sin conexión). Si borras ahora se perderán. Mejor espera a tener conexión, o guarda antes una copia de seguridad.`, { ok: 'Borrar igualmente', danger: true });
      if (!ok) return false;
      return await APP.borrarTodo({ forzar: true });
    }
  },

  async cargarAjustes() {
    const def = {
      origen: { nombre: 'Barcelona', lat: 41.3874, lng: 2.1686 }, salida: '08:30', limite: '18:00', duracion: 30, frecuenciaDias: 30,
      horario: { abre: '09:30', cierra: '20:00', cierraMediodia: true, mediodiaDe: '13:30', mediodiaA: '17:00', lunesCerrado: false, cierraSabado: false },
      nombre: '',
      tema: 'auto', alertaMeses: 6, tiempoCoche: 10, comida: 'auto', umbralPequeno: 900, umbralMediano: 2500,
      plantilla: 'estandar', plantillas: APP.PLANTILLAS, zonas: [], clasificacionAnio: null,
    };
    const a = await DB.get('ajustes', {});
    APP.ajustes = Object.assign({}, def, a, { horario: Object.assign({}, def.horario, a.horario || {}), plantillas: Object.assign({}, def.plantillas, a.plantillas || {}) });
    APP.aplicarTema(APP.ajustes.tema);
  },
  /* Modelos del mensaje previo a la visita, en castellano y catalán. Variables: {nombre_contacto} {dia} {hora} {desde} {hasta} {tienda} */
  PLANTILLAS: {
    estandar: { es: 'Hola {nombre_contacto}, {dia} paso por la librería sobre las {hora}. ¿Te va bien?', ca: 'Hola {nombre_contacto}, {dia} passo per la llibreria cap a les {hora}. Et va bé?' },
    franja: { es: 'Hola {nombre_contacto}, {dia} paso por la librería entre las {desde} y las {hasta}. ¿Te va bien?', ca: 'Hola {nombre_contacto}, {dia} passo per la llibreria entre les {desde} i les {hasta}. Et va bé?' },
    relance: { es: 'Hola {nombre_contacto}, ¿sigue bien que pase {dia} sobre las {hora}?', ca: 'Hola {nombre_contacto}, encara et va bé que passi {dia} cap a les {hora}?' },
  },
  /* Tema: 'auto' (sigue al sistema), 'light', 'dark'. Cambia sin recargar, también los mapas y la barra de Android. */
  aplicarTema(tema) {
    const root = document.documentElement;
    if (tema === 'light' || tema === 'dark') root.dataset.theme = tema; else delete root.dataset.theme;
    try { localStorage.setItem('tema', tema || 'auto'); } catch (e) { }
    const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#FFFFFF';
    if (!APP._temaEscucha) { APP._temaEscucha = true; matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => APP.aplicarTema(APP.ajustes.tema)); }
    UI.temaCambiado();
  },
  cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); },
  /* Una sola vez: los horarios antiguos (interruptores) pasan al modelo nuevo con las franjas reales de cada día */
  async migrarHorarios() {
    if (await DB.get('horarioV2', false)) return;
    const cs = (await db.clientes.toArray()).filter(c => c.horario && !c.horario.modo);
    for (const c of cs) c.horario = ROUTE.convertirHorario(c.horario, APP.ajustes.horario);
    if (cs.length) await DB.bulkSave('clientes', cs);
    await DB.set('horarioV2', true);
  },
  async guardarAjustes(patch) { Object.assign(APP.ajustes, patch); await DB.set('ajustes', APP.ajustes); },

  go(name, params = {}, replace = false) {
    // prev = pantalla anterior en el historial (para volver a ella en vez de apilar otra igual)
    let prev = { name: APP.state.name, params: APP.state.params };
    if (UI._sheet) { UI.closeSheet(true); if (history.state && history.state.sheet) replace = true; }
    else if (replace) prev = (history.state && history.state.prev) || null;
    APP.state = { name, params, prev };
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
    APP._salida = null; // la pantalla nueva vuelve a poner su guardia si la necesita
    try { el = await fn(params); } catch (e) { console.error(e); el = UI.el(`<div class="screen"><div class="empty">Error: ${U.esc(e.message)}</div></div>`); }
    if (APP.state.name !== name) return; // navegó mientras cargaba
    const prev = app.querySelector('.screen'); if (prev && prev._cleanup) { try { prev._cleanup(); } catch (e) { } }
    app.replaceChildren(el);
    if (APP.TABS.some(t => t[0] === name)) app.appendChild(await APP.nav(name));
    if (el.classList.contains('screen') && scroll && APP._lastName === name) el.scrollTop = scroll;
    APP._lastName = name;
    if (el._afterMount) el._afterMount();
  },
  async nav(active) {
    const nav = UI.el(`<nav class="tabs">${APP.TABS.map(([k, label, icon]) => `<button class="${k === active ? 'on' : ''}" data-tab="${k}">${I.svg(icon, 22, k === active ? 2.2 : 2)}${label}</button>`).join('')}</nav>`);
    nav.querySelectorAll('button').forEach(b => b.onclick = () => APP.tab(b.dataset.tab));
    return nav;
  },

  /* ---------- rutas: planificación ---------- */
  /* Desde dónde y a qué hora se sigue la ruta: la última visita hecha (por hora real de registro)
     y nunca antes de ahora si la ruta es de hoy. */
  reanudacion(ruta, byId) {
    let inicio = ruta.origen, salida = U.parseTime(ruta.salida);
    const hechas = ruta.paradas.filter(p => p.hecho);
    if (hechas.length) {
      const conHora = hechas.filter(p => p.hechoA != null);
      const ult = conHora.length ? conHora.reduce((a, b) => (b.hechoA > a.hechoA ? b : a)) : hechas[hechas.length - 1];
      const c = byId[ult.clienteId]; if (c && c.lat) inicio = { nombre: c.nombre, lat: c.lat, lng: c.lng };
      salida = Math.max(salida, ult.hechoA != null ? ult.hechoA : (ult.fin || salida));
    }
    if (ruta.fecha === U.today()) { const n = new Date(); salida = Math.max(salida, n.getHours() * 60 + n.getMinutes()); }
    return { inicio, salida, desdeCliente: inicio !== ruta.origen };
  },
  /* Matriz de tiempos con el «tiempo hasta el coche» sumado a cada trayecto entre dos visitas
     (no a la salida de casa ni a la vuelta final; sí a la salida desde un cliente cuando se recalcula a mitad de ruta). */
  async matrizRuta(points, ruta, desdeCliente) {
    const m = await GEO.matrix(points);
    const tc = +(ruta.tiempoCoche ?? APP.ajustes.tiempoCoche ?? 10) || 0, n = points.length;
    if (tc) m.dur = m.dur.map((fila, i) => fila.map((d, j) => (i !== j && j >= 1 && j <= n - 2 && (i >= 1 && i <= n - 2 || (i === 0 && desdeCliente)) ? d + tc : d)));
    return m;
  },
  /* Pausa para comer: 'auto' = jornada continua si se puede (la comida, si la hay, es un hueco natural del mediodía);
     'siempre' = 1 h entre las 13:00 y las 16:00, en el mejor momento; 'no' = sin pausa. */
  PAUSA: { duracion: 60, desde: 13 * 60, hasta: 16 * 60 },
  pausaStop(inicio) { return { id: '__pausa', sinLugar: true, duracion: APP.PAUSA.duracion, ventanas: [[APP.PAUSA.desde, APP.PAUSA.hasta]], penaliza: 15, lat: inicio.lat, lng: inicio.lng }; },
  /* La pausa fija solo tiene sentido entre visitas: si todas acaban antes (o la pausa quedó la última), se quita
     y se vuelve a casa sin esperar a la hora de comer. */
  _sinPausaSobrante(stops, r, iPausa, opts) {
    const visitas = r.orden.filter(i => i !== iPausa);
    if (!r.orden.includes(iPausa) || r.orden[r.orden.length - 1] !== iPausa) return r;
    const s = ROUTE.simular(stops, visitas, opts);
    return Object.assign({}, s, { orden: visitas, noCaben: r.noCaben.filter(i => i !== iPausa) });
  },
  /* Marca en la ruta la pausa (fija) o el hueco natural para comer, o la jornada continua */
  _anotarComida(ruta, plan, iPausa) {
    ruta.pausa = null; ruta.pausaNoCabe = false;
    const pe = iPausa >= 0 ? plan.find(pl => pl.i === iPausa) : null;
    if (pe) ruta.pausa = { inicio: pe.inicio, fin: pe.fin, tipo: 'fija' };
    else if (iPausa >= 0) ruta.pausaNoCabe = plan.some(pl => pl.fin > APP.PAUSA.desde); // si todo acaba antes de comer, no hace falta
    else if ((ruta.comida || APP.ajustes.comida || 'auto') === 'auto') {
      let mejor = null;
      for (const pl of plan) {
        const a = Math.max(pl.llegada, APP.PAUSA.desde), b = Math.min(pl.inicio, APP.PAUSA.hasta);
        if (b - a >= 45 && (!mejor || b - a > mejor.fin - mejor.inicio)) mejor = { inicio: a, fin: b, tipo: 'libre' };
      }
      ruta.pausa = mejor;
    }
    const visitas = plan.filter(pl => pl.i !== iPausa);
    ruta.jornadaContinua = !ruta.pausa && visitas.length > 0 && visitas[0].inicio < APP.PAUSA.desde && visitas[visitas.length - 1].fin > APP.PAUSA.desde + 60;
  },
  /* Replanifica las visitas pendientes. Las que no caben en el horario o no tienen ubicación se quedan
     en la ruta marcadas con noCabe (no se pierden): se vuelven a intentar en cada recálculo. */
  async replanRuta(ruta) {
    const clientes = await DB.clientes(); const byId = Object.fromEntries(clientes.map(c => [c.id, c]));
    ruta.paradas = ruta.paradas.filter(p => byId[p.clienteId] || p.hecho); // clientes eliminados fuera
    const hechas = ruta.paradas.filter(p => p.hecho);
    const pendientes = ruta.paradas.filter(p => !p.hecho && byId[p.clienteId].lat);
    const sinCoord = ruta.paradas.filter(p => !p.hecho && !byId[p.clienteId].lat);
    const dow = U.parseDate(ruta.fecha).getDay();
    const { inicio, salida, desdeCliente } = APP.reanudacion(ruta, byId);
    const stops = pendientes.map(p => { const c = byId[p.clienteId]; let hf = p.horaFija != null ? U.parseTime(p.horaFija) : null; if (hf != null && hf + 10 < salida) hf = null; /* cita ya pasada: se trata como visita normal */
      return { id: c.id, lat: c.lat, lng: c.lng, horaFija: hf, duracion: p.duracion || ruta.duracion || APP.ajustes.duracion, ventanas: ROUTE.ventanas(c.horario, APP.ajustes.horario, dow) }; });
    let iPausa = -1;
    if ((ruta.comida || APP.ajustes.comida) === 'siempre' && stops.length && salida < APP.PAUSA.hasta - APP.PAUSA.duracion) { iPausa = stops.length; stops.push(APP.pausaStop(inicio)); }
    const points = [inicio, ...stops, ruta.destino];
    const m = stops.length ? await APP.matrizRuta(points, ruta, desdeCliente) : { dur: [[0, 0], [0, 0]], dist: [[0, 0], [0, 0]], estimado: false };
    const opts = { salida, limite: U.parseTime(ruta.limite), dur: m.dur, dist: m.dist };
    let r = stops.length ? ROUTE.planificar(stops, opts) : { orden: [], plan: [], km: 0, conduccion: 0, fin: salida, ok: true, noCaben: [] };
    if (iPausa >= 0) r = APP._sinPausaSobrante(stops, r, iPausa, opts);
    const sinHora = { llegada: null, inicio: null, fin: null, viaje: null };
    const nuevas = r.plan.filter(pl => pl.i !== iPausa).map(pl => Object.assign({}, pendientes[pl.i], { llegada: pl.llegada, inicio: pl.inicio, fin: pl.fin, viaje: pl.viaje, noCabe: false }));
    const fuera = [...r.noCaben.filter(i => i !== iPausa).map(i => pendientes[i]), ...sinCoord].map(p => Object.assign({}, p, sinHora, { noCabe: true }));
    ruta.paradas = [...hechas, ...nuevas, ...fuera];
    ruta.noCaben = fuera.map(p => p.clienteId);
    APP._anotarComida(ruta, r.plan, iPausa);
    ruta.km = r.km; ruta.conduccion = r.conduccion; ruta.fin = r.fin; ruta.ok = r.ok && !fuera.length; ruta.estimado = m.estimado;
    await DB.save('rutas', ruta);
    return ruta;
  },
  /* Recalcula solo las horas, manteniendo el orden (al validar una visita): la ruta no cambia bajo los ojos del comercial.
     Devuelve {retraso (min, + = tarde), riesgos: [{nombre, hora}], ok} para avisar si algo peligra. */
  async recalcularHoras(ruta) {
    const clientes = await DB.clientes(); const byId = Object.fromEntries(clientes.map(c => [c.id, c]));
    const hechas = ruta.paradas.filter(p => p.hecho), pend = ruta.paradas.filter(p => !p.hecho && !p.noCabe && byId[p.clienteId]?.lat);
    const resto = ruta.paradas.filter(p => !p.hecho && !pend.includes(p));
    if (!pend.length) { await DB.save('rutas', ruta); return { retraso: 0, riesgos: [], ok: true }; }
    const dow = U.parseDate(ruta.fecha).getDay();
    const { inicio, salida, desdeCliente } = APP.reanudacion(ruta, byId);
    const stops = pend.map(p => { const c = byId[p.clienteId]; let hf = p.horaFija ? U.parseTime(p.horaFija) : null; if (hf != null && hf + 10 < salida) hf = null; /* cita ya pasada: visita normal, sin alerta */
      return { lat: c.lat, lng: c.lng, horaFija: hf, duracion: p.duracion || ruta.duracion, ventanas: ROUTE.ventanas(c.horario, APP.ajustes.horario, dow) }; });
    let iPausa = -1;
    if ((ruta.comida || APP.ajustes.comida) === 'siempre' && ruta.pausa && ruta.pausa.tipo === 'fija' && ruta.pausa.fin > salida && salida < APP.PAUSA.hasta - APP.PAUSA.duracion) { iPausa = stops.length; stops.push(APP.pausaStop(inicio)); }
    const m = await APP.matrizRuta([inicio, ...stops, ruta.destino], ruta, desdeCliente);
    const opts = { salida, limite: U.parseTime(ruta.limite), dur: m.dur, dist: m.dist };
    const base = pend.map((_, k) => k);
    let res = ROUTE.simular(stops, base, opts);
    if (iPausa >= 0) { // la pausa se coloca en el hueco que mejor encaja (nunca la última), sin cambiar el orden de las visitas
      let mejor = null;
      for (let k = 0; k < base.length; k++) { const r = ROUTE.simular(stops, [...base.slice(0, k), iPausa, ...base.slice(k)], opts); if (!mejor || (r.ok && !mejor.ok) || (r.ok === mejor.ok && r.fin < mejor.fin)) mejor = r; }
      if (mejor && (mejor.ok || !res.ok)) res = mejor; else iPausa = -1;
    }
    const antes = pend[0].inicio;
    const nuevas = res.plan.filter(pl => pl.i !== iPausa).map(pl => Object.assign({}, pend[pl.i], { llegada: pl.llegada, inicio: pl.inicio, fin: pl.fin, viaje: pl.viaje }));
    const riesgos = res.plan.filter(pl => pl.i !== iPausa && stops[pl.i].horaFija != null && pl.llegada > stops[pl.i].horaFija + 10).map(pl => ({ nombre: byId[pend[pl.i].clienteId].nombre, hora: pend[pl.i].horaFija }));
    ruta.paradas = [...hechas, ...nuevas, ...resto];
    APP._anotarComida(ruta, res.plan, iPausa);
    ruta.km = res.km; ruta.conduccion = res.conduccion; ruta.fin = res.fin; ruta.ok = res.ok && !resto.length; ruta.estimado = m.estimado;
    await DB.save('rutas', ruta);
    return { retraso: antes != null && nuevas[0] ? Math.round(nuevas[0].inicio - antes) : 0, riesgos, ok: res.ok, rutaId: ruta.id };
  },
  /* Tras validar una visita: aviso si se va con retraso y algo peligra, con «Reorganizar» */
  async avisoRuta(info) {
    if (!info) return;
    if (!info.riesgos.length && info.ok) { if (info.retraso) UI.toast(info.retraso > 0 ? `Horarios actualizados: ${info.retraso} min más tarde` : `Horarios actualizados: vas ${-info.retraso} min adelantado`, 3500); return; }
    const detalle = [...info.riesgos.map(r => `la cita de las ${r.hora} con ${r.nombre} está en riesgo`), !info.ok && !info.riesgos.length ? 'alguna visita ya no cabe en el horario' : null].filter(Boolean);
    const texto = (info.retraso >= 10 ? `Vas con ${info.retraso} min de retraso` : 'Atención') + ': ' + detalle.join('; ') + '.';
    if (await UI.confirm('Ruta con retraso', U.esc(texto) + ' Puedes reorganizar el resto de visitas.', { ok: 'Reorganizar', cancel: 'Seguir así' })) {
      const r = await db.rutas.get(info.rutaId); if (r) { await APP.replanRuta(r); UI.toast('Ruta reorganizada'); }
    }
  },
  async nuevaRutaBase(fecha) {
    const a = APP.ajustes;
    return { id: U.uuid(), fecha: fecha || U.today(), origen: a.origen, destino: a.origen, salida: a.salida, limite: a.limite, duracion: a.duracion, tiempoCoche: a.tiempoCoche ?? 10, comida: a.comida || 'auto', paradas: [], noCaben: [] };
  },
  /* Añade un cliente a la ruta del día (creándola si no existe). Si ya estaba, aplica la hora fija y la duración elegidas. */
  async anadirARuta(clienteId, { horaFija = null, duracion = null, fecha = null } = {}) {
    fecha = fecha || U.today();
    let ruta = await DB.rutaDelDia(fecha);
    if (!ruta) ruta = await APP.nuevaRutaBase(fecha);
    const ex = ruta.paradas.find(p => p.clienteId === clienteId);
    if (ex && ex.hecho) return { ruta, yaEstaba: true, sinCambios: true };
    if (ex) { ex.horaFija = horaFija; ex.duracion = duracion || ex.duracion || ruta.duracion; }
    else ruta.paradas.push({ clienteId, horaFija, duracion: duracion || ruta.duracion, hecho: false });
    await APP.replanRuta(ruta);
    return { ruta, yaEstaba: !!ex };
  },
  /* Marca como hecha la parada del cliente en la ruta indicada (o en la de hoy si no se indica).
     En la ruta de hoy, recalcula las horas del resto desde ahora (mismo orden) y devuelve el aviso para avisoRuta(). */
  async marcarParadaHecha(rutaId, clienteId) {
    const r = rutaId ? await db.rutas.get(rutaId) : await DB.rutaDelDia(U.today()); if (!r || r.deleted) return null;
    const p = r.paradas.find(p => p.clienteId === clienteId); if (!p || p.hecho) return null;
    p.hecho = true; p.noCabe = false; const n = new Date(); p.hechoA = n.getHours() * 60 + n.getMinutes();
    if (r.fecha !== U.today()) { await DB.save('rutas', r); return null; }
    try { return await APP.recalcularHoras(r); } catch (e) { console.warn(e); await DB.save('rutas', r); return null; }
  },
  /* Elimina un cliente y lo quita de las rutas de hoy y futuras */
  async eliminarCliente(id) {
    await DB.softDelete('clientes', id);
    const rs = (await db.rutas.toArray()).filter(r => !r.deleted && r.fecha >= U.today() && (r.paradas || []).some(p => p.clienteId === id && !p.hecho));
    for (const r of rs) { r.paradas = r.paradas.filter(p => p.clienteId !== id || p.hecho); r.noCaben = (r.noCaben || []).filter(x => x !== id); await DB.save('rutas', r); }
  },

  /* ---------- geocodificación en cola ----------
     Una sola búsqueda a la vez; si se pide otra mientras corre, se espera a la misma (que vuelve a mirar
     qué clientes quedan pendientes en cada vuelta, así que incluye los recién importados). */
  geo: { activo: false, hechos: 0, total: 0, parar: false, errorRed: false },
  geocodificarPendientes(onProgress, { reintentarFallos = false } = {}) {
    if (onProgress) (APP._geoCbs = APP._geoCbs || new Set()).add(onProgress);
    if (reintentarFallos) APP._geoReintentar = true;
    if (APP.geo.activo) return APP._geoP;
    APP._geoP = APP._geocodificar().finally(() => { APP._geoCbs = new Set(); APP._geoReintentar = false; });
    return APP._geoP;
  },
  async _geocodificar() {
    APP.geo = { activo: true, hechos: 0, total: 0, parar: false, errorRed: false };
    const vistos = new Set(); let erroresSeguidos = 0, cambios = 0;
    const aviso = () => { for (const fn of APP._geoCbs || []) { try { fn(APP.geo); } catch (e) { } } };
    try {
      for (;;) {
        if (APP.geo.parar) break;
        const pend = (await DB.clientes()).filter(c => !c.lat && !vistos.has(c.id) && c.geocodeStatus !== 'manual' && (c.geocodeStatus !== 'fallo' || APP._geoReintentar));
        APP.geo.total = APP.geo.hechos + pend.length;
        const c = pend[0]; if (!c) break;
        vistos.add(c.id);
        let r = null, red = false;
        try { r = await GEO.geocode(c); } catch (e) { red = true; }
        if (red) { // sin conexión o servicio saturado: no se marca como «no encontrada»
          if (++erroresSeguidos >= 3) { APP.geo.errorRed = true; break; }
          continue;
        }
        erroresSeguidos = 0;
        // se relee la ficha: puede haber cambiado (visita, nota, borrado, ubicación manual…) durante la búsqueda;
        // solo se tocan la posición y el estado, con fecha de modificación nueva para que llegue a los otros dispositivos
        await db.transaction('rw', db.clientes, db.outbox, async () => {
          const cur = await db.clientes.get(c.id);
          const misma = cur && !cur.deleted && !cur.lat && cur.geocodeStatus !== 'manual' && [cur.calle, cur.numero, cur.cp, cur.localidad].join('|') === [c.calle, c.numero, c.cp, c.localidad].join('|');
          if (!misma) return;
          if (r) { cur.lat = r.lat; cur.lng = r.lng; cur.geocodeStatus = r.precision === 'localidad' ? 'aprox' : 'ok'; }
          else cur.geocodeStatus = 'fallo';
          cur.updatedAt = U.despues(cur.updatedAt);
          await db.clientes.put(cur); await db.outbox.put({ kind: 'clientes', id: cur.id, at: cur.updatedAt });
          cambios++;
        });
        APP.geo.hechos++; aviso();
      }
    } finally { APP.geo.activo = false; if (cambios) DB.changed('clientes'); aviso(); }
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
    // datos comerciales inventados (deterministas) para ver ventas, cadenas, prospectos e inactivos
    let semilla = 7; const rnd = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647;
    const hoyM = new Date(), mesesDemo = [];
    for (let y = 2025, m = 1; y < hoyM.getFullYear() || (y === hoyM.getFullYear() && m < hoyM.getMonth() + 1); m === 12 ? (m = 1, y++) : m++) mesesDemo.push(`${y}-${String(m).padStart(2, '0')}`);
    const cadenas = ['ABACUS', 'LAIE', 'CASA DEL LLIBRE'];
    const recs = demo.map((d, i) => {
      const tipo = rnd(), base = tipo < 0.12 ? 0 : 80 + rnd() * 450;
      const ventas = Object.fromEntries(mesesDemo.map(k => [k, base === 0 ? 0 : Math.round((base * (0.4 + rnd() * 1.2) - (rnd() < 0.06 ? base * 1.5 : 0)) * 100) / 100]));
      const movil = i % 3 === 0 ? '6' + String(10000000 + Math.floor(rnd() * 89999999)) : '';
      const prospecto = i % 17 === 5; // un prospecto todavía no ha comprado: sin ventas
      return Object.assign({}, d, { geocodeStatus: 'ok', demo: true, horario: ROUTE.convertirHorario(d.horario || null, APP.ajustes.horario),
        ventas: prospecto ? null : ventas, ventasImport: !prospecto, codAgrup: i % 11 === 0 ? cadenas[i % 3] : '', movil, whatsapp: true,
        idioma: /Barcelon|Girona|Vic|Lleida/.test(d.localidad || '') && i % 2 ? 'ca' : 'es', prospecto });
    });
    const anio = VENTAS.anioReferencia(mesesDemo);
    if (anio) { for (const c of recs) VENTAS.clasificar(c, anio, VENTAS.umbrales()); await APP.guardarAjustes({ clasificacionAnio: anio }); }
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
