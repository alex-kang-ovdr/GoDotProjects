# Godot v11 실행 패키지와 네이티브 내보내기

대상 엔진은 **Godot 4.6.3 Standard**다. 게임 코드는 GDScript이며 .NET 런타임이나 JavaScript 실행기를 요구하지 않는다. 소스 프로젝트, Windows 실행 패키지, Linux 실행 패키지를 구분하여 제공한다.

## 실행 방법

### 소스 프로젝트

1. Godot 4.6.3에서 압축을 푼 폴더의 `project.godot`를 가져온다.
2. 최초 리소스 가져오기가 끝나면 **F5**로 게임을 실행한다.
3. 시작 화면에서 영웅, 맵 크기, 난이도와 게임 속도를 선택한다.

소스 실행에는 export template 설치가 필요하지 않다. 소스를 수정한 뒤 독립 실행 파일을 만들 때만 해당 플랫폼의 템플릿이 필요하다.

### Windows 패키지

`Nexus_Front_Godot_v11.exe`와 같은 폴더에 `Nexus_Front_Godot_v11.pck`를 둔 상태에서 EXE를 실행한다. PCK는 게임 데이터와 스크립트를 담는 파일이므로 EXE만 다른 폴더로 옮기면 안 된다. 별도의 Godot 에디터 설치 없이 실행하도록 만든 패키지다.

### Linux 패키지

`Nexus_Front_Godot_v11.x86_64`와 동일한 폴더에 `Nexus_Front_Godot_v11.pck`를 둔다. 압축 해제 도구가 실행 권한을 보존하지 않았다면 다음과 같이 설정한다.

```bash
chmod +x Nexus_Front_Godot_v11.x86_64
./Nexus_Front_Godot_v11.x86_64
```

Linux x86-64 실행 파일이다. 다른 CPU 아키텍처나 운영체제에서는 소스 프로젝트를 해당 플랫폼용 Godot로 가져온 뒤 맞는 템플릿으로 다시 내보내야 한다.

### PCK만 실행

설치된 Godot 실행 파일로 게임 PCK를 실행할 수도 있다.

```bash
godot --main-pack Nexus_Front_Godot_v11.pck
```

PCK는 웹 HTML 파일이 아니며 브라우저에서 직접 열어 실행하는 형식도 아니다. 이 Godot 포팅의 독립 실행 패키지와 원래 v10 웹 실행본은 별개다.

## 템플릿 확보와 검증

공식 Godot 4.6.3 export template ZIP의 크기는 **1,255,918,323바이트**다. 이를 전부 내려받는 대신 [fetch_export_templates.py](../tools/fetch_export_templates.py)가 HTTPS Range 요청으로 ZIP 끝 레코드와 중앙 디렉터리를 읽고, 필요한 두 엔트리의 압축 바이트만 가져온다.

공식 원본:

[Godot 4.6.3 공식 export templates](https://godot-releases.nbg1.your-objectstorage.com/4.6.3-stable/Godot_v4.6.3-stable_export_templates.tpz)

| 엔트리 | ZIP 안의 압축 크기 | 압축 해제 크기 | ZIP CRC32 |
|---|---:|---:|---|
| `templates/linux_release.x86_64` | 27,151,358바이트 | 71,075,864바이트 | `428f40f8` |
| `templates/windows_release_x86_64.exe` | 35,916,343바이트 | 104,659,456바이트 | `9b972102` |

HTTP 응답이 206이 아니거나 `Content-Range`가 요청 범위와 다르면 본문 전체를 읽지 않고 중단한다. 각 엔트리는 압축 해제 크기와 ZIP CRC32가 모두 일치해야 설치되며, 설치된 바이트의 SHA-256도 별도로 기록한다. 전체 ZIP을 내려받지 않았으므로 전체 ZIP의 SHA-256을 검증했다고 주장하지 않는다.

메타데이터만 확인:

```bash
python3 tools/fetch_export_templates.py --inspect
```

두 release 템플릿 설치:

```bash
python3 tools/fetch_export_templates.py
```

기본 설치 경로는 Linux에서 `~/.local/share/godot/export_templates/4.6.3.stable/`이며, `XDG_DATA_HOME` 설정이 있으면 이를 따른다. `--install-dir`로 다른 위치를 지정할 수 있다. 결과 메타데이터는 `exports/export-template-manifest.json`에 기록한다. 이 스크립트는 debug 템플릿·Android·macOS·Web 템플릿을 설치하지 않는다.

설치 검증은 두 엔트리 모두 CRC32·파일 크기 일치로 완료했다. ZIP 중앙 디렉터리와 로컬 헤더를 포함해 실제 전송한 양은 **63,136,948바이트**이며, 1.2GB 전체 아카이브를 받지 않았다.

| 템플릿 | 검증된 SHA-256 |
|---|---|
| `linux_release.x86_64` | `2c78919325d7f29fa7607287c7c1eeac367ea4c94e7b8b6f5f4c6b20492f73d0` |
| `windows_release_x86_64.exe` | `91724f15024a3a545e28ccd83134403d31ce2323a38e51c95e4dfa282f732ab6` |

Linux release 템플릿 자체의 `--headless --version` 실행 결과는 `4.6.3.stable.official.7d41c59c4`였으며 종료 코드는 0이었다. Windows 템플릿은 실행하지 않았고 ZIP 무결성·파일 형식 검증까지만 수행했다.

## 재현 가능한 release 내보내기

프로젝트 루트에서 다음 명령을 실행한다. 다른 플랫폼의 PCK가 덮어쓰이지 않도록 출력 디렉터리를 분리한다.

```bash
mkdir -p exports/linux exports/windows

godot --headless --path . --export-release "Linux" \
  exports/linux/Nexus_Front_Godot_v11.x86_64

godot --headless --path . --export-release "Windows Desktop" \
  exports/windows/Nexus_Front_Godot_v11.exe
```

`export_presets.cfg`가 플랫폼과 포함 리소스를 정의한다. JSON 데이터와 필요한 에셋은 포함하고, 문서·검증 스크립트·도구·기존 출력 폴더는 게임 PCK에서 제외한다. 소스 ZIP에는 개발에 필요한 문서와 도구를 함께 둔다.

Windows 버전 정보·아이콘 변경을 위한 외부 `rcedit` 도구가 없는 환경에서도 내보낼 수 있도록 리소스 수정은 끈다. 따라서 실행 파일의 운영체제 수준 기본 아이콘·버전 리소스가 프로젝트 화면의 브랜딩과 같다고 보장하지 않는다. Windows 코드 서명은 수행하지 않는다.

## 검증 범위

| 검증 항목 | 결과 |
|---|---|
| Linux release 내보내기 | 성공, 종료 코드 0 |
| Windows release 내보내기 | 성공, 종료 코드 0 |
| 독립 PCK 내보내기 | 성공, 종료 코드 0 |
| 런타임 입력 파일의 내보내기 전후 비교 | 97개 파일 SHA-256 모두 동일 |
| Linux standalone 로비 | 최종본 `--headless --quit-after 2`, 종료 코드 0, 경고·오류 없음 |
| Linux standalone 전투 진입 | 최종본 `--headless --quit-after 2 -- --smoke-match`, 종료 코드 0, 경고·오류 없음 |
| Windows 실제 실행 | 이 Linux 환경에서는 수행하지 않음. 내보내기·파일 형식·무결성 검증까지만 완료 |

소스용 독립 PCK, Linux 패키지 PCK, Windows 패키지 PCK는 세 파일의 바이트가 동일하다.

- 파일 크기: **3,015,412바이트**
- SHA-256: `b355d4770519daa69bda4a579b8608f85b052ac86affcc646254d2a72f05e90d`

이전 동일 전투 코드 빌드에서는 로비·전투 각각 100 process frame 검증을 통과했고, 참고 폴더 import 제외와 초상화 배치 수정 후 최종본을 다시 내보내 위의 짧은 시작 검증을 재실행했다. 최종 import와 내보내기 로그에는 경고도 없다.

프로젝트의 핵심 규칙 검증과 GUI 확인 결과는 통합 검증 보고서를 따른다. 내보내기 명령·결과·파일별 크기와 SHA-256은 `exports/native-export-manifest.json`, 입력 파일 목록은 `exports/runtime-inputs-before-export.json` 및 `exports/runtime-inputs-after-export.json`에 기록했다.

이 프로젝트의 Linux/Windows release 바이너리는 공식 Godot export template에서 생성된다. 런타임 엔진과 포함 오픈 소스 구성 요소의 고지 내용은 [Godot 라이선스](https://godotengine.org/license/)에서 확인할 수 있다. 원작 챔피언·아이템 이미지와 데이터의 출처 및 권리 표기는 프로젝트의 별도 출처 문서를 따른다.
