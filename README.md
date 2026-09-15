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

## 다음 구현 단위

1. Godot 4 프로젝트와 GDExtension 빌드 골격을 추가한다.
2. 충돌 없는 순수 C++ 궤적 코어와 단위·좌표 변환 테스트를 구현한다.
3. 원본 입력·스냅샷·바운스 이벤트 계약을 골든 데이터로 고정한다.
