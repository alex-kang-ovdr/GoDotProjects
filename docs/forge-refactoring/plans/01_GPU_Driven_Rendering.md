# 01. GPU 주도 렌더링과 컬링 개발 계획

## 1. 계획 정보

| 항목 | 내용 |
|---|---|
| 계획 ID / 기준일 | G01 / 2026-11-24 |
| 원문 대응 | PDF 2쪽 GPU Resident Drawer·GPU 컬링 격차, 7쪽 렌더링 개선 |
| 우선순위 | P2. CPU 렌더 제출 병목이 실측된 프로젝트부터 적용 |
| 구현 위치 | 제작기 addon + C++ GDExtension 실험, 필요한 제출 경계만 렌더러 패치 |
| 선행 과제 | [13 진단](13_Profiling_Memory_GPU_Symbols.md), [16 빌드](16_Build_Export_CI_Size.md) |
| 담당 / 예상 공수 | 렌더링 엔지니어 2명, QA·테크니컬 아티스트 부분 참여 / 36-56 PW |
| 상태 | 개발 전 설계안. 아래 성능과 완료 기준은 목표이며 실측 결과가 아님 |

1 PW는 숙련 담당자 1명의 5근무일이다. 외부 검토와 장비 조달 대기는 공수에 포함하지 않는다.

## 2. 목표와 범위

오브젝트 수 증가에 따라 CPU의 가시성 판단·정렬·드로 제출 비용이 커지는 장면에 선택적으로 GPU 가시성 경로를 제공한다. 전체 Godot 렌더러를 교체하지 않고, 반복되는 불투명 정적/강체 메시부터 지원한다.

첫 출시 범위는 인스턴스 데이터 상주, 변경분 업로드, frustum 컬링, LOD 선택, 간접 제출 연동과 디버그 표시다. Hi-Z 오클루전, 동적 오브젝트, 그림자 뷰는 이후 게이트로 분리한다. 스킨드 메시, 투명 정렬, 사용자 셰이더 전체 호환은 최초 범위에서 제외하고 기존 경로로 전달한다.

## 3. 확인 사실과 설계 가정

Godot 4.7 문서는 기존 오클루전이 CPU의 저해상도 버퍼와 Embree를 사용한다고 설명한다. 컬링 이득은 장면 구조에 따라 달라지므로 원문의 보편적 성능 우열은 채택하지 않는다. [공식 컬링 문서](https://docs.godotengine.org/en/4.7/tutorials/3d/occlusion_culling.html)

MultiMesh는 대량 인스턴스의 기존 최적화 수단이다. 문서에는 개별 인스턴스 컬링 제약과 공간별 분할 대안이 있으나 해당 페이지 자체에 업데이트 필요 표시가 있으므로, pin한 빌드에서 동작을 다시 확인한다. [MultiMesh 문서](https://docs.godotengine.org/en/4.7/tutorials/performance/using_multimesh.html)

이하 모듈명과 API는 자체 제안이다. CPU 경로·공간 분할 MultiMesh를 먼저 측정하여 충분한 경우 코어 패치를 시작하지 않는다. 렌더 가시성과 네트워크 복제 관련성은 서로 다른 정책으로 유지한다.

## 4. 모듈 구조

| 모듈 | 책임과 데이터 경계 |
|---|---|
| `InstanceRegistry` | index+generation handle, transform/AABB/material/mesh ID, 생성·삭제 수명 |
| `DirtyUploadQueue` | 변경 범위 병합, 정적 데이터와 프레임 데이터 분리, staging 예산 |
| `VisibilityPipeline` | 뷰별 frustum → LOD → 선택적 Hi-Z, 결과 인덱스 압축 |
| `DrawBatchBuilder` | material/mesh/pipeline별 묶음, 간접 명령 생성·범위 검증 |
| `RenderSubmissionBridge` | 기존 renderer의 depth/opaque/shadow 경계와 동기화 |
| `RenderDiagnostics` | 컬링 이유, visible 수, upload bytes, draw 수, pass별 GPU 시간 |

게임 스레드는 변경 명령만 기록한다. 렌더 스레드는 프레임 경계에서 immutable snapshot을 획득한다. GPU가 참조 중인 슬롯은 fence 완료 뒤 재사용하고 이전 generation의 명령은 버린다.

Hi-Z는 이전 프레임 깊이를 사용할 때 카메라 급회전·텔레포트·disocclusion에서 보수적으로 가시 판정한다. 현재 프레임 depth prepass를 사용하는 경로는 추가 패스 비용까지 비교한다. readback을 매 프레임 동기 대기하는 설계는 허용하지 않는다.

## 5. 제안 API와 데이터 계약

다음은 구현 예정 인터페이스를 설명하는 의사코드이며 Godot 내장 API가 아니다.

```text
InstanceHandle = {index:u32, generation:u32}
InstanceData = {transform, local_aabb, mesh_id, material_id, flags}
GpuScene.register_instance(data) -> InstanceHandle
GpuScene.update_instance(handle, dirty_mask, changed_data)
GpuScene.remove_instance(handle, retire_after_frame)
GpuScene.set_view_policy(view_id, culling_profile)
GpuScene.capture_culling_report(frame_id) -> DiagnosticTicket
```

mesh/material 핸들은 [03 스트리밍](03_Asset_Streaming.md)의 residency lease를 유지한다. eviction 전 참조 제거와 fence 완료를 함께 확인한다. 빌드 시 shader variant 키에는 renderer, backend, vertex layout, material feature mask, capability profile을 포함한다.

## 6. 플랫폼 지원 정책

| 프로파일 | 최초 정책 | 승격 조건 |
|---|---|---|
| Windows Vulkan | 첫 실험 기준 | 서로 다른 GPU 벤더 2종 이상에서 정확성·성능 통과 |
| Windows D3D12 | 어댑터 검증 후 opt-in | 제출 API, barrier, timestamp 동작과 회귀 확인 |
| Android/iOS | 기존 Mobile 경로 유지 | 메모리·대역폭·발열을 포함한 순이득 증명 |
| Web/Compatibility | 공간 분할 기존 경로 | 해당 backend의 기능과 빌드 지원을 별도 확인 |
| Dedicated Server | 기능 포함하지 않음 | 렌더 데이터 없는 서버 로드 검사 |

## 7. 작업 분해와 산출물

| 작업 ID | 작업 | 공수(PW) | 산출물 |
|---|---|---:|---|
| G01-1 | 기존 CPU·MultiMesh 기준선 및 capability 조사 | 4-6 | 병목 보고서, 지원표, Go/No-Go |
| G01-2 | registry·dirty range·수명 관리 | 6-10 | 인스턴스 저장소, 스트레스 fixture |
| G01-3 | frustum·LOD·compaction 경로 | 8-12 | compute pass, 가시성 비교기 |
| G01-4 | 렌더 제출·Hi-Z·shadow 선택 확장 | 8-12 | opt-in renderer patch, fallback |
| G01-5 | 기기별 튜닝·회귀·오류 주입 | 6-10 | 성능 CSV, RenderDoc 캡처, 수정 기록 |
| G01-6 | 도구 UX·설명서·패치 유지보수 정리 | 4-6 | 시각화 도구, 배포/복귀 안내 |
| 합계 | 전체 확장 범위 | 36-56 | 초기 게이트 실패 시 후속 작업 중단 |

## 8. 단계별 도입

G01-1 종료 시 CPU 렌더 준비가 실제 프레임 병목인지 판단한다. 이어 G01-2/3에서 draw 경로를 바꾸기 전에 CPU oracle과 가시성 결과를 비교한다. G01-4는 G01-3 정확성 통과 뒤 시작한다.

첫 production 적용은 승인된 불투명 정적 배치 하나에 한정한다. shadow·Hi-Z·동적 메시를 각각 feature flag로 켜고 저장 형식을 기존 경로에서도 읽을 수 있게 유지한다. 코어 변경은 별도 patch queue로 관리하여 엔진 업그레이드 때 독립 재검증한다.

## 9. 완료 기준과 검증 절차

| 검증 | 재현 조건 | 목표 판정 |
|---|---|---|
| 정확성 | 10k/50k 인스턴스, 3개 카메라 경로, 10개 seed | CPU 기준 대비 의도하지 않은 오브젝트 소실 0건 |
| 동적 수명 | 매초 1k 생성·삭제, 30분 | stale handle, use-after-free, GPU validation 오류 0건 |
| 성능 | 동일 해상도·장면·품질, warmup 60초 후 5분×5회 | 대상 CPU-bound 장면의 CPU 렌더 준비 p95 25% 감소 목표 |
| 비용 상한 | 동일 조건에서 GPU·VRAM·upload 측정 | GPU p95 악화 5% 이내, 추가 VRAM 예산 128 MiB 이내 목표 |
| 시야 급변 | 순간이동·180도 회전·창 크기 변경 | 보수적 fallback 실행, 1프레임 이상 잘못된 소실 없음 |
| 회귀 | 기능 off 및 unsupported material | 기존 경로 이미지·기능 유지, p95 악화 3% 이내 목표 |

모든 값은 기준 GPU와 콘텐츠를 G01-1에서 등록한 후 확정한다. CPU와 GPU 시간은 구분하여 기록하고 FPS나 draw 감소만으로 성공 처리하지 않는다. 4K·다중 뷰·MSAA 조합은 추가 프로파일로 검증한다.

## 10. 리스크, 중단 기준, 대안

가시성 readback 때문에 CPU stall이 생기거나 GPU 병목 장면의 성능이 나빠지면 해당 프로파일을 기본 활성화하지 않는다. 투명·스키닝·복잡한 material 기능은 기존 경로 유지 비용을 명시한다. 2회 튜닝 후 대상 장면의 순이득이 10% 미만이면 코어 확대를 중단하고 MultiMesh·씬 분할·LOD 튜닝을 사용한다.

## 11. 제출물과 출처

제출물: renderer adapter 소스, capability manifest, 고정 seed 장면, 측정 스크립트·CSV, 이미지 차이 보고서, 패치 적용/복귀 문서, 알려진 미지원 목록. 이번 문서는 이 제출물을 개발할 계획이며 해당 소스·측정 결과를 생성한 것이 아니다.

확인일 2026-11-24: [Godot occlusion culling](https://docs.godotengine.org/en/4.7/tutorials/3d/occlusion_culling.html), [MultiMesh optimization](https://docs.godotengine.org/en/4.7/tutorials/performance/using_multimesh.html), [RenderingDevice](https://docs.godotengine.org/en/4.7/classes/class_renderingdevice.html). 원문 요구사항은 첨부 PDF 2·7쪽이다.
