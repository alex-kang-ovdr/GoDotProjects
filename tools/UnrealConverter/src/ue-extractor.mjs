import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  UE_CM_TO_GODOT_M,
  ueCmToGodotM,
  ueTransformToGodot
} from "./coordinate-transform.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAPPINGS_PATH = path.resolve(__dirname, "../mappings/unreal-core-api.v0.json");

function walkFiles(dir, suffix, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, suffix, results);
    } else if (entry.name.endsWith(suffix)) {
      results.push(full);
    }
  }
  return results;
}

function parseDefaultInputIni(iniText) {
  const actions = new Map();
  for (const rawLine of iniText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("+ActionMappings=")) {
      const nameMatch = line.match(/ActionName="([^"]+)"/);
      const keyMatch = line.match(/Key=([A-Za-z0-9_]+)/);
      if (nameMatch && keyMatch) {
        const action = nameMatch[1];
        if (!actions.has(action)) {
          actions.set(action, {
            action,
            godot_action: action.toLowerCase().replace(/^ia_/, "ue_"),
            value_type: "bool",
            bindings: []
          });
        }
        actions.get(action).bindings.push({ key: keyMatch[1], scale: 1.0 });
      }
    } else if (line.startsWith("+AxisMappings=")) {
      const nameMatch = line.match(/AxisName="([^"]+)"/);
      const keyMatch = line.match(/Key=([A-Za-z0-9_]+)/);
      const scaleMatch = line.match(/Scale=([-0-9.]+)/);
      if (nameMatch && keyMatch) {
        const action = nameMatch[1];
        const scale = scaleMatch ? Number(scaleMatch[1]) : 1.0;
        const godotAction = action.toLowerCase().replace(/^ia_/, "ue_") + (scale < 0 ? "_neg" : "_pos");
        if (!actions.has(godotAction)) {
          actions.set(godotAction, {
            action,
            godot_action: godotAction,
            value_type: "axis1d",
            bindings: []
          });
        }
        actions.get(godotAction).bindings.push({ key: keyMatch[1], scale });
      }
    }
  }
  return Array.from(actions.values());
}

function normalizeComponent(comp, blockedAssetIds, diagnostics, entityId) {
  const out = { type: comp.type };
  if (comp.shape) out.shape = comp.shape;
  if (Array.isArray(comp.size_cm)) {
    // UE size [X_cm, Y_cm, Z_cm] -> Godot Box size [Y_m, Z_m, X_m]
    out.size_m = [
      ueCmToGodotM(comp.size_cm[1]),
      ueCmToGodotM(comp.size_cm[2]),
      ueCmToGodotM(comp.size_cm[0])
    ];
  }
  if (comp.color) out.color = comp.color;
  if (comp.radius_cm !== undefined) out.radius_m = ueCmToGodotM(comp.radius_cm);
  if (comp.half_height_cm !== undefined) out.height_m = ueCmToGodotM(comp.half_height_cm * 2);
  if (comp.target_arm_length_cm !== undefined) out.spring_length_m = ueCmToGodotM(comp.target_arm_length_cm);
  if (Array.isArray(comp.socket_offset_cm)) {
    out.socket_offset_m = [
      ueCmToGodotM(comp.socket_offset_cm[1]),
      ueCmToGodotM(comp.socket_offset_cm[2]),
      -ueCmToGodotM(comp.socket_offset_cm[0])
    ];
  }
  if (comp.fov_deg !== undefined) out.fov_deg = comp.fov_deg;
  if (comp.type === "UCharacterMovementComponent") {
    out.movement = {
      max_walk_speed_cm: comp.max_walk_speed_cm ?? 500,
      jump_z_velocity_cm: comp.jump_z_velocity_cm ?? 700,
      gravity_scale: comp.gravity_scale ?? 1.75,
      max_acceleration_cm: comp.max_acceleration_cm ?? 2048,
      braking_deceleration_walking_cm: comp.braking_deceleration_walking_cm ?? 2000,
      air_control: comp.air_control ?? 0.35,
      max_walk_angle_deg: comp.max_walk_angle_deg ?? 44.7,
      max_step_height_cm: comp.max_step_height_cm ?? 45,
      orient_rotation_to_movement: comp.orient_rotation_to_movement ?? true,
      rotation_rate_yaw_deg: comp.rotation_rate_yaw_deg ?? 500
    };
  }
  if (comp.asset_ref) {
    out.asset_ref = comp.asset_ref;
    if (blockedAssetIds.has(comp.asset_ref)) {
      out.asset_excluded = true;
      out.fallback_procedural = comp.fallback_procedural || "box_placeholder";
      diagnostics.push({
        code: "LICENSE_ASSET_EXCLUDED",
        severity: "warning",
        stage: "extract",
        source_ref: `${entityId}.${comp.type}`,
        message: `Asset '${comp.asset_ref}' is blocked by Unreal Engine EULA redistribution policy and excluded from Godot export.`,
        suggestion: `Substituted with procedural fallback '${out.fallback_procedural}'. Replace with a permissively licensed glTF asset before external release.`
      });
    }
  }
  return out;
}

/**
 * Extract a read-only Unreal Engine project directory into Unified Game IR v0.1.
 */
export function extractUnrealProjectToIR(projectDir) {
  const absDir = path.resolve(projectDir);
  if (!fs.existsSync(absDir)) {
    throw new Error(`Unreal project directory not found: ${absDir}`);
  }

  const mappings = JSON.parse(fs.readFileSync(MAPPINGS_PATH, "utf8"));
  const diagnostics = [];

  // 1. Parse .uproject
  const uprojectFile = fs.readdirSync(absDir).find((f) => f.endsWith(".uproject"));
  let projectName = path.basename(absDir);
  let engineVersion = "5.4";
  if (uprojectFile) {
    projectName = path.basename(uprojectFile, ".uproject");
    const uproj = JSON.parse(fs.readFileSync(path.join(absDir, uprojectFile), "utf8"));
    engineVersion = String(uproj.EngineAssociation || "5.4");
  }

  // 2. Parse Config/DefaultInput.ini
  const inputIniPath = path.join(absDir, "Config", "DefaultInput.ini");
  const inputMappings = fs.existsSync(inputIniPath)
    ? parseDefaultInputIni(fs.readFileSync(inputIniPath, "utf8"))
    : [];

  // 3. Parse asset_manifest.json & apply license policy (§11)
  const assets = [];
  const blockedAssetIds = new Set();
  for (const manifestPath of walkFiles(absDir, "asset_manifest.json")) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    for (const item of manifest.assets || []) {
      const sha = crypto.createHash("sha256").update(item.source_path || item.id).digest("hex").slice(0, 16);
      const redistributable = Boolean(item.redistributable && item.license_status === "allowed");
      if (!redistributable) {
        blockedAssetIds.add(item.id);
      }
      assets.push({
        id: item.id,
        kind: item.kind,
        source_path: item.source_path,
        sha256: sha,
        license: item.license || "Unknown",
        license_status: item.license_status || "unknown",
        redistributable,
        godot_path: redistributable ? `res://assets/${item.id}.tres` : null
      });
    }
  }

  // 4. Parse Levels (*.ue_level.json)
  const scenes = [];
  const entities = [];
  for (const levelPath of walkFiles(absDir, ".ue_level.json")) {
    const level = JSON.parse(fs.readFileSync(levelPath, "utf8"));
    const sceneEntityIds = [];
    for (const actor of level.actors || []) {
      const mapping = mappings.actor_mappings[actor.class] || { godot: "Node3D", status: "fallback" };
      if (mapping.status === "fallback") {
        diagnostics.push({
          code: "UNMAPPED_ACTOR_CLASS",
          severity: "warning",
          stage: "extract",
          source_ref: `${level.name}:${actor.id}`,
          message: `Actor class '${actor.class}' has no explicit mapping; defaulted to Node3D.`,
          suggestion: "Add explicit actor mapping in mappings/unreal-core-api.v0.json"
        });
      }
      sceneEntityIds.push(actor.id);
      entities.push({
        id: actor.id,
        name: actor.name,
        source_class: actor.class,
        godot_class: mapping.godot,
        parent_id: actor.parent_id || null,
        transform: ueTransformToGodot(actor.transform),
        components: (actor.components || []).map((c) =>
          normalizeComponent(c, blockedAssetIds, diagnostics, actor.id)
        ),
        logic_refs: actor.logic_refs || [],
        animation_ref: actor.animation_ref || null
      });
    }
    scenes.push({
      id: level.level_id || path.basename(levelPath, ".ue_level.json"),
      name: level.name || "Main",
      source_path: level.source_path || path.relative(absDir, levelPath),
      entities: sceneEntityIds,
      environment: level.environment || {}
    });
  }

  // 5. Parse Blueprints (*.ue_bp.json)
  const logic = [];
  const animations = [];
  for (const bpPath of walkFiles(absDir, ".ue_bp.json")) {
    const bp = JSON.parse(fs.readFileSync(bpPath, "utf8"));
    logic.push({
      id: bp.id,
      name: bp.name,
      kind: bp.kind || "event_graph",
      source_path: bp.source_path || path.relative(absDir, bpPath),
      target_entity_class: bp.target_entity_class || "AActor",
      variables: bp.variables || [],
      nodes: bp.nodes || [],
      edges: bp.edges || []
    });
    if (bp.animation_blueprint) {
      animations.push(bp.animation_blueprint);
    }
  }

  return {
    schema_version: "0.1",
    source: {
      engine: "unreal",
      version: engineVersion,
      project: projectName,
      project_path: absDir,
      extracted_at: new Date().toISOString()
    },
    units: {
      distance: "meter",
      coordinate_system: "godot_3d",
      scale_factor: UE_CM_TO_GODOT_M,
      axis_mapping: "godot(x,y,z) = (ue.y*0.01, ue.z*0.01, -ue.x*0.01)"
    },
    input_mappings: inputMappings,
    scenes,
    entities,
    logic,
    animations,
    assets,
    source_map: [],
    diagnostics
  };
}
