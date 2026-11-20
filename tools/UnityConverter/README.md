# Unity → Godot 자동 포팅 도구 (`tools/UnityConverter`)

`Forge-UnityPort` 브랜치에서 Unity 프로젝트를 분석하고 Godot 4.7.2 프로젝트로 자동 포팅·검증하는 도구입니다.

## 첫 번째 실증 대상: Unity 공식 **2D Roguelike (`Scavengers`)**
- **원본 Unity 공식 샘플**: https://github.com/omiroshn/2DRoguelike (Unity Technologies 공식 2D Roguelike 학습 프로젝트, Unity 5.6.7f1)
- **기존 커뮤니티 타 엔진 포팅 사례**: https://github.com/kone9/Rogue-en-Godot-cSharp (Godot 3.x Mono C# 수동 재구현)
- **전/후 비교 보고서**: [comparison-report.md](reports/comparison-report.md)

## 폴더 구조

```text
tools/UnityConverter/
├── mappings/
│   └── unity-core-api.v0.json       # Unity→Godot 4.7.2 D/A/R/X Capability Registry
├── src/
│   ├── unity-analyzer.mjs           # Unity 프로젝트 정적 분석 (바이너리 .prefab/.anim/.unity + .meta + .aif + C#)
│   ├── aiff-to-wav.mjs              # 순수 Node.js AIFF(16/24-bit BE PCM) → WAV(16-bit LE PCM) 변환기
│   └── unity-to-godot-port.mjs      # Unity 2D Roguelike → Godot 4.7.2 자동 포팅 실행기
├── samples/
│   └── unity-2d-roguelike/          # 원본 Unity 공식 샘플
├── ported/
│   └── godot-2d-roguelike/          # 포팅 산출물 (Godot 4.7.2 실행 가능 프로젝트)
├── reports/
│   ├── before-unity-metrics.json    # 포팅 전 Unity 분석 JSON
│   ├── after-godot-metrics.json     # 포팅 후 Godot 메트릭 JSON
│   ├── godot-runtime-verification.json # Godot 4.7.2 E2E 검증 결과 (21/21 PASS)
│   ├── comparison-report.md         # 포팅 전/후 비교 리포트
│   └── screenshots/                 # Godot 4.7.2 실행 캡처 5장
└── tests/
    └── unity-converter.test.mjs     # Node.js 자동화 회귀 테스트
```

## 실행 방법

```powershell
# 1. Unity 원본 분석 + Godot 4.7.2 자동 포팅 실행
node tools/UnityConverter/src/unity-to-godot-port.mjs

# 2. Godot 4.7.2 헤드리스 임포트 검증
D:\Github\GoDotProjects\Godot_v4.7.2-stable_win64_console.exe --headless --path tools/UnityConverter/ported/godot-2d-roguelike --import --quit

# 3. Godot 4.7.2 런타임 E2E 검증 + 스크린샷 5장 캡처
D:\Github\GoDotProjects\Godot_v4.7.2-stable_win64_console.exe --path tools/UnityConverter/ported/godot-2d-roguelike "res://tests/verify_and_capture.tscn"

# 4. 포팅된 게임 직접 플레이
D:\Github\GoDotProjects\Godot_v4.7.2-stable_win64.exe --path tools/UnityConverter/ported/godot-2d-roguelike

# 5. 변환기 자동화 회귀 테스트
node --test tools/UnityConverter/tests/unity-converter.test.mjs
```
