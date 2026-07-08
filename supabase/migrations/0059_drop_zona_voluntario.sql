-- 0059_drop_zona_voluntario.sql (issue #27)
-- La zona declarada por el voluntario se elimina: fue reemplazada por la
-- verificacion de ubicacion por GPS con rango por distancia (0038/0043/0047).
-- Patron de drop defensivo por firma (como 0033): se localiza la version de
-- 10 parametros en pg_proc y se recrea sin p_zona, partiendo del cuerpo
-- vigente de 0040 (cedula y bloqueo intactos).

set search_path = public;

do $do$
declare
  v_oid oid;
  v_args text;
  v_total int;
begin
  select count(*) into v_total from pg_proc
    where proname = 'registrar_voluntario' and pronamespace = 'public'::regnamespace;
  if v_total > 1 then
    raise exception 'hay % versiones de registrar_voluntario: resolver manualmente', v_total;
  end if;
  select oid, pg_get_function_identity_arguments(oid) into v_oid, v_args
    from pg_proc
    where proname = 'registrar_voluntario' and pronamespace = 'public'::regnamespace
      and pronargs = 10;
  if v_oid is not null then
    raise notice 'eliminando registrar_voluntario(%)', v_args;
    execute format('drop function registrar_voluntario(%s)', v_args);
  end if;
end
$do$;

create or replace function registrar_voluntario(
  p_nombre               text,
  p_apellido             text,
  p_cedula               text,
  p_telefono             text,
  p_telegram             text,
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
    nombre, apellido, cedula, telefono, telegram, centro_acopio_id,
    tiene_vehiculo, capacidad_peso_kg, capacidad_volumen_m3
  )
  values (
    trim(p_nombre),
    trim(p_apellido),
    v_cedula,
    v_telefono,
    v_telegram,
    p_centro_acopio_id,
    coalesce(p_tiene_vehiculo, false),
    case when p_tiene_vehiculo then p_capacidad_peso_kg else null end,
    case when p_tiene_vehiculo then p_capacidad_volumen_m3 else null end
  )
  returning volunteers.id, volunteers.token;
end;
$$;

alter table volunteers drop column if exists zona_descripcion;
