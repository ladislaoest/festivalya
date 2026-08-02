// --- VISTA PÚBLICA DE SOLO LECTURA (publico.html) ---
// Reutiliza loadMapForEvent() (save-load.js) tal cual: mismo enlace de
// evento, misma lectura de Supabase. Lo único que hace de más es forzar la
// vista 3D a pantalla completa en vez de dejar el selector 2D/3D del panel
// (que aquí está oculto) para elegir.

document.addEventListener('DOMContentLoaded', async function() {
    const eventId = getEventIdFromUrl();
    if (!eventId) {
        showPublicMapError('Enlace no válido: falta el identificador del evento.');
        return;
    }

    let loaded = false;
    try {
        loaded = await loadMapForEvent();
    } catch (err) {
        console.error('[publico] Error cargando el mapa:', err);
        showPublicMapError('No se pudo cargar el mapa de este evento.');
        return;
    }

    if (!loaded) {
        showPublicMapError('Este evento todavía no tiene un mapa publicado.');
        return;
    }

    const titleSource = document.getElementById('event-map-title');
    const titleTarget = document.getElementById('public-map-title');
    if (titleTarget) titleTarget.textContent = (titleSource && titleSource.textContent) || 'Mapa del evento';

    document.getElementById('map-container').classList.remove('active');
    document.getElementById('container-3d-full').classList.add('active');
    generate3DView('minimalista');
});

function showPublicMapError(message) {
    document.getElementById('container-3d-full').classList.add('active');
    const banner = document.getElementById('view3d-error-banner');
    if (banner) {
        banner.textContent = message;
        banner.style.display = 'block';
    }
    const tourBtn = document.getElementById('tour-3d-btn');
    if (tourBtn) tourBtn.style.display = 'none';
}
