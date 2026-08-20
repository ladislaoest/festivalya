// Proxy de lugares cercanos con nombre real (campo de fútbol, colegio,
// parque, hospital...) para el Mapa Ilustrado (ver mapa/js/elements.js,
// loadNearbyPlaceNames). Mismo patrón que api/map-features.js e
// api/illustrated-terrain.js: espejos de Overpass en paralelo, caché en
// memoria del propio proceso, sin problema de CORS al ser un fetch
// servidor a servidor -a diferencia del intento directo desde el
// navegador, que si el espejo público no manda cabecera CORS en su
// respuesta (visto en vivo: pasa sobre todo cuando el espejo está
// devolviendo un error o limitando peticiones) el navegador la bloquea
// entera y aquí no llega nada, aunque el servidor sí haya respondido algo-.
//
// Esta ruta faltaba en producción (solo existía la versión de
// mapa/server.js, que es el servidor Express de desarrollo local, no una
// función de Vercel): de ahí el 404 que se veía en la consola del
// navegador cuando el intento directo fallaba y caía a este proxy.
const OVERPASS_ENDPOINTS = [
    'https://overpass.openstreetmap.fr/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
];

const NEARBY_PLACES_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const NEARBY_PLACES_CACHE_MAX_ENTRIES = 200;
const nearbyPlacesCache = new Map();

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
    const cached = nearbyPlacesCache.get(cacheKey);
    if (cached && (Date.now() - cached.at) < NEARBY_PLACES_CACHE_TTL_MS) {
        res.status(200).json({ elements: cached.data, cached: true });
        return;
    }

    const bboxStr = `${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}`;
    const query = `[out:json][timeout:20];(
        node["leisure"]["name"](${bboxStr});
        way["leisure"]["name"](${bboxStr});
        node["amenity"~"^(school|university|hospital|place_of_worship)$"]["name"](${bboxStr});
        way["amenity"~"^(school|university|hospital|place_of_worship)$"]["name"](${bboxStr});
        way["landuse"="recreation_ground"]["name"](${bboxStr});
        way["natural"="water"]["name"](${bboxStr});
        node["tourism"]["name"](${bboxStr});
    );out center;`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const data = await raceBestResult(
        OVERPASS_ENDPOINTS.map(endpoint => () => queryMirror(endpoint, query, controller.signal)),
        25000
    );

    clearTimeout(timeoutId);
    controller.abort();

    if (!data) {
        if (cached) {
            res.status(200).json({ elements: cached.data, cached: true, stale: true });
            return;
        }
        res.status(502).json({ message: 'No se pudieron obtener lugares cercanos (todos los servidores de Overpass fallaron).' });
        return;
    }

    if (nearbyPlacesCache.size >= NEARBY_PLACES_CACHE_MAX_ENTRIES) {
        const oldestKey = nearbyPlacesCache.keys().next().value;
        nearbyPlacesCache.delete(oldestKey);
    }
    nearbyPlacesCache.set(cacheKey, { data, at: Date.now() });
    res.status(200).json({ elements: data, cached: false });
};
