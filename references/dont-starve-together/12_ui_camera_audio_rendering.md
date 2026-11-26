# 12. UI, 카메라 투영, 렌더링(KAnim·셰이더)과 오디오(FMOD)

> 상위 문서: [00. 목차](00_index.md) | 1차 출처: `scripts/cameras/followcamera.lua`, `scripts/postprocesseffects.lua`, `data/databundles/shaders.zip`, `data/anim/`, `data/sound/`, `data/images/`, `scripts/widgets/`, `scripts/screens/`, `scripts/languages/`

---

## 1. 2.5D 사선 투영 카메라 (`FollowCamera`) (`[코드 확인]`)

DST 특유의 "종이 인형극(Pop-up Book)" 시각 정체성은 3D 지면(`XZ` 평면) 위에 2D 빌보드 스프라이트를 세우고, 좁은 시야각(`FOV = 35°`)의 원근 카메라를 45° 기본 회전각으로 비추는 `scripts/cameras/followcamera.lua` (L54–102, L231–284)에서 완성된다.

| 파라미터 | 지상 기본값 | 동굴 기본값 | Lava Arena 오버라이드 |
|---|---:|---:|---:|
| `fov` | **35°** | 35° | 35° |
| `headingtarget` (Y축 회전) | **45°** *(Q/E로 ±45° 회전)* | 45° | 45° |
| `targetoffset` | `(0, 1.5, 0)` | `(0, 1.5, 0)` | `(0, 1.5, 0)` |
| `distancetarget` | **30** | **25** | 32 |
| `mindist` ~ `maxdist` | **15 ~ 50** (`zoomstep = 4`) | **15 ~ 35** | 20 ~ 55 |
| `mindistpitch` ~ `maxdistpitch` | **30° ~ 60°** *(줌 연동 피치)* | **25° ~ 40°** | 32° ~ 60° |
| 감쇠 계수 (`pangain` / `headinggain` / `distancegain`) | `4` / `20` / `1` (연속 `6`) | 동일 | 동일 |

- **시선 벡터 공식 (`followcamera.lua:233–264`)**:
  $$\vec{d} = (-\cos\text{pitch}\cos\text{heading},\; -\sin\text{pitch},\; -\cos\text{pitch}\sin\text{heading}), \qquad \vec{p}_{\text{cam}} = \vec{p}_{\text{target}} - \text{dist}\cdot\vec{d} + \vec{o}_{\text{screenX}}$$
- **화면 수평 오프셋 (`currentscreenxoffset`)**: 제작 메뉴나 팝업 패널이 열릴 때 캐릭터가 UI에 가리지 않도록 카메라를 수평으로 밀어준다.

---

## 2. KAnim 스켈레탈 2D 애니메이션 파이프라인 (`[데이터 확인]`)

로컬 설치본 `data/anim/`에는 **7,225개 파일(1,557.89 MB)** (`.zip` 3,692개 + `.dyn` 스킨 동적 번들 3,533개), `data/databundles/anim_dynamic.zip`에는 **3,439개 `.zip` (16.55 MB)**가 들어 있다.

- **KAnim 아카이브 내부 구조** (예: `abigail_attack_fx.zip`):
  - `build.bin`: 심볼(부위)별 텍스처 아틀라스 UV 사각형과 피벗 정의
  - `anim.bin`: 프레임별 2D 아핀 변환 행렬(위치·회전·스케일·Z-정렬·색상 틴트)
  - `atlas-0.tex`: Klei KTEX 포맷 압축 텍스처(DXT/BC 압축 + 밉맵)
- **스킨(Skin) 오버라이드 (`prefabskins.lua`, `clothing.lua`)**: 기본 `build.bin`의 특정 심볼(머리·몸통·손·도구 등)만 `.dyn` 동적 스킨 빌드로 런타임 치환(`OverrideSymbol`)해 수천 종의 의상·장비 스킨을 단일 애니메이션 타임라인으로 공유한다.

---

## 3. 70종 셰이더(`.ksh`)와 포스트프로세싱 파이프라인 (`[데이터 확인]`)

`data/databundles/shaders.zip`에 포함된 **70개 `.ksh` 셰이더**와 `scripts/postprocesseffects.lua` (L31–70) 기준 렌더링 계층이다.

| 계층 | 주요 `.ksh` 셰이더 | 역할 |
|---|---|---|
| **지형·바다·바닥** | `ground.ksh`, `ground_lights.ksh`, `ground_overlay.ksh`, `ground_underground.ksh`, `ocean.ksh`, `ocean_combined.ksh`, `blendoceantexture.ksh`, `waves.ksh`, `river.ksh`, `road.ksh`, `creep.ksh`, `shade.ksh`, `ceiling.ksh` | 78종 타일 경계 블렌딩, 거미줄/그림자 크립, 수면 파도·반사, 동굴 천장 그림자 |
| **엔티티·KAnim** | `anim.ksh`, `anim_bloom.ksh`, `anim_bloom_ghost.ksh`, `anim_bloom_haunted.ksh`, `anim_skinned.ksh`, `anim_fade.ksh`, `anim_holo.ksh`, `sprite.ksh`, `splat.ksh` | 빌보드 스켈레탈 스프라이트, 유령 반투명, 빙의(Haunt) 글로우, 발광(Bloom) 마스크 |
| **파티클·VFX** | `particle.ksh`, `vfx_particle.ksh`, `vfx_particle_add.ksh`, `vfx_particle_reveal.ksh`, `vfx_particle_pixelated_reveal.ksh`, `waterfall2.ksh` | 화염·비·눈·포자·균열 파티클 |
| **조명·환경 오버레이** | `lighting.ksh`, `overheat.ksh`, `moonstorm.ksh`, `moonstorm_goggles.ksh` | 2D 암흑 라이트맵, 여름 아지랑이, 달 폭풍 시야 차단 및 고글 투시 |
| **포스트프로세스** | `combine_colour_cubes.ksh`, `postprocess_colourcube.ksh`, `postprocess_colourcube_linedistort.ksh`, `postprocess_bloom.ksh`, `postprocess_distort.ksh`, `postprocess_lunacy.ksh`, `postprocess_moonpulse.ksh`, `postprocess_zoomblur.ksh` | **3중 ColourCube 3D LUT 보간** (`CC0` 계절/시간대 + `CC1` 광기/동굴 + `CC2` 특수 이벤트), 광기 어안/라인 왜곡, 달 계몽 오버레이 |
| **UI·미니맵·폰트** | `ui.ksh`, `ui_anim.ksh`, `ui_cc.ksh`, `ui_yuv.ksh`, `minimap.ksh`, `minimapblend.ksh`, `minimapocean.ksh`, `font_packed_outline.ksh` | HUD, 미니맵 타일 합성, 아웃라인 폰트, OGV 인트로 영상(`data/movies/` 102.83 MB) |

---

## 4. 오디오(FMOD)와 햅틱 (`[데이터 확인]`)

- **FMOD Designer 구조 (`data/sound/`, 총 1,000.40 MB)**:
  - **`.fev` 이벤트 메타 58개 + `.fsb` 샘플 뱅크 155개**
  - 기본 뱅크(`dontstarve.fev`, `dontstarve_DLC001.fev`) 위에 업데이트별 독립 뱅크(`farming.fev`, `turnoftides.fev`, `moonstorm.fev`, `monkeyisland.fev`, `rifts.fev` ~ `rifts8.fev`, `yoth_2026.fev`, `balatro.fev` 등)가 모듈식으로 추가된다.
  - 실시간 파라미터 변조 예시: `nightmareclock.lua:89`에서 `SoundEmitter:SetParameter("nightmare_loop", "nightmare", param)` (`0`/`1`/`2`)로 유적 악몽 음악 강도를 연속 제어.
- **햅틱 (`data/haptics/`)**: **1,762개 `.wav` 파일 (5.15 MB)** — 듀얼센스/컨트롤러용 오디오 파형 기반 진동 에셋.

---

## 5. UI 체계, 컨트롤러 지원과 다국어(L10N) (`[데이터 확인]`)

- **UI 스크립트 규모**: `scripts/widgets/` **274개**, `scripts/screens/` **136개** (클라이언트 측 Redux UI 프레임워크).
  - 주요 인게임 HUD: 우측 상단 16세그 시계·달 위상·생존 배지(체력/허기/정신력/체온/습기/보트/근력/영감), 좌측 제작 사이드바(26필터 + 핀 슬롯), 하단 15칸 인벤토리 + 4장비 슬롯 + 가방 슬롯, Tab 전체 지도, 스크랩북(`scrapbook_prefabs.lua`)·요리책(`cookbookdata.lua`)·식물도감(`plantregistrydata.lua`).
- **컨트롤러 데드존 (`tuning.lua:128–130`)**: `CONTROLLER_DEADZONE_RADIUS = 0.3`, `CONTROLLER_RETICULE_INITIAL_DEADZONE_RADIUS = 0.5`, 우측 스틱 조준 속도 `2`, `scripts/controller.vdf` Steam Input 매핑.
- **다국어 L10N (`scripts/languages/`)**: `strings.pot` 원본 + **12개 언어 `.po`** (`korean.po`, `japanese.po`, `chinese_s.po`, `chinese_t.po`, `french.po`, `german.po`, `italian.po`, `polish.po`, `portuguese_br.po`, `russian.po`, `spanish.po`, `spanish_mex.po`).
