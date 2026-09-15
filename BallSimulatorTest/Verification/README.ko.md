# Ball Simulator 기능 검증

이 디렉터리는 테스트 구현과 검증 진입점을 한 프로젝트에 통합한다. `BallSimulatorTest`의 Godot headless suite를 직접 재구현하지 않고, 공용 `game-test-framework` Godot 대상으로 호출해 기능 계약을 검증한다.

기본 경로는 현재 데모 프로젝트와 인접 공용 프레임워크 워크트리다.

- 테스트: `D:\Github\GoDotProjects-worktrees\godot-ball-simulator-test\BallSimulatorTest`
- 프레임워크: `D:\Github\GoDotProjects-worktrees\game-test-framework`

다른 배치에서는 `BALL_SIMULATOR_TEST_ROOT`, `GAME_TEST_FRAMEWORK_ROOT` 환경 변수로 변경할 수 있다.

```powershell
cd D:\Github\GoDotProjects-worktrees\godot-ball-simulator-test\BallSimulatorTest\Verification
python tools\run_ball_sim_verification.py --list
python tools\run_ball_sim_verification.py --suite ballistic
python tools\run_ball_sim_verification.py --suite all
python -m unittest discover -s tests -v
```

수동 renderer 실행은 공용 프레임워크에 위임한다. 먼저 명령을 검증하고, 필요할 때만 창을 연다.

```powershell
python tools\run_ball_sim_verification.py --manual-rhi --dry-run
python tools\run_ball_sim_verification.py --manual-rhi
```

자동화는 `smoke`, `ballistic`, `isolation`을 개별 선택할 수 있다. `isolation`은 M1 데모가 Godot CollisionWorld body를 만들거나 변경하지 않는지 확인한다. M2에서는 같은 실행기를 sphere sweep/ray query의 read-only 회귀 검증으로 확장한다.
