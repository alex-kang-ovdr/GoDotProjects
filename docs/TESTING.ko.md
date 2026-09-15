# 테스트 실행 가이드

## 공용 Python 프레임워크

`tools/test_framework.py`는 프로세스 실행, timeout, per-suite log, JSON summary를 공통으로 제공한다. 프로젝트별 suite 선택과 Godot/C++ 명령 구성은 `tools/run_tests.py`에만 둔다.

```powershell
cd D:\Github\GoDotProjects-worktrees\godot-ball-simulator-plugin
python tools\run_tests.py --list
python tools\run_tests.py --suite smoke
python tools\run_tests.py --suite naming-contract
python tools\run_tests.py --suite core-unit
python tools\run_tests.py --suite all
```

자동 테스트 결과는 `reports/<UTC timestamp>/summary.json`과 suite별 `.log`/`.json`에 남긴다. `reports/`와 native build 산출물은 Git에 넣지 않는다.

## 수동 RHI 실행

```powershell
python tools\run_tests.py --suite rhi-manual --rhi-driver d3d12
```

이 명령은 Godot 창을 열고 자동 종료하지 않는다. Godot 4.7.2의 `--rendering-driver d3d12`를 사용하며, GPU·드라이버에서 D3D12가 지원되지 않으면 `--rhi-driver vulkan` 또는 `--rhi-driver opengl3`로 바꿔 실행한다.

M1의 RHI scene은 엔진 렌더러와 수동 실행 경로만 검증한다. 실제 시뮬레이터가 Godot에 바인딩되기 전이므로 물리 정확도 통과를 의미하지 않는다.

## 공통 환경 변수

- `GODOT_BIN`: Godot 콘솔 실행 파일 경로. `--godot` 인자가 있으면 그 경로가 우선한다.
- `CXX`: `VsDevCmd.bat` 또는 표준 라이브러리가 구성된 C++ 컴파일러 경로. `--cxx` 인자가 있으면 그 경로가 우선한다.

기본 Windows 환경에서는 Godot 4.7.2 콘솔 실행 파일과 Visual Studio 2022 `VsDevCmd.bat`를 자동 탐색한다. Visual Studio 환경이 없으면 LLVM `clang++`를 fallback으로 찾지만, 이 경우 MSVC/Windows SDK 표준 라이브러리 경로가 이미 구성돼 있어야 한다.
