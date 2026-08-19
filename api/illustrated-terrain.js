// Proxy de terreno real (agua, playa, bosque, carreteras) para pintar el
// fondo del Mapa Ilustrado (ver mapa/js/elements.js, paintIllustratedBackdrop).
// Mismo patrón que api/map-features.js: espejos de Overpass en paralelo,
// caché en memoria del propio proceso, sin problema de CORS al ser un fetch
// servidor a servidor. A diferencia de map-features (edificios/árboles para
// la vista 3D), aquí interesa la geometría real de vías de agua/costa y
// carreteras para poder rellenarlas/trazarlas con la paleta ilustrada.
const OVERPASS_ENDPOINTS = [
    'https://overpass.openstreetmap.fr/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
];

const TERRAIN_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const TERRAIN_CACHE_MAX_ENTRIES = 200;
const terrainCache = new Map();

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

function raceBestResult(factories, overallTimeoutMs) {
    return new Promise((resolve) => {
        let settled = false;
        let remaining = factories.length;
        let bestEmpty = null;
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
    const cached = terrainCache.get(cacheKey);
    if (cached && (Date.now() - cached.at) < TERRAIN_CACHE_TTL_MS) {
        res.status(200).json({ elements: cached.data, cached: true });
        return;
    }

    const bboxStr = `${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}`;
    const query = `[out:json][timeout:15];(` +
        `way["natural"="water"](${bboxStr});` +
        `way["waterway"~"^(river|stream|canal)$"](${bboxStr});` +
        `way["natural"="beach"](${bboxStr});` +
        `way["natural"="wood"](${bboxStr});` +
        `way["landuse"~"^(forest|wood)$"](${bboxStr});` +
        `way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential)$"](${bboxStr});` +
        `);out geom;`;

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
        res.status(502).json({ message: 'No se pudo obtener el terreno real (todos los servidores de Overpass fallaron).' });
        return;
    }

    if (terrainCache.size >= TERRAIN_CACHE_MAX_ENTRIES) {
        const oldestKey = terrainCache.keys().next().value;
        terrainCache.delete(oldestKey);
    }
    terrainCache.set(cacheKey, { data, at: Date.now() });
    res.status(200).json({ elements: data, cached: false });
};
