# Linux Dedicated Server SIGTERM → Graceful Drain CI 검증 안내 (로드맵 28)

## 목적

Windows 로컬 개발 PC에는 WSL/Docker가 없어 Linux x86_64 ELF 데디케이티드 서버의 실제 기동과 POSIX `SIGTERM` → Godot `NOTIFICATION_WM_CLOSE_REQUEST` → `drain_started` → 신규 입장 거부(`draining`) → 기존 플레이어 퇴장 → `exit 0` 흐름을 직접 실행할 수 없다.

이를 위해 Linux 전용 자동 검증 스크립트와 GitHub Actions(`ubuntu-latest`) 워크플로우 템플릿을 제공한다.

## 산출물

- 검증 스크립트: [verify-linux-ds-sigterm.cjs](../../forge/Tools/dedicated-server/verify-linux-ds-sigterm.cjs)
- GitHub Actions 워크플로우 템플릿: [linux-ds-sigterm.workflow.yml](../../forge/Tools/dedicated-server/linux-ds-sigterm.workflow.yml)
  - `.github/workflows/**` 경로는 `PlayHub-Platform` 단독 소유(`owners.json`)이므로 `Forge-Multiplayer` 브랜치에 템플릿을 유지한다. `PlayHub-Platform` 통합 시 `.github/workflows/linux-ds-multiplayer.yml`로 승격한다.

## 검증 절차 (Linux 호스트 / CI `ubuntu-latest`)

1. `export-linux-ds.cjs`로 `dedicated_server=true` Linux x86_64 ELF(`playforge-ds.x86_64`)를 export한다.
2. Export된 Linux ELF를 `--headless`로 기동하고 `dedicatedServerFeature == true`를 확인한다.
3. 클라이언트 2명을 접속시켜 `PHASE_PLAY` 진입 및 `possessed`를 확인한다.
4. 서버 프로세스에 실제 POSIX `SIGTERM`을 전송하고 `drain_started(reason="close_request")`를 확인한다.
5. drain 중 신규 입장 probe가 `join_refused(reason="draining")`로 차단되는지 확인한다.
6. 기존 클라이언트 퇴장 허용 후 `drain_complete(forced=false, remaining=0)`와 서버 종료 코드 `0`을 판정한다.

## 로컬 Windows에서 계약 확인

```sh
node forge/Tools/dedicated-server/verify-linux-ds-sigterm.cjs --dry-run --json
```

비Linux 호스트에서 `--dry-run` 없이 실행하면 거짓 통과를 보고하지 않고 종료 코드 `3`으로 미지원 사유를 출력한다.
