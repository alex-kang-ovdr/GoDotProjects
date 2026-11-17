import * as CANNON from './vendor/cannon-es.js';

const X = new CANNON.Vec3(1, 0, 0);
const Y = new CANNON.Vec3(0, 1, 0);
const Z = new CANNON.Vec3(0, 0, 1);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

/**
 * A force-limited linear position actuator along support-local +Y.
 *
 * LockConstraint supplies two lateral guides and three orientation equations.
 * Its remaining axial equation pursues a moving local pivot with a finite
 * impulse budget. Two unilateral equations are independent mechanical stops.
 * No body transform or velocity is assigned to perform the motion.
 *
 * cannon-es 0.20 GSSolver clamps lambda directly against min/maxForce, then
 * exposes multiplier=lambda/dt. Convert our force in newtons to impulse here;
 * passing 120 directly would allow 14,400 N at the game's 120 Hz step.
 */
export class LinearActuatorConstraint extends CANNON.LockConstraint {
  constructor(bodyA, bodyB, { stroke = 1.5, force = 120, timeStep = 1 / 120 } = {}) {
    super(bodyA, bodyB, { maxForce: 1e6 });
    this.collideConnected = false;
    this.stroke = clamp(stroke, 0.25, 2);
    this.target = 0;
    this.timeStep = timeStep;
    this.basePivotA = bodyA.pointToLocalFrame(bodyB.position);
    this.pivotA.copy(this.basePivotA);
    this.pivotB.set(0, 0, 0);
    this.actuatorEquation = this.equationY;
    this.setActuatorForce(force);
    this.lowerLimitEquation = new CANNON.ContactEquation(bodyA, bodyB, 10000 * timeStep);
    this.upperLimitEquation = new CANNON.ContactEquation(bodyA, bodyB, 10000 * timeStep);
    this.equations.push(this.lowerLimitEquation, this.upperLimitEquation);
    this._axis = new CANNON.Vec3();
    this._base = new CANNON.Vec3();
    this._head = new CANNON.Vec3();
    this._difference = new CANNON.Vec3();
    this._upperPivot = new CANNON.Vec3();
  }

  setActuatorForce(force) {
    this.maxActuatorForce = Math.max(0, Number.isFinite(force) ? force : 0);
    this.actuatorEquation.minForce = -this.maxActuatorForce * this.timeStep;
    this.actuatorEquation.maxForce = this.maxActuatorForce * this.timeStep;
  }

  setTarget(target) {
    this.target = clamp(Number.isFinite(target) ? target : this.target, 0, this.stroke);
  }

  enableMotor() { this.actuatorEquation.enabled = true; }
  disableMotor() { this.actuatorEquation.enabled = false; }

  getExtension() {
    this.bodyA.vectorToWorldFrame(Y, this._axis);
    this.bodyA.pointToWorldFrame(this.basePivotA, this._base);
    this.bodyB.pointToWorldFrame(this.pivotB, this._head);
    this._head.vsub(this._base, this._difference);
    return this._difference.dot(this._axis);
  }

  update() {
    this.pivotA.copy(this.basePivotA);
    this.pivotA.y += this.target;
    super.update();
    // PointToPointConstraint defaults to world X/Y/Z. Rotate those normals
    // with the support so the rail also works on a moving or tilted assembly.
    this.bodyA.vectorToWorldFrame(X, this.equationX.ni);
    this.bodyA.vectorToWorldFrame(Y, this.equationY.ni);
    this.bodyA.vectorToWorldFrame(Z, this.equationZ.ni);

    const lower = this.lowerLimitEquation, upper = this.upperLimitEquation;
    this.bodyA.vectorToWorldFrame(Y, lower.ni);
    lower.ni.negate(upper.ni);
    this.bodyA.quaternion.vmult(this.basePivotA, lower.ri);
    this._upperPivot.copy(this.basePivotA);
    this._upperPivot.y += this.stroke;
    this.bodyA.quaternion.vmult(this._upperPivot, upper.ri);
    this.bodyB.quaternion.vmult(this.pivotB, lower.rj);
    upper.rj.copy(lower.rj);
  }
}
