# Forge-RobloxPort PoC 포팅 전/후 비교 리포트

- **검증일**: 2026-11-20
- **타깃 엔진**: `Godot_v4.7.2-stable_win64` (`4.7.2.stable.official.ed1daf0bf`)
- **소유 브랜치**: `Forge-RobloxPort`

---

## 1. 확보한 오픈소스 Roblox PoC 프로젝트 (MIT 라이선스)

| 구분 | 출처 저장소 | 라이선스 | 구성 및 선정 근거 |
|---|---|---|---|
| **PoC 주 대상: Chaos Obby** | [SBdevz/Chaos-Obby](https://github.com/SBdevz/Chaos-Obby) (실제 Roblox 공개 게임) | MIT | 실제 플레이되는 오비 게임의 **원본 Luau 스크립트 7개(331 코드라인)** 전수 포함 (`Motion`, `Checkpoints`, `Disapearing`, `Lava Obstacles`, `Teleport`, `Chaos Features`, `Timer`). `RunService.Heartbeat`, `CFrame`, `Touched`, `Humanoid`, `Lighting` 안개, `DataStoreService`(X등급), 함수 키 테이블(V등급), `GetAttributeChangedSignal`까지 리서치 문서의 D/A/R/X/V 전 등급을 망라. 씬은 업스트림 스크립트의 `WaitForChild` 계약을 만족하는 Roblox XML v4(`ChaosObby.rbxlx`, 51 인스턴스 / 18 Part)로 재구성. |
| **공식 XML 기준선: Baseplate 413** | [Roblox/rbx-test-files](https://github.com/Roblox/rbx-test-files) (`places/baseplate-413/xml.rbxlx`) | MIT | Roblox 공식 스튜디오 XML v4 코퍼스(41 인스턴스, `Baseplate` 512×20×512 studs, `Color3uint8`, `CoordinateFrame`). 파서 스키마 호환성 실증용. |

---

## 2. 포팅 전(Lab v0.1 기준선) vs 포팅 후(PoC 파이프라인 + `playforge_roblox_compat`) 핵심 KPI 비교

> 대상: `ChaosObby.rbxlx` (51 인스턴스, 18 Part/SpawnLocation, 7개 원본 Luau 스크립트, 총 331 코드라인)

| 측정 지표 | 포팅 전 (Lab v0.1 기준선) | 포팅 후 (PoC 1~4 파이프라인) | 변화 / 실측 근거 |
|---|---:|---:|---|
| **Godot 4.7.2 `.tscn` 인스턴스화** | **실패 (`false`)** | **성공 (`true`)** | Lab v0.1은 루트 노드 없이 전 노드를 `parent="."`로 출력해 인스턴스화 불가 → PoC는 루트+계층+리소스 완비 |
| **3D 메시 / 충돌 / 접촉 영역** | `0 / 0 / 0` | **`18 / 18 / 18`** | `BoxMesh`/`CylinderMesh`(축 90° 보정) + `StandardMaterial3D`(Neon Emission 포함) + `CollisionShape3D` + `Area3D` |
| **좌표계·단위 변환 오차** | 미적용 (`(0,0,0)` 고정) | **`0.0000 m`** | `0.28 m/stud`, 왼손→오른손 기저 변환(`R' = M R M^-1`) 실측 |
| **GDScript 컴파일 성공률 (Godot 4.7.2)** | **`0 / 7 (0.0%)`** | **`7 / 7 (100.0%)`** (+런타임 4/4) | Lab v0.1은 `game:GetService` 콜론/블록 불일치로 전수 Parse Error → PoC는 11/11 무오류 로드 |
| **미변환 `# TODO` 폴백 라인** | `151 / 331 (45.6%)` | **`0 / 331 (0.0%)`** | 구조적 블록·람다·클로저 박싱·1-based 인덱스 보정으로 폴백 0줄 달성 |
| **관측 API 커버리지** | 10개 단순 문자열만 검사 | **`48 / 49 (97.96%)`** | 미지원 외부 서비스 1건(`DataStoreService`, X등급)만 스텁+명시 진단 |
| **미보고 미지원 API (`Unreported unsupported`)** | 측정 불가 | **`0`** (목표 0 달성) | X등급 2건(`DataStoreService`), V등급 1건(`LuauTable.FunctionKey`) 전수 구조화 보고 |
| **Godot 4.7.2 실기 행동 테스트 통과율** | **`0 / 9 (0.0%)`** | **`9 / 9 (100.0%)`** | 회전 속도비(8.00x/0.50x), 체크포인트, 텔레포트, 타이머 HUD, 사라지는 발판, 용암 리스폰, 카오스 안개/속도 전수 통과 |

---

## 3. 스크립트별 포팅 전/후 상세 비교 (`SBdevz/Chaos-Obby` 원본 7개)

| 원본 Luau 스크립트 | 코드라인 | 전: Lab v0.1 (TODO / 컴파일) | 후: PoC 파이프라인 (TODO / 컴파일 / 주요 등급) | 실측 행동 검증 결과 |
|---|---:|---|---|---|
| `Motion.legacy.luau` | 52 | 14줄 TODO / **실패** | 0줄 TODO / **통과** (`D=1, A=4, R=3`) | `Right60`/`Left60` 회전, `Right480` 정확히 **8.00배**, `CylRight30` **0.50배** |
| `Checkpoints.legacy.luau` | 66 | 30줄 TODO / **실패** | 0줄 TODO / **통과** (`A=6, R=7, X=1`) | `Stage` `Red 0 → Red 1`, `RespawnLocation` 갱신, `DataStoreStub` 기록+경고 |
| `Disapearing.legacy.luau` | 35 | 21줄 TODO / **실패** | 0줄 TODO / **통과** (`A=3, R=7`) | `Transparency 0→1`, `CanCollide=false`, 대기 후 `0 / true` 복구 (클로저 박싱) |
| `Lava Obstacles.legacy.luau` | 9 | 2줄 TODO / **실패** | 0줄 TODO / **통과** (`A=1, R=4`) | 용암 접촉 시 `Health=0` → 사망 카운트 증가 + `Red 1` 자동 리스폰 |
| `Teleport.legacy.luau` | 59 | 24줄 TODO / **실패** | 0줄 TODO / **통과** (`D=1, A=12, R=9, X=1`) | `DataStoreStub` 조회 → `PivotTo(x=13.44m)` 이동, `LevelRed=true`, `GettingUp` |
| `Chaos Features.legacy.luau` | 92 | 53줄 TODO / **실패** | 0줄 TODO / **통과** (`D=1, A=6, R=6, V=1`) | `WalkSpeed(8/64/16)` & `Lighting.FogEnd(20/500)` 전환, 함수 키 딕셔너리 동작 |
| `Timer.local.luau` | 18 | 7줄 TODO / **실패** | 0줄 TODO / **통과** (`D=2, A=3, R=2`) | `GetAttributeChangedSignal`로 HUD 가시성 및 `MM:SS` 실시간 갱신 |

---

## 4. Godot 4.7.2 실렌더링 시각 비교 (1280×720)

| 단계 | 캡처 이미지 | 확인된 사항 |
|---|---|---|
| **포팅 전 (Lab v0.1)** | `screenshots/before_lab_v01_scene.png` | 루트 노드 누락으로 `instantiate() == false`, 메시 0개, 컴파일 성공 스크립트 0/7 |
| **포팅 후 — Chaos Obby 일반 모드** | `screenshots/after_chaos_obby_normal.png` | 로비·텔레포트 패드·체크포인트·회전 빔·회전 실린더(축 보정)·사라지는 발판·용암·플레이어 아바타·상단 타이머 HUD(`Next Chaos Event In: 04:00`) 실렌더링 |
| **포팅 후 — Chaos Obby Darkness 이벤트** | `screenshots/after_chaos_obby_darkness.png` | `Chaos Features.legacy.luau`의 `darkness()` 실행 후 `WorldEnvironment` 안개(`Color8(50,50,50)`) 전환 및 HUD(`Darkness Event Ends In: 00:42`) 갱신 + 빔 회전 진행 확인 |
| **포팅 후 — 공식 Baseplate 413** | `screenshots/after_baseplate_413.png` | 공식 `Roblox/rbx-test-files`의 `Baseplate`(512×20×512 studs → 143.36×5.6×143.36 m, RGB(99,95,98)) 정상 import 및 그림자 렌더링 |

---

## 5. 확인된 한계 및 다음 단계 (리서치 문서 교차 검증)

1. **X등급 플랫폼 서비스 (`DataStoreService`)**: 로컬 인메모리 스텁으로 기능 동작을 검증하고 명시적 경고를 출력하지만, 영속 저장·계정 연동은 PlayHub/외부 백엔드 어댑터 설계가 필요하다.
2. **V등급 동적 Luau 패턴 (`LuauTable.FunctionKey`, `setmetatable`)**: `Chaos Features`의 함수 키 테이블은 GDScript `Dictionary[Callable, String]`로 매핑했으나, 복잡한 `metatable`/`coroutine` 의존 프로젝트는 리서치 권장대로 Luau VM 경로가 필요하다.
3. **물리 마찰·회전 발판 탑승감**: `AssemblyAngularVelocity` + `CFrame` 회전은 시각·각속도 비율(8.00x/0.50x)이 정확히 일치하나, 회전 발판 위에 캐릭터가 올라탔을 때의 마찰 동반 회전은 Godot `AnimatableBody3D`(`sync_to_physics`) 전환으로 추가 고도화할 수 있다.
4. **재현 명령**:
   ```bash
   node --test tools/RobloxConverter/tests/converter-lab.test.mjs tools/RobloxConverter/tests/poc-porting.test.mjs
   node tools/RobloxConverter/src/port-cli.mjs tools/RobloxConverter/fixtures/chaos-obby/ChaosObby.rbxlx <outputDir>
   ```
