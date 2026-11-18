# Dark Descent XXIV · Tactical Depth

봉인 열쇠를 찾아 던전을 탐험하고 장비를 모으는 액션 RPG입니다.

- [게임 시작](Web/index.html)
- [플랫폼 등록 정보](game.manifest.json)
- [개발 소스](Source/Project/)
- [이전 산출물](Archive/)

WebGL을 사용할 수 없으면 Canvas 2D 모드로 실행합니다. XXIV는 별도 v24 저장 슬롯을 사용합니다. 기존 v8 재개가 필요하면 [이전 실행 파일](Archive/Playable/8.0.0/Web/index.html)을 사용하세요. 브라우저 저장에 접근하려면 이전 실행 환경과 같은 오리진이 필요합니다.

## 출처

- 원본 XXIV 버전을 2026-11-17에 수집해 PlayHub 8.1.0 버전으로 통합했습니다.
- 수집 자료 `WebProjects/Diablo II/Archive/Web/dark_descent_xxiv_web.zip`.
- [통합 실행판 보관본](Archive/Releases/diablo-2-v8.1.0.zip).
- 원본 ZIP SHA-256은 cf4dec42576f26e7cf6e2ada6f87639ab4aba27d3869502d9c992c6c4463943b입니다.
- 원본 패키지의 실행 파일과 편집 소스는 Source/Project에 보존합니다. Web에는 실행본과 PlayHub 언어 지원 스크립트를 둡니다.

## PlayHub 통합판 8.2.0 (2026-11-18)

- 임시 수동 반영이며 플랫폼 배포 파이프라인이나 공개 게시를 수행한 것이 아닙니다. 기존 비공개 상태를 유지합니다.
- 원본 Offline Edition 28.1의 시작/복구 메뉴, 한국어 물리키, 전투·성장·저장 보호를 반영했습니다.
- 최신 가이드: [Source/Project/README.md](Source/Project/README.md), 시스템 문서 8개: [docs](Source/Project/docs/), 최신 출처·게임 데이터: [data](Source/Project/data/).
- 이전 소스는 `Archive/Source/v8.1.0/`, 이전 실행은 [XXIV 실행](Archive/Playable/8.1.0/index.html) 및 `Archive/Releases/diablo-2-v8.1.0.zip`에 보존합니다.
- **저장 주의:** 새 런타임은 별도 `dark-descent-xxviii` 슬롯을 사용하며 v26/v27 JSON만 v28로 이관합니다. 기존 통합판 XXIV(v24)의 저장은 직접 이관할 수 없습니다. 기존 기록을 삭제하거나 덮어쓰지 않으며 이전 실행본에서 별도로 플레이/백업하세요. 파일 경로 변경 시 브라우저별 저장 영역 공유는 보장하지 않습니다.
- 새 통합판 ZIP: `Archive/Releases/diablo-2-v8.2.0.zip`.
- 수집 ZIP `Dark_Descent_Offline_Edition_28_1_Full_20261118.zip`, SHA-256 `425be534a7abfb2f13b609a8f20cbff58c45613f80bfda9fa88f4a0f84ced2b9`.
- 로컬 Node22 재검증: 엔진133개 통과/브라우저 렌더1개 제외, 오프라인31개 통과, 초기 전투7직업 통과, v26→28 샘플6검사 통과. 장기 캠페인 완주나 실제 브라우저/GPU 검증은 아닙니다.
- ID·표지·언어 어댑터 보존. 신규 텍스트 번역 완전성과 허브 샌드박스 실플레이는 미검증입니다.

Final Hub locale synchronization (2026-11-18): canonical Web includes generated locale helpers. Original source and pre-sync release are preserved; final release hashes are in docs/migration/game-update-20261118-final.json.
