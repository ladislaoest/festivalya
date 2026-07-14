-- Ejecutar esto en el SQL Editor de Supabase
-- Agrega el campo donde se guarda el mapa (plano) de cada evento.

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS map_data JSONB;
