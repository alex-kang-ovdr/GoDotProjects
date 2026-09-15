# Godot Ball Simulator

Unreal `BallSimulator` C++ 플러그인을 Godot 4용 GDExtension 플러그인으로 포팅하는 작업 저장소입니다.

현재 브랜치는 구현 준비 단계입니다. 수치 코어, Godot 물리 어댑터, 멀티플레이 동기화는 아직 이식하지 않았습니다.

## 기준

- Godot 작업 브랜치: `codex/godot-ball-simulator-plugin`
- Unreal 원본 기준 커밋: `9667ffa334bce4b828dcf45f26e894e6317ece7a`
- 원본 브랜치: `origin/codex/ball-simulator-example`
- 원본 라이선스/재사용 범위: 구현을 복사하기 전에 별도 확인 필요

## 문서

- [GDD — 아키텍처·기능·데이터 흐름·검증 기준](docs/GODOT_BALL_SIMULATOR_GDD.ko.md)
- [포팅 개발 계획](docs/GODOT_BALL_SIMULATOR_PORTING_PLAN.ko.md)
- [원본 소스·테스트 인벤토리](docs/UNREAL_SOURCE_PORTING_INVENTORY.ko.md)
- [마일스톤](docs/MILESTONES.ko.md)
- [테스트 실행 가이드](docs/TESTING.ko.md)

## 현재 상태와 다음 구현 단위

M1 독립 C++ 중력 코어와 headless/native test suite는 구현·검증되었다.

1. M2에서 Godot collision world를 변경하지 않는 1-way query 어댑터를 추가한다.
2. 원본 입력·스냅샷·바운스 이벤트 계약을 golden data로 고정한다.
3. M3에서 반발·마찰·스핀·구름과 swept-sphere 충돌 반응을 구현한다.
