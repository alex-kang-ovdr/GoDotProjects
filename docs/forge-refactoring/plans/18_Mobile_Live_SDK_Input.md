# 18. 모바일 결제·광고·분석 SDK와 터치 입력 표준화

| 항목 | 계획 |
|---|---|
| 계획 ID / 기준일 | PLAN-18 / 2026-11-24 |
| 원문 연결 | PDF 5, 7, 9쪽: IAP·광고·분석, SDK/AGP 호환, 가상 조이스틱 |
| 우선순위 / 상태 | P1; 터치 입력·IAP 기반은 P0 후보 / 개발 계획 |
| 구현 위치 | 공용 GDScript facade, Android/iOS adapter, 서버 영수증 검증·권한 서비스 |
| 담당 | 모바일 엔지니어, backend, QA; SDK 계약 담당 협업 |
| 예상 공수 | 18-30 PW, 1 PW = 숙련 담당자 5근무일 |
| 선행 / 연계 | 16 빌드, 17 실기기; 23 패키지, 29 계정, 30 서버 검증 |

## 1. 목표와 범위

프로젝트가 SDK 이름·callback 차이에 직접 묶이지 않도록 구매, 광고 보상, 이벤트, 입력을 버전 있는 공용 인터페이스로 제공한다. 최초 범위는 Android/iOS 각 1개 결제 경로, 1개 광고 provider, 기본 analytics와 remote config다.

광고 네트워크 전체나 미디에이션 전부를 처음부터 지원하지 않는다. 게임마다 필요한 SDK만 패키지에 포함하며 OS별 실제 지원 기능을 capability로 공개한다. Web 과금·광고 경로는 별도 adapter이며 모바일 SDK를 그대로 실행한다고 가정하지 않는다.

## 2. 확인 사실과 원문 보정

Godot는 first-party Google Play Billing 플러그인을 문서화한다. StoreKit 2 저장소는 API가 개발 중이라고 명시하므로 adapter와 정확한 release pin이 필요하다. [Godot IAP](https://docs.godotengine.org/en/stable/tutorials/platform/android/android_in_app_purchases.html), [StoreKit 2 저장소](https://github.com/godot-sdk-integrations/godot-storekit2)

`TouchScreenButton`은 멀티터치 게임 버튼을 이미 제공한다. 개선 범위는 입력 노드 부재가 아니라 조이스틱·safe area·멀티터치 충돌·장르별 preset의 일관된 패키지다. [TouchScreenButton](https://docs.godotengine.org/en/stable/classes/class_touchscreenbutton.html)

Google은 권한 지급 전 backend에서 구매를 검증하도록 안내한다. 클라이언트 callback만으로 아이템을 확정하지 않는다. [Play Billing 보안 문서](https://developer.android.com/google/play/billing/security)

## 3. 제안 모듈 구조

| 모듈 | 제공 기능 | 권위/보관 위치 |
|---|---|---|
| MobileServices | capability 조회·초기화·callback 정규화 | 클라이언트 facade |
| PurchaseAdapter | 상품 조회·구매·복원·보류 표시 | OS 스토어 adapter |
| EntitlementService | 영수증 검증·중복 차단·지급·철회 | 서버 권위 |
| AdsAdapter | load/show/닫힘·보상 이벤트 | vendor SDK와 검증 backend |
| TelemetryAdapter | 동의·최소 이벤트·오프라인 queue | client→ingest |
| RemoteConfig | 서명된 설정·버전·fallback | 서버 발행, client 캐시 |
| MobileInputKit | 가상 stick·action button·safe area | 공용 addon, 게임별 배치 |

초기화 순서는 동의 상태 확보 → 필요한 SDK 초기화 → 인증 연결 → 상품/광고 요청이다. 앱 시작이 vendor 응답을 무기한 기다리지 않도록 각 단계 timeout과 게임 진입 fallback을 둔다.

## 4. 제안 API·데이터

다음 이름은 공용 wrapper 제안이며 기존 Godot API가 아니다.

```gdscript
# 계획 의사코드
MobileServices.capabilities() # billing, rewarded_ads, consent, analytics
Purchases.query_products(product_ids)
Purchases.begin_purchase(product_id, request_id)
Purchases.restore_entitlements()
Ads.show_rewarded(placement_id, request_id)
InputProfile.apply(profile_id, handedness, safe_area)
```

```yaml
PurchaseRecord:
  project_id: project-A
  user_id: internal-user
  provider: play_or_appstore
  provider_transaction_id: provider-stable-id
  product_id: inventory.product
  state: pending_verified_granted_revoked
  idempotency_key: internal-request-id
  grant_version: 1
```

검증 성공과 지급 ledger 기록을 하나의 트랜잭션으로 처리한다. 같은 transaction을 다른 user/project로 재사용하면 차단한다. Webhook 중복·역순 도착·응답 손실은 현재 provider 상태 조회와 event ledger로 정리한다.

## 5. 입력·수명주기 설계

입력 프로파일은 touch pointer ID별 소유권, dead zone, floating/fixed stick, 감도, 좌우손 전환, action mapping을 저장한다. OS gesture 영역과 노치 safe area를 피하고 해상도가 아닌 논리 크기로 배치한다.

광고 표시·키보드 등장·화면 회전·앱 background 시 눌림 상태를 해제한다. 복귀 시 이전 touch를 다시 눌림으로 복원하지 않는다. 동일 action의 키보드·controller·touch가 공통 InputMap으로 들어오도록 한다.

멀티플레이 입력은 27의 입력 command로 변환한다. 클라이언트 버튼 상태가 HP·재화·위치 권한을 직접 바꾸지 않는다. remote config로 서버 authority 규칙을 버전 불일치 상태에서 변경하지 않는다.

## 6. SDK 지원표와 배포

SDK별로 engine commit, plugin version, AGP/Gradle/JDK, Android SDK, Xcode/iOS SDK, CPU ABI, 최소 OS, 개인정보 manifest, native library 크기를 기록한다. 정확한 버전은 실제 착수 시 선택하고 하나의 lock으로 묶는다.

업데이트는 별도 브랜치에서 17의 결제·광고·복귀 시나리오를 통과시킨 뒤 승격한다. SDK 비활성화만으로 binary가 제거된다고 가정하지 않고 최종 패키지 dependency 목록으로 확인한다.

## 7. 작업 분해

| 작업 | 내용 | PW | 산출물 |
|---|---|---:|---|
| M18-1 | capability·지원표·공용 interface | 2-3 | MobileServices 계약 |
| M18-2 | Android/iOS 구매·복원 adapter | 4-7 | sandbox 구매 시연 |
| M18-3 | 검증·지급·철회 ledger와 webhook | 4-6 | backend·중복/보류 처리 |
| M18-4 | 광고·analytics·동의·remote config | 3-5 | 최소 provider 통합 |
| M18-5 | MobileInputKit·장르 preset·접근성 | 2-4 | stick/button/배치 에디터 |
| M18-6 | 실기기·조합 CI·업데이트 runbook | 3-5 | 회귀 팩·운영 문서 |
| 합계 | provider 계약·스토어 심사 대기 제외 | **18-30** | 모바일 공통 기반 |

## 8. 단계와 검증 gate

입력과 구매 sandbox를 먼저 완성한다. 권한 지급 ledger의 장애 주입 시험을 통과한 뒤 광고 보상·동의·분석을 추가한다. 실제 결제 공개는 판매 주체·지원 국가·PSP/스토어 조건을 확인한 별도 출시 결정이다.

제조사 SDK와 개인정보 요구가 변경되는 경우 지원표를 갱신한다. 법률·세율을 문서에서 고정하지 않고 서비스 출시 지역에 맞는 담당 검토 항목으로 유지한다.

## 9. 정량 완료 기준

| 항목 | 실험 | 목표 |
|---|---|---|
| 구매 무결성 | 성공·보류·취소·환불·복원, 중복 이벤트 100회 | 잘못된 지급/중복 지급 0 |
| 장애 복구 | 지급 직전/직후 process 종료, 재로그인 | server ledger와 최종 권한 일치 |
| SDK 실패 | 광고 초기화·상품 조회 timeout | 게임 진입 가능, 명확한 상태·재시도 |
| 입력 | 이동+조준+공격 3 pointer, 회전·복귀 30회 | 입력 고착 0, action 중복 0 |
| UI | Android/iOS 대표 6개 화면, 세로/가로 | safe area 침범·핵심 버튼 잘림 0 |
| footprint | SDK 조합 전후 AAB/IPA 분석 | 미선택 provider native library 0 |
| 성능 | SDK 초기화 전후 10분 × 3회 | p95 프레임 5% 초과 악화 시 분리 초기화 |

수치는 계획 목표다. 광고 fill rate나 매출 상승은 이 개발 작업의 완료 기준으로 보장하지 않는다.

## 10. 위험·대체 경로·산출물

SDK vendor가 Godot를 공식 지원하지 않는 경우 wrapper 유지 담당과 버전 계약을 내부적으로 지정한다. 2주 spike에서 crash를 제거하지 못한 provider는 비활성화하고 다른 provider 또는 광고 없는 출시 경로를 사용한다.

산출물은 facade·플랫폼 adapter·backend ledger·입력 addon, SDK support matrix, sandbox 검증 기록, 업데이트·환불·복구 runbook이다. 실제 구현·검증은 아직 수행하지 않았다.

## 11. 출처

확인일: 2026-11-24.

- [Godot Android IAP](https://docs.godotengine.org/en/stable/tutorials/platform/android/android_in_app_purchases.html)
- [Godot StoreKit 2](https://github.com/godot-sdk-integrations/godot-storekit2)
- [Godot AdMob 구현 저장소](https://github.com/godot-mobile-plugins/godot-admob)
- [TouchScreenButton](https://docs.godotengine.org/en/stable/classes/class_touchscreenbutton.html)
- [Play Billing 검증 권고](https://developer.android.com/google/play/billing/security)
