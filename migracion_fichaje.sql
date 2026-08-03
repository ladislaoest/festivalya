-- Ejecutar esto en el SQL Editor de Supabase
-- Sección "Fichaje": alta de empleados, asignación a un evento, fichar
-- entrada/salida, horario estimado, sueldo por hora e informes (PDF de
-- sueldos, ZIP para gestoría). Solo accesible desde el frontend para el
-- usuario admin (ver setupUIByRole en index.html) -la seguridad real, como
-- en el resto de la app, la aplica el login del frontend, no la base de
-- datos.

-- 1. Empleados (plantilla global, reutilizable entre eventos)
CREATE TABLE IF NOT EXISTS public.employees (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    position TEXT,
    salary NUMERIC NOT NULL DEFAULT 0, -- sueldo por hora (€)
    dni TEXT,
    phone TEXT,
    files JSONB NOT NULL DEFAULT '[]', -- [{name, url, path}]
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_employees_updated_at ON public.employees;
CREATE TRIGGER update_employees_updated_at
    BEFORE UPDATE ON public.employees
    FOR EACH ROW
    EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public access employees" ON public.employees;
CREATE POLICY "public access employees" ON public.employees FOR ALL USING (true) WITH CHECK (true);

-- 2. Empleados asignados a un evento concreto: fichajes (sessions) y horario
--    estimado. Un empleado puede estar asignado a varios eventos, pero solo
--    una vez a cada uno (UNIQUE).
CREATE TABLE IF NOT EXISTS public.event_participants (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'out', -- 'out' | 'in' | 'scheduled'
    sessions JSONB NOT NULL DEFAULT '[]', -- [{clockIn, clockOut}]
    estimated_schedule TEXT, -- "HH:MM - HH:MM"
    payment_status TEXT, -- null | 'paid'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, employee_id)
);

DROP TRIGGER IF EXISTS update_event_participants_updated_at ON public.event_participants;
CREATE TRIGGER update_event_participants_updated_at
    BEFORE UPDATE ON public.event_participants
    FOR EACH ROW
    EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public access event_participants" ON public.event_participants;
CREATE POLICY "public access event_participants" ON public.event_participants FOR ALL USING (true) WITH CHECK (true);

-- 3. Marca de "evento finalizado" para el fichaje (bloquea fichar/editar y
--    deja el informe final como cierre). Independiente del filtro
--    Pendientes/Finalizados de la pestaña Eventos, que se calcula solo a
--    partir de la fecha del evento.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS fichaje_finalizado_at TIMESTAMPTZ;

-- 4. Bucket de almacenamiento para archivos de empleados (DNI, contrato...)
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-files', 'employee-files', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public read employee-files" ON storage.objects;
CREATE POLICY "public read employee-files" ON storage.objects
    FOR SELECT USING (bucket_id = 'employee-files');

DROP POLICY IF EXISTS "public insert employee-files" ON storage.objects;
CREATE POLICY "public insert employee-files" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'employee-files');

DROP POLICY IF EXISTS "public delete employee-files" ON storage.objects;
CREATE POLICY "public delete employee-files" ON storage.objects
    FOR DELETE USING (bucket_id = 'employee-files');
