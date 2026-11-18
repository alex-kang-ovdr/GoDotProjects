# Clash Royale

- [게임 시작](Web/index.html)
- [플랫폼 등록 정보](game.manifest.json)
- [개발 소스](Source/Project/)
- [이전 산출물](Archive/)

공통 실행 경로는 Web/index.html입니다. 플랫폼 노출 상태는 포함이며 전체 목록은 상위 catalog.json에서 관리합니다.

## PlayHub 통합판 4.1.0

- [통합 실행판 보관본](Archive/Releases/clash-royale-v4.1.0.zip)
- 반영일 2026-11-17. 기존 통합판 4.0.0에 수집본 4.4.0의 실행 변경을 반영했습니다.
- 수집 자료 `WebProjects/Clash Royale/Archive/Web/ClashRoyale_Sites_Source.zip`, SHA-256 `03e728ad1091b83c0eafef4cb741baa4c85c5518c64bbbcac72c4c8a26579556`.
- PlayHub 언어 어댑터, 게임 ID, 저장 연동과 표지를 유지했습니다.

## PlayHub 통합판 4.2.0 (2026-11-18)

- 원본 Crownfall4.5.0/전투규칙5를 수동 반영했습니다. 플랫폼 배포 파이프라인이나 외부 공개 게시를 실행한 것이 아닙니다.
- 공개 근거 일부 카드값, 신규 미니언 거인·덩굴과 프로필별 저장/리플레이를 반영합니다. 전체 원작 복원은 아닙니다.
- 최신 [게임 가이드](Source/Project/README.md), [4.5 변경](Source/Project/docs/RELEASE_NOTES.md), [복원 연결](Source/Project/docs/RECONSTRUCTION_V4_5.md), [최신 연구 기획](ReverseDesign/Revisions/2026-11-18/00_README.md). 오래된 개별 문서의 규칙4 설명보다4.5 릴리스 설명을 우선하세요.
- 이전 Source/Project는 `Archive/Source/v4.1.0/`, 기존 실행본은 `Archive/Releases/clash-royale-v4.1.0.zip`에 보존했습니다. 기존 역기획 문서는 덮어쓰지 않았습니다.
- 기존 게임ID·저장키·표지·언어 어댑터·공개 상태를 유지합니다. 엔진은 구규칙2/3/4 저장과 리플레이를 이전 규칙으로 처리합니다.
- 입력ZIP SHA-256 `9cd95f6a3d231fe5d6051111566a93dacb234b57b415d7d723e73283dd32698f`.
- Node22에서 게임 회귀251/251 및 JS구문·DOM바인딩·중복ID·배포리소스 검사 통과. 연구154검사는 원본 과거결과이며 이번 재실행이 아닙니다.
- 브라우저/GPU·실사용자 저장 및 신규텍스트 번역 완전성은 별도검증 대상입니다.

Final Hub locale synchronization (2026-11-18): canonical Web includes generated locale helpers. Original source and pre-sync release are preserved; final release hashes are in docs/migration/game-update-20261118-final.json.
