
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
    'entrance': { label: 'ENTRADA', color: '#f1c40f', icon: 'entrance', defaultLen: 6, defaultWid: 2 },
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
        map.removeLayer(currentMapLayer);
        currentMapLayer = mapLayers['cartodb-voyager'];
        currentMapLayer.addTo(map);
        
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

    } else {
        mapContainer.classList.remove('illustrated-style');
        map.removeLayer(currentMapLayer);
        currentMapLayer = mapLayers['esri-satellite'];
        currentMapLayer.addTo(map);
        
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
        const shouldShowControls = !isIllustratedMode && !isFestivalMode;
        
        // Etiquetas y Marcadores totalmente no interactivos en modo ilustrado
        if (el.labelMarker) {
            if (isIllustratedMode) {
                el.labelMarker.getElement().style.pointerEvents = 'none';
            } else {
                el.labelMarker.getElement().style.pointerEvents = 'auto';
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

        if (el.isRectangle) {
            el.rectangle.setStyle({
                fillOpacity: isIllustratedMode ? 0 : 0.6,
                weight: isIllustratedMode ? 0 : 2,
                color: isIllustratedMode ? 'transparent' : el.color,
                interactive: !isIllustratedMode 
            });
        } else if (el.isLine) {
            el.line.setStyle({
                weight: isIllustratedMode ? 0 : 5,
                opacity: isIllustratedMode ? 0 : 1,
                interactive: !isIllustratedMode
            });
        }
        updateElementShape(el, true);
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
        if (isIllustratedMode && element.illustratedHidden) {
            element.labelMarker.setIcon(L.divIcon({ className: 'illustrated-label', html: '', iconSize: [0, 0] }));
        } else if (hasBadgeIcon) {
            const displayName = element.name !== config.label ? element.name : config.label;
            const iconKey = config.icon;
            const isZone = element.type.startsWith('zone');
            const hiddenClass = showLabels ? '' : 'hidden-label';

            if (isZone) {
                // Área traslúcida a escala real, con una etiqueta centrada (sin pin).
                const mapBearing = (map.getBearing ? map.getBearing() : 0);
                const totalRotation = element.rotation + mapBearing;
                const pCenter = map.latLngToLayerPoint(center);
                const pEdge = map.latLngToLayerPoint(L.latLng(center.lat, center.lng + (10 / (111320 * latScale))));
                const pxPerMeter = pCenter.distanceTo(pEdge) / 10;
                const wPx = length * pxPerMeter;
                const hPx = width * pxPerMeter;

                element.rectangle.setStyle({ fillOpacity: 0.35, weight: 2, color: element.color });

                const iconHTML = `<div style="width:${wPx}px; height:${hPx}px; display:flex; align-items:center; justify-content:center; transform:rotate(${totalRotation}deg);">
                    <div class="map-pin-area-label ${hiddenClass}">${displayName}</div>
                </div>`;
                element.labelMarker.setIcon(L.divIcon({
                    className: 'illustrated-label',
                    html: iconHTML,
                    iconSize: [wPx, hPx], iconAnchor: [wPx / 2, hPx / 2]
                }));
            } else if (element.isLine) {
                // Vallas: fila de icono a escala real, sin pin ni nombre (son lineales,
                // y con muchas vallas juntas los nombres tapan todo el mapa).
                const pCenter = map.latLngToLayerPoint(center);
                const pEdge = map.latLngToLayerPoint(L.latLng(center.lat, center.lng + (10 / (111320 * latScale))));
                const pxPerMeter = pCenter.distanceTo(pEdge) / 10;
                const wPx = length * pxPerMeter;
                const hPx = Math.min(25, (wPx / element.numVallas) * 0.8);
                const mapBearing = (map.getBearing ? map.getBearing() : 0);
                const totalRotation = element.rotation + mapBearing;
                const vW = wPx / element.numVallas;

                const iconHTML = `<div style="width:${wPx}px; height:${hPx}px; display:flex; transform:rotate(${totalRotation}deg); transform-origin:center center;">
                    ${Array(element.numVallas).fill(`<img src="${getGenericIconUrl(iconKey)}" style="width:${vW}px; height:100%;">`).join('')}
                </div>`;
                element.labelMarker.setIcon(L.divIcon({
                    className: 'illustrated-label',
                    html: iconHTML,
                    // El punto de anclaje tiene que coincidir con el
                    // transform-origin (centro) del div que rota; si no,
                    // la valla "orbita" alrededor de otro punto al girar
                    // el mapa y parece que cambia de sitio.
                    iconSize: [wPx, hPx], iconAnchor: [wPx / 2, hPx / 2]
                }));
            } else {
                // Elementos puntuales: sticker ilustrado a todo color (sin
                // caja/cuadrado de fondo), más una burbuja con el nombre
                // encima (como en un mapa ilustrado de festival). La burbuja
                // respeta el toggle "OCULTAR TEXTOS" para evitar que se amontonen.
                const badgeSize = element.type === 'main-stage' ? 72 : 52;
                const bg = element.color || '#7f8c8d';
                const iconSvg = getPinIconSVG(iconKey, bg);
                // La burbuja con el nombre solo aparece en el Mapa Ilustrado;
                // fuera de él (caso "security" siempre con insignia) se deja
                // como antes, solo el icono, para no ensuciar la edición.
                const bubbleH = isIllustratedMode ? 34 : 0;
                const boxW = isIllustratedMode ? Math.max(90, Math.min(220, displayName.length * 7 + 34)) : badgeSize;
                const totalH = bubbleH + badgeSize;

                const iconHTML = `<div class="map-pin" style="width:${boxW}px;" title="${displayName}">
                    ${isIllustratedMode ? `<div class="map-pin-bubble ${hiddenClass}">${displayName}</div>` : ''}
                    <div class="map-pin-badge" style="width:${badgeSize}px;height:${badgeSize}px;">${iconSvg}</div>
                </div>`;
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
            Array.from(typesPresent).sort().forEach(type => {
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
        updateElementShape(element, false);
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

	document.getElementById('add-element').onclick = function() {
		const type = elemType.value;
		if (isFenceType(type) && document.getElementById('fence-mode').value === 'draw') {
            startFenceDrawing(type);
        } else if (type === 'security' && document.getElementById('patrol-mode').value === 'draw') {
            const name = document.getElementById('element-name').value || festivalConfig[type].label;
            startPatrolPathDrawing(type, name);
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
			if (editingElement.isRectangle) map.removeLayer(editingElement.rectangle); else if (editingElement.isLine) map.removeLayer(editingElement.line);
            map.removeLayer(editingElement.labelMarker); map.removeLayer(editingElement.moveMarker);
            if (editingElement.routeLine) map.removeLayer(editingElement.routeLine);
			document.getElementById(`element-card-${editingElement.id}`).remove();
			elements = elements.filter(el => el.id !== editingElement.id);
			document.getElementById('edit-panel').style.display = 'none'; editingElement = null;
            updateStats();
            saveHistory();
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
    const element = { id: Date.now(), type, name, line, labelMarker, moveMarker, length: len, numVallas: Math.ceil(len / 2), isLine: true, isRectangle: false, color: config.color, iconUrl: getGenericIconUrl(config.icon), rotation: rotation };
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

    const element = { id: Date.now(), type, name, rectangle, labelMarker, moveMarker, length, width, rotation: rotation, isRectangle: true, color: config.color, iconUrl: getGenericIconUrl(config.icon) };

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

function deleteElement(element) {
	if (element.isRectangle) map.removeLayer(element.rectangle); else if (element.isLine) map.removeLayer(element.line);
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

    // Eventos para la forma (Rectángulo o Línea)
    const shape = element.isRectangle ? element.rectangle : element.line;
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
function getPinIconSVG(iconKey, color) {
    const bg = color || '#7f8c8d';
    const D = '#242424'; // trazo oscuro común a todos los iconos
    const shadow = '<ellipse cx="32" cy="57" rx="18" ry="4" fill="rgba(0,0,0,0.22)"/>';
    const icons = {
        'stage': `<svg viewBox="0 0 64 64">${shadow}
            <rect x="14" y="34" width="36" height="20" rx="3" fill="${bg}" stroke="${D}" stroke-width="2.5"/>
            <path d="M10 34 32 12 54 34Z" fill="${bg}" stroke="${D}" stroke-width="2.5" stroke-linejoin="round"/>
            <path d="M32 12v22" stroke="${D}" stroke-width="2"/>
            <circle cx="20" cy="23" r="3.2" fill="#fff6df" stroke="${D}" stroke-width="1.6"/>
            <circle cx="44" cy="23" r="3.2" fill="#fff6df" stroke="${D}" stroke-width="1.6"/>
            <rect x="20" y="39" width="24" height="12" rx="2" fill="${D}" opacity="0.25"/>
            <path d="M27 51v-9M32 51v-11M37 51v-9" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.75"/>
        </svg>`,
        'bar': `<svg viewBox="0 0 64 64">${shadow}
            <path d="M16 14h32L35 35v15h5v4H24v-4h5V35Z" fill="${bg}" stroke="${D}" stroke-width="2.5" stroke-linejoin="round"/>
            <path d="M20 18h24" stroke="#fff" stroke-width="2" opacity="0.65"/>
            <circle cx="41" cy="16" r="3" fill="#e74c3c" stroke="${D}" stroke-width="1.4"/>
        </svg>`,
        'food': `<svg viewBox="0 0 64 64">${shadow}
            <path d="M12 28c0-9 9-16 20-16s20 7 20 16H12Z" fill="#e8b656" stroke="${D}" stroke-width="2.5"/>
            <circle cx="22" cy="18" r="1.6" fill="#fff"/><circle cx="32" cy="15" r="1.6" fill="#fff"/><circle cx="42" cy="18" r="1.6" fill="#fff"/>
            <rect x="11" y="28" width="42" height="6" fill="${bg}" stroke="${D}" stroke-width="2"/>
            <path d="M10 34c2 4 8 5 22 5s20-1 22-5" fill="#6b3f22" stroke="${D}" stroke-width="2.5"/>
            <rect x="12" y="42" width="40" height="9" rx="4" fill="#e8b656" stroke="${D}" stroke-width="2.5"/>
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
            <circle cx="32" cy="32" r="22" fill="${bg}" stroke="${D}" stroke-width="2.5"/>
            <text x="32" y="42" font-family="Arial, sans-serif" font-size="28" font-weight="800" fill="#fff" text-anchor="middle">P</text>
        </svg>`,
        'disabled': `<svg viewBox="0 0 64 64">${shadow}
            <circle cx="32" cy="32" r="22" fill="${bg}" stroke="${D}" stroke-width="2.5"/>
            <circle cx="30" cy="16" r="4" fill="#fff"/>
            <path d="M30 22v10l8 5M30 32h-9M23 46l7-10M40 46l-6-9" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <circle cx="26" cy="41" r="9" fill="none" stroke="#fff" stroke-width="3"/>
        </svg>`,
        'noparking': `<svg viewBox="0 0 64 64">${shadow}
            <circle cx="32" cy="32" r="22" fill="#3498db" stroke="${D}" stroke-width="2.5"/>
            <circle cx="32" cy="32" r="22" fill="none" stroke="#e74c3c" stroke-width="6"/>
            <line x1="18" y1="18" x2="46" y2="46" stroke="#e74c3c" stroke-width="6" stroke-linecap="round"/>
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
        'panic-fence': `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16M4 15h16"/><path d="M6 6v12M18 6v12"/></svg>`,
        'security': `<svg viewBox="0 0 64 64">${shadow}
            <path d="M32 8 52 16v16c0 14-9 22-20 26C21 54 12 46 12 32V16Z" fill="${bg}" stroke="${D}" stroke-width="2.5" stroke-linejoin="round"/>
            <path d="M23 32l6 6 12-14" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        'entrance': `<svg viewBox="0 0 64 64">${shadow}
            <path d="M12 54V26a20 20 0 0 1 40 0v28" fill="none" stroke="${bg}" stroke-width="7" stroke-linecap="round"/>
            <rect x="8" y="50" width="10" height="8" rx="2" fill="${bg}" stroke="${D}" stroke-width="2"/>
            <rect x="46" y="50" width="10" height="8" rx="2" fill="${bg}" stroke="${D}" stroke-width="2"/>
            <path d="M22 14l3 6h6l-5 4 2 6-6-4-6 4 2-6-5-4h6Z" fill="#ffd75e" stroke="${D}" stroke-width="1.6" stroke-linejoin="round"/>
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
        'wc_signal': 'https://upload.wikimedia.org/wikipedia/commons/4/40/Restroom_sign.svg'
    }; 
    return genericIcons[type] || 'assets/icons/default.svg'; 
}
