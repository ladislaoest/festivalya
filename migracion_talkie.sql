-- Ejecutar esto en el SQL Editor de Supabase
-- Guarda las suscripciones de notificaciones push para el Talkie
-- (walkie-talkie): cuando alguien transmite, se le avisa por push a
-- los demás usuarios activados en ese evento aunque tengan la app
-- cerrada o el teléfono bloqueado.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    event_id TEXT,
    subscription JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (username, event_id)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public access push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "public access push_subscriptions" ON public.push_subscriptions FOR ALL USING (true) WITH CHECK (true);
