# 03. 텍스처 중심 자산 스트리밍 개발 계획

## 1. 계획 정보

| 항목 | 내용 |
|---|---|
| 계획 ID / 기준일 | G03 / 2026-11-24 |
| 원문 대응 | PDF 2-3쪽 메모리 상주 문제, 7-8쪽 texture·mesh·scene streaming |
| 우선순위 | P1 텍스처·비동기 자산 관리, P2 메시, P3 씬 확장 |
| 구현 위치 | 자산 manifest·loader addon, residency GDExtension/코어 확장 선택 |
| 선행 과제 | [16 빌드](16_Build_Export_CI_Size.md), [13 메모리 계측](13_Profiling_Memory_GPU_Symbols.md) |
| 담당 / 예상 공수 | 엔진·자산 파이프라인 엔지니어, QA / 26-42 PW |
| 상태 | 설계안. 스트리밍 구현·메모리 절감은 아직 검증하지 않음 |

1 PW는 숙련 담당자 1명의 5근무일이다. 전체 공수는 선택적 메시·씬 확장까지 포함하며 텍스처 MVP와 구분하여 집행한다.

## 2. 목표와 범위

플랫폼별 메모리 예산 안에서 필요한 텍스처 해상도를 유지하고 로딩·해제 상태를 관찰할 수 있게 한다. 첫 단계는 texture-first다. actor 단위 World Partition·시뮬레이션 정지·네트워크 relevancy는 자동 포함하지 않는다.

메시·씬 확장은 제작자가 경계를 지정하는 명시적 bundle을 대상으로 한다. GPU LOD 선택, RAM/VRAM residency, 게임 오브젝트 생명주기를 각각 독립 관리하여 '보이지 않음'을 '메모리 해제'로 오인하지 않게 한다.

## 3. 공식 확인과 해석

Godot의 비동기 로딩 API는 `load_threaded_request`와 status 조회를 제공한다. 완료 전에 `load_threaded_get`을 호출하면 호출 스레드가 대기할 수 있으므로 모든 요청을 예산 scheduler를 거치게 한다. [Background loading](https://docs.godotengine.org/en/4.7/tutorials/io/background_loading.html)

자동 mesh LOD는 기존 기능이며 import 과정에서 낮은 상세도 데이터를 만든다. 따라서 본 계획의 추가 가치는 LOD 선택의 재구현이 아니라 자원 분리·입출력·참조 수명 관리다. [Mesh LOD](https://docs.godotengine.org/en/4.7/tutorials/3d/mesh_lod.html)

Texture mip streaming PR #113429는 master 병합이 확인된다. 그러나 master 병합만으로 production tag·모든 backend 지원을 확정하지 않는다. 해당 구현을 우선 평가하여 중복 코드를 피한다. [공식 PR](https://github.com/godotengine/godot/pull/113429)

## 4. 아키텍처

| 모듈 | 책임 |
|---|---|
| `AssetCatalog` | project/build별 content hash, logical ID, dependency DAG, variant 목록 |
| `ResidencyManager` | RAM·VRAM budget, minimum mip, pin count, eviction 후보 |
| `StreamingScheduler` | visibility/usage priority, 동시 IO 제한, 취소, aging·starvation 방지 |
| `ImportChunkBuilder` | mip 또는 독립 mesh LOD/bundle 단위 export 산출물 |
| `GpuUploadQueue` | 프레임별 byte/time 예산, 비동기 업로드, fence 뒤 old RID 해제 |
| `StreamingInspector` | 요청 이유, 실제 resident mip, pending bytes, budget 초과 설명 |

논리 asset ID는 내용 hash와 별도다. 빌드가 바뀌면 새 catalog를 atomic 교체하고 세션 중에는 기존 build catalog를 유지한다. 플랫폼 형식이 다른 텍스처는 독립 variant다.

## 5. 상태와 제안 API

다음 상태·API는 자체 설계다. Godot 기본 API 이름으로 오인하지 않도록 `ForgeAssetService` 경계에 둔다.

```text
Unloaded → Requested → Reading → Decoding → Uploading → Resident
Resident → Downgrading → Resident
Resident → EvictPending → Unloaded
Any pending state → Cancelled / Failed

request(asset_id, quality, priority, owner) -> Lease
release(lease)
pin(lease, reason)
set_budget(profile, ram_bytes, vram_bytes, upload_bytes_per_frame)
query(asset_id) -> {state, wanted_mip, resident_mip, resident_bytes}
```

Lease는 `{asset_id, build_id, generation}`을 포함한다. 취소된 요청이 늦게 완료되어도 generation 검사 후 폐기한다. dependency reference와 renderer fence가 모두 해제된 후에만 실제 eviction한다.

## 6. 데이터 계약과 예산

| 항목 | 정책 |
|---|---|
| texture | 최소 mip 항상 준비, 고해상도 실패 시 placeholder가 아닌 저해상도 유지 |
| material | dependency texture의 현재 RID를 프레임 경계에서 교체 |
| mesh LOD | 분리 저장이 이득인 에셋만 opt-in; bounding box·material slot 안정화 |
| scene bundle | 제작자가 명시한 preload/activate/release 경계, 저장 상태는 외부 유지 |
| collision/nav | 렌더 eviction으로 제거하지 않음; 서버 권한·게임 정책 별도 |
| cache | project/build/content hash 키, LRU·quota, partial download 검증 |

초기 실험 예산은 저사양 모바일 texture 128 MiB, desktop 512 MiB로 두되 이는 제품 보장이 아니다. 최소 mip 집합부터 예산을 초과하면 품질을 무한히 낮추지 않고 빌드 검증에서 실패 이유를 제시한다. RAM 임시 decode와 VRAM old/new 동시 존재도 peak 예산에 포함한다.

## 7. 작업 분해

| 작업 ID | 작업 | 공수(PW) | 산출물 |
|---|---|---:|---|
| G03-1 | 기존 streaming/API/tag·자산 메모리 조사 | 3-5 | 채택 비교, 자산별 residency 기준선 |
| G03-2 | catalog·lease·budget·scheduler | 5-8 | 상태 머신, 진단 API, format v1 |
| G03-3 | texture import·업로드·품질 전환 | 4-6 | texture MVP와 fallback |
| G03-4 | 취소·eviction·cache·오류 복구 | 5-8 | 실패 주입 suite, 메모리 보고서 |
| G03-5 | 선택적 독립 mesh LOD·scene bundle 확장 | 6-10 | 확장 format, 명시적 bundle 도구 |
| G03-6 | 실기기 회귀·마이그레이션·운영 설명 | 3-5 | profile 인증, 제작 가이드 |
| 합계 | 전체 단계 | 26-42 | texture MVP는 G03-1~4에서 평가 |

## 8. 단계별 도입

먼저 4.7 production과 streaming이 포함된 후보 tag를 분리 빌드한다. 공식 구현이 목표를 만족하면 adapter·툴 작업에 집중한다. backport가 필요한 경우 포크 유지보수 비용을 별도로 승인 가능한 설계 결정으로 기록한다.

G03-2 이후 texture만 활성화하고 24시간 이동 루프를 검증한다. 메시·씬은 텍스처 완료 후 실제 추가 메모리 병목이 있는 프로젝트에서만 착수한다. CDN 다운로드와 콘텐츠 권한은 자산 공급 계층 책임이며 렌더러에서 인증·결제를 구현하지 않는다.

## 9. 완료 기준과 검증

| 검증 | 재현 조건 | 목표 |
|---|---|---|
| 예산 준수 | 고정 2 GiB texture corpus, 카메라 3경로 | 안정 구간의 resident texture 목표 budget +5% 이내 |
| peak | 빠른 텔레포트·양방향 반복·동시 요청 | 등록한 RAM/VRAM peak 예산 이내, OOM 0건 |
| hitch | warmup 후 10분×5회, IO 지연 주입 | streaming 추가 main-thread p99 2 ms 이하 목표 |
| 데이터 정합 | 다운로드 중 취소·cache 변조·버전 변경 | hash 불일치 자산 활성화 0건, stale callback 적용 0건 |
| 수명 | 1,000회 load/release | resident 자원·CPU buffer 누적 증가 1% 이내 목표 |
| 화질 | 동일 카메라의 완전 상주 기준 비교 | 근접 중요 자산의 target mip 회복 1초 이내 목표 |

네트워크 지연·저장장치 처리량·압축률·화면 해상도를 함께 기록한다. slow IO에서 회복 시간이 달라지므로 throughput 구간별 SLA를 분리한다. 메모리 절감은 '엔진 총 메모리'와 '대상 texture 메모리'를 각각 비교한다.

## 10. 위험·중단 기준·대안

공식 구현과 이중 scheduler가 충돌하면 하나만 residency 권위를 갖게 한다. texture array·atlas·사용자 UV shader는 평가하지 않은 채 일반 텍스처와 같은 quality estimator를 적용하지 않는다. GPU upload가 지연되면 요청 품질을 낮추고 오래된 최소 mip를 유지한다.

G03-4 종료 시 메모리 peak가 기준선보다 나쁘거나 지속적인 thrashing이 발생하면 세밀한 mip 교체를 중단하고 플랫폼별 사전 축소 texture pack과 명시적 bundle preload를 사용한다. actor 수명 연동은 본 계획의 통과 조건이 아니다.

## 11. 제출물과 출처

제출물: catalog schema, import/export 도구, runtime service, 자산 fixture, 메모리·IO·hitch 측정 기록, 전환·취소·복구 검증, 제작자 예산 가이드. 이번 산출물은 설계 문서이며 benchmark를 수행한 기록은 아니다.

확인일 2026-11-24: [Background loading](https://docs.godotengine.org/en/4.7/tutorials/io/background_loading.html), [Mesh LOD](https://docs.godotengine.org/en/4.7/tutorials/3d/mesh_lod.html), [Texture streaming PR #113429](https://github.com/godotengine/godot/pull/113429). 원문은 PDF 2·3·7·8쪽이다.
