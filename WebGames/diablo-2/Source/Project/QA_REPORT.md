# XXIV 검증 보고서

검증일: 2026-11-17. 출처는 이 패키지의 실행 로그이며 목표 수치가 아닙니다.

## 환경과 방법

Chromium 144.0.7559.96 · Linux · Playwright · Xvfb · SwiftShader 소프트웨어 WebGL을 사용했습니다. 단일 HTML 문자열을 `page.set_content`로 브라우저에 넣어 실행했습니다. 환경 정책상 `file://` 및 localhost 주소 탐색은 허용되지 않아 그 경로에서의 직접 열기는 검사하지 않았습니다. 게임은 외부 리소스를 요청하지 않습니다. 실제 페이지 실행 중 관찰한 네트워크 요청: 0개.

실제 GPU/Windows/Android/iOS 성능과 브라우저별 차이는 검증하지 않았습니다. 60Hz는 시뮬레이션 규격이지 모든 기기에서 60fps를 측정했다는 뜻이 아닙니다.

## 결과 요약

| 항목 | 실행 결과 |
|---|---|
| 자동 회귀 사례 | 30/30 통과 |
| 생성기 검사 | 10,000개 Seed, 오류 0 |
| 동일 Seed 결정성 | 통과 |
| 잠금 전 열쇠 도달 / 보스 차단 | 통과 |
| 관문 개방 후 보스 도달 | 통과 |
| Seed 검사 방 개수 | 6~12개 |
| 검사 중 안전 대체 맵 | 0개 |
| Chromium 페이지 예외 | 0건 |
| WebGL 3D 초기화·렌더 | 통과 |
| Canvas 2D 전환 | 통과 |
| 390px 모바일 CSS·버튼 노출 | 통과, 수평 넘침 없음 |
| 실제 키보드 이벤트 이동 | 26.0px 이동 |
| 실제 클릭 이벤트 이동 | 목표 오차 5.0px |

## 캠페인 검사의 의미

기사·사냥꾼·마법사 각각 5층을 검사했습니다. 캐릭터 반경을 적용한 경로 이동, 열쇠 획득, 관문 개방, 실제 보스 사망 처리와 보상, 층 변경, 승리 상태까지 확인했습니다.

단, 보스 처치에는 **진단용 큰 피해량**을 사용했습니다. 일반 적과의 장시간 전투는 이 캠페인 검사에서 수행하지 않았습니다. 따라서 이 결과는 진행 구조와 충돌 경로의 검사이며 일반 난이도의 수동 완주나 최종 밸런스 인증이 아닙니다.

추가로 3직업을 실제 전투 업데이트에 각각 1,200 스텝(시뮬레이션 시간 20초) 실행했습니다. 전투 구역 시작 위치는 테스트에서 지정했습니다. 정상 스킬 피해량을 사용했고, 세 직업 모두 몬스터 4마리 처치, 유효한 좌표·체력, 페이지 오류 없음으로 종료했습니다. 이 짧은 전투 검사도 전체 캠페인 밸런스 검사는 아닙니다.

## 저장 검사의 의미

JSON 직렬화/복원에서 지형, Seed, RNG, 적, 장비, 성장, 열쇠와 보스 상태를 확인했습니다. 다음 아이템 추첨 결과도 복원 전후 일치했습니다. 잘못된 맵을 가져오면 현재 세션을 유지하며 거부했습니다. 합성 v10 저장의 보완 경로를 확인했습니다.

`page.set_content`의 불투명 origin에서는 localStorage가 거부됩니다. **localStorage 실제 쓰기/읽기 성공은 이 환경에서 검증하지 않았습니다.** 거부를 예외로 중단하지 않고 JSON 백업 안내를 표시하는 동작은 검사했습니다. 게임의 JSON 내보내기는 Blob 다운로드를 사용하며, 실제 OS 다운로드 UI와 브라우저 파일별 저장 공간도 별도 확인 사항입니다.

## 개별 회귀 사례

- PASS — 3 classes / fresh valid state
- PASS — 10,000 compiled dungeon seeds
- PASS — gate collision includes actor radius
- PASS — navigation detours around wall with closed gate
- PASS — swept projectile stops at wall
- PASS — swept projectile stops at locked gate
- PASS — ranger and mage basic attacks cost no mana and hit
- PASS — melee cannot hit through wall
- PASS — melee telegraph deals no instant damage and can be dodged
- PASS — hit telegraph resolves exactly once
- PASS — retreat: one speed budget, no chase overlay
- PASS — initial squad count survives leader loss
- PASS — retreat/regroup expires and does not deadlock
- PASS — boss phases summon capped squads
- PASS — interaction cannot pass through walls
- PASS — key interaction unlocks once
- PASS — pause prevents movement, damage and interaction updates
- PASS — death -> revive preserves dungeon progress
- PASS — passive point and max HP persist
- PASS — save round trip canonical gameplay state
- PASS — invalid save is rejected transactionally
- PASS — synthetic legacy v10 save migrates without enemy respawn
- PASS — 3 classes x 5 floors: scripted progression (diagnostic damage)
- PASS — save restores next deterministic combat/loot RNG draw
- PASS — duplicate death cannot duplicate loot or XP
- PASS — equipment swap and runeword retain unique item ownership
- PASS — boss reward and save completed state round trip
- PASS — dash cannot tunnel through wall or consume mana twice
- PASS — 2D and 3D projection round trips
- PASS — localStorage denial is handled without exception

## 캡처

`tests/desktop.png` 및 `tests/mobile.png`는 자동 테스트 중 실제 브라우저 화면입니다. 별도 `preview.png`는 기능을 보기 쉽게 전투 위치와 페이즈를 설정한 **게임 엔진 내 검증 장면**입니다. 외부 게임 스크린샷이나 콘셉트 아트가 아닙니다.

## 아직 검사하지 않은 것

일반 난이도로 다섯 층 전체 수동 완주, 모든 실사용 구버전 저장, 실제 터치 기기, 오디오 출력 청취, GPU별 장시간 렌더링, 수백 시간 경제 밸런스, 온라인/멀티플레이는 검사하지 않았습니다.
