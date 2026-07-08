-- 0040_incumplimiento_cedula.sql
-- Issue #23 — Incumplimiento y bloqueo por cédula.
--
-- REGLA CENTRAL (contradice el mecanismo viejo de 0023): el bloqueo de una
-- cédula ocurre SOLO cuando el admin del nodo destino marca explícitamente
-- "No llegó" sobre un compromiso de voluntario. NO hay bloqueo automático por
-- vencimiento: el cron de 0023 (que bloqueaba recogidas pendientes vencidas)
-- se DESACTIVA aquí. El aviso de 24h es informativo (badge en el panel), no
-- dispara ninguna acción por sí solo.
--
-- Se REUTILIZA la tabla cedulas_bloqueadas (0023) cambiando su FK:
--   * recogida_id pasa a ser opcional (el modelo viejo lo sigue usando; #25
--     hará drop column cuando archive recogidas).
--   * se agrega compromiso_id -> compromisos_voluntario(id) para el bloqueo
--     del modelo de nodos.
-- El bloqueo por cédula IMPIDE re-registrarse con otro token (criterio central):
-- registrar_voluntario rechaza cédulas bloqueadas.

-- ---------------------------------------------------------------------------
-- 1. volunteers.cedula (obligatoria en el registro nuevo; nullable en la
--    columna para no romper las filas viejas registradas sin cédula).
-- ---------------------------------------------------------------------------
alter table volunteers add column if not exists cedula text;

-- Una cédula = un voluntario. Índice parcial: las filas históricas con cedula
-- null no chocan entre sí.
create unique index if not exists volunteers_cedula_key
  on volunteers (cedula) where cedula is not null;

grant insert (cedula) on volunteers to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Extender cedulas_bloqueadas para el modelo de nodos.
-- ---------------------------------------------------------------------------
alter table cedulas_bloqueadas
  add column if not exists compromiso_id uuid references compromisos_voluntario(id);
alter table cedulas_bloqueadas alter column recogida_id drop not null;

-- ---------------------------------------------------------------------------
-- 3. Desactivar el cron viejo de bloqueo automático (nombre real en 0023:
--    'bloquear-cedulas'). Envuelto en do-block tolerante: si el job no existe
--    (BD nueva, o ya desprogramado) no falla la migración.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'bloquear-cedulas') then
    perform cron.unschedule('bloquear-cedulas');
  end if;
exception when others then
  raise notice 'No se pudo desprogramar bloquear-cedulas (%). Continuo.', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. registrar_voluntario: se agrega p_cedula OBLIGATORIA. Drop defensivo de la
--    firma vieja (patrón de 0033) para no dejar dos overloads. Rechaza cédulas
--    bloqueadas (impide re-registro con otro token) y cédulas ya registradas.
-- ---------------------------------------------------------------------------
drop function if exists registrar_voluntario(text, text, text, text, text, uuid, boolean, numeric, numeric);

create or replace function registrar_voluntario(
  p_nombre               text,
  p_apellido             text,
  p_cedula               text,
  p_telefono             text,
  p_telegram             text,
  p_zona                 text,
  p_centro_acopio_id     uuid    default null,
  p_tiene_vehiculo       boolean default false,
  p_capacidad_peso_kg    numeric default null,
  p_capacidad_volumen_m3 numeric default null
)
returns table (id uuid, token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_telefono text;
  v_telegram text := nullif(trim(p_telegram), '');
  v_cedula   text := regexp_replace(coalesce(p_cedula, ''), '\D', '', 'g');
begin
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre es obligatorio';
  end if;

  if coalesce(trim(p_apellido), '') = '' then
    raise exception 'El apellido es obligatorio';
  end if;

  if v_cedula = '' then
    raise exception 'La cédula es obligatoria';
  end if;

  -- Bloqueo por incumplimiento: impide re-registrarse aunque use otro token.
  if exists (select 1 from cedulas_bloqueadas where cedula = v_cedula) then
    raise exception 'cedula_bloqueada';
  end if;

  if exists (select 1 from volunteers where cedula = v_cedula) then
    raise exception 'cedula_duplicada';
  end if;

  if p_centro_acopio_id is not null
     and not exists (select 1 from centros_acopio ca where ca.id = p_centro_acopio_id) then
    raise exception 'El centro de acopio seleccionado no existe.';
  end if;

  if coalesce(trim(p_telefono), '') <> '' then
    v_telefono := normalizar_telefono_ve(p_telefono);
  else
    v_telefono := null;
  end if;

  if v_telefono is null and v_telegram is null then
    raise exception 'Debes indicar al menos un contacto (teléfono o telegram)';
  end if;

  if p_tiene_vehiculo and (p_capacidad_peso_kg is null or p_capacidad_volumen_m3 is null) then
    raise exception 'Si tienes vehículo, indica el peso (kg) y el volumen (m3) que puedes transportar.';
  end if;

  return query
  insert into volunteers (
    nombre, apellido, cedula, telefono, telegram, zona_descripcion, centro_acopio_id,
    tiene_vehiculo, capacidad_peso_kg, capacidad_volumen_m3
  )
  values (
    trim(p_nombre),
    trim(p_apellido),
    v_cedula,
    v_telefono,
    v_telegram,
    nullif(trim(p_zona), ''),
    p_centro_acopio_id,
    coalesce(p_tiene_vehiculo, false),
    case when p_tiene_vehiculo then p_capacidad_peso_kg else null end,
    case when p_tiene_vehiculo then p_capacidad_volumen_m3 else null end
  )
  returning volunteers.id, volunteers.token;
end;
$$;

grant execute on function registrar_voluntario(text, text, text, text, text, text, uuid, boolean, numeric, numeric)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. confirmar_llegada_compromiso: el admin del nodo DESTINO registra si el
--    voluntario llegó.
--      p_llego = true  -> delega en confirmar_entrega_compromiso (0032).
--      p_llego = false -> marca el compromiso 'incumplido', bloquea la cédula
--                         del voluntario, lo desactiva (activo=false) y recalcula
--                         el status de la solicitud (el sobrante vuelve a
--                         ofrecerse). El bloqueo es permanente y sin apelación.
--    Para compromisos de nodo solo aplica p_llego=true (no hay cédula que
--    bloquear); p_llego=false sobre un compromiso de nodo se rechaza.
-- ---------------------------------------------------------------------------
create or replace function confirmar_llegada_compromiso(
  p_compromiso_id uuid,
  p_llego         boolean,
  p_token         uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id     uuid;
  v_solicitud_id uuid;
  v_node_origen  uuid;
  v_vol_owner    uuid;
  v_comp_status  text;
  v_cedula       text;
begin
  if p_llego is null then
    raise exception 'Debes indicar si el voluntario llegó.';
  end if;

  select id into v_admin_id from volunteers where token = p_token and activo = true;
  if v_admin_id is null then
    raise exception 'token_invalido';
  end if;

  -- ¿Compromiso de voluntario?
  select cv.solicitud_id, cv.volunteer_id, cv.status, s.node_id_origen
    into v_solicitud_id, v_vol_owner, v_comp_status, v_node_origen
  from compromisos_voluntario cv
  join solicitudes s on s.id = cv.solicitud_id
  where cv.id = p_compromiso_id;

  if v_solicitud_id is not null then
    if not es_miembro_nodo_token(v_node_origen, p_token) then
      raise exception 'no_autorizado';
    end if;

    if p_llego then
      perform confirmar_entrega_compromiso(p_compromiso_id, p_token);
      return;
    end if;

    -- p_llego = false: incumplimiento con bloqueo permanente.
    if v_comp_status <> 'pendiente' then
      raise exception 'compromiso_no_pendiente';
    end if;

    select cedula into v_cedula from volunteers where id = v_vol_owner;

    update compromisos_voluntario set status = 'incumplido' where id = p_compromiso_id;

    if v_cedula is not null and v_cedula <> '' then
      insert into cedulas_bloqueadas (cedula, compromiso_id, motivo)
      values (v_cedula, p_compromiso_id, 'incumplimiento_compromiso')
      on conflict (cedula) do update
        set compromiso_id = excluded.compromiso_id,
            motivo        = excluded.motivo;
    end if;

    update volunteers set activo = false where id = v_vol_owner;

    perform recalcular_status_solicitud(v_solicitud_id);
    return;
  end if;

  -- No es de voluntario: solo se admite confirmar la llegada de un nodo.
  if not p_llego then
    raise exception 'incumplimiento_no_aplica';
  end if;
  perform confirmar_entrega_compromiso(p_compromiso_id, p_token);
end;
$$;

grant execute on function confirmar_llegada_compromiso(uuid, boolean, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. listar_solicitudes_nodo: se agrega atrasado_24h a cada compromiso de
--    voluntario. true = compromiso 'pendiente' cuya llegada estimada
--    (created_at + tiempo_estimado) venció hace más de 24h sin confirmación.
--    Ese flag alimenta la badge roja del panel (aviso de 24h, sin push/email).
-- ---------------------------------------------------------------------------
create or replace function listar_solicitudes_nodo(
  p_node_id     uuid,
  p_token_admin uuid
)
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not es_miembro_nodo_token(p_node_id, p_token_admin) then
    raise exception 'no_autorizado';
  end if;

  return (
    select coalesce(json_agg(to_json(t)), '[]'::json)
    from (
      select
        s.id,
        s.category_id,
        c.name as category_name,
        s.subcategoria,
        s.magnitud,
        s.requiere_vehiculo,
        s.status,
        greatest(0, magnitud_orden(s.magnitud) - magnitud_comprometida_total(s.id)) as sobrante,
        s.created_at,
        coalesce((
          select json_agg(json_build_object(
            'id', cv.id,
            'magnitud', cv.magnitud_comprometida,
            'tiempo_estimado_minutos', cv.tiempo_estimado_minutos,
            'status', cv.status,
            'created_at', cv.created_at,
            'atrasado_24h', (
              cv.status = 'pendiente'
              and cv.created_at
                  + make_interval(mins => cv.tiempo_estimado_minutos)
                  + interval '24 hours' < now()
            )
          ) order by cv.created_at)
          from compromisos_voluntario cv where cv.solicitud_id = s.id
        ), '[]'::json) as compromisos_voluntario,
        coalesce((
          select json_agg(json_build_object(
            'id', cn.id,
            'magnitud', cn.magnitud_comprometida,
            'tiene_transporte', cn.tiene_transporte,
            'status', cn.status,
            'node_id_compromete', cn.node_id_compromete,
            'created_at', cn.created_at
          ) order by cn.created_at)
          from compromisos_nodo cn where cn.solicitud_id = s.id
        ), '[]'::json) as compromisos_nodo
      from solicitudes s
      join categories c on c.id = s.category_id
      where s.node_id_origen = p_node_id
      order by s.created_at desc
    ) t
  );
end;
$$;

grant execute on function listar_solicitudes_nodo(uuid, uuid) to anon, authenticated;
