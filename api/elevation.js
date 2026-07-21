// Proxy de elevación real del terreno para la vista 3D del editor de mapas
// (ver mapa/js/view3d.js). El navegador ya podía llamar directo a
// Open-Elevation, pero eso ata el relieve a que ESE único servicio gratuito
// y sin SLA esté arriba en ese momento -se ha visto caer con 504 en pruebas
// reales-, y descarta de raíz cualquier fuente que no soporte CORS desde el
// navegador (Open Topo Data no manda cabeceras CORS, aunque responde rápido
// y de forma consistente). Pasando por nuestra propia función no hay CORS
// que sortear en ningún caso -es un fetch servidor a servidor-, así que se
// puede probar más de una fuente.
//
// Las dos fuentes se piden EN PARALELO (no una tras otra): las funciones
// serverless de Vercel tienen un límite de ejecución corto, así que probar
// una y luego la otra en serie podía superarlo sin necesidad -mejor
// quedarse con la primera que responda bien y no esperar a la más lenta.
async function queryOpenTopoData(locations, signal) {
    const locStr = locations.map(l => `${l.latitude},${l.longitude}`).join('|');
    const r = await fetch(`https://api.opentopodata.org/v1/srtm90m?locations=${encodeURIComponent(locStr)}`, { signal });
    if (!r.ok) throw new Error(`opentopodata status ${r.status}`);
    const data = await r.json();
    if (!Array.isArray(data.results) || data.results.length !== locations.length || !data.results.every(x => typeof x.elevation === 'number')) {
        throw new Error('opentopodata: resultado inválido');
    }
    return { results: data.results.map(x => ({ elevation: x.elevation })), source: 'opentopodata' };
}

async function queryOpenElevation(locations, signal) {
    const r = await fetch('https://api.open-elevation.com/api/v1/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations }),
        signal
    });
    if (!r.ok) throw new Error(`open-elevation status ${r.status}`);
    const data = await r.json();
    if (!Array.isArray(data.results) || data.results.length !== locations.length || !data.results.every(x => typeof x.elevation === 'number')) {
        throw new Error('open-elevation: resultado inválido');
    }
    return { results: data.results, source: 'open-elevation' };
}

// Devuelve el primer resultado válido entre varias fuentes que corren en
// paralelo, sin esperar a que todas terminen -null si ninguna responde bien
// dentro del margen de tiempo.
function raceFirstSuccess(factories, overallTimeoutMs) {
    return new Promise((resolve) => {
        let settled = false;
        let remaining = factories.length;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(value);
        };
        const timer = setTimeout(() => finish(null), overallTimeoutMs);
        factories.forEach(async (factory) => {
            try {
                const result = await factory();
                finish(result);
            } catch (err) {
                remaining--;
                if (remaining === 0) finish(null);
            }
        });
    });
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ message: 'Method not allowed' });
        return;
    }

    const { locations } = req.body || {};
    if (!Array.isArray(locations) || !locations.length) {
        res.status(400).json({ message: 'locations (array de {latitude, longitude}) requerido.' });
        return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8500);

    const result = await raceFirstSuccess([
        () => queryOpenTopoData(locations, controller.signal),
        () => queryOpenElevation(locations, controller.signal)
    ], 8500);

    clearTimeout(timeoutId);
    controller.abort(); // corta la fuente que perdió la carrera, si sigue en marcha

    if (!result) {
        res.status(502).json({ message: 'No se pudo obtener elevación real de ningún proveedor.' });
        return;
    }
    res.status(200).json(result);
};
