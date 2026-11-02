-- Noting: schema inicial (notes + links) com RLS por usuário.
--
-- Convenção de caminho:
--   notes.path  = pasta da nota, sem barras nas pontas ('' = raiz).
--                 Ex.: 'Projetos/app-notas'
--   notes.title = nome da nota (sem '/'). Ex.: 'Ideias para o app'
--   Arquivo exportado = path || '/' || title || '.md'
-- A árvore de pastas da barra lateral é derivada de path.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- notes
-- ---------------------------------------------------------------------------
create table public.notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid()
             references auth.users (id) on delete cascade,
  path       text not null default '',
  title      text not null,
  body       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Busca por título (peso A) e conteúdo (peso B).
  search     tsvector generated always as (
               setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
               setweight(to_tsvector('simple', coalesce(body, '')), 'B')
             ) stored,

  constraint notes_title_valid check (
    length(btrim(title)) > 0 and position('/' in title) = 0
  ),
  constraint notes_path_valid check (
    path = '' or (path !~ '^/' and path !~ '/$' and path !~ '//')
  ),
  constraint notes_unique_title_per_folder unique (user_id, path, title)
);

create index notes_user_updated_idx on public.notes (user_id, updated_at desc);
create index notes_user_path_idx    on public.notes (user_id, path);
create index notes_search_idx       on public.notes using gin (search);
create index notes_title_trgm_idx   on public.notes
  using gin (title extensions.gin_trgm_ops);

-- updated_at automático
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- links: reconstruída a cada salvamento a partir dos [[links]] do body.
-- ---------------------------------------------------------------------------
create table public.links (
  from_id uuid not null references public.notes (id) on delete cascade,
  to_id   uuid not null references public.notes (id) on delete cascade,
  user_id uuid not null default auth.uid()
          references auth.users (id) on delete cascade,
  primary key (from_id, to_id)
);

create index links_to_idx on public.links (to_id);
create index links_user_idx on public.links (user_id);

-- ---------------------------------------------------------------------------
-- RLS: cada usuário só enxerga e altera os próprios dados.
-- ---------------------------------------------------------------------------
alter table public.notes enable row level security;
alter table public.links enable row level security;

create policy "notes: select own" on public.notes
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "notes: insert own" on public.notes
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "notes: update own" on public.notes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "notes: delete own" on public.notes
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "links: select own" on public.links
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Só permite ligar notas que também pertencem ao usuário.
create policy "links: insert own" on public.links
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.notes n
                where n.id = from_id and n.user_id = (select auth.uid()))
    and exists (select 1 from public.notes n
                where n.id = to_id and n.user_id = (select auth.uid()))
  );

create policy "links: delete own" on public.links
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Anônimos não têm acesso algum.
revoke all on public.notes from anon;
revoke all on public.links from anon;
