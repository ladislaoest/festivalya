-- Ejecutar esto en el SQL Editor de Supabase
-- Agrega el campo "Seguridad" al módulo de Producción.

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS seguridad TEXT;
