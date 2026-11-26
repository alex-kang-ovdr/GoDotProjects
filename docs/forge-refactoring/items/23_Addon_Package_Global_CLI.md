# 23. 애드온 패키지·Global Addons·CLI·서명

- 원본 계획서: [`plans/23_Addon_Package_Global_CLI.md`](../plans/23_Addon_Package_Global_CLI.md) (ZIP 원문 SHA-256 대조 및 저장소 반입 완료)
- 통합 대상 브랜치: `Forge-AssetStore` — 기존 브랜치
- 분류: 엔진 무변경 → Forge 계열
- 우선순위: P0 / 본체 공수: 16-26 PW / 착수 단계: R1
- 커밋 영역 성격: GD-Ext

## 저장소에 이미 있는 관련 자산

- forge/Godot/addons/* (playforge_* 7종), asset-library.cjs
- Forge-AssetStore 팩 설치

## 첫 작업 (spike)

- playforge_* addon에 exact package lock 파일 형식 도입

## 승격 gate

- MVP: exact package lock

## 진행 상태

- [x] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)

## 원본 계획 대조

- 원본 WBS 참조: §7 7. 작업 분해 (원본 84행); §8 8. 단계와 의존성 (원본 96행); §9 9. 완료 기준 (원본 102행)
- 패키지 내 원문 SHA-256: `12212a17af834db0f9abd861b641365d65413a29b95ea51a6811ba7fc18f83a5`
