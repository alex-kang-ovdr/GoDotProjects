# 29. 온라인 서비스·로비·매치메이킹·릴레이

- 원본 계획서: [`plans/29_Online_Services_Sessions_Relay.md`](../plans/29_Online_Services_Sessions_Relay.md) (ZIP 원문 SHA-256 대조 및 저장소 반입 완료)
- 통합 대상 브랜치: `Forge-Multiplayer` — JoinTicket 계약만 — 계정·로그인은 Hub-SSO, 크로스플레이 릴레이는 Forge-Publish
- 분류: 엔진 무변경 → Forge 계열
- 우선순위: P0/P1 / 본체 공수: 18-28 PW / 착수 단계: R1
- 커밋 영역 성격: Hub

## 저장소에 이미 있는 관련 자산

- Hub-SSO 4종 로그인, PlayHub-EOS
- hub-session-auth.cjs, login-sessions.cjs

## 첫 작업 (spike)

- SessionLease/JoinTicket 계약 동결 + fake provider (28과 병행)

## 승격 gate

- MVP: 단일 provider ticket

## 진행 상태

- [x] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)

## 원본 계획 대조

- 원본 WBS 참조: §8 8. WBS와 예상 공수 (원본 109행); §10 10. 위험과 단계적 대안 (원본 133행)
- 패키지 내 원문 SHA-256: `aa5f7faf93c93d4fc537483d4f7e745f383c085efb1e1e45831c98c28303f9a3`
- SSOT 적용: 계정·로그인은 Hub-SSO, 매치메이킹은 PlayHub Gateway/EOS 계획, 서버 입장은 JoinTicket, 크로스플레이 relay는 Forge-Publish가 정본이다. Nakama 등은 비교/adapter 후보로만 둔다(SSOT.md §2; RESEARCH_INPUTS.md §3).
