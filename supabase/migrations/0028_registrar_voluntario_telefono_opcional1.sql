-- 0028_registrar_voluntario_telefono_opcional.sql
-- Permite registrar voluntarios con SOLO Telegram (sin teléfono).
--
-- Problema: la versión previa de registrar_voluntario (0026) llamaba siempre a
-- normalizar_telefono_ve(p_telefono), que lanza excepción si no hay un teléfono
-- venezolano válido. Esto impedía el registro con solo Telegram, pese a que el
-- spec exige únicamente "al menos un medio de contacto: teléfono O Telegram".
--
-- Fix: el teléfono solo se normaliza/valida cuando viene presente. Si ambos
-- (teléfono y Telegram) están vacíos, se exige al menos uno. Las columnas
-- volunteers.telefono y volunteers.telegram ya permiten NULL (0001_schema.sql).

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
  v_telegram text := nullif(trim(p_telegram), '');
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

  -- El teléfono es opcional: solo se normaliza/valida si viene presente.
  if coalesce(trim(p_telefono), '') <> '' then
    v_telefono := normalizar_telefono_ve(p_telefono);
  else
    v_telefono := null;
  end if;

  -- Exigir al menos un medio de contacto.
  if v_telefono is null and v_telegram is null then
    raise exception 'Debes indicar al menos un contacto (teléfono o telegram)';
  end if;

  return query
  insert into volunteers (nombre, apellido, telefono, telegram, zona_descripcion, centro_acopio_id)
  values (
    trim(p_nombre),
    trim(p_apellido),
    v_telefono,
    v_telegram,
    nullif(trim(p_zona), ''),
    p_centro_acopio_id
  )
  returning volunteers.id, volunteers.token;
end;
$$;

grant execute on function registrar_voluntario(text, text, text, text, text, uuid) to anon, authenticated;


 