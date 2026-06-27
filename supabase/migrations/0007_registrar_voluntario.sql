-- Registro de voluntarios vía RPC SECURITY DEFINER.
-- El INSERT directo desde el cliente no puede releer el token recién generado
-- porque la política RLS volunteers_select_own exige el header volunteer-token
-- (que aún no existe en el momento del registro). Esta función inserta y
-- devuelve id + token saltando RLS de forma controlada.

create or replace function registrar_voluntario(
  p_nombre text,
  p_apellido text,
  p_telefono text,
  p_telegram text,
  p_zona text
)
returns table (id uuid, token uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre es obligatorio';
  end if;

  if coalesce(trim(p_apellido), '') = '' then
    raise exception 'El apellido es obligatorio';
  end if;

  if coalesce(nullif(trim(p_telefono), ''), nullif(trim(p_telegram), '')) is null then
    raise exception 'Debes indicar al menos un contacto (teléfono o telegram)';
  end if;

  return query
  insert into volunteers (nombre, apellido, telefono, telegram, zona_descripcion)
  values (
    trim(p_nombre),
    trim(p_apellido),
    nullif(trim(p_telefono), ''),
    nullif(trim(p_telegram), ''),
    nullif(trim(p_zona), '')
  )
  returning volunteers.id, volunteers.token;
end;
$$;

grant execute on function registrar_voluntario(text, text, text, text, text) to anon, authenticated;
