-- Ejecutar esto en el SQL Editor de Supabase
-- Agrega la columna de fecha del evento (necesaria para ordenar por
-- "más próximo" y para la vista de calendario).

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_date DATE;
