-- Ejecutar esto en el SQL Editor de Supabase
-- Permite subir archivos adjuntos al campo de Anotaciones (Producción),
-- reutilizando la tabla event_files y el bucket "event-designs" que ya
-- usan los Diseños, con una categoría nueva: "anotaciones".

ALTER TABLE public.event_files DROP CONSTRAINT IF EXISTS event_files_category_check;
ALTER TABLE public.event_files ADD CONSTRAINT event_files_category_check
    CHECK (category IN ('dossier', 'impresion', 'lona', 'acreditaciones', 'otros', 'anotaciones'));
