/* Ventas: columnas mensuales del Excel, totales por año, comparación a periodo igual, clasificación anual
   (tamaño e inactivos) y gráfico de barras en SVG (sin librerías, funciona sin conexión). */
const VENTAS = {
  MESES: {
    ene: 1, enero: 1, gen: 1, gener: 1, jan: 1, feb: 2, febrero: 2, febrer: 2, mar: 3, marzo: 3, marc: 3, abr: 4, abril: 4, apr: 4,
    may: 5, mayo: 5, mai: 5, maig: 5, jun: 6, junio: 6, juny: 6, jul: 7, julio: 7, juliol: 7, ago: 8, agosto: 8, ag: 8, agost: 8, aug: 8,
    sep: 9, sept: 9, set: 9, septiembre: 9, setembre: 9, oct: 10, octubre: 10, nov: 11, noviembre: 11, novembre: 11, dic: 12, diciembre: 12, des: 12, desembre: 12, dec: 12,
  },
  /* Cabecera de columna -> 'YYYY-MM' si es un mes: 01/2025 · 1-2025 · 2025-01 · 202501 · Ene 2025 · enero-25 · gen. 2025 · 2025-01-01 (fecha) */
  detectarMes(h) {
    const s = U.norm(h).replace(/\s+/g, ' ');
    const ym = (y, m) => { y = +y; m = +m; if (y < 100) y += 2000; return y >= 2000 && y <= 2100 && m >= 1 && m <= 12 ? `${y}-${String(m).padStart(2, '0')}` : null; };
    let m = /(?:^|\D)(\d{4})[-\/.](\d{1,2})(?:[-\/.]\d{1,2})?(?:\D|$)/.exec(s); if (m) return ym(m[1], m[2]);
    m = /(?:^|\D)(\d{1,2})[-\/.](\d{4})(?:\D|$)/.exec(s); if (m) return ym(m[2], m[1]);
    m = /(?:^|\D)(20\d{2})(0[1-9]|1[0-2])(?:\D|$)/.exec(s); if (m) return ym(m[1], m[2]);
    m = /([a-z]+)\.?[\s\-\/']*(\d{2}|\d{4})(?:\D|$)/.exec(s); if (m && VENTAS.MESES[m[1]]) return ym(m[2], VENTAS.MESES[m[1]]);
    return null;
  },
  /* Columnas de meses de un archivo: [{h, ym}] ordenadas */
  columnasMes(headers) { return headers.map(h => ({ h, ym: VENTAS.detectarMes(h) })).filter(x => x.ym).sort((a, b) => a.ym.localeCompare(b.ym)); },
  tieneDatos(c) { return !!(c.ventas && Object.keys(c.ventas).length); },
  total(v, filtro) { let t = 0; for (const [k, x] of Object.entries(v || {})) if (!filtro || filtro(k)) t += +x || 0; return Math.round(t * 100) / 100; },
  totalAnio(v, y) { return VENTAS.total(v, k => k.startsWith(y + '-')); },
  /* suma de las ventas de varios clientes, mes a mes */
  agregar(clientes) { const out = {}; for (const c of clientes) for (const [k, x] of Object.entries(c.ventas || {})) out[k] = (out[k] || 0) + (+x || 0); return out; },
  ultimoMes(v) { const ks = Object.keys(v || {}).sort(); return ks[ks.length - 1] || null; },
  /* Año en curso de los datos frente al anterior en los mismos meses: «2026 (ene–jul) vs 2025 mismo periodo» */
  comparativa(v) {
    const ult = VENTAS.ultimoMes(v); if (!ult) return null;
    const y = +ult.slice(0, 4), m = +ult.slice(5, 7);
    const dentro = (k, yy) => k.startsWith(yy + '-') && +k.slice(5, 7) <= m;
    const actual = VENTAS.total(v, k => dentro(k, y)), anterior = VENTAS.total(v, k => dentro(k, y - 1));
    const hayAnterior = Object.keys(v).some(k => k.startsWith((y - 1) + '-'));
    return { anio: y, mesFin: m, actual, anterior: hayAnterior ? anterior : null, pct: hayAnterior && anterior ? (actual - anterior) / Math.abs(anterior) : null,
      periodo: m === 12 ? `${y}` : `${y} (${m === 1 ? U.mesLabel(ult) : U.mesLabel(y + '-01') + '–' + U.mesLabel(ult)})` };
  },
  /* Año de referencia para clasificar: el último año completo (con diciembre) de los datos */
  anioReferencia(meses) { const ys = [...new Set([...meses].filter(k => k.endsWith('-12')).map(k => +k.slice(0, 4)))]; return ys.length ? Math.max(...ys) : null; },
  tamanoDe(total, u) { return total <= u.pequeno ? 'pequeño' : total <= u.mediano ? 'mediano' : 'grande'; },
  /* Tamaño e inactivo según las ventas del año de referencia. Devuelve cuántos cambian de tamaño. */
  clasificar(c, anio, u) {
    if (!VENTAS.tieneDatos(c) || !anio) return false;
    const total = VENTAS.totalAnio(c.ventas, anio);
    const antes = c.tamano;
    c.tamano = VENTAS.tamanoDe(total, u); c.tamanoOrigen = 'ventas';
    c.inactivo = total === 0; // negativo = activo (una devolución es relación comercial)
    c.clasificacion = anio;
    return antes !== c.tamano;
  },
  umbrales() { return { pequeno: +APP.ajustes.umbralPequeno || 900, mediano: +APP.ajustes.umbralMediano || 2500 }; },

  /* ---------- gráfico de barras ----------
     serie: [{ym, v}] (12 meses). opts.prev: incluir el mismo mes del año anterior en gris. Negativos hacia abajo en otro color. */
  grafico(v, { meses = 12, prev = false, alto = 150 } = {}) {
    const ult = VENTAS.ultimoMes(v); if (!ult) return '<div class="muted small">Sin datos de ventas</div>';
    let [y, m] = ult.split('-').map(Number);
    const serie = [];
    for (let i = 0; i < meses; i++) { const k = `${y}-${String(m).padStart(2, '0')}`, kp = `${y - 1}-${String(m).padStart(2, '0')}`; serie.unshift({ ym: k, v: v[k] ?? null, p: v[kp] ?? null }); if (--m === 0) { m = 12; y--; } }
    const vals = serie.flatMap(s => [s.v, prev ? s.p : null]).filter(x => x != null);
    const max = Math.max(0, ...vals), min = Math.min(0, ...vals), rango = (max - min) || 1;
    const W = 340, H = alto, IZ = 40, AB = 18, AR = 6, ancho = (W - IZ) / meses;
    const y0 = AR + (max / rango) * (H - AR - AB);
    const esc = x => (x / rango) * (H - AR - AB);
    const barra = (x, w, val, cls) => {
      if (val == null || val === 0) return '';
      const h = Math.max(1.5, Math.abs(esc(val))), r = Math.min(4, w / 2, h);
      // extremo redondeado (4px) en el lado del dato, recto en la línea de cero
      if (val > 0) return `<path class="${cls}" d="M${x},${y0} V${y0 - h + r} Q${x},${y0 - h} ${x + r},${y0 - h} H${x + w - r} Q${x + w},${y0 - h} ${x + w},${y0 - h + r} V${y0} Z"/>`;
      return `<path class="${cls === 'bar-pos' ? 'bar-neg' : cls}" d="M${x},${y0} V${y0 + h - r} Q${x},${y0 + h} ${x + r},${y0 + h} H${x + w - r} Q${x + w},${y0 + h} ${x + w},${y0 + h - r} V${y0} Z"/>`;
    };
    const fmtK = n => Math.abs(n) >= 1000 ? (n / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' k' : Math.round(n).toLocaleString('es-ES');
    let svg = `<line class="grid" x1="${IZ}" x2="${W}" y1="${AR}" y2="${AR}"/>`;
    svg += `<text class="axis" x="${IZ - 6}" y="${AR + 4}" text-anchor="end">${fmtK(max)}</text>`;
    if (min < 0) svg += `<line class="grid" x1="${IZ}" x2="${W}" y1="${H - AB}" y2="${H - AB}"/><text class="axis" x="${IZ - 6}" y="${H - AB + 4}" text-anchor="end">${fmtK(min)}</text>`;
    let hits = '';
    serie.forEach((s, i) => {
      const x = IZ + i * ancho, bw = Math.min(prev ? 11 : 24, (ancho - 6) / (prev ? 2 : 1));
      const cx = x + ancho / 2;
      if (prev) { svg += barra(cx - bw - 1, bw, s.p, 'bar-prev'); svg += barra(cx + 1, bw, s.v, 'bar-pos'); }
      else svg += barra(cx - bw / 2, bw, s.v, 'bar-pos');
      if (i % (meses > 12 ? 2 : 1) === 0) svg += `<text class="axis" x="${cx}" y="${H - 4}" text-anchor="middle">${U.mesLabel(s.ym).slice(0, 3)}</text>`;
      hits += `<rect class="hit" data-i="${i}" x="${x}" y="0" width="${ancho}" height="${H}"/>`;
    });
    svg += `<line class="zero" x1="${IZ}" x2="${W}" y1="${y0}" y2="${y0}"/><text class="axis" x="${IZ - 6}" y="${y0 + 4}" text-anchor="end">0</text>`;
    const neg = serie.some(s => s.v < 0 || (prev && s.p < 0));
    const leyenda = `<div class="legend"><span><i style="background:var(--chart-pos)"></i>Ventas</span>${neg ? '<span><i style="background:var(--chart-neg)"></i>Devoluciones (negativo)</span>' : ''}${prev ? '<span><i style="background:var(--chart-prev)"></i>Año anterior</span>' : ''}</div>`;
    const datos = encodeURIComponent(JSON.stringify(serie));
    return `<div class="chart" data-serie="${datos}" data-prev="${prev ? 1 : 0}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ventas por mes, últimos ${meses} meses">${svg}${hits}</svg><div class="tip hidden"></div></div>${leyenda}`;
  },
  /* importe al tocar una barra */
  wireGrafico(root) {
    root.querySelectorAll('.chart').forEach(ch => {
      const serie = JSON.parse(decodeURIComponent(ch.dataset.serie)), prev = ch.dataset.prev === '1', tip = ch.querySelector('.tip');
      ch.querySelectorAll('.hit').forEach(r => r.addEventListener('click', () => {
        const on = r.classList.contains('on'); ch.querySelectorAll('.hit.on').forEach(x => x.classList.remove('on'));
        if (on) { tip.classList.add('hidden'); return; }
        r.classList.add('on'); const s = serie[+r.dataset.i];
        tip.textContent = `${U.mesLabel(s.ym, true)}: ${s.v == null ? 'sin dato' : U.fmtEur(s.v)}${prev ? ` · año anterior: ${s.p == null ? 'sin dato' : U.fmtEur(s.p)}` : ''}`;
        const box = ch.getBoundingClientRect(), rb = r.getBoundingClientRect();
        tip.style.left = Math.min(Math.max(rb.left - box.left + rb.width / 2, 90), box.width - 90) + 'px';
        tip.classList.remove('hidden');
      }));
    });
  },
};
