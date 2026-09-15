# PC · Android · 웹 빌드

## 공통 원칙

이 프로젝트는 의존성 없는 HTML Canvas 게임이다. 세 타겟은 같은 정적 웹 자산을 사용하며, `Tools/Build/build-web.js`가 `assets/`, `data/`, HTML·CSS·JavaScript·PWA 파일을 깨끗한 `Build/` 산출 폴더로 복사한다. 산출물은 재생성 가능하므로 Git에 넣지 않는다.

## 웹

`Build-Web.bat`을 실행하면 `Build/Web/CaptainSalvage/`에 HTTPS 정적 호스트로 올릴 수 있는 앱 셸을 만든다. 이 폴더 전체를 같은 오리진의 배포 루트에 업로드해야 PWA 매니페스트와 서비스 워커가 작동한다. `file://` 직접 열기는 게임 확인용일 뿐 PWA 설치·오프라인 검증 대상이 아니다.

## PC

`Build-PC.bat`은 `Build/PC/CaptainSalvage/`에 독립적인 정적 PC 묶음을 만든다. `Run-PC-Build.bat`은 먼저 그 묶음을 만들고 `http://127.0.0.1:4173/` 로컬 서버를 시작해 기본 브라우저를 연다. 서버 콘솔에서 `Ctrl+C`를 누르면 종료한다.

현재 PC 산출물은 네이티브 `.exe`가 아니라 로컬 웹 서버로 실행하는 웹 빌드다. 렌더·입력·PWA 경로를 웹과 동일하게 유지하기 위한 선택이다. Windows 설치 파일이나 독립 Chromium 런타임이 필요해지면 Electron/Tauri 패키징을 별도 마일스톤으로 추가해야 한다.

## Android

`Build-Android-Web.bat`은 Capacitor가 읽는 `Build/Android/web/` 앱 셸을 만든다. `Build-Android-Debug.bat`은 다음 순서를 자동 수행한다.

1. Android 웹 자산 생성
2. `Platforms/Android/`에서 Capacitor 의존성 설치
3. Android 네이티브 프로젝트 최초 생성 및 웹 자산 동기화
4. 생성된 `android/` Gradle 프로젝트에서 debug APK 빌드
5. `Build/Android/CaptainSalvage-debug.apk`로 복사

`Platforms/Android/android/`은 Capacitor가 생성하는 Git 제외 폴더다. Capacitor 주요 버전을 바꾸거나 생성물이 손상됐을 때만 `node Tools/Build/reset-android-platform.js --reset-existing`로 이 폴더를 재생성할 수 있다. 이 명령은 네이티브 폴더를 삭제하므로, 직접 수정한 Kotlin·Gradle 코드는 먼저 별도로 보관해야 한다.

스크립트는 설치된 Temurin JDK 21을 우선 사용하고, 유효한 기존 `JAVA_HOME`과 이 작업 환경의 JDK 17을 차례로 폴백으로 사용한다. 유효하지 않은 `ANDROID_HOME`/`ANDROID_SDK_ROOT`는 무시하고 `D:\SDK\AndroidSDK`를 SDK 경로로 사용한다. 로컬 환경이 다르면 실행 전에 세 환경 변수를 설정한다.

이 프로젝트는 재현 가능한 Android 래퍼를 위해 Capacitor `7.4.3`을 정확히 고정하며, 이 의존성의 Android 모듈은 Java 21 소스 레벨로 컴파일한다. JDK 21과 Android Studio/SDK가 필요하다. Android API 24 이상 지원, Android Studio의 API 플랫폼·빌드 도구와 실제 기기 또는 에뮬레이터는 별도 설치 상태에 따라 필요하다. 자세한 환경 및 `cap add android`/실행 흐름은 [Capacitor 환경 설정](https://capacitorjs.com/docs/getting-started/environment-setup), [Android 문서](https://capacitorjs.com/docs/android)를 따른다.

## 검증 순서

1. `Build-Web.bat`, `Build-PC.bat`, `Build-Android-Web.bat`이 각각 정상 종료하고 필수 앱 셸 파일을 만든다.
2. `Run-PC-Build.bat`으로 PC 브라우저에서 출항·입력·PWA 아닌 로컬 실행을 수동 확인한다.
3. `Build-Android-Debug.bat`이 APK를 만든 뒤 `adb install -r Build/Android/CaptainSalvage-debug.apk` 또는 Android Studio로 설치한다.
4. 실제 Android 기기에서 가로 화면·터치·오프라인을 [수동 테스트 계획](TEST_PLAN.md)의 배포 시나리오로 확인한다.

빌드 스크립트는 파일 생성과 Gradle 종료 코드만 자동 판정한다. 실제 브라우저 렌더, Android WebView 입력, 설치·오프라인·성능은 기기 수동 검증이 필요하다.
