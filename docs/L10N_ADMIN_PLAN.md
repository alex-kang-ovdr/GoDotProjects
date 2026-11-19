# PlayHub-Admin L10N 탭 기획안

- 작성일: 2026-11-19
- 상태: v1.0 확정 (브랜치 `PlayHub-L10N`, L0~L3 구현)
- 적용 범위: **플랫폼 사이트 전용** (`hub/web/user`, `hub/web/admin`, `hub/shared`)
- 제외 범위 (별도 관리 예정): Godot 에디터(`forge/`), 개별 게임 내부 텍스트·에셋(`games/*/Web`)
- 지원 언어(8종): `ko`(기준 원문), `en`, `ja`, `zh-CN`, `fr`, `es`, `pt-BR`, `hi`
- 확정 의사결정:
  1. **버전 관리**: 방안 C 하이브리드 (SQLite 작업공간 + 불변 스냅샷 `l10n-vN` + Git JSON/정적 Export)
  2. **AI 번역 공급자**: Gemini API + OpenAI 호환 엔드포인트(`baseUrl` 설정) + 오프라인 Mock 모두 지원
  3. **기존 사전 전환**: `hub/shared/locales/l10n-bundle.json` 기반 `LOCTEXT` Key 일괄 전환 (`data-l10n` + 런타임 `t()` + 기존 동적 문자열 하위 호환)
  4. **브랜치·범위**: `PlayHub-L10N` 분기에서 L0~L3 전체 구현

---

## 1. Admin 5번째 큰 탭 `L10N` 구조

기존 4대 탭(`시스템` / `Hub` / `Forge` / `QA`) 우측에 `L10N` 탭을 추가한다.

| 서브 메뉴 (`?tab=l10n&view=...`) | 유형 | 핵심 기능 |
|---|---|---|
| `overview` **L10N 대시보드** | 대시보드 · 지표 | 8개 언어 번역률, 미번역·AI초안·검수대기·Stale·오류 건수, 활성 릴리스 `l10n-vN`, 다국어 이미지 커버리지 |
| `strings` **스트링 테이블** | 관리 · 검수 | Unreal `LOCTEXT` 스타일 `Namespace.Key → Source + 8개 언어` 테이블, 상세 편집, 자리표시자/용어집 Lint, 일괄 승인, JSON/CSV 입출력 |
| `gather` **수집 및 검증** | 운영 · 검수 | `hub/web/user`, `hub/web/admin`, `hub/shared` 스캔 → 신규/원문변경(Stale)/미사용/충돌 검출 및 반영 |
| `ai` **AI 번역 · 상황별 프롬프트** | 운영 · 설정 | 상황별 프롬프트 프로파일, 동음이의어 분기 규칙, Gemini/OpenAI/Mock 공급자 선택, 일괄 번역 → `ai_draft` 검수 큐 |
| `glossary` **단어집 (Glossary · DNT)** | 관리 · 설정 | 표준 용어 사전(8개 언어), 번역 금지 고유명사(DNT), 금지 오역 관리 |
| `media` **다국어 이미지 관리** | 관리 · 운영 | 이미지 슬롯(`Key × 8개 언어`) 매트릭스, 매직 바이트·SVG 무해화 업로드 검증, `en→ko` Fallback, `altTextKey` 연동 |
| `releases` **버전 관리 및 배포** | 운영 · 관리 | 불변 릴리스 스냅샷(`l10n-vN`, SHA-256), 버전 전환/롤백, `l10n-bundle.json`·`locale-data.js` Export |

---

## 2. 데이터 모델 및 보안·복원 호환

SQLite 선택 테이블 7종(`hub/tools/restore-data.mjs`의 `OPTIONAL_TABLES`에 등록해 구·신 스냅샷 복원 호환 유지):
- `l10n_keys`, `l10n_translations`, `l10n_glossary`, `l10n_prompts`, `l10n_media_slots`, `l10n_media_assets`, `l10n_releases`

보안 원칙:
- AI 공급자 키(`PLAYHUB_L10N_GEMINI_API_KEY`, `PLAYHUB_L10N_OPENAI_API_KEY`)는 서버 환경변수에서만 읽고 Admin API 응답·로그에 노출하지 않는다.
- AI 번역 결과는 항상 `ai_draft`로 저장되며 Lint 통과 및 검수자 승인(`approved`) 없이는 릴리스에 포함되지 않는다.
- 다국어 이미지 업로드는 허용 포맷(`png`, `jpg`, `webp`, `svg`), 매직 바이트, 최대 용량(1 MiB), SVG 스크립트/외부 참조 차단을 강제한다.
