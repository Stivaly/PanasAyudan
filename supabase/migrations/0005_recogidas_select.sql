-- 0005_recogidas_select.sql
-- PanasAyudan — lectura de recogidas para el panel de voluntarios.
-- Solo requests con header 'volunteer-token' de un voluntario activo pueden
-- leer recogidas. Sin token válido => cero filas (RLS).

grant select on recogidas to anon, authenticated;

create policy recogidas_select_token
  on recogidas for select
  to anon, authenticated
  using (
    exists (
      select 1
      from volunteers v
      where v.token = current_volunteer_token()
        and v.activo = true
    )
  );
