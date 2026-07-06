-- 0036_crear_admin_telefono_opcional.sql
-- crear_admin: teléfono opcional (mismo criterio que registrar_voluntario).
--
-- PROBLEMA: crear_admin (última def. en 0035) llamaba a
--   normalizar_telefono_ve(p_telefono) SIEMPRE, dentro del INSERT. Esa función
--   lanza excepción cuando el teléfono no es un móvil venezolano válido, y con
--   entrada vacía/null también (normalizar_telefono_ve('') -> excepción). Por
--   eso crear un admin sin teléfono fallaba, aunque p_telefono es opcional en la
--   firma. Es exactamente el bug que 0028 corrigió para registrar_voluntario.
--
-- FIX: normalizar/validar el teléfono SOLO si viene presente; si está vacío se
--   guarda null. Se conserva todo lo demás de 0035 (columnas calificadas para
--   evitar la ambigüedad id/token del RETURNS TABLE, y la sincronización con
--   node_admins de #18). El telegram ya era opcional vía nullif(trim(...), '').
--
-- DROP FUNCTION + CREATE (patrón 0033/0034/0035); una sola firma.

drop function if exists crear_admin(text, text, text, text, uuid);

create function crear_admin(
  p_nombre           text,
  p_apellido         text,
  p_telefono         text default null,
  p_telegram         text default null,
  p_centro_acopio_id uuid default null
)
returns table (id uuid, token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
  v_new_id      uuid;
  v_new_token   uuid;
  v_telefono    text;
begin
  -- Columnas de tabla calificadas: `id`/`token` a secas son ambiguos con las
  -- columnas de retorno del RETURNS TABLE (ver 0034/0035).
  select v.role into v_caller_role
  from volunteers v
  where v.token = current_volunteer_token()
    and v.activo = true;

  if v_caller_role is distinct from 'superadmin' then
    raise exception 'no_autorizado';
  end if;

  if coalesce(trim(p_nombre), '') = '' or coalesce(trim(p_apellido), '') = '' then
    raise exception 'El nombre y el apellido del admin son obligatorios.';
  end if;

  if p_centro_acopio_id is not null
     and not exists (
       select 1 from centros_acopio ca where ca.id = p_centro_acopio_id
     ) then
    raise exception 'El centro de acopio (nodo) seleccionado no existe.';
  end if;

  -- Teléfono opcional: solo se normaliza/valida si viene presente (igual que
  -- registrar_voluntario en 0028). Vacío/null => se guarda null, sin exigirlo.
  if coalesce(trim(p_telefono), '') <> '' then
    v_telefono := normalizar_telefono_ve(p_telefono);
  else
    v_telefono := null;
  end if;

  insert into volunteers (nombre, apellido, telefono, telegram, centro_acopio_id, role)
  values (
    trim(p_nombre),
    trim(p_apellido),
    v_telefono,
    nullif(trim(p_telegram), ''),
    p_centro_acopio_id,
    'admin'
  )
  returning volunteers.id, volunteers.token into v_new_id, v_new_token;

  if p_centro_acopio_id is not null then
    insert into node_admins (node_id, volunteer_id, verificado)
    values (p_centro_acopio_id, v_new_id, false)
    on conflict (node_id, volunteer_id) do nothing;
  end if;

  return query select v_new_id, v_new_token;
end;
$$;

grant execute on function crear_admin(text, text, text, text, uuid) to anon, authenticated;

-- Post-condición: exactamente una crear_admin viva.
do $$
declare
  v_total int;
begin
  select count(*) into v_total from pg_proc where proname = 'crear_admin';
  if v_total <> 1 then
    raise exception 'Se esperaba 1 crear_admin tras el fix; hay %.', v_total;
  end if;
end;
$$;
