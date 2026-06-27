-- Exige telefono venezolano de WhatsApp para voluntarios nuevos y
-- expone solo ese numero al confirmar una solicitud.

create or replace function normalizar_telefono_ve(p_telefono text)
returns text
language plpgsql
immutable
as $$
declare
  v_digits text := regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g');
  v_phone text;
begin
  if v_digits like '00%' then
    v_digits := substring(v_digits from 3);
  end if;

  if length(v_digits) = 11 and left(v_digits, 1) = '0' then
    v_phone := '58' || substring(v_digits from 2);
  elsif length(v_digits) = 12 and left(v_digits, 2) = '58' then
    v_phone := v_digits;
  else
    raise exception 'Ingresa un telefono venezolano de WhatsApp valido. Ej: 0412-1234567 o +58 412 1234567';
  end if;

  if v_phone !~ '^58(412|414|416|424|426)[0-9]{7}$' then
    raise exception 'Ingresa un telefono venezolano movil valido para WhatsApp. Ej: 0412-1234567';
  end if;

  return v_phone;
end;
$$;

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
declare
  v_telefono text;
begin
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre es obligatorio';
  end if;

  if coalesce(trim(p_apellido), '') = '' then
    raise exception 'El apellido es obligatorio';
  end if;

  v_telefono := normalizar_telefono_ve(p_telefono);

  return query
  insert into volunteers (nombre, apellido, telefono, telegram, zona_descripcion)
  values (
    trim(p_nombre),
    trim(p_apellido),
    v_telefono,
    nullif(trim(p_telegram), ''),
    nullif(trim(p_zona), '')
  )
  returning volunteers.id, volunteers.token;
end;
$$;

create or replace function obtener_whatsapp_voluntario_item(
  p_aporte_item_id uuid
)
returns text
language sql
security definer
set search_path = public
as $$
  select v.telefono
  from aporte_items ai
  join aportes a on a.id = ai.aporte_id
  join volunteers v on v.id = a.volunteer_id
  where ai.id = p_aporte_item_id
    and a.status = 'activo'
    and v.activo = true
  limit 1;
$$;

grant execute on function normalizar_telefono_ve(text) to anon, authenticated;
grant execute on function registrar_voluntario(text, text, text, text, text) to anon, authenticated;
grant execute on function obtener_whatsapp_voluntario_item(uuid) to anon, authenticated;
