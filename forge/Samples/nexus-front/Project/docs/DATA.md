# 데이터 이식과 동일성

## 데이터 기준

이번 작업은 라이브 데이터를 새로 수집하여 밸런스를 바꾸지 않았다. 기존 웹 v10의 Data Dragon **16.22.1** 고정 스냅샷을 Godot에서 읽을 수 있는 JSON으로 내보냈다. 공식 수치·근거 포인터·원본 해시·재구성 표시를 모두 보존했다.

| 데이터 | 개수 | 사용 |
|---|---:|---|
| 영웅 정적 데이터 | 173 | 전체 도감 |
| QWER 정적 데이터 | 692 | 영웅별 이름·랭크·소모·재사용·사거리·출처 |
| 전체 아이템 | 863 | 전체 도감. 모든 항목이 협곡 구매 대상은 아님 |
| 실제 플레이 영웅 | 10 | 아리·애쉬·가렌·럭스·리 신·진·다리우스·이즈리얼·레오나·소라카 |
| 실제 플레이 QWER | 40 | 각 영웅의 네이티브 GDScript 구현 |
| 게임 상점 아이템 | 25 | 지원 능력치·조합·판매 |
| 재사용 PNG | 35 | 영웅 10 + 상점 25. 기존 파일과 바이트 동일 |

## 변환 방법

`tools/import_v10_data.cjs`는 v10의 `dist/restored-data.js` 모듈을 읽어 내보내는 개발용 도구다. 새 수치를 계산하지 않고 같은 객체를 `JSON.stringify`로 저장한다. 맵도 v10의 `MAP` 정의를 그대로 추출한다. 게임을 실행할 때 이 JavaScript 도구를 호출하지 않는다.

```bash
node tools/import_v10_data.cjs /path/to/nexus_front_v10
```

이 명령은 선택적 재추출 작업이다. 제공된 JSON으로 바로 Godot 게임을 실행할 수 있다.

## 해시

| 대상 | SHA-256 |
|---|---|
| 기존 v10 `dist/restored-data.js` | `92aeb625b91a070d9f99d0fd3f988ec1f0dde4bf8bd807cfe723ff37db5ea2d3` |
| Godot `data/restored_data.json` | `665f99e1bfcdb525865a8a075a3cbcee00d2b81be39525dd0c5f84611274161a` |
| 기존 `data/restored-input.json` | `43e9f8af0a4abea80aabd02ec799266ca4cd2f332248005c3c5ad784435e622d` |
| 동봉 원본 v10 소스 ZIP | `7afdb03bae4143e8e9331b5091c6170f5a368b95bedabd279186e2f57aa8f101` |

JavaScript와 JSON은 포맷이 다르므로 파일 해시가 같지 않다. 두 파일을 파싱한 데이터 객체의 모든 값과 배열을 비교하여 **의미상 동일성**을 검증했다. 각 PNG는 **바이트 동일성**을 별도 확인한다. 자세한 영웅·아이템 이미지별 해시는 `data/provenance.json`, 전체 산출물 파일 목록은 ZIP 안의 `FILE_MANIFEST.json`이 기준이다.

## 공식 자료와 재구성 자료

각 정적 항목의 `source`는 공식 Data Dragon URL, `sourcePointer`는 JSON 경로, `sourceHash`는 원본 파일 SHA-256이다. 예:

- <https://ddragon.leagueoflegends.com/cdn/16.22.1/data/ko_KR/champion.json>
- <https://ddragon.leagueoflegends.com/cdn/16.22.1/data/ko_KR/champion/Soraka.json>
- <https://ddragon.leagueoflegends.com/cdn/16.22.1/data/ko_KR/item.json>

`official_static_values` / `official_static_rank_values`와 `project_reconstruction`을 구분한다. 복원 도구가 해석하지 못한 설명 토큰도 `unresolvedTokens`로 남긴다. 스킬 이름·기본 능력치·랭크 배열이 보존됐다는 사실이 모든 원작 서버 판정이 일치한다는 뜻은 아니다.

맵은 프로젝트용 2D 전장이다. 언덕 높이에 따른 시야 차단과 고정 건물의 관측 기억은 사용자가 요청한 `terrain-memory-v1` 프로필이며, 원작의 모든 지형 규칙에 대한 주장으로 취급하지 않는다.

## 참고 자료

`reference/v10/`에는 기존 v10 소스 ZIP·영웅 데이터 문서·전투 문서·QA·실행 로그를 보존했다. `reference/original_reconstruction/`와 `reference/reverse_design/`에는 기존 분석·정규화 데이터·원본 자료를 복사했다. 이 폴더에는 `.gdignore`를 두어 분석 CSV를 Godot 번역 파일로 임포트하지 않게 한다. 게임 내보내기에서는 참고 자료 전체를 제외한다.

## 추가한 표시 자산

기존 35개 PNG 외에 간단한 넥서스 기하 도형 SVG 아이콘과 한글 표시용 폰트를 추가했다. 새로운 영웅 일러스트·모델·3D 에셋을 생성하지 않았다.

한글 폰트는 시스템의 **Noto Sans CJK KR Regular**에서 한국어·라틴·기호 범위를 서브셋한 `assets/NexusSansKR.otf`이며, 원본 라이선스와 고지 내용은 `assets/FONT_LICENSE.txt`에 포함했다. 원작 명칭·초상화·공식 정적 자료의 권리는 Riot Games 등 해당 권리자에게 있다. 이 프로젝트는 공식 서비스가 아닌 팬 제작 분석·구현물이다.
