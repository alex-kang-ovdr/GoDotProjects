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

function resolveBaseClass(targetEntityClass) {
  if (targetEntityClass === "ACharacter") {
    return '"res://addons/playforge_unreal_compat/ue_character_movement.gd"';
  }
  if (targetEntityClass === "ATriggerBox") {
    return "Area3D";
  }
  return "Node3D";
}

/**
 * Compile a Blueprint Event Graph IR object into typed GDScript 4.x code,
 * producing a line-level source map and unsupported-node diagnostics.
 * Supports P0 (CharacterMovement, Enhanced Input, Branch, Delay, Sequence, PrintString)
 * and P1 Stack O Bot (Delegates/Signals, Blueprint Interfaces, Overlap, Timeline, SpawnActor, Jetpack, Orb/Goal).
 */
export function compileBlueprintToGDScript(bpGraph, options = {}) {
  const mappings = JSON.parse(fs.readFileSync(MAPPINGS_PATH, "utf8"));
  const repairOverrides = options.repairOverrides || {};
  const nodesById = new Map((bpGraph.nodes || []).map((n) => [n.id, n]));
  const execNext = new Map();
  const dataInputs = new Map(); // `${to_node}:${to_pin}` -> { from_node, from_pin }
  for (const edge of bpGraph.edges || []) {
    if (edge.kind === "exec") {
      if (!execNext.has(edge.from_node)) execNext.set(edge.from_node, []);
      execNext.get(edge.from_node).push(edge);
    } else if (edge.kind === "data") {
      dataInputs.set(`${edge.to_node}:${edge.to_pin}`, edge);
    }
  }

  function resolveDataPin(nodeId, pinName, fallbackExpr = "null", depth = 0) {
    if (depth > 8) return fallbackExpr;
    const edge = dataInputs.get(`${nodeId}:${pinName}`);
    if (!edge) return fallbackExpr;
    const srcNode = nodesById.get(edge.from_node);
    if (!srcNode) return fallbackExpr;
    const sp = srcNode.params || {};
    if (srcNode.node_class === "K2Node_VariableGet") {
      return sp.variable_name || fallbackExpr;
    }
    if (srcNode.node_class === "K2Node_MathExpression") {
      const a = resolveDataPin(srcNode.id, "A", String(sp.a_default ?? "0"), depth + 1);
      const b = resolveDataPin(srcNode.id, "B", String(sp.b_default ?? "0"), depth + 1);
      const op = sp.operator || "+";
      return `(${a} ${op} ${b})`;
    }
    return sp.value_expr || fallbackExpr;
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

  const isCharacter = bpGraph.target_entity_class === "ACharacter";
  const isTrigger = bpGraph.target_entity_class === "ATriggerBox";
  const baseClass = resolveBaseClass(bpGraph.target_entity_class);

  emit(`extends ${baseClass}`);
  emit(`## Auto-generated from Unreal Blueprint: ${bpGraph.source_path || bpGraph.name}`);
  emit(`## Graph: ${bpGraph.id} (${bpGraph.kind})`);
  emit("");

  // Blueprint Event Dispatchers -> Godot signals
  for (const sig of bpGraph.signals || []) {
    const params = (sig.params || []).map((p) => `${p.name}: ${gdType(p.type)}`).join(", ");
    emit(`signal ${sig.name}(${params})`);
  }
  if ((bpGraph.signals || []).length > 0) emit("");

  // Exported Variables
  emit(`@export var actor_id: String = ${JSON.stringify(bpGraph.default_actor_id || bpGraph.id)}`);
  for (const v of bpGraph.variables || []) {
    emit(`@export var ${v.name}: ${gdType(v.type)} = ${gdDefault(v.type, v.default)}`);
  }
  emit("");

  const hasOverlapBegin = (bpGraph.nodes || []).some((n) => n.node_class === "K2Node_Event_ActorBeginOverlap");
  const hasOverlapEnd = (bpGraph.nodes || []).some((n) => n.node_class === "K2Node_Event_ActorEndOverlap");
  const timelineNode = (bpGraph.nodes || []).find((n) => n.node_class === "K2Node_Timeline");

  if (isCharacter) {
    emit("var _scripted_move_input: Vector2 = Vector2.ZERO");
    emit("var _scripted_look_input: Vector2 = Vector2.ZERO");
    emit("var _scripted_jetpack: bool = false");
    emit("var _scripted_mode: bool = false");
    emit("");
  }
  if (isTrigger) {
    emit("var _overlapping_bodies: Array[Node] = []");
    emit("var _triggered_once: bool = false");
    emit("");
  }
  if (timelineNode) {
    emit("var _timeline_alpha: float = 0.0");
    emit("var _timeline_target: float = 0.0");
    emit("var _timeline_base_pos: Vector3 = Vector3.ZERO");
    emit("var _timeline_is_open: bool = false");
    emit("");
  }

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
          case "K2Node_CallFunction_SetJetpackActive":
            emit(`${indent}ue_set_jetpack_active(${p.active_expr ?? "true"})`, node);
            break;
          case "K2Node_SpawnActorFromClass":
            emit(
              `${indent}UnrealCompat.spawn_inactive_bot(get_parent(), global_position, ${p.max_bots_expr || "3"}, self)`,
              node
            );
            break;
          case "K2Node_CallDelegate": {
            const argList = (p.args || []).join(", ");
            emit(`${indent}${p.signal_name}.emit(${argList})`, node);
            emit(
              `${indent}UnrealCompat.record_event("Delegate:${p.signal_name}", {"actor": actor_id, "args": [${argList}]})`,
              node
            );
            break;
          }
          case "K2Node_CallInterfaceFunction": {
            const targetExpr = p.target_actor_var
              ? `UnrealCompat.find_actor(${p.target_actor_var})`
              : `UnrealCompat.find_actor(${JSON.stringify(p.target_actor_id || "")})`;
            const argList = (p.args || []).join(", ");
            emit(
              `${indent}UnrealCompat.call_interface(${targetExpr}, ${JSON.stringify(p.method_name)}, [${argList}])`,
              node
            );
            break;
          }
          case "K2Node_Timeline":
            emit(`${indent}_timeline_target = ${p.target_expr || "1.0"}`, node);
            break;
          case "K2Node_CallFunction_CollectOrb":
            emit(`${indent}if not _triggered_once:`, node);
            emit(`${indent}\t_triggered_once = true`, node);
            emit(`${indent}\tvisible = false`, node);
            emit(`${indent}\tUnrealCompat.collect_orb(actor_id)`, node);
            break;
          case "K2Node_CallFunction_CompleteLevel":
            emit(`${indent}UnrealCompat.complete_level(actor_id)`, node);
            break;
          case "K2Node_VariableSet": {
            const valExpr = resolveDataPin(node.id, "Value", p.value_expr || "0");
            emit(`${indent}${p.variable_name} = ${valExpr}`, node);
            break;
          }
          case "K2Node_CallFunction_SetMaterialParameter": {
            const valExpr = resolveDataPin(node.id, "Value", p.value_expr || "1.0");
            const meshPath = p.mesh_node_path || "MeshInstance3D";
            emit(`${indent}var _mi := get_node_or_null(${JSON.stringify(meshPath)}) as MeshInstance3D`, node);
            emit(`${indent}if _mi != null and _mi.mesh != null and _mi.mesh.surface_get_material(0) is ShaderMaterial:`, node);
            emit(`${indent}\t(_mi.mesh.surface_get_material(0) as ShaderMaterial).set_shader_parameter(${JSON.stringify(p.param_name || "active_strength")}, ${valExpr})`, node);
            break;
          }
          case "K2Node_CallFunction_Delay":
            emit(`${indent}await get_tree().create_timer(${Number(p.duration || 0.2)}).timeout`, node);
            break;
          case "K2Node_CallFunction_SetTimerByFunctionName":
            emit(
              `${indent}UnrealCompat.set_timer_by_function_name(self, ${JSON.stringify(p.function_name || "")}, ${Number(p.time_sec || 1.0)}, ${p.looping ? "true" : "false"})`,
              node
            );
            break;
          case "K2Node_IfThenElse": {
            const cond = resolveDataPin(node.id, "Condition", p.condition_expr || "true");
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
  if (isCharacter) emit("\tsuper._ready()");
  emit("\tUnrealCompat.register_actor(actor_id, self)");
  if (timelineNode) {
    emit("\t_timeline_base_pos = position");
  }
  if (isTrigger && hasOverlapBegin) {
    emit("\tbody_entered.connect(_on_body_entered)");
  }
  if (isTrigger && hasOverlapEnd) {
    emit("\tbody_exited.connect(_on_body_exited)");
  }
  if (beginPlay) {
    const first = (execNext.get(beginPlay.id) || [])[0];
    if (first) emitExecChain(first.to_node, "\t");
  }
  emit("");

  // Blueprint Interface implementations (e.g. BPI_Interactable -> bpi_on_interact)
  for (const iface of bpGraph.interfaces || []) {
    const params = (iface.params || []).map((p) => `${p.name}: ${gdType(p.type)}`).join(", ");
    const entryNode = nodesById.get(iface.entry_node_id);
    emit(`func ${iface.method_name}(${params}) -> void:`, entryNode || null);
    if (entryNode) {
      const first = (execNext.get(entryNode.id) || [])[0];
      if (first) emitExecChain(first.to_node, "\t");
      else emit("\tpass");
    } else {
      emit("\tpass");
    }
    emit("");
  }

  // Blueprint Custom Functions (function_graph)
  for (const fn of bpGraph.functions || []) {
    const params = (fn.params || []).map((p) => `${p.name}: ${gdType(p.type)}`).join(", ");
    const retType = fn.return_type ? gdType(fn.return_type) : "void";
    const entryNode = nodesById.get(fn.entry_node_id);
    emit(`func ${fn.name}(${params}) -> ${retType}:`, entryNode || null);
    if (entryNode) {
      const first = (execNext.get(entryNode.id) || [])[0];
      if (first) emitExecChain(first.to_node, "\t");
      else emit("\tpass");
    } else if (fn.return_expr) {
      emit(`\treturn ${fn.return_expr}`);
    } else {
      emit("\tpass");
    }
    emit("");
  }

  // Event Tick for non-character, non-timeline actors (e.g. rotating Energy Orb)
  const tickNode = (bpGraph.nodes || []).find((n) => n.node_class === "K2Node_Event_Tick");
  if (tickNode && !isCharacter && !timelineNode) {
    emit("func _physics_process(delta: float) -> void:", tickNode);
    const first = (execNext.get(tickNode.id) || [])[0];
    if (first) emitExecChain(first.to_node, "\t");
    else emit("\tpass");
    emit("");
  }

  // Overlap Events (ATriggerBox -> Area3D)
  if (hasOverlapBegin) {
    const ovBegin = (bpGraph.nodes || []).find((n) => n.node_class === "K2Node_Event_ActorBeginOverlap");
    emit("func _update_plate_visual(pressed: bool) -> void:");
    emit('\tvar mi := get_node_or_null("MeshInstance3D") as MeshInstance3D');
    emit("\tif mi == null:");
    emit("\t\treturn");
    emit("\tmi.position.y = -0.05 if pressed else 0.0");
    emit("\tif pressed:");
    emit("\t\tvar active_mat := StandardMaterial3D.new()");
    emit("\t\tactive_mat.albedo_color = Color(0.18, 0.88, 0.42, 1.0)");
    emit("\t\tactive_mat.emission_enabled = true");
    emit("\t\tactive_mat.emission = Color(0.18, 0.95, 0.45, 1.0)");
    emit("\t\tactive_mat.emission_energy_multiplier = 1.6");
    emit("\t\tmi.material_override = active_mat");
    emit("\telse:");
    emit("\t\tmi.material_override = null");
    emit("");
    emit("func _on_body_entered(body: Node) -> void:", ovBegin);
    emit("\tif not body.is_in_group(\"ue_bot_body\"):");
    emit("\t\treturn");
    emit("\tif not _overlapping_bodies.has(body):");
    emit("\t\t_overlapping_bodies.append(body)");
    emit("\tvar is_pressed: bool = _overlapping_bodies.size() > 0");
    emit("\t_update_plate_visual(is_pressed)");
    const first = (execNext.get(ovBegin.id) || [])[0];
    if (first) emitExecChain(first.to_node, "\t");
    emit("");
  }

  if (hasOverlapEnd) {
    const ovEnd = (bpGraph.nodes || []).find((n) => n.node_class === "K2Node_Event_ActorEndOverlap");
    emit("func _on_body_exited(body: Node) -> void:", ovEnd);
    emit("\t_overlapping_bodies.erase(body)");
    emit("\tvar is_pressed: bool = _overlapping_bodies.size() > 0");
    emit("\t_update_plate_visual(is_pressed)");
    const first = (execNext.get(ovEnd.id) || [])[0];
    if (first) emitExecChain(first.to_node, "\t");
    emit("");
  }

  // Timeline update in _physics_process (for Doors / Moving Platforms)
  if (timelineNode && !isCharacter) {
    const tp = timelineNode.params || {};
    const dur = Number(tp.duration_sec || 0.6);
    const offsetM = tp.open_offset_m || [0, 3.2, 0];
    emit("func _physics_process(delta: float) -> void:");
    emit(`\tvar step_amt := delta / ${Math.max(dur, 0.05)}`);
    emit("\t_timeline_alpha = move_toward(_timeline_alpha, _timeline_target, step_amt)");
    emit(`\tposition = _timeline_base_pos + Vector3(${offsetM[0]}, ${offsetM[1]}, ${offsetM[2]}) * _timeline_alpha`);
    emit("\tif _timeline_alpha >= 0.99 and not _timeline_is_open:");
    emit("\t\t_timeline_is_open = true");
    emit('\t\tUnrealCompat.record_event("DoorOpened", {"actor": actor_id})');
    emit("\telif _timeline_alpha <= 0.01 and _timeline_is_open:");
    emit("\t\t_timeline_is_open = false");
    emit('\t\tUnrealCompat.record_event("DoorClosed", {"actor": actor_id})');
    emit("");
  }

  // Character Enhanced Input handlers
  if (isCharacter) {
    const inputNodes = (bpGraph.nodes || []).filter((n) => n.node_class === "K2Node_EnhancedInputAction");
    const moveNode = inputNodes.find((n) => n.params?.action === "IA_Move");
    const lookNode = inputNodes.find((n) => n.params?.action === "IA_Look");
    const jumpStartNode = inputNodes.find((n) => n.params?.action === "IA_Jump" && n.params?.trigger === "Started");
    const jumpStopNode = inputNodes.find((n) => n.params?.action === "IA_Jump" && n.params?.trigger === "Completed");
    const jetpackStartNode = inputNodes.find((n) => n.params?.action === "IA_Jetpack" && n.params?.trigger === "Started");
    const jetpackStopNode = inputNodes.find((n) => n.params?.action === "IA_Jetpack" && n.params?.trigger === "Completed");
    const spawnBotNode = inputNodes.find((n) => n.params?.action === "IA_SpawnBot");

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
    if (jetpackStartNode) {
      emit("func _on_ia_jetpack_started() -> void:", jetpackStartNode);
      const first = (execNext.get(jetpackStartNode.id) || [])[0];
      if (first) emitExecChain(first.to_node, "\t");
      else emit("\tpass");
      emit("");
    }
    if (jetpackStopNode) {
      emit("func _on_ia_jetpack_completed() -> void:", jetpackStopNode);
      const first = (execNext.get(jetpackStopNode.id) || [])[0];
      if (first) emitExecChain(first.to_node, "\t");
      else emit("\tpass");
      emit("");
    }
    if (spawnBotNode) {
      emit("func _on_ia_spawn_bot() -> void:", spawnBotNode);
      const first = (execNext.get(spawnBotNode.id) || [])[0];
      if (first) emitExecChain(first.to_node, "\t");
      else emit("\tpass");
      emit("");
    }

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
    if (jetpackStartNode) {
      emit("\tif event.is_action_pressed(\"ue_jetpack\"):");
      emit("\t\t_on_ia_jetpack_started()");
    }
    if (jetpackStopNode) {
      emit("\tif event.is_action_released(\"ue_jetpack\"):");
      emit("\t\t_on_ia_jetpack_completed()");
    }
    if (spawnBotNode) {
      emit("\tif event.is_action_pressed(\"ue_spawn_bot\"):");
      emit("\t\t_on_ia_spawn_bot()");
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
    emit("\tstep_ue_movement(delta)");
    emit("");

    emit("func set_scripted_inputs(move_vec: Vector2, look_delta: Vector2 = Vector2.ZERO, jump_pressed: bool = false, jetpack_active: bool = false, spawn_bot_pressed: bool = false) -> void:");
    emit("\t_scripted_mode = true");
    emit("\t_scripted_move_input = move_vec");
    emit("\t_scripted_look_input = look_delta");
    if (jumpStartNode) {
      emit("\tif jump_pressed:");
      emit("\t\t_on_ia_jump_started()");
    }
    if (jetpackStartNode && jetpackStopNode) {
      emit("\tif jetpack_active and not _scripted_jetpack:");
      emit("\t\t_scripted_jetpack = true");
      emit("\t\t_on_ia_jetpack_started()");
      emit("\telif not jetpack_active and _scripted_jetpack:");
      emit("\t\t_scripted_jetpack = false");
      emit("\t\t_on_ia_jetpack_completed()");
    }
    if (spawnBotNode) {
      emit("\tif spawn_bot_pressed:");
      emit("\t\t_on_ia_spawn_bot()");
    }
  }

  return {
    scriptName: `${bpGraph.id}.gd`,
    code: lines.join("\n") + "\n",
    sourceMap,
    diagnostics
  };
}
