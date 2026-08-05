-- Ejecutar esto en el SQL Editor de Supabase
-- Agrega la hora de inicio y de fin de cada evento. La hora de fin puede
-- ser menor que la de inicio (p.ej. empieza 22:00, acaba 04:00): significa
-- que el festival termina de madrugada, ya en el día siguiente a
-- event_date -se interpreta así en el frontend (ver formatEventHorario en
-- index.html), no hace falta guardar una fecha de fin aparte.

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS end_time TIME;
