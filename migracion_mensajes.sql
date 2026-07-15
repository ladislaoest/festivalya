-- Ejecutar esto en el SQL Editor de Supabase
-- Agrega el sistema de mensajería interna (mensajes directos entre
-- usuarios + menciones con @usuario dentro de cualquier campo).

ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS last_seen_messages TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.messages (
    id BIGSERIAL PRIMARY KEY,
    sender TEXT NOT NULL,
    recipients TEXT[] NOT NULL,
    body TEXT NOT NULL,
    context TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public access messages" ON public.messages;
CREATE POLICY "public access messages" ON public.messages FOR ALL USING (true) WITH CHECK (true);

-- Habilita la entrega en vivo (sin recargar la página)
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN OTHERS THEN
    NULL; -- ya estaba agregada
END $$;
