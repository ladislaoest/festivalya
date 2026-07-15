-- =====================================================================
-- ESQUEMA SQL PARA SUPABASE - FESTIVALYA
-- =====================================================================
-- Tablas para persistir eventos, usuarios y escenarios de la app.
-- Login simple (usuario/contraseña gestionado por la propia app),
-- sin usar Supabase Auth. El acceso vía anon/publishable key es
-- abierto (RLS "true"): la seguridad del login la aplica el frontend,
-- no la base de datos.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    escenario_id TEXT,
    rider TEXT DEFAULT 'no',
    rider_empresa TEXT,
    vallas_antipanico TEXT,
    vallas_bajas TEXT,
    efectos TEXT DEFAULT 'no',
    pirotecnia TEXT DEFAULT 'no',
    generadores TEXT,
    banos TEXT,
    ambulancia TEXT,
    contenedores TEXT,
    limpieza TEXT,
    media_video TEXT,
    media_foto TEXT,
    media_drone TEXT,
    media_speaker TEXT,
    host_barras TEXT,
    host_foodtrucks TEXT,
    log_transfers TEXT,
    log_camerinos TEXT,
    event_date DATE,
    map_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Por si la tabla ya existía de una instalación anterior sin estas columnas
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_date DATE;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS map_data JSONB;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_events_updated_at ON public.events;
CREATE TRIGGER update_events_updated_at
    BEFORE UPDATE ON public.events
    FOR EACH ROW
    EXECUTE PROCEDURE public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.app_users (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,                    -- texto plano (ver nota de seguridad arriba)
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    allowed_events TEXT[] NOT NULL DEFAULT '{}',
    last_seen_notifications TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_messages TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Por si la tabla ya existía de una instalación anterior sin estas columnas
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS last_seen_notifications TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS last_seen_messages TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.escenarios (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    measures TEXT
);

-- Registro de actividad: qué usuario cambió qué en qué evento.
-- `visible_to` guarda una foto de los usuarios con acceso al evento en
-- el momento del cambio, para que la notificación no se pierda si
-- luego se le quita el acceso a alguien (o se borra el evento).
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

-- Sección "Diseños": bucket de Storage para archivos + metadatos por evento
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-designs', 'event-designs', true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.event_files (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('dossier', 'impresion', 'lona', 'acreditaciones', 'otros')),
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    uploaded_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ¿Este evento necesita Dossier/Impresión/Lona/...? + comentarios por categoría
CREATE TABLE IF NOT EXISTS public.event_design_status (
    event_id TEXT NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('dossier', 'impresion', 'lona', 'acreditaciones', 'otros')),
    needed BOOLEAN NOT NULL DEFAULT false,
    comment TEXT,
    PRIMARY KEY (event_id, category)
);

-- Suscripciones push para el Talkie (avisar cuando alguien transmite)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    event_id TEXT,
    subscription JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (username, event_id)
);

-- Mensajería interna: mensajes directos entre usuarios + menciones @usuario
-- Los campos target_* solo se usan en mensajes generados por una mención,
-- para poder saltar directo al evento/pestaña/campo con un clic.
CREATE TABLE IF NOT EXISTS public.messages (
    id BIGSERIAL PRIMARY KEY,
    sender TEXT NOT NULL,
    recipients TEXT[] NOT NULL,
    body TEXT NOT NULL,
    context TEXT,
    event_id TEXT,
    target_tab TEXT,
    target_field TEXT,
    target_category TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS event_id TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS target_tab TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS target_field TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS target_category TEXT;

-- =====================================================================
-- DATOS INICIALES
-- =====================================================================

INSERT INTO public.app_users (username, password, role, allowed_events)
VALUES ('admin', 'admin', 'admin', '{}')
ON CONFLICT (username) DO NOTHING;

INSERT INTO public.escenarios (id, name, measures) VALUES
    ('principal', 'Escenario Principal', '14m x 10m'),
    ('secundario', 'Escenario Secundario', '10m x 8m'),
    ('camion', 'Camión Escenario', '12m x 6m')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.events (id, name, escenario_id)
VALUES ('demo', 'Festival Ejemplo', 'principal')
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- ROW LEVEL SECURITY (acceso abierto vía anon/publishable key)
-- =====================================================================

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_design_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public access events" ON public.events;
CREATE POLICY "public access events" ON public.events FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public access app_users" ON public.app_users;
CREATE POLICY "public access app_users" ON public.app_users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public access escenarios" ON public.escenarios;
CREATE POLICY "public access escenarios" ON public.escenarios FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public access activity_log" ON public.activity_log;
CREATE POLICY "public access activity_log" ON public.activity_log FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public access event_files" ON public.event_files;
CREATE POLICY "public access event_files" ON public.event_files FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public access event_design_status" ON public.event_design_status;
CREATE POLICY "public access event_design_status" ON public.event_design_status FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public access messages" ON public.messages;
CREATE POLICY "public access messages" ON public.messages FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public access push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "public access push_subscriptions" ON public.push_subscriptions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public read event-designs" ON storage.objects;
CREATE POLICY "public read event-designs" ON storage.objects
    FOR SELECT USING (bucket_id = 'event-designs');

DROP POLICY IF EXISTS "public insert event-designs" ON storage.objects;
CREATE POLICY "public insert event-designs" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'event-designs');

DROP POLICY IF EXISTS "public delete event-designs" ON storage.objects;
CREATE POLICY "public delete event-designs" ON storage.objects
    FOR DELETE USING (bucket_id = 'event-designs');

-- =====================================================================
-- REALTIME (para que las notificaciones lleguen sin recargar la app)
-- =====================================================================

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;
EXCEPTION WHEN OTHERS THEN
    NULL; -- ya estaba agregada
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN OTHERS THEN
    NULL; -- ya estaba agregada
END $$;
