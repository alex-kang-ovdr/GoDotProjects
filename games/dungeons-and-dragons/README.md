# Dungeons & Dragons

## 소개 이미지 · v4.1.0

2026-11-18 PlayHub 로컬 런처에서 [실제 플레이 화면](Web/assets/gameplay-intro.png)을 캡처하여 소개 이미지로 등록했습니다. 게임 화면을 Chrome에서 1,360px 너비로 캡처하고 PNG 디코딩을 확인했습니다.

새 게임과 직업 변경에서 v4 전투 상태가 초기화되도록 연결을 수정했습니다. Chrome에서 새 게임, 직업 변경, R 재시작, 기존 저장 불러오기 직후 D 키를 눌러 실제 이동을 확인했습니다.

- 화면 이미지 SHA-256 `49b74bd24cb8ad7ef7e19bd2bc9208853efee5388a4a9d461451687c9b049898`
- [통합판 ZIP](Archive/Releases/dungeons-and-dragons-v4.1.0.zip)
- 통합판 ZIP SHA-256 `9d826072c2605a3922c9a876c5555234d7834f84c302974ce8c81b09790d5802`

- [게임 시작](Web/index.html)
- [플랫폼 등록 정보](game.manifest.json)
- [개발 소스](Source/Project/)
- [이전 산출물](Archive/)

공통 실행 경로는 Web/index.html입니다. 플랫폼 노출 상태는 사용자 요청으로 제외이며 전체 목록은 상위 catalog.json에서 관리합니다.

실행 파일은 최신 확보 버전 4.0.0을 기준으로 구성했습니다. 게임 진행 데이터와 플랫폼 데이터는 산출물 폴더 이동과 별개로 브라우저 및 플랫폼 저장소에서 관리됩니다.
