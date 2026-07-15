-- Ejecutar esto en el SQL Editor de Supabase
-- Agrega el historial de transmisiones del Talkie: cada vez que
-- alguien habla, queda grabado y se puede reproducir después por si
-- no se escuchó en el momento.

INSERT INTO storage.buckets (id, name, public)
VALUES ('talkie-recordings', 'talkie-recordings', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public read talkie-recordings" ON storage.objects;
CREATE POLICY "public read talkie-recordings" ON storage.objects
    FOR SELECT USING (bucket_id = 'talkie-recordings');

DROP POLICY IF EXISTS "public insert talkie-recordings" ON storage.objects;
CREATE POLICY "public insert talkie-recordings" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'talkie-recordings');

DROP POLICY IF EXISTS "public delete talkie-recordings" ON storage.objects;
CREATE POLICY "public delete talkie-recordings" ON storage.objects
    FOR DELETE USING (bucket_id = 'talkie-recordings');

CREATE TABLE IF NOT EXISTS public.talkie_messages (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT NOT NULL,
    username TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    duration_seconds NUMERIC,
    transcript TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.talkie_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public access talkie_messages" ON public.talkie_messages;
CREATE POLICY "public access talkie_messages" ON public.talkie_messages FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS last_seen_talkie TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.talkie_messages;
EXCEPTION WHEN OTHERS THEN
    NULL; -- ya estaba agregada
END $$;
