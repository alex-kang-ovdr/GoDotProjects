# Crypt of the Fallen

1인칭 던전을 탐험하고 전리품을 확보해 포탈로 탈출하세요.

- [게임 시작](Web/index.html)
- [플랫폼 등록 정보](game.manifest.json)
- [개발 소스](Source/Project/)

데스크톱 Chrome 또는 Edge와 WebGL을 사용합니다. 마우스 잠금이 거부되면 방향키로 시점을 움직일 수 있습니다.

## 출처

- 원본 13.0.0 버전을 2026-11-17에 수집해 PlayHub 13.1.0 버전으로 통합했습니다.
- 수집 자료 `WebProjects/Dark and Darker/Archive/Web/DarkAndDarker_FPS_Web_v13.zip`.
- [통합 실행판 보관본](Archive/Releases/dark-and-darker-v13.1.0.zip).
- 원본 ZIP SHA-256은 4e72559ccad6aed8adddcc27ad5844a664d618fb1b2454f2e60756121d41bed1입니다.
- 원본 패키지의 실행 파일과 편집 소스는 Source/Project에 보존합니다. Web에는 실행본과 PlayHub 언어 지원 스크립트를 둡니다.

## PlayHub 통합판 13.2.0 (2026-11-18)

- 임시 수동 반영입니다. 향후 플랫폼 배포 파이프라인을 거친 게시가 아닙니다.
- 원본 v15의 PC·모바일 입력, 세 클래스, 보관함·출전·중복 정산 방지와 원작 분석 R1을 반영했습니다.
- 최신 사용 가이드: [Source/Project/README.md](Source/Project/README.md).
- 최신 기획/구현 범위: [ORIGINAL_ALIGNMENT_V15.md](Source/Project/docs/ORIGINAL_ALIGNMENT_V15.md).
- 원작 분석과 원본 데이터: [reference/R1](Source/Project/reference/R1/). 원문의 근사·미확인 표시를 보존합니다.
- 이전 개발 원본: `Archive/Source/v13.1.0/`. 이전 실행판: `Archive/Releases/dark-and-darker-v13.1.0.zip`.
- 새 실행판: `Archive/Releases/dark-and-darker-v13.2.0.zip`.
- 입력 ZIP: `DarkAndDarker_v15_Complete_20261118.zip`, SHA-256 `708031c9d6ea458fd15067c7f65072727ac84a33ef415d494a4645add0401f97`.
- 같은 저장 영역에서 `crypt_v13_save` 골드·통계를 읽어 `crypt_v15_profile`로 이전하며 기존 키를 삭제하지 않습니다. 이전 버전에 없던 아이템은 복구하지 않습니다.
- 기존 ID, 표지, 언어 어댑터 및 비공개 카탈로그 상태를 유지했습니다. 신규 텍스트 번역 완전성은 미검증입니다.
- 로컬 재검증: Node 22.16.0에서 게임 51, 보관함 28, 입력 71 = 150/150 통과; JS 구문 9개 및 source/HTML 빌드 일치 검사 통과.
- 실제 브라우저/GPU/Android 및 허브 안의 실행은 별도 검증 대상입니다.

Final Hub locale synchronization (2026-11-18): canonical Web includes generated locale helpers. Original source and pre-sync release are preserved; final release hashes are in docs/migration/game-update-20261118-final.json.
