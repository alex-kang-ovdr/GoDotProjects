# Ball Simulator M1 Test

이 프로젝트는 `BallSimulator` 포팅의 M1 고정 step 탄도 계약을 자동·수동으로 확인하는 독립 Godot 테스트 프로젝트다. `RigidBody3D`, `CollisionShape3D`, `PhysicsServer3D`를 만들거나 변경하지 않으며, 공의 위치는 순수 수치 적분 결과로만 갱신한다.

## 자동화 테스트

공용 프레임워크의 Godot 대상을 사용한다.

```powershell
cd D:\Github\GoDotProjects-worktrees\godot-ball-simulator-test\BallSimulatorTest
.\Tools\Testing\Run-GameTests.bat --list
.\Tools\Testing\Run-GameTests.bat --suite ballistic
.\Tools\Testing\Run-GameTests.bat --suite all
```

## 수동 RHI

```powershell
.\Tools\Testing\Run-GameTests.bat --manual-rhi
```

기본 renderer는 D3D12다. GPU가 지원하지 않으면 `ProjectTests.json`의 `manual_rhi.rhi_arguments`를 `vulkan` 또는 `opengl3`로 바꾼다. M2부터 이 데모는 `PhysicsDirectSpaceState3D`를 **읽기 전용**으로만 사용하는 sphere sweep/ray query 어댑터를 연결한다.
