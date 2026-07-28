-- Ejecutar esto en el SQL Editor de Supabase
-- Agrega el campo de anotaciones generales de producción de cada evento.

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS anotaciones TEXT;
