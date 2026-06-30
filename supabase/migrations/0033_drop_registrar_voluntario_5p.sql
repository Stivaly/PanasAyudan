-- 0033_drop_registrar_voluntario_5p.sql
-- Corrige una sobrecarga huérfana de registrar_voluntario.
--
-- CONTEXTO / DIAGNÓSTICO
-- Historia de la función:
--   * 0007/0013: create or replace registrar_voluntario(text,text,text,text,text)
--       -> firma de 5 parámetros (p_nombre, p_apellido, p_telefono, p_telegram, p_zona).
--   * 0026: creó una SOBRECARGA NUEVA de 6 parámetros
--       registrar_voluntario(text,text,text,text,text,uuid) sin eliminar la de 5.
--       Desde aquí coexistieron ambas.
--   * 0028: create or replace de la de 6 parámetros (misma firma).
--   * 0032 (#19): drop de la de 6 parámetros + create de la de 9 parámetros
--       (text,text,text,text,text,uuid,boolean,numeric,numeric).
--
-- Resultado: tras 0032 quedaron DOS funciones vivas -> la de 5 parámetros (que
-- nadie eliminó nunca desde 0007/0013) y la de 9 parámetros de #19. El DROP de
-- 0032 solo apuntaba a la firma de 6 parámetros, por eso no tocó la de 5.
--
-- La firma exacta de la versión vieja (lo que devuelve
-- pg_get_function_identity_arguments) es: text, text, text, text, text
--
-- Diagnóstico reproducible (lo que muestra las dos filas):
--   select pg_get_function_identity_arguments(oid), pronargs
--   from pg_proc where proname = 'registrar_voluntario';
--
-- IMPACTO EN RUNTIME: ninguno hoy. src/lib/api.ts invoca registrar_voluntario
-- con ARGUMENTOS CON NOMBRE (supabase.rpc('registrar_voluntario', { p_nombre,
-- ..., p_centro_acopio_id, p_tiene_vehiculo, p_capacidad_peso_kg,
-- p_capacidad_volumen_m3 })). PostgREST resuelve la sobrecarga por el conjunto
-- de nombres; la de 5 parámetros no tiene esos nombres extra, así que jamás
-- coincide. El DROP es limpieza para dejar UNA sola firma, no un fix de un bug
-- de resolución activo.

-- ---------------------------------------------------------------------------
-- DROP de la firma de 5 parámetros, SIN ASUMIR: se localiza dinámicamente la
-- sobrecarga con exactamente 5 argumentos de entrada y se elimina la que exista.
-- Si no existe (entorno donde ya estaba limpio), no hace nada y deja constancia.
-- ---------------------------------------------------------------------------
do $$
declare
  v_args   text;
  v_count  int;
begin
  select count(*) into v_count
  from pg_proc
  where proname = 'registrar_voluntario' and pronargs = 5;

  if v_count = 0 then
    raise notice 'No existe registrar_voluntario de 5 parámetros; nada que eliminar.';
  elsif v_count > 1 then
    -- Defensivo: no debería haber más de una; si la hay, no adivinamos.
    raise exception 'Hay % funciones registrar_voluntario de 5 parámetros; revisar manualmente.', v_count;
  else
    select pg_get_function_identity_arguments(oid) into v_args
    from pg_proc
    where proname = 'registrar_voluntario' and pronargs = 5;

    raise notice 'Eliminando registrar_voluntario(%) (firma vieja de 5 parámetros).', v_args;
    execute 'drop function registrar_voluntario(' || v_args || ')';
  end if;
end;
$$;

-- Verificación post-condición: debe quedar exactamente UNA registrar_voluntario,
-- la de 9 parámetros de #19.
do $$
declare
  v_total int;
begin
  select count(*) into v_total from pg_proc where proname = 'registrar_voluntario';
  if v_total <> 1 then
    raise exception 'Se esperaba 1 registrar_voluntario tras la limpieza; hay %.', v_total;
  end if;
end;
$$;
