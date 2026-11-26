# 05. GI 품질·Lightmap 제작·HDDAGI 검증 개발 계획

## 1. 계획 정보

| 항목 | 내용 |
|---|---|
| 계획 ID / 기준일 | G05 / 2026-11-24 |
| 원문 대응 | PDF 3쪽 GI 품질·베이크 문제, 7-8쪽 SDFGI/HDDAGI 개선 |
| 우선순위 | P1 Lightmap 제작 개선, P2 GI 품질 자동 검증, R&D HDDAGI |
| 구현 위치 | editor addon·GPU bake worker·환경 profile, 후보 GI는 별도 엔진 브랜치 |
| 선행 과제 | [13 계측](13_Profiling_Memory_GPU_Symbols.md), [16 빌드](16_Build_Export_CI_Size.md), 선택적 [04 pass](04_Compositor_Render_Passes.md) |
| 담당 / 예상 공수 | 렌더링 엔지니어, 테크니컬 아티스트, QA / 26-41 PW |
| 상태 | 개발 전 설계. GI 성능·화질 비교를 실제 수행한 상태는 아님 |

1 PW는 숙련 담당자 1명의 5근무일이다. HDDAGI 연구 전체를 포함한 공수이며 공식 업스트림 일정과 무관하다.

## 2. 목표와 범위

기본 출시 경로는 플랫폼에 맞는 GI 선택과 재현 가능한 Lightmap 제작이다. 낮은 사양 모바일은 baked lighting·probe 중심으로, desktop은 검증된 실시간 GI 옵션을 제공한다. HDDAGI는 candidate backend로 평가하고 조건이 충족될 때만 승격한다.

원문의 'SDFGI 전면 교체'는 완료 보장이 아니다. 기존 프로젝트의 밝기·재질·반사·안개 결과를 보존하는 migration과 fallback 없이 기본 GI를 교체하지 않는다. 베이크 변경이 게임 규칙·충돌·네트워크 상태를 바꾸지 않도록 시각 자산으로 분리한다.

## 3. 확인된 기능과 연구 경계

LightmapGI는 정적 베이크 결과를 사용하며 UV2·반사 보완이 필요하다. 공식 문서는 GPU 베이크 및 웹에서의 베이크 제약을 설명한다. 따라서 브라우저 제작 흐름은 승인된 GPU worker에서 베이크하고 결과를 미리보는 구조로 설계한다. [LightmapGI](https://docs.godotengine.org/en/4.7/tutorials/3d/global_illumination/using_lightmap_gi.html)

SDFGI는 Forward+에 제공되며 동적 가림체 지원에 제한이 있다. 움직이는 문·파괴 벽 등 요구를 별도 fixture로 검증한다. [SDFGI](https://docs.godotengine.org/en/4.7/tutorials/3d/global_illumination/using_sdfgi.html)

2026-11-24 열람한 HDDAGI PR #86267은 Draft다. PR 작성자의 개선 주장을 우리 제품의 측정값으로 쓰지 않으며 완성·병합 시점을 납기에 넣지 않는다. [공식 PR](https://github.com/godotengine/godot/pull/86267)

## 4. 구조와 제작 흐름

| 구성 | 책임 |
|---|---|
| `LightingProfile` | platform·scene 유형별 GI 방식·품질·메모리 budget |
| `BakePreflight` | UV2 겹침·누락, scale, texel density, 잘못된 static flag 검사 |
| `BakeJobService` | 입력 snapshot, GPU worker 예약, 취소·재시도·진행 상태 |
| `LightingArtifactStore` | bake hash, source/engine/settings hash, 결과·로그·preview 보관 |
| `GIComparisonRunner` | 고정 노출·카메라·시간으로 reference/candidate 비교 |
| `GIBackendAdapter` | 기존 GI와 candidate 설정 변환, 지원 기능 표시 |

씬·mesh·material·조명·설정 hash로 bake key를 만든다. 입력이 변경되면 이전 결과를 stale로 표시하고 사용자가 새 결과를 적용하기 전까지 기존 결과를 유지한다. 캐시 키가 같아도 backend/driver 차이의 결과 허용오차는 별도로 측정한다.

## 5. 제안 작업 계약

아래 스키마와 명령은 자체 제안이며 Godot 내장 서비스가 아니다.

```yaml
bake_job:
  project_id: project-guid
  source_snapshot: commit-or-content-hash
  engine_profile: pinned-engine-and-driver-profile
  lighting_profile: mobile_baked_medium
  scene_hash: sha256
  settings_hash: sha256
  output_format_version: 1
```

`submit_bake`, `cancel_bake`, `validate_result`, `apply_lighting_artifact`를 editor가 호출한다. 취소된 작업의 완료 결과는 자동 적용하지 않는다. 결과 적용은 manifest atomic switch와 이전 revision 보관으로 수행한다.

Lightmap cache는 프로젝트 격리를 유지하고 원본 source snapshot과 연결한다. editor가 API상 베이크에 필요한 환경을 요구하면 일반 headless export job과 구분한 GPU editor worker를 사용한다. 'CLI 지원'이라는 명칭만으로 GPU 없는 환경에서 베이크 가능하다고 가정하지 않는다.

## 6. 품질 검증 장면

| fixture | 관찰할 문제 |
|---|---|
| 얇은 벽·닫힌 방 | 빛 샘, 부정확한 occlusion, UV2 seam |
| 실내에서 실외 이동 | 노출 고정 상태의 간접광 연속성·업데이트 비용 |
| 빠른 camera path·teleport | cascade 갱신 hitch, temporal history reset |
| 동적 문·조명·emission | 지원 범위와 잔상, 변경 반영 정책 |
| 반사면·안개·반투명 | GI 합성·roughness·fog 상호작용 |
| 모바일 lightmap | texture 압축·밴딩·bake density·메모리 |

reference는 같은 씬에서 높은 품질의 고정 bake 또는 승인된 offline reference를 사용한다. 노출·tone mapping·white balance를 고정하지 않은 이미지 비교는 성능/품질 판정에 쓰지 않는다.

## 7. 작업 분해

| 작업 ID | 작업 | 공수(PW) | 산출물 |
|---|---|---:|---|
| G05-1 | 현행 GI 지원·fixture·시각 품질 기준선 | 3-5 | 지원표, reference 세트, 선택 기준 |
| G05-2 | UV2·bake 설정 preflight·진단 UX | 4-6 | 검사기, 오류·개선 제안 |
| G05-3 | GPU bake worker·cache·결과 적용 | 4-6 | job schema, 취소·복구 경로 |
| G05-4 | HDDAGI 후보 포크·품질·성능 spike | 6-10 | 별도 브랜치, 비교 보고서, Go/No-Go |
| G05-5 | profile·migration·artifact 회귀 | 5-8 | 설정 변환기, fallback, 실기기 시험 |
| G05-6 | 제작 가이드·운영·업그레이드 검증 | 4-6 | workflow 문서와 release checklist |
| 합계 | 전체 개선과 연구 | 26-41 | candidate 채택은 별도 게이트 |

## 8. 도입 단계와 의존성

Lightmap preflight와 cache는 HDDAGI 연구와 독립 진행한다. 1차 제품은 기존 GI로 출시할 수 있어야 한다. G05-4에서는 compile 성공→fixture 정확성→GPU vendor 회귀→실제 콘텐츠 순으로 확대한다.

후보 GI가 통과해도 기존 프로젝트의 environment 설정을 즉시 덮어쓰지 않는다. preview 비교 후 프로젝트 단위 opt-in, 저장 형식 migration, 구버전 rollback을 제공한다. 실시간 GI가 필요한 장르만 추가 성능 비용을 부담한다.

## 9. 완료 기준

| 검증 | 조건 | 목표 |
|---|---|---|
| 베이크 재현성 | 동일 snapshot·settings·toolchain 5회 | 결과 메타·참조 일치, 화질 차이는 정의된 tolerance 이내 |
| incremental reuse | 조명 없는 unrelated 파일만 변경 | bake cache 재사용, stale 검출 false negative 0건 |
| 작업 복구 | 중단·취소·worker 종료 20회 | 잘못된 결과 자동 적용 0건, 이전 bake 유지 |
| 품질 | 6종 fixture, 고정 exposure | 승인 reference 대비 주요 light leak·seam 악화 0건 |
| candidate 성능 | 같은 해상도·GI 범위·샘플, 5분×5회 | camera 이동 GPU p95 20% 개선 목표, 다른 핵심 장면 5% 초과 악화 없음 |
| 메모리·안정성 | 30분 이동/teleport, 3 GPU 계열 | GPU 오류 0, profile별 peak VRAM budget 준수 |

'아티팩트 해소'는 모든 장면의 보장이 아니라 등록 fixture의 결과다. p50/p95/p99·bake 시간·peak 메모리·노이즈/누수 마스크와 사람이 검토한 차이 원인을 함께 남긴다. 정량 이미지 지표만으로 더 좋은 조명을 판정하지 않는다.

## 10. 리스크와 중단 기준

HDDAGI가 필요한 플랫폼·안개·반사 기능을 충족하지 못하거나 upstream 변화가 커지면 candidate를 중단하고 기존 SDFGI profile 조정과 Lightmap 경로를 유지한다. 6-10 PW timebox가 끝나면 근거 없는 일정 연장을 하지 않고 남은 기술 위험과 유지비를 명시한다.

베이크 성능이 GPU worker 비용을 과도하게 늘리면 낮은 품질 preview→최종 bake의 2단계 UX와 content-hash cache를 우선 적용한다. 이 계획은 새 아트 에셋 생성 프로젝트가 아니며 보유 테스트 자산과 허용된 fixture를 사용한다.

## 11. 제출물과 출처

제출물: lighting profile schema, preflight 도구, bake job 서비스, reference fixture, candidate 연구 브랜치·비교표, migration·rollback 안내, 플랫폼별 검증 기록. 이번 문서는 구현·측정 전 개발 계획이다.

확인일 2026-11-24: [LightmapGI](https://docs.godotengine.org/en/4.7/tutorials/3d/global_illumination/using_lightmap_gi.html), [SDFGI](https://docs.godotengine.org/en/4.7/tutorials/3d/global_illumination/using_sdfgi.html), [HDDAGI PR #86267](https://github.com/godotengine/godot/pull/86267). 원문은 PDF 3·7·8쪽이다.
