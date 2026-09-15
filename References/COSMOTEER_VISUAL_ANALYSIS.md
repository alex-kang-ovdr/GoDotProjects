# Cosmoteer 시각 레퍼런스 분석

> 수집일: 2026-09-15 · 용도: Captain Salvage의 독자적 파트 디자인·이펙트 설계 참고

## 보관 원칙

Cosmoteer는 상용 게임이다. 이 저장소에는 게임의 스프라이트, 텍스처, UI, 로고, 음원, 스크린샷을 내려받거나 포함하지 않는다. 아래는 공개 페이지의 링크와 **관찰에서 일반화한 디자인 원칙**뿐이다. 구현물은 별도 명칭·비율·팔레트·도트 패턴·실루엣을 사용한다.

## 조사 출처

- [Steam 공식 상점 페이지](https://store.steampowered.com/app/799600/Cosmoteer_Starship_Architect_Commander/) — 그리드 조립과 2D 우주선 전투라는 장르 맥락 확인.
- [공식 Wiki · Parts](https://cosmoteer.wiki.gg/wiki/Parts) — 무기, 방어, 추진, 구조를 독립 파트 범주로 제시하는 정보 구조 확인.
- [공식 Wiki · Shields](https://cosmoteer.wiki.gg/wiki/Shields) — 방어막을 함체 바깥의 호(arc)로 읽히게 하는 기능적 개념 확인.
- [공식 Wiki · Ship building checklist](https://cosmoteer.wiki.gg/wiki/Ship_building_Checklist) — 전면 장갑, 노출된 무기/엔진, 방어막 배치가 전술적 선택으로 읽히는 원칙 확인.

## 적용 가능한 시각 원칙

| 관찰 범주 | Captain Salvage의 독자 구현 규칙 |
| --- | --- |
| 파트 가독성 | 42px 격자의 외곽선·기능 아이콘·짧은 라벨을 함께 사용한다. 기능군은 추진=청록, 무기=자홍/주황, 방어=청색, 적재=황록으로 구분하되 Cosmoteer의 팔레트·아이콘을 모사하지 않는다. |
| 조립 실루엣 | 1·2·3·4칸 빔, 2×2 플레이트, 1·2칸 웨지를 조합한다. 연결 면에는 선을 그리지 않고 외곽만 그려 하나의 덩어리로 읽히게 한다. |
| 박스·도트 표면 | Godot `CanvasItem._draw()`에서 5px 크기의 결정적 하이라이트만 그린다. 외부 텍스처 파일이 없으므로 배포 용량과 저작권 위험을 늘리지 않는다. |
| 추진 이펙트 | 추력 방향의 청록→백색→청색 3단 짧은 플룸을 기본으로 하고, 실제 `RigidBody2D` 힘이 있을 때에만 표시한다. 관성 이동과 연출이 불일치하지 않게 한다. |
| 피격·파괴 | 파트별 HP 저하에는 얇은 균열선, 파괴에는 0.16초 함체 전용 흔들림과 짧은 스파크를 쓴다. 무기 파괴 흔들림은 구조 파트보다 크다. 카메라·HUD는 흔들지 않는다. |
| 방어막 | 현재 레이어 수(0~5)에 대응하는 고정 불투명도 호와 좌측 상단의 파란 사각 블록을 동시에 표시한다. 현재/최대 비율로 알파를 계산하지 않는다. |

## 구현 인수인계

- 시각값은 `Godot/scripts/visual_tuning.gd`, 게임 수치는 `Godot/scripts/balance.gd`에 분리한다.
- `Godot/scripts/ship_body.gd`가 외곽 전용 선, 도트 하이라이트, 방어막 호를 렌더링한다.
- 레퍼런스는 조형·가독성의 문제 해결을 위한 것이며, Captain Forever 또는 Cosmoteer의 특정 자산·디자인을 복제하는 지시가 아니다.
