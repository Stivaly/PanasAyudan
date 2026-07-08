-- 0055_en_camino_solo_enviado.sql
-- Una solicitud solo debe quedar "en_camino" cuando el centro que aporta
-- transporte propio ya marco el compromiso como enviado. "Tengo transporte"
-- crea el compromiso, pero no equivale a enviado.

set search_path = public;

create or replace function recalcular_status_solicitud(p_solicitud_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_nodo_enviado boolean;
  v_nodo_sin_transporte boolean;
  v_voluntario boolean;
begin
  select status into v_status from solicitudes where id = p_solicitud_id;
  if v_status is null or v_status = 'cerrada' then
    return;
  end if;

  select exists (
    select 1 from compromisos_nodo
    where solicitud_id = p_solicitud_id
      and status = 'en_camino'
      and tiene_transporte = true
  ) into v_nodo_enviado;

  select exists (
    select 1 from compromisos_nodo
    where solicitud_id = p_solicitud_id
      and status in ('comprometido','en_camino')
      and tiene_transporte = false
  ) into v_nodo_sin_transporte;

  select exists (
    select 1 from compromisos_voluntario cv
    where cv.solicitud_id = p_solicitud_id
      and cv.status in ('pendiente','retirado')
      and (
        cv.status <> 'pendiente'
        or cv.retirado_at is not null
        or coalesce(cv.reservado_until, cv.created_at + interval '4 hours') > now()
      )
  ) into v_voluntario;

  update solicitudes set status =
    case
      when v_nodo_enviado        then 'en_camino'
      when v_nodo_sin_transporte then 'inventario_asegurado'
      when v_voluntario          then 'parcial'
      else 'abierta'
    end
  where id = p_solicitud_id;
end;
$$;

grant execute on function recalcular_status_solicitud(uuid) to anon, authenticated;
