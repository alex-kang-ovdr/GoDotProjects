import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { PARTS, getConnections } from './parts.js';
import { getMissionLayout } from './physics.js';

const Y_OFFSET = 0.72;
const QUARTER = Math.PI / 2;
const TAU = Math.PI * 2;
const MAX_PARTICLES = 280;
const CELL_LIMIT = 12;
const _position = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _rotation = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _matrix = new THREE.Matrix4();
const _normalMatrix = new THREE.Matrix3();
const _normal = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _localDirection = new THREE.Vector3();
const _inverseRotation = new THREE.Quaternion();
const OUTLINE_EDGES = [[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]];

function hash(text) {
  let n = 2166136261;
  for (const c of String(text)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}

function seeded(seed = 17) {
  let n = seed >>> 0;
  return () => {
    n = Math.imul(n, 1664525) + 1013904223 >>> 0;
    return n / 4294967296;
  };
}

function cellKey(cell) { return `${cell.x},${cell.y},${cell.z}`; }
function copyCell(cell) { return cell ? { x: cell.x, y: cell.y, z: cell.z } : null; }
function authoredElevation(part) { return part?.elevation ?? PARTS[part?.type]?.defaultElevation ?? 0; }

/**
 * The renderer deliberately keeps design, simulation and scenery separate.
 * Part roots are the physical body frames: Y up, wheel axle X, cannon -Z.
 * Only the physics owner decides motion, impacts and destruction.
 */
export class GameScene {
  constructor(container, { onCellClick, onSelect, onHover } = {}) {
    this.container = container;
    this.callbacks = { onCellClick, onSelect, onHover };
    this.mode = 'build';
    this.tool = 'wood';
    this.rotation = 0;
    this.mission = 'outpost';
    this.environment = { kind: 'land', groundY: 0, waterLevel: null };
    this.simulation = null;
    this.parts = [];
    this.partRoots = new Map();
    this.partData = new Map();
    this.occupied = new Map();
    this.pickables = [];
    this.targetRoots = new Map();
    this.projectileRoots = new Map();
    this.obstacleRoots = new Map();
    this.enemyRoots = new Map();
    this.targetIndicators = new Map();
    this.partIndicators = new Map();
    this.routeMarkers = new Map();
    this.selectedId = null;
    this.selectedIds = new Set();
    this.reviewIds = new Set();
    this.connectionsVisible = false;
    this.aimVisible = true;
    this.stressVisible = false;
    this.stressMode = 'load';
    this.excludedPartId = null;
    this.mirror = false;
    this.ghostElevation = 0;
    this.quality = 'high';
    this.diagnostics = { centerOfMass: null, disconnectedIds: new Set() };
    this._recentBreaks = new Map();
    this._aimGuide = null;
    this._dryFireFlash = 0;
    this._geometries = new Map();
    this._materials = new Map();
    this._resources = new Set();
    this._listeners = [];
    this._pointers = new Set();
    this._pointer = new THREE.Vector2(2, 2);
    this._pointerInside = false;
    this._pointerStart = null;
    this._hoverKey = '';
    this._hover = null;
    this._particles = [];
    this._smokes = [];
    this._elapsed = 0;
    this._followPause = 0;
    this._view = 'iso';
    this._cameraTween = null;
    this._flightChaseEnabled = true;
    this._flightForward = new THREE.Vector3(0, 0, -1);
    this._disposed = false;
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(_up, -0.035);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#e3e9e2');
    this.scene.fog = new THREE.Fog('#e3e9e2', 42, 105);

    this.camera = new THREE.PerspectiveCamera(43, 1, 0.1, 280);
    this.camera.position.set(12, 13.5, 18);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.13;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;';
    this.renderer.domElement.setAttribute('aria-label', '3D 조립 작업장. 왼쪽 클릭으로 조립, 오른쪽 드래그로 회전합니다.');
    this.renderer.domElement.setAttribute('tabindex', '0');
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.8, -5.2);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 85;
    this.controls.minPolarAngle = 0.025;
    this.controls.maxPolarAngle = Math.PI * 0.475;
    this.controls.rotateSpeed = 0.6;
    this.controls.panSpeed = 0.8;
    this.controls.zoomSpeed = 0.85;
    this.controls.mouseButtons.LEFT = null;
    this.controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    this.controls.touches.ONE = THREE.TOUCH.ROTATE;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    this._controlStart = () => {
      this._cameraTween = null;
      this._followPause = 2.5;
      this._flightChaseEnabled = false;
    };
    this.controls.addEventListener('start', this._controlStart);
    this.controls.update();

    this.designGroup = new THREE.Group();
    this.previewGroup = new THREE.Group();
    this.runtimeGroup = new THREE.Group();
    this.sceneryGroup = new THREE.Group();
    this.fxGroup = new THREE.Group();
    this.indicatorGroup = new THREE.Group();
    this.environmentGroup = new THREE.Group();
    this.routeGroup = new THREE.Group();
    this.scene.add(this.sceneryGroup, this.designGroup, this.previewGroup, this.runtimeGroup, this.fxGroup, this.indicatorGroup, this.environmentGroup, this.routeGroup);
    this._createLighting();
    this._createLandscape();
    this._createGrid();
    this._createOverlays();
    this._createAimOverlays();
    this._createDiagnostics();
    this._createAltitudeGuide();
    this._createParticles();
    this._bindInput();
    this.setTool(this.tool);
    this.setMission(this.mission);
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => this.resize());
      this._resizeObserver.observe(container);
    }
  }

  _geometry(key, create) {
    if (!this._geometries.has(key)) {
      const geometry = create();
      this._geometries.set(key, geometry);
      this._resources.add(geometry);
    }
    return this._geometries.get(key);
  }

  _material(key, color, roughness = 0.85, metalness = 0) {
    if (!this._materials.has(key)) {
      const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      this._materials.set(key, material);
      this._resources.add(material);
    }
    return this._materials.get(key);
  }

  _own(resource) { this._resources.add(resource); return resource; }

  _releaseInstances(root) {
    // Instance buffers belong to the mesh, while its geometry/material are
    // intentionally cached for later editor rebuilds.
    root.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
  }

  _box(width, height, depth, material, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(this._geometry('box', () => new THREE.BoxGeometry(1, 1, 1)), material);
    mesh.scale.set(width, height, depth);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  _cylinder(top, bottom, height, material, segments = 16) {
    const key = `cyl:${top}:${bottom}:${height}:${segments}`;
    const mesh = new THREE.Mesh(this._geometry(key, () => new THREE.CylinderGeometry(top, bottom, height, segments)), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  _torus(radius, tube, material) {
    const key = `torus:${radius}:${tube}`;
    const mesh = new THREE.Mesh(this._geometry(key, () => new THREE.TorusGeometry(radius, tube, 5, 20)), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  _instances(geometry, material, items) {
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    items.forEach((item, i) => {
      _position.set(...(item.p || [0, 0, 0]));
      _euler.set(...(item.r || [0, 0, 0]));
      _rotation.setFromEuler(_euler);
      _scale.set(...(item.s || [1, 1, 1]));
      _matrix.compose(_position, _rotation, _scale);
      mesh.setMatrixAt(i, _matrix);
      if (item.color) mesh.setColorAt(i, new THREE.Color(item.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  _createLighting() {
    this.scene.add(new THREE.HemisphereLight('#f9f5e5', '#687562', 2.3));
    const sun = new THREE.DirectionalLight('#fff2d0', 3.4);
    sun.position.set(-13, 25, 13);
    sun.target.position.set(0, 0, -7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -25;
    sun.shadow.camera.right = 25;
    sun.shadow.camera.top = 27;
    sun.shadow.camera.bottom = -27;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 75;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 3;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    const rim = new THREE.DirectionalLight('#d9edeb', 0.65);
    rim.position.set(15, 12, -20);
    this.scene.add(rim);
    this.flashLight = new THREE.PointLight('#ffbc66', 0, 8, 2);
    this.scene.add(this.flashLight);
  }

  _createLandscape() {
    const island = [
      [-25, 10], [-23, -16], [-18, -32], [-8, -36], [10, -35],
      [22, -27], [26, -9], [24, 12], [14, 18], [-11, 17],
    ];
    const shape = new THREE.Shape();
    island.forEach(([x, z], i) => i ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
    shape.closePath();
    const soilGeometry = this._own(new THREE.ExtrudeGeometry(shape, { depth: 2.1, bevelEnabled: false, steps: 1 }));
    const grass = this._material('grass', '#91a080');
    const soil = this._material('soil', '#a18c70');
    const earth = new THREE.Mesh(soilGeometry, [grass, soil]);
    earth.rotation.x = -QUARTER;
    earth.position.y = -2.17;
    earth.castShadow = true;
    earth.receiveShadow = true;
    this.sceneryGroup.add(earth);
    const lower = new THREE.Mesh(soilGeometry, this._material('lower-soil', '#7b7565'));
    lower.rotation.x = -QUARTER;
    lower.scale.set(0.985, 0.985, 0.42);
    lower.position.y = -2.8;
    lower.receiveShadow = true;
    this.sceneryGroup.add(lower);

    const backdrop = new THREE.Mesh(this._geometry('backdrop', () => new THREE.PlaneGeometry(400, 400)), this._material('backdrop', '#d2dbcd'));
    backdrop.rotation.x = -QUARTER;
    backdrop.position.y = -2.86;
    backdrop.receiveShadow = true;
    this.sceneryGroup.add(backdrop);

    const path = this._box(4.2, 0.025, 24, this._material('path', '#a5ac91'), 0, -0.048, -7.5);
    path.castShadow = false;
    this.sceneryGroup.add(path);
    const workshop = this._box(9.5, 0.026, 8.5, this._material('workshop-pad', '#aeb69c'), 0, -0.027, 0);
    workshop.castShadow = false;
    this.sceneryGroup.add(workshop);

    const random = seeded(1247);
    const rockGeo = this._geometry('rock', () => new THREE.DodecahedronGeometry(1, 0));
    const rockItems = [];
    for (let i = 0; i < 44; i++) {
      const side = random() > 0.5 ? 1 : -1;
      const x = side * (12.8 + random() * 8.2);
      const z = -29 + random() * 40;
      const scale = 0.13 + random() * 0.42;
      rockItems.push({ p: [x, scale * 0.4 - 0.03, z], s: [scale * 1.3, scale * 0.75, scale], r: [random(), random() * TAU, random()], color: ['#a5aa98', '#b9b9a6', '#878f7e'][i % 3] });
    }
    this.sceneryGroup.add(this._instances(rockGeo, this._material('rocks', '#ffffff'), rockItems));

    const grassGeo = this._geometry('grass-blade', () => new THREE.ConeGeometry(0.055, 0.35, 3));
    const tufts = [];
    for (let i = 0; i < 210; i++) {
      const side = random() > 0.5 ? 1 : -1;
      const x = side * (7.1 + random() * 15);
      const z = -29 + random() * 42;
      const scale = 0.65 + random() * 0.85;
      tufts.push({ p: [x, 0.09, z], s: [1, scale, 1], r: [0, random() * TAU, (random() - 0.5) * 0.3], color: i % 3 ? '#718568' : '#bac095' });
    }
    const grassMesh = this._instances(grassGeo, this._material('grass-blades', '#ffffff'), tufts);
    this.grassMesh = grassMesh;
    grassMesh.castShadow = false;
    this.sceneryGroup.add(grassMesh);

    const treePositions = [[-19, -22, 1.2], [-21, -12, 0.8], [-18, 5, 1], [20, -21, 1.15], [19, -7, 0.78], [20, 8, 1.05], [-13, -30, 0.85], [12, -29, 0.9]];
    const foliage = [this._material('leaves-a', '#7e9479'), this._material('leaves-b', '#9caf8a'), this._material('leaves-c', '#b0bd95')];
    const trunkMat = this._material('tree-trunk', '#84735c');
    treePositions.forEach(([x, z, scale], index) => {
      const tree = new THREE.Group();
      const trunk = this._cylinder(0.13, 0.2, 1.7, trunkMat, 6);
      trunk.position.y = 0.8;
      tree.add(trunk);
      const canopy = new THREE.Mesh(this._geometry('tree-canopy', () => new THREE.IcosahedronGeometry(1, 0)), foliage[index % 3]);
      canopy.scale.set(1.2, 1.65, 1.1);
      canopy.position.y = 2.0;
      canopy.rotation.y = index * 1.4;
      canopy.castShadow = true;
      canopy.receiveShadow = true;
      tree.add(canopy);
      tree.scale.setScalar(scale);
      tree.position.set(x, 0, z);
      this.sceneryGroup.add(tree);
    });

    // Distant quiet forms frame the playable island without competing with it.
    const hillMat = this._material('hills', '#b4c4b2');
    [[-37, -48, 8], [29, -55, 12], [-8, -67, 10], [46, -30, 7]].forEach(([x, z, s], i) => {
      const hill = new THREE.Mesh(this._geometry('hill', () => new THREE.IcosahedronGeometry(1, 0)), hillMat);
      hill.position.set(x, -1.5, z);
      hill.scale.set(s * 1.7, s * 0.8, s);
      hill.rotation.y = i;
      this.sceneryGroup.add(hill);
    });
  }

  _configureEnvironment(environment, checkpoints = []) {
    this.environment = {
      ...environment,
      kind: ['land', 'water', 'air'].includes(environment?.kind) ? environment.kind : 'land',
      groundY: Number.isFinite(environment?.groundY) ? environment.groundY : 0,
      waterLevel: Number.isFinite(environment?.waterLevel) ? environment.waterLevel : null,
    };
    for (const child of [...this.environmentGroup.children]) this._disposeTransient(child);
    this.waterSurface = this.waterRipples = this.waterWake = this.routeClouds = null;
    const { kind } = this.environment;
    const drivingRoute = kind === 'land' && checkpoints.length > 0;
    this.sceneryGroup.visible = kind === 'land' && !drivingRoute;
    this.scene.background.set(kind === 'water' ? '#dae7e3' : kind === 'air' ? '#dfe9e8' : '#e3e9e2');
    this.scene.fog.color.copy(this.scene.background);
    this.scene.fog.near = kind === 'land' && !drivingRoute ? 42 : 85;
    this.scene.fog.far = kind === 'land' && !drivingRoute ? 105 : 220;
    this.grid.material.depthTest = kind !== 'water';
    this.grid.material.opacity = kind === 'water' ? 0.33 : 0.24;
    this.grid.renderOrder = kind === 'water' ? 5 : 0;
    this.padCorners.material.depthTest = kind !== 'water';
    this.padCorners.renderOrder = kind === 'water' ? 5 : 0;
    this.sun.position.set(-13, 25, 13);
    this.sun.target.position.set(0, 0, -7);
    if (kind === 'water') this._createWaterEnvironment(checkpoints);
    else if (kind === 'air') this._createAirEnvironment(checkpoints);
    else if (drivingRoute) this._createAirEnvironment(checkpoints, true);
  }

  _createWaterEnvironment(checkpoints) {
    const surfaceY = this.environment.waterLevel ?? 0.45;
    const groundY = this.environment.groundY;
    const end = Math.min(-60, ...checkpoints.map(point => point.position.z - 24));
    const depth = Math.max(100, 20 - end);
    const centerZ = 20 - depth / 2;
    const seabed = this._box(150, 0.12, depth + 30, this._material('seabed', '#abb99d'), 0, groundY - 0.06, centerZ);
    seabed.castShadow = false;
    this.environmentGroup.add(seabed);
    // One exact horizontal surface agrees with buoyancy; moving highlights are
    // cosmetic and never displace the physical water plane.
    const material = this._own(new THREE.MeshStandardMaterial({ color: '#6dada9', roughness: 0.28, metalness: 0.16, transparent: true, opacity: 0.69, depthWrite: false, side: THREE.DoubleSide }));
    material.userData.transient = true;
    const geometry = this._own(new THREE.PlaneGeometry(150, depth + 30));
    geometry.userData.transient = true;
    this.waterSurface = new THREE.Mesh(geometry, material);
    this.waterSurface.rotation.x = -QUARTER;
    this.waterSurface.position.set(0, surfaceY, centerZ);
    this.waterSurface.receiveShadow = true;
    this.waterSurface.renderOrder = 1;
    this.environmentGroup.add(this.waterSurface);
    const random = seeded(6124);
    const positions = [];
    for (let i = 0; i < 170; i++) {
      const x = (random() - 0.5) * 90;
      const z = 12 - random() * (depth - 12);
      const length = 0.4 + random() * 1.0;
      positions.push(x, surfaceY + 0.018, z, x + length, surfaceY + 0.018, z + 0.09);
      if (i % 3 === 0) positions.push(x + 0.18, surfaceY + 0.018, z + 0.16, x + length * 0.7, surfaceY + 0.018, z + 0.22);
    }
    const rippleGeometry = this._own(new THREE.BufferGeometry());
    rippleGeometry.userData.transient = true;
    rippleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const rippleMaterial = this._own(new THREE.LineBasicMaterial({ color: '#d5e5cc', transparent: true, opacity: 0.28, depthWrite: false }));
    rippleMaterial.userData.transient = true;
    this.waterRipples = new THREE.LineSegments(rippleGeometry, rippleMaterial);
    this.waterRipples.renderOrder = 2;
    this.waterRipples.visible = this.quality !== 'low';
    this.environmentGroup.add(this.waterRipples);
    const wakeGeometry = this._own(new THREE.BufferGeometry());
    wakeGeometry.userData.transient = true;
    wakeGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    wakeGeometry.setDrawRange(0, 0);
    const wakeMaterial = this._own(new THREE.LineBasicMaterial({ color: '#e8efda', transparent: true, opacity: 0.45, depthWrite: false }));
    wakeMaterial.userData.transient = true;
    this.waterWake = new THREE.LineSegments(wakeGeometry, wakeMaterial);
    this.waterWake.frustumCulled = false;
    this.waterWake.renderOrder = 3;
    this.waterWake.visible = false;
    this.environmentGroup.add(this.waterWake);
    // A quiet far shoreline frames the channel, well outside its clear route.
    const stone = this._material('coastal-stone', '#92aa96');
    const sand = this._material('coastal-sand', '#bcc3a2');
    for (const [index, x, z] of [[0, -42, -15], [1, 44, -38], [2, -45, -64], [3, 39, -79]]) {
      const island = new THREE.Mesh(this._geometry('coastal-islet', () => new THREE.DodecahedronGeometry(1, 0)), index % 2 ? stone : sand);
      island.position.set(x, surfaceY - 0.7, z);
      island.scale.set(8.5, 2.1, 12);
      island.rotation.y = index * 0.6;
      island.receiveShadow = true;
      this.environmentGroup.add(island);
    }
    const rocks = [];
    for (let i = 0; i < 25; i++) {
      const size = 0.16 + random() * 0.5;
      rocks.push({ p: [(random() - 0.5) * 36, groundY + size * 0.2, -random() * (depth - 20)], s: [size * 1.5, size * 0.5, size], r: [0, random() * TAU, 0], color: i % 2 ? '#9ca891' : '#bbc2a8' });
    }
    this.environmentGroup.add(this._instances(this._geometry('rock', () => new THREE.DodecahedronGeometry(1, 0)), this._material('underwater-rock', '#ffffff'), rocks));
  }

  _createAirEnvironment(checkpoints, driving = false) {
    const groundY = this.environment.groundY;
    const end = Math.min(-80, ...checkpoints.map(point => point.position.z - 28));
    const outline = [[-25, 15], [-29, -6], [-27, end + 14], [-18, end], [16, end - 3], [28, end + 12], [30, -7], [25, 14]];
    const shape = new THREE.Shape();
    outline.forEach(([x, z], i) => i ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
    shape.closePath();
    const geometry = this._own(new THREE.ExtrudeGeometry(shape, { depth: 1.8, steps: 1, bevelEnabled: false }));
    geometry.userData.transient = true;
    const island = new THREE.Mesh(geometry, [this._material('airfield-grass', '#9baa8d'), this._material('airfield-soil', '#a7967a')]);
    island.rotation.x = -QUARTER;
    island.position.y = groundY - 1.87;
    island.receiveShadow = true;
    this.environmentGroup.add(island);
    const backdrop = this._box(300, 0.08, 320, this._material('airfield-distance', '#cbd8c6'), 0, groundY - 2.15, -45);
    backdrop.castShadow = false;
    this.environmentGroup.add(backdrop);
    const markings = [];
    if (driving) {
      let previous = { x: 0, z: 4 };
      for (const checkpoint of checkpoints) {
        const next = checkpoint.position;
        const length = Math.hypot(next.x - previous.x, next.z - previous.z);
        const angle = Math.atan2(next.x - previous.x, next.z - previous.z);
        const path = this._box(4.4, 0.025, length + 1.0, this._material('driving-path', '#b2b398'), (previous.x + next.x) / 2, groundY - 0.04, (previous.z + next.z) / 2);
        path.rotation.y = angle;
        path.castShadow = false;
        this.environmentGroup.add(path);
        for (let d = 1; d < length; d += 3.2) markings.push({ p: [THREE.MathUtils.lerp(previous.x, next.x, d / length), groundY - 0.02, THREE.MathUtils.lerp(previous.z, next.z, d / length)], s: [0.11, 0.008, 0.8], r: [0, angle, 0] });
        previous = next;
      }
    } else {
      const runway = this._box(7.2, 0.025, 34, this._material('runway', '#b5bba3'), 0, groundY - 0.04, -10);
      runway.castShadow = false;
      this.environmentGroup.add(runway);
      for (let i = 0; i < 9; i++) markings.push({ p: [0, groundY - 0.02, 4 - i * 3.4], s: [0.12, 0.008, 1.25] });
      for (const x of [-3.2, 3.2]) for (let i = 0; i < 13; i++) markings.push({ p: [x, groundY - 0.02, 5 - i * 2.5], s: [0.065, 0.008, 0.8] });
    }
    const marks = this._instances(this._geometry('box', () => new THREE.BoxGeometry(1, 1, 1)), this._material('runway-mark', '#e0ddbf'), markings);
    marks.castShadow = false;
    this.environmentGroup.add(marks);
    const trees = new THREE.Group();
    const foliage = this._material('airfield-trees', '#829b81');
    const trunkMaterial = this._material('tree-trunk', '#84735c');
    for (let i = 0; i < 14; i++) {
      const x = (i % 2 ? 1 : -1) * (19 + Math.sin(i * 4.1) * 3.2);
      const z = 3 - Math.floor(i / 2) * 11;
      const trunk = this._cylinder(0.09, 0.16, 1.3, trunkMaterial, 6);
      trunk.position.set(x, groundY + 0.6, z);
      const canopy = new THREE.Mesh(this._geometry('tree-canopy', () => new THREE.IcosahedronGeometry(1, 0)), foliage);
      canopy.position.set(x, groundY + 1.55, z);
      canopy.scale.set(0.9, 1.3, 0.9);
      canopy.rotation.y = i;
      canopy.castShadow = true;
      trees.add(trunk, canopy);
    }
    this.environmentGroup.add(trees);
    if (driving) return;
    this.routeClouds = new THREE.Group();
    const cloudMaterial = this._material('route-cloud', '#f0f4e9', 1, 0);
    for (const [index, x, y, z] of [[0, -28, 21, -28], [1, 32, 26, -49], [2, -27, 29, -76]]) {
      const cloud = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const puff = new THREE.Mesh(this._geometry('cloud-puff', () => new THREE.IcosahedronGeometry(1, 1)), cloudMaterial);
        puff.scale.set(2.6 + i * 0.45, 1.2 + (i % 2) * 0.5, 1.7);
        puff.position.x = (i - 1) * 2.2;
        puff.position.y = i % 2 ? 0.5 : 0;
        cloud.add(puff);
      }
      cloud.position.set(x, y, z);
      cloud.userData.originX = x;
      cloud.userData.phase = index;
      this.routeClouds.add(cloud);
    }
    this.routeClouds.visible = this.quality !== 'low';
    this.environmentGroup.add(this.routeClouds);
  }

  _createRoute(checkpoints = []) {
    for (const child of [...this.routeGroup.children]) this._disposeTransient(child);
    this.routeMarkers.clear();
    this.routeLine = null;
    this._routeCheckpoints = checkpoints.map(point => ({ ...point, position: { ...point.position } }));
    this.routeGroup.visible = checkpoints.length > 0;
    if (!checkpoints.length) return;
    checkpoints.forEach((point, index) => {
      const marker = this._makeRouteMarker(point, index);
      marker.position.copy(point.position);
      this.routeMarkers.set(point.id, marker);
      this.routeGroup.add(marker);
    });
    const geometry = this._own(new THREE.BufferGeometry());
    geometry.userData.transient = true;
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(checkpoints.length * 6), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(checkpoints.length * 6), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('lineDistance', new THREE.BufferAttribute(new Float32Array(checkpoints.length * 2), 1).setUsage(THREE.DynamicDrawUsage));
    const material = this._own(new THREE.LineDashedMaterial({ vertexColors: true, dashSize: 0.4, gapSize: 0.25, transparent: true, opacity: 0.62, depthWrite: false }));
    material.userData.transient = true;
    this.routeLine = new THREE.LineSegments(geometry, material);
    this.routeLine.frustumCulled = false;
    this.routeLine.renderOrder = 4;
    this.routeGroup.add(this.routeLine);
    this._updateRoute();
  }

  _makeRouteMarker(point, index) {
    const group = new THREE.Group();
    const water = this.environment.kind === 'water';
    const land = this.environment.kind === 'land';
    const radius = point.radius;
    const material = this._own(new THREE.MeshStandardMaterial({ color: '#efca87', roughness: 0.48, metalness: 0.14, transparent: true, opacity: 0.96, side: THREE.DoubleSide }));
    material.userData.transient = true;
    const lineMaterial = this._own(new THREE.LineDashedMaterial({ color: '#edcb8d', dashSize: 0.28, gapSize: 0.18, transparent: true, opacity: 0.62, depthWrite: false }));
    lineMaterial.userData.transient = true;
    const neutral = this._material('gate-neutral', '#839e91', 0.65, 0.12);
    const iron = this._material('gate-iron', '#536e63', 0.56, 0.3);
    if (water) {
      for (const sign of [-1, 1]) {
        const buoy = new THREE.Group();
        const hull = this._cylinder(0.23, 0.34, 0.24, material, 12);
        hull.position.y = 0.025;
        buoy.add(hull);
        const base = this._torus(0.265, 0.035, iron);
        base.rotation.x = QUARTER;
        base.position.y = 0.14;
        buoy.add(base);
        const mast = this._cylinder(0.026, 0.035, 1.05, iron, 6);
        mast.position.y = 0.61;
        buoy.add(mast);
        const flagGeometry = this._geometry('route-flag', () => {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.55, -0.17, 0, 0, -0.36, 0], 3));
          geometry.computeVertexNormals();
          return geometry;
        });
        const flag = new THREE.Mesh(flagGeometry, material);
        flag.position.set(0, 1.14, 0);
        if (sign > 0) flag.rotation.y = Math.PI;
        buoy.add(flag);
        buoy.position.x = sign * radius;
        group.add(buoy);
      }
      const thresholdGeometry = this._own(new THREE.BufferGeometry());
      thresholdGeometry.userData.transient = true;
      thresholdGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-radius, 0.035, 0, radius, 0.035, 0], 3));
      thresholdGeometry.setAttribute('lineDistance', new THREE.Float32BufferAttribute([0, radius * 2], 1));
      const threshold = new THREE.Line(thresholdGeometry, lineMaterial);
      threshold.renderOrder = 4;
      group.add(threshold);
    } else if (land) {
      const floor = this.environment.groundY - point.position.y;
      const arch = new THREE.Mesh(this._geometry(`land-route-arch:${radius}`, () => new THREE.TorusGeometry(radius, 0.073, 8, 48, Math.PI)), material);
      group.add(arch);
      for (const sign of [-1, 1]) {
        const height = Math.max(0.1, -floor);
        const post = this._box(0.11, height, 0.11, material, sign * radius, floor + height / 2, 0);
        const foot = this._box(0.36, 0.16, 0.36, iron, sign * radius, floor + 0.08, 0);
        group.add(post, foot);
      }
      const thresholdGeometry = this._own(new THREE.BufferGeometry());
      thresholdGeometry.userData.transient = true;
      thresholdGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-radius, floor + 0.035, 0, radius, floor + 0.035, 0], 3));
      thresholdGeometry.setAttribute('lineDistance', new THREE.Float32BufferAttribute([0, radius * 2], 1));
      group.add(new THREE.Line(thresholdGeometry, lineMaterial));
      const blocks = [];
      for (let i = 0; i < 8; i++) {
        const angle = (i + 0.5) / 8 * Math.PI;
        blocks.push({ p: [Math.cos(angle) * radius, Math.sin(angle) * radius, 0], s: [0.13, 0.20, 0.15], r: [0, 0, angle] });
      }
      group.add(this._instances(this._geometry('box', () => new THREE.BoxGeometry(1, 1, 1)), neutral, blocks));
    } else {
      const outline = this._torus(radius, 0.033, neutral);
      group.add(outline);
      // Only the bright arc is a valid flight-height region. The muted lower
      // rim remains visible, so the min-altitude rule is not an invisible wall.
      const cut = Number.isFinite(point.minAltitude) ? THREE.MathUtils.clamp((point.minAltitude - point.position.y) / radius, -1, 1) : -1;
      const start = Math.asin(cut);
      const arc = Math.PI - 2 * start;
      const hoop = new THREE.Mesh(this._geometry(`route-hoop:${radius}:${cut}`, () => new THREE.TorusGeometry(radius, 0.068, 8, 88, arc)), material);
      hoop.rotation.z = start;
      group.add(hoop);
      if (cut > -0.999 && cut < 0.999) {
        const width = radius * Math.sqrt(1 - cut * cut);
        const thresholdGeometry = this._own(new THREE.BufferGeometry());
        thresholdGeometry.userData.transient = true;
        thresholdGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-width, cut * radius, 0, width, cut * radius, 0], 3));
        thresholdGeometry.setAttribute('lineDistance', new THREE.Float32BufferAttribute([0, width * 2], 1));
        group.add(new THREE.Line(thresholdGeometry, lineMaterial));
      }
      const braces = [];
      for (const angle of [0, QUARTER, Math.PI, QUARTER * 3]) braces.push({ p: [Math.cos(angle) * radius, Math.sin(angle) * radius, 0], s: [0.2, 0.105, 0.18], r: [0, 0, angle] });
      group.add(this._instances(this._geometry('box', () => new THREE.BoxGeometry(1, 1, 1)), iron, braces));
    }
    const label = this._makeWorldLabel(String(index + 1).padStart(2, '0'), Number.isFinite(point.minAltitude) ? `${point.minAltitude.toFixed(1)} m +` : 'CHECKPOINT');
    if (label) { label.position.y = water ? 1.63 : radius + 0.72; group.add(label); }
    const pointer = new THREE.Mesh(this._geometry('gate-pointer', () => new THREE.ConeGeometry(0.13, 0.3, 3)), material);
    pointer.rotation.z = Math.PI;
    pointer.position.y = water ? 0.72 : radius + 0.12;
    group.add(pointer);
    const checkGeometry = this._geometry('gate-check', () => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.23, 0, 0, -0.06, -0.16, 0, -0.06, -0.16, 0, 0.29, 0.23, 0], 3));
      return geometry;
    });
    const check = new THREE.LineSegments(checkGeometry, this._own(new THREE.LineBasicMaterial({ color: '#a7d8b2', transparent: true, opacity: 0.9, depthWrite: false, depthTest: false })));
    check.material.userData.transient = true;
    check.position.y = water ? 0.72 : 0;
    check.renderOrder = 10;
    check.visible = false;
    group.add(check);
    const pulseMaterial = this._own(new THREE.MeshBasicMaterial({ color: '#bce3bb', transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
    pulseMaterial.userData.transient = true;
    const pulseRadius = water ? 0.65 : radius;
    const pulse = new THREE.Mesh(this._geometry(`gate-pulse:${pulseRadius}:${land ? 'arch' : 'round'}`, () => new THREE.RingGeometry(pulseRadius, pulseRadius + 0.055, 64, 1, 0, land ? Math.PI : TAU)), pulseMaterial);
    if (water) { pulse.rotation.x = -QUARTER; pulse.position.y = 0.05; }
    pulse.visible = false;
    pulse.renderOrder = 9;
    group.add(pulse);
    group.userData = { checkpoint: point, index, material, lineMaterial, label, pointer, check, pulse, pulseAt: -10, status: '' };
    return group;
  }

  _updateRoute() {
    if (!this.routeLine || !this._routeCheckpoints?.length) return;
    const completed = this.mode === 'play' && this.simulation ? this.simulation.checkpointIndex || 0 : 0;
    const positions = this.routeLine.geometry.getAttribute('position');
    const colors = this.routeLine.geometry.getAttribute('color');
    const distances = this.routeLine.geometry.getAttribute('lineDistance');
    const water = this.environment.kind === 'water';
    const flat = this.environment.kind !== 'air';
    const surface = this.environment.waterLevel ?? this.environment.groundY;
    let previous = { x: 0, y: flat ? surface + 0.05 : Y_OFFSET, z: 0 };
    const currentColor = new THREE.Color('#f1d49a'), futureColor = new THREE.Color('#91b1a4'), passedColor = new THREE.Color('#9bc8ad');
    this._routeCheckpoints.forEach((point, index) => {
      const marker = this.routeMarkers.get(point.id);
      const status = index < completed ? 'passed' : index === completed ? 'current' : 'future';
      const color = status === 'passed' ? passedColor : status === 'current' ? currentColor : futureColor;
      if (marker) {
        const data = marker.userData;
        if (data.status !== status) {
          data.status = status;
          data.material.color.copy(color);
          data.material.emissive.copy(color).multiplyScalar(status === 'current' ? 0.16 : 0.02);
          data.material.opacity = status === 'current' ? 0.98 : status === 'passed' ? 0.37 : 0.56;
          data.lineMaterial.color.copy(color);
          data.lineMaterial.opacity = status === 'current' ? 0.68 : 0.24;
          data.pointer.visible = status === 'current';
          data.check.visible = status === 'passed';
          if (data.label) data.label.material.opacity = status === 'passed' ? 0.45 : status === 'future' ? 0.72 : 1;
        }
        if (data.pointer.visible) data.pointer.position.y = (water ? 0.72 : point.radius + 0.12) + Math.sin(this._elapsed * 3) * 0.075;
        data.check.quaternion.copy(this.camera.quaternion);
        const age = this._elapsed - data.pulseAt;
        data.pulse.visible = this.mode === 'play' && age >= 0 && age < 0.9;
        if (data.pulse.visible) {
          data.pulse.scale.setScalar(1 + age * (water ? 2.0 : 0.24));
          data.pulse.material.opacity = (1 - age / 0.9) * 0.75;
        }
      }
      const start = status === 'current' && this.mode === 'play' && this.simulation ? this.simulation.corePosition : previous;
      const end = point.position;
      const sy = flat ? surface + 0.045 : start.y;
      const ey = flat ? surface + 0.045 : end.y;
      positions.setXYZ(index * 2, start.x, sy, start.z);
      positions.setXYZ(index * 2 + 1, end.x, ey, end.z);
      distances.setX(index * 2, 0);
      distances.setX(index * 2 + 1, Math.hypot(end.x - start.x, ey - sy, end.z - start.z));
      const intensity = status === 'passed' ? 0.35 : status === 'future' ? 0.7 : 1;
      colors.setXYZ(index * 2, color.r * intensity, color.g * intensity, color.b * intensity);
      colors.setXYZ(index * 2 + 1, color.r * intensity, color.g * intensity, color.b * intensity);
      previous = end;
    });
    positions.needsUpdate = colors.needsUpdate = distances.needsUpdate = true;
  }

  _createGrid() {
    const positions = [], colors = [];
    const minor = new THREE.Color('#e1e4d3');
    const major = new THREE.Color('#f5ead0');
    const add = (a, b, color) => { positions.push(...a, ...b); colors.push(color.r, color.g, color.b, color.r, color.g, color.b); };
    for (let i = -CELL_LIMIT; i <= CELL_LIMIT; i++) {
      const color = i === 0 || i % 4 === 0 ? major : minor;
      add([i, 0.015, -CELL_LIMIT], [i, 0.015, CELL_LIMIT], color);
      add([-CELL_LIMIT, 0.015, i], [CELL_LIMIT, 0.015, i], color);
    }
    const geometry = this._own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = this._own(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.24, depthWrite: false }));
    this.grid = new THREE.LineSegments(geometry, material);
    this.scene.add(this.grid);

    const corners = [];
    for (const x of [-4.7, 4.7]) for (const z of [-4.2, 4.2]) {
      corners.push(x, 0.02, z, x - Math.sign(x) * 0.75, 0.02, z);
      corners.push(x, 0.02, z, x, 0.02, z - Math.sign(z) * 0.75);
    }
    const cornerGeo = this._own(new THREE.BufferGeometry());
    cornerGeo.setAttribute('position', new THREE.Float32BufferAttribute(corners, 3));
    this.padCorners = new THREE.LineSegments(cornerGeo, this._own(new THREE.LineBasicMaterial({ color: '#f5e7bc', transparent: true, opacity: 0.85 })));
    this.scene.add(this.padCorners);
  }

  _createOverlays() {
    // Small physical-looking sleeves bridge the editor's deliberate block gaps.
    // They are visual only and disappear when their real constraint breaks.
    this.couplings = new THREE.InstancedMesh(
      this._geometry('coupling', () => new THREE.CylinderGeometry(0.09, 0.09, 1, 8)),
      this._material('coupling', '#5b625a', 0.55, 0.4),
      1024,
    );
    this.couplings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.couplings.count = 0;
    this.couplings.frustumCulled = false;
    this.couplings.castShadow = true;
    this.couplings.receiveShadow = true;
    this.scene.add(this.couplings);
    const outline = this._geometry('outline', () => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)));
    this.selectionOutline = new THREE.LineSegments(outline, this._own(new THREE.LineBasicMaterial({ color: '#ffc66e', depthTest: false, transparent: true, opacity: 0.97 })));
    this.hoverOutline = new THREE.LineSegments(outline, this._own(new THREE.LineBasicMaterial({ color: '#fff3d7', depthTest: false, transparent: true, opacity: 0.75 })));
    this.selectionOutline.renderOrder = 12;
    this.hoverOutline.renderOrder = 11;
    this.selectionOutline.visible = this.hoverOutline.visible = false;
    this.scene.add(this.selectionOutline, this.hoverOutline);
    this.secondarySelectionLines = this._makeOutlineLayer('#89d2c5', 11);
    this.reviewOutlineLines = this._makeOutlineLayer('#e6ad67', 9, true);
    this.scene.add(this.secondarySelectionLines, this.reviewOutlineLines);
    const mechanismGeometry = this._own(new THREE.BufferGeometry());
    mechanismGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(14 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    mechanismGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(14 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    mechanismGeometry.setDrawRange(0, 0);
    this.mechanismGuide = new THREE.LineSegments(mechanismGeometry, this._own(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false })));
    this.mechanismGuide.frustumCulled = false;
    this.mechanismGuide.renderOrder = 14;
    this.mechanismGuide.visible = false;
    this.scene.add(this.mechanismGuide);
    this._connectionPositions = new Float32Array(2048 * 6);
    this._connectionColors = new Float32Array(2048 * 6);
    const geometry = this._own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(this._connectionPositions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(this._connectionColors, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    this.connectionLines = new THREE.LineSegments(geometry, this._own(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.72, depthTest: false, depthWrite: false })));
    this.connectionLines.frustumCulled = false;
    this.connectionLines.renderOrder = 10;
    this.connectionLines.visible = false;
    this.scene.add(this.connectionLines);
  }

  _makeOutlineLayer(color, order, dashed = false) {
    const geometry = this._own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(100 * 24 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('lineDistance', new THREE.BufferAttribute(new Float32Array(100 * 24), 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    const options = { color, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false };
    const material = this._own(dashed ? new THREE.LineDashedMaterial({ ...options, dashSize: 0.13, gapSize: 0.075 }) : new THREE.LineBasicMaterial(options));
    const lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;
    lines.renderOrder = order;
    lines.visible = false;
    return lines;
  }

  _writeOutlineLayer(layer, ids, scale = 1) {
    const positions = layer.geometry.getAttribute('position');
    const distances = layer.geometry.getAttribute('lineDistance');
    let count = 0;
    for (const id of ids) {
      const root = this.partRoots.get(id);
      if (!root || !root.visible || (this.mode === 'build' && id === this.excludedPartId) || count + 24 > positions.count) continue;
      const half = this._partBounds(root.userData.partType).multiplyScalar(scale * 0.5);
      for (const pair of OUTLINE_EDGES) {
        for (const [end, vertex] of pair.entries()) {
          _position.set(vertex & 4 ? half.x : -half.x, vertex & 2 ? half.y : -half.y, vertex & 1 ? half.z : -half.z).applyQuaternion(root.quaternion).add(root.position);
          positions.setXYZ(count, _position.x, _position.y, _position.z);
          if (end === 0) distances.setX(count, 0);
          else distances.setX(count, Math.hypot(_position.x - positions.getX(count - 1), _position.y - positions.getY(count - 1), _position.z - positions.getZ(count - 1)));
          count++;
        }
      }
    }
    positions.needsUpdate = distances.needsUpdate = true;
    layer.geometry.setDrawRange(0, count);
    layer.visible = count > 0;
  }

  _updateSelections() {
    this._outlineAt(this.selectionOutline, this.selectedId);
    this._writeOutlineLayer(this.secondarySelectionLines, [...this.selectedIds].filter(id => id !== this.selectedId), 1.035);
    this._writeOutlineLayer(this.reviewOutlineLines, this.mode === 'build' ? this.reviewIds : [], 1.13);
  }

  _unlit(key, color, opacity = 1) {
    const name = `unlit:${key}`;
    if (!this._materials.has(name)) {
      this._materials.set(name, this._own(new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest: false, depthWrite: false })));
    }
    return this._materials.get(name);
  }

  _createAimOverlays() {
    const geometry = this._own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(192 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('lineDistance', new THREE.BufferAttribute(new Float32Array(192), 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    this.aimLine = new THREE.Line(geometry, this._own(new THREE.LineDashedMaterial({ color: '#fff0bb', dashSize: 0.24, gapSize: 0.14, transparent: true, opacity: 0.78, depthWrite: false })));
    this.aimLine.frustumCulled = false;
    this.aimLine.visible = false;
    this.aimLine.renderOrder = 7;
    this.scene.add(this.aimLine);

    this.impactMarker = new THREE.Group();
    const ringGeometry = this._geometry('impact-ring', () => new THREE.RingGeometry(0.21, 0.265, 32));
    this.impactRingMaterial = this._own(new THREE.MeshBasicMaterial({ color: '#f6d489', transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }));
    const ring = new THREE.Mesh(ringGeometry, this.impactRingMaterial);
    ring.renderOrder = 14;
    this.impactMarker.add(ring);
    const ticks = this._own(new THREE.BufferGeometry());
    ticks.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.42, 0, 0, -0.30, 0, 0, 0.30, 0, 0, 0.42, 0, 0,
      0, -0.42, 0, 0, -0.30, 0, 0, 0.30, 0, 0, 0.42, 0,
    ], 3));
    this.impactTicks = new THREE.LineSegments(ticks, this._own(new THREE.LineBasicMaterial({ color: '#f6d489', transparent: true, opacity: 0.9, depthTest: false, depthWrite: false })));
    this.impactTicks.renderOrder = 14;
    this.impactMarker.add(this.impactTicks);
    this.impactMarker.visible = false;
    this.scene.add(this.impactMarker);

    this.reloadMarker = new THREE.Group();
    const background = new THREE.Mesh(this._geometry('reload-bg', () => new THREE.RingGeometry(0.16, 0.21, 40)), this._unlit('reload-bg', '#394640', 0.68));
    this.reloadArcGeometry = this._own(new THREE.RingGeometry(0.16, 0.21, 40));
    this.reloadArcMaterial = this._own(new THREE.MeshBasicMaterial({ color: '#f7cf85', transparent: true, opacity: 0.96, depthTest: false, depthWrite: false }));
    const arc = new THREE.Mesh(this.reloadArcGeometry, this.reloadArcMaterial);
    background.renderOrder = 17;
    arc.renderOrder = 18;
    arc.position.z = 0.006;
    this.reloadMarker.add(background, arc);
    this.reloadMarker.visible = false;
    this.scene.add(this.reloadMarker);
  }

  _createDiagnostics() {
    this.diagnosticGroup = new THREE.Group();
    this.scene.add(this.diagnosticGroup);
    this.massMarker = new THREE.Group();
    const center = new THREE.Mesh(this._geometry('com-sphere', () => new THREE.SphereGeometry(0.075, 8, 6)), this._unlit('com', '#e5a755'));
    this.massMarker.add(center);
    const axes = this._own(new THREE.BufferGeometry());
    axes.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.24, 0, 0, 0.24, 0, 0, 0, -0.24, 0, 0, 0.24, 0, 0, 0, -0.24, 0, 0, 0.24,
    ], 3));
    this.massMarker.add(new THREE.LineSegments(axes, this._own(new THREE.LineBasicMaterial({ color: '#e6ae5b', depthTest: false, transparent: true, opacity: 0.95 }))));
    this.massMarker.visible = false;
    this.diagnosticGroup.add(this.massMarker);
    const geometry = this._own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(100 * 24 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    this.disconnectedLines = new THREE.LineSegments(geometry, this._own(new THREE.LineBasicMaterial({ color: '#e6a15c', transparent: true, opacity: 0.72, depthTest: false, depthWrite: false })));
    this.disconnectedLines.frustumCulled = false;
    this.disconnectedLines.renderOrder = 10;
    this.diagnosticGroup.add(this.disconnectedLines);
  }

  _makeWorldLabel(text, detail = '') {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const texture = this._own(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.userData.transient = true;
    const material = this._own(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    material.userData.transient = true;
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.7, 0.85, 1);
    sprite.renderOrder = 15;
    sprite.userData.label = { canvas, context, texture, text: '', detail: '' };
    this._writeWorldLabel(sprite, text, detail);
    return sprite;
  }

  _writeWorldLabel(sprite, text, detail = '') {
    const label = sprite?.userData.label;
    if (!label || (label.text === text && label.detail === detail)) return;
    label.text = text;
    label.detail = detail;
    const { context, texture } = label;
    context.clearRect(0, 0, 256, 128);
    context.fillStyle = 'rgba(246,248,234,0.9)';
    context.strokeStyle = 'rgba(96,120,102,0.24)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(29, 8);
    context.lineTo(227, 8);
    context.quadraticCurveTo(244, 8, 244, 25);
    context.lineTo(244, 103);
    context.quadraticCurveTo(244, 120, 227, 120);
    context.lineTo(29, 120);
    context.quadraticCurveTo(12, 120, 12, 103);
    context.lineTo(12, 25);
    context.quadraticCurveTo(12, 8, 29, 8);
    context.fill();
    context.stroke();
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `600 ${text.length > 4 ? 34 : 46}px ui-monospace, monospace`;
    context.fillStyle = '#3b6258';
    context.fillText(text, 128, detail ? 52 : 66);
    if (detail) {
      context.font = '500 20px sans-serif';
      context.fillStyle = '#82968a';
      context.fillText(detail, 128, 94);
    }
    texture.needsUpdate = true;
  }

  _createAltitudeGuide() {
    this.altitudeGroup = new THREE.Group();
    this.altitudeGroup.visible = false;
    this.scene.add(this.altitudeGroup);
    const geometry = this._own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('lineDistance', new THREE.BufferAttribute(new Float32Array(2), 1).setUsage(THREE.DynamicDrawUsage));
    const material = this._own(new THREE.LineDashedMaterial({ color: '#b3d1c5', dashSize: 0.22, gapSize: 0.17, transparent: true, opacity: 0.48, depthTest: false, depthWrite: false }));
    this.altitudeGuideLine = new THREE.Line(geometry, material);
    this.altitudeGuideLine.frustumCulled = false;
    this.altitudeGuideLine.renderOrder = 7;
    this.altitudeFoot = new THREE.Mesh(this._geometry('altitude-foot', () => new THREE.RingGeometry(0.2, 0.28, 32)), this._unlit('altitude-foot', '#b5d3c3', 0.55));
    this.altitudeFoot.rotation.x = -QUARTER;
    this.altitudeFoot.renderOrder = 8;
    this.altitudeLabel = this._makeWorldLabel('0.0 m', 'ALTITUDE');
    if (this.altitudeLabel) { this.altitudeLabel.scale.set(1.25, 0.625, 1); this.altitudeGroup.add(this.altitudeLabel); }
    this.altitudeGroup.add(this.altitudeGuideLine, this.altitudeFoot);
  }

  _makeHealthIndicator(width = 0.85) {
    const group = new THREE.Group();
    const geometry = this._geometry('hud-plane', () => new THREE.PlaneGeometry(1, 1));
    const background = new THREE.Mesh(geometry, this._unlit('hp-background', '#25332e', 0.8));
    background.scale.set(width + 0.055, 0.105, 1);
    background.renderOrder = 20;
    const material = this._own(new THREE.MeshBasicMaterial({ color: '#a1cfac', depthTest: false, depthWrite: false, transparent: true, opacity: 0.98 }));
    material.userData.transient = true;
    const fill = new THREE.Mesh(geometry, material);
    fill.scale.set(width, 0.049, 1);
    fill.position.z = 0.004;
    fill.renderOrder = 21;
    const iconGeometry = this._geometry('status-x', () => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.065, -0.065, 0, 0.065, 0.065, 0, -0.065, 0.065, 0, 0.065, -0.065, 0], 3));
      return geo;
    });
    const iconMaterial = this._own(new THREE.LineBasicMaterial({ color: '#e88a66', transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }));
    iconMaterial.userData.transient = true;
    const icon = new THREE.LineSegments(iconGeometry, iconMaterial);
    icon.position.x = width / 2 + 0.14;
    icon.visible = false;
    icon.renderOrder = 22;
    const connectedDot = new THREE.Mesh(this._geometry('status-dot', () => new THREE.CircleGeometry(0.036, 12)), this._unlit('connected-dot', '#abd8b5'));
    connectedDot.position.set(width / 2 + 0.14, 0, 0.008);
    connectedDot.renderOrder = 22;
    connectedDot.visible = false;
    const loadTrack = new THREE.Mesh(geometry, this._unlit('load-track', '#394c42', 0.8));
    loadTrack.scale.set(width, 0.022, 1);
    loadTrack.position.set(0, -0.088, 0.002);
    loadTrack.renderOrder = 20;
    const loadMaterial = this._own(new THREE.MeshBasicMaterial({ color: '#9dc7aa', transparent: true, opacity: 0.98, depthTest: false, depthWrite: false }));
    loadMaterial.userData.transient = true;
    const loadFill = new THREE.Mesh(geometry, loadMaterial);
    loadFill.scale.set(0.001, 0.018, 1);
    loadFill.position.set(-width / 2, -0.088, 0.006);
    loadFill.renderOrder = 21;
    loadTrack.visible = loadFill.visible = false;
    group.add(background, fill, icon, connectedDot, loadTrack, loadFill);
    group.userData = { width, background, fill, icon, connectedDot, loadTrack, loadFill };
    group.visible = false;
    this.indicatorGroup.add(group);
    return group;
  }

  _updateHealthIndicator(indicator, position, ratio, state = 'healthy', inspection = null) {
    const { fill, width, icon, connectedDot, loadTrack, loadFill } = indicator.userData;
    const fraction = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 1));
    indicator.position.copy(position);
    indicator.quaternion.copy(this.camera.quaternion);
    indicator.visible = this.mode === 'play';
    fill.scale.x = Math.max(0.001, width * fraction);
    fill.position.x = -width * (1 - fraction) / 2;
    fill.material.color.set(state === 'dead' ? '#b76453' : state === 'disconnected' ? '#e9b466' : fraction < 0.3 ? '#ed8d6c' : fraction < 0.65 ? '#e7bf79' : '#a9cfb0');
    icon.visible = state === 'dead' || state === 'disconnected';
    icon.rotation.z = state === 'disconnected' ? Math.PI / 4 : 0;
    icon.material.color.set(state === 'dead' ? '#ea8a6b' : '#f0c279');
    connectedDot.visible = !!inspection && state === 'healthy';
    loadTrack.visible = loadFill.visible = !!inspection && Number.isFinite(inspection.metric);
    if (loadFill.visible) {
      const load = THREE.MathUtils.clamp(inspection.metric, 0, 1);
      loadFill.scale.x = Math.max(0.001, width * load);
      loadFill.position.x = -width * (1 - load) / 2;
      loadFill.material.color.set(load < 0.55 ? '#a4ceb0' : load < 0.85 ? '#efc57e' : '#e48763');
    }
  }

  setAimVisible(visible) {
    this.aimVisible = !!visible;
    if (!visible) { this.aimLine.visible = false; this.impactMarker.visible = false; }
  }

  setStressVisible(visible) {
    this.stressVisible = !!visible;
    this.connectionLines.visible = this.connectionsVisible || this.stressVisible;
    this._updateConnections();
  }

  setStressMode(mode) {
    this.stressMode = mode === 'damage' ? 'damage' : 'load';
    this._updateConnections();
  }

  setReviewHighlights(ids = []) {
    this.reviewIds = new Set([...ids].filter(id => typeof id === 'string'));
    this._updateSelections();
  }

  setQuality(quality) {
    this.quality = quality === 'low' ? 'low' : 'high';
    const high = this.quality === 'high';
    this.renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio || 1, 2) : 1);
    this.renderer.shadowMap.enabled = high;
    this.sun.castShadow = high;
    this.renderer.shadowMap.needsUpdate = true;
    this.grassMesh.visible = high;
    if (this.waterRipples) this.waterRipples.visible = high;
    if (this.routeClouds) this.routeClouds.visible = high;
    this.resize();
  }

  setDiagnostics({ centerOfMass = null, disconnectedIds = [] } = {}) {
    const validCenter = centerOfMass && [centerOfMass.x, centerOfMass.y, centerOfMass.z].every(Number.isFinite);
    this.diagnostics = {
      centerOfMass: validCenter ? new THREE.Vector3(centerOfMass.x, centerOfMass.y, centerOfMass.z) : null,
      disconnectedIds: new Set(disconnectedIds || []),
    };
    this._updateDiagnostics();
  }

  _updateDiagnostics() {
    this.diagnosticGroup.visible = this.mode === 'build';
    const center = this.diagnostics.centerOfMass;
    this.massMarker.visible = !!center;
    if (center) this.massMarker.position.copy(center);
    const attribute = this.disconnectedLines.geometry.getAttribute('position');
    const edges = [[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]];
    let count = 0;
    for (const id of this.diagnostics.disconnectedIds) {
      const root = this.partRoots.get(id);
      if (!root || id === this.excludedPartId) continue;
      const size = this._partBounds(root.userData.partType).multiplyScalar(0.5);
      const vertices = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) vertices.push(new THREE.Vector3(x * size.x, y * size.y, z * size.z).applyQuaternion(root.quaternion).add(root.position));
      for (const pair of edges) for (const vertexIndex of pair) {
        if (count >= attribute.count) break;
        const p = vertices[vertexIndex];
        attribute.setXYZ(count++, p.x, p.y, p.z);
      }
    }
    attribute.needsUpdate = true;
    this.disconnectedLines.geometry.setDrawRange(0, count);
  }

  _makePart(type, id = 'ghost') {
    const group = new THREE.Group();
    group.userData.partId = id;
    group.userData.partType = type;
    const wood = this._material('wood', '#b67e48');
    const woodLight = this._material('wood-light', '#d09b61');
    const woodDark = this._material('wood-dark', '#805b3b');
    const iron = this._material('iron', '#333c3e', 0.52, 0.5);
    const ironLight = this._material('iron-light', '#616c69', 0.43, 0.45);
    const brass = this._material('brass', '#d2ad68', 0.4, 0.5);
    const rubber = this._material('rubber', '#303735', 0.96, 0.04);
    const boxGeo = this._geometry('box', () => new THREE.BoxGeometry(1, 1, 1));
    const boltGeo = this._geometry('bolt', () => new THREE.SphereGeometry(0.045, 6, 4));

    if (type === 'piston') {
      // This root is the real moving head. The lower housing and shaft are
      // repositioned from the support/head frames by _updatePistons().
      group.add(this._box(0.65, 0.30, 0.65, iron, 0, -0.02, 0));
      group.add(this._box(0.73, 0.06, 0.73, wood, 0, 0.17, 0));
      group.add(this._box(0.68, 0.04, 0.68, ironLight, 0, -0.18, 0));
      const bolts = [];
      for (const x of [-0.25, 0.25]) for (const z of [-0.25, 0.25]) bolts.push({ p: [x, 0.214, z], s: [0.8, 0.45, 0.8] });
      group.add(this._instances(boltGeo, brass, bolts));
      const base = new THREE.Group();
      base.position.y = -0.35;
      base.add(this._cylinder(0.29, 0.29, 0.28, iron, 16));
      base.add(this._box(0.75, 0.06, 0.75, woodDark, 0, -0.12, 0));
      const collar = this._torus(0.27, 0.035, brass);
      collar.rotation.x = QUARTER;
      collar.position.y = 0.13;
      base.add(collar);
      const shaft = this._cylinder(0.105, 0.105, 1, this._material('piston-shaft', '#b3bdb0', 0.28, 0.75), 12);
      shaft.position.y = -0.37;
      shaft.scale.y = 0.34;
      group.add(base, shaft);
      group.userData.pistonBase = base;
      group.userData.pistonRod = shaft;
    } else if (type === 'float') {
      const shell = this._material('float-shell', '#6f9691', 0.67, 0.08);
      const floatGeo = this._geometry('float-shell', () => new THREE.CapsuleGeometry(0.34, 0.24, 4, 12));
      const pontoon = new THREE.Mesh(floatGeo, shell);
      pontoon.rotation.x = QUARTER;
      pontoon.position.y = -0.06;
      pontoon.castShadow = pontoon.receiveShadow = true;
      group.add(pontoon);
      group.add(this._box(0.72, 0.1, 0.72, wood, 0, 0.33, 0));
      group.add(this._box(0.34, 0.08, 0.34, iron, 0, 0.42, 0));
      for (const z of [-0.26, 0.26]) {
        const band = this._torus(0.343, 0.025, ironLight);
        band.position.set(0, -0.06, z);
        group.add(band);
        group.add(this._box(0.76, 0.045, 0.075, brass, 0, 0.39, z));
      }
      const seam = this._box(0.018, 0.015, 0.8, this._material('float-highlight', '#a8beb1'), 0, 0.285, 0);
      group.add(seam);
    } else if (type === 'propeller') {
      const housing = this._material('engine-housing', '#556762', 0.52, 0.35);
      group.add(this._box(0.55, 0.55, 0.66, housing, 0, 0, 0.065));
      group.add(this._box(0.78, 0.78, 0.065, woodDark, 0, 0, 0.42));
      const vents = [];
      for (const y of [-0.15, 0, 0.15]) vents.push({ p: [0, y, 0.457], s: [0.38, 0.035, 0.018] });
      group.add(this._instances(boxGeo, iron, vents));
      const guard = this._torus(0.45, 0.024, ironLight);
      guard.position.z = -0.38;
      group.add(guard);
      const stays = [];
      for (const angle of [0, QUARTER]) stays.push({ p: [0, 0, -0.32], s: [0.025, 0.89, 0.026], r: [0, 0, angle] });
      group.add(this._instances(boxGeo, iron, stays));
      const rotor = new THREE.Group();
      rotor.position.z = -0.42;
      const blades = [], tips = [];
      for (let i = 0; i < 3; i++) {
        const angle = i * TAU / 3;
        blades.push({ p: [-Math.sin(angle) * 0.22, Math.cos(angle) * 0.22, 0], s: [0.105, 0.42, 0.033], r: [0, 0, angle] });
        tips.push({ p: [-Math.sin(angle) * 0.39, Math.cos(angle) * 0.39, -0.003], s: [0.108, 0.055, 0.039], r: [0, 0, angle] });
      }
      rotor.add(this._instances(boxGeo, woodLight, blades), this._instances(boxGeo, brass, tips));
      const hub = this._cylinder(0.105, 0.105, 0.09, ironLight, 12);
      hub.rotation.x = QUARTER;
      rotor.add(hub);
      group.add(rotor);
      group.userData.rotor = rotor;
      group.userData.rotorSpeed = 0;
    } else if (type === 'wing') {
      const fabric = this._material('wing-fabric', '#d8ccaa', 0.97, 0);
      const rib = this._material('wing-rib', '#ae976f', 0.83, 0.1);
      const wingRig = new THREE.Group();
      group.add(wingRig);
      group.userData.wingRig = wingRig;
      const aerofoil = this._geometry('wing-aerofoil', () => {
        // Chord Z, span X, thickness Y; its entire authored span is one cell.
        const profile = [[-0.43, -0.015], [-0.34, 0.055], [-0.12, 0.075], [0.27, 0.025], [0.43, -0.02], [0.12, -0.065], [-0.30, -0.055]];
        const shape = new THREE.Shape();
        profile.forEach(([z, y], i) => i ? shape.lineTo(-z, y) : shape.moveTo(-z, y));
        shape.closePath();
        const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.96, steps: 1, bevelEnabled: false });
        geometry.translate(0, 0, -0.48);
        geometry.rotateY(QUARTER);
        return geometry;
      });
      const panel = new THREE.Mesh(aerofoil, fabric);
      panel.castShadow = panel.receiveShadow = true;
      wingRig.add(panel);
      const ribs = [];
      for (const x of [-0.35, 0, 0.35]) ribs.push({ p: [x, 0.074, -0.04], s: [0.022, 0.012, 0.67] });
      wingRig.add(this._instances(boxGeo, rib, ribs));
      wingRig.add(this._box(0.97, 0.035, 0.065, wood, 0, 0.018, -0.37));
      wingRig.add(this._box(0.94, 0.027, 0.055, woodDark, 0, -0.016, 0.37));
      wingRig.add(this._box(0.20, 0.15, 0.22, iron, 0, 0, 0));
      wingRig.add(this._box(0.11, 0.017, 0.11, brass, 0, 0.084, 0));
    } else if (type === 'wheel') {
      const tire = this._cylinder(0.64, 0.64, 0.29, rubber, 24);
      tire.rotation.z = QUARTER;
      group.add(tire);
      const treads = [];
      for (let i = 0; i < 18; i++) {
        const a = i / 18 * TAU;
        treads.push({ p: [0, Math.cos(a) * 0.62, Math.sin(a) * 0.62], s: [0.34, 0.08, 0.14], r: [a, 0, 0] });
      }
      group.add(this._instances(boxGeo, iron, treads));
      for (const side of [-1, 1]) {
        const rim = this._torus(0.44, 0.055, ironLight);
        rim.rotation.y = QUARTER;
        rim.position.x = side * 0.18;
        group.add(rim);
      }
      const spokes = [];
      for (const side of [-1, 1]) for (let i = 0; i < 3; i++) spokes.push({ p: [side * 0.172, 0, 0], s: [0.045, 0.82, 0.08], r: [i * Math.PI / 3, 0, 0] });
      group.add(this._instances(boxGeo, woodLight, spokes));
      const hub = this._cylinder(0.145, 0.145, 0.42, brass, 10);
      hub.rotation.z = QUARTER;
      group.add(hub);
    } else if (type === 'cannon') {
      group.add(this._box(0.88, 0.37, 0.84, wood, 0, -0.25, 0));
      const cheeks = [{ p: [-0.32, -0.03, 0.08], s: [0.13, 0.5, 0.65] }, { p: [0.32, -0.03, 0.08], s: [0.13, 0.5, 0.65] }];
      group.add(this._instances(boxGeo, woodDark, cheeks));
      const barrelRig = new THREE.Group();
      group.userData.barrelRig = barrelRig;
      group.add(barrelRig);
      const barrel = this._cylinder(0.27, 0.215, 1.38, iron, 20);
      barrel.rotation.x = QUARTER;
      barrel.position.set(0, 0, -0.42);
      barrelRig.add(barrel);
      for (const z of [-1.09, -0.37, 0.23]) {
        const ring = this._torus(z === -1.09 ? 0.216 : 0.26, 0.033, ironLight);
        ring.position.set(0, 0, z);
        barrelRig.add(ring);
      }
      const mouth = new THREE.Mesh(this._geometry('muzzle', () => new THREE.CircleGeometry(0.18, 20)), this._material('cannon-hole', '#101918', 1));
      mouth.position.set(0, 0, -1.117);
      mouth.rotation.y = Math.PI;
      barrelRig.add(mouth);
      const axle = this._cylinder(0.075, 0.075, 0.87, brass, 8);
      axle.rotation.z = QUARTER;
      axle.position.y = 0;
      group.add(axle);
    } else if (type === 'hinge') {
      group.add(this._box(0.89, 0.22, 0.89, woodDark, 0, -0.33, 0));
      const base = this._cylinder(0.4, 0.4, 0.22, iron, 16);
      base.position.y = -0.12;
      group.add(base);
      const pivot = this._cylinder(0.25, 0.25, 0.5, brass, 12);
      pivot.position.y = 0.11;
      group.add(pivot);
      const rim = this._torus(0.34, 0.055, ironLight);
      rim.rotation.x = QUARTER;
      rim.position.y = 0.31;
      group.add(rim);
      group.add(this._box(0.74, 0.13, 0.74, iron, 0, 0.39, 0));
      const marks = [{ p: [0, 0.463, -0.23], s: [0.07, 0.015, 0.2] }, { p: [0.23, 0.463, 0], s: [0.2, 0.015, 0.07] }];
      group.add(this._instances(boxGeo, brass, marks));
    } else {
      const shade = hash(id) % 3;
      const blockWood = shade === 0 ? woodLight : wood;
      group.add(this._box(0.9, 0.9, 0.9, blockWood));
      const seams = [];
      for (const y of [-0.15, 0.15]) {
        seams.push({ p: [0, y, -0.454], s: [0.89, 0.018, 0.008] });
        seams.push({ p: [0, y, 0.454], s: [0.89, 0.018, 0.008] });
      }
      seams.push({ p: [-0.15, 0.454, 0], s: [0.016, 0.008, 0.89] }, { p: [0.15, 0.454, 0], s: [0.016, 0.008, 0.89] });
      group.add(this._instances(boxGeo, woodDark, seams));
      const bolts = [];
      for (const x of [-0.32, 0.32]) for (const z of [-0.32, 0.32]) bolts.push({ p: [x, 0.46, z], s: [1, 0.6, 1] });
      group.add(this._instances(boltGeo, ironLight, bolts));
      if (type === 'brace') {
        const straps = [];
        for (const z of [-0.466, 0.466]) for (const angle of [-Math.PI / 4, Math.PI / 4]) straps.push({ p: [0, 0, z], s: [0.105, 1.12, 0.035], r: [0, 0, angle] });
        straps.push({ p: [0, 0.465, 0], s: [0.105, 0.035, 1.13], r: [0, Math.PI / 4, 0] }, { p: [0, 0.465, 0], s: [0.105, 0.035, 1.13], r: [0, -Math.PI / 4, 0] });
        group.add(this._instances(boxGeo, ironLight, straps));
      } else if (type === 'core') {
        const bands = [];
        for (const x of [-0.33, 0.33]) bands.push({ p: [x, 0, 0], s: [0.11, 0.95, 0.95] });
        group.add(this._instances(boxGeo, iron, bands));
        const inset = this._box(0.43, 0.028, 0.43, brass, 0, 0.482, 0);
        inset.rotation.y = Math.PI / 4;
        group.add(inset);
        const emblem = this._box(0.17, 0.035, 0.17, iron, 0, 0.504, 0);
        emblem.rotation.y = Math.PI / 4;
        group.add(emblem);
      }
    }
    return group;
  }

  _makePickProxy(part, root) {
    const material = this._materials.get('pick') || (() => {
      const mat = this._own(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, colorWrite: false, depthWrite: false }));
      mat.visible = false;
      this._materials.set('pick', mat);
      return mat;
    })();
    let proxy;
    if (part.type === 'wheel') {
      proxy = new THREE.Mesh(this._geometry('wheel-pick', () => new THREE.CylinderGeometry(0.66, 0.66, 0.38, 16)), material);
      proxy.rotation.z = QUARTER;
    } else if (part.type === 'piston') proxy = this._box(0.76, 0.46, 0.76, material);
    else proxy = this._box(0.94, 0.94, 0.94, material);
    proxy.castShadow = proxy.receiveShadow = false;
    proxy.userData.partId = part.id;
    root.add(proxy);
    this.pickables.push(proxy);
    if (root.userData.pistonBase) {
      const baseProxy = this._box(0.78, 0.33, 0.78, material);
      baseProxy.castShadow = baseProxy.receiveShadow = false;
      baseProxy.userData.partId = part.id;
      baseProxy.userData.pistonBaseProxy = true;
      root.userData.pistonBase.add(baseProxy);
      root.userData.pistonBaseProxy = baseProxy;
      this.pickables.push(baseProxy);
    }
  }

  setDesign(parts) {
    const firstDesign = !this.parts.length;
    this.parts = parts.map(part => ({ ...part }));
    const xs = this.parts.map(part => part.x), zs = this.parts.map(part => part.z);
    this._designSpan = this.parts.length ? Math.max(Math.max(...xs) - Math.min(...xs) + 1, Math.max(...zs) - Math.min(...zs) + 1) : 5;
    this.partData = new Map(this.parts.map(part => [part.id, part]));
    this.occupied = new Map(this.parts.map(part => [cellKey(part), part.id]));
    for (const child of [...this.designGroup.children]) this._disposeTransient(child);
    this.designGroup.clear();
    this.partRoots.clear();
    this.pickables.length = 0;
    for (const part of this.parts) {
      const root = this._makePart(part.type, part.id);
      root.position.set(part.x, part.y + Y_OFFSET, part.z);
      root.rotation.y = (part.rot || 0) * QUARTER;
      this._setPartElevation(root, authoredElevation(part));
      root.visible = part.id !== this.excludedPartId || this.mode !== 'build';
      this._makePickProxy(part, root);
      this.designGroup.add(root);
      this.partRoots.set(part.id, root);
    }
    this._designConnections = getConnections(this.parts) || [];
    this.designGroup.updateMatrixWorld(true);
    this.setSelections(this.selectedIds, this.selectedId);
    this._hoverKey = '';
    this._updateHover();
    this._updateConnections();
    this._updateCouplings();
    this._updatePistons();
    this._updateDiagnostics();
    if (firstDesign && this.parts.length) this.focus();
  }

  _makeGhost(type, secondary = false) {
    const ghost = this._makePart(type, secondary ? 'mirror-ghost' : 'ghost');
    const material = this._own(new THREE.MeshStandardMaterial({ color: '#efd19b', transparent: true, opacity: secondary ? 0.32 : 0.42, roughness: 0.65, depthWrite: false }));
    const outlineMaterial = this._own(new THREE.LineBasicMaterial({ color: '#f5d393', transparent: true, opacity: 0.9, depthTest: false }));
    ghost.traverse(object => {
      if (object.isMesh) { object.material = material; object.castShadow = false; object.receiveShadow = false; object.renderOrder = 6; }
    });
    const outline = new THREE.LineSegments(this._geometry('outline', () => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1))), outlineMaterial);
    outline.scale.copy(this._partBounds(type));
    outline.renderOrder = 8;
    ghost.add(outline);
    ghost.userData.ghostMaterial = material;
    ghost.userData.outlineMaterial = outlineMaterial;
    ghost.userData.secondary = secondary;
    ghost.visible = false;
    this.scene.add(ghost);
    return ghost;
  }

  _discardGhost(ghost) {
    if (!ghost) return;
    this._releaseInstances(ghost);
    for (const material of [ghost.userData.ghostMaterial, ghost.userData.outlineMaterial]) {
      material?.dispose();
      this._resources.delete(material);
    }
    ghost.removeFromParent();
  }

  setTool(type) {
    if (this.tool !== (type || null)) this.ghostElevation = PARTS[type]?.defaultElevation ?? 0;
    this.tool = type || null;
    this._discardGhost(this.ghost);
    this._discardGhost(this.mirrorGhost);
    this.ghost = this.tool ? this._makeGhost(this.tool) : null;
    this.mirrorGhost = this.tool && this.mirror ? this._makeGhost(this.tool, true) : null;
    this.renderer.domElement.style.cursor = this.tool ? 'crosshair' : 'default';
    this._hoverKey = '';
    this.setElevation(this.ghostElevation);
    this._updateHover();
  }

  setRotation(rotation) {
    this.rotation = ((rotation || 0) % 4 + 4) % 4;
    if (this.ghost) this.ghost.rotation.y = this.rotation * QUARTER;
    if (this.mirrorGhost) this.mirrorGhost.rotation.y = ((4 - this.rotation) % 4) * QUARTER;
  }

  setElevation(elevation = 0) {
    this.ghostElevation = THREE.MathUtils.clamp(Number.isFinite(elevation) ? elevation : 0, -10, 45);
    const source = this.partData.get(this.excludedPartId);
    const angle = source ? authoredElevation(source) : this.ghostElevation;
    for (const ghost of [this.ghost, this.mirrorGhost]) if (ghost) this._setPartElevation(ghost, angle);
  }

  _setPartElevation(root, elevation) {
    const rig = root.userData.barrelRig || root.userData.wingRig;
    if (rig) rig.rotation.x = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(elevation, -10, 45));
  }

  setMirror(enabled) {
    this.mirror = !!enabled;
    this.setTool(this.tool);
  }

  setExcludedPart(id = null) {
    const old = this.partRoots.get(this.excludedPartId);
    if (old && this.mode === 'build') old.visible = true;
    this.excludedPartId = this.partData.has(id) ? id : null;
    const root = this.partRoots.get(this.excludedPartId);
    if (root && this.mode === 'build') root.visible = false;
    this._updateSelections();
    this.setElevation(this.ghostElevation);
    this._updateConnections();
    this._updateCouplings();
    this._updateDiagnostics();
    this._hoverKey = '';
    this._updateHover();
  }

  _partBounds(type) {
    return type === 'wheel' ? new THREE.Vector3(0.46, 1.4, 1.4) : type === 'cannon' ? new THREE.Vector3(1.02, 1.02, 1.02) : new THREE.Vector3(1.02, 1.02, 1.02);
  }

  _outlineAt(outline, id) {
    const part = this.partData.get(id), root = this.partRoots.get(id);
    if (!part || !root || !root.visible || (this.mode === 'build' && id === this.excludedPartId)) { outline.visible = false; return; }
    outline.visible = true;
    outline.position.copy(root.position);
    outline.quaternion.copy(root.quaternion);
    outline.scale.copy(this._partBounds(part.type));
  }

  _applyPartState(root, state) {
    // All ordinary part materials are cached. Damage gets per-part clones so a
    // damaged wheel never recolours every other wheel in the machine.
    if (!state) {
      root.traverse(object => {
        if (object.userData.cleanMaterial) {
          object.material = object.userData.cleanMaterial;
          delete object.userData.cleanMaterial;
        }
      });
      for (const material of root.userData.damageMaterials?.values() || []) {
        material.dispose();
        this._resources.delete(material);
      }
      delete root.userData.damageMaterials;
      delete root.userData.damageKey;
      root.userData.hitFlash = 0;
      return;
    }
    const ratio = THREE.MathUtils.clamp(state.hp / (state.maxHp || 1), 0, 1);
    const flashing = (root.userData.hitFlash || 0) > 0;
    const key = `${Math.round(ratio * 30)}:${!!state.dead}:${state.connected !== false}:${flashing}`;
    if (root.userData.damageKey === key) return;
    root.userData.damageKey = key;
    if (ratio > 0.999 && !state.dead && state.connected !== false && !flashing && !root.userData.damageMaterials) return;
    if (!root.userData.damageMaterials) {
      const materials = root.userData.damageMaterials = new Map();
      root.traverse(object => {
        if (!object.isMesh || !object.material?.isMeshStandardMaterial) return;
        const source = object.material;
        if (!materials.has(source)) {
          const clone = this._own(source.clone());
          clone.userData.transient = true;
          materials.set(source, clone);
        }
        object.userData.cleanMaterial = source;
        object.material = materials.get(source);
      });
    }
    const charred = new THREE.Color('#393a34');
    const detached = new THREE.Color('#9b8e6a');
    for (const [source, material] of root.userData.damageMaterials) {
      material.color.copy(source.color);
      material.roughness = source.roughness;
      material.emissive.copy(source.emissive);
      if (state.dead) {
        material.color.lerp(charred, 0.78);
        material.roughness = 1;
      } else {
        material.color.lerp(charred, (1 - ratio) * 0.48);
        if (state.connected === false) material.color.lerp(detached, 0.48);
      }
      if (flashing) material.emissive.set('#7a2e13');
    }
  }

  setSelection(partId) {
    this.setSelections(partId ? [partId] : [], partId);
  }

  setSelections(ids = [], primaryId = null) {
    this.selectedIds = new Set([...ids].filter(id => this.partData.has(id)));
    this.selectedId = this.selectedIds.has(primaryId) ? primaryId : this.selectedIds.values().next().value || null;
    this._updateSelections();
    this._updatePistons();
  }

  setMode(mode) {
    this.mode = mode === 'play' ? 'play' : 'build';
    this.grid.visible = this.mode === 'build';
    this.padCorners.visible = this.mode === 'build';
    this._hover = null;
    this._hoverKey = '';
    this._pointerStart = null;
    if (this.ghost) this.ghost.visible = false;
    if (this.mirrorGhost) this.mirrorGhost.visible = false;
    this.hoverOutline.visible = false;
    if (this.mode === 'build') {
      for (const part of this.parts) {
        const root = this.partRoots.get(part.id);
        if (root) {
          root.position.set(part.x, part.y + Y_OFFSET, part.z);
          root.rotation.set(0, (part.rot || 0) * QUARTER, 0);
          root.visible = part.id !== this.excludedPartId;
          this._setPartElevation(root, authoredElevation(part));
          if (root.userData.rotor) { root.userData.rotor.rotation.z = 0; root.userData.rotorSpeed = 0; }
          this._applyPartState(root, null);
        }
      }
      this.designGroup.updateMatrixWorld(true);
      this.sun.position.set(-13, 25, 13);
      this.sun.target.position.set(0, 0, -7);
    }
    this.indicatorGroup.visible = this.mode === 'play';
    this.diagnosticGroup.visible = this.mode === 'build';
    this._flightChaseEnabled = true;
    this._updatePistons();
    this._updateSelections();
    this._updateRoute();
    if (this.mode !== 'play') { this.aimLine.visible = false; this.impactMarker.visible = false; this.reloadMarker.visible = false; }
    this.renderer.domElement.style.cursor = this.mode === 'play' ? 'grab' : this.tool ? 'crosshair' : 'default';
  }

  setSimulation(simulation) {
    this.simulation = simulation;
    this._clearRuntime();
    this.previewGroup.visible = !simulation;
    if (simulation) this._syncSimulation();
    this._updateConnections();
  }

  setConnectionsVisible(visible) {
    this.connectionsVisible = !!visible;
    this.connectionLines.visible = this.connectionsVisible || this.stressVisible;
    this._updateConnections();
  }

  _makeTarget(target, index = 0, obstacle = false) {
    const group = new THREE.Group();
    const size = target.size || { x: 1, y: 1, z: 1 };
    if (obstacle && target.kind === 'bank') {
      // The visible inside face and top agree with the real channel collider.
      const bank = this._box(size.x, size.y, size.z, this._material('bank-soil', '#9da58c'));
      const cap = this._box(size.x, 0.08, size.z, this._material('bank-grass', '#8fa98a'), 0, size.y / 2 - 0.04, 0);
      group.add(bank, cap);
      const tufts = [];
      for (let i = 0; i < 15; i++) tufts.push({ p: [Math.sin(i * 2.4) * size.x * 0.34, size.y / 2 + 0.11, -size.z * 0.45 + i * size.z * 0.064], s: [0.16, 0.32 + (i % 3) * 0.06, 0.16], r: [0, i, 0] });
      const grass = this._instances(this._geometry('bank-tuft', () => new THREE.ConeGeometry(1, 1, 4)), this._material('bank-tuft', '#6e8c6e'), tufts);
      grass.castShadow = false;
      group.add(grass);
      return group;
    }
    const color = obstacle ? '#8a9487' : ['#b7b4a0', '#c7c0ab', '#aaa995', '#c2bea9'][index % 4];
    const material = this._own(new THREE.MeshStandardMaterial({ color, roughness: 0.96 }));
    material.userData.transient = true;
    group.add(this._box(size.x * 0.965, size.y * 0.967, size.z * 0.965, material));
    group.userData.baseColor = new THREE.Color(color);
    group.userData.stoneMaterial = material;
    group.userData.targetId = target.id;
    if (!obstacle) {
      const detail = this._material('stone-trim', '#d0c9b4');
      const lip = this._box(size.x * 0.99, Math.min(0.085, size.y * 0.12), size.z * 0.99, detail, 0, size.y * 0.40, 0);
      group.add(lip);
      const cracks = this._own(new THREE.BufferGeometry());
      const z = size.z * 0.49;
      cracks.setAttribute('position', new THREE.Float32BufferAttribute([
        -size.x * 0.12, size.y * 0.42, z, size.x * 0.02, size.y * 0.08, z,
        size.x * 0.02, size.y * 0.08, z, -size.x * 0.15, -size.y * 0.28, z,
        size.x * 0.02, size.y * 0.08, z, size.x * 0.31, -size.y * 0.05, z,
      ], 3));
      cracks.userData.transient = true;
      const crackMaterial = this._own(new THREE.LineBasicMaterial({ color: '#5a6056', transparent: true, opacity: 0.75 }));
      crackMaterial.userData.transient = true;
      const crackLines = new THREE.LineSegments(cracks, crackMaterial);
      crackLines.visible = false;
      group.userData.cracks = crackLines;
      group.add(crackLines);
      if (index % 5 === 1 && size.y > 0.6) {
        const banner = this._box(Math.min(0.38, size.x * 0.5), Math.min(size.y * 0.72, 0.8), 0.018, this._material('banner', '#a75f45'), 0, 0, size.z * 0.493);
        group.add(banner);
        const emblem = this._box(0.105, 0.105, 0.025, this._material('banner-mark', '#e2c080'), 0, 0.04, size.z * 0.51);
        emblem.rotation.z = Math.PI / 4;
        group.add(emblem);
      }
    }
    return group;
  }

  _makeEnemyVisual(target) {
    const root = new THREE.Group();
    const height = target.size?.y || 1.1;
    const iron = this._material('enemy-iron', '#3b4541', 0.58, 0.4);
    const plate = this._material('enemy-plate', '#9e543e', 0.72, 0.2);
    const trim = this._material('enemy-trim', '#cda46a', 0.5, 0.45);
    const plinth = this._cylinder(0.39, 0.44, 0.18, iron, 12);
    plinth.position.y = height / 2 + 0.1;
    root.add(plinth);
    const yawRig = new THREE.Group();
    yawRig.position.y = height / 2 + 0.55;
    root.add(yawRig);
    yawRig.add(this._box(0.62, 0.31, 0.52, plate, 0, -0.08, 0.12));
    const cheeks = [{ p: [-0.25, 0, 0.02], s: [0.09, 0.44, 0.56] }, { p: [0.25, 0, 0.02], s: [0.09, 0.44, 0.56] }];
    yawRig.add(this._instances(this._geometry('box', () => new THREE.BoxGeometry(1, 1, 1)), iron, cheeks));
    const barrelRig = new THREE.Group();
    yawRig.add(barrelRig);
    const barrel = this._cylinder(0.16, 0.2, 0.92, iron, 12);
    barrel.rotation.x = QUARTER;
    barrel.position.z = -0.26;
    barrelRig.add(barrel);
    const rim = this._torus(0.166, 0.035, trim);
    rim.position.z = -0.72;
    barrelRig.add(rim);
    const mouth = new THREE.Mesh(this._geometry('enemy-mouth', () => new THREE.CircleGeometry(0.13, 12)), this._material('cannon-hole', '#101918', 1));
    mouth.rotation.y = Math.PI;
    mouth.position.z = -0.725;
    barrelRig.add(mouth);
    const shield = this._box(0.18, 0.18, 0.025, trim, 0, -0.08, 0.391);
    shield.rotation.z = Math.PI / 4;
    yawRig.add(shield);
    root.userData.yawRig = yawRig;
    root.userData.barrelRig = barrelRig;
    root.userData.targetId = target.id;
    return root;
  }

  _makeEnemyWarning() {
    const geometry = this._own(new THREE.BufferGeometry());
    geometry.userData.transient = true;
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3).setUsage(THREE.DynamicDrawUsage));
    const material = this._own(new THREE.LineDashedMaterial({ color: '#dc7358', dashSize: 0.3, gapSize: 0.2, transparent: true, opacity: 0.65, depthTest: false, depthWrite: false }));
    material.userData.transient = true;
    const beam = new THREE.Line(geometry, material);
    beam.frustumCulled = false;
    beam.renderOrder = 12;
    beam.visible = false;
    const marker = new THREE.Group();
    const ringMaterial = this._own(new THREE.MeshBasicMaterial({ color: '#e47759', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
    ringMaterial.userData.transient = true;
    const ring = new THREE.Mesh(this._geometry('warning-ring', () => new THREE.RingGeometry(0.91, 1.02, 48)), ringMaterial);
    ring.rotation.x = -QUARTER;
    ring.renderOrder = 13;
    const inner = new THREE.Mesh(this._geometry('warning-center', () => new THREE.RingGeometry(0.17, 0.2, 24)), ringMaterial);
    inner.rotation.x = -QUARTER;
    inner.renderOrder = 13;
    marker.add(ring, inner);
    marker.userData.ring = ring;
    marker.userData.material = ringMaterial;
    marker.visible = false;
    this.runtimeGroup.add(beam, marker);
    return { beam, marker };
  }

  _syncEnemies() {
    const active = new Set();
    for (const enemy of this.simulation?.enemies || []) {
      if (!enemy.alive || !enemy.body) continue;
      const carrier = this.simulation.targets.find(target => target.id === enemy.targetId);
      if (!carrier || carrier.dead) continue;
      active.add(enemy.id);
      let visual = this.enemyRoots.get(enemy.id);
      if (!visual) {
        const root = this._makeEnemyVisual(carrier);
        this.runtimeGroup.add(root);
        visual = { root, ...this._makeEnemyWarning() };
        this.enemyRoots.set(enemy.id, visual);
      }
      const { root, beam, marker } = visual;
      root.position.copy(enemy.body.position);
      // The physical turret firing point is defined in the world Y frame.
      // Its carrier can topple; the base position follows that real body.
      if (enemy.direction) _normal.copy(enemy.direction);
      else _normal.copy(enemy.aim || { x: 0, y: 1, z: 0 }).sub(root.position).normalize();
      root.userData.yawRig.rotation.y = Math.atan2(-_normal.x, -_normal.z);
      root.userData.barrelRig.rotation.x = Math.asin(THREE.MathUtils.clamp(_normal.y, -1, 1));
      const warning = THREE.MathUtils.clamp(enemy.telegraph || 0, 0, 1);
      beam.visible = marker.visible = this.mode === 'play' && warning > 0 && !this.simulation.outcome;
      if (beam.visible) {
        const start = enemy.muzzle || enemy.body.position;
        const aim = enemy.aim;
        const attribute = beam.geometry.getAttribute('position');
        attribute.setXYZ(0, start.x, start.y, start.z);
        attribute.setXYZ(1, aim.x, Math.max(0.06, aim.y), aim.z);
        attribute.needsUpdate = true;
        beam.computeLineDistances();
        beam.material.opacity = 0.35 + warning * 0.55;
        marker.position.set(aim.x, 0.055, aim.z);
        marker.userData.ring.scale.setScalar(1.6 - warning * 0.85);
        marker.userData.material.opacity = 0.5 + Math.sin(this._elapsed * 19) * 0.15 + warning * 0.23;
      }
    }
    for (const [id, visual] of this.enemyRoots) if (!active.has(id)) {
      this._disposeTransient(visual.root);
      this._disposeTransient(visual.beam);
      this._disposeTransient(visual.marker);
      this.enemyRoots.delete(id);
    }
  }

  setMission(id) {
    const changed = this.mission !== id;
    this.mission = id || 'outpost';
    for (const child of [...this.previewGroup.children]) this._disposeTransient(child);
    this.previewGroup.clear();
    const layout = getMissionLayout(this.mission);
    this._missionLayout = layout;
    this._configureEnvironment(layout.environment, layout.checkpoints || []);
    this._createRoute(layout.checkpoints || []);
    (layout.targets || []).forEach((target, index) => {
      const root = this._makeTarget(target, index);
      const pos = target.position;
      root.position.set(pos.x, pos.y, pos.z);
      if (target.quaternion) root.quaternion.copy(target.quaternion);
      this.previewGroup.add(root);
    });
    (layout.obstacles || []).forEach((obstacle, index) => {
      const root = this._makeTarget(obstacle, index, true);
      root.position.set(obstacle.position.x, obstacle.position.y, obstacle.position.z);
      if (obstacle.quaternion) root.quaternion.copy(obstacle.quaternion);
      this.previewGroup.add(root);
    });
    for (const enemy of layout.enemies || []) {
      const target = layout.targets.find(item => item.id === enemy.targetId);
      if (!target) continue;
      const root = this._makeEnemyVisual(target);
      root.position.copy(target.position);
      root.userData.yawRig.rotation.y = Math.atan2(target.position.x, target.position.z);
      root.userData.barrelRig.rotation.x = 0.07;
      this.previewGroup.add(root);
    }
    this.previewGroup.visible = !this.simulation;
    if (changed && this.parts.length && this.mode === 'build') this.focus();
  }

  _disposeTransient(object) {
    const disposed = new Set();
    const release = resource => {
      if (!resource || !resource.userData?.transient || disposed.has(resource)) return;
      resource.dispose();
      this._resources.delete(resource);
      disposed.add(resource);
    };
    object.traverse(child => {
      if (child.isInstancedMesh) child.dispose();
      release(child.geometry);
      const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
      for (const material of materials) { release(material.map); release(material); }
      for (const material of child.userData.damageMaterials?.values() || []) release(material);
    });
    object.removeFromParent();
  }

  _clearRuntime() {
    for (const child of [...this.runtimeGroup.children]) this._disposeTransient(child);
    this.runtimeGroup.clear();
    this.targetRoots.clear();
    this.obstacleRoots.clear();
    this.projectileRoots.clear();
    this.enemyRoots.clear();
    for (const child of [...this.indicatorGroup.children]) this._disposeTransient(child);
    this.targetIndicators.clear();
    this.partIndicators.clear();
    this._recentBreaks.clear();
    this._aimGuide = null;
    this._nextAimAt = 0;
    this._dryFireFlash = 0;
    this._lastEnvironmentSimTime = this.simulation?.elapsed || 0;
    this._flightForward.set(0, 0, -1);
    this.aimLine.visible = this.impactMarker.visible = this.reloadMarker.visible = false;
    this.mechanismGuide.visible = false;
    this.altitudeGroup.visible = false;
    if (this.waterWake) this.waterWake.visible = false;
    for (const marker of this.routeMarkers.values()) marker.userData.pulseAt = -10;
    this._updateRoute();
    this._particles.length = 0;
    for (const smoke of this._smokes) { smoke.sprite.removeFromParent(); smoke.sprite.material.dispose(); this._resources.delete(smoke.sprite.material); }
    this._smokes.length = 0;
    if (this.particleMesh) this.particleMesh.count = 0;
    this.flashLight.intensity = 0;
  }

  _syncSimulation() {
    const simulation = this.simulation;
    if (!simulation) return;
    for (const [id, root] of this.partRoots) {
      const body = simulation.bodies.get(id);
      root.visible = !!body;
      if (!body) continue;
      root.position.copy(body.position);
      root.quaternion.copy(body.quaternion);
      const state = simulation.partStates?.get(id);
      if (root.userData.barrelRig && (!state || (!state.dead && state.connected))) {
        const elevation = simulation.getCannonElevation?.(id) ?? this.partData.get(id)?.elevation ?? 0;
        root.userData.barrelRig.rotation.x = THREE.MathUtils.degToRad(elevation);
      }
      if (root.userData.wingRig) this._setPartElevation(root, authoredElevation(this.partData.get(id)));
      this._applyPartState(root, state || null);
      const ratio = state ? state.hp / (state.maxHp || 1) : 1;
      const primary = id === this.selectedId;
      const needsIndicator = !!state && (primary || state.dead || !state.connected || ratio < 0.995 || root.userData.partType === 'core');
      let indicator = this.partIndicators.get(id);
      if (needsIndicator) {
        if (!indicator) { indicator = this._makeHealthIndicator(0.67); this.partIndicators.set(id, indicator); }
        _position.copy(root.position);
        _position.y += root.userData.partType === 'wheel' ? 0.95 : 0.8;
        let inspection = null;
        if (primary) {
          const links = (simulation.connections || []).filter(link => !link.broken && (link.a === id || link.b === id));
          inspection = { metric: links.length ? Math.max(...links.map(link => this.stressMode === 'damage' ? 1 - (link.health ?? 1) : link.stress || 0)) : null };
        }
        this._updateHealthIndicator(indicator, _position, ratio, state.dead ? 'dead' : !state.connected ? 'disconnected' : 'healthy', inspection);
      } else if (indicator) indicator.visible = false;
    }
    const activeTargets = new Set();
    (simulation.targets || []).forEach((target, index) => {
      if (target.dead) return;
      activeTargets.add(target.id);
      let root = this.targetRoots.get(target.id);
      if (!root) { root = this._makeTarget(target, index); this.targetRoots.set(target.id, root); this.runtimeGroup.add(root); }
      root.position.copy(target.body.position);
      root.quaternion.copy(target.body.quaternion);
      const fraction = Math.max(0, Math.min(1, (target.hp ?? 1) / (target.maxHp || target.hp || 1)));
      root.userData.stoneMaterial.color.copy(root.userData.baseColor).lerp(new THREE.Color('#817568'), (1 - fraction) * 0.6);
      root.userData.cracks.visible = fraction < 0.75;
      let indicator = this.targetIndicators.get(target.id);
      if (!indicator) { indicator = this._makeHealthIndicator(Math.min(0.9, (target.size?.x || 1) * 0.68)); this.targetIndicators.set(target.id, indicator); }
      _position.copy(root.position);
      _position.y += (target.size?.y || 1) / 2 + 0.19;
      if ((simulation.enemies || []).some(enemy => enemy.targetId === target.id && enemy.alive)) _position.y += 1.0;
      this._updateHealthIndicator(indicator, _position, fraction);
    });
    for (const [id, root] of this.targetRoots) if (!activeTargets.has(id)) { this._disposeTransient(root); this.targetRoots.delete(id); }
    for (const [id, indicator] of this.targetIndicators) if (!activeTargets.has(id)) { this._disposeTransient(indicator); this.targetIndicators.delete(id); }
    (simulation.obstacles || []).forEach((obstacle, index) => {
      const id = obstacle.id || `obstacle-${index}`;
      let root = this.obstacleRoots.get(id);
      if (!root) { root = this._makeTarget(obstacle, index, true); this.obstacleRoots.set(id, root); this.runtimeGroup.add(root); }
      root.position.copy(obstacle.body.position);
      root.quaternion.copy(obstacle.body.quaternion);
    });
    this._syncEnemies();
    const activeProjectiles = new Set();
    for (const projectile of simulation.projectiles || []) {
      if (projectile.life <= 0 || !projectile.body) continue;
      activeProjectiles.add(projectile.id);
      let visual = this.projectileRoots.get(projectile.id);
      if (!visual) {
        const sphere = new THREE.Group();
        const ballMaterial = projectile.hostile ? this._material('hostile-ball', '#cf7654', 0.35, 0.4) : this._material('cannonball', '#353c3b', 0.35, 0.65);
        if (projectile.hostile) ballMaterial.emissive.set('#8a321c');
        const ball = new THREE.Mesh(this._geometry('cannonball', () => new THREE.SphereGeometry(0.16, 10, 8)), ballMaterial);
        ball.castShadow = true;
        sphere.add(ball);
        if (projectile.hostile) {
          const halo = new THREE.Mesh(ball.geometry, this._unlit('hostile-halo', '#e7855d', 0.19));
          halo.scale.setScalar(1.6);
          sphere.add(halo);
        }
        const geometry = this._own(new THREE.BufferGeometry());
        geometry.userData.transient = true;
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(14 * 3), 3).setUsage(THREE.DynamicDrawUsage));
        geometry.setDrawRange(0, 0);
        const material = this._own(new THREE.LineBasicMaterial({ color: projectile.hostile ? '#e68766' : '#efc98b', transparent: true, opacity: projectile.hostile ? 0.9 : 0.65, depthWrite: false }));
        material.userData.transient = true;
        const trail = new THREE.Line(geometry, material);
        trail.frustumCulled = false;
        this.runtimeGroup.add(sphere, trail);
        visual = { sphere, trail, history: [] };
        this.projectileRoots.set(projectile.id, visual);
      }
      visual.sphere.position.copy(projectile.body.position);
      visual.sphere.quaternion.copy(projectile.body.quaternion);
      if (!visual.history.length || visual.history[0].distanceToSquared(projectile.body.position) > 0.0004) visual.history.unshift(new THREE.Vector3().copy(projectile.body.position));
      if (visual.history.length > (this.quality === 'low' ? 8 : 14)) visual.history.pop();
      const attribute = visual.trail.geometry.getAttribute('position');
      visual.history.forEach((p, i) => attribute.setXYZ(i, p.x, p.y, p.z));
      attribute.needsUpdate = true;
      visual.trail.geometry.setDrawRange(0, visual.history.length);
    }
    for (const [id, visual] of this.projectileRoots) if (!activeProjectiles.has(id)) {
      visual.sphere.removeFromParent();
      this._disposeTransient(visual.trail);
      this.projectileRoots.delete(id);
    }
    this._updatePistons();
  }

  _updateConnections() {
    if (!this.connectionLines || !(this.connectionsVisible || this.stressVisible)) return;
    const connections = this.simulation ? this.simulation.connections : this._designConnections || [];
    const fixed = new THREE.Color('#f1cf8a'), hinge = new THREE.Color('#a0d2c1'), wheel = new THREE.Color('#dfab76');
    const calm = new THREE.Color('#99c5aa'), warning = new THREE.Color('#f3c779'), danger = new THREE.Color('#e47959');
    const stressColor = new THREE.Color();
    let count = 0;
    const addLine = (a, b, color) => {
      if (count >= 2048) return;
      const offset = count++ * 6;
      this._connectionPositions.set([a.x, a.y, a.z, b.x, b.y, b.z], offset);
      this._connectionColors.set([color.r, color.g, color.b, color.r, color.g, color.b], offset);
    };
    for (const connection of connections) {
      if (count >= 2048) break;
      if (this.mode === 'build' && (connection.a === this.excludedPartId || connection.b === this.excludedPartId)) continue;
      const a = this.partRoots.get(connection.a), b = this.partRoots.get(connection.b);
      if (!a || !b) continue;
      if (connection.broken) {
        const key = [connection.a, connection.b].sort().join('|');
        if (this.stressVisible && this._recentBreaks.has(key)) {
          _normal.copy(b.position).sub(a.position).normalize();
          addLine(a.position, _position.copy(a.position).addScaledVector(_normal, 0.32), danger);
          addLine(b.position, _position.copy(b.position).addScaledVector(_normal, -0.32), danger);
        }
        continue;
      }
      let color = connection.kind === 'hinge' ? hinge : connection.kind === 'wheel' ? wheel : fixed;
      if (this.stressVisible && this.simulation) {
        const load = THREE.MathUtils.clamp(this.stressMode === 'damage' ? 1 - (connection.health ?? 1) : connection.stress || 0, 0, 1);
        color = load < 0.55 ? stressColor.copy(calm).lerp(warning, load / 0.55) : stressColor.copy(warning).lerp(danger, (load - 0.55) / 0.45);
      }
      addLine(a.position, b.position, color);
    }
    this.connectionLines.geometry.getAttribute('position').needsUpdate = true;
    this.connectionLines.geometry.getAttribute('color').needsUpdate = true;
    this.connectionLines.geometry.setDrawRange(0, count * 2);
  }

  _updateCouplings() {
    const links = this.simulation ? this.simulation.connections : this._designConnections || [];
    let count = 0;
    for (const link of links) {
      if (link.broken || link.kind === 'piston' || count >= 1024) continue;
      if (this.mode === 'build' && (link.a === this.excludedPartId || link.b === this.excludedPartId)) continue;
      const a = this.partRoots.get(link.a), b = this.partRoots.get(link.b);
      if (!a || !b) continue;
      _normal.copy(b.position).sub(a.position);
      const distance = _normal.length();
      if (distance < 0.001 || distance > 2) continue;
      _normal.multiplyScalar(1 / distance);
      const halfA = this._connectionExtent(a, _normal);
      const halfB = this._connectionExtent(b, _normal);
      const gap = Math.max(0.07, distance - halfA - halfB);
      _position.copy(a.position).addScaledVector(_normal, halfA + gap * 0.5);
      _rotation.setFromUnitVectors(_up, _normal);
      _scale.set(1, gap + 0.1, 1);
      _matrix.compose(_position, _rotation, _scale);
      this.couplings.setMatrixAt(count++, _matrix);
    }
    this.couplings.count = count;
    this.couplings.instanceMatrix.needsUpdate = true;
  }

  _connectionExtent(root, direction) {
    const type = root.userData.partType;
    if (type === 'wheel') return 0.17;
    if (!['wing', 'float', 'propeller', 'piston'].includes(type)) return 0.44;
    _localDirection.copy(direction).applyQuaternion(_inverseRotation.copy(root.quaternion).invert());
    if (type === 'wing') _localDirection.applyQuaternion(_inverseRotation.copy(root.userData.wingRig.quaternion).invert());
    const half = type === 'wing' ? [0.49, 0.08, 0.43] : type === 'float' ? [0.46, 0.42, 0.46] : type === 'piston' ? [0.34, 0.20, 0.34] : [0.28, 0.28, 0.40];
    return 1 / Math.max(Math.abs(_localDirection.x) / half[0], Math.abs(_localDirection.y) / half[1], Math.abs(_localDirection.z) / half[2], 0.001);
  }

  _updatePistons() {
    this.mechanismGuide.visible = false;
    const links = this.simulation ? this.simulation.connections : this._designConnections || [];
    for (const [id, root] of this.partRoots) {
      const base = root.userData.pistonBase, rod = root.userData.pistonRod;
      if (!base || !rod) continue;
      const link = links.find(item => item.kind === 'piston' && item.b === id);
      const support = link && (this.simulation ? this.simulation.bodies.get(link.a) : this.partRoots.get(link.a));
      const head = this.simulation ? this.simulation.bodies.get(id) : root;
      if (!link || link.broken || !support || !head || (this.mode === 'build' && link.a === this.excludedPartId)) {
        const preview = this.mode === 'build';
        base.visible = rod.visible = preview;
        base.position.set(0, -0.35, 0);
        base.quaternion.identity();
        rod.position.set(0, -0.37, 0);
        rod.quaternion.identity();
        rod.scale.set(1, 0.34, 1);
        root.userData.pistonEndpoints = null;
        continue;
      }
      base.visible = rod.visible = root.visible;
      const supportRotation = new THREE.Quaternion().copy(support.quaternion);
      const inverseHead = new THREE.Quaternion().copy(head.quaternion).invert();
      const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(supportRotation);
      const baseAnchor = new THREE.Vector3(0, 0.46, 0).applyQuaternion(supportRotation).add(support.position);
      const headAnchor = new THREE.Vector3(0, -0.20, 0).applyQuaternion(head.quaternion).add(head.position);
      const baseCenter = new THREE.Vector3(0, 0.65, 0).applyQuaternion(supportRotation).add(support.position);
      base.position.copy(baseCenter).sub(head.position).applyQuaternion(inverseHead);
      base.quaternion.copy(inverseHead).multiply(supportRotation);
      const direction = headAnchor.clone().sub(baseAnchor);
      const length = direction.length();
      rod.visible = root.visible && length > 0.005;
      if (rod.visible) {
        direction.multiplyScalar(1 / length);
        rod.position.copy(baseAnchor).add(headAnchor).multiplyScalar(0.5).sub(head.position).applyQuaternion(inverseHead);
        rod.quaternion.copy(inverseHead).multiply(_rotation.setFromUnitVectors(_up, direction));
        rod.scale.set(1, length, 1);
      }
      root.userData.pistonEndpoints = { base: baseAnchor, head: headAnchor };
      if (id === this.selectedId && root.visible && !(this.mode === 'build' && id === this.excludedPartId)) {
        const part = this.partData.get(id);
        const state = this.simulation?.getPistonState?.(id) || { extension: 0, target: 0, stroke: part.stroke ?? PARTS.piston?.defaultStroke ?? 1.5, connected: true, load: 0 };
        this._updateMechanismGuide(support, supportRotation, axis, head.position, state);
      }
    }
  }

  _updateMechanismGuide(support, supportRotation, axis, headPosition, state) {
    if (![state.extension, state.target, state.stroke].every(Number.isFinite)) return;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(supportRotation);
    const origin = new THREE.Vector3().copy(support.position).add(axis);
    const offset = right.clone().multiplyScalar(0.69);
    const start = origin.clone().add(offset);
    const end = start.clone().addScaledVector(axis, state.stroke);
    const actual = start.clone().addScaledVector(axis, state.extension);
    const target = start.clone().addScaledVector(axis, state.target);
    const neutral = new THREE.Color('#96aa99'), measured = new THREE.Color(state.connected ? '#a0d7c8' : '#c4a475'), requested = new THREE.Color('#f0ce8c');
    const positions = this.mechanismGuide.geometry.getAttribute('position');
    const colors = this.mechanismGuide.geometry.getAttribute('color');
    let count = 0;
    const line = (a, b, color) => {
      for (const point of [a, b]) { positions.setXYZ(count, point.x, point.y, point.z); colors.setXYZ(count++, color.r, color.g, color.b); }
    };
    const tick = (point, width, color) => line(point.clone().addScaledVector(right, -width), point.clone().addScaledVector(right, width), color);
    line(start, end, neutral);
    tick(start, 0.10, neutral);
    tick(end, 0.10, neutral);
    tick(target, 0.16, requested);
    tick(actual, 0.23, measured);
    line(actual, headPosition, measured);
    line(start, actual, measured);
    positions.needsUpdate = colors.needsUpdate = true;
    this.mechanismGuide.geometry.setDrawRange(0, count);
    this.mechanismGuide.visible = true;
  }

  _updateAim() {
    const simulation = this.simulation;
    if (!simulation || this.mode !== 'play' || simulation.outcome) {
      this.aimLine.visible = this.impactMarker.visible = this.reloadMarker.visible = false;
      return;
    }
    if (!this._aimGuide || this._elapsed >= this._nextAimAt) {
      this._aimGuide = simulation.getAimGuide?.() || null;
      this._nextAimAt = this._elapsed + (this.quality === 'low' ? 1 / 15 : 1 / 30);
    }
    const guide = this._aimGuide;
    const points = guide?.points || [];
    const active = points.length >= 2;
    this.aimLine.visible = !!(this.aimVisible && active);
    const dry = simulation.ammoRemaining === 0 || this._dryFireFlash > 0;
    const color = dry ? '#d89576' : guide?.ready ? guide.targetId ? '#cee5ac' : '#f5dfaa' : '#a7b3a2';
    this.aimLine.material.color.set(color);
    if (this.aimLine.visible) {
      const positions = this.aimLine.geometry.getAttribute('position');
      const distances = this.aimLine.geometry.getAttribute('lineDistance');
      const count = Math.min(points.length, positions.count);
      let distance = 0;
      for (let i = 0; i < count; i++) {
        const p = points[i];
        positions.setXYZ(i, p.x, p.y, p.z);
        if (i) { const prev = points[i - 1]; distance += Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z); }
        distances.setX(i, distance);
      }
      positions.needsUpdate = distances.needsUpdate = true;
      this.aimLine.geometry.setDrawRange(0, count);
      this.aimLine.material.opacity = dry ? 0.35 : guide.ready ? 0.85 : 0.4;
    }
    this.impactMarker.visible = !!(this.aimVisible && active && guide.impact);
    if (this.impactMarker.visible) {
      this.impactMarker.position.copy(guide.impact);
      if (guide.impact.y < this.environment.groundY + 0.12) {
        this.impactMarker.position.y = this.environment.groundY + 0.055;
        this.impactMarker.rotation.set(-QUARTER, 0, 0);
      } else this.impactMarker.quaternion.copy(this.camera.quaternion);
      this.impactMarker.scale.setScalar(1 + Math.sin(this._elapsed * 3.5) * 0.05);
      this.impactRingMaterial.color.set(color);
      this.impactTicks.material.color.set(color);
    }
    const primary = this.parts.find(part => {
      const state = simulation.partStates?.get(part.id);
      return part.type === 'cannon' && (!state || (!state.dead && state.connected));
    });
    const root = primary && this.partRoots.get(primary.id);
    this.reloadMarker.visible = !!(root && active && (!guide.ready || this._dryFireFlash > 0));
    if (this.reloadMarker.visible) {
      this.reloadMarker.position.copy(root.position);
      this.reloadMarker.position.y += 1.12;
      this.reloadMarker.quaternion.copy(this.camera.quaternion);
      this.reloadMarker.rotateZ(QUARTER);
      const fraction = dry ? 1 : THREE.MathUtils.clamp(guide.reloadProgress || 0, 0, 1);
      this.reloadArcGeometry.setDrawRange(0, Math.floor(40 * fraction) * 6);
      this.reloadArcMaterial.color.set(dry ? '#df8867' : '#f0ca83');
      this.reloadArcMaterial.opacity = dry ? 0.65 + Math.sin(this._elapsed * 8) * 0.25 : 0.96;
    }
  }

  _bindInput() {
    const canvas = this.renderer.domElement;
    const listen = (type, callback, options) => { canvas.addEventListener(type, callback, options); this._listeners.push([type, callback, options]); };
    const pointerCoordinates = event => {
      const rect = canvas.getBoundingClientRect();
      this._pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      this._pointerInside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    };
    listen('contextmenu', event => event.preventDefault());
    listen('pointerdown', event => {
      this._pointers.add(event.pointerId);
      pointerCoordinates(event);
      if (this._pointers.size > 1) { if (this._pointerStart) this._pointerStart.cancelled = true; return; }
      if (event.button === 0) this._pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), cancelled: false };
    });
    listen('pointermove', event => {
      pointerCoordinates(event);
      if (this._pointerStart && Math.hypot(event.clientX - this._pointerStart.x, event.clientY - this._pointerStart.y) > 7) this._pointerStart.cancelled = true;
      if (this.mode === 'build') this._updateHover();
    });
    listen('pointerup', event => {
      this._pointers.delete(event.pointerId);
      const start = this._pointerStart;
      this._pointerStart = null;
      pointerCoordinates(event);
      if (!start || start.id !== event.pointerId || start.cancelled || performance.now() - start.time > 800) return;
      const additive = !!(event.shiftKey || event.ctrlKey || event.metaKey);
      if (this.mode === 'play') {
        const hit = this._pickPart();
        this.callbacks.onSelect?.(hit?.object?.userData.partId || null, { additive });
        return;
      }
      this._updateHover();
      if (!this.tool || additive) this.callbacks.onSelect?.(this._hover?.partId || null, { additive });
      else if (this._hover?.valid && this._hover.cell) this.callbacks.onCellClick?.(copyCell(this._hover.cell));
    });
    listen('pointercancel', event => { this._pointers.delete(event.pointerId); this._pointerStart = null; });
    listen('pointerleave', () => {
      this._pointerInside = false;
      this._pointerStart = null;
      this._pointers.clear();
      this.hoverOutline.visible = false;
      if (this.ghost) this.ghost.visible = false;
      if (this.mirrorGhost) this.mirrorGhost.visible = false;
      this._publishHover(null, false, null);
    });
  }

  _publishHover(cell, valid, partId) {
    const key = `${cell ? cellKey(cell) : 'none'}:${valid}:${partId || ''}:${this.tool || ''}:${this.mirror}:${this.excludedPartId || ''}`;
    this._hover = { cell, valid, partId };
    if (key !== this._hoverKey) {
      this._hoverKey = key;
      this.callbacks.onHover?.({ cell: copyCell(cell), valid: !!valid });
    }
  }

  _pickPart() {
    this.camera.updateMatrixWorld();
    this.designGroup.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this._pointer, this.camera);
    const candidates = this.pickables.filter(object => {
      if (this.mode === 'build' && object.userData.partId === this.excludedPartId) return false;
      // Direct raycasts can hit a child of an invisible parent. Explicitly
      // remove moved parts and broken piston housings from selection targets.
      for (let node = object; node; node = node.parent) if (!node.visible) return false;
      return true;
    });
    return this.raycaster.intersectObjects(candidates, false)[0] || null;
  }

  _updateHover() {
    if (this.mode !== 'build' || !this._pointerInside || this._pointers.size > 1) {
      if (this.ghost) this.ghost.visible = false;
      if (this.mirrorGhost) this.mirrorGhost.visible = false;
      this.hoverOutline.visible = false;
      return;
    }
    const hit = this._pickPart();
    const partId = hit?.object?.userData?.partId || null;
    let cell = null;
    if (hit && partId) {
      const part = this.partData.get(partId);
      _normal.copy(hit.face.normal).applyMatrix3(_normalMatrix.getNormalMatrix(hit.object.matrixWorld)).normalize();
      const abs = [Math.abs(_normal.x), Math.abs(_normal.y), Math.abs(_normal.z)];
      const axis = abs.indexOf(Math.max(...abs));
      cell = { x: part.x, y: part.y, z: part.z };
      const key = ['x', 'y', 'z'][axis];
      cell[key] += Math.sign(_normal[key]) || 1;
    } else {
      const intersection = this.raycaster.ray.intersectPlane(this.groundPlane, _position);
      if (intersection) cell = { x: Math.round(intersection.x), y: 0, z: Math.round(intersection.z) };
    }
    const reflected = cell && this.mirror && cell.x !== 0 ? { x: -cell.x, y: cell.y, z: cell.z } : null;
    const isFree = candidate => {
      if (!candidate || Math.abs(candidate.x) > CELL_LIMIT || Math.abs(candidate.z) > CELL_LIMIT || candidate.y < 0 || candidate.y > 10) return false;
      const occupant = this.occupied.get(cellKey(candidate));
      return !occupant || occupant === this.excludedPartId;
    };
    const remainingCount = this.parts.length - (this.partData.has(this.excludedPartId) ? 1 : 0);
    const valid = isFree(cell) && (!reflected || isFree(reflected)) && remainingCount + (reflected ? 2 : 1) <= 100;
    this.hoverOutline.visible = !this.tool && !!partId && !this.selectedIds.has(partId);
    if (!this.tool && partId && !this.selectedIds.has(partId)) this._outlineAt(this.hoverOutline, partId);
    const positionGhost = (ghost, candidate, rotation) => {
      if (!ghost) return;
      const nearBounds = candidate && Math.abs(candidate.x) <= CELL_LIMIT + 1 && Math.abs(candidate.z) <= CELL_LIMIT + 1 && candidate.y >= -1 && candidate.y <= 11;
      ghost.visible = !!nearBounds;
      if (nearBounds) {
        ghost.position.set(candidate.x, candidate.y + Y_OFFSET, candidate.z);
        ghost.rotation.y = rotation * QUARTER;
        ghost.userData.ghostMaterial.color.set(valid ? '#9fca83' : '#d87965');
        ghost.userData.outlineMaterial.color.set(valid ? '#cee9a4' : '#f4a28a');
        ghost.userData.ghostMaterial.opacity = valid ? ghost.userData.secondary ? 0.28 : 0.42 : 0.23;
      }
    };
    positionGhost(this.ghost, cell, this.rotation);
    positionGhost(this.mirrorGhost, reflected, (4 - this.rotation) % 4);
    this._publishHover(cell, this.tool ? valid : !!partId, partId);
  }

  _createParticles() {
    const material = this._own(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }));
    this.particleMesh = new THREE.InstancedMesh(this._geometry('debris', () => new THREE.BoxGeometry(1, 1, 1)), material, MAX_PARTICLES);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.count = 0;
    this.particleMesh.frustumCulled = false;
    this.fxGroup.add(this.particleMesh);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,0.7)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    this.smokeTexture = this._own(new THREE.CanvasTexture(canvas));
  }

  effect(event) {
    if (!event || this._disposed) return;
    if (event.type === 'dry-fire') { this._dryFireFlash = 0.65; this._nextAimAt = 0; return; }
    if (event.type === 'fire') this._nextAimAt = 0;
    if (event.type === 'checkpoint') {
      const id = event.id || this._routeCheckpoints?.[event.index]?.id;
      const marker = this.routeMarkers.get(id);
      if (marker) marker.userData.pulseAt = this._elapsed;
    }
    if (event.partId && ['damage', 'part-destroy'].includes(event.type)) {
      const root = this.partRoots.get(event.partId);
      if (root) root.userData.hitFlash = 0.17;
    }
    if (event.type === 'break' && event.a && event.b) this._recentBreaks.set([event.a, event.b].sort().join('|'), this._elapsed + 1.0);
    // Small friction contacts still update HP but do not flood the screen with
    // bursts. Explosions and failed joints retain clear, separate feedback.
    if (event.type === 'damage' && event.damage < 1.5) return;
    const fallback = this.simulation?.corePosition || { x: 0, y: 1, z: 0 };
    const pos = event.position || fallback;
    const settings = {
      fire: { count: 8, color: '#eebc6f', speed: 1.8, size: 0.06, life: 0.3 },
      'enemy-fire': { count: 9, color: '#eb9768', speed: 2.3, size: 0.06, life: 0.35 },
      hit: { count: 13, color: '#d8c9a8', speed: 3.1, size: 0.12, life: 0.7 },
      damage: { count: 4, color: '#b9854e', speed: 1.6, size: 0.055, life: 0.5 },
      break: { count: 10, color: '#b8824a', speed: 2.7, size: 0.09, life: 0.9 },
      'part-destroy': { count: 21, color: '#94734c', speed: 2.9, size: 0.095, life: 1.05 },
      destroy: { count: 28, color: '#c5bba2', speed: 4.0, size: 0.18, life: 1.15 },
      fail: { count: 22, color: '#a46d47', speed: 2.1, size: 0.07, life: 1.0 },
      checkpoint: { count: 19, color: '#b3cf9a', speed: 2.6, size: 0.075, life: 1.1 },
      win: { count: 70, color: '#e8b366', speed: 5.2, size: 0.11, life: 2.4 },
    }[event.type];
    if (!settings) return;
    const colors = event.type === 'win' ? ['#e8b366', '#9ac6ad', '#f0e3bc', '#c67554'] : [event.hostile ? '#d49b72' : settings.color];
    const count = Math.ceil(settings.count * (this.quality === 'low' ? 0.55 : 1));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const speed = settings.speed * (0.4 + Math.random() * 0.8);
      const velocity = new THREE.Vector3(Math.cos(a) * speed, (event.type === 'win' ? 2.0 : 0.35 + Math.random()) * speed, Math.sin(a) * speed);
      if (event.direction) velocity.addScaledVector(event.direction, settings.speed * 1.3);
      this._particles.push({
        p: new THREE.Vector3(pos.x, pos.y, pos.z),
        v: velocity,
        rotation: new THREE.Vector3(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU),
        spin: (Math.random() - 0.5) * 8,
        life: settings.life * (0.65 + Math.random() * 0.65),
        maxLife: settings.life * 1.3,
        size: settings.size * (0.6 + Math.random()),
        color: new THREE.Color(colors[i % colors.length]),
        gravity: event.type === 'win' ? 3.2 : 7,
      });
    }
    const particleLimit = this.quality === 'low' ? 120 : MAX_PARTICLES;
    if (this._particles.length > particleLimit) this._particles.splice(0, this._particles.length - particleLimit);
    if (event.type === 'fire' || event.type === 'enemy-fire') {
      this.flashLight.position.set(pos.x, pos.y, pos.z);
      this.flashLight.intensity = 7;
      this._emitSmoke(pos, 2, '#e8dfcb', 0.65);
    } else if (event.type === 'destroy' || event.type === 'hit') this._emitSmoke(pos, event.type === 'destroy' ? 5 : 2, '#d8d1bc', 1.1);
    else if (event.type === 'part-destroy' || event.type === 'fail') this._emitSmoke(pos, 3, '#777765', 1.35);
  }

  _emitSmoke(pos, count, color, duration) {
    if (this.quality === 'low') count = Math.ceil(count * 0.5);
    for (let i = 0; i < count; i++) {
      if (this._smokes.length >= (this.quality === 'low' ? 18 : 45)) break;
      const material = this._own(new THREE.SpriteMaterial({ map: this.smokeTexture, color, transparent: true, opacity: 0.5, depthWrite: false }));
      const sprite = new THREE.Sprite(material);
      sprite.position.set(pos.x + (Math.random() - 0.5) * 0.35, pos.y, pos.z + (Math.random() - 0.5) * 0.35);
      const life = duration * (0.8 + Math.random() * 0.5);
      this._smokes.push({ sprite, life, maxLife: life, v: new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.55 + Math.random() * 0.7, (Math.random() - 0.5) * 0.8) });
      this.fxGroup.add(sprite);
    }
  }

  _updateEffects(dt) {
    let count = 0;
    const effectFloor = (this.environment.waterLevel ?? this.environment.groundY) + 0.04;
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const particle = this._particles[i];
      particle.life -= dt;
      if (particle.life <= 0) { this._particles.splice(i, 1); continue; }
      particle.v.y -= particle.gravity * dt;
      particle.p.addScaledVector(particle.v, dt);
      if (particle.p.y < effectFloor) { particle.p.y = effectFloor; particle.v.y = Math.abs(particle.v.y) * 0.25; particle.v.x *= 0.8; particle.v.z *= 0.8; }
      particle.rotation.x += particle.spin * dt;
      particle.rotation.z += particle.spin * dt * 0.6;
      _euler.set(particle.rotation.x, particle.rotation.y, particle.rotation.z);
      _rotation.setFromEuler(_euler);
      const fade = Math.min(1, particle.life * 5);
      _scale.setScalar(particle.size * fade);
      _matrix.compose(particle.p, _rotation, _scale);
      this.particleMesh.setMatrixAt(count, _matrix);
      this.particleMesh.setColorAt(count, particle.color);
      count++;
    }
    this.particleMesh.count = count;
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    for (let i = this._smokes.length - 1; i >= 0; i--) {
      const smoke = this._smokes[i];
      smoke.life -= dt;
      if (smoke.life <= 0) { smoke.sprite.removeFromParent(); smoke.sprite.material.dispose(); this._resources.delete(smoke.sprite.material); this._smokes.splice(i, 1); continue; }
      smoke.sprite.position.addScaledVector(smoke.v, dt);
      const progress = 1 - smoke.life / smoke.maxLife;
      smoke.sprite.scale.setScalar(0.45 + progress * 2.1);
      smoke.sprite.material.opacity = (1 - progress) * 0.42;
    }
    this.flashLight.intensity *= Math.exp(-dt * 32);
    if (this.flashLight.intensity < 0.02) this.flashLight.intensity = 0;
  }

  _updateEnvironment(dt) {
    if (this.waterRipples && this.quality !== 'low') {
      this.waterRipples.position.x = Math.sin(this._elapsed * 0.18) * 0.18;
      this.waterRipples.position.z = Math.cos(this._elapsed * 0.14) * 0.22;
      this.waterRipples.material.opacity = 0.25 + Math.sin(this._elapsed * 0.38) * 0.035;
    }
    if (this.routeClouds && this.quality !== 'low') for (const cloud of this.routeClouds.children) cloud.position.x = cloud.userData.originX + Math.sin(this._elapsed * 0.035 + cloud.userData.phase) * 1.5;
    const simulation = this.simulation;
    if (!simulation || this.mode !== 'play') {
      this.altitudeGroup.visible = false;
      if (this.waterWake) this.waterWake.visible = false;
      return;
    }
    const simDt = Math.max(0, Math.min(0.1, simulation.elapsed - (this._lastEnvironmentSimTime ?? simulation.elapsed)));
    this._lastEnvironmentSimTime = simulation.elapsed;
    for (const [id, root] of this.partRoots) if (root.userData.rotor) {
      const power = simulation.getPropellerPower?.(id) || 0;
      root.userData.rotorSpeed = power * 45;
      root.userData.rotor.rotation.z = (root.userData.rotor.rotation.z + root.userData.rotorSpeed * simDt) % TAU;
    }
    const corePart = this.parts.find(part => part.type === 'core');
    const coreBody = corePart && simulation.bodies.get(corePart.id);
    const core = simulation.corePosition;
    if (!core || ![core.x, core.y, core.z].every(Number.isFinite)) return;
    if (coreBody) {
      _normal.set(0, 0, -1).applyQuaternion(coreBody.quaternion);
      _normal.y = 0;
      if (_normal.lengthSq() > 0.0001) this._flightForward.lerp(_normal.normalize(), 1 - Math.exp(-dt * 3.4)).normalize();
    }
    if (this.environment.kind !== 'land') {
      this.sun.position.set(core.x - 13, Math.max(this.environment.groundY, core.y) + 25, core.z + 13);
      this.sun.target.position.set(core.x, this.environment.groundY, core.z - 7);
    }
    if (this.waterWake) {
      const surface = this.environment.waterLevel;
      const velocity = coreBody?.velocity || { x: 0, y: 0, z: 0 };
      const speed = Math.hypot(velocity.x, velocity.z);
      this.waterWake.visible = speed > 0.35 && Math.abs(core.y - surface) < 2 && !simulation.outcome;
      if (this.waterWake.visible) {
        const forward = new THREE.Vector3(velocity.x, 0, velocity.z).normalize();
        const right = new THREE.Vector3().crossVectors(forward, _up);
        const attribute = this.waterWake.geometry.getAttribute('position');
        const phase = (simulation.elapsed * 1.7) % 1;
        let count = 0;
        for (let i = 0; i < 6; i++) {
          const behind = 0.7 + (i + phase) * 0.62;
          const spread = 0.22 + behind * 0.24;
          for (const side of [-1, 1]) {
            _position.set(core.x, surface + 0.025, core.z).addScaledVector(forward, -behind).addScaledVector(right, side * spread);
            attribute.setXYZ(count++, _position.x, _position.y, _position.z);
            _position.addScaledVector(forward, -0.2).addScaledVector(right, side * (0.32 + i * 0.055));
            attribute.setXYZ(count++, _position.x, _position.y, _position.z);
          }
        }
        attribute.needsUpdate = true;
        this.waterWake.geometry.setDrawRange(0, count);
        this.waterWake.material.opacity = Math.min(0.6, 0.15 + speed * 0.055);
      }
    }
    const altitude = simulation.telemetry?.altitude ?? core.y - this.environment.groundY;
    this.altitudeGroup.visible = this.environment.kind === 'air' && altitude > 0.7;
    if (this.altitudeGroup.visible) {
      const ground = this.environment.groundY + 0.045;
      const attribute = this.altitudeGuideLine.geometry.getAttribute('position');
      attribute.setXYZ(0, core.x, ground, core.z);
      attribute.setXYZ(1, core.x, Math.max(ground, core.y - 0.3), core.z);
      attribute.needsUpdate = true;
      const distances = this.altitudeGuideLine.geometry.getAttribute('lineDistance');
      distances.setX(0, 0);
      distances.setX(1, Math.max(0, core.y - ground - 0.3));
      distances.needsUpdate = true;
      this.altitudeFoot.position.set(core.x, ground, core.z);
      if (this.altitudeLabel) {
        _normal.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
        this.altitudeLabel.position.copy(core).addScaledVector(_normal, 1.05);
        this.altitudeLabel.position.y -= 0.5;
        this._writeWorldLabel(this.altitudeLabel, `${Math.max(0, altitude).toFixed(1)} m`, 'ALTITUDE');
      }
    }
  }

  _followFlight(dt) {
    const core = this.simulation.corePosition;
    const tanY = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const distance = THREE.MathUtils.clamp((this._designSpan || 7) / (2 * tanY * Math.max(0.3, this.camera.aspect) * 0.78), 16, 50);
    const right = new THREE.Vector3().crossVectors(this._flightForward, _up);
    const position = new THREE.Vector3(core.x, core.y, core.z)
      .addScaledVector(this._flightForward, -distance)
      .addScaledVector(right, distance * 0.44);
    position.y += distance * 0.38;
    position.y = Math.max(this.environment.groundY + 1.4, position.y);
    const target = new THREE.Vector3(core.x, core.y + 0.25, core.z).addScaledVector(this._flightForward, 3.8);
    this.camera.position.lerp(position, 1 - Math.exp(-dt * 2.2));
    this.controls.target.lerp(target, 1 - Math.exp(-dt * 3.4));
  }

  _focusPoint() {
    if (this.simulation && this.mode === 'play') {
      const pos = this.simulation.corePosition;
      const center = new THREE.Vector3(pos.x, Math.max(0.7, pos.y), pos.z);
      if (this.environment.kind === 'air') return center.addScaledVector(this._flightForward, this._view === 'iso' ? 3.8 : 0);
      if (this.environment.kind === 'water' || this.simulation.checkpoints?.length) {
        const next = this.simulation.checkpoints?.[this.simulation.checkpointIndex || 0];
        if (next && this._view === 'iso') {
          _normal.copy(next.position).sub(center);
          _normal.y = 0;
          center.add(_normal.multiplyScalar(0.4).clampLength(0, 6));
        }
        return center;
      }
      const targets = (this.simulation.targets || []).filter(target => !target.dead);
      if (this._view === 'iso' && targets.length) {
        const ahead = new THREE.Vector3();
        for (const target of targets) ahead.add(target.body.position);
        ahead.multiplyScalar(1 / targets.length).sub(center);
        ahead.y = 0;
        ahead.multiplyScalar(0.4).clampLength(0, 9);
        center.add(ahead);
      } else if (this._view === 'iso') center.z -= 2.5;
      return center;
    }
    if (!this.parts.length) return new THREE.Vector3(0, 0.8, -4.2);
    const center = new THREE.Vector3();
    this.parts.forEach(part => center.add(new THREE.Vector3(part.x, part.y + Y_OFFSET, part.z)));
    center.multiplyScalar(1 / this.parts.length);
    center.y = Math.max(0.8, center.y);
    center.z -= 3.2;
    return center;
  }

  setView(view) {
    this._view = ['iso', 'top', 'front'].includes(view) ? view : 'iso';
    this._flightChaseEnabled = this._view === 'iso';
    const bounds = new THREE.Box3();
    const expand = (position, half) => {
      bounds.expandByPoint(new THREE.Vector3(position.x - half.x, position.y - half.y, position.z - half.z));
      bounds.expandByPoint(new THREE.Vector3(position.x + half.x, position.y + half.y, position.z + half.z));
    };
    for (const part of this.parts) {
      const position = this.simulation?.bodies.get(part.id)?.position || { x: part.x, y: part.y + Y_OFFSET, z: part.z };
      expand(position, { x: 0.75, y: 0.9, z: 0.9 });
    }
    if (this._view === 'iso') {
      const targets = this.simulation ? this.simulation.targets.filter(target => !target.dead) : this._missionLayout?.targets || [];
      for (const target of targets) {
        const position = target.body?.position || target.position;
        expand(position, { x: target.size.x / 2 + 0.4, y: target.size.y / 2 + 0.9, z: target.size.z / 2 + 0.4 });
      }
      const checkpoints = this.simulation?.checkpoints || this._routeCheckpoints || [];
      const next = checkpoints[Math.min(this.simulation?.checkpointIndex || 0, checkpoints.length - 1)];
      if (next) {
        // Frame the machine and its next objective. Fitting the whole distant
        // route would reduce a flyable machine to a tiny dot on small screens.
        const land = this.environment.kind === 'land';
        const height = land ? next.position.y + next.radius + 0.9 - this.environment.groundY : null;
        const position = this.environment.kind === 'water' ? { x: next.position.x, y: (this.environment.waterLevel ?? next.position.y) + 0.7, z: next.position.z }
          : land ? { x: next.position.x, y: this.environment.groundY + height / 2, z: next.position.z } : next.position;
        expand(position, { x: next.radius + 0.45, y: this.environment.kind === 'water' ? 1.2 : land ? height / 2 : next.radius + 0.9, z: 0.5 });
      }
    }
    if (bounds.isEmpty()) expand({ x: 0, y: 0.8, z: -2 }, { x: 3, y: 1, z: 5 });
    const target = bounds.getCenter(new THREE.Vector3());
    target.y = Math.max(0.8, target.y);
    const direction = this._view === 'top' ? new THREE.Vector3(0, 1, 0.003) : this._view === 'front' ? new THREE.Vector3(0, 0.15, -1).normalize() : new THREE.Vector3(12, 12.7, 23.2).normalize();
    const right = new THREE.Vector3().crossVectors(_up, direction).normalize();
    const vertical = new THREE.Vector3().crossVectors(direction, right).normalize();
    const width = this.container.clientWidth || 960;
    const safeX = width > 1000 ? Math.max(0.56, 1 - 480 / width) : 0.83;
    const safeY = width <= 760 ? 0.67 : 0.79;
    const tanY = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const tanX = tanY * Math.max(0.3, this.camera.aspect);
    let distance = this._view === 'iso' ? 20 : this._view === 'top' ? 12 : 11;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const relative = new THREE.Vector3(x, y, z).sub(target);
      const depth = relative.dot(direction);
      distance = Math.max(distance, depth + Math.abs(relative.dot(right)) / (tanX * safeX), depth + Math.abs(relative.dot(vertical)) / (tanY * safeY));
    }
    distance = Math.min(82, distance + 1.0);
    this._cameraTween = { position: target.clone().addScaledVector(direction, distance), target, time: 0 };
    this._followPause = 2;
  }

  focus() { this.setView(this._view); }

  resize() {
    if (this._disposed) return;
    const width = Math.max(1, this.container.clientWidth || 640);
    const height = Math.max(1, this.container.clientHeight || 480);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this._lastSize && (Math.abs(this._lastSize.width - width) > 20 || Math.abs(this._lastSize.height - height) > 20) && this.parts.length) this.setView(this._view);
    this._lastSize = { width, height };
  }

  update(dt = 1 / 60) {
    if (this._disposed) return;
    dt = Math.max(0, Math.min(Number.isFinite(dt) ? dt : 1 / 60, 0.08));
    this._elapsed += dt;
    this._followPause = Math.max(0, this._followPause - dt);
    this._dryFireFlash = Math.max(0, this._dryFireFlash - dt);
    for (const root of this.partRoots.values()) if (root.userData.hitFlash) root.userData.hitFlash = Math.max(0, root.userData.hitFlash - dt);
    for (const [key, until] of this._recentBreaks) if (this._elapsed >= until) this._recentBreaks.delete(key);
    if (this.simulation) this._syncSimulation();
    this._updateEnvironment(dt);
    if (this._cameraTween) {
      const tween = this._cameraTween;
      const blend = 1 - Math.exp(-dt * 9);
      this.camera.position.lerp(tween.position, blend);
      this.controls.target.lerp(tween.target, blend);
      tween.time += dt;
      if (tween.time > 1.1) { this.camera.position.copy(tween.position); this.controls.target.copy(tween.target); this._cameraTween = null; }
    } else if (this.mode === 'play' && this.simulation && this._followPause <= 0) {
      if (this.environment.kind === 'air' && this._view === 'iso' && this._flightChaseEnabled) this._followFlight(dt);
      else {
        const target = this._focusPoint();
        const delta = target.sub(this.controls.target).multiplyScalar(1 - Math.exp(-dt * 1.8));
        this.camera.position.add(delta);
        this.controls.target.add(delta);
      }
    }
    this.controls.update();
    for (const indicator of this.indicatorGroup.children) if (indicator.visible) indicator.quaternion.copy(this.camera.quaternion);
    if (this.mode === 'build') this._updateHover();
    if (this.mode === 'build') this._updatePistons();
    this._updateSelections();
    this._updateRoute();
    this._updateAim();
    this._updateConnections();
    if (this.simulation) this._updateCouplings();
    this._updateEffects(dt);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    for (const [type, callback, options] of this._listeners) this.renderer.domElement.removeEventListener(type, callback, options);
    this._resizeObserver?.disconnect();
    this.controls.removeEventListener('start', this._controlStart);
    this.controls.dispose();
    this._releaseInstances(this.scene);
    for (const resource of this._resources) resource.dispose?.();
    this._resources.clear();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
