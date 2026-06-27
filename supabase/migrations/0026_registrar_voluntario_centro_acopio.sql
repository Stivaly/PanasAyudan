-- 0026_registrar_voluntario_centro_acopio.sql
-- Extiende registrar_voluntario para aceptar un centro de acopio de referencia
-- opcional (el voluntario coordina desde ahí, no es el centro). La columna
-- volunteers.centro_acopio_id se agregó en 0025; aquí se propaga en el INSERT.

create or replace function registrar_voluntario(
  p_nombre text,
  p_apellido text,
  p_telefono text,
  p_telegram text,
  p_zona text,
  p_centro_acopio_id uuid default null
)
returns table (id uuid, token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_telefono text;
begin
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre es obligatorio';
  end if;

  if coalesce(trim(p_apellido), '') = '' then
    raise exception 'El apellido es obligatorio';
  end if;

  if p_centro_acopio_id is not null
     and not exists (select 1 from centros_acopio where id = p_centro_acopio_id) then
    raise exception 'El centro de acopio seleccionado no existe.';
  end if;

  v_telefono := normalizar_telefono_ve(p_telefono);

  return query
  insert into volunteers (nombre, apellido, telefono, telegram, zona_descripcion, centro_acopio_id)
  values (
    trim(p_nombre),
    trim(p_apellido),
    v_telefono,
    nullif(trim(p_telegram), ''),
    nullif(trim(p_zona), ''),
    p_centro_acopio_id
  )
  returning volunteers.id, volunteers.token;
end;
$$;

grant execute on function registrar_voluntario(text, text, text, text, text, uuid) to anon, authenticated;
