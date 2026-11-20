# Roblox → Godot 자동 포팅 도구 (`tools/RobloxConverter`)

`Forge-RobloxPort` 브랜치가 소유하는 Roblox Studio / Luau → Godot 4.7.2 / GDScript 변환 파이프라인과 호환 런타임(`forge/Godot/addons/playforge_roblox_compat`) 작업 영역입니다.

- 기술 리서치 원본: [Roblox_to_Godot_API_Mapping_Research.md](docs/Roblox_to_Godot_API_Mapping_Research.md)
- 실험용 프로토타입(v0.1 기준선): [lab/index.html](lab/index.html) (`Roblox_Godot_Converter_Lab_v0_1.zip` 적재본, 정규식 휴리스틱 기준선)
- API 레지스트리: [mappings/core-api.v0.json](mappings/core-api.v0.json) (v0 기준선) / [mappings/core-api.v1.json](mappings/core-api.v1.json) (PoC 확장 54개 API, D/A/R/X/V 등급)
- PoC 전/후 비교 리포트: [reports/poc-before-after-report.md](reports/poc-before-after-report.md) ([poc-before-after.json](reports/poc-before-after.json))

## 구조 및 전환 로드맵 (PoC 0 ~ 6)

```text
tools/RobloxConverter/
├─ docs/       # API 매핑 기술 리서치 문서
├─ lab/        # v0.1 브라우저 실험 UI (휴리스틱 기준선; AST 아님)
├─ mappings/   # Capability Registry (D / A / R / X / V 등급, 문맥·단위·검증 규칙)
├─ src/        # [PoC 1~4 완료] RBXLX Importer → API Analyzer → Luau Transpiler → Godot 4.7.2 Exporter CLI
├─ fixtures/   # [MIT] baseplate-413 (Roblox/rbx-test-files), chaos-obby (SBdevz/Chaos-Obby 7개 원본 스크립트)
├─ reports/    # PoC 전/후 비교 리포트, KPI JSON, Godot 4.7.2 실렌더링 스크린샷
└─ tests/      # Lab v0.1 회귀 테스트 + PoC E2E (Godot 4.7.2 컴파일 & 9/9 행동 검증)
```

1. **PoC 0 (완료)**: 리서치 + Converter Lab v0.1 적재 + `core-api.v0.json` 레지스트리 스키마 + 회귀 기준선 테스트.
2. **PoC 1~4 (완료)**:
   - `src/rbxlx-importer.mjs`: 공식 Roblox XML v4(`.rbxlx`) → Typed Roblox IR 파서 (`baseplate-413`, `ChaosObby` 검증)
   - `src/luau-analyzer.mjs` + `mappings/core-api.v1.json`: D/A/R/X/V 분류 및 `Unreported unsupported count = 0` 진단 리포트
   - `src/luau-transpiler.mjs` + `src/godot-exporter.mjs`: 구조적 Luau → GDScript 변환기 및 Godot 4.7.2 프로젝트(`.tscn`/`project.godot`/`addons`) 생성기
   - `forge/Godot/addons/playforge_roblox_compat/`: `0.28 m/stud` + 왼손→오른손 좌표/회전, Instance/Attribute/Signal 레지스트리, BasePart, Humanoid, Lighting, DataStore X등급 스텁
   - `forge/Tests/playforge_roblox_compat/verify_chaos_obby.gd`: Godot 4.7.2 실기 9/9 게임플레이 행동 검증 및 스크린샷 캡처
3. **PoC 5~6 (다음 단계)**: `AnimatableBody3D` 회전 발판 물리 동반, `Forge-RemoteControl`/`Forge-GamerQA` 연계, Tycoon(RemoteEvent)·Dynamic Luau(VM) 스파이크.

## 빠른 실행

```bash
# 단위 + Godot 4.7.2 E2E 행동 검증 테스트
node --test tools/RobloxConverter/tests/converter-lab.test.mjs tools/RobloxConverter/tests/poc-porting.test.mjs

# RBXLX → Godot 4.7.2 프로젝트 변환 CLI
node tools/RobloxConverter/src/port-cli.mjs tools/RobloxConverter/fixtures/chaos-obby/ChaosObby.rbxlx <출력폴더>
```
