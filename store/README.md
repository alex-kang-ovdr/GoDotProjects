# PlayForge Store (독립 웹·API·Publisher 계층)

`PlayHub-Store` 브랜치가 소유하는 PlayForge Store 독립 웹·API·게시자 작업 영역입니다. 설계 근거는 [STORE_UNITY_INTEGRATION_RESEARCH.md](../docs/STORE_UNITY_INTEGRATION_RESEARCH.md)에 있습니다.

## 서비스 경계와 역할 분담

| 표면 | 담당 워크트리 | 주요 책임 | 비소유(차단) 경계 |
|---|---|---|---|
| **Store 웹 · API · Publisher** | `PlayHub-Store` (`store/**`) | PC/모바일 탐색, 일반 콘텐츠(`editorial`), 내 라이브러리(`StoreLibraryEntry`), 불변 패키지 계약, 게시자 초안·제출 | Hub 게임 배포물 수정, Forge 원본 프로젝트 자동 편집 |
| **Godot Store 도크 Addon** | `Forge-AssetStore` (`forge/Godot/addons/playforge_asset_store/**`) | 좌/우/하단 기본 도크, 외부 브라우저 Store 열기, 내 라이브러리 조회, 6단계 검토 후 선택 프로젝트 적용 | 중앙 Store 탭, 중앙 화면 분할, Store 웹 iframe 내장 |
| **Store Admin (6번째 탭)** | `PlayHub-Admin` (`hub/web/admin/store-views.js`, `hub/server/store-admin.mjs`) | 검수, 승인/거절, 공개/숨김, 신고 처리, 감사 로그 (`?tab=store`) | Hub/Forge 관리자 권한 자동 상속 금지, 기존 Hub 게임 자동 삭제/재빌드 금지 |
| **Hub 단일 신원 (SSO)** | `PlayHub-Platform` (`/internal/session/verify`) | 단일 사용자 신원 확인 (Store·Publisher 전용 회원가입·비밀번호 없음) | Store Admin 권한 부여는 별도 역할 확인 |

## 웹 ↔ Godot 도크 비동기 연동 흐름

1. 사용자가 Hub 로그인 상태로 **Store 웹**(PC/모바일)에서 패키지를 선택해 **내 라이브러리에 저장**(`StoreLibraryEntry`)합니다. (저장만으로 사용 권한 생성이나 프로젝트 파일 변경이 발생하지 않음)
2. 사용자가 Godot 에디터(설치형 또는 웹 에디터)의 **Store 도크**에서 **새로고침**을 눌러 동일 Hub 신원의 라이브러리를 조회합니다.
3. 도크는 `store/schemas/package-contract.schema.json`의 불변 릴리스(`release_id`, `artifact_digest`, `dependency_manifest_hash`)를 고정해 준비 영역에 내려받고, 파일·충돌 검토 후 **선택한 프로젝트에만 적용**(`installation_record`)합니다.
4. 일반 게시글·가이드(`release_kind: "editorial"`)에는 설치 버튼을 노출하지 않으며 빈 패키지를 생성하지 않습니다.
