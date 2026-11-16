# 포터블 배포 ZIP 검증

사용자 추가 요청: 프로그램과 별도로 데이터 및 로그·임시 자료를 ZIP으로 내보내고 가져오는 도구를 추가하며, **추가 검증·테스트는 생략**한다. 아래 수치는 이 요청 전에 만든 일반 ZIP의 결과이며, 새 `transfer` 배포 ZIP이나 이관 도구를 검증했다는 의미가 아니다. 실제 계정 데이터 내보내기·가져오기는 실행하지 않았다.

## 최신 이관 도구 포함 ZIP 생성 기록

- 파일: `WebPlatform/Dist/PlayHub_Portable_0.3.0_2026-11-16_63872076_win-x64_transfer.zip`
- 생성 크기: 66,842,773바이트, ZIP에 포함한 파일 14개.
- 생성 시 SHA-256: `f34a6bf74f2bc2a253f67c9916b22328719ae2d959c86944a2df836e729b63f7`.
- `-SkipValidation`으로 만들었으며 `validationSkipped:true`, `extractedPackageCheck:null`로 기록했다. 해시 목록 작성은 수행했지만 추가 압축 해제·실행·이관 테스트는 수행하지 않았다.
- `Export_PlayHub_Data.cmd` / `Import_PlayHub_Data.cmd`와 `Export_PlayHub_Logs.cmd` / `Import_PlayHub_Logs.cmd`를 포함한다. 해당 사용자가 실행하면 데이터 ZIP과 로그 ZIP을 각각 생성하거나 가져온다. 실제 개인 데이터는 프로그램 ZIP에 포함하지 않았다.
- 데이터 이전 대상은 로컬 설정, SQLite와 필요한 저널 파일, workspace의 games/catalog다. 데이터 복원은 기존 자료를 보관한 뒤 교체한다. 로그 ZIP은 보고서·텍스트 로그·생성 캐시·임시 자료를 대상으로 하며 복원은 별도의 새 폴더에만 수행한다.

## 이전 일반 ZIP 검증 기록

검증일: 2026-11-16. 앱 소스 커밋: `6387207667ddfdddacdce88243d81a83c23787e8`.

- 산출물: `WebPlatform/Dist/PlayHub_Portable_0.3.0_2026-11-16_63872076_win-x64.zip`
- 크기: 66,828,955바이트 (66.8 MB).
- ZIP SHA-256: `d1d95a6852e544f2431b938b8c972ba148e74cede6518d5f681aa1f75260415b`.
- EXE SHA-256: `d6756cf729673e9092cb181621954fb8d381dfae55e1856910b53e9cb398fd81`.
- EXE 내장 내용: 339개 파일, 게임 21개, 언어 8개, 게임별 커뮤니티 포함.

ZIP의 `PlayHub/` 아래에는 `PlayHub.exe`, `Run_PlayHub.cmd`, `README_KO.txt`, `START_HERE.html`, `PACKAGE_MANIFEST.json`, `SHA256SUMS.txt`, `licenses/Node-LICENSE.txt`, `licenses/PORTABLE-NOTICES.txt`만 포함했다. 개인 설정·계정·저장 DB·개발용 의존성·소스 폴더는 넣지 않았다. Rebex는 별도 연결한다. 기존 배포 방식과 [공식 EULA](https://www.rebex.net/Content/doc/freeware-eula.txt)의 런타임 재배포 조건을 확인했다.

`tools/package-distribution.ps1`은 EXE와 빌드 보고서, 내장 파일과 현재 소스의 SHA-256을 비교한 뒤 8개 파일만 압축한다. ZIP을 다시 풀어 전 파일 해시를 대조하고, 추출한 EXE를 별도 임시 데이터 경로에서 `--package-check`로 실행했다. Windows Node v24.22.1 SEA 실행, 동일 payload, ESM 진입점, SQLite 검사 결과 42를 확인했다. 실제 서버·계정 데이터는 시작하거나 변경하지 않았다.

독립적인 Python ZIP 검사에서도 CRC와 매니페스트 파일 해시, 게임·언어 수, ZIP 항목 목록을 확인했다. 실제 배포 대상의 Rebex 시작과 다른 기기 LAN 접속은 이 ZIP 검증에 포함하지 않는다. 이전 앱 검증은 [커뮤니티 검증](community-validation.md)을 참고한다.

배포 ZIP 옆의 `.sha256`, `.validation.json`에 해시와 기계 판독 가능한 검증 결과를 저장했다. 이 생성물과 ZIP은 Git에서 제외하고, 패키징 도구와 안내서만 버전 관리한다. 같은 파일명의 기존 배포물은 덮어쓰지 않는다.
