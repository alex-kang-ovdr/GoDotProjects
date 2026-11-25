# 02. 지형 제작·실행·서버 데이터 통합 개발 계획

## 1. 계획 정보

| 항목 | 내용 |
|---|---|
| 계획 ID / 기준일 | G02 / 2026-11-24 |
| 원문 대응 | PDF 2쪽 지형 부족, 8-9쪽 Terrain3D 보완 스택 |
| 우선순위 | P1. 지형이 필요한 프로젝트에 선택 설치 |
| 구현 위치 | Terrain3D 버전 고정 + 제작기 addon + 변환·검증 도구 |
| 선행 과제 | [16 빌드](16_Build_Export_CI_Size.md), [23 패키지](23_Addon_Package_Global_CLI.md), [17 기기 QA](17_Mobile_Device_QA.md) |
| 담당 / 예상 공수 | 그래픽·툴 엔지니어, 테크니컬 아티스트, 모바일 QA / 16-26 PW |
| 상태 | 개발 전 설계. 성능·지원 장치는 향후 검증 대상 |

1 PW는 숙련 담당자 1명의 5근무일이다. 목표 지원은 Windows·Android·iOS 클라이언트와 Linux 서버이며 각 플랫폼의 통과 상태를 독립 기록한다.

## 2. 목표와 범위

Terrain3D를 검증된 옵션 패키지로 제공하고 제작·충돌·내비게이션·저장·배포의 계약을 통일한다. 엔진 코어에 지형 시스템을 새로 내장하는 범위는 포함하지 않는다. 첫 단계는 정적 heightfield 지형, 재질 레이어, 구역 저장, 미리 생성한 충돌과 내비게이션 데이터다.

실시간 지형 변형은 후속 기능이며, 클라이언트 brush 명령이 서버 충돌을 직접 변경하지 못하도록 한다. 동굴·복셀·구체 행성은 별도 지형 유형으로 다루고 heightfield 기능으로 약속하지 않는다.

## 3. 공식 확인과 교정

Terrain3D 공식 문서는 Windows/Linux와 여러 렌더러 지원을 설명한다. Compatibility는 Terrain3D 1.0/Godot 4.4부터 지원한다고 명시하므로 원문의 범용 호환성 우려를 일괄 미지원으로 해석하지 않는다. 다만 Android·iOS 항목의 일부 설명은 이전 버전 조합에 근거하며 웹은 실험 상태이므로 실제 채택 조합을 다시 시험한다. [플랫폼 문서](https://terrain3d.readthedocs.io/en/stable/docs/platforms.html)

공식 도구는 height/color/control 데이터의 가져오기·내보내기를 제공한다. 구역별 원본, 좌표 원점, 해상도와 높이 범위를 우리 manifest에 별도 기록한다. [데이터 문서](https://terrain3d.readthedocs.io/en/1.1/docs/import_export.html)

이하 명칭·예산·검증 기준은 자체 설계다. Terrain3D 버전과 `.gdextension` 바이너리·godot-cpp ABI·엔진 tag를 하나의 dependency lock으로 묶는다.

## 4. 아키텍처와 책임

| 구성 | 책임 |
|---|---|
| `TerrainAuthoringAdapter` | brush·레이어·hole·undo/redo를 기존 제작기 명령으로 감싸기 |
| `TerrainManifest` | 구역 GUID, 좌표, 해상도, 원본 hash, import 설정, 빌드 버전 |
| `TerrainBuildPipeline` | 높이·재질·충돌·nav 산출물 생성과 플랫폼 profile 변환 |
| `TerrainRuntimeAdapter` | 실제 Terrain3D 자원 생성, 품질 profile, 데이터 읽기 |
| `TerrainServerData` | 렌더 텍스처 없이 권한 충돌과 내비게이션 제공 |
| `TerrainDiagnostics` | 경계 seam, collision mismatch, 메모리, GPU 지원 진단 |

구역 하나는 저장·검증·동시편집 잠금 단위다. `height_raw`와 `control_raw`는 권위 원본이고, GPU 텍스처·충돌·nav는 재생성 가능한 파생물로 둔다. 프로젝트별 디렉터리와 namespace를 유지한다.

## 5. 제안 데이터와 명령 계약

아래는 자체 manifest 의사 스키마다. Terrain3D 내장 형식과 동일하다고 가정하지 않는다.

```yaml
schema_version: 1
project_id: project-guid
terrain_id: terrain-guid
origin_m: [0, 0, 0]
region_resolution: 1024
height_encoding: float32_meters
regions:
  - id: region-guid
    grid: [0, 0]
    source_hash: sha256
    collision_hash: sha256
    navigation_hash: sha256
    material_profile: mobile_low
```

편집 명령은 `{operation_id, region_id, base_revision, brush_parameters, delta_hash}`로 기록한다. 서버가 revision 충돌을 검사하고 undo는 정확한 이전 delta를 참조한다. 처음에는 구역 hard lock을 사용하고 동시 brush 병합은 [15 협업](15_Collaboration_VCS_Review.md)의 후속 작업으로 둔다.

런타임 게임에는 `get_height`, `ray_query`, `sample_surface` 어댑터만 노출한다. 이 명칭은 제안 API다. 메시 collision과 Terrain3D 높이 질의의 오차가 허용값을 넘으면 서버 collision 결과를 권위로 사용한다.

## 6. 품질·플랫폼 프로파일

| 프로파일 | 범위 | 제작·배포 규칙 |
|---|---|---|
| Desktop | 승인된 복합 레이어와 거리별 detail | GPU 메모리·shadow 비용을 별도 예산화 |
| Mobile | 레이어·표본 수·거리 축소 | Mali/Adreno/Apple 실기기 검증, 기기별 format 선택 |
| Compatibility/Web | 해당 빌드 지원 시험 후 제공 | 실패 시 구역별 정적 mesh bake와 경량 material |
| Server | collision/nav 전용 | RenderDevice·지형 shader·albedo 없이 실행 |

heightfield 자체를 낮출 때 hole·경사·통행 가능 영역의 의미가 바뀌지 않도록 collision 해상도와 시각 해상도를 독립 관리한다. Web fallback과 서버 경로를 지원한다는 최종 표기는 실제 export/load 시험 뒤에만 한다.

## 7. 작업 분해

| 작업 ID | 작업 | 공수(PW) | 산출물 |
|---|---|---:|---|
| G02-1 | 버전·라이선스·플랫폼·API 조사 | 2-3 | dependency lock, 적합성 표 |
| G02-2 | 제작 UI·명령·undo·구역 저장 | 3-5 | editor adapter와 편집 기록 |
| G02-3 | manifest·import/export·seam 검사 | 3-5 | 변환 CLI, round-trip 검사 |
| G02-4 | 모바일 profile·server collision/nav 분리 | 4-6 | 플랫폼별 runtime 패키지 |
| G02-5 | 실기기·멀티플레이 지형 정합성 시험 | 2-4 | QA 보고서, 알려진 제약 |
| G02-6 | 샘플·업그레이드·복귀 절차 | 2-3 | 설치·제작 가이드, 회귀 fixture |
| 합계 | 정적 지형 production 통합 | 16-26 | 실시간 파괴·복셀 제외 |

## 8. 단계와 의존성

첫 2-3 PW 조사 단계에서 최하위 모바일과 Linux headless에 동일 지형 데이터의 최소 load를 시험한다. G02-2/3은 병렬 진행할 수 있으나 manifest v1 확정이 선행한다. server collision과 nav 추출이 성립한 뒤 두 클라이언트 플레이를 시험한다.

GPU 그림이 나타나는 것만으로 지원 완료로 표시하지 않는다. 저장→재시작→export→서버 load→충돌→navigation→구버전 복귀가 이어져야 패키지 인증을 통과한다.

## 9. 완료 기준과 재현 실험

| 검증 | 입력·조건 | 목표 |
|---|---|---|
| 데이터 보존 | 16개 구역, 10회 import/export | height 최대 오차 1 mm 이내 목표, GUID·hole 보존 |
| 구역 경계 | 높이 경사·hole이 경계를 가로지르는 fixture | 시각 seam·충돌 구멍 0건 |
| 편집 복구 | brush 1,000회, undo/redo, 강제 종료 | 커밋된 revision 손실 0, 미완료 변경 명시 |
| 클라이언트/서버 | 동일 seed 10,000개 ray query | 권한 collision 기준 오차 허용값 1 cm 이하 목표 |
| 모바일 | 하위·중간 Mali/Adreno와 iPhone 각 profile, 20분 | 설정한 총 frame budget 준수, 열화와 peak 메모리 기록 |
| 배포 | Windows/Android/iOS/Linux server export | 승인 조합의 missing library·resource 오류 0건 |

기준 지형 크기·높이 범위·material 레이어 수·카메라 경로·해상도·GPU driver를 고정한다. p50/p95/p99 CPU/GPU 시간과 peak RAM/VRAM을 수집한다. 데이터 오차 목표는 저장 포맷의 정밀도와 충돌 샘플 간격에 따라 G02-1에서 최종 결정한다.

## 10. 위험과 대체 경로

플러그인 특정 버전이 엔진 ABI를 따라가지 못하면 production dependency를 유지하고 새 버전은 별도 브랜치에서 검증한다. 모바일 shader 비용이 예산을 초과하면 레이어 축소→구역 mesh bake 순서로 축소한다. 서버에서 렌더 의존을 제거할 수 없으면 collision/nav를 별도 빌드 산출물로 생성한다.

핵심 모바일 2개 계열에서 동일 지형 의미를 유지할 수 없거나 포크 유지비가 통합 공수의 30%를 초과하면 native 지형 기능 확대를 중단하고 bake 경로로 출시한다.

## 11. 제출물과 출처

제출물: 고정 버전 패키지, 어댑터·변환 CLI, terrain schema, 플랫폼별 export preset, 충돌·nav fixture, 실기기 검증 기록, 원본·파생물 마이그레이션/복귀 문서. 이번 작업에서는 계획서만 작성했다.

확인일 2026-11-24: [Terrain3D platforms](https://terrain3d.readthedocs.io/en/stable/docs/platforms.html), [Import/Export](https://terrain3d.readthedocs.io/en/1.1/docs/import_export.html), [Navigation](https://terrain3d.readthedocs.io/en/latest/docs/navigation.html). `latest` 자료는 설계 참고이며 배포 버전 보증에 사용하지 않는다. 원문은 PDF 2·8·9쪽이다.
