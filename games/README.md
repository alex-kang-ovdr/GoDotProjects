# 웹 게임 저장소

모든 게임은 영문 소문자 슬러그 폴더와 `Web/index.html` 시작점을 사용합니다. 총 36종 중 21종을 PlayHub에 표시합니다. 로컬 실행 링크는 [게임 카탈로그](CATALOG.md)에 있습니다.

- game.manifest.json에 제목, 장르, 이미지, 저장·언어 정보를 둡니다.
- Web에 실행 HTML과 리소스를 둡니다.
- Source에 개발 소스와 관련 도구를 둡니다.
- Archive에 이전 버전과 원본 ZIP을 보관합니다.
- ReverseDesign과 References에는 기존 분석·참고 자료를 보관합니다.

[catalog.json](catalog.json)이 플랫폼 등록과 노출 순서의 기준입니다. 기존 게임 13종을 내장 퍼즐 8종보다 먼저 표시합니다. 게임이 제외되어도 로컬 실행 경로는 유지합니다.

## 게임 목록

- [RimWorld](rimworld/Web/index.html) — 플랫폼 포함
- [삼국지 11](samgukji-11/Web/index.html) — 플랫폼 포함
- [League of Legends](league-of-legends/Web/index.html) — 플랫폼 포함
- [Clash Royale](clash-royale/Web/index.html) — 플랫폼 포함
- [Besiege](besiege/Web/index.html) — 플랫폼 포함
- [Cosmoteer](cosmoteer/Web/index.html) — 플랫폼 포함
- [FTL - Faster Than Light](ftl/Web/index.html) — 플랫폼 포함
- [Oxygen Not Included](oxygen-not-included/Web/index.html) — 플랫폼 포함
- [Brawl Stars](brawl-stars/Web/index.html) — 플랫폼 포함
- [This War of Mine](this-war-of-mine/Web/index.html) — 플랫폼 포함
- [World of Tanks](world-of-tanks/Web/index.html) — 플랫폼 포함
- [World of Warships](world-of-warships/Web/index.html) — 플랫폼 포함
- [탕탕특공대](survivor-io/Web/index.html) — 플랫폼 포함
- [브릭 브레이크](brick-breaker/Web/index.html) — 플랫폼 포함
- [버블 스플릿](bubble-split/Web/index.html) — 플랫폼 포함
- [블록 드롭](falling-blocks/Web/index.html) — 플랫폼 포함
- [매치 가든](match3-garden/Web/index.html) — 플랫폼 포함
- [메모리 페어](memory-pairs/Web/index.html) — 플랫폼 포함
- [머지 타일](merge-tiles/Web/index.html) — 플랫폼 포함
- [마인 그리드](mines-grid/Web/index.html) — 플랫폼 포함
- [슬라이드 나인](slide-puzzle/Web/index.html) — 플랫폼 포함
- [Clash of Clans](clash-of-clans/Web/index.html) — 플랫폼 제외
- [Diablo II](diablo-2/Web/index.html) — 플랫폼 제외
- [Don't Starve](dont-starve/Web/index.html) — 플랫폼 제외
- [Dungeons & Dragons](dungeons-and-dragons/Web/index.html) — 플랫폼 제외
- [Into the Breach](into-the-breach/Web/index.html) — 플랫폼 제외
- [Kerbal Space Program](kerbal-space-program/Web/index.html) — 플랫폼 제외
- [프린세스 메이커 2](princess-maker-2/Web/index.html) — 플랫폼 제외
- [PROJECT IDOL](project-idol/Web/index.html) — 플랫폼 제외
- [Dark and Darker](dark-and-darker/Web/index.html) — 플랫폼 제외
- [First Queen IV](first-queen-iv/Web/index.html) — 플랫폼 제외

## 개발 및 반영

### 폴더와 파일 이름

- `<game-id>/game.manifest.json`에 게임 ID, 통합 버전, 반영일, 실행·저장·언어 정보를 둡니다. 예를 들어 `first-queen-iv`를 사용합니다. `catalog.json`의 `id`와 `path`는 실제 폴더 이름과 대소문자까지 일치해야 합니다.
- `Web/index.html`과 `Web/assets/`에 실행 파일과 리소스를 둡니다. 새 자체 파일의 이름은 영문 소문자 kebab-case로 작성합니다. 기존 참조 경로나 원본 패키지의 파일 이름을 옮길 때 해당 참조도 함께 수정합니다.
- `Source/Project/`에는 수집한 개발 소스와 빌드 도구를 두고, 수집 전의 산출물은 `Archive/`에 보존합니다. 게임별 참고 자료는 `References/`에 기록하고 `ReverseDesign/`의 기존 문서를 유지합니다.
- 통합판은 `Archive/Releases/<game-id>-v<version>.zip`에 보관합니다. ZIP 루트에는 `game.manifest.json`과 `Web/`를 넣습니다. 재현에 필요한 자료의 이름과 SHA-256을 게임별 `README.md`에 기록합니다.

### 수집본 병합과 공개

1. `WebProjects` 수집본의 manifest와 진입점을 확인하고 `Source/Project`의 직전 원본과 비교합니다. 실행 내용이 같은 재포장은 기존 버전과 날짜를 사용합니다.
2. 원본의 실행 변경을 병합하고 `Web/index.html`의 PlayHub 언어 런타임과 저장 연동을 다시 적용합니다. 기존 ID·저장 키·공개 상태·표지를 확인하고 파일 실행과 PlayHub 샌드박스에서 모두 검사합니다. 신규 게임은 검증이 끝날 때까지 `catalog.json`의 `enabled: false`로 등록합니다.
3. 변경한 통합판은 기존 `version`에서 마이너를 올리고 패치를 `0`으로 맞춥니다. 예를 들어 `6.0.0`은 `6.1.0`이 됩니다. 최초 통합판은 확인된 원본 버전에서 마이너를 올립니다. `updatedOn`에는 실제 반영일을 `YYYY-MM-DD`로 기록합니다.
4. PlayHub 소스에서 `npm run sync:webgames`로 실행 자산과 언어 사전을 생성합니다. 공개 게임은 한국 시간 기준 반영일부터 14일 동안 날짜와 업데이트 배지를 자동으로 표시합니다. `source/games/`와 플랫폼 카탈로그는 생성 결과입니다.
5. 통합판의 진입점과 리소스, 기존 저장, 실행 중 언어 전환 및 공개 카탈로그를 검증합니다. 검증한 `Web/`와 manifest를 버전 ZIP으로 보관합니다. 수집 ZIP·실행 로그·개인 데이터는 반영분과 구분합니다.

[2026-11-17 통합 기록](INTEGRATION.md)에 적용 게임과 출처를 정리했습니다.

- [Kingdom Rush](kingdom-rush/README.md) 통합15.1.0: 신규비공개 검증본. [로컬실행](kingdom-rush/Web/index.html).

- [Harbor Run](harbor-run/README.md) 통합4.1.0: 신규비공개 검증본. [로컬실행](harbor-run/Web/index.html).

- [Settlers 7](settlers-7/README.md): 신규 비공개 후보. [실행본](settlers-7/Web/index.html).

- [Underworld Escape (Hades prototype)](hades/README.md): 신규 비공개 후보. [실행본](hades/Web/index.html).

- [Duck Extraction](duck-extraction/README.md): 기능 제한을 기록한 신규 비공개 프로토타입.
