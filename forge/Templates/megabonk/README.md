# MEGABONK · Wildrun Expedition — Godot 4 네이티브 포트

이 대화에서 전달한 **`Megabonk_Web_Game_v2_20261124.zip`**을 기준으로 만든 네이티브 Godot 프로젝트입니다. 게임 실행 경로는 GDScript, Godot 3D 노드, 네이티브 Control UI, 로컬 JSON/SVG입니다. 브라우저, WebView, JavaScript 인터프리터, 로컬 웹 서버를 실행하지 않습니다.

**검증 엔진: Godot 4.7.2 stable (`ed1daf0bf`), Linux x86_64.** 동일 버전 사용을 권장합니다. 다른 Godot 4.x 버전과 Windows/macOS/모바일 실행은 별도 검증하지 않았습니다. 이 ZIP은 실행 파일이 아닌 **편집·실행 가능한 전체 프로젝트**이며 Godot 엔진 자체와 플랫폼별 export template은 포함하지 않습니다.

## 빠른 실행

1. ZIP 전체를 쓰기 가능한 폴더에 압축 해제합니다.
2. Godot Project Manager에서 **Import**를 누르고 이 폴더의 **`project.godot`**를 선택합니다.
3. 리소스 가져오기가 끝나면 **F5**로 실행합니다. 메인 씬은 `scenes/main.tscn`입니다.
4. 모험가, 지역, 진행 방식, 단계와 시드를 선택하고 **모험 시작**을 누릅니다. 메뉴의 아래 항목은 패널 안에서 스크롤할 수 있습니다.

Godot가 명령 경로에 등록되어 있다면 프로젝트 폴더에서 다음 명령으로도 실행할 수 있습니다.

```bash
godot --path .
```

소프트웨어 렌더링이나 낮은 성능의 환경에서는 설정의 **성능 우선**을 선택하세요. 화면은 Godot Compatibility 렌더러를 사용합니다. 한글은 운영체제의 `Noto Sans CJK KR`, `Malgun Gothic`, `Apple SD Gothic Neo` 등 설치된 시스템 글꼴로 표시합니다. 원본 웹판도 시스템 글꼴을 사용했으며, 새 글꼴 파일을 추가하지 않았습니다.

## 조작

| 기능 | 입력 |
|---|---|
| 이동 | WASD / 방향키 / 터치 스틱 |
| 자동 공격 | 가까운 적을 향해 자동 발동 |
| 점프 | Space / 점프 버튼 |
| 슬라이드 | C 또는 Ctrl을 누른 채 이동 |
| 대시 | Shift / 대시 버튼 — 웹 v2에 있던 편의 기능 |
| 상자·제단·포털 | E / 화면 상호작용 버튼 |
| 시점 | 우클릭 드래그 / 오른쪽 화면 터치 |
| 확대·축소 | 마우스 휠 |
| 전체 지도 | M — 지도 열람 중 일시 정지 |
| 성장·아이템 선택 | 숫자 1·2·3 / 카드 클릭 |
| 일시 정지·재개 | Esc / 화면 버튼 |
| 메뉴에서 시작 | Enter |

터치 버튼은 터치 장치에서 표시되며 설정에서 수동으로 표시할 수도 있습니다. 창이 포커스를 잃으면 전투를 일시 정지하는 원본 동작도 유지했습니다. 실제 모바일 기기와 다중 터치는 검증하지 않았습니다.

## 보존한 게임 범위

| 콘텐츠 | 수량 |
|---|---:|
| 선택 가능한 캐릭터 | 15 |
| 무기 | 16 |
| Tome | 18 |
| 아이템 | 24 |
| 적 데이터 | 29 |
| 지역 | 3 |
| 실행 가능한 영구 강화 | 4 (원본 데이터 8개 보존) |
| 기존 절차형 모델 | 29개 템플릿 / 397개 부품 |
| 기존 기하 배열 | 14 |
| 기존 UI 아이콘 / 초상 | 45 / 15 |

원작 흐름 모드의 숲·사막 10/9/8분 단계, 묘지 16분 단일 전투, 빠른 모험 6/10분 압축, 수동 보스 포털, 최후의 군세, 단계 간 빌드 유지, 경험치와 세 선택지, 무기·Tome 슬롯, 희귀도와 리롤, 상자 비용, 제단 3종, 캐릭터 패시브, 아이템 발동, 은화 상점과 결과 기록을 원본 웹 v2에서 옮겼습니다.

여기서 보존 기준은 상용 Megabonk의 최신 버전 전체가 아니라 **해당 웹 v2의 코드와 데이터**입니다. 원본 웹 프로젝트에 없던 모든 캐릭터/무기/퀘스트/원작 전체 보스 페이즈를 새로 구현했다는 의미가 아닙니다. 자세한 범위는 `docs/simulation-port.md`와 보존된 원본 ZIP 내부 문서에 있습니다.

## 원본 파일 보존

`reference/Megabonk_Web_Game_v2_20261124.zip`에 원래 웹 프로젝트를 수정 없이 포함했습니다.

- 크기: **832,605 bytes**
- SHA-256: **`b85bded0da5317b7653bfaaab804aa3738c83eb16679ca5ff801b1defd729151`**
- ZIP 전체 CRC32: **`4d101783`**
- 원본 엔트리: **43개**, 내부 CRC/압축 검사 통과
- 기준 커밋: **`8dc09d21ece0aad9e7b0f8965a0655ae6dc6d58f`**

로컬에서 없어진 파일을 이 커밋의 소스에서 복원한 뒤 이전 전달 ZIP의 세 값과 정확히 일치함을 확인했습니다. 기존 웹 소스는 깨끗한 상태로 남겨 두었고, 사이트에 변경을 푸시하거나 재배포하지 않았습니다.

새 3D 모델, 일러스트, 텍스처, 음원을 제작하지 않았습니다. 원래 코드의 모델 부품·기하·색상, SVG, 지형 생성, 합성음 규칙을 Godot 표현으로 옮겼습니다. 기존 Three 라이선스는 `assets/licenses/THREE-LICENSE.txt`에 보존했습니다.

## 프로젝트 구성

| 경로 | 역할 |
|---|---|
| `project.godot` / `scenes/main.tscn` | 프로젝트와 시작 씬 |
| `scripts/simulation.gd` | 전투·성장·진행 전체 시뮬레이션 |
| `scripts/terrain.gd` | 원본 시드 지형·경사·경로·구조물 |
| `scripts/deterministic_random.gd` | 원본 시드 해시와 Mulberry32 |
| `scripts/spatial_hash.gd` | 충돌·대상 검색 |
| `scripts/js_compat.gd` | 언어 차이를 보존하는 **네이티브 GDScript** 함수 |
| `scripts/world_renderer.gd` | ArrayMesh/MultiMesh·카메라·전투 효과 |
| `scripts/main.gd` / `map_view.gd` | 네이티브 UI·입력·지도·기록 |
| `scripts/meta.gd` / `audio.gd` | 영구 성장·네이티브 합성음 |
| `data/` / `assets/` | 원본 데이터와 기존 에셋의 변환 결과 |
| `reference/` | 수정하지 않은 전체 웹 v2 ZIP |
| `tests/` | 실행 가능한 Godot 검사와 원본 비교 기준값 |
| `validation/` | 실제 실행 결과·로그·검증 범위 |
| `docs/` | 포팅 구조·출처·표현 차이 |
| `tools/` | 선택적 원본 추출·코드 재생성 도구 |
| `CONTENTS_SHA256.json` | 패키지 각 파일의 크기·SHA-256 목록 |

`.godot/` 캐시, 사용자 프로필, 실행 파일, 계정 정보는 패키지에 포함하지 않습니다. 첫 Import에서 Godot가 필요한 캐시를 생성합니다. 원본 ZIP과 선택적 개발 도구에 JavaScript 파일이 있는 것은 출처 보존과 비교를 위한 것이며 게임 실행에서는 사용하지 않습니다.

## 저장

기록·은화·영구 강화·설정은 Godot `user://megabonk-wildrun-profile-v1.json`에 저장합니다. 커스텀 사용자 폴더명은 `Megabonk_Wildrun_Godot_v2`입니다. Linux의 기본 위치는 `~/.local/share/Megabonk_Wildrun_Godot_v2/`입니다.

웹 브라우저의 localStorage와 자동으로 동기화하지 않습니다. 기존 웹 기록은 그대로 남고, 네이티브판은 별도 프로필을 사용합니다. 원본 웹판과 같이 진행 중인 한 판을 중간 저장해 복원하는 기능은 없습니다.

## 실제 검증

**343 / 343 통과, 실패 0.** 결과는 `validation/automated-summary.json`에 검증 당시 모든 GDScript의 SHA-256과 함께 기록했습니다.

| 검사 묶음 | 검사 수 | 내용 |
|---|---:|---|
| 원본 대조·규칙 | 202 | 전체 데이터, 난수, 지형, 초기 상태, 무기 16종, 성장·상자·제단·포털·경제 |
| 지속 플레이·패시브·아이템 | 96 | 보정 없는 50초 × 3개 시드, 15명 패시브, 24종 아이템 |
| 네이티브 씬·UI·입력 | 32 | 실제 `main.tscn`, Control 신호, 키 입력, 선택·지도·정지·결과·재도전·저장 |
| 네이티브 렌더러 | 13 | 기존 모델/기하, 397개 부품의 행렬·선형 RGB, 유한 좌표, 카메라·단계 갱신 |

별도로 네이티브 Godot 편집기에서 프로젝트를 Import하고 F5 실행했으며, 독립 창으로도 실행해 메뉴·15명 초상·3D 지형과 기존 모델, 실제 이동, 자동 공격, 피해, 경험치 표시, 처치·금화 증가, 포커스 이탈 시 정지를 화면으로 확인했습니다. 최종 화면의 밝기·색 공간·HUD 가독성 보정을 확인했습니다. 이 데스크톱 관찰은 정량 검사 343개와 별개의 기록입니다.

기록된 데스크톱 환경은 **OpenGL 4.5 / Mesa llvmpipe 소프트웨어 렌더링**입니다. 하드웨어 GPU 성능, 모든 해상도, 실제 모바일 기기, 전체 3단계를 사람이 완주한 결과는 검증하지 않았습니다. 오디오 출력 장치가 없어 실제 소리를 듣는 검증은 하지 못했습니다. 자세한 차이는 `validation/VALIDATION.md`를 확인하세요.

## 검사 재실행

논리·렌더러 검사는 Godot만 필요합니다.

```bash
godot --headless --editor --path . --import --quit
godot --headless --path . --script tests/port_tests.gd
godot --headless --path . --script tests/extended_tests.gd
godot --headless --path . --script tests/renderer_native.gd
```

UI 검사는 기존 프로필을 건드리지 않도록 Linux의 별도 임시 사용자 폴더를 요구합니다.

```bash
port_ui_test_dir=$(mktemp -d)
MEGABONK_TEST_DATA="$port_ui_test_dir" XDG_DATA_HOME="$port_ui_test_dir" \
  godot --headless --fixed-fps 60 --path . --script tests/ui_scene_tests.gd
```

Node 24 / Python 3을 사용하는 도구는 원본에서 기준값이나 코드를 다시 뽑을 때만 필요합니다. 일반 실행 전에 실행할 필요가 없습니다. 재생성 방법과 입력은 `docs/source-preservation.md`에 있습니다.
