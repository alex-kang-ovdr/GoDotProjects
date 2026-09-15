# Voxel Frontier 에셋·리소스 용량 및 플랫폼 출력 분석

기준일: 2026-09-15
프로젝트: `D:\Github\GoDotProjects\MinecraftDungeonGodot`
엔진: Godot 4.7.2, GL Compatibility
대상: Windows PC, Android ARM64, iOS

## 판정 요약

현재 작업 폴더 전체는 **540.75MiB**지만, 이 값은 게임 배포 크기가 아니다. 검증 산출물 `Saved/Verification` 334.88MiB와 이전 빌드 산출물 183.23MiB가 대부분을 차지한다.

실행에 필요한 소스 후보는 약 **2.16MiB**이며, Windows x86_64 release를 실제 export한 결과는 다음과 같다.

- 실행 파일: **104.07MiB** (`.exe`)
- 게임 데이터: **0.46MiB** (`.pck`)
- PC 합계: **104.53MiB**

Android ARM64 debug APK는 실제 export·서명까지 통과했으며 **27.41MiB**다. Shipping APK는 release 키스토어가 없어 아직 배포 가능한 출력으로 판정하지 않는다. iOS는 현재 preset이 없고 Windows 호스트의 IPA export를 실행하지 않았다.

## 작업 폴더 용량

| 영역 | 용량 | 배포 의미 |
|---|---:|---|
| `Saved/Verification` | 334.88MiB | 테스트 PNG/JSON/로그. 배포 제외 |
| `build` | 183.23MiB | APK·PCK·EXE·idsig. 배포 제외 |
| `StatusReport` | 14.37MiB | HTML·문서 ZIP·스크린샷. 배포 제외 |
| `.godot` | 2.86MiB | editor/import cache. export 입력이 아닌 생성 캐시 |
| `assets` | 3.75MiB | GLB 원본·import 메타데이터. canonical 자산과 임시 중복 포함 |
| `Docs` | 0.29MiB | Markdown 설계·검토 문서. 배포 제외 |
| `scripts` | 0.26MiB | GDScript·shader·UID |
| `tools` | 0.29MiB | 스모크·벤치마크 도구. 배포 제외 |
| `tests` | 0.01MiB | 자동 테스트. 배포 제외 |

`Saved/Verification` 세부는 PNG 266.78MiB, JSON 65.99MiB, 로그 1.82MiB다. 이 폴더를 APK·PCK에 포함하면 개발 검증 자료가 게임 설치 용량을 오염시킨다.

## 런타임 에셋과 포맷

### Canonical Authored Cuboids 자산

실제 런타임에서 참조하는 원본은 `assets/minecraft_character_generator/authored13/`이다.

| 포맷 | 파일 수 | 용량 | 용도 |
|---|---:|---:|---|
| `.glb` | 13 | 1.86MiB | 메시·리깅·Idle/Walk/Run/Jump/Attack 애니메이션 |
| `.import` | 13 | 0.01MiB | Godot import 메타데이터 |
| `.json` | 1 | 0.01MiB | 13종 manifest·SHA-256·클립 목록 |

13종 GLB는 Mario, Luigi, Wario, Yoshi, Kirby, Creeper, Steve, Luffy, Pig, Volt Mouse, Eevee, Roblox R6, Roblox R15다. 가장 큰 파일은 `roblox_r15.glb` 238.0KiB이고, 가장 작은 파일은 `kirby.glb` 112.9KiB다.

`assets/monsters/`에는 이전 복사 작업의 중복 GLB가 남아 있다. 현재 `MobDirector`는 canonical catalog를 사용하고 export preset은 이 중복 폴더를 제외한다. 저장소 용량을 더 줄이려면 중복 폴더를 별도 정리 대상으로 삼는다.

### 코드·씬 포맷

- `.gd`: Godot 런타임·생성기·UI·몬스터 AI 소스. export 시 플랫폼 pack에 컴파일된 스크립트 형태로 들어간다.
- `.gdc`: Windows PCK에 포함된 export 컴파일 스크립트.
- `.tscn`: `main.tscn`, authored gallery 등 Godot 씬.
- `.gdshader`: 복셀 로그 재질 shader.
- `.glb`: Godot가 import한 메시/스켈레톤/애니메이션 PackedScene 의존성으로 변환된다.
- `.png`, `.html`, `.md`, `.zip`, 테스트 JSON·로그: 리포트 자산이며 현재 preset에서 제외한다.

## 플랫폼별 실제 출력

### Windows PC

Preset: `Windows x86_64 Release`
명령: `Godot --headless --export-release "Windows x86_64 Release" ...`

| 출력 | 크기 | 포맷·비고 |
|---|---:|---|
| `VoxelFrontier-windows-x86_64-release.exe` | 104.07MiB | Godot Windows x86_64 release template + 실행 코드 |
| `VoxelFrontier-windows-x86_64-release.pck` | 0.46MiB | 압축된 프로젝트 리소스·compiled scripts·canonical GLB 의존성 |
| 합계 | **104.53MiB** | 두 파일을 함께 배포해야 함 |

PC output은 실제 export 성공을 확인했다. `.exe`만 전달하면 PCK가 없어 게임 데이터가 누락된다.

### Android (AOS)

Preset: `Android ARM64 Debug`
ABI: `arm64-v8a`
출력 포맷: 단일 signed debug `.apk`

| 출력 | 크기 | 상태 |
|---|---:|---|
| `VoxelFrontier-arm64-debug.apk` | **27.41MiB** | 실제 export·debug 서명·검증 성공 |
| `.idsig` | 0.22MiB | debug incremental install 보조 파일, 배포 APK에 포함하지 않음 |

`Android ARM64 Shipping` preset은 release keystore를 비워 두었다. 현재 `Build-Android-Shipping.bat`은 키스토어가 없으면 exit code 3으로 중단하며, 이전 unsigned staging APK는 shipping 용량 근거로 사용하지 않는다. release 키스토어 설정 후 같은 preset을 재export해야 최종 shipping 용량을 확정할 수 있다.

Android export는 `Docs`, `StatusReport`, `Saved`, `tools`, `tests`, `assets/monsters`, `build`, `*.zip`을 제외한다. 현재 APK 크기에는 엔진 Android ARM64 런타임, 앱 리소스, debug 서명/개발 메타데이터가 함께 들어간다.

### iOS

현재 `export_presets.cfg`에는 iOS preset이 없다. Windows에서 `--export-release iOS`를 시도한 결과, 유효한 preset 이름이 아니라는 오류로 중단됐다. 따라서 현재 IPA 크기, Mach-O slice, App Store archive 크기를 측정했다고 주장하지 않는다.

iOS의 예상 게임 리소스 payload는 같은 export filter를 적용할 때 PC PCK의 **0.46MiB를 참고값**으로 삼을 수 있으나, 최종 IPA 크기는 다음 항목 때문에 별도 측정이 필요하다.

- iOS export template와 arm64 device slice
- Xcode archive 및 code signing
- Metal용 import/texture 변환
- bitcode/strip·App Store thinning 여부

iOS 확정 측정은 macOS + Xcode에서 iOS preset을 만든 뒤 `.ipa` 또는 archive를 export하고, `Payload/*.app` 내부의 resource payload와 전체 archive를 각각 기록해야 한다.

## 현재 export 필터

세 Android preset과 Windows preset은 다음을 제외한다.

```text
res://Docs/**
res://StatusReport/**
res://Saved/**
res://tools/**
res://tests/**
res://assets/monsters/**
res://build/**
res://*.zip
```

이 필터는 문서·검증 데이터·이전 APK·임시 중복 모델이 배포 리소스로 유입되는 것을 막는다. 실제 output PCK/APK에 포함되는 canonical GLB와 compiled script는 export 로그에서 확인했다.

## 권장 관리 기준

1. release·debug 공통으로 `res://build/**`와 `Saved/Verification/**`를 계속 제외한다.
2. canonical 모델은 `assets/minecraft_character_generator/authored13/` 하나만 유지하고 `assets/monsters/` 중복은 정리한다.
3. Android shipping은 release keystore를 프로젝트 외부 안전 경로에서 설정하고 비밀번호를 Git에 저장하지 않는다.
4. PC는 `.exe + .pck`를 한 쌍으로 배포한다.
5. iOS는 macOS/Xcode export 후 IPA 전체, `.app` 내부 payload, App Store thinning 결과를 별도 기록한다.
6. 용량 최적화 전후에는 같은 시드·같은 캐릭터 13종·같은 130마리 스폰 조건으로 기능 스모크와 화면 회귀를 다시 실행한다.

## 근거 파일

- [export_presets.cfg](../export_presets.cfg)
- [Build-Android-Debug.bat](../Build-Android-Debug.bat)
- [Build-Android-Shipping.bat](../Build-Android-Shipping.bat)
- [canonical asset manifest](../assets/minecraft_character_generator/manifest-authored13.json)
- [Windows release EXE](../build/VoxelFrontier-windows-x86_64-release.exe)
- [Windows release PCK](../build/VoxelFrontier-windows-x86_64-release.pck)
- [Android debug APK](../build/VoxelFrontier-arm64-debug.apk)
