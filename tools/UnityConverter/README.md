# Unity → Godot 자동 포팅 도구 (`tools/UnityConverter`)

`Forge-UnityPort` 브랜치에서 Unity 공식 샘플 4종(2D 2종 + 3D 2종)을 분석·자동 포팅하고 Godot 4.7.2 런타임에서 E2E 검증 및 인게임 비교 스샷을 생성하는 도구입니다.

## 실증 완료 게임 4종
1. **2D Roguelike (`Scavengers`)** — 2D 픽셀 턴제 (원본: https://github.com/omiroshn/2DRoguelike / 기존 포팅: https://github.com/kone9/Rogue-en-Godot-cSharp) — **21/21 PASS**
2. **Roll-a-Ball** — 3D 물리 수집 (원본: https://github.com/fgrehm/unity3d-roll-a-ball / 기존 포팅: https://github.com/RussoFaccin/godot-roll_a_ball) — **8/8 PASS**
3. **Flappy Bird** — 2D 아케이드 UV 패럴랙스 (원본: https://github.com/zigurous/unity-flappy-bird-tutorial) — **6/6 PASS**
4. **Space Shooter** — 3D 탑다운 슈터 FBX + TIFF→PNG (원본: https://github.com/naps62/unity3d-space-shooter / 기존 포팅: https://github.com/sarooptech/PlaneShooter) — **7/7 PASS**

- **종합 비교 보고서**: [comparison-report.md](reports/comparison-report.md)

## 실행 방법

```powershell
# 1. 4종 자동 포팅 실행
node tools/UnityConverter/src/unity-to-godot-port.mjs
node tools/UnityConverter/src/port-roll-a-ball.mjs
node tools/UnityConverter/src/port-flappy-bird.mjs
node tools/UnityConverter/src/port-space-shooter.mjs

# 2. 4종 Godot 4.7.2 E2E 검증 및 캡처
$godot = "D:\Github\GoDotProjects\Godot_v4.7.2-stable_win64_console.exe"
& $godot --path tools/UnityConverter/ported/godot-2d-roguelike "res://tests/verify_and_capture.tscn"
& $godot --path tools/UnityConverter/ported/godot-roll-a-ball "res://tests/verify_and_capture.tscn"
& $godot --path tools/UnityConverter/ported/godot-flappy-bird "res://tests/verify_and_capture.tscn"
& $godot --path tools/UnityConverter/ported/godot-space-shooter "res://tests/verify_and_capture.tscn"

# 3. Node.js 통합 회귀 테스트 (5/5 PASS)
node --test tools/UnityConverter/tests/unity-converter.test.mjs
```
