# 19. RenderingDevice 기반 WebGPU 백엔드

- 원본 계획서: [`plans/19_WebGPU_Backend.md`](../plans/19_WebGPU_Backend.md) (ZIP 원문 SHA-256 대조 및 저장소 반입 완료)
- 통합 대상 브랜치: `Forge-Refactoring-19-webgpu`
- 분류: 엔진 변경 → Godot-Refactoring 계열
- 우선순위: P2/R&D / 본체 공수: 44-74 PW / 착수 단계: R3
- 커밋 영역 성격: GD-Core

## 저장소에 이미 있는 관련 자산

- forge/OfficialGodot 웹 에디터, test-godot-web.cjs (Compatibility 경로)

## 첫 작업 (spike)

- 독립 R&D 브랜치에서 RD backend 골격 범위만 조사

## 승격 gate

- 19 단독 완료 gate

## 진행 상태

- [x] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)

## 원본 계획 대조

- 원본 WBS 참조: §6 6. 작업 분해 (원본 71행); §7 7. 단계별 gate (원본 83행); §8 8. 완료 기준과 재현 실험 (원본 89행)
- 패키지 내 원문 SHA-256: `83cd9ea21fce59d40bce833c3b273b44d881c6a7f7913633078972b35af7f014`
