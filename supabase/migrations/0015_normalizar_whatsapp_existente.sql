-- Devuelve WhatsApp siempre normalizado, incluso para voluntarios
-- creados antes de exigir formato venezolano.

create or replace function obtener_whatsapp_voluntario_item(
  p_aporte_item_id uuid
)
returns text
language sql
security definer
set search_path = public
as $$
  select normalizar_telefono_ve(v.telefono)
  from aporte_items ai
  join aportes a on a.id = ai.aporte_id
  join volunteers v on v.id = a.volunteer_id
  where ai.id = p_aporte_item_id
    and a.status = 'activo'
    and v.activo = true
  limit 1;
$$;

grant execute on function obtener_whatsapp_voluntario_item(uuid) to anon, authenticated;
