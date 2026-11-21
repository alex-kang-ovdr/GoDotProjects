/**
 * Unreal Engine (Left-Handed, Z-Up, Centimeters: X=Forward, Y=Right, Z=Up)
 * <-> Godot 4.x (Right-Handed, Y-Up, Meters: -Z=Forward, X=Right, Y=Up)
 *
 * Exact basis change:
 *   godot.x =  ue.y * 0.01
 *   godot.y =  ue.z * 0.01
 *   godot.z = -ue.x * 0.01
 *
 * Inverse:
 *   ue.x = -godot.z * 100.0
 *   ue.y =  godot.x * 100.0
 *   ue.z =  godot.y * 100.0
 */

export const UE_CM_TO_GODOT_M = 0.01;
export const GODOT_M_TO_UE_CM = 100.0;

function round6(v) {
  return Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e6) / 1e6;
}

export function ueCmToGodotM(cm) {
  return round6(Number(cm || 0) * UE_CM_TO_GODOT_M);
}

export function godotMToUeCm(m) {
  return round6(Number(m || 0) * GODOT_M_TO_UE_CM);
}

/**
 * Convert UE position [X_cm, Y_cm, Z_cm] -> Godot [X_m, Y_m, Z_m]
 */
export function uePositionToGodot([x = 0, y = 0, z = 0]) {
  return [
    round6(y * UE_CM_TO_GODOT_M),
    round6(z * UE_CM_TO_GODOT_M),
    round6(-x * UE_CM_TO_GODOT_M)
  ];
}

/**
 * Convert Godot position [X_m, Y_m, Z_m] -> UE [X_cm, Y_cm, Z_cm]
 */
export function godotPositionToUe([x = 0, y = 0, z = 0]) {
  return [
    round6(-z * GODOT_M_TO_UE_CM),
    round6(x * GODOT_M_TO_UE_CM),
    round6(y * GODOT_M_TO_UE_CM)
  ];
}

/**
 * Convert UE direction/velocity vector [X, Y, Z] (with optional unit scaling)
 */
export function ueVectorToGodot([x = 0, y = 0, z = 0], scale = UE_CM_TO_GODOT_M) {
  return [
    round6(y * scale),
    round6(z * scale),
    round6(-x * scale)
  ];
}

/**
 * Convert UE scale [X, Y, Z] -> Godot scale [X, Y, Z]
 * Since UE X maps to Godot -Z, UE Y maps to Godot X, UE Z maps to Godot Y,
 * positive extents permute as [scaleY, scaleZ, scaleX].
 */
export function ueScaleToGodot([sx = 1, sy = 1, sz = 1]) {
  return [round6(sy), round6(sz), round6(sx)];
}

/**
 * Convert UE Rotator (Pitch, Yaw, Roll in degrees) -> Godot Euler degrees [rotX, rotY, rotZ]
 * UE:
 *   Pitch (+Y right axis, nose up = +Pitch) -> Godot +X (nose up = +X)
 *   Yaw   (+Z up axis, clockwise from top = +Yaw) -> Godot -Y (CCW from top = +Y)
 *   Roll  (+X forward axis, right wing down = +Roll) -> Godot -Z
 */
export function ueRotatorToGodotDeg({ pitch = 0, yaw = 0, roll = 0 }) {
  return [
    round6(pitch),
    round6(-yaw),
    round6(-roll)
  ];
}

export function godotDegToUeRotator([rx = 0, ry = 0, rz = 0]) {
  return {
    pitch: round6(rx),
    yaw: round6(-ry),
    roll: round6(-rz)
  };
}

export function ueTransformToGodot(ueTransform = {}) {
  const location = ueTransform.location || [0, 0, 0];
  const rotation = ueTransform.rotation || { pitch: 0, yaw: 0, roll: 0 };
  const scale = ueTransform.scale || [1, 1, 1];
  return {
    position: uePositionToGodot(location),
    rotation_deg: ueRotatorToGodotDeg(rotation),
    scale: ueScaleToGodot(scale)
  };
}
