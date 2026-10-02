/* Importación/exportación Excel (SheetJS) y compartir archivos. */
const XIO = {
  /* Lee la primera hoja -> {headers:[], rows:[{}]} */
  async leer(file) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
    // primera fila con >=2 celdas no vacías = cabecera
    let hi = aoa.findIndex(r => r.filter(x => String(x).trim()).length >= 2);
    if (hi < 0) throw new Error('No se encontró una fila de cabecera');
    const headers = aoa[hi].map(h => String(h).trim());
    const rows = aoa.slice(hi + 1).filter(r => r.some(x => String(x).trim())).map(r => {
      const o = {}; headers.forEach((h, i) => { if (h) o[h] = r[i] == null ? '' : String(r[i]).trim(); }); return o;
    });
    return { headers: headers.filter(Boolean), rows, hoja: wb.SheetNames[0] };
  },

  /* Sugerencia de mapeo columna Excel -> campo app */
  CAMPOS_CLIENTE: [
    ['codigo', 'Código cliente', ['codigo', 'code', 'id', 'num', 'nº', 'n°', 'ref', 'cliente nº', 'codi']],
    ['nombre', 'Nombre', ['nombre', 'cliente', 'razon', 'razón', 'empresa', 'nom', 'name', 'libreria', 'llibreria']],
    ['calle', 'Dirección', ['direccion', 'dirección', 'calle', 'adreça', 'adreca', 'domicilio', 'address', 'carrer', 'via']],
    ['cp', 'Código postal', ['cp', 'codigo postal', 'código postal', 'c.p.', 'postal', 'zip', 'codi postal']],
    ['localidad', 'Localidad', ['localidad', 'poblacion', 'población', 'ciudad', 'municipio', 'city', 'poblacio', 'població', 'town']],
    ['provincia', 'Provincia', ['provincia', 'province']],
    ['telefono', 'Teléfono', ['telefono', 'teléfono', 'tel', 'phone', 'movil', 'móvil']],
    ['contacto', 'Contacto', ['contacto', 'persona', 'contact', 'responsable', 'nombre contacto']],
    ['email', 'Email', ['email', 'correo', 'e-mail', 'mail']],
    ['tamano', 'Tamaño', ['tamaño', 'tamano', 'tamany', 'size', 'categoria', 'categoría', 'tipo']],
    ['frecuencia', 'Frecuencia de visita', ['frecuencia', 'freq', 'periodicidad', 'cada']],
    ['ultimaVisita', 'Última visita', ['ultima visita', 'última visita', 'visita', 'last visit', 'darrera visita']],
    ['nota', 'Notas', ['nota', 'notas', 'observaciones', 'comentarios', 'comments', 'notes']],
  ],
  sugerirMapeo(headers, campos) {
    const map = {};
    const usados = new Set();
    for (const [campo, , alias] of campos) {
      let best = null, bestScore = 0;
      for (const h of headers) {
        if (usados.has(h)) continue;
        const hn = U.norm(h);
        let score = 0;
        for (const a of alias) { if (hn === a) score = Math.max(score, 3); else if (hn.startsWith(a) || hn.endsWith(a)) score = Math.max(score, 2); else if (hn.includes(a)) score = Math.max(score, 1); }
        if (score > bestScore) { bestScore = score; best = h; }
      }
      if (best) { map[campo] = best; usados.add(best); }
    }
    return map;
  },
  parseFrecuencia(v) {
    const s = U.norm(v); if (!s) return null;
    const n = parseInt(s, 10);
    if (!isNaN(n)) return n <= 12 && /mes/.test(s) ? n * 30 : n;
    if (/seman/.test(s)) return 7; if (/quinc/.test(s)) return 15; if (/bimen|bimes|2 mes|dos mes/.test(s)) return 60;
    if (/trimes|3 mes|tres mes/.test(s)) return 90; if (/semes|6 mes|seis mes/.test(s)) return 180; if (/anual|año/.test(s)) return 365;
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
  parseFecha(v) {
    if (!v) return null;
    const s = String(v).trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(s); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    const d = new Date(s); return isNaN(d) ? null : U.isoDate(d);
  },

  /* Convierte filas Excel mapeadas en clientes (sin guardar) */
  filasAClientes(rows, map, defaults) {
    const g = (r, campo) => (map[campo] ? r[map[campo]] : '');
    return rows.map(r => {
      const nombre = g(r, 'nombre'); if (!nombre) return null;
      let calle = g(r, 'calle'), numero = '';
      const mm = /^(.*?)[,\s]+(\d+[A-Za-z]?(?:[-\/]\d+)?)\s*$/.exec(calle);
      if (mm) { calle = mm[1].trim(); numero = mm[2]; }
      return {
        codigo: g(r, 'codigo') || '', nombre, calle, numero, cp: g(r, 'cp').replace(/\.0$/, '').padStart(5, '0').slice(-5).replace(/^0{5}$/, ''),
        localidad: g(r, 'localidad'), provincia: g(r, 'provincia'), telefono: g(r, 'telefono'), contacto: g(r, 'contacto'), email: g(r, 'email'),
        tamano: XIO.parseTamano(g(r, 'tamano')) || defaults.tamano || 'mediano',
        frecuenciaDias: XIO.parseFrecuencia(g(r, 'frecuencia')) || defaults.frecuenciaDias || 30,
        ultimaVisita: XIO.parseFecha(g(r, 'ultimaVisita')), nota: g(r, 'nota'),
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
  filasACatalogo(rows, map) {
    const g = (r, campo) => (map[campo] ? r[map[campo]] : '');
    const out = [];
    for (const r of rows) {
      const ref = g(r, 'ref'), titulo = g(r, 'titulo');
      if (!ref && !titulo) continue;
      const precio = parseFloat(String(g(r, 'precio')).replace(',', '.').replace(/[^\d.]/g, ''));
      out.push({ ref: ref || U.norm(titulo).slice(0, 40), titulo: titulo || ref, autor: g(r, 'autor'), editorial: g(r, 'editorial'), precio: isNaN(precio) ? null : precio, updatedAt: U.now() });
    }
    return out;
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
    const rows = clientes.map(c => ({ 'Código': c.codigo || '', 'Nombre': c.nombre, 'Dirección': U.direccion(c).l1, 'CP': c.cp, 'Localidad': c.localidad, 'Provincia': c.provincia || '', 'Teléfono': c.telefono || '', 'Contacto': c.contacto || '', 'Tamaño': U.tamanoLabel(c.tamano), 'Frecuencia': U.frecuenciaLabel(c.frecuenciaDias), 'Última visita': c.ultimaVisita || '', 'Estado': U.estado(c).label, 'Notas': c.nota || '', 'Lat': c.lat || '', 'Lng': c.lng || '' }));
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
