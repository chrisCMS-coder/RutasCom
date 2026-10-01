/* Utilidades generales */
const U = {
  uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  },
  now() { return new Date().toISOString(); },
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
    const dest = (c.lat && c.lng) ? `${c.lat},${c.lng}` : encodeURIComponent(U.direccion(c).full + ', España');
    return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
  },
  /* Estado de visita: verde / ambar / rojo / azul (sin visitar) */
  estado(c, hoy) {
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
    if (e.key === 'azul') return 'Todavía sin visita registrada';
    if (e.dias === 0) return 'Visitado hoy';
    if (e.dias === 1) return 'Visitado ayer';
    return `Lleva ${e.dias} días sin visita`;
  },
};
