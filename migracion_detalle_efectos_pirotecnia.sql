-- Ejecutar esto en el SQL Editor de Supabase
-- Campo de texto que aparece al elegir "Sí" en Efectos FX / Pirotecnia,
-- igual que la empresa de sonido/iluminación aparece al elegir "Sí" en Rider.

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS efectos_detalle TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS pirotecnia_detalle TEXT;
