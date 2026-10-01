-- Rutas Comerciales — copie en ligne automatique
-- À exécuter UNE fois dans Supabase : menu "SQL Editor" → "New query" → coller → "Run".
-- Crée la table où l'appli copie chaque changement (clients, visites, commandes, tournées, catalogue),
-- réservée à l'utilisateur connecté (row level security).

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

create policy "propios" on public.registros
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
