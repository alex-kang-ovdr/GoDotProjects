# 06. 하드웨어 레이트레이싱 통합·확장 개발 계획

## 1. 계획 정보

| 항목 | 내용 |
|---|---|
| 계획 ID / 기준일 | G06 / 2026-11-24 |
| 원문 대응 | PDF 3쪽 HWRT API, 7쪽 장기 렌더링 개선 |
| 우선순위 | R&D/P3. desktop 고품질 선택 기능 |
| 구현 위치 | 기존 RenderingDevice RT API 기반 adapter·Compositor 효과, 필요한 backend만 core patch |
| 선행 과제 | [04 pass 계약](04_Compositor_Render_Passes.md), [13 진단](13_Profiling_Memory_GPU_Symbols.md), [03 자산 수명](03_Asset_Streaming.md) |
| 담당 / 예상 공수 | 저수준 그래픽 엔지니어 2명, shader·QA 부분 참여 / 36-61 PW |
| 상태 | 연구·개발 계획. RT API 실행·기기 검증·효과 성능은 미측정 |

1 PW는 숙련 담당자 1명의 5근무일이다. 공수는 다중 backend 확장 연구까지 포함하며 첫 기능은 Vulkan desktop으로 제한한다.

## 2. 목표와 범위

이미 공개된 RT 기능을 조사하여 누락된 제작·자산 수명·품질·배포 경계를 완성한다. 첫 사용자 기능은 제한된 불투명 정적/강체 지오메트리의 RT shadow 또는 reflection 중 한 가지다. 두 효과를 동시에 production 목표로 잡지 않는다.

full path tracing, 모든 material의 arbitrary shader 평가, 모바일 기본 활성화, 모든 GPU API 동시 지원은 별도 연구다. HWRT로 물리 raycast·서버 판정·안티치트를 대체하지 않는다.

## 3. 원문 교정과 확인 사실

Godot 4.7 RenderingDevice 문서에는 BLAS/TLAS 및 raytracing pipeline API가 이미 나타나고 일부에 Experimental 표시가 있다. 따라서 'HWRT API 전혀 없음'을 개발 전제로 삼지 않는다. [공식 API](https://docs.godotengine.org/en/4.7/classes/class_renderingdevice.html)

동 문서는 `SUPPORTS_RAY_QUERY`와 `SUPPORTS_RAYTRACING_PIPELINE`의 Vulkan 제한을 안내한다. 다른 backend와 Apple·모바일 지원은 장치에 RT 하드웨어가 있다는 이유만으로 선언하지 않는다. [기능 목록](https://docs.godotengine.org/en/4.7/classes/class_renderingdevice.html#enum-renderingdevice-features)

Vulkan plumbing PR #99119도 master 병합으로 확인된다. 이 사실은 product-quality effect·모든 플랫폼의 완성 증거가 아니다. [공식 PR](https://github.com/godotengine/godot/pull/99119)

## 4. 모듈 구조

| 모듈 | 책임 |
|---|---|
| `RTCapabilityProbe` | backend·GPU·driver·API feature 조회와 허용 profile |
| `RTGeometryRegistry` | mesh hash, vertex/index layout, BLAS lease, transform instance |
| `ASBuildScheduler` | BLAS build/update/compact, TLAS 갱신, 프레임 예산 |
| `RTMaterialTable` | 첫 범위의 opaque/alpha mask·roughness 등 제한된 material 계약 |
| `RTEffectPass` | ray dispatch·output·denoise·history·raster 합성 |
| `RTDiagnostics` | AS 비용·ray count·effect 시간·VRAM·fallback 이유 |

원본 renderer의 geometry handle과 RT handle을 분리하되 asset hash를 공유한다. BLAS가 vertex buffer를 참조하는 동안 [03 스트리밍](03_Asset_Streaming.md)이 해당 버퍼를 해제하지 못하게 lease를 유지한다. mesh LOD 교체는 BLAS 준비 완료 후 프레임 경계에서 적용한다.

## 5. 제안 API와 데이터 계약

다음은 자체 facade 의사코드다. 하부 Godot API 이름·서명은 G06-1의 pin한 빌드에 맞춘다.

```text
RTProfile = {backend, effect, ray_budget, as_memory_budget, supported_materials}
register_geometry(mesh_hash, vertex_layout, geometry_flags) -> GeometryLease
register_instance(geometry_lease, transform, visibility_mask) -> RTInstanceId
request_effect(view_id, profile_id, output_resource)
query_rt_status() -> {available, reason, as_bytes, build_ms, trace_ms}
```

shader/layout/SBT·geometry descriptor 버전은 build manifest에 함께 저장한다. GPU가 사용 중인 AS·SBT 범위는 fence 완료 전 반환하지 않는다. unsupported material은 명시적 proxy 또는 raster fallback으로 처리하며 보이지 않는 RT 결과를 조용히 허용하지 않는다.

## 6. 구현·지원 경계

| 범위 | 첫 단계 정책 |
|---|---|
| 정적 mesh | 공유 BLAS, instance transform만 TLAS 갱신 |
| 강체 이동 | TLAS update 비용을 측정, 과다 갱신 제한 |
| 스키닝·파괴 mesh | 별도 build/update 비용 검증 후 opt-in |
| alpha cutout | 지원 material subset으로 제한, 그림자 오차 fixture 추가 |
| transparent/refraction | 첫 효과에서 제외 또는 문서화된 fallback |
| D3D12/Metal | 별도 기능 조사·adapter spike, 미지원이면 raster 유지 |
| Android/iOS/Web | 기본 비활성, capability·품질·발열 검증 후 개별 승격 |

## 7. 작업 분해

| 작업 ID | 작업 | 공수(PW) | 산출물 |
|---|---|---:|---|
| G06-1 | pin API·기기·샘플 조사, 첫 효과 선정 | 3-5 | 기능 지원표·ADR·No-Go 기준 |
| G06-2 | geometry registry·BLAS/TLAS·수명 | 6-10 | AS manager·stress fixture |
| G06-3 | material·ray dispatch·renderer 연결 | 6-10 | 단일 효과 prototype |
| G06-4 | denoise·temporal·품질 profile·fallback | 8-14 | 효과 패키지·비교 도구 |
| G06-5 | 다른 backend/동적 mesh 제한 연구 | 8-14 | 연구별 채택/보류 결과 |
| G06-6 | 회귀·성능·패키지·업그레이드 가이드 | 5-8 | 검증 보고서·배포 문서 |
| 합계 | 전체 확장 연구 포함 | 36-61 | G06-5는 첫 출시 필수 아님 |

## 8. 단계별 도입

G06-1은 작은 정적 scene의 API 실행·AS lifetime 검증을 먼저 수행한다. 이후 3 GPU vendor 중 적어도 2개에서 첫 효과의 결과를 비교한다. 첫 product profile은 Windows Vulkan desktop에 한정하고 release feature flag 기본값은 off다.

효과 품질에 대한 제작자 요구와 총 frame budget을 만족한 프로젝트만 opt-in한다. 다른 backend는 별도 adapter가 검증되기 전 지원표에 Experimental 또는 Unsupported로 표시한다. 실험 branch의 RT를 core default로 끌어올리지 않는다.

## 9. 완료 기준과 검증

| 검증 | 조건 | 목표 |
|---|---|---|
| 기능 발견 | RT 없음·부분 지원·지원 GPU | 시작 실패 0건, 정확한 fallback 이유 표시 |
| AS 정확성 | 10k instance, 생성/삭제·LOD 교체 1,000회 | stale geometry·GPU validation 오류 0건 |
| 그림 품질 | 얇은 geometry·alpha·움직임·teleport fixture | 승인 reference 대비 누락 geometry 0, 허용 ghosting 이하 |
| budget | 1080p, 고정 효과/화질, 5분×5회 | RT 전체 GPU p95 4 ms 이하 목표, AS+history VRAM 256 MiB 이하 목표 |
| 안정성 | 30분 이동 및 resize·alt-tab | device lost·누수 0, failure시 다음 실행 안전 profile |
| 회귀 | RT off, 서버·미지원 export | 기존 raster 결과·server 동작 보존 |

4 ms·256 MiB는 기준 desktop scene의 계획값이다. 성능 계측에는 AS build/update·trace·denoise·합성 모두를 포함한다. 정지 화면의 ray dispatch 시간만 발표하지 않는다. p50/p95/p99, driver, shader cache cold/warm 결과를 분리한다.

## 10. 리스크·중단·대안

실험 API가 엔진 갱신마다 바뀌면 facade 한 곳에서 수용하고 version contract 검사로 빌드를 막는다. mobile 배터리·열·지원 범위가 맞지 않으면 반사 probe·SSR·shadow map을 유지한다. RT 채택 때문에 minimum GPU 사양을 자동 상향하지 않는다.

G06-3 종료 시 목표 효과가 기존 raster보다 제작 가치가 낮거나 총 프레임 예산을 20% 이상 초과하면 denoiser/다중 backend 확장을 중단한다. 이후 연구는 별도 예산으로 재승인할 수 있게 기술 결과와 한계를 남긴다.

## 11. 제출물과 출처

제출물: capability matrix, RT adapter와 효과 prototype, AS lifetime schema, fixed scene·capture, 성능/화질 검증 계획과 결과 양식, fallback·미지원 material 목록, API upgrade guide. 현재 작성된 산출물은 계획서다.

확인일 2026-11-24: [RenderingDevice 4.7](https://docs.godotengine.org/en/4.7/classes/class_renderingdevice.html), [Vulkan RT PR #99119](https://github.com/godotengine/godot/pull/99119). 원문은 PDF 3·7쪽이며 API 부재 표현은 공식 API 확인에 맞춰 수정했다.
