-- 0035_fix_crear_admin_id_ambiguo.sql
-- Segundo (y final) fix de ambigüedad en crear_admin.
--
-- CONTEXTO: crear_admin declara RETURNS TABLE(id uuid, token uuid). En PL/pgSQL
-- AMBAS columnas de retorno (`id` y `token`) son variables implícitas dentro del
-- cuerpo, así que cualquier referencia sin calificar a una columna `id` o
-- `token` de una tabla es ambigua.
--
--   * 0034 calificó `token` (volunteers.token) -> resolvió el 42702 sobre "token".
--   * Pero quedó otra: en la validación del centro de acopio,
--       not exists (select 1 from centros_acopio where id = p_centro_acopio_id)
--     `id` colisiona con la variable de retorno `id`:
--       ERROR 42702: column reference "id" is ambiguous
--       CONTEXT: ... crear_admin(...) line 22 at IF
--
-- FIX (definitivo): se califica TODA referencia a columna de tabla del cuerpo
--   (centros_acopio.id, volunteers.token, volunteers.activo, y las columnas del
--   returning ya calificadas). No se renombran las columnas de retorno `id` /
--   `token` (contrato con el frontend vía supabase.rpc('crear_admin', ...)).
--
-- DROP FUNCTION + CREATE (patrón de 0033/0034); crear_admin tiene una sola firma.

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
begin
  -- Columnas de tabla calificadas: `id` y `token` a secas son ambiguos con las
  -- columnas de retorno del RETURNS TABLE (ver cabecera).
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

  insert into volunteers (nombre, apellido, telefono, telegram, centro_acopio_id, role)
  values (
    trim(p_nombre),
    trim(p_apellido),
    normalizar_telefono_ve(p_telefono),
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
