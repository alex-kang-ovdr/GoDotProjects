# 07. 선택적 Deferred 렌더러 연구·개발 계획

## 1. 계획 정보

| 항목 | 내용 |
|---|---|
| 계획 ID / 기준일 | G07 / 2026-11-24 |
| 원문 대응 | PDF 3쪽 렌더러 확장, 7쪽 고밀도 라이트용 Deferred |
| 우선순위 | R&D/P3. 측정으로 이득이 입증된 desktop 프로젝트 전용 |
| 구현 위치 | renderer 실험 브랜치, 공용 자산·shader contract와 최소 core 확장 |
| 선행 과제 | [04 pass 확장](04_Compositor_Render_Passes.md), [13 진단](13_Profiling_Memory_GPU_Symbols.md), [16 빌드](16_Build_Export_CI_Size.md) |
| 담당 / 예상 공수 | 렌더링 엔지니어 2명, shader·TA·QA 부분 참여 / 40-63 PW |
| 상태 | 연구 설계. Deferred 구현·성능 우위는 아직 검증하지 않음 |

1 PW는 숙련 담당자 1명의 5근무일이다. 범위가 큰 별도 renderer를 도입하는 비용이므로 초기 플랫폼 필수 일정과 분리한다.

## 2. 목표와 채택 기준

조명 중첩이 높은 특정 3D 장면에서 Forward+보다 좋은 총 GPU 시간을 얻을 수 있는지 검증한다. renderer 이름이나 라이트 개수만으로 채택하지 않는다. 같은 material·shadow·해상도·이미지 품질에서의 비교가 출발점이다.

첫 범위는 불투명 표준 PBR, 정적/강체 mesh, 제한된 light type, forward transparency와 기존 후처리 결합이다. full shader language 호환, 모든 mobile, VR, 특수 material·MSAA 동등성은 후속 게이트다.

## 3. 공식 사실과 가정

Godot 4.7 공식 아키텍처 문서는 Forward+의 clustered lighting과 forward/deferred 선택의 유연성·MSAA tradeoff를 설명한다. Forward renderer 일부에 deferred 성격의 처리가 있음을 함께 명시하므로 'deferred pass 없음'과 '완전한 deferred renderer 없음'을 구분한다. [렌더링 아키텍처](https://docs.godotengine.org/en/4.7/engine_details/architecture/internal_rendering_architecture.html)

아래 G-buffer 포맷·비용·채택 기준은 자체 설계다. 원문의 '고밀도 라이트에 유리'는 실험 가설이며 사용자 게임·기기에 대한 성능 보장이 아니다. 실제 채택 engine tag에서 이미 제공되는 기능과 upstream 진행을 먼저 조사한다.

## 4. 렌더 구조

| 단계 | 역할 |
|---|---|
| Geometry pass | depth·normal·roughness·albedo/metal·motion 등 승인 포맷 기록 |
| Light assignment | tile/cluster별 light list 작성, shadow 참조 |
| Lighting pass | 표준 BRDF 평가와 GI/probe 결과 합성 |
| Forward pass | 투명·특수 material·지원하지 않는 mesh 경로 |
| Temporal/post | motion/history·AA·tone mapping·post effect 연계 |
| Diagnostics | G-buffer 시각화·pass time·bandwidth·material fallback 표시 |

material을 두 경로에서 별도로 편집하지 않게 공용 material IR/feature mask를 사용한다. 다만 원래 spatial shader를 자동 변환할 수 없는 경우에는 build에서 unsupported로 표시하고 fallback을 선택하게 한다.

## 5. G-buffer와 메모리 계약

첫 실험용 포맷은 아래와 같다. 실제 포맷은 지원 GPU와 품질 오차 측정 후 확정한다.

| 자원 | 계획 형식·용도 | 비용 검토 |
|---|---|---|
| Depth | 32-bit depth | 재사용 가능 여부와 읽기 전환 비용 |
| Normal/Roughness | packed 32-bit 또는 64-bit | normal precision·banding 비교 |
| Albedo/Metal | 32-bit | linear/sRGB 저장 규칙 명시 |
| Motion | 32-bit | 움직이는 객체·camera cut·zero velocity |
| Material flags | packing 또는 별도 attachment | MRT 한도·해석 일관성 |

최소 16 bytes/pixel 가정이면 1920×1080에서 약 31.6 MiB, 3840×2160에서 약 126.6 MiB의 기본 attachment 크기다. 이 산술에는 alignment·MSAA·HDR lighting target·history·shadow·driver 임시 자원이 포함되지 않는다. 총 VRAM과 대역폭은 실제 capture로 측정한다.

## 6. 제안 설정 계약

아래 키는 새로 정의할 project profile이며 Godot 현재 설정 이름이 아니다.

```yaml
renderer_profile:
  mode: deferred_experimental
  schema_version: 1
  supported_material_set: standard_pbr_v1
  transparency_path: forward
  antialiasing: temporal_candidate
  gbuffer_layout: compact_v1
  fallback_renderer: forward_plus
```

최초에는 프로젝트 시작 시 renderer를 결정하고 런타임 즉시 전환을 제공하지 않는다. build artifact는 선택한 shader variants를 포함하고 profile 변경 시 shader cache key가 달라진다. 서버 export에는 이 프로파일과 GPU 자원을 넣지 않는다.

## 7. 작업 분해

| 작업 ID | 작업 | 공수(PW) | 산출물 |
|---|---|---:|---|
| G07-1 | scene 병목·기존 기능·G-buffer 설계 spike | 3-5 | 같은 품질 비교 기준, Go/No-Go |
| G07-2 | geometry pass·material contract | 8-12 | G-buffer 구현·미지원 진단 |
| G07-3 | light pass·GI/shadow·transparency 결합 | 10-16 | 제한 범위 renderer prototype |
| G07-4 | AA·motion·post·shader build 연계 | 8-12 | 시간적 품질·variant 관리 |
| G07-5 | 성능·플랫폼·시각 회귀 | 6-10 | 지원 GPU 표·차이 보고서 |
| G07-6 | editor profile·migration·패치 유지 | 5-8 | 제작 가이드·fallback·업그레이드 시험 |
| 합계 | 제한된 production 후보 | 40-63 | 완전한 모든 material 호환 제외 |

## 8. 진행 게이트

G07-1에서 프레임 capture로 shading 병목을 확인한다. CPU-bound·shadow-bound·geometry-bound 장면이면 Deferred가 핵심 해결책인지 다시 판단한다. 최초 prototype은 isolated viewport로 구현 가능성을 살피되 결과 복사 비용을 제거한 최종 통합 비용까지 비교한다.

G07-3에서 성능 이득이 없다면 AA·editor 범위 확대를 중단한다. production 승격은 한 프로젝트·한 profile에 한정한다. [06 HWRT](06_Hardware_Ray_Tracing.md)는 독립 기능으로, Deferred 채택의 필수 전제나 자동 성과로 묶지 않는다.

## 9. 완료 기준과 실험

| 검증 | 조건 | 목표 |
|---|---|---|
| 공정 비교 | Forward+와 동일 material·light·shadow·해상도 | 같은 시각 목표를 충족한 결과끼리만 비교 |
| 부하 matrix | 32/128/512 lights, 낮음/높음 중첩, 1080p/4K | 채택 장면 GPU p95 20% 개선 목표 |
| 회귀 | 저조명·알파·많은 geometry 장면 | 해당 지원 profile에서 10% 초과 악화면 기본 사용 금지 |
| 정확성 | normal/roughness·emission·fog·decal fixture | major feature 누락 0, 알려진 차이는 지원표에 명시 |
| 시간 품질 | 얇은 geometry·움직임·camera cut | 승인된 shimmer/ghosting 허용 기준 충족 |
| 메모리 | 같은 scene, 20분 이동·resize | 총 VRAM 추가 20% 이내 목표, 누적 증가 없음 |

장치·OS·GPU driver·engine commit·shader hash를 기록하고 warmup 60초 후 5분×5회로 p50/p95/p99를 수집한다. 라이트 개수뿐 아니라 화면 점유율·shadow 유무·오버드로를 기록한다. MSAA가 필요한 stylized profile은 별도 평가한다.

## 10. 리스크·중단·대안

G-buffer 대역폭·메모리, 특수 material 우회, MSAA/temporal AA 품질과 shader 유지보수가 핵심 위험이다. 모바일 tile renderer는 desktop 결과로 지원을 추정하지 않는다. 벤치마크 한 장면만 빨라지고 전체 제작 경로 비용이 늘면 채택을 보류한다.

40-63 PW 전체 투자는 G07-1/3 gate 통과 시에만 집행한다. 실패 시 light budget·shadow 거리·cluster 설정·baked lighting으로 목표를 맞추고 측정 근거를 남긴다. 기존 프로젝트를 강제로 migration하지 않는다.

## 11. 제출물과 출처

제출물: 비교 fixture·capture, material capability contract, G-buffer layout 문서, 제한 renderer 소스, shader compile 검증, 성능/품질 결과, fallback·마이그레이션 안내. 이번 단계의 산출물은 계획서이며 결과 수치는 목표다.

확인일 2026-11-24: [Godot 4.7 internal rendering architecture](https://docs.godotengine.org/en/4.7/engine_details/architecture/internal_rendering_architecture.html). 공식 [priorities](https://godotengine.org/priorities/)는 연구 방향 참고다. 원문 요구사항은 PDF 3·7쪽이다.
