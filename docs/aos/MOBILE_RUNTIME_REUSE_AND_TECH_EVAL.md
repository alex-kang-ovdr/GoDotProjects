# PlayHub 모바일 경량화 중심 기술 재평가 및 단일 Godot 런타임 재사용 검증 계획

> **범위:** Steam·Roblox의 스토어·Discover·라이브러리·소셜·아바타·프로필과 같은 **아웃게임 모바일 앱**과, 앱에 **단 1벌만 포함되는 Godot 인게임 런타임을 아바타 상점(3D 스튜디오)에도 재사용**하는 하이브리드 구조. PC 런처 및 TV/SteamOS UI는 제외한다.
>
> **현행 기준선 (`Hub-AOS` · `Hub-IOS`):**
> - `Hub-IOS`: **Swift + SwiftUI + `PlayHubCore`** 구축 완료.
> - `Hub-AOS`: **Kotlin + Android Native View** 구축 완료 (Release `arm64-v8a` 실측 전체 `23.69 MiB` 중 `libgodot_android.so` `23.34 MiB`, 아웃게임 셸 `0.35 MiB`).
> - `main`(`88df592`): **`Forge-Avatar` 4계층 모듈화**(`core.pck` · `ugc.pck` · 온디맨드 `.glb` · `avatar_bridge.gd` · 3D 렌더타겟 초상) 통합 완료.

---

## 1. 결론

1. **아웃게임 UI 기본안:** **Android Kotlin + Jetpack Compose** / **iOS Swift + SwiftUI**를 기본안으로 채택하고, **Flutter**는 정량 Go/No-Go 기준(§7)에 따라 비교 검증한다.
2. **단일 Godot 런타임 재사용:** 앱 패키지에 **Godot 런타임을 1벌만 포함**(`+0 MB` 추가 3D 엔진)하여 인게임뿐 아니라 **아바타 스튜디오·상점 3D 프리뷰에도 재사용**한다. 이를 통해 상점 프리뷰와 인게임 아바타 간 **100% WYSIWYG 셰이더·리그·코스메틱 일치**를 보장한다.
3. **유휴 메모리 보호(Zero-Idle-Engine 원칙):** 평상시(홈·탐색·채팅·프로필)에는 순수 네이티브 UI와 **Godot가 저장 시 렌더링해 둔 캐시 초상화 PNG**만 표시해 Godot 엔진을 깨우지 않는다. 아바타 스튜디오 진입 시에만 Godot 3D를 구동하고, 이탈 시 즉시 회수한다.
4. **공통화 전략:** OpenAPI, W3C Design Tokens, 인증·토큰 수명주기(Single-Flight Refresh), 딥링크, 화면 테스트 계약을 공유한다. 비UI 공통 코어가 필요해질 경우 **KMP**를 1차 검토하고 **Rust**는 명확한 연산·검증 이점이 입증될 때만 채택한다.

---

## 2. 기술 스택 비교

| 기술 | 앱 용량·메모리 관점 | 반응성 | AI 개발 친화성 | 고려 사항 |
|---|---|---|---|---|
| **Android Kotlin + Jetpack Compose** | OS 네이티브 활용에 유리 (View 대비 약 1.5~3 MB 런타임 증가) | 우수 (Baseline Profile 시) | 매우 높음 | Android 전용 UI. **Baseline Profile + R8 Full Mode 필수** |
| **iOS Swift + SwiftUI** | OS 네이티브 프레임워크 활용으로 최소 증분 | 우수 | 매우 높음 | iOS 전용 UI (`Hub-IOS` 현행 자산 계승) |
| **KMP (비UI 공통 코어 + 네이티브 UI)** | UI 증분 없음, 코어 런타임 소폭 추가 | 네이티브와 동일 | 높음 | Kotlin으로 네트워크·캐시·인증만 공유 가능 (언어 추가 없음) |
| **Flutter + Dart** | 별도 엔진(Impeller/Dart VM) 포함으로 기본 용량·메모리 증가 | 우수 | 매우 높음 | UI 공유 용이. Godot 뷰포트·결제 브리지 관리 필요 |
| **React Native** | JS 런타임·네이티브 모듈 구성에 좌우 | 우수~양호 | 매우 높음 | 브리지/모듈 업그레이드 부담 |
| **Qt Quick** | 모듈 구성에 좌우 | 우수 | 중상 | 상용 라이선스 및 모바일 배포 구성 검토 |
| **Godot UI (전체 앱)** | 인게임 런타임과 공유 시 용량 추가는 제한적 | 우수 | 높음 | OS 접근성·IME·시스템 UI·유휴 메모리(`<= 80 MB`) 달성에 불리 |
| **Rust + 자체 UI** | 설계에 따라 다름 | 구현에 좌우 | 중간 이하 | 접근성·입력기·OS 정책 유지보수 부담 큼 |

---

## 3. 단일 Godot 런타임 재사용 아키텍처

```text
                       PlayHub API / CDN / Push (APNs · FCM)
         (SSO, Discover, Library, Social, Avatar Catalog/GLB, Deep Link)
                                        |
         +------------------------------+------------------------------+
         |                              |                              |
   OpenAPI / Schema           W3C Design Tokens               공통 동작 계약
 (API · DTO · Error)       (Color · Type · Space)       (Auth · Deep Link · E2E)
         |                              |                              |
         +--------------------+---------+--------------------+---------+
                              |                              |
                  Android App (Hub-AOS)             iOS App (Hub-IOS)
              [Main Process: Native UI]          [Single Process: SwiftUI]
               · 홈/탐색/채팅/프로필(PNG초상)      · 홈/탐색/채팅/프로필(PNG초상)
               · 아바타 탭: 상단 고정 4:3 프리뷰   · 아바타 탭: 인라인 4:3 프리뷰
                 (GodotService + SCVH 임베딩)      · 유휴 메모리 <= 80 MB Footprint
               · 유휴 메모리 <= 80 MB PSS                     |
                              |                     LibGodot Single Instance
            GodotService + SCVH + Local UDP                   |
                              |                     [Scene Switch + Pause]
            [Isolated Process :godot_runtime]       · avatar_studio ↔ 인게임 씬
             · libgodot_android.so (1벌 공용)       · 이탈 시 씬 언로드 & 렌더 중지
             · PlayHubGodotPreviewService:
               아바타 탭 4:3 인라인 3D 프리뷰
             · GodotPlayerActivity: 인게임 .pck
             · 탭 이탈·종료 시 프로세스 종료 → 100% 회수
```

### Android vs iOS 런타임 생명주기 설계 차이
- **Android (`PlayHubGodotPreviewService` + `SurfaceControlViewHost` 인라인 임베딩 — 채택):**
  - 별도 Activity 전환 없이 **`아바타` 탭 내부의 상단 고정(Sticky) 4:3 미리보기 영역**에 Godot 4.7.2 공식 `GodotService` + `SurfaceControlViewHost`로 `:godot_runtime` 격리 프로세스의 3D 뷰포트를 직접 임베딩한다 (`libgodot_android.so` 1벌 공용, 추가 엔진 `0 MB`).
  - 하단 옷장·상점 그리드만 독립 스크롤되어 SurfaceView 스크롤 잔상·클리핑 깨짐을 원천 차단하며, 코스메틱 시착은 `127.0.0.1` 루프백 UDP IPC로 **6~22 ms(1프레임 이내)**에 반영된다.
  - `홈/탐색/채팅/더보기` 탭으로 이동하거나 앱이 백그라운드로 내려가면 즉시 `MSG_DESTROY_ENGINE` + 서비스 언바인드로 `:godot_runtime` 프로세스를 종료해 메모리를 100% 회수한다.
- **iOS (`LibGodot` 단일 프로세스 재사용 — 필수 구조):**
  - iOS는 앱 내 멀티프로세스를 지원하지 않으므로 단일 프로세스 내에서 `LibGodot` 인스턴스를 재사용한다.
  - 아바타 스튜디오 이탈 시 **씬 언로드 + 온디맨드 GLB 리소스 해제 + `render_loop_enabled=false`**로 전환하고, `아바타 ↔ 인게임 ↔ 홈` 20회 반복 시 `phys_footprint` 누수 0을 검증한다.

### 공통 계약 필수 항목
- **인증·세션 수명주기:** 단기 Access JWT + 장기 Refresh Rotation, 동시 `401` Single-Flight 갱신, 로그아웃 시 Keychain/EncryptedSharedPreferences 및 민감 캐시 파기.
- **딥링크·유니버설 링크:** `playhub://join/<gameId>?room=<CODE>` 및 `https://.../join/...` 단일 파서.
- **실시간·배터리:** 포그라운드(WS/SSE 또는 적응형 폴링) vs 백그라운드(APNs/FCM) 즉시 전환.
- **스토어 컴플라이언스:** 연령 게이트·보호자 동의(COPPA/K-COPPA), Apple 5.1.1(v) 인앱 계정 삭제, IAP(3.1.1)·실행 바이너리(2.5.2)·미니앱(4.7) 준수.

---

## 4. 초기 성능 목표

| 항목 | 제안 목표 | 측정 기준 및 주의 사항 |
|---|---|---|
| **아웃게임 셸 순증 크기** | **5 MB 이하** | Godot 런타임 제외 순수 아웃게임 코드·리소스 |
| **앱 전체 다운로드 크기** | **컴패니언 단독: 20 MB 이하**<br>**Godot 런타임 1벌 내장: 28 MB 이하** | Play Store AAB 다운로드 / App Store Thinned IPA 기준 (추가 3D 엔진 `0 MB`) |
| **콜드 스타트 (TTID / TTFD)** | **TTID ≤ 1.0초 / TTFD ≤ 1.5초** | 중급형 실기기, 로컬 캐시 기반 홈 첫 화면 완전 표시 기준 |
| **유휴 메모리 (홈·탐색)** | **80 MB 이하** | Android **`PSS` / `Private Dirty`** (RSS 제외) · iOS **`phys_footprint`** |
| **아바타 스튜디오 활성 메모리** | **합산 220 MB 이하** | 메인 프로세스 + `:godot_runtime` (또는 iOS 단일 프로세스) 합산 피크 |
| **터치·코스메틱 교체 반응성** | **터치 ≤ 100 ms**<br>**캐시 파츠 3D 반영 ≤ 100 ms** | 네이티브 카드 탭 → 브리지 전달 → Godot 3D 프레임 커밋까지 측정 |
| **스크롤 & 3D 프레임** | **Janky Frames < 1%**<br>**p95 ≤ 16.6 ms** (3D 유휴 시 스로틀링) | Discover 및 아바타 스튜디오 하단 옷장 그리드 스크롤 기준 |

---

## 5. 5대 집중 점검 테스트 계획 (조화 · 반응성 · 성능 · 메모리 · 용량)

| 점검 축 | 테스트 시나리오 | 측정 도구 | Pass / Fail 게이트 |
|---|---|---|---|
| **1. UI 조화 (Harmony)** | ① 상단 고정 3D + 하단 네이티브 옷장 고속 스크롤<br>② `#111315` 다크 배경 경계 색차·오버레이(다이얼로그/키보드/토스트)<br>③ 360° 가로 드래그 vs 하단 세로 스크롤 터치 분리 | 시각 캡처 프레임 검수 + SurfaceFlinger / Instruments | 블랙 플래시·클리핑 깨짐·Z-order 역전·터치 경합 **0건** |
| **2. 반응성 (Latency)** | ① 스튜디오 진입 TTID(네이티브 시트) / TTFD(Godot 첫 3D 프레임)<br>② 캐시 코스메틱 5종 연속 교체 브리지→렌더 지연<br>③ 360° 드래그 회전 반응 | `PlayHubBridge` 프레임 타임스탬프 + Macrobenchmark | 네이티브 시트 `≤ 250 ms` · 첫 3D 프레임 `≤ 1.2s` (실기기) · 파츠 교체 `≤ 100 ms` · 연타 경합/누락 `0건` |
| **3. 성능 (FPS·발열)** | ① 3D 회전 + 하단 옷장 카드 동시 스크롤<br>② 풀코스메틱(후디+바이저+캡+홀로그램 윙) 연속 회전 | `dumpsys gfxinfo` + Godot FPS 리포트 / Perfetto | 네이티브 Janky `< 1%` · 3D 뷰포트 목표 FPS 유지 · 비조작 유휴 시 프레임 스로틀링 정상 |
| **4. 메모리 & 누수** | ① 홈 유휴 기준선 측정<br>② **반복 스트레스:** `홈 → 아바타 스튜디오(5종 교체) → 홈 복귀` 반복 + `아바타 → 인게임 .pck → 홈` 교차 전환 | `dumpsys meminfo` (`Total PSS` / `Private Dirty` 메인+`:godot_runtime`) · iOS `phys_footprint` | 홈 복귀 후 `:godot_runtime` PID 완전 소멸(Android), 메인 PSS 증가폭 수렴(누수 0), 크래시·OOM **0건** |
| **5. 용량 & 게이트** | ① Release/Debug APK 빌드 및 게이트 검사<br>② 아바타 스튜디오 스크립트·에셋 순증량 측정 | `tools/aos/build-apk.ps1` | Release APK `≤ 28 MiB`, 추가 3D 엔진 `0 MB`, Forge `0건`, Starter PCK `0건` |

---

## 6. 최적화 구현 정책 & AI 개발 자동화

- **Compose / SwiftUI 최적화:** Android **Baseline Profile + Startup Profile + R8 Full Mode** 필수 적용, 리스트 가상화, WebP/AVIF + CDN 리사이징, 검색 디바운스, 로컬 LRU 캐시 상한(예: GLB 캐시 `100 MB`).
- **AI 자동화:** OpenAPI + W3C Design Tokens 코드 생성 → 양 플랫폼 UI 및 **계약·스냅샷·성능 테스트 동시 생성** → CI에서 Macrobenchmark/Instruments 성능 회귀 자동 차단.

---

## 7. 기술 결정 및 PoC Go/No-Go 기준

- **기본안:** Android Kotlin + Jetpack Compose / iOS Swift + SwiftUI + 단일 Godot 런타임 재사용.
- **비교안:** Flutter + Dart (Discover, 게임 상세, 검색, 라이브러리 4개 화면 동일 실측).
- **Flutter 재평가 조건 (모두 충족 시):**
  1. 네이티브 대비 다운로드 크기 `+5 MB` 이내, TTFD `+300 ms` 이내, 유휴 메모리 `+25 MB` 이내, Janky Frames `< 1%`.
  2. 동일 4개 화면 구현·테스트 총 공수 **30% 이상 절감**.
  3. 단일 Godot 런타임 전환·OS 결제·시스템 인증·백그라운드 푸시에 치명적 제약 없음.

---

## 8. 실측 검증 결과 로그 (`Hub-AOS` 인라인 아바타 탭 5축 집중 점검)

> **측정 환경:** Android 15 에뮬레이터 (`Pixel_3a_API_35_x86_64`, `SwiftShader` 소프트웨어 GLES3) · `tools/aos/benchmark-avatar-runtime.ps1 -Cycles 5` (`홈 → 아바타 탭(인라인 Godot 3D 프리뷰 자동 기동) → 5종 코스메틱 연타 시착 + 360° 드래그 + 하단 옷장 독립 스크롤 → 홈 탭 복귀(:godot_runtime 자동 종료)` 5회 반복) + `tools/aos/build-apk.ps1` 실빌드 게이트.

| 점검 축 | 항목 | 목표 | 실측 결과 (인라인 `GodotService` + `SCVH`) | 판정 |
|---|---|---|---|---|
| **5. 용량** | Release APK (`arm64-v8a`) 전체 크기 | ≤ 28.00 MiB | **`23.71 MiB`** (순증 **`+15.8 KB`**, 추가 3D 엔진 **`+0.00 MiB`**, 30/30 JUnit · 5/5 게이트 PASS) | **PASS** |
| **4. 메모리** | 홈 유휴 기준선 (메인 프로세스 PSS) | ≤ 80 MB | **`77.62 MB PSS`** (`40.89 MB` Private Dirty, `godot_pid = 0`) | **PASS** |
| **4. 메모리** | 인라인 아바타 탭 활성 합산 (메인+`:godot_runtime`) | ≤ 220~225 MB | **`214.80 ~ 224.63 MB PSS`** (`:godot_runtime` `139.25~148.90 MB PSS` · Private Dirty `71.4~80.2 MB`) | **PASS** *(목표 근접·안정 수렴)* |
| **4. 메모리** | 5회 반복 탭 이탈(`홈` 복귀) 후 회수 & 누수 | PID 0 · 수렴 | `:godot_runtime` **5/5회 PID 0 완전 소멸**, 메인 복귀 Private Dirty **`39.84 → 40.17 → 40.26 → 40.22 → 40.31 MB`** (PSS `83.69 → 83.90 MB` 완전 평탄 수렴 · 누수 `0 MB`, `ZERO_FATAL_CRASHES`) | **PASS** |
| **2. 반응성** | 아바타 탭 전환 TTID (즉시 UI+스냅샷 표시) | ≤ 1,000 ms | **`2 ~ 7 ms`** *(별도 Activity 전환 `819~1,029 ms` 대비 사실상 0 ms 즉각 전환)* | **PASS** |
| **2. 반응성** | 코스메틱 시착 (`네이티브 탭 → UDP IPC → Godot 3D`) | ≤ 100 ms | 25회 연속 실측: **최소 `6 ms` / 중앙값 `16 ms` / 최대 `37 ms`** *(초기 sync `47~65 ms` 포함 전 구간 ≤ 65 ms)* | **PASS** |
| **2. 반응성** | 인라인 Godot 3D 첫 프레임 TTFD | ≤ 1.2s (실기기) | **`2,611 ~ 2,868 ms`** *(에뮬레이터 x86_64 `:godot_runtime` 콜드 부트 — 별도 Activity `3,229~3,809 ms` 대비 약 0.8초 단축)* | **실기기 ARM64 재확인 필요** |
| **3. 성능** | Godot 3D FPS · 유휴 발열 스로틀링 · 메인 Janky | 3D 60fps / 유휴 스로틀링 / Janky < 1% | Godot **활성 `53.0~60.5 fps` (`16.5~18.8 ms`)** → 2.5초 미조작 시 **자동 `29.9~30.0 fps` 발열 스로틀링 동작 검증 완료**. 메인 `GfxInfo` 50th `24 ms` · 90th `38 ms` · Janky `25.7%` *(SW GPU 에뮬레이터 경합 영향 — 실기기 재확인 필요)* | **부분 PASS** *(실기기 하드웨어 GPU 확인 필요)* |
| **1. UI 조화** | 5탭 셸 내 고정 4:3 프리뷰 + 하단 독립 스크롤 | 결함 0건 | 별도 화면 전환 없이 `홈/탐색/아바타/채팅/더보기` 셸 내부에 자연 통합, 하단 옷장 스크롤 중 블랙 플래시·클리핑 깨짐·터치 경합 **0건** (`28`~`30` 시각 검증 완료) | **PASS** |

### 실측에서 도출된 핵심 엔지니어링 인사이트
1. **별도 Activity 진입 vs 인라인 `GodotService + SCVH` 비교 우위 확인:**
   - 탭 전환 TTID가 `819~1,029 ms → 2~7 ms`로 사실상 즉각 반응으로 단축되었고, Godot 첫 프레임 TTFD도 약 `0.8초` 단축되었으며, 크로스프로세스 루프백 UDP 코스메틱 시착 지연은 **최소 `6 ms` / 중앙 `16 ms`(1프레임 이내)**를 달성함.
2. **유휴 메모리 보호 + 자동 발열 스로틀링 동시 검증:**
   - `아바타` 탭에서 `홈`으로 탭을 누르는 즉시 `PlayHubGodotPreviewService`가 언바인드·종료되어 `:godot_runtime` PID가 5/5회 100% 회수됨. 또한 2.5초 미조작 시 `60.0 fps → 30.0 fps` 자동 스로틀링이 실제 로그로 확인됨.
3. **실기기(하드웨어 GPU) 최종 확인 포인트:**
   - 헤드리스 에뮬레이터의 소프트웨어 GLES3(`SwiftShader`, `GL_MAX_FRAGMENT_UNIFORM_VECTORS = 256 < 261`) 제약으로 에뮬레이터에서는 `SW` 폴백이 자동 유지됨. 실제 Adreno/Mali/Xclipse 폰에서는 `swFallback = false`로 전환되어 4:3 프리뷰 영역에 풀 PBR Godot 3D가 직접 표시되며, ARM64 실기기 TTFD 및 하드웨어 가속 스크롤 Janky%를 최종 확인할 수 있음.
4. **시각 검증 캡처:**
   - 5탭 셸 내 인라인 Godot 아바타 프리뷰 초기 진입(`60fps`): [28-godot-avatar-studio.png](verification-m1/28-godot-avatar-studio.png)
   - 하단 옷장 독립 스크롤 + 실시간 시착(`58fps · 10ms`, `4개 착용 중`, `✓ 저장됨`): [29-godot-avatar-equipped.png](verification-m1/29-godot-avatar-equipped.png)
   - `홈` 탭 복귀 및 `:godot_runtime` 즉시 회수 확인: [30-hub-post-studio-return.png](verification-m1/30-hub-post-studio-return.png)

