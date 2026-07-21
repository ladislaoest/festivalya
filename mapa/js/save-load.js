// --- CONEXIÓN A SUPABASE (mapa por evento) ---
const MAPA_SUPABASE_URL = 'https://atmxqrkcvvatfqsvkdcm.supabase.co';
const MAPA_SUPABASE_KEY = 'sb_publishable_jAo0VLnlU5UFF2J5rl4LJQ_UGlSaMPu';
const mapaSb = supabase.createClient(MAPA_SUPABASE_URL, MAPA_SUPABASE_KEY);

function getEventIdFromUrl() {
    return new URLSearchParams(window.location.search).get('event');
}

// --- FUNCIONALIDAD DE GUARDAR Y CARGAR ---

function setupSaveLoadEvents() {
    const savePcBtn = document.getElementById('save-pc-btn');
    if (savePcBtn) savePcBtn.addEventListener('click', saveToPC);

    const loadBtnPanel = document.getElementById('load-btn-panel');
    if (loadBtnPanel) loadBtnPanel.addEventListener('click', loadProject);

    const exportBtn = document.getElementById('export-img-btn');
    if (exportBtn) exportBtn.addEventListener('click', exportMapToImage);

    const saveCloudBtn = document.getElementById('save-cloud-btn');
    if (saveCloudBtn) saveCloudBtn.addEventListener('click', saveMapToEvent);

    const loadInput = document.getElementById('load-project-input');
    if (loadInput) {
        loadInput.addEventListener('change', function(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                const contents = e.target.result;
                try {
                    const festivalData = JSON.parse(contents);
                    loadProjectData(festivalData);
                    alert('Proyecto cargado correctamente.');
                } catch (error) {
                    console.error('Error al parsear el archivo JSON:', error);
                    alert('El archivo seleccionado no es un proyecto válido.');
                }
            };
            reader.readAsText(file);
        });
    }
}

function getProjectData() {
    return {
        view: {
            center: map.getCenter(),
            zoom: map.getZoom(),
            bearing: map.getBearing ? map.getBearing() : 0
        },
        elements: elements.map(el => ({
            id: el.id,
            type: el.type,
            name: el.name,
            coords: el.moveMarker.getLatLng(),
            labelCoords: el.labelMarker.getLatLng(),
            rotation: el.rotation,
            iconUrl: el.iconUrl,
            isRectangle: el.isRectangle,
            length: el.length,
            width: el.width,
            color: el.color,
            illustratedHidden: el.illustratedHidden || false
        }))
    };
}

function saveToPC() {
    const festivalData = getProjectData();
    const jsonData = JSON.stringify(festivalData, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'festival-diseno.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
    alert('Diseño guardado como festival-diseno.json');
}

async function saveMapToEvent() {
    const eventId = getEventIdFromUrl();
    if (!eventId) {
        alert("No se encontró el evento. Abrí el mapa desde FestivalYa.");
        return;
    }

    const btn = document.getElementById('save-cloud-btn');
    const originalHtml = btn ? btn.innerHTML : null;
    if (btn) { btn.disabled = true; btn.innerHTML = '...'; }

    const festivalData = getProjectData();

    const { error } = await mapaSb.from('events').update({ map_data: festivalData }).eq('id', eventId);

    if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }

    if (error) {
        alert("Error guardando el mapa: " + error.message);
        return;
    }

    alert("Mapa guardado correctamente en FestivalYa.");
}

async function loadMapForEvent() {
    const eventId = getEventIdFromUrl();
    const startupModal = document.getElementById('startup-modal');
    const titleBox = document.getElementById('event-map-title');

    if (!eventId) {
        // Uso fuera del contexto de un evento (acceso directo a la carpeta /mapa)
        return false;
    }

    const { data, error } = await mapaSb.from('events').select('name, map_data').eq('id', eventId).maybeSingle();

    if (titleBox && data) {
        titleBox.textContent = data.name || '';
    }

    if (error || !data || !data.map_data || !data.map_data.elements || data.map_data.elements.length === 0) {
        return false; // No hay mapa guardado todavía: mostrar el modal de inicio
    }

    if (startupModal) startupModal.style.display = 'none';
    initMap();
    setupElementEvents();
    setupSaveLoadEvents();
    setupViewSwitcher();
    loadProjectData(data.map_data);
    return true;
}

function loadProject() {
    document.getElementById('load-project-input').click();
}

function loadProjectData(data) {
    clearAllElements();
    
    // Soporte para formato antiguo (array directo) y nuevo (objeto con view)
    const elementsData = Array.isArray(data) ? data : data.elements;
    const viewData = !Array.isArray(data) ? data.view : null;

    if (elementsData.length === 0 && !viewData) return;

    // Restaurar vista si existe
    if (viewData) {
        map.setView(viewData.center, viewData.zoom);
        if (map.setBearing && viewData.bearing !== undefined) {
            map.setBearing(viewData.bearing);
        }
    }

    const group = new L.FeatureGroup();
    // El nombre por defecto del "borracho" cambió más de una vez
    // (BORRACHO -> Bread&Water -> BREAD & WATHER): un proyecto guardado
    // con cualquiera de los nombres viejos se corrige solo al cargar, en
    // vez de dejar que dependa de editarlo a mano elemento por elemento.
    const OLD_DRUNK_NAMES = new Set(['BORRACHO', 'Bread&Water']);
    elementsData.forEach(el => {
        let element;
        const elName = (el.type === 'drunk' && OLD_DRUNK_NAMES.has(el.name))
            ? festivalConfig['drunk'].label
            : el.name;
        if (el.isRectangle) {
            element = addRectangleToMap(elName, el.type, el.coords, el.length, el.width);
            group.addLayer(element.rectangle);
        } else {
            // El tipo real (valla de obra vs. antipánico) se pasaba antes
            // sin usar: cualquier elemento de línea guardado se recreaba
            // siempre como 'fence' al recargar el proyecto, sin importar
            // qué tipo era en realidad.
            element = addFixedFenceToMap(el.length, el.coords, el.rotation, el.type);
            element.name = elName;
            group.addLayer(element.line);
        }
        element.rotation = el.rotation || 0;
        element.illustratedHidden = el.illustratedHidden || false;
        if (el.labelCoords) element.labelMarker.setLatLng(el.labelCoords);
        elements.push(element);
        updateElementShape(element, true);
        updateElementCard(element);
        bindMarkerEvents(element);
    });
    updateStats();

    // Si no hay vista guardada, centramos en los elementos
    if (!viewData) {
        const bounds = group.getBounds();
        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
        }
    }
}

async function exportMapToImage() {
    const mapContainer = document.getElementById('map');
    const btn = document.getElementById('export-img-btn');
    if (!mapContainer || !btn) return;

    const originalText = btn.innerHTML;
    btn.innerHTML = '...';
    btn.disabled = true;

    // Pequeño truco para Leaflet: html2canvas a veces falla con transformaciones complejas
    // Aseguramos que estamos capturando el contenedor correcto y forzamos renderizado
    try {
        const canvas = await html2canvas(mapContainer, {
            useCORS: true,
            allowTaint: false, // Cambiado a false para mayor compatibilidad con CORS real
            backgroundColor: null,
            scale: 2,
            logging: false,
            ignoreElements: (element) => {
                // Ignorar controles de Leaflet que ensucian la foto
                return element.classList.contains('leaflet-control-container');
            }
        });
        
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `plano-festival-${Date.now()}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (error) {
        console.error('Error al exportar imagen:', error);
        alert('Error técnico al generar la imagen. Prueba a desactivar el "Mapa Ilustrado" antes de descargar o reduce el zoom un poco.');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
