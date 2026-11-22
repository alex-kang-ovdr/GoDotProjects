/**
 * PlayForge Unified Game IR v0.1 Validator (Shared across Unreal/Unity/Roblox Converters)
 * Validates schema compliance, reference integrity, coordinate normalization, and license status.
 */

export function validateUnifiedIR(ir) {
  const errors = [];
  const warnings = [];

  if (!ir || typeof ir !== 'object') {
    return { valid: false, errors: ['IR root must be a JSON object'], warnings };
  }

  if (ir.schema_version !== '0.1') {
    errors.push(`Unsupported schema_version: ${ir.schema_version} (expected "0.1")`);
  }

  if (!ir.source || typeof ir.source !== 'object') {
    errors.push('Missing required field: source');
  } else {
    for (const key of ['engine', 'version', 'project']) {
      if (!ir.source[key]) errors.push(`Missing source.${key}`);
    }
    if (!['unreal', 'unity', 'roblox'].includes(ir.source.engine)) {
      errors.push(`Invalid source.engine: ${ir.source.engine}`);
    }
  }

  if (!ir.units || ir.units.distance !== 'meter' || ir.units.coordinate_system !== 'godot_3d') {
    errors.push("IR units must be normalized to distance='meter' and coordinate_system='godot_3d'");
  }

  for (const field of ['scenes', 'entities', 'logic', 'assets', 'diagnostics']) {
    if (!Array.isArray(ir[field])) {
      errors.push(`Missing or non-array required field: ${field}`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  const entityIds = new Set();
  for (const entity of ir.entities) {
    if (!entity.id) {
      errors.push('Entity missing id');
      continue;
    }
    if (entityIds.has(entity.id)) {
      errors.push(`Duplicate entity id: ${entity.id}`);
    }
    entityIds.add(entity.id);

    if (!entity.transform || !Array.isArray(entity.transform.position) || entity.transform.position.length !== 3) {
      errors.push(`Entity '${entity.id}' has invalid transform.position`);
    }
  }

  const logicIds = new Set();
  for (const graph of ir.logic) {
    if (!graph.id) {
      errors.push('Logic graph missing id');
      continue;
    }
    logicIds.add(graph.id);
    const nodeIds = new Set((graph.nodes || []).map((n) => n.id));
    for (const edge of graph.edges || []) {
      if (!nodeIds.has(edge.from_node)) {
        errors.push(`Logic '${graph.id}' edge references unknown from_node '${edge.from_node}'`);
      }
      if (!nodeIds.has(edge.to_node)) {
        errors.push(`Logic '${graph.id}' edge references unknown to_node '${edge.to_node}'`);
      }
    }
  }

  const assetIds = new Set();
  for (const asset of ir.assets) {
    if (!asset.id) {
      errors.push('Asset missing id');
      continue;
    }
    assetIds.add(asset.id);
    if (!asset.redistributable && asset.license_status === 'blocked') {
      warnings.push(`Asset '${asset.id}' (${asset.source_path}) is blocked by license policy`);
    }
  }

  for (const scene of ir.scenes) {
    for (const eid of scene.entities || []) {
      if (!entityIds.has(eid)) {
        errors.push(`Scene '${scene.id}' references unknown entity '${eid}'`);
      }
    }
  }

  for (const entity of ir.entities) {
    if (entity.parent_id && !entityIds.has(entity.parent_id)) {
      errors.push(`Entity '${entity.id}' references unknown parent_id '${entity.parent_id}'`);
    }
    for (const lref of entity.logic_refs || []) {
      if (!logicIds.has(lref)) {
        errors.push(`Entity '${entity.id}' references unknown logic_ref '${lref}'`);
      }
    }
    for (const comp of entity.components || []) {
      if (comp.asset_ref && !assetIds.has(comp.asset_ref)) {
        errors.push(`Component '${comp.type}' on '${entity.id}' references unknown asset_ref '${comp.asset_ref}'`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      scenes: ir.scenes.length,
      entities: ir.entities.length,
      logic_graphs: ir.logic.length,
      assets: ir.assets.length,
      blocked_assets: ir.assets.filter((a) => !a.redistributable).length,
      diagnostics: ir.diagnostics.length,
    },
  };
}
