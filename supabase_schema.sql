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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

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
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.escenarios (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    measures TEXT
);

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

DROP POLICY IF EXISTS "public access events" ON public.events;
CREATE POLICY "public access events" ON public.events FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public access app_users" ON public.app_users;
CREATE POLICY "public access app_users" ON public.app_users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public access escenarios" ON public.escenarios;
CREATE POLICY "public access escenarios" ON public.escenarios FOR ALL USING (true) WITH CHECK (true);
