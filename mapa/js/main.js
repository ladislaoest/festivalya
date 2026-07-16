
// --- Ajuste dinámico del tamaño del plano 3D ---
document.addEventListener('DOMContentLoaded', function() {
	const slider = document.getElementById('map3d-size-slider');
	const valueLabel = document.getElementById('map3d-size-value');
	if (slider && valueLabel) {
		slider.addEventListener('input', function() {
			valueLabel.textContent = slider.value;
		});
		slider.addEventListener('change', function() {
			const container3D = document.getElementById('container-3d-full');
			if (container3D && container3D.classList.contains('active')) {
				let style = 'minimalista';
				const btn = document.querySelector('.view-btn.active');
				if (btn && btn.dataset.view === '3d-illustrated') style = 'ilustrado';
				generate3DView(style);
			}
		});
	}
});

function clearAllElements() {
    elements.forEach(el => {
        if (el.isRectangle) {
            map.removeLayer(el.rectangle);
            map.removeLayer(el.labelMarker);
        } else if (el.isLine) {
            map.removeLayer(el.line);
            map.removeLayer(el.labelMarker);
        } else {
            map.removeLayer(el.marker);
        }
    });
    elements = [];
    const list = document.getElementById('elements-list');
    if (list) list.innerHTML = '';
}

// --- INICIALIZACIÓN Y EVENTOS GLOBALES ---

// Selector de vistas (2D/3D). Debe engancharse sin importar cómo arrancó
// el proyecto (nuevo, cargado desde Supabase o desde archivo local).
function setupViewSwitcher() {
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const viewId = this.dataset.view;
            if (!viewId) return; // Ignorar si no es un botón de cambio de vista

            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            document.getElementById('map-container').classList.remove('active');
            document.getElementById('container-3d-full').classList.remove('active');

            if (viewId === 'map-2d') {
                document.getElementById('map-container').classList.add('active');
                setTimeout(() => {
                    if (map) map.invalidateSize();
                }, 50);
            } else if (viewId.startsWith('3d')) {
                document.getElementById('container-3d-full').classList.add('active');
                let style = 'minimalista';
                if (viewId === '3d-illustrated') style = 'ilustrado';
                generate3DView(style);
            }
        });
    });
}

function startNewProject() {
    initMap();
    setupElementEvents();
    setupSaveLoadEvents();
    setupViewSwitcher();

    console.log('Proyecto nuevo iniciado en vista satelital.');
}

document.addEventListener('DOMContentLoaded', async function() {
    const startupModal = document.getElementById('startup-modal');
    const newProjectBtn = document.getElementById('new-project-btn');
    const loadProjectBtn = document.getElementById('load-project-btn');

    // Si el evento ya tiene un mapa guardado, se carga directo y se omite el modal
    const alreadyLoaded = await loadMapForEvent();

    if (startupModal && !alreadyLoaded) {
        startupModal.style.display = 'flex';

        if (newProjectBtn) {
            newProjectBtn.addEventListener('click', function() {
                startupModal.style.display = 'none';
                startNewProject();
            });
        }

        const useGpsBtn = document.getElementById('use-gps-btn');
        if (useGpsBtn) {
            useGpsBtn.addEventListener('click', function() {
                startupModal.style.display = 'none';
                startNewProject();
                setTimeout(() => {
                    if (map) map.locate({ setView: true, maxZoom: 18 });
                }, 500);
            });
        }

        if (loadProjectBtn) {
            loadProjectBtn.addEventListener('click', function() {
                startupModal.style.display = 'none';
                initMap();
                setupElementEvents();
                setupSaveLoadEvents();
                setupViewSwitcher();
                loadProject();
            });
        }
    }
});
