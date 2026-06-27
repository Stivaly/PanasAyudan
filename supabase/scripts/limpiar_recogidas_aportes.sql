-- Limpia los datos de recogidas, aporte_items y aportes.
-- NO toca: volunteers, locations, categories, estados.
--
-- Uso: pegar en el SQL Editor de Supabase y ejecutar.
-- Es destructivo e irreversible: borra TODAS las filas de esas tres tablas.
--
-- El orden respeta las FKs (recogidas -> aporte_items -> aportes), aunque
-- TRUNCATE ... CASCADE lo resolvería igual. Va en una transacción: si algo
-- falla, no se aplica nada.

begin;

truncate table recogidas, aporte_items, aportes restart identity cascade;

-- Verificación: las tres deben quedar en 0.
select
  (select count(*) from recogidas)    as recogidas,
  (select count(*) from aporte_items) as aporte_items,
  (select count(*) from aportes)      as aportes;

commit;
