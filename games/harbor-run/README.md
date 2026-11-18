# Harbor Run

신규 비공개 등록 준비본, 원본v4 → 통합4.1.0(2026-11-18).

- [로컬 게임](Web/index.html), [원본 가이드](Source/Project/README.md), [최신 기획/분석](Source/Project/docs/PLAYABILITY_ANALYSIS_v4.md).
- 원본67파일과ZIP은 Source/Project 및Archive/Incoming에 보존했습니다.
- 표지는 게임화면이 아닌 제목 placeholder입니다. 원작에셋/새모델링을 생성하지 않았습니다.
- WebGL2 필요. 한국어UI이며 다국어완전성 미검증.
- harbor-run-save-v1 저장키를 유지합니다. 신규게임ID로 기존다른게임저장에접근하지 않습니다.
- 로컬6개unit suite 및 실제게임소스VM검사60개(전투12/게임플레이43/시야5) 통과. DOM/GPU는대역이며 실제브라우저검증을 대신하지 않습니다.
- 카탈로그는enabled:false로등록하고외부배포하지않습니다.

## 허브 공개 전 차단 항목

현재 허브 iframe은allow-scripts만허용하므로 Pointer Lock과브라우저파일다운로드가제한됩니다. manifest설정만으로권한이열리지않습니다. 저장bridge와WebGL2실행도실제허브에서검증해야합니다. 이번에는보안정책을완화하거나공개하지않고비공개로유지합니다. 임시readCatalog스키마검사는통과했습니다.
