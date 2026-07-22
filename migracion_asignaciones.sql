-- Ejecutar esto en el SQL Editor de Supabase
-- Asignación de campos/tareas (rider, escenario, seguridad...) a un
-- usuario, con estado resuelto/pendiente y aviso al usuario asignado
-- (mensaje interno + push, ver notifyAssignment en index.html).

CREATE TABLE IF NOT EXISTS public.field_assignments (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    field_id TEXT NOT NULL,
    assigned_to TEXT NOT NULL,
    assigned_by TEXT,
    resolved BOOLEAN NOT NULL DEFAULT false,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (event_id, field_id)
);

DROP TRIGGER IF EXISTS update_field_assignments_updated_at ON public.field_assignments;
CREATE TRIGGER update_field_assignments_updated_at
    BEFORE UPDATE ON public.field_assignments
    FOR EACH ROW
    EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.field_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public access field_assignments" ON public.field_assignments;
CREATE POLICY "public access field_assignments" ON public.field_assignments FOR ALL USING (true) WITH CHECK (true);
