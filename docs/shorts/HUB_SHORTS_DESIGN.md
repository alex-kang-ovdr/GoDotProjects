# PlayHub · PlayForge 게임 소개 쇼츠 (Hub-shorts) 설계 및 운영 가이드

> **브랜치 분류**: `실험 기능 (Experimental)` · **`PlayHub-Platform` 허브 트렁크 미통합** (`owners.json`: `experimental: true`, `integrateToTrunk: false`)
> - 이 브랜치(`Hub-shorts`)는 독립 실험 브랜치로 유지하며 `PlayHub-Platform`에 병합/통합하지 않습니다.
> - 실행 시에도 Dev · Debug · Test 빌드의 `dev-demo-ui` 토글 ON 상태에서만 노출되며 운영(Prod/Release) 빌드에서는 차단됩니다.

## 1. 개요

크리에이터가 **PlayForge**에서 **Google Flow / Veo** 또는 내장 **PlayForge Motion Director(FFmpeg 9:16)** 엔진을 활용해 **PlayCoin**으로 9:16 게임 소개 쇼츠 영상을 생성하고, **PlayHub 내 게임**의 대표 소개 영상 및 **PlayHub 쇼츠 피드(`/?view=shorts`)**에 즉시 등록·공개할 수 있는 통합 파이프라인입니다.

---

## 2. 아키텍처 및 데이터 흐름

```
[PlayForge Web Editor / Shorts Studio]
  ├─ Godot 에디터/PIE 캔버스 실시간 키프레임 캡처 (postMessage)
  ├─ 게임 커버 자동 래스터화 (SVG/PNG → 1280×720 PNG)
  ├─ 3컷 스토리보드 · Google Flow / Veo 프롬프트 자동 생성
  └─ 생성 요청 (POST /api/shorts/generate, Idempotency-Key + CSRF)
          │
          ▼
[PlayHub Server · hub/server/shorts/]
  ├─ Track A PlayCoin 원장 (hub/server/billing/ledger.mjs)
  │    ├─ 시작 시 reserveHold(amountCoins, sinkType='ai_shorts_generation')
  │    ├─ 성공 시 settleHold(actualCoins) — 폴백 시 차액 자동 반환
  │    └─ 실패/삭제 시 releaseHold() — 100% 자동 반환
  ├─ 영상 생성 엔진 어댑터 (Pluggable)
  │    ├─ Google Flow · Veo Fast (`veo-3.1-fast-generate-001`, 60 PC, Gemini/Vertex LRO)
  │    ├─ Google Flow · Veo 3.1 Pro (`veo-3.1-generate-001`, 120 PC, 시작/종료 키프레임 보간)
  │    ├─ PlayForge Motion Director (FFmpeg 9:16 H.264/AAC, 20 PC, 즉시 렌더링)
  │    └─ Google Flow 웹 결과물 가져오기 (MP4/WebM 직접 업로드, 0 PC)
  ├─ 미디어 저장소 (`<dataDir>/shorts-media/<shortId>/video.mp4`, `poster.jpg`)
  └─ 허브 내 게임 등록 (`POST /api/shorts/:id/publish`, 소유권 검증 + 대표 영상 원자적 고정)
          │
          ▼
[PlayHub Portal · hub/web/user/shorts.js]
  ├─ 상단 `쇼츠` 탭 (`/?view=shorts`): 9:16 세로 피드 · 좋아요 · 조회수 · 즉시 플레이 CTA
  ├─ 홈 포털: `게임 소개 쇼츠` 하이라이트 셸프 + 게임 카드 `🎬 쇼츠` 배지
  ├─ 게임 상세 (`/play/<gameId>/`): 등록된 게임 소개 쇼츠 인라인 플레이어
  └─ `만들기`(`/?view=create`) · `내 게임`(`/?view=wishlist`): 내 쇼츠 관리 대시보드
```

---

## 3. 3종 쇼츠 포맷 · 생성 엔진 및 PlayCoin 과금 정책

| 포맷 (renderMode) | 엔진 ID | 표시 이름 | 모델 / 기술 | 해상도·규격 | PlayCoin | 비고 |
|---|---|---|---|---|---:|---|
| **Type 1 · 모션그래픽 (무영상)** | `motion-graphic-web` | 모션그래픽 쇼츠 (동영상 없음) | DOM/CSS 60fps 모션 + Web Speech `ko-KR` TTS | 9:16 · 0MB · 틱톡/컷츠 UI | **10 PC** | 2줄 화이트/옐로 헤드라인 + 노랑 외곽선 나래이션 자막 + 베스트 댓글 티커 즉시 재생 |
| **Type 2 · 생성형 영상 (MP4)** | `forge-motion-ffmpeg` | PlayForge Director MP4 | FFmpeg 7.x H.264/AAC + Windows `ko-KR` TTS | 720×1280 · 9:16 · 8초 | **20 PC** | 2줄 헤드라인 · 노랑 자막 · 한국어 음성 나래이션+신스 BGM 합성 MP4 즉시 렌더링 |
| **Type 2 · 생성형 영상 (Veo)** | `google-flow-veo-fast` | Google Flow · Veo Fast | `veo-3.1-fast-generate-001` | 720p · 9:16 · 8초 + 오디오 | **60 PC** | `GEMINI_API_KEY` 또는 Vertex AI 설정 시 실호출, 미설정 시 20 PC FFmpeg 자동 폴백 |
| **Type 2 · 생성형 영상 (Veo)** | `google-flow-veo-pro` | Google Flow · Veo 3.1 Pro | `veo-3.1-generate-001` | 1080p · 9:16 · 8초 + 보간 | **120 PC** | 시작/종료 키프레임 보간 지원 |
| **Type 3 · 가로 스크롤 4컷** | `youtube-carousel-web` | 유튜브 숏츠 가로 스크롤 (4컷) | `scroll-snap-type: x mandatory` 4컷 + 컷별 TTS | 1:1 × 4컷 · 0MB | **5 PC** | `1/4`~`4/4` 배지 · 하단 도트 · 컷별 나래이션 자막/음성 · 플레이 CTA |
| **직접 촬영 영상 숏폼화** | `creator-video-shortform` | 내 영상 숏폼화 (자막·나래이션 합성) | FFmpeg 9:16 프레이밍 + 노랑 자막 + `ko-KR` TTS | 720×1280 · 9:16 · 3~15초 | **0 PC** | 직접 녹화한 MP4/WebM에 2줄 헤드라인·나래이션 자막·음성 합성 (원본음 자동 덕킹) |
| **직접 촬영 이미지 숏폼화** | `creator-images-shortform` | 내 이미지 숏폼화 (MP4/모션/N컷) | FFmpeg 슬라이드쇼 / 무영상 모션 / 가로 N컷 | 1~6장 업로드 · 3포맷 선택 | **0 PC** | 직접 찍은 스크린샷 1~6장을 MP4·무영상 모션·가로 스와이프 카드로 즉시 숏폼화 |
| **Type 2 · Flow 업로드** | `flow-import` | Google Flow 결과물 가져오기 | 직접 업로드 (최대 40MB) | 원본 유지 | **0 PC** | 자동 생성된 Flow 프롬프트 팩으로 `labs.google/flow` 제작 후 등록 |

### Google Flow / Veo 실 API · OAuth 연동 구조 및 활성화 환경 변수
- **Google Labs Flow 웹(`labs.google/fx/tools/flow`) 자체는 소비자용 구독 웹앱이라 공식 Flow OAuth 스코프나 공개 REST API가 제공되지 않습니다.**
- 공식 개발자 연동은 핵심 모델인 **Google Veo 3.1 API(`:predictLongRunning`)**로 제공되며, `hub/server/shorts/providers/veo-adapter.mjs`에 아래 두 인증 경로가 모두 구현되어 있습니다:
  - **Google Cloud Vertex AI OAuth 2.0**: `PLAYHUB_VERTEX_PROJECT` + `PLAYHUB_VERTEX_ACCESS_TOKEN` (+ 선택 `PLAYHUB_VERTEX_LOCATION=us-central1`) — 서비스 계정 또는 `gcloud auth print-access-token` OAuth 2.0 Bearer 토큰 사용
  - **Google AI Studio / Gemini API Key**: `PLAYHUB_GEMINI_API_KEY` (또는 `GEMINI_API_KEY`)
  - 모델 오버라이드: `PLAYHUB_VEO_FAST_MODEL`, `PLAYHUB_VEO_PRO_MODEL`

---

## 4. 보안·소유권 및 데이터 거버넌스

1. **소유권 검증**: `hub_publications` / `creator_submissions`에 등록된 UGC 게임은 검증된 소유자(`isVerifiedGameOwner`)만 소개 쇼츠를 등록·수정·대표 고정할 수 있으며 타 창작자는 `403 GAME_OWNERSHIP_FORBIDDEN`으로 차단됩니다. 운영 환경(`secureCookies: true`)에서는 정적 공식 카탈로그 게임의 임의 등록도 차단(`403 GAME_OWNERSHIP_REQUIRED`)됩니다.
2. **PlayCoin 이중기장 무결성**: 모든 예약·정산·반환은 `hub/server/billing/ledger.mjs`의 Zero-Sum 원장을 거칩니다.
3. **미디어 무결성 및 보안**: MP4(`ftyp`) / WebM(EBML) 시그니처 검증, 40MB 용량 제한, `^sh_[a-f0-9]{16}$` ID 검증, 디렉터리 탈출 차단, HTTP `Range`(`206 Partial Content`) 스트리밍을 적용했습니다.
4. **스냅샷 복원·비식별화 동기화**: `shorts_videos`, `shorts_likes`, `shorts_views`, `shorts_idempotency` 4개 테이블을 `restore-data.mjs`(`OPTIONAL_TABLES`)와 `sanitize-snapshot.mjs`(`SCHEMA_ALLOWLIST`, `DROP_TABLES`, 크리에이터명 HMAC 가명화)에 모두 등록했습니다.

---

## 5. `tools/worktree-ownership/owners.json` 트렁크 등록 명세

트렁크(`PlayHub-Platform`) 병합 시 아래 소유권 항목을 `owners.json`의 `branches`에 등록합니다.

```json
"Hub-shorts": {
  "role": "게임 소개 쇼츠 AI 영상 생성(Google Flow/Veo · PlayForge Motion FFmpeg · Flow 임포트) · PlayCoin Hold/Capture 과금 연동 · Hub 쇼츠 피드 및 내 게임 등록",
  "owns": [
    "docs/shorts/**",
    "hub/server/shorts/**",
    "hub/web/user/shorts.*",
    "hub/tests/shorts*.mjs",
    "forge/Tools/shorts-pipeline/**",
    "forge/OfficialGodot/shorts-*",
    "forge/Tests/playforge_shorts/**"
  ]
}
```
