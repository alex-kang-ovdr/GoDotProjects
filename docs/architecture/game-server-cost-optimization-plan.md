# PlayHub · PlayForge 게임 서버 인스턴스 비용 절감 방안

- 상태: 수립 (2026-11-22)
- 적용 범위: `forge/` 멀티플레이 템플릿 서버(`node-wss-v1`), 향후 크리에이터용 Godot 4.7.2 Linux 데디케이티드 서버(`godot-server`), `playhub-live` / `forge-live` 호스팅 인프라
- 관련 문서: [multiplayer-plan-review.md](multiplayer-plan-review.md), [site-operations-plan.md](site-operations-plan.md), [cloud-run-pipeline-plan.md](cloud-run-pipeline-plan.md), [creator-server-optimization-guide.md](creator-server-optimization-guide.md)

---

## 1. 게임 서버 원가 구조와 핵심 낭비 요인

PlayForge 배포 센터([publish-panel.js](../../forge/OfficialGodot/publish-panel.js)) 기준 티어 체계(`free-nano` ~ `large`, 1 P ≈ ₩14)에서 플랫폼 운영 원가가 폭증하는 4대 원인은 다음과 같습니다.

| 원가 요인 | 비중 (추정) | 발생 메커니즘 |
| :--- | :---: | :--- |
| **① 유휴(Idle) 인스턴스** | **60~80%** | 접속자가 0명인 방·월드가 24시간 켜져 있음 (`alwaysOn` 남용, 빈 방 미회수) |
| **② 저밀도·온디맨드 단일 배치** | **15~25%** | 방 1개에 VM 1개 배정, 온디맨드 정가 사용, 빈 슬롯 분산으로 Scale-in 불가 |
| **③ 네트워크 Egress** | **5~15%** | 60Hz 풀 스냅샷 브로드캐스트, 게임 서버가 정적 에셋까지 직접 서빙 (GCP 아웃바운드 GB당 ~\$0.085~\$0.12) |
| **④ 부대 고정비** | **5~10%** | 게임 서버마다 외부 IPv4 부여(월 \$3.65/IP), 상시 대기 Warm 풀 과다 유지 |

---

## 2. 7대 플랫폼 비용 절감 레버

### 레버 1. Scale-to-Zero & 유휴 자동 슬립(Hibernate) — *절감 65~85%*
- **MO (방/매치 기반)**: 마지막 플레이어 퇴장 후 **60~120초 유휴 시 컨테이너/프로세스 자동 종료**. 대기 비용 **\$0**.
- **MMO (소규모 월드)**: 기본값을 `alwaysOn=false`로 두고, 접속자 0명이 **10분 지속되면 월드 상태를 DB/GCS에 스냅샷 저장 후 절전(Hibernate)** → 첫 접속자 입장 시 **3~5초 내 Cold Wake + 스냅샷 복원**.
- **`alwaysOn=true` 제한**: 실제 24시간 동접이 유지되는 유료 `small` 이상 티어에서만 허용하고, 배포 UI에서 월 예상 포인트 차감 경고를 명시(현재 구현 유지).

### 레버 2. 호스트당 고밀도 빈 패킹(Bin-Packing) & Most-Packed 배정 — *절감 50~70%*
- 방 1개 = VM 1개 대신 **호스트 1대에 다수의 격리 게임 프로세스(컨테이너)를 고밀도 적재**합니다.
- **cgroups 티어별 Hard 리소스 할당**:
  | PlayForge 티어 | 권장 CCU | 할당 CPU (vCPU) | 할당 RAM | Egress 상한 (초당) | 1대 `e2-standard-4` (4 vCPU / 16 GB) 수용 수 |
  | :--- | :---: | :---: | :---: | :---: | :---: |
  | `free-nano` / `nano` | ~10 | 0.25 | 256 MB | 150 KB/s | 최대 14~16개 |
  | `micro` | ~30 | 0.50 | 512 MB | 400 KB/s | 최대 7~8개 |
  | `small` | ~80 | 1.00 | 1.0 GB | 1.0 MB/s | 최대 3~4개 |
  | `medium` | ~200 | 2.00 | 2.0 GB | 2.5 MB/s | 최대 2개 |
  | `large` | ~400 | 4.00 | 4.0 GB | 5.0 MB/s | 1개 |
- **Most-Packed Allocation 정책**: 신규 방은 **이미 가동 중인 호스트 중 잔여 슬롯이 가장 적은 노드**에 우선 배정합니다. 그래야 나머지 노드가 빠르게 비어 자동 축소(Scale-in)됩니다.

### 레버 3. GCP Spot VM + 인기도 기반 Warm/Cold 풀 분리 — *절감 60~75%*
- **Spot VM 우선 활용**: 단판 MO 매치(3~15분), `free-nano` 체험 방, Dev/QA 풀은 **GCP Spot VM(정가 대비 60~80% 할인)**에서 실행합니다.
  - GCP 선점(Preemption) 30초 전 시그널 수신 시 즉시 **Graceful Drain**(신규 매치 배정 차단 + 진행 중 상태 저장/보상).
- **MMO 상시 풀**: 1년/3년 약정(CUD, 37~55% 할인) 온디맨드 풀로 분리.
- **Warm/Cold 차등 대기** ([site-operations-plan.md](site-operations-plan.md#L71)):
  - 전체 게임에 대기 서버를 두지 않음. 최근 24시간 동접 상위 인기 게임만 최소 Warm 1~2슬롯 유지하고, 롱테일 UGC 게임은 **100% Cold Start(대기비 \$0)**.

### 레버 4. 외부 IPv4 제거 + WSS Gateway 집약 — *IP 비용 90%+ 절감*
- 게임 서버 VM/컨테이너에는 **외부 IPv4를 부여하지 않음**(IP당 월 \$3.65 절감).
- 앞단 **WSS Gateway(Cloud Run 또는 소수 L7 프록시)**가 TLS 종단·입장 티켓(`ConnectTicket`) 검증·DDoS 방어를 전담하고, 내부 VPC IP로 백엔드 게임 프로세스에 중계합니다.

### 레버 5. 장르별 서버 런타임 이원화 (`node-wss-v1` vs `godot-server`) — *RAM 50~70% 절감*
- **턴제 · 카드 · 보드 · 단순 2D 아케이드**(3D 물리 불필요): 초경량 **Node.js WSS 권위 서버** 유지 (프로세스당 30~60 MB RAM → 동일 호스트에 Godot 대비 3~4배 수용).
- **3D · 실시간 물리/네비게이션 필수 게임**: **Godot 4.7.2 Linux `--headless` 전용 서버** 사용 (렌더링/오디오 제거, 프로세스당 120~350 MB RAM).

### 레버 6. 용량 계측 기반 자동 가드레일 & Noisy Neighbor 차단
- 호스트 수용 한도 산정식:
  $$\text{Sessions/Host} = \min(\text{CPU 한도},\ \text{RAM 한도},\ \text{Egress 한도},\ \text{Tick p99 한도})$$
- **자동 관측 및 피드백**:
  - 틱 처리 시간 `p99 > 틱 주기 × 70%`, 또는 `1인당 Egress > 15 KB/s`가 5분 지속되면 크리에이터 대시보드에 **자동 최적화 경고**와 [크리에이터 최적화 가이드](creator-server-optimization-guide.md) 링크를 노출합니다.
  - 메모리 누수(RAM 한도 95% 초과) 또는 무한 루프(틱 > 500ms 연속) 감지 시 해당 방만 격리 재시작해 같은 호스트의 타 게임 피해를 차단합니다.

### 레버 7. 정적 에셋 · 96 MB WASM의 100% CDN 오프로드 — *Egress 80%+ 절감*
- 게임 서버 인스턴스는 **오직 실시간 게임 상태 패킷**만 송수신합니다.
- Web export 패키지(`index.wasm`, `.pck`, 텍스처, 오디오)는 `PlayHub-CDN`(Cloudflare R2/CDN 또는 GCS+Cloudflare)으로 완전 분리해 게임 서버 Egress 과금을 최소화합니다.

---

## 3. 단계별 도입 로드맵 (현재 1인 → 본격 확장)

| 단계 | 대상 동접 | 호스팅 구성 | 월 인프라 목표 | 핵심 적용 레버 |
| :--- | :---: | :--- | :---: | :--- |
| **Phase 1 (현재 · 동접 1~30명)** | ~30 CCU | Cloud Run (`min-instances=0`, `max-instances=1~2`) + `node-wss-v1` | **\$0 ~ \$5** | Scale-to-Zero, WSS TLS 무료, CDN 오프로드 |
| **Phase 2 (초기 오픈 · 30~500명)** | ~500 CCU | Spot VM 풀(`e2-standard-2/4` 1~3대) + Allocator + 앞단 WSS Gateway | **\$25 ~ \$120** | Spot VM(70%↓), Bin-Packing, 외부 IP 제거, 유휴 자동 슬립 |
| **Phase 3 (성장기 · 500명+)** | 500~5,000+ CCU | GKE Autopilot/Standard + Agones(Spot/CUD 혼합 풀) + 리전별 Gateway | **CCU당 월 ₩150~₩350 목표** | Most-Packed 오토스케일, Warm/Cold 분리, 틱 p99 자동 가드레일 |

---

## 4. 운영 KPI (비용 건전성 지표)

- **유휴 비율(Idle Ratio)**: 전체 과금 인스턴스 시간 중 `CCU == 0` 시간 비율 **< 15%** 유지
- **CCU당 Egress**: 평균 **< 10 KB/s** (1시간 플레이당 < 36 MB)
- **호스트 패킹 효율**: 피크 시간대 호스트 평균 CPU/RAM 활용률 **55~75%** 유지
- **원가율(COGS)**: 크리에이터 과금 포인트 대비 실제 GCP 인프라 원가 **< 35%** 유지 (무료 `free-nano` 체험 풀은 월 상한 예산 킬스위치로 보호)
