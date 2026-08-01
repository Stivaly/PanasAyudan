-- 0064_archivar_modelo_viejo.sql
-- Issue #26. Cierra el modelo viejo completo: ya no queda frontend que publique
-- aportes (/dar) ni que gestione recogidas (/voluntarios/gestionar/[id]), así
-- que sus tablas y RPC se desconectan.
--
-- ARCHIVA, NO BORRA. Las tres tablas se renombran a *_legacy y se les quita todo
-- permiso a anon/authenticated. Son datos de una emergencia real: dejan de ser
-- alcanzables desde la app, pero siguen ahí para consultarlas con service role.
-- El DROP definitivo, si alguna vez se decide, va en otra migración y con
-- respaldo previo.
--
-- `locations` se conserva tal cual: la referencian los nodos y el histórico que
-- acabamos de archivar.
--
-- Depende de 0063 (#25), que ya retiró el camino público de reservas.

set search_path = public;

-- 1. RPC que quedaron sin cliente al eliminarse /dar y el panel por lugar.
--    Mismo patrón defensivo de 0033/0059/0063: se buscan por nombre en pg_proc y
--    se dropean todas las sobrecargas, porque varias se redefinieron a lo largo
--    de las migraciones y una firma escrita a mano puede no coincidir.
do $do$
declare
  v_oid oid;
  v_nombre text;
begin
  foreach v_nombre in array array[
    'crear_aporte',
    'listar_aportes_voluntario',
    'obtener_aporte_con_contacto',
    'editar_aporte_item',
    'eliminar_aporte_item',
    'liberar_recogida',
    'completar_recogida',
    'confirmar_entrega',
    'bloquear_cedulas_sin_confirmacion'
  ]
  loop
    for v_oid in
      select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_nombre
    loop
      execute format('drop function if exists %s cascade', v_oid::regprocedure);
    end loop;
  end loop;
end;
$do$;

-- 2. Realtime: se retiran las tablas viejas de la publicación, si estaban.
do $do$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime drop table aporte_items;
    exception when others then null;
    end;
    begin
      alter publication supabase_realtime drop table aportes;
    exception when others then null;
    end;
    begin
      alter publication supabase_realtime drop table recogidas;
    exception when others then null;
    end;
  end if;
end;
$do$;

-- 3. La FK de bloqueo por cédula apuntaba a la recogida incumplida. Desde 0040
--    (#23) el bloqueo real cuelga de compromiso_id, así que la columna vieja se
--    retira; las filas de cedulas_bloqueadas se conservan intactas.
alter table if exists cedulas_bloqueadas drop column if exists recogida_id;

-- 4. Archivado. El rename arrastra índices, constraints y policies, así que no
--    hace falta dropearlas una por una; lo que sí se corta es el acceso.
do $do$
begin
  if to_regclass('public.aportes') is not null then
    alter table aportes rename to aportes_legacy;
  end if;
  if to_regclass('public.aporte_items') is not null then
    alter table aporte_items rename to aporte_items_legacy;
  end if;
  if to_regclass('public.recogidas') is not null then
    alter table recogidas rename to recogidas_legacy;
  end if;
end;
$do$;

revoke all on table aportes_legacy from anon, authenticated;
revoke all on table aporte_items_legacy from anon, authenticated;
revoke all on table recogidas_legacy from anon, authenticated;

-- RLS queda activa: sin policies aplicables y sin grants, ningún rol público
-- llega a estas filas aunque alguien reactive el acceso por error.
alter table aportes_legacy enable row level security;
alter table aporte_items_legacy enable row level security;
alter table recogidas_legacy enable row level security;
