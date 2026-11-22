# PlayHub Cloudflare Edge CDN Front-Door

Cloud Run의 북미 네트워크 이그레스 무료 구간(`1 GB/월`, 초과 시 `\$0.12/GB`)을 보호하기 위해, PlayHub Hub 앞단에 Cloudflare Free CDN(무제한 대역폭) + Workers(100,000 req/일 무료)를 배치하는 배포 템플릿입니다.

## 캐시 정책 (Origin `CDN-Cache-Control` 준수)

| 경로 | Origin `CDN-Cache-Control` | Edge 동작 | 기대 이그레스 절감 |
| :--- | :--- | :--- | :--- |
| `/runtime/godot/*` (`godot.wasm.gz`, `godot.js.gz`) | `public, max-age=31536000, immutable` | 쿠키 무관 1년 불변 캐시 | **~99.9%** (9.7 MB WASM 최초 1회만 Origin 조회) |
| `/play-ugc/<slug>/<releaseId>/*.pck` 등 비-HTML 자산 | `public, max-age=31536000, immutable` | 불변 CAS 자산 1년 캐시 | **~99%** |
| `/play-ugc/<slug>/<releaseId>/index.html` | `no-store` | 항상 Origin 검증 (CAS v1→v2 즉시 `404` 전환 보장) | 보안·CAS 일관성 유지 |
| Hub 정적 JS/CSS/이미지 (`locale-data.js`, `app.js` 등) | `public, max-age=86400, stale-while-revalidate=604800` | 24시간 Edge 캐시 | **~98%** |
| 익명 공개 카탈로그 (`/api/games`, `/api/avatar/catalog`, `/api/store/catalog`) | `public, max-age=300~3600, stale-while-revalidate=...` | `Cookie`/`Authorization` 없을 때만 캐시 | **~95%** |
| 인증 요청(`Cookie` 포함), `/forge/*`, `/api/creator/*`, `/api/auth/*`, `/api/billing/*`, `/api/admin/*` | `no-store` | **무조건 BYPASS** (개인 세션·라이브러리 유출 원천 차단) | 0% (보안 우선) |

## 배포 방법

1. `wrangler.toml.example`을 `wrangler.toml`로 복사하고 `ORIGIN_URL`을 Dev/Live Cloud Run Hub URL로 설정합니다.
2. Cloudflare 로그인 후 배포:
   ```bash
   npx wrangler deploy
   ```
3. 커스텀 도메인(예: `playhub.example.com`)을 Worker Route에 연결하고, Cloud Run Hub 환경변수 `PLAYHUB_EXTRA_ORIGINS`에 해당 도메인을 추가합니다.
4. 응답 헤더 `X-PlayHub-Edge-Cache: HIT`로 Edge 캐시 적중 여부를 확인합니다.
