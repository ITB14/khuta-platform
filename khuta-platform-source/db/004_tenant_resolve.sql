-- Resolving the tenant is the one lookup that happens *before* a tenant
-- context exists, so RLS on `tenant` would otherwise make it impossible.
-- A narrow SECURITY DEFINER function is the right exception: it answers one
-- question (slug -> id) and exposes nothing else.
create or replace function resolve_tenant(p_slug text)
returns table (id uuid, slug text, name_ar text, demo_mode boolean, demo_speed smallint)
language sql security definer stable set search_path = public as $$
  select t.id, t.slug, t.name_ar, t.demo_mode, t.demo_speed
    from tenant t
   where t.slug = lower(p_slug) and t.status = 'active'
$$;

revoke all on function resolve_tenant(text) from public;
grant execute on function resolve_tenant(text) to khuta_app;

-- Host header -> slug. alain.khuta.b14facilities.com -> 'alain'
-- A single-host deployment (the feasibility build) falls back to the default.
create or replace function tenant_slug_from_host(p_host text, p_default text default 'alain')
returns text language sql immutable as $$
  select coalesce(
    nullif((regexp_match(lower(p_host), '^([a-z0-9][a-z0-9-]*)\.khuta\.'))[1], ''),
    p_default)
$$;
grant execute on function tenant_slug_from_host(text, text) to khuta_app;
