-- 0042_editar_nodo.sql
-- Edición de los datos de un nodo por su administrador (issue #29).
-- El formulario público de solicitud de registro (/registrar-nodo) y la cola de
-- aprobación viven en 0041 (issue #21); aquí cerramos el ciclo con la RPC que el
-- admin usa para corregir los datos de su nodo ya aprobado.
--
-- DECISIÓN (issue #29, no reabrir): si la edición cambia lat/lng, el nodo pierde
-- su verificación y vuelve a 'inactivo' (invisible en público) hasta re-verificar
-- con GPS desde el lugar nuevo. Mover el pin NO puede saltarse la verificación
-- física de 0031 (verificar_nodo). El resto de campos (nombre, tipo, dirección,
-- estado, horario, descripción) se editan sin tocar la verificación.
--
-- Invariantes respetados:
--   * Solo un ADMIN del nodo (node_admins) edita; un colaborador NO (no está en
--     node_admins, así que la verificación de membresía lo excluye por diseño).
--   * SECURITY DEFINER + set search_path = public, como el resto de RPC del modelo.
--   * No se toca el contacto del nodo en lecturas públicas (columna aparte).
-- Idempotente: add column if not exists / create or replace.

-- ---------------------------------------------------------------------------
-- 1. Columna descripción pública del nodo (editable). No existía en 0025/0031.
--    Es texto público (qué es el punto / notas de acceso), nunca contacto.
-- ---------------------------------------------------------------------------
alter table centros_acopio
  add column if not exists descripcion text;

-- ---------------------------------------------------------------------------
-- 2. RPC editar_nodo: el admin del nodo corrige sus datos.
--    Solo se actualizan los campos PRESENTES en p_datos (patrón "?"), de modo
--    que un formulario parcial no borra lo que no envía. Devuelve true si la
--    edición cambió las coordenadas (el nodo quedó inactivo y exige re-verificar).
-- ---------------------------------------------------------------------------
create or replace function editar_nodo(
  p_node_id uuid,
  p_datos   jsonb,
  p_token   uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vol_id         uuid;
  v_status         text;
  v_old_lat        double precision;
  v_old_lng        double precision;
  v_new_lat        double precision;
  v_new_lng        double precision;
  v_has_coords     boolean;
  v_coords_changed boolean;
  v_estado_id      uuid;
begin
  -- Token válido y activo.
  select id into v_vol_id
  from volunteers
  where token = p_token and activo = true;
  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

  -- Debe ser ADMIN de ESTE nodo (no colaborador, no admin de otro nodo).
  if not exists (
    select 1 from node_admins
    where node_id = p_node_id and volunteer_id = v_vol_id
  ) then
    raise exception 'no_autorizado';
  end if;

  select status, lat, lng into v_status, v_old_lat, v_old_lng
  from centros_acopio where id = p_node_id;
  if v_status is null then
    raise exception 'nodo_no_encontrado';
  end if;
  if v_status = 'cerrado' then
    raise exception 'nodo_cerrado';
  end if;

  -- Validaciones de los campos presentes.
  if (p_datos ? 'nombre') and coalesce(trim(p_datos ->> 'nombre'), '') = '' then
    raise exception 'El nombre del nodo es obligatorio.';
  end if;
  if (p_datos ? 'direccion') and coalesce(trim(p_datos ->> 'direccion'), '') = '' then
    raise exception 'La dirección del nodo es obligatoria.';
  end if;
  if (p_datos ? 'tipo')
     and (p_datos ->> 'tipo') not in ('acopio', 'entrega', 'mixto') then
    raise exception 'tipo_invalido';
  end if;
  if (p_datos ? 'estado_id') then
    v_estado_id := nullif(p_datos ->> 'estado_id', '')::uuid;
    if v_estado_id is null or not exists (select 1 from estados where id = v_estado_id) then
      raise exception 'El estado del nodo no es válido.';
    end if;
  end if;

  -- ¿La edición cambia las coordenadas? Solo si trae ambas y difieren.
  v_has_coords := (p_datos ? 'lat') and (p_datos ? 'lng');
  v_new_lat := case when v_has_coords then nullif(p_datos ->> 'lat', '')::double precision else v_old_lat end;
  v_new_lng := case when v_has_coords then nullif(p_datos ->> 'lng', '')::double precision else v_old_lng end;
  v_coords_changed := v_has_coords
    and (v_new_lat is distinct from v_old_lat or v_new_lng is distinct from v_old_lng);

  update centros_acopio set
    nombre          = case when p_datos ? 'nombre'      then trim(p_datos ->> 'nombre')             else nombre end,
    tipo            = case when p_datos ? 'tipo'        then p_datos ->> 'tipo'                     else tipo end,
    direccion       = case when p_datos ? 'direccion'   then trim(p_datos ->> 'direccion')          else direccion end,
    estado_id       = case when p_datos ? 'estado_id'   then v_estado_id                            else estado_id end,
    horario         = case when p_datos ? 'horario'     then nullif(trim(p_datos ->> 'horario'), '') else horario end,
    descripcion     = case when p_datos ? 'descripcion' then nullif(trim(p_datos ->> 'descripcion'), '') else descripcion end,
    lat             = v_new_lat,
    lng             = v_new_lng,
    google_place_id = case
                        when v_coords_changed then nullif(p_datos ->> 'google_place_id', '')
                        else google_place_id
                      end,
    -- Si cambió el pin, el nodo pierde su verificación y sale del público.
    status          = case when v_coords_changed then 'inactivo' else status end,
    activo          = case when v_coords_changed then false else activo end,
    verificado_at   = case when v_coords_changed then null else verificado_at end
  where id = p_node_id;

  -- La verificación es por (admin, nodo): al mover el pin, ningún admin sigue
  -- verificado; todos deben re-confirmar el GPS desde el lugar nuevo.
  if v_coords_changed then
    update node_admins
      set verificado = false, verificado_at = null
    where node_id = p_node_id;
  end if;

  return v_coords_changed;
end;
$$;

grant execute on function editar_nodo(uuid, jsonb, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. listar_nodos_admin: incluir horario y descripción para poder pre-llenar el
--    formulario de edición. Misma firma/semántica que 0031, campos añadidos.
-- ---------------------------------------------------------------------------
create or replace function listar_nodos_admin(p_token uuid)
returns json
language sql
security definer
set search_path = public
as $$
  select coalesce(json_agg(to_json(t)), '[]'::json)
  from (
    select
      c.id, c.nombre, c.direccion, c.tipo, c.status,
      c.lat, c.lng, c.estado_id, c.horario, c.descripcion,
      c.pausado_recepcion, c.pausado_entrega,
      na.verificado, na.verificado_at
    from node_admins na
    join centros_acopio c on c.id = na.node_id
    join volunteers v on v.id = na.volunteer_id
    where v.token = p_token and v.activo = true
    order by c.nombre
  ) t;
$$;

grant execute on function listar_nodos_admin(uuid) to anon, authenticated;
