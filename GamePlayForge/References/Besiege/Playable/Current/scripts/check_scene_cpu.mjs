import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { GameScene } from '../dist/scene.js';
import { Simulation, getMissionLayout } from '../dist/physics.js';
import { makePreset } from '../dist/parts.js';

// Actual Three scene objects and game methods, with only the DOM canvas,
// OrbitControls input backend and WebGL draw backend replaced for CPU checks.
class CpuCanvas extends EventTarget {
  constructor(container) { super(); this.container = container; this.style = {}; this.attributes = {}; this.tagName = 'CANVAS'; this.children = []; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  getBoundingClientRect() { return { left: 0, top: 0, right: this.container.clientWidth, bottom: this.container.clientHeight, width: this.container.clientWidth, height: this.container.clientHeight }; }
  remove() {}
}

export function createCpuScene(container = { clientWidth: 1280, clientHeight: 720 }, callbacks = {}) {
  globalThis.window ||= { devicePixelRatio: 1 };
  const s = Object.create(GameScene.prototype);
  Object.assign(s, {
    _resources: new Set(), _geometries: new Map(), _materials: new Map(), parts: [], partRoots: new Map(), partData: new Map(), occupied: new Map(), pickables: [],
    targetRoots: new Map(), projectileRoots: new Map(), obstacleRoots: new Map(), enemyRoots: new Map(), targetIndicators: new Map(), partIndicators: new Map(), routeMarkers: new Map(), _recentBreaks: new Map(),
    mode: 'build', tool: null, rotation: 0, mission: 'outpost', environment: { kind: 'land', groundY: 0, waterLevel: null }, simulation: null, selectedId: null, selectedIds: new Set(), reviewIds: new Set(), mirror: false, excludedPartId: null, ghostElevation: 0,
    connectionsVisible: false, stressVisible: false, stressMode: 'load', aimVisible: true, quality: 'high', diagnostics: { centerOfMass: null, disconnectedIds: new Set() }, _elapsed: 0, _nextAimAt: 0, _dryFireFlash: 0, _view: 'iso',
    _pointerInside: false, _pointer: new THREE.Vector2(), _pointers: new Set(), _hoverKey: '', callbacks, _particles: [], _smokes: [], _disposed: false, _followPause: 0, _listeners: [],
    _flightChaseEnabled: true, _flightForward: new THREE.Vector3(0, 0, -1), camera: new THREE.PerspectiveCamera(43, container.clientWidth / container.clientHeight, .1, 280), container,
    raycaster: new THREE.Raycaster(), groundPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -.035),
  });
  const canvas = new CpuCanvas(container);
  s.renderer = { domElement: canvas, setSize() {}, render() {}, setPixelRatio() {}, shadowMap: {}, dispose() {} };
  s.scene = new THREE.Scene(); s.scene.background = new THREE.Color('#e3e9e2'); s.scene.fog = new THREE.Fog('#e3e9e2', 42, 105);
  for (const key of ['designGroup', 'previewGroup', 'runtimeGroup', 'sceneryGroup', 'fxGroup', 'indicatorGroup', 'environmentGroup', 'routeGroup']) { s[key] = new THREE.Group(); s.scene.add(s[key]); }
  s.controls = { target: new THREE.Vector3(), update() { s.camera.lookAt(this.target); s.camera.updateMatrixWorld(); }, addEventListener() {}, removeEventListener() {}, dispose() {} };
  s._createLighting(); s._createLandscape(); s._createGrid(); s._createOverlays(); s._createAimOverlays(); s._createDiagnostics(); s._createAltitudeGuide();
  s.smokeTexture = s._own(new THREE.Texture()); // CPU-only substitute for the constructor's painted canvas texture.
  s.particleMesh = new THREE.InstancedMesh(s._geometry('debris', () => new THREE.BoxGeometry(1, 1, 1)), s._material('test-debris', '#ffffff'), 280); s.fxGroup.add(s.particleMesh);
  s._bindInput(); s.setMission('outpost');
  return s;
}

function near(a, b, tolerance = 1e-7) { assert.ok(a.distanceTo(b) < tolerance, `points differ by ${a.distanceTo(b)}`); }

export function runSceneChecks() {
  const picks = [];
  const s = createCpuScene(undefined, { onSelect: (id, options) => picks.push({ id, options }) });
  const parts = makePreset('lift'), piston = parts.find(p => p.type === 'piston'), payload = parts.find(p => p.type === 'wood');
  s.setDesign(parts); s.setMission('sandbox');
  s.setSelections([piston.id, payload.id, 'missing', piston.id], piston.id);
  assert.equal(s.selectedIds.size, 2); assert.equal(s.selectedId, piston.id); assert.equal(s.secondarySelectionLines.geometry.drawRange.count, 24);
  s.setReviewHighlights([piston.id, payload.id, 'missing']); assert.equal(s.reviewOutlineLines.geometry.drawRange.count, 48);
  s.setDesign(parts); assert.equal(s.selectedIds.size, 2, 'group selection survives a design refresh');
  s.setSelection(payload.id); assert.equal(s.selectedIds.size, 1); assert.equal(s.selectedId, payload.id);
  s.setSelections([piston.id, payload.id], piston.id);
  const sim = new Simulation({ parts, mission: 'sandbox' });
  s.setMode('play'); s.setSimulation(sim); s.update(0);
  assert.equal(s.selectionOutline.visible, true); assert.equal(s.secondarySelectionLines.visible, true); assert.equal(s.reviewOutlineLines.visible, false);
  assert.equal(s.partIndicators.get(piston.id).userData.connectedDot.visible, true);
  assert.equal(s.mechanismGuide.visible, true);
  const edge = sim.connections.find(edge => edge.kind === 'piston');
  const root = s.partRoots.get(piston.id), rod = root.userData.pistonRod;
  function verifyEndpoints() {
    s._syncSimulation(); s.designGroup.updateMatrixWorld(true);
    const support = sim.bodies.get(edge.a), head = sim.bodies.get(piston.id);
    const expectedBase = new THREE.Vector3(0, .46, 0).applyQuaternion(support.quaternion).add(support.position);
    const expectedHead = new THREE.Vector3(0, -.20, 0).applyQuaternion(head.quaternion).add(head.position);
    near(rod.localToWorld(new THREE.Vector3(0, -.5, 0)), expectedBase);
    near(rod.localToWorld(new THREE.Vector3(0, .5, 0)), expectedHead);
  }
  for (let i = 0; i < 96; i++) sim.step(1 / 120, {});
  verifyEndpoints(); const restingLength = rod.scale.y;
  for (let i = 0; i < 312; i++) { sim.step(1 / 120, { actuate: 1 }); if (i % 4 === 3) s.update(1 / 30); }
  verifyEndpoints(); assert.ok(rod.scale.y > restingLength + 1.49); assert.ok(sim.getPistonState(piston.id).extension > 1.49);
  for (let i = 0; i < 120; i++) sim.step(1 / 120, {});
  verifyEndpoints();
  for (let i = 0; i < 312; i++) sim.step(1 / 120, { actuate: -1 });
  verifyEndpoints(); assert.ok(Math.abs(rod.scale.y - restingLength) < .01);
  const originalStress = edge.stress, originalHealth = edge.health;
  edge.stress = 0; edge.health = .1; s.setStressVisible(true); s.setStressMode('load');
  const index = sim.connections.indexOf(edge), colors = s.connectionLines.geometry.getAttribute('color');
  const loadColor = [colors.getX(index * 2), colors.getY(index * 2), colors.getZ(index * 2)];
  s.setStressMode('damage'); const damageColor = [colors.getX(index * 2), colors.getY(index * 2), colors.getZ(index * 2)];
  assert.notDeepEqual(loadColor, damageColor, 'low instantaneous load must remain distinct from high accumulated damage');
  edge.stress = originalStress; edge.health = originalHealth;
  const oldRaycaster = s.raycaster;
  let candidates;
  s.raycaster = { setFromCamera() {}, intersectObjects(objects) { candidates = objects; return [{ object: root.userData.pistonBaseProxy }]; } };
  const dispatch = (type, extra = {}) => { const event = new Event(type, { cancelable: true }); Object.assign(event, { pointerId: 1, button: 0, clientX: 40, clientY: 40, ...extra }); s.renderer.domElement.dispatchEvent(event); };
  dispatch('pointerdown'); dispatch('pointerup', { shiftKey: true }); assert.deepEqual(picks.at(-1), { id: piston.id, options: { additive: true } });
  dispatch('pointerdown'); dispatch('pointerup'); assert.equal(picks.at(-1).options.additive, false);
  const pickCount = picks.length; dispatch('pointerdown'); dispatch('pointermove', { clientX: 70 }); dispatch('pointerup', { clientX: 70 }); assert.equal(picks.length, pickCount, 'camera drags do not select');
  // Pure transform fixture, independent of the real travel test above.
  const support = sim.bodies.get(edge.a), head = sim.bodies.get(piston.id);
  const supportQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(.38, .4, -.25)); support.quaternion.copy(supportQ);
  support.position.set(3, 2, -4); const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(supportQ);
  head.position.copy(new THREE.Vector3().copy(support.position).addScaledVector(axis, 2.2)); head.quaternion.copy(supportQ);
  verifyEndpoints();
  edge.broken = true; s._syncSimulation(); assert.equal(rod.visible, false); assert.equal(root.userData.pistonBase.visible, false); s._pickPart(); assert.ok(!candidates.includes(root.userData.pistonBaseProxy));
  s.raycaster = oldRaycaster; s._pointerInside = false;
  s.setSimulation(null); sim.dispose(); s.setMode('build'); s.setDesign(parts);
  assert.equal(s.reviewOutlineLines.visible, true); assert.equal(s.selectedIds.size, 2); assert.equal(s.partIndicators.size, 0); assert.equal(s.secondarySelectionLines.visible, true);
  s.setReviewHighlights([]); assert.equal(s.reviewOutlineLines.visible, false); assert.equal(s.secondarySelectionLines.visible, true);
  s.setSelections([], null); assert.equal(s.selectionOutline.visible, false); assert.equal(s.mechanismGuide.visible, false);
  console.log('PASS actual piston extension/hold/retraction, rotated-frame endpoints, broken guide hiding and picking');
  console.log('PASS independent multi selection/review lifecycle, play additive picks, drag rejection and load/damage separation');
  s.setDesign(makePreset('ram')); s.setMission('switchback');
  assert.equal(s.routeMarkers.size, 4); assert.equal(s.sceneryGroup.visible, false); assert.equal(s.routeClouds, null);
  const layout = getMissionLayout('switchback');
  for (const checkpoint of layout.checkpoints) {
    const marker = s.routeMarkers.get(checkpoint.id); near(marker.position, new THREE.Vector3().copy(checkpoint.position));
    const arch = marker.children.find(object => object.geometry?.type === 'TorusGeometry'); assert.ok(Math.abs(arch.geometry.parameters.arc - Math.PI) < 1e-12);
  }
  const routePositions = s.routeLine.geometry.getAttribute('position');
  for (let i = 0; i < routePositions.count; i++) assert.ok(Math.abs(routePositions.getY(i) - .045) < 1e-7);
  for (const [width, height] of [[390, 684], [700, 320], [1440, 780]]) {
    s.container.clientWidth = width; s.container.clientHeight = height; s.resize(); s.setView('iso');
    s.camera.position.copy(s._cameraTween.position); s.camera.lookAt(s._cameraTween.target); s.camera.updateMatrixWorld();
    for (const part of s.parts) { const point = new THREE.Vector3(part.x, part.y + .72, part.z).project(s.camera); assert.ok(Math.abs(point.x) < .9 && Math.abs(point.y) < .85); }
    const checkpoint = layout.checkpoints[0];
    for (const x of [-checkpoint.radius, checkpoint.radius]) for (const y of [0, checkpoint.position.y + checkpoint.radius + .8]) { const point = new THREE.Vector3(checkpoint.position.x + x, y, checkpoint.position.z).project(s.camera); assert.ok(Math.abs(point.x) < .9 && Math.abs(point.y) < .85); }
  }
  let baseline;
  for (let cycle = 0; cycle < 4; cycle++) { for (const mission of ['harbor', 'skyway', 'switchback', 'outpost']) s.setMission(mission); if (cycle === 1) baseline = s._resources.size; if (cycle > 1) assert.equal(s._resources.size, baseline); }
  s.dispose(); console.log('PASS grounded driving gates, all three viewport fits, repeated environment resource cleanup');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runSceneChecks();
