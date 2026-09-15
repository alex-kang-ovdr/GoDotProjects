# PC · Android · Web 빌드

## 공통 소스

모든 타겟은 `Godot/project.godot`와 `Godot/scripts/*.gd`를 그대로 내보낸다. 플랫폼 래퍼, JavaScript 게임 코드, Electron, Capacitor는 사용하지 않는다. `Build/`는 항상 재생성하며 Git에 넣지 않는다.

| 타겟 | 명령 | 산출물 | 전제 |
| --- | --- | --- | --- |
| Windows x64 | `Build-PC.bat` | `Build/PC/CaptainSalvage.exe` | Godot 4.7 export template |
| Web | `Build-Web.bat` | `Build/Web/index.html`, `.wasm`, `.pck` | Godot 4.7 Web export template, WebGL 2 지원 브라우저 |
| Android debug | `Build-Android-Debug.bat` | `Build/Android/CaptainSalvage-debug.apk` | Godot Android export template, Android SDK, JDK 21, debug keystore |

`GODOT_BIN`을 Godot console 실행 파일의 절대 경로로 설정하면 모든 BAT가 해당 버전을 사용한다. 설정하지 않으면 개발 작업트리의 Godot 4.7.2 경로를 사용한다.

## 검증 경계

BAT는 내보내기 종료 코드만 자동 판정한다. Windows EXE 기동, Web의 HTTPS MIME/캐시, Android 설치·터치·발열은 각 배포 환경에서 수동으로 확인한다. Web 내보내기는 WebAssembly/WebGL 2 기반이라는 제약을 [Godot Web export 문서](https://docs.godotengine.org/en/4.5/tutorials/export/exporting_for_web.html)로 확인한다.
