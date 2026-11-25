# 13. GDScript·C#·GPU·메모리 진단 및 심볼

- 원본 계획서: `plans/13_Profiling_Memory_GPU_Symbols.md` (아직 저장소에 없음 — 원본 패키지 수령 후 이 파일 옆에 추가)
- 작업 브랜치: `Forge-refactoring-13-profiling` (부모: `Forge-refactoring`)
- 우선순위: P0/P1 / 본체 공수: 24-40 PW / 착수 단계: R0
- 커밋 영역 성격: Tool

## 저장소에 이미 있는 관련 자산

- ISMProfile (Forge-ISM-profile 브랜치)
- autotest-showcase-daily-profile.cjs, Forge-UnrealPort GPU 60FPS 텔레메트리

## 첫 작업 (spike)

- TraceSample 스키마 동결 + 기존 ISMProfile/텔레메트리 출력을 그 스키마로 변환

## 승격 gate

- MVP 기준선: 최소 trace·build identity·symbols 묶음

## 진행 상태

- [ ] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)
