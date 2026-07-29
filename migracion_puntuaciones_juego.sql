-- Ejecutar esto en el SQL Editor de Supabase (mismo proyecto que usa festivalya)
-- Tabla de puntuaciones compartidas de Bread & Wather: cada partida guarda
-- el nombre del jugador y su puntuación, para poder ver un ranking entre
-- todos los que jueguen con el enlace.

CREATE TABLE IF NOT EXISTS public.bread_wather_scores (
    id BIGSERIAL PRIMARY KEY,
    player_name TEXT NOT NULL,
    score INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.bread_wather_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public access bread_wather_scores" ON public.bread_wather_scores;
CREATE POLICY "public access bread_wather_scores" ON public.bread_wather_scores
    FOR ALL USING (true) WITH CHECK (true);
