
// --- VISTA 3D (Three.js) ---
let threeScene, threeCamera, threeRenderer, threeControls, animationFrameId;
let map3dPlaneSize = 100;

const SECURITY_FIGURE_SCALE = 1.4;
const SECURITY_FIGURE_HEIGHT = 1.77 * SECURITY_FIGURE_SCALE;

const DRUNK_FIGURE_SCALE = 1.6;
const DRUNK_FIGURE_HEIGHT = 1.99 * DRUNK_FIGURE_SCALE; // 1.99 = tope de la cabeza (ver createDrunkFigure)
const DRUNK_WANDER_RADIUS = 2.5;

// Figuras "borracho" que deambulan solas cada frame (ver updateWanderingDrunks).
// Se reconstruye entera cada vez que se regenera la escena 3D.
let wanderingDrunks = [];

// "Tiburón": personaje que ronda la barra más cercana lanzando billetes
// (ver createTiburonFigure/updateMoneyWalkers/setupMoneyWalkers). Recorre un
// arco de 260° centrado en el "frente" de la barra (su rotación + 90°) yendo
// y viniendo -nunca completa el círculo entero-, para no cruzar nunca la
// franja de detrás de la barra (donde iría el personal). Se reconstruye
// entera en cada generate3DView().
let moneyWalkers = [];
const TIBURON_FIGURE_SCALE = 1.5;
const TIBURON_FIGURE_HEIGHT = 1.85 * TIBURON_FIGURE_SCALE;
const TIBURON_WALK_RADIUS = 3.2;
const TIBURON_ARC_RANGE = (260 * Math.PI / 180) / 2; // amplitud a cada lado del "frente" de la barra
// Ángulo de brazo levantado (0 = colgando, PI = totalmente hacia arriba):
// con este valor el brazo queda en diagonal, hacia arriba Y hacia afuera del
// cuerpo -así el abanico de billetes en la mano queda bien a la vista en vez
// de escondido junto al torso-. Signo +/- por brazo, ver createTiburonFigure.
const TIBURON_ARM_RAISE_ANGLE = 2.2;

// Porteros ("security") con un recorrido dibujado a mano en el mapa 2D (ver
// startPathDrawing en elements.js): patrullan ese trayecto de ida y vuelta,
// tramo a tramo, en vez de quedarse fijos (ver updateSecurityPatrols). Se
// reconstruye entera en cada generate3DView().
let securityPatrols = [];
const SECURITY_PATROL_SPEED_MPS = 1.2; // paso tranquilo de ronda

// "Tour automático": plano general del recinto y luego un recorrido por
// todos los elementos, uno a uno (ver buildTourKeyframes/updateTour).
let tourActive = false;
let tourState = null;
const TOUR_TRANSITION_MS = 1200;

// Relieve real del recinto (ver fetchTerrainElevation): una rejilla NxN de
// alturas relativas ya en metros de mundo, interpolada bilinealmente. Se
// reinicia a null en cada generate3DView() para no arrastrar la rejilla de
// una ubicación/tamaño de plano distintos mientras llega la nueva.
let terrainElevGrid = null;
let terrainRequestId = 0;
// Edificios/árboles reales ya colocados (ver applyMapFeatures) pendientes de
// reanclar a la altura real del terreno en cuanto llegue (ver más abajo,
// junto al reajuste de "elements"): {mesh, ax, az, offset}, donde ax/az son
// las coordenadas tal cual las espera getTerrainHeight y "offset" es la
// distancia vertical fija por encima de esa altura (0 para un edificio,
// la altura del tronco/copa para un árbol).
let mapFeatureAnchors = [];
const TERRAIN_GRID_SIZE = 9;
// Sin exagerar: el terreno real (sobre todo a la resolución del dato
// gratuito que se usa, ~90m por punto) ya trae su propio margen de ruido
// -pequeñas variaciones que no son relieve real del sitio, solo artefactos
// de esa resolución-, y amplificarlo (antes x3.5) convertía ese ruido en
// "montañas" allí donde el terreno real es plano. Con exageración 1 se ve
// exactamente la diferencia de altura real entre los puntos muestreados,
// ni más ni menos.
const TERRAIN_EXAGGERATION = 1;
// Metros absolutos, no relativos al tamaño del plano: el plano mide lo que
// mida el tile visible a este zoom (de 20 a varios cientos de metros) por
// motivos que no tienen nada que ver con cuánto sube o baja el terreno de
// verdad, así que escalar el tope con ese tamaño podía disparar el relieve
// a decenas de metros en un recinto grande sin que fuera un dato real.
const TERRAIN_MAX_RELIEF_ABS = 40; // tope de amplitud, en metros (terreno realmente montañoso)

// Solo relieve real: sin datos de elevación (aún no han llegado, o la
// petición falló) el suelo se queda liso -nada de ondulación inventada de
// respaldo-, para no mostrar como "relieve" algo que no corresponde al
// terreno de verdad.
function getTerrainHeight(x, y) {
	if (!terrainElevGrid) return 0;
	const { size, values, halfSize } = terrainElevGrid;
	const u = Math.min(size - 1.001, Math.max(0, ((x + halfSize) / (halfSize * 2)) * (size - 1)));
	const v = Math.min(size - 1.001, Math.max(0, ((y + halfSize) / (halfSize * 2)) * (size - 1)));
	const i0 = Math.floor(u), j0 = Math.floor(v);
	const i1 = Math.min(size - 1, i0 + 1), j1 = Math.min(size - 1, j0 + 1);
	const fu = u - i0, fv = v - j0;
	const h00 = values[j0 * size + i0];
	const h10 = values[j0 * size + i1];
	const h01 = values[j1 * size + i0];
	const h11 = values[j1 * size + i1];
	const h0 = h00 * (1 - fu) + h10 * fu;
	const h1 = h01 * (1 - fu) + h11 * fu;
	return h0 * (1 - fv) + h1 * fv;
}

const UP_AXIS = new THREE.Vector3(0, 1, 0);

function median(numbers) {
	const sorted = [...numbers].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Altura de apoyo para un elemento con extensión real (escenario, valla,
// barra...), no solo un punto: muestrea el terreno en las esquinas/extremos
// de su huella real (girada según su rotación) y se queda con la MÁS ALTA.
// Con un único punto (el centro) un objeto ancho o largo podía quedar con un
// extremo bien apoyado y el otro literalmente hundido en el suelo en cuanto
// el terreno tenía algo de pendiente bajo su huella -"la valla/el escenario/
// la barra están enterrados"-. Apoyarse en el punto más alto de la huella
// evita que se hunda, pero por sí solo deja un hueco en el lado bajo (el
// objeto queda plano y en el aire por ese lado) en cuanto hay pendiente real
// -por eso se combina con una "plataforma" nivelada en el propio terreno
// (ver terrainPads/computeGroundHeight más abajo): así el suelo se ve
// allanado bajo el elemento, como una obra real prepararía el sitio, en vez
// de quedar el objeto suspendido sobre la pendiente.
function groundHeightForFootprint(x, z, length, width, rotationDeg) {
	const rotY = -((rotationDeg || 0) * Math.PI) / 180; // mismo criterio que el resto de la vista 3D (ver group.rotation.y)
	const hl = (length || 0) / 2;
	const hw = (width || 0) / 2;
	const localPts = hw > 0
		? [[0, 0], [-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]]
		: [[0, 0], [-hl, 0], [hl, 0]];
	let maxH = -Infinity;
	const v = new THREE.Vector3();
	for (const [lx, lz] of localPts) {
		v.set(lx, 0, lz).applyAxisAngle(UP_AXIS, rotY);
		const h = getTerrainHeight(x + v.x, -(z + v.z));
		if (h > maxH) maxH = h;
	}
	return maxH;
}

// Elementos con huella real (ver drawElements) para los que el suelo se
// allana localmente a su altura de apoyo -"plataforma" nivelada, como
// prepararía de verdad el montaje en un terreno con pendiente-: {x, z,
// halfLength, halfWidth, rotY, padY}. Se reinicia en cada generate3DView().
let terrainPads = [];
// Ancho de la transición entre la plataforma nivelada y el terreno natural
// de alrededor, en metros: un corte a pico (sin transición) se vería como un
// escalón artificial; con esto se funde suavemente en la pendiente real.
const TERRAIN_PAD_MARGIN = 1.5;

// 1 dentro de la huella, 0 a partir de "margin" fuera de ella, con una
// transición suave (coseno, no lineal) en medio.
function terrainPadWeight(localX, localZ, halfLength, halfWidth, margin) {
	const dx = Math.max(Math.abs(localX) - halfLength, 0);
	const dz = Math.max(Math.abs(localZ) - halfWidth, 0);
	const dist = Math.sqrt(dx * dx + dz * dz);
	if (dist <= 0) return 1;
	if (dist >= margin) return 0;
	return 0.5 * (1 + Math.cos((dist / margin) * Math.PI));
}

// Altura del suelo en un punto del plano, ya con las plataformas niveladas
// aplicadas: se usa para CONSTRUIR la malla del suelo (ver generate3DView),
// no para decidir dónde se apoya cada elemento -eso sigue siendo
// groundHeightForFootprint, sobre el terreno natural sin allanar-.
function computeGroundHeight(vx, vy) {
	const rawH = getTerrainHeight(vx, vy);
	if (!terrainPads.length) return rawH;
	const worldX = vx, worldZ = -vy;
	let bestWeight = 0, bestPadY = rawH;
	const v = new THREE.Vector3();
	for (const pad of terrainPads) {
		v.set(worldX - pad.x, 0, worldZ - pad.z).applyAxisAngle(UP_AXIS, -pad.rotY);
		const w = terrainPadWeight(v.x, v.z, pad.halfLength, pad.halfWidth, TERRAIN_PAD_MARGIN);
		if (w > bestWeight) { bestWeight = w; bestPadY = pad.padY; }
	}
	return rawH * (1 - bestWeight) + bestPadY * bestWeight;
}

// Consulta elevación real en una rejilla NxN sobre el recinto, vía nuestro
// propio proxy /api/elevation (ver server.js): éste encadena Open Topo Data
// y Open-Elevation server a servidor, sin el problema de CORS que impide
// llamar a algunas fuentes directo desde el navegador, y sin depender de que
// un único servicio gratuito esté arriba en ese momento (se ha visto caer
// con 504 en pruebas reales). "planeToLatLng" ya define cómo se corresponden
// las coordenadas del plano con lat/lng (ver más abajo), así que se reutiliza
// tal cual para que la rejilla quede perfectamente alineada con el suelo y
// los elementos. Si falla devuelve null y el relieve se queda en el ruido falso.
async function fetchTerrainElevation(bbox, planeSize) {
	const size = TERRAIN_GRID_SIZE;
	const half = planeSize / 2;
	const locations = [];
	for (let j = 0; j < size; j++) {
		for (let i = 0; i < size; i++) {
			const x = -half + (i / (size - 1)) * planeSize;
			const y = -half + (j / (size - 1)) * planeSize;
			const ll = planeToLatLng(x, -y, bbox); // -y: ver rotación del suelo en generate3DView
			locations.push({ latitude: ll.lat, longitude: ll.lng });
		}
	}
	try {
		const controller = new AbortController();
		// El proxy intenta hasta dos fuentes en serie (10s + 12s de margen
		// cada una, ver server.js) antes de rendirse: como esta petición
		// nunca bloquea la interfaz -el relieve se actualiza solo cuando
		// llega, mientras tanto se ve el respaldo simulado-, un timeout
		// corto en el cliente solo tira ese trabajo a la basura antes de
		// tiempo, que es justo lo que se veía como "el mapa aparece plano".
		const timeoutId = setTimeout(() => controller.abort(), 25000);
		const res = await fetch('/api/elevation', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ locations }),
			signal: controller.signal
		});
		clearTimeout(timeoutId);
		if (!res.ok) return null;
		const data = await res.json();
		const raw = data.results.map(r => r.elevation);
		if (raw.length !== size * size || raw.some(v => typeof v !== 'number')) return null;

		const mean = raw.reduce((a, b) => a + b, 0) / raw.length;
		const maxAmplitude = TERRAIN_MAX_RELIEF_ABS;
		// Un recinto de festival real suele ser justo el sitio más llano de
		// la zona (aparcamientos, campos...): que la variación real salga
		// minúscula o directamente CERO es un resultado legítimo, no un
		// fallo -no se rellena con ondulación inventada, el terreno se
		// queda liso si de verdad lo es-. Solo se acota el valor real (ya
		// exagerado) a un tope razonable, por si el dato de origen tuviera
		// un pico erróneo.
		const scaled = raw.map(v => (v - mean) * TERRAIN_EXAGGERATION);
		const values = scaled.map(v => Math.max(-maxAmplitude, Math.min(maxAmplitude, v)));
		return { size, values, halfSize: half };
	} catch (err) {
		console.warn('[3D] No se pudo obtener elevación real, el suelo se queda liso.', err);
		return null;
	}
}

const MAP_FEATURES_MAX_BUILDINGS = 150;
const MAP_FEATURES_MAX_TREES = 200;
// Árboles esparcidos dentro de zonas de bosque/parque reales (ver más abajo):
// aparte del límite de árboles sueltos, para que una masa forestal grande no
// se coma todo el presupuesto de MAP_FEATURES_MAX_TREES.
const MAP_FEATURES_MAX_FOREST_TREES = 260;

const OVERPASS_ENDPOINTS = [
	'https://overpass.openstreetmap.fr/api/interpreter',
	'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
	'https://overpass-api.de/api/interpreter',
	'https://overpass.kumi.systems/api/interpreter'
];

async function queryOverpassMirror(endpoint, query, signal) {
	const res = await fetch(endpoint, { method: 'POST', body: 'data=' + encodeURIComponent(query), signal });
	if (!res.ok) throw new Error(`${endpoint} status ${res.status}`);
	const json = await res.json();
	if (!Array.isArray(json.elements)) throw new Error(`${endpoint}: respuesta sin "elements"`);
	return json.elements;
}

// Lanza varios espejos en paralelo y se queda con el primero que traiga
// resultados no vacíos (o, si el margen de tiempo se agota, con el mejor
// 200-pero-vacío que haya llegado -algunos espejos responden así con la
// base de datos rota, visto en vivo con overpass.osm.ch- en vez de nada).
function raceFirstNonEmpty(factories, overallTimeoutMs) {
	return new Promise((resolve) => {
		let settled = false, remaining = factories.length, bestEmpty = null;
		const finish = (value) => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
		const timer = setTimeout(() => finish(bestEmpty), overallTimeoutMs);
		factories.forEach(async (factory) => {
			try {
				const elements = await factory();
				if (elements.length > 0) { finish(elements); return; }
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

// Edificios y árboles reales alrededor del recinto: se prueba Overpass
// DIRECTO desde el navegador primero -con la IP real de quien lo usa, no de
// un proveedor cloud-, ya que los espejos públicos son notoriamente hostiles
// al tráfico que viene de rangos de IP compartidos de nube (comprobado en
// vivo: el mismo espejo responde en un segundo desde una conexión normal,
// pero se cuelga sistemáticamente cuando la petición sale desde el propio
// servidor en Vercel). Solo si eso falla del todo se recurre al proxy propio
// (/api/map-features), que además cachea por si alguna petición anterior sí
// consiguió pasar. Si ambos fallan, se ignora: es una mejora visual, no algo
// crítico como el propio recinto.
async function fetchMapFeatures(bbox) {
	const bboxStr = `${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}`;
	const query = `[out:json][timeout:20];(way["building"](${bboxStr});node["natural"="tree"](${bboxStr});way["natural"="wood"](${bboxStr});way["landuse"="forest"](${bboxStr}););out geom;`;

	let data = null;
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 20000);
		data = await raceFirstNonEmpty(
			OVERPASS_ENDPOINTS.map(endpoint => () => queryOverpassMirror(endpoint, query, controller.signal)),
			20000
		);
		clearTimeout(timeoutId);
		controller.abort();
	} catch (err) {
		console.warn('[3D] Fallo consultando Overpass directo, se prueba el proxy propio.', err);
	}

	if (!data) {
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 20000);
			const res = await fetch('/api/map-features', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ bbox }),
				signal: controller.signal
			});
			clearTimeout(timeoutId);
			if (res.ok) {
				const json = await res.json();
				if (Array.isArray(json.elements)) data = json.elements;
			}
		} catch (err) {
			console.warn('[3D] No se pudieron obtener edificios/árboles reales (ni directo ni por el proxy), se omiten.', err);
		}
	}
	if (!data) return null;

	const buildings = [];
	const trees = [];
	const forests = [];
	for (const el of data) {
		if (el.type === 'way' && el.tags && el.tags.building && el.geometry && el.geometry.length >= 3) {
			if (buildings.length >= MAP_FEATURES_MAX_BUILDINGS) continue;
			let height = parseFloat(el.tags.height);
			if (!isFinite(height) || height <= 0) {
				const levels = parseFloat(el.tags['building:levels']);
				height = isFinite(levels) && levels > 0 ? levels * 3 : 6;
			}
			buildings.push({ points: el.geometry, height: Math.min(height, 60) });
		} else if (el.type === 'node' && el.tags && el.tags.natural === 'tree') {
			if (trees.length >= MAP_FEATURES_MAX_TREES) continue;
			trees.push({ lat: el.lat, lng: el.lon });
		} else if (el.type === 'way' && el.tags && (el.tags.natural === 'wood' || el.tags.landuse === 'forest')
				&& el.geometry && el.geometry.length >= 3) {
			forests.push({ points: el.geometry });
		}
	}
	return { buildings, trees, forests };
}

// Construye los edificios (extrusión del contorno real a su altura, o 6m
// por defecto si OSM no la tiene) y árboles (tronco+copa genéricos, no hay
// forma real de saber su forma exacta) y los añade a la escena.
function applyMapFeatures(data, bbox, scene) {
	const group = new THREE.Group();
	group.name = 'realMapFeatures';

	const buildingMat = new THREE.MeshStandardMaterial({ color: 0xcdc6b8, roughness: 0.9 });
	data.buildings.forEach(b => {
		try {
			const shape = new THREE.Shape();
			b.points.forEach((p, i) => {
				const planePos = latLngToPlane(p.lat, p.lon, bbox);
				if (!isFinite(planePos.x) || !isFinite(planePos.z)) throw new Error('coordenada no finita');
				if (i === 0) shape.moveTo(planePos.x, -planePos.z);
				else shape.lineTo(planePos.x, -planePos.z);
			});
			const geometry = new THREE.ExtrudeGeometry(shape, { depth: b.height, bevelEnabled: false });
			geometry.rotateX(-Math.PI / 2);
			const mesh = new THREE.Mesh(geometry, buildingMat);
			// El contorno ya se construyó en coordenadas absolutas del
			// plano (no relativas a un centro local), así que el mesh no
			// necesita más que apoyarse a la altura real del terreno bajo
			// su primer punto.
			const base = latLngToPlane(b.points[0].lat, b.points[0].lon, bbox);
			const ax = base.x, az = -base.z;
			mesh.position.y = getTerrainHeight(ax, az);
			mapFeatureAnchors.push({ mesh, ax, az, offset: 0 });
			group.add(mesh);
		} catch (err) {
			console.warn('[3D] Edificio omitido (contorno inválido).', err);
		}
	});

	const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a30 });
	const canopyMat = new THREE.MeshStandardMaterial({ color: 0x3f7d3f });

	function addTreeAt(x, z) {
		const az = -z;
		const h = getTerrainHeight(x, az);
		const treeHeight = 2.2 + Math.random() * 1.6;

		const trunkOffset = treeHeight * 0.2;
		const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, treeHeight * 0.4, 6), trunkMat);
		trunk.position.set(x, h + trunkOffset, z);
		mapFeatureAnchors.push({ mesh: trunk, ax: x, az, offset: trunkOffset });
		group.add(trunk);

		const canopyOffset = treeHeight * 0.4 + treeHeight * 0.375;
		const canopy = new THREE.Mesh(new THREE.ConeGeometry(treeHeight * 0.38, treeHeight * 0.75, 8), canopyMat);
		canopy.position.set(x, h + canopyOffset, z);
		mapFeatureAnchors.push({ mesh: canopy, ax: x, az, offset: canopyOffset });
		group.add(canopy);
	}

	data.trees.forEach(t => {
		try {
			const planePos = latLngToPlane(t.lat, t.lng, bbox);
			if (!isFinite(planePos.x) || !isFinite(planePos.z)) return;
			addTreeAt(planePos.x, planePos.z);
		} catch (err) {
			console.warn('[3D] Árbol omitido (coordenadas inválidas).', err);
		}
	});

	// Zonas de bosque/parque reales (natural=wood, landuse=forest): OSM las
	// da como un polígono de contorno, no árbol a árbol, así que se esparcen
	// árboles genéricos dentro del contorno (test punto-en-polígono simple)
	// en vez de dibujar un único bloque -así se lee como masa forestal en
	// vez de una superficie sólida rara. Presupuesto total limitado
	// (MAP_FEATURES_MAX_FOREST_TREES) repartido entre todas las zonas según
	// su área, para no disparar el número de mallas con un bosque grande.
	let forestTreesLeft = MAP_FEATURES_MAX_FOREST_TREES;
	(data.forests || []).forEach(f => {
		if (forestTreesLeft <= 0) return;
		try {
			const poly = f.points.map(p => {
				const pp = latLngToPlane(p.lat, p.lon, bbox);
				return { x: pp.x, z: -pp.z };
			});
			if (poly.some(p => !isFinite(p.x) || !isFinite(p.z))) return;

			let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
			poly.forEach(p => {
				minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
				minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
			});
			const area = Math.max(0, (maxX - minX) * (maxZ - minZ));
			// Densidad moderada (un árbol cada ~9m² de caja delimitadora),
			// recortada al presupuesto restante.
			const wanted = Math.min(forestTreesLeft, Math.round(area / 9));
			let placed = 0;
			let attempts = 0;
			while (placed < wanted && attempts < wanted * 6) {
				attempts++;
				const x = minX + Math.random() * (maxX - minX);
				const z = minZ + Math.random() * (maxZ - minZ);
				if (!pointInPolygon(x, z, poly)) continue;
				addTreeAt(x, z);
				placed++;
			}
			forestTreesLeft -= placed;
		} catch (err) {
			console.warn('[3D] Zona de bosque omitida (contorno inválido).', err);
		}
	});

	scene.add(group);
}

// Ray-casting estándar en 2D (plano X/Z): cuenta cruces de una semirrecta
// horizontal desde el punto hacia +X con cada arista del polígono.
function pointInPolygon(x, z, poly) {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const xi = poly[i].x, zi = poly[i].z;
		const xj = poly[j].x, zj = poly[j].z;
		const intersects = ((zi > z) !== (zj > z))
			&& (x < (xj - xi) * (z - zi) / (zj - zi) + xi);
		if (intersects) inside = !inside;
	}
	return inside;
}

const GLTFLoader = window.THREE.GLTFLoader;

// Los modelos descargados (Sketchfab, etc.) no vienen en una escala ni
// un pivote conocidos: sus unidades y proporciones son propias de cada
// archivo, sin relación con los metros reales del festival. Por eso:
// 1) medimos el modelo a escala 1 para saber su tamaño natural,
// 2) lo escalamos para que su lado horizontal más largo mida
//    "desiredLength" metros (el largo real del elemento en el mapa),
// 3) lo re-centramos (X/Z) apoyándolo sobre el suelo (Y), envolviéndolo
//    en un grupo que sí queda exactamente en "position".
// Así el modelo siempre queda a escala real y en su sitio, sin importar
// cómo esté exportado el archivo.
function placeLoadedModel(model, desiredLength, position, rotationDeg, scene) {
	model.updateMatrixWorld(true);
	const naturalBox = new THREE.Box3().setFromObject(model);
	let scale = 1;
	if (!naturalBox.isEmpty() && desiredLength > 0) {
		const naturalSize = new THREE.Vector3();
		naturalBox.getSize(naturalSize);
		const horizontalExtent = Math.max(naturalSize.x, naturalSize.z);
		if (horizontalExtent > 0) scale = desiredLength / horizontalExtent;
	}
	model.scale.set(scale, scale, scale);
	model.updateMatrixWorld(true);

	const box = new THREE.Box3().setFromObject(model);
	if (!box.isEmpty()) {
		const center = new THREE.Vector3();
		box.getCenter(center);
		model.position.x -= center.x;
		model.position.z -= center.z;
		model.position.y -= box.min.y;
	}
	const wrapper = new THREE.Group();
	wrapper.add(model);
	wrapper.position.copy(position);
	// Mismo signo invertido que el resto de los elementos (ver drawElements),
	// para que la orientación coincida con la que se ve en el mapa 2D.
	wrapper.rotation.y = -((rotationDeg || 0) * Math.PI) / 180;
	scene.add(wrapper);
}

function load3DIcon(modelPath, position, scene, desiredLength = 1, rotationDeg = 0) {
	const isGLB = modelPath.endsWith('.glb') || modelPath.endsWith('.gltf');
	const isOBJ = modelPath.endsWith('.obj');

	if (!isGLB && !isOBJ) {
		console.error('Formato de modelo no soportado:', modelPath);
		return;
	}

	if (isGLB) {
		if (!GLTFLoader) return;
		const loader = new GLTFLoader();
		loader.load(modelPath, function(gltf) {
			placeLoadedModel(gltf.scene, desiredLength, position, rotationDeg, scene);
		}, undefined, function(error) {
			console.error('Error cargando modelo GLB:', modelPath, error);
		});
	} else if (isOBJ) {
		if (!window.THREE.OBJLoader) {
			console.error('OBJLoader no está disponible.');
			return;
		}
		const loader = new window.THREE.OBJLoader();
		loader.load(modelPath, function(object) {
			placeLoadedModel(object, desiredLength, position, rotationDeg, scene);
		}, undefined, function(error) {
			console.error('Error cargando modelo OBJ:', modelPath, error);
		});
	}
}


// Envoltorio de generate3DView: cualquier excepción no atrapada en el
// cuerpo de la función (todo lo síncrono antes de animate(), como medir el
// contenedor, crear la cámara/plano del suelo, etc.) dejaba la pantalla
// congelada en el color de fondo (lila) para siempre, sin ninguna pista de
// qué había fallado. Ahora se atrapa, se registra en consola con detalle, y
// se muestra un aviso visible en la propia vista en vez de quedar en
// silencio -así se puede diagnosticar un caso real sin acceso a esos datos.
function generate3DView(style) {
	try {
		generate3DViewInner(style);
	} catch (err) {
		console.error('[3D] Error generando la vista 3D:', err);
		show3DErrorBanner('No se pudo generar la vista 3D. ' + (err && err.message ? err.message : err));
	}
}

function show3DErrorBanner(message) {
	const banner = document.getElementById('view3d-error-banner');
	if (banner) {
		banner.textContent = message;
		banner.style.display = 'block';
	}
}

function hide3DErrorBanner() {
	const banner = document.getElementById('view3d-error-banner');
	if (banner) banner.style.display = 'none';
}

function generate3DViewInner(style) {
	const container = document.getElementById('container-3d-full');
	const canvas = document.getElementById('canvas-3d-full');
	if (!canvas) {
		console.error('[3D] No se encontró el canvas #canvas-3d-full');
		return;
	}
	const rect = canvas.getBoundingClientRect();
	setupElementDragging(canvas);
	setupTourButton();
	hide3DErrorBanner();
	// La rejilla de elevación real es de la ubicación/tamaño de plano
	// anteriores: se descarta para no aplicar datos de otro sitio mientras
	// llega la nueva (ver fetchTerrainElevation más abajo).
	terrainElevGrid = null;
	mapFeatureAnchors = [];
	terrainPads = [];
	const myTerrainRequestId = ++terrainRequestId;
	// La escena/cámara/controles de un tour en marcha quedan obsoletos en
	// cuanto se regenera la vista (p.ej. se editó el mapa): no seguir
	// animando sobre referencias descartadas.
	tourActive = false;
	tourState = null;
	updateTourUI();

	if (threeRenderer) threeRenderer.dispose();
	if (threeControls) threeControls.dispose();
	if (animationFrameId) cancelAnimationFrame(animationFrameId);

	// Centramos la escena en el centro real de los elementos del festival,
	// no en el centro de la vista 2D actual: si el mapa había quedado
	// desplazado/paneado respecto a dónde está el festival, los elementos
	// (sobre todo el escenario) terminaban cerca del borde de la cámara o
	// directamente fuera, viéndose solo su etiqueta flotante.
	let center;
	if (elements.length > 0) {
		const lats = [], lngs = [];
		elements.forEach(el => {
			// Un elemento sin moveMarker válido (datos viejos/corruptos) no
			// debe abortar toda la generación de la vista 3D -eso dejaba la
			// pantalla congelada en el color de fondo para siempre-, así
			// que se ignora y se sigue con el resto.
			try {
				const ll = el.moveMarker.getLatLng();
				// Un solo NaN aquí no lanza excepción (Math.min/max con NaN
				// da NaN, y esa contaminación se arrastra a "center", al
				// tamaño del plano y a la posición de la cámara sin ningún
				// error visible): de ahí el "todo violeta" sin pista alguna.
				if (!isFinite(ll.lat) || !isFinite(ll.lng)) throw new Error('coordenada no finita');
				lats.push(ll.lat);
				lngs.push(ll.lng);
			} catch (err) {
				console.error('[3D] Elemento con coordenadas inválidas, se ignora:', el && el.type, el && el.id, err);
			}
		});
		// Mediana, no el punto medio de min/max: con min/max, un único
		// elemento perdido lejos del resto (dato viejo/corrupto, pero con
		// coordenadas finitas -no lo detecta la guarda de arriba-) arrastra
		// igualmente el centro justo a medio camino hacia él. El recinto
		// real -el resto de elementos, agrupados entre sí- quedaba centrado
		// en un punto equivocado: la cámara/suelo se armaban ahí, y el
		// recinto de verdad, ahora lejos de ese centro, quedaba fuera de lo
		// visible -"se ve el mapa pero sin los elementos"-. La mediana
		// ignora esa clase de valores atípicos mientras sean menos de la
		// mitad de los elementos.
		center = lats.length ? L.latLng(median(lats), median(lngs)) : map.getCenter();
	} else {
		center = map.getCenter();
	}
	const zoom = map.getZoom();

	// El plano del suelo debe medir, en unidades, lo mismo que mide en metros
	// reales el tile mostrado (a esta lat/zoom), para que coincida con la
	// escala en metros de los elementos (vallas, escenarios, etc.).
	const tileBasedSize = 40075016.686 * Math.cos(center.lat * Math.PI / 180) / Math.pow(2, zoom);

	// Si los elementos están más lejos del centro que ese tile, agrandamos
	// el plano para que ninguno quede fuera (o directamente invisible).
	// Ningún festival real mide más de esto de punta a punta: un solo
	// elemento con una coordenada válida (finita) pero absurdamente lejana
	// -p.ej. un arrastre que se fue de madre, o un dato importado de otro
	// sitio- no lanza ninguna excepción por sí solo (a diferencia de un
	// NaN), pero disparaba "maxReachMeters" a un valor igual de destructivo:
	// la cámara se colocaba a esa misma distancia absurda de su objetivo,
	// muy por detrás del plano de recorte lejano de la cámara (ver
	// "farPlane" más abajo) -el recinto entero quedaba fuera de lo que la
	// cámara puede llegar a dibujar, sin ningún error, "todo violeta".
	const MAX_SANE_REACH_METERS = 3000;
	let maxReachMeters = 0;
	elements.forEach(el => {
		try {
			const dist = map.distance(center, el.moveMarker.getLatLng());
			const halfExtent = el.isRectangle
				? Math.sqrt(Math.pow((el.length || 0) / 2, 2) + Math.pow((el.width || 0) / 2, 2))
				: (el.length || 0) / 2;
			const reach = dist + halfExtent;
			if (!isFinite(reach)) throw new Error('alcance no finito');
			if (reach > MAX_SANE_REACH_METERS) throw new Error(`alcance atípico (${Math.round(reach)}m), se ignora para encuadrar la cámara`);
			maxReachMeters = Math.max(maxReachMeters, reach);
		} catch (err) {
			console.error('[3D] Elemento con coordenadas inválidas, se ignora:', el && el.type, el && el.id, err);
		}
	});
	const fitAllSize = maxReachMeters > 0 ? maxReachMeters * 2 * 1.2 : 0;
	const desiredPlaneSize = Math.max(tileBasedSize, fitAllSize, 20);

	let tileTemplate = '';
	let subdomain = 'a';
	let styleKey = 'cartodb-light';
	for (const key in mapLayers) {
		if (map.hasLayer(mapLayers[key])) {
			styleKey = key;
			break;
		}
	}

	switch(styleKey) {
		case 'osm-streets':
			tileTemplate = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
			subdomain = 'a';
			break;
		case 'cartodb-light':
			tileTemplate = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';
			subdomain = 'a';
			break;
		case 'cartodb-dark':
			tileTemplate = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';
			subdomain = 'a';
			break;
		case 'esri-satellite':
			tileTemplate = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
			subdomain = '';
			break;
		default:
			tileTemplate = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';
			subdomain = 'a';
	}
	function lng2tile(lon, z) {
		return Math.floor((lon + 180) / 360 * Math.pow(2, z));
	}
	function lat2tile(lat, z) {
		return Math.floor((1 - Math.log(Math.tan(lat * Math.PI/180) + 1/Math.cos(lat * Math.PI/180)) / Math.PI) / 2 * Math.pow(2, z));
	}
	function tile2lng(x, z) {
		return x / Math.pow(2, z) * 360 - 180;
	}
	function tile2lat(y, z) {
		const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
		return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
	}
	function tileUrlFor(x, y) {
		return tileTemplate.replace('{s}', subdomain).replace('{z}', zoom).replace('{x}', x).replace('{y}', y);
	}

	// La textura de fondo es un mosaico de tiles reales, no un único tile
	// estirado: si el suelo mide más que un tile (algo habitual, ya que su
	// tamaño se ajusta a dónde están los elementos) y usáramos solo un
	// tile, la imagen de fondo quedaba desalineada de las posiciones reales
	// - lo que se veía como elementos "desplazados" varios metros respecto
	// al mapa real. Elegimos el rango de tiles que cubre el suelo deseado
	// y usamos su bbox EXACTO (no el estimado) tanto para la textura como
	// para ubicar los elementos, así ambos quedan perfectamente alineados.
	const metersToLat = 1 / 111320;
	const metersToLng = 1 / (111320 * Math.cos(center.lat * Math.PI / 180));
	const desiredHalf = desiredPlaneSize / 2;
	const MAX_TILES_PER_AXIS = 6;
	let tileXmin = lng2tile(center.lng - desiredHalf * metersToLng, zoom);
	let tileXmax = lng2tile(center.lng + desiredHalf * metersToLng, zoom);
	let tileYmin = lat2tile(center.lat + desiredHalf * metersToLat, zoom);
	let tileYmax = lat2tile(center.lat - desiredHalf * metersToLat, zoom);
	tileXmax = Math.min(tileXmax, tileXmin + MAX_TILES_PER_AXIS - 1);
	tileYmax = Math.min(tileYmax, tileYmin + MAX_TILES_PER_AXIS - 1);

	const minLng = tile2lng(tileXmin, zoom);
	const maxLng = tile2lng(tileXmax + 1, zoom);
	const maxLat = tile2lat(tileYmin, zoom);
	const minLat = tile2lat(tileYmax + 1, zoom);

	map3dPlaneSize = (maxLng - minLng) * 111320 * Math.cos(center.lat * Math.PI / 180);
	// "cameraFitRadius" (más abajo) puede superar "map3dPlaneSize" -el suelo
	// se ajusta al mosaico de tiles, no al alcance real de los elementos-,
	// así que el plano de recorte lejano tiene que cubrir también ese
	// alcance: si la cámara queda más lejos de su objetivo que "farPlane",
	// TODO lo que hay que ver cae fuera del frustum y no se dibuja nada.
	const farPlane = Math.max(1000, map3dPlaneSize * 4, maxReachMeters * 6);

	threeScene = new THREE.Scene();
	threeCamera = new THREE.PerspectiveCamera(75, container.offsetWidth / container.offsetHeight, 0.1, farPlane);
	// El centro real de los elementos (en coordenadas del plano) casi nunca
	// cae en el origen (0,0): el suelo se ajusta a los límites de los
	// tiles del mapa a este zoom, no al centro exacto de los elementos, así
	// que ese centro puede quedar desplazado decenas o cientos de metros
	// del (0,0,0). Mirar siempre al origen -como antes- podía dejar la
	// cámara apuntando a suelo vacío con pocos elementos: se veía "todo en
	// violeta" sin ningún error, porque no había ningún fallo, solo nada
	// que ver desde ahí.
	const cameraTargetPlane = latLngToPlane(center.lat, center.lng, { minLat, maxLat, minLng, maxLng });
	// La cámara encuadra el radio real que ocupan los elementos (no el
	// suelo completo, que suele tener margen de sobra), para que el
	// escenario y compañía se vean grandes de entrada y no haya que
	// acercar la cámara a mano para distinguirlos del fondo. Con pocos
	// elementos muy juntos (o uno solo, pequeño) ese radio podía ser de
	// menos de un metro: la cámara terminaba literalmente dentro de la
	// figura/modelo. Un mínimo razonable evita que quede pegada o metida
	// dentro de la geometría.
	const cameraFitRadius = Math.max(maxReachMeters > 0 ? maxReachMeters : map3dPlaneSize * 0.5, 8);
	threeCamera.position.set(cameraTargetPlane.x, cameraFitRadius * 0.96, cameraTargetPlane.z + cameraFitRadius * 1.2);
	threeCamera.lookAt(cameraTargetPlane.x, 0, cameraTargetPlane.z);

	threeRenderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
	threeRenderer.setClearColor(0x222244, 1);
	threeRenderer.setSize(container.offsetWidth, container.offsetHeight);

	threeControls = new THREE.OrbitControls(threeCamera, threeRenderer.domElement);
	threeControls.enableDamping = true;
	threeControls.target.set(cameraTargetPlane.x, 0, cameraTargetPlane.z);

	window.addEventListener('resize', () => {
		const container = document.getElementById('container-3d-full');
		if (container.classList.contains('active')) {
			threeCamera.aspect = container.offsetWidth / container.offsetHeight;
			threeCamera.updateProjectionMatrix();
			threeRenderer.setSize(container.offsetWidth, container.offsetHeight);
		}
	});

	const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
	threeScene.add(ambientLight);
	const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
	directionalLight.position.set(1, 1, 1);
	threeScene.add(directionalLight);

	// Relieve del suelo: arranca liso (sin datos de elevación real todavía,
	// ver getTerrainHeight) para no dejar la vista bloqueada esperando red.
	// En cuanto llega esa elevación (más abajo, tras drawElements) se
	// reconstruye con datos reales -y, en ambas pasadas, con las
	// plataformas niveladas bajo cada elemento (ver computeGroundHeight),
	// que solo se conocen DESPUÉS de llamar a drawElements: por eso el
	// suelo se reconstruye otra vez justo después de esa llamada.
	const groundGeometry = new THREE.PlaneGeometry(map3dPlaneSize, map3dPlaneSize, 48, 48);
	const groundPos = groundGeometry.attributes.position;
	for (let i = 0; i < groundPos.count; i++) {
		groundPos.setZ(i, computeGroundHeight(groundPos.getX(i), groundPos.getY(i)));
	}
	groundPos.needsUpdate = true;
	groundGeometry.computeVertexNormals();
	const groundMaterial = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
	const ground = new THREE.Mesh(groundGeometry, groundMaterial);
	ground.rotation.x = -Math.PI / 2;
	threeScene.add(ground);
	ground.userData = { minLat, maxLat, minLng, maxLng };

	// Descargamos y unimos en un solo lienzo todos los tiles del rango, en
	// su posición correcta, y lo usamos como textura del suelo.
	const numTX = tileXmax - tileXmin + 1;
	const numTY = tileYmax - tileYmin + 1;
	const stitchCanvas = document.createElement('canvas');
	stitchCanvas.width = numTX * 256;
	stitchCanvas.height = numTY * 256;
	const stitchCtx = stitchCanvas.getContext('2d');
	// Un tile que falla (hipo de red puntual, no necesariamente el servidor
	// caído -ya se ha comprobado que responde bien la mayoría de veces-) se
	// tragaba en silencio (img.onerror simplemente resolvía igual, sin
	// reintento ni aviso): el suelo se quedaba con ese hueco -o, si fallaban
	// muchos/todos, "el mapa se ve vacío"- sin ninguna pista de que había
	// pasado. Ahora cada tile fallido se reintenta una vez antes de rendirse,
	// y se avisa por consola si una parte notable del mosaico quedó sin cargar.
	let tileFailCount = 0;
	const totalTiles = numTX * numTY;
	function loadTile(tx, ty, px, py, isRetry) {
		return new Promise((resolve) => {
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => { stitchCtx.drawImage(img, px, py, 256, 256); resolve(); };
			img.onerror = () => {
				if (!isRetry) {
					setTimeout(() => loadTile(tx, ty, px, py, true).then(resolve), 400);
				} else {
					tileFailCount++;
					resolve();
				}
			};
			img.src = tileUrlFor(tx, ty) + (isRetry ? (tileUrlFor(tx, ty).includes('?') ? '&' : '?') + 'retry=1' : '');
		});
	}
	const tileLoads = [];
	for (let ty = tileYmin; ty <= tileYmax; ty++) {
		for (let tx = tileXmin; tx <= tileXmax; tx++) {
			const px = (tx - tileXmin) * 256;
			const py = (ty - tileYmin) * 256;
			tileLoads.push(loadTile(tx, ty, px, py, false));
		}
	}
	Promise.all(tileLoads).then(() => {
		if (tileFailCount > 0) {
			console.warn(`[3D] ${tileFailCount}/${totalTiles} tiles del mapa de fondo no se pudieron cargar (tras reintentar); el suelo se ve con huecos o vacío en esa zona.`);
		}
		const texture = new THREE.CanvasTexture(stitchCanvas);
		texture.needsUpdate = true;
		ground.material.map = texture;
		ground.material.needsUpdate = true;
	});

	if (style === 'ilustrado') {
		ground.material.color.set(0x3d4a53);
	} else {
		ground.material.color.set(0x2D3436);
	}

	drawElements(elements, threeScene);

	// "Tiburón" necesita saber dónde está la barra más cercana para poder
	// rondarla -y eso solo se conoce con seguridad una vez que drawElements
	// ya ha creado TODOS los elementos (si "bar" apareciera más adelante en
	// la lista, buscarla a mitad del propio drawElements se la habría
	// perdido).
	setupMoneyWalkers(elements);

	// drawElements acaba de rellenar "terrainPads" (una plataforma nivelada
	// por cada elemento con huella real): el suelo ya se construyó ANTES de
	// saber esto, así que se reconstruye una vez más ahora para allanarlo
	// bajo cada elemento -si no, el primer fotograma se veía sin allanar
	// hasta que llegara la elevación real (o nunca, si esa petición fallaba).
	{
		const gPos = groundGeometry.attributes.position;
		for (let i = 0; i < gPos.count; i++) {
			gPos.setZ(i, computeGroundHeight(gPos.getX(i), gPos.getY(i)));
		}
		gPos.needsUpdate = true;
		groundGeometry.computeVertexNormals();
	}

	// Elevación real del recinto (ver fetchTerrainElevation): al llegar,
	// reconstruye el relieve del suelo y reacomoda cada elemento ya
	// colocado -y su etiqueta- a la altura real del terreno en su
	// posición, para que no queden flotando ni hundidos. "myTerrainRequestId"
	// evita aplicar una respuesta tardía sobre una escena ya regenerada
	// (p.ej. si el usuario cambió de vista antes de que llegara la red).
	fetchTerrainElevation(ground.userData, map3dPlaneSize).then(grid => {
		if (!grid || myTerrainRequestId !== terrainRequestId) return;
		terrainElevGrid = grid;

		// Reajusta cada elemento -y su plataforma nivelada (ver
		// terrainPads)- ANTES de reconstruir el suelo con esos datos: si no,
		// el suelo se allanaba a la altura vieja (calculada con el terreno
		// de la primera pasada) mientras el elemento ya se movía a la
		// nueva, dejando el mismo hueco/hundimiento que se quería evitar.
		elements.forEach(el => {
			// Las vallas SÍ deben reajustarse igual que cualquier otro
			// elemento: se crean apoyadas en el terreno visible en ese
			// momento (ver drawElements) y de quedar excluidas aquí -como
			// antes- se quedaban anclada a esa altura para siempre. En
			// cuanto el relieve real llegaba y el terreno subía por encima
			// en su punto, la valla quedaba literalmente enterrada bajo el
			// suelo.
			if (!el._threeObj) return;
			// Punto más alto de la huella real (no solo el centro): con un
			// único punto, un escenario/valla/barra con algo de pendiente
			// real bajo su huella quedaba con un extremo bien apoyado y el
			// otro hundido en el suelo.
			const h = groundHeightForFootprint(el._threeObj.position.x, el._threeObj.position.z, el.length, el.width, el.rotation);
			if (el._threeLabel) {
				// La etiqueta no se creó a "h=0": ya llevaba su propio
				// desplazamiento local (altura de la figura, etc.) sumado a
				// la altura de apoyo de ESE momento -hay que conservar solo
				// ese desplazamiento, no la altura de apoyo vieja.
				const localOffset = el._threeLabel.position.y - el._threeObj.position.y;
				el._threeLabel.position.y = h + localOffset;
			}
			el._threeObj.position.y = h;
			if (el._terrainPad) el._terrainPad.padY = h;
		});

		const gPos = groundGeometry.attributes.position;
		for (let i = 0; i < gPos.count; i++) {
			gPos.setZ(i, computeGroundHeight(gPos.getX(i), gPos.getY(i)));
		}
		gPos.needsUpdate = true;
		groundGeometry.computeVertexNormals();

		// Edificios/árboles reales ya colocados (ver applyMapFeatures): si
		// Overpass respondió antes que la elevación real, se posicionaron
		// con el ruido falso de entonces y se quedaban así para siempre
		// -"sin relieve"-, sin enterarse de que ya hay datos reales. Se
		// reancla cada uno a su altura real, igual que los elementos.
		mapFeatureAnchors.forEach(a => {
			a.mesh.position.y = getTerrainHeight(a.ax, a.az) + a.offset;
		});

		// La cámara (y el punto al que mira) se posicionaron antes de saber
		// la altura real del terreno ahí -asumiendo y=0-, así que si el
		// recinto resulta tener relieve de verdad, ambos quedaban a la
		// altura vieja mientras el contenido ya se movió a la nueva: la
		// cámara terminaba mirando muy por debajo (o por encima) de todo.
		// Solo se ajusta si el usuario no tocó la cámara todavía (el tour o
		// un arrastre manual ya la mueven por su cuenta).
		if (!tourActive && threeControls) {
			const targetH = getTerrainHeight(cameraTargetPlane.x, -cameraTargetPlane.z);
			threeCamera.position.y += targetH;
			threeControls.target.y += targetH;
			threeControls.update();
		}
	});

	// Edificios y árboles reales del entorno (ver fetchMapFeatures): sin
	// esto, el relieve del suelo ondula pero los edificios/árboles reales
	// seguían siendo solo la foto plana del satélite -"se mira plano"
	// aunque el terreno ya no lo fuera. Mismo guard de "myTerrainRequestId"
	// que la elevación, para no aplicar una respuesta tardía sobre una
	// escena ya descartada.
	fetchMapFeatures(ground.userData).then(data => {
		if (!data || myTerrainRequestId !== terrainRequestId) return;
		applyMapFeatures(data, ground.userData, threeScene);
	});

	// Si el primer frame (o cualquier frame) falla y sigue fallando en los
	// siguientes -algo en la escena que rompe el render, no solo un tile
	// bloqueado por CORS-, antes solo se veía en consola: la pantalla se
	// quedaba fija en el color de fondo para siempre y sin ningún aviso
	// visible, aunque el aviso de errores ya existiera para otros casos.
	// Se avisa una sola vez (no en cada frame, para no saturar) y se sigue
	// intentando por si el fallo era puntual.
	let animateErrorShown = false;
	function animate() {
		animationFrameId = requestAnimationFrame(animate);
		try {
			if (tourActive) {
				updateTour();
			} else {
				threeControls.update();
			}
			updateWanderingDrunks();
			updateMoneyWalkers();
			updateSecurityPatrols();
			threeRenderer.render(threeScene, threeCamera);
		} catch (err) {
			console.error('[3D] Error de render:', err);
			if (!animateErrorShown) {
				animateErrorShown = true;
				show3DErrorBanner('Error al dibujar la vista 3D. ' + (err && err.message ? err.message : err));
			}
		}
	}
	animate();
}

function latLngToPlane(lat, lng, bbox) {
	const planeSize = map3dPlaneSize;
	const x = ((lng - bbox.minLng) / (bbox.maxLng - bbox.minLng)) * planeSize - planeSize / 2;
	const z = ((bbox.maxLat - lat) / (bbox.maxLat - bbox.minLat)) * planeSize - planeSize / 2;
	return { x, z };
}

function planeToLatLng(x, z, bbox) {
	const planeSize = map3dPlaneSize;
	const lng = ((x + planeSize / 2) / planeSize) * (bbox.maxLng - bbox.minLng) + bbox.minLng;
	const lat = bbox.maxLat - ((z + planeSize / 2) / planeSize) * (bbox.maxLat - bbox.minLat);
	return L.latLng(lat, lng);
}

// Paseo/tambaleo de los "borrachos": en vez de moverlos por todo el
// recinto (que exigiría evitar otros elementos y los límites del suelo),
// dan vueltas en un círculo pequeño alrededor de donde se colocaron, con
// balanceo de piernas/brazo y un ligero tambaleo lateral.
function updateWanderingDrunks() {
	if (!wanderingDrunks.length) return;
	const t = performance.now() / 1000;
	wanderingDrunks.forEach(entry => {
		if (dragState && dragState.element === entry.element) return;

		const angle = t * 0.25 + entry.phase;
		const x = entry.centerX + Math.cos(angle) * DRUNK_WANDER_RADIUS;
		const z = entry.centerZ + Math.sin(angle) * DRUNK_WANDER_RADIUS;
		const heading = angle + Math.PI / 2;
		const wobble = Math.sin(t * 3 + entry.phase) * 0.25;

		entry.group.position.x = x;
		entry.group.position.z = z;
		// Altura del terreno en el punto donde está ahora (no donde se
		// colocó): si no, al alejarse del centro de su paseo se lo tragaba
		// o quedaba flotando sobre el relieve real (ver getTerrainHeight).
		entry.group.position.y = getTerrainHeight(x, -z) + Math.abs(Math.sin(t * 7 + entry.phase)) * 0.04;
		entry.group.rotation.y = heading + wobble;
		entry.group.rotation.z = Math.sin(t * 5 + entry.phase) * 0.08;

		const stride = Math.sin(t * 7 + entry.phase);
		if (entry.group.userData.legL) entry.group.userData.legL.rotation.x = stride * 0.5;
		if (entry.group.userData.legR) entry.group.userData.legR.rotation.x = -stride * 0.5;
		if (entry.group.userData.armDown) entry.group.userData.armDown.rotation.x = -stride * 0.4;

		if (entry.element._threeLabel) {
			entry.element._threeLabel.position.x = x;
			entry.element._threeLabel.position.z = z;
			entry.element._threeLabel.position.y = getTerrainHeight(x, -z) + DRUNK_FIGURE_HEIGHT + 0.3;
		}
	});
}

// Calcula, para cada "Tiburón" ya colocado (ver drawElements), el centro y
// "frente" real de su paseo: la barra MÁS CERCANA a donde se colocó (si hay
// alguna en el recinto). El "frente" se asume perpendicular al eje largo de
// la barra -mismo criterio que su rotación en el plano 2D-, ya que no hay
// forma de saber en los datos qué lado es el de los clientes; si el paseo
// se ve "por detrás" de la barra en algún caso concreto, basta con rotar esa
// barra 90°/180° en el editor. Sin ninguna barra en el recinto, se queda
// dando vueltas en círculo completo alrededor de donde se colocó (igual que
// un "borracho", ver updateWanderingDrunks).
function setupMoneyWalkers(elementsList) {
	if (!moneyWalkers.length) return;
	const bars = elementsList.filter(el => el.type === 'bar' && el._threeObj);
	moneyWalkers.forEach(entry => {
		if (!bars.length) { entry.hasBar = false; return; }

		let nearestBar = null, nearestDist = Infinity;
		bars.forEach(bar => {
			const d = Math.hypot(bar._threeObj.position.x - entry.startX, bar._threeObj.position.z - entry.startZ);
			if (d < nearestDist) { nearestDist = d; nearestBar = bar; }
		});

		entry.hasBar = true;
		entry.centerX = nearestBar._threeObj.position.x;
		entry.centerZ = nearestBar._threeObj.position.z;
		// El "frente" se toma de dónde se colocó Tiburón respecto a la barra
		// -mucho más fiable que adivinarlo a partir de la rotación de la
		// barra, que no distingue el lado del público del de detrás de la
		// barra-: si se colocó pegado al centro (caso degenerado), se cae de
		// vuelta a la perpendicular de la rotación.
		const dx = entry.startX - entry.centerX, dz = entry.startZ - entry.centerZ;
		entry.frontAngle = (dx * dx + dz * dz > 0.01)
			? Math.atan2(dz, dx)
			: -((nearestBar.rotation || 0) * Math.PI / 180) + Math.PI / 2;
		entry.radius = Math.max(nearestBar.length || 2, nearestBar.width || 2) / 2 + TIBURON_WALK_RADIUS;
	});
}

// Anima a "Tiburón" rondando la barra (ver setupMoneyWalkers): en vez de dar
// la vuelta entera, oscila de un lado a otro dentro de un arco de 260°
// centrado en el "frente" -así nunca pasa por detrás de la barra-, con el
// mismo paso/balanceo que "updateWanderingDrunks" y los brazos abriéndose y
// cerrándose para simular que lanza billetes al aire.
function updateMoneyWalkers() {
	if (!moneyWalkers.length) return;
	const t = performance.now() / 1000;
	moneyWalkers.forEach(entry => {
		if (dragState && dragState.element === entry.element) return;

		let angle, heading;
		if (entry.hasBar) {
			angle = entry.frontAngle + Math.sin(t * 0.12 + entry.phase) * TIBURON_ARC_RANGE;
			heading = angle + Math.PI / 2 * Math.sign(Math.cos(t * 0.12 + entry.phase) || 1);
		} else {
			angle = t * 0.12 + entry.phase;
			heading = angle + Math.PI / 2;
		}
		const cx = entry.hasBar ? entry.centerX : entry.startX;
		const cz = entry.hasBar ? entry.centerZ : entry.startZ;
		const radius = entry.hasBar ? entry.radius : TIBURON_WALK_RADIUS;
		const x = cx + Math.cos(angle) * radius;
		const z = cz + Math.sin(angle) * radius;

		entry.group.position.x = x;
		entry.group.position.z = z;
		entry.group.position.y = getTerrainHeight(x, -z);
		entry.group.rotation.y = heading;

		const stride = Math.sin(t * 3 + entry.phase);
		const ud = entry.group.userData;
		if (ud.legL) ud.legL.rotation.x = stride * 0.35;
		if (ud.legR) ud.legR.rotation.x = -stride * 0.35;
		// Brazos en alto abriéndose y cerrándose tipo "hace llover billetes",
		// en vez del balanceo de caminar normal.
		const spray = Math.abs(Math.sin(t * 3 + entry.phase));
		if (ud.armL) ud.armL.rotation.z = TIBURON_ARM_RAISE_ANGLE + spray * 0.3;
		if (ud.armR) ud.armR.rotation.z = -TIBURON_ARM_RAISE_ANGLE - spray * 0.3;
		if (ud.billsL) ud.billsL.rotation.x = spray * 0.5;
		if (ud.billsR) ud.billsR.rotation.x = -spray * 0.5;

		if (entry.element._threeLabel) {
			entry.element._threeLabel.position.x = x;
			entry.element._threeLabel.position.z = z;
			entry.element._threeLabel.position.y = getTerrainHeight(x, -z) + TIBURON_FIGURE_HEIGHT + 0.3;
		}
	});
}

// Anima a cada portero con recorrido dibujado (ver drawElements) patrullando
// su trayecto de ida y vuelta -tramo a tramo, a velocidad constante, con el
// mismo balanceo de piernas que el resto de figuras que caminan-, en vez del
// muñeco fijo de siempre. "cumDist"/"totalDist" se calculan una sola vez y
// se guardan en la propia entrada (ver drawElements).
function updateSecurityPatrols() {
	if (!securityPatrols.length) return;
	const now = performance.now();
	securityPatrols.forEach(entry => {
		if (dragState && dragState.element === entry.element) return;

		if (!entry.cumDist) {
			let total = 0;
			const cum = [0];
			for (let i = 1; i < entry.pathPlane.length; i++) {
				total += Math.hypot(entry.pathPlane[i].x - entry.pathPlane[i - 1].x, entry.pathPlane[i].z - entry.pathPlane[i - 1].z);
				cum.push(total);
			}
			entry.cumDist = cum;
			entry.totalDist = total;
			entry.oneWayMs = Math.max(1000, (total / SECURITY_PATROL_SPEED_MPS) * 1000);
			entry.startTime = now;
		}
		if (entry.totalDist < 0.2) return;

		const cycle = entry.oneWayMs * 2;
		const elapsed = (now - entry.startTime) % cycle;
		const forward = elapsed <= entry.oneWayMs;
		const distAlong = forward
			? (elapsed / entry.oneWayMs) * entry.totalDist
			: entry.totalDist - ((elapsed - entry.oneWayMs) / entry.oneWayMs) * entry.totalDist;

		const pts = entry.pathPlane, cum = entry.cumDist;
		let segIdx = 1;
		while (segIdx < cum.length - 1 && cum[segIdx] < distAlong) segIdx++;
		const segStart = pts[segIdx - 1], segEnd = pts[segIdx];
		const segLen = cum[segIdx] - cum[segIdx - 1];
		const segT = segLen > 0.0001 ? (distAlong - cum[segIdx - 1]) / segLen : 1;
		const x = segStart.x + (segEnd.x - segStart.x) * segT;
		const z = segStart.z + (segEnd.z - segStart.z) * segT;

		entry.group.position.x = x;
		entry.group.position.z = z;
		entry.group.position.y = getTerrainHeight(x, -z);

		const dx = (segEnd.x - segStart.x) * (forward ? 1 : -1);
		const dz = (segEnd.z - segStart.z) * (forward ? 1 : -1);
		if (dx * dx + dz * dz > 0.0001) entry.group.rotation.y = Math.atan2(-dz, dx);

		const t = now / 1000;
		const stride = Math.sin(t * 7 + (entry.element.id % 100));
		const ud = entry.group.userData;
		if (ud.legL) ud.legL.rotation.x = stride * 0.5;
		if (ud.legR) ud.legR.rotation.x = -stride * 0.5;
		if (ud.armL) ud.armL.rotation.x = -stride * 0.4;
		if (ud.armR) ud.armR.rotation.x = stride * 0.4;

		if (entry.element._threeLabel) {
			entry.element._threeLabel.position.x = x;
			entry.element._threeLabel.position.z = z;
			entry.element._threeLabel.position.y = getTerrainHeight(x, -z) + SECURITY_FIGURE_HEIGHT + 0.3;
		}
	});
}

// --- Tour automático: plano general + recorrido por todos los elementos ---
function setupTourButton() {
	const btn = document.getElementById('tour-3d-btn');
	if (!btn || btn.dataset.tourHandlerBound) return;
	btn.dataset.tourHandlerBound = '1';
	btn.addEventListener('click', () => {
		if (tourActive) stopTour(); else startTour();
	});
}

function updateTourUI() {
	const btn = document.getElementById('tour-3d-btn');
	const caption = document.getElementById('tour-3d-caption');
	if (btn) {
		btn.textContent = tourActive ? '⏹ Detener tour' : '🎬 Tour automático';
		btn.classList.toggle('active', tourActive);
	}
	if (caption) caption.style.display = tourActive ? 'block' : 'none';
}

function updateTourCaption(text) {
	const caption = document.getElementById('tour-3d-caption');
	if (caption) caption.textContent = text || '';
}

// Un fotograma clave por elemento del festival (salvo las vallas, que son
// muchos segmentos y no aportan nada mostrarlas una a una) más planos
// generales del recinto. La distancia/altura de cámara se adapta al tamaño
// de cada elemento, y el ángulo varía con el índice para que no todos los
// planos se vean desde el mismo lado.
const GOLDEN_ANGLE = 2.4;

// Plano general del recinto entero, visto cada vez desde un punto distinto
// (ángulo y altura varían con "idx", más un desplazamiento aleatorio fijado
// al arrancar el tour) para que no se repita el mismo encuadre cada vez que
// el tour vuelve a él, ni tampoco entre una tanda del tour y la siguiente.
// "orbitBaseAngle" queda guardado en el fotograma para que, durante el
// hold, la órbita continúe desde ahí en vez de reiniciar en ángulo 0 -eso
// producía un salto/corte justo al llegar al plano general (ver updateTour).
function buildOverviewKeyframe(idx, hold, baseAngleOffset, center) {
	const overviewDist = Math.max(map3dPlaneSize * 0.55, 15);
	const angle = baseAngleOffset + idx * GOLDEN_ANGLE * 1.3;
	const elevation = 0.65 + 0.25 * Math.sin(idx * 1.7);
	const c = center || new THREE.Vector3(0, 0, 0);
	return {
		label: 'Vista general',
		target: c.clone(),
		pos: new THREE.Vector3(
			c.x + Math.sin(angle) * overviewDist,
			c.y + overviewDist * elevation,
			c.z + Math.cos(angle) * overviewDist
		),
		hold,
		orbit: true,
		orbitBaseAngle: angle
	};
}

// Agrupa los elementos por tipo (conservando el orden de primera aparición
// de cada tipo, y el orden original dentro de cada uno): así, p.ej., todos
// los de seguridad se recorren seguidos, cámara en mano de uno a otro sin
// volver al plano general -eso solo pasa al cambiar de tipo de elemento.
function groupElementsByType(tourable) {
	const groups = [];
	const groupByType = new Map();
	tourable.forEach(el => {
		let group = groupByType.get(el.type);
		if (!group) {
			group = [];
			groupByType.set(el.type, group);
			groups.push(group);
		}
		group.push(el);
	});
	return groups;
}

function buildTourKeyframes() {
	const keyframes = [];
	const baseAngleOffset = Math.random() * Math.PI * 2;
	let overviewCount = 0;

	const tourable = elements.filter(el => el.type !== 'fence' && el.type !== 'panic-fence' && el._threeObj);
	// El plano general orbita alrededor del centro real de los elementos,
	// no del origen del mundo (0,0,0): el suelo se ajusta a los tiles del
	// mapa a ese zoom, no al centro de los elementos, así que ambos casi
	// nunca coinciden -con pocos elementos lejos del origen, el plano
	// general apuntaba a suelo vacío.
	const overviewCenter = new THREE.Vector3();
	if (tourable.length) {
		tourable.forEach(el => {
			const wp = new THREE.Vector3();
			el._threeObj.getWorldPosition(wp);
			overviewCenter.add(wp);
		});
		overviewCenter.divideScalar(tourable.length);
		overviewCenter.y = 0;
	}
	keyframes.push(buildOverviewKeyframe(overviewCount++, 3000, baseAngleOffset, overviewCenter));
	let elIdx = 0;

	groupElementsByType(tourable).forEach(group => {
		group.forEach(el => {
			const worldPos = new THREE.Vector3();
			el._threeObj.getWorldPosition(worldPos);
			const cfg = (typeof festivalConfig !== 'undefined' && festivalConfig[el.type]) || {};
			const size = Math.max(el.length || 0, el.width || 0, 3);
			const dist = Math.max(size * 1.5, 4.5);
			const angle = elIdx * GOLDEN_ANGLE; // variedad de encuadres por elemento
			const targetHeight = 1.3;
			const target = new THREE.Vector3(worldPos.x, targetHeight, worldPos.z);
			const pos = new THREE.Vector3(
				worldPos.x + Math.sin(angle) * dist,
				targetHeight + dist * 0.5,
				worldPos.z + Math.cos(angle) * dist
			);
			keyframes.push({
				label: el.name || cfg.label || el.type,
				target,
				pos,
				hold: 1600,
				// Las figuras que deambulan (ver updateWanderingDrunks) se mueven
				// solas: durante el hold (y ya desde la transición) seguimos su
				// posición real en vez de la congelada al construir el fotograma.
				followElement: el.type === 'drunk' ? el : null
			});
			elIdx++;
		});

		// Solo al terminar cada TIPO de elemento -no entre cada uno- un
		// respiro de plano general desde otro punto antes de seguir.
		keyframes.push(buildOverviewKeyframe(overviewCount++, 1700, baseAngleOffset, overviewCenter));
	});

	return keyframes;
}

function startTour() {
	if (!threeScene || !threeCamera || !threeControls) return;
	const keyframes = buildTourKeyframes();
	if (!keyframes.length) return;
	tourActive = true;
	threeControls.enabled = false;
	tourState = {
		keyframes,
		idx: -1,
		current: null,
		phase: 'transition',
		segStart: performance.now(),
		fromPos: threeCamera.position.clone(),
		fromTarget: threeControls.target.clone()
	};
	advanceTourKeyframe();
	updateTourUI();
}

function stopTour() {
	tourActive = false;
	tourState = null;
	if (threeControls) threeControls.enabled = true;
	updateTourUI();
}

function advanceTourKeyframe() {
	tourState.idx++;
	if (tourState.idx >= tourState.keyframes.length) {
		stopTour();
		return;
	}
	tourState.fromPos = threeCamera.position.clone();
	tourState.fromTarget = threeControls.target.clone();
	tourState.phase = 'transition';
	tourState.segStart = performance.now();
	tourState.current = tourState.keyframes[tourState.idx];
	updateTourCaption(tourState.current.label);
}

function easeInOutQuad(t) {
	return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function updateTour() {
	if (!tourState || !tourState.current) return;
	const kf = tourState.current;
	const now = performance.now();
	const elapsed = now - tourState.segStart;

	// Fotograma de destino "en vivo": si la cámara persigue a una figura que
	// deambula (ver updateWanderingDrunks), tanto la transición como el hold
	// apuntan a su posición actual -no a la congelada al construir el
	// fotograma-, si no la transición llegaba a un punto y el hold arrancaba
	// de otro: un salto justo al terminar de llegar.
	let liveTarget = kf.target;
	let livePos = kf.pos;
	if (kf.followElement && kf.followElement._threeObj) {
		const wp = new THREE.Vector3();
		kf.followElement._threeObj.getWorldPosition(wp);
		liveTarget = new THREE.Vector3(wp.x, kf.target.y, wp.z);
		livePos = new THREE.Vector3(liveTarget.x + (kf.pos.x - kf.target.x), kf.pos.y, liveTarget.z + (kf.pos.z - kf.target.z));
	}

	if (tourState.phase === 'transition') {
		const t = Math.min(1, elapsed / TOUR_TRANSITION_MS);
		const ease = easeInOutQuad(t);
		const pos = tourState.fromPos.clone().lerp(livePos, ease);
		const target = tourState.fromTarget.clone().lerp(liveTarget, ease);
		threeCamera.position.copy(pos);
		threeCamera.lookAt(target);
		threeControls.target.copy(target);
		if (t >= 1) {
			tourState.phase = 'hold';
			tourState.segStart = now;
		}
		return;
	}

	// phase === 'hold'
	let pos;
	if (kf.orbit) {
		// Continúa la órbita desde el mismo ángulo en el que terminó la
		// transición (orbitBaseAngle), no desde 0: si no, había un salto
		// justo al llegar al plano general.
		const angle = kf.orbitBaseAngle + elapsed * 0.00025;
		const r = kf.pos.clone().sub(kf.target).setY(0).length();
		pos = new THREE.Vector3(liveTarget.x + Math.sin(angle) * r, kf.pos.y, liveTarget.z + Math.cos(angle) * r);
	} else {
		pos = livePos;
	}
	threeCamera.position.copy(pos);
	threeCamera.lookAt(liveTarget);
	threeControls.target.copy(liveTarget);
	if (elapsed >= kf.hold) advanceTourKeyframe();
}

// --- Arrastrar elementos con el puntero en la vista 3D ---
// Los listeners se enganchan una sola vez al canvas (guardado en su
// dataset); threeScene/threeCamera/threeControls son "let" del módulo, así
// que los handlers siempre ven la escena/cámara/controles vigentes aunque
// generate3DView() los reemplace en cada cambio de vista.
let dragState = null;
const dragRaycaster = new THREE.Raycaster();
const dragPointerNDC = new THREE.Vector2();

function findElementIn3DObject(obj) {
	let o = obj;
	while (o) {
		if (o.userData && o.userData.element) return o.userData.element;
		o = o.parent;
	}
	return null;
}

function updatePointerNDC(ev) {
	const rect = threeRenderer.domElement.getBoundingClientRect();
	dragPointerNDC.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
	dragPointerNDC.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
}

// Recentra la órbita de la cámara en un elemento sin cambiar el ángulo ni
// la distancia actuales (traslada cámara y objetivo por el mismo delta):
// así el usuario puede "traer" a un elemento que quedó lejos del centro
// -p.ej. en una esquina del recinto- y una vez centrado acercar el zoom
// con el scroll/pellizco, en vez de tener que arrastrar con el botón
// derecho para paneo (poco descubrible, y en móvil no existe).
function focusCameraOnElement(element) {
	if (!threeCamera || !threeControls || !element || !element._threeObj) return;
	const newTarget = new THREE.Vector3();
	element._threeObj.getWorldPosition(newTarget);
	newTarget.y += 1;
	const delta = newTarget.clone().sub(threeControls.target);
	threeControls.target.copy(newTarget);
	threeCamera.position.add(delta);
	threeControls.update();
}

function setupElementDragging(canvas) {
	if (canvas.dataset.dragHandlersBound) return;
	canvas.dataset.dragHandlersBound = '1';

	// Mover un elemento en 3D exige doble clic/doble toque -no basta con un
	// clic y arrastrar-: si no, cada vez que el cursor bajaba encima de un
	// elemento para simplemente girar la cámara, el elemento se movía en
	// vez de orbitar la vista. Con un solo toque no se arma el arrastre (ni
	// se bloquean los OrbitControls, que giran con normalidad); solo el
	// segundo toque de un doble clic -y mantener pulsado tras él- arrastra.
	let lastElementTap = { element: null, time: 0, x: 0, y: 0 };
	let pendingFocusTap = null;
	const DOUBLE_TAP_MS = 400;
	const TAP_MOVE_PX = 6;

	canvas.addEventListener('pointerdown', (ev) => {
		if (!threeScene || !threeCamera) return;
		updatePointerNDC(ev);
		dragRaycaster.setFromCamera(dragPointerNDC, threeCamera);
		const hits = dragRaycaster.intersectObjects(threeScene.children, true);
		for (const hit of hits) {
			const element = findElementIn3DObject(hit.object);
			if (!element) continue;

			const now = performance.now();
			const isSecondTap = lastElementTap.element === element
				&& (now - lastElementTap.time) < DOUBLE_TAP_MS
				&& Math.hypot(ev.clientX - lastElementTap.x, ev.clientY - lastElementTap.y) < 25;

			if (isSecondTap) {
				lastElementTap = { element: null, time: 0, x: 0, y: 0 };
				pendingFocusTap = null;
				dragState = { element, lastX: null, lastZ: null, moved: false };
				if (typeof selectElement === 'function') selectElement(element);
				if (threeControls) threeControls.enabled = false;
				// Captura el puntero para que pointermove/pointerup sigan
				// llegando aunque el cursor salga del lienzo a mitad de arrastre.
				canvas.setPointerCapture(ev.pointerId);
				ev.preventDefault();
			} else {
				// Primer toque: ni arrastra ni bloquea la cámara, solo se
				// recuerda para detectar el siguiente toque como doble clic
				// y, si en el pointerup no hubo apenas movimiento, centrar
				// la cámara en el elemento (ver el listener de pointerup).
				lastElementTap = { element, time: now, x: ev.clientX, y: ev.clientY };
				pendingFocusTap = { element, startX: ev.clientX, startY: ev.clientY };
			}
			break;
		}
	});

	canvas.addEventListener('pointerup', (ev) => {
		if (dragState || !pendingFocusTap) return;
		const { element, startX, startY } = pendingFocusTap;
		pendingFocusTap = null;
		if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < TAP_MOVE_PX) {
			focusCameraOnElement(element);
		}
	});

	canvas.addEventListener('pointermove', (ev) => {
		if (!dragState) return;
		if (!dragState.moved) dragState.moved = true;
		const ground = threeScene.children.find(o => o.userData && o.userData.minLat !== undefined);
		if (!ground) return;
		updatePointerNDC(ev);
		dragRaycaster.setFromCamera(dragPointerNDC, threeCamera);
		const hit = dragRaycaster.intersectObject(ground, false)[0];
		if (!hit) return;

		const { element } = dragState;
		dragState.lastX = hit.point.x;
		dragState.lastZ = hit.point.z;
		// Reposicionar en vivo el objeto 3D y su etiqueta; el dato real
		// (moveMarker/2D) solo se confirma al soltar, para no recalcular
		// todo el mapa 2D en cada frame de arrastre.
		if (element._threeObj) {
			element._threeObj.position.x = hit.point.x;
			element._threeObj.position.z = hit.point.z;
		}
		if (element._threeLabel) {
			element._threeLabel.position.x = hit.point.x;
			element._threeLabel.position.z = hit.point.z;
		}
	});

	function endDrag() {
		if (threeControls) threeControls.enabled = true;
		if (!dragState) return;
		const { element, lastX, lastZ, moved } = dragState;
		dragState = null;
		if (!moved || lastX === null) {
			// Doble clic armado pero sin arrastre real después (o el rayo
			// nunca llegó a tocar el suelo): en vez de no hacer nada, centra
			// la cámara en ese elemento. Así se puede "traer al centro" un
			// elemento que quedó en una esquina (p.ej. la entrada) sin
			// depender de paneo manual, y luego acercar el zoom con calma.
			focusCameraOnElement(element);
			return;
		}

		const ground = threeScene.children.find(o => o.userData && o.userData.minLat !== undefined);
		if (!ground) return;
		const newLatLng = planeToLatLng(lastX, lastZ, ground.userData);

		// Mismo patrón delta que el arrastre en 2D (ver moveMarker.on('drag')
		// en elements.js): así no se pierde un offset manual de la etiqueta.
		const oldLatLng = element.moveMarker.getLatLng();
		const dLat = newLatLng.lat - oldLatLng.lat;
		const dLng = newLatLng.lng - oldLatLng.lng;
		element.moveMarker.setLatLng(newLatLng);
		const labelPos = element.labelMarker.getLatLng();
		element.labelMarker.setLatLng([labelPos.lat + dLat, labelPos.lng + dLng]);
		updateElementShape(element, true);
		saveHistory();

		// Si es un "borracho" que deambula solo, que retome el paseo
		// centrado en el punto donde se soltó, no en el de antes de arrastrarlo.
		const wanderEntry = wanderingDrunks.find(w => w.element === element);
		if (wanderEntry) { wanderEntry.centerX = lastX; wanderEntry.centerZ = lastZ; }

		// Igual para "Tiburón" sin ninguna barra en el recinto (ver
		// setupMoneyWalkers): si hay barra, el paseo sigue centrado en ELLA
		// sin importar dónde se suelte, así que no hace falta tocar nada.
		const moneyEntry = moneyWalkers.find(w => w.element === element);
		if (moneyEntry && !moneyEntry.hasBar) { moneyEntry.startX = lastX; moneyEntry.startZ = lastZ; }
	}
	canvas.addEventListener('pointerup', endDrag);
	canvas.addEventListener('pointercancel', endDrag);
}

function drawElements(elements, threeScene) {
	if (!elements.length) return;
	const ground = threeScene.children.find(obj => obj.type === 'Mesh' && obj.userData && obj.userData.minLat !== undefined);
	if (!ground) return;
	const bbox = ground.userData;
	wanderingDrunks = [];
	moneyWalkers = [];
	securityPatrols = [];
	const skipped = [];

	elements.forEach(element => {
	  // Un elemento con datos corruptos/inesperados (p.ej. de una versión
	  // vieja del proyecto, o un duplicado a medio guardar) no debe tirar
	  // abajo TODA la vista 3D: sin este try/catch, una excepción aquí
	  // interrumpía drawElements a mitad de camino y generate3DView nunca
	  // llegaba a animate() -la pantalla se quedaba fija en el color de
	  // fondo (lila) para siempre, con o sin conexión a internet.
	  try {
		const latLng = element.moveMarker.getLatLng();
		const pos = latLngToPlane(latLng.lat, latLng.lng, bbox);
		// Una posición no finita no lanza excepción por sí sola: produce una
		// malla con vértices/esfera acotadora NaN que Three.js recorta en
		// silencio (frustum culling), invisible sin ningún error en consola
		// -así podían "desaparecer" vallas u otros elementos concretos
		// mientras el resto de la escena se veía con normalidad.
		if (!isFinite(pos.x) || !isFinite(pos.z)) throw new Error('posición no finita');
		let obj3d;

		// Altura de apoyo ya desde la primera pasada (antes quedaba a 0 hasta
		// que el terreno real llegaba -o para siempre, si esa petición
		// fallaba-, mientras el suelo ya ondulaba desde el primer fotograma
		// con el ruido de respaldo: los elementos parecían flotar o hundirse
		// según el punto, independientemente de si había datos reales o no.
		const groundY = groundHeightForFootprint(pos.x, pos.z, element.length, element.width, element.rotation);
		// Nivela una "plataforma" en el propio terreno bajo su huella (ver
		// computeGroundHeight/terrainPads): sin esto, apoyarse en el punto
		// más alto dejaba el objeto plano y en el aire por el lado bajo en
		// cuanto había pendiente real -"apoyando en un lado y el otro en el
		// aire"-, en vez de verse como si el sitio se hubiera preparado de
		// verdad para el montaje.
		const terrainPad = {
			x: pos.x, z: pos.z,
			halfLength: (element.length || 0) / 2,
			halfWidth: (element.width || 0) / 2,
			rotY: -((element.rotation || 0) * Math.PI) / 180,
			padY: groundY
		};
		terrainPads.push(terrainPad);
		// Referencia guardada en el propio elemento para poder actualizar
		// "padY" cuando llegue la elevación real (ver más abajo, junto al
		// reajuste de altura de "elements"): sin esto no habría forma de
		// encontrar de vuelta la plataforma de ESTE elemento -el orden de
		// "terrainPads" no tiene por qué corresponderse con el de
		// "elements" si algún otro elemento falló y quedó fuera.
		element._terrainPad = terrainPad;

		if (element.type === 'main-stage') {
            obj3d = createStageModel(new THREE.Vector3(pos.x, groundY, pos.z), element, threeScene);
        } else if (element.type === 'food-truck') {
            obj3d = createFoodTruckModel(new THREE.Vector3(pos.x, groundY, pos.z), element, threeScene);
        } else if (element.type === 'security') {
            // Con recorrido dibujado a mano (ver startPathDrawing en
            // elements.js): portero que patrulla ese trayecto de ida y
            // vuelta (ver updateSecurityPatrols), en vez del muñeco fijo de
            // siempre -necesita piernas/brazos separados para poder animar
            // el paso, por eso usa un cuerpo distinto al "pelele" estático.
            if (element.pathCoords && element.pathCoords.length > 1) {
                obj3d = createSecurityWalkerFigure(new THREE.Vector3(pos.x, groundY, pos.z), element.rotation, threeScene);
                const pathPlane = element.pathCoords.map(ll => latLngToPlane(ll.lat, ll.lng, bbox));
                securityPatrols.push({ element, group: obj3d, groundY, pathPlane });
            } else {
                obj3d = createSecurityFigure(new THREE.Vector3(pos.x, groundY, pos.z), element.rotation, threeScene);
            }
        } else if (element.type === 'entrance') {
            obj3d = createEntranceArch(new THREE.Vector3(pos.x, groundY, pos.z), element, threeScene);
        } else if (element.type === 'drunk') {
            obj3d = createDrunkFigure(new THREE.Vector3(pos.x, groundY, pos.z), element, threeScene);
            wanderingDrunks.push({ element, group: obj3d, centerX: pos.x, centerZ: pos.z, phase: Math.random() * Math.PI * 2 });
        } else if (element.type === 'tiburon') {
            // El centro real del paseo (la barra más cercana) se resuelve
            // aparte, después de dibujar TODOS los elementos -ver
            // setupMoneyWalkers-, igual que antes hacía "gabry" para saber
            // dónde aparcar: puede que la barra aún no exista si el bucle no
            // ha llegado a ella todavía.
            obj3d = createTiburonFigure(new THREE.Vector3(pos.x, groundY, pos.z), element.rotation, threeScene);
            moneyWalkers.push({ element, group: obj3d, startX: pos.x, startZ: pos.z, phase: Math.random() * Math.PI * 2 });
        } else if (element.type === 'fence') {
            obj3d = createConstructionFenceSegment(new THREE.Vector3(pos.x, groundY, pos.z), element, threeScene);
        } else if (element.type === 'panic-fence') {
            obj3d = createPanicFenceSegment(new THREE.Vector3(pos.x, groundY, pos.z), element, threeScene);
        } else if (element.type === 'bar' || element.type === 'wc' || element.type.startsWith('signal')) {
            obj3d = createGeometricElement(element, pos, threeScene, groundY);
        } else if (element.isRectangle) {
			const geometry = new THREE.BoxGeometry(element.length, 2, element.width);
			const material = new THREE.MeshStandardMaterial({ color: element.color });
			const mesh = new THREE.Mesh(geometry, material);
			mesh.position.set(pos.x, groundY + geometry.parameters.height / 2, pos.z);
			mesh.rotation.y = -(element.rotation * Math.PI) / 180;
			threeScene.add(mesh);
			obj3d = mesh;
		} else {
			obj3d = createGeometricElement(element, pos, threeScene, groundY);
		}

        // Etiqueta flotante 3D para todos, salvo las vallas: con muchos
        // tramos juntos, un "Valla" flotando sobre cada uno satura la vista.
        let label;
        if (element.type === 'security') {
            // Pegada justo encima de la cabeza del muñeco, y bastante más
            // pequeña que la de un elemento grande (escenario, zonas...).
            label = create3DLabel(element.name, new THREE.Vector3(pos.x, groundY + SECURITY_FIGURE_HEIGHT + 0.3, pos.z), threeScene, [3, 1.5]);
        } else if (element.type === 'drunk') {
            label = create3DLabel(element.name, new THREE.Vector3(pos.x, groundY + DRUNK_FIGURE_HEIGHT + 0.3, pos.z), threeScene, [3, 1.5]);
        } else if (element.type === 'tiburon') {
            label = create3DLabel(element.name, new THREE.Vector3(pos.x, groundY + TIBURON_FIGURE_HEIGHT + 0.3, pos.z), threeScene, [3, 1.5]);
        } else if (element.type !== 'fence' && element.type !== 'panic-fence') {
            label = create3DLabel(element.name, new THREE.Vector3(pos.x, groundY + 8, pos.z), threeScene);
        }

        // Referencias para poder pinchar y arrastrar el elemento en 3D
        // (ver setupElementDragging): el objeto 3D y su etiqueta guardan
        // el elemento al que pertenecen, y el elemento guarda ambos para
        // poder reposicionarlos en vivo mientras se arrastra.
        if (obj3d) obj3d.userData.element = element;
        if (label) label.userData.element = element;
        element._threeObj = obj3d || null;
        element._threeLabel = label || null;
	  } catch (err) {
		console.error('[3D] No se pudo crear el elemento', element && element.type, element && element.id, err);
		skipped.push(element);
	  }
	});

	if (skipped.length) {
		const names = skipped.map(e => (e && e.name) || (e && e.type) || '?').join(', ');
		show3DErrorBanner(`${skipped.length} elemento(s) no se pudieron mostrar en 3D: ${names}. Revisa la consola para más detalle.`);
	}
}

function create3DLabel(text, position, scene, size = [10, 5]) {
	const canvas = document.createElement('canvas');
	const context = canvas.getContext('2d');
	canvas.width = 256;
	canvas.height = 128;
	context.fillStyle = 'rgba(0,0,0,0.5)';
	context.fillRect(0, 0, 256, 128);
	context.fillStyle = 'white';
	context.textAlign = 'center';

	// Tamaño de letra fijo (40px) pensado para nombres cortos tipo
	// "ESCENARIO"/"BARRA": un nombre más largo (p.ej. "BREAD & WATHER")
	// se salía del lienzo por ambos lados -al estar centrado, se recortaba
	// el principio y el final por igual, dejando leerse solo el trozo
	// central-. Se reduce el tamaño hasta que el texto quepa entero.
	const maxTextWidth = 236; // margen de ~10px a cada lado de los 256 del lienzo
	let fontSize = 40;
	context.font = `Bold ${fontSize}px Arial`;
	while (context.measureText(text).width > maxTextWidth && fontSize > 14) {
		fontSize -= 2;
		context.font = `Bold ${fontSize}px Arial`;
	}
	context.fillText(text, 128, 70);

	const texture = new THREE.CanvasTexture(canvas);
	const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
	const sprite = new THREE.Sprite(spriteMaterial);
	sprite.position.copy(position);
	sprite.scale.set(size[0], size[1], 1);
	scene.add(sprite);
	return sprite;
}

// Escenario principal construido con geometría propia (plataforma + torres
// de truss + pantalla trasera). Antes usaba un modelo .glb descargado de
// ~125MB que no cabe en el repo (límite de GitHub) y por tanto nunca
// llegaba a cargar en producción: solo se veía la etiqueta flotante.
function createStageModel(pos, element, scene) {
	const group = new THREE.Group();
	const length = element.length || 20;
	const depth = element.width || 10;
	const deckHeight = 1.1;

	const deck = new THREE.Mesh(
		new THREE.BoxGeometry(length, deckHeight, depth),
		new THREE.MeshStandardMaterial({ color: 0x1c1c1c })
	);
	deck.position.set(0, deckHeight / 2, 0);
	group.add(deck);

	const backdropHeight = Math.max(4, depth * 0.6);
	const backdrop = new THREE.Mesh(
		new THREE.BoxGeometry(length * 0.92, backdropHeight, 0.3),
		new THREE.MeshStandardMaterial({ color: element.color || 0x27ae60 })
	);
	backdrop.position.set(0, deckHeight + backdropHeight / 2, -depth / 2 + 0.3);
	group.add(backdrop);

	const trussMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
	const towerHeight = backdropHeight + 3;
	[-1, 1].forEach(side => {
		const tower = new THREE.Mesh(new THREE.BoxGeometry(0.5, towerHeight, 0.5), trussMat);
		tower.position.set(side * (length / 2 - 0.6), deckHeight + towerHeight / 2, -depth / 2 + 0.3);
		group.add(tower);
	});

	const beam = new THREE.Mesh(new THREE.BoxGeometry(length - 0.6, 0.5, 0.5), trussMat);
	beam.position.set(0, deckHeight + towerHeight, -depth / 2 + 0.3);
	group.add(beam);

	group.position.copy(pos);
	group.rotation.y = -((element.rotation || 0) * Math.PI) / 180;
	scene.add(group);
	return group;
}

// Food truck con cabina, franja de color, toldo y ventana de venta, en vez
// de la caja lisa/camión genérico anterior.
function createFoodTruckModel(pos, element, scene) {
	const group = new THREE.Group();
	const length = element.length || 5;
	const width = element.width || 2.2;
	const accentColor = element.color || 0xe67e22;
	const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e6 });
	const bodyHeight = 2.1;

	const body = new THREE.Mesh(new THREE.BoxGeometry(length, bodyHeight, width), bodyMat);
	body.position.set(0, bodyHeight / 2 + 0.35, 0);
	group.add(body);

	const cabLength = length * 0.28;
	const cab = new THREE.Mesh(new THREE.BoxGeometry(cabLength, bodyHeight * 0.82, width * 0.98), bodyMat);
	cab.position.set(length / 2 - cabLength / 2 + 0.05, (bodyHeight * 0.82) / 2 + 0.35, 0);
	group.add(cab);

	const stripe = new THREE.Mesh(
		new THREE.BoxGeometry(length * 0.68, 0.5, width + 0.02),
		new THREE.MeshStandardMaterial({ color: accentColor })
	);
	stripe.position.set(-length * 0.1, 0.9, 0);
	group.add(stripe);

	const win = new THREE.Mesh(
		new THREE.BoxGeometry(length * 0.4, 0.9, 0.1),
		new THREE.MeshStandardMaterial({ color: 0x333333 })
	);
	win.position.set(-length * 0.15, 1.55, width / 2 + 0.02);
	group.add(win);

	const awning = new THREE.Mesh(
		new THREE.BoxGeometry(length * 0.45, 0.08, 1.1),
		new THREE.MeshStandardMaterial({ color: accentColor, side: THREE.DoubleSide })
	);
	awning.position.set(-length * 0.15, 2.05, width / 2 + 0.6);
	awning.rotation.x = -0.35;
	group.add(awning);

	const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
	const wheelGeom = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 16);
	[
		[-length / 2 + 0.7, width / 2], [-length / 2 + 0.7, -width / 2],
		[length / 2 - 0.9, width / 2], [length / 2 - 0.9, -width / 2]
	].forEach(([x, z]) => {
		const wheel = new THREE.Mesh(wheelGeom, wheelMat);
		wheel.rotation.x = Math.PI / 2;
		wheel.position.set(x, 0.35, z);
		group.add(wheel);
	});

	group.position.copy(pos);
	group.rotation.y = -((element.rotation || 0) * Math.PI) / 180;
	scene.add(group);
	return group;
}

// Persona con ropa de calle (no el uniforme de seguridad), con piernas y
// brazo por separado para poder animar el paso al caminar, igual que se
// hace con el "borracho" que deambula (ver updateWanderingDrunks) y con
// las patrullas de seguridad con recorrido (ver updateSecurityPatrols).
function createCasualPersonFigure(pos, rotation, scene) {
	const group = new THREE.Group();
	const skinMat = new THREE.MeshStandardMaterial({ color: 0xe0a878 });
	const shirtMat = new THREE.MeshStandardMaterial({ color: 0x2f3e4e });
	const pantsMat = new THREE.MeshStandardMaterial({ color: 0x39424a });

	const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), skinMat);
	head.position.set(0, 1.55, 0);
	group.add(head);

	const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.7, 8), shirtMat);
	torso.position.set(0, 1.15, 0);
	group.add(torso);

	const legHeight = 0.78;
	const legGeom = new THREE.CylinderGeometry(0.08, 0.09, legHeight, 8);
	legGeom.translate(0, -legHeight / 2, 0);
	const hipY = 0.78;
	const legL = new THREE.Mesh(legGeom, pantsMat);
	legL.position.set(0.1, hipY, 0);
	group.add(legL);
	const legR = new THREE.Mesh(legGeom.clone(), pantsMat);
	legR.position.set(-0.1, hipY, 0);
	group.add(legR);

	const armHeight = 0.55;
	const armGeom = new THREE.CylinderGeometry(0.065, 0.075, armHeight, 8);
	armGeom.translate(0, -armHeight / 2, 0);
	const shoulderY = 1.4;
	const armL = new THREE.Mesh(armGeom, skinMat);
	armL.position.set(0.22, shoulderY, 0);
	group.add(armL);
	const armR = new THREE.Mesh(armGeom.clone(), skinMat);
	armR.position.set(-0.22, shoulderY, 0);
	group.add(armR);

	group.userData.legL = legL;
	group.userData.legR = legR;
	group.userData.armL = armL;
	group.userData.armR = armR;

	group.position.copy(pos);
	group.rotation.y = -((rotation || 0) * Math.PI) / 180;
	scene.add(group);
	return group;
}

// Portero CON piernas/brazo por separado -a diferencia del "pelele"
// estático de siempre (ver createSecurityFigure)-, para poder animar el
// paso al patrullar un recorrido dibujado a mano (ver
// updateSecurityPatrols). Mismo esqueleto que createCasualPersonFigure,
// pero todo en rojo, igual que el "pelele" fijo, para que ambos se vean
// como el mismo personaje.
function createSecurityWalkerFigure(pos, rotation, scene) {
	const group = new THREE.Group();
	const mat = new THREE.MeshStandardMaterial({ color: 0xe74c3c });

	const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), mat);
	head.position.set(0, 1.55, 0);
	group.add(head);

	const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.7, 8), mat);
	torso.position.set(0, 1.15, 0);
	group.add(torso);

	const legHeight = 0.78;
	const legGeom = new THREE.CylinderGeometry(0.08, 0.09, legHeight, 8);
	legGeom.translate(0, -legHeight / 2, 0);
	const hipY = 0.78;
	const legL = new THREE.Mesh(legGeom, mat);
	legL.position.set(0.1, hipY, 0);
	group.add(legL);
	const legR = new THREE.Mesh(legGeom.clone(), mat);
	legR.position.set(-0.1, hipY, 0);
	group.add(legR);

	const armHeight = 0.55;
	const armGeom = new THREE.CylinderGeometry(0.065, 0.075, armHeight, 8);
	armGeom.translate(0, -armHeight / 2, 0);
	const shoulderY = 1.4;
	const armL = new THREE.Mesh(armGeom, mat);
	armL.position.set(0.24, shoulderY, 0);
	group.add(armL);
	const armR = new THREE.Mesh(armGeom.clone(), mat);
	armR.position.set(-0.24, shoulderY, 0);
	group.add(armR);

	group.userData.legL = legL;
	group.userData.legR = legR;
	group.userData.armL = armL;
	group.userData.armR = armR;

	group.position.copy(pos);
	group.rotation.y = -((rotation || 0) * Math.PI) / 180;
	scene.add(group);
	return group;
}

// Muñeco rojo tipo "pelele" (Santos Inocentes) para el personal de
// seguridad, en vez de la caja genérica que salía antes.
function createSecurityFigure(pos, rotation, scene) {
	const group = new THREE.Group();
	const mat = new THREE.MeshStandardMaterial({ color: 0xe74c3c });

	const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), mat);
	head.position.set(0, 1.55, 0);
	group.add(head);

	const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.7, 8), mat);
	torso.position.set(0, 1.15, 0);
	group.add(torso);

	const limbGeom = new THREE.CylinderGeometry(0.075, 0.09, 0.6, 8);
	const limbs = [
		{ pos: [0.22, 1.35, 0], rot: -0.95 },
		{ pos: [-0.22, 1.35, 0], rot: 0.95 },
		{ pos: [0.16, 0.5, 0], rot: 0.5 },
		{ pos: [-0.16, 0.5, 0], rot: -0.5 }
	];
	limbs.forEach(({ pos: p, rot }) => {
		const limb = new THREE.Mesh(limbGeom, mat);
		limb.position.set(p[0], p[1], p[2]);
		limb.rotation.z = rot;
		group.add(limb);
	});

	group.scale.set(SECURITY_FIGURE_SCALE, SECURITY_FIGURE_SCALE, SECURITY_FIGURE_SCALE);
	group.position.copy(pos);
	group.rotation.y = -((rotation || 0) * Math.PI) / 180;
	scene.add(group);
	return group;
}

// "El borracho del pueblo": personaje genérico (no un personaje con
// copyright) tambaleándose con una jarra en la mano. Deambula solo en un
// pequeño círculo alrededor de donde se coloca (ver updateWanderingDrunks);
// las piernas/brazo se animan igual, con oscilaciones en el mismo bucle.
function createDrunkFigure(pos, element, scene) {
	const group = new THREE.Group();
	const skinMat = new THREE.MeshStandardMaterial({ color: 0xe0a878 });
	const shirtMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5 });
	const pantsMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a });
	const mugMat = new THREE.MeshStandardMaterial({ color: 0xd9a441 });
	const foamMat = new THREE.MeshStandardMaterial({ color: 0xfff8e0 });

	// Cabeza grande, cabezón desproporcionado estilo cartoon; la cara real
	// va pegada delante como textura (ver más abajo). Más arriba que el
	// centro geométrico del torso (que llega hasta y=1.395) para que no se
	// coma la barbilla/boca de la cara real: con la cabeza a 1.55 el torso
	// tapaba la parte de abajo del parche de la cara y solo se veía hasta
	// la nariz.
	const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 14), skinMat);
	head.position.set(0, 1.72, 0);
	group.add(head);

	// Cara real del "borracho" tallada en la propia cabeza: en vez de una
	// cartulina plana (se metía dentro de la esfera y dejaba un agujero
	// donde la piel asomaba por encima), es un parche curvo concéntrico a
	// la cabeza -radio ligeramente mayor, sin z-fighting- con un mapa de
	// desplazamiento generado a partir del brillo de la foto para que la
	// nariz sobresalga un poco (relieve 3D real, no solo la textura
	// pintada). El desplazamiento SOLO empuja hacia afuera (bias 0, nunca
	// negativo): si las zonas oscuras (ojos) se hundieran por debajo del
	// radio de la cabeza, volvía a asomar la esfera pelada por debajo,
	// el mismo "agujero" que con la cartulina plana.
	const faceTextureLoader = new THREE.TextureLoader();
	const faceColorMap = faceTextureLoader.load('assets/faces/borracho.jpg');
	const faceDepthMap = faceTextureLoader.load('assets/faces/borracho_depth.jpg');
	// Un arco demasiado ancho (antes 0.8*PI) hace que el borde de la foto
	// -donde está la barbilla/boca, ya que el recorte llega hasta ahí- caiga
	// cerca del "horizonte" visible de la esfera: en un plano de frente esa
	// zona queda tan escorzada por la curvatura que se ve casi ilegible,
	// como si la cara estuviera cortada aunque la textura sí llegue hasta
	// ahí. Con un arco más estrecho el contenido queda más cerca del centro
	// (de frente a la cámara) y se lee entero.
	const facePatchAngle = Math.PI * 0.58;
	const faceGeom = new THREE.SphereGeometry(
		0.27 + 0.006, 48, 48,
		Math.PI / 2 - facePatchAngle / 2, facePatchAngle,
		Math.PI / 2 - facePatchAngle / 2, facePatchAngle
	);
	const face = new THREE.Mesh(
		faceGeom,
		new THREE.MeshStandardMaterial({
			map: faceColorMap,
			displacementMap: faceDepthMap,
			displacementScale: 0.02,
			displacementBias: 0
		})
	);
	face.position.set(0, 1.72, 0);
	group.add(face);

	// Torso panzón con camiseta de tirantes (los brazos, aparte, quedan al
	// aire) y una barriga prominente asomando por debajo.
	const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.55, 10), shirtMat);
	torso.position.set(0, 1.12, 0);
	group.add(torso);

	const belly = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), shirtMat);
	belly.scale.set(1, 0.85, 0.95);
	belly.position.set(0, 0.92, 0.06);
	group.add(belly);

	const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.2, 8), pantsMat);
	hips.position.set(0, 0.75, 0);
	group.add(hips);

	// Piernas: geometría trasladada para que el pivote quede en la cadera,
	// así rotation.x las balancea como al caminar en vez de girar por el centro.
	const legHeight = 0.55;
	const legGeom = new THREE.CylinderGeometry(0.08, 0.09, legHeight, 8);
	legGeom.translate(0, -legHeight / 2, 0);
	const hipY = 0.65;

	const legL = new THREE.Mesh(legGeom, pantsMat);
	legL.position.set(0.1, hipY, 0);
	group.add(legL);

	const legR = new THREE.Mesh(legGeom.clone(), pantsMat);
	legR.position.set(-0.1, hipY, 0);
	group.add(legR);

	// Brazo que cuelga y se balancea al caminar
	const armHeight = 0.48;
	const armGeom = new THREE.CylinderGeometry(0.06, 0.07, armHeight, 8);
	armGeom.translate(0, -armHeight / 2, 0);
	const shoulderY = 1.35;

	const armDown = new THREE.Mesh(armGeom, skinMat);
	armDown.position.set(-0.24, shoulderY, 0);
	group.add(armDown);

	// Brazo levantado con la jarra pegada a la mano: van en un grupo juntos
	// para que al rotar el brazo la jarra se mueva con él, ya en su sitio.
	const armUpGroup = new THREE.Group();
	armUpGroup.position.set(0.24, shoulderY, 0);
	armUpGroup.rotation.z = -2.0;

	const armUp = new THREE.Mesh(armGeom.clone(), skinMat);
	armUpGroup.add(armUp);

	const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.13, 10), mugMat);
	mug.position.set(0, -armHeight - 0.05, 0);
	armUpGroup.add(mug);

	const foam = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), foamMat);
	foam.position.set(0, -armHeight + 0.03, 0);
	armUpGroup.add(foam);

	group.add(armUpGroup);

	// Referencias para animar piernas/brazo cada frame (updateWanderingDrunks)
	group.userData.legL = legL;
	group.userData.legR = legR;
	group.userData.armDown = armDown;

	group.scale.set(DRUNK_FIGURE_SCALE, DRUNK_FIGURE_SCALE, DRUNK_FIGURE_SCALE);
	group.position.copy(pos);
	group.rotation.y = -((element.rotation || 0) * Math.PI) / 180;
	scene.add(group);
	return group;
}

// "Tiburón": traje verde y gafas de sol, brazos siempre en alto con un
// abanico de billetes en cada mano (ver updateMoneyWalkers, que los anima
// "haciendo llover" dinero mientras ronda la barra). Mismo esqueleto que
// createCasualPersonFigure -piernas/brazos por separado para poder animar
// el paso-, con la pose de brazos ya abierta de base en vez de colgando.
function createTiburonFigure(pos, rotation, scene) {
	const group = new THREE.Group();
	const skinMat = new THREE.MeshStandardMaterial({ color: 0xe0a878 });
	const suitMat = new THREE.MeshStandardMaterial({ color: 0x1f8a4c });
	const pantsMat = new THREE.MeshStandardMaterial({ color: 0x14432a });
	const glassesMat = new THREE.MeshStandardMaterial({ color: 0x101010 });
	const billMat = new THREE.MeshStandardMaterial({ color: 0x3fae5c });
	const billStripeMat = new THREE.MeshStandardMaterial({ color: 0xf4e8b8 });

	const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), skinMat);
	head.position.set(0, 1.55, 0);
	group.add(head);

	const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.06), glassesMat);
	glasses.position.set(0, 1.57, 0.19);
	group.add(glasses);

	const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.7, 8), suitMat);
	torso.position.set(0, 1.15, 0);
	group.add(torso);

	const legHeight = 0.78;
	const legGeom = new THREE.CylinderGeometry(0.08, 0.09, legHeight, 8);
	legGeom.translate(0, -legHeight / 2, 0);
	const hipY = 0.78;
	const legL = new THREE.Mesh(legGeom, pantsMat);
	legL.position.set(0.1, hipY, 0);
	group.add(legL);
	const legR = new THREE.Mesh(legGeom.clone(), pantsMat);
	legR.position.set(-0.1, hipY, 0);
	group.add(legR);

	// Fajo de billetes en abanico: un puñado de placas finas superpuestas en
	// ángulos ligeramente distintos, en vez de un único bloque liso.
	function buildBillFan() {
		const fan = new THREE.Group();
		for (let i = 0; i < 4; i++) {
			const bill = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.012, 0.12), billMat);
			bill.position.set(0.05 * i, -0.03 * i, 0.015 * i);
			bill.rotation.z = (i - 1.5) * 0.22;
			fan.add(bill);
			const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.013, 0.03), billStripeMat);
			stripe.position.copy(bill.position);
			stripe.rotation.copy(bill.rotation);
			fan.add(stripe);
		}
		return fan;
	}

	const armHeight = 0.55;
	const armGeom = new THREE.CylinderGeometry(0.065, 0.075, armHeight, 8);
	armGeom.translate(0, -armHeight / 2, 0);
	const shoulderY = 1.4;

	// Brazos en alto de base (rotation.z), con el abanico de billetes
	// colgando de la muñeca -mismo truco que la jarra del "borracho": el
	// brazo y su abanico van en el mismo grupo, así al rotar el grupo
	// (updateMoneyWalkers) se mueven juntos como una sola pieza.
	const armLGroup = new THREE.Group();
	armLGroup.position.set(0.24, shoulderY, 0);
	armLGroup.rotation.z = TIBURON_ARM_RAISE_ANGLE;
	const armL = new THREE.Mesh(armGeom, skinMat);
	armLGroup.add(armL);
	const billsL = buildBillFan();
	billsL.position.set(0, -armHeight, 0);
	armLGroup.add(billsL);
	group.add(armLGroup);

	const armRGroup = new THREE.Group();
	armRGroup.position.set(-0.24, shoulderY, 0);
	armRGroup.rotation.z = -TIBURON_ARM_RAISE_ANGLE;
	const armR = new THREE.Mesh(armGeom.clone(), skinMat);
	armRGroup.add(armR);
	const billsR = buildBillFan();
	billsR.position.set(0, -armHeight, 0);
	armRGroup.add(billsR);
	group.add(armRGroup);

	group.userData.legL = legL;
	group.userData.legR = legR;
	group.userData.armL = armLGroup;
	group.userData.armR = armRGroup;
	group.userData.billsL = billsL;
	group.userData.billsR = billsR;

	group.scale.set(TIBURON_FIGURE_SCALE, TIBURON_FIGURE_SCALE, TIBURON_FIGURE_SCALE);
	group.position.copy(pos);
	group.rotation.y = -((rotation || 0) * Math.PI) / 180;
	scene.add(group);
	return group;
}

// "Valla de obra": marco metálico de barrotes verticales con un cartel
// rectangular central -el modelo clásico de valla peatonal/de obra, con
// remates rectos (sin la curva real de las esquinas, que a esta escala no
// se notaría) y un pie que sobresale en cada extremo.
function createConstructionFenceSegment(pos, element, scene) {
	const group = new THREE.Group();
	// Un "length" no finito (dato corrupto/antiguo) rompía la geometría de
	// los cilindros en silencio -sin lanzar excepción, la valla quedaba con
	// una esfera acotadora NaN y Three.js la recortaba, invisible-.
	const len = Number.isFinite(element.length) && element.length > 0 ? Math.max(element.length, 0.5) : 2;
	const height = 1.0;
	const barRadius = 0.022;
	const metalMat = new THREE.MeshStandardMaterial({ color: element.color || 0xf1c40f, metalness: 0.5, roughness: 0.5 });

	const halfLen = len / 2;
	[-1, 1].forEach(side => {
		const x = side * halfLen;
		const post = new THREE.Mesh(new THREE.CylinderGeometry(barRadius * 1.3, barRadius * 1.3, height, 8), metalMat);
		post.position.set(x, height / 2, 0);
		group.add(post);

		// Pie de apoyo perpendicular, como en las vallas peatonales reales.
		const foot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.5), metalMat);
		foot.position.set(x, 0.02, 0.15);
		group.add(foot);
	});

	const topRail = new THREE.Mesh(new THREE.CylinderGeometry(barRadius, barRadius, len, 8), metalMat);
	topRail.rotation.z = Math.PI / 2;
	topRail.position.set(0, height, 0);
	group.add(topRail);

	const bottomRail = new THREE.Mesh(new THREE.CylinderGeometry(barRadius, barRadius, len, 8), metalMat);
	bottomRail.rotation.z = Math.PI / 2;
	bottomRail.position.set(0, 0.06, 0);
	group.add(bottomRail);

	// Barrotes verticales decorativos entre los dos raíles.
	// Tope de barrotes: un tramo largo (decenas de metros en un único
	// elemento) generaba cientos de barrotes individuales, suficiente para
	// notarse en el rendimiento -por debajo de este tope simplemente se
	// espacian más, sigue leyéndose como una valla de barrotes.
	const barCount = Math.max(4, Math.min(40, Math.round(len / 0.3)));
	for (let i = 0; i <= barCount; i++) {
		const t = i / barCount;
		const x = -halfLen + t * len;
		const bar = new THREE.Mesh(new THREE.CylinderGeometry(barRadius * 0.7, barRadius * 0.7, height - 0.06, 8), metalMat);
		bar.position.set(x, height / 2 + 0.03, 0);
		group.add(bar);
	}

	// Cartel rectangular central, como el hueco de publicidad de las vallas reales.
	const sign = new THREE.Mesh(
		new THREE.BoxGeometry(Math.min(len * 0.35, 0.55), height * 0.32, 0.015),
		metalMat
	);
	sign.position.set(0, height * 0.62, barRadius + 0.01);
	group.add(sign);

	group.position.copy(pos);
	group.rotation.y = -((element.rotation || 0) * Math.PI) / 180;
	scene.add(group);
	return group;
}

// "Valla antipánico": barrera de escenario tipo "mojo" -panel vertical
// sólido con un puntal diagonal trasero de apoyo y una placa en el suelo
// hacia el lado del público-, en vez de la barrera de postes con barras
// horizontales de antes (esa silueta es más de valla peatonal genérica).
function createPanicFenceSegment(pos, element, scene) {
	const group = new THREE.Group();
	// Ver misma nota en createConstructionFenceSegment.
	const len = Number.isFinite(element.length) && element.length > 0 ? Math.max(element.length, 0.5) : 2;
	const panelHeight = 1.1;
	const baseDepth = 0.85;
	const metalMat = new THREE.MeshStandardMaterial({ color: 0xcfd2d4, metalness: 0.55, roughness: 0.4 });
	const frameMat = new THREE.MeshStandardMaterial({ color: 0xaeb2b4, metalness: 0.65, roughness: 0.35 });

	// Panel vertical (de cara al público, hacia +Z)
	const panel = new THREE.Mesh(new THREE.BoxGeometry(len, panelHeight, 0.03), metalMat);
	panel.position.set(0, panelHeight / 2, 0);
	group.add(panel);

	// Placa/rampa en el suelo hacia el lado del público, como el tope real
	// que impide que la gente pase por debajo.
	const basePlate = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, baseDepth), frameMat);
	basePlate.position.set(0, 0.015, baseDepth / 2 + 0.02);
	group.add(basePlate);

	// Puntal diagonal trasero de apoyo, uno cada ~1.2m para que no parezca
	// un único panel gigante sin refuerzos.
	const braceDepth = 0.55;
	const braceLen = Math.sqrt(panelHeight * panelHeight + braceDepth * braceDepth);
	const braceAngle = Math.atan2(braceDepth, panelHeight);
	const braceCount = Math.max(2, Math.min(30, Math.round(len / 1.2) + 1));
	for (let i = 0; i < braceCount; i++) {
		const t = braceCount === 1 ? 0.5 : i / (braceCount - 1);
		const x = -len / 2 + t * len;
		const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, braceLen, 6), frameMat);
		brace.position.set(x, panelHeight / 2, -braceDepth / 2);
		brace.rotation.x = -braceAngle;
		group.add(brace);
	}

	group.position.copy(pos);
	group.rotation.y = -((element.rotation || 0) * Math.PI) / 180;
	scene.add(group);
	return group;
}

// Arco de entrada: un THREE.TorusGeometry con arc=PI ya dibuja medio anillo
// con los dos extremos apoyados en el suelo (y=0) y la cresta en y=radius,
// que es justo la silueta de un arco - sin necesitar pilares aparte.
function createEntranceArch(pos, element, scene) {
	const group = new THREE.Group();
	const span = element.length || 6;
	const radius = span / 2;
	const tube = 0.22;

	const archMat = new THREE.MeshStandardMaterial({ color: element.color || 0xf1c40f });
	const arch = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 12, 32, Math.PI), archMat);
	group.add(arch);

	// Cartel apoyado sobre la cresta del arco
	const sign = new THREE.Mesh(
		new THREE.BoxGeometry(span * 0.5, radius * 0.22, 0.15),
		new THREE.MeshStandardMaterial({ color: 0xffffff })
	);
	sign.position.set(0, radius + tube + 0.05, 0);
	group.add(sign);

	group.position.copy(pos);
	group.rotation.y = -((element.rotation || 0) * Math.PI) / 180;
	scene.add(group);
	return group;
}

function createGeometricElement(element, pos, scene, groundY = 0) {
	const group = new THREE.Group();
	const colorMap = {
		'bar': 0xf1c40f,
		'wc': 0x3498db,
		'signal-wc': 0x3498db,
		'rest-area': 0x27ae60,
		'main-stage': 0x27ae60,
		'secondary-stage': 0xe67e22,
        'generator': 0x9b59b6,
        'zone-vip': 0xf1c40f,
        'zone-camping': 0x27ae60,
        'zone-parking': 0x3498db
	};
	const color = colorMap[element.type] || 0x7f8c8d;
	// "signal-wc" queda fuera del trato de señal plana (ver más abajo): a
	// diferencia de un cartel de parking o de una flecha de salida, un WC sí
	// ocupa sitio de verdad en el recinto, así que se dibuja como la misma
	// cabina física que el elemento "wc" -no como un simple símbolo pintado
	// en el suelo-.
	const isSignal = element.type.startsWith('signal') && element.type !== 'signal-wc';

	if (element.type === 'bar') {
        // Modelo de barra compuesta: base + mostrador
        const base = new THREE.Mesh(new THREE.BoxGeometry(element.length, 2, element.width), new THREE.MeshStandardMaterial({ color: color }));
        base.position.set(0, 1, 0);
        group.add(base);

        const top = new THREE.Mesh(new THREE.BoxGeometry(element.length + 0.5, 0.2, element.width + 0.5), new THREE.MeshStandardMaterial({ color: 0x333333 }));
        top.position.set(0, 2.1, 0);
        group.add(top);
    } else if (element.type === 'wc' || element.type === 'signal-wc') {
        // Modelo de cabina de baño
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.5, 1.2), new THREE.MeshStandardMaterial({ color: color }));
        mesh.position.set(0, 1.25, 0);
        group.add(mesh);

        // Techo inclinado para el baño
        const roof = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 1.4), new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
        roof.position.set(0, 2.5, 0);
        group.add(roof);
    } else if (isSignal) {
        // Señal (parking, minusválidos, salida, prohibido el paso...): no es
        // ninguna estructura del recinto -antes se dibujaba como el mismo
        // bloque sólido de 2m que una barra o un baño, un cubo gris flotando
        // sin sentido-, solo la simbología pintada en el propio suelo.
        const signalPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(element.length || 4, element.width || 4),
            new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide })
        );
        signalPlane.rotation.x = -Math.PI / 2;
        signalPlane.position.y = 0.02; // ligeramente por encima del suelo, evita z-fighting
        group.add(signalPlane);
        new THREE.TextureLoader().load(element.iconUrl, (texture) => {
            signalPlane.material.map = texture;
            signalPlane.material.needsUpdate = true;
        });
    } else {
        const isZone = element.type.startsWith('zone');
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(element.length || 4, isZone ? 0.1 : 2, element.width || 4),
            new THREE.MeshStandardMaterial({ color: color, transparent: isZone, opacity: isZone ? 0.4 : 1 })
        );
        mesh.position.set(0, isZone ? 0.05 : 1, 0);
        group.add(mesh);
    }

	// Icono flotante encima del elemento: para las señales ya está la
	// simbología plana en el suelo (ver arriba), así que aquí sobraría un
	// segundo icono repetido en el aire.
	if (!isSignal) {
		const iconPlane = new THREE.Mesh(
			new THREE.PlaneGeometry(3, 3),
			new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide })
		);
		iconPlane.position.set(0, 5, 0);
		group.add(iconPlane);
		new THREE.TextureLoader().load(element.iconUrl, (texture) => {
			iconPlane.material.map = texture;
			iconPlane.material.needsUpdate = true;
		});
	}

	group.position.set(pos.x, groundY, pos.z);
	group.rotation.y = -((element.rotation || 0) * Math.PI) / 180;
	scene.add(group);
	return group;
}
