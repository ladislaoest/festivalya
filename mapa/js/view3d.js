
// --- VISTA 3D (Three.js) ---
let threeScene, threeCamera, threeRenderer, threeControls, animationFrameId;
let map3dPlaneSize = 100;

const GLTFLoader = window.THREE.GLTFLoader;

function load3DIcon(modelPath, position, scene, scale = 1) {
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
			const model = gltf.scene;
			model.position.copy(position);
			model.scale.set(scale, scale, scale);
			scene.add(model);
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
			object.position.copy(position);
			object.scale.set(scale, scale, scale);
			scene.add(object);
		}, undefined, function(error) {
			console.error('Error cargando modelo OBJ:', modelPath, error);
		});
	}
}


function generate3DView(style) {
	const container = document.getElementById('3d-container-full');
	const canvas = document.getElementById('3d-canvas-full');
	if (!canvas) {
		console.error('[3D] No se encontró el canvas #3d-canvas-full');
		return;
	}
	const rect = canvas.getBoundingClientRect();
	
	if (threeRenderer) threeRenderer.dispose();
	if (animationFrameId) cancelAnimationFrame(animationFrameId);

	threeScene = new THREE.Scene();
	threeCamera = new THREE.PerspectiveCamera(75, container.offsetWidth / container.offsetHeight, 0.1, 1000);
	threeCamera.position.set(0, 40, 50);
	threeCamera.lookAt(0, 0, 0);

	threeRenderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
	threeRenderer.setClearColor(0x222244, 1);
	threeRenderer.setSize(container.offsetWidth, container.offsetHeight);

	threeControls = new THREE.OrbitControls(threeCamera, threeRenderer.domElement);
	threeControls.enableDamping = true;

	window.addEventListener('resize', () => {
		const container = document.getElementById('3d-container-full');
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

	const slider = document.getElementById('map3d-size-slider');
	map3dPlaneSize = slider ? parseInt(slider.value) : 100;

	const center = map.getCenter();
	const zoom = map.getZoom();
	
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
	function lng2tile(lon, zoom) {
		return Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
	}
	function lat2tile(lat, zoom) {
		return Math.floor((1 - Math.log(Math.tan(lat * Math.PI/180) + 1/Math.cos(lat * Math.PI/180)) / Math.PI) / 2 * Math.pow(2, zoom));
	}
	function tile2lng(x, zoom) {
		return x / Math.pow(2, zoom) * 360 - 180;
	}
	function tile2lat(y, zoom) {
		const n = Math.PI - 2 * Math.PI * y / Math.pow(2, zoom);
		return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
	}
	const tileX = lng2tile(center.lng, zoom);
	const tileY = lat2tile(center.lat, zoom);
	const tileUrl = tileTemplate
		.replace('{s}', subdomain)
		.replace('{z}', zoom)
		.replace('{x}', tileX)
		.replace('{y}', tileY);

	const minLng = tile2lng(tileX, zoom);
	const maxLng = tile2lng(tileX + 1, zoom);
	const maxLat = tile2lat(tileY, zoom);
	const minLat = tile2lat(tileY + 1, zoom);

	const groundGeometry = new THREE.PlaneGeometry(map3dPlaneSize, map3dPlaneSize);
	const groundMaterial = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
	const ground = new THREE.Mesh(groundGeometry, groundMaterial);
	ground.rotation.x = -Math.PI / 2;
	threeScene.add(ground);
	new THREE.TextureLoader().load(tileUrl, function(texture) {
		ground.material.map = texture;
		ground.material.needsUpdate = true;
	});
	ground.userData = { minLat, maxLat, minLng, maxLng };

	if (style === 'ilustrado') {
		ground.material.color.set(0x3d4a53);
	} else {
		ground.material.color.set(0x2D3436);
	}

	drawElements(elements, threeScene);

	function animate() {
		animationFrameId = requestAnimationFrame(animate);
		threeControls.update();
		threeRenderer.render(threeScene, threeCamera);
	}
	animate();
}

function latLngToPlane(lat, lng, bbox) {
	const planeSize = map3dPlaneSize;
	const x = ((lng - bbox.minLng) / (bbox.maxLng - bbox.minLng)) * planeSize - planeSize / 2;
	const z = ((bbox.maxLat - lat) / (bbox.maxLat - bbox.minLat)) * planeSize - planeSize / 2;
	return { x, z };
}

function drawElements(elements, threeScene) {
	if (!elements.length) return;
	const ground = threeScene.children.find(obj => obj.type === 'Mesh' && obj.userData && obj.userData.minLat !== undefined);
	if (!ground) return;
	const bbox = ground.userData;
	
	elements.forEach(element => {
		const latLng = element.moveMarker.getLatLng();
		const pos = latLngToPlane(latLng.lat, latLng.lng, bbox);
		
		if (element.type === 'main-stage') {
            load3DIcon('assets/3d-icons/escenario.glb', new THREE.Vector3(pos.x, 0, pos.z), threeScene, element.length / 10);
        } else if (element.type === 'food-truck') {
            load3DIcon('assets/3d-icons/Truck.glb', new THREE.Vector3(pos.x, 0, pos.z), threeScene, 2);
        } else if (element.type === 'fence') {
            load3DIcon('assets/3d-icons/valla.glb', new THREE.Vector3(pos.x, 0, pos.z), threeScene, element.length / 2);
        } else if (element.type === 'bar' || element.type === 'wc' || element.type.startsWith('signal')) {
            createGeometricElement(element, pos, threeScene);
        } else if (element.isRectangle) {
			const geometry = new THREE.BoxGeometry(element.length, 2, element.width);
			const material = new THREE.MeshStandardMaterial({ color: element.color });
			const mesh = new THREE.Mesh(geometry, material);
			mesh.position.set(pos.x, geometry.parameters.height / 2, pos.z);
			mesh.rotation.y = (element.rotation * Math.PI) / 180;
			threeScene.add(mesh);
		} else {
			createGeometricElement(element, pos, threeScene);
		}
        
        // Etiqueta flotante 3D para todos
        create3DLabel(element.name, new THREE.Vector3(pos.x, 8, pos.z), threeScene);
	});
}

function create3DLabel(text, position, scene) {
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
	sprite.scale.set(10, 5, 1);
	scene.add(sprite);
}


function createGeometricElement(element, pos, scene) {
	let geometry;
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
        const baseGeom = new THREE.BoxGeometry(element.length, 2, element.width);
        const baseMat = new THREE.MeshStandardMaterial({ color: color });
        const base = new THREE.Mesh(baseGeom, baseMat);
        base.position.set(pos.x, 1, pos.z);
        base.rotation.y = (element.rotation * Math.PI) / 180;
        scene.add(base);

        const topGeom = new THREE.BoxGeometry(element.length + 0.5, 0.2, element.width + 0.5);
        const topMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const top = new THREE.Mesh(topGeom, topMat);
        top.position.set(pos.x, 2.1, pos.z);
        top.rotation.y = (element.rotation * Math.PI) / 180;
        scene.add(top);
    } else if (element.type === 'wc') {
        // Modelo de cabina de baño
        geometry = new THREE.BoxGeometry(1.2, 2.5, 1.2);
        const material = new THREE.MeshStandardMaterial({ color: color });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(pos.x, 1.25, pos.z);
        mesh.rotation.y = (element.rotation * Math.PI) / 180;
        scene.add(mesh);

        // Techo inclinado para el baño
        const roofGeom = new THREE.BoxGeometry(1.4, 0.1, 1.4);
        const roofMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
        const roof = new THREE.Mesh(roofGeom, roofMat);
        roof.position.set(pos.x, 2.5, pos.z);
        roof.rotation.y = (element.rotation * Math.PI) / 180;
        scene.add(roof);
    } else {
        const isZone = element.type.startsWith('zone');
        geometry = new THREE.BoxGeometry(element.length || 4, isZone ? 0.1 : 2, element.width || 4);
        const material = new THREE.MeshStandardMaterial({ 
            color: color, 
            transparent: isZone, 
            opacity: isZone ? 0.4 : 1 
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(pos.x, isZone ? 0.05 : 1, pos.z);
        mesh.rotation.y = (element.rotation * Math.PI) / 180;
        scene.add(mesh);
    }

	const iconGeom = new THREE.PlaneGeometry(3, 3);
	new THREE.TextureLoader().load(element.iconUrl, (texture) => {
		const iconMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
		const iconPlane = new THREE.Mesh(iconGeom, iconMat);
		iconPlane.position.set(pos.x, 5, pos.z);
        iconPlane.rotation.y = (element.rotation * Math.PI) / 180;
		scene.add(iconPlane);
	});
}
