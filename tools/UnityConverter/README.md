# Unity → Godot 4.7.2 결정론적 자동 포팅 도구 (`tools/UnityConverter`)

`Forge-UnityPort` 브랜치에서 Unity 공식 샘플 **6종(2D 2종 + 3D 4종, 공식 코옵 RPG `Boss Room` 포함)**을 분석해 **PlayForge Unified Game IR v0.1**로 결정론적 추출하고, **Godot 4.7.2** 프로젝트·정적 리소스(`.tres`/`.gdshader`/`.png`/`.wav`)·헤드리스 정적/런타임·픽셀 텔레메트리 게이트·JPG 비교 보드·PlayForge 텍스트 전용 템플릿까지 자동 생성하는 파이프라인입니다.

## 아키텍처 (UnrealConverter 동일 결정론적 코어 + 오케스트레이터)

```text
Unity Project (Read-Only: YAML / Binary SerializedFile v15 / FBX / TGA / TIFF / AIFF / C#)
   ├── src/unity-ir-extractor.mjs + src/unity-transform.mjs
   v
Unified Game IR v0.1 (common-ir/schema + validators/validate-ir.mjs)
   ├── Exact Coordinate/Color Transforms (Unity LH Y-Up -> Godot RH Y-Up, Gamma -> Linear, Ortho 2x)
   ├── SHA-256 Asset Audit + C# API Capability Matrix (mappings/unity-core-api.v0.json)
   v
Deterministic Resource Compilers (src/deterministic-compilers.mjs, Idempotent writeIfChanged)
   ├── Static PBR .tres (EMISSION_OP_MULTIPLY) & .gdshader (URP MetalSmoothEmissive Rune Pulse)
   ├── TGA/TIFF -> PNG + AIFF -> 16-bit PCM WAV + JPG Visual Evidence Compression (q84, <=1400px)
   v
Orchestrator Verification Gates (src/orchestrator.mjs + src/port-cli.mjs)
   ├── Static GDScript --check-only Gate (33/33 scripts)
   ├── Live GPU E2E (--fixed-fps 60, 64/64 PASS) + Visual Pixel Telemetry Gate
   ├── Bounded Deterministic Repair Loop (max 2 iterations)
   v
Completeness Scorecard (audit/unity-orchestration-report.json + audit/FAILED_ASSETS_TODO.md)
   └── PlayForge Text-Only Templates (forge/Templates/unity-*)
```

## 실증 완료 게임 6종 (총 328개 Unity 에셋 100% 가용 · E2E 64/64 PASS)
1. **2D Roguelike (`Scavengers`)** — 2D 픽셀 턴제 · **21/21 PASS** · `forge/Templates/unity-2d-roguelike`
2. **Roll-a-Ball** — 3D 물리 수집 · **8/8 PASS** · `forge/Templates/unity-roll-a-ball`
3. **Flappy Bird** — 2D UV 패럴랙스 · **6/6 PASS** · `forge/Templates/unity-flappy-bird`
4. **Space Shooter** — 3D FBX + TIFF→PNG · **7/7 PASS** · `forge/Templates/unity-space-shooter`
5. **Tanks! 3D** — 3D 2P 대전 (Binary `SerializedFile v15` 103 메시 + 41 콜라이더 + 26 FBX) · **11/11 PASS** · `forge/Templates/unity-tanks-3d`
6. **Boss Room** — 공식 4인 코옵 3D RPG (URP `MetalSmoothEmissive` 3채널 언패킹 + `@rpc` `ActionBus` + Tank `ChargedShield` 스턴 카운터) · **11/11 PASS** · `forge/Templates/unity-boss-room`

- **종합 비교 보고서**: [comparison-report.md](reports/comparison-report.md)
- **오케스트레이션 감사 리포트**: [unity-orchestration-report.json](audit/unity-orchestration-report.json) / [FAILED_ASSETS_TODO.md](audit/FAILED_ASSETS_TODO.md)

## 실행 방법

```powershell
# 1. 전체 6종 결정론적 파이프라인 실행 (IR 추출 -> 정적 컴파일 -> --check-only -> GPU E2E/픽셀 게이트 -> JPG 압축 -> 감사 리포트)
node tools/UnityConverter/src/port-cli.mjs --sample all

# 단일 샘플만 실행 (재빌드 포함)
node tools/UnityConverter/src/port-cli.mjs --sample boss-room --rebuild

# 2. PlayForge 텍스트 전용 템플릿 6종 내보내기
python tools/UnityConverter/src/export_to_forge_templates.py

# 3. Node.js 단위·통합 회귀 테스트 (12/12 PASS)
node --test tools/UnityConverter/tests/unity-converter.test.mjs
```
