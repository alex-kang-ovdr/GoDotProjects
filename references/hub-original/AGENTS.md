# Repository workspace policy

- Use `D:\Github\UnrealSamples` as the canonical repository checkout.
- Put every linked worktree directly under `D:\Github\UnrealSamples-worktrees\<worktree-name>`.
- Do not add intermediate directories such as `codex/`, a repository name, or a branch group below the worktree root.
- A branch may keep a `codex/` prefix; remove that prefix only from its worktree directory name.
- Do not start new work from `E:\EpicGamesSamples\UnrealSamples` or its old worktrees. The E drive is legacy migration source only.
- Before modifying files, verify `git rev-parse --show-toplevel` resolves to the D repository or one of its D worktrees.
- Preserve uncommitted changes when relocating a worktree and verify every registered path with `git worktree list`.

Create a worktree with an explicit flat target path, for example:

```powershell
git -C D:\Github\UnrealSamples worktree add D:\Github\UnrealSamples-worktrees\feature-name codex/feature-name
```

## 공통 마일스톤 규칙

- 마일스톤은 10개로 관리하고 테스트 추가, 구현, 측정, 계획 수정의 피드백 루프를 반복한다.
- 마일스톤 완료 검증은 RHI를 활성화한 가시 창에서 실행하여 진행 과정을 볼 수 있게 한다. `-nullrhi`, `-norhi`, `-RenderOffScreen`은 사용하지 않는다.
- 테스트 진행 화면은 넓은 TopDown 뷰를 사용하고 SkyLight와 DirectionalLight를 배치한다.
- 각 마일스톤에는 `Docs/Milestones/MNN.html` 완료 보고서 정확히 하나만 둔다. 재검증은 같은 파일을 갱신한다.
- 보고서에는 CSV 통계, 객체 수 대비 성능 그래프, 남은 위험, 계획 수정, 다음 마일스톤을 포함한다.
- 작업에 진전이 생기거나 문제가 해결되거나 새 산출물이 만들어질 때마다 현재 브랜치와 전용 worktree에 검증 근거가 있는 한국어 체크포인트 커밋을 남긴다.
- 공용 기능은 `main` 브랜치에서 작업하고 커밋 제목을 `[Common]`으로 시작한다. 프로젝트 전용 변경은 해당 프로젝트 브랜치와 worktree에만 둔다.
