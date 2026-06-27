-- Completar una recogida solo si pertenece a un aporte publicado
-- por el voluntario autenticado. Al quedar completada, pg_cron ya no la libera
-- porque el cron solo procesa status = 'pendiente'.

create or replace function completar_recogida(
  p_recogida_id uuid,
  p_volunteer_token uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_volunteer_id uuid;
begin
  select id into v_volunteer_id
  from volunteers
  where token = p_volunteer_token
    and token = current_volunteer_token()
    and activo = true;

  if v_volunteer_id is null then
    raise exception 'Token de voluntario invalido o inactivo.';
  end if;

  update recogidas r
    set status = 'completada'
  from aporte_items ai
  join aportes a on a.id = ai.aporte_id
  where r.id = p_recogida_id
    and r.aporte_item_id = ai.id
    and r.status = 'pendiente'
    and a.volunteer_id = v_volunteer_id;

  if not found then
    raise exception 'La recogida no existe, no esta pendiente o no pertenece a tus aportes.';
  end if;
end;
$$;

grant execute on function completar_recogida(uuid, uuid) to anon, authenticated;
