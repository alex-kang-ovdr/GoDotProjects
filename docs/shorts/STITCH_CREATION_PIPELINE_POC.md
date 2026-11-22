# PlayHub Shorts · 생성 과정 파이프라인 PoC 사이트 (Google Stitch 단일 설계서)

> **목적**: 완성된 쇼츠 피드(결과물 화면)가 아니라, 크리에이터가 **PlayForge에서 소스를 준비 → 대본·자막·나래이션 구성 → 생성 엔진/포맷 분기 및 PlayCoin Hold/Capture 정산 → 실시간 렌더링 파이프라인 실행·검증 → PlayHub 내 게임 등록**까지 수행하는 **생성 과정(Creation Pipeline) 중심 PoC 웹사이트**를 **Google Stitch([stitch.withgoogle.com](https://stitch.withgoogle.com))**에서 바로 시안화·프로토타이핑하기 위한 단일 통합 `.md` 파일입니다.

---

## 1. Google Stitch 원샷 마스터 프롬프트 (Desktop Web · 1440px)

아래 코드 블록 전체를 복사해 Google Stitch (**Web / Desktop 1440px**)에 붙여넣으면 **생성 과정 파이프라인 PoC 메인 대시보드**가 한 번에 생성됩니다.

```text
Design a crisp, high-craft Desktop Web application (1440px) titled "PlayHub Shorts Creation Pipeline PoC" — an interactive creator workflow and live pipeline verification workbench (NOT a consumer video feed). Focus entirely on visualizing and operating the end-to-end Shorts creation process from source input to Hub publication.

VISUAL SYSTEM (PlayHub Vibrant Modern Light + Dark Developer Telemetry):
- Page canvas: #FAF8FF, Card surfaces: #FFFFFF (18px radius, 1px solid #DFE1F4), Soft inset panels: #F3F3FE.
- Primary brand accent: PlayHub Cobalt #004AC6 (hover #003BA0, soft pill #DBE1FF).
- Secondary accents: Google 4-color dots (#4285F4, #EA4335, #FBBC04, #34A853), PlayCoin Gold pill (#FEF3C7 bg / #78350F ink / #F59E0B border), Success green (#DCFCE7 / #15803D), Free 0 PC badge (#ECFDF5 / #047857).
- Live telemetry/code panels: Dark slate #0F172A with monospace logs (#86EFAC ok, #FDE047 warn, #CBD5E1 info).
- Font family: Plus Jakarta Sans + Noto Sans KR, bold Korean headings (800 weight), tabular numerals for PlayCoin ledger & timestamps.

TOP STICKY HEADER:
- Left: 4-color dot brand mark + "PlayHub Shorts · 생성 파이프라인 PoC" + pill "소유권 검증 · PlayCoin 원장 · 3종 포맷 + 직접 숏폼화".
- Right: Gold PlayCoin wallet chip ("🪙 300 PC · 예약 0 PC"), "+300 PC 테스트 충전", "Flow/Veo API 상태: 로컬 FFmpeg+TTS 활성", "PlayHub 허브 ↗".

SECTION 1 — LIVE 6-STAGE CREATION PIPELINE STEPPER (Hero Card, subtle white-to-ice-blue gradient):
- Top bar showing transparent Google Flow / Veo 3.1 API & OAuth routing banner:
  "Veo 3.1 엔진 라우팅: Vertex AI OAuth 2.0 / Gemini API Key 미설정 → 로컬 FFmpeg + 한국어 TTS 자동 폴백(20 PC) 또는 직접 촬영 숏폼화(0 PC) 활성"
- Prominent horizontal 6-step pipeline flow connected by arrows, showing live execution status:
  1. [DONE · Green] "1. 크리에이터 인증 · 지갑" — "데모 창작자 · 가용 300 PC"
  2. [DONE · Green] "2. 소스 · 대본 구성" — "아이언 타이드 · 5-Beat 나래이션"
  3. [ACTIVE · Cobalt Blue Glow] "3. PlayCoin Hold 예약" — "20 PC 안전 예약 (Hold)"
  4. [RUNNING · Progress 68%] "4. 엔진 렌더 · TTS 합성" — "FFmpeg 9:16 + 한국어 음성 믹싱"
  5. [PENDING] "5. 무결성 · Range 206 검증" — "ftyp 시그니처 · 720×1280 확인"
  6. [PENDING] "6. 허브 내 게임 등록" — "소유권 체크 → 대표 쇼츠 고정"
- Two clear action buttons below stepper:
  - Primary Cobalt CTA: "⚡ 전체 6단계 파이프라인 실측 실행"
  - Outlined Gold CTA: "🧪 5대 게임 일괄 파이프라인 검증"

SECTION 2 — TWO-COLUMN CREATION WORKBENCH (Left 60% Interactive Pipeline Builder | Right 40% Live Execution Monitor & Ledger Trace):

LEFT COLUMN — 3 STEP BUILDER CARDS:
- Mode Switcher Tabs at top of left column:
  - Tab A (Active): "📹 직접 촬영 영상·이미지 숏폼화 [무료 0 PC]"
  - Tab B: "✨ AI 쇼츠 생성 파이프라인 [PlayCoin Hold/Capture]"

- Card 1 ("STEP 1 · 대상 게임 연결 & 소스 준비"):
  - Target game selector with ownership verification pill ("아이언 타이드 · 해전 전술" + badge "✅ 소유권 검증됨").
  - Dual source toggle: "🎬 직접 녹화 영상 (MP4/WebM · 최대 40MB)" | "🖼️ 직접 촬영 이미지 (1~6장)".
  - Dashed upload dropzone (#F3F3FE) showing 4 uploaded gameplay thumbnails ("컷 1" ~ "컷 4") with "+ Godot 에디터 화면 캡처", "+ 파일 업로드" buttons.
  - Video/Framing controls: "9:16 중앙 배치 + 블러 배경" dropdown, trim "0.0s ~ 8.0s", checkbox "원본 게임 소리 자동 덕킹 (36%) + 한국어 TTS 합성".

- Card 2 ("STEP 2 · 헤드라인 · 나래이션 자막 · 프롬프트 파이프라인"):
  - Two inputs side by side:
    - "상단 헤드라인 1줄 (화이트)": "전함 3척에 포위당한 순양함이"
    - "상단 헤드라인 2줄 (노랑 #FFE600)": "일제사격 한 방으로 역전하는 법"
  - 5-Beat timed narration script editor showing editable rows with timestamps (0.0s, 1.5s, 3.1s, 4.8s, 6.4s) + buttons "✨ 게임 대본 자동 생성", "🔊 한국어 TTS 미리듣기".
  - Collapsible dark code drawer: "Google Flow (Veo 3.1) 자동 생성 프롬프트 & 3-Beat 씬 명세" with "📋 복사" & "📄 .md 팩 내보내기".

- Card 3 ("STEP 3 · 출력 포맷 & 엔진 라우팅 · 결제 정책"):
  - 4 selectable pipeline route cards in a 2x2 grid:
    1) "✨ 무영상 모션그래픽" — "0MB · DOM 60fps + TTS" — "10 PC (내 이미지 0 PC)"
    2) "🎬 생성형 9:16 MP4 (선택됨)" — "FFmpeg + 한국어 TTS / Veo 3.1" — "20 PC (Veo 60·120 PC)"
    3) "🖼️ 유튜브 가로 4컷 카드" — "0MB · 1/4~4/4 스와이프" — "5 PC (내 이미지 0 PC)"
    4) "📹 내 영상 숏폼화" — "업로드 MP4 + 자막·TTS 합성" — "무료 0 PC"
  - Safe Hold/Capture info bar: "시작 시 PlayCoin 예약(Hold) → 완료 시 실제 엔진 비용만 정산(Settle) · 폴백 시 차액 자동 반환 · 실패 시 100% 환불".

RIGHT COLUMN — LIVE PIPELINE EXECUTION MONITOR & VERIFICATION PANEL (NO giant consumer reel feed — compact technical verification cards):
- Card A ("실시간 렌더 작업 모니터"):
  - Active job header ("Job #sh_646313be · 진행 중 68%"), animated gradient progress bar, sub-task checklist:
    - [✓] 키프레임/커버 래스터화 (1280×720)
    - [✓] Windows SAPI 한국어 TTS WAV 합성 (Microsoft Heami)
    - [⟳] FFmpeg 9:16 필터그래프 (2줄 헤드라인 + 노랑 외곽선 자막 + 오디오 믹스)
    - [ ] MP4 ftyp 시그니처 & ffprobe 720×1280 검증
    - [ ] poster.jpg 썸네일 추출
  - Compact side-by-side "PlayCoin 원장 상태 변화" visual strip:
    "이전 가용 300 PC" → "예약(Hold) 20 PC" → "정산(Settle) 20 PC" → "최종 가용 280 PC (Zero-Sum OK)".

- Card B ("허브 내 게임 등록 게이트"):
  - Compact publish readiness controls: Target game lock, Visibility ("전체 공개" / "게임 상세 전용"), "⭐ 대표 소개 쇼츠 고정" switch, CTA button "🚀 검증 완료 · 허브 내 게임에 등록", and post-publish verification badges ("by-game API: OK", "games-summary: OK", "HTTP 206 Range: OK").

- Card C ("실시간 API · PlayCoin 원장 트레이스 콘솔"):
  - Dark #0F172A terminal log showing timestamped real HTTP calls:
    "[13:20:01] POST /api/shorts/storyboard → 200 OK (5 narration beats)"
    "[13:20:02] POST /api/shorts/generate → 202 Accepted | Hold=20 PC"
    "[13:20:06] GET /api/shorts/sh_646313be → 100% ready (332 KB, TTS=true)"
    "[13:20:07] POST /api/shorts/sh_646313be/publish → 200 OK (isPrimary=true)"
    "[13:20:07] GET /api/shorts/sh_646313be/video [Range: bytes=0-1023] → 206 Partial Content"
```

---

## 2. 파이프라인 전체 흐름도 (Architecture & Data Flow)

```text
[STEP 1: 소스 입력 & 게임 소유권 확인]
   ├─ 경로 A (AI 생성 · PlayCoin)
   │    └─ 내 게임 선택 → Godot 에디터 캔버스 캡처 / 커버 자동 래스터화
   └─ 경로 B (직접 촬영 숏폼화 · 무료 0 PC)
        ├─ 직접 녹화 영상 업로드 (MP4/WebM, 최대 40MB)
        └─ 직접 촬영 스크린샷 업로드 (PNG/JPG/WebP, 1~6장)
                         │
                         ▼
[STEP 2: 스토리보드 · 자막 · 나래이션 · Flow 프롬프트 구성]
   ├─ 상단 2줄 훅 헤드라인 (1줄 화이트 / 2줄 #FFE600)
   ├─ 5-Beat 한국어 나래이션 대본 (줄바꿈 자동 시간 분할 + 브라우저 TTS 미리듣기)
   ├─ 유튜브 가로 4컷 대본 (1/4~4/4 컷별 헤드라인·캡션·나래이션)
   └─ Google Flow / Veo 3.1 마스터 + 씬별 확장 프롬프트 (.md 내보내기)
                         │
                         ▼
[STEP 3: 엔진 라우팅 & Track A PlayCoin Hold/Capture]
   ├─ Type 1 · motion-graphic-web      (10 PC / 내 이미지 0 PC) → JSON + 슬라이드 즉시 완료 (0MB)
   ├─ Type 2 · forge-motion-ffmpeg     (20 PC)                  → FFmpeg 9:16 + 한국어 TTS + BGM MP4
   ├─ Type 2 · google-flow-veo-fast/pro(60 / 120 PC)            → Vertex AI OAuth 2.0 / Gemini API LRO
   │           └─ 키 미설정·오류 시 allowFallback=true → FFmpeg 20 PC 자동 전환 + 차액 자동 환불
   ├─ Type 3 · youtube-carousel-web    (5 PC / 내 이미지 0 PC)  → 4~6컷 가로 스와이프 카드 즉시 완료 (0MB)
   └─ Type 4 · creator-video-shortform (0 PC)                   → 촬영 영상 fit-blur/crop-fill + 자막·TTS 합성
                         │
                         ▼
[STEP 4: 비동기 작업 큐 실행 & 무결성 검증]
   ├─ 진행률 폴링 (GET /api/shorts/:id → queued → rendering 0..98% → ready 100%)
   ├─ 성공 시 settleHold(actualCoins) / 실패 시 releaseHold() 100% 자동 반환
   └─ 검증: MP4 ftyp 시그니처 · ffprobe(720×1280) · poster.jpg 추출 · HTTP 206 Range 스트리밍
                         │
                         ▼
[STEP 5: 허브 내 게임 등록 & 연동 검증]
   └─ POST /api/shorts/:id/publish (isVerifiedGameOwner 검증 + 대표 쇼츠 원자적 지정)
        ├─ GET /api/shorts/by-game/:gameId  (byFormat 3종 공존 확인)
        ├─ GET /api/shorts?format=...       (포맷 필터 노출 확인)
        └─ GET /api/shorts/games-summary    (게임 카드 배지 연동 확인)
```

---

## 3. 단계별 멀티 스크린 Stitch 추가 프롬프트 (선택 확장용)

단일 대시보드 외에 **생성 과정 4개 단계를 개별 스텝 화면(위저드 형태)**으로 쪼개서 시안을 뽑고 싶을 때 아래 4개 프롬프트를 순서대로 사용하세요.

### Step Screen A · 소스 선택 & 직접 촬영 업로드 (`STEP 1 / 4`)
```text
Create Step 1 of 4 in the "PlayHub Shorts Creation Pipeline" desktop wizard (1440px, #FAF8FF canvas, #004AC6 cobalt).
Show a clean 4-step top progress bar ("1. 소스 선택" active → "2. 자막·나래이션" → "3. 엔진·결제" → "4. 렌더·허브 등록").
Present two large side-by-side selectable pathway cards:
- Left Card (Green badge "무료 0 PC · 추천"): "📹 직접 찍은 영상·이미지 숏폼화" with drag-and-drop file upload zone (MP4/WebM or 1-6 screenshots), framing preview toggle ("가로 영상 중앙+블러" vs "9:16 꽉 채우기"), and audio ducking toggle.
- Right Card (Gold badge "PlayCoin · 5~120 PC"): "✨ AI 쇼츠 생성 (PlayForge · Google Flow)" with game selector, Godot Editor live canvas capture button, and Google Playground 3D diorama style chips.
Footer with selected game ownership badge ("✅ 내 퍼블리시 게임 확인됨") and "다음 단계: 자막·나래이션 편집 →" button.
```

### Step Screen B · 자막 · 나래이션 · 프롬프트 타임라인 에디터 (`STEP 2 / 4`)
```text
Create Step 2 of 4 ("자막 · 나래이션 · 프롬프트 구성") in the PlayHub Shorts Creation Pipeline desktop wizard (1440px, light #FAF8FF theme).
- Left panel: 2-line hook headline editor with live mini typography swatch (Line 1 white on black, Line 2 electric yellow #FFE600 on black), interactive 5-beat Korean narration timeline table (editable start/end seconds + text + emphasis word + "🔊 한국어 TTS 미리듣기" button), and 4-cut horizontal card caption editor.
- Right panel: Auto-composed 3-Beat Google Playground storyboard cards (0-2.2s Hook, 2.2-5.8s Action, 5.8-8.0s CTA) + dark code block displaying the generated Google Flow (Veo 3.1) prompt with "📋 복사" and "📄 제작 팩(.md) 받기" buttons.
```

### Step Screen C · 엔진 라우팅 & PlayCoin Hold/Capture 안전 결제 (`STEP 3 / 4`)
```text
Create Step 3 of 4 ("엔진 라우팅 & PlayCoin 안전 예약") in the PlayHub Shorts Creation Pipeline desktop wizard (1440px, light #FAF8FF theme).
- Show a clean visual decision matrix comparing all 4 output pipelines (무영상 모션 10 PC, 생성형 MP4 20 PC, Google Flow Veo 3.1 60/120 PC, 유튜브 가로 4컷 5 PC, 직접 촬영 숏폼 0 PC) with API health badges ("FFmpeg 7.0 + 한국어 TTS 준비됨", "Veo API: 키 미설정 · 자동 폴백 지원").
- Right sticky checkout summary card showing Track A PlayCoin Double-Entry Hold/Capture flow diagram:
  "현재 잔액 300 PC" → "예약(Hold) 20 PC" → "완성 시 정산(Settle) / 실패 시 100% 자동 반환", with idempotency key preview and primary button "⚡ 파이프라인 실행 시작".
```

### Step Screen D · 실시간 렌더 모니터링 · 검증 로그 · 허브 등록 (`STEP 4 / 4`)
```text
Create Step 4 of 4 ("실시간 파이프라인 실행 · 검증 · 허브 등록") in the PlayHub Shorts Creation Pipeline desktop wizard (1440px, light #FAF8FF theme + dark #0F172A telemetry console).
- Top: Real-time pipeline progress bar (100% 완료) with 5 technical verification chips ("✅ TTS WAV 합성", "✅ H.264 720×1280", "✅ ftyp 무결성", "✅ HTTP 206 Range", "✅ PlayCoin Zero-Sum 정산").
- Left: Live dark API & Ledger trace console showing exact HTTP requests/responses and wallet delta (300 → 280 PC).
- Right: Hub My Game Registration card with ownership verification badge, visibility dropdown, "⭐ 대표 소개 쇼츠 고정" toggle, and post-publish deep links ("허브 게임 상세 확인 ↗", "MP4 다운로드").
```

---

## 4. 디자인 토큰 & 엔진·API 계약 요약 (개발/PoC 구현 연동 기준)

### 컬러 & 타이포 토큰
| 용도 | 토큰 / 값 |
|---|---|
| 페이지 배경 / 카드 / 보조 영역 | `#FAF8FF` / `#FFFFFF` / `#F3F3FE` |
| 테두리 (기본 / 강조) | `#DFE1F4` / `#C3C6D7` |
| 본문 텍스트 (주 / 보조) | `#191B23` / `#434655` |
| 브랜드 코발트 (CTA·활성 스텝) | `#004AC6` (`#DBE1FF` 소프트 배경) |
| PlayCoin 골드 / 무료 `0 PC` 그린 | `#FEF3C7`·`#78350F` / `#DCFCE7`·`#15803D` |
| 텔레메트리 로그 콘솔 | 배경 `#0F172A`, 성공 `#86EFAC`, 경고 `#FDE047`, 오류 `#FCA5A5` |
| 폰트 | `Plus Jakarta Sans`, `Noto Sans KR`, `ui-monospace` (로그/프롬프트) |

### 생성 파이프라인 핵심 API 엔드포인트
| 단계 | Method & Endpoint | 핵심 역할 |
|---|---|---|
| 1. 환경·엔진 조회 | `GET /api/shorts/config` | 엔진 8종·포맷 3종·FFmpeg/Veo(Vertex OAuth / Gemini Key) 연동 상태 반환 |
| 2. 내 게임·지갑 조회 | `GET /api/shorts/creator/games` | 소유권 검증 가능한 게임 목록 + Track A PlayCoin 지갑(`available`, `reserved`) |
| 3. 대본·프롬프트 생성 | `POST /api/shorts/storyboard` | 2줄 헤드라인 · 5-Beat 나래이션 · 4컷 대본 · Google Flow(Veo 3.1) 프롬프트 생성 |
| 4A. AI 쇼츠 생성 | `POST /api/shorts/generate` | `Idempotency-Key` + PlayCoin `reserveHold` → 비동기 렌더 → `settleHold` / `releaseHold` |
| 4B. 직접 촬영 숏폼화 | `POST /api/shorts/shortform` | 업로드 MP4/WebM 또는 이미지 1~6장 → 자막·한국어 TTS 합성 (`0 PC`) |
| 5. 상태 폴링·슬라이드 | `GET /api/shorts/:id`, `GET /api/shorts/:id/slide/:idx` | 실시간 진행률(`0~100%`) 폴링 및 업로드 이미지 서빙 |
| 6. 허브 등록·검증 | `POST /api/shorts/:id/publish`, `GET /api/shorts/by-game/:gameId` | 소유권 검증 후 허브 내 게임 등록 + `byFormat` 3종 공존 및 `Range 206` 스트리밍 확인 |

### Google Flow / Veo OAuth 및 폴백 정책 (파이프라인 배너 표시 기준)
- **Google Labs Flow 웹(`labs.google/fx/tools/flow`)**: 소비자 구독형 앱으로 공식 Flow OAuth·공개 REST API 미제공 → 프롬프트 팩 복사 + `flow-import`(`0 PC`)로 연동.
- **공식 Veo 3.1 API 연동**: `PLAYHUB_VERTEX_PROJECT` + `PLAYHUB_VERTEX_ACCESS_TOKEN`(Google Cloud Vertex AI **OAuth 2.0**) 또는 `PLAYHUB_GEMINI_API_KEY`(Gemini API Key) 설정 시 즉시 활성화.
- **미설정 시 자동 폴백**: `allowFallback: true` 기본값으로 로컬 FFmpeg 9:16 + Windows 한국어 TTS(`20 PC`)로 자동 전환하고, 예약된 차액(`40` 또는 `100 PC`)은 원장에서 즉시 자동 반환.
