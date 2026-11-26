# 08. 애니메이션 임포트·리타게팅·본 제어 개발 계획

## 1. 계획 정보

| 항목 | 내용 |
|---|---|
| 계획 ID / 기준일 | G08 / 2026-11-24 |
| 원문 대응 | PDF 3쪽 character import·retarget·constraint·spring bone·subresource |
| 우선순위 | P1 제작 자동화·검증, P2 고급 제약·실시간 리타게팅 통합 |
| 구현 위치 | 기존 Godot import·SkeletonModifier 기반 editor addon, 필요 시 제한 import 확장 |
| 선행 과제 | [16 빌드](16_Build_Export_CI_Size.md), [23 패키지](23_Addon_Package_Global_CLI.md), [27 이동](27_Movement_Prediction_Network_Physics.md)와 root motion 계약 |
| 담당 / 예상 공수 | 애니메이션 엔지니어, 테크니컬 아티스트, 툴 QA / 20-32 PW |
| 상태 | 설계안. 실제 모델 import·animation 검증은 미실행 |

1 PW는 숙련 담당자 1명의 5근무일이다. 새 캐릭터 제작·새 모션 제작은 이 통합 공수에 포함하지 않는다.

## 2. 목표와 범위

보유 FBX/glTF 캐릭터와 애니메이션을 반복적으로 가져와 본 매핑·rest pose·scale·root motion을 안정적으로 재현한다. 모델마다 수작업을 반복하는 부분을 profile과 검사기로 줄이고 재임포트가 사용자 수정·게임 참조를 깨뜨리지 않게 한다.

첫 범위는 humanoid profile, 애니메이션 library 분리, import-time retarget, 오류 진단, 기존 modifier 조합이다. 실시간 retarget·VRM constraint·spring bone 데이터 매핑은 프로젝트 필요에 따라 추가한다. 다양한 생물체의 의미를 자동 추론하는 범용 리타게팅은 보장하지 않는다.

## 3. 원문 교정과 확인 사실

Godot 4.7에는 `BoneMap`, `SkeletonProfileHumanoid`, import retarget 옵션이 있다. bone 이름만 같다고 애니메이션을 안전하게 공유할 수 없으므로 rest pose·계층·scale까지 검증한다. [Retargeting 3D Skeletons](https://docs.godotengine.org/en/4.7/tutorials/assets_pipeline/retargeting_3d_skeletons.html)

4.7 공식 문서에서 `RetargetModifier3D`, `BoneConstraint3D`, `SpringBoneSimulator3D`도 확인된다. 따라서 원문의 관련 기능 '미구현' 표현은 그대로 채택하지 않고 제작 UX·매핑·검증 부족으로 범위를 조정한다. [RetargetModifier3D](https://docs.godotengine.org/en/4.7/classes/class_retargetmodifier3d.html), [BoneConstraint3D](https://docs.godotengine.org/en/4.7/classes/class_boneconstraint3d.html), [SpringBoneSimulator3D](https://docs.godotengine.org/en/4.7/classes/class_springbonesimulator3d.html)

SpringBoneSimulator3D의 존재가 VRM1 모든 데이터와 물리 의상 전체를 자동 지원한다는 뜻은 아니다. 실제 exporter/importer 버전과 modifier 순서를 고정해서 검증한다.

## 4. 아키텍처와 자산 흐름

| 모듈 | 책임 |
|---|---|
| `RigInspector` | hierarchy·rest·scale·missing/duplicate bone·축 검사 |
| `RetargetProfile` | source rig signature, target profile, bone map, rest policy |
| `AnimationImportRecipe` | clip 분리·loop·event·track 제거·root motion 규칙 |
| `ModifierStackBuilder` | retarget→constraint/IK→secondary motion의 승인 순서 |
| `SubresourceCatalog` | animation/material/texture 내부 식별자와 안정 참조 매핑 |
| `AnimationValidator` | pose·foot sliding·root motion·reimport 차이 자동/시각 검사 |

원본 모델은 읽기 전용 입력으로 취급하고 사용자 수정은 별도 import recipe·외부 resource·상속 씬에 저장한다. importer가 자동 생성한 경로의 임의 편집을 프로젝트 표준으로 삼지 않는다. 모델 수정으로 내부 ID가 바뀌면 migration report를 생성한다.

## 5. 제안 데이터 계약

아래는 프로젝트용 의사 스키마이며 Godot 고유 import format이 아니다.

```yaml
retarget_profile:
  schema_version: 1
  source_rig_signature: hash-of-hierarchy-and-rest
  target_profile: humanoid_v1
  bone_map: external-resource-id
  rest_policy: preserve_source_with_runtime_map
  root_motion: {bone: Root, translation: xz, rotation: yaw}
  scale_policy: meters_uniform
  modifier_order: [retarget, locomotion_ik, secondary_motion]
```

import-time rest 변환과 runtime retarget을 동시에 무조건 적용하지 않는다. profile은 둘 중 어떤 경로를 사용하는지 명시한다. 비균일 scale·negative scale·분기 spring chain은 경고 또는 거절 정책을 정의하고 자동 수정 전 차이를 미리 보여준다.

## 6. 게임·네트워크·서버 경계

게임 로직은 clip 이름의 문자열 경로보다 stable animation ID·event ID를 참조한다. 공격 판정·발소리·VFX event를 구분하고 재시뮬레이션 시 같은 event가 중복 적용되지 않도록 `{simulation_tick, event_id, occurrence}`를 사용한다.

[27 이동 예측](27_Movement_Prediction_Network_Physics.md)은 root motion의 권위 입력·서버 재현·보정 정책을 정의한다. 본 계획은 clip의 root displacement 추출과 버전 hash를 제공한다. 클라이언트 시각용 IK·spring bone의 모든 본 transform을 네트워크로 보내지 않는다.

서버가 hitbox나 root motion을 위해 animation 평가를 필요로 하는 경우 최소 skeleton/clip data를 server artifact에 포함한다. 렌더 mesh·material 제거와 gameplay animation 제거를 같은 stripping 규칙으로 처리하지 않는다.

## 7. 작업 분해

| 작업 ID | 작업 | 공수(PW) | 산출물 |
|---|---|---:|---|
| G08-1 | 보유 rig corpus·기능 조사·규칙 정의 | 2-4 | fixture 목록·지원 rig profile |
| G08-2 | rig inspector·profile·매핑 UI | 4-6 | 오류 진단·저장 schema |
| G08-3 | import recipe·library·subresource 안정 참조 | 4-6 | 재임포트 도구·migration report |
| G08-4 | 기존 retarget/constraint/spring modifier 통합 | 4-6 | 순서 검증·프로파일 예제 |
| G08-5 | root motion·event·server data 계약 | 3-5 | 추출 도구·network 연동 fixture |
| G08-6 | 반복 검증·시각 QA·문서 | 3-5 | corpus 결과·사용 가이드 |
| 합계 | 제작 통합 전체 | 20-32 | 새 모델·애니메이션 제작 제외 |

## 8. 도입 순서

첫 단계는 동일 rig 재임포트와 서로 다른 3종 humanoid 간 import retarget을 검증한다. 누락 본·A/T pose·scale 차이 오류를 모두 보고하게 한 뒤 automation을 활성화한다. 사용자 승인 없이 원본 rest pose를 덮어쓰지 않는다.

runtime retarget과 spring/constraint는 별도 profile에 넣고 기존 기능을 먼저 사용한다. 필요한 export data가 없으면 exporter adapter나 제한 import 확장으로 해결한다. [15 협업](15_Collaboration_VCS_Review.md)에서는 rig 원본·recipe·생성물의 변경 권한과 리뷰를 분리한다.

## 9. 완료 기준과 검증

| 검증 | fixture·조건 | 목표 |
|---|---|---|
| 반복 임포트 | 보유 10개 rig, 10회 reimport | 사용자 recipe·stable 참조 손실 0건 |
| 오류 탐지 | 누락·중복·계층 변경·비균일 scale 20종 | 중요 오류 silent pass 0건 |
| 리타게팅 | 3개 체형, walk/run/turn/jump 각 clip | 승인된 pose 기준과 실루엣·관절 방향 일치 |
| 발 미끄러짐 | 고정 ground contact 구간 | foot displacement p95 2 cm 이내 목표, rig 규모에 따라 환산 |
| root motion | fixed tick, 1,000회 loop | 추출·게임 이동 적용 간 누적 오차 1 cm 이내 목표 |
| event | replay·interrupt·blend·loop 1,000회 | gameplay event 중복 적용·누락 0건 |
| 성능 | 50 visible characters, 고정 bone 수 | animation CPU p95 profile budget 준수, 기준선 10% 초과 악화 없음 |

품질 평가는 frame sample과 pose 수치·영상/스크린샷을 함께 사용한다. animation만 보기 좋은 결과와 실제 이동·충돌 결과를 구분한다. 장치·engine commit·importer/exporter·clip hash·tick rate·bone 수·modifier 순서를 기록한다.

## 10. 위험과 대체 경로

본 이름 추론에 의존하면 잘못된 자동 매핑이 조용히 통과할 수 있다. confidence를 표시하고 계층·rest 일치 검사를 필수로 둔다. runtime retarget이 CPU budget을 초과하면 import-time bake를 사용한다. 복잡한 constraint는 제작 도구에서 bake하여 지원 범위를 명확히 한다.

기존 프로젝트의 animation ID·event 참조가 안정적으로 migration되지 않으면 자동 업데이트를 중단하고 이전 import artifact를 유지한다. 장르별 combat montage·state machine 시스템 전체는 본 계획의 범위를 넘으며 별도 게임 설계로 관리한다.

## 11. 제출물과 출처

제출물: rig 검사기·mapping UI, import recipe·profile schema, reference corpus와 기대 결과, modifier 순서 예제, root motion/event/server data 명세, reimport migration/rollback 안내. 구현·play test 결과는 후속 개발 단계에서 작성한다.

확인일 2026-11-24: [Retargeting](https://docs.godotengine.org/en/4.7/tutorials/assets_pipeline/retargeting_3d_skeletons.html), [RetargetModifier3D](https://docs.godotengine.org/en/4.7/classes/class_retargetmodifier3d.html), [BoneConstraint3D](https://docs.godotengine.org/en/4.7/classes/class_boneconstraint3d.html), [SpringBoneSimulator3D](https://docs.godotengine.org/en/4.7/classes/class_springbonesimulator3d.html). 원문은 PDF 3쪽이다.
