# PlayForge Windows Server

이 패키지는 Node.js와 Godot 실행 파일, 웹용 Godot 에디터, 다섯 가지 프로젝트 템플릿과 필요한 프로덕션 모듈을 포함합니다. Node.js 설치나 `npm install` 없이 실행합니다. Godot는 패키지 안의 portable 데이터 폴더와 Web 내보내기 템플릿을 사용하므로 기존 `%APPDATA%` 설정은 바꾸지 않습니다.

## 시작

압축을 푼 `PlayForge` 폴더에서 `START_SERVER.cmd`를 실행하세요. 기본 주소는 [http://127.0.0.1:4173/OfficialGodot/](http://127.0.0.1:4173/OfficialGodot/)입니다. 같은 PC의 브라우저에서 열면 됩니다. 서버는 Godot를 화면 없이 실행합니다.

기본 설정은 로컬 PC만 접속할 수 있도록 합니다. 포트 또는 바인딩 주소는 실행 전에 환경 변수로 바꿀 수 있습니다.

```powershell
$env:PLAYFORGE_HOST = '127.0.0.1'
$env:PLAYFORGE_PORT = '4173'
& '.\START_SERVER.cmd'
```

다른 PC에서 접속하려면 먼저 사설 네트워크나 VPN 안에서만 접근하도록 방화벽을 제한하세요. `PLAYFORGE_HOST`에 해당 서버의 내부 인터페이스 주소를 지정합니다. 인증과 HTTPS 없이 인터넷에 직접 공개하지 마세요. 서버 자체에는 사용자 계정이나 인증 기능이 없습니다.

## HTTPS 리버스 프록시

공개 서비스는 Caddy 같은 TLS 지원 리버스 프록시 뒤에 두세요. DNS에서 도메인을 프록시 서버로 연결하고, Caddy가 HTTP와 WebSocket을 모두 `127.0.0.1:4173`으로 전달하도록 합니다. PlayForge의 협업 동기화에는 WebSocket과 이벤트 스트림 연결이 필요합니다. 프록시에서 인증을 적용하고, 서버 포트는 인터넷에서 직접 접근할 수 없게 방화벽으로 차단합니다.

같은 Windows 서버에서 실행하는 Caddy 설정 예시입니다. Caddy는 도메인에 유효한 HTTPS 인증서를 자동으로 설정합니다.

```caddyfile
playforge.example.com {
	basic_auth {
		team {$PLAYFORGE_PASSWORD_HASH}
	}
	reverse_proxy 127.0.0.1:4173
}
```

Caddy의 `hash-password` 명령으로 비밀번호 해시를 생성하고, 이를 Caddy가 실행되는 계정의 `PLAYFORGE_PASSWORD_HASH` 환경 변수로 설정하세요. 평문 비밀번호나 해시를 이 패키지의 스크립트, 저장소, 공개 로그에 넣지 마세요. PlayForge 서버 시작 설정에는 외부 주소를 다음과 같이 지정합니다.

```powershell
$env:PLAYFORGE_HOST = '127.0.0.1'
$env:PLAYFORGE_PORT = '4173'
$env:PLAYFORGE_PUBLIC_ORIGIN = 'https://playforge.example.com'
& '.\START_SERVER.cmd'
```

`PUBLIC_ORIGIN`은 생성된 공유 링크와 Godot 플러그인의 같은 출처 확인에 사용됩니다. 외부 HTTPS 주소와 정확히 일치시켜야 합니다.

## GamePlayHub 연결

PlayForge는 별도 서비스이며 PlayHub의 예정된 `D:\Github\UnrealSamples-worktrees\GamePlayHub\PlayForge` 경로에 설치해도 로그인이나 프로젝트 저장소를 공유하지 않습니다. Hub에는 새 탭 링크로 `https://playforge.example.com/OfficialGodot/`를 연결하는 방식이 적합합니다. 상태 확인은 `GET /api/health`이며, 템플릿 화면은 `/OfficialGodot/`, 특정 협업 프로젝트는 `/OfficialGodot/?project=<project-id>` 주소를 사용합니다.

PlayForge는 `/OfficialGodot/` 같은 루트 기준 주소와 COOP/COEP/CORP 보안 헤더를 사용합니다. `/PlayForge/` 하위 경로 프록시로 바로 넣으면 정적 자산 경로와 격리 헤더가 맞지 않을 수 있습니다. Hub 페이지의 iframe 임베드는 격리 헤더 호환성을 별도로 검증한 뒤 적용하세요. SSO, 공유 계정, Hub 데이터 연동은 제공하지 않습니다.

## 데이터와 백업

서버 실행 중 생성되는 `Saved` 폴더에는 프로젝트와 빌드 데이터가 저장됩니다. 이 폴더는 배포 ZIP에 포함되지 않습니다. 백업할 때 서버를 중지한 뒤 `Saved`를 별도로 복사하고, 복구할 때는 서버를 다시 시작하기 전에 복원하세요. 패키지 파일과 사용자 데이터를 함께 배포하거나 덮어쓰지 마세요.

## 포함 런타임

- Node.js 22.16.0 Windows x64 및 런타임 라이선스
- Godot 4.7.2-stable Windows x64, 공식 라이선스와 portable Web export 템플릿
- `ws`, `yjs`, `lib0` 프로덕션 모듈과 각 라이선스
- `Deploy/MANIFEST.json`에 포함 파일의 SHA-256과 런타임 버전이 기록됩니다. ZIP의 SHA-256은 배포 ZIP 옆 `.sha256` 파일에서 확인할 수 있습니다.

배포 패키지에 포함된 모든 타사 런타임 및 라이선스 고지를 확인하고, 필요에 따라 원문 라이선스를 함께 제공하세요.
