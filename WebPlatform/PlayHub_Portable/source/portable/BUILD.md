# PlayHub 0.3.0 단일 EXE 빌드

배포 대상 사용자는 `PlayHub.exe`를 실행합니다. Node.js, npm, Python, SQL 서버, IIS를 설치하지 않습니다. 이 문서는 **실행 파일을 만드는 개발자용**입니다. Rebex Tiny Web Server 실행 파일은 포함하지 않으며 사용자가 보유한 복사본을 런처에서 선택합니다.

## 1. 구조

`launcher.cjs`는 Node SEA의 CommonJS 진입점입니다. `playhub.bundle.gz`라는 asset 하나에 기존 ESM 서버와 웹·게임 소스를 담습니다. 실행 시 `%LOCALAPPDATA%\PlayHub` 아래 `app/<payload SHA-256>`에 검증해 풀고 다음 함수를 동적 import로 호출합니다.

```js
await launch.run({
  appRoot, instanceRoot, args,
  executable: process.execPath,
  sea: true,
  launcherPath: null
});
```

Node 개발 실행은 `sea:false`, `launcherPath:<launcher.cjs의 절대경로>`를 전달합니다. `--data-dir PATH`는 기본 저장 폴더를 바꾸는 선택 사항입니다. 기본 실행에는 인수가 필요하지 않습니다. `--worker=...`, `--self-test`, `--check-http` 등 애플리케이션 인수는 `launch.run`으로 전달합니다.

`--package-check`는 추출·내장 ESM import·SQLite `SELECT 42`만 검사하고 서비스를 시작하지 않습니다. `--bundle PATH`는 Node 개발 실행에서만 사용할 수 있으며 완성된 SEA가 외부 payload로 바뀌는 것은 허용하지 않습니다.

## 2. 고정된 빌드 입력

현재 재현 버전은 Node **24.22.1**입니다. 빌더 Node와 주입할 Windows Node의 버전이 반드시 같아야 합니다. 다른 버전을 쓰려면 두 런타임과 고정된 체크섬을 함께 갱신하고 회귀를 다시 수행합니다. 이 버전 고정은 재현을 위한 것이며 항상 최신 버전을 자동 선택하는 설정이 아닙니다.

| 입력 | 공식 URL | 확인할 값 |
|---|---|---|
| Windows x64 Node ZIP | `https://nodejs.org/dist/v24.22.1/node-v24.22.1-win-x64.zip` | SHA-256 `d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5` |
| Node 공식 체크섬 목록 | `https://nodejs.org/dist/v24.22.1/SHASUMS256.txt` | ZIP와 `win-x64/node.exe` 항목 |
| ZIP 안 `node.exe` | 동일 ZIP 또는 `https://nodejs.org/dist/v24.22.1/win-x64/node.exe` | SHA-256 `d702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5` |
| ZIP 안 `LICENSE` | 동일 ZIP | SHA-256 `ed34dd8e3f0a78dbaf00d0444ce8e285b015b765379c2e17880455f70370f8e9` |
| postject 빌드 도구 | `https://registry.npmjs.org/postject/-/postject-1.0.0-alpha.6.tgz` | SHA-256 `d1447b53e87d49ddaf7fb3350c870afafa72760eca47f6d5cce4cefd537e7d92` |
| 위 패키지 `dist/api.js` | 동일 패키지 | SHA-256 `88931f26b4d3e99e08dc8219a45f576986952fad4d0c78444d27048232b2881b` |

다운로드한 ZIP은 먼저 공식 체크섬과 비교한 뒤 별도 빌드 입력 폴더에 풉니다. postject tarball은 공식 npm metadata의 SHA-512 integrity도 확인할 수 있습니다. 패키지의 `dist/api.js`는 주입 라이브러리를 포함하므로 여기서는 programmatic API를 직접 사용합니다. CLI용 commander나 npm 전역 설치는 필요하지 않습니다. 빌드 도구를 최종 애플리케이션에 넣지 않습니다.

Node ZIP의 **완전한 LICENSE**를 payload의 `licenses/Node-LICENSE.txt`로 포함합니다. 이 파일에는 Node와 포함된 외부 라이브러리의 고지가 들어 있습니다. postject의 빌드 도구 소스를 함께 배포한다면 해당 패키지 LICENSE를 그대로 보존합니다. postject 자체는 MIT이며 포함된 LIEF 고지는 Apache-2.0입니다.

## 3. Windows EXE 생성

아래 경로는 예시이며 실제로 검증해 풀어 둔 입력 위치를 지정합니다.

```text
node portable/build-sea.mjs --target win-x64 --node-exe <build-inputs/node-v24.22.1-win-x64/node.exe> --node-license <build-inputs/node-v24.22.1-win-x64/LICENSE> --postject-api <build-inputs/postject/package/dist/api.js> --output <output/PlayHub_Portable/PlayHub.exe>
```

명령은 다음 순서로 수행합니다.

1. 빌더 버전, Windows Node·LICENSE·postject API의 고정 체크섬을 확인합니다.
2. 게임 catalog를 검사하고 런타임 파일의 SHA-256 목록을 만듭니다.
3. `{format:1,version:'0.3.0',files:[{path,sha256,data}]}`를 UTF-8 JSON과 gzip으로 만듭니다.
4. `useSnapshot:false`, `useCodeCache:false`, `execArgvExtension:'none'` 설정으로 SEA preparation blob을 생성합니다.
5. 검증한 Node의 **복사본**에서 원래 Authenticode certificate directory를 제거하고 SEA blob을 주입합니다.
6. 최종 PE32+ x64 구조, `RT_RCDATA / NODE_SEA_BLOB`, payload 일치, SEA fuse, 남은 서명 directory가 없는지를 검사합니다.
7. EXE·bundle manifest·압축 payload·빌드 보고서를 기록합니다.

Node의 원래 서명은 수정한 애플리케이션의 서명이 될 수 없습니다. 결과물은 **서명되지 않은 PlayHub 실행 파일**입니다. 별도 코드 서명을 적용하려면 최종 주입·검사 후 발급받은 인증서로 서명하고, 서명 후 EXE 해시를 다시 기록합니다. 이 빌더는 인증서를 발급하거나 Windows 정책을 변경하지 않습니다.

산출물은 `PlayHub.exe`, `PlayHub.exe.bundle.json`, `PlayHub.exe.bundle.gz`, `PlayHub.exe.build.json`입니다. 뒤의 세 파일은 빌드·검증용 증거이며 실행 시 따로 필요하지 않습니다. 사용자가 다른 PC로 복사해야 하는 실행 파일은 `PlayHub.exe` 하나입니다. 개인 DB와 설정은 최초 실행 뒤 사용자 저장 폴더에 생성됩니다.

## 4. 포함·제외 범위

포함: `server/`, `web/`, `shared/`, `games/`, `catalog/`, `package.json`, `config/example.json`, 런타임 `portable/*.mjs`·`portable/*.ps1`, `tools/build.mjs`, `setup.mjs`, `backup.mjs`, `restore-data.mjs`, `dev.mjs`, `smoke.mjs`, `check-stack.mjs`, Node 전체 라이선스입니다.

제외: IIS 설치 스크립트, 기존 사용자 DB·비밀 설정, 테스트, 보고서, npm 패키지, 빌드 cache와 도구, Rebex 실행 파일입니다. 정적 dist는 원본 소스를 바탕으로 instance의 workspace에 생성합니다. 가변 게임·생성물과 앱 code cache를 구분하는 실제 동작은 `prepare.mjs`가 담당합니다.

launcher는 경로 이동, 절대경로, Windows 장치명·ADS, case 충돌, 파일/디렉터리 충돌, symlink·junction, 잘못된 base64와 SHA 불일치를 거부합니다. 압축 32 MiB, JSON 128 MiB, 파일 4,000개, 파일별 16 MiB, 실제 파일 합계 64 MiB의 제한이 있습니다. 현재 8종 기본 게임을 훨씬 넘는 크기이며 무제한 압축 해제를 허용하지 않습니다.

동일 payload를 다시 실행할 때도 필요한 code cache 파일의 SHA를 확인합니다. 파일이 달라져 있으면 사용자 DB를 지우거나 의심되는 코드를 실행하지 않고 중단합니다. Windows에서 EXE를 더블클릭해 시작 오류가 발생한 경우, 대화형 콘솔이면 Enter 입력을 기다려 오류 메시지를 읽을 수 있게 합니다. IPC worker·자동 검사·표준 입력 리디렉션에서는 입력 대기를 하지 않습니다.

## 5. Linux에서 동일 SEA payload 실행 검사

Linux x64·Node 24.22.1 환경에서는 다음과 같이 동일 원본의 SEA를 만들 수 있습니다.

```text
node portable/build-sea.mjs --target linux-x64 --node-license <build-inputs/Node/LICENSE> --postject-api <build-inputs/postject/package/dist/api.js> --output <scratch/PlayHub-linux>
```

Linux 빌드는 생성한 ELF를 실제로 실행해 `--package-check`를 통과시켜야 성공합니다. 추가로 전체 격리 HTTP·SQLite 점검을 실행합니다.

```text
<scratch/PlayHub-linux> --data-dir <scratch/portable-instance> --self-test
```

Windows와 Linux 빌드 보고서의 `bundle.payloadSha256`, `sea.blobSha256`, `sea.launcherSha256`을 비교하면 같은 소스·진입점·SEA blob을 사용했는지 확인할 수 있습니다. Linux의 통과는 Windows PE를 실제로 실행한 증거가 아닙니다. Windows 결과의 `execution.windowsExecuted`는 작성 환경에서 항상 `false`입니다. 실제 Rebex 기동, Windows 사용자 프로필 권한, 프로세스 종료, LAN, 브라우저·Google 인증은 Windows 대상 PC에서 따로 수행합니다.

개발용 bundle 실행 예시는 다음과 같습니다.

```text
node portable/launcher.cjs --bundle <PlayHub.exe.bundle.gz> --data-dir <scratch/instance> --package-check
node --test tests/portable.packaging.test.mjs
```

## 6. 근거

- [Node 24.22.1 Single executable applications](https://nodejs.org/download/release/v24.22.1/docs/api/single-executable-applications.html): CommonJS 진입점, asset, 같은 Node 버전, cross-platform에서 code cache·snapshot 비활성화, 주입·서명 절차.
- [Node 공식 24.22.1 배포 목록](https://nodejs.org/download/release/v24.22.1/) 및 [SHA-256 목록](https://nodejs.org/download/release/v24.22.1/SHASUMS256.txt).
- [Node 프로젝트 postject](https://github.com/nodejs/postject): PE·ELF 리소스 주입 및 programmatic API.
- [Microsoft PE Format](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format): PE resource와 certificate directory 구조. certificate directory는 일반 RVA와 달리 파일 위치를 가리킵니다.
