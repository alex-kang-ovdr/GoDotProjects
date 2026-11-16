# 전투 판정·캔슬 검증 명세

## 좌표 및 히트박스
- 논리 위치 `(x, laneY, elevationZ)`를 사용한다. 캐릭터 발 위치가 깊이 정렬 기준이며 점프는 elevationZ만 변화. [제안]
- 공격 유효성: X 범위 + 레인 허용 오차 + 높이 범위 + 피격 가능 상태의 교집합. [제안]
- 공격별 Startup / Active / Recovery를 별도로 기록하고 공격 중 피격·가드·캔슬 이벤트를 추적한다. [제안]

## 재현 테스트 목록
| ID | 조건 | 관측 항목 | 합격 기준 |
|---|---|---|---|
| C01 | 파이터 A 연타 | 4타 체인 | 공략 기술 순서와 동일 |
| C02 | 매직유저 A 연타 | 기본 콤보 부재 | 단일 공격 후 재시작 |
| C03 | 방패 보유 가드 | 전방 타격 방어 | 방향 및 자세 조건 일치 |
| C04 | 시프 가드 입력 | 가드 불가 | 방패 상태 진입하지 않음 |
| C05 | B,B 회피 | 클래스별 이동 | 무적 유무를 영상 검증 |
| C06 | A+B 적중 | HP 변화 | 클래스별 차이 재현 |
| C07 | 적 다운 중 ↓+A | 다운 타격 | 원작과 동일한 피격 반응 |
| C08 | 대시 중 방향 위·아래 | 레인 이동 | 달리기 유지 여부 확인 |

## 프레임 실측 프로토콜
1. 동일한 버전·난이도·캐릭터·스테이지를 고정한다.
2. 60fps 이상 캡처하고 버튼 입력 오버레이를 동기화한다.
3. 입력 프레임 0, 공격 첫 유효 프레임, 마지막 유효 프레임, 중립 복귀 프레임을 기록한다.
4. 동일 동작 10회 측정 후 중앙값과 범위를 함께 저장한다.
5. 캔슬은 공격 단계별로 후보 입력을 1프레임씩 이동하며 검사한다.

```csv
class,move,trial,input_frame,first_active,last_active,neutral_frame,hitstop_frames,source_video
fighter,slash1,1,,,,,,
```

**주의:** 공략의 콤보 연결 설명은 정확한 캔슬 프레임의 증거가 아니다.

## 근거 및 신뢰도
- [Capcom 공식 소개](https://news.capcomusa.com/lets/browse/dungeons-and-dragons-combat-for-combat-connoisseurs)
- [Steam 상세 플레이 가이드](https://steamcommunity.com/sharedfiles/filedetails/?id=154984901)
- [GameFAQs Kaze_Yagami 공략](https://gamefaqs.gamespot.com/arcade/563201-dungeons-and-dragons-shadow-over-mystara/faqs/11489)
- [한국어 게임 조작 정리](https://theroomofspiritandtime.tistory.com/1020)

**표기:** `[확인]`은 문헌에 명시된 동작, `[추정]`은 공략에 기초한 해석, `[제안]`은 구현을 위한 임의 설정이다. 입력 프레임·대미지·무적 프레임은 실측하지 않았으므로 확정하지 않는다.
