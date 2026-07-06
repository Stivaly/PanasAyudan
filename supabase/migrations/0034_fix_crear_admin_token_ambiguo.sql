-- 0034_fix_crear_admin_token_ambiguo.sql
-- Corrige un bug de ambigüedad de nombres en crear_admin.
--
-- ERROR EN RUNTIME (SQL Editor, token de superadmin en request.headers):
--   ERROR: 42702: column reference "token" is ambiguous
--   DETAIL: It could refer to either a PL/pgSQL variable or a table column.
--   QUERY: select role from volunteers
--          where token = current_volunteer_token() and activo = true
--   CONTEXT: PL/pgSQL function crear_admin(text,text,text,text,uuid) line 7
--
-- CAUSA (confirmada contra el código):
--   crear_admin (última definición en 0031) declara RETURNS TABLE(id uuid,
--   token uuid). En PL/pgSQL, las columnas de un RETURNS TABLE se vuelven
--   VARIABLES implícitas dentro del cuerpo. La validación de rol usaba `token`
--   SIN CALIFICAR:
--       where token = current_volunteer_token() and activo = true
--   por lo que `token` era ambiguo entre la variable de retorno `token` y la
--   columna volunteers.token. crear_colaborador (mismo archivo) NO falla porque
--   ya califica con alias (`v.token`). crear_admin fue el único que copió el
--   patrón sin calificar.
--
-- FIX: calificar la columna como volunteers.token. NO se renombra la variable de
--   retorno `token` (el frontend consume { id, token } por nombre vía
--   supabase.rpc('crear_admin', ...); renombrarla rompería ese contrato).
--
-- Se usa DROP FUNCTION + CREATE (patrón de 0033) para no dejar dos firmas
--   coexistiendo. crear_admin tiene una única firma: (text,text,text,text,uuid).
--   El resto del cuerpo es idéntico a 0031 (incluida la sincronización con
--   node_admins de #18); solo cambia `token` -> `volunteers.token`.

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
  -- volunteers.token calificado explícitamente: `token` a secas es ambiguo con
  -- la columna de retorno `token` del RETURNS TABLE (ver cabecera).
  select role into v_caller_role
  from volunteers
  where volunteers.token = current_volunteer_token()
    and volunteers.activo = true;

  if v_caller_role is distinct from 'superadmin' then
    raise exception 'no_autorizado';
  end if;

  if coalesce(trim(p_nombre), '') = '' or coalesce(trim(p_apellido), '') = '' then
    raise exception 'El nombre y el apellido del admin son obligatorios.';
  end if;

  if p_centro_acopio_id is not null
     and not exists (select 1 from centros_acopio where id = p_centro_acopio_id) then
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
