-- 0045_realtime_paneles_operativos.sql
-- Publica en Supabase Realtime las tablas que alimentan los paneles operativos.
-- Sin esto, el frontend puede suscribirse pero no recibira eventos y el usuario
-- tendra que refrescar manualmente para ver solicitudes, compromisos o cambios
-- de estado de nodos.

do $$
declare
  v_table text;
  v_tables text[] := array[
    'centros_acopio',
    'node_admins',
    'node_collaborators',
    'solicitudes',
    'compromisos_voluntario',
    'compromisos_nodo',
    'solicitudes_registro_nodo'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  foreach v_table in array v_tables loop
    if exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = v_table
    )
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;
