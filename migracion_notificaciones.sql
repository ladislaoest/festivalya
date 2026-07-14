-- Ejecutar esto en el SQL Editor de Supabase
-- Agrega el sistema de notificaciones: registro de actividad por
-- evento + marca de "última vez visto" por usuario.

ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS last_seen_notifications TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.activity_log (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT,
    event_name TEXT NOT NULL,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT,
    visible_to TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public access activity_log" ON public.activity_log;
CREATE POLICY "public access activity_log" ON public.activity_log FOR ALL USING (true) WITH CHECK (true);

-- Habilita las notificaciones en vivo (sin recargar la página)
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;
EXCEPTION WHEN OTHERS THEN
    NULL; -- ya estaba agregada
END $$;
