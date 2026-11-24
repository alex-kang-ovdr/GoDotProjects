# 08. 검증 및 테스트 계획

## 1. 정적 데이터 무결성 검증 (`validate_data.mjs`)

실행 명령:
```powershell
node games/silent-tenant/ReverseDesign/verified_data/validate_data.mjs
```

자동 검증 항목 6종:
1. **고유 ID 및 확증 태그 검사**: 모든 캐릭터(11), 방(29), 핫스팟(45), 아이템(23), 퍼즐(16), 사건(8), 엔딩(5)의 중복 ID 0건 및 유효 확증 태그(`확인`/`해석`/`재구성안`/`검증 필요`) 검증.
2. **JSON ↔ CSV 패리티 검사**: `characters`, `rooms`, `items`의 JSON과 CSV 행 수 및 ID 집합 100% 일치 검증.
3. **참조 무결성(Dangling ID 0건)**: 방 출구, 잠금 퍼즐, 핫스팟 소속 방, 아이템 습득 방/퍼즐/타깃 핫스팟/조합 아이템, 퍼즐 요구/소모/지급 아이템 및 출구 해금, 사건 대상 캐릭터/방/연쇄 사건/즉시 엔딩, 엔딩 도달 방 전수 검사.
4. **방 그래프 양방향성 및 전체 연결성**: 시작 방(`rm_5f_music`)에서 모든 29개 방에 도달 가능하며 모든 출구에 복귀 간선이 존재함을 BFS로 증명.
5. **퍼즐+아이템 생산·소비 DAG 비순환성**: `requiresPuzzles`와 아이템 생산 퍼즐 간선(`itemProducerPuzzle -> consumerPuzzle`)을 합친 통합 방향 그래프에서 Kahn 위상 정렬로 순환(Cycle) 0건 증명.
6. **정방향 게임플레이 완주 시뮬레이션**: 초기 방(`rm_5f_music`)과 초기 인벤토리(`item_invitation_letter`)에서 출발해 도달 가능한 아이템 획득과 퍼즐 해결을 반복했을 때 **16개 퍼즐 전부 해결 및 최종 목적지 `rm_escape_exit` 도달**을 자동 증명.

## 2. 엔진 구현 후 런타임 테스트 매트릭스

향후 실제 게임 엔진 구현 시 통과해야 할 핵심 테스트 케이스다. `[재구성안]`

| 테스트 ID | 시나리오 | 기대 결과 |
|---|---|---|
| `TC-01` | 골든 패스 (전원 생존 + 미유키 호감도 3 이상) | 16퍼즐 완주, 8사건 전원 구출, `compromisedCount === 0`, `end_happy_miyuki` 도달 |
| `TC-02` | 골든 패스 (전원 생존 + 미유키 호감도 2 이하) | 16퍼즐 완주, 8사건 전원 구출, `compromisedCount === 0`, `end_happy_kotomi` 도달 |
| `TC-03` | 부분 피해 탈출 (쿠미 보호 실패 후 탈출) | `flg_inc_kumi_compromised` 및 `flg_evidence_tape_spawned` 활성, `inc_rika_isolation` 연쇄 적용, 탈출 시 `end_normal_survivor_escape` 도달 |
| `TC-04` | 아케미 배전반 패닉 미제지 | 4F 배전반 윈도우 만료 즉시 `end_bad_akemi_fire` 종료 |
| `TC-05` | 시계탑 도료 누락 또는 진파치 바 록 대치 실패 | 종반 실패 즉시 `end_bad_isaku_total_loss` 종료 |
| `TC-06` | 소프트락 가드 (기계유 미도포 상태로 녹슨 열쇠 사용) | 경고 메시지 출력 후 `item_rusted_key` 보존, 이후 기계유 도포→해정 정상 성공 |
| `TC-07` | 백트래킹 무결성 (5F 갈색 책 미회수 상태로 2F 도달) | `2F->3F->4F->5F` 상행 복귀 후 책 회수→2F 난로 연소 성공 |
| `TC-08` | 세이브/로드 결정론성 | Phase 3 직전 스냅샷 저장→배드엔딩 진입→로드→동일 상태 복원 후 해피엔딩 도달 |
| `TC-09` | 리포지토리 소유권 및 스킬 동기화 게이트 | `npm run check:ownership` `fail 0`, `npm run check:skills` 동기화 OK |
