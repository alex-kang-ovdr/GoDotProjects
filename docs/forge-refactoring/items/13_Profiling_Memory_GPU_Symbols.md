# 13. GDScript·GPU·메모리 진단 및 심볼

- 원본 계획서: [`plans/13_Profiling_Memory_GPU_Symbols.md`](../plans/13_Profiling_Memory_GPU_Symbols.md) (ZIP 원문 SHA-256 대조 및 저장소 반입 완료)
- 통합 대상 브랜치: `Forge-Profiling` — 신규 (R0 착수)
- 분류: 엔진 무변경 → Forge 계열
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

- [x] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)

## 원본 계획 대조

- 원본 WBS 참조: §7 7. 작업분해와 공수 (원본 72행); §8 8. 도입 단계와 의존성 (원본 84행); §9 9. 완료 기준과 재현 시험 (원본 90행)
- 패키지 내 원문 SHA-256: `16448877be08efb26478cab7e98f1177e120bb324411b5ef1e2a968786241e95`
- SSOT 적용: GDScript만 지원하고 C#은 미지원이다(SSOT.md §2, §5 D6). 원본 계획의 C# 프로파일링 항목은 적용하지 않고 GDScript·GPU·메모리 진단 범위로 제한한다.
