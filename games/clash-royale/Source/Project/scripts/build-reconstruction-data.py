"""Build the small public-evidence adapter without network or third-party packages.

Only the pinned subset under data/reconstruction is read. It does not fetch the
research project, infer missing levels, or import historical combat statistics.
"""
from pathlib import Path
import argparse
import hashlib
import json
import math

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data/reconstruction'
BINDINGS = [
    {'cardId': 'bomber', 'cardKey': 'bomber', 'form': 'base', 'component': 'unit', 'sourceKey': 'damage', 'unit': 'damage', 'key': 'damage', 'label': '병력 피해'},
    {'cardId': 'fireball', 'cardKey': 'fireball', 'form': 'base', 'component': 'spell', 'sourceKey': 'crown_tower_damage', 'unit': 'damage', 'key': 'crownDamage', 'label': '타워 피해'},
    {'cardId': 'arrows', 'cardKey': 'arrows', 'form': 'base', 'component': 'spell', 'sourceKey': 'crown_tower_damage', 'unit': 'damage', 'key': 'crownDamage', 'label': '타워 피해'},
    {'cardId': 'zap', 'cardKey': 'zap', 'form': 'base', 'component': 'spell', 'sourceKey': 'crown_tower_damage', 'unit': 'damage', 'key': 'crownDamage', 'label': '타워 피해'},
    {'cardId': 'spear_goblins', 'cardKey': 'spear-goblins', 'form': 'base', 'component': 'unit', 'sourceKey': 'hit_interval', 'unit': 'seconds', 'key': 'attackInterval', 'label': '공격 간격'},
    {'cardId': 'poison', 'cardKey': 'poison', 'form': 'base', 'component': 'spell', 'sourceKey': 'crown_tower_damage', 'unit': 'damage', 'key': 'crownDamage', 'label': '틱당 타워 피해', 'divisor': 8, 'requires': {'duration': 8, 'tickInterval': 1}, 'derivation': '공식 전체 주문 타워 피해 168을 이 프로토타입의 8초·1초 간격·8틱 계약으로 나눈 21/틱. 원작 틱 시점을 복원한 값은 아님.'},
    {'cardId': 'minion_giant', 'cardKey': 'minion-giant', 'form': 'base', 'component': 'unit', 'sourceKey': 'damage', 'unit': 'damage', 'key': 'damage', 'label': '병력 피해'},
    {'cardId': 'minion_giant', 'cardKey': 'minion-giant', 'form': 'base', 'component': 'unit', 'sourceKey': 'hit_interval', 'unit': 'seconds', 'key': 'attackInterval', 'label': '공격 간격'},
]


def reject_reason(row, binding):
    if row.get('evidence_status') != 'official_confirmed':
        return 'not_official_confirmed'
    if row.get('system') != 'verified_patch_fields_2026' or row.get('full_current_card_profile') is not False:
        return 'unsupported_evidence_scope'
    if row.get('has_later_unspecified_level_change') is not False:
        return 'later_unspecified_level_change'
    status = row.get('reference_level_status')
    if status == 'not_stated':
        return 'reference_level_not_stated'
    if status == 'specified' and row.get('reference_level') != 11:
        return 'reference_level_mismatch'
    if status == 'not_applicable' and row.get('reference_level') is not None:
        return 'reference_level_contract_mismatch'
    if status not in ('specified', 'not_applicable'):
        return 'unknown_reference_level_status'
    if row.get('form') != 'base':
        return 'unsupported_form'
    if not binding:
        if row.get('card_key') == 'vines' and row.get('key') == 'crown_tower_damage':
            return 'spell_total_schedule_not_reconstructed'
        if row.get('unit') == 'tiles':
            return 'tile_conversion_not_defined'
        return 'runtime_binding_not_defined'
    for field, target in [('card_key', 'cardKey'), ('form', 'form'), ('component', 'component'), ('key', 'sourceKey'), ('unit', 'unit')]:
        if row.get(field) != binding[target]:
            return field + '_mismatch'
    if not isinstance(row.get('value'), (int, float)) or isinstance(row['value'], bool) or not math.isfinite(row['value']) or row['value'] < 0:
        return 'invalid_numeric_value'
    return None


def exact_binding(row):
    return next((b for b in BINDINGS if all(row.get(k) == b[v] for k, v in [
        ('card_key', 'cardKey'), ('form', 'form'), ('component', 'component'), ('key', 'sourceKey')])), None)


IMPLEMENTATION = r'''
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

export const DEFAULT_DATA_PROFILE = 'reconstructed-v4-lv11';
export const DATA_PROFILES = freeze({
  'prototype-v4': {
    id: 'prototype-v4', name: '자체 밸런스', referenceLevel: null,
    description: '기존 Crownfall 수치. 공개 패치 수치 덮어쓰기를 사용하지 않습니다.',
    partial: true, originalClientVerified: false,
  },
  'reconstructed-v4-lv11': {
    id: 'reconstructed-v4-lv11', name: '공개 근거 반영 · Lv.11', referenceLevel: 11,
    description: '확인된 일부 필드와 공개 행동을 반영합니다. 나머지 수치와 전투 세부 규칙은 자체 설계입니다.',
    partial: true, originalClientVerified: false,
  },
});
export const RECONSTRUCTION_MANIFEST = freeze(GENERATED.manifest);
export const RECONSTRUCTION_BINDINGS = freeze(GENERATED.bindings);
export const RECONSTRUCTION_PATCH_RECORDS = freeze(GENERATED.patches);
export const RECONSTRUCTION_BEHAVIOR_RECORDS = freeze(GENERATED.behaviors);
export const RECONSTRUCTION_BLOCKED = freeze(GENERATED.blocked);
export const RECONSTRUCTED_OVERRIDES = freeze(GENERATED.overrides);
const sources = new Map(GENERATED.sources.map(source => [source.source_id, source]));
const behaviors = new Map(GENERATED.behaviors.map(row => [row.record_id, row]));
const numericLabels = {
  cost: '비용', hp: '체력', damage: '피해', crownDamage: '타워 피해', attackInterval: '공격 간격',
  range: '사거리', speed: '이동 속도', count: '소환 수', radius: '충돌 반경',
  spellRadius: '주문 반경', duration: '지속 시간', tickInterval: '피해 간격',
  projectileSpeed: '투사체 속도', deployTime: '배치 시간', firstHitDelay: '첫 타격 지연',
  splashRadius: '광역 반경', castDelay: '주문 발동 지연', stunDuration: '기절 시간',
  groundingDuration: '접지 시간', freezeDuration: '동결 시간', slowDuration: '감속 시간',
  slowFactor: '감속 배수', damageReduction: '대형 피해 감소율', chargeSpeed: '돌격 속도',
  abilityCost: '능력 비용', abilityDuration: '능력 지속 시간', abilityCooldown: '능력 재사용 대기',
};
const blockedLabels = {
  not_official_confirmed: '공식 확인 수치가 아님', unsupported_evidence_scope: '지원하지 않는 근거 범위',
  later_unspecified_level_change: '이후 변경의 기준 레벨 미확정', reference_level_not_stated: '기준 레벨 미기재',
  reference_level_mismatch: '레벨 11 조건 불일치', reference_level_contract_mismatch: '레벨 계약 불일치',
  unknown_reference_level_status: '기준 레벨 상태 미확정', unsupported_form: '기본형과 다른 형상',
  spell_total_schedule_not_reconstructed: '전체 피해와 틱 구조의 대응 미확인',
  tile_conversion_not_defined: '원작 타일과 게임 좌표 변환 미정', runtime_binding_not_defined: '현재 구현 필드 연결 없음',
  invalid_numeric_value: '유효한 수치가 아님', card_key_mismatch: '카드 불일치', form_mismatch: '형상 불일치',
  component_mismatch: '구성요소 불일치', key_mismatch: '필드 불일치', unit_mismatch: '단위 불일치',
};
function sourceUrls(ids) {
  return [...new Set((ids || []).map(id => sources.get(id)?.url).filter(url => typeof url === 'string' && /^https?:\/\//.test(url)))];
}
function evidence(row) {
  return {sourceIds: [...(row.source_ids || [])], recordIds: [row.record_id, row.lineage_patch_id].filter(Boolean),
    sourceUrls: sourceUrls(row.source_ids), effectiveFrom: row.effective_from ?? null,
    referenceLevel: row.reference_level ?? null, referenceLevelStatus: row.reference_level_status ?? null};
}
function bindingFor(row) {
  return RECONSTRUCTION_BINDINGS.find(binding => row.card_key === binding.cardKey && row.form === binding.form &&
    row.component === binding.component && row.key === binding.sourceKey);
}

/** Shared explicit admission contract, also exercised with malformed/future rows. */
export function assessPatchRecord(row, binding) {
  if (!row || row.evidence_status !== 'official_confirmed') return {eligible: false, reason: 'not_official_confirmed'};
  if (row.system !== 'verified_patch_fields_2026' || row.full_current_card_profile !== false) return {eligible: false, reason: 'unsupported_evidence_scope'};
  if (row.has_later_unspecified_level_change !== false) return {eligible: false, reason: 'later_unspecified_level_change'};
  const level = row.reference_level_status;
  if (level === 'not_stated') return {eligible: false, reason: 'reference_level_not_stated'};
  if (level === 'specified' && row.reference_level !== 11) return {eligible: false, reason: 'reference_level_mismatch'};
  if (level === 'not_applicable' && row.reference_level !== null) return {eligible: false, reason: 'reference_level_contract_mismatch'};
  if (!['specified', 'not_applicable'].includes(level)) return {eligible: false, reason: 'unknown_reference_level_status'};
  if (row.form !== 'base') return {eligible: false, reason: 'unsupported_form'};
  if (!binding) {
    const reason = row.card_key === 'vines' && row.key === 'crown_tower_damage' ? 'spell_total_schedule_not_reconstructed' :
      row.unit === 'tiles' ? 'tile_conversion_not_defined' : 'runtime_binding_not_defined';
    return {eligible: false, reason};
  }
  for (const [field, expected] of [['card_key', 'cardKey'], ['form', 'form'], ['component', 'component'], ['key', 'sourceKey'], ['unit', 'unit']]) {
    if (row[field] !== binding[expected]) return {eligible: false, reason: field + '_mismatch'};
  }
  if (typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value < 0) return {eligible: false, reason: 'invalid_numeric_value'};
  return {eligible: true, reason: null};
}

function behaviorEntry(id, key, label, value, applied, notes) {
  const row = behaviors.get(id);
  if (!row) return null;
  return {key, label, value, evidenceStatus: row.evidence_status, applied: Boolean(applied),
    ...evidence(row), notes};
}

/** Descriptive, side-effect-free evidence. This function never changes a card. */
export function getCardEvidence(cardId, profile = DEFAULT_DATA_PROFILE, liveCard = null) {
  const activeProfile = Object.hasOwn(DATA_PROFILES, profile) ? DATA_PROFILES[profile] : null;
  const appliedProfile = profile === DEFAULT_DATA_PROFILE;
  const sourceKey = String(cardId).replaceAll('_', '-');
  const fields = [];
  const blocked = [];
  const modeledBehaviors = [];
  const covered = new Set();
  for (const row of RECONSTRUCTION_PATCH_RECORDS.filter(record => record.card_key === sourceKey)) {
    const binding = bindingFor(row), decision = assessPatchRecord(row, binding);
    if (!decision.eligible) {
      blocked.push({key: row.key, label: blockedLabels[decision.reason] || decision.reason, reason: decision.reason,
        value: row.value, form: row.form, component: row.component, unit: row.unit, ...evidence(row),
        notes: row.notes || '현재 전투 수치로 적용하지 않습니다.'});
      continue;
    }
    const value = row.value / (binding.divisor || 1);
    const conditionsMatch = Object.entries(binding.requires || {}).every(([key, expected]) => liveCard?.[key] === expected);
    const matchesEvidence = Boolean(liveCard) && liveCard[binding.key] === value && conditionsMatch;
    const applied = appliedProfile && matchesEvidence;
    if (applied) covered.add(binding.key);
    fields.push({key: binding.key, label: binding.label, value, liveValue: liveCard?.[binding.key] ?? null,
      sourceValue: row.value, unit: binding.divisor ? 'damage_per_prototype_tick' : row.unit,
      evidenceStatus: binding.divisor ? 'derived' : 'official_confirmed', applied, matchesEvidence, ...evidence(row),
      notes: [binding.derivation || '동일 형상·구성요소·단위의 부분 필드만 적용합니다.',
        !appliedProfile ? '자체 밸런스 프로필에서는 이 수치 적용을 사용하지 않습니다.' :
        !conditionsMatch ? '지속 시간 또는 틱 간격이 달라져 공식 전체 피해와 일치하지 않습니다.' :
        liveCard && liveCard[binding.key] !== value ? '개발자 조절 등으로 현재 값이 근거값과 다릅니다.' : ''].filter(Boolean).join(' ')});
  }
  if (cardId === 'minion_giant') {
    const meta = behaviors.get('V4_CARD_MINION_GIANT_METADATA');
    const cost = meta.value.cost_elixir;
    const matchesEvidence = liveCard?.cost === cost;
    const applied = appliedProfile && matchesEvidence;
    if (applied) covered.add('cost');
    fields.unshift({key: 'cost', label: '소환 비용', value: cost, liveValue: liveCard?.cost ?? null,
      sourceValue: cost, unit: 'elixir', evidenceStatus: 'official_confirmed', applied, matchesEvidence, ...evidence(meta),
      notes: '2026년 9월 지원 문서의 4비용. 전체 카드 프로필은 미확인입니다.'});
    modeledBehaviors.push(behaviorEntry('V4_CARD_MINION_GIANT_AXES_RECHECK', 'flying-building-ranged',
      '비행 · 건물 대상 · 원거리', {flying: true, targets: 'buildings', attack: 'ranged'},
      liveCard?.flying === true && liveCard?.targets === 'buildings' && liveCard?.projectileSpeed > 0,
      '이동·공격 대상 축은 공식 문서에 근거합니다. 사거리·속도·투사체 속도 수치는 자체 값입니다.'));
    modeledBehaviors.push(behaviorEntry('V4_CARD_MINION_GIANT_KNOCKBACK', 'knockback-immune',
      '넉백 면역', true, liveCard?.knockbackImmune === true,
      '넉백만 차단합니다. 기절·동결·감속 등 모든 제어 효과에 대한 면역을 의미하지 않습니다.'));
  }
  if (cardId === 'vines') {
    modeledBehaviors.push(behaviorEntry('V4_CARD_VINES_TARGET_SELECTION', 'highest-hp-three',
      '높은 HP 대상 최대 3개', {maximumTargets: 3, priority: 'highest_hp'},
      liveCard?.maxTargets === 3 && liveCard?.targetSelection === 'highest-hp',
      '최대 3개와 높은 HP 우선은 공개 규칙입니다. 현재 HP를 비교하는 기준은 이 프로토타입의 선택입니다.'));
    modeledBehaviors.push(behaviorEntry('V4_CARD_VINES_SELECTION_RECHECK', 'nearest-center-tie',
      '동률 시 주문 중심과 가까운 대상', 'nearest_to_spell_center',
      liveCard?.targetSelection === 'highest-hp',
      '같은 HP이면 중심 거리, 같은 거리이면 안정적인 ID 순서로 처리합니다. 마지막 ID 순서는 자체 결정입니다. 원작 방패 HP 계산은 구현하지 않았습니다.'));
    modeledBehaviors.push(behaviorEntry('V4_CARD_VINES_CONTROL', 'stun-ground',
      '기절 · 공중 대상 접지', {stun: true, grounding: true},
      liveCard?.stunDuration > 0 && liveCard?.groundingDuration > 0,
      '공개 제어 효과를 구현했습니다. 지속 시간과 접지 중 지상 공격의 피격 가능성은 자체 정책입니다.'));
  }
  for (const row of RECONSTRUCTION_BEHAVIOR_RECORDS.filter(record => record.card_key === sourceKey && record.research_kind === 'unresolved_gap')) {
    blocked.push({key: row.key, label: '완전 프로필의 미확인 필드', reason: 'unresolved_profile_fields', value: row.value,
      ...evidence(row), notes: '이 필드들은 공개 자료에서 확보되지 않았습니다. 실행에 필요한 값은 자체 설계로 보완했습니다.'});
  }
  const prototypeFields = Object.entries(numericLabels).filter(([key]) => liveCard && typeof liveCard[key] === 'number' &&
    Number.isFinite(liveCard[key]) && !covered.has(key)).map(([key, label]) => ({key, label, value: liveCard[key],
      evidenceStatus: 'custom_only', notes: '현재 게임의 자체 설정 또는 개발자 조절값. 원작의 검증된 현재 수치로 표시하지 않습니다.'}));
  return {profile, profileName: activeProfile?.name || '지원하지 않는 프로필', referenceLevel: activeProfile?.referenceLevel ?? null,
    partial: true, originalClientVerified: false, researchAsOf: RECONSTRUCTION_MANIFEST.research_as_of,
    fields, behaviors: modeledBehaviors.filter(Boolean), prototypeFields, blocked,
    notes: '공개 근거와 자체 재현 정책을 함께 사용하는 부분 재구축입니다. 실제 원작 관측과 전체 현재 카드 프로필 복원을 주장하지 않습니다.'};
}
'''


def build():
    manifest = json.loads((DATA / 'manifest.json').read_text(encoding='utf-8'))
    raw = (DATA / manifest['evidence_file']).read_bytes()
    if hashlib.sha256(raw).hexdigest() != manifest['evidence_sha256']:
        raise ValueError('Pinned evidence subset hash mismatch')
    evidence = json.loads(raw)
    if evidence['research_package_version'] != '4.0.0' or evidence['original_client_observed'] is not False:
        raise ValueError('Invalid evidence scope')
    records = evidence['patches'] + evidence['behaviors']
    if len({r['record_id'] for r in records}) != len(records):
        raise ValueError('Duplicate evidence record ID')
    sources = {s['source_id']: s for s in evidence['sources']}
    if len(sources) != len(evidence['sources']):
        raise ValueError('Duplicate source ID')
    for row in records:
        if not row['source_ids'] or set(row['source_ids']) - sources.keys():
            raise ValueError('Unresolved source: ' + row['record_id'])
    overrides, admitted, blocked = {}, [], []
    for row in evidence['patches']:
        binding = exact_binding(row)
        reason = reject_reason(row, binding)
        if reason:
            blocked.append({'recordId': row['record_id'], 'lineagePatchId': row.get('lineage_patch_id'),
                            'cardKey': row['card_key'], 'reason': reason})
            continue
        admitted.append(binding)
        overrides.setdefault(binding['cardId'], {})[binding['key']] = row['value'] / binding.get('divisor', 1)
    if len(admitted) != len(BINDINGS) or {id(b) for b in admitted} != {id(b) for b in BINDINGS}:
        raise ValueError('Every explicit binding must have exactly one admitted source record')
    meta = next(r for r in evidence['behaviors'] if r['record_id'] == 'V4_CARD_MINION_GIANT_METADATA')
    if meta['evidence_status'] != 'official_confirmed' or meta['card_key'] != 'minion-giant' or meta['form'] != 'base' or meta['value']['cost_elixir'] != 4:
        raise ValueError('Minion Giant metadata no longer matches the reviewed contract')
    overrides['minion_giant']['cost'] = meta['value']['cost_elixir']
    generated = {'manifest': manifest, 'bindings': BINDINGS, 'overrides': overrides, 'blocked': blocked,
                 'patches': evidence['patches'], 'behaviors': evidence['behaviors'], 'sources': evidence['sources']}
    payload = json.dumps(generated, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    payload = payload.replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
    return ('/** Generated by scripts/build-reconstruction-data.py. Public evidence subset; no runtime network. */\n'
            + 'const GENERATED = ' + payload + ';\n' + IMPLEMENTATION).encode('utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    content = build()
    path = ROOT / 'dist/js/reconstruction.js'
    if args.check:
        if not path.exists() or path.read_bytes() != content:
            raise SystemExit('Reconstruction module is stale; run python scripts/build-reconstruction-data.py')
    else:
        path.write_bytes(content)
    print(json.dumps({'mode': 'check' if args.check else 'build', 'bytes': len(content),
                      'sha256': hashlib.sha256(content).hexdigest(), 'numeric_override_fields': 9,
                      'partial_profile': True, 'original_client_observed': False}))


if __name__ == '__main__':
    main()
