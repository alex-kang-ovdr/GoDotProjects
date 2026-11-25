# 16. 재현 가능한 빌드·헤드리스 익스포트·배포 용량

- 원본 계획서: `plans/16_Build_Export_CI_Size.md` (아직 저장소에 없음 — 원본 패키지 수령 후 이 파일 옆에 추가)
- 작업 브랜치: `Forge-refactoring-16-buildExport` (부모: `Forge-refactoring`)
- 우선순위: P0 / 본체 공수: 17-27 PW / 착수 단계: R0
- 커밋 영역 성격: Script

## 저장소에 이미 있는 관련 자산

- build-queue.cjs, export-godot-project.cjs, build-engine.ps1
- tools/build-version (PlayHub-Platform 소유)
- PlayHub-DevOps 데일리 빌드
- 빌드가 Forge 호스트에서 격리 없이 실행됨 (multiplayer-plan-review §3.2)

## 첫 작업 (spike)

- EngineLock/BuildManifest를 기존 build-version·release-manifest.cjs와 통합하는 설계 + 격리 build worker 요구 정리

## 승격 gate

- MVP 기준선: 고정 빌드 재현 + headless export

## 진행 상태

- [ ] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)
