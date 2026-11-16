# 설치·업데이트·데이터 복구 운영 가이드 — 0.2.0

이 문서는 실제 제공된 Node 도구와 Windows IIS 스크립트의 사용 순서입니다. 목표 플랫폼의 대규모 운영 설계와 구분합니다. **Node 복구·운영 회귀 18개는 임시 DB와 로컬 HTTP에서 실행하여 통과했습니다. Windows PowerShell 5.1, IIS, 작업 스케줄러, NTFS 권한과 재부팅은 이 작성 환경에서 실행하지 않았습니다.** 대상 Windows PC의 결과는 직접 생성한 보고서로 판단합니다.

## 1. 운영 파일과 역할

| 파일·도구 | 실제 동작 | 데이터 영향 |
|---|---|---|
| `scripts/Install-IIS.ps1` | 별도 release 준비 → 빌드·검증 → 업데이트 전 DB 백업 → 설정·사이트·작업 전환 → HTTP 검사 | 기존 DB를 유지하며 새 코드 기동 시 지원되는 스키마 마이그레이션 |
| `scripts/Backup-Data.ps1` | 비공개 백업 폴더 권한을 설정하고 SQLite 온라인 백업 | 현재 DB는 그대로 두고 새 백업·해시 기록 생성 |
| `tools/restore-data.mjs` 기본 모드 | 백업 체크섬·무결성·외래키·플랫폼 스키마 검사 | 실행 중 서비스와 현재 DB를 바꾸지 않음 |
| `scripts/Restore-Data.ps1` | 사전 검사 → API 작업 비활성화·중지 → IIS 사이트 중지 → DB 복구 → 권한·기동·HTTP 검사 | 선택한 백업 시점으로 데이터를 되돌림. 교체 전 원본은 보존 |
| `scripts/Restore-PreviousRelease.ps1` | 이전 코드·설정·자신이 만든 LAN 방화벽 정책 복원 | DB를 과거 상태로 바꾸지 않음. 스키마 비호환이면 실행 전에 거부 |
| `scripts/Test-IIS.ps1` | 설치된 두 정적 사이트와 두 API의 HTTP 검사 | 서버가 QA로 분류한 테스트 저장·이벤트 생성 |
| `scripts/Test-PoC.ps1` | 설치 상태 관찰, HTTP 검사, 선택 브라우저 결과 종합 | DB 복구는 수행하지 않음 |

기본 설치 경로는 `C:\PlayHubPoC`입니다. 현재 release·Node 실행 파일·포트는 `installation.json`, 서버 설정은 `config\local.json`, 현재 DB는 `data\platform.sqlite`에 있습니다. 사용자·관리자 웹 루트는 각 release의 `dist\user`, `dist\admin`입니다.

백업의 `.sqlite`와 같은 이름의 `.sqlite.json`은 한 쌍입니다. JSON에는 생성 시각·바이트 수·SHA-256·무결성·스키마 버전이 들어가며 세션·저장 내용은 출력하지 않습니다. 이 체크섬은 파일 손상·잘못된 짝을 찾는 수단입니다. 백업과 메타데이터를 모두 바꿀 수 있는 사람의 변조를 인증하는 전자서명은 아닙니다.

## 2. 최초 설치와 설정 재실행

관리자 권한의 64비트 Windows PowerShell 5.1에서 압축을 푼 소스 폴더를 기준으로 실행합니다.

```powershell
.\scripts\Install-IIS.ps1 -InstallRoot C:\PlayHubPoC -ShareHost 192.168.0.10
```

`ShareHost`는 실제 서버 PC 주소로 바꿉니다. 한 PC에서만 검증하려면 `-LocalOnly`를 지정합니다. 네 포트는 서로 달라야 하며 기본값은 사용자 UI 8080, 관리자 UI 8081, 공개 API 8090, 관리자 API 8091입니다. 기존 사이트·앱 풀·작업·방화벽 이름과 충돌하는 신규 설치는 거부합니다. 같은 이름만 보고 타 애플리케이션 자원을 삭제하지 않습니다.

기존 설치에 다시 실행할 때 생략한 포트·공개 범위·공유 호스트는 기존 값을 사용합니다. 관리자 비밀번호는 `-ResetAdminPassword`를 선택했을 때 다시 입력합니다. 기존 관리자 이름, OAuth 설정, 색인 설정과 데이터 경로도 보존합니다. 설치 경로와 소스 폴더를 같게 하거나 설치 경로를 소스 아래에 두는 구성은 재귀 복사를 막기 위해 거부합니다.

`tools/setup.mjs`를 직접 사용하는 개발 환경도 있습니다. 설정 JSON은 표준 입력으로 전달하며 비밀번호를 명령줄 인수에 넣지 않습니다. 최초 직접 설정은 loopback 공개 API를 기본값으로 합니다. IIS 설치기는 공유 여부를 명시하여 LAN 또는 LocalOnly를 설정합니다. 이후 setup에 `{}`를 전달하면 기존 포트·Origin·비밀번호 해시·Google 설정을 보존합니다. 설정 재실행은 기존 DB를 다른 경로로 옮겨 주는 데이터 마이그레이션 도구가 아닙니다.

기존 HTTPS·프록시 배포의 주소를 HTTP 설치기로 다시 만드는 작업은 거부합니다. 인증서와 프록시 구성을 포함한 별도 배포 절차로 관리해야 합니다. 실제 `maintenance.lock`이 남아 있으면 설정 재생성이나 신규 release 기동보다 복구 상태를 먼저 해결합니다.

## 3. 안전한 업데이트 순서

1. 소스의 코드·게임·manifest·중앙 catalog를 수정합니다.
2. 개발 환경에서 `node tools/build.mjs`, `node tools/verify.mjs --tests`를 실행합니다.
3. 동일한 `InstallRoot`로 `Install-IIS.ps1`을 다시 실행합니다. 기존과 같은 포트는 생략할 수 있습니다.
4. 설치기는 새로운 release 폴더에서 빌드와 패키지 검사를 완료합니다. 이 단계의 실패는 기존 사이트를 전환하지 않습니다.
5. 기존 DB가 있으면 온라인 백업을 먼저 생성합니다. 백업 실패 시 업데이트를 중단합니다.
6. 이전 설정·설치 marker를 보관한 다음 자신의 사이트·API 작업을 새 release로 전환합니다. 새 작업은 비활성 상태로 등록하고, 새 release의 복구 도구를 가리키는 marker를 원자적으로 기록한 뒤 활성화·기동합니다. 이후 방화벽 단계가 실패해도 새로운 DB를 복구할 도구 위치가 남습니다.
7. 공개 API health와 별도 PowerShell 프로세스의 IIS HTTP 검사가 모두 통과해야 설치 완료를 표시합니다.

업데이트가 실패하면 후보 API 작업을 비활성화·중지하고 포트 종료를 확인한 다음 이전 release 복원을 시도합니다. 실행 중인 마이그레이션과 지원 스키마 검사가 동시에 진행되지 않도록 순서를 고정합니다. **현재 DB가 이전 코드가 지원하는 스키마보다 새로우면 코드만 자동으로 되돌리지 않습니다.** 이 경우 작업과 사이트를 중지하며 새 release의 복구 도구를 가리키는 marker, 원본, 백업을 남깁니다. 운영자가 아래의 명시적인 데이터 복구·코드 복원 순서를 사용합니다.

0.2.0은 `package.json`의 `playhubDatabaseSchemaVersion: 1`을 선언합니다. 0.1.x의 선언 없는 package는 스키마 0으로 해석합니다. 알려지지 않은 release의 지원 버전을 임의로 추측하지 않습니다.

## 4. 온라인 백업 만들기

설치된 서비스가 실행 중이어도 다음을 실행할 수 있습니다.

```powershell
.\scripts\Backup-Data.ps1 -InstallRoot C:\PlayHubPoC
```

결과는 `backups\platform-<UTC시각>-<임의식별자>.sqlite`와 `.sqlite.json`입니다. Windows wrapper는 이 폴더에 Administrators와 SYSTEM만 허용하는 권한을 설정한 뒤 백업합니다. Node는 SQLite 온라인 backup API를 사용합니다. 현재 DB가 WAL을 쓰더라도 완료된 새 백업은 자체 포함된 DELETE journal 형식으로 정리하고 무결성·외래키 검사와 SHA-256을 기록합니다.

개발용 CLI 예시는 다음과 같습니다.

```text
node tools/backup.mjs --config /private/config.json --out /private/backups/platform-new.sqlite
```

동일 경로의 기존 DB·메타데이터·journal sidecar가 있으면 덮어쓰지 않습니다. 데이터 복구가 진행 중인 `maintenance.lock` 상태에서는 새 백업을 시작하지 않습니다. 백업 빈도·외부 사본·보존 기간을 자동 관리하는 스케줄은 이 도구에 포함되지 않습니다. 실제 복구 가능 지점은 선택한 성공 백업의 생성 시각이며, Windows 복구 소요 시간은 대상 PC에서 측정해야 합니다.

## 5. 복구 전에 백업만 검사

```powershell
.\scripts\Restore-Data.ps1 -InstallRoot C:\PlayHubPoC -BackupPath 'C:\PlayHubPoC\backups\platform-선택한백업.sqlite' -VerifyOnly
```

이 모드는 서비스를 중지하지 않습니다. 다음을 확인합니다.

- `.sqlite.json`의 바이트 수와 SHA-256이 실제 파일과 일치하는지
- SQLite 파일 헤더·integrity_check·foreign_key_check가 정상인지
- 스키마 0 또는 1이며 필수 테이블·열이 있는지
- 뷰·트리거·virtual table 등 이 PoC가 사용하지 않는 실행 가능한 DB 구조가 없는지
- 백업이 비어 있지 않은 WAL·journal에 의존하지 않는지
- 파일과 상위 경로가 symlink·junction을 사용하지 않는지

검사는 임시 사본에서 수행하여 백업 원본을 SQLite로 열거나 수정하지 않습니다. 예전 0.1 백업 메타데이터도 지원합니다. 최종 0.2 스키마 1은 `save_slot_versions`를 포함한 15개 플랫폼 테이블을 검사합니다. 백업 원본과 메타데이터가 없거나 손상됐다면 기존 DB는 건드리지 않습니다.

## 6. 일반 데이터 복구

다음 명령은 선택한 백업 시점으로 저장·사용자·통계·운영 데이터를 실제로 되돌립니다.

```powershell
.\scripts\Restore-Data.ps1 -InstallRoot C:\PlayHubPoC -BackupPath 'C:\PlayHubPoC\backups\platform-선택한백업.sqlite'
```

wrapper는 설치 marker·작업 실행 경로·사이트 경로를 확인합니다. 그 뒤 시작 작업의 자동 재시작을 막고 API와 사이트를 중지한 다음 API 포트가 닫힐 때까지 기다립니다. 다른 프로그램이 포트를 사용하면 해당 프로그램을 강제로 종료하지 않고 복구를 거부합니다.

Node 복구는 `data\maintenance.lock`을 배타적으로 만들고 다시 포트를 확인합니다. 서버는 이 파일이 있으면 DB를 열거나 마이그레이션하기 전에 기동을 거부합니다. 현재 DB의 SQLite 잠금도 확인합니다. 이후 `data\recovery\restore-<작업ID>`에 원본·복구 상태 기록·검증된 후보를 준비하고 파일을 교체합니다.

원본 파일은 삭제하지 않습니다. 정상 복구의 `original`과 `displaced`, 실패한 시도의 `failed-*`에는 개인 저장과 인증 관련 데이터가 포함될 수 있습니다. Windows wrapper는 recovery 폴더를 Administrators·SYSTEM 전용으로 보호합니다. 복구된 현재 DB 파일에는 다시 비공개 data 폴더의 Local Service 권한을 적용한 뒤 기동합니다.

교체 후 SQLite 검사가 실패하면 보관한 원본으로 자동 롤백합니다. 롤백까지 실패하면 `maintenance.lock`을 유지하고 서비스를 중지 상태로 둡니다. 잠금 파일을 임의로 지워 자동 기동시키지 않습니다. 원본까지 손상된 경우 보관에 성공했다고 정상 서비스 기동을 보장하지 않습니다.

복구가 성공하고 이전 작업이 활성화되어 있었다면 API 기동과 공개·관리자 health를 확인합니다. 이전에 켜져 있던 IIS 사이트를 복원하고 두 사이트가 모두 활성 상태이면 `Test-IIS.ps1`을 별도 PowerShell에서 실행합니다. 원래 운영자가 비활성화한 작업은 임의로 활성화하지 않습니다.

### 플레이어 세션 처리

백업에 있던 모든 세션을 그대로 살리지 않습니다. 현재 DB에서 복구 직전에 유효했던 공개 guest 세션을 별도로 읽고, 다음 조건을 모두 만족하는 행만 복구본에 다시 넣습니다.

- 현재 DB와 선택한 백업에 같은 principal의 `kind=guest` 사용자가 존재합니다.
- 두 DB 모두 그 principal에 연결된 계정 identity가 없습니다.
- 세션은 만료 전이며 관리자 세션이 아니고 실제 이용 `live` 세션입니다.

이에 따라 같은 브라우저의 기존 guest 쿠키는 백업에 남은 진행을 이어갈 수 있습니다. 백업에만 남아 있는 과거 로그아웃 세션, Google 세션, 관리자 세션, QA 세션은 재활성화하지 않습니다. OAuth 상태·저장 idempotency·미완료 merge는 폐기하고 미종료 플레이 세션은 종료 처리합니다. 완료된 merge 기록과 사용자·identity·저장·저장 백업·통계·슬롯 revision 이력은 선택한 백업 기준으로 보존합니다.

Google 사용자와 관리자는 다시 로그인해야 합니다. 백업 이후 처음 생긴 guest, 쿠키를 삭제한 guest, 현재 DB 손상으로 유효 세션을 읽을 수 없는 guest의 이어하기는 복구할 수 없습니다. 보고서에 보존 수·복구본에 없는 수·손상 경고를 남기며 세션 ID나 CSRF 값을 기록하지 않습니다. 게임 저장도 백업 이후 진행까지 자동으로 합치는 동작은 하지 않습니다.

## 7. 이전 코드로 돌아가야 할 때

DB가 현재 코드와 이전 코드 모두에서 지원되는 버전이면 다음을 실행합니다.

```powershell
.\scripts\Restore-PreviousRelease.ps1 -InstallRoot C:\PlayHubPoC
```

0.2에서 스키마 1로 바뀐 뒤 0.1 코드로 돌아가는 경우에는 먼저 업데이트 전 스키마 0 백업을 적용해야 합니다.

```powershell
.\scripts\Restore-Data.ps1 -InstallRoot C:\PlayHubPoC -BackupPath 'C:\PlayHubPoC\backups\platform-업데이트전백업.sqlite' -KeepStopped
.\scripts\Restore-PreviousRelease.ps1 -InstallRoot C:\PlayHubPoC
.\scripts\Test-IIS.ps1 -InstallRoot C:\PlayHubPoC -WithAdmin
```

**`-KeepStopped`가 필요합니다.** 구버전 DB 복구 직후 0.2 API를 다시 시작하면 그 DB를 다시 스키마 1로 마이그레이션하기 때문입니다. 이 옵션은 DB 복구 후 API 작업을 비활성·중지 상태로, 사이트를 중지 상태로 남겨 다음 코드 복원 단계를 준비합니다. 기존 데이터는 recovery에 보관됩니다. 최신 저장·이벤트를 오래된 백업과 자동 병합하지 않으므로 선택한 복구 시점을 확인해야 합니다.

## 8. 복구 프로세스가 중간에 종료된 경우

전원 종료나 복구 프로세스 중단 뒤 `maintenance.lock`이 남으면 서버 기동이 차단됩니다. 원래 복구 프로세스가 끝난 상태인지 먼저 확인한 뒤 다음을 실행합니다.

```powershell
.\scripts\Restore-Data.ps1 -InstallRoot C:\PlayHubPoC -RecoverInterrupted
```

도구는 기록된 프로세스가 아직 존재하면 거부합니다. 기록된 경로가 이 설치의 recovery 아래인지 확인하고, 보관된 원본의 SHA-256을 다시 검사합니다. 파일 교체 전 중단이면 잠금만 해제하고, 교체가 시작된 뒤 중단이면 보관한 원본을 되돌립니다. 새로운 복구본과 실패한 파일도 별도로 남깁니다. 원본 복구를 마친 뒤 선택한 백업의 적용을 다시 시도할 수 있습니다.

필요하면 `-KeepStopped`를 함께 사용하여 코드 복원으로 이어갑니다. 잠금이나 recovery 기록이 다른 경로를 가리키거나 손상됐으면 자동으로 우회하지 않습니다. 보존된 DB·백업을 별도로 확보한 뒤 기록을 검토해야 합니다. 프로세스 강제 종료 시나리오는 자동 회귀로 재현했지만 물리 디스크 장애·전원 차단의 파일 시스템 내구성까지 증명한 검사는 아닙니다.

Node CLI를 직접 사용하는 경우의 대응 명령은 다음과 같습니다. API 작업을 먼저 중지해야 합니다.

```text
node tools/restore-data.mjs --config /private/config.json --from /private/backups/platform.sqlite --report /private/reports/restore.json
node tools/restore-data.mjs --config /private/config.json --from /private/backups/platform.sqlite --apply --report /private/reports/restore.json
node tools/restore-data.mjs --config /private/config.json --rollback-interrupted --apply --report /private/reports/recovery.json
```

기본 명령은 검증만 수행하고 `--apply`가 있어야 데이터를 바꿉니다. 보고서는 data 폴더 밖의 `.json` 경로로 지정합니다. 같은 이름의 HTML도 생성합니다. Windows의 계정 권한·서비스 재시작까지 처리하려면 위 PowerShell wrapper를 사용합니다.

## 9. 새 게임 자동 등록

새 게임은 소스에 다음 자료를 추가합니다.

1. `games/<id>/` 폴더와 `index.html`, 실행 코드, 안전한 원본 미디어
2. 같은 id·slug를 사용하는 `game.manifest.json`
3. `catalog/games.json`에 `{ "id": "new-puzzle", "path": "games/new-puzzle", "enabled": true }`

manifest에는 한국어·영어 제목·소개·조작법, 입력·화면·capability·저장·SEO·미디어를 작성합니다. `instructions`는 정적 상세 본문에도 사용합니다. 공용 SDK 소스 참조는 빌드가 각 게임의 `vendor`로 복사하고 상대 경로로 바꿉니다.

```text
node tools/build.mjs
node tools/verify.mjs --tests
```

검사 후 기존 설치에 새 release를 배포하면 목록 API·사용자 카드·정적 상세·canonical·Open Graph·사이트맵에 반영됩니다. UI 코드를 수정할 필요가 없습니다. 검증용 아홉 번째 게임을 임시 소스에 추가해 이 과정을 실제 회귀로 확인했습니다. 이 fixture는 제공 게임 수를 9개로 늘린 구현이 아니며 기본 제공 게임은 8종입니다.

`enabled:false`인 새 항목은 공개 상세 route를 생성하지 않습니다. 잘못된 중복 id가 있는 catalog의 빌드는 기존 dist를 교체하지 않습니다. DB의 운영자 비공개 상태는 catalog 빌드로 강제로 공개되지 않습니다. 소스 JSON을 고친 순간 실행 중인 IIS 파일이 자동으로 배포되는 hot reload 기능은 제공하지 않습니다.

## 10. 실제 검증 결과와 Windows에서 남은 확인

`reports/restore-validation.json`과 HTML은 다음 18개 Node 회귀의 실제 결과입니다. 원시 실행 결과는 `reports/restore-regression.tap`에 있습니다.

| 검증 범위 | 실행 결과 |
|---|---|
| 온라인 WAL 백업, 자체 포함 snapshot, SHA, 덮어쓰기 방지, POSIX 비공개 권한 | 통과 |
| 서비스 실행 중 verify-only, 실제 복구 후 저장값 복원·게스트 HTTP 이어하기 | 통과 |
| 백업의 과거 세션 폐기, Google·관리자·QA 제외, 미완료 인증/merge 종료 | 통과 |
| 0.1의 schema 0·이전 메타데이터 복구 후 schema 1 마이그레이션 | 통과 |
| schema 1의 `save_slot_versions` 보존 | 통과 |
| 체크섬·메타데이터·sidecar·다른 DB·미래 스키마·트리거·symlink 차단 | 통과 |
| 열린 API 포트·SQLite writer lock 차단, 교체 중 오류 자동 롤백 | 통과 |
| 별도 Node 프로세스 강제 종료 → 기동 차단 → 명시적 원본 복구 | 통과 |
| 손상된 현재 DB의 원시 파일 보존 후 정상 백업 복구 | 통과 |
| setup 재실행 보존·HTTPS 보호·잘못된 설정의 덮어쓰기 방지 | 통과 |
| 새 게임 자동 등록·API/SEO/vendor·disabled route·잘못된 catalog의 dist 보존 | 통과 |
| Windows PowerShell/IIS/NTFS ACL·작업 재시작·재부팅 | **not_run — 대상 Windows에서 수행 필요** |

대상 Windows에서는 신규 설치와 기존 설치 업데이트, 일반 복구, 강제 중단 후 복구, schema가 다른 이전 release 복원, 재부팅 후 저장 이어하기를 순서대로 확인합니다. `Restore-Data.ps1`이 실제 실행되면 `reports\data-restore-<작업시각>.json/.html`과 `data-restore-iis-latest.json`을 만듭니다. 후자는 실제 PowerShell 실행 여부·API health·IIS HTTP 검사 여부·의도적 중지 여부를 기록합니다. 단순히 Node 보고서가 통과했다고 Windows 설치·복구가 실행된 것으로 기록하지 않습니다.
