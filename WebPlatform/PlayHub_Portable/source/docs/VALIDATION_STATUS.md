# PlayHub Portable 0.3.0 검증 상태

## 완료한 범위

| 검사 | 결과 | 실제 실행 환경 |
|---|---|---|
| 전체 Node 회귀 | 131 통과 / 0 실패 / 0 제외 | Linux, Node 24.22.1 |
| 동일 코드 내장 SEA의 HTTP | 41 통과 / 0 실패 / 3 제외 | Linux SEA, 사용자 정적 서버는 Node 검사 서버 |
| SEA 실행기 | 5 통과 | 실제 추출·자식 프로세스·SQLite·재준비 |
| Windows PE·payload·소스·라이선스 | 22 통과 | 파일 구조와 해시 검사 |

검사 그룹은 일부 중복되어 총합으로 더하지 않습니다. 최신 정본은 `../reports/portable-release.json`, 원본 증거는 같은 reports 폴더와 `portable-sea-evidence/`에 있습니다.

## 아직 실행하지 않은 범위

Windows EXE 직접 실행, Rebex 서버 실행, Windows ACL·Job Object 수명 동작, 실브라우저 입력·렌더링, 다른 기기 LAN 연결, 실제 Google OAuth 로그인은 **not_run**입니다. 따라서 `fullyAccepted:false`이며 Windows A–Z 현장 수용 완료라고 표시하지 않습니다.

`portable/windows-acceptance.ps1`은 실행 중인 Windows 인스턴스에서 실제 프로세스·포트·폴더·HTTP를 관측합니다. 스크립트 제공 자체는 통과 증거가 아닙니다. Windows 대상에서 실행한 뒤 생성되는 `portable-acceptance.json`과 `.html`을 확인하세요. 실제 사용자 게임 조작·Google 인증·LAN 접속은 별도입니다.

## 파일·배포 경계

Rebex EXE는 ZIP과 SEA에 포함하지 않았습니다. Node 전체 라이선스는 EXE 안과 배포의 licenses 폴더에 포함했습니다. 앱 source를 바꾸지 않은 상태에서 Windows와 Linux SEA의 payload·blob·launcher SHA가 일치함을 대조했습니다. 기존 IIS 보고서는 `reports/legacy-iis-v02/`에 옮겨 새 버전 결과와 구분했습니다.

최종 교차검토에서 .NET의 Console.In.ReadLineAsync 동기 대기로 Rebex 종료 감시가 막히는 문제를 찾아 C# Task.Run 입력 대기로 수정했습니다. 수정한 파일을 두 SEA에 반영했습니다. 이 Windows 분기의 실행 검증은 여전히 미수행입니다. 근거: https://learn.microsoft.com/en-us/dotnet/api/system.io.textreader.readlineasync
