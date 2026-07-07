-- 0050_eliminar_inventario.sql
-- Baja de un item del inventario de un nodo. Complementa upsert_inventario (0039/
-- 0049): configurar el inventario (alta/edición/BAJA) es EXCLUSIVO del admin del
-- nodo (node_admins), no del colaborador — coherente con el criterio de #22 de
-- validar la autorización a nivel de servidor y no solo en la UI.
--
-- Borrado físico: el item de inventario no participa en históricos ni FKs (las
-- solicitudes de reposición copian category/subcategory, no referencian
-- node_inventory), así que eliminarlo no deja huérfanos ni rompe compromisos ya
-- creados. Realtime propaga el DELETE a los paneles suscritos.
--
-- Idempotente: create or replace / grant repetible; sin cambios de esquema.

set search_path = public;

create or replace function eliminar_inventario(
  p_token        uuid,
  p_inventory_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vol_id  uuid;
  v_node_id uuid;
begin
  select id into v_vol_id from volunteers where token = p_token and activo = true;
  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

  select node_id into v_node_id from node_inventory where id = p_inventory_id;
  if v_node_id is null then
    raise exception 'inventario_inexistente';
  end if;

  -- Eliminar del inventario es exclusivo del ADMIN del nodo (no del colaborador).
  if not exists (
    select 1 from node_admins na
    where na.node_id = v_node_id and na.volunteer_id = v_vol_id
  ) then
    raise exception 'no_autorizado';
  end if;

  delete from node_inventory where id = p_inventory_id;
end;
$$;

grant execute on function eliminar_inventario(uuid, uuid) to anon, authenticated;
