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