-- Ejecutar esto en el SQL Editor de Supabase
-- Agrega a los mensajes la referencia al evento/pestaña/campo exacto
-- donde ocurrió una mención, para poder saltar directo ahí con un clic.

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS event_id TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS target_tab TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS target_field TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS target_category TEXT;
