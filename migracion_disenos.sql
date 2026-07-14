-- Ejecutar esto en el SQL Editor de Supabase
-- Agrega la sección "Diseños": archivos (dossier, impresión, lona,
-- acreditaciones, otros) subidos por evento, guardados en Supabase Storage.

-- 1. Bucket de almacenamiento (público para poder descargar con un link directo)
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-designs', 'event-designs', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Políticas de acceso al bucket (igual de abiertas que el resto de la app,
--    ya que la seguridad la aplica el login del frontend, no la base de datos)
DROP POLICY IF EXISTS "public read event-designs" ON storage.objects;
CREATE POLICY "public read event-designs" ON storage.objects
    FOR SELECT USING (bucket_id = 'event-designs');

DROP POLICY IF EXISTS "public insert event-designs" ON storage.objects;
CREATE POLICY "public insert event-designs" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'event-designs');

DROP POLICY IF EXISTS "public delete event-designs" ON storage.objects;
CREATE POLICY "public delete event-designs" ON storage.objects
    FOR DELETE USING (bucket_id = 'event-designs');

-- 3. Tabla de metadatos de cada archivo subido
CREATE TABLE IF NOT EXISTS public.event_files (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('dossier', 'impresion', 'lona', 'acreditaciones', 'otros')),
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    uploaded_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.event_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public access event_files" ON public.event_files;
CREATE POLICY "public access event_files" ON public.event_files FOR ALL USING (true) WITH CHECK (true);
