-- Lectura pública de estados.
-- La tabla estados (0016) recibió grant select pero no tenía policy de SELECT.
-- Con RLS activo sobre la tabla, sin policy el rol anónimo recibe 0 filas
-- (HTTP 200 con []), por lo que el desplegable de estados salía vacío.
-- Se replica el patrón de categories: RLS + grant + policy using(true).

alter table estados enable row level security;

revoke all on estados from anon, authenticated;
grant select on estados to anon, authenticated;

drop policy if exists estados_select_public on estados;
create policy estados_select_public
  on estados for select
  using (true);
