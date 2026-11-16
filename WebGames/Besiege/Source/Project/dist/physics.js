import * as CANNON from './vendor/cannon-es.js';
import { PARTS, MISSIONS, getConnections, getDesignStats } from './parts.js';
import { LinearActuatorConstraint } from './linear-actuator.js';

// All positions are metres. The editor's cell centres sit 0.72 m above ground.
// Wheel geometry is aligned in the SHAPE, not in the body, so a renderer can
// copy body.quaternion directly onto a part with a local X axle.
const STEP = 1 / 120;
const MAX_STEPS = 12;
const CELL_HEIGHT = 0.72;
const GROUP = { ground: 1, machine: 2, target: 4, projectile: 8, obstacle: 16 };
const ALL = 31;
const UP = new CANNON.Vec3(0, 1, 0);
const X_AXIS = new CANNON.Vec3(1, 0, 0);
const FORWARD = new CANNON.Vec3(0, 0, -1);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const xyz = (v) => ({ x: v.x, y: v.y, z: v.z });
const RELOAD_TIME = 0.65;
const DEG = Math.PI / 180;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

// A checkpoint is a world-Z hoop, not an invisible volume ahead of the hoop.
// Sweeping the core segment through its plane catches even a fast crossing.
export function segmentCrossesCheckpoint(from, to, checkpoint) {
  if (!from || !to || !checkpoint?.position) return false;
  const values = [from.x, from.y, from.z, to.x, to.y, to.z,
    checkpoint.position.x, checkpoint.position.y, checkpoint.position.z, checkpoint.radius];
  if (!values.every(Number.isFinite) || checkpoint.radius <= 0) return false;
  const dz = to.z - from.z;
  if (Math.abs(dz) < 1e-10) return false;
  const t = (checkpoint.position.z - from.z) / dz;
  if (t < 0 || t > 1) return false;
  const x = from.x + (to.x - from.x) * t;
  const y = from.y + (to.y - from.y) * t;
  if (Number.isFinite(checkpoint.minAltitude) && y < checkpoint.minAltitude) return false;
  return (x - checkpoint.position.x) ** 2 + (y - checkpoint.position.y) ** 2 <= checkpoint.radius ** 2;
}

/** Shared by the build preview and simulation: never duplicate target layouts. */
export function getMissionLayout(mission = 'outpost') {
  const targets = [];
  const obstacles = [];
  const enemies = [];
  const checkpoints = [];
  const environment = { kind: mission === 'harbor' ? 'water' : mission === 'skyway' ? 'air' : 'land',
    groundY: mission === 'harbor' ? -5 : 0, waterLevel: mission === 'harbor' ? 0.45 : null };
  const add = (x, y, z, size, hp = 52, kind = 'stone') => {
    targets.push({ id: `target-${targets.length}`, position: { x, y, z }, size, hp, kind });
  };
  if (mission === 'switchback') {
    for (const [i, [x, z]] of [[-5, -10], [5, -23], [-5, -36], [5, -49]].entries()) {
      checkpoints.push({ id: `checkpoint-${i + 1}`, position: { x, y: 0.7, z }, radius: 3 });
    }
  } else if (mission === 'harbor') {
    for (const [i, z] of [-12, -26, -40].entries()) {
      checkpoints.push({ id: `checkpoint-${i + 1}`, position: { x: 0, y: 0.45, z }, radius: 4 });
    }
    // Banks leave a genuinely open channel and do not support the boat.
    for (const x of [-11, 11]) obstacles.push({ position: { x, y: -2.15, z: -23 },
      size: { x: 5, y: 5.7, z: 58 }, kind: 'bank' });
  } else if (mission === 'skyway') {
    for (const [i, [y, z, minAltitude]] of [[5, -22, 2.5], [8, -38, 4.5], [10, -54, 6.5]].entries()) {
      checkpoints.push({ id: `checkpoint-${i + 1}`, position: { x: 0, y, z }, radius: 4, minAltitude });
    }
  } else if (mission === 'sandbox') {
    obstacles.push(
      { position: { x: 5, y: 0.35, z: -7 }, size: { x: 3, y: 0.7, z: 1 }, kind: 'stone' },
      { position: { x: 5, y: 0.6, z: -9 }, size: { x: 3, y: 1.2, z: 1 }, kind: 'stone' },
      { position: { x: -7, y: 0.7, z: -12 }, size: { x: 2, y: 1.4, z: 2 }, kind: 'stone' },
    );
  } else if (mission === 'citadel') {
    for (const [x, z] of [[-7, -21], [-3.5, -19], [0, -22], [3.5, -19], [7, -21]]) {
      for (let layer = 0; layer < 3; layer++) {
        add(x, 0.6 + layer * 1.21, z, { x: 1.25, y: 1.2, z: 1.15 }, 62, 'citadel');
      }
    }
    for (const [i, targetId] of ['target-2', 'target-8', 'target-14'].entries()) {
      enemies.push({ id: `enemy-${i}`, targetId, firstShotAt: 8 + i * 1.25,
        interval: 4.6, telegraphDuration: 1.25, power: 1 });
    }
    for (const x of [-5, 5]) {
      obstacles.push({ position: { x, y: 1.35, z: -8 },
        size: { x: 2.8, y: 2.7, z: 1.3 }, kind: 'cover' });
    }
  } else if (mission === 'gate') {
    // Dynamic columns support a mortared, breakable lintel. The opening really
    // is empty; aim at a pillar, or drive around it, rather than an invisible wall.
    const size = { x: 1.18, y: 1.12, z: 1.08 };
    for (const x of [-1.8, 1.8]) {
      for (let layer = 0; layer < 3; layer++) {
        add(x, 0.56 + layer * 1.13, -15, { ...size }, 62, 'pillar');
      }
    }
    for (const x of [-1.2, 0, 1.2]) {
      add(x, 3.95, -15, { ...size, x: 1.2 }, 56, 'lintel');
    }
    add(0, 5.08, -15, { ...size }, 52, 'keystone');
    for (const [i, targetId] of ['target-2', 'target-5'].entries()) {
      enemies.push({ id: `enemy-${i}`, targetId, firstShotAt: 8.5 + i * 1.4,
        interval: 5.1, telegraphDuration: 1.25, power: 0.85 });
    }
    for (const x of [-6, 6]) {
      obstacles.push({ position: { x, y: 1.25, z: -6 },
        size: { x: 2.6, y: 2.5, z: 1.25 }, kind: 'cover' });
    }
  } else {
    // The centre column lies on the initial horizontal cannon's ballistic arc.
    // The two side columns require turret aiming or driving/repositioning.
    for (const x of [-3.6, 0, 3.6]) {
      for (let layer = 0; layer < 3; layer++) {
        add(x, 0.55 + layer * 1.11, -12, { x: 1.12, y: 1.1, z: 1.05 });
      }
    }
    enemies.push({ id: 'enemy-0', targetId: 'target-5', firstShotAt: 10,
      interval: 5.6, telegraphDuration: 1.4, power: 0.65 });
  }
  return { targets, obstacles, enemies, environment, checkpoints };
}

export class Simulation {
  constructor({ parts = [], mission = 'outpost', onEvent = () => {} } = {}) {
    this.parts = parts.slice(0, 100).map((part) => ({ ...part }));
    this.mission = MISSIONS.some((item) => item.id === mission) ? mission : 'outpost';
    this._mission = MISSIONS.find((item) => item.id === this.mission);
    this._layout = getMissionLayout(this.mission);
    this.environment = { ...this._layout.environment };
    this.checkpoints = this._layout.checkpoints.map((point) => ({ ...point, position: { ...point.position }, passed: false }));
    this.checkpointIndex = 0;
    this.onEvent = onEvent;
    this.bodies = new Map();
    this.targets = [];
    this.projectiles = [];
    this.connections = [];
    this.obstacles = [];
    this.enemies = [];
    this.partStates = new Map();
    this.elapsed = 0;
    this.shots = 0;
    this.brokenCount = 0;
    this.destroyedCount = 0;
    this.targetCount = 0;
    this.won = false;
    this.failed = false;
    this.failReason = '';
    this.outcome = null;
    this.result = null;
    this.cost = getDesignStats(this.parts).cost;
    this.ammoCapacity = Number.isFinite(this._mission.ammo) ? Math.max(0, Math.floor(this._mission.ammo)) : null;
    this.ammoRemaining = this.ammoCapacity;
    this._timeLimit = Number.isFinite(this._mission.timeLimit) ? Math.max(0, this._mission.timeLimit) : null;
    this.timeRemaining = this._timeLimit;
    this.disposed = false;
    this._accumulator = 0;
    this._lastFireInput = false;
    this._nextFireAt = 0;
    this._projectileSerial = 0;
    this._drive = { forward: 0, turn: 0, turret: 0, aim: 0, pitch: 0, roll: 0, actuate: 0, brake: false, assist: true };
    this._propellerPower = new Map();
    this._assistedHeading = null;
    this._submergedTime = 0;
    this._hasFluidParts = this.parts.some((part) => ['float', 'propeller', 'wing'].includes(part.type));
    this._aimOffset = 0;
    this._aimGuideCache = null;
    this._wheelJoints = [];
    this._turretJoints = [];
    this._pistonJoints = [];
    this._pistonByPart = new Map();
    this._targetJoints = [];
    this._removeBodies = new Set();
    this._pendingImpacts = [];
    this._contactTimes = new Map();
    this._bodyEdges = new Map();
    this._pendingPartDeaths = new Set();
    this._connectivityDirty = true;
    this._initialPartCount = 0;
    this._core = null;

    const world = this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    world.allowSleep = true;
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.solver.iterations = 24;
    world.solver.tolerance = 0.0001;
    world.defaultContactMaterial.friction = 0.42;
    world.defaultContactMaterial.restitution = 0.02;
    world.defaultContactMaterial.contactEquationStiffness = 1e7;
    world.defaultContactMaterial.contactEquationRelaxation = 4;
    this._groundMaterial = new CANNON.Material('ground');
    this._machineMaterial = new CANNON.Material('machine');
    this._wheelMaterial = new CANNON.Material('wheel');
    this._stoneMaterial = new CANNON.Material('stone');
    this._shellMaterial = new CANNON.Material('shell');
    world.addContactMaterial(new CANNON.ContactMaterial(this._groundMaterial, this._wheelMaterial, {
      friction: 0.72, restitution: 0, contactEquationStiffness: 1e7,
      contactEquationRelaxation: 4, frictionEquationStiffness: 1e7,
    }));
    world.addContactMaterial(new CANNON.ContactMaterial(this._groundMaterial, this._stoneMaterial, {
      friction: 0.65, restitution: 0.03,
    }));
    world.addContactMaterial(new CANNON.ContactMaterial(this._stoneMaterial, this._stoneMaterial, {
      friction: 0.65, restitution: 0.02,
    }));
    const ground = new CANNON.Body({ mass: 0, material: this._groundMaterial,
      collisionFilterGroup: GROUP.ground, collisionFilterMask: ALL });
    ground.addShape(new CANNON.Plane());
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    ground.position.y = this.environment.groundY;
    ground.userData = { type: 'ground' };
    world.addBody(ground);
    this.ground = ground;

    this._createMachine();
    this._initialPartCount = this.bodies.size;
    this._refreshConnectivity();
    this._createMission();
  }

  _emit(event) {
    if (!this.disposed) this.onEvent({ time: this.elapsed, ...event });
  }

  _createMachine() {
    const cylinderOrientation = new CANNON.Quaternion();
    cylinderOrientation.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI / 2);
    for (const part of this.parts) {
      if (!part.id || !PARTS[part.type]) continue;
      if (![part.x, part.y, part.z].every(Number.isFinite)) continue;
      const body = new CANNON.Body({
        mass: PARTS[part.type].mass,
        material: part.type === 'wheel' ? this._wheelMaterial : this._machineMaterial,
        position: new CANNON.Vec3(part.x, part.y + CELL_HEIGHT, part.z),
        linearDamping: 0.045,
        angularDamping: part.type === 'wheel' ? 0.025 : 0.14,
        allowSleep: false,
        collisionFilterGroup: GROUP.machine,
        collisionFilterMask: ALL,
      });
      body.quaternion.setFromAxisAngle(UP, ((part.rot || 0) % 4) * Math.PI / 2);
      if (part.type === 'wheel') {
        body.addShape(new CANNON.Cylinder(0.65, 0.65, 0.34, 20), undefined, cylinderOrientation);
      } else if (part.type === 'cannon') {
        body.addShape(new CANNON.Box(new CANNON.Vec3(0.35, 0.30, 0.53)));
      } else if (part.type === 'hinge') {
        body.addShape(new CANNON.Box(new CANNON.Vec3(0.36, 0.36, 0.36)));
      } else if (part.type === 'piston') {
        body.addShape(new CANNON.Box(new CANNON.Vec3(0.34, 0.20, 0.34)));
      } else if (part.type === 'float') {
        body.addShape(new CANNON.Box(new CANNON.Vec3(0.46, 0.42, 0.46)));
      } else if (part.type === 'propeller') {
        body.addShape(new CANNON.Box(new CANNON.Vec3(0.28, 0.28, 0.40)));
        this._propellerPower.set(part.id, 0);
      } else if (part.type === 'wing') {
        const incidence = new CANNON.Quaternion();
        incidence.setFromAxisAngle(X_AXIS, clamp(finite(part.elevation, 6), -10, 45) * DEG);
        body.addShape(new CANNON.Box(new CANNON.Vec3(0.49, 0.08, 0.43)), undefined, incidence);
      } else {
        body.addShape(new CANNON.Box(new CANNON.Vec3(0.46, 0.46, 0.46)));
      }
      body.userData = { id: part.id, type: part.type, part };
      const maxHp = PARTS[part.type].maxHp;
      this.partStates.set(part.id, { hp: maxHp, maxHp, dead: false, connected: false });
      body.addEventListener('collide', (event) => this._onMachineCollision(body, event));
      this.world.addBody(body);
      this.bodies.set(part.id, body);
      this._bodyEdges.set(part.id, []);
      if (!this._core && part.type === 'core') this._core = body;
    }
    this._core ||= this.bodies.values().next().value || null;

    for (const link of getConnections(this.parts)) {
      const bodyA = this.bodies.get(link.a), bodyB = this.bodies.get(link.b);
      if (!bodyA || !bodyB) continue;
      let constraint;
      if (link.kind === 'piston') {
        constraint = new LinearActuatorConstraint(bodyA, bodyB, {
          stroke: clamp(finite(bodyB.userData.part.stroke, 1.5), 0.25, 2),
          force: 120 * clamp(finite(bodyB.userData.part.power, 1), 0.3, 2), timeStep: STEP,
        });
      } else if (link.kind === 'wheel' || link.kind === 'hinge') {
        const worldAxis = link.kind === 'wheel'
          ? bodyB.vectorToWorldFrame(X_AXIS) : new CANNON.Vec3(0, 1, 0);
        // The wheel pivots at its own centre, while a turret rotates around its
        // lower bearing. Anchors use each body's LOCAL frame, including yaw.
        const anchor = bodyB.position.clone();
        if (link.kind === 'hinge') anchor.y -= 0.5;
        constraint = new CANNON.HingeConstraint(bodyA, bodyB, {
          pivotA: bodyA.pointToLocalFrame(anchor),
          pivotB: bodyB.pointToLocalFrame(anchor),
          axisA: bodyA.vectorToLocalFrame(worldAxis),
          axisB: bodyB.vectorToLocalFrame(worldAxis),
          maxForce: 1e6,
          collideConnected: false,
        });
        constraint.enableMotor();
        constraint.setMotorSpeed(0);
        constraint.setMotorMaxForce(link.kind === 'wheel' ? 16 : 35);
      } else {
        constraint = new CANNON.LockConstraint(bodyA, bodyB, { maxForce: 1e6 });
        constraint.collideConnected = false;
      }
      for (const equation of constraint.equations) equation.setSpookParams(1e7, 4, STEP);
      if (link.kind === 'piston') constraint.actuatorEquation.setSpookParams(5e5, 4, STEP);
      const edge = {
        a: link.a, b: link.b, kind: link.kind, broken: false, constraint,
        strength: Number.isFinite(link.strength) ? link.strength : 1400,
        health: 1, stress: 0, overloadTime: 0, speed: 0,
      };
      this.connections.push(edge);
      this._bodyEdges.get(link.a).push(edge);
      this._bodyEdges.get(link.b).push(edge);
      this.world.addConstraint(constraint);
      if (link.kind === 'wheel') this._wheelJoints.push(edge);
      if (link.kind === 'hinge') this._turretJoints.push(edge);
      if (link.kind === 'piston') {
        this._pistonJoints.push(edge);
        this._pistonByPart.set(link.b, edge);
      }
    }
  }

  _createMission() {
    const layout = this._layout;
    for (const item of layout.targets) {
      const body = new CANNON.Body({
        mass: 5,
        material: this._stoneMaterial,
        position: new CANNON.Vec3(item.position.x, item.position.y, item.position.z),
        linearDamping: 0.08,
        angularDamping: 0.10,
        allowSleep: true,
        sleepTimeLimit: 1,
        sleepSpeedLimit: 0.10,
        collisionFilterGroup: GROUP.target,
        collisionFilterMask: ALL,
      });
      body.addShape(new CANNON.Box(new CANNON.Vec3(item.size.x / 2, item.size.y / 2, item.size.z / 2)));
      const target = { id: item.id, body, hp: item.hp, maxHp: item.hp, kind: item.kind,
        dead: false, size: { ...item.size } };
      body.userData = { id: item.id, type: 'target', target };
      body.addEventListener('collide', (event) => this._onTargetCollision(target, event));
      this.targets.push(target);
      this.world.addBody(body);
    }
    this.targetCount = this.targets.length;
    for (const definition of layout.enemies || []) {
      const carrier = this.targets.find((target) => target.id === definition.targetId);
      if (!carrier) continue;
      this.enemies.push({ ...definition, body: carrier.body, alive: true,
        telegraph: 0, aim: { ...this.corePosition }, nextFireAt: definition.firstShotAt,
        muzzle: xyz(carrier.body.position), _lockedAim: false });
    }
    if (this.mission === 'gate') {
      // Mortar is represented by ordinary breakable locks. All stones are
      // dynamic, and removing a damaged stone releases its neighbouring locks.
      for (let i = 0; i < this.targets.length; i++) {
        for (let j = i + 1; j < this.targets.length; j++) {
          const a = this.targets[i], b = this.targets[j];
          const d = a.body.position.distanceTo(b.body.position);
          if (d > 1.35) continue;
          const constraint = new CANNON.LockConstraint(a.body, b.body, { maxForce: 2e5 });
          constraint.collideConnected = false;
          for (const eq of constraint.equations) eq.setSpookParams(1e7, 4, STEP);
          this.world.addConstraint(constraint);
          this._targetJoints.push({ a, b, constraint, broken: false });
        }
      }
    }
    for (const item of layout.obstacles) {
      const body = new CANNON.Body({ mass: 0, material: this._stoneMaterial,
        position: new CANNON.Vec3(item.position.x, item.position.y, item.position.z),
        collisionFilterGroup: GROUP.obstacle, collisionFilterMask: ALL });
      body.addShape(new CANNON.Box(new CANNON.Vec3(item.size.x / 2, item.size.y / 2, item.size.z / 2)));
      body.userData = { type: 'obstacle' };
      this.world.addBody(body);
      this.obstacles.push({ body, size: { ...item.size }, kind: item.kind });
    }
  }

  get corePosition() {
    return this._core ? xyz(this._core.position) : { x: 0, y: CELL_HEIGHT, z: 0 };
  }

  get speed() {
    return this._core ? this._core.velocity.length() : 0;
  }

  get coreHp() {
    return this._core?.userData.type === 'core' ? (this.partStates.get(this._core.userData.id)?.hp || 0) : 0;
  }

  get coreMaxHp() {
    return this._core?.userData.type === 'core' ? (this.partStates.get(this._core.userData.id)?.maxHp || 100) : 100;
  }

  get integrity() {
    if (!this._initialPartCount) return 0;
    let remaining = 0;
    for (const state of this.partStates.values()) if (!state.dead && state.connected) remaining++;
    return remaining / this._initialPartCount;
  }

  get objectiveProgress() {
    const kind = this._mission.objective || (this.mission === 'sandbox' ? 'sandbox' : 'destroy');
    if (kind === 'route') return { kind, completed: this.checkpointIndex, total: this.checkpoints.length,
      label: '통과 관문', next: this.checkpoints[this.checkpointIndex] || null };
    return { kind, completed: kind === 'sandbox' ? 0 : this.destroyedCount,
      total: kind === 'sandbox' ? 0 : this.targetCount, label: kind === 'sandbox' ? '자유 시험' : '파괴한 표적', next: null };
  }

  get telemetry() {
    const surface = this.environment.waterLevel ?? this.environment.groundY;
    const body = this._core;
    const forward = body ? body.vectorToWorldFrame(FORWARD) : FORWARD;
    const right = body ? body.vectorToWorldFrame(X_AXIS) : X_AXIS;
    const up = body ? body.vectorToWorldFrame(UP) : UP;
    let throttle = 0, engines = 0;
    for (const [id] of this._propellerPower) {
      if (this._canControl(id)) { throttle += this.getPropellerPower(id); engines++; }
    }
    return {
      altitude: finite((body?.position.y ?? CELL_HEIGHT) - surface),
      verticalSpeed: finite(body?.velocity.y),
      airspeed: finite(body?.velocity.length()),
      submerged: this.environment.waterLevel === null ? 0
        : clamp(finite((this.environment.waterLevel - (body?.position.y ?? CELL_HEIGHT) + 0.46) / 0.92), 0, 1),
      throttle: engines ? finite(throttle / engines) : 0,
      pitch: finite(Math.asin(clamp(forward.y, -1, 1)) / DEG),
      roll: finite(Math.atan2(right.y, up.y) / DEG),
    };
  }

  /** Signed normalized throttle; authored power scales force, not this readout. */
  getPropellerPower(partId) {
    return !this.disposed && this._canControl(partId) ? finite(this._propellerPower.get(partId)) : 0;
  }

  getPistonState(partId) {
    const body = this.bodies.get(partId);
    if (body?.userData.type !== 'piston') return null;
    const edge = this._pistonByPart.get(partId);
    const connected = !!edge && !edge.broken && this._canControl(partId);
    const constraint = edge?.constraint;
    return { extension: finite(constraint?.getExtension()), target: constraint?.target || 0,
      stroke: constraint?.stroke ?? clamp(finite(body.userData.part.stroke, 1.5), 0.25, 2),
      load: connected ? clamp(Math.abs(finite(constraint.actuatorEquation.multiplier))
        / Math.max(0.001, constraint.maxActuatorForce), 0, 1) : 0,
      connected };
  }

  get cannonsReady() {
    return !this.outcome && !this.disposed && this.ammoRemaining !== 0
      && this.elapsed + 1e-6 >= this._nextFireAt && this._liveCannons().length > 0;
  }

  get aimElevation() {
    const cannon = this._liveCannons()[0];
    return cannon ? this.getCannonElevation(cannon.userData.id) : 0;
  }

  getCannonElevation(partId) {
    const body = this.bodies.get(partId);
    if (body?.userData.type !== 'cannon') return 0;
    const authored = Number.isFinite(body.userData.part.elevation) ? body.userData.part.elevation : 0;
    return clamp(authored + this._aimOffset, -10, 45);
  }

  _canControl(partId) {
    // A joint can be removed between render/physics ticks. Do not give its
    // detached motor one extra powered tick while waiting for _afterStep.
    this._refreshConnectivity();
    const state = this.partStates.get(partId);
    return this.coreHp > 0 && !!state && state.hp > 0 && !state.dead && state.connected;
  }

  _liveCannons() {
    return [...this.bodies.values()].filter((body) => body.userData.type === 'cannon'
      && this._canControl(body.userData.id));
  }

  _refreshConnectivity() {
    if (!this._connectivityDirty) return;
    this._connectivityDirty = false;
    for (const state of this.partStates.values()) state.connected = false;
    const coreId = this._core?.userData.type === 'core' ? this._core.userData.id : null;
    const core = this.partStates.get(coreId);
    if (!core || core.dead || core.hp <= 0) return;
    core.connected = true;
    const queue = [coreId];
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      for (const edge of this._bodyEdges.get(id) || []) {
        if (edge.broken) continue;
        const nextId = edge.a === id ? edge.b : edge.a;
        const next = this.partStates.get(nextId);
        if (next && !next.dead && next.hp > 0 && !next.connected) {
          next.connected = true;
          queue.push(nextId);
        }
      }
    }
  }

  _cannonLaunch(cannon) {
    const elevation = this.getCannonElevation(cannon.userData.id);
    const angle = elevation * DEG;
    const direction = cannon.vectorToWorldFrame(new CANNON.Vec3(0, Math.sin(angle), -Math.cos(angle)));
    direction.normalize();
    const offset = direction.scale(1.12);
    const position = cannon.position.vadd(offset);
    const power = clamp(Number(cannon.userData.part.power) || 1, 0.3, 2);
    const speed = 18.5 * Math.sqrt(power);
    const velocity = new CANNON.Vec3();
    cannon.getVelocityAtWorldPoint(position, velocity);
    velocity.vadd(direction.scale(speed), velocity);
    return { position, direction, offset, velocity, power, speed, elevation };
  }

  getAimGuide() {
    const reloadProgress = clamp(1 - (this._nextFireAt - this.elapsed) / RELOAD_TIME, 0, 1);
    const guide = { points: [], impact: null, targetId: null, ready: this.cannonsReady,
      reloadProgress, elevation: this.aimElevation };
    const cannon = this._liveCannons()[0];
    if (!cannon || this.disposed) return guide;
    if (this._aimGuideCache?.time === this.elapsed && this._aimGuideCache.partId === cannon.userData.id
      && this._aimGuideCache.elevation === guide.elevation) {
      return { ...guide, ...this._aimGuideCache.geometry };
    }
    const launch = this._cannonLaunch(cannon);
    let previous = launch.position.clone();
    guide.points.push(xyz(previous));
    const result = new CANNON.RaycastResult();
    // Every sample is four actual physics ticks. The t*(t+h) term matches
    // cannon-es's semi-implicit gravity integration, including inherited motion.
    for (let sample = 1; sample <= 150; sample++) {
      const t = sample / 30;
      const point = launch.position.vadd(launch.velocity.scale(t));
      point.vadd(this.world.gravity.scale(0.5 * t * (t + STEP)), point);
      result.reset();
      this.world.raycastClosest(previous, point, {
        collisionFilterGroup: GROUP.projectile,
        collisionFilterMask: t <= 0.12 ? GROUP.ground | GROUP.target | GROUP.obstacle : ALL,
        skipBackfaces: true,
      }, result);
      if (result.hasHit) {
        guide.impact = xyz(result.hitPointWorld);
        guide.targetId = result.body?.userData.type === 'target' ? result.body.userData.id : null;
        guide.points.push(guide.impact);
        break;
      }
      guide.points.push(xyz(point));
      previous = point;
      if (point.y < -2) break;
    }
    this._aimGuideCache = { time: this.elapsed, partId: cannon.userData.id, elevation: guide.elevation,
      geometry: { points: guide.points, impact: guide.impact, targetId: guide.targetId } };
    return guide;
  }

  step(dt, input = {}) {
    if (this.disposed || this.outcome || !Number.isFinite(dt) || dt <= 0) return;
    this._drive.forward = clamp(Number(input.forward) || 0, -1, 1);
    this._drive.turn = clamp(Number(input.turn) || 0, -1, 1);
    this._drive.turret = clamp(Number(input.turret) || 0, -1, 1);
    this._drive.aim = clamp(Number(input.aim) || 0, -1, 1);
    this._drive.pitch = clamp(Number(input.pitch) || 0, -1, 1);
    this._drive.roll = clamp(Number(input.roll) || 0, -1, 1);
    this._drive.actuate = clamp(Number(input.actuate) || 0, -1, 1);
    this._drive.brake = !!input.brake;
    this._drive.assist = input.assist !== false;
    if (input.fire && !this._lastFireInput) this.fire();
    this._lastFireInput = !!input.fire;
    this._accumulator = Math.min(this._accumulator + Math.min(dt, 0.1), STEP * MAX_STEPS);
    let steps = 0;
    while (!this.outcome && this._accumulator + 1e-10 >= STEP && steps < MAX_STEPS) {
      const activeCannon = this._liveCannons()[0];
      if (activeCannon && this._drive.aim) {
        const base = Number(activeCannon.userData.part.elevation) || 0;
        this._aimOffset = clamp(this._aimOffset + this._drive.aim * 25 * STEP, -10 - base, 45 - base);
      }
      this._updateMotors();
      this._updateEnemies();
      this._applyFluidForces();
      const previousCorePosition = this.corePosition;
      this.world.step(STEP);
      this.elapsed += STEP;
      this._accumulator -= STEP;
      steps++;
      this._afterStep(previousCorePosition);
    }
  }

  _updateMotors() {
    const { forward, turn, turret, brake } = this._drive;
    for (const edge of this._wheelJoints) {
      if (edge.broken) continue;
      if (!this._canControl(edge.b)) {
        edge.constraint.disableMotor();
        edge.speed = 0;
        continue;
      }
      edge.constraint.enableMotor();
      const part = this.bodies.get(edge.b).userData.part;
      let side = part.binding;
      if (side !== 'left' && side !== 'right') side = part.x < 0 ? 'left' : part.x > 0 ? 'right' : 'all';
      // Positive turn means left (A), so the right track advances faster.
      const differential = side === 'left' ? -turn : side === 'right' ? turn : 0;
      const command = brake ? 0 : clamp(forward + differential * 0.90, -1, 1);
      const power = clamp(Number(part.power) || 1, 0.3, 2);
      const target = command * 10.5 * power;
      // Rate limiting applies to starting, stopping and reversing, rather than
      // teleporting a wheel to a new angular speed in a single solver step.
      const slew = brake ? 85 : 26;
      edge.speed += clamp(target - edge.speed, -slew * STEP, slew * STEP);
      edge.constraint.setMotorSpeed(edge.speed);
      edge.constraint.setMotorMaxForce((brake ? 38 : Math.abs(command) > 0.01 ? 16 : 10) * power);
    }
    for (const edge of this._turretJoints) {
      if (edge.broken) continue;
      if (!this._canControl(edge.b)) {
        edge.constraint.disableMotor();
        continue;
      }
      edge.constraint.enableMotor();
      const part = this.bodies.get(edge.b).userData.part;
      const power = clamp(Number(part.power) || 1, 0.3, 2);
      // Motor equation is wA - wB; Q/+1 should rotate the turret left/+Y.
      edge.constraint.setMotorSpeed(-turret * 1.15 * power);
      edge.constraint.setMotorMaxForce((Math.abs(turret) > 0.01 ? 35 : 50) * power);
    }
    for (const edge of this._pistonJoints) {
      if (edge.broken) continue;
      const constraint = edge.constraint;
      if (!this._canControl(edge.b)) {
        constraint.disableMotor();
        continue;
      }
      const part = this.bodies.get(edge.b).userData.part;
      const power = clamp(finite(part.power, 1), 0.3, 2);
      constraint.enableMotor();
      constraint.setActuatorForce(120 * power);
      constraint.setTarget(constraint.target + this._drive.actuate * 0.8 * power * STEP);
    }
  }

  _applyFluidForces() {
    const water = this.environment.waterLevel;
    // Legacy siege builds take exactly the original force path on dry land.
    if (!this._hasFluidParts && water === null) return;
    for (const body of this.bodies.values()) {
      const { id, type, part } = body.userData;
      const state = this.partStates.get(id);
      const alive = state && !state.dead && state.hp > 0;
      const speed = body.velocity.length();
      if (!Number.isFinite(speed)) continue;
      const localVelocity = body.vectorToLocalFrame(body.velocity);
      const power = clamp(finite(part.power, 1), 0.3, 2);

      // Drag acts on physical debris too. It never changes transforms or sets
      // velocity, and is deliberately absent from the old six-part land builds.
      if (this._hasFluidParts && speed > 0.001) {
        body.applyForce(body.velocity.scale(-Math.min(300, 0.012 * body.mass * speed)));
      }

      if (water !== null) {
        const half = type === 'float' ? 0.42 : 0.46;
        const localUp = body.vectorToWorldFrame(UP), localRight = body.vectorToWorldFrame(X_AXIS);
        const localForward = body.vectorToWorldFrame(FORWARD);
        const height = Math.max(0.08, Math.abs(localUp.y) * half
          + Math.abs(localRight.y) * 0.46 + Math.abs(localForward.y) * 0.46);
        const submerged = clamp((water - body.position.y + height) / (height * 2), 0, 1);
        body.userData.submerged = submerged;
        if (submerged > 0) {
          // Each intact float displaces at most 3.57 kg of water in this tuned
          // game model. Spatially separated forces provide real righting torque.
          if (type === 'float' && alive) body.applyForce(new CANNON.Vec3(0, 35 * submerged, 0));
          const localDrag = new CANNON.Vec3(
            -localVelocity.x * (1.4 + Math.abs(localVelocity.x) * 2.4) * submerged,
            -localVelocity.y * (8 + Math.abs(localVelocity.y) * 3) * submerged,
            -localVelocity.z * (0.18 + Math.abs(localVelocity.z) * 0.16) * submerged,
          );
          localDrag.x = clamp(localDrag.x, -600, 600);
          localDrag.y = clamp(localDrag.y, -600, 600);
          localDrag.z = clamp(localDrag.z, -600, 600);
          body.applyForce(body.vectorToWorldFrame(localDrag));
          // Water damps tumble; a dead float still experiences drag but no lift.
          body.torque.vadd(body.angularVelocity.scale(-0.7 * submerged), body.torque);
        }
      }

      if (type === 'propeller') {
        const connected = alive && this._canControl(id);
        const side = part.binding === 'left' ? -1 : part.binding === 'right' ? 1 : 0;
        const demand = connected && !this._drive.brake
          ? clamp(this._drive.forward + side * this._drive.turn * 0.4, -1, 1) : 0;
        const current = this._propellerPower.get(id) || 0;
        const throttle = !connected || this._drive.brake ? 0
          : current + clamp(demand - current, -1.8 * STEP, 1.8 * STEP);
        this._propellerPower.set(id, throttle);
        if (throttle) body.applyForce(body.vectorToWorldFrame(FORWARD).scale(
          (water === null ? 80 : 55) * power * throttle));
      }

      if (type === 'wing' && alive && speed > 0.1) {
        const forwardSpeed = Math.max(0, -localVelocity.z);
        if (forwardSpeed > 0.1) {
          const incidence = clamp(finite(part.elevation, 6), -10, 45) * DEG;
          const alpha = incidence - Math.atan2(localVelocity.y, forwardSpeed);
          const absoluteAlpha = Math.abs(alpha);
          const stalled = Math.max(0, absoluteAlpha - 18 * DEG);
          const cl = absoluteAlpha <= 18 * DEG ? clamp(alpha * 5.4, -1.35, 1.35)
            : Math.sign(alpha) * 1.35 * clamp(1 - stalled / (40 * DEG), 0.12, 1);
          const airFraction = water === null ? 1 : 1 - (body.userData.submerged || 0);
          const pressure = 0.5 * 1.225 * forwardSpeed * forwardSpeed * airFraction;
          const span = body.vectorToWorldFrame(X_AXIS);
          const liftDirection = span.cross(body.velocity);
          if (liftDirection.lengthSquared() > 1e-8) {
            liftDirection.normalize();
            body.applyForce(liftDirection.scale(clamp(pressure * power * cl, -600, 600)));
          }
          const cd = 0.035 + 0.065 * cl * cl + Math.min(0.65, stalled * 0.6);
          body.applyForce(body.velocity.scale(-Math.min(600, pressure * power * cd) / speed));
          // A modest sideslip drag represents the omitted fuselage/fin area.
          // It opposes local lateral motion, never seeks a route or world point.
          body.applyForce(body.vectorToWorldFrame(new CANNON.Vec3(
            -localVelocity.x * (0.9 + Math.abs(localVelocity.x) * 0.25) * power, 0, 0)));
          body.userData.angleOfAttack = alpha / DEG;
        }
      }
    }
    this._applyControlTorques();
  }

  _applyControlTorques() {
    if (!this._core || this.coreHp <= 0) return;
    const connected = [...this.bodies.values()].filter((body) => this._canControl(body.userData.id));
    const wings = connected.filter((body) => body.userData.type === 'wing').length;
    const floats = connected.filter((body) => body.userData.type === 'float').length;
    const flying = wings >= 2;
    const boating = this.environment.waterLevel !== null && floats >= 2;
    if (!flying && !boating) return;
    // Parallel-axis estimates only choose finite controller gains. The actual
    // individual bodies, lock joints and cannon-es inertia perform the motion.
    const inertia = new CANNON.Vec3(0.5, 0.5, 0.5);
    for (const body of connected) {
      const r = this._core.pointToLocalFrame(body.position);
      inertia.x += body.mass * (r.y * r.y + r.z * r.z + 0.15);
      inertia.y += body.mass * (r.x * r.x + r.z * r.z + 0.15);
      inertia.z += body.mass * (r.x * r.x + r.y * r.y + 0.15);
    }
    const rate = this._core.vectorToLocalFrame(this._core.angularVelocity);
    const telemetry = this.telemetry;
    const pitch = telemetry.pitch * DEG, roll = telemetry.roll * DEG;
    const authority = flying ? clamp(telemetry.airspeed / 7, 0.2, 1)
      : clamp(telemetry.airspeed / 3, 0.25, 1);
    let pitchAcceleration, rollAcceleration;
    if (this._drive.assist) {
      const targetPitch = flying ? ((telemetry.airspeed > 5 ? 8 : 0)
        + this._drive.pitch * (this._drive.pitch >= 0 ? 20 : 18)) * DEG : 0;
      const targetRoll = flying ? this._drive.roll * 30 * DEG : 0;
      pitchAcceleration = (flying ? 9 : 5) * (targetPitch - pitch) - 4.8 * rate.x;
      const rollError = Math.atan2(Math.sin(targetRoll - roll), Math.cos(targetRoll - roll));
      rollAcceleration = (flying ? 18 : 5) * rollError - (flying ? 6 : 5) * rate.z;
    } else {
      // Manual mode commands angular rates without an upright-angle target.
      // It retains enough actuator authority to oppose the tail's real torque.
      pitchAcceleration = ((flying ? this._drive.pitch * 0.75 : 0) - rate.x) * 4;
      rollAcceleration = ((flying ? this._drive.roll * 1.0 : 0) - rate.z) * 4;
    }
    const coordinatedTurn = flying && this._drive.assist ? this._drive.roll * 30 * DEG * 0.65 : 0;
    let yawTarget = this._drive.turn * (flying ? 0.55 : 0.65) + coordinatedTurn;
    if (flying) {
      const forward = this._core.vectorToWorldFrame(FORWARD);
      const heading = Math.atan2(-forward.x, -forward.z);
      if (this._assistedHeading === null || !this._drive.assist) this._assistedHeading = heading;
      if (this._drive.assist) {
        this._assistedHeading += yawTarget * STEP;
        const error = Math.atan2(Math.sin(this._assistedHeading - heading),
          Math.cos(this._assistedHeading - heading));
        yawTarget += error * 2.3;
      }
    }
    const torque = new CANNON.Vec3(
      Math.min(200, inertia.x) * clamp(pitchAcceleration, -3.5, 3.5) * authority,
      Math.min(200, inertia.y) * clamp((yawTarget - rate.y) * 3, -2, 2) * authority,
      Math.min(200, inertia.z) * clamp(rollAcceleration, -4, 4) * authority,
    );
    this._core.torque.vadd(this._core.vectorToWorldFrame(torque), this._core.torque);
  }

  /** One deliberate trigger edge fires each remaining cannon; returns success. */
  fire() {
    if (this.disposed || this.outcome || this.elapsed + 1e-6 < this._nextFireAt) return false;
    const cannons = this._liveCannons();
    if (!cannons.length || this.ammoRemaining === 0) {
      this._emit({ type: 'dry-fire', reason: !cannons.length ? '코어에 연결된 대포가 없습니다.' : '탄약이 없습니다. 충돌로도 공격할 수 있습니다.' });
      return false;
    }
    let fired = 0;
    for (const cannon of cannons) {
      if (this.ammoRemaining === 0) break;
      const launch = this._cannonLaunch(cannon);
      const projectile = this._spawnProjectile({ ...launch, ownerId: cannon.userData.id });
      cannon.applyImpulse(launch.direction.scale(-projectile.body.mass * launch.speed), launch.offset);
      this.shots++;
      fired++;
      if (this.ammoRemaining !== null) this.ammoRemaining--;
      this._emit({ type: 'fire', position: xyz(launch.position), direction: xyz(launch.direction),
        partId: cannon.userData.id, elevation: launch.elevation, ammoRemaining: this.ammoRemaining });
    }
    if (fired) this._nextFireAt = this.elapsed + RELOAD_TIME;
    if (fired) this._aimGuideCache = null;
    return fired > 0;
  }

  _spawnProjectile({ position, velocity, power = 1, hostile = false, ownerId = null }) {
    const shell = new CANNON.Body({ mass: hostile ? 0.5 : 0.6, material: this._shellMaterial,
      position, linearDamping: 0, angularDamping: 0.01,
      collisionFilterGroup: GROUP.projectile,
      collisionFilterMask: GROUP.ground | GROUP.obstacle | (hostile ? GROUP.machine : GROUP.target),
    });
    shell.addShape(new CANNON.Sphere(hostile ? 0.16 : 0.18));
    shell.velocity.copy(velocity);
    const projectile = { id: `shell-${this._projectileSerial++}`, body: shell,
      life: 5, age: 0, spent: false, power, hostile, ownerId };
    shell.userData = { id: projectile.id, type: 'projectile', projectile };
    shell.addEventListener('collide', (event) => {
      if (!projectile.spent) {
        projectile.spent = true;
        this._pendingImpacts.push({ projectile, body: event.body, position: shell.position.clone() });
      }
    });
    this.world.addBody(shell);
    this.projectiles.push(projectile);
    return projectile;
  }

  _enemyLaunch(enemy) {
    const carrier = enemy.body.userData.target;
    const aim = new CANNON.Vec3(enemy.aim.x, enemy.aim.y, enemy.aim.z);
    const horizontal = aim.vsub(enemy.body.position);
    horizontal.y = 0;
    const distance = horizontal.length();
    if (distance > 0.001) horizontal.scale(1 / distance, horizontal);
    const position = enemy.body.position.vadd(horizontal.scale(0.72));
    position.y += carrier.size.y / 2 + 0.55;
    const flight = clamp(distance / 16, 0.5, 2.6);
    const delta = aim.vsub(position);
    const velocity = delta.scale(1 / flight);
    // Match the same fixed-step gravity integration used by player shells.
    velocity.y -= this.world.gravity.y * 0.5 * (flight + STEP);
    return { position, velocity, power: enemy.power, hostile: true, ownerId: enemy.id };
  }

  _updateEnemies() {
    if (this.outcome || this.coreHp <= 0) return;
    for (const enemy of this.enemies) {
      if (enemy.body.userData.target.dead) {
        enemy.alive = false;
        enemy.telegraph = 0;
        continue;
      }
      if (!enemy.alive) continue;
      const remaining = enemy.nextFireAt - this.elapsed;
      if (!enemy._lockedAim && remaining <= enemy.telegraphDuration) {
        enemy.aim = { ...this.corePosition };
        enemy._lockedAim = true;
      }
      if (!enemy._lockedAim) enemy.aim = { ...this.corePosition };
      enemy.telegraph = enemy._lockedAim ? clamp(1 - remaining / enemy.telegraphDuration, 0, 1) : 0;
      const launch = this._enemyLaunch(enemy);
      enemy.muzzle = xyz(launch.position);
      enemy.direction = xyz(launch.velocity.unit());
      if (remaining <= 0) {
        // Aim is locked at the BEGINNING of the visible warning, leaving time
        // to drive away or hide behind a real collision obstacle.
        this._spawnProjectile(launch);
        this._emit({ type: 'enemy-fire', enemyId: enemy.id, position: xyz(launch.position),
          direction: enemy.direction, aim: { ...enemy.aim } });
        enemy.nextFireAt = this.elapsed + enemy.interval;
        enemy.telegraph = 0;
        enemy._lockedAim = false;
      }
    }
  }

  _onMachineCollision(body, event) {
    if (this.outcome || this.elapsed < 0.65 || event.body.userData?.type === 'projectile') return;
    const impact = Math.abs(event.contact.getImpactVelocityAlongNormal());
    if (impact < 5.5) return;
    const pairKey = `part:${body.id}:${event.body.id}`;
    if (this.elapsed - (this._contactTimes.get(pairKey) ?? -100) < 0.15) return;
    this._contactTimes.set(pairKey, this.elapsed);
    const damage = clamp((impact - 5.5) * 0.10, 0, 0.8);
    this._damagePart(body.userData.id, (impact - 5.5) * 7, body.position, 'collision');
    for (const edge of this._bodyEdges.get(body.userData.id) || []) {
      if (!edge.broken) edge.health -= damage;
    }
  }

  _onTargetCollision(target, event) {
    if (target.dead || this.elapsed < 0.4 || event.body.userData?.type === 'projectile') return;
    const impact = Math.abs(event.contact.getImpactVelocityAlongNormal());
    const isMachine = event.body.collisionFilterGroup === GROUP.machine;
    const threshold = isMachine ? 2.3 : 3.5;
    if (impact < threshold) return;
    const pairKey = `target:${target.body.id}:${event.body.id}`;
    if (this.elapsed - (this._contactTimes.get(pairKey) ?? -100) < 0.16) return;
    this._contactTimes.set(pairKey, this.elapsed);
    this._damageTarget(target, (impact - threshold) * (isMachine ? 14 : 17), target.body.position, 'collision');
  }

  _damageTarget(target, amount, position, source) {
    if (this.outcome || target.dead || amount <= 0) return;
    target.hp = Math.max(0, target.hp - amount);
    this._aimGuideCache = null;
    target.body.wakeUp();
    this._emit({ type: 'hit', targetId: target.id, position: xyz(position), damage: amount, hp: target.hp, source });
    if (target.hp > 0) return;
    target.dead = true;
    this.destroyedCount++;
    this._removeBodies.add(target.body);
    // Cannon does not propagate wake-up through an arbitrary constraint graph.
    // Re-evaluate every stone after a support disappears; otherwise an asleep
    // lintel can remain suspended even though its pillars no longer exist.
    for (const neighbour of this.targets) if (!neighbour.dead) neighbour.body.wakeUp();
    for (const enemy of this.enemies) {
      if (enemy.targetId === target.id) { enemy.alive = false; enemy.telegraph = 0; }
    }
    this._emit({ type: 'destroy', targetId: target.id, position: xyz(target.body.position), kind: target.kind });
  }

  _damagePart(partId, amount, position, source) {
    const state = this.partStates.get(partId);
    if (this.outcome || !state || state.dead || !Number.isFinite(amount) || amount <= 0) return;
    state.hp = Math.max(0, state.hp - amount);
    this._emit({ type: 'damage', partId, position: xyz(position), hp: state.hp,
      maxHp: state.maxHp, damage: amount, source });
    if (state.hp > 0) return;
    state.dead = true;
    this._aimGuideCache = null;
    state.connected = false;
    this._connectivityDirty = true;
    this._pendingPartDeaths.add(partId);
    this._emit({ type: 'part-destroy', partId, position: xyz(position), source });
  }

  _explode(projectile, directBody, position) {
    const radius = 2.65;
    const power = projectile.power;
    this._emit({ type: 'hit', position: xyz(position), explosive: true, radius, hostile: projectile.hostile });
    for (const target of projectile.hostile ? [] : this.targets) {
      if (target.dead) continue;
      const displacement = target.body.position.vsub(position);
      const distance = displacement.length();
      if (distance >= radius && target.body !== directBody) continue;
      const falloff = Math.max(0, 1 - distance / radius);
      const damage = target.body === directBody ? 140 * power : 150 * falloff * power;
      this._damageTarget(target, damage, target.body.position, 'shell');
      if (distance > 0.001) {
        displacement.scale(1 / distance, displacement);
        displacement.y += 0.22;
        displacement.normalize();
        target.body.applyImpulse(displacement.scale(11 * falloff * power));
      }
    }
    // Hostile and point-blank friendly blasts affect part HP and joint health
    // independently. An HP-dead part becomes debris, not a deleted collider.
    for (const body of this.bodies.values()) {
      const displacement = body.position.vsub(position);
      const distance = displacement.length();
      const machineRadius = projectile.hostile ? 2.5 : 2.2;
      if (distance >= machineRadius) continue;
      const falloff = 1 - distance / machineRadius;
      const hitDamage = body === directBody ? 40 : 46 * falloff;
      this._damagePart(body.userData.id, hitDamage * power, body.position,
        projectile.hostile ? 'enemy-shell' : 'friendly-shell');
      if (distance > 0.001) body.applyImpulse(displacement.scale((projectile.hostile ? 3 : 9) * falloff / distance));
      for (const edge of this._bodyEdges.get(body.userData.id) || []) {
        if (!edge.broken) edge.health -= (projectile.hostile ? 0.18 : 0.7) * falloff * power;
      }
    }
    this._removeBodies.add(projectile.body);
  }

  _breakConnection(edge, reason) {
    if (edge.broken) return;
    let currentLoad = 0;
    for (const equation of edge.constraint.equations) {
      if (equation.enabled && equation !== edge.constraint.motorEquation) {
        currentLoad = Math.max(currentLoad, Math.abs(finite(equation.multiplier)));
      }
    }
    edge.stress = currentLoad / edge.strength;
    edge.broken = true;
    this._aimGuideCache = null;
    edge.health = Math.max(0, edge.health);
    edge.constraint.disableMotor?.();
    this._connectivityDirty = true;
    this.brokenCount++;
    this.world.removeConstraint(edge.constraint);
    const a = this.bodies.get(edge.a), b = this.bodies.get(edge.b);
    a?.wakeUp(); b?.wakeUp();
    const position = a && b ? a.position.vadd(b.position).scale(0.5) : new CANNON.Vec3();
    this._emit({ type: 'break', position: xyz(position), a: edge.a, b: edge.b,
      kind: edge.kind, reason, stress: edge.stress, health: clamp(edge.health, 0, 1), strength: edge.strength });
  }

  _afterStep(previousCorePosition = this.corePosition) {
    for (const impact of this._pendingImpacts.splice(0)) {
      this._explode(impact.projectile, impact.body, impact.position);
    }
    for (const partId of this._pendingPartDeaths) {
      const body = this.bodies.get(partId);
      if (body) { body.allowSleep = true; body.wakeUp(); }
      for (const edge of this._bodyEdges.get(partId) || []) this._breakConnection(edge, 'part-destroyed');
    }
    this._pendingPartDeaths.clear();
    for (const edge of this.connections) {
      if (edge.broken) continue;
      edge.health = clamp(edge.health, 0, 1);
      let maxLoad = 0;
      for (const eq of edge.constraint.equations) {
        if (eq.enabled && eq !== edge.constraint.motorEquation) maxLoad = Math.max(maxLoad, Math.abs(eq.multiplier || 0));
      }
      edge.stress = maxLoad / edge.strength;
      if (this.elapsed > 0.65) {
        edge.overloadTime = edge.stress > 1 ? edge.overloadTime + STEP : Math.max(0, edge.overloadTime - STEP * 2);
        if (edge.health <= 0 || edge.overloadTime > 0.12 || edge.stress > 4.5) {
          this._breakConnection(edge, edge.health <= 0 ? 'impact' : 'stress');
        }
      }
    }
    this._refreshConnectivity();
    for (const joint of this._targetJoints) {
      if (joint.broken) continue;
      const load = Math.max(...joint.constraint.equations.map((eq) => Math.abs(eq.multiplier || 0)));
      if (joint.a.dead || joint.b.dead || (this.elapsed > 0.8 && load > 2000)) {
        joint.broken = true;
        this.world.removeConstraint(joint.constraint);
        joint.a.body.wakeUp(); joint.b.body.wakeUp();
      }
    }
    for (const projectile of this.projectiles) {
      projectile.life -= STEP;
      projectile.age += STEP;
      if (projectile.age > 0.12) projectile.body.collisionFilterMask = ALL;
      if (projectile.life <= 0 || projectile.body.position.y < -5 || projectile.body.position.length() > 150) {
        this._removeBodies.add(projectile.body);
      }
    }
    for (const target of this.targets) {
      if (!target.dead && target.body.position.y < -4) this._damageTarget(target, target.hp, target.body.position, 'fallen');
    }
    for (const body of this._removeBodies) {
      if (body.world === this.world) this.world.removeBody(body);
    }
    if (this._removeBodies.size) this.projectiles = this.projectiles.filter((shell) => !this._removeBodies.has(shell.body));
    this._removeBodies.clear();
    this.timeRemaining = this._timeLimit === null ? null : Math.max(0, this._timeLimit - this.elapsed);
    if (this.environment.waterLevel !== null) {
      this._submergedTime = this.corePosition.y < this.environment.waterLevel - 0.8
        ? this._submergedTime + STEP : 0;
    }
    this._advanceCheckpoints(previousCorePosition, this.corePosition);
    this._checkTerminal();
  }

  _advanceCheckpoints(from, to) {
    if (this.outcome || this.coreHp <= 0 || this._mission.objective !== 'route') return;
    let previousFraction = -1;
    while (this.checkpointIndex < this.checkpoints.length) {
      const point = this.checkpoints[this.checkpointIndex];
      if (!segmentCrossesCheckpoint(from, to, point)) break;
      const fraction = (point.position.z - from.z) / (to.z - from.z);
      // A long backwards sweep must not retrospectively collect later gates
      // that it crossed before the currently required gate.
      if (fraction < previousFraction) break;
      previousFraction = fraction;
      point.passed = true;
      const index = this.checkpointIndex++;
      this._emit({ type: 'checkpoint', id: point.id, index, completed: this.checkpointIndex,
        total: this.checkpoints.length, position: { ...point.position } });
    }
  }

  _checkTerminal() {
    if (this.outcome || this.disposed) return;
    // Failure has a documented tie-break priority over the final target kill.
    // All damage in a physics tick is resolved before exactly one result is set.
    if (this.coreHp <= 0) {
      this._finish('failed', '코어가 파괴되었습니다.');
      return;
    }
    const position = this.corePosition;
    if (![position.x, position.y, position.z].every(Number.isFinite)
      || Math.abs(position.x) > 65 || Math.abs(position.z) > 65 || position.y < -6 || position.y > 50) {
      this._finish('failed', '코어가 시험장을 벗어났습니다.');
      return;
    }
    if (this.timeRemaining !== null && this.timeRemaining <= 1e-8) {
      this._finish('failed', '제한 시간이 끝났습니다.');
      return;
    }
    if (this.environment.waterLevel !== null && this._submergedTime >= 1.5) {
      this._finish('failed', '코어가 물속에 잠겼습니다. 부유체를 늘려 보세요.');
      return;
    }
    if (this._mission.objective === 'route') {
      if (this.checkpoints.length > 0 && this.checkpointIndex === this.checkpoints.length) this._finish('won');
    } else if (this.targetCount > 0 && this.destroyedCount >= this.targetCount) this._finish('won');
  }

  _finish(outcome, reason = '') {
    if (this.outcome) return;
    this.outcome = outcome;
    this.won = outcome === 'won';
    this.failed = outcome === 'failed';
    this.failReason = this.failed ? reason : '';
    this.result = Object.freeze({ won: this.won, elapsed: this.elapsed, shots: this.shots,
      integrity: this.integrity, cost: this.cost,
      ...(this._mission.objective === 'route' ? { checkpoints: this.checkpointIndex, total: this.checkpoints.length } : {}) });
    for (const enemy of this.enemies) enemy.telegraph = 0;
    this._emit({ type: this.won ? 'win' : 'fail', ...this.result, reason: this.failReason,
      brokenCount: this.brokenCount, result: this.result });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const constraint of [...this.world.constraints]) this.world.removeConstraint(constraint);
    for (const body of [...this.world.bodies]) this.world.removeBody(body);
    this.bodies.clear();
    this.targets.length = 0;
    this.projectiles.length = 0;
    this.connections.length = 0;
    this.obstacles.length = 0;
    this.enemies.length = 0;
    this.partStates.clear();
    this._wheelJoints.length = 0;
    this._turretJoints.length = 0;
    this._pistonJoints.length = 0;
    this._pistonByPart.clear();
    this._targetJoints.length = 0;
    this._removeBodies.clear();
    this._contactTimes.clear();
    this._pendingImpacts.length = 0;
    this._pendingPartDeaths.clear();
    this._propellerPower.clear();
    this.checkpoints.length = 0;
    this._core = null;
    this.onEvent = () => {};
  }
}
