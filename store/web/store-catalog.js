export const STORE_STATES = Object.freeze([
  'catalog_listed',
  'saved_to_library',
  'license_verified',
  'artifact_downloaded',
  'plan_reviewed',
  'applied_to_project',
  'update_available'
]);

const hex64 = (ch) => ch.repeat(64);

export const SAMPLE_CATALOG = Object.freeze([
  {
    schema_version: 1,
    asset_id: 'lowpoly-fortress-pack',
    asset_version_id: '1.2.0',
    release_id: 'rel-lowpoly-fortress-120',
    release_kind: 'package',
    category: '3D 환경 · 요새',
    title: 'Lowpoly Fortress Siege Kit',
    summary: '성벽, 포탑, 탄두 메쉬와 충돌 콜라이더가 포함된 모듈형 3D 에셋 팩입니다.',
    publisher_id: 'pub-playforge-core',
    store_state: 'catalog_listed',
    artifact_id: 'art-lowpoly-fortress-120',
    artifact_digest: `sha256:${hex64('a')}`,
    dependency_manifest_hash: `sha256:${hex64('1')}`,
    engine_compatibility: {
      godot_min: '4.3',
      godot_tested: '4.7.2',
      platforms: ['web', 'windows', 'linux']
    },
    file_manifest: [
      { path: 'assets/fortress/wall_segment.glb', bytes: 184320, sha256: hex64('b'), executable_addon: false },
      { path: 'assets/fortress/turret_base.tscn', bytes: 8192, sha256: hex64('c'), executable_addon: false }
    ],
    license_snapshot_ref: 'lic-cc0-v1-20261120',
    installation_record: null
  },
  {
    schema_version: 1,
    asset_id: 'ui-tactical-hud-kit',
    asset_version_id: '2.0.1',
    release_id: 'rel-ui-tactical-201',
    release_kind: 'package',
    category: 'UI · 테마 · Addon',
    title: 'Tactical Strategy HUD & Minimap',
    summary: '전략 게임용 체력바, 미니맵 프레임, 입력 힌트 테마와 도크 보조 스크립트 묶음입니다.',
    publisher_id: 'pub-studio-nord',
    store_state: 'catalog_listed',
    artifact_id: 'art-ui-tactical-201',
    artifact_digest: `sha256:${hex64('d')}`,
    dependency_manifest_hash: `sha256:${hex64('2')}`,
    engine_compatibility: {
      godot_min: '4.3',
      godot_tested: '4.7.2',
      platforms: ['web', 'windows', 'linux']
    },
    file_manifest: [
      { path: 'addons/tactical_hud/plugin.cfg', bytes: 512, sha256: hex64('e'), executable_addon: true },
      { path: 'addons/tactical_hud/hud_theme.tres', bytes: 14336, sha256: hex64('f'), executable_addon: false }
    ],
    license_snapshot_ref: 'lic-mit-v1-20261120',
    installation_record: null
  },
  {
    schema_version: 1,
    asset_id: 'sfx-siege-audio-pack',
    asset_version_id: '1.1.0',
    release_id: 'rel-sfx-siege-110',
    release_kind: 'package',
    category: '오디오 · 효과음',
    title: 'Siege Artillery & UI SFX Pack',
    summary: '포격, 타격, 버튼 피드백용 무손실 OGG 효과음 32종 패키지입니다.',
    publisher_id: 'pub-audio-atelier',
    store_state: 'catalog_listed',
    artifact_id: 'art-sfx-siege-110',
    artifact_digest: `sha256:${hex64('3')}`,
    dependency_manifest_hash: `sha256:${hex64('4')}`,
    engine_compatibility: {
      godot_min: '4.3',
      godot_tested: '4.7.2',
      platforms: ['web', 'windows', 'linux', 'macos']
    },
    file_manifest: [
      { path: 'assets/audio/cannon_fire.ogg', bytes: 92160, sha256: hex64('5'), executable_addon: false }
    ],
    license_snapshot_ref: 'lic-royalty-free-v1-20261120',
    installation_record: null
  },
  {
    schema_version: 1,
    asset_id: 'godot-47-dock-guide',
    asset_version_id: '1.0.0',
    release_id: 'rel-editorial-dock-100',
    release_kind: 'editorial',
    category: '가이드 · 일반 콘텐츠',
    title: 'Godot 에디터 도크 레이아웃 & 안전 적용 가이드',
    summary: '웹 Store에서 라이브러리에 저장한 에셋을 Godot 도크에서 변경 검토 후 프로젝트에 반영하는 권장 흐름 안내입니다.',
    publisher_id: 'pub-playforge-docs',
    store_state: 'catalog_listed',
    license_snapshot_ref: 'lic-editorial-v1',
    installation_record: null,
    article_body: [
      '1. Store 웹(PC 또는 모바일)에서는 원하는 패키지를 내 라이브러리(StoreLibraryEntry)에만 저장합니다.',
      '2. 라이브러리에 저장하거나 기기에 다운로드하는 것만으로는 기존 프로젝트 파일이 바뀌지 않습니다.',
      '3. Godot Store 도크에서 새로고침 후 아티팩트 해시와 파일 충돌을 검토한 뒤 선택한 프로젝트에만 적용하세요.'
    ]
  }
]);

export const PUBLISHER_DRAFTS = Object.freeze([
  {
    draft_id: 'draft-fortress-v130',
    asset_id: 'lowpoly-fortress-pack',
    next_version: '1.3.0',
    release_kind: 'package',
    validator_status: 'passed',
    review_status: 'in_review',
    note: 'Godot 4.7.2 Web/Windows 호환성 및 파일 매니페스트 검증 완료'
  },
  {
    draft_id: 'draft-store-checklist',
    asset_id: 'store-publishing-checklist',
    next_version: '1.0.0',
    release_kind: 'editorial',
    validator_status: 'not_applicable',
    review_status: 'draft',
    note: '일반 콘텐츠(editorial): 빈 패키지를 생성하지 않고 문서 초안으로만 관리'
  }
]);

export function validateReleaseContract(entry) {
  const errors = [];
  if (!entry || typeof entry !== 'object') {
    return ['Entry must be an object'];
  }
  if (entry.schema_version !== 1) errors.push('schema_version must be 1');
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(String(entry.asset_id || ''))) errors.push('Invalid asset_id');
  if (!/^[0-9]+\.[0-9]+\.[0-9]+/.test(String(entry.asset_version_id || ''))) errors.push('Invalid asset_version_id');
  if (!/^rel-[a-z0-9-]{4,64}$/.test(String(entry.release_id || ''))) errors.push('Invalid release_id');
  if (!['package', 'editorial'].includes(entry.release_kind)) errors.push('Invalid release_kind');
  if (!STORE_STATES.includes(entry.store_state)) errors.push('Invalid store_state');

  if (entry.release_kind === 'package') {
    if (!/^art-[a-z0-9-]{4,64}$/.test(String(entry.artifact_id || ''))) errors.push('package requires artifact_id');
    if (!/^sha256:[a-f0-9]{64}$/.test(String(entry.artifact_digest || ''))) errors.push('package requires immutable sha256 artifact_digest');
    if (!/^sha256:[a-f0-9]{64}$/.test(String(entry.dependency_manifest_hash || ''))) errors.push('package requires dependency_manifest_hash');
    if (!entry.engine_compatibility?.godot_tested || !Array.isArray(entry.engine_compatibility?.platforms) || !entry.engine_compatibility.platforms.length) {
      errors.push('package requires engine_compatibility');
    }
    if (!Array.isArray(entry.file_manifest) || entry.file_manifest.length === 0) {
      errors.push('package requires non-empty file_manifest');
    }
    if (!entry.license_snapshot_ref) errors.push('package requires license_snapshot_ref');
  } else if (entry.release_kind === 'editorial') {
    if (entry.artifact_id || entry.artifact_digest || entry.file_manifest || entry.installation_record) {
      errors.push('editorial entry must not carry installable package artifact fields');
    }
  }
  return errors;
}

export function canInstallInStoreWeb() {
  return false;
}
