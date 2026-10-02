/* Planificador de rutas: orden de visitas con citas a hora fija y horarios de apertura.
   Heurística: inserción voraz entre citas (anclas) + mejora 2-opt por tramos. */
const ROUTE = {
  DIAS: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  /* Horario del cliente (tres modos):
     { modo: 'habitual' }                                         → el de Ajustes
     { modo: 'igual', m: ['09:30','13:30'], t: ['17:00','20:00'] | null, cerrados: [0, ...] }  (0 = domingo)
     { modo: 'dia', dias: [ { abierto, m, t } x7 ] }              → índice 0 = domingo
     Sin «modo» = formato antiguo (interruptores lunesCerrado, cierraSabado…), que se sigue entendiendo. */
  ventanas(horario, defecto, dow) {
    const franjas = (m, t) => [m, t].filter(f => f && f[0] && f[1]).map(f => [U.parseTime(f[0]), U.parseTime(f[1])]).filter(w => w[1] > w[0]);
    if (horario && horario.modo === 'igual') return (horario.cerrados || []).includes(dow) ? [] : franjas(horario.m, horario.t);
    if (horario && horario.modo === 'dia') { const d = (horario.dias || [])[dow]; return d && d.abierto ? franjas(d.m, d.t) : []; }
    return ROUTE._ventanasAntiguas(horario && horario.modo === 'habitual' ? null : horario, defecto, dow);
  },
  _ventanasAntiguas(horario, defecto, dow) {
    const h = Object.assign({}, defecto || {}, horario || {});
    const abre = U.parseTime(h.abre || '09:30'), cierra = U.parseTime(h.cierra || '20:00');
    const mdDe = U.parseTime(h.mediodiaDe || '13:30'), mdA = U.parseTime(h.mediodiaA || '17:00');
    if (dow === 0 && !h.abreDomingo) return [];
    if (dow === 6 && h.cierraSabado) return [];
    let v = [];
    if (h.cierraMediodia !== false && mdDe > abre && mdA < cierra) v = [[abre, mdDe], [mdA, cierra]];
    else v = [[abre, cierra]];
    // lunes por la mañana cerrado: solo abre por la tarde (también si no cierra al mediodía)
    if (dow === 1 && h.lunesCerrado) v = v.map(w => [Math.max(w[0], mdA), w[1]]).filter(w => w[1] > w[0]);
    if (h.lunesTodoCerrado && dow === 1) return [];
    return v;
  },
  /* Pasa un horario antiguo (o ninguno) al modelo nuevo con las franjas reales de cada día */
  convertirHorario(horario, defecto) {
    if (!horario) return { modo: 'habitual' };
    if (horario.modo) return horario;
    const aT = w => w ? [U.fmtTime(w[0]), U.fmtTime(w[1])] : null;
    const dias = [0, 1, 2, 3, 4, 5, 6].map(d => { const v = ROUTE._ventanasAntiguas(horario, defecto, d); return v.length ? { abierto: true, m: aT(v[0]), t: aT(v[1]) } : { abierto: false, m: null, t: null }; });
    const abiertos = dias.filter(d => d.abierto), clave = d => JSON.stringify([d.m, d.t]);
    if (abiertos.length && abiertos.every(d => clave(d) === clave(abiertos[0]))) return { modo: 'igual', m: abiertos[0].m, t: abiertos[0].t, cerrados: dias.map((d, i) => (d.abierto ? null : i)).filter(i => i != null) };
    return { modo: 'dia', dias };
  },
  /* «9:30–14:00 · 16:30–20:00» o «Cerrado» */
  textoHorario(horario, defecto, dow) {
    const v = ROUTE.ventanas(horario, defecto, dow);
    const h = m => U.fmtTime(m).replace(/^0(\d)/, '$1');
    return v.length ? v.map(w => `${h(w[0])}–${h(w[1])}`).join(' · ') : 'Cerrado';
  },
  /* Próximo instante >= t en que se puede empezar una visita de `dur` minutos sin pasarse del cierre
     (o null si ya no abre hoy). ventanas null = sin horario (siempre abierto); [] = cerrado ese día. */
  proximaApertura(ventanas, t, dur = 0) {
    if (!ventanas) return t;
    for (const [a, b] of ventanas) {
      const ini = Math.max(t, a);
      if (ini + dur <= b) return ini;
    }
    return null;
  },

  /* Planifica. stops: [{id, lat, lng, horaFija (min|null), duracion (min), ventanas, sinLugar}]
     sinLugar: parada sin dirección (la pausa para comer): no hay trayecto hasta ella y se sigue desde donde se estaba.
     penaliza: minutos de coste añadido al elegirla (la pausa se deja para cuando no hay nada mejor que hacer).
     opts: {salida (min), limite (min), dur, dist (matrices con índice 0=origen, 1..n=stops, n+1=destino)} */
  planificar(stops, opts) {
    const n = stops.length;
    const { dur, dist } = opts;
    const salida = opts.salida ?? 8.5 * 60, limite = opts.limite ?? 18 * 60;
    const ORIG = 0, DEST = n + 1;
    const idx = i => i + 1; // índice del stop i en matrices

    const simular = (orden) => {
      let t = salida, cur = ORIG, km = 0, cond = 0, espera = 0;
      const plan = [];
      let ok = true;
      for (const i of orden) {
        const s = stops[i];
        const viaje = s.sinLugar ? 0 : dur[cur][idx(i)];
        if (!s.sinLugar) km += dist[cur][idx(i)]; cond += viaje;
        let lleg = t + viaje;
        let ini = lleg;
        if (s.horaFija != null) { if (lleg > s.horaFija + 10) ok = false; ini = Math.max(lleg, s.horaFija); }
        else {
          const ap = ROUTE.proximaApertura(s.ventanas, lleg, s.duracion || 30);
          if (ap == null) ok = false; else ini = ap;
        }
        espera += ini - lleg;
        const fin = ini + (s.duracion || 30);
        plan.push({ i, llegada: lleg, inicio: ini, fin, viaje });
        t = fin; if (!s.sinLugar) cur = idx(i);
      }
      const vuelta = dur[cur][DEST]; km += dist[cur][DEST]; cond += vuelta;
      const llegadaFin = t + vuelta;
      if (llegadaFin > limite) ok = false;
      return { ok, plan, km, cond, espera, fin: llegadaFin };
    };

    // 1) construcción voraz con anclas (citas fijas)
    const fijos = stops.map((s, i) => i).filter(i => stops[i].horaFija != null).sort((a, b) => stops[a].horaFija - stops[b].horaFija);
    let libres = stops.map((s, i) => i).filter(i => stops[i].horaFija == null);
    const orden = [];
    const noCaben = [];
    let t = salida, cur = ORIG;
    const anclas = [...fijos, null]; // null = destino final
    for (const anc of anclas) {
      // insertar libres mientras lleguemos a tiempo al ancla
      while (libres.length) {
        // candidatos: primero los que no obligan a esperar mucho; si no hay, se acepta esperar (p. ej. a que abran por la tarde)
        let mejor = null, mejorCoste = Infinity, mejorEspera = null, costeEspera = Infinity;
        for (const i of libres) {
          const s = stops[i], desde = s.sinLugar ? cur : idx(i);
          const lleg = t + (s.sinLugar ? 0 : dur[cur][idx(i)]);
          const ini = ROUTE.proximaApertura(s.ventanas, lleg, s.duracion || 30);
          if (ini == null) continue;
          const fin = ini + (s.duracion || 30);
          const sig = anc == null ? DEST : idx(anc);
          const llegAnc = fin + dur[desde][sig];
          const tope = anc == null ? limite : stops[anc].horaFija + 5;
          if (llegAnc > tope) continue;
          const coste = (ini - t) + (anc != null ? dur[desde][sig] * 0.3 : 0) + (s.penaliza || 0);
          if (ini - lleg <= 60) { if (coste < mejorCoste) { mejorCoste = coste; mejor = { i, fin }; } }
          else if (coste < costeEspera) { costeEspera = coste; mejorEspera = { i, fin }; }
        }
        if (!mejor) mejor = mejorEspera;
        if (!mejor) break;
        orden.push(mejor.i); libres = libres.filter(x => x !== mejor.i); t = mejor.fin; if (!stops[mejor.i].sinLugar) cur = idx(mejor.i);
      }
      if (anc != null) {
        const s = stops[anc];
        const lleg = t + dur[cur][idx(anc)];
        const ini = Math.max(lleg, s.horaFija);
        orden.push(anc); t = ini + (s.duracion || 30); cur = idx(anc);
      }
    }
    noCaben.push(...libres);

    // 2) mejora 2-opt dentro de los tramos entre anclas
    let best = simular(orden);
    const esFijo = i => stops[i].horaFija != null;
    let mejora = true, iter = 0;
    while (mejora && iter++ < 50) {
      mejora = false;
      for (let a = 0; a < orden.length - 1; a++) {
        for (let b = a + 1; b < orden.length; b++) {
          if (orden.slice(a, b + 1).some(esFijo)) continue;
          const cand = orden.slice(0, a).concat(orden.slice(a, b + 1).reverse(), orden.slice(b + 1));
          const r = simular(cand);
          if ((r.ok || !best.ok) && r.fin + r.espera * 0.5 < best.fin + best.espera * 0.5 - 0.5) { orden.splice(0, orden.length, ...cand); best = r; mejora = true; }
        }
      }
    }
    // 3) intentar reinsertar los que no cabían al final
    for (const i of [...noCaben]) {
      for (let pos = 0; pos <= orden.length; pos++) {
        const cand = orden.slice(0, pos).concat([i], orden.slice(pos));
        const r = simular(cand);
        if (r.ok) { orden.splice(0, orden.length, ...cand); best = r; noCaben.splice(noCaben.indexOf(i), 1); break; }
      }
    }
    return { orden, plan: best.plan, km: best.km, conduccion: best.cond, espera: best.espera, fin: best.fin, ok: best.ok, noCaben };
  },

  /* Horarios para un orden dado (edición manual): mismo cálculo que la simulación interna */
  simular(stops, orden, opts) {
    const n = stops.length, { dur, dist } = opts;
    const salida = opts.salida ?? 8.5 * 60, limite = opts.limite ?? 18 * 60;
    const DEST = n + 1, idx = i => i + 1;
    let t = salida, cur = 0, km = 0, cond = 0, espera = 0, ok = true;
    const plan = [];
    for (const i of orden) {
      const s = stops[i]; const viaje = s.sinLugar ? 0 : dur[cur][idx(i)];
      if (!s.sinLugar) km += dist[cur][idx(i)]; cond += viaje;
      const lleg = t + viaje; let ini = lleg;
      if (s.horaFija != null) { if (lleg > s.horaFija + 10) ok = false; ini = Math.max(lleg, s.horaFija); }
      else { const ap = ROUTE.proximaApertura(s.ventanas, lleg, s.duracion || 30); if (ap == null) ok = false; else ini = ap; }
      espera += ini - lleg;
      const fin = ini + (s.duracion || 30);
      plan.push({ i, llegada: lleg, inicio: ini, fin, viaje });
      t = fin; if (!s.sinLugar) cur = idx(i);
    }
    const vuelta = dur[cur][DEST]; km += dist[cur][DEST]; cond += vuelta;
    const fin = t + vuelta; if (fin > limite) ok = false;
    return { orden: [...orden], plan, km, conduccion: cond, espera, fin, ok, noCaben: [] };
  },
};
