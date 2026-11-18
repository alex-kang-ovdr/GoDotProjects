# CommunityDragon 보완 조사 — 원본 미확보

## 조사 목적과 계층

공식 Data Dragon의 미해결 스킬 변수를 보완할 수 있는지 확인하기 위해, CommunityDragon의 명시적 `16.22` 경로에서 **Ahri Q·Garen Q의 클라이언트 계산 노드**를 조사하려 했다. CommunityDragon은 Riot 공식 Data Dragon과 별도의 **제3자 클라이언트 추출 프로젝트**다. 프로젝트 자체도 Riot의 보증·후원이 없다고 밝힌다.[1]

## 이번 확인 결과

| 대상 | 요청한 원문 | 직접 수집 | 웹 읽기 | 확보한 수치 표본 |
|---|---|---|---|---|
| Ahri | [ahri.bin.json](https://raw.communitydragon.org/16.22/game/data/characters/ahri/ahri.bin.json) | HTTP 403 | 접근 불가 | 없음 |
| Garen | [garen.bin.json](https://raw.communitydragon.org/16.22/game/data/characters/garen/garen.bin.json) | HTTP 403 | 접근 불가 | 없음 |

위 오류는 **이번 수집 환경에서 원문을 확보하지 못했다는 뜻**이다. 해당 파일이나 `mDataValues`·`mSpellCalculations` 노드가 존재하지 않는다는 판정은 아니다. 403의 원인도 확인되지 않았다.

원문 바이트를 받지 못했으므로 출처 해시·JSON 포인터·피해 계수·계산식을 임의로 기록하지 않았다. 요청 URL에 `16.22`가 포함되어 있지만 그 경로가 실제 어떤 클라이언트 빌드와 대응하는지도 검증하지 못했다. 확보된 공식 22종 데이터 시트에는 이 조사 값을 합치지 않았다.

구조화 결과는 [acquisition_report.json](acquisition_report.json)에 있다. **이 폴더는 복원 성공 표본이 아니라 미확보 조사 기록**이다.

## 후속 복원 시 확인할 사항

CommunityDragon 문서는 상세 챔피언 자료가 bin 파일에 들어 있지만 통일된 형식과 간단한 해석법이 없다고 설명한다.[2] 추후 해당 버전의 원문을 확보하면 다음 순서로 표본을 검증해야 한다.

1. 파일 URL·추출 버전·수집 시각·원본 SHA-256을 고정한다.
2. Q 스킬과 연결되는 실제 레코드를 찾고, `mDataValues`·`mSpellCalculations`의 존재 여부와 정확한 JSON 포인터를 기록한다.
3. 랭크별 기본값·AP/AD 계수 등 확인한 노드만 별도 표본으로 보존한다. 계산 노드 이름으로 최종 게임 동작을 추정하지 않는다.
4. 왕복 타격 횟수·추가 피해와 총 피해의 관계·대상별 제한·온힛 적용·마법/고정 피해·런타임 변경 조건은 독립적으로 검증한다.
5. 공식 Data Dragon 수치와 대조하되 출처 계층과 빌드를 그대로 유지한다. 서로 충돌하는 값은 덮어쓰지 않는다.

## 출처

[1] [CommunityDragon 프로젝트 소개](https://www.communitydragon.org/)

[2] [CommunityDragon Docs — Asset paths / Where can I find this asset or data?](https://github.com/communitydragon/docs/blob/master/assets.md)
