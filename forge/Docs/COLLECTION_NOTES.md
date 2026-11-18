# PlayForge 산출물 수집·버전 정리

수집 기준일: 2026-11-17 UTC. 기존 파일은 수정하지 않았습니다.

## 수집 결과
- PlayForge 이름으로 등록된 ZIP 19개를 Library에서 확보했습니다. ZIP CRC 검사는 전부 통과했습니다.
- `Original_Zips`는 원본 19개를 그대로 보존합니다. 파일 단위 SHA-256과 생성 시각은 `SOURCE_INVENTORY.json`에 있습니다. 바이트가 완전히 같은 ZIP은 없습니다.
- `Current/PlayForge_Cloud_Consolidated_v17`은 01:01 UTC 통합본입니다. 내부 편집기는 v16입니다. 통합본 버전과 편집기 버전은 다릅니다.
- `Current/PlayForge_AI_Workflow_vNext`는 03:49 UTC AI 워크플로 설계·스키마·C++ 정책 게이트 예제입니다. v17 이후 작성되어 별도로 포함했습니다. 두 프로젝트를 연동 구현한 것은 아닙니다.
- `Current/PlayForge_UGC_Design_v5_9`는 UGC 상세 설계의 최신 확보본입니다. 플랫폼 전체 최신 정책을 확정하는 문서가 아니며 이후 사용자 결정·리뷰를 함께 확인해야 합니다.
- v16 단독 ZIP의 편집기 HTML과 TappyChicken HTML은 통합 v17 내 해당 HTML과 SHA-256이 같습니다. 따라서 최신 열람 경로는 통합본 한 곳으로 지정하고 단독본은 원본 보관 폴더에 둡니다.
- v17 내부 History는 원본 구조를 보존하기 위해 남겼으므로 `Original_Zips`와 중복 보관됩니다. 중복이 새 버전 또는 별도 구현을 의미하지 않습니다.

## 주요 출처
- [게임 저작 플랫폼 기획 대화](https://chatgpt.com/c/6afb2023-9c68-83ec-9ba6-db7a6b0b67ff)
- [최신 외부 AI 워크플로 산출물](https://chatgpt.com/c/6afb2023-9c68-83ec-9ba6-db7a6b0b67ff?messageId=05c91a68-cf27-4bb1-b627-ff9bbfaeb54e)

## 범위와 한계
- Library에서 확인 가능한 파일 기준이며 미연결 저장소, 미저장 대화 코드, 별도 로컬 작업까지 최신성을 보장하지 않습니다.
- 이름 없는 HTML 검색 결과에는 다른 게임도 섞여 있어 원본 ZIP과 동일한 프리뷰 HTML을 다시 수집하지 않았습니다.
- 설계 문서, 샘플 코드, 프런트엔드 프로토타입을 제품 완성본이나 실제 배포 서비스로 해석하면 안 됩니다.
- 원본 내부의 이전 테스트 보고서는 당시 기록입니다. 이번에 수행한 검증 결과와 구분해 읽어야 합니다.
