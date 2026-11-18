# 개척자들

## 소개 이미지 · v27.3.0

2026-11-18 PlayHub 로컬 런처에서 [실제 플레이 화면](Web/assets/gameplay-intro.png)을 캡처하여 소개 이미지로 등록했습니다. 게임 화면을 Chrome에서 1,360px 너비로 캡처하고 PNG 디코딩을 확인했습니다.

- 화면 이미지 SHA-256 `23b11c716ebe8b085bd0efc0f7eeeebb88d8fd0552a88c05d40200484df3860f`
- [통합판 ZIP](Archive/Releases/settlers-7-v27.3.0.zip)
- 통합판 ZIP SHA-256 `85572af030d754479a1293e17aa8e1ef3d225a287844947053719680157807c2`

2026-11-18에 반영한 비공개 통합판은 27.2.0입니다. [로컬 실행](Web/index.html)과 [원본 플레이 가이드](Source/Project/README.md)를 사용할 수 있습니다.

시작 또는 플레이 화면에서 한국어, 영어, 일본어, 중국어 간체, 프랑스어, 스페인어, 브라질 포르투갈어, 힌디어를 선택할 수 있습니다. 시작 안내, 게임 조작, 자원, 건설, 운영, 원정, 연구와 교역의 주요 화면은 선택한 언어로 표시됩니다. 연구 효과 6개, 작업·보급 상태, 건설·모집·원정·보급 조건과 왕국 소식도 번역합니다. 지역 고유명사와 개발자용 진단 문구는 원본 그대로 표시합니다.

브라우저 저장은 기존 `S7_V27` 키와 v24–v26 읽기 경로를 사용합니다. 게임 ID는 `settlers-7`입니다. 27.2.0의 변경은 이름과 화면 언어에 적용됩니다.

- 원본 [Settlers7_ReverseDesign_v27.zip](Archive/Incoming/Settlers7_ReverseDesign_v27.zip)의 SHA-256은 `6574323992239b7569992c9a53917ce005aae63bb30e39b6d442c0b8865565dc`입니다. [원본 파일 목록과 해시](Source/import-v27-manifest.json)에 있는 69개 파일은 원본 바이트로 보존했습니다.
- 직전 [통합판 27.1.0](Archive/Releases/settlers-7-v27.1.0.zip)의 SHA-256은 `9d7ddee1a0d8ccd2403137108c950b605823fa4d103bea2e8720bfd61388dfcb`입니다.
- [통합판 27.2.0](Archive/Releases/settlers-7-v27.2.0.zip)의 SHA-256은 `fcf361bfa97e9aa2fa0c61a029b42681e4f1a790cd1c4df0016e8e28919e5173`입니다. ZIP에는 manifest와 최종 동기화된 `Web/`가 들어 있습니다. [상세 문구 반영 전 빌드](Archive/BuildSteps/settlers-7-v27.2.0-before-detailed-locale.zip)도 보관합니다.
- Chrome에서 8개 언어로 제목, 빵 자원 표시, 건설·운영·원정·연구·교역 화면을 확인했습니다. 언어 전환 중 저장 상태가 유지됐고, 도움말로 이동한 뒤 현재 왕국으로 돌아오기와 재로딩 후 저장 복원도 통과했습니다.
- 상세 문구 검사에서 영어 연구 효과 6개와 배치 오류를 확인했습니다. 실제 건설 시작 로그는 영어와 일본어로 전환했고, 시뮬레이션을 진행한 저장을 불러왔을 때 완공 로그가 영어로 표시됐습니다.
- v27의 기존 Node 검증 179개 결과는 [별도 기록](Source/Validation-v27/)에서 확인할 수 있습니다.
