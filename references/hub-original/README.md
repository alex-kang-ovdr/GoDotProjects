# UnrealSamples

Unreal Engine 샘플 프로젝트를 공용 저장소와 브랜치별 워크트리로 관리합니다.

## 고정 작업 경로

- 기본 저장소: `D:\Github\UnrealSamples`
- 워크트리 루트: `D:\Github\UnrealSamples-worktrees`
- 브랜치 워크트리: `D:\Github\UnrealSamples-worktrees\<워크트리명>`

워크트리는 반드시 워크트리 루트의 직접 자식으로 둡니다. 브랜치 이름이
`codex/character-movement-example`이어도 경로는 다음과 같이 `codex/` 중간 폴더 없이 사용합니다.

```text
D:\Github\UnrealSamples-worktrees\character-movement-example
```

`E:\EpicGamesSamples\UnrealSamples`와 그 아래 워크트리는 이전 경로이므로 새 작업에 사용하지 않습니다.

## 워크트리 확인

```powershell
git -C D:\Github\UnrealSamples worktree list
git rev-parse --show-toplevel
```

새 워크트리를 만들 때는 대상 경로를 명시합니다.

```powershell
git -C D:\Github\UnrealSamples worktree add `
  D:\Github\UnrealSamples-worktrees\sample-name `
  codex/sample-name
```

## Codex 공용 지침

- 저장소 전체 규칙: `AGENTS.md`
- 항상 적용되는 경로 규칙: `.cursor/rules/worktree-location.mdc`
- 워크트리 생성·이관 스킬: `.cursor/skills/unreal-worktree/SKILL.md`
