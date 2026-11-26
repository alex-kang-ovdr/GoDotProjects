# 04. Compositor·렌더 패스·셰이더 확장 개발 계획

## 1. 계획 정보

| 항목 | 내용 |
|---|---|
| 계획 ID / 기준일 | G04 / 2026-11-24 |
| 원문 대응 | PDF 3쪽 custom pass 한계, 7-8쪽 다중 opaque pass·buffer·shader template |
| 우선순위 | P2. 실제 효과 제작 요구가 있는 범위부터 |
| 구현 위치 | 기존 CompositorEffect addon + 검증기, 필요한 pass hook만 코어 확장 |
| 선행 과제 | [13 프로파일링](13_Profiling_Memory_GPU_Symbols.md), [16 빌드](16_Build_Export_CI_Size.md) |
| 담당 / 예상 공수 | 렌더링 엔지니어, shader·툴 엔지니어, QA / 26-42 PW |
| 상태 | 설계안. 신규 graph/API·확장 pass는 구현 전 |

1 PW는 숙련 담당자 1명의 5근무일이다. 완전한 Unity SRP 재구현을 일정 범위로 잡지 않는다.

## 2. 목표와 범위

커스텀 효과 제작자가 리소스 의존성·수명·실행 위치를 명시하고 안전하게 공유할 수 있는 확장 계층을 만든다. 첫 단계는 기존 Compositor callback에서 가능한 depth/normal 기반 후처리와 buffer 사용의 표준화다.

다중 불투명 패스, material subset rerender, 내장 shader template hook은 요구 사례와 비용을 입증한 뒤 개별 확장한다. GPU driven, GI, HWRT와 Deferred는 이 경계를 소비하지만 본 계획이 각각의 렌더링 알고리즘까지 구현하지 않는다.

## 3. 현재 기능과 가정

공식 4.7 문서는 Compositor가 Mobile/Forward+에서 제공되며 callback이 렌더 스레드에서 실행된다고 설명한다. 따라서 'custom pass가 전혀 없음'이 아니라 노출된 단계와 자원 계약을 확장하는 문제로 정의한다. [Compositor](https://docs.godotengine.org/en/4.7/tutorials/rendering/compositor.html)

RenderingDevice는 자체 draw/compute 작업을 위한 저수준 경계이며 headless·Compatibility에서는 사용할 수 없다. runtime에서 capability를 확인하고 지원하지 않는 기능은 빌드 profile에서 차단한다. [RenderingDevice](https://docs.godotengine.org/en/4.7/classes/class_renderingdevice.html)

이하 `PassDescriptor`, graph compiler, template contract는 자체 제안이다. 실제 엔진의 callback 이름·buffer 접근 가능 여부는 pin한 API와 소스로 확정하고 문서 검증만으로 실행 성공을 주장하지 않는다.

## 4. 설계 구조

| 계층 | 책임 |
|---|---|
| Effect package | shader·parameter schema·capability requirement·fallback 포함 |
| Pass descriptor | read/write 자원, stage, resolution, view scope, ordering 선언 |
| Graph validator | cycle·미선언 접근·format 충돌·동일 자원 read/write hazard 검사 |
| Resource allocator | frame-local/history/imported 자원, 수명·aliasing·resize 처리 |
| Execution bridge | 기존 callback에 pass 배치, barrier·fence·thread 경계 처리 |
| Capture/debugger | 순서·time·VRAM·자원 상태·비활성 사유 표시 |

처음에는 resource aliasing을 끄고 명확한 소유권으로 정확성을 확보한다. aliasing은 마지막 독자와 최초 writer를 정적으로 계산할 수 있는 임시 자원에만 허용한다. history texture는 카메라·해상도·view별 키와 reset 사유를 가진다.

## 5. 제안 데이터 계약

아래는 계획 의사 스키마이며 Godot 내장 포맷이 아니다.

```yaml
pass_id: outline_v1
schema_version: 1
stage: after_opaque
reads: [scene_depth, scene_normal]
writes: [outline_mask]
resolution_scale: 0.5
view_scope: per_view
requires: [compute, sampled_depth]
history_policy: reset_on_camera_cut
fallback: disabled
```

`after_opaque` 등 추상 stage는 adapter가 실제 지원 callback으로 매핑한다. 매핑할 수 없는 stage는 compile error로 처리하고 임의의 가까운 위치에서 실행하지 않는다. 자원은 readonly/readwrite/attachment 등의 접근 형식을 선언하며 parameter와 shader variant hash를 manifest에 포함한다.

## 6. 불투명 패스·셰이더 hook 설계

불투명 rerender는 render layer 또는 승인된 material group을 입력으로 받는다. depth ownership, lighting 사용 여부, motion vector 갱신 책임을 descriptor에 명시한다. scene 전체를 임의 횟수 재렌더하지 않도록 max passes·pixel budget을 제한한다.

shader template은 내장 코드를 문자열 치환하는 임시 방식 대신 버전이 있는 hook surface를 제안한다. supported hooks, shader feature mask, required vertex attributes를 선언하고 엔진 갱신 때 compilation contract를 검사한다. 런타임 shader 문자열 컴파일은 개발 모드에만 허용하고 release는 빌드 단계에서 검증한 shader asset을 사용한다.

## 7. 작업 분해

| 작업 ID | 작업 | 공수(PW) | 산출물 |
|---|---|---:|---|
| G04-1 | 현재 callback·buffer·thread API 조사 | 3-5 | 기능 차이표·요구 사례·ADR |
| G04-2 | descriptor·validator·debug UI | 4-6 | schema·의존성 검사·오류 메시지 |
| G04-3 | 자원 수명·history·resize·barrier | 6-10 | resource manager·capture fixture |
| G04-4 | 필요한 opaque pass·shader hook 확장 | 6-10 | 최소 core patch와 fallback |
| G04-5 | platform profile·shader build 연계 | 3-5 | variant manifest·지원표 |
| G04-6 | 정확성·성능 회귀·문서·마이그레이션 | 4-6 | release gate·효과 예제·사용 가이드 |
| 합계 | 선택 확장 포함 | 26-42 | 실제 신규 효과 알고리즘은 별도 |

## 8. 도입 순서

outline, color grading, half-resolution blur 세 가지 작은 효과로 descriptor를 검증한다. 이후 [01 GPU driven](01_GPU_Driven_Rendering.md), [05 GI](05_GI_Lightmap_HDDAGI.md) 중 하나가 요구하는 실제 pass 경계를 선택하여 코어 변경 필요성을 입증한다.

처음에는 pass 순서를 고정하고 등록 오류를 빌드 전에 막는다. topology 변경과 resource format 변경은 migration 버전을 올린다. 프로젝트별 허용 effect package를 lock하여 editor에서 보인 효과와 release 효과가 달라지지 않게 한다.

## 9. 완료 기준과 검증

| 검증 | 입력·조건 | 목표 |
|---|---|---|
| 그래프 검증 | cycle·미선언 write·format 불일치 등 30종 | 모든 잘못된 그래프를 실행 전에 거절 |
| 렌더 정확성 | depth·normal·alpha·MSAA·dynamic resolution fixture | 지정 기준 이미지 대비 오차 기준 통과, uninitialized pixel 0 |
| 수명 | viewport 1,000회 생성/삭제·resize | stale RID·validation 오류 0, 자원 수 누적 없음 |
| history | camera cut·teleport·render scale 변경 | 잘못된 history 사용 0, reset 사유 추적 가능 |
| 성능 | 효과 없음/3개 활성 비교, 5분×5회 | 비활성 관리 비용 CPU p95 0.2 ms 이하 목표 |
| 개발 UX | shader 오류·미지원 기능·잘못된 stage | pass ID·원인·복구 행동이 에디터에 표시 |

이미지 오차는 톤매핑 전후와 HDR/SDR을 분리하고 시간적 효과는 연속 프레임으로 평가한다. 검사 장치·OS·driver·engine commit·shader hash·해상도·warmup과 p50/p95/p99를 저장한다. 모바일에서는 GPU 시간 외에 중간 render target의 대역폭·peak 메모리를 평가한다.

## 10. 리스크와 축소 경로

코어 내부 shader/layout에 강하게 결합된 hook은 엔진 업그레이드 비용이 높다. hook contract를 유지하기 어려우면 그 기능을 프로젝트 전용 패치로 격리한다. 임의 buffer 접근은 UGC shader 안정성과 검증 범위를 넓히므로 승인된 자원 핸들만 노출한다.

추가 pass가 tile GPU에서 예산을 넘으면 단일 효과 결합·낮은 해상도·기능 off 경로를 사용한다. G04-1에서 기존 Compositor만으로 요구를 충족하면 G04-4를 생략하고 외부 graph framework 전체를 코어에 도입하지 않는다.

## 11. 제출물과 출처

제출물: pass schema·검증기·adapter, resource lifecycle 문서, 세 가지 효과 예제, 플랫폼별 capability 표, shader build manifest, GPU capture와 회귀 기록, API migration 안내. 이 문서 작성 단계에서 실행·GPU 검증은 수행하지 않았다.

확인일 2026-11-24: [Compositor](https://docs.godotengine.org/en/4.7/tutorials/rendering/compositor.html), [RenderingDevice](https://docs.godotengine.org/en/4.7/classes/class_renderingdevice.html). 공식 [priorities](https://godotengine.org/priorities/)의 렌더 확장은 방향 참고이며 납기나 현재 미구현 여부의 증거로 단독 사용하지 않는다. 원문은 PDF 3·7·8쪽이다.
