-- Ejecutar esto en el SQL Editor de Supabase
-- Reorganización de Producción: campos nuevos Lona/Memoria, y Vídeo/Foto
-- pasan de texto libre a selección múltiple de videógrafos/fotógrafos
-- (como Escenario, pero con posibilidad de llevar más de uno por evento).

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS lona TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS memoria TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS foto_ids JSONB NOT NULL DEFAULT '[]';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS video_ids JSONB NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS public.fotografos (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
);
ALTER TABLE public.fotografos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public access fotografos" ON public.fotografos;
CREATE POLICY "public access fotografos" ON public.fotografos FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.videografos (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
);
ALTER TABLE public.videografos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public access videografos" ON public.videografos;
CREATE POLICY "public access videografos" ON public.videografos FOR ALL USING (true) WITH CHECK (true);
