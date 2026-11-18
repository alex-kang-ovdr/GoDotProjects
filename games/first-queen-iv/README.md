# First Queen IV · Field Command

여러 군단을 편성하고 실시간 전투에서 부대를 지휘하세요.

- [게임 시작](Web/index.html)
- [플랫폼 등록 정보](game.manifest.json)
- [개발 소스](Source/Project/)

WebGL을 사용할 수 없으면 CPU 3D 호환 모드로 실행합니다. 2D 전술 화면도 선택할 수 있습니다.

## 출처

- 원본 14.0.0 버전을 2026-11-17에 수집해 PlayHub 14.1.0 버전으로 통합했습니다.
- 수집 자료 `WebProjects/First Queen IV/Archive/Web/FirstQueen4_WebGL_3D_v14.zip`.
- [통합 실행판 보관본](Archive/Releases/first-queen-iv-v14.1.0.zip).
- 원본 ZIP SHA-256은 09b4f0116f00e7e71b374ca01a43e3578a2bb017cfcd6ad1786169c0a438217f입니다.
- 원본 패키지의 실행 파일과 편집 소스는 Source/Project에 보존합니다. Web에는 실행본과 PlayHub 언어 지원 스크립트를 둡니다.

## PlayHub integration 14.2.0 (2026-11-18)

- Upstream FirstQueen4 Web v22 full source/planning package (124 files) preserved in `Source/Project/`; import path and SHA256 inventory: `Source/import-v22-manifest.json`.
- Original ZIP: `Archive/Incoming/FirstQueen4_WebGL_3D_v22.zip`, SHA256 `737b85072ee108d80ee758131116c93b743650a4fdda82738ebf5402e5e92d1a`.
- Previous source preserved byte-for-byte in `Archive/Source/v14.1.0/`; previous integrated release ZIP retained.
- Integrated release: `Archive/Releases/first-queen-iv-v14.2.0.zip`, SHA256 `d60c02b9179bb98d2ba04b79a3defea94644c1fd96e7140d5be4b02915532bf5`.
- Locale vendor scripts, cover, game ID and platform save contract unchanged. Existing private catalog visibility remains unchanged.
- New native save schema22/key fq4_proto_v22 reads previous fq4_proto_v14/v1. Actual default schema14 campaign import into22 passed with army IDs/regions retained and old save unmodified. Older version cannot be assumed to read new schema22 saves.
- Seven Node suites passed (281 cases); optional CPU renderer test blocked by absent @napi-rs/canvas. No dependencies installed. Tests ran in an isolated copy to preserve all upstream reports. Results: `Source/Validation-v22/`. Real browser/GPU/touch and authenticated Hub save are not yet verified.
