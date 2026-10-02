/* Geocodificación (Nominatim / Photon, datos OpenStreetMap) y matriz de tiempos (OSRM). */
const GEO = {
  UA: 'RutasComerciales/1.0 (app personal de rutas de visitas)',
  _last: 0,
  async _throttle(ms) {
    const wait = GEO._last + ms - Date.now();
    if (wait > 0) await U.sleep(wait);
    GEO._last = Date.now();
  },

  /* Devuelve {lat, lng, precision} o null si la dirección no existe. precision: 'exacta' | 'calle' | 'localidad'.
     Lanza un error si no se pudo preguntar (sin conexión, servicio saturado): así no se marca como «no encontrada». */
  async geocode(c) {
    const dir = U.direccion(c);
    let fallos = 0;
    const comprobar = r => { if (!r.ok && (r.status === 429 || r.status >= 500)) fallos++; return r.ok; };
    // 1) Nominatim estructurado
    try {
      await GEO._throttle(1100);
      const p = new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: 'es', addressdetails: '1' });
      if (dir.l1) p.set('street', dir.l1.replace(',', ''));
      if (c.cp) p.set('postalcode', c.cp);
      if (c.localidad) p.set('city', c.localidad);
      const r = await fetch('https://nominatim.openstreetmap.org/search?' + p, { headers: { 'Accept-Language': 'es' } });
      if (comprobar(r)) {
        const j = await r.json();
        if (j[0]) {
          const t = j[0].addresstype || j[0].type;
          const precision = (t === 'building' || t === 'house' || t === 'shop' || t === 'amenity' || j[0].address?.house_number) ? 'exacta' : (t === 'road' || t === 'street' ? 'calle' : 'localidad');
          if (precision !== 'localidad') return { lat: +j[0].lat, lng: +j[0].lon, precision };
        }
      }
    } catch (e) { fallos++; console.warn('nominatim', e); }
    // 2) Photon (texto libre, sesgado a Cataluña)
    try {
      await GEO._throttle(600);
      const q = [dir.l1, c.cp, c.localidad].filter(Boolean).join(' ');
      const r = await fetch('https://photon.komoot.io/api/?' + new URLSearchParams({ q, limit: '1', lat: '41.6', lon: '1.9' }));
      if (comprobar(r)) {
        const j = await r.json();
        const f = j.features && j.features[0];
        if (f) {
          const pr = f.properties;
          const sameCp = !c.cp || !pr.postcode || String(pr.postcode) === String(c.cp);
          const precision = pr.housenumber ? 'exacta' : (pr.street || pr.type === 'street' ? 'calle' : 'localidad');
          if (sameCp && precision !== 'localidad') return { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], precision };
        }
      }
    } catch (e) { fallos++; console.warn('photon', e); }
    // 3) Solo localidad (para poder situarlo aproximadamente)
    try {
      await GEO._throttle(1100);
      const p = new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: 'es' });
      if (c.cp) p.set('postalcode', c.cp);
      if (c.localidad) p.set('city', c.localidad);
      const r = await fetch('https://nominatim.openstreetmap.org/search?' + p);
      if (comprobar(r)) { const j = await r.json(); if (j[0]) return { lat: +j[0].lat, lng: +j[0].lon, precision: 'localidad' }; }
    } catch (e) { fallos++; console.warn('nominatim2', e); }
    if (fallos) throw new Error('Sin conexión con el buscador de direcciones');
    return null;
  },

  /* Geocodifica una dirección libre (para el origen/destino de una ruta) */
  /* Lanza un error si no hay conexión; null si el lugar no existe */
  async geocodeTexto(texto) {
    await GEO._throttle(1100);
    const r = await fetch('https://nominatim.openstreetmap.org/search?' + new URLSearchParams({ q: texto + ', España', format: 'jsonv2', limit: '1', countrycodes: 'es' })).catch(() => null);
    if (!r || !r.ok) throw new Error('Sin conexión con el buscador de direcciones');
    const j = await r.json();
    return j[0] ? { lat: +j[0].lat, lng: +j[0].lon, nombre: j[0].display_name.split(',').slice(0, 2).join(',') } : null;
  },

  /* Matriz de duraciones (min) y distancias (km) entre puntos [{lat,lng}]. OSRM público; si falla, estimación por distancia. */
  async matrix(points) {
    const n = points.length;
    const fallback = () => {
      const dur = [], dist = [];
      for (let i = 0; i < n; i++) {
        dur.push([]); dist.push([]);
        for (let j = 0; j < n; j++) {
          const km = i === j ? 0 : U.haversineKm(points[i], points[j]) * 1.3;
          dist[i].push(km); dur[i].push(km / 55 * 60); // el tiempo hasta el coche se suma aparte (Ajustes)
        }
      }
      return { dur, dist, estimado: true };
    };
    if (n < 2) return fallback();
    if (!navigator.onLine) return fallback();
    try {
      const coords = points.map(p => `${p.lng},${p.lat}`).join(';');
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
      const r = await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration,distance`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) return fallback();
      const j = await r.json();
      if (j.code !== 'Ok') return fallback();
      const dur = j.durations.map(row => row.map(s => (s == null ? 999 : s / 60)));
      const dist = j.distances.map(row => row.map(m => (m == null ? 999 : m / 1000)));
      return { dur, dist, estimado: false };
    } catch (e) { console.warn('osrm', e); return fallback(); }
  },

  async miUbicacion() {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(new Error('Sin geolocalización'));
      navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude }), e => rej(e), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    });
  },
};
