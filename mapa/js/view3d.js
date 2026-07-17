
// --- VISTA 3D (Three.js) ---
let threeScene, threeCamera, threeRenderer, threeControls, animationFrameId;
let map3dPlaneSize = 100;

const SECURITY_FIGURE_SCALE = 1.4;
const SECURITY_FIGURE_HEIGHT = 1.77 * SECURITY_FIGURE_SCALE;

const DRUNK_FIGURE_SCALE = 1.6;
const DRUNK_FIGURE_HEIGHT = 1.82 * DRUNK_FIGURE_SCALE;
const DRUNK_WANDER_RADIUS = 2.5;

// Figuras "borracho" que deambulan solas cada frame (ver updateWanderingDrunks).
// Se reconstruye entera cada vez que se regenera la escena 3D.
let wanderingDrunks = [];

// Ruido barato (senos superpuestos) para dar una sensación de terreno
// ondulado sin depender de datos de elevación reales.
function terrainHeight(x, y) {
	return 0.5 * Math.sin(x * 0.045) * Math.cos(y * 0.06)
		+ 0.3 * Math.sin(x * 0.09 + 1.3) * Math.sin(y * 0.11 + 0.7);
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


function generate3DView(style) {
	const container = document.getElementById('container-3d-full');
	const canvas = document.getElementById('canvas-3d-full');
	if (!canvas) {
		console.error('[3D] No se encontró el canvas #canvas-3d-full');
		return;
	}
	const rect = canvas.getBoundingClientRect();
	setupElementDragging(canvas);

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
		let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
		elements.forEach(el => {
			const ll = el.moveMarker.getLatLng();
			minLat = Math.min(minLat, ll.lat);
			maxLat = Math.max(maxLat, ll.lat);
			minLng = Math.min(minLng, ll.lng);
			maxLng = Math.max(maxLng, ll.lng);
		});
		center = L.latLng((minLat + maxLat) / 2, (minLng + maxLng) / 2);
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
	let maxReachMeters = 0;
	elements.forEach(el => {
		const dist = map.distance(center, el.moveMarker.getLatLng());
		const halfExtent = el.isRectangle
			? Math.sqrt(Math.pow((el.length || 0) / 2, 2) + Math.pow((el.width || 0) / 2, 2))
			: (el.length || 0) / 2;
		maxReachMeters = Math.max(maxReachMeters, dist + halfExtent);
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
	const farPlane = Math.max(1000, map3dPlaneSize * 4);

	threeScene = new THREE.Scene();
	threeCamera = new THREE.PerspectiveCamera(75, container.offsetWidth / container.offsetHeight, 0.1, farPlane);
	// La cámara encuadra el radio real que ocupan los elementos (no el
	// suelo completo, que suele tener margen de sobra), para que el
	// escenario y compañía se vean grandes de entrada y no haya que
	// acercar la cámara a mano para distinguirlos del fondo.
	const cameraFitRadius = maxReachMeters > 0 ? maxReachMeters : map3dPlaneSize * 0.5;
	threeCamera.position.set(0, cameraFitRadius * 0.96, cameraFitRadius * 1.2);
	threeCamera.lookAt(0, 0, 0);

	threeRenderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
	threeRenderer.setClearColor(0x222244, 1);
	threeRenderer.setSize(container.offsetWidth, container.offsetHeight);

	threeControls = new THREE.OrbitControls(threeCamera, threeRenderer.domElement);
	threeControls.enableDamping = true;

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

	// Relieve "falso": ondulaciones suaves (sin datos de elevación reales)
	// para que el suelo no se vea perfectamente plano. Amplitud pequeña a
	// propósito, ya que los elementos se siguen colocando a altura 0.
	const groundGeometry = new THREE.PlaneGeometry(map3dPlaneSize, map3dPlaneSize, 48, 48);
	const groundPos = groundGeometry.attributes.position;
	for (let i = 0; i < groundPos.count; i++) {
		groundPos.setZ(i, terrainHeight(groundPos.getX(i), groundPos.getY(i)));
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
	const tileLoads = [];
	for (let ty = tileYmin; ty <= tileYmax; ty++) {
		for (let tx = tileXmin; tx <= tileXmax; tx++) {
			const px = (tx - tileXmin) * 256;
			const py = (ty - tileYmin) * 256;
			tileLoads.push(new Promise((resolve) => {
				const img = new Image();
				img.crossOrigin = 'anonymous';
				img.onload = () => { stitchCtx.drawImage(img, px, py, 256, 256); resolve(); };
				img.onerror = () => resolve();
				img.src = tileUrlFor(tx, ty);
			}));
		}
	}
	Promise.all(tileLoads).then(() => {
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

	function animate() {
		animationFrameId = requestAnimationFrame(animate);
		threeControls.update();
		updateWanderingDrunks();
		try {
			threeRenderer.render(threeScene, threeCamera);
		} catch (err) {
			// Un fallo puntual (p.ej. una textura de tile bloqueada por CORS)
			// no debe dejar la vista congelada en el color de fondo para
			// siempre: lo dejamos en consola y seguimos con el siguiente frame.
			console.error('[3D] Error de render:', err);
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
		entry.group.position.y = Math.abs(Math.sin(t * 7 + entry.phase)) * 0.04;
		entry.group.rotation.y = heading + wobble;
		entry.group.rotation.z = Math.sin(t * 5 + entry.phase) * 0.08;

		const stride = Math.sin(t * 7 + entry.phase);
		if (entry.group.userData.legL) entry.group.userData.legL.rotation.x = stride * 0.5;
		if (entry.group.userData.legR) entry.group.userData.legR.rotation.x = -stride * 0.5;
		if (entry.group.userData.armDown) entry.group.userData.armDown.rotation.x = -stride * 0.4;

		if (entry.element._threeLabel) {
			entry.element._threeLabel.position.x = x;
			entry.element._threeLabel.position.z = z;
		}
	});
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

function setupElementDragging(canvas) {
	if (canvas.dataset.dragHandlersBound) return;
	canvas.dataset.dragHandlersBound = '1';

	canvas.addEventListener('pointerdown', (ev) => {
		if (!threeScene || !threeCamera) return;
		updatePointerNDC(ev);
		dragRaycaster.setFromCamera(dragPointerNDC, threeCamera);
		const hits = dragRaycaster.intersectObjects(threeScene.children, true);
		for (const hit of hits) {
			const element = findElementIn3DObject(hit.object);
			if (element) {
				dragState = { element, lastX: null, lastZ: null };
				if (typeof selectElement === 'function') selectElement(element);
				if (threeControls) threeControls.enabled = false;
				// Captura el puntero para que pointermove/pointerup sigan
				// llegando aunque el cursor salga del lienzo a mitad de arrastre.
				canvas.setPointerCapture(ev.pointerId);
				ev.preventDefault();
				break;
			}
		}
	});

	canvas.addEventListener('pointermove', (ev) => {
		if (!dragState) return;
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
		const { element, lastX, lastZ } = dragState;
		dragState = null;
		if (lastX === null) return;

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

	elements.forEach(element => {
		const latLng = element.moveMarker.getLatLng();
		const pos = latLngToPlane(latLng.lat, latLng.lng, bbox);
		let obj3d;

		if (element.type === 'main-stage') {
            obj3d = createStageModel(new THREE.Vector3(pos.x, 0, pos.z), element, threeScene);
        } else if (element.type === 'food-truck') {
            obj3d = createFoodTruckModel(new THREE.Vector3(pos.x, 0, pos.z), element, threeScene);
        } else if (element.type === 'security') {
            obj3d = createSecurityFigure(new THREE.Vector3(pos.x, 0, pos.z), element.rotation, threeScene);
        } else if (element.type === 'entrance') {
            obj3d = createEntranceArch(new THREE.Vector3(pos.x, 0, pos.z), element, threeScene);
        } else if (element.type === 'drunk') {
            obj3d = createDrunkFigure(new THREE.Vector3(pos.x, 0, pos.z), element, threeScene);
            wanderingDrunks.push({ element, group: obj3d, centerX: pos.x, centerZ: pos.z, phase: Math.random() * Math.PI * 2 });
        } else if (element.type === 'fence') {
            // Caja fina a escala real en vez de estirar el modelo 3D (que
            // deformaba también su alto/ancho y generaba postes gigantes).
            const fenceHeight = 1.2;
            const fenceThickness = 0.15;
            const geometry = new THREE.BoxGeometry(element.length, fenceHeight, fenceThickness);
            const material = new THREE.MeshStandardMaterial({ color: element.color || '#e5e5e5' });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(pos.x, fenceHeight / 2, pos.z);
            // El ángulo de Leaflet crece en sentido contrario al rotation.y
            // de Three.js sobre este mismo plano XZ; sin el signo negativo
            // los elementos rotados quedaban en espejo respecto al 2D.
            mesh.rotation.y = -(element.rotation * Math.PI) / 180;
            threeScene.add(mesh);
            obj3d = mesh;
        } else if (element.type === 'bar' || element.type === 'wc' || element.type.startsWith('signal')) {
            obj3d = createGeometricElement(element, pos, threeScene);
        } else if (element.isRectangle) {
			const geometry = new THREE.BoxGeometry(element.length, 2, element.width);
			const material = new THREE.MeshStandardMaterial({ color: element.color });
			const mesh = new THREE.Mesh(geometry, material);
			mesh.position.set(pos.x, geometry.parameters.height / 2, pos.z);
			mesh.rotation.y = -(element.rotation * Math.PI) / 180;
			threeScene.add(mesh);
			obj3d = mesh;
		} else {
			obj3d = createGeometricElement(element, pos, threeScene);
		}

        // Etiqueta flotante 3D para todos, salvo las vallas: con muchos
        // tramos juntos, un "Valla" flotando sobre cada uno satura la vista.
        let label;
        if (element.type === 'security') {
            // Pegada justo encima de la cabeza del muñeco, y bastante más
            // pequeña que la de un elemento grande (escenario, zonas...).
            label = create3DLabel(element.name, new THREE.Vector3(pos.x, SECURITY_FIGURE_HEIGHT + 0.3, pos.z), threeScene, [3, 1.5]);
        } else if (element.type === 'drunk') {
            label = create3DLabel(element.name, new THREE.Vector3(pos.x, DRUNK_FIGURE_HEIGHT + 0.3, pos.z), threeScene, [3, 1.5]);
        } else if (element.type !== 'fence') {
            label = create3DLabel(element.name, new THREE.Vector3(pos.x, 8, pos.z), threeScene);
        }

        // Referencias para poder pinchar y arrastrar el elemento en 3D
        // (ver setupElementDragging): el objeto 3D y su etiqueta guardan
        // el elemento al que pertenecen, y el elemento guarda ambos para
        // poder reposicionarlos en vivo mientras se arrastra.
        if (obj3d) obj3d.userData.element = element;
        if (label) label.userData.element = element;
        element._threeObj = obj3d || null;
        element._threeLabel = label || null;
	});
}

function create3DLabel(text, position, scene, size = [10, 5]) {
	const canvas = document.createElement('canvas');
	const context = canvas.getContext('2d');
	canvas.width = 256;
	canvas.height = 128;
	context.fillStyle = 'rgba(0,0,0,0.5)';
	context.fillRect(0, 0, 256, 128);
	context.font = 'Bold 40px Arial';
	context.fillStyle = 'white';
	context.textAlign = 'center';
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
	// va pegada delante como textura (ver más abajo).
	const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 14), skinMat);
	head.position.set(0, 1.55, 0);
	group.add(head);

	// Cara real pegada al frente de la cabeza (foto del "borracho" oficial
	// del pueblo), como una cartulina plana orientada hacia +Z.
	const faceTexture = new THREE.TextureLoader().load('assets/faces/borracho.jpg');
	const face = new THREE.Mesh(
		new THREE.PlaneGeometry(0.34, 0.34),
		new THREE.MeshStandardMaterial({ map: faceTexture, transparent: true })
	);
	face.position.set(0, 1.55, 0.235);
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

function createGeometricElement(element, pos, scene) {
	const group = new THREE.Group();
	const colorMap = {
		'bar': 0xf1c40f,
		'wc': 0x3498db,
		'rest-area': 0x27ae60,
		'main-stage': 0x27ae60,
		'secondary-stage': 0xe67e22,
        'generator': 0x9b59b6,
        'zone-vip': 0xf1c40f,
        'zone-camping': 0x27ae60,
        'zone-parking': 0x3498db
	};
	const color = colorMap[element.type] || 0x7f8c8d;

	if (element.type === 'bar') {
        // Modelo de barra compuesta: base + mostrador
        const base = new THREE.Mesh(new THREE.BoxGeometry(element.length, 2, element.width), new THREE.MeshStandardMaterial({ color: color }));
        base.position.set(0, 1, 0);
        group.add(base);

        const top = new THREE.Mesh(new THREE.BoxGeometry(element.length + 0.5, 0.2, element.width + 0.5), new THREE.MeshStandardMaterial({ color: 0x333333 }));
        top.position.set(0, 2.1, 0);
        group.add(top);
    } else if (element.type === 'wc') {
        // Modelo de cabina de baño
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.5, 1.2), new THREE.MeshStandardMaterial({ color: color }));
        mesh.position.set(0, 1.25, 0);
        group.add(mesh);

        // Techo inclinado para el baño
        const roof = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 1.4), new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
        roof.position.set(0, 2.5, 0);
        group.add(roof);
    } else {
        const isZone = element.type.startsWith('zone');
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(element.length || 4, isZone ? 0.1 : 2, element.width || 4),
            new THREE.MeshStandardMaterial({ color: color, transparent: isZone, opacity: isZone ? 0.4 : 1 })
        );
        mesh.position.set(0, isZone ? 0.05 : 1, 0);
        group.add(mesh);
    }

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

	group.position.set(pos.x, 0, pos.z);
	group.rotation.y = -((element.rotation || 0) * Math.PI) / 180;
	scene.add(group);
	return group;
}
