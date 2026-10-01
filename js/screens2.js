/* Pantallas: Rutas, Nueva ruta, Ruta, Editar cliente, Ubicación, Ajustes, Importar */

/* ======================= RUTAS ======================= */
SCREENS.rutas = async () => {
  const [rutas, byId] = await Promise.all([DB.rutas(), clientesById()]);
  const hoy = U.today();
  const fila = r => { const hechas = r.paradas.filter(p => p.hecho).length; const d = r.fecha === hoy ? 'Hoy' : U.fmtDate(r.fecha, { weekday: 'short', day: 'numeric', month: 'short' }); const locs = [...new Set(r.paradas.map(p => byId[p.clienteId]?.localidad).filter(Boolean))].slice(0, 3).join(', ');
    return `<button class="item" data-go="ruta:${r.id}"><div class="col grow"><div class="name">${d} · ${r.paradas.length} visitas</div><div class="meta">${U.esc(locs)}${r.km ? ` · ${U.fmtKm(r.km)}` : ''}</div></div><div class="right ${hechas === r.paradas.length && r.paradas.length ? 'tx-verde' : 'muted'}">${hechas}/${r.paradas.length}</div></button>`; };
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
  const st = { fecha: U.today(), origen: Object.assign({}, a.origen), destino: null, salida: a.salida, limite: a.limite, duracion: a.duracion, sel: new Map(), filtro: 'rojo', q: '', loc: '' };
  const localidades = [...new Set(clientes.map(c => c.localidad).filter(Boolean))].sort((x, y) => x.localeCompare(y));
  const el = screen(topbar('Nueva ruta') + `
    <div class="section" style="padding-top:4px"><div class="section-title">1 · Día y horario</div>
      <div class="field-row"><div class="field"><label for="nf">Día</label><input type="date" id="nf" value="${st.fecha}"></div><div class="field"><label for="ns">Salida</label>${UI.horaInput('ns', st.salida)}</div><div class="field"><label for="nl">Límite</label>${UI.horaInput('nl', st.limite)}</div></div>
      <div class="field"><label for="no">Salgo desde</label><div class="row"><input id="no" class="grow" value="${U.esc(st.origen.nombre)}"><button class="iconbtn" data-miubi aria-label="Mi ubicación">${I.svg(I.locate, 20)}</button></div></div>
      <div class="switch-row" style="padding:4px 0"><span class="bold">Vuelvo al mismo sitio</span><button class="switch" id="swd" role="switch" aria-checked="true"></button></div>
      <div class="field hidden" id="fd"><label for="nd">Termino en</label><input id="nd" placeholder="Ciudad o dirección"></div>
      <div class="field"><label>Duración por visita</label><div class="seg c4" id="ndur">${[15, 30, 45, 60].map(m => `<button data-m="${m}" class="${m === st.duracion ? 'on' : ''}">${m === 60 ? '1 h' : m + ' min'}</button>`).join('')}</div></div></div>
    <div class="section"><div class="row between"><div class="section-title">2 · Clientes · <span id="nsel">0</span> elegidos</div><button class="btn sm outline" data-rellenar>Rellenar mi día</button></div>
      <div class="search" style="margin:0">${I.svg(I.search, 20)}<input id="nq" placeholder="Buscar" autocomplete="off"></div>
      <div class="row" style="gap:8px"><select id="nloc" class="grow" style="height:40px;border-radius:12px;border:1px solid var(--line2);padding:0 10px;font-weight:700"><option value="">Todas las localidades</option>${localidades.map(l => `<option>${U.esc(l)}</option>`).join('')}</select></div></div>
    <div class="chips">${[['rojo', 'Fuera de plazo'], ['ambar', 'Próximos'], ['todos', 'Todos'], ['sel', 'Elegidos']].map(([k, l]) => `<button class="chip ${st.filtro === k ? 'on' : ''}" data-f="${k}">${['rojo', 'ambar'].includes(k) ? UI.dot(k) : ''}${l}</button>`).join('')}</div>
    <div class="list" id="nlista"></div>
    <div style="height:90px"></div>
    <div style="position:fixed;left:0;right:0;bottom:0;padding:10px 16px calc(14px + env(safe-area-inset-bottom,0px));background:var(--bg);border-top:1px solid var(--line);z-index:3"><button class="btn primary big" data-calc disabled>Calcular ruta</button></div>`, { nav: false, static: true });
  wireBack(el);
  const lista = el.querySelector('#nlista'), nsel = el.querySelector('#nsel'), calc = el.querySelector('[data-calc]');
  const distO = c => U.haversineKm(st.origen, c);
  const pintar = () => {
    const q = U.norm(st.q);
    let cs = clientes.filter(c => (!q || U.norm(c.nombre + ' ' + c.localidad + ' ' + c.cp).includes(q)) && (!st.loc || c.localidad === st.loc));
    if (st.filtro === 'rojo') cs = cs.filter(c => U.estado(c).key === 'rojo'); if (st.filtro === 'ambar') cs = cs.filter(c => ['rojo', 'ambar'].includes(U.estado(c).key)); if (st.filtro === 'sel') cs = cs.filter(c => st.sel.has(c.id));
    cs.sort((x, y) => distO(x) - distO(y));
    lista.innerHTML = cs.length ? cs.slice(0, 300).map(c => { const e = U.estado(c); const s = st.sel.get(c.id); return `<label class="check"><input type="checkbox" data-c="${c.id}" ${s ? 'checked' : ''}>${UI.dot(e.key)}<div class="col grow"><div class="bold">${U.esc(c.nombre)}</div><div class="muted small">${U.esc(c.localidad || '')} · ${Math.round(distO(c))} km · ${e.dias == null ? 'sin visitar' : e.dias + ' d'}</div></div>${s ? `<button class="btn sm outline" data-hora="${c.id}">${s.horaFija ? s.horaFija : 'Hora fija'}</button>` : ''}</label>`; }).join('') : '<div class="empty">Sin clientes para este filtro</div>';
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
  el.querySelector('#no').onchange = e => { st.origen = { nombre: e.target.value, lat: null, lng: null }; };
  el.querySelector('[data-miubi]').onclick = async () => { try { const p = await GEO.miUbicacion(); st.origen = { nombre: 'Mi ubicación', lat: p.lat, lng: p.lng }; el.querySelector('#no').value = 'Mi ubicación'; pintar(); } catch (e) { UI.toast('No se pudo obtener la ubicación'); } };
  el.querySelector('#swd').onclick = e => { const on = e.currentTarget.getAttribute('aria-checked') !== 'true'; e.currentTarget.setAttribute('aria-checked', on); el.querySelector('#fd').classList.toggle('hidden', on); st.destino = on ? null : { nombre: el.querySelector('#nd').value }; };
  el.querySelector('#nd').onchange = e => st.destino = { nombre: e.target.value };
  el.querySelectorAll('#ndur button').forEach(b => b.onclick = () => { st.duracion = +b.dataset.m; el.querySelectorAll('#ndur button').forEach(x => x.classList.toggle('on', x === b)); });
  el.querySelector('#nq').addEventListener('input', U.debounce(e => { st.q = e.target.value; pintar(); }, 120));
  el.querySelector('#nloc').onchange = e => { st.loc = e.target.value; pintar(); };
  el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { st.filtro = b.dataset.f; el.querySelectorAll('[data-f]').forEach(x => x.classList.toggle('on', x === b)); pintar(); });
  el.querySelector('[data-rellenar]').onclick = () => {
    // elige hasta N clientes: primero fuera de plazo, luego próximos, los más cercanos al origen (y a la localidad elegida)
    const horas = (U.parseTime(st.limite) - U.parseTime(st.salida)) / 60; const n = Math.max(3, Math.min(10, Math.floor(horas / ((st.duracion + 25) / 60))));
    const pool = clientes.filter(c => !st.loc || c.localidad === st.loc).map(c => ({ c, e: U.estado(c), d: distO(c) })).filter(x => ['rojo', 'ambar', 'azul'].includes(x.e.key)).sort((x, y) => { const o = { rojo: 0, azul: 1, ambar: 2 }; if (o[x.e.key] !== o[y.e.key]) return o[x.e.key] - o[y.e.key]; return x.d - y.d; });
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
      if (!st.origen.lat) { const g = await GEO.geocodeTexto(st.origen.nombre); if (!g) throw new Error('No encuentro el punto de salida'); st.origen = { nombre: st.origen.nombre, lat: g.lat, lng: g.lng }; }
      let destino = st.origen;
      if (st.destino && st.destino.nombre) { const g = await GEO.geocodeTexto(st.destino.nombre); if (!g) throw new Error('No encuentro el punto de llegada'); destino = { nombre: st.destino.nombre, lat: g.lat, lng: g.lng }; }
      const ruta = Object.assign(await APP.nuevaRutaBase(st.fecha), { origen: st.origen, destino, salida: st.salida, limite: st.limite, duracion: st.duracion });
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
    s.querySelector('[data-a=ok]').onclick = () => { const v = s.querySelector('#hx').value || null; UI._sheet.onClose = null; UI.closeSheet(); res(v); };
    s.querySelector('[data-a=q]').onclick = () => { UI._sheet.onClose = null; UI.closeSheet(); res(null); };
  });
}

/* ======================= RUTA ======================= */
SCREENS.ruta = async ({ id }) => {
  const r = await db.rutas.get(id);
  if (!r || r.deleted) return screen(topbar('Ruta') + '<div class="empty">Ruta no encontrada</div>', { nav: false });
  const byId = await clientesById();
  const hoy = U.today(); const esHoy = r.fecha === hoy;
  const pend = r.paradas.filter(p => !p.hecho); const next = pend[0];
  const filas = r.paradas.map((p, i) => {
    const c = byId[p.clienteId] || { nombre: '(cliente eliminado)' }; const e = c.id ? U.estado(c) : { key: 'gris', dias: null };
    const esNext = next && p === next;
    return `<div class="tl-row ${p.hecho ? 'done' : ''} ${esNext ? 'next' : ''}" data-i="${i}"><div class="tl-time">${U.fmtTime(p.inicio)}</div><div class="tl-mark"><span class="dot ${p.hecho ? 'gris' : e.key}" style="color:var(--${p.hecho ? 'gris' : e.key})"></span></div>
      <div class="tl-body">${esNext ? '<div class="small bold" style="letter-spacing:.05em;text-transform:uppercase;color:var(--accent)">Siguiente</div>' : ''}
        <div class="row" style="gap:8px"><a class="name" href="#" data-go="ficha:${c.id}">${U.esc(c.nombre)}</a>${p.horaFija ? `<span class="pill dark">CITA ${U.esc(p.horaFija)}</span>` : ''}</div>
        <div class="meta">${U.esc(c.localidad || '')} · ${e.dias == null ? 'sin visitar' : e.dias + ' días sin visita'}${p.llegada != null && p.inicio - p.llegada > 2 ? ` · espera ${Math.round(p.inicio - p.llegada)} min` : ''}${p.hecho ? ' · hecha' : ''}</div>
        ${!p.hecho ? `<div class="tl-actions"><a class="btn primary" href="${U.mapsUrl(c)}" target="_blank" rel="noopener">${I.svg(I.nav, 14)} Iniciar visita</a><button class="btn" data-hecha="${c.id}">Registrar</button><button class="btn ghost" data-menu="${i}" aria-label="Más">⋯</button></div>` : ''}</div></div>`;
  }).join('');
  const noCaben = (r.noCaben || []).map(cid => byId[cid]).filter(Boolean);
  const el = screen(topbar(esHoy ? 'Ruta de hoy' : 'Ruta del ' + U.fmtDate(r.fecha), `<button class="iconbtn" data-share aria-label="Compartir">${I.svg(I.share, 20)}</button>`) + `
    <div class="section" style="padding-top:4px"><div class="muted bold">${r.paradas.length} visitas · ${U.fmtKm(r.km)} · ${U.fmtDur(r.conduccion)} de conducción${r.estimado ? ' (estimado, sin conexión)' : ''}</div>
      ${!r.ok && pend.length ? `<div class="card rojo small bold">No llega a todo dentro del horario (${r.salida}–${r.limite}). Quita alguna visita o amplía el límite.</div>` : ''}
      <div class="btn-row"><button class="btn sm outline" data-recalc>${I.svg(I.refresh, 16)} Recalcular</button><button class="btn sm outline" data-add>${I.svg(I.plus, 16)} Añadir cliente</button><button class="btn sm outline" data-edit>${I.svg(I.clock, 16)} Horario</button></div></div>
    <div class="tl" style="margin-top:14px">
      <div class="tl-row"><div class="tl-time">${U.esc(r.salida)}</div><div class="tl-mark"><span class="end"></span></div><div class="tl-body"><div class="meta bold">Salida · ${U.esc(r.origen?.nombre || '')}</div></div></div>
      ${filas}
      <div class="tl-row"><div class="tl-time">${U.fmtTime(r.fin)}</div><div class="tl-mark"><span class="end fill"></span></div><div class="tl-body"><div class="meta bold">Llegada · ${U.esc(r.destino?.nombre || '')}</div></div></div></div>
    ${noCaben.length ? `<div class="section"><div class="section-title">No caben en el horario</div>${noCaben.map(c => clienteItem(c)).join('')}</div>` : ''}
    <div class="section"><button class="btn danger" data-del>Eliminar ruta</button></div>`, { nav: false });
  wireBack(el); wireGo(el);
  el.querySelectorAll('[data-hecha]').forEach(b => b.onclick = () => sheetVisita(b.dataset.hecha, { rutaId: r.id }));
  el.querySelectorAll('[data-menu]').forEach(b => b.onclick = () => {
    const i = +b.dataset.menu; const p = r.paradas[i]; const c = byId[p.clienteId];
    const s = UI.sheet(`<div class="grip"></div><h2>${U.esc(c?.nombre || '')}</h2><div class="col" style="gap:8px">
      <button class="btn" data-a="hora">${p.horaFija ? 'Cambiar hora fija (' + p.horaFija + ')' : 'Poner hora fija'}</button>
      <button class="btn" data-a="up" ${i === 0 ? 'disabled' : ''}>${I.svg(I.up, 18)} Subir</button><button class="btn" data-a="down" ${i === r.paradas.length - 1 ? 'disabled' : ''}>${I.svg(I.down, 18)} Bajar</button>
      <button class="btn" data-a="saltar">Marcar como hecha sin registrar</button><button class="btn danger" data-a="quitar">Quitar de la ruta</button></div>`);
    const manual = async () => { // recalcula horas manteniendo el orden
      const hechas = r.paradas.filter(x => x.hecho), pendientes = r.paradas.filter(x => !x.hecho && byId[x.clienteId]?.lat);
      const dow = U.parseDate(r.fecha).getDay();
      let inicio = r.origen, salida = U.parseTime(r.salida);
      if (hechas.length) { const l = byId[hechas[hechas.length - 1].clienteId]; if (l?.lat) inicio = l; salida = Math.max(salida, hechas[hechas.length - 1].fin || salida); }
      const stops = pendientes.map(x => { const c = byId[x.clienteId]; return { lat: c.lat, lng: c.lng, horaFija: x.horaFija ? U.parseTime(x.horaFija) : null, duracion: x.duracion || r.duracion, ventanas: ROUTE.ventanas(c.horario, APP.ajustes.horario, dow) }; });
      const m = await GEO.matrix([inicio, ...stops, r.destino]);
      const res = ROUTE.simular(stops, stops.map((_, k) => k), { salida, limite: U.parseTime(r.limite), dur: m.dur, dist: m.dist });
      r.paradas = [...hechas, ...res.plan.map(pl => Object.assign({}, pendientes[pl.i], { llegada: pl.llegada, inicio: pl.inicio, fin: pl.fin, viaje: pl.viaje }))];
      r.km = res.km; r.conduccion = res.conduccion; r.fin = res.fin; r.ok = res.ok; r.estimado = m.estimado;
      await DB.save('rutas', r);
    };
    s.querySelector('[data-a=hora]').onclick = async () => { UI.closeSheet(); const v = await sheetHora(p.horaFija); if (v !== undefined) { p.horaFija = v; await APP.replanRuta(r); } };
    s.querySelector('[data-a=up]').onclick = async () => { UI.closeSheet(); if (i > 0 && !r.paradas[i - 1].hecho) { [r.paradas[i - 1], r.paradas[i]] = [r.paradas[i], r.paradas[i - 1]]; await manual(); } };
    s.querySelector('[data-a=down]').onclick = async () => { UI.closeSheet(); if (i < r.paradas.length - 1) { [r.paradas[i + 1], r.paradas[i]] = [r.paradas[i], r.paradas[i + 1]]; await manual(); } };
    s.querySelector('[data-a=saltar]').onclick = async () => { UI.closeSheet(); p.hecho = true; await DB.save('rutas', r); };
    s.querySelector('[data-a=quitar]').onclick = async () => { UI.closeSheet(); r.paradas.splice(i, 1); await APP.replanRuta(r); };
  });
  el.querySelector('[data-recalc]').onclick = async e => { e.target.disabled = true; UI.toast('Recalculando…', 1500); await APP.replanRuta(r, { desdeAhora: esHoy }); };
  el.querySelector('[data-add]').onclick = async () => {
    const cs = (await DB.clientes()).filter(c => c.lat && !r.paradas.some(p => p.clienteId === c.id));
    const s = UI.sheet(`<div class="grip"></div><h2>Añadir cliente</h2><div class="search" style="margin:0">${I.svg(I.search, 20)}<input id="aq" placeholder="Buscar" autocomplete="off"></div><div class="list" id="al" style="padding:0"></div>`);
    const al = s.querySelector('#al'); const o = r.origen;
    const pintar = q => { q = U.norm(q); const hits = cs.filter(c => !q || U.norm(c.nombre + ' ' + c.localidad).includes(q)).sort((x, y) => U.haversineKm(o, x) - U.haversineKm(o, y)).slice(0, 40); al.innerHTML = hits.map(c => clienteItem(c, Math.round(U.haversineKm(o, c)) + ' km').replace('data-go="ficha:', 'data-pick="')).join('') || '<div class="empty">Nada</div>'; al.querySelectorAll('[data-pick]').forEach(b => b.onclick = async () => { UI.closeSheet(); const cid = b.dataset.pick; const v = await sheetHora(null); if (v === undefined) return; r.paradas.push({ clienteId: cid, horaFija: v, duracion: r.duracion, hecho: false }); UI.toast('Calculando…', 1500); await APP.replanRuta(r); }); };
    pintar(''); s.querySelector('#aq').addEventListener('input', e => pintar(e.target.value));
  };
  el.querySelector('[data-edit]').onclick = () => {
    const s = UI.sheet(`<div class="grip"></div><h2>Horario de la ruta</h2><div class="field-row"><div class="field"><label for="es">Salida</label>${UI.horaInput('es', r.salida)}</div><div class="field"><label for="el">Límite</label>${UI.horaInput('el', r.limite)}</div></div>
      <div class="field"><label for="eo">Salgo desde</label><input id="eo" value="${U.esc(r.origen?.nombre || '')}"></div><div class="field"><label for="ed">Termino en</label><input id="ed" value="${U.esc(r.destino?.nombre || '')}"></div>
      <button class="btn primary big" data-ok>Guardar y recalcular</button>`);
    s.querySelector('[data-ok]').onclick = async e => {
      e.target.disabled = true;
      try {
        r.salida = s.querySelector('#es').value || r.salida; r.limite = s.querySelector('#el').value || r.limite;
        const o = s.querySelector('#eo').value.trim(), d = s.querySelector('#ed').value.trim();
        if (o && o !== r.origen?.nombre) { const g = await GEO.geocodeTexto(o); if (!g) throw new Error('No encuentro el punto de salida'); r.origen = { nombre: o, lat: g.lat, lng: g.lng }; }
        if (d && d !== r.destino?.nombre) { const g = await GEO.geocodeTexto(d); if (!g) throw new Error('No encuentro el punto de llegada'); r.destino = { nombre: d, lat: g.lat, lng: g.lng }; }
        UI.closeSheet(); await APP.replanRuta(r);
      } catch (err) { UI.toast(err.message); e.target.disabled = false; }
    };
  };
  el.querySelector('[data-share]').onclick = async () => {
    const txt = [`Ruta ${esHoy ? 'de hoy' : 'del ' + U.fmtDate(r.fecha)} · ${r.paradas.length} visitas · ${U.fmtKm(r.km)}`, `Salida ${r.salida} desde ${r.origen?.nombre || ''}`, ...r.paradas.map((p, i) => { const c = byId[p.clienteId] || {}; return `${i + 1}. ${U.fmtTime(p.inicio)} ${c.nombre || ''} (${c.localidad || ''})${p.horaFija ? ' · cita ' + p.horaFija : ''}${p.hecho ? ' ✓' : ''}`; }), `Llegada ${U.fmtTime(r.fin)} a ${r.destino?.nombre || ''}`].join('\n');
    await XIO.compartirTexto(txt, 'Ruta');
  };
  el.querySelector('[data-del]').onclick = async () => { if (await UI.confirm('¿Eliminar esta ruta?', 'Las visitas registradas no se borran.', { ok: 'Eliminar', danger: true })) { await DB.softDelete('rutas', r.id); APP.go('rutas', {}, true); } };
  return el;
};

/* ======================= EDITAR / NUEVO CLIENTE ======================= */
SCREENS.editarCliente = async ({ id }) => {
  const nuevo = !id; const c = nuevo ? { id: U.uuid(), nombre: '', calle: '', numero: '', cp: '', localidad: '', provincia: '', telefono: '', contacto: '', tamano: 'mediano', frecuenciaDias: APP.ajustes.frecuenciaDias, ultimaVisita: null, nota: '', horario: null } : await DB.cliente(id);
  const h = Object.assign({ lunesCerrado: false, lunesTodoCerrado: false, cierraSabado: false, cierraMediodia: null, abre: '', cierra: '' }, c.horario || {});
  const FREQ = [[15, 'Quincenal'], [30, 'Mensual'], [60, 'Bimensual'], [90, 'Trimestral'], [180, '6 meses']];
  const el = screen(topbar(nuevo ? 'Nuevo cliente' : 'Editar cliente') + `<form class="section" style="padding-top:4px;gap:14px" id="f">
    <div class="field"><label for="cn">Nombre *</label><input id="cn" value="${U.esc(c.nombre)}" required></div>
    <div class="field-row"><div class="field" style="flex:3"><label for="cc">Calle</label><input id="cc" value="${U.esc(c.calle)}"></div><div class="field"><label for="cnu">Nº</label><input id="cnu" value="${U.esc(c.numero)}"></div></div>
    <div class="field-row"><div class="field"><label for="ccp">CP</label><input id="ccp" value="${U.esc(c.cp)}" inputmode="numeric"></div><div class="field" style="flex:2"><label for="cl">Localidad</label><input id="cl" value="${U.esc(c.localidad)}"></div></div>
    <div class="field-row"><div class="field"><label for="ct">Teléfono</label><input id="ct" value="${U.esc(c.telefono || '')}" inputmode="tel"></div><div class="field"><label for="cco">Contacto</label><input id="cco" value="${U.esc(c.contacto || '')}"></div></div>
    <div class="field"><label for="ccod">Código de cliente (el de la empresa)</label><input id="ccod" value="${U.esc(c.codigo || '')}"></div>
    <div class="field"><label>Tamaño</label><div class="seg c3" id="ctam">${['pequeño', 'mediano', 'grande'].map(t => `<button type="button" data-t="${t}" class="${c.tamano === t ? 'on' : ''}">${U.tamanoLabel(t)}</button>`).join('')}</div></div>
    <div class="field"><label>Frecuencia de visita</label><div class="seg c3" id="cfr">${FREQ.map(([d, l]) => `<button type="button" data-d="${d}" class="${c.frecuenciaDias === d ? 'on' : ''}">${l}</button>`).join('')}${FREQ.some(([d]) => d === c.frecuenciaDias) ? '' : `<button type="button" data-d="${c.frecuenciaDias}" class="on">Cada ${c.frecuenciaDias} d</button>`}</div></div>
    <div class="field"><label for="cuv">Última visita</label><input type="date" id="cuv" value="${c.ultimaVisita || ''}"></div>
    <div class="section-title" style="margin-top:6px">Horario (solo si difiere del habitual)</div>
    <div class="switch-row"><span class="bold">Lunes por la mañana cerrado</span><button type="button" class="switch" data-h="lunesCerrado" role="switch" aria-checked="${h.lunesCerrado}"></button></div>
    <div class="switch-row"><span class="bold">Lunes cerrado todo el día</span><button type="button" class="switch" data-h="lunesTodoCerrado" role="switch" aria-checked="${h.lunesTodoCerrado}"></button></div>
    <div class="switch-row"><span class="bold">Sábado cerrado</span><button type="button" class="switch" data-h="cierraSabado" role="switch" aria-checked="${h.cierraSabado}"></button></div>
    <div class="switch-row"><span class="bold">No cierra al mediodía</span><button type="button" class="switch" data-h="noMediodia" role="switch" aria-checked="${h.cierraMediodia === false}"></button></div>
    <div class="field-row"><div class="field"><label for="cha">Abre</label>${UI.horaInput('cha', h.abre)}</div><div class="field"><label for="chc">Cierra</label>${UI.horaInput('chc', h.cierra)}</div></div>
    <div class="field"><label for="cno">Notas</label><div class="row"><textarea id="cno" class="grow">${U.esc(c.nota || '')}</textarea>${UI.micBtn('cno')}</div></div>
    <button class="btn primary big" type="submit">${nuevo ? 'Crear cliente' : 'Guardar'}</button>
    ${!nuevo ? '<button class="btn danger" type="button" data-del>Eliminar cliente</button>' : ''}</form>`, { nav: false, static: true });
  wireBack(el); UI.wireMics(el);
  el.querySelectorAll('#ctam button').forEach(b => b.onclick = () => { c.tamano = b.dataset.t; el.querySelectorAll('#ctam button').forEach(x => x.classList.toggle('on', x === b)); });
  el.querySelectorAll('#cfr button').forEach(b => b.onclick = () => { c.frecuenciaDias = +b.dataset.d; el.querySelectorAll('#cfr button').forEach(x => x.classList.toggle('on', x === b)); });
  el.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { const on = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', on); if (b.dataset.h === 'noMediodia') h.cierraMediodia = on ? false : null; else h[b.dataset.h] = on; });
  el.querySelector('#f').onsubmit = async e => {
    e.preventDefault();
    const g = i => el.querySelector('#' + i).value.trim();
    const antes = [c.calle, c.numero, c.cp, c.localidad].join('|');
    Object.assign(c, { nombre: g('cn'), calle: g('cc'), numero: g('cnu'), cp: g('ccp'), localidad: g('cl'), telefono: g('ct'), contacto: g('cco'), codigo: g('ccod'), ultimaVisita: g('cuv') || null, nota: g('cno') });
    if (!c.nombre) return;
    const hor = {}; if (h.lunesCerrado) hor.lunesCerrado = true; if (h.lunesTodoCerrado) hor.lunesTodoCerrado = true; if (h.cierraSabado) hor.cierraSabado = true; if (h.cierraMediodia === false) hor.cierraMediodia = false; if (g('cha')) hor.abre = g('cha'); if (g('chc')) hor.cierra = g('chc');
    c.horario = Object.keys(hor).length ? hor : null;
    if ([c.calle, c.numero, c.cp, c.localidad].join('|') !== antes && c.geocodeStatus !== 'manual') { c.lat = null; c.lng = null; c.geocodeStatus = 'pendiente'; }
    await DB.save('clientes', c);
    if (!c.lat) { UI.toast('Buscando la dirección en el mapa…'); APP.geocodificarPendientes(); }
    APP.go('ficha', { id: c.id }, true);
  };
  el.querySelector('[data-del]')?.addEventListener('click', async () => { if (await UI.confirm('¿Eliminar este cliente?', 'Se conservan sus visitas y pedidos en el historial.', { ok: 'Eliminar', danger: true })) { await DB.softDelete('clientes', c.id); APP.go('clientes', {}, true); } });
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
    const start = c.lat ? [c.lat, c.lng] : [41.6, 1.9];
    map.setView(start, c.lat ? 16 : 8);
    const mk = L.marker(start, { draggable: true, icon: UI.pin('rojo') }).addTo(map);
    map.on('click', e => mk.setLatLng(e.latlng));
    el.querySelector('[data-buscar]').onclick = async e => { e.target.disabled = true; const r = await GEO.geocode(c); e.target.disabled = false; if (r) { mk.setLatLng([r.lat, r.lng]); map.setView([r.lat, r.lng], r.precision === 'localidad' ? 13 : 16); UI.toast(r.precision === 'localidad' ? 'Solo encontré la localidad' : 'Dirección encontrada'); } else UI.toast('No encontré la dirección'); };
    el.querySelector('[data-ok]').onclick = async () => { const p = mk.getLatLng(); c.lat = +p.lat.toFixed(6); c.lng = +p.lng.toFixed(6); c.geocodeStatus = 'manual'; await DB.save('clientes', c); UI.toast('Ubicación guardada'); APP.back(); };
  };
  return el;
};

/* ======================= AJUSTES ======================= */
SCREENS.ajustes = async () => {
  const a = APP.ajustes; const h = a.horario;
  const [counts, clientes, lastBackup, demo] = await Promise.all([DB.counts(), DB.clientes(), DB.get('lastBackup', null), DB.get('demoCargada', false)]);
  const pendGeo = clientes.filter(c => !c.lat && c.geocodeStatus !== 'manual').length, fallos = clientes.filter(c => !c.lat && c.geocodeStatus === 'fallo').length, aprox = clientes.filter(c => c.geocodeStatus === 'aprox').length;
  const syncTxt = { off: 'Desactivada', 'sin-sesion': 'Configurada, sin iniciar sesión', ok: SYNC.error ? 'Error: ' + SYNC.error : (SYNC.ultimo ? 'Al día · ' + U.fmtDate(SYNC.ultimo, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Activa'), error: 'Error: ' + SYNC.error }[SYNC.estado];
  const el = screen(topbar('Ajustes') + `
    <div class="section"><div class="section-title">Datos</div>
      <div class="muted small">${counts.clientes} clientes · ${counts.visitas} visitas · ${counts.pedidos} pedidos · ${counts.catalogo} artículos en catálogo</div>
      <button class="btn" data-go="importar">${I.svg(I.file, 18)} Importar clientes desde Excel</button>
      <button class="btn" data-go="importarCatalogo">${I.svg(I.file, 18)} Importar catálogo de productos</button>
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
  el.querySelector('[data-ao]').onclick = async e => { const t = el.querySelector('#ao').value.trim(); if (!t) return; e.target.disabled = true; const g = await GEO.geocodeTexto(t); e.target.disabled = false; if (!g) { UI.toast('No encuentro ese lugar'); return; } await APP.guardarAjustes({ origen: { nombre: t, lat: g.lat, lng: g.lng } }); UI.toast('Punto de salida guardado'); };
  el.querySelector('[data-expcli]').onclick = async () => { await XIO.compartir(XIO.clientesXlsx(clientes), `clientes_${U.today()}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Clientes'); };
  el.querySelector('[data-geo]')?.addEventListener('click', async e => { e.target.disabled = true; const gp = el.querySelector('#gp'); gp.classList.remove('hidden'); await APP.geocodificarPendientes(g => { gp.firstElementChild.style.width = (g.hechos / g.total * 100) + '%'; }); UI.toast('Búsqueda terminada'); });
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
  el.querySelector('[data-demo]')?.addEventListener('click', async e => { e.target.disabled = true; const n = await APP.cargarDemo(); UI.toast(`${n} clientes de prueba cargados`); });
  el.querySelector('[data-borrardemo]')?.addEventListener('click', async () => { if (await UI.confirm('¿Eliminar los clientes de prueba?', 'Se eliminan los clientes marcados como demo, con sus visitas y pedidos.', { ok: 'Eliminar', danger: true })) { const ids = clientes.filter(c => c.demo).map(c => c.id); for (const id of ids) await DB.softDelete('clientes', id); const vs = (await db.visitas.toArray()).filter(v => ids.includes(v.clienteId)); for (const v of vs) await DB.softDelete('visitas', v.id); const ps = (await db.pedidos.toArray()).filter(p => ids.includes(p.clienteId)); for (const p of ps) await DB.softDelete('pedidos', p.id); await DB.set('demoCargada', false); UI.toast('Datos de prueba eliminados'); } });
  el.querySelector('[data-wipe]').onclick = async () => { if (await UI.confirm('¿Borrar TODO?', 'Clientes, visitas, pedidos, rutas y catálogo de este móvil. Haz una copia antes.', { ok: 'Borrar todo', danger: true })) { await DB.wipe(); await DB.set('demoCargada', false); UI.toast('Datos borrados'); APP.go('hoy', {}, true); } };
  el.querySelector('[data-install]')?.addEventListener('click', async () => { APP.installPrompt.prompt(); APP.installPrompt = null; });
  return el;
};

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
        if (quitar) { await APP.clearPin(); UI.closeSheet(); UI.toast('PIN desactivado'); APP.render(); return true; }
        paso = 'nuevo'; pintar(); return true;
      }
      if (paso === 'nuevo') { if (pin.length < 4) return 'Mínimo 4 cifras'; nuevo = pin; paso = 'confirmar'; pintar(); return true; }
      if (pin !== nuevo) { paso = 'nuevo'; pintar(); return 'No coinciden, vuelve a empezar'; }
      await APP.setPin(pin); APP.pin.len = pin.length; await DB.set('pin', APP.pin);
      UI.closeSheet(); UI.toast('PIN activado'); APP.render(); return true;
    } }));
  };
  pintar();
}

async function sheetSync() {
  const cfg = SYNC.cfg || {};
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
  s.querySelector('[data-a=in]')?.addEventListener('click', async e => { e.target.disabled = true; try { await conf(); await SYNC.login(g('se'), g('sp')); UI.closeSheet(); UI.toast('Copia en línea activada'); APP.render(); } catch (err) { UI.toast(err.message); e.target.disabled = false; } });
  s.querySelector('[data-a=reg]')?.addEventListener('click', async e => { e.target.disabled = true; try { await conf(); const r = await SYNC.registro(g('se'), g('sp')); UI.closeSheet(); UI.toast(r === 'confirmar' ? 'Revisa tu correo para confirmar la cuenta y luego inicia sesión' : 'Cuenta creada y copia activada', 5000); APP.render(); } catch (err) { UI.toast(err.message); e.target.disabled = false; } });
  s.querySelector('[data-a=now]')?.addEventListener('click', async e => { e.target.disabled = true; await SYNC.ahora(); UI.closeSheet(); UI.toast(SYNC.error ? SYNC.error : 'Sincronizado'); APP.render(); });
  s.querySelector('[data-a=out]')?.addEventListener('click', async () => { await SYNC.logout(); UI.closeSheet(); APP.render(); });
  s.querySelector('[data-a=off]')?.addEventListener('click', async () => { await SYNC.desactivar(); UI.closeSheet(); APP.render(); });
  s.querySelector('[data-a=copysql]')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(SYNC.SQL); UI.toast('SQL copiado'); } catch (e) { UI.toast('No se pudo copiar'); } });
}

SCREENS.sinUbicacion = async () => {
  const cs = (await DB.clientes()).filter(c => !c.lat || c.geocodeStatus === 'aprox');
  const el = screen(topbar('Sin ubicación') + `<div class="section" style="padding-top:0"><div class="muted small">Toca un cliente para situarlo en el mapa a mano.</div></div><div class="list">${cs.map(c => `<button class="item" data-go="ubicacion:${c.id}"><div class="col grow"><div class="name">${U.esc(c.nombre)}</div><div class="meta">${U.esc(U.direccion(c).full)}</div></div><div class="right ${c.lat ? 'tx-ambar' : 'tx-rojo'}">${c.lat ? 'aprox.' : (c.geocodeStatus === 'fallo' ? 'no encontrada' : 'pendiente')}</div></button>`).join('') || '<div class="empty">Todos los clientes están situados</div>'}</div>`, { nav: false });
  wireBack(el); wireGo(el); return el;
};

/* ======================= IMPORTAR ======================= */
SCREENS.importar = async () => importarPantalla('clientes');
SCREENS.importarCatalogo = async () => importarPantalla('catalogo');
async function importarPantalla(tipo) {
  const esCli = tipo === 'clientes';
  const CAMPOS = esCli ? XIO.CAMPOS_CLIENTE : XIO.CAMPOS_CATALOGO;
  let leido = null, map = {};
  const el = screen(topbar(esCli ? 'Importar clientes' : 'Importar catálogo') + `
    <div class="section" style="padding-top:0"><div class="muted small">${esCli ? 'Excel o CSV con una fila por cliente. La primera fila debe tener los títulos de las columnas (nombre, dirección, CP, localidad…). Después se buscan las direcciones en el mapa.' : 'Excel o CSV con referencia/ISBN, título y precio. Sirve para apuntar pedidos buscando por título.'}</div>
      <label class="btn primary big" style="cursor:pointer">${I.svg(I.file, 20)} Elegir archivo<input type="file" accept=".xlsx,.xls,.csv" data-file class="sr-only"></label></div>
    <div class="section hidden" id="mapeo"><div class="section-title">Columnas</div><div class="muted small" id="info"></div><div class="col" id="campos" style="gap:10px"></div>
      <div class="field"><label>Si el cliente ya existe</label><div class="seg c2" id="modo"><button class="on" data-m="actualizar">Actualizar datos</button><button data-m="saltar">No tocar</button></div></div>
      <button class="btn primary big" data-ok>Importar</button></div>
    <div class="section hidden" id="prog"><div class="bold" id="ptxt"></div><div class="progress"><div></div></div><button class="btn outline" data-stop>Parar (se puede continuar luego)</button></div>`, { nav: false, static: true });
  wireBack(el);
  let modo = 'actualizar';
  el.querySelectorAll('#modo button').forEach(b => b.onclick = () => { modo = b.dataset.m; el.querySelectorAll('#modo button').forEach(x => x.classList.toggle('on', x === b)); });
  if (!esCli) el.querySelector('#modo').parentElement.classList.add('hidden');
  el.querySelector('[data-file]').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { leido = await XIO.leer(f); } catch (err) { UI.toast(err.message); return; }
    map = XIO.sugerirMapeo(leido.headers, CAMPOS);
    el.querySelector('#info').textContent = `${leido.rows.length} filas en «${leido.hoja}». Comprueba qué columna corresponde a cada dato:`;
    el.querySelector('#campos').innerHTML = CAMPOS.map(([k, label]) => `<div class="field"><label for="m_${k}">${label}${['nombre', 'titulo'].includes(k) ? ' *' : ''}</label><select id="m_${k}" data-k="${k}"><option value="">— no importar —</option>${leido.headers.map(h => `<option ${map[k] === h ? 'selected' : ''}>${U.esc(h)}</option>`).join('')}</select></div>`).join('');
    el.querySelector('#campos').querySelectorAll('select').forEach(s => s.onchange = () => { if (s.value) map[s.dataset.k] = s.value; else delete map[s.dataset.k]; });
    el.querySelector('#mapeo').classList.remove('hidden');
  };
  el.querySelector('[data-ok]').onclick = async e => {
    if (!leido) return;
    if (esCli && !map.nombre) { UI.toast('Indica la columna del nombre'); return; }
    if (!esCli && !map.titulo && !map.ref) { UI.toast('Indica la columna del título'); return; }
    e.target.disabled = true;
    if (!esCli) {
      const items = XIO.filasACatalogo(leido.rows, map);
      await db.catalogo.bulkPut(items); await db.outbox.bulkPut(items.map(i => ({ kind: 'catalogo', id: i.ref, at: U.now() })));
      DB.changed('catalogo'); UI.toast(`${items.length} artículos importados`); APP.back(); return;
    }
    const nuevos = XIO.filasAClientes(leido.rows, map, { frecuenciaDias: APP.ajustes.frecuenciaDias });
    const existentes = await DB.clientes();
    const porCodigo = new Map(existentes.filter(c => c.codigo).map(c => [U.norm(c.codigo), c])), porNombre = new Map(existentes.map(c => [U.norm(c.nombre) + '|' + (c.cp || ''), c]));
    let creados = 0, actualizados = 0, saltados = 0; const aGuardar = [];
    for (const n of nuevos) {
      const ex = (n.codigo && porCodigo.get(U.norm(n.codigo))) || porNombre.get(U.norm(n.nombre) + '|' + (n.cp || ''));
      if (ex) {
        if (modo === 'saltar') { saltados++; continue; }
        const dirCambia = [ex.calle, ex.numero, ex.cp, ex.localidad].join('|') !== [n.calle, n.numero, n.cp, n.localidad].join('|');
        Object.assign(ex, Object.fromEntries(Object.entries(n).filter(([k, v]) => v !== '' && v != null)));
        if (dirCambia && ex.geocodeStatus !== 'manual') { ex.lat = null; ex.lng = null; ex.geocodeStatus = 'pendiente'; }
        aGuardar.push(ex); actualizados++;
      } else { aGuardar.push(Object.assign({ id: U.uuid(), geocodeStatus: 'pendiente', lat: null, lng: null }, n)); creados++; }
    }
    await DB.bulkSave('clientes', aGuardar);
    UI.toast(`${creados} nuevos · ${actualizados} actualizados · ${saltados} sin cambios`, 4000);
    el.querySelector('#mapeo').classList.add('hidden'); const prog = el.querySelector('#prog'); prog.classList.remove('hidden');
    const bar = prog.querySelector('.progress > div'), txt = el.querySelector('#ptxt');
    el.querySelector('[data-stop]').onclick = () => { APP.geo.parar = true; };
    if (!navigator.onLine) { txt.textContent = 'Sin conexión: las direcciones se buscarán cuando la haya (Ajustes → Buscar direcciones).'; return; }
    txt.textContent = 'Buscando direcciones en el mapa… (aprox. 2 segundos por cliente)';
    const g = await APP.geocodificarPendientes(g => { bar.style.width = (g.hechos / g.total * 100) + '%'; txt.textContent = `Buscando direcciones… ${g.hechos} de ${g.total}`; });
    const fallos = (await DB.clientes()).filter(c => !c.lat).length;
    txt.textContent = `Listo. ${fallos ? fallos + ' direcciones no se encontraron: sitúalas a mano desde Ajustes → Ver lista.' : 'Todas las direcciones situadas.'}`;
    prog.querySelector('[data-stop]').classList.add('hidden');
    prog.appendChild(UI.el(`<button class="btn primary" data-fin>Ir a clientes</button>`)); prog.querySelector('[data-fin]').onclick = () => APP.go('clientes', {}, true);
  };
  return el;
}
