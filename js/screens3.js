/* Pantallas y piezas nuevas: Tareas, Ventas, zonas, mensaje previo a la visita, teléfono/WhatsApp, editor de horario */

/* ======================= ZONAS ======================= */
const ZONAS = {
  lista() { return APP.ajustes.zonas || []; },
  de(c) { const com = U.comarca(c); return ZONAS.lista().filter(z => (z.comarcas || []).includes(com) || (z.localidades || []).some(l => U.norm(l) === U.norm(c.localidad))); },
  /* valor de filtro: '' | 'z:<id>' (zona propia) | 'c:<comarca>' | 'l:<localidad>' */
  cumple(c, v) {
    if (!v) return true;
    const [t, x] = [v.slice(0, 1), v.slice(2)];
    if (t === 'z') return ZONAS.de(c).some(z => z.id === x);
    if (t === 'c') return U.comarca(c) === x;
    if (t === 'l') return c.localidad === x;
    return true;
  },
  opciones(clientes, valor, { localidades = false, todas = 'Todas las zonas' } = {}) {
    const coms = [...new Set(clientes.map(U.comarca).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const locs = localidades ? [...new Set(clientes.map(c => c.localidad).filter(Boolean))].sort((a, b) => a.localeCompare(b)) : [];
    const op = (v, l) => `<option value="${U.esc(v)}" ${v === valor ? 'selected' : ''}>${U.esc(l)}</option>`;
    return op('', todas) + (ZONAS.lista().length ? `<optgroup label="Mis zonas">${ZONAS.lista().map(z => op('z:' + z.id, z.nombre)).join('')}</optgroup>` : '')
      + (coms.length ? `<optgroup label="Comarcas">${coms.map(x => op('c:' + x, x)).join('')}</optgroup>` : '')
      + (locs.length ? `<optgroup label="Localidades">${locs.map(x => op('l:' + x, x)).join('')}</optgroup>` : '');
  },
  /* color de zona por orden fijo (--z1..--z8); sin zona: gris */
  color(c) { const z = ZONAS.de(c)[0]; if (!z) return null; const i = ZONAS.lista().indexOf(z); return i < 8 ? `var(--z${i + 1})` : null; },
};

/* ======================= TELÉFONO / WHATSAPP ======================= */
function sheetTelefono(c) {
  const fijo = c.telefono && !U.esMovil(c.telefono) ? c.telefono : '', movil = U.movil(c), canal = U.canal(c);
  const s = UI.sheet(`<div class="grip"></div><h2>${U.esc(c.contacto || c.nombre)}</h2><div class="col" style="gap:8px">
    ${movil ? `<a class="btn big" href="tel:${U.esc(movil)}">${I.svg(I.phone, 20)} Llamar al móvil · ${U.esc(movil)}</a>` : ''}
    ${fijo ? `<a class="btn big" href="tel:${U.esc(fijo)}">${I.svg(I.phone, 20)} Llamar · ${U.esc(fijo)}</a>` : ''}
    ${canal === 'whatsapp' ? `<button class="btn primary big" data-wa>WhatsApp</button>` : ''}
    ${canal === 'sms' ? `<button class="btn primary big" data-wa>SMS</button>` : ''}
    ${!canal ? '<div class="muted small center">Sin móvil: no se puede escribir por WhatsApp. Añádelo en la ficha (Editar).</div>' : ''}</div>`);
  s.querySelector('[data-wa]')?.addEventListener('click', () => { U.abrir(U.urlMensaje(c, '')); UI.closeSheet(); });
}

/* ======================= MENSAJE PREVIO A LA VISITA ======================= */
const AVISO = {
  /* 'no' | 'avisado' | 'cambiada' (avisado, pero la hora ha cambiado más de 30 min desde el aviso) */
  estado(p) { if (!p.avisado) return 'no'; return p.avisadoHora != null && p.inicio != null && Math.abs(p.inicio - p.avisadoHora) > 30 ? 'cambiada' : 'avisado'; },
  texto(c, p, ruta, tipo) {
    const idioma = c.idioma === 'ca' ? 'ca' : 'es';
    const pl = (APP.ajustes.plantillas[tipo] || APP.PLANTILLAS[tipo] || APP.PLANTILLAS.estandar)[idioma] || APP.PLANTILLAS.estandar[idioma];
    const nombre = String(c.contacto || '').trim().split(/\s+/)[0] || '';
    const ini = p.inicio != null ? Math.round(p.inicio / 15) * 15 : null; // horas redondeadas al cuarto
    const vars = { nombre_contacto: nombre, dia: U.diaRelativo(ruta.fecha, idioma), hora: U.horaTexto(ini), desde: U.horaTexto(ini != null ? Math.floor(ini / 60) * 60 - 60 : null), hasta: U.horaTexto(ini != null ? Math.floor(ini / 60) * 60 + 60 : null), tienda: c.nombre };
    return pl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '').replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ').trim();
  },
  /* abre WhatsApp/SMS con el texto y marca la parada como avisada (el envío real se hace en WhatsApp) */
  async enviar(ruta, clienteId, tipo) {
    const c = await DB.cliente(clienteId); const p = ruta.paradas.find(x => x.clienteId === clienteId); if (!c || !p) return false;
    const t = tipo || (AVISO.estado(p) === 'cambiada' ? 'relance' : APP.ajustes.plantilla || 'estandar');
    const url = U.urlMensaje(c, AVISO.texto(c, p, ruta, t)); if (!url) return false;
    p.avisado = true; p.avisadoAt = U.now(); p.avisadoHora = p.inicio;
    await DB.save('rutas', ruta);
    U.abrir(url);
    return true;
  },
  async quitar(ruta, clienteId) { const p = ruta.paradas.find(x => x.clienteId === clienteId); if (!p) return; p.avisado = false; p.avisadoAt = null; p.avisadoHora = null; await DB.save('rutas', ruta); },
  /* «Avisar a todos»: cola de paradas por avisar; al volver a la app se propone la siguiente */
  cola: null,
  pendientes(ruta, byId) { return ruta.paradas.filter(p => !p.hecho && !p.noCabe && AVISO.estado(p) === 'no' && byId[p.clienteId] && U.canal(byId[p.clienteId])).map(p => p.clienteId); },
};

/* ======================= TAREAS ======================= */
function tareaGrupo(t, hoy) { if (!t.fecha) return 'sin'; if (t.fecha < hoy) return 'vencida'; if (t.fecha === hoy) return 'hoy'; return 'futura'; }
function tareaItem(t, byId, { conCliente = true } = {}) {
  const hoy = U.today(), g = tareaGrupo(t, hoy), c = t.clienteId && byId[t.clienteId];
  const cuando = !t.fecha ? 'Sin fecha' : t.fecha === hoy ? 'Hoy' : g === 'vencida' ? `Vencida · ${U.fmtDate(t.fecha)}` : U.fmtDate(t.fecha, { weekday: 'short', day: 'numeric', month: 'short' });
  return `<div class="task ${g === 'vencida' && !t.hechaAt ? 'vencida' : ''}"><input type="checkbox" data-hecha="${t.id}" ${t.hechaAt ? 'checked' : ''} aria-label="Hecha"><div class="col grow" data-editar="${t.id}" style="cursor:pointer"><div class="tt">${U.esc(t.texto)}</div><div class="tm">${t.hechaAt ? 'Hecha · ' + U.fmtDate(t.hechaAt) : U.esc(cuando)}${conCliente && c ? ' · ' + U.esc(c.nombre) : ''}</div></div></div>`;
}
function wireTareas(root) {
  root.querySelectorAll('[data-hecha]').forEach(cb => cb.onchange = async () => {
    const t = await db.tareas.get(cb.dataset.hecha); if (!t) return;
    t.hechaAt = cb.checked ? U.now() : null; await DB.save('tareas', t);
    if (cb.checked) UI.toast('Tarea hecha');
  });
  root.querySelectorAll('[data-editar]').forEach(el => el.onclick = async () => { const t = await db.tareas.get(el.dataset.editar); if (t) sheetTarea({ tarea: t }); });
}
/* Nueva tarea o edición. clienteId fija el cliente (desde la ficha); fecha por defecto: mañana desde una ficha, si no hoy. */
async function sheetTarea({ tarea = null, clienteId = null } = {}) {
  const t = tarea ? Object.assign({}, tarea) : { id: U.uuid(), texto: '', fecha: null, clienteId, hechaAt: null };
  const hoy = U.today(), manana = U.isoDate(new Date(Date.now() + 86400000));
  if (!tarea) t.fecha = clienteId ? manana : hoy;
  const clientes = t.clienteId && clienteId ? [] : await DB.clientes();
  const cFijo = t.clienteId ? await DB.cliente(t.clienteId) : null;
  const opc = () => [['hoy', 'Hoy', hoy], ['manana', 'Mañana', manana], ['otra', 'Otro día', null], ['sin', 'Sin fecha', null]];
  const sel = !t.fecha ? 'sin' : t.fecha === hoy ? 'hoy' : t.fecha === manana ? 'manana' : 'otra';
  const s = UI.sheet(`<div class="grip"></div><h2>${tarea ? 'Tarea' : 'Nueva tarea'}</h2>
    <div class="field"><div class="row"><textarea id="tt" class="grow" placeholder="Qué hay que hacer… (puedes dictarlo)">${U.esc(t.texto)}</textarea>${UI.micBtn('tt')}</div></div>
    <div class="seg c4" id="tf">${opc().map(([k, l]) => `<button type="button" data-f="${k}" class="${k === sel ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="field ${sel === 'otra' ? '' : 'hidden'}" id="tfo"><input type="date" id="tfd" value="${t.fecha || manana}"></div>
    <div class="field"><label>Cliente</label>${cFijo ? `<div class="row between"><div class="bold">${U.esc(cFijo.nombre)}</div>${clienteId ? '' : '<button class="btn sm outline" type="button" data-quitarc>Quitar</button>'}</div>` : `<input id="tcq" placeholder="Buscar cliente (opcional)" autocomplete="off"><div class="results hidden" id="tcr"></div>`}</div>
    <div class="btn-row">${tarea ? '<button class="btn danger" data-del>Eliminar</button>' : ''}<button class="btn primary" data-ok>Guardar</button></div>`);
  UI.wireMics(s);
  let fsel = sel;
  s.querySelectorAll('#tf button').forEach(b => b.onclick = () => { fsel = b.dataset.f; s.querySelectorAll('#tf button').forEach(x => x.classList.toggle('on', x === b)); s.querySelector('#tfo').classList.toggle('hidden', fsel !== 'otra'); });
  s.querySelector('[data-quitarc]')?.addEventListener('click', () => { t.clienteId = null; s.querySelector('[data-quitarc]').closest('.row').innerHTML = '<div class="muted">Sin cliente</div>'; });
  const q = s.querySelector('#tcq'), res = s.querySelector('#tcr');
  q?.addEventListener('input', () => {
    const v = U.norm(q.value); if (!v) { res.classList.add('hidden'); t.clienteId = null; return; }
    const hits = clientes.filter(c => U.norm(c.nombre + ' ' + c.localidad).includes(v)).slice(0, 8);
    res.innerHTML = hits.map(c => `<button type="button" data-c="${c.id}"><span class="bold">${U.esc(c.nombre)}</span><span class="muted small">${U.esc(c.localidad || '')}</span></button>`).join('') || '<div class="muted small" style="padding:10px">Ninguno</div>';
    res.classList.remove('hidden');
    res.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { t.clienteId = b.dataset.c; q.value = clientes.find(c => c.id === b.dataset.c).nombre; res.classList.add('hidden'); });
  });
  setTimeout(() => s.querySelector('#tt').focus(), 60);
  s.querySelector('[data-ok]').onclick = async e => {
    const texto = s.querySelector('#tt').value.trim(); if (!texto) { UI.toast('Escribe la tarea'); return; }
    e.currentTarget.disabled = true;
    t.texto = texto; t.fecha = fsel === 'hoy' ? hoy : fsel === 'manana' ? manana : fsel === 'otra' ? (s.querySelector('#tfd').value || manana) : null;
    await DB.save('tareas', t); await UI.closeSheet(); UI.toast('Tarea guardada');
  };
  s.querySelector('[data-del]')?.addEventListener('click', async () => { await DB.softDelete('tareas', t.id); await UI.closeSheet(); UI.toast('Tarea eliminada'); });
}
SCREENS.tareas = async () => {
  const st = SCREENS._tr = SCREENS._tr || { hechas: false };
  const [ts, byId] = await Promise.all([DB.tareas(), clientesById()]);
  const hoy = U.today();
  const abiertas = ts.filter(t => !t.hechaAt), hechas = ts.filter(t => t.hechaAt).sort((a, b) => b.hechaAt.localeCompare(a.hechaAt));
  const grupos = [['vencida', 'Vencidas'], ['hoy', 'Hoy'], ['sin', 'Sin fecha'], ['futura', 'Próximas']];
  const orden = (a, b) => (a.fecha || '').localeCompare(b.fecha || '') || a.createdAt.localeCompare(b.createdAt);
  let html = '';
  if (st.hechas) html = hechas.length ? hechas.slice(0, 200).map(t => tareaItem(t, byId)).join('') : '<div class="empty">Ninguna tarea hecha todavía</div>';
  else {
    for (const [k, l] of grupos) { const g = abiertas.filter(t => tareaGrupo(t, hoy) === k).sort(orden); if (g.length) html += `<div class="group-title">${l} · ${g.length}</div>` + g.map(t => tareaItem(t, byId)).join(''); }
    if (!html) html = '<div class="empty">Nada pendiente. Añade una tarea con el botón +</div>';
  }
  const el = screen(topbar('Tareas', `<button class="iconbtn" data-hechas aria-label="${st.hechas ? 'Ver pendientes' : 'Ver hechas'}">${I.svg(st.hechas ? I.back : I.check, 20)}</button>`) + `
    <div class="section" style="padding-top:0"><div class="muted small">${st.hechas ? `Tareas hechas (${hechas.length}). Desmarca una para recuperarla.` : `${abiertas.length} pendiente${abiertas.length === 1 ? '' : 's'} · toca una para editarla, marca la casilla cuando esté hecha.`}</div></div>
    <div class="list">${html}</div>
    <button class="fab" data-nueva aria-label="Nueva tarea" style="bottom:calc(20px + env(safe-area-inset-bottom,0px))">${I.svg(I.plus, 24, 2.4)}</button>`, { nav: false });
  el.querySelector('.fab').style.color = 'var(--on-accent)';
  wireBack(el); wireTareas(el);
  el.querySelector('[data-hechas]').onclick = () => { st.hechas = !st.hechas; APP.render(); };
  el.querySelector('[data-nueva]').onclick = () => sheetTarea();
  return el;
};

/* ======================= VENTAS (vista global) ======================= */
SCREENS.ventas = async () => {
  const st = SCREENS._vt = SCREENS._vt || { zona: '', cadena: '', prev: true };
  const todos = (await DB.clientes()).filter(VENTAS.tieneDatos);
  const cadenas = [...new Set(todos.map(c => c.codAgrup).filter(Boolean))].sort();
  const cs = todos.filter(c => ZONAS.cumple(c, st.zona) && (!st.cadena || (st.cadena === '__no' ? !c.codAgrup : c.codAgrup === st.cadena)));
  const v = VENTAS.agregar(cs), cmp = VENTAS.comparativa(v);
  const anioRef = APP.ajustes.clasificacionAnio || (cmp ? cmp.anio - 1 : null);
  const porCliente = cmp ? cs.map(c => ({ c, t: VENTAS.total(c.ventas, k => k.startsWith(cmp.anio + '-')) })).sort((a, b) => b.t - a.t) : [];
  const porCadena = cadenas.map(k => ({ k, t: VENTAS.total(VENTAS.agregar(cs.filter(c => c.codAgrup === k)), x => cmp && x.startsWith(cmp.anio + '-')) })).filter(x => x.t).sort((a, b) => b.t - a.t);
  const el = screen(topbar('Ventas') + `
    <div class="section" style="padding-top:0"><div class="row" style="gap:8px"><select class="sel grow" id="vz">${ZONAS.opciones(todos, st.zona)}</select>
      <select class="sel grow" id="vc"><option value="">Todas las cadenas</option><option value="__no" ${st.cadena === '__no' ? 'selected' : ''}>Sin cadena</option>${cadenas.map(k => `<option ${k === st.cadena ? 'selected' : ''}>${U.esc(k)}</option>`).join('')}</select></div>
      <div class="muted small">${cs.length} clientes con datos de ventas${!todos.length ? ' · importa un Excel con columnas por mes (Ajustes → Importar clientes)' : ''}</div></div>
    ${cmp ? `<div class="section"><div class="kpis">
      <div class="kpi"><span class="k">${U.esc(cmp.periodo)}</span><span class="v">${U.fmtEur(cmp.actual)}</span><span class="d">${cmp.pct == null ? 'sin datos del año anterior' : `${U.fmtPct(cmp.pct)} vs ${cmp.anio - 1} mismo periodo`}</span></div>
      <div class="kpi"><span class="k">Año ${cmp.anio - 1}</span><span class="v">${U.fmtEur(VENTAS.totalAnio(v, cmp.anio - 1))}</span><span class="d">${anioRef ? `Clasificación por tamaño: ${anioRef}` : ''}</span></div></div></div>
    <div class="section"><div class="row between"><div class="section-title">Ventas por mes</div><button class="btn sm outline" data-prev>${st.prev ? 'Quitar año anterior' : 'Comparar con año anterior'}</button></div>${VENTAS.grafico(v, { prev: st.prev })}</div>
    ${porCadena.length && !st.cadena ? `<div class="section"><div class="section-title">Por cadena · ${cmp.anio}</div>${porCadena.map(x => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line)"><span class="bold">${U.esc(x.k)}</span><span class="bold">${U.fmtEur(x.t)}</span></div>`).join('')}</div>` : ''}
    <div class="section"><div class="section-title">Clientes · ${cmp.anio}</div></div>
    <div class="list">${porCliente.slice(0, 50).map(x => clienteItem(x.c, U.fmtEur(x.t), { neutro: true })).join('')}</div>` : '<div class="empty">Sin datos de ventas</div>'}`, { nav: false });
  wireBack(el); wireGo(el); VENTAS.wireGrafico(el);
  el.querySelector('#vz').onchange = e => { st.zona = e.target.value; APP.render(); };
  el.querySelector('#vc').onchange = e => { st.cadena = e.target.value; APP.render(); };
  el.querySelector('[data-prev]')?.addEventListener('click', () => { st.prev = !st.prev; APP.render(); });
  return el;
};

/* ======================= ZONAS (Ajustes) ======================= */
SCREENS.zonas = async () => {
  const clientes = await DB.clientes();
  const zonas = ZONAS.lista();
  const cuenta = z => clientes.filter(c => ZONAS.de(c).includes(z)).length;
  const el = screen(topbar('Zonas') + `<div class="section" style="padding-top:0"><div class="muted small">Agrupa comarcas o localidades en tus propias zonas (por ejemplo «Lunes · Maresme»). La comarca de cada cliente sale sola de su código postal.</div></div>
    <div class="list">${zonas.map((z, i) => `<button class="item" data-z="${z.id}"><span class="dot" style="background:var(--z${i + 1})"></span><div class="col grow"><div class="name">${U.esc(z.nombre)}</div><div class="meta">${U.esc([...(z.comarcas || []), ...(z.localidades || [])].join(', ') || 'vacía')}</div></div><div class="right muted">${cuenta(z)}</div></button>`).join('') || '<div class="empty">Todavía no hay zonas</div>'}</div>
    <div class="section"><button class="btn primary big" data-nueva>${I.svg(I.plus, 20)} Nueva zona</button></div>`, { nav: false });
  wireBack(el);
  el.querySelector('[data-nueva]').onclick = () => sheetZona(null, clientes);
  el.querySelectorAll('[data-z]').forEach(b => b.onclick = () => sheetZona(zonas.find(z => z.id === b.dataset.z), clientes));
  return el;
};
function sheetZona(z, clientes) {
  const nueva = !z; z = z ? JSON.parse(JSON.stringify(z)) : { id: U.uuid(), nombre: '', comarcas: [], localidades: [] };
  const coms = [...new Set(clientes.map(U.comarca).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const s = UI.sheet(`<div class="grip"></div><h2>${nueva ? 'Nueva zona' : 'Zona'}</h2>
    <div class="field"><label for="zn">Nombre</label><input id="zn" value="${U.esc(z.nombre)}" placeholder="Ej. Zona Norte"></div>
    <div class="field"><label>Comarcas (con clientes)</label><div class="row wrap" style="gap:6px" id="zc">${coms.map(c => `<button type="button" class="chip ${z.comarcas.includes(c) ? 'on' : ''}" data-c="${U.esc(c)}">${U.esc(c)}</button>`).join('') || '<span class="muted small">Sin clientes todavía</span>'}</div></div>
    <div class="field"><label for="zl">Localidades sueltas (separadas por comas)</label><input id="zl" value="${U.esc(z.localidades.join(', '))}" placeholder="Ej. Mataró, Vic"></div>
    <div class="btn-row">${nueva ? '' : '<button class="btn danger" data-del>Eliminar</button>'}<button class="btn primary" data-ok>Guardar</button></div>`);
  s.querySelectorAll('#zc [data-c]').forEach(b => b.onclick = () => { const c = b.dataset.c; z.comarcas = z.comarcas.includes(c) ? z.comarcas.filter(x => x !== c) : [...z.comarcas, c]; b.classList.toggle('on'); });
  s.querySelector('[data-ok]').onclick = async () => {
    z.nombre = s.querySelector('#zn').value.trim(); if (!z.nombre) { UI.toast('Ponle un nombre'); return; }
    z.localidades = s.querySelector('#zl').value.split(',').map(x => x.trim()).filter(Boolean);
    const zonas = ZONAS.lista().filter(x => x.id !== z.id); const i = ZONAS.lista().findIndex(x => x.id === z.id);
    if (i >= 0) zonas.splice(i, 0, z); else zonas.push(z);
    await APP.guardarAjustes({ zonas }); await UI.closeSheet(); APP.render();
  };
  s.querySelector('[data-del]')?.addEventListener('click', async () => { await APP.guardarAjustes({ zonas: ZONAS.lista().filter(x => x.id !== z.id) }); await UI.closeSheet(); APP.render(); });
}

/* ======================= EDITOR DE HORARIO ======================= */
/* Tres modos: habitual (Ajustes) · igual todos los días (mañana + tarde, días cerrados) · por día (7 filas, «Copiar a todos») */
function editorHorario(horario) {
  const def = APP.ajustes.horario;
  let h = JSON.parse(JSON.stringify(ROUTE.convertirHorario(horario || null, def)));
  const franjasHab = d => ROUTE.ventanas(null, def, d);
  const aT = w => (w ? [U.fmtTime(w[0]), U.fmtTime(w[1])] : null);
  // valores de partida para los modos que no se han usado todavía (a partir del horario habitual)
  const lunes = franjasHab(1).length ? franjasHab(1) : franjasHab(2);
  if (!h.m) { h.m = aT(lunes[0]) || ['09:30', '13:30']; h.t = aT(lunes[1]); h.cerrados = h.cerrados || [0, 1, 2, 3, 4, 5, 6].filter(d => !franjasHab(d).length); }
  if (!h.dias) h.dias = [0, 1, 2, 3, 4, 5, 6].map(d => { const v = franjasHab(d); return { abierto: !!v.length, m: aT(v[0]) || ['09:30', '13:30'], t: aT(v[1]) }; });
  const ORD = [1, 2, 3, 4, 5, 6, 0], LET = { 0: 'D', 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S' };
  const hora = (id, v) => `<input type="time" step="300" id="${id}" value="${v || ''}">`;
  const pintar = () => {
    let cuerpo = '';
    if (h.modo === 'habitual') cuerpo = `<div class="muted small">${ORD.map(d => `${ROUTE.DIAS[d]}: ${ROUTE.textoHorario(null, def, d)}`).join(' · ')}<br>(se cambia en Ajustes → Horario habitual)</div>`;
    if (h.modo === 'igual') cuerpo = `<div class="col" style="gap:8px"><div class="rango"><span class="lbl">Mañana</span>${hora('hm0', h.m && h.m[0])}–${hora('hm1', h.m && h.m[1])}</div><div class="rango"><span class="lbl">Tarde</span>${hora('ht0', h.t && h.t[0])}–${hora('ht1', h.t && h.t[1])}</div><span class="muted small">Tarde vacía = horario continuo</span></div>
      <div class="field"><label>Días abiertos</label><div class="dias">${ORD.map(d => `<button type="button" data-d="${d}" class="${(h.cerrados || []).includes(d) ? '' : 'on'}">${LET[d]}</button>`).join('')}</div></div>`;
    if (h.modo === 'dia') cuerpo = ORD.map(d => { const x = h.dias[d]; return `<div class="hdia" data-dia="${d}"><div class="row between"><span class="nom">${ROUTE.DIAS[d]}</span><button type="button" class="switch" data-ab="${d}" role="switch" aria-checked="${!!x.abierto}" aria-label="Abierto el ${ROUTE.DIAS[d]}"></button></div><div class="franjas">${x.abierto ? `<div class="rango"><span class="lbl">Mañana</span>${hora('m0_' + d, x.m && x.m[0])}–${hora('m1_' + d, x.m && x.m[1])}</div><div class="rango"><span class="lbl">Tarde</span>${hora('t0_' + d, x.t && x.t[0])}–${hora('t1_' + d, x.t && x.t[1])}</div>` : '<span class="cerrado">Cerrado</span>'}</div></div>`; }).join('') + '<button type="button" class="btn sm outline" data-copiar style="align-self:flex-start;margin-top:8px">Copiar el lunes a todos los días abiertos</button>';
    return `<div class="seg c3" id="hmodo">${[['habitual', 'Habitual'], ['igual', 'Igual cada día'], ['dia', 'Por día']].map(([k, l]) => `<button type="button" data-m="${k}" class="${h.modo === k ? 'on' : ''}">${l}</button>`).join('')}</div><div id="hcuerpo" class="col" style="gap:8px">${cuerpo}</div>`;
  };
  let root = null;
  const v = id => root.querySelector('#' + id)?.value || '';
  const leerPantalla = () => { // guarda lo escrito antes de repintar o cambiar de modo
    if (!root) return;
    if (h.modo === 'igual') { h.m = [v('hm0'), v('hm1')]; h.t = v('ht0') && v('ht1') ? [v('ht0'), v('ht1')] : null; }
    if (h.modo === 'dia') ORD.forEach(d => { const x = h.dias[d]; if (x.abierto && root.querySelector('#m0_' + d)) { x.m = [v('m0_' + d), v('m1_' + d)]; x.t = v('t0_' + d) && v('t1_' + d) ? [v('t0_' + d), v('t1_' + d)] : null; } });
  };
  const wire = el => {
    root = el;
    const rep = () => { leerPantalla(); el.innerHTML = pintar(); wire(el); };
    el.querySelectorAll('#hmodo button').forEach(b => b.onclick = () => { leerPantalla(); h.modo = b.dataset.m; el.innerHTML = pintar(); wire(el); });
    el.querySelectorAll('.dias [data-d]').forEach(b => b.onclick = () => { const d = +b.dataset.d; h.cerrados = (h.cerrados || []).includes(d) ? h.cerrados.filter(x => x !== d) : [...(h.cerrados || []), d]; b.classList.toggle('on'); });
    el.querySelectorAll('[data-ab]').forEach(b => b.onclick = () => { leerPantalla(); const x = h.dias[+b.dataset.ab]; x.abierto = !x.abierto; if (x.abierto && !x.m) x.m = ['09:30', '13:30']; rep(); });
    el.querySelector('[data-copiar]')?.addEventListener('click', () => { leerPantalla(); const l = h.dias[1]; h.dias.forEach((x, d) => { if (d !== 1 && x.abierto) { x.m = l.m && [...l.m]; x.t = l.t && [...l.t]; } }); rep(); UI.toast('Horario del lunes copiado'); });
  };
  return {
    html: () => `<div id="heditor" class="col" style="gap:10px">${pintar()}</div>`,
    wire: el => wire(el.querySelector('#heditor')),
    /* resultado en el modelo nuevo; null = habitual */
    leer: () => {
      leerPantalla();
      if (h.modo === 'habitual') return null;
      if (h.modo === 'igual') return { modo: 'igual', m: h.m && h.m[0] && h.m[1] ? h.m : null, t: h.t, cerrados: (h.cerrados || []).slice().sort() };
      return { modo: 'dia', dias: h.dias.map(x => ({ abierto: !!x.abierto, m: x.abierto && x.m && x.m[0] && x.m[1] ? x.m : null, t: x.abierto ? x.t : null })) };
    },
  };
}
