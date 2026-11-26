# 28. 데디케이티드 서버·PIE·운영

- 원본 계획서: [`plans/28_Dedicated_Server_Runtime_Operations.md`](../plans/28_Dedicated_Server_Runtime_Operations.md) (ZIP 원문 SHA-256 대조 및 저장소 반입 완료)
- 통합 대상 브랜치: `Forge-Multiplayer` — 신규 (R0 착수, 25와 한 스파이크)
- 분류: 엔진 무변경 → Forge 계열
- 우선순위: P0/P1/P2 / 본체 공수: 20-32 PW / 착수 단계: R0
- 커밋 영역 성격: Script

## 저장소에 이미 있는 관련 자산

- package-windows-server.ps1, deploy/cloudrun (PlayHub-Platform 소유)
- PlayHub-GameDeploy
- native-runtime.cjs PIE (격리 없음)

## NetMode 실행·transport 계약

25번의 네 가지 `NetMode`를 프로세스 시작 계약으로 사용한다. `--netmode=<mode>`가 Forge bootstrap의 유일한 모드 인자이며 Godot 기본 CLI가 제공하는 옵션이 아니다.

| `--netmode` | 시작·렌더링 | 연결 동작 |
| --- | --- | --- |
| `dedicated-server` | `--headless`; 서버 권위 프로세스, 로컬 플레이어 슬롯 없음 | 서버 endpoint를 열고 readiness 전에 build/protocol/session 설정을 검증 |
| `listen-server` | 렌더링하는 권위 서버, 로컬 플레이어 슬롯 없음 | 서버 endpoint를 열어 remote client를 받음. 호스트 플레이는 별도 `client` 프로세스에서 수행 |
| `standalone` | 렌더링하는 단일 플레이 프로세스 | 네트워크 listener·client transport·JoinTicket 없이 실행 |
| `client` | 비권위 프로세스; `--headless` 봇 실행 허용 | DedicatedServer 또는 ListenServer에 접속; transport 연결과 서버 Ready를 별도로 확인 |

`--netmode`만 허용하며 다른 모드 인자 별칭은 제공하지 않는다. 원문은 `--session-id`를 제안하지만 현재 스파이크 지원을 보장하지 않는다.

## 첫 작업 (spike)

- 이미 구현된 Windows DS 스파이크를 재사용하고 결과·범위를 기록한다. 기존 구현을 새 이슈로 중복 분해하지 않는다.
- Linux ELF export는 성공했다. 해당 바이너리로 Linux에서 기동·접속·SIGTERM 종료를 확인하는 작업과 WSS Gateway 경로 검증을 별도로 잡는다.

## 승격 gate

- MVP: 로컬/단일 VM, lease·drain

## 진행 상태

- [x] 원본 계획서 반입
- [x] 첫 spike 이슈 분해 (`Forge-Multiplayer`: `run-ds-2clients.cjs`, `export-linux-ds.cjs`, `verify-linux-ds-sigterm.cjs`, `linux-ds-sigterm.workflow.yml`, `wss-reconnect.godot.test.cjs`)
- [x] spike 결과 기록 (Windows ENet/WSS DS+2clients 23/23 PASS, Linux x86_64 ELF 73.5MB export 완료, Linux SIGTERM→drain 검증기 및 GitHub Actions `ubuntu-latest` 워크플로우 템플릿 작성·dry-run 검증 완료; 실제 Linux 호스트 실행·WSS Gateway는 미검증으로 구분 기록)

## 원본 계획 대조

- 원본 WBS 참조: §9 9. WBS와 공수 (원본 116행); §10 10. 완료 기준 (원본 129행)
- 패키지 내 원문 SHA-256: `a3d0aa8f536fe5863c4570d90e5022b6493555639bb6c9ce3c4113e7868a3e6c`
- SSOT 적용: 로드맵 항목 28은 기존 배포·호스팅 계획에서 `godot-linux-wss-v1`의 Godot 런타임 구현만 맡는다. 제작자 게임 서버는 Godot DS이며 JoinTicket을 사용한다(SSOT.md §2).
