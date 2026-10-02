/* Copia en línea automática (Supabase). Opcional: la app funciona igual sin configurarla.
   Modelo: una tabla `registros` (user_id, kind, id, data, updated_at, deleted). Último en escribir gana. */
const SYNC = {
  client: null, cfg: null, estado: 'off', ultimo: null, error: null, _timer: null, _running: false,
  // Proyecto por defecto: así basta con iniciar sesión en cada dispositivo. La clave publishable es pública por diseño (RLS protege los datos).
  DEFAULT: { url: 'https://rsjlsgilfuubuixrfepp.supabase.co', key: 'sb_publishable_oQCCweWb1iQVSrkveOmeAw_UzpZqJCJ' },
  listeners: new Set(),
  onChange(fn) { SYNC.listeners.add(fn); },
  _emit() { for (const fn of SYNC.listeners) { try { fn(SYNC); } catch (e) { } } },

  async init() {
    SYNC.cfg = await DB.get('supabase', SYNC.DEFAULT); // null = desactivada a propósito
    SYNC.ultimo = await DB.get('syncUltimo', null);
    if (!SYNC.cfg || !SYNC.cfg.url || !SYNC.cfg.key) { SYNC.estado = 'off'; return; }
    try {
      SYNC.client = supabase.createClient(SYNC.cfg.url, SYNC.cfg.key, { auth: { persistSession: true, autoRefreshToken: true } });
      // con un usuario ya conectado en este móvil no se hace esperar al arrancar: si la red no contesta pronto, se sigue y se sincroniza después
      const { data, error } = await SYNC.sesion((await DB.get('syncUid', null)) ? 2500 : 8000);
      if (data.session) { await SYNC._propietario(data.session.user.id); SYNC.estado = 'ok'; }
      // sin red y con un usuario ya conectado en este dispositivo: se sigue trabajando y se sincroniza al volver la conexión
      else SYNC.estado = SYNC.esRed(error) && (await DB.get('syncUid', null)) ? 'ok' : 'sin-sesion';
    } catch (e) { SYNC.estado = 'error'; SYNC.error = e.message; }
    SYNC._emit();
    if (SYNC.estado === 'ok') SYNC.programar(1500);
    if (SYNC._escuchando) return; // init() se vuelve a llamar al configurar: los avisos se registran una sola vez
    SYNC._escuchando = true;
    window.addEventListener('online', () => SYNC.programar(2000));
    DB.onChange(() => SYNC.programar(3000));
    setInterval(() => SYNC.programar(500), 5 * 60 * 1000);
  },
  async configurar(url, key) {
    await DB.set('supabase', { url: url.trim().replace(/\/$/, ''), key: key.trim() });
    await SYNC.init();
  },
  /* forzar: entrar aunque haya cambios sin subir de otra cuenta (se pierden). Sin forzar, en ese caso
     se cierra la sesión recién abierta y se lanza un error con code 'pendientes'. */
  async login(email, password, { forzar = false } = {}) {
    if (!SYNC.client) throw new Error('Configura primero la URL y la clave');
    const { data, error } = await SYNC.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const prev = await DB.get('syncUid', null), n = await db.outbox.count();
    if (prev && prev !== data.user.id && n && !forzar) {
      await SYNC.client.auth.signOut({ scope: 'local' }).catch(() => { });
      throw Object.assign(new Error('Hay cambios sin subir de otra cuenta'), { code: 'pendientes', n });
    }
    await SYNC._propietario(data.user.id); await DB.set('syncEmail', email); await DB.set('syncSalida', false);
    SYNC.estado = 'ok'; SYNC._emit(); SYNC.programar(500);
  },
  async registro(email, password) {
    if (!SYNC.client) throw new Error('Configura primero la URL y la clave');
    const { data, error } = await SYNC.client.auth.signUp({ email, password });
    if (error) throw error;
    if (data.session) { await SYNC._propietario(data.user.id); await DB.set('syncEmail', email); await DB.set('syncSalida', false); SYNC.estado = 'ok'; SYNC._emit(); SYNC.programar(500); return 'ok'; }
    return 'confirmar';
  },
  /* aProposito: el usuario cierra sesión él mismo; entonces la pantalla de entrada ya no ofrece
     «seguir sin conexión» con los datos que quedan en el móvil. */
  async logout({ aProposito = true } = {}) {
    if (SYNC.estado === 'ok') await SYNC.ahora().catch(() => { }); // subir lo pendiente antes de salir
    // scope local: la sesión de este móvil se borra aunque no haya conexión
    if (SYNC.client) await SYNC.client.auth.signOut({ scope: 'local' }).catch(() => { });
    if (aProposito) await DB.set('syncSalida', true);
    SYNC.estado = SYNC.client ? 'sin-sesion' : 'off'; SYNC._emit(); },
  async desactivar() { if (SYNC.client) await SYNC.logout({ aProposito: false }); await DB.set('supabase', null); SYNC.client = null; SYNC.cfg = null; SYNC.estado = 'off'; SYNC._emit(); },

  // Los datos locales pertenecen a un solo usuario: si inicia sesión otro, se vacían (con su PIN y sus
  // ajustes personales) y se bajan los suyos.
  async _propietario(uid) {
    const prev = await DB.get('syncUid', null);
    if (prev === uid) return;
    if (prev) {
      await DB.wipe();
      for (const k of ['pin', 'lastBackup', 'demoCargada']) await DB.set(k, null);
      if (typeof APP !== 'undefined') APP.pin = null;
    }
    await DB.set('syncDesde', null); await DB.set('syncUltimo', null); SYNC.ultimo = null;
    await DB.set('syncUid', uid);
  },
  sesion(ms = 8000) { // getSession con límite de tiempo (con el token caducado intenta renovarlo por red)
    return Promise.race([SYNC.client.auth.getSession(), U.sleep(ms).then(() => ({ data: { session: null }, error: { name: 'timeout' } }))]);
  },
  // navigator.onLine no es fiable en algunos Android: se mira el error real
  esRed(e) { return !!e && /retryable|fetch|network|timeout|load failed/i.test((e.name || '') + ' ' + (e.message || '')); },

  programar(ms) {
    if (SYNC.estado !== 'ok') return;
    clearTimeout(SYNC._timer); SYNC._timer = setTimeout(() => SYNC.ahora().catch(e => console.warn(e)), ms);
  },

  async ahora() {
    if (SYNC._running || !SYNC.client || SYNC.estado !== 'ok') return;
    SYNC._running = true; SYNC.error = null;
    try {
      const { data: s, error: se } = await SYNC.sesion();
      if (!s.session) { if (SYNC.esRed(se)) SYNC.error = 'Sin conexión con la copia en línea (' + (se.message || se.name) + ')'; else SYNC.estado = 'sin-sesion'; return; }
      const uid = s.session.user.id;
      // 1) subir pendientes
      const pend = await db.outbox.toArray();
      if (pend.length) {
        const filas = [];
        const vistos = new Set();
        for (const o of pend) {
          const k = o.kind + ':' + o.id; if (vistos.has(k)) continue; vistos.add(k);
          const rec = await db[o.kind].get(o.id);
          if (!rec) continue;
          filas.push({ user_id: uid, kind: o.kind, id: String(o.id), data: rec, updated_at: rec.updatedAt || U.now(), deleted: !!rec.deleted });
        }
        for (let i = 0; i < filas.length; i += 200) {
          const { error } = await SYNC.client.from('registros').upsert(filas.slice(i, i + 200), { onConflict: 'user_id,kind,id' });
          if (error) throw error;
        }
        await db.outbox.bulkDelete(pend.map(o => o.n));
      }
      // 2) bajar cambios. Se vuelve a pedir un margen de 2 min antes del último visto: una escritura que
      // terminó un poco después de otra más reciente no se pierde (lo repetido se descarta al comparar updatedAt).
      const desde = (await DB.get('syncDesde', null)) || '1970-01-01T00:00:00Z';
      const desdeMargen = new Date(Math.max(0, new Date(desde).getTime() - 120000)).toISOString();
      let max = desde, cambios = 0;
      for (let page = 0; page < 50; page++) {
        const { data, error } = await SYNC.client.from('registros').select('kind,id,data,updated_at,deleted').gt('updated_at', desdeMargen).order('updated_at', { ascending: true }).range(page * 500, page * 500 + 499);
        if (error) throw error;
        if (!data || !data.length) break;
        for (const r of data) {
          if (!db[r.kind]) continue;
          const key = r.kind === 'catalogo' ? r.data.ref : r.data.id;
          const cur = await db[r.kind].get(key);
          if (!cur || (r.data.updatedAt || '') > (cur.updatedAt || '')) { await db[r.kind].put(r.data); cambios++; }
          if (new Date(r.updated_at) > new Date(max)) max = r.updated_at;
        }
        if (data.length < 500) break;
      }
      await DB.set('syncDesde', max);
      SYNC.ultimo = U.now(); await DB.set('syncUltimo', SYNC.ultimo);
      if (cambios) DB.changed('sync');
    } catch (e) {
      SYNC.error = e.message || String(e);
      if (/paused|fetch|network/i.test(SYNC.error)) SYNC.error = 'Sin conexión con la copia en línea (' + SYNC.error + ')';
      console.warn('sync', e);
    } finally { SYNC._running = false; SYNC._emit(); }
  },

  SQL: `-- Rutas Comerciales — copie en ligne automatique
-- À exécuter dans Supabase : menu "SQL Editor" → "New query" → coller → "Run".
-- Crée la table où l'appli copie chaque changement (clients, visites, commandes, tournées, catalogue),
-- réservée à l'utilisateur connecté (row level security).
-- Le script peut être relancé sans risque : il ne touche pas aux données déjà copiées.

create table if not exists public.registros (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  kind       text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  deleted    boolean     not null default false,
  primary key (user_id, kind, id)
);

create index if not exists registros_user_updated on public.registros (user_id, updated_at);

alter table public.registros enable row level security;

drop policy if exists "propios" on public.registros;
create policy "propios" on public.registros
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- v2 (octobre 2026, appliquée sur le projet préconfiguré le 2 octobre 2026) : date d'écriture donnée par le serveur et « la version la plus récente gagne ».
-- * updated_at = heure du serveur : un téléphone qui renvoie tard une modif faite hors ligne (ou dont
--   l'horloge est fausse) n'est plus ignoré par les autres appareils.
-- * Une version plus ancienne que celle déjà enregistrée (data.updatedAt) ne l'écrase plus.
create or replace function public.registros_antes_de_escribir() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and coalesce(new.data->>'updatedAt', '') < coalesce(old.data->>'updatedAt', '') then
    return old; -- version plus ancienne : on garde celle du serveur
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists registros_antes_de_escribir on public.registros;
create trigger registros_antes_de_escribir
  before insert or update on public.registros
  for each row execute function public.registros_antes_de_escribir();
`,
};
