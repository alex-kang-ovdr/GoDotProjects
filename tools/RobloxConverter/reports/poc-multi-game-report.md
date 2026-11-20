# Forge-RobloxPort 4종 멀티 장르 PoC 포팅 전/후 비교 리포트

- **검증일**: 2026-11-20
- **타깃 엔진**: `Godot_v4.7.2-stable_win64` (Desktop + PlayForge WebGL2 `GL Compatibility` 웹 에디터)
- **총 검증 규모**: **MIT 오픈소스 Roblox 게임 4종** (+ 공식 `Baseplate 413` XML v4 기준선), **원본 Luau 스크립트 59개 / 총 5,587 코드라인**

---

## 1. 4종 멀티 장르 포트폴리오 및 전/후 실측 KPI

| # | 게임 (MIT 출처) | 장르 / 입력 형식 | 스크립트 / 코드라인 | 전: Lab v0.1 (Rojo / TODO율 / 구문오류 / 행동) | 후: PoC v2 (API 커버리지 / X·V 진단 / 실기 행동) |
|---|---|---|---:|---|---|
| 1 | **Chaos Obby** ([SBdevz/Chaos-Obby](https://github.com/SBdevz/Chaos-Obby)) | Obby / `.rbxlx` | 7 / 331줄 | 미지원 / 45.6% (151줄) / 41건 / **0/9** | **97.96%** / X:2, V:1 (`Unreported=0`) / **9/9 (100%)** |
| 2 | **War Tycoon** ([ManBoyx/roblox-war-tycoon](https://github.com/ManBoyx/roblox-war-tycoon)) | 타이쿤+전투 / Rojo | 11 / 1,160줄 | 미지원 / 45.8% (531줄) / 101건 / **0/5** | **100.0%** / X:0, V:10 (`Unreported=0`) / **5/5 (100%)** |
| 3 | **Power Punch Simulator** ([LILRINO71/power-punch-simulator](https://github.com/LILRINO71/power-punch-simulator)) | 클리커+수익화 / Rojo | 16 / 1,662줄 | 미지원 / 41.4% (688줄) / 141건 / **0/5** | **95.12%** / X:4, V:10 (`Unreported=0`) / **5/5 (100%)** |
| 4 | **Lantai Runtuh** ([lukaririnki26/lantai-runtuh](https://github.com/lukaririnki26/lantai-runtuh)) | 낙하타일 파티 / Rojo (`--!strict`) | 25 / 2,434줄 | 미지원 / 52.9% (1,288줄) / 237건 / **0/5** | **97.73%** / X:1, V:34 (`Unreported=0`) / **5/5 (100%)** |
| **합계** | **4종 멀티 장르** | RBXLX + Rojo | **59 / 5,587줄** | **TODO 47.6% (2,658줄) · 0/24 (0%)** | **`Unreported=0` · Godot 실기 24/24 (100%)** |

---

## 2. 신규 3종 게임별 실측 포팅 검증 결과

### Game #2 — War Tycoon (`ManBoyx/roblox-war-tycoon`, MIT)
- **실제 변환·컴파일된 핵심 Luau 모듈**: `Config.luau`, `Economy.luau`, `Combat.luau`
- **실전 컴파일 발견 및 변환기 보강**: Luau `Economy.get(player)`가 Godot `Object.get(property)` 네이티브 메서드와 충돌하는 현상을 실기 컴파일로 포착해 예약 메서드 자동 이스케이프(`rbx_get`) 및 자식 모듈의 지연 서비스 바인딩(`get_service` auto-bind)을 런타임에 반영.
- **Godot 4.7.2 실기 검증 (5/5 통과)**:
  1. `Config`: `StartCash=300`, `KillReward=150`, `PlotCount=4`, `Items=11` 일치
  2. `Economy.setup`: `leaderstats/Argent = 300` (`IntValue`) 생성
  3. `Economy.spend`: `Dropper 1($150)` 구매 시 `300 → 150`, 초과 지출(`$9999`) 차단
  4. `Combat.damage` + `Humanoid.Died`: 적 처치 시 `KillReward(+$150)` 지급(`150 → 300`), `Kills=1`, `RemoteEvent("Notify"):FireClient` 발화
  5. 4팀 컬러 타이쿤 플롯 3D 월드 + HUD 렌더링 (`screenshots/after_war_tycoon.png`)

### Game #3 — Power Punch Simulator (`LILRINO71/power-punch-simulator`, MIT)
- **실제 변환·컴파일된 핵심 Luau 모듈**: `Config.luau`, `Formulas.luau`
- **X등급 플랫폼 서비스 진단**: `MarketplaceService` (`Monetization.luau`), `DataStoreService`/`OrderedDataStore` (`Data.luau`, `GlobalLeaderboard.luau`) 4건 전수 탐지 및 `RobloxMarketplaceStub` 경고 연동.
- **Godot 4.7.2 실기 검증 (5/5 통과)**:
  1. `Config`: `Gear=6`, `Zones=4`, `Rebirth.BaseCost=10000` (언더스코어 리터럴 `10_000` 파싱)
  2. `Formulas.abbreviate`: `1234567 → "1.23M"`, `950 → "950"`, `12500 → "12.5K"` 정확 일치
  3. `Formulas.powerPerPunch` & `coinsForPower`: `gear(5) × rebirth(2) × zone(8) × 2x(2) = 160`, `coins = 160`
  4. `Formulas.rebirthCost`: 지수 연산(`^ → pow`) `10000 → 30000 → 90000` 일치
  5. `MarketplaceService` X등급 스텁 게이트 + 5개 존(Beach/City/Volcano/Space/VIP Island) 3D 월드 렌더링 (`screenshots/after_power_punch_sim.png`)

### Game #4 — Lantai Runtuh (`lukaririnki26/lantai-runtuh`, MIT)
- **실제 변환·컴파일된 핵심 strict Luau 모듈**: `Config.luau`, `Pattern.luau`, `Rewards.luau`
- **strict Luau / V등급 실전 발견**: `--!strict`, `export type`, `::` 캐스트, `//` 정수 나눗셈, `if c then a else b` 식, 다중 스왑 `list[i], list[j] = list[j], list[i]`, 중첩 배열 대입 `cells[others[k]] = target`, `table.insert` 빈 테이블(`[]` vs `{}`) 추론, `RateLimiter.luau`의 `setmetatable` V등급 진단을 실측으로 검증.
- **Godot 4.7.2 실기 검증 (5/5 통과)**:
  1. `Config`: 12×12 아레나, 6색 접근성 팔레트(`R/B/Y/G/P/W`)
  2. `Pattern.generate`: 144타일 중 안전 타일 비율 `18/144 (12.5%)`로 `[12%, 50%]` 클램프 준수
  3. `Pattern.isSafe`: 144/144 타일 불일치 0건
  4. `Rewards.compute`: 우승자(`101`) `5 + 5×2 + 50 = 65코인`, 탈락자(`102`) `5 + 3×2 = 11코인`
  5. 낙하 시뮬레이션: 비안전 126타일 충돌 해제·낙하, 안전 노랑(`[Y]`) 18타일 유지 (`screenshots/after_lantai_runtuh_wave.png`, `after_lantai_runtuh_drop.png`)

---

## 3. 자동화 검증 및 소유권 상태
- `node --test tools/RobloxConverter/tests/converter-lab.test.mjs tools/RobloxConverter/tests/poc-porting.test.mjs`: **7/7 통과** (4종 게임 전수 Godot 4.7.2 실기 24/24 행동 검증 포함)
- `node tools/worktree-ownership/check-ownership.mjs`: `Forge-RobloxPort` 소유 경로 외 변경 0건
