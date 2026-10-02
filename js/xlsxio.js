/* Importación/exportación Excel (SheetJS) y compartir archivos. */
const XIO = {
  /* Lee la primera hoja -> {headers:[], rows:[{}]}.
     Se leen los valores reales de las celdas, no el texto con formato: así las fechas no dependen del formato
     regional de Excel (dd/mm frente a m/d) y los números largos (ISBN, códigos) no salen en notación científica. */
  async leer(file) {
    const buf = await file.arrayBuffer();
    let wb;
    if (/\.(csv|txt)$/i.test(file.name || '') || /csv|text\/plain/.test(file.type || '')) {
      // CSV: UTF-8 si lo es (Google Sheets, LibreOffice), si no Windows-1252 (Excel en español); sin interpretar valores
      let texto;
      try { texto = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { texto = new TextDecoder('windows-1252').decode(buf); }
      wb = XLSX.read(texto.replace(/^\uFEFF/, ''), { type: 'string', raw: true });
    } else wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const celda = v => {
      if (v == null) return '';
      if (v instanceof Date) return isNaN(v) ? '' : U.isoDate(v);
      if (typeof v === 'number') return Number.isInteger(v) ? v.toFixed(0) : String(+v.toFixed(10));
      return String(v).trim();
    };
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }).map(r => r.map(celda));
    // primera fila con >=2 celdas no vacías = cabecera
    let hi = aoa.findIndex(r => r.filter(x => x).length >= 2);
    if (hi < 0) throw new Error('No se encontró una fila de cabecera');
    const headers = aoa[hi].map(h => h.replace(/\s+/g, ' ').trim()); // títulos con saltos de línea o dobles espacios
    const rows = aoa.slice(hi + 1).filter(r => r.some(x => x)).map(r => {
      const o = {}; headers.forEach((h, i) => { if (h) o[h] = r[i] == null ? '' : r[i]; }); return o;
    });
    return { headers: headers.filter(Boolean), rows, hoja: wb.SheetNames[0] };
  },

  /* Sugerencia de mapeo columna Excel -> campo app */
  CAMPOS_CLIENTE: [
    ['codigo', 'Código cliente', ['codigo', 'code', 'id', 'num', 'nº', 'n°', 'ref', 'cliente nº', 'codi']],
    ['nombre', 'Nombre', ['nombre', 'cliente', 'razon', 'razón', 'empresa', 'nom', 'name', 'libreria', 'llibreria']],
    ['calle', 'Dirección', ['direccion', 'dirección', 'calle', 'adreça', 'adreca', 'domicilio', 'address', 'carrer', 'via']],
    ['cp', 'Código postal', ['cp', 'codigo postal', 'código postal', 'c.p.', 'postal', 'zip', 'codi postal']],
    ['localidad', 'Localidad', ['localidad', 'poblacion', 'población', 'ciudad', 'municipio', 'city', 'poblacio', 'població', 'town', 'municipi', 'localitat']],
    ['provincia', 'Provincia', ['provincia', 'province']],
    ['telefono', 'Teléfono (fijo)', ['telefono', 'teléfono', 'tel', 'phone', 'telefon', 'tlf', 'tfno', 'fijo']],
    ['movil', 'Móvil (WhatsApp)', ['movil', 'móvil', 'mobil', 'celular', 'whatsapp', 'telefono movil', 'tel movil']],
    ['contacto', 'Contacto', ['contacto', 'persona', 'contact', 'responsable', 'nombre contacto', 'contacte']],
    ['email', 'Email', ['email', 'correo', 'e-mail', 'mail']],
    ['tamano', 'Tamaño', ['tamaño', 'tamano', 'tamany', 'size', 'categoria', 'categoría', 'tipo']],
    ['frecuencia', 'Frecuencia de visita', ['frecuencia', 'freq', 'periodicidad', 'cada']],
    ['ultimaVisita', 'Última visita', ['ultima visita', 'última visita', 'visita', 'last visit', 'darrera visita']],
    ['nota', 'Notas', ['nota', 'notas', 'observaciones', 'comentarios', 'comments', 'notes', 'observacions']],
    ['codAgrup', 'Cadena (CodAgrup)', ['codagrup', 'cod agrup', 'cod. agrup', 'agrupacion', 'agrupación', 'cadena', 'grupo', 'cod grupo']],
    ['totalVentas', 'Total ventas', ['total ventas', 'ventas', 'total', 'facturacion', 'facturación', 'importe total']],
  ],
  /* Asignación global: se calculan todas las parejas (campo, columna) y se reparten de mejor a peor
     puntuación, comparando palabras enteras (así «Localidad» no se toma por un «id», ni «Código postal»
     por el código de cliente). */
  sugerirMapeo(headers, campos) {
    const palabras = t => ` ${U.norm(t).replace(/[^a-z0-9º°.]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
    const pares = [];
    campos.forEach(([campo, , alias], ci) => {
      for (const h of headers) {
        const hn = U.norm(h), hp = palabras(h);
        if (campo === 'codigo' && /postal/.test(hn)) continue;
        let score = 0;
        for (const a of alias) {
          const ap = palabras(a);
          if (hn === a) score = Math.max(score, 3);
          else if (hp.startsWith(ap) || hp.endsWith(ap)) score = Math.max(score, 2);
          else if (hp.includes(ap)) score = Math.max(score, 1);
        }
        if (score) pares.push({ campo, h, score, ci });
      }
    });
    pares.sort((x, y) => y.score - x.score || x.ci - y.ci || headers.indexOf(x.h) - headers.indexOf(y.h));
    const map = {}, usados = new Set();
    for (const p of pares) if (!map[p.campo] && !usados.has(p.h)) { map[p.campo] = p.h; usados.add(p.h); }
    return map;
  },
  /* Frecuencia en días: número + unidad («2 semanas», «18 meses», «1 año», «cada 15 días», «2 veces al mes») o palabra («mensual») */
  parseFrecuencia(v) {
    const s = U.norm(v); if (!s) return null; // U.norm quita tildes: «año» → «ano»
    const m = /(\d+(?:[.,]\d+)?)/.exec(s), n = m ? parseFloat(m[1].replace(',', '.')) : null;
    if (n) {
      const veces = /vece|vez|\d\s*x\b/.test(s);
      if (/seman/.test(s)) return Math.max(1, Math.round(veces ? 7 / n : n * 7));
      if (/quinc/.test(s)) return Math.max(1, Math.round(veces ? 15 / n : n * 15));
      if (/mes/.test(s)) return Math.max(1, Math.round(veces ? 30 / n : n * 30));
      if (/\bano|anual|\bany\b|year/.test(s)) return Math.max(1, Math.round(veces ? 365 / n : n * 365));
      return Math.round(n); // «15», «15 días»
    }
    if (/seman/.test(s)) return 7; if (/quinc/.test(s)) return 15; if (/bimen|bimes|dos mes/.test(s)) return 60;
    if (/trimes|tres mes/.test(s)) return 90; if (/semes|seis mes/.test(s)) return 180; if (/anual|\bano\b/.test(s)) return 365;
    if (/mens|mes/.test(s)) return 30;
    return null;
  },
  parseTamano(v) {
    const s = U.norm(v); if (!s) return null;
    if (/^(g|gran|grande|big|l|a)$/.test(s) || /gran/.test(s)) return 'grande';
    if (/^(m|med|mediano|medium|b)$/.test(s) || /medi/.test(s)) return 'mediano';
    if (/^(p|peq|pequeño|pequeno|small|s|c)$/.test(s) || /peq|petit/.test(s)) return 'pequeño';
    return null;
  },
  /* Fecha 'YYYY-MM-DD' o null si no es una fecha válida (nunca devuelve un mes 13 ni un año raro) */
  parseFecha(v) {
    if (!v) return null;
    const s = String(v).trim();
    const valida = (y, mo, d) => { y = +y; mo = +mo; d = +d; const f = new Date(y, mo - 1, d); return y >= 1990 && y <= 2100 && f.getFullYear() === y && f.getMonth() === mo - 1 && f.getDate() === d ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null; };
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); if (m) return valida(m[1], m[2], m[3]);
    m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(s); if (m) return valida(m[3].length === 2 ? '20' + m[3] : m[3], m[2], m[1]); // dd/mm/aaaa (España)
    m = /^(\d{5})(\.\d+)?$/.exec(s); // número de serie de Excel en una celda con formato General
    if (m && +m[1] > 30000 && +m[1] < 75000) { const f = new Date(Date.UTC(1899, 11, 30) + (+m[1]) * 86400000); return valida(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate()); }
    return null;
  },
  /* CodAgrup: «0», «-», espacios o vacío = sin cadena */
  limpiarCodAgrup(v) { const t = String(v == null ? '' : v).trim(); return !t || /^[-–—0.\s]+$/.test(t) ? '' : t; },
  /* Precio: admite 18,90 · 18.90 · 1.234,50 · 1,234.50 · «18,90 €» */
  parsePrecio(v) {
    let s = String(v == null ? '' : v).replace(/[^\d.,-]/g, ''); if (!s) return null;
    const c = s.lastIndexOf(','), p = s.lastIndexOf('.');
    if (c >= 0 && p >= 0) s = c > p ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (c >= 0) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s); return isNaN(n) ? null : n;
  },

  /* Convierte filas Excel mapeadas en clientes (sin guardar). tamano y frecuenciaDias quedan en null si la
     columna no está o no se entiende: los valores por defecto solo se aplican al crear un cliente nuevo. */
  /* columnasMes: [{h, ym}] de VENTAS.columnasMes: cada cliente recibe ventas = { 'YYYY-MM': importe } (vacío = 0) */
  filasAClientes(rows, map, columnasMes = []) {
    const g = (r, campo) => String((map[campo] && r[map[campo]] != null) ? r[map[campo]] : '').trim();
    return rows.map(r => {
      const nombre = g(r, 'nombre'); if (!nombre) return null;
      let calle = g(r, 'calle'), numero = '';
      const mm = /^(.*?)[,\s]+(\d+[A-Za-z]?(?:[-\/]\d+)?)\s*$/.exec(calle);
      if (mm) { calle = mm[1].trim(); numero = mm[2]; }
      return {
        codigo: g(r, 'codigo') || '', nombre, calle, numero, cp: g(r, 'cp').replace(/\.0$/, '').padStart(5, '0').slice(-5).replace(/^0{5}$/, ''),
        localidad: g(r, 'localidad'), provincia: g(r, 'provincia'), telefono: g(r, 'telefono'), contacto: g(r, 'contacto'), email: g(r, 'email'),
        tamano: XIO.parseTamano(g(r, 'tamano')),
        frecuenciaDias: XIO.parseFrecuencia(g(r, 'frecuencia')),
        ultimaVisita: XIO.parseFecha(g(r, 'ultimaVisita')), nota: g(r, 'nota'),
        movil: g(r, 'movil'), codAgrup: XIO.limpiarCodAgrup(g(r, 'codAgrup')), totalVentas: map.totalVentas ? XIO.parsePrecio(g(r, 'totalVentas')) : null,
        ventas: columnasMes.length ? Object.fromEntries(columnasMes.map(({ h, ym }) => [ym, XIO.parsePrecio(r[h]) || 0])) : null,
      };
    }).filter(Boolean);
  },

  CAMPOS_CATALOGO: [
    ['ref', 'Referencia / ISBN', ['isbn', 'ref', 'referencia', 'codigo', 'código', 'ean', 'sku', 'id', 'codi']],
    ['titulo', 'Título', ['titulo', 'título', 'title', 'nombre', 'descripcion', 'descripción', 'producto', 'article', 'articulo', 'artículo']],
    ['autor', 'Autor', ['autor', 'author']],
    ['editorial', 'Editorial / Marca', ['editorial', 'marca', 'coleccion', 'colección', 'sello']],
    ['precio', 'Precio', ['precio', 'pvp', 'price', 'preu', 'importe']],
  ],
  /* Artículos del catálogo, sin repetir referencia (si se repite, queda la última fila) */
  filasACatalogo(rows, map) {
    const g = (r, campo) => String((map[campo] && r[map[campo]] != null) ? r[map[campo]] : '').trim();
    const out = new Map();
    for (const r of rows) {
      const ref = g(r, 'ref'), titulo = g(r, 'titulo');
      if (!ref && !titulo) continue;
      const k = { ref: ref || U.norm(titulo).slice(0, 40), titulo: titulo || ref, autor: g(r, 'autor'), editorial: g(r, 'editorial'), precio: XIO.parsePrecio(g(r, 'precio')), updatedAt: U.now() };
      out.set(k.ref, k);
    }
    return [...out.values()];
  },

  /* ---------- exportación de pedidos ---------- */
  pedidosAHojas(pedidos, clientesById) {
    const lineas = [], resumen = [];
    for (const p of pedidos) {
      const c = clientesById[p.clienteId] || {};
      const f = new Date(p.fecha), fecha = U.isoDate(f), hora = f.toTimeString().slice(0, 5); // día y hora locales
      const dir = U.direccion(c);
      let total = 0, uds = 0;
      for (const l of p.lineas || []) {
        const imp = l.precio != null ? +(l.precio * l.cantidad).toFixed(2) : '';
        if (imp !== '') total += imp; uds += l.cantidad;
        lineas.push({
          'Fecha': fecha, 'Hora': hora, 'Código cliente': c.codigo || '', 'Cliente': c.nombre || '',
          'Dirección': dir.l1, 'CP': c.cp || '', 'Localidad': c.localidad || '', 'Contacto': c.contacto || '',
          'Referencia': l.ref || '', 'Título': l.titulo || '', 'Cantidad': l.cantidad, 'Precio': l.precio ?? '', 'Importe': imp,
          'Nota línea': l.nota || '', 'Nota pedido': p.nota || '', 'Nº pedido': p.numero || p.id.slice(0, 8),
        });
      }
      resumen.push({ 'Fecha': fecha, 'Nº pedido': p.numero || p.id.slice(0, 8), 'Código cliente': c.codigo || '', 'Cliente': c.nombre || '', 'Localidad': c.localidad || '', 'Líneas': (p.lineas || []).length, 'Unidades': uds, 'Importe': +total.toFixed(2), 'Nota': p.nota || '' });
    }
    return { lineas, resumen };
  },
  pedidosXlsx(pedidos, clientesById) {
    const { lineas, resumen } = XIO.pedidosAHojas(pedidos, clientesById);
    const wb = XLSX.utils.book_new();
    const w1 = XLSX.utils.json_to_sheet(lineas); w1['!cols'] = [10, 6, 12, 28, 26, 7, 16, 14, 14, 36, 8, 8, 9, 18, 24, 10].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, w1, 'Líneas');
    const w2 = XLSX.utils.json_to_sheet(resumen); w2['!cols'] = [10, 10, 12, 28, 16, 7, 9, 9, 24].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, w2, 'Resumen');
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  },
  clientesXlsx(clientes) {
    const anio = new Date().getFullYear();
    const rows = clientes.map(c => ({ 'Código': c.codigo || '', 'Nombre': c.nombre, 'Dirección': U.direccion(c).l1, 'CP': c.cp, 'Localidad': c.localidad, 'Comarca': U.comarca(c), 'Provincia': c.provincia || '', 'Teléfono': c.telefono || '', 'Móvil': c.movil || '', 'Contacto': c.contacto || '', 'Tamaño': U.tamanoLabel(c.tamano), 'Cadena': c.codAgrup || '', 'Categoría': c.prospecto ? 'Prospecto' : c.inactivo ? 'Inactivo' : 'Cliente', [`Ventas ${anio - 1}`]: VENTAS.tieneDatos(c) ? VENTAS.totalAnio(c.ventas, anio - 1) : '', [`Ventas ${anio}`]: VENTAS.tieneDatos(c) ? VENTAS.totalAnio(c.ventas, anio) : '', 'Frecuencia': U.frecuenciaLabel(c.frecuenciaDias), 'Última visita': c.ultimaVisita || '', 'Estado': U.estado(c).label, 'Notas': c.nota || '', 'Lat': c.lat || '', 'Lng': c.lng || '' }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Clientes');
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  },

  /* Comparte (Android: WhatsApp, Gmail, Drive...) o descarga */
  async compartir(data, filename, mime, titulo) {
    const file = new File([data], filename, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: titulo || filename }); return 'compartido'; }
      catch (e) { if (e.name === 'AbortError') return 'cancelado'; }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
    return 'descargado';
  },
  async compartirTexto(texto, titulo) {
    if (navigator.share) { try { await navigator.share({ text: texto, title: titulo }); return true; } catch (e) { if (e.name === 'AbortError') return false; } }
    window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank');
    return true;
  },
};
