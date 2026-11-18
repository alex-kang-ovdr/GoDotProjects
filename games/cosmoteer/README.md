# Cosmoteer

- [게임 시작](Web/index.html)
- [플랫폼 등록 정보](game.manifest.json)
- [개발 소스](Source/Project/)
- [이전 산출물](Archive/)

공통 실행 경로는 Web/index.html입니다. 플랫폼 노출 상태는 포함이며 전체 목록은 상위 catalog.json에서 관리합니다.

실행 파일은 최신 확보 버전 3.0.0을 기준으로 구성했습니다. 게임 진행 데이터와 플랫폼 데이터는 산출물 폴더 이동과 별개로 브라우저 및 플랫폼 저장소에서 관리됩니다.

## 2026-11-18 최신 기획·분석 자료

- Cosmoteer 기획 데이터 v2를 [날짜별 개정본](ReverseDesign/Revisions/2026-11-18/)에 원본 경로 그대로 보존했습니다. 기존 역기획·참고 문서는 변경하지 않았습니다.
- 수집 ZIP: `Archive/Documents/Cosmoteer_GameData_Recovery_v2.zip`, SHA-256 `e5f7c562c9b7d3fb6c2d842a023d79cf6189097490a081a36323f5444dfd2963`.
- 문서·데이터만 갱신했습니다. 실행 게임, 통합 버전, 업데이트 날짜, 저장, 공개 상태는 바꾸지 않았으며 데이터 조회 HTML은 게임으로 등록하지 않았습니다.
- 원문의 출처·미확정·근사·제안·미구현 구분을 유지합니다. 계획을 구현 완료로 간주하지 않습니다.
- ZIP CRC, 187개 파일 SHA-256, JSON 33개 구문과 기존 파일 보존을 확인했습니다. 패키지 검증 스크립트는 재실행하지 않았으며 원작 수치 정확성을 독립 검증한 것은 아닙니다.

## PlayHub 통합판 3.1.0 (2026-11-18)

- 원본 STARFORGE v4의 원자로등급·황/탄약제조·승무원물류·저장이관을 반영했습니다. 임시 수동업데이트이며 외부배포는 하지 않았습니다.
- 최신 [게임 사용 가이드](Source/Project/README.md), [v4시스템문서](Source/Project/docs/systems/)와 [역기획 데이터v2](ReverseDesign/Revisions/2026-11-18/)를 구분합니다. 이번게임ZIP에 동봉된 analysis v1은 Source/ReferencePackage-v4에 역사자료로 보존하며 최신v2를 덮어쓰지 않습니다.
- 기존Source는 `Archive/Source/v3.0.0/`, 기존실행은 `Archive/Releases/cosmoteer-v3.0.0.zip`, 신규실행은 `Archive/Releases/cosmoteer-v3.1.0.zip`에 보존합니다.
- 입력ZIP SHA-256 `69ff59a3ba822b91ec8bf3314c96e6643170c87da82ddb251fc2aa6620190b1e`.
- 기존ID·표지·언어 어댑터·공개상태를 유지합니다. v1/v2/v3 원정을v4로 이관하며 기존전력·탄약·개량을 보존, 새황재고는0으로 시작합니다. 이전파일로 되돌아가는 역호환은 주장하지 않습니다.
- 로컬Node22에서80/80게임테스트 통과. 실제브라우저·GPU·실사용자저장과 번역완전성은 미검증입니다.
