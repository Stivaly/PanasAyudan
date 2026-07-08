-- 0032_solicitudes_compromisos.sql
-- Issue #19 — Solicitudes entre nodos: órdenes de magnitud, match automático y
-- compromisos de inventario.
--
-- MÓDULO INDEPENDIENTE Y PARALELO. Este sistema (solicitudes /
-- compromisos_voluntario / compromisos_nodo) reemplaza CONCEPTUALMENTE a
-- aporte_items + recogidas, pero NO los borra ni los toca. aportes,
-- aporte_items, recogidas y sus RPC (crear_aporte, reservar_item,
-- completar_recogida, confirmar_entrega, liberar_recogida, etc.) siguen
-- funcionando intactas en paralelo. La deprecación/limpieza es decisión del
-- issue #25; aquí no se migra ni se borra nada del modelo viejo. La tabla
-- recogidas se MANTIENE intacta (opción "backward compat" del issue).
--
-- ===========================================================================
-- PREREQUISITOS (no son parte de `solicitudes` ni de las RPC de este issue,
-- pero las RPC de respuesta de voluntario y la lectura filtrada dependen de
-- ellos; se incluyen aquí por ser dependencia directa del criterio de
-- aceptación "un voluntario sin vehículo no ve solicitudes que requieren
-- vehículo", imposible de cumplir con el esquema actual):
--
--   1. Capacidad de vehículo del voluntario (volunteers.tiene_vehiculo +
--      capacidad_peso_kg + capacidad_volumen_m3). Antes NO existía ningún
--      campo de vehículo en volunteers; lo único parecido era
--      recogidas.placa_vehiculo, que es un dato puntual de una recogida del
--      modelo viejo, no una capacidad declarada del voluntario.
--
--   2. magnitud_capacidad_referencia: la magnitud (escala ordinal) no es
--      comparable directamente con kg/m3. Esta tabla documenta una
--      equivalencia aproximada (regla de negocio para emergencias, fácil de
--      ajustar). El criterio REAL y verificable es el booleano
--      requiere_vehiculo (ver más abajo); la equivalencia es una mejora.
-- ===========================================================================
--
-- ---------------------------------------------------------------------------
-- MAPEO COMPLETO DE TRANSICIONES DE STATUS DE `solicitudes`
-- (centralizado en recalcular_status_solicitud + casos terminales):
--
--   evento                                         status resultante
--   ---------------------------------------------  ------------------------
--   crear_solicitud                                'abierta'
--   responder_solicitud_voluntario (1er compromiso)'parcial'
--   responder_solicitud_voluntario (cubre el total)'parcial'  (*ver nota)
--   responder_solicitud_nodo, tiene_transporte=t   'en_camino'
--   responder_solicitud_nodo, tiene_transporte=f   'inventario_asegurado'
--   cancelar_compromiso                            recalculado (ver abajo)
--   confirmar_entrega_compromiso (cubre el total)  'cerrada'
--   confirmar_entrega_compromiso (parcial)         recalculado
--
--   (*) El issue dice que un voluntario que cubre el total "se bloquea para
--   otros voluntarios", y aclara explícitamente que NO pasa a 'en_camino'
--   (ese status es del compromiso de NODO con transporte). En vez de inventar
--   un sexto status, el bloqueo se aplica en la lectura
--   listar_solicitudes_disponibles: una solicitud con sobrante <= 0 NO se
--   ofrece a ningún voluntario. Así el status público se mantiene en 'parcial'
--   y la solicitud "desaparece" del panel de voluntarios cuando ya está
--   cubierta, sin un status extra frágil.
--
--   recalcular_status_solicitud (usado tras responder/cancelar; nunca
--   resucita una 'cerrada'):
--     hay compromiso_nodo activo con transporte      -> 'en_camino'
--     hay compromiso_nodo activo sin transporte      -> 'inventario_asegurado'
--     hay compromiso_voluntario activo (pendiente)   -> 'parcial'
--     no queda ningún compromiso activo              -> 'abierta'
-- ---------------------------------------------------------------------------
--
-- Sigue el patrón de validación token+rol de #17/#18: RPC SECURITY DEFINER,
-- set search_path = public, validación por token activo y membresía de nodo
-- vía node_admins/node_collaborators (se reusa la misma lógica que
-- es_miembro_nodo de 0031, expuesta aquí como es_miembro_nodo_token para poder
-- validar por un token pasado como parámetro, igual que crear_nodo/verificar_nodo).

-- ===========================================================================
-- 1. PREREQUISITO — capacidad de vehículo del voluntario.
-- ===========================================================================
alter table volunteers
  add column if not exists tiene_vehiculo       boolean not null default false,
  add column if not exists capacidad_peso_kg    numeric,
  add column if not exists capacidad_volumen_m3 numeric;

-- A nivel de constraint (no solo en frontend): si declara vehículo, debe
-- declarar peso y volumen. Las ~filas existentes quedan en tiene_vehiculo=false
-- por el DEFAULT, así que el CHECK no las rompe.
alter table volunteers
  add constraint volunteers_capacidad_vehiculo
  check (
    tiene_vehiculo = false
    or (capacidad_peso_kg is not null and capacidad_volumen_m3 is not null)
  );

-- Permitir que el INSERT público (registro libre) escriba estas columnas. La
-- RPC registrar_voluntario es SECURITY DEFINER y bypassa esto, pero mantenemos
-- el grant coherente con el de 0002 por si alguna ruta directa las usa.
grant insert (tiene_vehiculo, capacidad_peso_kg, capacidad_volumen_m3)
  on volunteers to anon, authenticated;
grant update (tiene_vehiculo, capacidad_peso_kg, capacidad_volumen_m3)
  on volunteers to anon, authenticated;

-- registrar_voluntario: se EXTIENDE con tres parámetros opcionales (default
-- false/null) sin romper la firma para los llamadores existentes que no los
-- envíen. Se hace drop + recreate (no un overload nuevo) para no dejar dos
-- firmas ambiguas cuando se llama solo con los 6 parámetros originales.
drop function if exists registrar_voluntario(text, text, text, text, text, uuid);

create or replace function registrar_voluntario(
  p_nombre               text,
  p_apellido             text,
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
begin
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre es obligatorio';
  end if;

  if coalesce(trim(p_apellido), '') = '' then
    raise exception 'El apellido es obligatorio';
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

  -- Defensa en profundidad: además del CHECK de la tabla, mensaje legible.
  if p_tiene_vehiculo and (p_capacidad_peso_kg is null or p_capacidad_volumen_m3 is null) then
    raise exception 'Si tienes vehículo, indica el peso (kg) y el volumen (m3) que puedes transportar.';
  end if;

  return query
  insert into volunteers (
    nombre, apellido, telefono, telegram, zona_descripcion, centro_acopio_id,
    tiene_vehiculo, capacidad_peso_kg, capacidad_volumen_m3
  )
  values (
    trim(p_nombre),
    trim(p_apellido),
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

grant execute on function registrar_voluntario(text, text, text, text, text, uuid, boolean, numeric, numeric)
  to anon, authenticated;

-- ===========================================================================
-- 2. Tipo de magnitud compartido + orden ordinal.
-- ===========================================================================
-- Domain único reutilizado por las tres tablas (solicitudes,
-- compromisos_voluntario, compromisos_nodo) para que comparar/sumar magnitudes
-- no dependa de comparaciones de texto frágiles repetidas.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'magnitud_nivel') then
    create domain magnitud_nivel as text
      check (value in ('unidades','decenas','centenas','cajas','pallets','camioneta','gandola'));
  end if;
end;
$$;

-- magnitud_orden: posición ordinal de cada nivel (unidades=1 ... gandola=7).
-- Única fuente de verdad para sumar/comparar magnitudes en todo el módulo.
create or replace function magnitud_orden(p_magnitud text)
returns int
language sql
immutable
as $$
  select case p_magnitud
    when 'unidades'  then 1
    when 'decenas'   then 2
    when 'centenas'  then 3
    when 'cajas'     then 4
    when 'pallets'   then 5
    when 'camioneta' then 6
    when 'gandola'   then 7
    else 0
  end;
$$;

grant execute on function magnitud_orden(text) to anon, authenticated;

-- ===========================================================================
-- 3. PREREQUISITO — tabla de equivalencia magnitud <-> capacidad.
-- ===========================================================================
-- Regla de negocio APROXIMADA para emergencias (no medidas físicas exactas).
-- Define, por nivel de magnitud, un techo orientativo de peso/volumen y si ese
-- nivel típicamente REQUIERE vehículo. Un voluntario sin vehículo puede cubrir
-- razonablemente Unidades y Decenas; Centenas en adelante requiere vehículo.
-- Fácil de ajustar después (solo editar las filas sembradas).
create table if not exists magnitud_capacidad_referencia (
  magnitud                  magnitud_nivel primary key,
  orden                     int     not null,
  techo_peso_kg             numeric,
  techo_volumen_m3          numeric,
  requiere_vehiculo_sugerido boolean not null
);

insert into magnitud_capacidad_referencia
  (magnitud, orden, techo_peso_kg, techo_volumen_m3, requiere_vehiculo_sugerido)
values
  ('unidades',   1,    5,   0.05, false),
  ('decenas',    2,   25,   0.25, false),
  ('centenas',   3,  150,    1.5, true),
  ('cajas',      4,  400,      4, true),
  ('pallets',    5, 1000,     10, true),
  ('camioneta',  6, 2000,     15, true),
  ('gandola',    7, 30000,   80, true)
on conflict (magnitud) do nothing;

alter table magnitud_capacidad_referencia enable row level security;
revoke all on magnitud_capacidad_referencia from anon, authenticated;
grant select on magnitud_capacidad_referencia to anon, authenticated;

create policy magnitud_capacidad_referencia_select_public
  on magnitud_capacidad_referencia for select
  to anon, authenticated
  using (true);

-- ===========================================================================
-- 4. Tabla solicitudes.
--    node_id_origen = el nodo que PIDE (destino de la ayuda).
-- ===========================================================================
create table if not exists solicitudes (
  id            uuid primary key default gen_random_uuid(),
  node_id_origen uuid not null references centros_acopio(id),
  category_id   uuid not null references categories(id),
  subcategoria  text,
  magnitud      magnitud_nivel not null,
  requiere_vehiculo boolean not null default false,
  status        text not null default 'abierta'
                check (status in ('abierta','parcial','en_camino','inventario_asegurado','cerrada')),
  created_at    timestamptz not null default now()
);

create index if not exists idx_solicitudes_node   on solicitudes(node_id_origen);
create index if not exists idx_solicitudes_status on solicitudes(status);

-- ===========================================================================
-- 5. Tabla compromisos_voluntario.
--    SIN columnas de ubicación del voluntario, a propósito: si la ubicación no
--    se guarda aquí, no hay forma de filtrarla mal después (criterio de
--    aceptación "la ubicación del voluntario nunca se expone" como requisito de
--    modelado, no solo de lectura).
-- ===========================================================================
create table if not exists compromisos_voluntario (
  id                     uuid primary key default gen_random_uuid(),
  solicitud_id           uuid not null references solicitudes(id) on delete cascade,
  volunteer_id           uuid not null references volunteers(id),
  magnitud_comprometida  magnitud_nivel not null,
  tiempo_estimado_minutos int not null check (tiempo_estimado_minutos > 0),
  status                 text not null default 'pendiente'
                         check (status in ('pendiente','completado','incumplido')),
  created_at             timestamptz not null default now()
);

create index if not exists idx_compromisos_voluntario_solicitud on compromisos_voluntario(solicitud_id);
create index if not exists idx_compromisos_voluntario_volunteer on compromisos_voluntario(volunteer_id);

-- ===========================================================================
-- 6. Tabla compromisos_nodo.
--    node_id_compromete = el nodo que SE COMPROMETE a dar el stock. Se nombra
--    distinto de solicitudes.node_id_origen (el nodo que PIDE) a propósito: el
--    issue usa "node_id_origen" en ambas tablas, pero eso genera bugs de
--    lectura (¿quién pide y quién da?). Aquí el que da es node_id_compromete.
-- ===========================================================================
create table if not exists compromisos_nodo (
  id                    uuid primary key default gen_random_uuid(),
  solicitud_id          uuid not null references solicitudes(id) on delete cascade,
  node_id_compromete    uuid not null references centros_acopio(id),
  magnitud_comprometida magnitud_nivel not null,
  tiene_transporte      boolean not null,
  status                text not null default 'comprometido'
                        check (status in ('comprometido','en_camino','entregado','cancelado')),
  created_at            timestamptz not null default now()
);

create index if not exists idx_compromisos_nodo_solicitud on compromisos_nodo(solicitud_id);
create index if not exists idx_compromisos_nodo_node      on compromisos_nodo(node_id_compromete);

-- ===========================================================================
-- 7. Helpers.
-- ===========================================================================

-- Membresía de nodo validando por un token pasado como parámetro (admin o
-- colaborador del nodo). Mismo criterio que es_miembro_nodo (0031) pero sin
-- depender del header request.headers, para usarlo dentro de las RPC que ya
-- reciben el token explícito (patrón de crear_nodo/verificar_nodo).
create or replace function es_miembro_nodo_token(p_node_id uuid, p_token uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from node_admins na
    join volunteers v on v.id = na.volunteer_id
    where na.node_id = p_node_id and v.token = p_token and v.activo = true
  ) or exists (
    select 1 from node_collaborators nc
    join volunteers v on v.id = nc.volunteer_id
    where nc.node_id = p_node_id and v.token = p_token and v.activo = true
  );
$$;

grant execute on function es_miembro_nodo_token(uuid, uuid) to anon, authenticated;

-- Magnitud "cubierta" de una solicitud, sumando magnitud_orden de todo lo que
-- la cubre y NO ha fallado/cancelado: compromisos_voluntario en
-- ('pendiente','completado') + compromisos_nodo en
-- ('comprometido','en_camino','entregado'). Se excluye 'incumplido' y
-- 'cancelado'. SECURITY DEFINER para sumar sobre todas las filas sin que el
-- caller necesite SELECT directo sobre las tablas (RLS restringida).
create or replace function magnitud_comprometida_total(p_solicitud_id uuid)
returns int
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce((
      select sum(magnitud_orden(cv.magnitud_comprometida))
      from compromisos_voluntario cv
      where cv.solicitud_id = p_solicitud_id
        and cv.status in ('pendiente','completado')
    ), 0)
    +
    coalesce((
      select sum(magnitud_orden(cn.magnitud_comprometida))
      from compromisos_nodo cn
      where cn.solicitud_id = p_solicitud_id
        and cn.status in ('comprometido','en_camino','entregado')
    ), 0);
$$;

grant execute on function magnitud_comprometida_total(uuid) to anon, authenticated;

-- Recalcula el status de una solicitud a partir de los compromisos ACTIVOS.
-- Nunca resucita una 'cerrada'. Ver el mapeo en la cabecera del archivo.
create or replace function recalcular_status_solicitud(p_solicitud_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_nodo_transporte boolean;
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
      and status in ('comprometido','en_camino')
      and tiene_transporte = true
  ) into v_nodo_transporte;

  select exists (
    select 1 from compromisos_nodo
    where solicitud_id = p_solicitud_id
      and status in ('comprometido','en_camino')
      and tiene_transporte = false
  ) into v_nodo_sin_transporte;

  select exists (
    select 1 from compromisos_voluntario
    where solicitud_id = p_solicitud_id
      and status = 'pendiente'
  ) into v_voluntario;

  update solicitudes set status =
    case
      when v_nodo_transporte     then 'en_camino'
      when v_nodo_sin_transporte then 'inventario_asegurado'
      when v_voluntario          then 'parcial'
      else 'abierta'
    end
  where id = p_solicitud_id;
end;
$$;

grant execute on function recalcular_status_solicitud(uuid) to anon, authenticated;

-- ===========================================================================
-- 8. RLS.
-- ===========================================================================
alter table solicitudes            enable row level security;
alter table compromisos_voluntario enable row level security;
alter table compromisos_nodo       enable row level security;

-- --- solicitudes ---------------------------------------------------------
-- Todas las columnas son no sensibles (no hay contacto ni ubicación de
-- personas); se permite SELECT de columnas completas.
revoke all on solicitudes from anon, authenticated;
grant select on solicitudes to anon, authenticated;

-- Público (voluntarios): solo solicitudes "vivas" para responder. Una
-- 'en_camino' o 'cerrada' desaparece para voluntarios (criterio del issue).
-- El admin/colaborador del nodo origen ve sus propias solicitudes en cualquier
-- status vía es_miembro_nodo (node_admins/node_collaborators + token de header).
create policy solicitudes_select_public
  on solicitudes for select
  to anon, authenticated
  using (
    status in ('abierta','parcial','inventario_asegurado')
    or es_miembro_nodo(node_id_origen)
  );

-- --- compromisos_voluntario ----------------------------------------------
-- SIN policy de SELECT público directo. Solo:
--   * el propio voluntario ve sus compromisos (por su token);
--   * el admin/colaborador del nodo que PUBLICÓ la solicitud ve los
--     compromisos hacia su solicitud.
revoke all on compromisos_voluntario from anon, authenticated;
grant select on compromisos_voluntario to anon, authenticated;

create policy compromisos_voluntario_select_propio
  on compromisos_voluntario for select
  to anon, authenticated
  using (
    volunteer_id in (
      select v.id from volunteers v where v.token = current_volunteer_token()
    )
  );

create policy compromisos_voluntario_select_nodo_origen
  on compromisos_voluntario for select
  to anon, authenticated
  using (
    exists (
      select 1 from solicitudes s
      where s.id = compromisos_voluntario.solicitud_id
        and es_miembro_nodo(s.node_id_origen)
    )
  );

-- --- compromisos_nodo -----------------------------------------------------
-- Solo: el admin del nodo que COMPROMETIÓ ve los suyos; el admin del nodo
-- origen de la solicitud ve los compromisos hacia su solicitud.
revoke all on compromisos_nodo from anon, authenticated;
grant select on compromisos_nodo to anon, authenticated;

create policy compromisos_nodo_select_compromete
  on compromisos_nodo for select
  to anon, authenticated
  using (es_miembro_nodo(node_id_compromete));

create policy compromisos_nodo_select_nodo_origen
  on compromisos_nodo for select
  to anon, authenticated
  using (
    exists (
      select 1 from solicitudes s
      where s.id = compromisos_nodo.solicitud_id
        and es_miembro_nodo(s.node_id_origen)
    )
  );

-- (Sin policies de INSERT/UPDATE/DELETE: toda la escritura ocurre por las RPC
--  SECURITY DEFINER de abajo, que bypassan RLS.)

-- ===========================================================================
-- 9. RPC crear_solicitud.
-- ===========================================================================
create or replace function crear_solicitud(
  p_node_id     uuid,
  p_datos       jsonb,
  p_token_admin uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vol_id        uuid;
  v_category_id   uuid := nullif(p_datos ->> 'category_id', '')::uuid;
  v_magnitud      text := nullif(p_datos ->> 'magnitud', '');
  v_subcategoria  text := nullif(p_datos ->> 'subcategoria', '');
  v_requiere_veh  boolean := coalesce((p_datos ->> 'requiere_vehiculo')::boolean, false);
  v_solicitud_id  uuid;
begin
  select id into v_vol_id from volunteers where token = p_token_admin and activo = true;
  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

  if not es_miembro_nodo_token(p_node_id, p_token_admin) then
    raise exception 'no_autorizado';
  end if;

  if v_category_id is null or not exists (select 1 from categories where id = v_category_id) then
    raise exception 'La categoría de la solicitud no es válida.';
  end if;
  if v_magnitud is null or magnitud_orden(v_magnitud) = 0 then
    raise exception 'La magnitud de la solicitud no es válida.';
  end if;

  insert into solicitudes (node_id_origen, category_id, subcategoria, magnitud, requiere_vehiculo, status)
  values (p_node_id, v_category_id, v_subcategoria, v_magnitud, v_requiere_veh, 'abierta')
  returning id into v_solicitud_id;

  return v_solicitud_id;
end;
$$;

grant execute on function crear_solicitud(uuid, jsonb, uuid) to anon, authenticated;

-- ===========================================================================
-- 10. RPC responder_solicitud_voluntario.
--     Transiciones: ver mapeo en la cabecera. La solicitud queda en 'parcial'
--     (vía recalcular_status_solicitud); el "bloqueo para otros voluntarios"
--     cuando se cubre el total NO mueve el status a 'en_camino' (eso es del
--     compromiso de nodo): se aplica en listar_solicitudes_disponibles
--     filtrando las solicitudes con sobrante <= 0.
-- ===========================================================================
create or replace function responder_solicitud_voluntario(
  p_solicitud_id    uuid,
  p_magnitud        text,
  p_tiempo_estimado int,
  p_token_voluntario uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vol_id        uuid;
  v_tiene_veh     boolean;
  v_sol_status    text;
  v_requiere_veh  boolean;
  v_compromiso_id uuid;
begin
  -- Cualquier token de volunteer válido y activo puede responder como
  -- voluntario (admin/colaborador incluidos): el issue no restringe a
  -- role='voluntario' literal, y #17/#18 no lo prohíben.
  select id, tiene_vehiculo into v_vol_id, v_tiene_veh
  from volunteers where token = p_token_voluntario and activo = true;
  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

  if p_tiempo_estimado is null or p_tiempo_estimado <= 0 then
    raise exception 'El tiempo estimado debe ser mayor a cero minutos.';
  end if;
  if p_magnitud is null or magnitud_orden(p_magnitud) = 0 then
    raise exception 'La magnitud comprometida no es válida.';
  end if;

  select status, requiere_vehiculo into v_sol_status, v_requiere_veh
  from solicitudes where id = p_solicitud_id;
  if v_sol_status is null then
    raise exception 'solicitud_inexistente';
  end if;
  if v_sol_status not in ('abierta','parcial','inventario_asegurado') then
    raise exception 'solicitud_no_disponible: Esta solicitud ya no admite respuestas de voluntarios.';
  end if;

  -- Criterio de aceptación literal: si requiere vehículo, un voluntario sin
  -- vehículo JAMÁS puede comprometerse, sin importar la magnitud.
  if v_requiere_veh and not coalesce(v_tiene_veh, false) then
    raise exception 'requiere_vehiculo: Esta solicitud requiere un voluntario con vehículo; tu perfil no tiene vehículo registrado.';
  end if;

  insert into compromisos_voluntario
    (solicitud_id, volunteer_id, magnitud_comprometida, tiempo_estimado_minutos, status)
  values
    (p_solicitud_id, v_vol_id, p_magnitud, p_tiempo_estimado, 'pendiente')
  returning id into v_compromiso_id;

  perform recalcular_status_solicitud(p_solicitud_id);

  return v_compromiso_id;
end;
$$;

grant execute on function responder_solicitud_voluntario(uuid, text, int, uuid) to anon, authenticated;

-- ===========================================================================
-- 11. RPC responder_solicitud_nodo.
--     p_node_id (el nodo que compromete) es opcional: si se omite, se deriva
--     de la membresía del token (válido cuando el admin administra un solo
--     nodo; si administra varios y no lo especifica, se exige indicarlo).
--
--     LIMITACIÓN CONOCIDA (inventario): el issue dice que "el stock
--     comprometido se descuenta del inventario del nodo origen inmediatamente",
--     pero el esquema de centros_acopio (#18) NO lleva inventario granular por
--     nodo+categoría: solo tipo/status del nodo. Esa tabla de inventario es una
--     dependencia del modelo de "inventario y disponibilidad" de definicion.md
--     que pertenece a otro issue. Aquí el compromiso se REGISTRA y su status se
--     gestiona correctamente, pero NO hay descuento real de inventario porque
--     no existe dónde descontarlo. No se modela a medias a propósito.
-- ===========================================================================
create or replace function responder_solicitud_nodo(
  p_solicitud_id    uuid,
  p_magnitud        text,
  p_tiene_transporte boolean,
  p_token_admin     uuid,
  p_node_id         uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vol_id        uuid;
  v_node_id       uuid := p_node_id;
  v_sol_status    text;
  v_compromiso_id uuid;
  v_n_nodos       int;
begin
  select id into v_vol_id from volunteers where token = p_token_admin and activo = true;
  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

  if p_magnitud is null or magnitud_orden(p_magnitud) = 0 then
    raise exception 'La magnitud comprometida no es válida.';
  end if;
  if p_tiene_transporte is null then
    raise exception 'Debes indicar si el nodo aporta transporte.';
  end if;

  -- Derivar el nodo que compromete desde la membresía si no se especificó.
  if v_node_id is null then
    select count(distinct node_id) into v_n_nodos
    from (
      select na.node_id from node_admins na
        join volunteers v on v.id = na.volunteer_id
        where v.token = p_token_admin and v.activo = true
      union
      select nc.node_id from node_collaborators nc
        join volunteers v on v.id = nc.volunteer_id
        where v.token = p_token_admin and v.activo = true
    ) m;
    if v_n_nodos = 0 then
      raise exception 'no_autorizado';
    elsif v_n_nodos > 1 then
      raise exception 'nodo_ambiguo: Administras varios nodos; indica con cuál te comprometes.';
    end if;
    select node_id into v_node_id
    from (
      select na.node_id from node_admins na
        join volunteers v on v.id = na.volunteer_id
        where v.token = p_token_admin and v.activo = true
      union
      select nc.node_id from node_collaborators nc
        join volunteers v on v.id = nc.volunteer_id
        where v.token = p_token_admin and v.activo = true
    ) m
    limit 1;
  else
    if not es_miembro_nodo_token(v_node_id, p_token_admin) then
      raise exception 'no_autorizado';
    end if;
  end if;

  select status into v_sol_status from solicitudes where id = p_solicitud_id;
  if v_sol_status is null then
    raise exception 'solicitud_inexistente';
  end if;
  if v_sol_status = 'cerrada' then
    raise exception 'solicitud_no_disponible: Esta solicitud ya está cerrada.';
  end if;

  insert into compromisos_nodo
    (solicitud_id, node_id_compromete, magnitud_comprometida, tiene_transporte, status)
  values
    (p_solicitud_id, v_node_id, p_magnitud, p_tiene_transporte, 'comprometido')
  returning id into v_compromiso_id;

  -- tiene_transporte=true -> 'en_camino' (deja de verse para voluntarios).
  -- tiene_transporte=false -> 'inventario_asegurado' (visible solo a voluntarios).
  -- recalcular_status_solicitud produce exactamente eso con el nuevo compromiso.
  perform recalcular_status_solicitud(p_solicitud_id);

  return v_compromiso_id;
end;
$$;

grant execute on function responder_solicitud_nodo(uuid, text, boolean, uuid, uuid) to anon, authenticated;

-- ===========================================================================
-- 12. RPC cancelar_compromiso.
--     Busca el id en ambas tablas (los UUID no colisionan entre tablas, así el
--     frontend no necesita saber el tipo).
--
--     Compromiso de VOLUNTARIO:
--       - puede cancelar el propio voluntario (su token) o el admin del nodo
--         que publicó la solicitud;
--       - cancelación VOLUNTARIA del propio voluntario (a tiempo) != no
--         cumplimiento: NO se penaliza. Como el enum de
--         compromisos_voluntario no tiene un status 'cancelado', la
--         cancelación voluntaria ELIMINA la fila (libera el compromiso sin
--         dejar marca de incumplimiento).
--       - el admin del nodo origen sí marca 'incumplido' (no-cumplimiento);
--         también si se pasa p_motivo='incumplimiento' explícito.
--
--     Compromiso de NODO:
--       - solo el admin del nodo que comprometió puede cancelar -> 'cancelado'.
--       - "restaurar el descuento de inventario": no hay tabla de inventario
--         todavía (ver limitación en responder_solicitud_nodo), así que no hay
--         nada que restaurar.
--
--     Tras cancelar, se recalcula el status de la solicitud.
-- ===========================================================================
create or replace function cancelar_compromiso(
  p_compromiso_id uuid,
  p_token         uuid,
  p_motivo        text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vol_id       uuid;
  v_solicitud_id uuid;
  v_owner_vol_id uuid;
  v_node_origen  uuid;
  v_node_comp    uuid;
  v_es_admin     boolean;
begin
  select id into v_vol_id from volunteers where token = p_token and activo = true;
  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

  -- ¿Compromiso de voluntario?
  select cv.solicitud_id, cv.volunteer_id, s.node_id_origen
    into v_solicitud_id, v_owner_vol_id, v_node_origen
  from compromisos_voluntario cv
  join solicitudes s on s.id = cv.solicitud_id
  where cv.id = p_compromiso_id;

  if v_solicitud_id is not null then
    v_es_admin := es_miembro_nodo_token(v_node_origen, p_token);
    if v_owner_vol_id <> v_vol_id and not v_es_admin then
      raise exception 'no_autorizado';
    end if;

    if v_es_admin and v_owner_vol_id <> v_vol_id then
      -- Lo cancela el admin del nodo por no-cumplimiento.
      update compromisos_voluntario set status = 'incumplido' where id = p_compromiso_id;
    elsif v_es_admin and p_motivo = 'incumplimiento' then
      update compromisos_voluntario set status = 'incumplido' where id = p_compromiso_id;
    else
      -- Cancelación voluntaria a tiempo: sin penalización (se elimina la fila).
      delete from compromisos_voluntario where id = p_compromiso_id;
    end if;

    perform recalcular_status_solicitud(v_solicitud_id);
    return;
  end if;

  -- ¿Compromiso de nodo?
  select cn.solicitud_id, cn.node_id_compromete
    into v_solicitud_id, v_node_comp
  from compromisos_nodo cn
  where cn.id = p_compromiso_id;

  if v_solicitud_id is not null then
    if not es_miembro_nodo_token(v_node_comp, p_token) then
      raise exception 'no_autorizado';
    end if;
    update compromisos_nodo set status = 'cancelado' where id = p_compromiso_id;
    -- Sin inventario que restaurar (ver limitación documentada).
    perform recalcular_status_solicitud(v_solicitud_id);
    return;
  end if;

  raise exception 'compromiso_no_encontrado';
end;
$$;

grant execute on function cancelar_compromiso(uuid, uuid, text) to anon, authenticated;

-- ===========================================================================
-- 13. RPC confirmar_entrega_compromiso.
--     (Nombre distinto del confirmar_entrega del modelo viejo de recogidas
--      para no clobberearlo: las recogidas siguen usando confirmar_entrega.)
--     Solo el admin del nodo que PUBLICÓ la solicitud (el destino) confirma.
--     Marca 'completado' (voluntario) / 'entregado' (nodo). Si lo entregado
--     cubre el total de la solicitud, la solicitud pasa a 'cerrada'.
-- ===========================================================================
create or replace function confirmar_entrega_compromiso(
  p_compromiso_id        uuid,
  p_token_admin_destino  uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vol_id        uuid;
  v_solicitud_id  uuid;
  v_node_origen   uuid;
  v_objetivo      int;
  v_entregado     int;
begin
  select id into v_vol_id from volunteers where token = p_token_admin_destino and activo = true;
  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

  -- Localizar el compromiso (voluntario o nodo) y la solicitud asociada.
  select cv.solicitud_id, s.node_id_origen into v_solicitud_id, v_node_origen
  from compromisos_voluntario cv
  join solicitudes s on s.id = cv.solicitud_id
  where cv.id = p_compromiso_id;

  if v_solicitud_id is not null then
    if not es_miembro_nodo_token(v_node_origen, p_token_admin_destino) then
      raise exception 'no_autorizado';
    end if;
    update compromisos_voluntario set status = 'completado'
      where id = p_compromiso_id and status = 'pendiente';
  else
    select cn.solicitud_id, s.node_id_origen into v_solicitud_id, v_node_origen
    from compromisos_nodo cn
    join solicitudes s on s.id = cn.solicitud_id
    where cn.id = p_compromiso_id;

    if v_solicitud_id is null then
      raise exception 'compromiso_no_encontrado';
    end if;
    if not es_miembro_nodo_token(v_node_origen, p_token_admin_destino) then
      raise exception 'no_autorizado';
    end if;
    update compromisos_nodo set status = 'entregado'
      where id = p_compromiso_id and status in ('comprometido','en_camino');
  end if;

  -- ¿Lo ya ENTREGADO cubre el objetivo? -> cerrar la solicitud.
  select magnitud_orden(magnitud) into v_objetivo from solicitudes where id = v_solicitud_id;

  select
    coalesce((select sum(magnitud_orden(cv.magnitud_comprometida)) from compromisos_voluntario cv
              where cv.solicitud_id = v_solicitud_id and cv.status = 'completado'), 0)
    + coalesce((select sum(magnitud_orden(cn.magnitud_comprometida)) from compromisos_nodo cn
              where cn.solicitud_id = v_solicitud_id and cn.status = 'entregado'), 0)
    into v_entregado;

  if v_entregado >= v_objetivo then
    update solicitudes set status = 'cerrada' where id = v_solicitud_id;
  else
    perform recalcular_status_solicitud(v_solicitud_id);
  end if;
end;
$$;

grant execute on function confirmar_entrega_compromiso(uuid, uuid) to anon, authenticated;

-- ===========================================================================
-- 14. RPC listar_solicitudes_disponibles (lectura filtrada para voluntarios).
--     Filtra server-side (mismo patrón que listar_recogidas_recogedor):
--       - excluye solicitudes que requieren vehículo si el voluntario no tiene;
--       - excluye solicitudes ya cubiertas (sobrante <= 0): así "desaparecen"
--         para voluntarios cuando otro(s) ya cubrieron el total;
--       - solo status 'abierta'/'parcial'/'inventario_asegurado';
--       - devuelve el sobrante calculado (magnitud total - comprometido), NUNCA
--         el detalle de quién comprometió qué ni ubicación de nadie.
-- ===========================================================================
create or replace function listar_solicitudes_disponibles(p_token_voluntario uuid)
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_tiene_veh boolean;
  v_vol_id    uuid;
begin
  select id, tiene_vehiculo into v_vol_id, v_tiene_veh
  from volunteers where token = p_token_voluntario and activo = true;
  if v_vol_id is null then
    raise exception 'token_invalido';
  end if;

  return (
    select coalesce(json_agg(to_json(t)), '[]'::json)
    from (
      select
        s.id,
        s.node_id_origen,
        ca.nombre as nodo_nombre,
        s.category_id,
        c.name    as category_name,
        s.subcategoria,
        s.magnitud,
        s.requiere_vehiculo,
        s.status,
        greatest(0, magnitud_orden(s.magnitud) - magnitud_comprometida_total(s.id)) as sobrante,
        s.created_at
      from solicitudes s
      join categories c     on c.id = s.category_id
      join centros_acopio ca on ca.id = s.node_id_origen
      where s.status in ('abierta','parcial','inventario_asegurado')
        and (s.requiere_vehiculo = false or coalesce(v_tiene_veh, false) = true)
        and greatest(0, magnitud_orden(s.magnitud) - magnitud_comprometida_total(s.id)) > 0
      order by s.created_at desc
    ) t
  );
end;
$$;

grant execute on function listar_solicitudes_disponibles(uuid) to anon, authenticated;

-- ===========================================================================
-- 15. RPC listar_solicitudes_nodo (panel admin: solicitudes del nodo origen,
--     con sus compromisos activos, sin exponer ubicación de voluntarios).
-- ===========================================================================
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
            'created_at', cv.created_at
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
