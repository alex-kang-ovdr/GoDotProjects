# 로컬 수동 실행

Windows 탐색기에서 `tools`의 BAT 파일을 더블클릭합니다. 웹 서비스는 준비가 끝나면 기본 브라우저에서 열립니다. 서버를 사용하는 동안 콘솔을 열어두고, 종료하려면 해당 콘솔에서 `Ctrl+C`를 누릅니다.

- **Run_Hub.bat**는 기존 `hub/dist` 산출물로 PlayHub를 실행하고 사용자 웹을 엽니다. 관리자 웹 주소도 콘솔에 표시합니다. 실행할 때 게임 동기화와 사이트 빌드를 자동으로 수행하지 않습니다. 사용자·관리자 UI와 API 포트, 로컬 데이터 경로는 `hub/config/local.json` 또는 `PLAYHUB_CONFIG`로 지정한 설정 파일에서 읽습니다.
- **Run_Forge.bat**는 공식 Godot 웹 에디터를 엽니다. 명령 프롬프트에서 `Run_Forge.bat showcase`를 실행하면 별도 로컬 작업 공간에 Tappy Chicken 프로젝트를 만들고 제작 시연 패널이 있는 에디터를 엽니다. 기본 주소는 `http://127.0.0.1:4177/OfficialGodot/`이며 `PORT`로 포트를 바꿀 수 있습니다.
- **Run_Games.bat**는 `http://127.0.0.1:22999/`에서 게임 목록을 엽니다. 같은 화면에서 로컬과 배포 게임을 선택합니다.
- **Run_Engine.bat**는 Godot 프로젝트 관리자를 엽니다. `Run_Engine.bat showcase`는 `forge/Saved/Demos/TappyChickenShowcase/project.godot`을 편집기로 엽니다. 시연 폴더가 아직 없으면 템플릿에서 한 번 생성합니다.

## 실행 준비 확인

각 BAT의 뒤에 `--check`를 붙이면 필요한 파일과 설정을 확인합니다. 예를 들어 `Run_Forge.bat showcase --check`로 시연에 필요한 파일도 함께 확인할 수 있습니다. 브라우저 없이 서비스만 실행할 때는 `PLAYHUB_NO_BROWSER=1`을 지정합니다.

- **Node.js** Hub에는 Node 24 이상, 다른 런처에는 Node 22 이상이 필요합니다. Windows 런처는 `PLAYHUB_NODE_BIN`에 지정한 절대 경로, `artifacts/local-runtime/node24/node.exe`, PATH 순으로 확인합니다.
- **Godot** Forge와 Engine은 `GODOT_BIN`에 지정한 절대 경로를 우선 사용합니다. 기본 파일명은 `Godot_v4.7.2-stable_win64.exe`이며 `artifacts/local-runtime/godot`이나 기준 `GoDotProjects` 체크아웃에서 찾습니다. Forge에는 별도 제공된 `forge/OfficialGodot/vendor` 웹 에디터 엔진과 Node 패키지도 필요합니다.
- **PlayHub 로컬 구성** `publicHost`와 `adminHost`는 루프백 주소로 지정하고, API 및 UI 포트 네 개를 각각 다르게 설정합니다. `dataDir`에 로컬 전용 절대 경로를 지정합니다.

## Hub 수동 배포

당분간 배포 요청을 받은 AI 작업자가 저장소 루트에서 Node.js 24로 다음 명령을 실행합니다. 실제 사용할 비공개 설정 파일의 절대 경로를 지정합니다.

```text
node hub/tools/build.mjs --config "<비공개 설정 파일 절대 경로>"
```

새 게임을 처음 공개할 때는 게임 manifest의 `publishedOn`에 한국 시간 기준 공개일을 한 번 기록합니다. 이 명령은 현재 체크아웃의 게임을 동기화한 뒤 `hub/dist`에 사용자·관리자 사이트를 빌드합니다. 빌드가 끝나면 `hub/reports/build.json`을 확인하고, 같은 설정으로 `tools\Run_Hub.bat --check`를 실행한 뒤 사용자 웹과 게임 로딩을 검사합니다. 웹·게임 소스 변경은 이 수동 배포를 거쳐야 Hub 사이트에 반영됩니다.

`godot-engine`은 엔진 소스 서브모듈이며 소스 ZIP에는 별도로 기록된 gitlink 또는 체크아웃 커밋을 확인할 수 있습니다.
