# Ball Simulator 기능 검증

이 워크트리는 데모 구현과 테스트 실행기를 분리한다. `BallSimulatorDemo`의 Godot headless suite를 직접 재구현하지 않고, 공용 `game-test-framework` Godot 대상으로 호출해 기능 계약을 검증한다.

기본 경로는 다음의 인접 워크트리다.

- 데모: `D:\Github\GoDotProjects-worktrees\godot-ball-simulator-demo\BallSimulatorDemo`
- 프레임워크: `D:\Github\GoDotProjects-worktrees\game-test-framework-godot`

다른 배치에서는 `BALL_SIMULATOR_DEMO_ROOT`, `GAME_TEST_FRAMEWORK_ROOT` 환경 변수로 변경할 수 있다.

```powershell
cd D:\Github\GoDotProjects-worktrees\godot-ball-simulator-tests\BallSimulatorVerification
python tools\run_demo_verification.py --list
python tools\run_demo_verification.py --suite ballistic
python tools\run_demo_verification.py --suite all
python -m unittest discover -s tests -v
```

수동 renderer 실행은 공용 프레임워크에 위임한다. 먼저 명령을 검증하고, 필요할 때만 창을 연다.

```powershell
python tools\run_demo_verification.py --manual-rhi --dry-run
python tools\run_demo_verification.py --manual-rhi
```

자동화는 `smoke`, `ballistic`, `isolation`을 개별 선택할 수 있다. `isolation`은 M1 데모가 Godot CollisionWorld body를 만들거나 변경하지 않는지 확인한다. M2에서는 같은 실행기를 sphere sweep/ray query의 read-only 회귀 검증으로 확장한다.
