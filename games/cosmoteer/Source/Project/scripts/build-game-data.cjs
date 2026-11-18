'use strict';

// Rebuild only from the reviewed, checked-in selection. Never fetch data at build time.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const snapshotPath = path.join(root, 'data/analysis-snapshot.json');
const snapshotText = fs.readFileSync(snapshotPath, 'utf8');
const snapshot = JSON.parse(snapshotText);
const allowed = new Set(['wiki_snapshot', 'patch_confirmed']);
const sourceIds = new Set(snapshot.sources.map(s => s.id));
const recordIds = new Set(snapshot.records.map(r => r.id));
if (recordIds.size !== snapshot.records.length || sourceIds.size !== snapshot.sources.length) throw new Error('Duplicate evidence IDs');
for (const id of Object.values(snapshot.partReferences)) if (!recordIds.has(id)) throw new Error('Missing part reference: ' + id);
for (const record of snapshot.records) {
  for (const [field, ids] of Object.entries(record.evidence)) {
    for (const id of ids) if (!sourceIds.has(id)) throw new Error('Missing source: ' + record.id + '.' + field + ' → ' + id);
    if (allowed.has(record.field_status[field]) && record.fields[field].value !== null && !ids.length) throw new Error('Unattributed field: ' + record.id + '.' + field);
  }
}
const digest = crypto.createHash('sha256').update(snapshotText).digest('hex');

function makeAdapter(snapshot, snapshotDigest) {
  'use strict';
  const allowed = new Set(['wiki_snapshot', 'patch_confirmed']);
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) deepFreeze(child);
      Object.freeze(value);
    }
    return value;
  }
  const records = Object.fromEntries(snapshot.records.map(r => [r.id, r]));
  const sources = Object.fromEntries(snapshot.sources.map(s => [s.id, s]));
  const mappings = [];
  function getRecord(id) { return own(records, id) ? records[id] : null; }
  function getEvidence(recordId, field) {
    const r = getRecord(recordId);
    if (!r || !own(r.fields, field)) return null;
    const f = r.fields[field];
    return deepFreeze({ recordId, field, value: f.value, unit: f.unit, status: r.field_status[field],
      sourceIds: r.evidence[field].slice(), sources: r.evidence[field].map(id => sources[id]),
      observations: (r.observations || []).filter(o => o.field === field),
      exactGameBuild: snapshot.sourceDataset.exactGameBuild, versionScope: r.version_scope });
  }
  function readKnown(recordId, field, expectedUnit) {
    const e = getEvidence(recordId, field);
    if (!e || e.value === null || !allowed.has(e.status) || !e.sourceIds.length) {
      throw new Error('Unverified analysis field: ' + recordId + '.' + field);
    }
    if (expectedUnit && e.unit !== expectedUnit) throw new Error('Analysis unit mismatch: ' + recordId + '.' + field);
    return e.value;
  }
  const rounded = value => Math.round(value * 1e9) / 1e9;
  function mapped(target, recordId, field, factor, unit, note) {
    const e = getEvidence(recordId, field), raw = readKnown(recordId, field);
    if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new Error('Analysis field is not numeric: ' + recordId + '.' + field);
    const value = rounded(raw * factor);
    mappings.push({ target, value, unit, mode: factor === 1 ? 'documented_relationship' : 'prototype_scale',
      recordId, sourceField: field, sourceValue: raw, sourceUnit: e.unit, sourceStatus: e.status,
      sourceIds: e.sourceIds, factor, note });
    return value;
  }
  function tuning(target, value, unit, note, relatedRecords = []) {
    mappings.push({ target, value, unit, mode: 'prototype_tuning', sourceValue: null,
      sourceIds: [], relatedRecords, note });
    return value;
  }
  const reactorSources = { reactor: 'small_reactor_core', reactor_medium: 'medium_reactor_core', reactor_large: 'large_reactor_core' };
  const labels = { reactor: '원자로', reactor_medium: '중형 원자로', reactor_large: '대형 원자로' };
  const colors = { reactor: '#f2b75a', reactor_medium: '#e7a95a', reactor_large: '#e08a58' };
  const PART_OVERRIDES = {};
  for (const [type, sourceId] of Object.entries(reactorSources)) {
    const target = 'parts.' + type + '.';
    const pack = mapped(target + 'batteryPack', sourceId, 'battery_size', 6, 'prototype_power/carry', '전지 묶음만 6배. 발전량·버퍼와 별도 조정.');
    const generation = mapped(target + 'generation', sourceId, 'power_generation_per_s', 7, 'prototype_power/s', '발전량만 7배로 조정.');
    PART_OVERRIDES[type] = {
      name: labels[type], description: '승무원 1회 운반 ' + pack + ' 에너지 · 초당 ' + generation + ' 생산. 원작 원자로 단계 비율을 반영했습니다.',
      cost: mapped(target + 'cost', sourceId, 'value_credits', 0.014, 'prototype_credits', '원자로 가격 전용 0.014배 조정.'),
      hp: mapped(target + 'hp', sourceId, 'hp', 0.0575, 'prototype_HP', '기존 전투 내구도 규모 유지.'),
      mass: mapped(target + 'mass', sourceId, 'mass_t', 1.05, 'prototype_mass', '원자로 질량 비율을 보존한 조정.'),
      powerCapacity: mapped(target + 'powerCapacity', sourceId, 'power_capacity', 12.5, 'prototype_power', '저장 버퍼만 12.5배. 보편적인 단위 환산 아님.'),
      generation, batteryPack: pack, powerSource: true, color: colors[type], walkable: true
    };
  }
  const sourceInput = readKnown('recipe_ammo', 'inputs', 'item[]/ratio');
  const sourceOutput = readKnown('recipe_ammo', 'outputs', 'item[]/ratio');
  if (sourceInput.length !== 1 || sourceInput[0].resource_id !== 'sulfur' || sourceOutput.length !== 1 || sourceOutput[0].resource_id !== 'ammo') throw new Error('Unexpected ammunition recipe');
  const quantityScale = 1 / sourceInput[0].quantity;
  const sulfurPerBatch = rounded(sourceInput[0].quantity * quantityScale);
  const ammoPerBatch = rounded(sourceOutput[0].quantity * quantityScale);
  mappings.push({ target: 'industry.recipeRatio', value: { sulfur: sulfurPerBatch, ammo: ammoPerBatch },
    unit: 'items/ratio', mode: 'documented_ratio', recordId: 'recipe_ammo', sourceFields: ['inputs', 'outputs'],
    sourceIds: getEvidence('recipe_ammo', 'inputs').sourceIds, factor: quantityScale,
    note: '황0.05→탄약1 비율을 정수화. 원작 실제 생산 묶음 크기를 뜻하지 않음.' });
  const INDUSTRY = {
    batchSeconds: tuning('industry.batchSeconds', 10, 's/prototype_batch', '원작 배치 주기 null을 채우지 않고 별도 실행 주기로 선택.', ['recipe_ammo']),
    sulfurPerBatch, ammoPerBatch,
    documentedAmmoPerSecond: mapped('industry.documentedAmmoPerSecond', 'recipe_ammo', 'production_rate_per_s', 1, 'ammo/s', '공개 자료의 표시 출력률. prototype batch의 20/10과 일치.'),
    powerPerSecond: mapped('industry.powerPerSecond', 'recipe_ammo', 'power_use_per_s', 6, 'prototype_power/s', '공장 전력 전용 6배 조정. 원자로 발전량의 7배와 별개.'),
    initialStorageSulfur: tuning('industry.initialStorageSulfur', 6, 'sulfur', '새 원정의 첫 생산 실험용 보급. 기존 저장에는 지급하지 않음.'),
    sulfurUnitPrice: mapped('industry.sulfurUnitPrice', 'sulfur', 'base_price_credits', 0.1, 'prototype_credits/sulfur', '황 거래 전용 0.1배 가격 조정.'),
    sulfurCarryAmount: tuning('industry.sulfurCarryAmount', 4, 'sulfur/carry', '승무원 운반량은 이 프로토타입의 작업 단위.'),
    storageSulfurCapacity: tuning('industry.storageSulfurCapacity', 20, 'sulfur/module', '단일칸 저장고의 별도 황 버퍼. 원작 격자 크기를 복원한 값 아님.'),
    salvageBase: tuning('industry.salvageBase', 2, 'sulfur', '승리 보상 원자성 검증을 위한 자체 회수량.'),
    salvagePerSector: tuning('industry.salvagePerSector', 2, 'sulfur/sector', '원작 잔해 환급률과 무관한 자체 원정 보상.'),
    sulfurResaleMultiplier: tuning('industry.sulfurResaleMultiplier', 0.6, 'ratio', '매입가보다 낮은 자체 판매 계수.')
  };
  PART_OVERRIDES.storage = { sulfurCapacity: INDUSTRY.storageSulfurCapacity, sulfurSource: true };
  const factoryResourceCapacity = readKnown('cannon_ammo_factory', 'resource_capacity', 'item[]');
  const factorySulfur = factoryResourceCapacity.find(x => x.resource_id === 'sulfur');
  if (!factorySulfur) throw new Error('Missing factory sulfur capacity');
  PART_OVERRIDES.ammo_factory = {
    name: '탄약 공장', description: '황 1과 전력을 소비해 10초마다 탄약 20발을 생산합니다. 승무원이 원료와 탄약을 옮깁니다.',
    cost: tuning('parts.ammo_factory.cost', 420, 'prototype_credits', '첫 원정 보상 안에서 생산 투자 선택이 가능한 자체 가격.', ['cannon_ammo_factory']),
    hp: mapped('parts.ammo_factory.hp', 'cannon_ammo_factory', 'hp', 0.0575, 'prototype_HP', '전투 내구도 규모 조정.'),
    mass: mapped('parts.ammo_factory.mass', 'cannon_ammo_factory', 'mass_t', 1.05, 'prototype_mass', '함선 물리 규모 조정.'),
    powerCapacity: mapped('parts.ammo_factory.powerCapacity', 'cannon_ammo_factory', 'power_capacity', 12, 'prototype_power', '공장 전력 버퍼 전용 조정.'),
    ammoCapacity: tuning('parts.ammo_factory.ammoCapacity', 60, 'ammo', '완성 탄약 3묶음을 담는 자체 버퍼. 원작20개와 구별.', ['cannon_ammo_factory']),
    sulfurCapacity: factorySulfur.quantity, color: '#d3ad67', walkable: true, ammoSource: true
  };
  mappings.push({ target: 'parts.ammo_factory.sulfurCapacity', value: factorySulfur.quantity, unit: 'sulfur',
    mode: 'documented_relationship', recordId: 'cannon_ammo_factory', sourceField: 'resource_capacity',
    sourceValue: factorySulfur.quantity, sourceIds: getEvidence('cannon_ammo_factory', 'resource_capacity').sourceIds,
    note: '공장에 명시된 황 저장량5를 사용.' });
  const CREW_MOVEMENT = {
    baseTilesPerSecond: mapped('crew.baseTilesPerSecond', 'crew_movement', 'base_walk_speed', 1, 'prototype_tiles/s', '3.2 수치 채택. 실제 부품 격자와 크기는 프로토타입이다.'),
    corridorMultiplier: mapped('crew.corridorMultiplier', 'crew_movement', 'corridor_multiplier', 1, 'ratio', '통로 속도 계수 직접 반영.'),
    roomMultiplier: mapped('crew.roomMultiplier', 'crew_movement', 'other_room_multiplier', 1, 'ratio', '일반 방 속도 계수 직접 반영.')
  };
  function getPartReference(type) {
    if (!own(snapshot.partReferences, type)) return null;
    return deepFreeze({ type, sourceRecordId: snapshot.partReferences[type], record: getRecord(snapshot.partReferences[type]),
      mappings: mappings.filter(m => m.target.startsWith('parts.' + type + '.')),
      geometry: snapshot.adaptationPolicy.prototypeGeometry,
      existingTuningRetained: !['reactor', 'reactor_medium', 'reactor_large', 'ammo_factory'].includes(type) });
  }
  function getMapping(target) { return mappings.find(m => m.target === target) || null; }
  deepFreeze(snapshot);
  return deepFreeze({ SCHEMA_VERSION: 1, ADAPTER_VERSION: snapshot.adapterProfile, SNAPSHOT_DIGEST: snapshotDigest,
    SOURCE_METADATA: snapshot.sourceDataset, SNAPSHOT: snapshot, PART_REFERENCES: snapshot.partReferences,
    PART_OVERRIDES, INDUSTRY, CREW_MOVEMENT, MAPPINGS: mappings, SOURCES: sources,
    getRecord, getEvidence, readKnown, getPartReference, getMapping });
}

const serialized = JSON.stringify(snapshot).replace(/</g, '\\u003c');
const output = '// Generated by scripts/build-game-data.cjs; edit the curated snapshot or generator.\n' +
  '(function (root, factory) {\n  var api = factory();\n  if (typeof module === "object" && module.exports) module.exports = api;\n  else root.StarData = api;\n})(typeof globalThis !== "undefined" ? globalThis : this, function () {\n  return (' +
  makeAdapter.toString() + ')(' + serialized + ', ' + JSON.stringify(digest) + ');\n});\n';
const destination = path.join(root, 'dist/data.js');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8') !== output) throw new Error('dist/data.js is out of date; run node scripts/build-game-data.cjs');
} else fs.writeFileSync(destination, output);
console.log((process.argv.includes('--check') ? 'Checked' : 'Built') + ' dist/data.js: ' + snapshot.records.length + ' evidence records, ' + Object.keys(snapshot.partReferences).length + ' part links, ' + output.length + ' characters.');
