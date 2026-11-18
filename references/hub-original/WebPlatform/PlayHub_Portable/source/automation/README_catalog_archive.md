# 실제 카탈로그·ZIP 검증 모듈 사용법

이 안내는 구현된 `platform_check/catalog.py`와 `platform_check/archive.py`의 실제 동작을 설명한다. 기획 문서의 제안 CLI `portal catalog validate`가 구현됐다는 뜻은 아니다. 통합 CLI가 제공되는 패키지에서는 해당 CLI의 `--help`와 공통 README를 진입점으로 사용하고, 아래 함수 계약으로 같은 검사를 직접 호출할 수도 있다.

## 1. 실행 환경과 입력

- 지원 목표: Python 3.11 이상. 이번 회귀 시험의 실제 Python 버전은 실행 보고서에 남긴다.
- 패키지 의존성: `jsonschema==4.26.0`, `PyYAML==6.0.3`. ZIP 모듈 자체는 표준 라이브러리만 사용한다.
- 네트워크로 파일·스키마·게임 자산을 가져오지 않는다. 검증하는 모든 입력은 로컬 파일이다.
- 카탈로그 검사는 변경 중인 폴더 대신 고정된 CI checkout 또는 완성된 배포 산출물에서 실행한다. 다른 프로세스가 부모 디렉터리를 검사 도중 교체하는 상황까지 막는 파일시스템 sandbox는 아니다.
- ZIP 검사는 압축을 풀거나 게임·제작자 코드를 실행하지 않는다.

설치 명령은 다음과 같다. 이미 설치된 환경에서는 다시 설치하지 않아도 된다.

```text
python -m pip install jsonschema==4.26.0 PyYAML==6.0.3
```

## 2. 인터페이스와 결과

```python
validate_catalog(project_root: Path, catalog_path: Path, specs_dir: Path) -> list[dict]
validate_archive(archive_path: Path) -> list[dict]
```

상대 `catalog_path`는 `project_root`를 기준으로 해석한다. 절대 경로도 프로젝트 내부일 때만 허용한다. `specs_dir`에는 `catalog.schema.json`, `game.manifest.schema.json`이 있어야 한다. 스키마의 외부 `$ref`·`$dynamicRef`는 거부하며 HTTP 요청으로 보완하지 않는다.

모든 검사 결과에는 `id`, `title`, `status`, `message`가 있고 추가 설명은 `details` 또는 `evidence`에 기록한다. `status`는 아래 네 값 중 하나다.

| 상태 | 의미 | 릴리스에서의 처리 |
|---|---|---|
| pass | 이 검사의 정의된 범위를 통과 | 다른 검사와 환경 증거도 함께 확인 |
| fail | 입력 오류 또는 계약 위반 | 배포 중지, 수정 후 동일 입력으로 재검사 |
| warning | 일부 검사가 완료되지 않았거나 별도 검토 필요 | 이유와 미검증 범위를 검토하기 전 자동 승격 금지 |
| skip | 이 도구가 해당 범위를 검증하지 않았음 | 해당 범위가 필수 게이트이면 별도 증거 필요 |

JSON 읽기·파싱, 없는 파일, 거부된 경로 같은 오류도 결과 목록으로 반환한다. 코드 실행·네트워크 인증 오류와 섞어 “게임이 안전하다”는 하나의 초록 상태로 표현하지 않는다.

## 3. Windows PowerShell에서 fixture 확인

명령 프롬프트의 현재 폴더를 계획 패키지의 `automation`으로 옮긴 다음 실행한다. 아래 `@' ... '@`는 PowerShell의 문자열 입력 문법이다.

```powershell
@'
import json
from pathlib import Path
from platform_check.catalog import validate_catalog

checks = validate_catalog(
    Path("fixtures/catalog_valid"),
    Path("catalog/games.json"),
    Path("../specs"),
)
print(json.dumps(checks, ensure_ascii=False, indent=2))
raise SystemExit(1 if any(c["status"] == "fail" for c in checks) else 0)
'@ | python -
```

`fixtures/catalog_valid`의 `fixture-demo`는 검사 입력이다. 실제 게임 8종이나 사용자·관리자 서비스 구현이 아니다. 테스트용 표지를 포함한 작은 파일 묶음으로 정상 참조 구조를 재현한다.

## 4. IIS PoC 배포 산출물 검사

실제 PoC에서는 Node 빌드를 먼저 수행하고 **완성된 `dist/user` 디렉터리**를 `project_root`로 전달한다. 소스가 공통 SDK·렌더링 파일을 참조하더라도 빌드가 각 게임의 `vendor` 등에 복제하고 HTML 상대 경로를 고친 뒤 검사해야 한다. 소스 폴더가 아니라 실제 IIS에 복사할 게임 묶음을 확인하는 이유다.

아래 경로는 설치 위치 예시다. 실제 압축을 푼 위치로 바꾼다. Python의 현재 폴더는 앞 절과 같이 `automation`이다.

```python
from pathlib import Path
from platform_check.catalog import validate_catalog

checks = validate_catalog(
    Path(r"C:\WebGame\Web_Game_Platform_IIS_PoC\dist\user"),
    Path("catalog/games.json"),
    Path("../specs"),
)
```

검사 입력에는 게임별 `game.manifest.json`, `index.html`, manifest가 참조하는 미디어와 HTML 자산이 실제로 있어야 한다. 최상위 게임 폴더 이름과 카탈로그 ID가 다르거나 공통 자산을 찾으려고 게임 폴더 밖으로 나가면 실패한다. 원래 문서의 `specs/catalog.example.json`은 실제 게임 파일이 없는 설계 예시이므로 파일 검사에 통과하지 않는 것이 정상이다.

## 5. 카탈로그 검사 범위

| 범위 | 구현한 확인 |
|---|---|
| JSON 입력 | UTF-8, 중복 키·NaN 거부, 파일당 1 MiB 읽기 한도 |
| 스키마 | 로컬 Draft 2020-12 계약, ko/en 조작법·SEO·입력·기능·저장 선언 |
| 식별자 | ID·경로 각각 중복, slug 중복, `games/<id>`와 manifest ID·초기 slug 일치 |
| 파일 경계 | 폴더·entry·미디어 실존, symlink·특수 파일·폴더 이탈 거부 |
| 정적 트리 | 게임당 최대 2,000항목, 깊이 32, 개별 100 MiB·전체 300 MiB, 경로 240 UTF-8 bytes, NFC/casefold 충돌 |
| HTML 참조 | script·stylesheet·img·media 등 선언된 상대 파일, srcset, query가 붙은 파일 경로, 외부/절대 URL·base·중첩 embed 차단 |
| SEO 내용 | 공백뿐인 메타데이터, 잘못된 언어 필드, 메타데이터 HTML, 본문에 있는 명백한 활성 콘텐츠 표기 |
| 비활성 | `enabled=false`도 파일 검사를 수행하며 indexable 의도에서 제외 |

HTML은 파일당 최대 2 MiB·게임당 합계 8 MiB만 읽는다. JS `import`·동적 `fetch`·CSS `url()` 의존 그래프는 이 버전에서 추적하지 않는다. 정상 파일이 존재해도 실제 브라우저의 MIME·CSP·CORS·캐시 정책에서 로딩되는지는 별도 검사다.

카탈로그의 enabled/indexable 결과는 **게시 의도**다. 운영 차단 overlay, 실제 목록·검색·SSR·sitemap·신규 실행 차단까지 적용됐다는 증거는 아니다. 게스트 저장·Google 전환·D1/D7/D30도 별도 서비스 시험이 필요하다.

## 6. 미디어와 SVG 프로필

PNG/JPEG/GIF/WebP는 파일 존재·확장자와 대표 헤더를 확인한다. 전체 이미지 디코딩, 시각 품질, 손상 없는 전체 픽셀 출력은 보장하지 않는다.

SVG는 UTF-8 XML 최대 256 KiB를 읽어 표준 SVG namespace, 기본 크기 또는 유효한 viewBox를 확인한다. `svg`, `g`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `path`, `text`, `tspan`, `title`, `desc`와 제한된 속성만 허용한다.

DTD·entity·xml-stylesheet, script·foreignObject·image·use 같은 비허용 요소, 이벤트 속성, href, style, CSS url(), CSS escape, 외부 참조를 거부한다. 따라서 단순 도형·텍스트 표지는 통과할 수 있지만 gradient·filter·외부 폰트·복잡한 스타일이 있는 SVG는 다시 단순화하거나 검증된 래스터 이미지로 내보내야 한다. **이 프로필은 완전한 SVG sanitizer 또는 모든 브라우저의 렌더 보안 인증이 아니다.** 포털에서는 검증된 미디어를 적절한 MIME으로 전달하고 실제 표시 결과도 확인한다.

## 7. ZIP 검사 범위와 제한

```python
from pathlib import Path
from platform_check.archive import validate_archive
checks = validate_archive(Path(r"C:\WebGame\incoming\candidate.zip"))
```

| 항목 | 적용 한도·정책 |
|---|---|
| 압축 파일 | 100 MiB 이하의 일반 파일. ZIP 입력 symlink 거부 |
| 추출 선언량 | 전체 300 MiB·개별 100 MiB 이하 |
| 항목·경로 | 2,000항목, 경로 240 UTF-8 bytes |
| 압축률 | 100배 초과 거부. 오탐 예외는 자동 승인하지 않음 |
| 경로 | `..`, 절대·드라이브·역슬래시·NUL·장치 이름·중복·casefold/NFC 충돌 차단 |
| 파일 유형 | symlink·특수 파일·암호화·패치형 ZIP 차단 |
| 형식 | 일반 단일 ZIP의 stored/deflate. ZIP64·분할·실행 접두부·지원 밖 확장 거부 |
| 사전 구조 | EOCD·중앙 디렉터리의 수·범위·길이를 제한한 후 ZipFile 사용 |
| 진입점 | 비어 있지 않은 루트 `index.html` 하나 |
| payload | 최대 32 MiB·협력적 시간 예산 5초 내 읽기와 CRC 검사 |

payload 읽기가 예산에 닿으면 `ZIP-008`은 `warning`이고 `details.full_crc_verified=false`다. 이 상태를 완전 검사 통과로 변환하지 않는다. 시간 확인은 작은 읽기 사이에서 수행하는 협력적 제한이며 외부 worker의 강제 종료·CPU·메모리 한도를 대체하지 않는다. 전체 구조·payload 확인이 필요하면 더 큰 예산의 격리된 후속 검사 작업을 수행하고 결과를 같은 빌드 해시로 연결한다.

추출 선언량은 ZIP 메타데이터 기준이다. 이후 실제 추출 단계에서도 누적 출력 바이트·파일 수·시간을 별도로 강제 제한해야 한다. CRC 통과는 파일 전송 무결성의 일부를 확인하며 악성 JavaScript 부재나 제작 권리를 증명하지 않는다.

## 8. 회귀 테스트

계획 패키지 루트에서 다음 명령을 실행한다.

```text
python -m unittest discover -s automation/tests -p "test_*.py" -v
```

두 모듈의 최초 통합 확인에서는 **76개 테스트**가 통과했다: catalog 45개, archive 31개. 이 수는 현재 구현에 대한 관찰이며 플랫폼의 전체 수용 조건 개수가 아니다. 통합 패키지에 다른 검증기의 테스트가 추가되면 전체 수는 달라질 수 있다.

회귀 테스트는 매번 임시 폴더·ZIP을 만들고 정상 입력과 오류 입력의 분류를 확인한다. ZIP64, 손상된 DEFLATE, 잘못된 중앙 디렉터리, 압축 폭탄 비율, symlink, 파일 누락, 인코딩된 경로 탈출, SVG 활성 콘텐츠와 검사 예산 초과를 포함한다. 네트워크 호출과 압축 해제는 수행하지 않는다. 결과 보고서에는 입력 snapshot/해시, 도구 버전, Python 버전, 실행 시각, 검사 범위를 함께 남기는 것이 권장된다.
