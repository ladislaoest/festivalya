
// --- CONFIGURACIÓN DE ELEMENTOS ---
const festivalConfig = {
    'main-stage': { label: 'ESCENARIO', color: '#27ae60', icon: 'stage', defaultLen: 22, defaultWid: 10 },
    'bar': { label: 'BARRA', color: '#f1c40f', icon: 'bar', defaultLen: 6, defaultWid: 2 },
    'food-truck': { label: 'FOOD TRUCK', color: '#e67e22', icon: 'food', defaultLen: 4, defaultWid: 2 },
    'generator': { label: 'GENERADOR', color: '#9b59b6', icon: 'custom', defaultLen: 4, defaultWid: 2 },
    'wc': { label: 'ASEOS', color: '#3498db', icon: 'wc', defaultLen: 1, defaultWid: 1 },
    'security': { label: 'SEGURIDAD', color: '#e74c3c', icon: 'security', defaultLen: 1, defaultWid: 1 },
    'drunk': { label: 'BREAD & WATHER', color: '#d9a441', icon: 'drunk', defaultLen: 1, defaultWid: 1 },
    'tiburon': { label: 'TIBURÓN', color: '#1f8a4c', icon: 'tiburon', defaultLen: 1, defaultWid: 1 },
    'fence': { label: 'VALLA DE OBRA', color: '#f39c12', icon: 'fence' },
    'panic-fence': { label: 'VALLA ANTIPÁNICO', color: '#95a5a6', icon: 'panic-fence' },
    'signal-parking': { label: 'PARKING', color: '#3498db', icon: 'parking', defaultLen: 4, defaultWid: 4 },
    'signal-disabled': { label: 'MINUSVÁLIDOS', color: '#3498db', icon: 'disabled', defaultLen: 4, defaultWid: 4 },
    'signal-no-parking': { label: 'PROHIBIDO APARCAR', color: '#e74c3c', icon: 'noparking', defaultLen: 4, defaultWid: 4 },
    'signal-exit': { label: 'SALIDA EMERGENCIA', color: '#27ae60', icon: 'exit', defaultLen: 4, defaultWid: 4 },
    'signal-no-entry': { label: 'PROHIBIDO EL PASO', color: '#e74c3c', icon: 'no-entry', defaultLen: 4, defaultWid: 4 },
    'signal-wc': { label: 'WC', color: '#3498db', icon: 'wc', defaultLen: 4, defaultWid: 4 },
    // Rótulo de carretera/acceso (tipo "CARRETERA N-550" en los planos de
    // orientación reales): solo texto en caja roja, sin icono de sticker;
    // se renombra desde "Editar nombre" para poner la vía que corresponda.
    'signal-road': { label: 'CARRETERA', color: '#e74c3c', icon: 'road-label', defaultLen: 8, defaultWid: 4 },
    // Flecha de dirección a una población cercana (tipo "REDONDELA"/"PORRIÑO"
    // en los planos reales): se orienta con la rotación del elemento y se
    // renombra desde "Editar nombre" para poner el destino.
    'signal-arrow': { label: 'DIRECCIÓN', color: '#e74c3c', icon: 'arrow-direction', defaultLen: 6, defaultWid: 6 },
    'entrance': { label: 'ENTRADA', color: '#f1c40f', icon: 'entrance', defaultLen: 6, defaultWid: 2 },
    // Edificio de referencia: NO es un elemento del festival, es una marca
    // manual para rellenar huecos del Mapa Ilustrado -un edificio real que
    // Overpass no tiene mapeado (p.ej. el pabellón de deportes sin nombre
    // en OSM), o directamente ponerle nombre a mano a uno que ya se ve pero
    // sin rótulo-. Mismo color teja que los edificios reales pintados en
    // el fondo (ver paintIllustratedBackdrop) para que no se note la
    // diferencia.
    'custom-building': { label: 'EDIFICIO', color: '#cbb28c', icon: 'building', defaultLen: 15, defaultWid: 10 },
    'zone-vip': { label: 'ZONA VIP', color: '#f1c40f', icon: 'star', defaultLen: 20, defaultWid: 20 },
    'zone-camping': { label: 'ZONA ACAMPADA', color: '#27ae60', icon: 'tent', defaultLen: 30, defaultWid: 30 },
    'zone-parking': { label: 'ZONA PARKING', color: '#3498db', icon: 'parking', defaultLen: 40, defaultWid: 40 }
};

let isDrawingLine = false, drawStartLatLng = null, tempPolyline = null, tempLabel = null;
let isMeasuring = false, measureStart = null, measureLine = null, measureLabel = null;

function toggleMeasureMode() {
    isMeasuring = !isMeasuring;
    const btn = document.getElementById('measure-btn');
    if (btn) btn.style.background = isMeasuring ? '#e74c3c' : '#3498db';
    
    if (isMeasuring) {
        map.getContainer().style.cursor = 'crosshair';
        map.dragging.disable();
        map.once('click', (e) => {
            measureStart = e.latlng;
            measureLine = L.polyline([measureStart, measureStart], { color: '#e74c3c', weight: 3, dashArray: '5, 5' }).addTo(map);
            map.on('mousemove', (em) => {
                measureLine.setLatLngs([measureStart, em.latlng]);
                const dist = map.distance(measureStart, em.latlng).toFixed(1);
                if (!measureLabel) measureLabel = L.marker(em.latlng, { icon: L.divIcon({ className: 'measure-label', html: `<div style="background:rgba(0,0,0,0.8); color:white; padding:4px 8px; border-radius:4px; white-space:nowrap;">${dist} m</div>` }) }).addTo(map);
                else { measureLabel.setLatLng(em.latlng); measureLabel.getElement().innerHTML = `<div style="background:rgba(0,0,0,0.8); color:white; padding:4px 8px; border-radius:4px; white-space:nowrap;">${dist} m</div>`; }
            });
            map.once('click', () => {
                setTimeout(() => {
                    if (measureLine) map.removeLayer(measureLine);
                    if (measureLabel) map.removeLayer(measureLabel);
                    measureLine = null; measureLabel = null; measureStart = null;
                    toggleMeasureMode();
                }, 2000);
            });
        });
    } else {
        map.getContainer().style.cursor = '';
        map.dragging.enable();
        map.off('mousemove');
    }
}
// Vallas de obra y antipánico comparten el mismo mecanismo de línea
// (dibujar en el mapa o medida fija): ver startFenceDrawing/addFixedFenceToMap.
function isFenceType(type) {
    return type === 'fence' || type === 'panic-fence';
}

let elements = [], selectedIcon = 'stage', editingElement = null;
let history = [];
const MAX_HISTORY = 20;

function saveHistory() {
    const state = JSON.stringify(elements.map(el => ({
        id: el.id, type: el.type, name: el.name,
        coords: el.moveMarker.getLatLng(),
        rotation: el.rotation,
        length: el.length, width: el.width, color: el.color,
        pathCoords: el.pathCoords || null
    })));

    if (history.length > 0 && history[history.length - 1] === state) return;

    history.push(state);
    if (history.length > MAX_HISTORY) history.shift();
}

function undo() {
    if (history.length <= 1) return;
    history.pop(); // Eliminar estado actual
    const lastState = JSON.parse(history[history.length - 1]);

    clearAllElements();
    lastState.forEach(el => {
        let element;
        if (isFenceType(el.type)) {
            element = addFixedFenceToMap(el.length, el.coords, el.rotation, el.type);
        } else {
            element = addRectangleToMap(el.name, el.type, el.coords, el.length, el.width, el.rotation, el.pathCoords);
        }
        element.id = el.id;
        element.name = el.name;
        elements.push(element);
        updateElementCard(element);
        bindMarkerEvents(element);
        updateElementShape(element, true);
    });
}

// Escuchar Ctrl+Z
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        undo();
    }
});

let isFestivalMode = false;
let isIllustratedMode = false;
let showLabels = true;
let showFencesIllustrated = true;

const moveHandleIcon = L.divIcon({
    className: 'move-handle',
    html: '<div style="width: 24px; height: 24px; background: white; border: 3px solid #00CEFF; border-radius: 50%; box-shadow: 0 0 8px rgba(0,0,0,0.5);"></div>',
    iconSize: [24, 24], iconAnchor: [12, 12]
});

const rotateHandleIcon = L.divIcon({
    className: 'rotate-handle',
    html: '<div style="width: 24px; height: 24px; background: #ff9f43; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 8px rgba(0,0,0,0.5);"></div>',
    iconSize: [24, 24], iconAnchor: [12, 12]
});

function toggleFestivalMode() {
    isFestivalMode = !isFestivalMode;
    const btn = document.getElementById('festival-mode-btn');
    if (btn) {
        btn.classList.toggle('active', isFestivalMode);
        btn.innerText = isFestivalMode ? 'SALIR MODO FESTIVAL' : 'MODO FESTIVAL';
    }

    elements.forEach(el => {
        if (isFestivalMode) {
            if (el.moveMarker) map.removeLayer(el.moveMarker);
            if (el.rotateMarker) map.removeLayer(el.rotateMarker);
            if (el.routeLine) map.removeLayer(el.routeLine);
        } else {
            if (el.moveMarker) el.moveMarker.addTo(map);
            if (el.rotateMarker) el.rotateMarker.addTo(map);
            if (el.routeLine) el.routeLine.addTo(map);
        }
    });
}

function toggleLabelsMode() {
    showLabels = !showLabels;
    const btn = document.getElementById('hide-labels-btn');
    if (btn) {
        btn.classList.toggle('active', !showLabels);
        btn.innerText = showLabels ? 'OCULTAR TEXTOS' : 'MOSTRAR TEXTOS';
    }

    elements.forEach(el => {
        // Aseguramos que el marcador de etiqueta siempre esté en el mapa
        if (el.labelMarker && !map.hasLayer(el.labelMarker)) {
            el.labelMarker.addTo(map);
        }
        updateElementShape(el, true);
    });
}

function toggleFencesIllustrated() {
    showFencesIllustrated = !showFencesIllustrated;
    const btn = document.getElementById('toggle-fences-btn');
    if (btn) {
        btn.classList.toggle('active', !showFencesIllustrated);
        btn.innerText = showFencesIllustrated ? 'OCULTAR VALLAS' : 'MOSTRAR VALLAS';
    }
    elements.forEach(el => updateElementShape(el, true));
}

function toggleIllustratedMode() {
    isIllustratedMode = !isIllustratedMode;
    const btn = document.getElementById('illustrated-map-btn');
    if (btn) {
        btn.classList.toggle('active', isIllustratedMode);
        btn.innerText = isIllustratedMode ? 'SALIR MODO ILUSTRADO' : 'MAPA ILUSTRADO';
    }

    const mapContainer = document.getElementById('map');
    if (isIllustratedMode) {
        mapContainer.classList.add('illustrated-style');
        // Fondo pintado (césped/agua/playa/carretera reales con la paleta de
        // un plano de festival dibujado a mano) en vez de la foto satélite
        // real -ver refreshIllustratedBackdrop-: se pidió explícitamente que
        // dejara de parecer una foto aérea con pines encima.
        //
        // "false" (no forzar recarga): si el recinto no se ha movido desde
        // la última vez, refreshIllustratedBackdrop ya sabe reutilizar el
        // terreno cacheado (ver illustratedTerrainQueryBounds.contains) en
        // vez de volver a golpear a Overpass -entrar y salir del Modo
        // Ilustrado repetidas veces no debe tardar ni variar cada vez, solo
        // la PRIMERA vez (o si de verdad se cambió de zona) hace falta red-.
        map.removeLayer(currentMapLayer);
        refreshIllustratedBackdrop(false);

        // Se puede mover (arrastrar) y rotar el mapa para orientar y encuadrar
        // el diseño; solo se desactiva el zoom y la edición de elementos.
        map.dragging.enable();
        map.touchZoom.disable();
        map.doubleClickZoom.disable();
        map.scrollWheelZoom.disable();
        map.boxZoom.disable();
        map.keyboard.disable();
        if (map.tap) map.tap.disable();
        if (map.rotate) map.rotate.enable();
        if (map.touchRotate) map.touchRotate.enable();

        // Ocultar controles visuales, salvo el de rotación
        if (map.zoomControl) map.zoomControl.remove();
        document.querySelectorAll('.leaflet-control').forEach(c => {
            if (!c.classList.contains('leaflet-control-rotate')) c.style.display = 'none';
        });

        // Nombres de lugares reales cercanos (campo de fútbol, colegio,
        // parque...), para dar contexto de dónde cae el recinto -no son
        // parte del diseño del festival, así que no usan fieldAssignments
        // ni se guardan con el proyecto, se piden a demanda.
        loadNearbyPlaceNames();

    } else {
        mapContainer.classList.remove('illustrated-style');
        if (illustratedBackdropLayer) { map.removeLayer(illustratedBackdropLayer); illustratedBackdropLayer = null; }
        currentMapLayer = mapLayers['esri-satellite'];
        currentMapLayer.addTo(map);
        if (nearbyPlacesLayer) map.removeLayer(nearbyPlacesLayer);
        if (illustratedContextLabelsLayer) map.removeLayer(illustratedContextLabelsLayer);
        setIllustratedFailedNotice(false);

        // Reactivar navegación total
        map.dragging.enable();
        map.touchZoom.enable();
        map.doubleClickZoom.enable();
        map.scrollWheelZoom.enable();
        map.boxZoom.enable();
        map.keyboard.enable();
        if (map.tap) map.tap.enable();
        if (map.rotate) map.rotate.enable();
        
        // Restaurar controles visuales
        if (!map.zoomControl) L.control.zoom({ position: 'topright' }).addTo(map);
        document.querySelectorAll('.leaflet-control').forEach(c => c.style.display = 'block');
    }

    elements.forEach(el => {
        // Los "Edificio (referencia)" representan un edificio real: su
        // posición/rotación tiene que ser la misma en todos los planos, así
        // que conservan sus asas de mover/girar de verdad también dentro
        // del Mapa Ilustrado -a diferencia del resto de elementos, que ahí
        // solo se pueden reajustar de forma cosmética (illustratedOffset)-.
        const isDirectlyEditableInIllustrated = isIllustratedMode && el.type === 'custom-building';
        const shouldShowControls = (!isIllustratedMode && !isFestivalMode) || (isDirectlyEditableInIllustrated && !isFestivalMode);

        // Al SALIR del Mapa Ilustrado, el icono vuelve a su posición real
        // -si no, un ajuste hecho allí para separar dos iconos pegados se
        // quedaba "colado" como desplazamiento del texto en el 2D técnico,
        // que es justo lo que no se quería-. Las vallas quedan fuera: esas
        // sí llevan de antes su propia etiqueta reposicionable a mano en
        // modo normal (ver labelCoords en save-load.js), independiente de
        // illustratedOffset.
        if (!isIllustratedMode && el.labelMarker && !el.isLine) {
            el.labelMarker.setLatLng(el.moveMarker.getLatLng());
        }

        // Las etiquetas de texto (modo normal) siguen sin ser arrastrables a
        // propósito. El icono/sticker del Mapa Ilustrado SÍ se puede
        // arrastrar -ver bindIllustratedDrag-, para poder separar iconos que
        // quedan pegados unos a otros sin tocar la posición real del
        // elemento (esa función solo actualiza illustratedOffset). Los
        // edificios quedan fuera -se mueven con su propia asa real, no
        // arrastrando el bloque entero, para no confundir los dos gestos-.
        if (el.labelMarker) {
            el.labelMarker.getElement().style.pointerEvents = 'auto';
            // Fuera del Mapa Ilustrado no se toca el estado de arrastre del
            // labelMarker -las vallas dependen de que se quede como estaba
            // (habilitado, ver el comentario de labelCoords más arriba)-.
            if (isIllustratedMode) {
                if (el.type === 'custom-building') el.labelMarker.dragging.disable();
                else el.labelMarker.dragging.enable();
            }
        }

        if (el.moveMarker) {
            if (shouldShowControls) {
                if (!map.hasLayer(el.moveMarker)) el.moveMarker.addTo(map);
                el.moveMarker.dragging.enable();
            } else {
                map.removeLayer(el.moveMarker);
            }
        }

        if (el.rotateMarker) {
            if (shouldShowControls) {
                if (!map.hasLayer(el.rotateMarker)) el.rotateMarker.addTo(map);
            } else {
                map.removeLayer(el.rotateMarker);
            }
        }

        // Línea del recorrido a pie (porteros con ronda dibujada, ver
        // startPatrolPathDrawing): es una guía de edición, no algo que
        // pintar en el Mapa Ilustrado -y ahí ese tipo ni siquiera se
        // muestra, ver updateElementShape-.
        if (el.routeLine) {
            if (isIllustratedMode || isFestivalMode) map.removeLayer(el.routeLine);
            else if (!map.hasLayer(el.routeLine)) el.routeLine.addTo(map);
        }

        if (el.isRectangle) {
            el.rectangle.setStyle({
                fillOpacity: isIllustratedMode ? 0 : 0.6,
                weight: isIllustratedMode ? 0 : 2,
                color: isIllustratedMode ? 'transparent' : el.color,
                interactive: !isIllustratedMode
            });
        } else if (el.isPolygon) {
            // Mismo criterio que el.rectangle: la forma real se oculta en
            // Modo Ilustrado, donde el bloque visible es el divIcon del
            // labelMarker (recortado con clip-path a esta misma forma, ver
            // updateElementShape), no este polígono de Leaflet.
            el.polygon.setStyle({
                fillOpacity: isIllustratedMode ? 0 : 0.6,
                weight: isIllustratedMode ? 0 : 2,
                color: isIllustratedMode ? 'transparent' : el.color,
                interactive: !isIllustratedMode
            });
        } else if (el.isLine) {
            // En Modo Ilustrado la valla ya no se pinta como fila de iconos
            // (ver updateElementShape): es la propia línea, como un simple
            // perímetro amarillo punteado -tipo plano de festival dibujado a
            // mano-, salvo que el toggle "OCULTAR VALLAS" la quite del todo.
            const hiddenByToggle = isIllustratedMode && !showFencesIllustrated;
            el.line.setStyle({
                weight: isIllustratedMode ? (hiddenByToggle ? 0 : (el.type === 'panic-fence' ? 3 : 4)) : 5,
                opacity: isIllustratedMode ? (hiddenByToggle ? 0 : 1) : 1,
                color: isIllustratedMode ? '#ffcc00' : el.color,
                dashArray: isIllustratedMode ? '2, 10' : null,
                interactive: !isIllustratedMode
            });
        }
        updateElementShape(el, true);
    });
}

// Lugares reales cercanos (campo de fútbol, colegio, parque, hospital...)
// para dar contexto de dónde cae el recinto en el Mapa Ilustrado -se pide
// siempre al proxy propio /api/nearby-places (nunca directo a Overpass
// desde el navegador, ver el comentario grande en fetchIllustratedTerrain
// sobre por qué se abandonó ese intento directo).
let nearbyPlacesLayer = null;
let nearbyPlacesFetchKey = null;

// Nombres reales (calles, plazas, edificios, colegios...) ocultados uno a
// uno a mano -a diferencia de showRealContextLabels (todo o nada), esto
// deja quitar SOLO el que molesta y dejar el resto-. Se guarda con el
// proyecto (ver getProjectData/loadProject en save-load.js).
let hiddenContextNames = new Set();

// Un único pin de nombre real (calle, edificio, plaza, colegio...):
// clicable para ocultar solo ese, con confirmación -es fácil dar sin
// querer a un pin pequeño mientras se mira el mapa, y no hay forma de
// deshacer un solo nombre suelto (solo "RESTABLECER" los devuelve todos)-.
function addContextNamePill(layer, latlng, name) {
    if (!name || hiddenContextNames.has(name)) return;
    const marker = L.marker(latlng, {
        icon: L.divIcon({
            className: 'nearby-place-label',
            html: `<div class="nearby-place-pill" title="Clic para ocultar «${escapeHtmlText(name)}»">${escapeHtmlText(name)}</div>`,
            iconSize: [1, 1]
        }),
        interactive: true
    });
    marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (!confirm(`¿Ocultar el nombre «${name}»? Puedes recuperarlo con "RESTABLECER NOMBRES OCULTOS".`)) return;
        hiddenContextNames.add(name);
        refreshContextNameLayers();
    });
    layer.addLayer(marker);
}

// Reconstruye las dos capas de nombres reales respetando hiddenContextNames
// -se llama tras ocultar/restablecer uno, sin tener que volver a pedir
// nada a Overpass (los datos ya están en illustratedTerrainData/la última
// respuesta de nearby-places, solo cambia qué pines se dibujan)-.
function refreshContextNameLayers() {
    if (illustratedContextLabelsLayer) map.removeLayer(illustratedContextLabelsLayer);
    if (illustratedTerrainData) {
        illustratedContextLabelsLayer = buildIllustratedContextLabels(illustratedTerrainData);
        if (showRealContextLabels) illustratedContextLabelsLayer.addTo(map);
    }
    if (nearbyPlacesLayer && lastNearbyPlacesElements) {
        buildNearbyPlacesLayer(lastNearbyPlacesElements);
    }
}

function resetHiddenContextNames() {
    hiddenContextNames.clear();
    refreshContextNameLayers();
}

function nearbyPlacesBboxKey(bbox) {
    const r = n => Math.round(n * 1000) / 1000; // ~110m, de sobra para no repetir la consulta al mover un pelín el mapa
    return `${r(bbox.minLat)},${r(bbox.minLng)},${r(bbox.maxLat)},${r(bbox.maxLng)}`;
}

// Construye (o reconstruye, tras ocultar/restablecer un nombre a mano) la
// capa de lugares cercanos con nombre a partir de los elementos ya
// obtenidos de Overpass -sin volver a pedir red-.
let lastNearbyPlacesElements = null;
function buildNearbyPlacesLayer(rawElements) {
    lastNearbyPlacesElements = rawElements;
    if (nearbyPlacesLayer) map.removeLayer(nearbyPlacesLayer);
    nearbyPlacesLayer = L.layerGroup();
    const seenNames = new Set();
    let count = 0;
    for (const el of rawElements) {
        if (count >= 25) break; // tope para no saturar el mapa de texto
        const name = el.tags && el.tags.name;
        if (!name || seenNames.has(name)) continue;
        const lat = el.lat !== undefined ? el.lat : (el.center && el.center.lat);
        const lon = el.lon !== undefined ? el.lon : (el.center && el.center.lon);
        if (!isFinite(lat) || !isFinite(lon)) continue;
        seenNames.add(name);
        count++;
        addContextNamePill(nearbyPlacesLayer, [lat, lon], name);
    }
    if (isIllustratedMode && showRealContextLabels) nearbyPlacesLayer.addTo(map);
}

async function loadNearbyPlaceNames() {
    if (!map) return;
    const b = map.getBounds();
    // Margen extra sobre el encuadre actual: "cercano" incluye algo más allá
    // de lo que se ve justo al activar el modo (sobre todo si se hizo zoom
    // para diseñar el recinto), sin disparar el área a lo bestia.
    const latPad = (b.getNorth() - b.getSouth()) * 0.6;
    const lngPad = (b.getEast() - b.getWest()) * 0.6;
    const bbox = {
        minLat: b.getSouth() - latPad, maxLat: b.getNorth() + latPad,
        minLng: b.getWest() - lngPad, maxLng: b.getEast() + lngPad
    };
    const key = nearbyPlacesBboxKey(bbox);
    if (nearbyPlacesFetchKey === key) {
        // Ya se pidió para esta misma zona: solo falta volver a mostrarla.
        if (nearbyPlacesLayer && isIllustratedMode && showRealContextLabels) nearbyPlacesLayer.addTo(map);
        return;
    }

    let elements = null;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        const res = await fetch('/api/nearby-places', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bbox }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) {
            const json = await res.json();
            if (Array.isArray(json.elements)) elements = json.elements;
        }
    } catch (err) {
        console.warn('[Mapa Ilustrado] No se pudieron obtener lugares cercanos reales, se omiten.', err);
    }
    if (!elements) return;

    buildNearbyPlacesLayer(elements);
    nearbyPlacesFetchKey = key;
}

// --- Fondo pintado del Mapa Ilustrado ---
// En vez de la foto satélite real, el Modo Ilustrado pinta una única "lámina"
// (canvas) con césped/agua/playa/carretera con la paleta de un plano de
// festival dibujado a mano, y la coloca con L.imageOverlay -ver
// refreshIllustratedBackdrop, enganchado en toggleIllustratedMode-. El
// terreno real cercano (agua, playa, bosque, carreteras) se pide siempre al
// proxy propio /api/illustrated-terrain (que construye la query con
// geometría real, `out geom;`, porque aquí hace falta el contorno para
// poder rellenarlo/trazarlo, no solo un punto central).
let illustratedBackdropLayer = null;
let illustratedBackdropBounds = null;
let illustratedTerrainData = null;
let illustratedTerrainQueryBounds = null; // bounds ya cubiertos por illustratedTerrainData

async function fetchIllustratedTerrain(bbox) {
    // Antes se probaba Overpass DIRECTO desde el navegador primero, pensando
    // que la IP real de quien usa la app tendría mejor trato que la de
    // Vercel. Comprobado en vivo repetidas veces en producción
    // (festivalya.vercel.app): ese intento directo se bloquea SIEMPRE por
    // CORS (el espejo no manda Access-Control-Allow-Origin), sin excepción,
    // llenando la consola de errores alarmantes y retrasando ~20s la carga
    // real antes de caer al proxy de todos modos. Se va directo al proxy
    // propio (/api/illustrated-terrain, que ya cachea por bbox y prueba los
    // 4 espejos en paralelo desde el servidor) para no volver a repetir
    // ese barrido inútil.
    let rawElements = null;
    try {
        const controller = new AbortController();
        // 30s, no 15: el propio proxy (api/illustrated-terrain.js) ya
        // espera hasta 25s a los espejos, así que el cliente tiene que dar
        // margen de sobra para no cortarle la respuesta justo antes de que
        // llegue.
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        const res = await fetch('/api/illustrated-terrain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bbox }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) {
            const json = await res.json();
            if (Array.isArray(json.elements)) rawElements = json.elements;
        }
    } catch (err) {
        console.warn('[Mapa Ilustrado] No se pudo obtener el terreno real, se pinta solo césped.', err);
    }

    const empty = { water: [], rivers: [], beaches: [], forests: [], roads: [], buildings: [] };
    // "ok: false" distingue un FALLO real (los 4 espejos y el proxy caídos)
    // de una zona que de verdad no tiene nada que dibujar -si no, ver
    // refreshIllustratedBackdrop, un fallo puntual se quedaba cacheado para
    // siempre como "aquí no hay nada", y ni reentrando en el Modo Ilustrado
    // se volvía a intentar-.
    if (!rawElements) { empty.ok = false; return empty; }
    empty.ok = true;

    // El bosque es lo único que pinta una textura de manchas por celda (ver
    // paintCellTexture): con un padding amplio y una zona muy boscosa, sin
    // tope el número de polígonos podía disparar el tiempo de pintado
    // (varios segundos bloqueando la pestaña). El resto (agua/playa/
    // carretera) es solo relleno/trazo, barato aunque haya muchos.
    const ILLUSTRATED_TERRAIN_MAX_FORESTS = 15;
    // Los edificios son solo relleno de polígono (barato), pero en un centro
    // urbano denso puede haber cientos en un bbox con el padding amplio del
    // fondo -mismo tope que MAP_FEATURES_MAX_BUILDINGS en view3d.js, para no
    // mandar un mensaje descomunal al canvas ni al propio Overpass.
    const ILLUSTRATED_TERRAIN_MAX_BUILDINGS = 150;

    for (const el of rawElements) {
        if (el.type !== 'way' || !el.tags || !Array.isArray(el.geometry) || el.geometry.length < 2) continue;
        const points = el.geometry.filter(p => isFinite(p.lat) && isFinite(p.lon));
        if (points.length < 2) continue;
        const name = el.tags.name || null;
        if (el.tags.natural === 'water') empty.water.push({ points, name });
        else if (el.tags.waterway) empty.rivers.push({ points, name });
        else if (el.tags.natural === 'beach') empty.beaches.push({ points, name });
        else if (el.tags.natural === 'wood' || el.tags.landuse === 'forest' || el.tags.landuse === 'wood') {
            if (empty.forests.length < ILLUSTRATED_TERRAIN_MAX_FORESTS) empty.forests.push({ points, name });
        }
        else if (el.tags.building || el.tags.leisure === 'sports_centre' || el.tags.amenity === 'sports_centre') {
            if (empty.buildings.length < ILLUSTRATED_TERRAIN_MAX_BUILDINGS) empty.buildings.push({ points, name });
        }
        else if (el.tags.highway) empty.roads.push({ points, name });
    }
    return empty;
}

// Hash entero determinista (mismo patrón que un PRNG tipo mulberry32,
// sembrado con la celda cx,cy): la MISMA celda de mundo siempre da la misma
// mancha de textura, así el césped no "baraja" sus manchas cada vez que se
// regenera el fondo al arrastrar el mapa -se ve como una superficie pintada
// estable, no ruido nuevo en cada repintado-.
function hashCell(cx, cy) {
    let h = Math.imul(cx, 374761393) + Math.imul(cy, 668265263);
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296; // [0, 1)
}

// Rejilla de manchas ancladas a coordenadas de MUNDO (no de canvas): sirve
// tanto para la textura de césped como, recortada con un clip de polígono,
// para el bosque o el stipple de la playa.
function paintCellTexture(ctx, bounds, project, colors, opts) {
    const { cellMeters, probability, minRadius, maxRadius, alpha } = opts;
    const centerLat = (bounds.getNorth() + bounds.getSouth()) / 2;
    const latScale = Math.max(0.15, Math.cos(centerLat * Math.PI / 180));
    let cellDegLat = cellMeters / 111320;
    let cellDegLng = cellMeters / (111320 * latScale);

    let cols = Math.ceil((bounds.getEast() - bounds.getWest()) / cellDegLng);
    let rows = Math.ceil((bounds.getNorth() - bounds.getSouth()) / cellDegLat);
    // Tope prudente: con el Modo Ilustrado activado en un zoom muy alejado
    // (antes de encuadrar el recinto), unos bounds enormes no deben poder
    // bloquear la pestaña varios segundos pintando manchas de textura.
    const MAX_CELLS = 90000;
    if (cols * rows > MAX_CELLS) {
        const scale = Math.sqrt((cols * rows) / MAX_CELLS);
        cellDegLat *= scale; cellDegLng *= scale;
    }

    const cxMin = Math.floor(bounds.getWest() / cellDegLng) - 1;
    const cxMax = Math.ceil(bounds.getEast() / cellDegLng) + 1;
    const cyMin = Math.floor(bounds.getSouth() / cellDegLat) - 1;
    const cyMax = Math.ceil(bounds.getNorth() / cellDegLat) + 1;

    ctx.save();
    if (alpha != null) ctx.globalAlpha = alpha;
    for (let cx = cxMin; cx <= cxMax; cx++) {
        for (let cy = cyMin; cy <= cyMax; cy++) {
            if (hashCell(cx, cy) > probability) continue;
            const jLng = (hashCell(cx * 92821 + 1, cy * 12841 + 3) - 0.5) * cellDegLng;
            const jLat = (hashCell(cx * 31337 + 5, cy * 74923 + 9) - 0.5) * cellDegLat;
            const lng = (cx + 0.5) * cellDegLng + jLng;
            const lat = (cy + 0.5) * cellDegLat + jLat;
            const [px, py] = project(lat, lng);
            const radius = minRadius + hashCell(cx * 5 + 11, cy * 7 + 13) * (maxRadius - minRadius);
            const color = colors[Math.floor(hashCell(cx * 3 + 17, cy * 9 + 19) * colors.length)];
            ctx.fillStyle = color;
            ctx.beginPath();
            const squash = 0.6 + hashCell(cx * 41, cy * 43) * 0.5;
            ctx.ellipse(px, py, radius, radius * squash, hashCell(cx * 53, cy * 59) * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

function projectPoints(points, project) {
    return points.map(p => project(p.lat, p.lon));
}

function fillProjectedPolygon(ctx, pts, color) {
    if (pts.length < 3) return;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function tracePolygonPath(ctx, pts) {
    ctx.beginPath();
    pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
    ctx.closePath();
}

function clipToProjectedPolygon(ctx, pts) {
    ctx.beginPath();
    pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
    ctx.closePath();
    ctx.clip();
}

function strokeProjectedLine(ctx, pts, style) {
    if (pts.length < 2) return;
    ctx.save();
    ctx.beginPath();
    pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (style.lineDash) ctx.setLineDash(style.lineDash);
    if (style.strokeStyle) ctx.strokeStyle = style.strokeStyle;
    if (style.lineWidth) ctx.lineWidth = style.lineWidth;
    ctx.stroke();
    ctx.restore();
}

// Un par de líneas onduladas claras encima del relleno de agua: da el
// efecto "agua pintada a mano" en vez de una mancha azul lisa.
function paintWaterRipples(ctx, pts, canvasW, canvasH) {
    if (pts.length < 3) return;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const minX = Math.max(0, Math.min(...xs)), maxX = Math.min(canvasW, Math.max(...xs));
    const minY = Math.max(0, Math.min(...ys)), maxY = Math.min(canvasH, Math.max(...ys));
    if (maxX - minX < 4 || maxY - minY < 4) return;
    const rowGap = Math.max(14, (maxY - minY) / 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = Math.max(1.2, rowGap * 0.08);
    for (let y = minY + rowGap * 0.5; y < maxY; y += rowGap) {
        ctx.beginPath();
        const amp = rowGap * 0.28;
        const step = Math.max(10, (maxX - minX) / 20);
        for (let x = minX; x <= maxX; x += step) {
            const yy = y + Math.sin((x - minX) / (step * 2)) * amp;
            if (x === minX) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
    }
}

// Pinta el canvas de fondo completo para unos bounds dados y devuelve su
// data URL. La proyección lat/lng -> píxel es una interpolación LINEAL
// simple respecto a esos mismos bounds -es exactamente la misma
// interpolación que usa L.imageOverlay para estirar la imagen entre las
// esquinas de esos bounds, así que no hay ningún desajuste entre lo pintado
// aquí y dónde acaba cayendo sobre el mapa real-.
//
// Resolución del canvas: NO es un tamaño fijo en píxeles. Los bounds que se
// pintan son los del contenedor del mapa ampliados con ILLUSTRATED_PAD_RATIO
// (ver refreshIllustratedBackdrop), así que para que se vea nítido -y no
// entintado/emborronado por Leaflet al estirar la imagen para rellenar esos
// mismos bounds sobre la pantalla- el canvas tiene que pintarse a, como
// mínimo, "tamaño del contenedor en pantalla × ese mismo factor de margen".
// Con un tamaño fijo (p.ej. 1600px) a un zoom alto y un contenedor grande,
// el navegador tenía que ampliar la imagen bastante más de lo que su propia
// resolución permitía, y todo lo dibujado -texto de rótulos, líneas de
// carretera...- salía visiblemente más grande y borroso de lo pintado.
function paintIllustratedBackdrop(bounds, terrain, viewportPx) {
    const west = bounds.getWest(), east = bounds.getEast();
    const north = bounds.getNorth(), south = bounds.getSouth();
    const lngSpan = Math.max(east - west, 1e-9), latSpan = Math.max(north - south, 1e-9);
    const aspect = lngSpan / latSpan;

    const padMultiplier = 1 + 2 * ILLUSTRATED_PAD_RATIO;
    const vpW = (viewportPx && viewportPx.x) || 1200;
    const vpH = (viewportPx && viewportPx.y) || 900;
    // Lado mayor a resolución nativa (contenedor × margen), con un tope por
    // memoria/rendimiento y un suelo para que un contenedor diminuto no deje
    // el fondo pixelado.
    const MAX_SIDE = Math.max(900, Math.min(3200, Math.round(Math.max(vpW, vpH) * padMultiplier)));
    const canvasW = aspect >= 1 ? MAX_SIDE : Math.max(500, Math.round(MAX_SIDE * aspect));
    const canvasH = aspect >= 1 ? Math.max(500, Math.round(MAX_SIDE / aspect)) : MAX_SIDE;

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    const project = (lat, lng) => [((lng - west) / lngSpan) * canvasW, ((north - lat) / latSpan) * canvasH];

    // 1. Césped base + textura de manchas
    ctx.fillStyle = '#7fb055';
    ctx.fillRect(0, 0, canvasW, canvasH);
    paintCellTexture(ctx, bounds, project, ['#5f9440', '#6aa348', '#548436'], { cellMeters: 13, probability: 0.4, minRadius: 7, maxRadius: 16, alpha: 0.55 });

    // 2. Bosque (recortado a su polígono real). Tope de defensa adicional
    // aquí mismo (ya se limita también al pedir el terreno, ver
    // fetchIllustratedTerrain): cada polígono repite el barrido de celdas
    // completo, así que es lo único de esta función que puede volverse caro.
    (terrain.forests || []).slice(0, 15).forEach(f => {
        const pts = projectPoints(f.points, project);
        if (pts.length < 3) return;
        ctx.save();
        clipToProjectedPolygon(ctx, pts);
        ctx.fillStyle = '#4f7f38';
        ctx.fillRect(0, 0, canvasW, canvasH);
        paintCellTexture(ctx, bounds, project, ['#365c26', '#3f6b2c', '#2f5220'], { cellMeters: 8, probability: 0.8, minRadius: 6, maxRadius: 13, alpha: 0.7 });
        ctx.restore();
    });

    // 3. Playa / arena
    (terrain.beaches || []).forEach(b => {
        fillProjectedPolygon(ctx, projectPoints(b.points, project), '#e3c988');
    });

    // 4. Agua (lagos/mar como relleno, ríos/arroyos como cinta)
    (terrain.water || []).forEach(w => {
        const pts = projectPoints(w.points, project);
        fillProjectedPolygon(ctx, pts, '#5fa8d3');
        ctx.save();
        clipToProjectedPolygon(ctx, pts);
        paintWaterRipples(ctx, pts, canvasW, canvasH);
        ctx.restore();
    });
    (terrain.rivers || []).forEach(r => {
        const pts = projectPoints(r.points, project);
        const widthPx = Math.max(6, Math.min(canvasW, canvasH) * 0.012);
        strokeProjectedLine(ctx, pts, { strokeStyle: '#5fa8d3', lineWidth: widthPx });
        strokeProjectedLine(ctx, pts, { strokeStyle: '#8cc8e6', lineWidth: Math.max(2, widthPx * 0.35), lineDash: [widthPx * 1.2, widthPx * 1.6] });
    });

    // 5. Carreteras: cinta gris + línea central discontinua blanca. Los
    // nombres de calle NO se pintan aquí -salen como etiquetas aparte (ver
    // buildIllustratedContextLabels), independientes y que se pueden ocultar
    // con el botón "OCULTAR NOMBRES REALES" sin tener que repintar todo el
    // fondo-.
    (terrain.roads || []).forEach(rd => {
        const pts = projectPoints(rd.points, project);
        const widthPx = Math.max(7, Math.min(canvasW, canvasH) * 0.016);
        strokeProjectedLine(ctx, pts, { strokeStyle: '#8a8a8c', lineWidth: widthPx });
        strokeProjectedLine(ctx, pts, { strokeStyle: '#f5f3ea', lineWidth: Math.max(1.5, widthPx * 0.12), lineDash: [widthPx * 0.6, widthPx * 0.9] });
    });

    // 6. Edificios reales cercanos (dan contexto real de dónde cae el
    // recinto -un colegio, el pabellón de deportes, la iglesia...-, igual
    // que ya se hace en la vista 3D con applyMapFeatures): bloque plano gris
    // neutro por encima de la carretera. El nombre, igual que el de las
    // calles, sale como etiqueta aparte -ver buildIllustratedContextLabels-.
    // OJO: este color tiene que ser claramente distinto del que usa el
    // elemento interactivo "EDIFICIO (referencia)" (festivalConfig
    // ['custom-building'].color = '#cbb28c', ver startCustomBuildingDrawing/
    // addPolygonBuildingToMap) -antes ambos usaban el mismo tono teja, y al
    // trazar a mano un edificio que también existe en OSM el usuario veía su
    // propio trazo justo encima del edificio real ya pintado en el fondo,
    // ligeramente desalineado por ser un trazo manual: parecía "un edificio
    // duplicado, uno más claro y otro más oscuro atravesado" cuando en
    // realidad eran dos capas distintas (su dibujo + el fondo) coincidiendo
    // casi en el mismo sitio-.
    (terrain.buildings || []).forEach(b => {
        const pts = projectPoints(b.points, project);
        if (pts.length < 3) return;
        fillProjectedPolygon(ctx, pts, '#a8a297');
        ctx.save();
        ctx.strokeStyle = '#726c60';
        ctx.lineWidth = 1.4;
        tracePolygonPath(ctx, pts);
        ctx.stroke();
        ctx.restore();
    });

    return canvas.toDataURL('image/png');
}

// Margen de la lámina pintada respecto al encuadre actual (ver
// refreshIllustratedBackdrop): tiene que coincidir con el multiplicador de
// resolución usado en paintIllustratedBackdrop, si no el canvas se pinta a
// una densidad que no es la que Leaflet necesita para verse nítido.
const ILLUSTRATED_PAD_RATIO = 0.8;

// Aviso de "cargando" mientras se espera a Overpass (puede tardar varios
// segundos, sobre todo la primera vez): sin esto, mientras carga solo se ve
// césped liso y parece que el fondo pintado ha fallado del todo.
let illustratedLoadingEl = null;
function setIllustratedLoading(show) {
    const mapEl = document.getElementById('map');
    if (show) {
        setIllustratedFailedNotice(false); // un intento nuevo reemplaza cualquier aviso de fallo anterior
        if (illustratedLoadingEl || !mapEl) return;
        illustratedLoadingEl = document.createElement('div');
        illustratedLoadingEl.className = 'illustrated-loading-badge';
        illustratedLoadingEl.textContent = 'Dibujando el mapa ilustrado…';
        mapEl.appendChild(illustratedLoadingEl);
    } else if (illustratedLoadingEl) {
        illustratedLoadingEl.remove();
        illustratedLoadingEl = null;
    }
}

// Aviso -a diferencia del de "cargando", este NO desaparece solo- para
// cuando Overpass falla del todo (los 4 espejos públicos y el proxy
// propio): antes esto se resolvía en silencio con solo césped, sin
// explicación, y la única forma de arreglarlo era salir y volver a entrar
// en el Modo Ilustrado sin saber muy bien por qué. Ahora queda avisado y
// con un botón para reintentar sin tener que salir del modo.
let illustratedFailedEl = null;
function setIllustratedFailedNotice(show) {
    const mapEl = document.getElementById('map');
    if (show) {
        if (illustratedFailedEl || !mapEl) return;
        illustratedFailedEl = document.createElement('div');
        illustratedFailedEl.className = 'illustrated-failed-badge';
        illustratedFailedEl.innerHTML = 'No se pudieron cargar calles/edificios reales ahora mismo (solo césped) <button type="button">Reintentar</button>';
        illustratedFailedEl.querySelector('button').onclick = () => refreshIllustratedBackdrop(true);
        mapEl.appendChild(illustratedFailedEl);
    } else if (illustratedFailedEl) {
        illustratedFailedEl.remove();
        illustratedFailedEl = null;
    }
}

// Nombres reales (calles, el pabellón de deportes, la iglesia...) como
// etiquetas aparte -no pintadas dentro del canvas, ver paintIllustratedBackdrop-
// para que se puedan mostrar VARIAS a la vez (no solo una carretera "la más
// larga") y ocultar de golpe sin tener que repintar todo el fondo -ver
// toggleRealContextLabels-. Mismo estilo de píldora que ya se usa para los
// lugares cercanos con nombre (nearby-place-pill).
let illustratedContextLabelsLayer = null;
let showRealContextLabels = true;

function buildIllustratedContextLabels(terrain) {
    const layer = L.layerGroup();
    const seenNames = new Set();

    const addPill = (latlng, name) => {
        if (!name || seenNames.has(name)) return;
        seenNames.add(name);
        addContextNamePill(layer, latlng, name);
    };

    (terrain.roads || []).forEach(rd => {
        if (!rd.name || rd.points.length < 1) return;
        const mid = rd.points[Math.floor(rd.points.length / 2)];
        addPill([mid.lat, mid.lon], rd.name);
    });
    (terrain.buildings || []).forEach(b => {
        if (!b.name || b.points.length < 3) return;
        const cLat = b.points.reduce((s, p) => s + p.lat, 0) / b.points.length;
        const cLon = b.points.reduce((s, p) => s + p.lon, 0) / b.points.length;
        addPill([cLat, cLon], b.name);
    });

    return layer;
}

// Genera (o reutiliza el terreno ya cacheado si el área nueva sigue cubierta)
// el fondo pintado para la vista actual y lo coloca sobre el mapa. Se llama
// al activar el Modo Ilustrado y, con margen de seguridad, al arrastrar el
// mapa dentro de él -ver el listener 'moveend' en map.js-.
let illustratedBackdropRequestId = 0;
async function refreshIllustratedBackdrop(forceRefetch) {
    if (!map) return;
    // Si se dispara otra llamada (p.ej. un nuevo arrastre) mientras esta
    // sigue esperando a Overpass, la respuesta más vieja no debe pisar el
    // fondo ya actualizado por la más nueva -mismo patrón que
    // myTerrainRequestId en view3d.js-.
    const myRequestId = ++illustratedBackdropRequestId;
    const bounds = map.getBounds().pad(ILLUSTRATED_PAD_RATIO);
    const viewportPx = map.getSize();

    const coveredByLastFetch = !forceRefetch && illustratedTerrainData && illustratedTerrainQueryBounds && illustratedTerrainQueryBounds.contains(bounds);
    if (!coveredByLastFetch) {
        setIllustratedLoading(true);
        try {
            const fetched = await fetchIllustratedTerrain({
                minLat: bounds.getSouth(), maxLat: bounds.getNorth(),
                minLng: bounds.getWest(), maxLng: bounds.getEast()
            });
            illustratedTerrainData = fetched;
            // Solo se marca como "cubierto" (y por tanto reutilizable la
            // próxima vez que se reentra en el Modo Ilustrado) si Overpass
            // respondió de verdad -si falló (fetched.ok === false), NO se
            // guarda el bbox: si no, un fallo puntual de red se quedaba
            // cacheado para siempre como "aquí no hay nada que dibujar", y
            // ni saliendo y volviendo a entrar se reintentaba-.
            if (fetched.ok !== false) illustratedTerrainQueryBounds = bounds;
        } finally {
            if (myRequestId === illustratedBackdropRequestId) setIllustratedLoading(false);
        }
    }

    if (!isIllustratedMode || myRequestId !== illustratedBackdropRequestId) return;

    // Si el intento de ahora falló (o si se está reutilizando un intento
    // previo que había fallado, ver más abajo), avisar de forma visible en
    // vez de dejar solo el césped sin explicación -ver setIllustratedFailedNotice-.
    setIllustratedFailedNotice(illustratedTerrainData && illustratedTerrainData.ok === false);

    const dataUrl = paintIllustratedBackdrop(bounds, illustratedTerrainData, viewportPx);
    if (illustratedBackdropLayer) map.removeLayer(illustratedBackdropLayer);
    illustratedBackdropLayer = L.imageOverlay(dataUrl, bounds, { interactive: false }).addTo(map);
    illustratedBackdropBounds = bounds;

    if (illustratedContextLabelsLayer) map.removeLayer(illustratedContextLabelsLayer);
    illustratedContextLabelsLayer = buildIllustratedContextLabels(illustratedTerrainData);
    if (showRealContextLabels) illustratedContextLabelsLayer.addTo(map);
}

function toggleRealContextLabels() {
    showRealContextLabels = !showRealContextLabels;
    const btn = document.getElementById('toggle-real-labels-btn');
    if (btn) {
        btn.classList.toggle('active', !showRealContextLabels);
        btn.innerText = showRealContextLabels ? 'OCULTAR NOMBRES REALES' : 'MOSTRAR NOMBRES REALES';
    }
    // Cubre las dos fuentes de nombres reales: calles/edificios (ver
    // buildIllustratedContextLabels) y los lugares con nombre de
    // loadNearbyPlaceNames (colegios, plazas, iglesias...) -antes solo
    // tapaba la primera, así que una plaza podía seguir apareciendo aunque
    // se pulsara "OCULTAR NOMBRES REALES"-.
    if (illustratedContextLabelsLayer) {
        if (showRealContextLabels) illustratedContextLabelsLayer.addTo(map);
        else map.removeLayer(illustratedContextLabelsLayer);
    }
    if (nearbyPlacesLayer) {
        if (showRealContextLabels) nearbyPlacesLayer.addTo(map);
        else map.removeLayer(nearbyPlacesLayer);
    }
}

function escapeHtmlText(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Desplazamiento "solo visual" del icono en el Mapa Ilustrado (ver
// element.illustratedOffset, en metros, NO rotado con el elemento -al
// contrario que getRotatedLatLng dentro de updateElementShape-: es un ajuste
// de composición del plano, no algo que deba girar si el usuario rota la
// valla o el escenario). No toca moveMarker/rectangle/line -la posición
// real que usan el 2D técnico, el 3D y las medidas (vallas, distancias...)
// no se entera de este ajuste-, así que separar/juntar iconos en el Mapa
// Ilustrado para que no se amontonen no puede "mover" el elemento de verdad.
function offsetLatLngMeters(center, offset) {
    if (!offset || (!offset.dx && !offset.dy)) return center;
    const latScale = Math.cos(center.lat * Math.PI / 180);
    return L.latLng(center.lat + offset.dy / 111320, center.lng + offset.dx / (111320 * latScale));
}

function meterOffsetBetween(center, pos) {
    const latScale = Math.cos(center.lat * Math.PI / 180);
    return { dx: (pos.lng - center.lng) * 111320 * latScale, dy: (pos.lat - center.lat) * 111320 };
}

// Arrastrar el propio icono en el Mapa Ilustrado: solo activo con
// isIllustratedMode (ver toggleIllustratedMode, que habilita/deshabilita
// labelMarker.dragging igual que ya hace con moveMarker/rotateMarker fuera
// de él), y solo actualiza element.illustratedOffset -nunca moveMarker- así
// que la posición real (2D técnico, 3D, medidas) no se entera de este ajuste.
function bindIllustratedDrag(element) {
    element.labelMarker.on('drag', () => {
        // Los "Edificio (referencia)" no usan este ajuste solo-visual: se
        // mueven/giran de verdad (ver shouldShowControls en
        // toggleIllustratedMode, que les deja el asa de mover/girar real
        // también dentro del Mapa Ilustrado) porque representan un edificio
        // real y su posición/orientación tiene que ser la misma en todos
        // los planos, no solo un ajuste de composición.
        if (!isIllustratedMode || element.type === 'custom-building') return;
        const center = element.moveMarker.getLatLng();
        element.illustratedOffset = meterOffsetBetween(center, element.labelMarker.getLatLng());
    });
    element.labelMarker.on('dragend', () => {
        if (!isIllustratedMode || element.type === 'custom-building') return;
        saveHistory();
    });
}

function updateElementShape(element, updateLabel = false, onlyLabel = false) {
	const center = element.moveMarker.getLatLng();
    const length = element.length, width = element.width || 0, rotation = element.rotation || 0;
    const rad = (-rotation * Math.PI) / 180;
    const latScale = Math.cos(center.lat * Math.PI / 180);

    // Función auxiliar para rotar y proyectar puntos de forma precisa (en metros -> grados)
    const getRotatedLatLng = (offsetMetersX, offsetMetersY) => {
        // Rotación en metros
        const rotX = offsetMetersX * Math.cos(rad) - offsetMetersY * Math.sin(rad);
        const rotY = offsetMetersX * Math.sin(rad) + offsetMetersY * Math.cos(rad);
        
        // Conversión a grados
        const dLat = rotY / 111320;
        const dLng = rotX / (111320 * latScale);
        
        return [center.lat + dLat, center.lng + dLng];
    };

    if (!onlyLabel) {
        if (element.isRectangle) {
            const hasBadgeIcon = isIllustratedMode || element.type === 'security';
            element.rectangle.setStyle({
                fillOpacity: hasBadgeIcon ? 0 : 0.6,
                weight: hasBadgeIcon ? (isFestivalMode ? 0 : 1) : 2,
                color: hasBadgeIcon ? 'transparent' : element.color
            });
            
            const halfL = length / 2;
            const halfW = width / 2;
            
            const rotatedPoints = [
                getRotatedLatLng(halfL, halfW),
                getRotatedLatLng(-halfL, halfW),
                getRotatedLatLng(-halfL, -halfW),
                getRotatedLatLng(halfL, -halfW)
            ];
            element.rectangle.setLatLngs(rotatedPoints);
        } else if (element.isLine) {
            const halfL = length / 2;
            element.line.setLatLngs([
                getRotatedLatLng(-halfL, 0),
                getRotatedLatLng(halfL, 0)
            ]);
            element.numVallas = Math.ceil(length / 2);
        }

        if (element.rotateMarker) {
            const offsetMeters = (element.isRectangle ? width / 2 : 0) + 4;
            element.rotateMarker.setLatLng(getRotatedLatLng(0, offsetMeters));
        }
    }

	if (updateLabel) {
		const config = festivalConfig[element.type] || { label: 'ELEMENTO', icon: 'default' };
        const distText = element.isLine ? `${element.length.toFixed(1)}m` : `${element.length}x${element.width}m`;
        const sectionsText = element.isLine ? `<br>${element.numVallas} vallas` : '';
		
        const hasBadgeIcon = isIllustratedMode || element.type === 'security';
        // El Mapa Ilustrado es un plano "de cara al público" -escenarios,
        // barras, zonas...-, no un plano técnico de producción: seguridad,
        // Tiburón y el generador no pintan nada ahí (si hace falta verlos,
        // para eso está la vista normal/3D). Las vallas sí se muestran (fila
        // de icono, ver más abajo), pero se pueden ocultar con el botón
        // "OCULTAR VALLAS" (showFencesIllustrated) para no saturar el plano.
        const alwaysHiddenInIllustrated = ['security', 'tiburon', 'generator'];
        const isFenceHiddenByToggle = isFenceType(element.type) && !showFencesIllustrated;
        if (isIllustratedMode && (element.illustratedHidden || isFenceHiddenByToggle || alwaysHiddenInIllustrated.includes(element.type))) {
            element.labelMarker.setIcon(L.divIcon({ className: 'illustrated-label', html: '', iconSize: [0, 0] }));
        } else if (hasBadgeIcon) {
            const displayName = element.name !== config.label ? element.name : config.label;
            const iconKey = config.icon;
            const isZone = element.type.startsWith('zone');
            const isCustomBuilding = element.type === 'custom-building';
            const hiddenClass = showLabels ? '' : 'hidden-label';

            if (isCustomBuilding) {
                // Edificio de referencia: un bloque sólido a escala real (no
                // un pin/sticker) del mismo aspecto que los edificios reales
                // pintados en el fondo -"un recuadro como los que ya
                // existen"-. A propósito NO usa illustratedOffset:
                // representa un edificio real, así que su posición tiene
                // que ser la misma en todos los planos, no solo un ajuste
                // de composición del plano ilustrado.
                const bg = element.color || '#cbb28c';
                if (element.isPolygon) {
                    // Dibujado a mano con su forma real (ver
                    // startCustomBuildingDrawing/addPolygonBuildingToMap):
                    // el bloque se recorta con clip-path a los vértices
                    // reales en vez de ser siempre un rectángulo. Sin asa de
                    // girar (no aplica a una forma arbitraria), así que no
                    // hay rotación que aplicar aquí.
                    const pxPoints = element.polygonPoints.map(p => map.latLngToLayerPoint(p));
                    const minX = Math.min(...pxPoints.map(p => p.x)), maxX = Math.max(...pxPoints.map(p => p.x));
                    const minY = Math.min(...pxPoints.map(p => p.y)), maxY = Math.max(...pxPoints.map(p => p.y));
                    const wPx = Math.max(6, maxX - minX), hPx = Math.max(6, maxY - minY);
                    const clipPath = pxPoints.map(p => `${((p.x - minX) / wPx * 100).toFixed(1)}% ${((p.y - minY) / hPx * 100).toFixed(1)}%`).join(', ');
                    const centerPx = L.point((minX + maxX) / 2, (minY + maxY) / 2);

                    const iconHTML = `<div style="width:${wPx}px; height:${hPx}px; position:relative;" title="${displayName}">
                        <div style="width:100%; height:100%; background:${bg}; border:2px solid #8f7350; clip-path: polygon(${clipPath}); box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>
                        <div class="map-pin-bubble ${hiddenClass}" style="position:absolute; left:50%; top:-4px; transform:translate(-50%, -100%); white-space:nowrap;">${displayName}</div>
                    </div>`;
                    element.labelMarker.setLatLng(map.layerPointToLatLng(centerPx));
                    element.labelMarker.setIcon(L.divIcon({
                        className: 'illustrated-label',
                        html: iconHTML,
                        iconSize: [wPx, hPx], iconAnchor: [wPx / 2, hPx / 2]
                    }));
                } else {
                    // Sin dibujar a mano (el flujo antiguo "Añadir al mapa"
                    // directo, si se usa): rectángulo simple a partir de
                    // Largo/Ancho/rotación, como el resto de elementos.
                    const mapBearing = (map.getBearing ? map.getBearing() : 0);
                    const totalRotation = element.rotation + mapBearing;
                    const pCenter = map.latLngToLayerPoint(center);
                    const pEdge = map.latLngToLayerPoint(L.latLng(center.lat, center.lng + (10 / (111320 * latScale))));
                    const pxPerMeter = pCenter.distanceTo(pEdge) / 10;
                    const wPx = Math.max(6, length * pxPerMeter);
                    const hPx = Math.max(6, width * pxPerMeter);

                    const iconHTML = `<div style="width:${wPx}px; height:${hPx}px; position:relative; transform:rotate(${totalRotation}deg);" title="${displayName}">
                        <div style="width:100%; height:100%; background:${bg}; border:2px solid #8f7350; border-radius:2px; box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>
                        <div class="map-pin-bubble ${hiddenClass}" style="position:absolute; left:50%; bottom:100%; margin-bottom:4px; transform:translateX(-50%) rotate(${-totalRotation}deg); transform-origin:center;">${displayName}</div>
                    </div>`;
                    element.labelMarker.setLatLng(center);
                    element.labelMarker.setIcon(L.divIcon({
                        className: 'illustrated-label',
                        html: iconHTML,
                        iconSize: [wPx, hPx], iconAnchor: [wPx / 2, hPx / 2]
                    }));
                }
            } else if (isZone) {
                // Área traslúcida a escala real, con una etiqueta centrada y,
                // además, un icono real (mismo sticker que los elementos
                // puntuales): antes una "ZONA PARKING" era solo un rectángulo
                // de color sin ningún símbolo -que es justo lo que hacía que
                // no se distinguiera de cualquier otra zona ni se "viera" la
                // señal-, así que ahora también lleva su icono encima.
                const mapBearing = (map.getBearing ? map.getBearing() : 0);
                const totalRotation = element.rotation + mapBearing;
                const pCenter = map.latLngToLayerPoint(center);
                const pEdge = map.latLngToLayerPoint(L.latLng(center.lat, center.lng + (10 / (111320 * latScale))));
                const pxPerMeter = pCenter.distanceTo(pEdge) / 10;
                const wPx = length * pxPerMeter;
                const hPx = width * pxPerMeter;

                element.rectangle.setStyle({ fillOpacity: 0.35, weight: 2, color: element.color });

                const zoneBg = element.color || '#7f8c8d';
                const zoneIconSvg = getPinIconSVG(iconKey, zoneBg);
                const zoneBadgeSize = Math.max(28, Math.min(56, Math.min(wPx, hPx) * 0.5));

                const iconHTML = `<div style="width:${wPx}px; height:${hPx}px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; transform:rotate(${totalRotation}deg);">
                    <div class="map-pin-badge" style="width:${zoneBadgeSize}px;height:${zoneBadgeSize}px;">${zoneIconSvg}</div>
                    <div class="map-pin-area-label ${hiddenClass}">${displayName}</div>
                </div>`;
                element.labelMarker.setIcon(L.divIcon({
                    className: 'illustrated-label',
                    html: iconHTML,
                    iconSize: [wPx, hPx], iconAnchor: [wPx / 2, hPx / 2]
                }));
            } else if (element.isLine) {
                // Vallas: en el Mapa Ilustrado el perímetro ya se ve como una
                // línea amarilla punteada (ver el propio el.line, estilado en
                // toggleIllustratedMode) tipo plano de festival dibujado a
                // mano -no hace falta una fila de iconos ni nombre encima que
                // la tape, sobre todo con muchas vallas seguidas-.
                element.labelMarker.setIcon(L.divIcon({ className: 'illustrated-label', html: '', iconSize: [0, 0] }));
            } else if (iconKey === 'road-label') {
                // Rótulo de carretera/acceso: caja de color plana con el
                // texto (que el usuario renombra a "N-550", "EP-2601"...),
                // sin icono/sticker -como en los planos de orientación reales-.
                const roadW = Math.max(70, Math.min(220, displayName.length * 9 + 26));
                const roadH = 30;
                const iconHTML = `<div class="map-road-label" style="width:${roadW}px;height:${roadH}px;background:${element.color || '#e74c3c'};">${displayName}</div>`;
                // Posición del icono/etiqueta: centro real + illustratedOffset
                // en Modo Ilustrado, centro real a secas fuera de él -así una
                // separación hecha en el Mapa Ilustrado para desatascar dos
                // iconos pegados no "se cuela" como desplazamiento del texto
                // en el 2D técnico al salir de él-.
                element.labelMarker.setLatLng(isIllustratedMode ? offsetLatLngMeters(center, element.illustratedOffset) : center);
                element.labelMarker.setIcon(L.divIcon({
                    className: 'illustrated-label',
                    html: iconHTML,
                    iconSize: [roadW, roadH], iconAnchor: [roadW / 2, roadH / 2]
                }));
            } else if (iconKey === 'arrow-direction') {
                // Flecha de dirección a población cercana: el nombre (que el
                // usuario renombra al destino, ej. "REDONDELA") se queda fijo
                // y legible, pero la flecha en sí sí que gira con la
                // rotación del elemento (y con el giro del mapa), para poder
                // apuntar realmente hacia el sitio.
                const badgeSize = 52;
                const bg = element.color || '#e74c3c';
                const iconSvg = getPinIconSVG(iconKey, bg);
                const mapBearing = (map.getBearing ? map.getBearing() : 0);
                const bubbleH = isIllustratedMode ? 20 : 0;
                const boxW = isIllustratedMode ? Math.max(50, Math.min(160, displayName.length * 5 + 18)) : badgeSize;
                const totalH = bubbleH + badgeSize;

                const iconHTML = `<div class="map-pin" style="width:${boxW}px;" title="${displayName}">
                    ${isIllustratedMode ? `<div class="map-pin-bubble ${hiddenClass}">${displayName}</div>` : ''}
                    <div class="map-pin-badge" style="width:${badgeSize}px;height:${badgeSize}px; transform:rotate(${element.rotation + mapBearing}deg);">${iconSvg}</div>
                </div>`;
                // Posición del icono/etiqueta: centro real + illustratedOffset
                // en Modo Ilustrado, centro real a secas fuera de él -así una
                // separación hecha en el Mapa Ilustrado para desatascar dos
                // iconos pegados no "se cuela" como desplazamiento del texto
                // en el 2D técnico al salir de él-.
                element.labelMarker.setLatLng(isIllustratedMode ? offsetLatLngMeters(center, element.illustratedOffset) : center);
                element.labelMarker.setIcon(L.divIcon({
                    className: 'illustrated-label',
                    html: iconHTML,
                    iconSize: [boxW, totalH], iconAnchor: [boxW / 2, bubbleH + badgeSize / 2]
                }));
            } else {
                // Elementos puntuales: sticker ilustrado a todo color (sin
                // caja/cuadrado de fondo), más una burbuja con el nombre
                // encima (como en un mapa ilustrado de festival). La burbuja
                // respeta el toggle "OCULTAR TEXTOS" para evitar que se amontonen.
                const badgeSize = element.type === 'main-stage' ? 104 : 52;
                const bg = element.color || '#7f8c8d';
                // La entrada lleva una flecha curva integrada en su propio
                // icono (ver getPinIconSVG): a diferencia del resto de
                // stickers puntuales, el asa de rotación del elemento sí
                // orienta esa flecha hacia por dónde entra realmente el
                // público -pero SOLO la flecha (rotada dentro del propio
                // SVG, ver arrowRotation en getPinIconSVG), no el badge
                // entero, que si no la puerta/arco dejaba de leerse "de
                // pie" en cuanto se giraba-.
                const mapBearing = (map.getBearing ? map.getBearing() : 0);
                const iconSvg = element.type === 'entrance'
                    ? getPinIconSVG(iconKey, bg, element.rotation + mapBearing)
                    : getPinIconSVG(iconKey, bg);
                // La burbuja con el nombre solo aparece en el Mapa Ilustrado;
                // fuera de él (caso "security" siempre con insignia) se deja
                // como antes, solo el icono, para no ensuciar la edición.
                const bubbleH = isIllustratedMode ? 20 : 0;
                const boxW = isIllustratedMode ? Math.max(50, Math.min(160, displayName.length * 5 + 18)) : badgeSize;
                const totalH = bubbleH + badgeSize;

                const iconHTML = `<div class="map-pin" style="width:${boxW}px;" title="${displayName}">
                    ${isIllustratedMode ? `<div class="map-pin-bubble ${hiddenClass}">${displayName}</div>` : ''}
                    <div class="map-pin-badge" style="width:${badgeSize}px;height:${badgeSize}px;">${iconSvg}</div>
                </div>`;
                // Posición del icono/etiqueta: centro real + illustratedOffset
                // en Modo Ilustrado, centro real a secas fuera de él -así una
                // separación hecha en el Mapa Ilustrado para desatascar dos
                // iconos pegados no "se cuela" como desplazamiento del texto
                // en el 2D técnico al salir de él-.
                element.labelMarker.setLatLng(isIllustratedMode ? offsetLatLngMeters(center, element.illustratedOffset) : center);
                element.labelMarker.setIcon(L.divIcon({
                    className: 'illustrated-label',
                    html: iconHTML,
                    iconSize: [boxW, totalH], iconAnchor: [boxW / 2, bubbleH + badgeSize / 2]
                }));
            }
        } else {
            // Modo normal: Solo texto (sin icono) que se oculta según preferencia
            element.labelMarker.setIcon(L.divIcon({
                className: 'rectangle-label',
                html: `
                    <div style="text-align:center; cursor:move;">
                        <div class="${showLabels ? '' : 'hidden-label'}" style="color:white; font-weight:bold; font-size:10px; text-shadow: 1px 1px 2px black; background: rgba(0,0,0,0.3); padding: 2px 4px; border-radius: 4px;">
                            ${config.label} (${distText})${sectionsText}<br>${element.name !== config.label ? element.name : ''}
                        </div>
                    </div>
                `,
                iconSize: [140, 60], iconAnchor: [70, 30]
            }));
        }
	}
    updateStats();
}

function updateStats() {
    let totalVallasM = 0, totalVallasN = 0, totalPanicM = 0, totalWC = 0, totalFood = 0, totalBar = 0;
    const typesPresent = new Set();

    elements.forEach(el => {
        typesPresent.add(el.type);
        if (el.type === 'fence') { totalVallasM += el.length; totalVallasN += el.numVallas; }
        else if (el.type === 'panic-fence') { totalPanicM += el.length; }
        else if (el.type === 'wc') totalWC++;
        else if (el.type === 'food-truck') totalFood++;
        else if (el.type === 'bar') totalBar++;
    });

    document.getElementById('stat-vallas-m').innerText = totalVallasM.toFixed(1);
    document.getElementById('stat-vallas-n').innerText = totalVallasN;
    document.getElementById('stat-panic-m').innerText = totalPanicM.toFixed(1);
    document.getElementById('stat-wc').innerText = totalWC;
    document.getElementById('stat-food').innerText = totalFood;
    document.getElementById('stat-bar').innerText = totalBar;

    // Actualizar Leyenda
    const legend = document.getElementById('map-legend');
    const legendItems = document.getElementById('legend-items');
    if (legend && legendItems) {
        if (elements.length > 0) {
            legend.style.display = 'block';
            legendItems.innerHTML = '';
            const legendHiddenTypes = ['security', 'tiburon', 'generator', 'fence', 'panic-fence'];
            Array.from(typesPresent).sort().forEach(type => {
                if (isIllustratedMode && legendHiddenTypes.includes(type)) return;
                const config = festivalConfig[type];
                if (config) {
                    const item = document.createElement('div');
                    item.className = 'legend-item';
                    const iconHTML = isIllustratedMode
                        ? `<div class="legend-pin">${getPinIconSVG(config.icon, config.color)}</div>`
                        : `<img src="${getGenericIconUrl(config.icon)}" class="legend-icon">`;
                    item.innerHTML = `
                        ${iconHTML}
                        <span>${config.label}</span>
                    `;
                    legendItems.appendChild(item);
                }
            });
        } else {
            legend.style.display = 'none';
        }
    }
}

function addRotateHandle(element) {
    const center = element.moveMarker.getLatLng();
    element.rotateMarker = L.marker(center, { icon: rotateHandleIcon, draggable: true, zIndexOffset: 2500 });
    if (!isFestivalMode) element.rotateMarker.addTo(map);
    
    element.rotateMarker.on('drag', (e) => {
        const center = element.moveMarker.getLatLng();
        const pos = e.target.getLatLng();
        const dLng = (pos.lng - center.lng) * Math.cos(center.lat * Math.PI / 180);
        const dLat = (pos.lat - center.lat);
        const angle = Math.atan2(dLng, dLat) * (180 / Math.PI);
        element.rotation = (angle + 360) % 360;
        // "true" (recalcular también la etiqueta/icono), no "false": para
        // tipos cuyo aspecto vive en el icono -Edificio de referencia,
        // zonas, entrada, flecha de dirección- ese icono lleva la rotación
        // metida en su propio HTML (transform:rotate). Con solo el
        // contorno recalculado (lo que hacía "false"), girar no se veía
        // en vivo -parecía que "no hacía nada" hasta que otra acción
        // cualquiera (p.ej. abrir y cerrar la ficha de edición) disparaba
        // por fin un refresco completo-.
        updateElementShape(element, true);
        if (editingElement && editingElement.id === element.id) {
            document.getElementById('element-rotation').value = Math.round(element.rotation);
        }
    });
    element.rotateMarker.on('dragend', () => saveHistory());
    element.rotateMarker.on('click', (e) => { L.DomEvent.stopPropagation(e); selectElement(element); });
}

function setupElementEvents() {
	const elemType = document.getElementById('element-type');
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const panel = document.getElementById('panel');

    if (mobileBtn) mobileBtn.onclick = () => panel.classList.toggle('active');

    // Botones de Modos Especiales
    const festivalBtn = document.getElementById('festival-mode-btn');
    if (festivalBtn) festivalBtn.onclick = toggleFestivalMode;

    const illustratedBtn = document.getElementById('illustrated-map-btn');
    if (illustratedBtn) illustratedBtn.onclick = toggleIllustratedMode;

    const labelsBtn = document.getElementById('hide-labels-btn');
    if (labelsBtn) labelsBtn.onclick = toggleLabelsMode;

    const fencesBtn = document.getElementById('toggle-fences-btn');
    if (fencesBtn) fencesBtn.onclick = toggleFencesIllustrated;

    const realLabelsBtn = document.getElementById('toggle-real-labels-btn');
    if (realLabelsBtn) realLabelsBtn.onclick = toggleRealContextLabels;

    const resetLabelsBtn = document.getElementById('reset-hidden-labels-btn');
    if (resetLabelsBtn) resetLabelsBtn.onclick = () => {
        if (hiddenContextNames.size === 0) { alert('No hay ningún nombre real oculto.'); return; }
        if (!confirm(`¿Volver a mostrar los ${hiddenContextNames.size} nombre(s) reales que ocultaste a mano?`)) return;
        resetHiddenContextNames();
    };

    const measureBtn = document.getElementById('measure-btn');
    if (measureBtn) measureBtn.onclick = toggleMeasureMode;

    const legendToggle = document.getElementById('legend-toggle');
    if (legendToggle) {
        legendToggle.onclick = function() {
            const legend = document.getElementById('map-legend');
            legend.classList.toggle('minimized');
        };
    }

	document.querySelectorAll('.icon-option').forEach(icon => {
		icon.onclick = function() {
			document.querySelectorAll('.icon-option').forEach(i => i.classList.remove('selected'));
			this.classList.add('selected');
			const mapIconToType = {
                'stage': 'main-stage', 'food': 'food-truck', 'bar': 'bar',
                'wc': 'signal-wc', 'fence': 'fence', 'panic-fence': 'panic-fence', 'custom': 'generator',
                'parking': 'signal-parking', 'disabled': 'signal-disabled', 'noparking': 'signal-no-parking',
                'exit': 'signal-exit', 'no-entry': 'signal-no-entry', 'security': 'security', 'entrance': 'entrance', 'drunk': 'drunk',
                'tiburon': 'tiburon'
            };
			if (elemType) { elemType.value = mapIconToType[this.dataset.icon]; elemType.dispatchEvent(new Event('change')); }
		};
	});

	if (elemType) {
		elemType.onchange = function() {
			const isFence = isFenceType(this.value);
			document.getElementById('dimension-controls').style.display = isFence ? 'none' : 'block';
            document.getElementById('fence-controls').style.display = isFence ? 'block' : 'none';
            document.getElementById('patrol-controls').style.display = (this.value === 'security') ? 'block' : 'none';
            const config = festivalConfig[this.value];
			if (config && config.defaultLen) {
				document.getElementById('element-length').value = config.defaultLen;
				document.getElementById('element-width').value = config.defaultWid || 5;
                document.querySelectorAll('.icon-option').forEach(i => i.classList.remove('selected'));
				const iconToSelect = document.querySelector(`.icon-option[data-icon="${config.icon}"]`);
				if (iconToSelect) iconToSelect.classList.add('selected');
			}
		};
	}

    document.getElementById('fence-mode').onchange = function() {
        document.getElementById('fence-fixed-length-group').style.display = (this.value === 'fixed') ? 'block' : 'none';
    };

	let lastAddElementAt = 0;
	document.getElementById('add-element').onclick = function() {
		// "Añadir al mapa" no da ninguna señal visual instantánea (el
		// elemento nuevo aparece en el centro del mapa, fuera de la vista si
		// se está mirando otra zona, o el modo de dibujo empieza en
		// silencio) -visto en vivo: eso lleva a pulsarlo dos veces seguidas
		// pensando que no ha hecho nada, y cada pulsación crea un elemento
		// nuevo de verdad, así que salían dos idénticos superpuestos. Se
		// ignora un segundo clic tan seguido del anterior (no un clic
		// deliberado más tarde para añadir OTRO elemento del mismo tipo).
		const now = Date.now();
		if (now - lastAddElementAt < 600) return;
		lastAddElementAt = now;

		const type = elemType.value;
		if (isFenceType(type) && document.getElementById('fence-mode').value === 'draw') {
            startFenceDrawing(type);
        } else if (type === 'security' && document.getElementById('patrol-mode').value === 'draw') {
            const name = document.getElementById('element-name').value || festivalConfig[type].label;
            startPatrolPathDrawing(type, name);
        } else if (type === 'custom-building') {
            // Pinchar y arrastrar en el mapa para dibujar el rectángulo
            // directamente a su tamaño real, en vez de soltarlo en el
            // centro y tener que ajustar Largo/Ancho a mano después.
            const name = document.getElementById('element-name').value || festivalConfig[type].label;
            startCustomBuildingDrawing(name);
        } else {
            const config = festivalConfig[type], name = document.getElementById('element-name').value || config.label;
            const length = isFenceType(type) ? parseFloat(document.getElementById('fence-fixed-length').value) : parseFloat(document.getElementById('element-length').value);
            const width = parseFloat(document.getElementById('element-width').value) || 5;
            const element = isFenceType(type) ? addFixedFenceToMap(length, undefined, undefined, type) : addRectangleToMap(name, type, map.getCenter(), length, width);
            elements.push(element); updateElementCard(element); bindMarkerEvents(element);
            // addFixedFenceToMap/addRectangleToMap ya llaman a updateStats()
            // internamente, pero ANTES de este push -con el elemento recién
            // creado todavía fuera de "elements"-, así que su propio conteo
            // se quedaba sin reflejar hasta que otra acción disparara un
            // recálculo. Se repite aquí, ya con el elemento dentro.
            updateStats();
            saveHistory();
        }
        if (window.innerWidth <= 768) panel.classList.remove('active');
	};

	document.getElementById('element-rotation').onchange = () => saveHistory();
	document.getElementById('edit-element-name').onchange = () => saveHistory();
    document.getElementById('edit-element-length').onchange = () => saveHistory();
    document.getElementById('edit-element-width').onchange = () => saveHistory();

	document.getElementById('delete-element-btn').onclick = () => {
		if (editingElement) {
            deleteElement(editingElement); // en Modo Ilustrado esto oculta en vez de borrar, ver deleteElement
            document.getElementById('edit-panel').style.display = 'none'; editingElement = null;
		}
	};
}

let patrolDrawPoints = [], patrolTempPolyline = null, patrolTempMarkers = [];

// Recorrido a pie de un portero: a diferencia de la valla (línea recta de
// dos clics, ver startFenceDrawing), aquí se admiten VARIOS puntos -uno por
// clic-, para poder marcar una ronda con vueltas en vez de un tramo recto.
// Se termina con doble clic, Enter o Escape; con un único punto (o ninguno)
// se queda plantado ahí -sin recorrido, hace de guardia fijo como siempre-.
function startPatrolPathDrawing(type, name) {
    patrolDrawPoints = [];
    map.dragging.disable();
    map.doubleClickZoom.disable();
    map.getContainer().style.cursor = 'crosshair';

    // En móvil no hay doble clic ni teclado (Enter/Escape) para terminar: el
    // botón flotante es la única forma fiable de finalizar en cualquier
    // dispositivo, por eso se muestra siempre, no solo en pantallas chicas.
    const finishBtn = document.getElementById('finish-drawing-btn');
    if (finishBtn) {
        finishBtn.style.display = 'block';
        finishBtn.onclick = () => finish();
    }

    const addPoint = (latlng) => {
        patrolDrawPoints.push(latlng);
        patrolTempMarkers.push(L.circleMarker(latlng, { radius: 4, color: '#fff', weight: 2, fillColor: '#e74c3c', fillOpacity: 1, interactive: false }).addTo(map));
        if (!patrolTempPolyline) {
            patrolTempPolyline = L.polyline(patrolDrawPoints, { color: 'white', weight: 3, dashArray: '5, 10', interactive: false }).addTo(map);
        } else {
            patrolTempPolyline.setLatLngs(patrolDrawPoints);
        }
    };

    const onClick = (e) => addPoint(e.latlng);

    const onDblClick = (e) => {
        // El segundo clic del propio doble clic ya añadió un punto de más
        // (Leaflet dispara "click" antes que "dblclick"): se descarta antes
        // de terminar, si no el recorrido acababa siempre con un punto
        // sobrante justo donde se hizo doble clic para finalizar.
        if (patrolDrawPoints.length) patrolDrawPoints.pop();
        finish();
    };

    const onKeyDown = (e) => {
        if (e.key === 'Escape' || e.key === 'Enter') finish();
    };

    function finish() {
        map.off('click', onClick);
        map.off('dblclick', onDblClick);
        document.removeEventListener('keydown', onKeyDown);
        map.dragging.enable();
        map.doubleClickZoom.enable();
        map.getContainer().style.cursor = '';
        if (finishBtn) { finishBtn.style.display = 'none'; finishBtn.onclick = null; }
        if (patrolTempPolyline) { map.removeLayer(patrolTempPolyline); patrolTempPolyline = null; }
        patrolTempMarkers.forEach(m => map.removeLayer(m));
        patrolTempMarkers = [];

        const config = festivalConfig[type];
        const center = patrolDrawPoints.length ? patrolDrawPoints[0] : map.getCenter();
        const pathCoords = patrolDrawPoints.length > 1 ? patrolDrawPoints.slice() : null;

        const element = addRectangleToMap(name, type, center, config.defaultLen, config.defaultWid, 0, pathCoords);
        elements.push(element); updateElementCard(element); bindMarkerEvents(element);
        updateStats();
        saveHistory();
    }

    map.on('click', onClick);
    map.on('dblclick', onDblClick);
    document.addEventListener('keydown', onKeyDown);
}

function startFenceDrawing(type = 'fence') {
	isDrawingLine = true; map.dragging.disable(); map.getContainer().style.cursor = 'crosshair';
	map.once('click', (e) => {
		drawStartLatLng = e.latlng;
		tempPolyline = L.polyline([drawStartLatLng, drawStartLatLng], { color: 'white', weight: 4, dashArray: '5, 10' }).addTo(map);
		map.on('mousemove', (em) => {
            tempPolyline.setLatLngs([drawStartLatLng, em.latlng]);
            const dist = map.distance(drawStartLatLng, em.latlng).toFixed(1);
            if (!tempLabel) tempLabel = L.marker(em.latlng, { icon: L.divIcon({ html: `<div style="color:white; background:black; padding:4px; border-radius:4px;">${dist}m</div>` }) }).addTo(map);
            else { tempLabel.setLatLng(em.latlng); tempLabel.getElement().innerHTML = `<div style="color:white; background:black; padding:4px; border-radius:4px;">${dist}m</div>`; }
        });
		map.once('click', (e2) => {
            isDrawingLine = false; map.off('mousemove'); map.dragging.enable(); map.getContainer().style.cursor = '';
            if (tempPolyline) map.removeLayer(tempPolyline); if (tempLabel) map.removeLayer(tempLabel);
            const dist = map.distance(drawStartLatLng, e2.latlng);
            
            // Cálculo de ángulo basado en la dirección del trazo
            const p1 = map.project(drawStartLatLng);
            const p2 = map.project(e2.latlng);
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            let angle = Math.atan2(dy, dx) * (180 / Math.PI);
            
            // Ajustar por la rotación actual del mapa
            if (map.getBearing) {
                angle += map.getBearing();
            }
            
            const rotation = (angle + 360) % 360;
            
            const element = addFixedFenceToMap(dist, L.latLngBounds(drawStartLatLng, e2.latlng).getCenter(), rotation, type);
            elements.push(element); updateElementCard(element); bindMarkerEvents(element);
            updateStats();
            saveHistory();
        });
	});
}

let buildingDrawPoints = [], buildingTempPolygon = null, buildingTempMarkers = [], buildingFirstPointMarker = null;
// Si se pulsa "Añadir al mapa" dos veces (p.ej. porque no parece pasar nada
// al instante y se insiste), startCustomBuildingDrawing se llamaba dos veces
// sin que la sesión anterior se limpiara: como buildingDrawPoints es
// compartido y map.on(...) APILA listeners en vez de sustituirlos, cada clic
// en el mapa disparaba dos veces "añadir vértice" y, al cerrar, dos veces
// "finish()" -> dos edificios idénticos superpuestos (el bug de "aparecen
// dos"). Este guardián cierra/descarta cualquier sesión anterior antes de
// empezar una nueva, para que nunca haya dos juegos de listeners a la vez.
let buildingDrawCleanup = null;

// Dibuja un "Edificio (referencia)" con su forma real -una esquina, la
// siguiente, la siguiente... y se cierra solo contra la primera-, no un
// simple rectángulo de dos esquinas opuestas. Mismo patrón de varios clics
// que ya usa startPatrolPathDrawing (doble clic/Enter/Escape/botón
// "Finalizar" para terminar), pero cerrando el trazo como POLÍGONO en vez
// de dejarlo como un camino abierto -y, a diferencia de esa función, un
// clic suficientemente cerca del primer punto también cierra la forma,
// que es justo lo que se pidió-.
function startCustomBuildingDrawing(name) {
    if (buildingDrawCleanup) buildingDrawCleanup();
    buildingDrawPoints = [];
    map.dragging.disable();
    map.doubleClickZoom.disable();
    map.getContainer().style.cursor = 'crosshair';

    const CLOSE_DISTANCE_PX = 20; // radio, en píxeles de pantalla, para considerar "clic sobre el primer punto"

    const finishBtn = document.getElementById('finish-drawing-btn');
    if (finishBtn) {
        finishBtn.style.display = 'block';
        finishBtn.onclick = () => finish();
    }

    const addPoint = (latlng) => {
        buildingDrawPoints.push(latlng);
        const isFirst = buildingDrawPoints.length === 1;
        const marker = L.circleMarker(latlng, {
            radius: isFirst ? 8 : 4, color: '#fff', weight: 2,
            fillColor: isFirst ? '#ffd400' : '#8f7350', fillOpacity: 1, interactive: false
        }).addTo(map);
        buildingTempMarkers.push(marker);
        if (isFirst) buildingFirstPointMarker = marker;

        if (!buildingTempPolygon) {
            buildingTempPolygon = L.polygon(buildingDrawPoints, { color: '#8f7350', weight: 2, fillColor: '#cbb28c', fillOpacity: 0.4, dashArray: '4,4', interactive: false }).addTo(map);
        } else {
            buildingTempPolygon.setLatLngs(buildingDrawPoints);
        }
    };

    // Vista previa en vivo: mientras se mueve el ratón (sin haber clicado
    // todavía el siguiente vértice) se ve YA el polígono con ese punto
    // fantasma incluido -mismo tipo de "goma elástica" que ya usa
    // startFenceDrawing-, y si el cursor entra en el radio de cierre, el
    // primer punto crece/cambia de color y el cursor pasa a "mano" para
    // dejar claro que ahí se puede cerrar la forma.
    const onMouseMove = (em) => {
        if (buildingDrawPoints.length === 0) return;
        if (buildingTempPolygon) buildingTempPolygon.setLatLngs([...buildingDrawPoints, em.latlng]);

        if (buildingDrawPoints.length >= 3 && buildingFirstPointMarker) {
            const pFirst = map.latLngToLayerPoint(buildingDrawPoints[0]);
            const pCursor = map.latLngToLayerPoint(em.latlng);
            const near = pFirst.distanceTo(pCursor) <= CLOSE_DISTANCE_PX;
            buildingFirstPointMarker.setStyle({ radius: near ? 12 : 8, fillColor: near ? '#2ecc71' : '#ffd400' });
            map.getContainer().style.cursor = near ? 'pointer' : 'crosshair';
        }
    };

    const onClick = (e) => {
        // Clic cerca del primer punto (con 3+ puntos ya puestos, para que
        // el segundo clic -que define el segundo vértice- nunca se
        // confunda con "cerrar"): cierra la forma ahí mismo, sin añadir
        // este clic como un vértice más pegado al primero.
        if (buildingDrawPoints.length >= 3) {
            const pFirst = map.latLngToLayerPoint(buildingDrawPoints[0]);
            const pClick = map.latLngToLayerPoint(e.latlng);
            if (pFirst.distanceTo(pClick) <= CLOSE_DISTANCE_PX) { finish(); return; }
        }
        addPoint(e.latlng);
    };

    const onDblClick = (e) => {
        // Un doble clic real dispara "click" DOS VECES (una por cada clic
        // del par) antes de "dblclick" -cada una añadió un vértice de más
        // en prácticamente el mismo sitio-, y ninguna de las dos cuenta
        // como vértice real: era solo el gesto de "terminar aquí", no un
        // punto del contorno. Con solo una de las dos descartada (como se
        // hacía antes) quedaba un vértice sobrante clavado ahí, que al
        // cerrar el polígono se veía como una "punta" cruzada encima de la
        // forma real.
        buildingDrawPoints.pop();
        buildingDrawPoints.pop();
        finish();
    };

    const onKeyDown = (e) => {
        if (e.key === 'Escape' || e.key === 'Enter') finish();
    };

    function cleanupPreview() {
        map.off('click', onClick);
        map.off('dblclick', onDblClick);
        map.off('mousemove', onMouseMove);
        document.removeEventListener('keydown', onKeyDown);
        map.dragging.enable();
        map.doubleClickZoom.enable();
        map.getContainer().style.cursor = '';
        if (finishBtn) { finishBtn.style.display = 'none'; finishBtn.onclick = null; }
        if (buildingTempPolygon) { map.removeLayer(buildingTempPolygon); buildingTempPolygon = null; }
        buildingTempMarkers.forEach(m => map.removeLayer(m));
        buildingTempMarkers = [];
        buildingFirstPointMarker = null;
        buildingDrawCleanup = null;
    }
    buildingDrawCleanup = cleanupPreview;

    function finish() {
        cleanupPreview();
        // Menos de 3 puntos no forma una figura real -ni un rectángulo
        // arrastrado por error queda ahí como un edificio degenerado-.
        if (buildingDrawPoints.length < 3) return;

        const element = addPolygonBuildingToMap(name, buildingDrawPoints.slice());
        elements.push(element); updateElementCard(element); bindMarkerEvents(element);
        updateStats();
        saveHistory();
    }

    map.on('click', onClick);
    map.on('dblclick', onDblClick);
    map.on('mousemove', onMouseMove);
    document.addEventListener('keydown', onKeyDown);
}

// Calcula el centroide (promedio simple de vértices) de un polígono: de
// sobra de preciso para colocar el asa de mover y la etiqueta de un
// edificio -no hace falta el centroide "de área" exacto para una forma de
// unos pocos metros-.
function polygonCentroid(points) {
    const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
    const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
    return L.latLng(lat, lng);
}

// Edificio de referencia con su forma REAL (no un rectángulo con
// largo/ancho/rotación, como el resto de elementos): el usuario dibuja el
// contorno a mano -ver startCustomBuildingDrawing-, así que se guarda tal
// cual como polígono. No tiene asa de girar (no aplica a una forma
// arbitraria) ni usa illustratedOffset (igual que el resto de "Edificio
// (referencia)": su posición debe ser la misma en todos los planos).
function addPolygonBuildingToMap(name, points) {
    const config = festivalConfig['custom-building'];
    const polygon = L.polygon(points, { color: config.color, fillColor: config.color, weight: 2, fillOpacity: 0.6, interactive: true, bubblingMouseEvents: false }).addTo(map);
    const centroid = polygonCentroid(points);
    const moveMarker = L.marker(centroid, { icon: moveHandleIcon, draggable: true, zIndexOffset: 2000 });
    const labelMarker = L.marker(centroid, { icon: L.divIcon({ className: 'rectangle-label', html: '' }), draggable: true, zIndexOffset: 1000 });

    if (!isFestivalMode) { moveMarker.addTo(map); labelMarker.addTo(map); }

    // Ancho/largo de la caja que envuelve el polígono: solo informativos
    // (se muestran como texto en modo normal, "AxB m"), no definen la forma.
    const lats = points.map(p => p.lat), lngs = points.map(p => p.lng);
    const latScale = Math.cos(centroid.lat * Math.PI / 180);
    const length = Math.max(2, Math.round((Math.max(...lngs) - Math.min(...lngs)) * 111320 * latScale * 10) / 10);
    const width = Math.max(2, Math.round((Math.max(...lats) - Math.min(...lats)) * 111320 * 10) / 10);

    const element = {
        id: Date.now(), type: 'custom-building', name, polygon, labelMarker, moveMarker,
        isRectangle: false, isLine: false, isPolygon: true,
        polygonPoints: points.map(p => L.latLng(p.lat, p.lng)),
        length, width, rotation: 0,
        color: config.color, iconUrl: getGenericIconUrl(config.icon),
        illustratedOffset: { dx: 0, dy: 0 }
    };

    function onDragStart(e) { element.lastPos = e.target.getLatLng(); }
    function onDrag(e) {
        const newPos = e.target.getLatLng();
        const oldPos = element.lastPos || centroid;
        const dLat = newPos.lat - oldPos.lat, dLng = newPos.lng - oldPos.lng;
        element.polygonPoints = element.polygonPoints.map(p => L.latLng(p.lat + dLat, p.lng + dLng));
        element.polygon.setLatLngs(element.polygonPoints);
        const curLabelPos = labelMarker.getLatLng();
        labelMarker.setLatLng([curLabelPos.lat + dLat, curLabelPos.lng + dLng]);
        element.lastPos = newPos;
    }
    moveMarker.on('dragstart', onDragStart);
    moveMarker.on('drag', onDrag);
    moveMarker.on('dragend', () => saveHistory());

    updateElementShape(element, true);
    return element;
}

function addFixedFenceToMap(len, center = map.getCenter(), rotation = 0, type = 'fence') {
    const config = festivalConfig[type] || festivalConfig['fence'];
    const line = L.polyline([], { color: config.color, weight: 5, interactive: true, bubblingMouseEvents: false }).addTo(map);
    const moveMarker = L.marker(center, { icon: moveHandleIcon, draggable: true, zIndexOffset: 2000 });
    const labelMarker = L.marker(center, { icon: L.divIcon({ className: 'rectangle-label', html: '' }), draggable: true, zIndexOffset: 1000 });

    if (!isFestivalMode) {
        moveMarker.addTo(map);
        labelMarker.addTo(map);
    }

    const name = type === 'panic-fence' ? 'Valla Antipánico' : 'Valla';
    const element = { id: Date.now(), type, name, line, labelMarker, moveMarker, length: len, numVallas: Math.ceil(len / 2), isLine: true, isRectangle: false, color: config.color, iconUrl: getGenericIconUrl(config.icon), rotation: rotation, illustratedOffset: { dx: 0, dy: 0 } };
    addRotateHandle(element);
    bindIllustratedDrag(element);
    
    function onDragStart(e) {
        element.lastPos = e.target.getLatLng ? e.target.getLatLng() : moveMarker.getLatLng();
    }
    
    function onDrag(e) {
        const newPos = e.target.getLatLng ? e.target.getLatLng() : e.latlng;
        const oldPos = element.lastPos || center;
        const dLat = newPos.lat - oldPos.lat;
        const dLng = newPos.lng - oldPos.lng;
        
        const curMovePos = moveMarker.getLatLng();
        if (e.target !== moveMarker) moveMarker.setLatLng([curMovePos.lat + dLat, curMovePos.lng + dLng]);
        
        const curLabelPos = labelMarker.getLatLng();
        labelMarker.setLatLng([curLabelPos.lat + dLat, curLabelPos.lng + dLng]);
        
        element.lastPos = newPos;
        updateElementShape(element, false);
    }

    moveMarker.on('dragstart', onDragStart);
    moveMarker.on('drag', onDrag);
    moveMarker.on('dragend', () => saveHistory());
    
    // Permitir mover arrastrando la línea
    let isDraggingShape = false;
    line.on('mousedown touchstart', (e) => {
        isDraggingShape = true;
        element.lastPos = e.latlng;
        map.dragging.disable();
        L.DomEvent.stopPropagation(e);
    });
    map.on('mousemove touchmove', (e) => {
        if (isDraggingShape) {
            onDrag(e);
        }
    });
    map.on('mouseup touchend', () => {
        if (isDraggingShape) {
            isDraggingShape = false;
            map.dragging.enable();
        }
    });

    updateElementShape(element, true); return element;
}

function updateDimensionsFromEdit() { if (editingElement) { editingElement.length = parseFloat(document.getElementById('edit-element-length').value) || 1; if (editingElement.isRectangle) editingElement.width = parseFloat(document.getElementById('edit-element-width').value) || 1; updateElementShape(editingElement, true); } }

function addRectangleToMap(name, type, center, length, width, rotation = 0, pathCoords = null) {
	const config = festivalConfig[type], rectangle = L.polygon([], { color: config.color, fillColor: config.color, weight: 2, fillOpacity: 0.6, interactive: true, bubblingMouseEvents: false }).addTo(map);
    const moveMarker = L.marker(center, { icon: moveHandleIcon, draggable: true, zIndexOffset: 2000 });
    const labelMarker = L.marker(center, { icon: L.divIcon({ className: 'rectangle-label', html: '' }), draggable: true, zIndexOffset: 1000 });

    if (!isFestivalMode) {
        moveMarker.addTo(map);
        labelMarker.addTo(map);
    }

    const element = { id: Date.now(), type, name, rectangle, labelMarker, moveMarker, length, width, rotation: rotation, isRectangle: true, color: config.color, iconUrl: getGenericIconUrl(config.icon), illustratedOffset: { dx: 0, dy: 0 } };
    bindIllustratedDrag(element);

    // Trayecto dibujado a mano opcional: línea guía en el propio mapa 2D,
    // aparte de la huella/rectángulo del elemento.
    if (pathCoords && pathCoords.length > 1) {
        element.pathCoords = pathCoords;
        element.routeLine = L.polyline(pathCoords, { color: config.color, weight: 3, dashArray: '6, 8', opacity: 0.85, interactive: false });
        if (!isFestivalMode) element.routeLine.addTo(map);
    }

    addRotateHandle(element);

    function onDragStart(e) {
        element.lastPos = e.target.getLatLng ? e.target.getLatLng() : moveMarker.getLatLng();
    }

    function onDrag(e) {
        const newPos = e.target.getLatLng ? e.target.getLatLng() : e.latlng;
        const oldPos = element.lastPos || center;
        const dLat = newPos.lat - oldPos.lat;
        const dLng = newPos.lng - oldPos.lng;

        const curMovePos = moveMarker.getLatLng();
        if (e.target !== moveMarker) moveMarker.setLatLng([curMovePos.lat + dLat, curMovePos.lng + dLng]);

        const curLabelPos = labelMarker.getLatLng();
        labelMarker.setLatLng([curLabelPos.lat + dLat, curLabelPos.lng + dLng]);

        // El trayecto entero viaja con el elemento: si no, arrastrarlo lo
        // separaba de su propio camino dibujado.
        if (element.pathCoords) {
            element.pathCoords = element.pathCoords.map(p => L.latLng(p.lat + dLat, p.lng + dLng));
            if (element.routeLine) element.routeLine.setLatLngs(element.pathCoords);
        }

        element.lastPos = newPos;
        updateElementShape(element, false);
    }

    moveMarker.on('dragstart', onDragStart);
    moveMarker.on('drag', onDrag);
    moveMarker.on('dragend', () => saveHistory());

    // Permitir mover arrastrando el polígono
    let isDraggingShape = false;
    rectangle.on('mousedown touchstart', (e) => {
        isDraggingShape = true;
        element.lastPos = e.latlng;
        map.dragging.disable();
        L.DomEvent.stopPropagation(e);
    });
    map.on('mousemove touchmove', (e) => {
        if (isDraggingShape) {
            onDrag(e);
        }
    });
    map.on('mouseup touchend', () => {
        if (isDraggingShape) {
            isDraggingShape = false;
            map.dragging.enable();
        }
    });

	updateElementShape(element, true); return element;
}

function updateElementCard(element) {
    let card = document.getElementById(`element-card-${element.id}`);
    if (!card) {
        card = document.createElement('div');
        card.className = 'element-item';
        card.id = `element-card-${element.id}`;
        document.getElementById('elements-list').appendChild(card);
    }
	card.style.borderLeftColor = element.color;
	card.innerHTML = `
        <div class="element-icon" style="background: ${element.color}22">
            <img src="${element.iconUrl}" alt="${element.type}">
        </div>
        <div class="element-content">
            <h4>${element.name}</h4>
            <p>${element.type.replace('-', ' ')}</p>
            <span style="font-size: 9px; opacity: 0.5; font-style: italic;">Doble clic para editar</span>
        </div>
        <div class="element-actions">
            <div class="action-btn visibility-btn" title="${element.illustratedHidden ? 'Mostrar en Mapa Ilustrado' : 'Ocultar en Mapa Ilustrado'}" style="${element.illustratedHidden ? 'opacity:0.4;' : ''}">${element.illustratedHidden ? '◌' : '◉'}</div>
            <div class="action-btn focus-btn">⦿</div>
            <div class="action-btn delete-btn">✕</div>
        </div>
    `;
	card.onclick = () => selectElement(element);
	card.querySelector('.focus-btn').onclick = (e) => {
		e.stopPropagation();
		map.setView(element.moveMarker.getLatLng(), 18);
		// Si la vista 3D está activa, recentra también su cámara (ver
		// focusCameraOnElement en view3d.js): si no, el botón solo servía
		// para el mapa 2D y en 3D no había forma de traer al centro un
		// elemento que quedó lejos, p.ej. en una esquina.
		if (typeof focusCameraOnElement === 'function') focusCameraOnElement(element);
	};
	card.querySelector('.delete-btn').onclick = (e) => { e.stopPropagation(); deleteElement(element); };
	card.querySelector('.visibility-btn').onclick = (e) => {
		e.stopPropagation();
		element.illustratedHidden = !element.illustratedHidden;
		updateElementCard(element);
		updateElementShape(element, true);
		saveHistory();
	};
}

function selectElement(element) {
	editingElement = element; document.getElementById('edit-panel').style.display = 'block'; document.getElementById('edit-element-name').value = element.name;
    document.getElementById('edit-rotation-group').style.display = 'block'; document.getElementById('element-rotation').value = Math.round(element.rotation) || 0;
    document.getElementById('edit-dimension-controls').style.display = 'block'; document.getElementById('edit-width-group').style.display = element.isRectangle ? 'block' : 'none';
	document.getElementById('edit-element-length').value = element.length; if (element.isRectangle) document.getElementById('edit-element-width').value = element.width;
}

function showEditPopup(element, latlng) {
    const config = festivalConfig[element.type] || { label: 'ELEMENTO' };
    
    let content = `
        <div class="edit-popup-container">
            <h4>⚙️ Menú de Edición</h4>
            
            <div class="popup-input-group">
                <label>Nombre del Elemento</label>
                <input type="text" id="popup-name" value="${element.name}" placeholder="Ej: Barra Principal">
            </div>
            
            <div style="display:flex; gap:10px;">
                <div class="popup-input-group" style="flex:1;">
                    <label>Largo (m)</label>
                    <input type="number" id="popup-length" value="${element.length}" step="0.5">
                </div>
    `;

    if (element.isRectangle) {
        content += `
                <div class="popup-input-group" style="flex:1;">
                    <label>Ancho (m)</label>
                    <input type="number" id="popup-width" value="${element.width}" step="0.5">
                </div>
        `;
    }

    content += `
            </div>
            
            <div class="popup-input-group">
                <label>Rotación (°)</label>
                <input type="range" id="popup-rotation" min="0" max="360" value="${Math.round(element.rotation)}" style="width:100%; margin-top:5px;">
                <div style="text-align:right; font-size:10px; opacity:0.6;" id="popup-rot-val">${Math.round(element.rotation)}°</div>
            </div>

            <button id="save-popup-btn" class="popup-save-btn">APLICAR CAMBIOS</button>
            <button id="delete-popup-btn" style="width:100%; padding:8px; background:#e74c3c; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; margin-top:10px; font-size:11px;">ELIMINAR</button>
        </div>
    `;

    const popup = L.popup({
        closeButton: true,
        autoClose: true,
        className: 'custom-edit-popup'
    })
    .setLatLng(latlng || element.moveMarker.getLatLng())
    .setContent(content)
    .openOn(map);

    // Esperar a que el DOM del popup esté listo
    setTimeout(() => {
        const saveBtn = document.getElementById('save-popup-btn');
        const deleteBtn = document.getElementById('delete-popup-btn');
        const rotSlider = document.getElementById('popup-rotation');
        const rotVal = document.getElementById('popup-rot-val');

        if (rotSlider) {
            rotSlider.oninput = () => {
                rotVal.innerText = `${rotSlider.value}°`;
                element.rotation = parseFloat(rotSlider.value);
                updateElementShape(element, false);
            };
        }

        if (saveBtn) {
            saveBtn.onclick = () => {
                element.name = document.getElementById('popup-name').value;
                element.length = parseFloat(document.getElementById('popup-length').value) || 1;
                if (element.isRectangle) {
                    element.width = parseFloat(document.getElementById('popup-width').value) || 1;
                }
                updateElementShape(element, true);
                updateElementCard(element);
                if (editingElement && editingElement.id === element.id) selectElement(element);
                map.closePopup();
                saveHistory();
            };
        }

        if (deleteBtn) {
            deleteBtn.onclick = () => {
                if (confirm('¿Estás seguro de que quieres eliminar este elemento?')) {
                    deleteElement(element);
                    map.closePopup();
                    saveHistory();
                }
            };
        }
    }, 50);
}

// "Borrar" en Modo Ilustrado nunca borra de verdad -el elemento es el mismo
// en todos los planos (2D técnico, 3D, medidas), así que borrarlo ahí lo
// borraría de todos ellos, justo lo que no se quiere al estar solo
// retocando el aspecto del plano ilustrado-. En su lugar se oculta con el
// mismo mecanismo que el botón de ojo (◉/◌) de la lista, reversible desde
// ahí en cualquier momento. El "Edificio (referencia)" queda FUERA de esta
// protección: a diferencia del resto de elementos, ya se mueve/gira de
// verdad dentro del Mapa Ilustrado (ver shouldShowControls), así que
// tratarlo como "oculto, no borrado" solo confundía -parecía que "no
// dejaba eliminar" cuando en realidad sí borraba, pero solo visualmente-.
function hideElementFromIllustrated(element) {
    element.illustratedHidden = true;
    updateElementCard(element);
    updateElementShape(element, true);
    saveHistory();
}

function deleteElement(element) {
    if (isIllustratedMode && element.type !== 'custom-building') {
        hideElementFromIllustrated(element);
        return;
    }
	if (element.isRectangle) map.removeLayer(element.rectangle);
    else if (element.isPolygon) map.removeLayer(element.polygon);
    else if (element.isLine) map.removeLayer(element.line);
    map.removeLayer(element.labelMarker); map.removeLayer(element.moveMarker);
    if (element.rotateMarker) map.removeLayer(element.rotateMarker);
    if (element.routeLine) map.removeLayer(element.routeLine);
	const card = document.getElementById(`element-card-${element.id}`);
    if (card) card.remove();
	elements = elements.filter(el => el.id !== element.id);
	document.getElementById('edit-panel').style.display = 'none'; editingElement = null;
    updateStats();
}

function bindMarkerEvents(element) { 
    let lastTap = 0;
    
    const onDblClick = (e) => {
        if (e.originalEvent) {
            L.DomEvent.stopPropagation(e.originalEvent);
            L.DomEvent.preventDefault(e.originalEvent);
        }
        showEditPopup(element, e.latlng || element.moveMarker.getLatLng());
    };

    const onTouchStart = (e) => {
        const now = Date.now();
        const timesince = now - lastTap;
        if (timesince < 300 && timesince > 0) {
            if (e.originalEvent) L.DomEvent.preventDefault(e.originalEvent);
            onDblClick(e);
        }
        lastTap = now;
    };

    // Eventos para el marcador de movimiento
    element.moveMarker.on('click', () => selectElement(element)); 
    element.moveMarker.on('dblclick', onDblClick);
    element.moveMarker.on('touchstart', onTouchStart);
    element.moveMarker.on('contextmenu', (e) => onDblClick(e));

    // Eventos para el marcador de etiqueta
    element.labelMarker.on('click', () => selectElement(element)); 
    element.labelMarker.on('dblclick', onDblClick);
    element.labelMarker.on('touchstart', onTouchStart);
    element.labelMarker.on('contextmenu', (e) => onDblClick(e));

    // Eventos para la forma (Rectángulo, Línea, o Polígono a mano)
    const shape = element.isRectangle ? element.rectangle : (element.isPolygon ? element.polygon : element.line);
    shape.on('dblclick', onDblClick);
    shape.on('touchstart', onTouchStart);
    shape.on('contextmenu', (e) => onDblClick(e));
    shape.on('click', (e) => {
        if (!isFestivalMode) selectElement(element);
    });

    if (element.rotateMarker) {
        element.rotateMarker.on('click', (e) => { 
            L.DomEvent.stopPropagation(e); 
            selectElement(element); 
        });
    }
}
// Iconos dibujados (SVG en línea, no emoji) para el Mapa Ilustrado: cada
// uno es un pequeño "sticker" a todo color (no un trazo blanco sobre una
// insignia cuadrada), con un fondo elíptico de sombra para que floten sobre
// el césped como en un mapa de festival ilustrado.
function getPinIconSVG(iconKey, color, rotationDeg) {
    const bg = color || '#7f8c8d';
    const arrowRotation = rotationDeg || 0;
    const D = '#242424'; // trazo oscuro común a todos los iconos
    const shadow = '<ellipse cx="32" cy="57" rx="18" ry="4" fill="rgba(0,0,0,0.22)"/>';
    const icons = {
        'stage': `<svg viewBox="0 0 64 64">${shadow}
            <rect x="3" y="10" width="58" height="6" rx="1.5" fill="#2b2b2b" stroke="${D}" stroke-width="1.5"/>
            <rect x="3" y="14" width="7" height="36" fill="#2b2b2b" stroke="${D}" stroke-width="1.5"/>
            <rect x="54" y="14" width="7" height="36" fill="#2b2b2b" stroke="${D}" stroke-width="1.5"/>
            <rect x="1" y="30" width="11" height="21" rx="1.5" fill="#1b1b1b" stroke="${D}" stroke-width="1.6"/>
            <rect x="52" y="30" width="11" height="21" rx="1.5" fill="#1b1b1b" stroke="${D}" stroke-width="1.6"/>
            <circle cx="4.5" cy="35" r="2.2" fill="#3a3a3a"/><circle cx="8.5" cy="35" r="2.2" fill="#3a3a3a"/>
            <circle cx="4.5" cy="43" r="2.2" fill="#3a3a3a"/><circle cx="8.5" cy="43" r="2.2" fill="#3a3a3a"/>
            <circle cx="55.5" cy="35" r="2.2" fill="#3a3a3a"/><circle cx="59.5" cy="35" r="2.2" fill="#3a3a3a"/>
            <circle cx="55.5" cy="43" r="2.2" fill="#3a3a3a"/><circle cx="59.5" cy="43" r="2.2" fill="#3a3a3a"/>
            <rect x="14" y="19" width="36" height="23" rx="2" fill="#17181c" stroke="${D}" stroke-width="2"/>
            <rect x="17" y="22" width="30" height="17" rx="1" fill="${bg}"/>
            <path d="M20 39 26 27h4l-3 6h5l-8 12 2-9z" fill="#fff6df" opacity="0.9"/>
            <rect x="10" y="42" width="44" height="10" rx="2" fill="${bg}" stroke="${D}" stroke-width="2.5"/>
            <circle cx="9" cy="13" r="2.6" fill="#ffe27a" stroke="${D}" stroke-width="1.2"/>
            <circle cx="20" cy="13" r="2.6" fill="#ffe27a" stroke="${D}" stroke-width="1.2"/>
            <circle cx="32" cy="13" r="2.6" fill="#ffe27a" stroke="${D}" stroke-width="1.2"/>
            <circle cx="44" cy="13" r="2.6" fill="#ffe27a" stroke="${D}" stroke-width="1.2"/>
            <circle cx="55" cy="13" r="2.6" fill="#ffe27a" stroke="${D}" stroke-width="1.2"/>
        </svg>`,
        // Copa de cóctel: icono simple y reconocible al vuelo (el anterior,
        // una barra con toldo y botellitas, quedaba demasiado cargado a
        // tamaño pequeño y no convencía).
        'bar': `<svg viewBox="0 0 64 64">${shadow}
            <path d="M12 12h40L34 36h-4L12 12Z" fill="${bg}" stroke="${D}" stroke-width="2.5" stroke-linejoin="round"/>
            <path d="M17 17h30l-5 6H22Z" fill="#fff6df" opacity="0.85"/>
            <rect x="29" y="34" width="6" height="15" fill="${bg}" stroke="${D}" stroke-width="2.2"/>
            <rect x="17" y="48" width="30" height="7" rx="2.5" fill="${bg}" stroke="${D}" stroke-width="2.2"/>
            <circle cx="23" cy="19" r="3.4" fill="#8bc34a" stroke="${D}" stroke-width="1.3"/>
            <path d="M23 19 30 25" stroke="${D}" stroke-width="1.8" stroke-linecap="round"/>
        </svg>`,
        // Furgoneta de comida en silueta plana (caja + cabina con parabrisas
        // inclinado, ruedas redondas, plato+cubiertos en el lateral) -pedido
        // explícito por el usuario a partir de una imagen de referencia-.
        'food': `<svg viewBox="0 0 64 64">${shadow}
            <path d="M4 18h32v26H6a2 2 0 0 1-2-2V20a2 2 0 0 1 2-2Z" fill="${bg}" stroke="${D}" stroke-width="2.5" stroke-linejoin="round"/>
            <path d="M36 18h9l11 12v10a2 2 0 0 1-2 2H36Z" fill="${bg}" stroke="${D}" stroke-width="2.5" stroke-linejoin="round"/>
            <path d="M42 23h3l8 7H42Z" fill="#dff0fa" stroke="${D}" stroke-width="1.4" stroke-linejoin="round"/>
            <circle cx="16" cy="46" r="7.5" fill="${D}"/><circle cx="16" cy="46" r="3.6" fill="#fff"/>
            <circle cx="46" cy="46" r="7.5" fill="${D}"/><circle cx="46" cy="46" r="3.6" fill="#fff"/>
            <circle cx="14" cy="29" r="6" fill="none" stroke="#fff" stroke-width="2.2"/>
            <path d="M23 22v14M21.3 22v5c0 1 .7 1.6 1.7 1.6s1.7-.6 1.7-1.6v-5" stroke="#fff" stroke-width="1.7" stroke-linecap="round" fill="none"/>
            <path d="M29 22c2.5 0 3.5 2 3.5 4.5S31.5 30 29 30v6" stroke="#fff" stroke-width="1.7" stroke-linecap="round" fill="none"/>
        </svg>`,
        'custom': `<svg viewBox="0 0 64 64">${shadow}
            <rect x="14" y="12" width="36" height="40" rx="10" fill="${bg}" stroke="${D}" stroke-width="2.5"/>
            <path d="M35 18 20 38h10l-3 14 18-22H35Z" fill="#fff6df" stroke="${D}" stroke-width="2" stroke-linejoin="round"/>
        </svg>`,
        'wc': `<svg viewBox="0 0 64 64">${shadow}
            <circle cx="20" cy="14" r="6" fill="${bg}" stroke="${D}" stroke-width="2.2"/>
            <path d="M11 42 14 24h12l3 18Z" fill="${bg}" stroke="${D}" stroke-width="2.2" stroke-linejoin="round"/>
            <rect x="14" y="42" width="4" height="14" rx="2" fill="${bg}" stroke="${D}" stroke-width="2"/>
            <rect x="22" y="42" width="4" height="14" rx="2" fill="${bg}" stroke="${D}" stroke-width="2"/>
            <circle cx="44" cy="14" r="6" fill="#e88ec4" stroke="${D}" stroke-width="2.2"/>
            <path d="M34 44c0-11 4.5-20 10-20s10 9 10 20Z" fill="#e88ec4" stroke="${D}" stroke-width="2.2"/>
            <rect x="38" y="44" width="4" height="12" rx="2" fill="#e88ec4" stroke="${D}" stroke-width="2"/>
            <rect x="46" y="44" width="4" height="12" rx="2" fill="#e88ec4" stroke="${D}" stroke-width="2"/>
        </svg>`,
        'parking': `<svg viewBox="0 0 64 64">${shadow}
            <rect x="10" y="10" width="44" height="44" rx="9" fill="${bg}" stroke="${D}" stroke-width="2.5"/>
            <text x="32" y="43" font-family="Arial, sans-serif" font-size="30" font-weight="800" fill="#fff" text-anchor="middle">P</text>
        </svg>`,
        'disabled': `<svg viewBox="0 0 64 64">${shadow}
            <circle cx="32" cy="32" r="22" fill="${bg}" stroke="${D}" stroke-width="2.5"/>
            <circle cx="30" cy="16" r="4" fill="#fff"/>
            <path d="M30 22v10l8 5M30 32h-9M23 46l7-10M40 46l-6-9" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <circle cx="26" cy="41" r="9" fill="none" stroke="#fff" stroke-width="3"/>
        </svg>`,
        'noparking': `<svg viewBox="0 0 64 64">${shadow}
            <circle cx="32" cy="32" r="22" fill="#fff" stroke="${D}" stroke-width="2.5"/>
            <text x="30" y="42" font-family="Arial, sans-serif" font-size="28" font-weight="800" fill="#3498db" text-anchor="middle">P</text>
            <circle cx="32" cy="32" r="22" fill="none" stroke="#e74c3c" stroke-width="6.5"/>
            <line x1="17" y1="17" x2="47" y2="47" stroke="#e74c3c" stroke-width="6.5" stroke-linecap="round"/>
        </svg>`,
        'no-entry': `<svg viewBox="0 0 64 64">${shadow}
            <circle cx="32" cy="32" r="22" fill="#e74c3c" stroke="${D}" stroke-width="2.5"/>
            <rect x="16" y="28" width="32" height="8" rx="2" fill="#fff"/>
        </svg>`,
        'exit': `<svg viewBox="0 0 64 64">${shadow}
            <rect x="8" y="14" width="48" height="34" rx="4" fill="#1e8f4e" stroke="${D}" stroke-width="2.5"/>
            <circle cx="20" cy="22" r="3" fill="#fff"/>
            <path d="M20 27v8l6 4M20 35h-6M14 45l6-9M27 45l-4-6" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <path d="M32 30h18m0 0-6-6m6 6-6 6" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>`,
        'star': `<svg viewBox="0 0 64 64">${shadow}<path d="M32 8l7.6 17.8L58 27.6l-14.4 12.6L48 58l-16-10.4L16 58l4.4-17.8L6 27.6l18.4-1.8Z" fill="${bg}" stroke="${D}" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
        'tent': `<svg viewBox="0 0 64 64">${shadow}
            <path d="M6 50 32 10 58 50Z" fill="${bg}" stroke="${D}" stroke-width="2.5" stroke-linejoin="round"/>
            <path d="M20 50 32 28 44 50Z" fill="${D}" opacity="0.28"/>
            <path d="M32 10v40" stroke="${D}" stroke-width="2"/>
        </svg>`,
        'rest': `<svg viewBox="0 0 64 64">${shadow}<path d="M32 8v48" stroke="${D}" stroke-width="3"/><path d="M8 32a24 24 0 0 1 48 0Z" fill="${bg}" stroke="${D}" stroke-width="2.5"/></svg>`,
        'first-aid': `<svg viewBox="0 0 64 64">${shadow}
            <rect x="10" y="10" width="44" height="44" rx="10" fill="${bg}" stroke="${D}" stroke-width="2.5"/>
            <path d="M32 20v24M20 32h24" stroke="#fff" stroke-width="7" stroke-linecap="round"/>
        </svg>`,
        'fence': `<svg viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="1.8" stroke-linecap="round"><path d="M4 4v16M9 4v16M15 4v16M20 4v16"/><path d="M2 9h20M2 15h20"/></svg>`,
        // Flecha grande de dirección (tipo cartel de carretera hacia una
        // población cercana): sin sombra elíptica porque suele ir apoyada en
        // el borde del mapa, no "flotando" sobre el césped como el resto.
        'arrow-direction': `<svg viewBox="0 0 64 64">
            <path d="M32 3 58 32H44v29H20V32H6Z" fill="${bg}" stroke="${D}" stroke-width="2.8" stroke-linejoin="round"/>
        </svg>`,
        'panic-fence': `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16M4 15h16"/><path d="M6 6v12M18 6v12"/></svg>`,
        'security': `<svg viewBox="0 0 64 64">${shadow}
            <path d="M32 8 52 16v16c0 14-9 22-20 26C21 54 12 46 12 32V16Z" fill="${bg}" stroke="${D}" stroke-width="2.5" stroke-linejoin="round"/>
            <path d="M23 32l6 6 12-14" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        // El arco/porche (con sus "patas" abajo) se queda SIEMPRE derecho
        // -si giraba entero con el elemento, con cualquier rotación dejaba
        // de leerse como "entrada" y quedaba de lado-. Solo la flecha
        // amarilla (dentro de su propio <g>) gira con element.rotation, ver
        // el tercer argumento rotationDeg más abajo y su uso en
        // updateElementShape.
        'entrance': `<svg viewBox="0 0 64 64">${shadow}
            <path d="M12 54V26a20 20 0 0 1 40 0v28" fill="none" stroke="${bg}" stroke-width="7" stroke-linecap="round"/>
            <rect x="8" y="50" width="10" height="8" rx="2" fill="${bg}" stroke="${D}" stroke-width="2"/>
            <rect x="46" y="50" width="10" height="8" rx="2" fill="${bg}" stroke="${D}" stroke-width="2"/>
            <path d="M22 14l3 6h6l-5 4 2 6-6-4-6 4 2-6-5-4h6Z" fill="#ffd75e" stroke="${D}" stroke-width="1.6" stroke-linejoin="round"/>
            <g transform="rotate(${arrowRotation} 32 32)">
                <path d="M58 6c6 10 2 22-10 26" fill="none" stroke="#ffd400" stroke-width="5" stroke-linecap="round"/>
                <path d="M42 28l6 4 6-3" fill="none" stroke="#ffd400" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
            </g>
        </svg>`,
        // Edificio de referencia (ver festivalConfig['custom-building']):
        // mismo tono teja que los edificios reales pintados en el fondo del
        // Mapa Ilustrado, para que uno colocado a mano no desentone.
        'building': `<svg viewBox="0 0 64 64">${shadow}
            <path d="M10 26 32 10 54 26v28H10Z" fill="${bg}" stroke="${D}" stroke-width="2.5" stroke-linejoin="round"/>
            <rect x="16" y="30" width="10" height="10" fill="#fff6df" stroke="${D}" stroke-width="1.5"/>
            <rect x="38" y="30" width="10" height="10" fill="#fff6df" stroke="${D}" stroke-width="1.5"/>
            <rect x="27" y="42" width="10" height="12" fill="#8f7350" stroke="${D}" stroke-width="1.5"/>
        </svg>`,
        'drunk': `<svg viewBox="0 0 64 64">${shadow}
            <circle cx="28" cy="14" r="6" fill="#f4c790" stroke="${D}" stroke-width="2.2"/>
            <path d="M28 20v16" stroke="${D}" stroke-width="3" stroke-linecap="round"/>
            <path d="M28 24 18 20" stroke="${D}" stroke-width="3" stroke-linecap="round"/>
            <path d="M28 24 40 20" stroke="${D}" stroke-width="3" stroke-linecap="round"/>
            <rect x="38" y="14" width="8" height="8" fill="${bg}" stroke="${D}" stroke-width="2"/>
            <path d="M24 36 16 54" stroke="${D}" stroke-width="3" stroke-linecap="round"/>
            <path d="M28 36 36 54" stroke="${D}" stroke-width="3" stroke-linecap="round"/>
        </svg>`,
        'tiburon': `<svg viewBox="0 0 64 64">${shadow}
            <circle cx="32" cy="14" r="6.5" fill="#f4c790" stroke="${D}" stroke-width="2.2"/>
            <rect x="24" y="12" width="16" height="4" rx="1" fill="${D}"/>
            <path d="M32 21v14" stroke="${D}" stroke-width="4" stroke-linecap="round"/>
            <path d="M32 24 18 16" stroke="${D}" stroke-width="4" stroke-linecap="round"/>
            <path d="M32 24 46 16" stroke="${D}" stroke-width="4" stroke-linecap="round"/>
            <path d="M27 35 20 54" stroke="${D}" stroke-width="4" stroke-linecap="round"/>
            <path d="M32 35 39 54" stroke="${D}" stroke-width="4" stroke-linecap="round"/>
            <g transform="translate(13,10) rotate(-15)"><rect width="11" height="6" rx="1" fill="${bg}" stroke="${D}" stroke-width="1.4"/></g>
            <g transform="translate(11,15) rotate(-25)"><rect width="11" height="6" rx="1" fill="${bg}" stroke="${D}" stroke-width="1.4"/></g>
            <g transform="translate(41,10) rotate(15)"><rect width="11" height="6" rx="1" fill="${bg}" stroke="${D}" stroke-width="1.4"/></g>
            <g transform="translate(43,15) rotate(25)"><rect width="11" height="6" rx="1" fill="${bg}" stroke="${D}" stroke-width="1.4"/></g>
        </svg>`
    };
    return icons[iconKey] || `<svg viewBox="0 0 64 64">${shadow}<circle cx="32" cy="30" r="18" fill="${bg}" stroke="${D}" stroke-width="2.5"/></svg>`;
}
function getGenericIconUrl(type) {
    const genericIcons = { 
        'stage': 'assets/icons/stage.svg', 
        'food': 'assets/icons/food.svg', 
        'bar': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjFjNDBmIi8+PHRleHQgeD0iNTAiIHk9IjYwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iNDAiIGZpbGw9ImJsYWNrIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXdlaWdodD0iYm9sZCI+QkFSPC90ZXh0Pjwvc3ZnPg==', 
        'wc': 'assets/icons/wc.svg', 
        'rest': 'assets/icons/rest.svg', 
        'first-aid': 'assets/icons/first-aid.svg', 
        'parking': 'assets/icons/parking.svg',
        'no-entry': 'assets/icons/no-entry.svg',
        'fence': 'assets/icons/fence.svg',
        'panic-fence': 'assets/icons/panic-fence.svg',
        'tent': 'assets/icons/tent.svg',
        'security': 'assets/icons/security.svg',
        'entrance': 'assets/icons/entrance.svg',
        'drunk': 'assets/icons/drunk.svg',
        'disabled': 'https://upload.wikimedia.org/wikipedia/commons/0/0c/Wheelchair_symbol.svg',
        'noparking': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0NSIgZmlsbD0iIzM0OThkYiIgc3Ryb2tlPSIjZTc0YzNjIiBzdHJva2Utd2lkdGg9IjEwIi8+PGxpbmUgeDE9IjE4IiB5MT0iMTgiIHgyPSI4MiIgeTI9IjgyIiBzdHJva2U9IiNlNzRjM2MiIHN0cm9rZS13aWR0aD0iMTAiLz48L3N2Zz4=',
        'exit': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMjdhZTYwIi8+PHBhdGggZD0iTTMwIDIwaDQwdjYwSDMwek03NSA1MGwtMTUgMTBNNzUgNTBsLTE1LTEwIiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjgiLz48L3N2Zz4=',
        'star': 'https://upload.wikimedia.org/wikipedia/commons/e/e5/Full_Star_Yellow.svg',
        'wc_signal': 'https://upload.wikimedia.org/wikipedia/commons/4/40/Restroom_sign.svg',
        'road-label': 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><rect width="100%" height="100%" rx="8" fill="#e74c3c"/><text x="50" y="36" font-family="Arial" font-size="16" fill="#fff" text-anchor="middle" font-weight="bold">VIA</text></svg>'),
        'arrow-direction': 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path d="M50 5 90 50h-22v45h-36V50H6Z" fill="#e74c3c" stroke="#242424" stroke-width="4"/></svg>')
    };
    return genericIcons[type] || 'assets/icons/default.svg';
}
