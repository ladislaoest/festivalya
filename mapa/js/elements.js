
// --- CONFIGURACIÓN DE ELEMENTOS ---
const festivalConfig = {
    'main-stage': { label: 'ESCENARIO', color: '#27ae60', icon: 'stage', defaultLen: 22, defaultWid: 10 },
    'bar': { label: 'BARRA', color: '#f1c40f', icon: 'bar', defaultLen: 6, defaultWid: 2 },
    'food-truck': { label: 'FOOD TRUCK', color: '#e67e22', icon: 'food', defaultLen: 4, defaultWid: 2 },
    'generator': { label: 'GENERADOR', color: '#9b59b6', icon: 'custom', defaultLen: 4, defaultWid: 2 },
    'wc': { label: 'ASEOS', color: '#3498db', icon: 'wc', defaultLen: 1, defaultWid: 1 },
    'fence': { label: 'VALLA', color: '#ffffff', icon: 'fence' },
    'signal-parking': { label: 'PARKING', color: '#3498db', icon: 'parking', defaultLen: 4, defaultWid: 4 },
    'signal-disabled': { label: 'MINUSVÁLIDOS', color: '#3498db', icon: 'disabled', defaultLen: 4, defaultWid: 4 },
    'signal-no-parking': { label: 'PROHIBIDO APARCAR', color: '#e74c3c', icon: 'noparking', defaultLen: 4, defaultWid: 4 },
    'signal-exit': { label: 'SALIDA EMERGENCIA', color: '#27ae60', icon: 'exit', defaultLen: 4, defaultWid: 4 },
    'signal-wc': { label: 'SEÑAL WC', color: '#3498db', icon: 'wc', defaultLen: 4, defaultWid: 4 },
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
let elements = [], selectedIcon = 'stage', editingElement = null;
let history = [];
const MAX_HISTORY = 20;

function saveHistory() {
    const state = JSON.stringify(elements.map(el => ({
        id: el.id, type: el.type, name: el.name,
        coords: el.moveMarker.getLatLng(),
        rotation: el.rotation,
        length: el.length, width: el.width, color: el.color
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
        if (el.type === 'fence') {
            element = addFixedFenceToMap(el.length, el.coords, el.rotation);
        } else {
            element = addRectangleToMap(el.name, el.type, el.coords, el.length, el.width, el.rotation);
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
        } else {
            if (el.moveMarker) el.moveMarker.addTo(map);
            if (el.rotateMarker) el.rotateMarker.addTo(map);
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
        
        // Desactivar navegación total absoluta
        map.dragging.disable();
        map.touchZoom.disable();
        map.doubleClickZoom.disable();
        map.scrollWheelZoom.disable();
        map.boxZoom.disable();
        map.keyboard.disable();
        if (map.tap) map.tap.disable();
        if (map.rotate) map.rotate.disable();
        if (map.touchRotate) map.touchRotate.disable(); // Específico de leaflet-rotate
        
        // Ocultar controles visuales
        if (map.zoomControl) map.zoomControl.remove();
        document.querySelectorAll('.leaflet-control').forEach(c => c.style.display = 'none');
        
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
            element.rectangle.setStyle({
                fillOpacity: isIllustratedMode ? 0 : 0.6,
                weight: isIllustratedMode ? (isFestivalMode ? 0 : 1) : 2,
                color: isIllustratedMode ? 'transparent' : element.color
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
		
        if (isIllustratedMode && element.illustratedHidden) {
            element.labelMarker.setIcon(L.divIcon({ className: 'illustrated-label', html: '', iconSize: [0, 0] }));
        } else if (isIllustratedMode) {
            const displayName = element.name !== config.label ? element.name : config.label;
            const iconKey = config.icon;
            const isZone = element.type.startsWith('zone');
            const hiddenClass = showLabels ? '' : 'hidden-label';

            if (isZone) {
                // Área traslúcida a escala real, con una etiqueta centrada (sin pin).
                const mapBearing = (map.getBearing ? map.getBearing() : 0);
                const totalRotation = element.rotation - mapBearing;
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
                // Vallas: fila de icono a escala real, sin pin (son lineales, no puntuales).
                const pCenter = map.latLngToLayerPoint(center);
                const pEdge = map.latLngToLayerPoint(L.latLng(center.lat, center.lng + (10 / (111320 * latScale))));
                const pxPerMeter = pCenter.distanceTo(pEdge) / 10;
                const wPx = length * pxPerMeter;
                const hPx = Math.min(25, (wPx / element.numVallas) * 0.8);
                const mapBearing = (map.getBearing ? map.getBearing() : 0);
                const totalRotation = element.rotation - mapBearing;
                const vW = wPx / element.numVallas;

                const iconHTML = `<div style="width:${wPx}px; height:${hPx + 24}px; display:flex; flex-direction:column; align-items:center; transform:rotate(${totalRotation}deg); transform-origin:center center;">
                    <div class="map-pin-bubble ${hiddenClass}">${displayName}</div>
                    <div style="display:flex; width:100%; height:${hPx}px;">
                        ${Array(element.numVallas).fill(`<img src="${getGenericIconUrl(iconKey)}" style="width:${vW}px; height:100%;">`).join('')}
                    </div>
                </div>`;
                element.labelMarker.setIcon(L.divIcon({
                    className: 'illustrated-label',
                    html: iconHTML,
                    iconSize: [wPx, hPx + 24], iconAnchor: [wPx / 2, hPx + 24]
                }));
            } else {
                // Elementos puntuales: insignia circular de tamaño fijo + burbuja con colita
                // (no se escalan al tamaño real ni rotan, como los pines de un mapa de verdad).
                const badgeSize = 44;
                const bubbleBlockHeight = 34; // burbuja + margen, medido a ojo con el CSS de .map-pin-bubble
                const totalHeight = badgeSize + bubbleBlockHeight;
                const bg = element.color || '#7f8c8d';
                const emoji = getPinEmoji(iconKey);

                const iconHTML = `<div class="map-pin">
                    <div class="map-pin-bubble ${hiddenClass}">${displayName}</div>
                    <div class="map-pin-badge" style="background:${bg};">${emoji}</div>
                </div>`;
                element.labelMarker.setIcon(L.divIcon({
                    className: 'illustrated-label',
                    html: iconHTML,
                    iconSize: [80, totalHeight], iconAnchor: [40, bubbleBlockHeight + badgeSize / 2]
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
    let totalVallasM = 0, totalVallasN = 0, totalWC = 0, totalFood = 0, totalBar = 0;
    const typesPresent = new Set();

    elements.forEach(el => {
        typesPresent.add(el.type);
        if (el.type === 'fence') { totalVallasM += el.length; totalVallasN += el.numVallas; }
        else if (el.type === 'wc') totalWC++;
        else if (el.type === 'food-truck') totalFood++;
        else if (el.type === 'bar') totalBar++;
    });

    document.getElementById('stat-vallas-m').innerText = totalVallasM.toFixed(1);
    document.getElementById('stat-vallas-n').innerText = totalVallasN;
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
                        ? `<div class="legend-pin" style="background:${config.color};">${getPinEmoji(config.icon)}</div>`
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
                'wc': 'signal-wc', 'fence': 'fence', 'custom': 'generator',
                'parking': 'signal-parking', 'disabled': 'signal-disabled', 'noparking': 'signal-no-parking',
                'exit': 'signal-exit'
            };
			if (elemType) { elemType.value = mapIconToType[this.dataset.icon]; elemType.dispatchEvent(new Event('change')); }
		};
	});

	if (elemType) {
		elemType.onchange = function() {
			document.getElementById('dimension-controls').style.display = (this.value === 'fence') ? 'none' : 'block';
            document.getElementById('fence-controls').style.display = (this.value === 'fence') ? 'block' : 'none';
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
		if (type === 'fence' && document.getElementById('fence-mode').value === 'draw') {
            startFenceDrawing();
        } else {
            const config = festivalConfig[type], name = document.getElementById('element-name').value || config.label;
            const length = type === 'fence' ? parseFloat(document.getElementById('fence-fixed-length').value) : parseFloat(document.getElementById('element-length').value);
            const width = parseFloat(document.getElementById('element-width').value) || 5;
            const element = (type === 'fence') ? addFixedFenceToMap(length) : addRectangleToMap(name, type, map.getCenter(), length, width);
            elements.push(element); updateElementCard(element); bindMarkerEvents(element);
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
			document.getElementById(`element-card-${editingElement.id}`).remove();
			elements = elements.filter(el => el.id !== editingElement.id);
			document.getElementById('edit-panel').style.display = 'none'; editingElement = null;
            updateStats();
            saveHistory();
		}
	};
}

function startFenceDrawing() {
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
            
            const element = addFixedFenceToMap(dist, L.latLngBounds(drawStartLatLng, e2.latlng).getCenter(), rotation);
            elements.push(element); updateElementCard(element); bindMarkerEvents(element);
            saveHistory();
        });
	});
}

function addFixedFenceToMap(len, center = map.getCenter(), rotation = 0) {
    const line = L.polyline([], { color: 'white', weight: 5, interactive: true, bubblingMouseEvents: false }).addTo(map);
    const moveMarker = L.marker(center, { icon: moveHandleIcon, draggable: true, zIndexOffset: 2000 });
    const labelMarker = L.marker(center, { icon: L.divIcon({ className: 'rectangle-label', html: '' }), draggable: true, zIndexOffset: 1000 });
    
    if (!isFestivalMode) {
        moveMarker.addTo(map);
        labelMarker.addTo(map);
    }

    const element = { id: Date.now(), type: 'fence', name: 'Valla', line, labelMarker, moveMarker, length: len, numVallas: Math.ceil(len / 2), isLine: true, isRectangle: false, color: '#ffffff', iconUrl: 'assets/icons/fence.svg', rotation: rotation };
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

function addRectangleToMap(name, type, center, length, width, rotation = 0) {
	const config = festivalConfig[type], rectangle = L.polygon([], { color: config.color, fillColor: config.color, weight: 2, fillOpacity: 0.6, interactive: true, bubblingMouseEvents: false }).addTo(map);
    const moveMarker = L.marker(center, { icon: moveHandleIcon, draggable: true, zIndexOffset: 2000 });
    const labelMarker = L.marker(center, { icon: L.divIcon({ className: 'rectangle-label', html: '' }), draggable: true, zIndexOffset: 1000 });
    
    if (!isFestivalMode) {
        moveMarker.addTo(map);
        labelMarker.addTo(map);
    }

    const element = { id: Date.now(), type, name, rectangle, labelMarker, moveMarker, length, width, rotation: rotation, isRectangle: true, color: config.color, iconUrl: getGenericIconUrl(config.icon) };
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
	card.querySelector('.focus-btn').onclick = (e) => { e.stopPropagation(); map.setView(element.moveMarker.getLatLng(), 18); };
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
// Emoji para las insignias circulares del Mapa Ilustrado (por config.icon)
function getPinEmoji(iconKey) {
    const pinEmojis = {
        'stage': '🎪',
        'bar': '🍹',
        'food': '🚚',
        'custom': '⚡',
        'wc': '🚻',
        'parking': '🅿️',
        'disabled': '♿',
        'noparking': '🚫',
        'exit': '🚪',
        'star': '⭐',
        'tent': '⛺',
        'rest': '⛱️',
        'first-aid': '➕'
    };
    return pinEmojis[iconKey] || '📍';
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
        'fence': 'assets/icons/fence.svg', 
        'tent': 'assets/icons/tent.svg',
        'disabled': 'https://upload.wikimedia.org/wikipedia/commons/0/0c/Wheelchair_symbol.svg',
        'noparking': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0NSIgZmlsbD0iIzM0OThkYiIgc3Ryb2tlPSIjZTc0YzNjIiBzdHJva2Utd2lkdGg9IjEwIi8+PGxpbmUgeDE9IjE4IiB5MT0iMTgiIHgyPSI4MiIgeTI9IjgyIiBzdHJva2U9IiNlNzRjM2MiIHN0cm9rZS13aWR0aD0iMTAiLz48L3N2Zz4=',
        'exit': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMjdhZTYwIi8+PHBhdGggZD0iTTMwIDIwaDQwdjYwSDMwek03NSA1MGwtMTUgMTBNNzUgNTBsLTE1LTEwIiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjgiLz48L3N2Zz4=',
        'star': 'https://upload.wikimedia.org/wikipedia/commons/e/e5/Full_Star_Yellow.svg',
        'wc_signal': 'https://upload.wikimedia.org/wikipedia/commons/4/40/Restroom_sign.svg'
    }; 
    return genericIcons[type] || 'assets/icons/default.svg'; 
}
