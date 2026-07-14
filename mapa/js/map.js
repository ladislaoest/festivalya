
// --- MAPA Y ESTILOS ---
let map, mapLayers, currentMapLayer;

function initMap() {
	map = L.map('map', { 
        maxZoom: 22,
        attributionControl: false,
        doubleClickZoom: false,
        rotate: true,
        touchRotate: true,
        bearing: 0
    }).setView([42.1046, -8.8359], 16);
	mapLayers = {
		'osm-streets': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 22
		}),
		'cartodb-light': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
			subdomains: 'abcd',
			maxZoom: 22
		}),
		'cartodb-dark': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
			subdomains: 'abcd',
			maxZoom: 22
		}),
		'esri-satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
			maxZoom: 22
		}),
		'cartodb-voyager': L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
			maxZoom: 22
		})
	};

    // Cerrar menú al tocar el mapa
    map.on('mousedown touchstart', () => {
        const panel = document.getElementById('panel');
        if (panel && panel.classList.contains('active')) {
            panel.classList.remove('active');
        }
    });
	
	// Establecer Esri World Imagery como predeterminado
	currentMapLayer = mapLayers['esri-satellite'];
	currentMapLayer.addTo(map);

	const styleSelector = document.getElementById('map-style-selector');
	if (styleSelector) {
		styleSelector.value = 'esri-satellite';
		styleSelector.addEventListener('change', function(e) {
			const selectedStyle = e.target.value;
			map.removeLayer(currentMapLayer);
			currentMapLayer = mapLayers[selectedStyle];
			currentMapLayer.addTo(map);
		});
	}

	delete L.Icon.Default.prototype._getIconUrl;
	L.Icon.Default.mergeOptions({
		iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
		iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
		shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
	});

	// Control de búsqueda
	const searchControl = new L.Control.Search({
		url: 'https://nominatim.openstreetmap.org/search?format=json&q={s}',
		jsonp: 'json_callback',
		propertyName: 'display_name',
		propertyLoc: ['lat','lon'],
		marker: L.marker([0,0]),
		autoCollapse: true,
		autoType: false,
		minLength: 2,
		textPlaceholder: 'Buscar ubicación...'
	});
	map.addControl(searchControl);

	// Botón de ubicación actual (Geolocalización)
	const locateBtn = L.control({ position: 'topleft' });
	locateBtn.onAdd = function() {
		const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
		div.innerHTML = '<div style="background: white; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; cursor: pointer;" title="Mi ubicación"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/></svg></div>';
		div.onclick = function(e) {
			e.stopPropagation();
			map.locate({ setView: true, maxZoom: 18 });
		};
		return div;
	};
	locateBtn.addTo(map);

    // Control de rotación
    if (L.control.rotate) {
        L.control.rotate({
            position: 'topleft',
            closeOnZeroBearing: false
        }).addTo(map);
    }

	map.on('locationfound', (e) => {
		// Solo centramos la vista sin añadir marcadores ni círculos que ensucien el mapa
        console.log("Ubicación encontrada y mapa centrado.");
	});

    // Actualizar elementos al rotar el mapa (solo etiquetas)
    map.on('rotate', () => {
        if (typeof elements !== 'undefined') {
            elements.forEach(el => updateElementShape(el, true, true));
        }
    });

	map.on('locationerror', () => {
		alert("No se pudo obtener tu ubicación. Asegúrate de dar permisos de GPS.");
	});
}
