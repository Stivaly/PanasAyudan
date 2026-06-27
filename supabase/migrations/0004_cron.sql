-- 0004_cron.sql
-- PanasAyudan — liberación automática de reservas expiradas.

create extension if not exists pg_cron;

select cron.schedule(
  'liberar-expiradas',
  '*/5 * * * *',
  $$
    select liberar_recogida(id)
    from recogidas
    where status = 'pendiente'
      and reserved_until < now();
  $$
);
