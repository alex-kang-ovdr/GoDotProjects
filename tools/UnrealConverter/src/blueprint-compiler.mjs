import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAPPINGS_PATH = path.resolve(__dirname, "../mappings/unreal-core-api.v0.json");

function gdType(ueType) {
  switch (String(ueType || "").toLowerCase()) {
    case "float":
    case "double":
      return "float";
    case "int":
    case "int32":
      return "int";
    case "bool":
      return "bool";
    case "string":
    case "fstring":
      return "String";
    case "vector":
    case "fvector":
      return "Vector3";
    default:
      return "Variant";
  }
}

function gdDefault(ueType, val) {
  if (val === undefined || val === null) {
    switch (gdType(ueType)) {
      case "float": return "0.0";
      case "int": return "0";
      case "bool": return "false";
      case "String": return '""';
      case "Vector3": return "Vector3.ZERO";
      default: return "null";
    }
  }
  if (typeof val === "string") return JSON.stringify(val);
  if (typeof val === "boolean") return val ? "true" : "false";
  return String(val);
}

/**
 * Compile a Blueprint Event Graph IR object into typed GDScript 4.x code,
 * producing a line-level source map and unsupported-node diagnostics.
 */
export function compileBlueprintToGDScript(bpGraph, options = {}) {
  const mappings = JSON.parse(fs.readFileSync(MAPPINGS_PATH, "utf8"));
  const repairOverrides = options.repairOverrides || {};
  const nodesById = new Map((bpGraph.nodes || []).map((n) => [n.id, n]));
  const execNext = new Map();
  for (const edge of bpGraph.edges || []) {
    if (edge.kind === "exec") {
      if (!execNext.has(edge.from_node)) execNext.set(edge.from_node, []);
      execNext.get(edge.from_node).push(edge);
    }
  }

  const lines = [];
  const sourceMap = [];
  const diagnostics = [];

  const emit = (text, bpNode = null) => {
    lines.push(text);
    if (bpNode) {
      sourceMap.push({
        gd_line: lines.length,
        bp_graph: bpGraph.id,
        bp_node_id: bpNode.id,
        bp_node_class: bpNode.node_class,
        bp_title: bpNode.title || bpNode.node_class
      });
    }
  };

  const baseClass =
    bpGraph.target_entity_class === "ACharacter"
      ? '"res://addons/playforge_unreal_compat/ue_character_movement.gd"'
      : "Node3D";
  emit(`extends ${baseClass}`);
  emit(`## Auto-generated from Unreal Blueprint: ${bpGraph.source_path || bpGraph.name}`);
  emit(`## Graph: ${bpGraph.id} (${bpGraph.kind})`);
  emit("");

  // Variables
  for (const v of bpGraph.variables || []) {
    emit(`@export var ${v.name}: ${gdType(v.type)} = ${gdDefault(v.type, v.default)}`);
  }
  if ((bpGraph.variables || []).length > 0) emit("");

  emit("var _scripted_move_input: Vector2 = Vector2.ZERO");
  emit("var _scripted_look_input: Vector2 = Vector2.ZERO");
  emit("var _scripted_mode: bool = false");
  emit("");

  function emitExecChain(startNodeId, indent = "\t", visited = new Set()) {
    let currentId = startNodeId;
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const node = nodesById.get(currentId);
      if (!node) break;

      const nodeMeta = mappings.blueprint_nodes[node.node_class];
      const override = repairOverrides[node.id] || repairOverrides[node.node_class];

      if (override && override.gd_snippet) {
        emit(`${indent}# [AI-Repair Applied] ${override.reason || node.node_class}`, node);
        for (const snippetLine of String(override.gd_snippet).split("\n")) {
          emit(`${indent}${snippetLine}`, node);
        }
      } else if (!nodeMeta || nodeMeta.status === "unsupported") {
        const hint = nodeMeta?.ai_repair_hint || "Provide custom Godot compatibility implementation";
        diagnostics.push({
          code: "UNSUPPORTED_BP_NODE",
          severity: "warning",
          stage: "blueprint_compile",
          source_ref: `${bpGraph.id}:${node.id}`,
          node_class: node.node_class,
          message: `Unsupported Blueprint node '${node.node_class}' (${node.title || node.id}) skipped with diagnostic stub.`,
          suggestion: hint
        });
        emit(`${indent}# TODO(UNSUPPORTED_BP_NODE): ${node.node_class} (${node.title || node.id})`, node);
        emit(`${indent}UnrealCompat.record_event("UnsupportedNodeStub", {"node_id": "${node.id}", "node_class": "${node.node_class}"})`, node);
      } else {
        const p = node.params || {};
        switch (node.node_class) {
          case "K2Node_CallFunction_PrintString":
            emit(`${indent}UnrealCompat.print_string(${JSON.stringify(p.message || "")})`, node);
            break;
          case "K2Node_CallFunction_AddMovementInput":
            emit(`${indent}ue_add_movement_input(${p.direction_expr || "ue_get_control_forward_vector()"}, ${p.scale_expr || "1.0"})`, node);
            break;
          case "K2Node_CallFunction_AddControllerYawInput":
            emit(`${indent}ue_add_controller_yaw_input(${p.value_expr || "0.0"})`, node);
            break;
          case "K2Node_CallFunction_AddControllerPitchInput":
            emit(`${indent}ue_add_controller_pitch_input(${p.value_expr || "0.0"})`, node);
            break;
          case "K2Node_CallFunction_Jump":
            emit(`${indent}ue_jump()`, node);
            break;
          case "K2Node_CallFunction_StopJumping":
            emit(`${indent}ue_stop_jumping()`, node);
            break;
          case "K2Node_CallFunction_Delay":
            emit(`${indent}await get_tree().create_timer(${Number(p.duration || 0.2)}).timeout`, node);
            break;
          case "K2Node_IfThenElse": {
            const cond = p.condition_expr || "true";
            const outs = execNext.get(node.id) || [];
            const trueEdge = outs.find((e) => e.from_pin === "then" || e.from_pin === "True");
            const falseEdge = outs.find((e) => e.from_pin === "else" || e.from_pin === "False");
            emit(`${indent}if ${cond}:`, node);
            if (trueEdge) emitExecChain(trueEdge.to_node, indent + "\t", new Set(visited));
            else emit(`${indent}\tpass`);
            if (falseEdge) {
              emit(`${indent}else:`);
              emitExecChain(falseEdge.to_node, indent + "\t", new Set(visited));
            }
            return;
          }
          case "K2Node_ExecutionSequence": {
            const outs = execNext.get(node.id) || [];
            for (const edge of outs) {
              emitExecChain(edge.to_node, indent, new Set(visited));
            }
            return;
          }
          default:
            emit(`${indent}# Mapped node: ${node.node_class}`, node);
            break;
        }
      }

      const nextEdges = execNext.get(currentId) || [];
      currentId = nextEdges.length > 0 ? nextEdges[0].to_node : null;
    }
  }

  // Event BeginPlay -> _ready()
  const beginPlay = (bpGraph.nodes || []).find((n) => n.node_class === "K2Node_Event_BeginPlay");
  emit("func _ready() -> void:", beginPlay || null);
  emit("\tsuper._ready()");
  if (beginPlay) {
    const first = (execNext.get(beginPlay.id) || [])[0];
    if (first) emitExecChain(first.to_node, "\t");
  }
  emit("");

  // Enhanced Input handlers
  const inputNodes = (bpGraph.nodes || []).filter((n) => n.node_class === "K2Node_EnhancedInputAction");
  const moveNode = inputNodes.find((n) => n.params?.action === "IA_Move");
  const lookNode = inputNodes.find((n) => n.params?.action === "IA_Look");
  const jumpStartNode = inputNodes.find((n) => n.params?.action === "IA_Jump" && n.params?.trigger === "Started");
  const jumpStopNode = inputNodes.find((n) => n.params?.action === "IA_Jump" && n.params?.trigger === "Completed");

  if (moveNode) {
    emit("func _on_ia_move(move_input: Vector2) -> void:", moveNode);
    const first = (execNext.get(moveNode.id) || [])[0];
    if (first) emitExecChain(first.to_node, "\t");
    else emit("\tpass");
    emit("");
  }

  if (lookNode) {
    emit("func _on_ia_look(look_input: Vector2) -> void:", lookNode);
    const first = (execNext.get(lookNode.id) || [])[0];
    if (first) emitExecChain(first.to_node, "\t");
    else emit("\tpass");
    emit("");
  }

  if (jumpStartNode) {
    emit("func _on_ia_jump_started() -> void:", jumpStartNode);
    const first = (execNext.get(jumpStartNode.id) || [])[0];
    if (first) emitExecChain(first.to_node, "\t");
    else emit("\tpass");
    emit("");
  }

  if (jumpStopNode) {
    emit("func _on_ia_jump_completed() -> void:", jumpStopNode);
    const first = (execNext.get(jumpStopNode.id) || [])[0];
    if (first) emitExecChain(first.to_node, "\t");
    else emit("\tpass");
    emit("");
  }

  // Deterministic input bridge for both interactive play & headless trace tests
  emit("func _unhandled_input(event: InputEvent) -> void:");
  emit("\tif _scripted_mode:");
  emit("\t\treturn");
  if (lookNode) {
    emit("\tif event is InputEventMouseMotion and Input.get_mouse_mode() == Input.MOUSE_MODE_CAPTURED:");
    emit("\t\t_on_ia_look(Vector2(event.relative.x, -event.relative.y))");
  }
  if (jumpStartNode) {
    emit("\tif event.is_action_pressed(\"ue_jump\"):");
    emit("\t\t_on_ia_jump_started()");
  }
  if (jumpStopNode) {
    emit("\tif event.is_action_released(\"ue_jump\"):");
    emit("\t\t_on_ia_jump_completed()");
  }
  emit("");

  emit("func _physics_process(delta: float) -> void:");
  if (moveNode) {
    emit("\tvar move_vec := _scripted_move_input");
    emit("\tif not _scripted_mode:");
    emit("\t\tmove_vec = Vector2(");
    emit("\t\t\tInput.get_action_strength(\"ue_move_right_pos\") - Input.get_action_strength(\"ue_move_right_neg\"),");
    emit("\t\t\tInput.get_action_strength(\"ue_move_forward_pos\") - Input.get_action_strength(\"ue_move_forward_neg\")");
    emit("\t\t)");
    emit("\tif move_vec.length_squared() > 1e-6:");
    emit("\t\t_on_ia_move(move_vec)");
  }
  if (lookNode) {
    emit("\tif _scripted_mode and _scripted_look_input.length_squared() > 1e-6:");
    emit("\t\t_on_ia_look(_scripted_look_input)");
    emit("\t\t_scripted_look_input = Vector2.ZERO");
  }
  if (bpGraph.target_entity_class === "ACharacter") {
    emit("\tstep_ue_movement(delta)");
  }
  emit("");

  emit("func set_scripted_inputs(move_vec: Vector2, look_delta: Vector2 = Vector2.ZERO, jump_pressed: bool = false) -> void:");
  emit("\t_scripted_mode = true");
  emit("\t_scripted_move_input = move_vec");
  emit("\t_scripted_look_input = look_delta");
  if (jumpStartNode) {
    emit("\tif jump_pressed:");
    emit("\t\t_on_ia_jump_started()");
  }

  return {
    scriptName: `${bpGraph.id}.gd`,
    code: lines.join("\n") + "\n",
    sourceMap,
    diagnostics
  };
}
