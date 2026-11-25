# 25. Unreal 방식 게임 프레임워크·서버 권한·RPC

- 원본 계획서: `plans/25_Unreal_Gameplay_Authority_RPC.md` (아직 저장소에 없음 — 원본 패키지 수령 후 이 파일 옆에 추가)
- 작업 브랜치: `Forge-refactoring-25-gameplayAuthority` (부모: `Forge-refactoring`)
- 우선순위: P0 / 본체 공수: 14-20 PW / 착수 단계: R0
- 커밋 영역 성격: GD-Ext

## 저장소에 이미 있는 관련 자산

- 기존 Node 권위 서버 3종(forge/Tools/*-multiplayer.cjs, PlayHub-Platform 소유) — 템플릿 전용 경로로 유지(multiplayer-plan-review ADR-12)
- PlayHub-EOS 서버 권위 MMO DataStore

## 첫 작업 (spike)

- 기술 스파이크: DS+2 clients, 작은 맵, 이동·스폰·체력·owner RPC (roadmap §9.1)

## 승격 gate

- GameMode/GameState/PlayerState/Controller/Pawn addon + 수명·소유권 시험

## 진행 상태

- [ ] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)
