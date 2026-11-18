# 탱크별 발사각·파워 복원 기록

데이터 버전 **1.0.0** · 작성일 **2026-11-18** · 스키마 버전 **1**

이 보충 자료는 클래식 13종의 일본 문헌 각도와 한국 커뮤니티 참고 각도를 판본별로 분리한다. BLUE3 구현 캐릭터 4종의 원작 발사각·파워 상수는 이번 조사에서 복구하지 못했으므로 `null`로 보존한다. 게임이 실행되기 위해 사용하는 각도·탄도 모델은 별도의 `runtimeFallback`에 기록했다.

다운로드 데이터는 [`Fortress_AnglePower_Recovery.json`](../dist/datasets/Fortress_AnglePower_Recovery.json)이다. 각도 레코드 30개와 파워 레코드 17개를 포함하며, 기존 `Fortress_Recovered_Data.json` 버전 1.2.0의 1,208행과 게임 안의 원문 스냅샷 61개는 변경하지 않았다. 원작 실행 파일이나 서버의 물리 엔진을 검증한 자료는 아니다.

## 1. 값의 상태를 읽는 방법

| 상태 | 의미 | 실행에서의 취급 |
|---|---|---|
| `source_reported` | 출처에 적힌 숫자를 그대로 옮김 | 일본 2003 문헌 각도 선택에 사용. 공식 수치 또는 원작 실행 검증을 뜻하지 않음 |
| `community_claim_not_runtime_verified` | 한국 커뮤니티 자료의 주장. 정확한 적용 빌드는 미확정 | 사용자가 한국판 참고 프로필을 선택했을 때만 적용 |
| `not_recovered` | 조사한 자료에서 해당 값을 확보하지 못함 | 원문은 `null` 유지. 실행에 필요한 값은 별도 모델에서 가져옴 |
| `simulation_assumption` | 이 프로토타입을 위한 구현 가정 | 원작 복원 수치로 표시하거나 원문 필드에 덮어쓰지 않음 |

`sourceRefs`는 수치의 직접 출처다. BLUE3처럼 숫자를 얻지 못한 경우 `sourceRefs`는 비워 두고, 확인한 자료는 `examinedSourceRefs`에 넣었다. `null`은 0이나 제한 없음이라는 뜻이 아니다.

## 2. 클래식 13종의 발사각

단위는 도(°)다. 일본 값은 4Gamer의 2003년 당시 가이드에서 전사한 기존 복원 정본을 그대로 사용했다. 1편은 2003-07-25, 2편은 2003-08-01 자료이며, 동시대 **2차 자료**다. 한국 값은 정본에 수록된 커뮤니티 참고값으로, 특정 BLUE 또는 RED 빌드와의 대응은 확정하지 않았다. 두 출처를 하나의 원작 표로 합치지 않는다. [일본 가이드 1편](https://www.4gamer.net/specials/fortress2/05.html) · [일본 가이드 2편](https://www.4gamer.net/specials/fortress2/06.html)

| 탱크 ID | 이름 | 일본 2003 문헌 | 한국판 참고 · 빌드 미확정 | 한국 원문 기재 각폭 |
|---|---|---:|---:|---:|
| `catapult` | 캐터펄트 | 0–90 | 0–90 | 90 |
| `crossbow` | 크로스보우 | 15–80 | 15–80 | 65 |
| `cannon` | 캐논 | 22–45 | 25–45 | 25* |
| `carrot` | 캐롯탱크 | 0–45 | 0–40 | 40 |
| `duke` | 듀크 | 0–40 | 0–40 | 40 |
| `mine_lander` | 마인랜더 | 5–40 | 5–40 | 35 |
| `missile` | 미사일 | 20–40 | 20–45 | 25 |
| `multi_missile` | 멀티미사일 | 30–45 | 25–50 | 25 |
| `super_tank` | 슈퍼탱크 | 20–45 | 20–45 | 25 |
| `laser` | 레이저탱크 | 0–33 | 5–36 | 31 |
| `ion_attacker` | 이온어태커 | 20–55 | 20–55 | 35 |
| `secwind` | 세크윈드 | 0–40 | 0–40 | 40 |
| `poseidon` | 포세이돈 | 15–50 | 15–50 | 35 |

한국 참고값의 캐릭터별 원문 URL, 정본 레코드 ID, 프로필, 확인일은 JSON의 해당 `angleRecords`와 `numericSources`에 함께 들어 있다. 일본 표에는 각폭이 별도로 기재되어 있지 않아 `reportedSpan`을 `null`로 유지했다. `arithmeticSpan`은 최대각에서 최소각을 뺀 계산값이며 원문 수치와 구별한다.

### 수치가 다른 5종

| 탱크 | 일본 2003 | 한국 참고 | 차이 |
|---|---:|---:|---|
| 캐논 | 22–45 | 25–45 | 최소각 차이 |
| 캐롯탱크 | 0–45 | 0–40 | 최대각 차이 |
| 미사일 | 20–40 | 20–45 | 최대각 차이 |
| 멀티미사일 | 30–45 | 25–50 | 양 끝값 차이 |
| 레이저탱크 | 0–33 | 5–36 | 양 끝값 차이 |

이 차이만으로 변경 패치나 서비스 국가별 조정 시점을 확정할 수는 없다. 두 자료가 동일 빌드를 설명하는지도 확인되지 않았다. 프로필을 바꾸는 동작은 각도 한계만 선택하며 HP·공격 입력·기본 딜레이를 다른 판본 값으로 바꾸지 않는다.

한국 캐논 원문은 최소 25°, 최대 45°와 각폭 25°를 함께 적는다. 계산상 차이는 20°다. `reportedSpan: 25`, `arithmeticSpan: 20`, `spanConsistent: false`, 충돌 ID `KR_CANNON_ANGLE_SPAN`을 모두 보존했다. 임의로 어느 한 값을 정정하지 않았다. [한국 캐논 참고 원문](https://seore.org/raw/%EC%BA%90%EB%85%BC(%ED%8F%AC%ED%8A%B8%EB%A6%AC%EC%8A%A4%20%EC%8B%9C%EB%A6%AC%EC%A6%88))

## 3. BLUE3 4종의 공식 각도와 실행 가정

공식 캐릭터 공개 API, 게임 가이드, 관련 업데이트에서 아래 4종의 발사각 최소·최대 숫자를 확보하지 못했다. 따라서 캐릭터 4개와 스킬 16개의 원문 최소·최대는 모두 `null`이다. 공개 API에 각도 필드가 없다는 사실은 게임 안에도 제한이 없다는 뜻이 아니다. [공식 캐릭터 API](https://3blue.squadground.com/api/characters?projectId=1) · [3BLUE 가이드](https://sites.google.com/view/fortress3blueguide/3blue)

| 캐릭터 | 원문 최소·최대 | 현재 실행용 각도 가정 | 별도 스킬 가정 |
|---|---|---:|---|
| 캐터펄트 `catapult` | `null` / `null` | 8–82° | 없음 |
| 메카 펀치 `mecha_punch` | `null` / `null` | 5–75° | `pulse_laser`만 −35–75°, 직선 탄도 |
| 이블 벨라 `evil_bella` | `null` / `null` | 10–80° | 없음 |
| 야구소년 `baseball_boy` | `null` / `null` | 12–78° | 없음 |

표의 실행 각도와 레이저 직선 동작은 기존 프로토타입의 가정이다. 공식 2026-05-27 공지는 메카 펀치의 차징된 레이저와 경로상의 적 공격을 설명하지만, 발사각 숫자·무중력·바람 무시·충전 시간의 수치를 제시하지 않는다. 그 설명만으로 현재의 직선 모델을 원작 상수로 확정하지 않았다. [5/27 업데이트 원문](https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31) · [공개 API](https://3blue.squadground.com/api/posts/31)

가이드의 캐논 장면에서 읽은 44°, 47°, 49°는 그 장면의 조준 표시값이다. 최소·최대 한계가 아니며, 위 네 캐릭터의 범위로 옮기지 않았다. 이러한 관측은 JSON에서 `official_screenshot_observation`, `supportsMinMax: false`로 분리했다. [관측한 3BLUE 가이드](https://sites.google.com/view/fortress3blueguide/3blue)

## 4. 파워에서 확인한 내용과 미확인 내용

클래식 13종과 BLUE3 4종, 총 17개 파워 레코드에서 아래 9개 `sourcePower` 필드를 모두 `null`로 유지한다.

| 필드 | 복구하려는 원작 값 |
|---|---|
| `gaugeMin`, `gaugeMax` | 발사 파워 게이지의 실제 최솟값·최댓값 |
| `chargeRate` | 시간당 게이지 변화량 |
| `fullChargeSeconds` | 최소에서 최대까지 충전 시간 |
| `overflowBehavior` | 최대 도달 후 유지·반전·초기화 등 처리 |
| `velocityCurve` | 파워 입력을 초기 발사속도로 바꾸는 함수 |
| `gravity` | 탄도에 적용되는 중력 계수 |
| `windAcceleration` | 바람 표시를 가속도로 바꾸는 계수 |
| `projectileMass` | 원작에서 정의한 탄 무게·질량 |

정성적 조작 규칙은 일부 확인했다. Bandai의 과거 매뉴얼 형식 페이지는 Space를 누르는 동안 게이지가 증가하며 목표 파워와 직전 발사 파워를 별도 표시한다고 설명한다. 지형각과 조준각의 합을 실제 발사각으로 설명하지만, 좌우 방향의 부호 규칙이나 다른 빌드와의 대응까지 확정하는 근거는 아니다. 이 페이지의 개별 게시일·실행 빌드는 미상이고 한국판 BLUE 적용 여부도 미확정이다. [화면·조작 매뉴얼](https://bandaigv.com/html/03_howto003.htm)

BLUE3 공식 가이드는 Space 유지 시간으로 파워를 조절하며, 현재 조준각에서 파워 게이지 색과 착탄 표식의 색을 맞추는 조작을 설명한다. 높은 발사각의 고도 보너스도 안내하지만 보너스 식·임계값·상한은 복구하지 못했다. REAL 모드의 드래그·드롭 입력은 별도 규칙이므로 3BLUE의 Space 충전 상수로 환산하지 않는다. 가이드 하단의 기준일은 2026-05-26이며, 확인일 2026-11-18의 본문과 적용 빌드가 같은 날짜라는 뜻은 아니다. [초보자 가이드](https://sites.google.com/view/fortress3blueguide/%EC%B4%88%EB%B3%B4%EC%9E%90-%EA%B8%B0%EB%B3%B8-%EA%B0%80%EC%9D%B4%EB%93%9C) · [3BLUE](https://sites.google.com/view/fortress3blueguide/3blue) · [REAL](https://sites.google.com/view/fortress3blueguide/%EB%A6%AC%EC%96%BC%EB%8C%80%EB%82%9C%ED%88%AC)

2026-09-21 공지의 탄 연출 속도를 낮췄다는 설명에는 기본 탄속이나 물리 계수의 숫자가 없다. 이를 발사속도 감소율이나 탄 무게 변경으로 변환하지 않았다. [9/21 업데이트 원문](https://3blue.squadground.com/projects/fortress3blue/community/news/updates/1173) · [공개 API](https://3blue.squadground.com/api/posts/1173)

### POWER1 / POWER2와 발사 게이지 구분

탱크 소개의 `POWER1`·`POWER2` 또는 무기 공격력은 무기 위력을 나타내는 값이다. 이를 발사 파워 게이지의 범위, 충전 속도, 초기 탄속으로 옮기지 않는다. 같은 의미의 단어가 보여도 서로 다른 변수다. [탱크 선택 화면 설명](https://www.4gamer.net/specials/fortress2/03.html)

## 5. 현재 실행용 공통 모델

아래 값은 원작 자료가 확보되기 전까지 쓰는 공통 `prototype_ballistic_v1` 모델이다. 전부 `simulation_assumption`이며, 캐릭터별 고유 탄속을 복구했다는 뜻이 아니다.

| 항목 | 기본 모델 값 |
|---|---|
| 파워 범위·간격 | 0–100, 간격 1 |
| 충전 속도 | 초당 게이지 72 |
| 최대 도달 후 | `ping_pong`: 증가와 감소를 반복 |
| 최소·최대 초기속도 | 90 / 1,050 |
| 파워→초기속도 | `90 + (1050 - 90) × power / 100` |
| 중력 계수 | 320 |
| 바람 가속 계수 | 9 |
| 캐릭터별 고유 탄속 계수 | 추가하지 않음 |

속도·중력·바람 값은 이 프로그램의 좌표계와 시간 단위에 맞춘 계수다. 실제 단위의 원작 물리량으로 해석하지 않는다. 이 모델에서는 파워 0도 초기속도 90에 대응한다. BLUE3의 `pulse_laser` 직선 탄도처럼 기존에 정한 스킬 동작 예외 역시 구현 가정이다. 게임의 튜닝 값을 바꾸면 실행값이 달라질 수 있으며 원문 기록은 그대로 남는다.

## 6. 파일 구조와 데이터 경계

`dist/data.js`의 `FortData.aiming`은 다음과 같이 분리했다.

```text
aiming
  schemaVersion, defaultAngleProfile
  angleProfiles.jp2003.bounds[tankId]
  angleProfiles.kr_reference.bounds[tankId]
  powerDefaults
  sourcePower                     원문 미확인 9필드
  runtimeFallback                 공통 실행 모델
  blue3SourceBounds               공식 최소·최대 null
  blue3RuntimeFallbacks           기존 각도 및 레이저 가정
  recoveryDataset                보충 JSON 경로
```

`bounds`에는 `min`, `max`, `status`, `sourceRefs`, 원본 `recordId`가 있다. 한국 원문 각폭의 불일치를 숨기지 않도록 `reportedSpan`, `arithmeticSpan`, `spanConsistent`, `conflictIds`도 보존했다. 기본 선택은 `jp2003`이다. 실제 값 해석은 엔진의 조준 해석기를 사용하며, 출처 필드를 실행 폴백으로 덮어쓰지 않는다.

다운로드 JSON은 `manifest`, `angleRecords`, `powerRecords`, `runtimeFallbackProfiles`, `angleProfileDifferences`, `primarySources`, `numericSources`, `evidence`, `unknowns`로 구성된다. 공식 자료·동시대 2차 자료·커뮤니티 자료의 성격을 별도로 기록한다. `sourcePublicationDate`와 조사일, 출처가 표방한 기준일도 구별한다.

## 7. 검증 결과와 후속 검증 방법

이번 데이터 검증에서는 일본 13개와 한국 13개의 최소각·최대각·기재 각폭·원문 URL·원본 레코드 ID를 기존 정본과 대조했다. BLUE3 원문 각도 4개와 스킬 각도 16개는 미확인 상태를 유지하며, 파워 17개 × 9필드의 153개 원문 필드가 모두 `null`인지 확인했다. 기존 HP·공격 입력·기본 딜레이·무기 동작·61개 원문 스냅샷은 바꾸지 않았다.

원본 보존 확인용 SHA-256은 다음과 같다. 스냅샷 해시는 키를 정렬하고 공백 없이 직렬화한 61개 배열의 의미 내용 기준이다.

```text
Fortress_Recovered_Data.json
ae45745e803d403bbe434e7903497ce1d067f5ee063fa71bb2b803b0db0bc384

provenance.sourceSnapshots
07ca1e629a7ee0472b7331497a6ad78746d81c9dba68b2b8745ca85f6319050f
```

원작 수치로 승격하려면 다음 조건을 갖춘 추가 검증이 필요하다.

1. 게임명·플랫폼·서비스 지역·빌드 또는 패치 날짜·모드를 고정한다. BLUE3는 캐릭터·스킬·성급·레벨·장비 조건도 기록한다.
2. 평지에서 캐릭터와 스킬별 조준 양 끝값을 확인한다. 경사면에서는 차체각·입력각·표시 발사각을 별도로 기록하고 좌우 방향을 모두 확인한다.
3. 충전은 입력 시작·끝 시각과 게이지 표시를 함께 기록한다. 여러 번 반복해 최소·최대·충전 시간·최대 도달 후 동작을 각각 확인한다.
4. 무풍 조건의 파워별 초기속도와 중력 영향을 먼저 분리하고, 바람 조건을 바꿔 가속 효과를 비교한다. 비행 궤적 하나만으로 탄 질량을 확정하지 않는다.
5. 관측값에는 측정 오차와 재현 조건을 붙인다. 문헌값, 관측값, 실행 모델을 별도 필드로 유지하고, 근거가 확인된 항목만 새 버전에서 갱신한다.

프로토타입의 조준 해석·충전·미리보기 기능 테스트는 구현의 일관성을 확인한다. 그 테스트가 통과하더라도 원작 탄도와 일치한다는 검증으로 바꾸어 해석하지 않는다.
