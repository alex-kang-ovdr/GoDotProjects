# Play Hub iOS — 무료 Apple ID (\$0) 본인 iPhone USB 직결 테스트 가이드

유료 Apple Developer Program(\$99/년) 등록 없이 **무료 개인 Apple ID(Personal Team)**만으로 Mac + USB 연결 본인 iPhone(또는 iOS Simulator)에서 `Hub-IOS` M0~M1 초기 기능을 실구동·검증하는 절차입니다.

---

## 1. 사전 준비 (최초 1회)

### A. iPhone 설정
1. iPhone을 Mac에 USB 케이블로 연결하고 **"이 컴퓨터 신뢰"** 승인.
2. iPhone **설정 → 개인정보 보호 및 보안 → 개발자 모드(Developer Mode)** 켜기 → 재부팅 확인.

### B. Mac 환경 준비
1. App Store에서 **Xcode 16+** 설치 후 1회 실행(iOS 플랫폼 SDK 설치).
2. **Xcode → Settings → Accounts → `+` → Apple ID**로 무료 개인 Apple ID 로그인 (`Personal Team` 표시 확인).
3. 필수 CLI 설치:
   ```bash
   brew install xcodegen node
   ```
4. Godot 4.7.2 iOS Export Template(`ios.zip`) 배치:
   - Windows PC의 `%APPDATA%\Godot\export_templates\4.7.2.stable\ios.zip` 파일을 Mac의 아래 경로로 복사 (또는 `GODOT_IOS_TEMPLATE_ZIP` 환경변수로 지정):
     ```text
     ~/Library/Application Support/Godot/export_templates/4.7.2.stable/ios.zip
     ```

### C. Windows PC (선택 — 실서버·`.pck` HTTPS 다운로드 연동 시)
- Windows에서 PlayHub 모바일 백엔드와 Cloudflare HTTPS 터널을 띄워 `https://<random>.trycloudflare.com` 주소를 확인합니다.
- 이 URL을 아래 `--hub-url` 옵션 또는 앱 내 **상단 Farm 필 → Custom URL**에 입력하면 iPhone LTE/5G·Wi-Fi 어디서나 즉시 연동됩니다.

---

## 2. 원커맨드 셋업 및 실행 (Mac)

저장소 루트(`Hub-IOS` 브랜치 체크아웃 상태)에서 실행합니다:

```bash
# 방법 1 (권장): Xcode 자동 오픈 후 Cmd+R로 USB iPhone 설치
./tools/ios/setup-free-usb.sh \
  --slug hub-ios-alex \
  --hub-url https://your-tunnel.trycloudflare.com

# 방법 2: Personal Team ID를 아는 경우 CLI로 즉시 USB iPhone 빌드·설치
./tools/ios/setup-free-usb.sh \
  --slug hub-ios-alex \
  --team YOUR_PERSONAL_TEAM_ID \
  --hub-url https://your-tunnel.trycloudflare.com \
  --install
```

### 스크립트가 자동 수행하는 작업
1. `ios.zip`에서 `libgodot.ios.release.xcframework`만 추출 및 SHA-256 검증(`MoltenVK`·`camera`·`debug` 제외).
2. Godot Editor 설치 없이도 순수 Node로 7 KB 부트스트랩 `ios/App/Resources/Bootstrap/data.pck`(GDPC v3 / 4.7.2) 생성.
3. Git 추적 제외 파일 `ios/Config/LocalFree.xcconfig`에 고유 Bundle ID(`com.playhub.<slug>.debug`) 및 `--hub-url` 기록.
4. `PlayHubCore` 순수 Swift 단위 테스트(`swift test`) 실행.
5. `xcodegen generate`로 `ios/PlayHub.xcodeproj` 생성 (`PlayHubAppFree` 스킴 + `DebugFree` 구성 + 유료 Capability 제외 [PlayHub-Free.entitlements](../../ios/App/Resources/PlayHub-Free.entitlements)).

### Xcode에서 `Cmd+R` 실행 (방법 1)
1. 상단 스킴이 **`PlayHubAppFree`**인지 확인.
2. 프로젝트 설정 → `PlayHubApp` 타겟 → **Signing & Capabilities** → Team에서 본인 **Personal Team** 선택.
3. 상단 실행 대상을 **USB 연결된 본인 iPhone**으로 선택하고 **`Cmd + R`**.
4. iPhone 최초 실행 시 *"신뢰할 수 없는 개발자"* 팝업이 뜨면 **iPhone 설정 → 일반 → VPN 및 기기 관리 → 본인 Apple ID → 신뢰** 선택 후 재실행.

---

## 3. 무료 Apple ID(\$0) 테스트 가능 범위 vs 유료(\$99/년) 전환 시점

| 구분 | 무료 Apple ID (`PlayHubAppFree`) | 유료 Developer (`PlayHubApp`) |
|---|---|---|
| **5탭 UI · Edge-to-Edge · Dynamic Island** | **가능** | 가능 |
| **중립적 연령 게이트 (KR/US/DE)** | **가능** | 가능 |
| **Guest 즉시 로그인 · Farm 4색 실시간 상태 · Custom 터널 URL** | **가능** | 가능 |
| **진입 전 버전 호환성 경고/차단 · On-Demand `.pck` · Godot/WKWebView 런타임 · 인게임 오버레이** | **가능** | 가능 |
| **StoreKit 2 로컬 결제 시뮬레이션 (`PlayHub.storekit`)** | **가능** | 가능 |
| **설치 유효 기간** | **7일** (만료 시 Mac USB 재빌드) | 90일 (TestFlight) / 무제한 (App Store) |
| **Sign in with Apple · APNs 푸시 · Universal Links · App Attest · 타인 폰 TestFlight 배포** | **비활성** (`PLAYHUB_FREE_USB` 가드) | **활성** |

---

## 4. 자주 발생하는 오류 해결

- **`The app identifier "com.playhub.xxx.debug" is not available`**
  - Apple 무료 계정은 전 세계 고유 App ID를 요구합니다. `--slug hub-ios-<본인이니셜+숫자>`처럼 다른 고유 슬러그로 다시 실행하세요(하이픈 `-`만 허용, 밑줄 `_` 금지).
- **`Personal development teams do not support the ... capability`**
  - 반드시 `PlayHubApp`이 아닌 **`PlayHubAppFree` 스킴 (`DebugFree` 구성)**을 선택해야 유료 Entitlement가 제외된 `PlayHub-Free.entitlements`가 적용됩니다.
- **7일 후 앱이 열리지 않음**
  - 무료 Personal Team 프로비저닝 정책입니다. iPhone을 Mac에 다시 연결해 `Cmd+R`만 누르면 앱 데이터 유지 상태로 7일 연장됩니다.
