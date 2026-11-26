# 16. 재현 가능한 빌드·헤드리스 익스포트·배포 용량

- 원본 계획서: [`plans/16_Build_Export_CI_Size.md`](../plans/16_Build_Export_CI_Size.md) (ZIP 원문 SHA-256 대조 및 저장소 반입 완료)
- 통합 대상 브랜치: `Forge-BuildExport` — 신규 (R0 착수)
- 분류: 엔진 무변경 → Forge 계열
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

- [x] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)

## 원본 계획 대조

- 원본 WBS 참조: §6 6. 작업 분해와 공수 (원본 77행); §7 7. 단계와 의존성 (원본 89행); §8 8. 완료 기준과 실험 (원본 95행)
- 패키지 내 원문 SHA-256: `a1dc91ff30cb0fcd9a8c80cc9d068c2a61540a86ce0d091de40acd1530dc9691`
- SSOT 적용: Cloud Run Jobs 격리 빌드 경로는 이미 있다. 남은 범위는 기본값 로컬 실행, worker의 stock 4.7.2 사용, PIE 로컬 실행 gap이며, engine-ssot.json을 빌드 식별의 정본으로 쓴다(SSOT.md §2; REVIEW.md §3.3-3.4).
