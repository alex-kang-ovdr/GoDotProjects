# 07. 데이터 스키마 및 결정론적 A.D.M.S. 엔진 아키텍처

본 문서는 PlayHub 웹 런타임(TypeScript/JavaScript ESM) 또는 Godot 포팅에서 『HORIZON』의 **병렬 분기 그래프·플래그 평가·보옥 세이브/로드 역계승**을 100% 결정론적으로 구동하기 위한 데이터 스키마와 엔진 설계를 정의한다. `[재구성안]`

## 1. SSOT 데이터 파일 구조 (`verified_data/`)
| 파일 | 역할 | 주요 키/관계 |
|---|---|---|
| `characters.json` / `.csv` | 20명 정규 인물 마스터 | `id` → `primary_route_id`, `first_location_id` |
| `locations.json` / `.csv` | 27개 로케이션 마스터 | `id` → `world`, `jewel_id` |
| `routes_and_endings.json` | 9개 루트 · 9개 엔딩 정의 | `entry_node_id`, `clear_global_flag`, `terminal_node_id` |
| `items_and_jewels.json` | 리플렉터 · 보옥 10슬롯 · 아이템 17종 | `carries_across_timelines`, `consumable`, `acquire_node_id` |
| `flags_and_inheritance.json` | 글로벌 11 · 로컬 12 · 교차 계승 5 | `from_route_id`, `to_route_id`, `carried_item_id`, `target_gate_node_id` |
| `adms_nodes.json` | 35개 A.D.M.S. 그래프 노드 및 조건부 엣지 | `edges[].requires_items`, `requires_global_flags`, `requires_local_flags`, `forbids_local_flags` |

## 2. TypeScript 핵심 런타임 타입 정의 `[재구성안]`

```ts
export type VersionMode = 'pc98_8_jewels' | 'ss_remake_10_jewels';

export type NodeType =
  | 'root'
  | 'divergence'
  | 'checkpoint_recommended'
  | 'shining_point'
  | 'event'
  | 'lock_gate'
  | 'whirlpool'
  | 'route_end'
  | 'convergence'
  | 'isekai_stage'
  | 'true_end';

export interface ADMSEdge {
  to: string;
  label_ko: string;
  edge_type: 'normal' | 'divergence' | 'cross_timeline_unlock' | 'trap' | 'convergence' | 'arc_transition';
  requires_items: string[];
  requires_global_flags: string[];
  requires_local_flags: string[];
  forbids_local_flags: string[];
}

export interface ADMSNode {
  id: string;
  title_ko: string;
  title_jp: string;
  route_id: string;
  location_id: string;
  node_type: NodeType;
  reflector_blinks: boolean;
  grants_items: string[];
  grants_jewel: string | null;
  sets_local_flags: string[];
  sets_global_flags: string[];
  edges: ADMSEdge[];
}

export interface LocalTimelineState {
  currentNodeId: string;
  currentLocationId: string;
  localFlags: string[];
  localOnlyItems: string[];
  takenPickupsAtSnapshot: string[];
}

export interface GlobalReflectorState {
  versionMode: VersionMode;
  carriedItems: string[];            // 시간축을 넘어 유지되는 소지품 (소비 시 여기서 제거)
  consumedItemsHistory: string[];    // 패러독스 경고 및 출처 안내용 로그
  collectedJewels: string[];         // 누적 확보 보옥 ID 집합
  placedJewels: Record<string, LocalTimelineState>; // nodeId -> 스냅샷
  discoveredNodes: string[];
  discoveredEdges: string[];         // `${from}->${to}`
  globalFlags: string[];
}

export interface YunoSaveDocument {
  schemaVersion: '1.0.0';
  savedAtIso: string;
  global: GlobalReflectorState;
  local: LocalTimelineState;
}
```

## 3. 결정론적 엔진 핵심 연산 (Pure Reducer 설계) `[재구성안]`
모든 상태 전이는 외부 부수효과(랜덤/시계) 없이 순수 함수로 작성해 단위 테스트·리플레이·세이브 호환성을 보장한다.

### 3.1 엣지 조건 평가 (`evaluateEdge`)
```ts
export function evaluateEdge(
  edge: ADMSEdge,
  global: GlobalReflectorState,
  local: LocalTimelineState
): { unlocked: boolean; missingItems: string[]; missingGlobalFlags: string[]; missingLocalFlags: string[]; blockedByLocalFlags: string[] } {
  const heldItems = new Set([...global.carriedItems, ...local.localOnlyItems]);
  const gFlags = new Set(global.globalFlags);
  const lFlags = new Set(local.localFlags);

  const missingItems = edge.requires_items.filter((id) => !heldItems.has(id));
  const missingGlobalFlags = edge.requires_global_flags.filter((f) => !gFlags.has(f));
  const missingLocalFlags = edge.requires_local_flags.filter((f) => !lFlags.has(f));
  const blockedByLocalFlags = edge.forbids_local_flags.filter((f) => lFlags.has(f));

  return {
    unlocked:
      missingItems.length === 0 &&
      missingGlobalFlags.length === 0 &&
      missingLocalFlags.length === 0 &&
      blockedByLocalFlags.length === 0,
    missingItems,
    missingGlobalFlags,
    missingLocalFlags,
    blockedByLocalFlags,
  };
}
```

### 3.2 보옥 세이브 & 보옥 로드 핵심 불변식 (`placeJewel` / `loadJewel`)
```ts
export function getAvailableJewelCount(global: GlobalReflectorState): number {
  return global.collectedJewels.length - Object.keys(global.placedJewels).length;
}

export function placeJewel(state: YunoSaveDocument, nodeId: string, node: ADMSNode): YunoSaveDocument {
  if (node.route_id === 'route_isekai') {
    throw new Error('이세계편(데라 그란트)에서는 보옥 세이브를 사용할 수 없습니다.');
  }
  const alreadyPlaced = Object.prototype.hasOwnProperty.call(state.global.placedJewels, nodeId);
  if (!alreadyPlaced && getAvailableJewelCount(state.global) <= 0) {
    throw new Error('가용 보옥이 부족합니다.');
  }
  return {
    ...state,
    global: {
      ...state.global,
      placedJewels: {
        ...state.global.placedJewels,
        [nodeId]: structuredClone(state.local),
      },
    },
  };
}

export function loadJewel(state: YunoSaveDocument, nodeId: string): YunoSaveDocument {
  const snapshot = state.global.placedJewels[nodeId];
  if (!snapshot) {
    throw new Error(`노드 ${nodeId}에 배치된 보옥이 없습니다.`);
  }
  const nextPlaced = { ...state.global.placedJewels };
  delete nextPlaced[nodeId]; // 보옥 1개 리플렉터로 회수!

  return {
    ...state,
    // 핵심: global(인벤토리·누적 보옥·탐색 기록·글로벌 플래그)은 현재 상태를 역계승!
    global: {
      ...state.global,
      placedJewels: nextPlaced,
    },
    // 핵심: local(위치·로컬 플래그·해당 시점 취득 오브젝트)만 스냅샷으로 복원!
    local: structuredClone(snapshot),
  };
}
```

## 4. PlayHub 통합 레이어 구조 `[재구성안]`
- **`core/adms-engine.mjs`**: 순수 그래프·플래그·보옥 상태 머신 (브라우저·Node 공용, 테스트 직접 실행 가능).
- **`core/command-loop.mjs`**: 장면 핫스팟 커맨드(`보기/조사/대화/이동/사용`) 및 이세계편 사막/지하도 퍼즐 평가기.
- **`ui/adms-map-view.js`**: Canvas/SVG 기반 A.D.M.S. 트리 렌더러 (광점·소용돌이·보옥 마커·점프 프리뷰).
- **`ui/reflector-hud.js`**: 리플렉터 디바이스 슬롯(8/10) 및 분기 예고 하단 점멸등 애니메이션 위젯.
- **`storage/save-adapter.js`**: `localStorage` 시스템 세이브 20슬롯 + PlayHub 클라우드 세이브 어댑터.
