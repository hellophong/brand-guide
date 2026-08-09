-- ============================================================================
-- Spectra — initial database schema
--
-- WHAT THIS DOES, in plain language:
--   Builds the shelves (tables) that hold every brand, colour, typeface,
--   logo rule, document and asset — and fits the locks (row-level security)
--   so that:
--     * anyone at all can READ a brand once it is published
--     * drafts are visible only to admins
--     * only signed-in admins can WRITE anything, ever
--
-- HOW TO RUN IT:
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file
--   -> Run. It is safe to run more than once.
--
--   Then scroll to the very bottom and follow the BOOTSTRAP step to make
--   yourself an admin. Nothing works properly until you do.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Who is an admin
--
-- One row per admin. Being listed here is what "admin" means — there is no
-- other definition anywhere in the system.
-- ----------------------------------------------------------------------------
create table if not exists public.admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  added_at    timestamptz not null default now()
);

-- A small helper the locks below all ask: "is the person making this request
-- an admin?" SECURITY DEFINER lets it read the admins table without tripping
-- over the locks on that same table.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins a where a.user_id = auth.uid()
  );
$$;


-- ----------------------------------------------------------------------------
-- 2. Brands — the top-level shelf
-- ----------------------------------------------------------------------------
create table if not exists public.brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  tagline     text,
  status      text not null default 'processing'
              check (status in ('processing','review','published')),
  owner       text,
  confidence  int check (confidence between 0 and 100),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists brands_status_idx on public.brands(status);

-- "Can the public see this brand?" Used by every child table below, so the
-- rule lives in exactly one place.
create or replace function public.brand_readable(b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.brands br
    where br.id = b
      and (br.status = 'published' or public.is_admin())
  );
$$;


-- ----------------------------------------------------------------------------
-- 3. Documents — the source PDFs
--
-- storage_key is where the file actually sits in the private bucket. The file
-- itself never lives in the database, only the note saying where it is.
-- ----------------------------------------------------------------------------
create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid not null references public.brands(id) on delete cascade,
  filename     text not null,
  storage_key  text not null,
  pages        int,
  size_bytes   bigint,
  uploaded_by  uuid references auth.users(id),
  uploaded_at  timestamptz not null default now()
);

create index if not exists documents_brand_idx on public.documents(brand_id);


-- ----------------------------------------------------------------------------
-- 4. Colours
--
-- The two columns that matter most:
--   source     'stated'  = read off the page of the guide  (trustworthy)
--              'derived' = calculated by us                (a good guess)
--   confidence how sure the extraction was, 0-100
--
-- Note: "group" is a reserved word in SQL, so the column is group_name.
-- ----------------------------------------------------------------------------
create table if not exists public.colors (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid not null references public.brands(id) on delete cascade,
  name           text not null,
  group_name     text,
  hex            text not null check (hex ~* '^#[0-9a-f]{6}$'),
  cmyk           text,
  pantone        text,
  source         text not null default 'derived'
                 check (source in ('stated','derived')),
  confidence     int check (confidence between 0 and 100),
  found_on_page  int,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists colors_brand_idx on public.colors(brand_id);


-- ----------------------------------------------------------------------------
-- 5. Typefaces
--
-- specs holds the size/leading/tracking table as JSON, because print and
-- digital describe themselves with different fields.
-- ----------------------------------------------------------------------------
create table if not exists public.typefaces (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.brands(id) on delete cascade,
  family      text not null,
  role        text,
  medium      text not null check (medium in ('print','digital')),
  specs       jsonb not null default '{}'::jsonb,
  sample      text,
  usage       text,
  confidence  int check (confidence between 0 and 100),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists typefaces_brand_idx on public.typefaces(brand_id);


-- ----------------------------------------------------------------------------
-- 6. Logo rules
-- ----------------------------------------------------------------------------
create table if not exists public.logo_rules (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.brands(id) on delete cascade,
  kind        text not null
              check (kind in ('do','dont','clearspace','min_size')),
  text        text not null,
  asset_key   text,
  confidence  int check (confidence between 0 and 100),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists logo_rules_brand_idx on public.logo_rules(brand_id);


-- ----------------------------------------------------------------------------
-- 7. Assets — logos, artwork, anything uploaded on the Assets tab
-- ----------------------------------------------------------------------------
create table if not exists public.assets (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid not null references public.brands(id) on delete cascade,
  name         text not null,
  kind         text,
  storage_key  text not null,
  size_bytes   bigint,
  uploaded_by  uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

create index if not exists assets_brand_idx on public.assets(brand_id);


-- ----------------------------------------------------------------------------
-- 8. Keep updated_at honest
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists brands_touch on public.brands;
create trigger brands_touch
  before update on public.brands
  for each row execute function public.touch_updated_at();


-- ============================================================================
-- 9. THE LOCKS
--
-- Turning row-level security ON is the important part. A table WITHOUT it is
-- readable and writable by anyone who has your public key — which is in the
-- website, visible to everyone. Do not skip this.
-- ============================================================================
alter table public.admins     enable row level security;
alter table public.brands     enable row level security;
alter table public.documents  enable row level security;
alter table public.colors     enable row level security;
alter table public.typefaces  enable row level security;
alter table public.logo_rules enable row level security;
alter table public.assets     enable row level security;

-- Permissions below the locks. RLS still decides every individual row; these
-- just say which verbs are possible at all.
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;


-- --- admins ------------------------------------------------------------------
drop policy if exists "see own admin row" on public.admins;
create policy "see own admin row" on public.admins
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "admins manage admins" on public.admins;
create policy "admins manage admins" on public.admins
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- --- brands ------------------------------------------------------------------
-- Anyone, signed in or not, can read a PUBLISHED brand. Drafts are admin-only.
drop policy if exists "read published brands" on public.brands;
create policy "read published brands" on public.brands
  for select to anon, authenticated
  using (status = 'published' or public.is_admin());

drop policy if exists "admins insert brands" on public.brands;
create policy "admins insert brands" on public.brands
  for insert to authenticated with check (public.is_admin());

drop policy if exists "admins update brands" on public.brands;
create policy "admins update brands" on public.brands
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins delete brands" on public.brands;
create policy "admins delete brands" on public.brands
  for delete to authenticated using (public.is_admin());


-- --- everything hanging off a brand -----------------------------------------
-- Same rule five times: you can read it if you could read its brand, and only
-- admins can write. Written out per table because Postgres wants it that way.

drop policy if exists "read documents" on public.documents;
create policy "read documents" on public.documents
  for select to anon, authenticated using (public.brand_readable(brand_id));
drop policy if exists "admins write documents" on public.documents;
create policy "admins write documents" on public.documents
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read colors" on public.colors;
create policy "read colors" on public.colors
  for select to anon, authenticated using (public.brand_readable(brand_id));
drop policy if exists "admins write colors" on public.colors;
create policy "admins write colors" on public.colors
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read typefaces" on public.typefaces;
create policy "read typefaces" on public.typefaces
  for select to anon, authenticated using (public.brand_readable(brand_id));
drop policy if exists "admins write typefaces" on public.typefaces;
create policy "admins write typefaces" on public.typefaces
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read logo_rules" on public.logo_rules;
create policy "read logo_rules" on public.logo_rules
  for select to anon, authenticated using (public.brand_readable(brand_id));
drop policy if exists "admins write logo_rules" on public.logo_rules;
create policy "admins write logo_rules" on public.logo_rules
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read assets" on public.assets;
create policy "read assets" on public.assets
  for select to anon, authenticated using (public.brand_readable(brand_id));
drop policy if exists "admins write assets" on public.assets;
create policy "admins write assets" on public.assets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());


-- ============================================================================
-- 10. BOOTSTRAP — do this once, or nothing will work
--
-- Right now there are no admins, and the locks above mean nobody can add one
-- through the website. You have to let yourself in from here, where you are
-- the database owner and the locks do not apply.
--
--   1. Sign up on your own site first, so an account exists.
--      (Or: Authentication -> Users -> Add user, in the dashboard.)
--   2. Change the email below to yours.
--   3. Un-comment the three lines and run them.
--
-- insert into public.admins (user_id)
-- select id from auth.users where email = 'you@yourstudio.com'
-- on conflict (user_id) do nothing;
--
-- Check it worked:
--   select u.email, a.added_at
--   from public.admins a join auth.users u on u.id = a.user_id;
-- ============================================================================
