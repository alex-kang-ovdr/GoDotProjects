# PlayHub · PlayForge · Asset Store — Google Stitch 시안 제작용 프롬프트

Google Stitch에서 **PlayHub 포털(Desktop/Mobile)**, **PlayCoin 결제**, **3D 아바타**, **오픈 에셋 스토어(11,830+)**, **PlayForge 크리에이터 허브**, **3단계 통합 오류 UI**, **Admin Live → Dev 데이터 스냅샷 이관** 시안을 일관된 디자인 시스템으로 제작하기 위한 복붙용 프롬프트 모음입니다.

> 디자인 토큰 기준: [playhub_design_system.md](file:///D:/Github/GoDotProjects-worktrees/PlayHub-Platform/docs/design/playhub_design_system.md)  
> 기준 정책:
> - **오류 UI 통일**: 일반 오류 = 하단 Toast / 복구 불가 오류 = 전체 페이지 or Modal / 입력 오류 = Inline Message
> - **빌드 분리**: Prod 시안에는 테스트·데모 UI 미포함 (Dev/Debug/Test 설정 ON 시에만 별도 표시)
> - **카피·라이선스 간결화**: 내부 기술 용어(`Tier 1/2/2-B/4`, `패키지 계약 v1`, `StoreLibraryEntry`, `editorial`, `SHA-256 불변 아티팩트` 등)를 화면 전면에 노출하지 않고, 쉬운 한국어 레이블(`자유 사용`, `출처 표기`, `외부 다운로드`) + **`ⓘ` 툴팁**으로 상세 조건을 안내합니다.

---

## 0. 공통 디자인 시스템 앵커 (모든 시안 공통 전제)

Stitch 프로젝트의 **Design System / Base Context** 또는 각 프롬프트 상단에 함께 붙여 넣어 일관성을 유지하세요.

```text
Design System: PlayHub Vibrant Modern Light Mode
- Aesthetic: Crisp, airy, high-energy light-mode browser gaming & creator platform. Let colorful game cover art and 3D assets pop against bright neutral surfaces.
- Color Palette:
  - Background / Surface: #FAF8FF
  - Card Surface (Lowest): #FFFFFF with 1px border #DFE1F4
  - Subtle Tinted Container: #F3F3FE / #EDEDF9
  - Primary Action (Electric Cobalt): #004AC6 (hover #2563EB), on-primary #FFFFFF
  - Secondary Accent: #495C95, container #DBE1FF
  - Release / Trending Accent (Terracotta): #943700 / #BC4800, container #FFDBCD
  - PlayCoin Gold: #D97706, pill background #FEF3C7, text #78350F
  - Success / Emerald: #15803D, container #DCFCE7
  - Error / Alert Crimson: #B91C1C (toast/modal border), container #FFDAD6, text #93000A
  - Primary Text: #191B23, Muted Text: #434655
- Typography:
  - Display & Section Headings: Rubik (700/600) + Noto Sans KR
  - UI Body & Labels: Plus Jakarta Sans (600/400) + Noto Sans KR
  - Codes / Counters / Prices: Red Hat Mono with tabular-nums
- Shape & Depth:
  - Pills (9999px) for chips, badges, currency pills, and toasts
  - 12px radius for buttons/inputs, 16px for cards, 20-24px for hero banners and modals
  - Tonal elevation with crisp 1px borders (#DFE1F4), minimal heavy shadows
- Copy & Information Density: Keep all labels short, plain Korean. NEVER clutter cards or headers with legal/developer jargon (no "Tier 1/2/2-B/4", "패키지 계약 v1", "SHA-256 불변 아티팩트", "editorial"). Use compact info-icon tooltips ("ⓘ") to reveal license rules and technical details on hover/click.
- Language: Korean UI labels (exact copy specified per screen). Clean, uncluttered Production UI (NO dev/debug/sandbox/demo badges unless explicitly requested in S7-Dev).
```

---

## S1. PlayHub 홈 — Desktop (1440×900)

```text
Create a Desktop (1440px wide, 1280px max-width centered container) web UI mockup for "PLAY HUB", a vibrant light-mode browser game portal in Korean.

Apply the PlayHub Vibrant Modern Light Mode palette (#FAF8FF background, #FFFFFF cards with #DFE1F4 1px borders, #004AC6 cobalt primary CTAs, #D97706 PlayCoin gold pill, Rubik + Plus Jakarta Sans + Noto Sans KR).

Layout top to bottom:
1. Sticky Top Header (white #FFFFFF, bottom border #DFE1F4):
   - Left: Blue rounded-square play logo + bold "PLAY HUB" wordmark.
   - Center: Pill search input "게임 이름이나 장르 검색" with "검색" button.
   - Right Navigation: "홈" (active pill), "게임 찾기", "내 게임", "아바타", "소셜", blue primary pill "만들기", soft emerald-tinted pill "에셋 스토어", "PlayCoin", gold coin balance pill "🪙 1,250", "계정".

2. Section 1 — "크리에이터 허브" (subtitle: "게임 제작 · 오픈 에셋"):
   - 2-column wide horizontal action cards:
     - Left card (soft cobalt tint #EEF2FF): Blue wrench icon, bold "PlayForge 바로 열기 ↗", subtitle "웹 Godot 4.7.2 에디터".
     - Right card (soft emerald tint #ECFDF5): Emerald puzzle icon, bold "에셋 스토어", subtitle "무료 오픈 에셋 11,830+".

3. Section 2 — "빠른 즉시 플레이" (subtitle: "로그인 없이 클릭 한 번으로 시작", right link "내 게임 전체보기 →"):
   - 3-column horizontal featured cards with rich 16:9 game cover art, game title ("변방의 기록 · FRONTIER COLONY", "삼국지 · 군웅의 시대", "NEXUS FRONT · 넥서스 전선"), genre subtitle, and cobalt pill button "▶ 플레이".

4. Section 3 — "장르 허브":
   - 4-column clean genre tiles (strictly 4 genre tiles ONLY, no creator/store tiles mixed in):
     - "전략 · 대전", "액션 · 난투", "아케이드", "퍼즐 · 두뇌" — each with soft tinted square icon and crisp label.

5. Section 4 — "전체 게임 라이브러리" (right count "41개 게임"):
   - Filter pills row ("전체 (41)" active cobalt, "터치 지원", "최근 업데이트", genre chips) + sort dropdown.
   - 4-column game card grid: 16:10 thumbnail, title, 1-line description, genre chip, touch/new badge, heart wishlist button, "플레이" cue.

Strict production look: clean, crisp, zero debug/demo buttons.
```

---

## S2. PlayHub 홈 — Mobile (390×844)

> **모바일 핵심 요구사항 반영**: `크리에이터 허브`를 `장르 허브`에서 분리하여 **`전체 게임 라이브러리` 바로 위(4번째 섹션)**에 배치.

```text
Create a Mobile (390x844px) responsive web UI mockup for "PLAY HUB" in Korean using the PlayHub Vibrant Modern Light Mode design system (#FAF8FF background, #FFFFFF cards, #004AC6 cobalt primary, #15803D emerald accent, Noto Sans KR).

Strict vertical section order from top to bottom:
1. Compact Mobile Header:
   - Row 1: "PLAY HUB" logo on left, PlayCoin gold pill "🪙 1,250" on right.
   - Row 2: Full-width pill search bar "게임 이름이나 장르 검색" + "검색".

2. Section 1 (Order 1) — "오늘의 PlayHub TOP 4":
   - Compact ranked list rows (1 to 4): bold rank numeral ("1"–"4"), 68x48 rounded thumbnail, game title, genre subtitle.

3. Section 2 (Order 2) — "장르 허브":
   - 2x2 grid of 4 compact horizontal genre tiles ONLY: "전략 · 대전", "액션 · 난투", "아케이드", "퍼즐 · 두뇌".

4. Section 3 (Order 3) — "빠른 즉시 플레이":
   - Full-width featured instant-play cards with 16:9 cover image, title, and "▶ 플레이" cobalt pill button.

5. Section 4 (Order 4) — "크리에이터 허브" (placed directly ABOVE the full game library):
   - Section heading "크리에이터 허브" with muted label "게임 제작 · 오픈 에셋".
   - 2-column compact side-by-side cards:
     - Left (soft blue tint): "PlayForge 바로 열기 ↗" / "웹 Godot 4.7.2 에디터"
     - Right (soft emerald tint): "에셋 스토어" / "무료 오픈 에셋 11,830+"

6. Section 5 (Order 5) — "전체 게임 라이브러리":
   - Horizontal filter chips ("전체 (41)", "터치 지원", "전략", "액션") + 2-column game cards.

7. Fixed Bottom Navigation Bar (white #FFFFFF, top border #DFE1F4):
   - 5 clean tabs with icons & labels: "홈" (active cobalt top indicator), "게임 찾기", "내 게임", "에셋 스토어", "계정".
```

---

## S3. PlayCoin 충전 상점 & 결제 확인 모달 — Desktop (1440×900)

```text
Create a Desktop (1440x900px) web UI mockup for "PlayCoin 상점" (/?view=billing) with the "PlayCoin 충전 확인" Checkout Modal open in the center over a softly dimmed backdrop.

Palette: PlayHub Light Mode (#FAF8FF page, #FFFFFF surfaces, #004AC6 cobalt hero & buttons, #D97706 / #FEF3C7 PlayCoin gold highlights, #15803D bonus green).

Background Page (visible behind modal backdrop):
- Sub-navigation pills: "🪙 PlayCoin 충전 · Pro" (active), "🎁 기프트카드 등록 (+25%)", "내 지갑", "창작자 직판 0%".
- Bold Cobalt Hero Banner: "웹 · PC 구매 시 최대 +25% 추가 PlayCoin", KRW/USD segmented toggle, "웹 브라우저 / PC · Forge" channel toggle, easy-pay badges (카카오페이, 네이버페이, 토스페이, Google Pay).
- 4-column PlayCoin SKU package grid (₩1,500 -> 110 PlayCoin +10%, ₩4,500 -> 345 PlayCoin +15%, ₩7,000 -> 600 PlayCoin +20%, ₩14,000 -> 1,250 PlayCoin +25% featured ribbon "인기 · +25% 시작").

Foreground Modal ("PlayCoin 충전 확인", 520px wide, 24px radius, white #FFFFFF):
- Header: Bold title "PlayCoin 충전 확인" + circular close "×" button.
- Summary Card (#F3F3FE rounded box):
  - "결제 금액": "₩14,000"
  - "유상 기본 (paid)": "1,000 PlayCoin"
  - "웹·PC 보너스 (+25%, bonus)": "+250 PlayCoin" (emerald #15803D bold)
  - Divider + Total row: "총 지급량": "🪙 1,250 PlayCoin" (bold cobalt/gold)
- Payment Method Selector (2x2 clean bordered cards):
  - "카카오페이" (yellow 'pay' brand chip, active selected ring)
  - "네이버페이" (green 'N' chip)
  - "토스페이" (blue 'toss' chip)
  - "국내 신용/체크카드" (dark 'CARD' chip)
- Checkbox Consent Row: "유상 원금과 채널 보너스 구분을 확인했으며, 결제 후 7일 이내 미사용 시 전액 청약철회 가능 및 법정대리인 동의 안내에 동의합니다."
- Footer Actions: Secondary "취소" button + Primary Cobalt "카카오페이로 결제 진행" button.

Clean Production UI (no sandbox/demo banners or mock buttons).
```

---

## S4. 3D 아바타 상점 & 락커 — Desktop (1440×900)

```text
Create a Desktop (1440x900px) web UI mockup for PlayHub "내 아바타 상점 & 락커" (/?view=avatar) in Korean, following the PlayHub Vibrant Modern Light Mode palette.

Layout:
1. Page Header Row:
   - Left: Title "내 아바타 상점 & 락커", subtitle "UEFN 방식 단일 아바타 · 구매·장착한 아이템은 모든 PlayForge 3D 게임에 자동 적용됩니다."
   - Right: Gold wallet pill "🪙 1,250 PlayCoin (유상 1,000 · 보너스 250)" + Cobalt primary CTA button "PlayCoin 충전 (+25%)".

2. 2-Column Workspace (Left 38% Sticky 3D Stage / Right 62% Catalog Panel):
   - Left 3D Stage Card (#FFFFFF, 20px radius):
     - Deep slate-navy 3D viewport (#142C25 to #1B1E28 subtle radial gradient) displaying a stylized friendly 3D character avatar standing on a subtle turntable ring.
     - Top-left pill badge inside viewport: "🔒 봉인 런타임 · 포지 자동 동기화".
     - Camera Preset Chips below viewport: "TPS 시점" (active), "FPS 시점", "TopDown 시점", "상반신 초상", "전신 초상".
     - Equipped Loadout Summary pills (스킨, 머리, 등, 오른손, 왼손) + 4-slot Emote Wheel bar (1~4).
   - Right Catalog Panel:
     - Top Tabs: "🛒 아바타 상점" (active) / "🎒 내 락커" + Category filter chips ("전체", "스킨", "장착물", "이모지").
     - 3-column Item Cards: rarity badge (일반/희귀/영웅/전설), item preview icon/render, title, 1-line description, "미리보기" secondary button + "🪙 300 구매" primary cobalt button.
```

---

## S5. PlayHub 오픈 에셋 스토어 (11,830+ 에셋 · 쉬운 라이선스 + 툴팁) — Desktop (1440×900)

```text
Create a Desktop (1440x900px) web UI mockup for "PlayForge 에셋 스토어" (/store/), a clean, clutter-free light-mode open game asset store integrated with PlayHub and PlayForge (Godot 4.7.2).

Palette: PlayHub Light Mode (#FAF8FF background, #FFFFFF cards, #004AC6 cobalt primary, #15803D emerald free-use badges, #191B23 dark tooltip bubbles).

Strict Copy Rule: Keep the UI super clean and approachable for regular game creators. Avoid technical/legal jargon ("Tier 1/2/2-B/4", "패키지 계약 v1", "StoreLibraryEntry", "SHA-256 불변 아티팩트", "editorial") in visible copy. Put detailed license explanations inside crisp dark popover tooltips triggered by "ⓘ" icons.

Layout:
1. Top Header Bar (clean, zero technical sub-labels):
   - Left: Blue icon + "PlayForge 에셋 스토어" + simple subtitle "오픈 게임 에셋".
   - Center: Pill search input "에셋 이름, 제작자, 태그 검색…" with subtle pill "Godot 4.7+".
   - Right: Tabs ("탐색" active, "내 라이브러리 3", "게시자") + "PLAY HUB" / "PlayForge" link buttons.
   - Row 2 Category Bar: Horizontal category pills ("전체 에셋", "아이콘", "텍스처", "3D · HDRI", "애드온", "오디오") + compact right chip "PC · Web 지원 ⓘ".

2. Left Clean Filter Sidebar (240px):
   - "필터" + "초기화" link.
   - Simple dropdowns with compact "ⓘ" help icons:
     - "카테고리"
     - "유형" ("설치 가능 에셋" / "가이드 · 외부 링크")
     - "사용 조건 ⓘ" ("자유 사용", "출처 표기", "폰트 자유 사용", "외부 다운로드")
     - "라이선스 ⓘ" ("CC0", "MIT", "CC-BY", "OFL")
     - "AI 사용 여부 ⓘ" ("전체" / "No AI (AI 미사용)")
     - "출처" + "인기 태그" chips.

3. Main Catalog Area:
   - Compact Results Bar: "총 11,830개 에셋" + subtle tooltip chip "설치 안내 ⓘ" + Sort dropdown ("인기순").
   - 3-Column Asset Grid (clean, spacious cards):
     - 16:9 preview image with single category pill.
     - Creator name, bold asset title, 1-line Korean summary, compact tags.
     - Plain license row: green pill "CC0 ⓘ", plain tag "자유 사용" (or blue "출처 표기"), purple pill "No AI".
     - SHOW ONE ACTIVE DARK TOOLTIP POPOVER (#191B23, rounded 10px, white text) floating cleanly above a hovered "CC0 ⓘ" badge reading: "CC0 (저작권 포기): 출처 표기 없이 상업적 게임 제작·수정·배포 가능".
     - Clean card actions: Secondary "상세 보기" + Primary Cobalt "라이브러리 저장".
   - Right/Bottom Detail Panel ("에셋 정보"):
     - Plain Korean specs ("라이선스", "AI 여부", "제작자", "출처", "호환 엔진"), compact "출처 표기 문구 ⓘ" box with "복사" button, collapsed disclosure "▸ 포함 파일 및 기술 정보", and primary CTA "내 라이브러리에 저장" + "공식 출처 ↗".
```

---

## S6. PlayForge Creator Hub — Desktop (1440×900)

```text
Create a Desktop (1440x900px) web UI mockup for "PlayForge Creator Hub" (/forge/OfficialGodot/), a clean light-mode web game creation studio powered by Godot 4.7.2 Web.

Palette: PlayHub Light Mode (#FAF8FF canvas, #FFFFFF topbar/sidebar/cards, #004AC6 cobalt primary, #DBE1FF soft indigo accents).

Layout:
1. Topbar (64px height, #FFFFFF):
   - Left: Cobalt square diamond icon "◆" + "PlayForge Creator Hub" + mono version pill "Godot 4.7.2 Web".
   - Center: Rounded search bar "내 프로젝트, 템플릿, 에셋 검색…".
   - Right: Secondary button "PlayHub 포털" + Primary Cobalt button "+ 새 프로젝트".

2. Left Sidebar (240px) + Main Content Area:
   - Sidebar Groups:
     - "대시보드": "홈 · 내 프로젝트" (active cobalt tint), "템플릿 라이브러리"
     - "도구 및 리소스": "창작자 제출 · Drive", "직접판매 · 수익 안내", "에셋 스토어 11,830+"
     - Bottom Promo Card: "크리에이터 직판 0%" / "Drive 아카이브 자동 백업 및 PlayHub 원클릭 웹 배포 지원"
   - Main Area:
     - 3 KPI Cards row: "내 프로젝트 (4개)" (cobalt number), "공식 템플릿 (18종)", "배포 환경 (싱글 · MO · MMO)" (amber accent).
     - Section "내 프로젝트": 3-column project cards with project name, revision mono tag ("리비전 12"), "이름 변경" / "삭제" subtle actions.
     - Section "공식 템플릿 라이브러리": filter pills ("전체", "2D", "3D", "멀티플레이", "포팅(Unity/Roblox)") + 3-column template cards with dimension badges ("3D", "2D") and asset counts.

Clean Production UI (no dev/test workspace links visible by default).
```

---

## S7. 3단계 통합 오류 UI & 계정·개발자 설정 키트 — Desktop (1440×900)

> **가장 중요한 UX 통일 가이드 시안**:  
> - **일반 오류** → 하단 Toast  
> - **복구 불가능한 오류** → 전체 페이지 오류 화면 또는 차단 Modal  
> - **입력 오류** → 해당 폼/필드 바로 아래 Inline Message  
> - **Dev·Debug·Test 빌드 전용** → 계정 화면의 `개발자 설정 · 테스트/데모 UI` 토글 (기본 OFF, ON 전환 + F5 유지)

```text
Create a clean UI Component & Pattern Specification Board (Desktop 1440x900px, PlayHub Vibrant Modern Light Mode #FAF8FF) showcasing PlayHub's Unified 3-Tier Error System and Dev-Only Test/Demo Toggle in Korean.

Divide the canvas into 4 clearly labeled specimen frames on a light #FAF8FF background:

Frame 1 — "Tier 1 · 일반 오류 (하단 Toast)":
- Shows a PlayHub portal viewport excerpt with a high-contrast crimson pill toast floating at the bottom center (border-radius 9999px, background #B91C1C, border #FCA5A5, white bold text):
  "일시적인 서버 연결 오류입니다. 잠시 후 다시 시도해 주세요." + subtle click-to-dismiss hint.

Frame 2 — "Tier 2 · 복구 불가능한 오류 (차단 Modal / 전체 페이지)":
- Left sub-example (Blocking Modal): White rounded modal (24px radius) with bold 2px crimson border (#DC2626), dark red heading "복구할 수 없는 오류가 발생했습니다", clear explanation text, mono code box "오류 코드: USER_SANCTIONED", secondary button "홈으로 이동", primary button "페이지 새로고침".
- Right sub-example (Full-Page Fatal View): Centered white surface card on full page with crimson border, code box "오류 코드: BOOTSTRAP_FAILED", and "홈으로 이동" / "페이지 새로고침" buttons.

Frame 3 — "Tier 3 · 입력 오류 (Inline Message)":
- Shows a Gift Card PIN / Email Login form card where invalid input triggers a soft rose-tinted inline alert box (#FFDAD6 background, #93000A text, 12px radius) directly below the input field:
  "기프트카드 16자리 PIN 형식이 올바르지 않습니다. 하이픈 포함 16자리를 확인해 주세요."

Frame 4 — "Dev · Debug · Test 빌드 전용 설정 (운영 빌드 완전 제외)":
- Shows the Account page card with a dashed amber border (#F59E0B) and subtle warm ivory background (#FFFDF5):
  - Dark pill badge "DEV BUILD" + status pill "ON · 테스트/데모 UI 표시 중" (amber #FEF3C7 / #92400E).
  - Heading "개발자 설정 · 테스트/데모 UI".
  - Description: "Dev · Debug · Test 빌드에서만 포함됩니다. 기본값은 OFF이며, ON 설정은 F5 새로고침 후에도 유지됩니다."
  - Toggle checkbox "테스트·데모 UI 표시" (checked) + secondary button "F5 새로고침 적용".
  - Compact header toggle pill specimen beside it: "DEV · 데모 OFF" vs "DEV · 데모 ON".
```

---

## S8. PlayHub Admin — Live → Dev 데이터 스냅샷 일괄 이관 (`/?tab=system&view=backups`)

```text
Create a Desktop (1440x900px) web UI mockup for "PlayHub Admin — 시스템 · 데이터 백업 & Live → Dev 스냅샷 이관" in Korean, matching PlayHub's clean light-mode design system (#FAF8FF background, #FFFFFF cards, #004AC6 cobalt primary, #15803D success green, #943700 amber warning).

Layout:
1. Admin Topbar & Left Navigation:
   - Brand "PLAY HUB ADMIN", active section "시스템 · 백업 & 데이터 이관", tabs ("대시보드", "게임 관리", "에셋 스토어 (11,830)", "결제 · 정산", "시스템").

2. Main Panel — "최신버전 데이터 스냅샷 일괄 내보내기 / 임포트 (Live → Dev 이관)":
   - Security Notice Strip (soft blue #EEF2FF): "보안·이력 테이블(비밀번호 해시, 세션, 감사 로그, 결제 원장) 자동 제외 · SHA-256 무결성 검증 · 임포트 전 자동 사전 백업 생성".
   - 2-Column Workflow Cards:
     - Left Card — "1. 최신버전 스냅샷 일괄 내보내기 (Export)":
       - Source environment pill "LIVE / DEV", checkbox list of included latest-version domain tables (게임 카탈로그, 번역/L10n, 스토어 패키지, 아바타/데이터스토어 등) with live row counts, Primary Cobalt CTA "최신 스냅샷 JSON 일괄 내보내기".
     - Right Card — "2. 스냅샷 임포트 (Live → Dev 이관)":
       - File upload dropzone ("스냅샷 .json 파일 선택"), Conflict Policy Radio Cards:
         - Option A: "중복 건너뛰기 (Skip)" — 기존 레코드 보존
         - Option B (selected): "중복 덮어쓰기 (Overwrite)" — 최신 스냅샷 기준으로 갱신
       - Checkbox: "Dry-Run 미리보기 먼저 실행 (DB 미반영)"
       - Action Buttons: Secondary "미리보기 검증 (Dry-Run)" + Primary Cobalt "스냅샷 임포트 실행".
   - Bottom Dry-Run / Result Summary Table:
     - Shows table name, total rows, inserted count (emerald), updated/overwritten count (amber), skipped count (muted), and SHA-256 checksum verified badge "✓ SHA-256 일치".
```

---

## Stitch 제작 권장 워크플로우

1. **순서**: `S1 (Desktop 홈)` → `S2 (Mobile 홈)` → `S3 (PlayCoin + 모달)` → `S7 (3단계 오류 UI & Dev 토글)` → `S5 (에셋 스토어)` → `S4 (아바타)` → `S6 (PlayForge)` → `S8 (Admin 이관)` 순으로 생성하면 디자인 토큰 일관성이 가장 높습니다.
2. **프롬프트 사용법**: `0. 공통 디자인 시스템 앵커`를 Stitch 프로젝트 기본 스타일 컨텍스트로 설정한 뒤, 각 화면 코드블록(`S1`~`S8`)을 그대로 복사해 생성하세요.
3. **모바일 검증 포인트**: `S2` 생성 후 `장르 허브`에 PlayForge/에셋 스토어가 섞이지 않고, `크리에이터 허브`가 `전체 게임 라이브러리` 바로 위에 별도 섹션으로 분리되었는지 확인하세요.
4. **오류 UI 검증 포인트**: `S7`에서 일반 오류(하단 크림슨 Toast), 복구 불가 오류(차단 Modal / 전체 페이지), 입력 오류(인라인 알림) 3단계가 시각적으로 명확히 구분되는지 확인하세요.
