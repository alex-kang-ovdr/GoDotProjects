# Unreal Engine → Godot 자동 포팅 도구 (`tools/UnrealConverter`)

`Forge-UnrealPort` 브랜치에서 Unreal Engine(UE4/UE5) 게임 샘플 프로젝트를 분석해 **PlayForge Unified Game IR v0.1**로 추출하고, **Godot 4.7.2** 프로젝트로 자동 변환·헤드리스 실행·Trace 비교·AI 보정·PlayForge 템플릿 내보내기까지 수행하는 파이프라인입니다.

## 아키텍처

```text
Unreal Project (Read-Only)
   ├── unreal-extractor/ (C++ Editor Module + Python Automation + Offline Node Extractor)
   v
Unified Game IR v0.1 (common-ir/schema + validators)
   ├── Coordinate Transform (UE cm LH Z-Up -> Godot m RH Y-Up)
   ├── License Policy Filter (UE EULA 자산 제외 + 절차적 대체 + 진단 리포트)
   v
Godot 4.7.2 Generator (src/blueprint-compiler.mjs + src/godot-generator.mjs)
   ├── .tscn / .gd / project.godot / InputMap / Source Map
   ├── forge/Godot/addons/playforge_unreal_compat (UnrealCompat + UECharacterMovement)
   v
Godot 4.7.2 Headless Verification -> Trace Comparison (§7) -> AI Repair Loop -> PlayForge Template
```

## PoC 대상 샘플 (P0)
- **Third Person Template** (`fixtures/third-person-template/`)
  - `UECharacterMovement` 호환 런타임 (`max_walk_speed_cm=500`, `jump_z_velocity_cm=700`, `gravity_scale=1.75`, `air_control=0.35`, 경사각 `44.7°`, 스텝 높이 `45cm`)
  - Blueprint `BP_ThirdPersonCharacter` → GDScript 컴파일 + Source Map + 미지원 노드(`SpawnNiagaraSystemAtLocation`) 탐지 및 AI 보정 루프 검증
  - PlayForge 템플릿 출력: `forge/Templates/unreal-third-person/`

## 실행 방법

```powershell
# 1. 전체 파이프라인 실행 (추출 -> IR 검증 -> Godot 생성 -> 4.7.2 헤드리스 Trace 검증 -> AI 보정 -> 템플릿 내보내기)
node tools/UnrealConverter/src/port-cli.mjs

# 2. 단위·통합 회귀 테스트 (6/6 PASS)
node --test tools/UnrealConverter/tests/unreal-converter.test.mjs
```
