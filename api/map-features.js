// Proxy de edificios/árboles reales (Overpass sobre datos de OpenStreetMap)
// para la vista 3D del editor de mapas (ver mapa/js/view3d.js). Igual que
// con la elevación (api/elevation.js): pasar por nuestra propia función
// evita depender de que ESE navegador concreto llegue a tiempo a uno de los
// espejos públicos de Overpass -compartido y gratuito, se satura con
// facilidad (504 visto en pruebas reales)-, sin problema de CORS al ser un
// fetch servidor a servidor.
//
// Los espejos se prueban EN PARALELO, no uno tras otro: las funciones
// serverless de Vercel tienen un límite de ejecución corto, y probarlos en
// serie (varios timeouts seguidos) podía superarlo sin necesidad. Además,
// un espejo puede responder 200 con la base de datos vacía/rota en vez de
// fallar limpiamente (visto en vivo con overpass.osm.ch) -así que no basta
// con la primera respuesta que llegue: se espera un margen corto extra por
// si otro espejo, ya en marcha, trae algo mejor.
const OVERPASS_ENDPOINTS = [
    'https://overpass.openstreetmap.fr/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
];

// Caché en memoria del propio proceso: las funciones serverless de Vercel
// no garantizan seguir vivas entre peticiones (cada una puede caer en una
// instancia distinta), así que esto NO es una caché fiable a largo plazo
// como lo sería en un servidor siempre encendido -pero cuando Vercel sí
// reutiliza la misma instancia "caliente" para peticiones seguidas (algo
// habitual en ráfagas cortas de uso), evita repetir la consulta a Overpass
// sin coste alguno si falla.
const MAP_FEATURES_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAP_FEATURES_CACHE_MAX_ENTRIES = 200;
const mapFeaturesCache = new Map();

function cacheKeyFor(bbox) {
    const r = (n) => Math.round(n * 10000) / 10000;
    return `${r(bbox.minLat)},${r(bbox.minLng)},${r(bbox.maxLat)},${r(bbox.maxLng)}`;
}

async function queryMirror(endpoint, query, signal) {
    const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal
    });
    if (!r.ok) throw new Error(`${endpoint} status ${r.status}`);
    const json = await r.json();
    if (!Array.isArray(json.elements)) throw new Error(`${endpoint}: respuesta sin "elements"`);
    return json.elements;
}

// Lanza todos los espejos en paralelo. Se queda con el primero que traiga
// resultados NO vacíos; si el margen de tiempo se agota, se conforma con el
// mejor que haya llegado hasta entonces (uno vacío-pero-válido es mejor que
// nada).
function raceBestResult(factories, overallTimeoutMs) {
    return new Promise((resolve) => {
        let settled = false;
        let remaining = factories.length;
        let bestEmpty = null; // primer 200-pero-vacío visto, por si no hay nada mejor
        const finish = (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(value);
        };
        const timer = setTimeout(() => finish(bestEmpty), overallTimeoutMs);
        factories.forEach(async (factory) => {
            try {
                const elements = await factory();
                if (elements.length > 0) {
                    finish(elements);
                    return;
                }
                if (bestEmpty === null) bestEmpty = elements;
            } catch (err) {
                // se ignora, puede que otro espejo sí responda
            } finally {
                remaining--;
                if (remaining === 0) finish(bestEmpty);
            }
        });
    });
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ message: 'Method not allowed' });
        return;
    }

    const { bbox } = req.body || {};
    if (!bbox || !isFinite(bbox.minLat) || !isFinite(bbox.minLng) || !isFinite(bbox.maxLat) || !isFinite(bbox.maxLng)) {
        res.status(400).json({ message: 'bbox {minLat, minLng, maxLat, maxLng} requerido.' });
        return;
    }

    const cacheKey = cacheKeyFor(bbox);
    const cached = mapFeaturesCache.get(cacheKey);
    if (cached && (Date.now() - cached.at) < MAP_FEATURES_CACHE_TTL_MS) {
        res.status(200).json({ elements: cached.data, cached: true });
        return;
    }

    const bboxStr = `${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}`;
    const query = `[out:json][timeout:15];(way["building"](${bboxStr});node["natural"="tree"](${bboxStr});way["natural"="wood"](${bboxStr});way["landuse"="forest"](${bboxStr}););out geom;`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8500);

    const data = await raceBestResult(
        OVERPASS_ENDPOINTS.map(endpoint => () => queryMirror(endpoint, query, controller.signal)),
        8500
    );

    clearTimeout(timeoutId);
    controller.abort();

    if (!data) {
        if (cached) {
            res.status(200).json({ elements: cached.data, cached: true, stale: true });
            return;
        }
        res.status(502).json({ message: 'No se pudieron obtener edificios/árboles reales (todos los servidores de Overpass fallaron).' });
        return;
    }

    if (mapFeaturesCache.size >= MAP_FEATURES_CACHE_MAX_ENTRIES) {
        const oldestKey = mapFeaturesCache.keys().next().value;
        mapFeaturesCache.delete(oldestKey);
    }
    mapFeaturesCache.set(cacheKey, { data, at: Date.now() });
    res.status(200).json({ elements: data, cached: false });
};
