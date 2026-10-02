/* Base de datos local (IndexedDB vía Dexie). Todo vive en el móvil. */
const db = new Dexie('rutas-comerciales');
db.version(1).stores({
  clientes: 'id, nombre, cp, localidad, provincia, ultimaVisita, updatedAt, deleted',
  visitas: 'id, clienteId, fecha, updatedAt, deleted',
  pedidos: 'id, clienteId, fecha, enviado, updatedAt, deleted',
  catalogo: 'ref, titulo, updatedAt',
  rutas: 'id, fecha, updatedAt, deleted',
  ajustes: 'key',
  outbox: '++n, kind, id',
});

const DB = {
  /* ---------- ajustes ---------- */
  async get(key, def) { const r = await db.ajustes.get(key); return r ? r.value : def; },
  async set(key, value) { await db.ajustes.put({ key, value }); },

  /* ---------- escritura con marca de tiempo y cola de sincronización ---------- */
  async save(kind, rec) {
    rec.updatedAt = U.now();
    if (!rec.createdAt) rec.createdAt = rec.updatedAt;
    await db[kind].put(rec);
    await db.outbox.put({ kind, id: rec.id || rec.ref, at: rec.updatedAt });
    DB.changed(kind);
    return rec;
  },
  async softDelete(kind, id) {
    const r = await db[kind].get(id); if (!r) return;
    r.deleted = true; await DB.save(kind, r);
  },
  async bulkSave(kind, recs) {
    const t = U.now();
    for (const r of recs) { r.updatedAt = t; if (!r.createdAt) r.createdAt = t; }
    await db[kind].bulkPut(recs);
    await db.outbox.bulkPut(recs.map(r => ({ kind, id: r.id || r.ref, at: t })));
    DB.changed(kind);
  },
  listeners: new Set(),
  onChange(fn) { DB.listeners.add(fn); return () => DB.listeners.delete(fn); },
  changed(kind) { for (const fn of DB.listeners) { try { fn(kind); } catch (e) { console.error(e); } } },

  /* ---------- lecturas ---------- */
  async clientes() { return (await db.clientes.toArray()).filter(c => !c.deleted); },
  async cliente(id) { return db.clientes.get(id); },
  async visitasDe(clienteId) {
    return (await db.visitas.where('clienteId').equals(clienteId).toArray()).filter(v => !v.deleted).sort((a, b) => b.fecha.localeCompare(a.fecha));
  },
  async pedidosDe(clienteId) {
    return (await db.pedidos.where('clienteId').equals(clienteId).toArray()).filter(v => !v.deleted).sort((a, b) => b.fecha.localeCompare(a.fecha));
  },
  async pedidosDelDia(isoDate) {
    return (await db.pedidos.toArray()).filter(p => !p.deleted && U.isoDate(new Date(p.fecha)) === isoDate).sort((a, b) => a.fecha.localeCompare(b.fecha));
  },
  async pedidosPendientes() {
    return (await db.pedidos.toArray()).filter(p => !p.deleted && !p.enviado).sort((a, b) => a.fecha.localeCompare(b.fecha));
  },
  async rutas() { return (await db.rutas.toArray()).filter(r => !r.deleted).sort((a, b) => b.fecha.localeCompare(a.fecha)); },
  async rutaDelDia(isoDate) {
    const rs = (await db.rutas.where('fecha').equals(isoDate).toArray()).filter(r => !r.deleted);
    return rs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] || null;
  },
  async catalogo() { return db.catalogo.toArray(); },

  /* ---------- registrar visita ---------- */
  async registrarVisita({ clienteId, resultado, nota, pedidoId, fecha }) {
    const v = { id: U.uuid(), clienteId, resultado, nota: nota || '', pedidoId: pedidoId || null, fecha: fecha || U.now() };
    await DB.save('visitas', v);
    if (resultado !== 'ausente') {
      const c = await db.clientes.get(clienteId);
      if (c) {
        const f = U.isoDate(new Date(v.fecha)); // día local (v.fecha está en UTC)
        if (!c.ultimaVisita || c.ultimaVisita < f) { c.ultimaVisita = f; await DB.save('clientes', c); }
      }
    }
    return v;
  },

  /* ---------- copia de seguridad ---------- */
  /* Ajustes propios de este móvil o de la cuenta: no viajan en la copia (el PIN, la identidad y el punto de sincronización) */
  AJUSTES_LOCALES: ['supabase', 'session', 'pin', 'syncUid', 'syncDesde', 'syncUltimo', 'syncEmail', 'syncSalida', 'lastBackup'],
  async exportAll() {
    const out = { app: 'rutas-comerciales', version: 1, exportedAt: U.now() };
    for (const t of ['clientes', 'visitas', 'pedidos', 'catalogo', 'rutas', 'ajustes']) out[t] = await db[t].toArray();
    out.ajustes = out.ajustes.filter(a => !DB.AJUSTES_LOCALES.includes(a.key));
    return out;
  },
  async importAll(data, { replace = false } = {}) {
    if (!data || data.app !== 'rutas-comerciales') throw new Error('El archivo no es una copia de esta app');
    await db.transaction('rw', db.clientes, db.visitas, db.pedidos, db.catalogo, db.rutas, db.ajustes, db.outbox, async () => {
      for (const t of ['clientes', 'visitas', 'pedidos', 'rutas']) {
        if (replace) await db[t].clear();
        const recs = data[t] || [];
        for (const r of recs) {
          const cur = await db[t].get(r.id);
          if (!cur || !cur.updatedAt || (r.updatedAt || '') >= cur.updatedAt) { await db[t].put(r); await db.outbox.put({ kind: t, id: r.id, at: U.now() }); }
        }
      }
      if (data.catalogo && data.catalogo.length) { if (replace) await db.catalogo.clear(); await db.catalogo.bulkPut(data.catalogo); await db.outbox.bulkPut(data.catalogo.map(k => ({ kind: 'catalogo', id: k.ref, at: U.now() }))); }
      for (const a of (data.ajustes || [])) if (!DB.AJUSTES_LOCALES.includes(a.key)) await db.ajustes.put(a);
    });
    DB.changed('all');
  },
  async wipe() {
    await Promise.all(['clientes', 'visitas', 'pedidos', 'catalogo', 'rutas', 'outbox'].map(t => db[t].clear()));
    // sin datos locales, la próxima sincronización debe bajarlo todo otra vez
    await DB.set('syncDesde', null); await DB.set('syncUltimo', null);
    if (typeof SYNC !== 'undefined') SYNC.ultimo = null;
    DB.changed('all');
  },
  async counts() { // sin contar lo borrado (los borrados son lógicos)
    const vivos = t => db[t].filter(r => !r.deleted).count();
    const [c, v, p, k, r] = await Promise.all([vivos('clientes'), vivos('visitas'), vivos('pedidos'), db.catalogo.count(), vivos('rutas')]);
    return { clientes: c, visitas: v, pedidos: p, catalogo: k, rutas: r };
  },
};
