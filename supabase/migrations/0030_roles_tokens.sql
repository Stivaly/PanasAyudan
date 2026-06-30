-- 0030_roles_tokens.sql
-- Issue #17 — Roles y tokens: asociar un rol a cada token de voluntario.
--
-- Alcance ESTRICTO de esta migración: solo roles/tokens sobre la tabla
-- volunteers ya existente. No se crean tablas de nodos ni de solicitudes; el
-- "nodo" de un admin/colaborador se representa por ahora con la columna
-- volunteers.centro_acopio_id (agregada en 0025), que es el campo más cercano
-- a "nodo" en el esquema actual. La FK real a nodos llegará en otro issue.
--
-- Roles:
--   superadmin  -> crea admins (uno por nodo). Se siembra exactamente uno.
--   admin       -> coordina un nodo (centro_acopio_id) y crea colaboradores.
--   colaborador -> opera dentro de un nodo; sin nombre/apellido reales.
--   voluntario  -> rol por defecto del registro libre actual (sin cambios).
--
-- Reutiliza current_volunteer_token() (0002_rls.sql) y el patrón de las RPC
-- SECURITY DEFINER existentes (set search_path = public, validación por token
-- activo). No duplica ni reescribe esas funciones.

-- ---------------------------------------------------------------------------
-- 1. Columna role.
-- ---------------------------------------------------------------------------
alter table volunteers
  add column if not exists role text not null default 'voluntario'
  check (role in ('superadmin', 'admin', 'colaborador', 'voluntario'));

-- ---------------------------------------------------------------------------
-- 2. Relajar nombre/apellido: los colaboradores no tienen nombre/apellido
--    reales (se les autogenera 'Colaborador N'); el resto de roles sí los
--    exige. Pasamos las columnas a NULLable y reforzamos con un CHECK
--    condicional para no perder la obligatoriedad en los demás roles.
-- ---------------------------------------------------------------------------
alter table volunteers alter column nombre   drop not null;
alter table volunteers alter column apellido drop not null;

alter table volunteers
  add constraint volunteers_nombre_apellido_requeridos
  check (
    role = 'colaborador'
    or (nombre is not null and apellido is not null)
  );

-- ---------------------------------------------------------------------------
-- 3. RLS: el cliente NO puede tocar la columna role por UPDATE directo.
--    El cambio de role solo ocurre vía las RPC SECURITY DEFINER de creación.
--    Defensa principal: privilegio de columna (no se concede UPDATE sobre
--    role). Defensa adicional: WITH CHECK que exige que el role escrito sea
--    igual al ya almacenado (la subconsulta lee la fila pre-update por MVCC),
--    de modo que ninguna ruta pública pueda auto-asignarse otro rol.
-- ---------------------------------------------------------------------------
revoke update on volunteers from anon, authenticated;
grant update (nombre, apellido, telefono, telegram, zona_descripcion, centro_acopio_id, activo)
  on volunteers to anon, authenticated;

drop policy if exists volunteers_update_own on volunteers;

create policy volunteers_update_own
  on volunteers for update
  to anon, authenticated
  using (token = current_volunteer_token())
  with check (
    token = current_volunteer_token()
    and role = (select v2.role from volunteers v2 where v2.id = volunteers.id)
  );

-- ---------------------------------------------------------------------------
-- 4. obtener_rol: devuelve el role de un token válido y activo.
--    Lanza excepción explícita si el token no existe o está inactivo, para que
--    el frontend distinga "token inválido" de "rol obtenido" (no null silencioso).
-- ---------------------------------------------------------------------------
create or replace function obtener_rol(p_token uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role
  from volunteers
  where token = p_token
    and activo = true;

  if v_role is null then
    raise exception 'token_invalido';
  end if;

  return v_role;
end;
$$;

grant execute on function obtener_rol(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. crear_admin: solo un superadmin (validado por current_volunteer_token())
--    puede crear un admin. El admin queda asociado al centro_acopio_id que se
--    pase (su "nodo"). Devuelve id + token, igual que registrar_voluntario.
-- ---------------------------------------------------------------------------
create or replace function crear_admin(
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
begin
  select role into v_caller_role
  from volunteers
  where token = current_volunteer_token()
    and activo = true;

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

  return query
  insert into volunteers (nombre, apellido, telefono, telegram, centro_acopio_id, role)
  values (
    trim(p_nombre),
    trim(p_apellido),
    normalizar_telefono_ve(p_telefono),
    nullif(trim(p_telegram), ''),
    p_centro_acopio_id,
    'admin'
  )
  returning volunteers.id, volunteers.token;
end;
$$;

grant execute on function crear_admin(text, text, text, text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. crear_colaborador: solo un admin puede crearlo. El colaborador se asocia
--    al centro_acopio_id (nodo) DEL PROPIO ADMIN que lo crea (no a uno
--    arbitrario que pase el cliente), para que un admin no pueda crear
--    colaboradores en nodos ajenos. nombre autogenerado 'Colaborador N', donde
--    N es secuencial dentro de ese nodo. Sin apellido/telefono/telegram.
--    Devuelve id + token.
-- ---------------------------------------------------------------------------
create or replace function crear_colaborador()
returns table (id uuid, token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id     uuid;
  v_admin_role   text;
  v_centro_id    uuid;
  v_n            int;
  v_nombre       text;
begin
  select v.id, v.role, v.centro_acopio_id
    into v_admin_id, v_admin_role, v_centro_id
  from volunteers v
  where v.token = current_volunteer_token()
    and v.activo = true;

  if v_admin_role is distinct from 'admin' then
    raise exception 'no_autorizado';
  end if;

  -- N secuencial = colaboradores ya existentes en este nodo + 1.
  select count(*) + 1 into v_n
  from volunteers
  where role = 'colaborador'
    and centro_acopio_id is not distinct from v_centro_id;

  v_nombre := 'Colaborador ' || v_n;

  return query
  insert into volunteers (nombre, apellido, centro_acopio_id, role)
  values (v_nombre, null, v_centro_id, 'colaborador')
  returning volunteers.id, volunteers.token;
end;
$$;

grant execute on function crear_colaborador() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Semilla: EXACTAMENTE un superadmin.
--    El token se genera con gen_random_uuid() (default de la columna): cada
--    entorno produce el suyo. NO se hardcodea un UUID fijo en el repo.
--
--    IMPORTANTE (acción manual): tras aplicar esta migración, corre a mano en
--    el SQL editor para leer el token generado y guardarlo FUERA del repo
--    (gestor de secretos, no en git):
--
--        select token from volunteers where role = 'superadmin';
--
--    El bloque siguiente solo siembra el superadmin si aún no existe ninguno
--    (idempotente) y emite el token por NOTICE para que quede en el log de
--    aplicación de la migración.
-- ---------------------------------------------------------------------------
do $$
declare
  v_token uuid;
begin
  if not exists (select 1 from volunteers where role = 'superadmin') then
    insert into volunteers (nombre, apellido, role)
    values ('Superadmin', 'Sistema', 'superadmin')
    returning token into v_token;

    raise notice 'Superadmin sembrado. TOKEN (guardar fuera del repo): %', v_token;
  else
    raise notice 'Ya existe un superadmin; no se siembra otro.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Nota sobre registrar_voluntario: NO se modifica. Inserta una lista de
-- columnas que no incluye role, por lo que el DEFAULT 'voluntario' se aplica
-- solo. El registro libre público sigue creando únicamente voluntarios.
-- ---------------------------------------------------------------------------
