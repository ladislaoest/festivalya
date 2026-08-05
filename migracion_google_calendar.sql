-- Ejecutar esto en el SQL Editor de Supabase
-- Sincronización con Google Calendar (ver api/google-*.js y la sección
-- "Google Calendar" en la pestaña Admin).
--
-- IMPORTANTE: a diferencia de TODAS las demás tablas de este proyecto,
-- google_calendar_tokens NO lleva una política "public access ... USING
-- (true)". Guarda el refresh_token de Google -si se pudiera leer con la
-- clave anon (que es pública, va incrustada en el HTML) cualquiera podría
-- usarla para acceder al Google Calendar conectado indefinidamente. Con RLS
-- activado y CERO políticas, cualquier request con la clave anon/publishable
-- es rechazado; solo las funciones serverless en /api pueden leer/escribir
-- esta tabla, usando la Service Role Key (secreta, en variables de entorno
-- de Vercel, nunca en el frontend).
CREATE TABLE IF NOT EXISTS public.google_calendar_tokens (
    id TEXT PRIMARY KEY DEFAULT 'main',
    access_token TEXT,
    refresh_token TEXT,
    token_expiry TIMESTAMPTZ,
    calendar_id TEXT,
    calendar_name TEXT,
    connected_by TEXT,
    connected_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;
-- Sin CREATE POLICY a propósito: RLS activado + ninguna política = acceso
-- denegado por defecto para cualquiera que use la clave anon/publishable.

-- Enlaza cada festival con su evento correspondiente en Google Calendar,
-- para actualizar el mismo evento en vez de duplicarlo en cada edición.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS google_event_id TEXT;
