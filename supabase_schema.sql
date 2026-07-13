-- =====================================================================
-- ESQUEMA SQL PARA SUPABASE - FESTIVALYA
-- =====================================================================
-- Este script configura la base de datos de Supabase para que coincida
-- con la estructura y las reglas de negocio de la aplicación FestivalYa.
--
-- Se proponen dos enfoques para la gestión de usuarios:
--   OPCIÓN A (Recomendado): Usar Supabase Auth + Perfiles públicos (Seguro y Robusto).
--   OPCIÓN B (Simplificado): Tablas independientes sin Supabase Auth.
--
-- También se incluye soporte para Seguridad a Nivel de Fila (RLS) para 
-- asegurar que los usuarios solo puedan acceder a sus eventos asignados.
-- =====================================================================

-- =====================================================================
-- 1. TABLAS PRINCIPALES (Válidas para ambas opciones)
-- =====================================================================

-- Tabla de Eventos / Festivales
CREATE TABLE IF NOT EXISTS public.events (
    id TEXT PRIMARY KEY,                       -- Ej: 'fest_123456789' o 'demo'
    name TEXT NOT NULL,                        -- Nombre del festival
    
    -- Módulo de Producción
    escenario_id TEXT,                         -- ID del escenario seleccionado
    rider TEXT DEFAULT 'no',                   -- 'si' / 'no'
    rider_empresa TEXT,                        -- Nombre de empresa proveedora
    vallas_antipanico TEXT,
    vallas_bajas TEXT,
    efectos TEXT DEFAULT 'no',                 -- 'no' / 'si' / 'incluidos'
    pirotecnia TEXT DEFAULT 'no',              -- 'si' / 'no'
    generadores TEXT,
    banos TEXT,
    ambulancia TEXT,
    contenedores TEXT,
    limpieza TEXT,
    
    -- Equipo de Media / Prensa
    media_video TEXT,
    media_foto TEXT,
    media_drone TEXT,
    media_speaker TEXT,
    
    -- Hostelería y Restauración
    host_barras TEXT,
    host_foodtrucks TEXT,
    
    -- Logística, Transfers y Camerinos
    log_transfers TEXT,
    log_camerinos TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar disparador para actualizar 'updated_at' automáticamente
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_events_updated_at
    BEFORE UPDATE ON public.events
    FOR EACH ROW
    EXECUTE PROCEDURE public.handle_updated_at();


-- =====================================================================
-- OPCIÓN A: INTEGRACIÓN CON SUPABASE AUTH (RECOMENDADO ⭐)
-- =====================================================================
-- Esta opción utiliza la autenticación segura nativa de Supabase.
-- Se crea una tabla pública `profiles` que se asocia con `auth.users`.

-- Tabla de Perfiles Públicos (Roles y Datos Extra)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de Permisos de Eventos (Relación Muchos a Muchos)
CREATE TABLE IF NOT EXISTS public.user_events (
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_id TEXT REFERENCES public.events(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, event_id)
);

-- Trigger para crear un perfil público automáticamente al registrar un usuario en Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', NEW.email),
        COALESCE(NEW.raw_user_meta_data->>'role', 'user')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Eliminar disparador si ya existe para evitar errores de duplicación
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE PROCEDURE public.handle_new_user();


-- =====================================================================
-- SEGURIDAD A NIVEL DE FILA (RLS) - OPCIÓN A (Aumenta la seguridad en la nube)
-- =====================================================================

-- Habilitar RLS en las tablas
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;

-- 1. Políticas para Perfiles (profiles)
CREATE POLICY "Admins can do everything on profiles" ON public.profiles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Users can read all profiles" ON public.profiles
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- 2. Políticas para Permisos (user_events)
CREATE POLICY "Admins can manage user permissions" ON public.user_events
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Users can view their own permissions" ON public.user_events
    FOR SELECT USING (user_id = auth.uid());

-- 3. Políticas para Eventos (events)
CREATE POLICY "Admins can do everything on events" ON public.events
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Users can read permitted events" ON public.events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.user_events 
            WHERE user_events.user_id = auth.uid() AND user_events.event_id = events.id
        )
    );

CREATE POLICY "Users can update permitted events" ON public.events
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.user_events 
            WHERE user_events.user_id = auth.uid() AND user_events.event_id = events.id
        )
    );


-- =====================================================================
-- OPCIÓN B: ENFOQUE SIMPLIFICADO (Sin Supabase Auth)
-- =====================================================================
-- Si prefieres NO usar Supabase Auth y mantener un inicio de sesión simple
-- gestionado por ti mismo en una tabla de tu esquema público:

-- Tabla de Usuarios Personalizada (Sencilla)
CREATE TABLE IF NOT EXISTS public.app_users (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,                   -- Guardar como hash en prod
    role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de Permisos para Opción B
CREATE TABLE IF NOT EXISTS public.app_user_events (
    username TEXT REFERENCES public.app_users(username) ON DELETE CASCADE,
    event_id TEXT REFERENCES public.events(id) ON DELETE CASCADE,
    PRIMARY KEY (username, event_id)
);

-- Insertar administrador inicial por defecto para Opción B
INSERT INTO public.app_users (username, password, role)
VALUES ('admin', 'admin', 'admin')
ON CONFLICT (username) DO NOTHING;


-- =====================================================================
-- ⚙️ CÓMO CONECTAR ESTO A TU APLICACIÓN HTML (CONSEJOS RÁPIDOS)
-- =====================================================================
-- 1. Instala el cliente de Supabase añadiendo este script en el <head> del HTML:
--    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
--
-- 2. Inicializa el cliente en tu JS:
--    const supabaseUrl = 'TU_SUPABASE_URL';
--    const supabaseKey = 'TU_SUPABASE_ANON_KEY';
--    const supabase = supabase.createClient(supabaseUrl, supabaseKey);
--
-- 3. Reemplaza las funciones de localStorage por peticiones async de Supabase.
--    Ejemplo para cargar eventos:
--    async function loadEventsFromSupabase() {
--        const { data, error } = await supabase
--            .from('events')
--            .select('*');
--        if (error) console.error(error);
--        else console.log(data);
--    }
-- =====================================================================
