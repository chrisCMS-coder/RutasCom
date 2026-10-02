/* Utilidades generales */
const U = {
  uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  },
  now() { return new Date().toISOString(); },
  /* fecha de modificación: ahora, pero siempre después de la versión anterior (un móvil con el reloj atrasado
     que edita una versión bajada de otro aparato no debe quedar «más antiguo» y ser ignorado por el servidor) */
  despues(prev) { const t = new Date().toISOString(); return prev && t <= prev ? new Date(new Date(prev).getTime() + 1).toISOString() : t; },
  today() { return U.isoDate(new Date()); },
  isoDate(d) {
    const z = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  },
  parseDate(s) { // 'YYYY-MM-DD' -> Date local midnight
    if (!s) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) { const d = new Date(s); return isNaN(d) ? null : d; }
    return new Date(+m[1], +m[2] - 1, +m[3]);
  },
  daysBetween(a, b) { // whole days from a to b (Dates)
    const ms = 24 * 3600 * 1000;
    const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((db - da) / ms);
  },
  daysSince(isoDate) {
    const d = U.parseDate(isoDate); if (!d) return null;
    return U.daysBetween(d, new Date());
  },
  fmtDate(iso, opts) {
    const d = typeof iso === 'string' ? (iso.length <= 10 ? U.parseDate(iso) : new Date(iso)) : iso;
    if (!d || isNaN(d)) return '';
    return d.toLocaleDateString('es-ES', opts || { day: 'numeric', month: 'short' });
  },
  fmtDateLong(iso) {
    return U.fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'long' });
  },
  fmtTime(min) { // minutes from midnight -> 'HH:MM'
    if (min == null || isNaN(min)) return '';
    min = Math.round(min);
    const h = Math.floor(min / 60) % 24, m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  },
  parseTime(s) { // 'HH:MM' -> minutes
    if (!s) return null;
    const m = /^(\d{1,2}):(\d{2})/.exec(String(s).trim());
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  },
  fmtDur(min) {
    min = Math.round(min || 0);
    const h = Math.floor(min / 60), m = min % 60;
    if (h === 0) return `${m} min`;
    return m ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`;
  },
  fmtKm(km) { return km == null ? '' : (km < 10 ? km.toFixed(1) : Math.round(km)) + ' km'; },
  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  norm(s) { // para búsquedas: sin acentos, minúsculas
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  },
  cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); },
  haversineKm(a, b) {
    const R = 6371, toR = x => x * Math.PI / 180;
    const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  },
  debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
  async hash(str) { // SHA-256 en hexadecimal (para el PIN)
    if (crypto.subtle) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
    let h = 0x811c9dc5; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return 'fnv' + h.toString(16);
  },
  randomHex(n = 16) { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); },
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
  frecuenciaLabel(dias) {
    const map = { 7: 'Semanal', 15: 'Quincenal', 30: 'Mensual', 45: 'Cada 45 días', 60: 'Bimensual', 90: 'Trimestral', 120: 'Cada 4 meses', 180: '6 meses', 365: 'Anual' };
    return map[dias] || `Cada ${dias} días`;
  },
  tamanoLabel(t) { return { 'pequeño': 'Pequeño', 'mediano': 'Mediano', 'grande': 'Grande' }[t] || U.cap(t || ''); },
  direccion(c) {
    const l1 = [c.calle, c.numero].filter(Boolean).join(', ');
    const l2 = [c.cp, c.localidad].filter(Boolean).join(' ');
    return { l1, l2, full: [l1, l2].filter(Boolean).join(', ') };
  },
  mapsUrl(c) {
    // Se envía la dirección escrita: las coordenadas de OpenStreetMap son a veces aproximadas (punto en la calle)
    // y Google mostraría otro número o CP. Sin calle se añade el nombre del comercio para que Google lo encuentre.
    // Solo coordenadas si el cliente se situó a mano o no hay ningún dato de dirección.
    const d = U.direccion(c);
    const texto = d.l1 ? d.full : [c.nombre, d.l2].filter(Boolean).join(', ');
    const dest = c.lat && c.lng && (c.geocodeStatus === 'manual' || !d.full) ? `${c.lat},${c.lng}` : encodeURIComponent(texto + ', España');
    return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
  },
  /* Estado de visita: verde / ambar / rojo / azul (sin visitar). Prospectos e inactivos van aparte
     (sin alertas de visita): key 'prospecto' / 'inactivo'. */
  estado(c, hoy) {
    if (c.prospecto || c.inactivo) {
      const dias = c.ultimaVisita ? U.daysSince(c.ultimaVisita) : null;
      return c.prospecto ? { key: 'prospecto', dias, label: 'Prospecto', limite: null } : { key: 'inactivo', dias, label: 'Inactivo', limite: null };
    }
    if (!c.ultimaVisita) return { key: 'azul', dias: null, label: 'Sin visitar', limite: c.frecuenciaDias || 30 };
    const dias = U.daysSince(c.ultimaVisita);
    const limite = c.frecuenciaDias || 30;
    const margen = Math.max(5, Math.round(limite * 0.2));
    let key = 'verde';
    if (dias > limite) key = 'rojo';
    else if (dias > limite - margen) key = 'ambar';
    const label = key === 'rojo' ? 'Fuera de plazo' : key === 'ambar' ? 'Próximo a vencer' : 'Al día';
    return { key, dias, label, limite, restante: limite - dias };
  },
  estadoFrase(c) {
    const e = U.estado(c);
    if (e.key === 'prospecto' || e.key === 'inactivo') return e.dias == null ? (e.key === 'prospecto' ? 'Prospecto · todavía sin visita' : 'Inactivo · sin visitas registradas') : `${e.label} · última visita hace ${e.dias} días`;
    if (e.key === 'azul') return 'Todavía sin visita registrada';
    if (e.dias === 0) return 'Visitado hoy';
    if (e.dias === 1) return 'Visitado ayer';
    return `Lleva ${e.dias} días sin visita`;
  },

  /* ---------- números, teléfonos, fechas ---------- */
  fmtEur(n, dec = 0) { return n == null || isNaN(n) ? '—' : Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: dec, maximumFractionDigits: dec }); },
  fmtPct(x) { return x == null || !isFinite(x) ? '—' : (x > 0 ? '+' : '') + Math.round(x * 100) + ' %'; },
  digitos(t) { return String(t || '').replace(/\D/g, ''); },
  /* Número internacional sin '+' para wa.me / sms (España por defecto): '34612345678' o null */
  telIntl(t) {
    let d = U.digitos(t); if (!d) return null;
    if (d.startsWith('00')) d = d.slice(2);
    if (d.length === 9 && /^[6789]/.test(d)) d = '34' + d;
    return d.length >= 11 ? d : null;
  },
  esMovil(t) { const d = U.telIntl(t); return !!d && /^34[67]\d{8}$/.test(d); },
  /* Móvil del cliente: el campo «Móvil» o, si no lo tiene, el teléfono cuando es un móvil */
  movil(c) { return c.movil || (U.esMovil(c.telefono) ? c.telefono : ''); },
  /* Cómo avisar: 'whatsapp' | 'sms' | null (sin móvil) */
  canal(c) { const m = U.movil(c); if (!m || !U.telIntl(m)) return null; return c.whatsapp === false ? 'sms' : 'whatsapp'; },
  urlMensaje(c, texto) {
    const n = U.telIntl(U.movil(c)), canal = U.canal(c); if (!canal) return null;
    return canal === 'whatsapp' ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : `sms:+${n}?body=${encodeURIComponent(texto)}`;
  },
  abrir(url) { if (/^(sms|tel):/.test(url)) location.href = url; else window.open(url, '_blank', 'noopener'); },
  mesLabel(ym, largo) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('es-ES', largo ? { month: 'long', year: 'numeric' } : { month: 'short' }).replace('.', '');
  },
  /* «hoy» / «mañana» / «jueves 9» (o en catalán) para el día de la ruta visto desde hoy */
  diaRelativo(iso, idioma = 'es') {
    const d = U.daysBetween(new Date(), U.parseDate(iso));
    if (d === 0) return idioma === 'ca' ? 'avui' : 'hoy';
    if (d === 1) return idioma === 'ca' ? 'demà' : 'mañana';
    return U.parseDate(iso).toLocaleDateString(idioma === 'ca' ? 'ca-ES' : 'es-ES', { weekday: 'long', day: 'numeric' });
  },
  horaTexto(min) { if (min == null) return ''; const h = Math.floor(min / 60), m = Math.round(min % 60); return m ? `${h}:${String(m).padStart(2, '0')}h` : `${h}h`; },
  /* ---------- categorías y zonas ---------- */
  categoria(c) { return c.prospecto ? 'prospecto' : c.inactivo ? 'inactivo' : 'cliente'; },
  /* Comarca: la escrita en la ficha o, si no, por el municipio y, si no, por el código postal (tabla oficial) */
  comarca(c) {
    if (c.comarca) return c.comarca;
    if (typeof COMARCAS === 'undefined') return '';
    const m = COMARCAS.municipio[U.norm(c.localidad)];
    if (m != null) return COMARCAS.nombres[m];
    const k = COMARCAS.cp[String(c.cp || '').padStart(5, '0')];
    return k != null ? COMARCAS.nombres[k] : '';
  },
  /* Región: los 8 ámbitos territoriales de la Generalitat (vegueries), deducidos de la comarca */
  REGIONES: {
    'Àrea metropolitana': ['Barcelonès', 'Baix Llobregat', 'Maresme', 'Vallès Occidental', 'Vallès Oriental'],
    'Comarques Gironines': ['Alt Empordà', 'Baix Empordà', 'Garrotxa', 'Gironès', "Pla de l'Estany", 'Ripollès', 'Selva'],
    'Camp de Tarragona': ['Alt Camp', 'Baix Camp', 'Conca de Barberà', 'Priorat', 'Tarragonès'],
    "Terres de l'Ebre": ['Baix Ebre', 'Montsià', "Ribera d'Ebre", 'Terra Alta'],
    'Ponent': ['Garrigues', 'Noguera', "Pla d'Urgell", 'Segarra', 'Segrià', 'Urgell'],
    'Comarques Centrals': ['Bages', 'Berguedà', 'Lluçanès', 'Moianès', 'Osona', 'Solsonès'],
    'Alt Pirineu i Aran': ['Alt Urgell', 'Alta Ribagorça', 'Aran', 'Cerdanya', 'Pallars Jussà', 'Pallars Sobirà'],
    'Penedès': ['Alt Penedès', 'Anoia', 'Baix Penedès', 'Garraf'],
  },
  region(c) {
    if (!U._regionDe) { U._regionDe = {}; for (const [r, cs] of Object.entries(U.REGIONES)) for (const x of cs) U._regionDe[U.norm(x)] = r; }
    const com = U.comarca(c);
    return (com && U._regionDe[U.norm(com)]) || '';
  },
  textoRegion(c) { const r = U.region(c), com = U.comarca(c); return r ? `Región: ${r} (${com})` : com ? `Comarca: ${com}` : ''; },
};