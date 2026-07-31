-- 0063_retirar_reservas_publicas.sql
-- Issue #25 (parte pública). Cierra el camino por el que cualquier persona podía
-- reservar insumos desde la app: las pantallas /lugar/[id] y /mis-recogidas ya
-- no existen, así que estas RPC quedaron sin cliente y sin razón de seguir
-- expuestas a anon.
--
-- QUÉ NO HACE, a propósito: no toca la tabla `recogidas` ni sus datos. El panel
-- del voluntario (/voluntarios/gestionar/[id]) todavía lee las recogidas
-- existentes para cerrarlas, y sigue vivo hasta el issue #26; el archivado de la
-- tabla va en esa migración, junto con el de aportes.
--
-- Tampoco se toca `cedulas_bloqueadas.recogida_id`: los bloqueos vigentes
-- apuntan ahí y la columna se retira cuando se archive la tabla (#26).
--
-- Patrón de drop defensivo por firma (como 0033 y 0059): `reservar_item` tuvo
-- varias sobrecargas a lo largo de las migraciones 0003, 0018, 0019, 0020, 0023
-- y 0062, así que se localizan por nombre en pg_proc y se dropean todas, en vez
-- de escribir una firma que puede no coincidir con la que quedó en la base.

set search_path = public;

-- 1. Cron de liberación de reservas vencidas.
--    Ya no se pueden crear reservas nuevas, así que no tiene trabajo que hacer.
--    Las que hayan quedado pendientes siguen liberables a mano desde el panel
--    del voluntario, que conserva liberar_recogida hasta #26.
do $do$
begin
  if exists (select 1 from cron.job where jobname = 'liberar-expiradas') then
    perform cron.unschedule('liberar-expiradas');
  end if;
exception
  when undefined_table then
    -- pg_cron no instalado en este entorno: nada que desprogramar.
    null;
end;
$do$;

-- 2. RPC del flujo público de reservas: se dropean todas sus sobrecargas.
do $do$
declare
  v_oid oid;
  v_nombre text;
begin
  foreach v_nombre in array array[
    'reservar_item',
    'listar_recogidas_recogedor',
    'listar_recogidas_por_token',
    'cancelar_recogida_propia',
    'modificar_qty_recogida',
    'obtener_whatsapp_voluntario_item'
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
