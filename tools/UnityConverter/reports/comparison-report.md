# Unity → Godot 4.7.2 포팅 실증 및 전/후 비교 보고서

- **대상 게임**: Unity Technologies 공식 샘플 **2D Roguelike (`Scavengers`)**
- **원본 저장소**: https://github.com/omiroshn/2DRoguelike (Unity `5.6.7f1`)
- **기존 타 엔진 포팅 레퍼런스**: https://github.com/kone9/Rogue-en-Godot-cSharp (Godot 3.x Mono C# 수동 포팅)
- **타깃 엔진**: Godot `4.7.2.stable.official` (`GL Compatibility`, 순수 GDScript)
- **작업 브랜치 / 워크트리**: `Forge-UnityPort` (`D:/Github/GoDotProjects-worktrees/Forge-UnityPort`)

---

## 1. 선정 근거 (공식 샘플 + 기존 포팅 사례)

**Unity 2D Roguelike (`Scavengers`)**는 Unity 공식 학습용 대표 게임이면서 다음 포팅 핵심 과제를 모두 포함합니다.
1. **바이너리 직렬화 에셋**: `.prefab` 26개, `.anim` 7개, `.unity` 1개가 전부 Unity 5.6.7f1 바이너리 포맷으로 저장됨.
2. **좌표계·원점 불일치**:
   - Unity 2D 월드 좌표는 `Y-up`, 32 PPU, 좌하단 `(0,0)`이 플레이어 시작점 / 우상단 `(7,7)`이 출구.
   - `Scavengers_SpriteSheet.png.meta`의 56개 슬라이스 좌표(`rect`)는 **좌하단 원점(bottom-left)**, Godot `AtlasTexture`는 **좌상단 원점(top-left)**.
3. **비호환 오디오 포맷**: 12개 오디오가 전부 `.aif`(AIFF Big-Endian PCM)이며, 그중 4개(`chop1/2`, `soda1/2`)는 **24-bit BE PCM**, 8개는 **16-bit BE PCM**으로 Godot 4 기본 임포터에서 바로 열리지 않음.
4. **엔진 생명주기·코루틴·싱글톤 차이**: `DontDestroyOnLoad` + Unity 5 구버전 `OnLevelWasLoaded` + `IEnumerator` 코루틴 + `Physics2D.Linecast` + `Animator.SetTrigger`.
5. **기존 커뮤니티 포팅 사례 존재**: `kone9/Rogue-en-Godot-cSharp`가 Godot 3.x Mono C#으로 수동 재구현한 사례가 있어 **수동 Godot 3 C# 포팅 vs 자동 파이프라인 Godot 4.7.2 GDScript 포팅** 대조가 가능합니다.

---

## 2. 포팅 전(Unity) vs 포팅 후(Godot 4.7.2) 정량 비교

| 항목 | 포팅 전 (Unity 5.6.7f1 원본) | 포팅 후 (Godot 4.7.2 자동 포팅) | 기존 수동 포팅 (`kone9/Rogue-en-Godot-cSharp`) |
|---|---|---|---|
| **총 파일 수 (캐시 포함)** | 561개 (`Library`/`Temp` 포함 51.46 MB) | 85개 (순수 프로젝트 15.19 MB) | 209개 (`.mono` 캐시·크래시 덤프 포함 ~28.5 MB) |
| **순수 소스·에셋 파일 수** | 183개 (`Assets`+`ProjectSettings`, 16.67 MB) | 85개 (15.19 MB, **-53.6% 파일 / -8.9% 용량**) | ~72개 (수동 제작 `.tscn` 26개+ 포함) |
| **게임플레이 스크립트** | C# 8개 (528줄 / 비공백 431줄) + 에디터 C# 4개 | GDScript 9개 (685줄 / 비공백 566줄, `unity_compat.gd` 포함) | Godot 3 Mono C# 9개 (`.csproj`/`.sln`/Mono 런타임 필요) |
| **씬 / 프리팹 구성** | `.unity` 1개 + 바이너리 `.prefab` 26개 | `.tscn` 1개 + 56 `AtlasTexture` + 3 `SpriteFrames` (데이터 주도 생성) | 수동 `.tscn` 27개 (`Floor1~9`, `Wall1~8`, `OuterWall1~4` 등) |
| **스프라이트 슬라이스** | `Scavengers_SpriteSheet.png.meta` 56개 (bottom-left) | `sprite_00.tres`~`sprite_55.tres` 56개 자동 좌표 변환 | 수동 `Sprite` region 지정 |
| **애니메이션** | 바이너리 `.anim` 7개 + `.controller` 3개 | `SpriteFrames` 3개 자동 추출 (`player`/`enemy1`/`enemy2`) | 수동 `.tres` 2개 + 부분 애니메이션 |
| **오디오 에셋 (12개)** | `.aif` 12개 (16/24-bit BE PCM, 15.41 MB) | `.wav` 12개 자동 변환 (16-bit LE PCM, 15.01 MB, **-2.6%**) | 수동 외부 변환 (`.ogg` 11개 + `.wav` 1개) |
| **구버전/에디터 API 처리** | `OnLevelWasLoaded` (Unity 5 deprecated), `UnityEditor` 4개 | Autoload + 세대 카운터로 현대화, `UnityEditor` 자동 제외 | Godot 3 전용 API (`mono_crash.*` 10여 건 잔존) |
| **자동화 검증** | 없음 (수동 Play 테스트 의존) | **Godot 4.7.2 E2E 21/21 PASS (1.28s)** + **Node 4/4 PASS** | 없음 |

---

## 3. 스크립트 1:1 매핑 및 라인 수 비교

| Unity 원본 C# (`Assets/Scripts/`) | 줄수 (비공백) | Godot 4.7.2 GDScript (`scripts/`) | 줄수 (비공백) | 핵심 변환 내용 |
|---|---:|---|---:|---|
| `BoardManager.cs` | 94 (77) | `board_manager.gd` | 170 (145) | 바이너리 프리팹에서 추출한 스프라이트 테이블 + 결정론적 시드 지원 + 8×8/외벽/벽(5~9)/음식(1~5)/적(`floor(log2(level))`)/출구 생성 |
| `MovingObject.cs` | 71 (55) | `moving_object.gd` | 45 (37) | `IEnumerator SmoothMovement`+`Rigidbody2D.MovePosition` → Godot `Tween`, `Physics2D.Linecast` → 결정론적 블로킹 쿼리 |
| `Player.cs` | 126 (104) | `player.gd` | 119 (99) | `Input.GetAxisRaw` → `InputMap`(WASD/방향키), 원본 이중 `Move()` 버그 해소, `PlayerChop`/`PlayerHit` 원샷 자동 복귀 |
| `Enemy.cs` | 52 (45) | `enemy.gd` | 60 (48) | 2턴 주기 `skip_move`, 축 우선 추적, Enemy1(10)/Enemy2(20) 피해 및 공격 애니메이션/SFX |
| `Wall.cs` | 29 (23) | `wall.gd` | 40 (33) | `StaticBody2D` + 피격 시 `dmg_sprite` 교체 + 4타 파괴 및 블로킹 해제 |
| `GameManager.cs` | 95 (80) | `game_manager.gd` | 129 (111) | `DontDestroyOnLoad`+`OnLevelWasLoaded` → Autoload 싱글톤 + `level_generation` 코루틴 레이스 방지 + Game Over 재시작(`R`/`Enter`) |
| `SoundManager.cs` | 42 (32) | `sound_manager.gd` | 63 (51) | `AudioSource` → `AudioStreamPlayer` + `0.95~1.05` 피치 랜덤 `randomize_sfx` + 12개 변환 `.wav` 자동 로드 |
| `Loader.cs` + `Main.unity` | 19 (15) | `main.gd` + `main.tscn` | 35 (25) | `Camera2D` 2× 픽셀-퍼펙트 줌 + `CanvasLayer` HUD (`FoodLabel`, `LevelImage`, `LevelText`, `PressStart2P`) |
| *(해당 없음)* | — | `unity_compat.gd` | 24 (17) | Unity 2D Y-up(32 PPU) ↔ Godot 2D Y-down 픽셀 좌표 및 SortingLayer(`Floor=0, Items=1, Units=2`) 어댑터 |
| **합계** | **528 (431)** | **합계** | **685 (566)** | **원작 8개 클래스 100% 1:1 구조 보존 + 어댑터 1개** |

---

## 4. API 호환성 등급 요약 (`unity-core-api.v0.json`)

- **D (직접 치환, 8종)**: `MonoBehaviour` 생명주기, `SpriteRenderer`/`SortingLayer`, `OnTriggerEnter2D`, `Instantiate`/`SetParent`, `AudioSource.RandomizeSfx`, `Input.GetAxisRaw`, `UI.Text/Canvas`, `Invoke`
- **A (어댑터 변환, 5종)**: `Transform.position`(Y-up→Y-down), `SpriteSheet.meta`(bottom-left→top-left 56개), `AudioClip.aif`(16/24-bit BE AIFF → 16-bit LE WAV 12개), `Animator.SetTrigger`, `Physics2D.Linecast`/`LayerMask`
- **R (런타임 호환, 2종)**: `Rigidbody2D.MovePosition` + 코루틴 보간, `DontDestroyOnLoad` + `SceneManager`/`OnLevelWasLoaded`
- **X (런타임 제외, 1종)**: `TutorialInfo/Scripts/Editor/*`의 `UnityEditor` 에디터 전용 코드

---

## 5. 포팅 중 발견·해결한 핵심 이슈

1. **Unity 5.6.7f1 바이너리 프리팹/애니메이션 파싱**:
   - YAML 텍스트(`Force Text`)가 아닌 바이너리 직렬화로 저장되어 있었으나, `.png.meta`의 `fileIDToRecycleName` 테이블(`21300000`~`21300110`)을 64-bit LE 스캔해 26개 프리팹과 7개 애니메이션 클립의 스프라이트 참조를 **누락 0건으로 자동 추출**했습니다.
2. **AIFF 16-bit & 24-bit Big-Endian PCM 혼재**:
   - 외부 `ffmpeg` 없이 순수 Node.js(`src/aiff-to-wav.mjs`)로 IEEE 80-bit extended 샘플레이트(44100 Hz)와 16/24-bit BE PCM을 16-bit LE RIFF WAV로 변환해 Godot 4.7.2에서 12개 오디오 모두 오류 0건 임포트·재생을 달성했습니다.
3. **레벨 전환 중 적 턴 코루틴 레이스 컨디션**:
   - Day 1 Exit 진입 직후 이전 레벨의 `_move_enemies()` `await` 타이머가 Day 2의 적을 조기 호출하는 문제를 E2E 테스트로 포착하여 `level_generation` 세대 카운터로 원천 차단했습니다.
4. **픽셀아트 필터링 및 카메라 비율**:
   - Godot 기본 Linear 텍스처 필터를 Nearest(`default_texture_filter=0`)로 설정하고 640×640 뷰포트에 `Camera2D` 2× 줌을 적용해 32×32 타일(10×10 보드 = 320×320px)이 원작과 동일한 선명한 픽셀아트로 렌더링되도록 보정했습니다.

---

## 6. 검증 결과 (실측 로그)

- **Godot 4.7.2 Headless 임포트**: 14개 에셋(WAV 12 + PNG 1 + TTF 1) + 9개 GDScript + 56개 `AtlasTexture` + 3개 `SpriteFrames` — **오류 0건, 경고 0건**
- **Godot 4.7.2 런타임 E2E 검증 (`verify_and_capture.tscn`)**: **21/21 PASS** (`1283 ms`, ObjectDB/리소스 누수 0건)
  - 12개 오디오 로드, Day 1 인트로/보드(100타일, 벽 9, 픽업 5, 적 0), 플레이어 좌하단 `(0,0)` / 출구 우상단 `(7,7)` 좌표, 외벽 충돌, 이동 시 Food -1, 벽 피격 손상 스프라이트 교체 + `chop` 애니메이션 + 4타 파괴, Soda 획득(+20 Food), Exit → Day 2 전환 및 적 1기 스폰(`floor(log2(2))=1`), 적 2턴 교대 `skip_move`, Enemy2 공격(-20 Food + `hit`/`attack` 애니메이션), `Food <= 0` Game Over 전환 전부 통과
- **Node.js 변환기 회귀 테스트 (`unity-converter.test.mjs`)**: **4/4 PASS** (`474 ms`)
- **시각 증거 캡처**:
  - `screenshots/01_day1_intro.png`
  - `screenshots/02_day1_board.png`
  - `screenshots/03_day1_wall_chop.png`
  - `screenshots/04_day2_enemy_combat.png`
  - `screenshots/05_game_over.png`
