/* Pantallas: Rutas, Nueva ruta, Ruta, Editar cliente, Ubicación, Ajustes, Importar */

/* ======================= RUTAS ======================= */
SCREENS.rutas = async () => {
  const [rutas, byId] = await Promise.all([DB.rutas(), clientesById()]);
  const hoy = U.today();
  const fila = r => { const plan = r.paradas.filter(p => !p.noCabe); const hechas = plan.filter(p => p.hecho).length; const d = r.fecha === hoy ? 'Hoy' : U.fmtDate(r.fecha, { weekday: 'short', day: 'numeric', month: 'short' }); const locs = [...new Set(r.paradas.map(p => byId[p.clienteId]?.localidad).filter(Boolean))].slice(0, 3).join(', ');
    return `<button class="item" data-go="ruta:${r.id}"><div class="col grow"><div class="name">${d} · ${plan.length} visitas</div><div class="meta">${U.esc(locs)}${r.km ? ` · ${U.fmtKm(r.km)}` : ''}${plan.length < r.paradas.length ? ` · ${r.paradas.length - plan.length} no caben` : ''}</div></div><div class="right ${hechas === plan.length && plan.length ? 'tx-verde' : 'muted'}">${hechas}/${plan.length}</div></button>`; };
  const fut = rutas.filter(r => r.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha)), pas = rutas.filter(r => r.fecha < hoy);
  const el = screen(`<div class="hdr"><h1>Rutas</h1></div>
    <div class="section" style="padding-top:4px"><button class="btn primary big" data-go="nuevaRuta">${I.svg(I.plus, 20, 2.4)} Nueva ruta</button></div>
    <div class="list">${fut.length ? '<div class="group-title">Próximas</div>' + fut.map(fila).join('') : ''}${pas.length ? '<div class="group-title">Anteriores</div>' + pas.slice(0, 30).map(fila).join('') : ''}${!rutas.length ? '<div class="empty">Todavía no hay rutas</div>' : ''}</div>`);
  wireGo(el); return el;
};

/* ======================= NUEVA RUTA ======================= */
SCREENS.nuevaRuta = async () => {
  const clientes = (await DB.clientes()).filter(c => c.lat);
  const a = APP.ajustes;
  const st = { fecha: U.today(), origen: Object.assign({}, a.origen), destino: null, salida: a.salida, limite: a.limite, duracion: a.duracion, sel: new Map(), filtro: 'rojo', q: '', loc: '', tiempoCoche: a.tiempoCoche ?? 10, comida: a.comida || 'auto' };
  const el = screen(topbar('Nueva ruta') + `
    <div class="section" style="padding-top:4px"><div class="section-title">1 · Día y horario</div>
      <div class="field-row"><div class="field"><label for="nf">Día</label><input type="date" id="nf" value="${st.fecha}"></div><div class="field"><label for="ns">Salida</label>${UI.horaInput('ns', st.salida)}</div><div class="field"><label for="nl">Límite</label>${UI.horaInput('nl', st.limite)}</div></div>
      <div class="field"><label for="no">Salgo desde</label><div class="row"><input id="no" class="grow" value="${U.esc(st.origen.nombre)}"><button class="iconbtn" data-miubi aria-label="Mi ubicación">${I.svg(I.locate, 20)}</button></div></div>
      <div class="switch-row" style="padding:4px 0"><span class="bold">Vuelvo al mismo sitio</span><button class="switch" id="swd" role="switch" aria-checked="true"></button></div>
      <div class="field hidden" id="fd"><label for="nd">Termino en</label><input id="nd" placeholder="Ciudad o dirección"></div>
      <div class="field"><label>Duración por visita</label><div class="seg c4" id="ndur">${[15, 30, 45, 60].map(m => `<button data-m="${m}" class="${m === st.duracion ? 'on' : ''}">${m === 60 ? '1 h' : m + ' min'}</button>`).join('')}</div></div>
      <div class="field"><label>Tiempo hasta el coche entre visitas</label><div class="seg c4" id="ntc">${[0, 5, 10, 15].map(m => `<button data-m="${m}" class="${m === +st.tiempoCoche ? 'on' : ''}">${m} min</button>`).join('')}</div></div>
      <div class="field"><label>Comida</label><div class="seg c3" id="ncom">${[['auto', 'Jornada continua si se puede'], ['siempre', '1 h, el mejor momento'], ['no', 'Sin pausa']].map(([k, l]) => `<button data-k="${k}" class="${k === st.comida ? 'on' : ''}" style="height:auto;min-height:46px;padding:6px">${l}</button>`).join('')}</div></div></div>
    <div class="section"><div class="row between"><div class="section-title">2 · Clientes · <span id="nsel">0</span> elegidos</div><button class="btn sm outline" data-rellenar>Rellenar mi día</button></div>
      <div class="search" style="margin:0">${I.svg(I.search, 20)}<input id="nq" placeholder="Buscar" autocomplete="off"></div>
      <div class="row" style="gap:8px"><select id="nloc" class="sel grow" aria-label="Zona">${ZONAS.opciones(clientes, '', { localidades: true })}</select></div></div>
    <div class="chips">${[['rojo', 'Fuera de plazo'], ['ambar', 'Próximos'], ['todos', 'Todos'], ['prospecto', 'Prospectos'], ['inactivo', 'Inactivos'], ['sel', 'Elegidos']].map(([k, l]) => `<button class="chip ${st.filtro === k ? 'on' : ''}" data-f="${k}">${['rojo', 'ambar', 'prospecto', 'inactivo'].includes(k) ? UI.dot(k) : ''}${l}</button>`).join('')}</div>
    <div class="list" id="nlista"></div>
    <div style="height:90px"></div>
    <div style="position:fixed;left:0;right:0;bottom:0;padding:10px 16px calc(14px + env(safe-area-inset-bottom,0px));background:var(--bg);border-top:1px solid var(--line);z-index:3"><button class="btn primary big" data-calc disabled>Calcular ruta</button></div>`, { nav: false, static: true });
  wireBack(el);
  const lista = el.querySelector('#nlista'), nsel = el.querySelector('#nsel'), calc = el.querySelector('[data-calc]');
  const distO = c => U.haversineKm(st.origen, c);
  const pintar = () => {
    const q = U.norm(st.q);
    let cs = clientes.filter(c => (!q || U.norm(c.nombre + ' ' + c.localidad + ' ' + c.cp + ' ' + U.comarca(c)).includes(q)) && ZONAS.cumple(c, st.loc));
    if (st.filtro === 'rojo') cs = cs.filter(c => U.estado(c).key === 'rojo'); if (st.filtro === 'ambar') cs = cs.filter(c => ['rojo', 'ambar'].includes(U.estado(c).key)); if (st.filtro === 'sel') cs = cs.filter(c => st.sel.has(c.id));
    if (st.filtro === 'prospecto' || st.filtro === 'inactivo') cs = cs.filter(c => U.estado(c).key === st.filtro);
    cs.sort((x, y) => distO(x) - distO(y));
    lista.innerHTML = (cs.length > 300 ? `<div class="muted small" style="padding:0 16px">Se muestran los 300 más cercanos de ${cs.length} · busca o elige una localidad para ver el resto</div>` : '') + (cs.length ? cs.slice(0, 300).map(c => { const e = U.estado(c); const s = st.sel.get(c.id); return `<label class="check"><input type="checkbox" data-c="${c.id}" ${s ? 'checked' : ''}>${UI.dot(e.key)}<div class="col grow"><div class="bold">${U.esc(c.nombre)}</div><div class="muted small">${U.esc(c.localidad || '')} · ${Math.round(distO(c))} km · ${e.dias == null ? 'sin visitar' : e.dias + ' d'}</div></div>${s ? `<button class="btn sm outline" data-hora="${c.id}">${s.horaFija ? s.horaFija : 'Hora fija'}</button>` : ''}</label>`; }).join('') : '<div class="empty">Sin clientes para este filtro</div>');
    const cuenta = () => { nsel.textContent = st.sel.size; calc.disabled = !st.sel.size; };
    cuenta();
    const wireHora = b => b.onclick = async e => { e.preventDefault(); const s = st.sel.get(b.dataset.hora); const v = await sheetHora(s.horaFija); if (v !== undefined) { s.horaFija = v; b.textContent = v || 'Hora fija'; } };
    lista.querySelectorAll('[data-c]').forEach(cb => cb.onchange = () => { // sin repintar la lista: no se pierde el scroll
      const row = cb.closest('label');
      if (cb.checked) { st.sel.set(cb.dataset.c, { horaFija: null }); const b = UI.el(`<button class="btn sm outline" data-hora="${cb.dataset.c}">Hora fija</button>`); row.appendChild(b); wireHora(b); }
      else { st.sel.delete(cb.dataset.c); row.querySelector('[data-hora]')?.remove(); }
      cuenta();
    });
    lista.querySelectorAll('[data-hora]').forEach(wireHora);
  };
  pintar();
  el.querySelector('#nf').onchange = e => st.fecha = e.target.value; el.querySelector('#ns').onchange = e => st.salida = e.target.value; el.querySelector('#nl').onchange = e => st.limite = e.target.value;
  // el punto de salida se busca al escribirlo; mientras tanto las distancias siguen midiéndose desde el anterior
  el.querySelector('#no').onchange = async e => {
    const nombre = e.target.value.trim(); st.origenNombre = nombre; if (!nombre) return;
    try {
      const g = await GEO.geocodeTexto(nombre);
      if (st.origenNombre !== nombre) return; // ya escribió otra cosa
      if (!g) { UI.toast('No encuentro ese punto de salida'); return; }
      st.origen = { nombre, lat: g.lat, lng: g.lng }; pintar();
    } catch (err) { UI.toast('Sin conexión: el punto de salida se buscará al calcular la ruta'); }
  };
  el.querySelector('[data-miubi]').onclick = async () => { try { const p = await GEO.miUbicacion(); st.origen = { nombre: 'Mi ubicación', lat: p.lat, lng: p.lng }; st.origenNombre = null; el.querySelector('#no').value = 'Mi ubicación'; pintar(); } catch (e) { UI.toast('No se pudo obtener la ubicación'); } };
  el.querySelector('#swd').onclick = e => { const on = e.currentTarget.getAttribute('aria-checked') !== 'true'; e.currentTarget.setAttribute('aria-checked', on); el.querySelector('#fd').classList.toggle('hidden', on); st.destino = on ? null : { nombre: el.querySelector('#nd').value }; };
  el.querySelector('#nd').onchange = e => st.destino = { nombre: e.target.value };
  el.querySelectorAll('#ndur button').forEach(b => b.onclick = () => { st.duracion = +b.dataset.m; el.querySelectorAll('#ndur button').forEach(x => x.classList.toggle('on', x === b)); });
  el.querySelectorAll('#ntc button').forEach(b => b.onclick = () => { st.tiempoCoche = +b.dataset.m; el.querySelectorAll('#ntc button').forEach(x => x.classList.toggle('on', x === b)); });
  el.querySelectorAll('#ncom button').forEach(b => b.onclick = () => { st.comida = b.dataset.k; el.querySelectorAll('#ncom button').forEach(x => x.classList.toggle('on', x === b)); });
  el.querySelector('#nq').addEventListener('input', U.debounce(e => { st.q = e.target.value; pintar(); }, 120));
  el.querySelector('#nloc').onchange = e => { st.loc = e.target.value; pintar(); };
  el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { st.filtro = b.dataset.f; el.querySelectorAll('[data-f]').forEach(x => x.classList.toggle('on', x === b)); pintar(); });
  el.querySelector('[data-rellenar]').onclick = () => {
    // elige hasta N clientes: primero fuera de plazo, luego próximos, los más cercanos al origen (y a la localidad elegida)
    const horas = (U.parseTime(st.limite) - U.parseTime(st.salida)) / 60; const n = Math.max(3, Math.min(10, Math.floor(horas / ((st.duracion + 25) / 60))));
    const pool = clientes.filter(c => ZONAS.cumple(c, st.loc)).map(c => ({ c, e: U.estado(c), d: distO(c) })).filter(x => ['rojo', 'ambar', 'azul'].includes(x.e.key)).sort((x, y) => { const o = { rojo: 0, azul: 1, ambar: 2 }; if (o[x.e.key] !== o[y.e.key]) return o[x.e.key] - o[y.e.key]; return x.d - y.d; });
    // agrupa por cercanía: parte del más urgente/cercano y añade los que están cerca de él
    const elegidos = []; const base = pool[0]; if (!base) { UI.toast('No hay clientes pendientes'); return; }
    const cand = pool.map(x => ({ ...x, dd: U.haversineKm(base.c, x.c) })).sort((x, y) => (x.e.key === 'rojo' ? 0 : 1) * 15 + x.dd - ((y.e.key === 'rojo' ? 0 : 1) * 15 + y.dd));
    for (const x of cand) { if (elegidos.length >= n) break; elegidos.push(x.c); }
    elegidos.forEach(c => { if (!st.sel.has(c.id)) st.sel.set(c.id, { horaFija: null }); });
    st.filtro = 'sel'; el.querySelectorAll('[data-f]').forEach(x => x.classList.toggle('on', x.dataset.f === 'sel')); pintar();
    UI.toast(`${elegidos.length} clientes elegidos cerca de ${U.esc(base.c.localidad || 'el primero')}`);
  };
  calc.onclick = async () => {
    calc.disabled = true; calc.textContent = 'Calculando…';
    try {
      const nombreO = st.origenNombre != null ? st.origenNombre : st.origen.nombre;
      if (!st.origen.lat || nombreO !== st.origen.nombre) { const g = await GEO.geocodeTexto(nombreO); if (!g) throw new Error('No encuentro el punto de salida'); st.origen = { nombre: nombreO, lat: g.lat, lng: g.lng }; }
      let destino = st.origen;
      if (st.destino && st.destino.nombre) { const g = await GEO.geocodeTexto(st.destino.nombre); if (!g) throw new Error('No encuentro el punto de llegada'); destino = { nombre: st.destino.nombre, lat: g.lat, lng: g.lng }; }
      const ruta = Object.assign(await APP.nuevaRutaBase(st.fecha), { origen: st.origen, destino, salida: st.salida, limite: st.limite, duracion: st.duracion, tiempoCoche: st.tiempoCoche, comida: st.comida });
      ruta.paradas = [...st.sel].map(([id, s]) => ({ clienteId: id, horaFija: s.horaFija, duracion: st.duracion, hecho: false }));
      await APP.replanRuta(ruta);
      APP.go('ruta', { id: ruta.id }, true);
    } catch (e) { UI.toast(e.message || 'No se pudo calcular'); calc.disabled = false; calc.textContent = 'Calcular ruta'; }
  };
  return el;
};
function sheetHora(valor) {
  return new Promise(res => {
    const s = UI.sheet(`<div class="grip"></div><h2>Hora fija</h2><div class="muted small">Solo si el cliente te espera a una hora concreta. La ruta se organiza alrededor.</div><div class="row"><label for="hx" class="muted bold">A las</label>${UI.horaInput('hx', valor || '10:00')}</div>
      <div class="btn-row"><button class="btn" data-a="q">Sin hora fija</button><button class="btn primary" data-a="ok">Guardar</button></div>`, { onClose: () => res(undefined) });
    s.querySelector('[data-a=ok]').onclick = async () => { const v = s.querySelector('#hx').value || null; UI._sheet.onClose = null; await UI.closeSheet(); res(v); };
    s.querySelector('[data-a=q]').onclick = async () => { UI._sheet.onClose = null; await UI.closeSheet(); res(null); };
  });
}

/* ======================= RUTA ======================= */
SCREENS.ruta = async ({ id }) => {
  const r = await db.rutas.get(id);
  if (!r || r.deleted) { const v = screen(topbar('Ruta') + '<div class="empty">Ruta no encontrada</div>', { nav: false }); wireBack(v); return v; }
  const byId = await clientesById();
  const hoy = U.today(); const esHoy = r.fecha === hoy, futura = r.fecha >= hoy;
  // las paradas que no caben (o sin ubicación) siguen en la ruta con noCabe: se listan aparte y se reintentan al recalcular
  const plan = r.paradas.filter(p => !p.noCabe);
  const pend = plan.filter(p => !p.hecho && byId[p.clienteId]); const next = pend[0];
  const ultimaPlan = r.paradas.reduce((u, p, i) => (p.noCabe ? u : i), -1);
  const comidaTxt = r.pausa ? `Comida · ${U.fmtTime(r.pausa.inicio)}–${U.fmtTime(r.pausa.fin)}${r.pausa.tipo === 'libre' ? ' (hueco del mediodía)' : ''}` : '';
  const filaPausa = r.pausa ? `<div class="tl-row pausa"><div class="tl-time">${U.fmtTime(r.pausa.inicio)}</div><div class="tl-mark"><span class="end"></span></div><div class="tl-body"><div class="meta bold">🍽 ${U.esc(comidaTxt)}</div></div></div>` : '';
  let pausaPuesta = false;
  const filas = r.paradas.map((p, i) => {
    if (p.noCabe) return '';
    const c = byId[p.clienteId] || { nombre: '(cliente eliminado)' }; const e = c.id ? U.estado(c) : { key: 'gris', dias: null };
    let antes = '';
    if (r.pausa && !pausaPuesta && !p.hecho && p.inicio != null && p.inicio >= r.pausa.fin - 1) { antes = filaPausa; pausaPuesta = true; }
    const esNext = next && p === next;
    const av = AVISO.estado(p), canal = c.id ? U.canal(c) : null;
    const botonAviso = !futura || p.hecho ? '' : !canal ? `<button class="btn ghost" disabled>sin móvil</button>` : av === 'no' ? `<button class="btn" data-avisar="${c.id}">Avisar</button>` : av === 'cambiada' ? `<button class="btn" data-avisar="${c.id}" title="La hora ha cambiado desde el aviso">Reavisar</button>` : `<button class="btn ok" data-avisado="${c.id}">Avisado ✓</button>`;
    return antes + `<div class="tl-row ${p.hecho ? 'done' : ''} ${esNext ? 'next' : ''}" data-i="${i}"><div class="tl-time">${U.fmtTime(p.inicio)}</div><div class="tl-mark"><span class="dot ${p.hecho ? 'gris' : e.key}" style="color:var(--${p.hecho ? 'gris' : e.key})"></span></div>
      <div class="tl-body">${esNext ? '<div class="small bold" style="letter-spacing:.05em;text-transform:uppercase;color:var(--accent)">Siguiente</div>' : ''}
        <div class="row" style="gap:8px"><a class="name" href="#" data-go="ficha:${c.id}">${U.esc(c.nombre)}</a>${p.horaFija ? `<span class="pill dark">CITA ${U.esc(p.horaFija)}</span>` : ''}</div>
        <div class="meta">${U.esc(c.localidad || '')} · ${e.key === 'prospecto' || e.key === 'inactivo' ? e.label : e.dias == null ? 'sin visitar' : e.dias + ' días sin visita'}${p.llegada != null && p.inicio - p.llegada > 2 ? ` · espera ${Math.round(p.inicio - p.llegada)} min` : ''}${p.hecho ? ' · hecha' : ''}${av === 'cambiada' && !p.hecho ? ' · <b class="tx-ambar">hora cambiada desde el aviso</b>' : av === 'avisado' && !p.hecho ? ' · avisado' : ''}</div>
        ${!p.hecho ? `<div class="tl-actions"><a class="btn primary" href="${U.mapsUrl(c)}" target="_blank" rel="noopener">${I.svg(I.nav, 14)} Ir</a><button class="btn" data-hecha="${c.id}">Registrar</button>${botonAviso}<button class="btn ghost" data-menu="${i}" aria-label="Más">⋯</button></div>` : ''}</div></div>`;
  }).join('') + (r.pausa && !pausaPuesta ? filaPausa : '');
  const noCaben = r.paradas.filter(p => p.noCabe && !p.hecho).map(p => byId[p.clienteId]).filter(Boolean);
  const porAvisar = futura ? AVISO.pendientes(r, byId) : [];
  const cola = AVISO.cola && AVISO.cola.rutaId === r.id ? AVISO.cola.ids.filter(cid => porAvisar.includes(cid)) : [];
  const sig = cola.length ? byId[cola[0]] : null;
  const tc = r.tiempoCoche ?? APP.ajustes.tiempoCoche ?? 10, comida = r.comida || APP.ajustes.comida || 'auto';
  const el = screen(topbar(esHoy ? 'Ruta de hoy' : 'Ruta del ' + U.fmtDate(r.fecha), `<button class="iconbtn" data-share aria-label="Compartir">${I.svg(I.share, 20)}</button>`) + `
    <div class="section" style="padding-top:4px"><div class="muted bold">${plan.length} visitas · ${U.fmtKm(r.km)} · ${U.fmtDur(r.conduccion)} de conducción${r.estimado ? ' (estimado, sin conexión)' : ''}</div>
      <div class="muted small">${tc ? `+${tc} min hasta el coche entre visitas` : 'Sin tiempo hasta el coche'} · ${r.pausa ? U.esc(comidaTxt) : r.jornadaContinua ? 'Jornada continua' : comida === 'no' ? 'Sin pausa para comer' : 'Sin pausa a mediodía'}</div>
      ${r.pausaNoCabe ? '<div class="card ambar small bold">La hora de comer no cabe entre las 13:00 y las 16:00 con estas visitas.</div>' : ''}
      ${!r.ok && pend.length ? `<div class="card rojo small bold">No llega a todo dentro del horario (${r.salida}–${r.limite}). Quita alguna visita o amplía el límite.</div>` : ''}
      <div class="btn-row"><button class="btn sm outline" data-recalc>${I.svg(I.refresh, 16)} Recalcular</button><button class="btn sm outline" data-add>${I.svg(I.plus, 16)} Añadir cliente</button><button class="btn sm outline" data-edit>${I.svg(I.clock, 16)} Horario</button></div>
      ${porAvisar.length ? `<button class="btn primary" data-avisartodos>Avisar a todos · ${porAvisar.length}</button>` : ''}</div>
    <div class="tl" style="margin-top:14px">
      <div class="tl-row"><div class="tl-time">${U.esc(r.salida)}</div><div class="tl-mark"><span class="end"></span></div><div class="tl-body"><div class="meta bold">Salida · ${U.esc(r.origen?.nombre || '')}</div></div></div>
      ${filas}
      <div class="tl-row"><div class="tl-time">${U.fmtTime(r.fin)}</div><div class="tl-mark"><span class="end fill"></span></div><div class="tl-body"><div class="meta bold">Llegada · ${U.esc(r.destino?.nombre || '')}</div></div></div></div>
    ${noCaben.length ? `<div class="section"><div class="section-title">No caben en el horario · ${noCaben.length}</div><div class="muted small">Siguen en la ruta: amplía el límite o quita otra visita y pulsa «Recalcular».</div>${noCaben.map(c => clienteItem(c, c.lat ? null : 'sin ubicación')).join('')}</div>` : ''}
    <div class="section"><button class="btn danger" data-del>Eliminar ruta</button></div>
    ${sig ? `<div style="height:80px"></div><div class="aviso-bar"><div class="col grow"><span class="muted small bold">Siguiente por avisar (${cola.length})</span><span class="bold">${U.esc(sig.contacto ? sig.contacto.split(/\s+/)[0] + ' · ' : '')}${U.esc(sig.nombre)}</span></div><button class="btn ghost" data-colafin>Parar</button><button class="btn primary" data-colasig>Avisar</button></div>` : ''}`, { nav: false });
  wireBack(el); wireGo(el);
  el.querySelectorAll('[data-hecha]').forEach(b => b.onclick = () => sheetVisita(b.dataset.hecha, { rutaId: r.id }));
  el.querySelectorAll('[data-avisar]').forEach(b => b.onclick = async () => { if (!await AVISO.enviar(r, b.dataset.avisar)) UI.toast('Este cliente no tiene móvil'); });
  el.querySelectorAll('[data-avisado]').forEach(b => b.onclick = () => {
    const s = UI.sheet(`<div class="grip"></div><h2>Ya avisado</h2><div class="muted small">El mensaje se abrió en WhatsApp/SMS; la app no puede saber si se envió.</div><div class="col" style="gap:8px"><button class="btn" data-a="otra">Volver a avisar</button><button class="btn" data-a="rel">Enviar recordatorio («¿sigue bien?»)</button><button class="btn danger" data-a="quitar">Quitar la marca de avisado</button></div>`);
    s.querySelector('[data-a=otra]').onclick = async () => { await UI.closeSheet(); await AVISO.enviar(r, b.dataset.avisado, APP.ajustes.plantilla || 'estandar'); };
    s.querySelector('[data-a=rel]').onclick = async () => { await UI.closeSheet(); await AVISO.enviar(r, b.dataset.avisado, 'relance'); };
    s.querySelector('[data-a=quitar]').onclick = async () => { await UI.closeSheet(); await AVISO.quitar(r, b.dataset.avisado); };
  });
  // «Avisar a todos»: el móvil no deja abrir varias conversaciones a la vez; se abre la primera y, al volver, se propone la siguiente
  el.querySelector('[data-avisartodos]')?.addEventListener('click', async () => { AVISO.cola = { rutaId: r.id, ids: porAvisar.slice(1) }; await AVISO.enviar(r, porAvisar[0]); });
  el.querySelector('[data-colasig]')?.addEventListener('click', async () => { const cid = cola[0]; AVISO.cola.ids = cola.slice(1); await AVISO.enviar(r, cid); });
  el.querySelector('[data-colafin]')?.addEventListener('click', () => { AVISO.cola = null; APP.render(); });
  el.querySelectorAll('[data-menu]').forEach(b => b.onclick = () => {
    const i = +b.dataset.menu; const p = r.paradas[i]; const c = byId[p.clienteId];
    const s = UI.sheet(`<div class="grip"></div><h2>${U.esc(c?.nombre || '')}</h2><div class="col" style="gap:8px">
      <button class="btn" data-a="hora">${p.horaFija ? 'Cambiar hora fija (' + p.horaFija + ')' : 'Poner hora fija'}</button>
      <button class="btn" data-a="up" ${i === 0 || r.paradas[i - 1].hecho ? 'disabled' : ''}>${I.svg(I.up, 18)} Subir</button><button class="btn" data-a="down" ${i >= ultimaPlan ? 'disabled' : ''}>${I.svg(I.down, 18)} Bajar</button>
      ${c && U.canal(c) && futura ? '<button class="btn" data-a="franja">Avisar con franja horaria («entre las … y las …»)</button>' : ''}
      <button class="btn" data-a="saltar">Marcar como hecha sin registrar</button><button class="btn danger" data-a="quitar">Quitar de la ruta</button></div>`);
    const manual = () => APP.recalcularHoras(r); // recalcula horas manteniendo el orden (con la pausa y las que no caben)
    s.querySelector('[data-a=hora]').onclick = async () => { await UI.closeSheet(); const v = await sheetHora(p.horaFija); if (v !== undefined) { p.horaFija = v; await APP.replanRuta(r); } };
    s.querySelector('[data-a=up]').onclick = async () => { await UI.closeSheet(); if (i > 0 && !r.paradas[i - 1].hecho) { [r.paradas[i - 1], r.paradas[i]] = [r.paradas[i], r.paradas[i - 1]]; await manual(); } };
    s.querySelector('[data-a=down]').onclick = async () => { await UI.closeSheet(); if (i < ultimaPlan) { [r.paradas[i + 1], r.paradas[i]] = [r.paradas[i], r.paradas[i + 1]]; await manual(); } };
    s.querySelector('[data-a=franja]')?.addEventListener('click', async () => { await UI.closeSheet(); await AVISO.enviar(r, p.clienteId, 'franja'); });
    s.querySelector('[data-a=saltar]').onclick = async () => { await UI.closeSheet(); p.hecho = true; p.noCabe = false; const n = new Date(); p.hechoA = n.getHours() * 60 + n.getMinutes(); await DB.save('rutas', r); };
    s.querySelector('[data-a=quitar]').onclick = async () => { await UI.closeSheet(); r.paradas.splice(i, 1); await APP.replanRuta(r); };
  });
  el.querySelector('[data-recalc]').onclick = async e => { e.currentTarget.disabled = true; UI.toast('Recalculando…', 1500); await APP.replanRuta(r); };
  el.querySelector('[data-add]').onclick = async () => {
    const cs = (await DB.clientes()).filter(c => c.lat && !r.paradas.some(p => p.clienteId === c.id));
    const s = UI.sheet(`<div class="grip"></div><h2>Añadir cliente</h2><div class="search" style="margin:0">${I.svg(I.search, 20)}<input id="aq" placeholder="Buscar" autocomplete="off"></div><div class="list" id="al" style="padding:0"></div>`);
    const al = s.querySelector('#al'); const o = r.origen;
    const pintar = q => { q = U.norm(q); const hits = cs.filter(c => !q || U.norm(c.nombre + ' ' + c.localidad).includes(q)).sort((x, y) => U.haversineKm(o, x) - U.haversineKm(o, y)).slice(0, 40); al.innerHTML = hits.map(c => clienteItem(c, Math.round(U.haversineKm(o, c)) + ' km').replace('data-go="ficha:', 'data-pick="')).join('') || '<div class="empty">Nada</div>'; al.querySelectorAll('[data-pick]').forEach(b => b.onclick = async () => { await UI.closeSheet(); const cid = b.dataset.pick; const v = await sheetHora(null); if (v === undefined) return; r.paradas.push({ clienteId: cid, horaFija: v, duracion: r.duracion, hecho: false }); UI.toast('Calculando…', 1500); await APP.replanRuta(r); }); };
    pintar(''); s.querySelector('#aq').addEventListener('input', e => pintar(e.target.value));
  };
  el.querySelector('[data-edit]').onclick = () => {
    let tcSel = +tc, comSel = comida;
    const s = UI.sheet(`<div class="grip"></div><h2>Horario de la ruta</h2><div class="field-row"><div class="field"><label for="es">Salida</label>${UI.horaInput('es', r.salida)}</div><div class="field"><label for="el">Límite</label>${UI.horaInput('el', r.limite)}</div></div>
      <div class="field"><label for="eo">Salgo desde</label><input id="eo" value="${U.esc(r.origen?.nombre || '')}"></div><div class="field"><label for="ed">Termino en</label><input id="ed" value="${U.esc(r.destino?.nombre || '')}"></div>
      <div class="field"><label>Tiempo hasta el coche entre visitas</label><div class="seg c4" id="etc">${[0, 5, 10, 15].map(m => `<button type="button" data-m="${m}" class="${m === tcSel ? 'on' : ''}">${m} min</button>`).join('')}</div></div>
      <div class="field"><label>Comida</label><div class="seg c3" id="ecom">${[['auto', 'Continua si se puede'], ['siempre', '1 h, mejor momento'], ['no', 'Sin pausa']].map(([k, l]) => `<button type="button" data-k="${k}" class="${k === comSel ? 'on' : ''}" style="height:auto;min-height:46px;padding:6px">${l}</button>`).join('')}</div></div>
      <button class="btn primary big" data-ok>Guardar y recalcular</button>`);
    s.querySelectorAll('#etc button').forEach(b => b.onclick = () => { tcSel = +b.dataset.m; s.querySelectorAll('#etc button').forEach(x => x.classList.toggle('on', x === b)); });
    s.querySelectorAll('#ecom button').forEach(b => b.onclick = () => { comSel = b.dataset.k; s.querySelectorAll('#ecom button').forEach(x => x.classList.toggle('on', x === b)); });
    s.querySelector('[data-ok]').onclick = async e => {
      const b = e.currentTarget; b.disabled = true;
      try {
        r.salida = s.querySelector('#es').value || r.salida; r.limite = s.querySelector('#el').value || r.limite; r.tiempoCoche = tcSel; r.comida = comSel;
        const o = s.querySelector('#eo').value.trim(), d = s.querySelector('#ed').value.trim();
        if (o && o !== r.origen?.nombre) { const g = await GEO.geocodeTexto(o); if (!g) throw new Error('No encuentro el punto de salida'); r.origen = { nombre: o, lat: g.lat, lng: g.lng }; }
        if (d && d !== r.destino?.nombre) { const g = await GEO.geocodeTexto(d); if (!g) throw new Error('No encuentro el punto de llegada'); r.destino = { nombre: d, lat: g.lat, lng: g.lng }; }
        await UI.closeSheet(); await APP.replanRuta(r);
      } catch (err) { UI.toast(err.message); b.disabled = false; }
    };
  };
  el.querySelector('[data-share]').onclick = async () => {
    const lineas = [`Ruta ${esHoy ? 'de hoy' : 'del ' + U.fmtDate(r.fecha)} · ${plan.length} visitas · ${U.fmtKm(r.km)}`, `Salida ${r.salida} desde ${r.origen?.nombre || ''}`];
    let pausaTxt = false;
    plan.forEach((p, i) => { const c = byId[p.clienteId] || {}; if (r.pausa && !pausaTxt && p.inicio != null && p.inicio >= r.pausa.fin - 1) { lineas.push(`${U.fmtTime(r.pausa.inicio)} Comida (hasta ${U.fmtTime(r.pausa.fin)})`); pausaTxt = true; } lineas.push(`${i + 1}. ${U.fmtTime(p.inicio)} ${c.nombre || ''} (${c.localidad || ''})${p.horaFija ? ' · cita ' + p.horaFija : ''}${p.hecho ? ' ✓' : ''}`); });
    if (r.pausa && !pausaTxt) lineas.push(`${U.fmtTime(r.pausa.inicio)} Comida (hasta ${U.fmtTime(r.pausa.fin)})`);
    lineas.push(`Llegada ${U.fmtTime(r.fin)} a ${r.destino?.nombre || ''}`);
    await XIO.compartirTexto(lineas.join('\n'), 'Ruta');
  };
  el.querySelector('[data-del]').onclick = async () => { if (await UI.confirm('¿Eliminar esta ruta?', 'Las visitas registradas no se borran.', { ok: 'Eliminar', danger: true })) { await DB.softDelete('rutas', r.id); APP.go('rutas', {}, true); } };
  return el;
};

/* ======================= EDITAR / NUEVO CLIENTE ======================= */
SCREENS.editarCliente = async ({ id }) => {
  const nuevo = !id; const c = nuevo ? { id: U.uuid(), nombre: '', calle: '', numero: '', cp: '', localidad: '', provincia: '', telefono: '', movil: '', whatsapp: true, idioma: 'es', contacto: '', tamano: 'mediano', frecuenciaDias: APP.ajustes.frecuenciaDias, ultimaVisita: null, nota: '', horario: null, prospecto: false, codAgrup: '' } : await DB.cliente(id);
  if (!c) { const v = screen(topbar('Cliente') + '<div class="empty">Cliente no encontrado</div>', { nav: false }); wireBack(v); return v; }
  const ed = editorHorario(c.horario);
  const conVentas = c.tamanoOrigen === 'ventas' && VENTAS.tieneDatos(c);
  const FREQ = [[15, 'Quincenal'], [30, 'Mensual'], [60, 'Bimensual'], [90, 'Trimestral'], [180, '6 meses']];
  const sw = (id, on, label, ayuda) => `<div class="switch-row"><div class="col"><span class="bold">${label}</span>${ayuda ? `<span class="muted small">${ayuda}</span>` : ''}</div><button type="button" class="switch" id="${id}" role="switch" aria-checked="${!!on}" aria-label="${label}"></button></div>`;
  const el = screen(topbar(nuevo ? 'Nuevo cliente' : 'Editar cliente') + `<form class="section" style="padding-top:4px;gap:14px" id="f">
    <div class="field"><label for="cn">Nombre *</label><input id="cn" value="${U.esc(c.nombre)}" required></div>
    <div class="field-row"><div class="field" style="flex:3"><label for="cc">Calle</label><input id="cc" value="${U.esc(c.calle)}"></div><div class="field"><label for="cnu">Nº</label><input id="cnu" value="${U.esc(c.numero)}"></div></div>
    <div class="field-row"><div class="field"><label for="ccp">CP</label><input id="ccp" value="${U.esc(c.cp)}" inputmode="numeric"></div><div class="field" style="flex:2"><label for="cl">Localidad</label><input id="cl" value="${U.esc(c.localidad)}"></div></div>
    <div class="muted small" id="ccom">${U.comarca(c) ? 'Comarca: ' + U.esc(U.comarca(c)) : ''}</div>
    <div class="field"><label for="cco">Contacto</label><input id="cco" value="${U.esc(c.contacto || '')}" placeholder="Nombre de la persona (se usa en el mensaje: «Hola Marta…»)"></div>
    <div class="field-row"><div class="field"><label for="ct">Teléfono fijo</label><input id="ct" value="${U.esc(c.telefono || '')}" inputmode="tel"></div><div class="field"><label for="cmo">Móvil</label><input id="cmo" value="${U.esc(c.movil || '')}" inputmode="tel" placeholder="6XX XXX XXX"></div></div>
    ${sw('cwa', c.whatsapp !== false, 'Tiene WhatsApp', 'Si no, los avisos se mandan por SMS')}
    <div class="field"><label>Idioma de los mensajes</label><div class="seg c2" id="cid"><button type="button" data-l="es" class="${c.idioma !== 'ca' ? 'on' : ''}">Castellano</button><button type="button" data-l="ca" class="${c.idioma === 'ca' ? 'on' : ''}">Català</button></div></div>
    <div class="field"><label for="ccod">Código de cliente (el de la empresa)</label><input id="ccod" value="${U.esc(c.codigo || '')}"></div>
    ${sw('cpro', c.prospecto, 'Prospecto', 'Alguien a quien se está captando: sin alertas hasta que compre')}
    <div class="field"><label for="cag">Cadena (código de agrupación)</label><input id="cag" value="${U.esc(c.codAgrup || '')}" placeholder="Vacío = no es de una cadena"></div>
    <div class="field"><label>Tamaño</label>${conVentas ? `<div class="card small"><b>${U.tamanoLabel(c.tamano)}</b> · calculado con las ventas de ${c.clasificacion} (${U.fmtEur(VENTAS.totalAnio(c.ventas, c.clasificacion))}). Se recalcula cada enero.</div>` : `<div class="seg c3" id="ctam">${['pequeño', 'mediano', 'grande'].map(t => `<button type="button" data-t="${t}" class="${c.tamano === t ? 'on' : ''}">${U.tamanoLabel(t)}</button>`).join('')}</div>`}</div>
    <div class="field"><label>Frecuencia de visita</label><div class="seg c3" id="cfr">${FREQ.map(([d, l]) => `<button type="button" data-d="${d}" class="${c.frecuenciaDias === d ? 'on' : ''}">${l}</button>`).join('')}${FREQ.some(([d]) => d === c.frecuenciaDias) ? '' : `<button type="button" data-d="${c.frecuenciaDias}" class="on">Cada ${c.frecuenciaDias} d</button>`}</div></div>
    <div class="field"><label for="cuv">Última visita</label><input type="date" id="cuv" value="${c.ultimaVisita || ''}"></div>
    <div class="section-title" style="margin-top:6px">Horario de apertura</div>
    ${ed.html()}
    <div class="field"><label for="cno">Notas</label><div class="row"><textarea id="cno" class="grow">${U.esc(c.nota || '')}</textarea>${UI.micBtn('cno')}</div></div>
    <button class="btn primary big" type="submit">${nuevo ? 'Crear cliente' : 'Guardar'}</button>
    ${!nuevo ? '<button class="btn danger" type="button" data-del>Eliminar cliente</button>' : ''}</form>`, { nav: false, static: true });
  wireBack(el); UI.wireMics(el); ed.wire(el);
  const toggle = id => el.querySelector('#' + id).onclick = e => { const b = e.currentTarget; b.setAttribute('aria-checked', b.getAttribute('aria-checked') !== 'true'); };
  toggle('cwa'); toggle('cpro');
  el.querySelectorAll('#cid button').forEach(b => b.onclick = () => { c.idioma = b.dataset.l; el.querySelectorAll('#cid button').forEach(x => x.classList.toggle('on', x === b)); });
  el.querySelectorAll('#ctam button').forEach(b => b.onclick = () => { c.tamano = b.dataset.t; c.tamanoOrigen = 'manual'; el.querySelectorAll('#ctam button').forEach(x => x.classList.toggle('on', x === b)); });
  el.querySelectorAll('#cfr button').forEach(b => b.onclick = () => { c.frecuenciaDias = +b.dataset.d; el.querySelectorAll('#cfr button').forEach(x => x.classList.toggle('on', x === b)); });
  const verComarca = () => { const k = U.comarca({ localidad: el.querySelector('#cl').value, cp: el.querySelector('#ccp').value }); el.querySelector('#ccom').textContent = k ? 'Comarca: ' + k : ''; };
  el.querySelector('#cl').addEventListener('input', verComarca); el.querySelector('#ccp').addEventListener('input', verComarca);
  el.querySelector('#f').onsubmit = async e => {
    e.preventDefault();
    const g = i => el.querySelector('#' + i).value.trim(), on = i => el.querySelector('#' + i).getAttribute('aria-checked') === 'true';
    const antes = [c.calle, c.numero, c.cp, c.localidad].join('|');
    const agAntes = c.codAgrup || '';
    Object.assign(c, { nombre: g('cn'), calle: g('cc'), numero: g('cnu'), cp: g('ccp'), localidad: g('cl'), telefono: g('ct'), movil: g('cmo'), whatsapp: on('cwa'), contacto: g('cco'), codigo: g('ccod'), prospecto: on('cpro'), codAgrup: XIO.limpiarCodAgrup(g('cag')), ultimaVisita: g('cuv') || null, nota: g('cno') });
    if (!c.nombre) return;
    if ((c.codAgrup || '') !== agAntes) c.cadenaManual = true; // un cambio a mano no lo pisa el siguiente Excel
    c.horario = ed.leer();
    if ([c.calle, c.numero, c.cp, c.localidad].join('|') !== antes) {
      // dirección nueva: se busca otra vez; si estaba situado a mano, se pregunta
      const buscar = !(c.lat && c.geocodeStatus === 'manual') || await UI.confirm('La dirección ha cambiado', 'Este cliente estaba situado a mano en el mapa. ¿Buscar la nueva dirección? Si no, se queda el punto anterior.', { ok: 'Buscar la nueva', cancel: 'Mantener el punto' });
      if (buscar) { c.lat = null; c.lng = null; c.geocodeStatus = 'pendiente'; }
    }
    await DB.save('clientes', c);
    if (!c.lat) { UI.toast('Buscando la dirección en el mapa…'); APP.geocodificarPendientes(); }
    APP.go('ficha', { id: c.id }, true);
  };
  el.querySelector('[data-del]')?.addEventListener('click', async () => { if (await UI.confirm('¿Eliminar este cliente?', 'Se conservan sus visitas y pedidos en el historial. Se quita de las rutas de hoy y de las próximas.', { ok: 'Eliminar', danger: true })) { await APP.eliminarCliente(c.id); APP.go('clientes', {}, true); } });
  return el;
};

/* ======================= UBICACIÓN MANUAL ======================= */
SCREENS.ubicacion = async ({ id }) => {
  const c = await DB.cliente(id);
  const el = screen(topbar('Situar en el mapa') + `<div class="section" style="padding-top:0"><div class="muted small">Arrastra el punto hasta la puerta de <b>${U.esc(c.nombre)}</b> (${U.esc(U.direccion(c).full)}). Toca «Buscar» para intentar la dirección de nuevo.</div></div>
    <div class="map" id="ubMap" style="height:60vh;margin:10px 16px;border-radius:20px;overflow:hidden"></div>
    <div class="section"><div class="btn-row"><button class="btn" data-buscar>Buscar dirección</button><button class="btn primary" data-ok>Guardar ubicación</button></div></div>`, { nav: false, static: true });
  wireBack(el);
  el._afterMount = async () => {
    const map = UI.map(el.querySelector('#ubMap'));
    el._cleanup = () => map.remove();
    const start = c.lat ? [c.lat, c.lng] : [41.6, 1.9];
    map.setView(start, c.lat ? 16 : 8);
    let movido = !!c.lat; // sin ubicación previa hay que mover el punto o encontrar la dirección antes de guardar
    const mk = L.marker(start, { draggable: true, icon: UI.pin('rojo') }).addTo(map);
    mk.on('dragend', () => { movido = true; });
    map.on('click', e => { mk.setLatLng(e.latlng); movido = true; });
    el.querySelector('[data-buscar]').onclick = async e => {
      const b = e.currentTarget; b.disabled = true; let r;
      try { r = await GEO.geocode(c); } catch (err) { UI.toast(err.message); return; } finally { b.disabled = false; }
      if (r) { mk.setLatLng([r.lat, r.lng]); movido = true; map.setView([r.lat, r.lng], r.precision === 'localidad' ? 13 : 16); UI.toast(r.precision === 'localidad' ? 'Solo encontré la localidad' : 'Dirección encontrada'); } else UI.toast('No encontré la dirección');
    };
    el.querySelector('[data-ok]').onclick = async () => {
      if (!movido) { UI.toast('Arrastra el punto hasta el comercio (o toca el mapa) antes de guardar'); return; }
      const p = mk.getLatLng(); c.lat = +p.lat.toFixed(6); c.lng = +p.lng.toFixed(6); c.geocodeStatus = 'manual'; await DB.save('clientes', c); UI.toast('Ubicación guardada'); APP.back(); };
  };
  return el;
};

/* ======================= AJUSTES ======================= */
SCREENS.ajustes = async (params = {}) => {
  const a = APP.ajustes; const h = a.horario;
  const [counts, clientes, lastBackup, demo, email] = await Promise.all([DB.counts(), DB.clientes(), DB.get('lastBackup', null), DB.get('demoCargada', false), DB.get('syncEmail', '')]);
  const pendGeo = clientes.filter(c => !c.lat && c.geocodeStatus !== 'manual').length, fallos = clientes.filter(c => !c.lat && c.geocodeStatus === 'fallo').length, aprox = clientes.filter(c => c.geocodeStatus === 'aprox').length;
  const syncTxt = { off: 'Desactivada', 'sin-sesion': 'Configurada, sin iniciar sesión', ok: SYNC.error ? 'Error: ' + U.esc(SYNC.error) : (SYNC.ultimo ? 'Al día · ' + U.fmtDate(SYNC.ultimo, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Activa'), error: 'Error: ' + U.esc(SYNC.error) }[SYNC.estado];
  const el = screen(topbar('Ajustes') + `
    ${SYNC.estado === 'ok' ? `<div class="section"><div class="section-title">Cuenta</div>
      <div class="card"><div class="row between"><div class="col"><div class="bold">${U.esc(email || 'Sesión iniciada')}</div><div class="muted small">Tus datos se sincronizan con tus otros dispositivos</div></div><button class="btn sm outline" data-logout>Cerrar sesión</button></div></div></div>` : ''}
    <div class="section"><div class="section-title">Datos</div>
      <div class="muted small">${counts.clientes} clientes · ${counts.visitas} visitas · ${counts.pedidos} pedidos · ${counts.tareas} tareas · ${counts.catalogo} artículos en catálogo</div>
      <button class="btn" data-imp="clientes">${I.svg(I.file, 18)} Importar clientes desde Excel</button><div id="imp_clientes"></div>
      <button class="btn" data-imp="catalogo">${I.svg(I.file, 18)} Importar catálogo de productos</button><div id="imp_catalogo"></div>
      <button class="btn" data-expcli>Exportar clientes a Excel</button>
      ${pendGeo ? `<div class="card"><div class="bold">${pendGeo} clientes sin ubicación en el mapa</div><div class="muted small">${fallos} no se encontraron automáticamente${aprox ? ` · ${aprox} solo a nivel de localidad` : ''}</div><div class="btn-row" style="margin-top:10px"><button class="btn sm primary" data-geo>Buscar direcciones</button><button class="btn sm outline" data-go="sinUbicacion">Ver lista</button></div><div class="progress hidden" id="gp" style="margin-top:10px"><div></div></div></div>` : (aprox ? `<button class="btn outline" data-go="sinUbicacion">${aprox} clientes con ubicación aproximada</button>` : '')}</div>
    <div class="section"><div class="section-title">Copia de seguridad</div>
      <div class="muted small">Todo se guarda en este móvil. Guarda una copia fuera (Drive, correo) para no perder nada si pierdes o cambias el teléfono.${lastBackup ? ` Última copia: ${U.fmtDate(lastBackup, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.` : ' Todavía no has hecho ninguna.'}</div>
      <div class="btn-row"><button class="btn primary" data-backup>${I.svg(I.share, 18)} Guardar copia</button><label class="btn" style="cursor:pointer">Restaurar copia<input type="file" accept=".json,application/json" data-restore class="sr-only"></label></div>
      <div class="card"><div class="row between"><div class="col"><div class="bold">Copia en línea automática</div><div class="muted small">${syncTxt}</div></div><button class="btn sm outline" data-sync>${SYNC.estado === 'off' ? 'Configurar' : 'Gestionar'}</button></div></div></div>
    <div class="section"><div class="section-title">Ruta por defecto</div>
      <div class="field"><label for="ao">Salgo desde</label><div class="row"><input id="ao" class="grow" value="${U.esc(a.origen.nombre)}"><button class="btn sm" data-ao>Guardar</button></div></div>
      <div class="field-row"><div class="field"><label for="as">Hora de salida</label>${UI.horaInput('as', a.salida)}</div><div class="field"><label for="al">Hora límite de vuelta</label>${UI.horaInput('al', a.limite)}</div></div>
      <div class="field"><label for="ad">Duración habitual de una visita</label><select id="ad">${[15, 20, 30, 45, 60].map(m => `<option value="${m}" ${a.duracion === m ? 'selected' : ''}>${m} min</option>`).join('')}</select></div>
      <div class="section-title" style="margin-top:4px">Horario habitual de los clientes</div>
      <div class="field-row"><div class="field"><label for="ha">Abren</label>${UI.horaInput('ha', h.abre)}</div><div class="field"><label for="hc">Cierran</label>${UI.horaInput('hc', h.cierra)}</div></div>
      <div class="switch-row"><span class="bold">Cierran al mediodía</span><button class="switch" data-sw="cierraMediodia" role="switch" aria-checked="${h.cierraMediodia !== false}"></button></div>
      <div class="field-row"><div class="field"><label for="hmd">Desde</label>${UI.horaInput('hmd', h.mediodiaDe)}</div><div class="field"><label for="hma">Hasta</label>${UI.horaInput('hma', h.mediodiaA)}</div></div>
      <div class="switch-row"><span class="bold">Lunes por la mañana cerrados</span><button class="switch" data-sw="lunesCerrado" role="switch" aria-checked="${!!h.lunesCerrado}"></button></div>
      <div class="switch-row"><span class="bold">Sábados cerrados</span><button class="switch" data-sw="cierraSabado" role="switch" aria-checked="${!!h.cierraSabado}"></button></div></div>
    <div class="section"><div class="section-title">Apariencia</div>
      <div class="field"><label>Tema</label><div class="seg c3" id="atema">${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([k, l]) => `<button data-t="${k}" class="${(a.tema || 'auto') === k ? 'on' : ''}">${l}</button>`).join('')}</div><div class="muted small">Automático sigue el modo del móvil (claro de día, oscuro de noche).</div></div></div>
    <div class="section"><div class="section-title">Rutas</div>
      <div class="field"><label>Tiempo hasta el coche entre visitas</label><div class="seg c4" id="atc">${[0, 5, 10, 15].map(m => `<button data-m="${m}" class="${+(a.tiempoCoche ?? 10) === m ? 'on' : ''}">${m} min</button>`).join('')}</div><div class="muted small">Se suma a cada trayecto entre dos visitas (no a la salida de casa ni a la vuelta).</div></div>
      <div class="field"><label>Comida</label><div class="seg c3" id="acom">${[['auto', 'Jornada continua si se puede'], ['siempre', '1 h, el mejor momento'], ['no', 'Sin pausa']].map(([k, l]) => `<button data-k="${k}" class="${(a.comida || 'auto') === k ? 'on' : ''}" style="height:auto;min-height:46px;padding:6px">${l}</button>`).join('')}</div><div class="muted small">«Jornada continua»: si hay clientes abiertos a mediodía se sigue trabajando (se vuelve antes); si hay un hueco, es la comida. «1 h»: siempre una hora entre las 13:00 y las 16:00.</div></div>
      <button class="btn outline" data-go="zonas">${I.svg(I.map, 18)} Zonas (${(a.zonas || []).length})</button></div>
    <div class="section"><div class="section-title">Alertas y ventas</div>
      <div class="field"><label for="aam">Alerta «sin pedidos» a partir de</label><select id="aam">${[3, 4, 6, 9, 12].map(m => `<option value="${m}" ${+(a.alertaMeses || 6) === m ? 'selected' : ''}>${m} meses</option>`).join('')}</select></div>
      <div class="field-row"><div class="field"><label for="aup">Pequeño hasta (€/año)</label><input id="aup" type="number" inputmode="numeric" value="${a.umbralPequeno || 900}"></div><div class="field"><label for="aum">Mediano hasta (€/año)</label><input id="aum" type="number" inputmode="numeric" value="${a.umbralMediano || 2500}"></div></div>
      <div class="muted small">Tamaño por las ventas del último año completo${a.clasificacionAnio ? ` (ahora ${a.clasificacionAnio})` : ''}. Más de «mediano» = grande. Se recalcula solo cada enero, con el Excel que trae diciembre.</div></div>
    <div class="section"><div class="section-title">Mensaje antes de la visita</div>
      <div class="field"><label>Modelo por defecto</label><div class="seg c2" id="apl"><button data-p="estandar" class="${(a.plantilla || 'estandar') === 'estandar' ? 'on' : ''}">Hora («sobre las 11h»)</button><button data-p="franja" class="${a.plantilla === 'franja' ? 'on' : ''}">Franja («entre las 10h y las 12h»)</button></div></div>
      <button class="btn outline" data-plantillas>Editar los textos (castellano y catalán)</button></div>
    <div class="section"><div class="section-title">Seguridad</div>
      <div class="card"><div class="row between"><div class="col"><div class="bold">Bloqueo con PIN</div><div class="muted small">${APP.pin ? 'Activado · se pide al abrir la app y tras 5 min en segundo plano' : 'Desactivado'}</div></div>
        <button class="btn sm ${APP.pin ? 'outline' : 'primary'}" data-pin>${APP.pin ? 'Cambiar' : 'Activar'}</button></div>
        ${APP.pin ? '<button class="btn ghost sm" data-pin-off style="margin-top:8px;align-self:flex-start">Quitar el PIN</button>' : ''}</div></div>
    <div class="section"><div class="section-title">Datos de prueba</div>
      ${demo ? '<button class="btn danger" data-borrardemo>Eliminar los clientes de prueba</button>' : '<button class="btn" data-demo>Cargar clientes de prueba (librerías reales de Cataluña)</button>'}
      <button class="btn ghost" data-wipe>Borrar todos los datos de la app</button></div>
    <div class="section"><div class="section-title">App</div>
      ${APP.installPrompt ? '<button class="btn primary" data-install>Instalar en el móvil</button>' : '<div class="muted small">Para instalarla: menú de Chrome ⋮ → «Añadir a pantalla de inicio» / «Instalar app».</div>'}
      <div class="muted small">Rutas Comerciales · versión ${APP.VERSION} · mapas © OpenStreetMap</div></div>`, { nav: false });
  wireBack(el); wireGo(el);
  const saveHor = async () => { const g = i => el.querySelector('#' + i).value; await APP.guardarAjustes({ salida: g('as') || a.salida, limite: g('al') || a.limite, duracion: +g('ad'), horario: Object.assign(a.horario, { abre: g('ha') || h.abre, cierra: g('hc') || h.cierra, mediodiaDe: g('hmd') || h.mediodiaDe, mediodiaA: g('hma') || h.mediodiaA }) }); UI.toast('Guardado', 1200); };
  ['as', 'al', 'ad', 'ha', 'hc', 'hmd', 'hma'].forEach(i => el.querySelector('#' + i).onchange = saveHor);
  el.querySelectorAll('[data-sw]').forEach(b => b.onclick = async () => { const on = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', on); a.horario[b.dataset.sw] = on; await APP.guardarAjustes({ horario: a.horario }); });
  el.querySelector('[data-ao]').onclick = async e => {
    const t = el.querySelector('#ao').value.trim(); if (!t) return;
    const b = e.currentTarget; b.disabled = true; let g;
    try { g = await GEO.geocodeTexto(t); } catch (err) { UI.toast(err.message); return; } finally { b.disabled = false; }
    if (!g) { UI.toast('No encuentro ese lugar'); return; }
    await APP.guardarAjustes({ origen: { nombre: t, lat: g.lat, lng: g.lng } }); UI.toast('Punto de salida guardado');
  };
  const abrirImport = async tipo => {
    const cont = el.querySelector('#imp_' + tipo), otro = el.querySelector('#imp_' + (tipo === 'clientes' ? 'catalogo' : 'clientes'));
    if (cont.childElementCount) { if (el.dataset.static === undefined) cont.replaceChildren(); return; } // segundo toque: se pliega
    if (otro.childElementCount && el.dataset.static !== undefined) { UI.toast('Termina primero la otra importación'); return; }
    otro.replaceChildren(); await montarImport(tipo, cont, el); cont.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  el.querySelectorAll('[data-imp]').forEach(b => b.onclick = () => abrirImport(b.dataset.imp));
  if (params.abrir) { const t = params.abrir; params.abrir = null; el._afterMount = () => abrirImport(t); }
  el.querySelectorAll('#atema button').forEach(b => b.onclick = async () => { el.querySelectorAll('#atema button').forEach(x => x.classList.toggle('on', x === b)); await APP.guardarAjustes({ tema: b.dataset.t }); APP.aplicarTema(b.dataset.t); });
  el.querySelectorAll('#atc button').forEach(b => b.onclick = async () => { el.querySelectorAll('#atc button').forEach(x => x.classList.toggle('on', x === b)); await APP.guardarAjustes({ tiempoCoche: +b.dataset.m }); UI.toast('Se aplica a las rutas nuevas', 1500); });
  el.querySelectorAll('#acom button').forEach(b => b.onclick = async () => { el.querySelectorAll('#acom button').forEach(x => x.classList.toggle('on', x === b)); await APP.guardarAjustes({ comida: b.dataset.k }); UI.toast('Se aplica a las rutas nuevas', 1500); });
  el.querySelector('#aam').onchange = async e => { await APP.guardarAjustes({ alertaMeses: +e.target.value }); UI.toast('Guardado', 1200); };
  const umbrales = async () => {
    const pq = +el.querySelector('#aup').value || 900, md = Math.max(pq, +el.querySelector('#aum').value || 2500);
    await APP.guardarAjustes({ umbralPequeno: pq, umbralMediano: md });
    // cambio de umbrales hecho a propósito: se reclasifica ya con el mismo año de referencia
    const anio = APP.ajustes.clasificacionAnio; if (!anio) { UI.toast('Guardado', 1200); return; }
    const cs = (await DB.clientes()).filter(VENTAS.tieneDatos); let n = 0;
    for (const c of cs) if (VENTAS.clasificar(c, anio, VENTAS.umbrales())) n++;
    if (cs.length) await DB.bulkSave('clientes', cs);
    UI.toast(`Umbrales guardados: ${n} cliente${n === 1 ? '' : 's'} cambia${n === 1 ? '' : 'n'} de tamaño`, 3000);
  };
  el.querySelector('#aup').onchange = umbrales; el.querySelector('#aum').onchange = umbrales;
  el.querySelectorAll('#apl button').forEach(b => b.onclick = async () => { el.querySelectorAll('#apl button').forEach(x => x.classList.toggle('on', x === b)); await APP.guardarAjustes({ plantilla: b.dataset.p }); });
  el.querySelector('[data-plantillas]').onclick = () => sheetPlantillas();
  el.querySelector('[data-logout]')?.addEventListener('click', async () => {
    if (!await UI.confirm('¿Cerrar sesión?', 'Lo pendiente se sube antes de salir. Para volver a entrar hará falta tu email y contraseña.', { ok: 'Cerrar sesión' })) return;
    await SYNC.logout(); await APP.login(); APP.render();
  });
  el.querySelector('[data-expcli]').onclick = async () => { await XIO.compartir(XIO.clientesXlsx(clientes), `clientes_${U.today()}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Clientes'); };
  el.querySelector('[data-geo]')?.addEventListener('click', async e => {
    e.currentTarget.disabled = true; const gp = el.querySelector('#gp'); gp.classList.remove('hidden');
    // también se reintentan las que no se encontraron antes (pudo ser un corte de red)
    const g = await APP.geocodificarPendientes(g => { gp.firstElementChild.style.width = (g.total ? g.hechos / g.total * 100 : 100) + '%'; }, { reintentarFallos: true });
    UI.toast(g && g.errorRed ? 'Sin conexión con el buscador de direcciones: inténtalo más tarde' : 'Búsqueda terminada', 4000); APP.render();
  });
  el.querySelector('[data-backup]').onclick = async () => {
    const data = JSON.stringify(await DB.exportAll());
    const r = await XIO.compartir(data, `rutas_copia_${U.today()}.json`, 'application/json', 'Copia de seguridad Rutas');
    if (r !== 'cancelado') { await DB.set('lastBackup', U.now()); UI.toast('Copia guardada'); APP.render(); }
  };
  el.querySelector('[data-restore]').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const data = JSON.parse(await f.text()); const n = (data.clientes || []).length; if (await UI.confirm('¿Restaurar esta copia?', `${n} clientes, ${(data.visitas || []).length} visitas, ${(data.pedidos || []).length} pedidos. Se combinan con los datos actuales (gana el más reciente).`, { ok: 'Restaurar' })) { await DB.importAll(data); UI.toast('Copia restaurada'); } }
    catch (err) { UI.toast(err.message); }
  };
  el.querySelector('[data-sync]').onclick = sheetSync;
  el.querySelector('[data-pin]').onclick = () => sheetPin();
  el.querySelector('[data-pin-off]')?.addEventListener('click', () => sheetPin({ quitar: true }));
  el.querySelector('[data-demo]')?.addEventListener('click', async e => { e.currentTarget.disabled = true; const n = await APP.cargarDemo(); UI.toast(`${n} clientes de prueba cargados`); });
  el.querySelector('[data-borrardemo]')?.addEventListener('click', async e => { const b = e.currentTarget; if (await UI.confirm('¿Eliminar los clientes de prueba?', 'Se eliminan los clientes marcados como demo, con sus visitas, pedidos y paradas de ruta.', { ok: 'Eliminar', danger: true })) { b.disabled = true; b.textContent = 'Eliminando…'; const n = await APP.eliminarDemo(); UI.toast(`${n} clientes de prueba eliminados`); APP.render(); } });
  el.querySelector('[data-wipe]').onclick = async () => {
    const conCopia = SYNC.estado === 'ok';
    const texto = conCopia ? 'Clientes, visitas, pedidos, rutas y catálogo de este móvil. La copia en línea no se toca: se cierra la sesión y, al volver a entrar, se recupera todo.' : 'Clientes, visitas, pedidos, rutas y catálogo de este móvil. Haz una copia antes.';
    if (!await UI.confirm('¿Borrar TODO?', texto, { ok: 'Borrar todo', danger: true })) return;
    if (await APP.borrarTodoPreguntando() === false) return;
    UI.toast('Datos borrados');
    if (conCopia) await APP.login();
    APP.go('hoy', {}, true);
  };
  el.querySelector('[data-install]')?.addEventListener('click', async () => { APP.installPrompt.prompt(); APP.installPrompt = null; });
  return el;
};

/* Textos del mensaje previo (tres modelos × castellano/catalán) */
function sheetPlantillas() {
  const P = APP.ajustes.plantillas, N = { estandar: 'Con hora', franja: 'Con franja', relance: 'Recordatorio' };
  const s = UI.sheet(`<div class="grip"></div><h2>Textos de los mensajes</h2><div class="muted small">Variables: {nombre_contacto} {dia} {hora} {desde} {hasta} {tienda}. Si el contacto no tiene nombre, queda «Hola,».</div>
    ${Object.keys(N).map(k => `<div class="field"><label>${N[k]} · castellano</label><textarea id="p_${k}_es" style="min-height:70px">${U.esc(P[k].es)}</textarea></div><div class="field"><label>${N[k]} · català</label><textarea id="p_${k}_ca" style="min-height:70px">${U.esc(P[k].ca)}</textarea></div>`).join('')}
    <div class="btn-row"><button class="btn" data-def>Restablecer</button><button class="btn primary" data-ok>Guardar</button></div>`);
  s.querySelector('[data-ok]').onclick = async () => { const n = {}; for (const k of Object.keys(N)) n[k] = { es: s.querySelector(`#p_${k}_es`).value.trim() || APP.PLANTILLAS[k].es, ca: s.querySelector(`#p_${k}_ca`).value.trim() || APP.PLANTILLAS[k].ca }; await APP.guardarAjustes({ plantillas: n }); await UI.closeSheet(); UI.toast('Textos guardados'); };
  s.querySelector('[data-def]').onclick = async () => { await APP.guardarAjustes({ plantillas: JSON.parse(JSON.stringify(APP.PLANTILLAS)) }); await UI.closeSheet(); UI.toast('Textos restablecidos'); };
}

/* Activar / cambiar / quitar el PIN. Pasos: PIN actual (si existe) → nuevo → confirmar */
function sheetPin({ quitar = false } = {}) {
  let paso = APP.pin ? 'actual' : 'nuevo', nuevo = '';
  const titulos = { actual: 'PIN actual', nuevo: quitar ? '' : 'Nuevo PIN', confirmar: 'Repite el nuevo PIN' };
  const s = UI.sheet(`<div class="grip"></div><div id="pinBox"></div>`);
  const box = s.querySelector('#pinBox');
  const pintar = () => {
    box.replaceChildren(UI.pinPad({ titulo: titulos[paso], sub: paso === 'nuevo' ? 'De 4 a 6 cifras' : '', onEnter: async pin => {
      if (paso === 'actual') {
        if (!(await APP.checkPin(pin))) return 'PIN incorrecto';
        if (quitar) { await APP.clearPin(); await UI.closeSheet(); UI.toast('PIN desactivado'); APP.render(); return true; }
        paso = 'nuevo'; pintar(); return true;
      }
      if (paso === 'nuevo') { if (pin.length < 4) return 'Mínimo 4 cifras'; nuevo = pin; paso = 'confirmar'; pintar(); return true; }
      if (pin !== nuevo) { paso = 'nuevo'; pintar(); return 'No coinciden, vuelve a empezar'; }
      await APP.setPin(pin); APP.pin.len = pin.length; await DB.set('pin', APP.pin);
      await UI.closeSheet(); UI.toast('PIN activado'); APP.render(); return true;
    } }));
  };
  pintar();
}

async function sheetSync() {
  const cfg = SYNC.cfg || SYNC.DEFAULT; // desactivada: se propone de nuevo el proyecto preconfigurado
  const s = UI.sheet(`<div class="grip"></div><h2>Copia en línea</h2>
    <div class="muted small">Cada cambio se copia a tu proyecto de Supabase cuando hay conexión. Si cambias de móvil, inicias sesión y lo recuperas todo.</div>
    ${SYNC.estado === 'ok' ? `<div class="card"><div class="bold">Activa</div><div class="muted small">${SYNC.ultimo ? 'Última sincronización ' + U.fmtDate(SYNC.ultimo, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Pendiente'}${SYNC.error ? '<br>' + U.esc(SYNC.error) : ''}</div></div>
      <div class="btn-row"><button class="btn primary" data-a="now">Sincronizar ahora</button><button class="btn" data-a="out">Cerrar sesión</button></div><button class="btn ghost" data-a="off">Desactivar</button>` : `
    <div class="field"><label for="su">URL del proyecto</label><input id="su" value="${U.esc(cfg.url || '')}" placeholder="https://xxxx.supabase.co"></div>
    <div class="field"><label for="sk">Clave pública (anon / publishable)</label><input id="sk" value="${U.esc(cfg.key || '')}"></div>
    <div class="field"><label for="se">Email</label><input id="se" type="email" autocomplete="username"></div><div class="field"><label for="sp">Contraseña</label><input id="sp" type="password" autocomplete="current-password"></div>
    <div class="btn-row"><button class="btn" data-a="reg">Crear cuenta</button><button class="btn primary" data-a="in">Iniciar sesión</button></div>
    <details><summary class="muted small bold">SQL para crear la tabla (una sola vez)</summary><pre style="white-space:pre-wrap;font-size:11px;background:var(--bg2);padding:10px;border-radius:10px">${U.esc(SYNC.SQL)}</pre><button class="btn sm outline" data-a="copysql">Copiar SQL</button></details>`}`);
  const g = i => s.querySelector('#' + i)?.value.trim();
  const conf = async () => { if (!g('su') || !g('sk')) throw new Error('Falta la URL o la clave'); await SYNC.configurar(g('su'), g('sk')); };
  s.querySelector('[data-a=in]')?.addEventListener('click', async e => {
    const b = e.currentTarget; b.disabled = true;
    const entrar = async forzar => { await SYNC.login(g('se'), g('sp'), { forzar }); await UI.closeSheet(); UI.toast('Copia en línea activada'); APP.render(); };
    try { await conf(); await entrar(false); }
    catch (err) {
      if (err.code === 'pendientes') {
        await UI.closeSheet();
        if (await UI.confirm('Cambios sin subir de otra cuenta', `Este móvil tiene ${err.n} cambio${err.n === 1 ? '' : 's'} de la cuenta anterior sin subir. Si entras con esta cuenta se borrarán de este móvil.`, { ok: 'Borrar y entrar', danger: true })) { try { await entrar(true); } catch (e2) { UI.toast(e2.message); } }
        return;
      }
      UI.toast(err.message); b.disabled = false;
    }
  });
  s.querySelector('[data-a=reg]')?.addEventListener('click', async e => { const b = e.currentTarget; b.disabled = true; try { await conf(); const r = await SYNC.registro(g('se'), g('sp')); await UI.closeSheet(); UI.toast(r === 'confirmar' ? 'Revisa tu correo para confirmar la cuenta y luego inicia sesión' : 'Cuenta creada y copia activada', 5000); APP.render(); } catch (err) { UI.toast(err.message); b.disabled = false; } });
  s.querySelector('[data-a=now]')?.addEventListener('click', async e => { e.currentTarget.disabled = true; await SYNC.ahora(); await UI.closeSheet(); UI.toast(SYNC.error ? SYNC.error : 'Sincronizado'); APP.render(); });
  s.querySelector('[data-a=out]')?.addEventListener('click', async () => { await SYNC.logout(); await UI.closeSheet(); await APP.login(); APP.render(); });
  s.querySelector('[data-a=off]')?.addEventListener('click', async () => { await SYNC.desactivar(); await UI.closeSheet(); APP.render(); });
  s.querySelector('[data-a=copysql]')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(SYNC.SQL); UI.toast('SQL copiado'); } catch (e) { UI.toast('No se pudo copiar'); } });
}

SCREENS.sinUbicacion = async () => {
  const cs = (await DB.clientes()).filter(c => !c.lat || c.geocodeStatus === 'aprox');
  const el = screen(topbar('Sin ubicación') + `<div class="section" style="padding-top:0"><div class="muted small">Toca un cliente para situarlo en el mapa a mano.</div></div><div class="list">${cs.map(c => `<button class="item" data-go="ubicacion:${c.id}"><div class="col grow"><div class="name">${U.esc(c.nombre)}</div><div class="meta">${U.esc(U.direccion(c).full)}</div></div><div class="right ${c.lat ? 'tx-ambar' : 'tx-rojo'}">${c.lat ? 'aprox.' : (c.geocodeStatus === 'fallo' ? 'no encontrada' : 'pendiente')}</div></button>`).join('') || '<div class="empty">Todos los clientes están situados</div>'}</div>`, { nav: false });
  wireBack(el); wireGo(el); return el;
};

/* ======================= IMPORTAR ======================= */
/* Las importaciones viven dentro de Ajustes (panel desplegable), no en una página aparte.
   Las direcciones antiguas «importar» llevan a Ajustes con el panel abierto. */
SCREENS.importar = async () => SCREENS.ajustes({ abrir: 'clientes' });
SCREENS.importarCatalogo = async () => SCREENS.ajustes({ abrir: 'catalogo' });
/* Monta el importador en `cont` (dentro de la pantalla de Ajustes, `pantalla`). Mientras hay un archivo
   elegido o una importación en curso, la pantalla no se repinta sola (data-static). */
async function montarImport(tipo, cont, pantalla) {
  const esCli = tipo === 'clientes';
  const CAMPOS = esCli ? XIO.CAMPOS_CLIENTE : XIO.CAMPOS_CATALOGO;
  let leido = null, map = {}, meses = [];
  const hayClientes = esCli && (await DB.counts()).clientes > 0;
  const fijar = on => { if (on) pantalla.dataset.static = ''; else delete pantalla.dataset.static; };
  const el = UI.el(`<div class="card" style="display:flex;flex-direction:column;gap:12px">
    <div class="col" style="gap:10px"><div class="muted small">${esCli ? 'Excel o CSV con una fila por cliente. La primera fila debe tener los títulos de las columnas (nombre, dirección, CP, localidad…). Después se buscan las direcciones en el mapa.' : 'Excel o CSV con referencia/ISBN, título y precio. Sirve para apuntar pedidos buscando por título.'}</div>
      <label class="btn primary" style="cursor:pointer">${I.svg(I.file, 20)} Elegir archivo<input type="file" accept=".xlsx,.xls,.csv" data-file class="sr-only"></label></div>
    <div class="col hidden" id="mapeo" style="gap:10px"><div class="section-title">Columnas</div><div class="muted small" id="info"></div><div class="col" id="campos" style="gap:10px"></div>
      <div class="field"><label>Si el cliente ya existe</label><div class="seg c2" id="modo"><button class="on" data-m="completar">Completar</button><button data-m="ventas">Solo ventas</button></div><div class="muted small">«Completar» rellena lo que falta y añade las ventas nuevas; nunca borra ni cambia lo que ya tiene la ficha.</div></div>
      <div class="btn-row"><button class="btn" data-cancelar>Cancelar</button><button class="btn primary" data-ok>Importar</button></div></div>
    <div class="col hidden" id="prog" style="gap:10px"><div class="bold" id="ptxt"></div><div class="progress"><div></div></div><button class="btn outline" data-stop>Parar (se puede continuar luego)</button></div></div>`);
  cont.replaceChildren(el);
  let modo = 'completar';
  if (!hayClientes) el.querySelector('#modo').parentElement.classList.add('hidden'); // primera importación: no hay nada que completar
  el.querySelector('[data-cancelar]').onclick = () => { fijar(false); cont.replaceChildren(); APP.render(); };
  el.querySelectorAll('#modo button').forEach(b => b.onclick = () => { modo = b.dataset.m; el.querySelectorAll('#modo button').forEach(x => x.classList.toggle('on', x === b)); });
  if (!esCli) el.querySelector('#modo').parentElement.classList.add('hidden');
  el.querySelector('[data-file]').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { leido = await XIO.leer(f); } catch (err) { UI.toast(err.message); return; }
    fijar(true);
    // columnas de meses (ventas): se detectan solas y no se ofrecen para los demás campos
    meses = esCli ? VENTAS.columnasMes(leido.headers) : [];
    const cabeceras = leido.headers.filter(h => !meses.some(m => m.h === h));
    map = XIO.sugerirMapeo(cabeceras, CAMPOS);
    el.querySelector('#info').innerHTML = `${leido.rows.length} filas en «${U.esc(leido.hoja)}».${meses.length ? ` <b>Ventas: ${meses.length} columnas de meses detectadas (${U.mesLabel(meses[0].ym, true)} – ${U.mesLabel(meses[meses.length - 1].ym, true)}).</b>` : ''} Comprueba qué columna corresponde a cada dato:`;
    el.querySelector('#campos').innerHTML = CAMPOS.map(([k, label]) => `<div class="field"><label for="m_${k}">${label}${['nombre', 'titulo'].includes(k) ? ' *' : ''}${k === 'codigo' ? ' (para reconocer al cliente en los próximos archivos)' : ''}</label><select id="m_${k}" data-k="${k}"><option value="">— no importar —</option>${cabeceras.map(h => `<option value="${U.esc(h)}" ${map[k] === h ? 'selected' : ''}>${U.esc(h)}</option>`).join('')}</select></div>`).join('');
    el.querySelector('#campos').querySelectorAll('select').forEach(s => s.onchange = () => { if (s.value) map[s.dataset.k] = s.value; else delete map[s.dataset.k]; });
    el.querySelector('#mapeo').classList.remove('hidden');
  };
  el.querySelector('[data-ok]').onclick = async e => {
    if (!leido) return;
    if (esCli && !map.nombre) { UI.toast('Indica la columna del nombre'); return; }
    if (!esCli && !map.titulo && !map.ref) { UI.toast('Indica la columna del título'); return; }
    e.currentTarget.disabled = true;
    if (!esCli) {
      const items = XIO.filasACatalogo(leido.rows, map);
      await db.catalogo.bulkPut(items); await db.outbox.bulkPut(items.map(i => ({ kind: 'catalogo', id: i.ref, at: U.now() })));
      const filas = leido.rows.length, rep = filas - items.length;
      UI.toast(`${items.length} artículos importados${rep > 0 ? ` (${rep} filas vacías o con la referencia repetida)` : ''}`, 4000);
      fijar(false); cont.replaceChildren(); DB.changed('catalogo'); APP.render(); return;
    }
    const nuevos = XIO.filasAClientes(leido.rows, map, meses);
    const existentes = await DB.clientes();
    // un código que se repite en el archivo no sirve para identificar al cliente: se usa nombre + CP
    const vecesCodigo = new Map(); nuevos.forEach(n => { if (n.codigo) { const k = U.norm(n.codigo); vecesCodigo.set(k, (vecesCodigo.get(k) || 0) + 1); } });
    const repetidos = [...vecesCodigo.values()].filter(v => v > 1).length;
    const porCodigo = new Map(existentes.filter(c => c.codigo).map(c => [U.norm(c.codigo), c])), porNombre = new Map(existentes.map(c => [U.norm(c.nombre) + '|' + (c.cp || ''), c]));
    const DIR = ['calle', 'numero', 'cp', 'localidad'];
    let creados = 0, actualizados = 0, saltados = 0, aClientes = 0, reactivados = 0; const aGuardar = [];
    const anioDatos = meses.length ? VENTAS.anioReferencia(meses.map(m => m.ym)) : null;
    const hayVentas = v => v && Object.values(v).some(x => x);
    for (const n of nuevos) {
      const codigoFiable = n.codigo && vecesCodigo.get(U.norm(n.codigo)) === 1;
      const ex = (codigoFiable && porCodigo.get(U.norm(n.codigo))) || porNombre.get(U.norm(n.nombre) + '|' + (n.cp || ''));
      const { ventas, totalVentas, codAgrup, ...datos } = n;
      if (ex) {
        if (ventas) {
          // ventas: se añaden los meses nuevos y un mes ya conocido toma el valor nuevo (correcciones del ERP)
          const cambia = Object.keys(ventas).some(k => !(ex.ventas && k in ex.ventas) || ex.ventas[k] !== ventas[k]);
          ex.ventas = Object.assign({}, ex.ventas, ventas); ex.ventasImport = true;
          if (ex.prospecto && hayVentas(ventas)) { ex.prospecto = false; aClientes++; } // un prospecto que compra pasa a cliente
          // un inactivo que vuelve a comprar después del año de clasificación se reactiva ya (sin esperar a enero)
          if (ex.inactivo && ex.clasificacion && Object.entries(ventas).some(([k, x]) => x && +k.slice(0, 4) > ex.clasificacion)) { ex.inactivo = false; reactivados++; }
          if (cambia) actualizados++;
        }
        if (totalVentas != null) ex.totalVentas = totalVentas;
        if (modo === 'completar') {
          // solo se rellenan los campos vacíos: lo escrito o corregido en la app no se toca
          for (const [k, v] of Object.entries(datos)) if (v !== '' && v != null && (ex[k] == null || ex[k] === '')) ex[k] = v;
          if (n.ultimaVisita && (!ex.ultimaVisita || n.ultimaVisita > ex.ultimaVisita)) ex.ultimaVisita = n.ultimaVisita; // nunca se retrocede
          if (codAgrup && !ex.codAgrup && !ex.cadenaManual) ex.codAgrup = codAgrup;
          if (!ex.lat && ex.geocodeStatus !== 'manual' && DIR.some(k => ex[k])) ex.geocodeStatus = ex.geocodeStatus === 'fallo' ? 'fallo' : 'pendiente';
          if (!ventas) actualizados++;
        } else if (!ventas) saltados++;
        aGuardar.push(ex);
      } else {
        const c = Object.assign({ id: U.uuid(), geocodeStatus: 'pendiente', lat: null, lng: null }, datos, { tamano: datos.tamano || 'mediano', frecuenciaDias: datos.frecuenciaDias || APP.ajustes.frecuenciaDias || 30, codAgrup: codAgrup || '', whatsapp: true, idioma: 'es' });
        if (ventas) { c.ventas = ventas; c.ventasImport = true; }
        if (totalVentas != null) c.totalVentas = totalVentas;
        aGuardar.push(c); creados++;
      }
    }
    // clasificación (tamaño + inactivo): una vez al año, con el último año completo; entre medias solo los clientes sin clasificar
    let msgClas = '';
    if (anioDatos) {
      const anterior = APP.ajustes.clasificacionAnio, nuevoAnio = anioDatos > (anterior || 0);
      const anio = nuevoAnio ? anioDatos : anterior;
      const todos = nuevoAnio ? [...new Map([...existentes, ...aGuardar].map(c => [c.id, c])).values()].filter(VENTAS.tieneDatos) : aGuardar.filter(c => VENTAS.tieneDatos(c) && !c.clasificacion);
      let cambian = 0;
      for (const c of todos) { const yaTenia = !!c.clasificacion; if (VENTAS.clasificar(c, anio, VENTAS.umbrales()) && yaTenia) cambian++; if (!aGuardar.includes(c)) aGuardar.push(c); }
      if (nuevoAnio) { await APP.guardarAjustes({ clasificacionAnio: anioDatos }); msgClas = ` · Clasificación ${anioDatos} actualizada${anterior ? `: ${cambian} cliente${cambian === 1 ? '' : 's'} cambia${cambian === 1 ? '' : 'n'} de tamaño` : ''}`; }
    }
    await DB.bulkSave('clientes', aGuardar);
    UI.toast(`${creados} nuevos · ${actualizados} actualizados · ${saltados} sin cambios${aClientes ? ` · ${aClientes} prospecto${aClientes === 1 ? '' : 's'} pasa${aClientes === 1 ? '' : 'n'} a cliente` : ''}${reactivados ? ` · ${reactivados} inactivo${reactivados === 1 ? '' : 's'} vuelve${reactivados === 1 ? '' : 'n'} a comprar` : ''}${repetidos ? ` · ${repetidos} códigos repetidos en el archivo` : ''}${msgClas}`, 7000);
    el.querySelector('#mapeo').classList.add('hidden'); const prog = el.querySelector('#prog'); prog.classList.remove('hidden');
    const bar = prog.querySelector('.progress > div'), txt = el.querySelector('#ptxt');
    el.querySelector('[data-stop]').onclick = () => { APP.geo.parar = true; };
    const terminar = () => { prog.querySelector('[data-stop]').classList.add('hidden'); fijar(false); prog.appendChild(UI.el(`<div class="btn-row"><button class="btn" data-cerrar>Cerrar</button><button class="btn primary" data-fin>Ir a clientes</button></div>`)); prog.querySelector('[data-fin]').onclick = () => APP.go('clientes'); prog.querySelector('[data-cerrar]').onclick = () => { cont.replaceChildren(); APP.render(); }; };
    if (!navigator.onLine) { txt.textContent = 'Sin conexión: las direcciones se buscarán cuando la haya (Ajustes → Buscar direcciones).'; terminar(); return; }
    txt.textContent = 'Buscando direcciones en el mapa… (aprox. 2 segundos por cliente)';
    const g = await APP.geocodificarPendientes(g => { bar.style.width = (g.total ? g.hechos / g.total * 100 : 100) + '%'; txt.textContent = `Buscando direcciones… ${g.hechos} de ${g.total}`; });
    const sin = (await DB.clientes()).filter(c => !c.lat);
    const noEncontradas = sin.filter(c => c.geocodeStatus === 'fallo').length, porBuscar = sin.filter(c => c.geocodeStatus !== 'fallo' && c.geocodeStatus !== 'manual').length;
    const partes = [];
    if (noEncontradas) partes.push(`${noEncontradas} direcciones no se encontraron: sitúalas a mano desde Ajustes → Ver lista.`);
    if (porBuscar) partes.push(`${porBuscar} quedan por buscar${g && g.errorRed ? ' (sin conexión con el buscador)' : g && g.parar ? ' (búsqueda parada)' : ''}: se puede seguir desde Ajustes → Buscar direcciones.`);
    txt.textContent = (porBuscar ? 'Búsqueda interrumpida. ' : 'Listo. ') + (partes.join(' ') || 'Todas las direcciones situadas.');
    terminar();
  };
}
