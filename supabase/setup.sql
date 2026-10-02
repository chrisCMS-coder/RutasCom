-- Rutas Comerciales — copie en ligne automatique
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
