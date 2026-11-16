# 웹 게임 저장소

모든 게임은 영문 소문자 슬러그 폴더와 Web/index.html 시작점을 사용합니다. 총 29종 중 21종을 PlayHub에 표시합니다.

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

## 개발 및 반영

Web 또는 game.manifest.json을 수정한 뒤 PlayHub 소스에서 npm run sync:webgames를 실행해 배포용 게임을 생성합니다. PlayHub 배포 폴더의 games는 자동 생성물이며 원본은 이 저장소입니다. 플랫폼 재시작과 EXE 재빌드는 PlayHub 도구 안내를 따릅니다.
