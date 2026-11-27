# 변방의 기록

웹판 4.0을 기반으로 만든 Windows용 Godot 정착지 생존 게임입니다. 지도와 관리 화면은 Godot에서 그리고, 정착지 시뮬레이션은 기존 JavaScript 규칙으로 실행합니다.

## 실행

- Godot 4.7.2에서 `project.godot`을 열고 F6 대신 프로젝트 실행 버튼 또는 F5로 실행합니다.
- Windows 내보내기는 `Windows Desktop` 프리셋을 사용합니다. 기본 출력은 `../Saved/Verification/FrontierColonyGodot/FrontierColony.exe`입니다.
- 소스 실행과 내보낸 게임 모두 로컬 Node.js 20 이상이 필요합니다. Node 22.16에서 검증했습니다. Windows의 일반 설치 경로와 PATH에서 찾으며 별도 경로는 `FRONTIER_COLONY_NODE`에 지정할 수 있습니다.

처음에는 시간이 멈춰 있습니다. `1×` 또는 Space로 시작하세요. 건설 도구로 동쪽 `(27,16)`과 남쪽 `(23,19)`의 거처 틈을 닫고, 실내에 세 번째 침대를 지으세요. 작업 탭에서 연구 우선순위를 높이고 연구대에서 전기 공학을 완료하면 전력 설비를 지을 수 있습니다.

| 조작 | 동작 |
| --- | --- |
| 좌클릭 / Shift+좌클릭 | 주민·지도 선택 / 주민 추가 선택 |
| 가운데 버튼 드래그 / 휠 | 지도 이동 / 확대·축소 |
| 경작·창고 도구로 드래그 | 사각형 구역 지정 |
| 비징집 주민 선택 후 우클릭 | 채집, 건설, 수리, 진화 등 우선 작업 |
| R / 징집 후 클릭 / X | 징집 전환 / 이동·공격 / 위치 사수 |
| Space / 1–3 | 정지·재개 / 1×·3×·6× |
| Ctrl+S / 정착지 메뉴 | 저장 / 이전 저장, JSON 가져오기·내보내기 |

저장은 웹판 JSON 형식을 사용합니다. 정착지 메뉴에서 웹판 저장을 가져오거나 내보낼 수 있습니다. 로컬 자동 저장은 시간이 진행되는 동안 20초마다 갱신합니다.

## 기획 이관과 검증

- [Godot 이관 범위와 수용 기준](docs/web-v4/GODOT_HANDOFF.md)
- [웹판 v4 기획·플레이 가이드 원문](docs/web-v4/README.md)
- [원본 웹 시뮬레이션 구조](docs/web-v4/ARCHITECTURE.md)

저장소 루트에서 다음 명령으로 새 게임, 건설·농사, 시간, 연구, 관리 탭, 징집과 저장을 검증할 수 있습니다.

```powershell
.\Godot_v4.7.2-stable_win64_console.exe --headless --path .\FrontierColonyGodot --editor --import --quit
.\Godot_v4.7.2-stable_win64_console.exe --headless --path .\FrontierColonyGodot --script res://tests/play_smoke.gd -- --fresh
```
