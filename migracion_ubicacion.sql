-- Ejecutar esto en el SQL Editor de Supabase
-- Agrega el campo de ubicación/localidad de cada evento, usado para
-- detectar festivales repetidos en el mismo sitio y sugerir clonarlos.

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ubicacion TEXT;
