# 28. 데디케이티드 서버·PIE·운영

- 원본 계획서: `plans/28_Dedicated_Server_Runtime_Operations.md` (아직 저장소에 없음 — 원본 패키지 수령 후 이 파일 옆에 추가)
- 작업 브랜치: `Forge-refactoring-28-dedicatedServer` (부모: `Forge-refactoring`)
- 우선순위: P0/P1/P2 / 본체 공수: 20-32 PW / 착수 단계: R0
- 커밋 영역 성격: Script

## 저장소에 이미 있는 관련 자산

- package-windows-server.ps1, deploy/cloudrun (PlayHub-Platform 소유)
- PlayHub-GameDeploy
- native-runtime.cjs PIE (격리 없음)

## 첫 작업 (spike)

- Linux headless export 서버 preset + 로컬 DS+2 clients 실행 스크립트

## 승격 gate

- MVP: 로컬/단일 VM, lease·drain

## 진행 상태

- [ ] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)
