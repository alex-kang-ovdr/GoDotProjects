# 10 · 기존 산출물 마이그레이션과 좌표·단위

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 현재 전환 출발점

기존 v17 안의 v16 README와 Tappy Chicken project.json은 **브라우저 JavaScript 게임·Canvas 에디터이며 실제 Lua VM이 없다는 점**을 명시한다. 따라서 완성된 네이티브 엔진을 동일 API로 갈아끼우는 일정으로 추정하지 않는다.

Tappy 예제 Scene은 viewport 480×640, position [135, 290] 같은 값을 가지며, 설정에는 gravity 1050·flap 345가 있다. 이런 값은 별도 단위 주석 없이 1 unit=1m로 재해석하면 안 된다. 초기 마이그레이션은 pixel-domain 동작을 보존하고 PPU가 명시된 후 물리 단위 변환을 적용한다.

입력 ZIP은 본 패키지에서 읽었지만 게임 실행·시각 비교·Lua 의미 일치를 검증하지 않았다.

## 1단계: 원본 동결과 이력

원본 ZIP 해시, 선택 프로젝트 Snapshot, 기존 schemaVersion을 보관한다. 파괴적 변환은 하지 않는다. ConversionJob은 새 Snapshot을 생성하고 이전 원본은 유지한다. 재실행은 같은 매핑·입력에 대해 중복 객체를 생성하지 않아야 한다.

## 2단계: 안정 식별자 배정

타입명으로만 Component를 구분하는 레거시를 영구 GUID로 이행한다. 최초 1회 old record→new GUID 매핑을 저장하고, 이후 Rename/Reparent에서 다시 계산하지 않는다. 고유 ID는 경로 hash에만 의존하지 않는다.

| 원본 | 새 기준 | Godot 출력 |
|---|---|---|
| actor.id | 안정 Actor GUID | Node metadata·Bridge map |
| component 타입명 | Component GUID + Type ID | Node/Resource 또는 PF record |
| Property 경로 | 명시적 Property ID | 허용된 Godot property/binding |
| Asset 경로 | Asset GUID + Version | ResourceUID/생성 경로 |
| Prefab 연결 | Prefab GUID + source object ID | 해석된 Scene·origin metadata |

Godot의 UID는 프로젝트 리소스 범위다. ObjectID/RID를 저장·복원할 원본 ID로 사용하지 않는다. [G27](../references/Verified_Sources.md#g27)

## 3단계: Override 보존

Class/Prefab/Variant/Instance의 명시적 override와 component add/remove tombstone을 유지한다. 값을 비교해서 override를 새로 추정하지 않는다. inherited field, explicit same-value override, component 순서, 중복 타입, nested prefab를 시험한다.

PackedScene `owner`가 빠져 저장에서 제외되는 노드를 검사한다. Node의 parent와 저장 ownership이 같은 개념이라고 가정하지 않는다. [G26](../references/Verified_Sources.md#g26)

## 4단계: 3D 좌표 변환

기존 PlayForge 표준은 +Y up, +Z forward, Unity식 handedness, 미터 단위다. Godot는 오른손 Y-up 공간을 사용한다. 카메라의 앞 방향과 임포트 모델의 semantic forward는 별도 메타데이터로 관리한다. [G48](../references/Verified_Sources.md#g48)[G14](../references/Verified_Sources.md#g14)

**제안 규약:** PF 좌표를 Godot 좌표로 보낼 때 `B = diag(1,1,-1)`의 basis 변환을 한 경계에서 적용한다. column-vector convention이라면 다음 형태를 사용한다.

```text
p_g = B · p_pf
R_g = B · R_pf · inverse(B)
T_g = B4 · T_pf · inverse(B4)
```

이는 본 프로젝트의 선택한 규약을 설명하는 수학적 계약이다. Quaternion 원소를 추측해 부호 변경하는 shortcut보다 행렬 변환과 canonical test를 우선한다. 실제 구현의 row/column·활성/수동 회전 convention과 일치하는지 검증한다.

반사를 포함하므로 mesh winding, tangent handedness, inverse bind, root motion, inertia·joint frame을 함께 검증한다. angular velocity·torque 같은 axial vector는 위치 벡터와 동일한 부호 공식으로 처리하지 않고 선택한 회전 convention에서 유도·시험한다.

Blender → glTF 단계에서 이미 정규화된 에셋에 Blender Z-up 변환을 다시 적용하지 않는다. 원본 파일의 의미와 Import adapter 책임을 기록한다.

## 5단계: 2D 좌표 분리

Canvas 픽셀·위쪽/아래쪽 Y, Box2D XY 미터, UI anchor를 한 행렬로 섞지 않는다. `pixelsPerMeter`, 원점, Y 방향, angle sign을 프로젝트 또는 컴포넌트에 명시한다. 3D 모델의 +Z 변환을 2D Sprite에 일괄 적용하지 않는다.

## 6단계: Lua 의미 보존

Game.lua가 참조 구현인지 실제 실행 API인지 분류한다. 없는 API를 임의 보완해 성공으로 표시하지 않는다. lifecycle, fixed dt, timer, input edge, RNG seed, collision ordering을 계약 시험으로 고정한다. 화면/입력은 TS이고 게임 규칙은 Lua라는 원칙을 유지한다.

## 7단계: 원본 에셋 재임포트

기존 cooked shape/animation/navmesh를 이식 가능한 범용 소스로 취급하지 않는다. 원본과 설정에서 타겟별로 재생성한다. Physics/Animation backend 변경은 동일한 기능 API만으로 완전한 수치 일치를 보장하지 않으므로 허용 오차·게임 규칙을 별도 검증한다.

## 업그레이드·복구

엔진 후보가 실패하면 이전 Release와 생성물을 유지한다. 새로운 Source Schema를 이전 엔진이 읽지 못하는 경우 이전 Source Snapshot도 함께 복구한다. 운영 플레이어 저장 데이터는 별도 migration/backward-read 절차가 필요하다. 포맷 버전만 낮춰 강제로 로드하지 않는다.

`examples/migration-map.example.json`은 계약 예시이지 실행된 변환 결과가 아니다.
