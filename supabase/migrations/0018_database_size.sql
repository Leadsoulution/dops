-- Taille de la base, lisible depuis l'application
--
-- L'API REST de Supabase ne sait pas repondre "combien pese cette base" :
-- elle lit des tables, pas des metriques du moteur. Une fonction SQL
-- fait le pont.
--
-- `security definer` lui donne les droits de son proprietaire : sans
-- cela, la cle de service ne pourrait pas interroger les catalogues
-- systeme. `search_path` est fige, precaution habituelle pour une
-- fonction privilegiee.

create or replace function public.database_size()
returns table (total_bytes bigint, table_name text, table_bytes bigint)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select
    (select pg_database_size(current_database()))::bigint as total_bytes,
    c.relname::text as table_name,
    pg_total_relation_size(c.oid)::bigint as table_bytes
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by pg_total_relation_size(c.oid) desc
  limit 20;
$$;

revoke all on function public.database_size() from public, anon, authenticated;
grant execute on function public.database_size() to service_role;
