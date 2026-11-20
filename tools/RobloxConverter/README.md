# Roblox → Godot 자동 포팅 도구 (`tools/RobloxConverter`)

`Forge-RobloxPort` 브랜치가 소유하는 Roblox Studio / Luau → Godot 4.7.2 / GDScript 변환 파이프라인과 호환 런타임(`forge/Godot/addons/playforge_roblox_compat`) 작업 영역입니다.

- 기술 리서치 원본: [Roblox_to_Godot_API_Mapping_Research.md](docs/Roblox_to_Godot_API_Mapping_Research.md)
- 실험용 프로토타입(v0.1): [lab/index.html](lab/index.html) (`Roblox_Godot_Converter_Lab_v0_1.zip` 적재본, 정규식 휴리스틱 실험용)
- 초기 API 레지스트리: [mappings/core-api.v0.json](mappings/core-api.v0.json)

## 구조 및 전환 로드맵 (PoC 0 ~ 6)

```text
tools/RobloxConverter/
├─ docs/       # API 매핑 기술 리서치 문서
├─ lab/        # v0.1 브라우저 실험 UI (휴리스틱 기준선; AST 아님)
├─ mappings/   # Capability Registry (D / A / R / X / V 등급, 문맥·단위·검증 규칙)
├─ src/        # [PoC 1~3] RBXLX/Rojo Importer → Luau AST → Typed IR → GDScript/TSCN 생성기
├─ fixtures/   # [PoC 1~5] Moving Platform, Obby, Physics Playground, Tycoon Minimal, Dynamic Luau
└─ tests/      # 변환기 · 매핑 완전성 · 행동 비교 테스트
```

1. **PoC 0 (현재)**: 리서치 + Converter Lab v0.1 적재 + `core-api.v0.json` 레지스트리 스키마 + 회귀 기준선 테스트.
2. **PoC 1~2 (입력·씬 출력)**: RBXLX/RBXMX + Rojo Importer → Typed Roblox IR → `.tscn`/`.tres`/`project.godot` 출력 및 Godot 4.7.2 headless import 통과.
3. **PoC 3 (언어·매핑)**: Luau AST → `native / adapter / VM / unsupported` 분류 + 진단 리포트(`Unreported unsupported count = 0`).
4. **PoC 4 (호환 런타임)**: `playforge_roblox_compat` 애드온(`RobloxInstance` ID/원본명 레지스트리, `0.28 m/stud` 및 왼손→오른손 `CFrame`, `Signal`, `task`, `Tween`, `PartCompat`) 구현 및 Moving Platform 실행.
5. **PoC 5~6 (검증·확장)**: `Forge-RemoteControl` (`object.*`) + `Forge-GamerQA` 행동/스크린샷 diff 연계 및 Obby·Physics·Tycoon·Dynamic Luau 스파이크.
