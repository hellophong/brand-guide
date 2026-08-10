-- ============================================================================
-- Spectra — locks for the stockroom itself
--
-- WHY THIS EXISTS:
--   0001 fitted locks to every table, but not to the shelves the actual files
--   sit on. Supabase keeps uploaded files in a table of its own —
--   storage.objects — and that table has row-level security switched on with
--   NO policies written. A table in that state is not "open": it is shut to
--   everyone. Only the secret server key gets through.
--
--   So today an admin signing in on the website and dropping a PDF would be
--   turned away with "new row violates row-level security policy". This file
--   is what lets them in.
--
-- HOW TO RUN IT:
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file
--   -> Run. Safe to run more than once.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Which brand does a file belong to?
--
-- Every file Spectra uploads is stored under a folder named after the brand:
--
--     brand-guides/<brand uuid>/the-guide.pdf
--     brand-assets/<brand uuid>/logo-primary.svg
--
-- That layout is what makes the rules below possible: to decide whether you
-- may see a file, we read the brand id out of its path and ask the same
-- question we already ask of every other table.
--
-- Anything not stored that way — a file dropped in by hand from the
-- dashboard, say — has no brand and returns null. brand_readable(null) is
-- false, so such files stay admin-only. That is the safe direction to fail.
-- ----------------------------------------------------------------------------
create or replace function public.brand_from_key(key text)
returns uuid
language sql
immutable
as $$
  select case
    when split_part(key, '/', 1) ~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(key, '/', 1)::uuid
  end;
$$;


-- ----------------------------------------------------------------------------
-- 2. The locks
--
-- Two rules, mirroring the two in 0001:
--   * admins can do anything to files in Spectra's two buckets
--   * everyone else can READ a file only if they could read its brand —
--     which means the brand is published
--
-- Nobody but an admin can ever write. Note this covers both buckets and
-- nothing else: other buckets in this project are untouched by these rules
-- and stay shut, which is the behaviour you want from a lock you didn't fit.
-- ----------------------------------------------------------------------------

drop policy if exists "admins manage brand files" on storage.objects;
create policy "admins manage brand files" on storage.objects
  for all to authenticated
  using      (bucket_id in ('brand-guides','brand-assets') and public.is_admin())
  with check (bucket_id in ('brand-guides','brand-assets') and public.is_admin());

-- Reading covers downloads. The buckets stay PRIVATE — there is no public URL
-- for these files. What this policy allows is asking Supabase for a *signed*
-- link, which works for a few minutes and then expires, so a link forwarded
-- outside your team dies rather than living forever in someone's inbox.
drop policy if exists "read files of readable brands" on storage.objects;
create policy "read files of readable brands" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id in ('brand-guides','brand-assets')
    and public.brand_readable(public.brand_from_key(name))
  );


-- ============================================================================
-- 3. A note on the source PDF
--
-- These rules let anyone who can see a PUBLISHED brand also download the
-- original guide from brand-guides, because the Assets tab offers it. If your
-- clients' guides are under NDA and you would rather the PDF never leave the
-- studio, narrow the read policy to the assets bucket only:
--
--   using (bucket_id = 'brand-assets' and public.brand_readable(...))
--
-- Admins keep full access either way, via the first policy.
-- ============================================================================
