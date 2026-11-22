/**
 * Deterministic Coordinate, Camera, Sprite, and Color-Space Transforms:
 *   Unity (Left-Handed, Y-Up, Meters: +X Right, +Y Up, +Z Forward)
 *   <-> Godot 4.x (Right-Handed, Y-Up, Meters: +X Right, +Y Up, -Z Forward)
 *
 * Exact handedness reflection across Z (involution: T(T(v)) == v):
 *   godot.x =  unity.x
 *   godot.y =  unity.y
 *   godot.z = -unity.z
 *
 * Quaternion reflection across Z:
 *   godot.q = [-qx, -qy, qz, qw]
 */

function round6(v) {
  const n = Number(v || 0);
  return Math.abs(n) < 1e-9 ? 0 : Math.round(n * 1e6) / 1e6;
}

export function unityPositionToGodot([x = 0, y = 0, z = 0]) {
  return [round6(x), round6(y), round6(-z)];
}

export function godotPositionToUnity([x = 0, y = 0, z = 0]) {
  return [round6(x), round6(y), round6(-z)];
}

export function unityQuaternionToGodot([qx = 0, qy = 0, qz = 0, qw = 1]) {
  return [round6(-qx), round6(-qy), round6(qz), round6(qw)];
}

export function godotQuaternionToUnity([qx = 0, qy = 0, qz = 0, qw = 1]) {
  return [round6(-qx), round6(-qy), round6(qz), round6(qw)];
}

export function unityEulerToGodotDeg([rx = 0, ry = 0, rz = 0]) {
  return [round6(-rx), round6(-ry), round6(rz)];
}

export function godotEulerToUnityDeg([rx = 0, ry = 0, rz = 0]) {
  return [round6(-rx), round6(-ry), round6(rz)];
}

export function unityScaleToGodot([sx = 1, sy = 1, sz = 1]) {
  return [round6(sx), round6(sy), round6(sz)];
}

export function unityTransformToGodot(uTransform = {}) {
  return {
    position: unityPositionToGodot(uTransform.position || [0, 0, 0]),
    rotation_deg: unityEulerToGodotDeg(uTransform.rotation_deg || [0, 0, 0]),
    scale: unityScaleToGodot(uTransform.scale || [1, 1, 1]),
  };
}

/**
 * Unity Camera.orthographicSize is half-height; Godot Camera3D.size is full-height.
 */
export function unityOrthoSizeToGodot(orthoSize) {
  return round6(Number(orthoSize || 0) * 2.0);
}

/**
 * Unity Sprite rect origin is bottom-left; Godot AtlasTexture region origin is top-left.
 */
export function unitySpriteRectToGodotRegion({ x = 0, y = 0, w = 0, h = 0 }, textureHeight) {
  return {
    x: round6(x),
    y: round6(Number(textureHeight) - Number(y) - Number(h)),
    w: round6(w),
    h: round6(h),
  };
}

/**
 * Unity Gamma-space sRGB material channel -> Godot 4 Linear PBR channel.
 */
export function srgbChannelToLinear(c) {
  const v = Math.max(0, Math.min(1, Number(c || 0)));
  if (v <= 0.04045) return round6(v / 12.92);
  return round6(Math.pow((v + 0.055) / 1.055, 2.4));
}

export function unityGammaColorToGodotLinear([r = 1, g = 1, b = 1, a = 1]) {
  return [
    srgbChannelToLinear(r),
    srgbChannelToLinear(g),
    srgbChannelToLinear(b),
    round6(Math.max(0, Math.min(1, Number(a ?? 1)))),
  ];
}
