-- 0058_precarga_inventario_aprobacion.sql (issue #33)
-- Al aprobar una solicitud de registro de nodo, las categorias que el
-- solicitante declaro se precargan en node_inventory como 'no hay'
-- (disponible=false, sin magnitud): el admin solo marca disponible lo que
-- ya tenga. Se implementa como trigger aditivo sobre el cambio de status a
-- 'aprobada' para no redefinir aprobar_solicitud_registro (0041/0044/0052)
-- y sobrevivir a futuras redefiniciones de esa RPC.
-- Idempotente: create or replace + drop/create del trigger.

set search_path = public;

create or replace function precargar_inventario_aprobacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'aprobada'
     and new.node_id is not null
     and old.status is distinct from 'aprobada' then
    begin
      insert into node_inventory (node_id, category_id, disponible)
      select new.node_id, c_id, false
      from unnest(coalesce(new.categorias, '{}'::uuid[])) as c_id
      where exists (select 1 from categories c where c.id = c_id)
      on conflict do nothing;
    exception when others then
      -- La precarga es un extra de comodidad: jamas debe tumbar una aprobacion.
      raise notice 'precarga de inventario omitida: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_precarga_inventario on solicitudes_registro_nodo;
create trigger trg_precarga_inventario
  after update on solicitudes_registro_nodo
  for each row
  execute function precargar_inventario_aprobacion();
