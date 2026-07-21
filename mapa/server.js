const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

const projectsDir = path.join(__dirname, 'projects');
if (!fs.existsSync(projectsDir)) {
    fs.mkdirSync(projectsDir);
}

app.use(express.json());

// API routes
app.post('/api/save', (req, res) => {
    const { name, data } = req.body;
    if (!name || !data) {
        return res.status(400).json({ message: 'Nombre o datos del proyecto no proporcionados.' });
    }

    const safeName = path.basename(name).replace(/\.\.\//g, ''); // Sanitize
    const filePath = path.join(projectsDir, `${safeName}.json`);

    fs.writeFile(filePath, JSON.stringify(data, null, 2), (err) => {
        if (err) {
            console.error('Error al guardar el proyecto:', err);
            return res.status(500).json({ message: 'Error interno al guardar el proyecto.' });
        }
        res.status(200).json({ message: `Proyecto "${name}" guardado correctamente.` });
    });
});

app.get('/api/projects', (req, res) => {
    fs.readdir(projectsDir, (err, files) => {
        if (err) {
            console.error('Error al leer el directorio de proyectos:', err);
            return res.status(500).json({ message: 'Error interno al obtener la lista de proyectos.' });
        }
        const jsonFiles = files
            .filter(file => path.extname(file) === '.json')
            .map(file => path.basename(file, '.json'));
        res.status(200).json(jsonFiles);
    });
});

// Proxy de elevación real del terreno: el propio navegador ya podía llamar
// directo a Open-Elevation (y de hecho así era antes), pero eso ata la vista
// 3D a que ESE único servicio gratuito y sin SLA esté arriba en ese momento
// -y se ha visto caer con 504 en pruebas reales-, y descarta de raíz
// cualquier otra fuente que no soporte CORS desde el navegador (p.ej. Open
// Topo Data, que responde rapidísimo y de forma consistente pero no manda
// cabeceras CORS). Pasando por nuestro propio servidor no hay CORS que
// sortear en ningún caso -es un fetch servidor a servidor-, así que se puede
// encadenar más de una fuente y quedarse con la primera que responda bien.
app.post('/api/elevation', async (req, res) => {
    const { locations } = req.body || {};
    if (!Array.isArray(locations) || !locations.length) {
        return res.status(400).json({ message: 'locations (array de {latitude, longitude}) requerido.' });
    }

    // Open Topo Data (SRTM 90m): sin API key, hasta 100 puntos por petición
    // (la rejilla del mapa 3D es de 81) y en la práctica responde en menos
    // de un segundo de forma muy consistente -se prueba primero por eso-.
    try {
        const locStr = locations.map(l => `${l.latitude},${l.longitude}`).join('|');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const r = await fetch(`https://api.opentopodata.org/v1/srtm90m?locations=${encodeURIComponent(locStr)}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (r.ok) {
            const data = await r.json();
            if (Array.isArray(data.results) && data.results.length === locations.length && data.results.every(x => typeof x.elevation === 'number')) {
                return res.json({ results: data.results.map(x => ({ elevation: x.elevation })), source: 'opentopodata' });
            }
        }
    } catch (err) {
        console.warn('[elevation] Open Topo Data falló, se prueba Open-Elevation:', err.message);
    }

    // Respaldo: Open-Elevation (otra fuente independiente, gratis y sin
    // key). Si esta también falla, el cliente ya sabe caer al relieve
    // simulado (ver fetchTerrainElevation en view3d.js).
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        const r = await fetch('https://api.open-elevation.com/api/v1/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ locations }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (r.ok) {
            const data = await r.json();
            if (Array.isArray(data.results) && data.results.length === locations.length && data.results.every(x => typeof x.elevation === 'number')) {
                return res.json({ results: data.results, source: 'open-elevation' });
            }
        }
    } catch (err) {
        console.warn('[elevation] Open-Elevation también falló:', err.message);
    }

    res.status(502).json({ message: 'No se pudo obtener elevación real de ningún proveedor.' });
});

app.get('/api/projects/:filename', (req, res) => {
    const { filename } = req.params;
    const safeName = path.basename(filename).replace(/\.\.\//g, ''); // Sanitize
    const filePath = path.join(projectsDir, `${safeName}.json`);

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                return res.status(404).json({ message: 'Proyecto no encontrado.' });
            }
            console.error('Error al leer el archivo del proyecto:', err);
            return res.status(500).json({ message: 'Error interno al leer el proyecto.' });
        }
        res.status(200).json(JSON.parse(data));
    });
});


// Serve static files from the root directory
app.use(express.static(path.join(__dirname)));

// Serve the main page for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Handle other routes by serving the main page (for client-side routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});