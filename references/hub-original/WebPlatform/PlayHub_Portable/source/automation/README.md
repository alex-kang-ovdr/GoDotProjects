# 플랫폼 검증 자동화

이 폴더에는 실제 실행 가능한 Python 검증 CLI와 회귀 검사가 있습니다. 정적 검사와 실제 서비스 실행의 증거를 구분합니다. IIS PoC의 Node.js API·게임 규칙·HTTP 검사는 실행 패키지의 tools·tests에 있습니다.

## 설치

Python 3.11 이상이 필요합니다. `automation` 폴더에서 다음 명령을 실행합니다.

```text
python -m pip install -r requirements.txt
python -m platform_check contracts
python -m unittest discover -s tests -v
```

## 게임 빌드 검사

PoC의 `node tools/build.mjs`가 성공한 뒤, 실제 생성된 사용자 웹 루트를 검사합니다. 다음 경로는 압축을 푼 위치에 맞춰 바꿉니다.

```text
python -m platform_check all --project C:\WebGame\Web_Game_Platform_IIS_PoC\dist\user --report reports\poc-static.json
```

공통 SDK가 게임별 `vendor`로 복제된 산출물을 검사하므로 소스의 공유 파일과 배포 게임의 독립성을 모두 유지합니다. 게임별 폴더·목록 파일 추가 후 동일 명령을 다시 실행하면 됩니다.

## 단일 기능

```text
python -m platform_check catalog --project PATH_TO_BUILT_WEBROOT
python -m platform_check archive --archive PATH_TO_ONE_GAME_ZIP
python -m platform_check events --events PATH_TO_PRODUCTION_EVENT_BATCH_JSON
```

ZIP 검사는 **게임 업로드 하나의 패키지**용입니다. 문서·서버·설치 스크립트가 함께 있는 전체 PoC 배포 ZIP에 게임 업로드 정책을 적용하지 않습니다. 파일을 추출하거나 게임 코드를 실행하지 않습니다.

이벤트 CLI는 기존 제품 설계의 `analytics_events.schema.json`을 검사합니다. PoC 입력은 일부 선택 필드·경로가 단순화된 별도 어댑터이므로 실제 실행 계약은 PoC의 `docs/POC_API_CONTRACT.md` 및 Node HTTP 테스트를 따릅니다. 두 계약이 같은 완성 수준이라고 표시하지 않습니다.

## 결과와 종료 코드

JSON 보고서와 같은 이름의 HTML·JUnit XML 보고서를 자동 생성합니다. `0`은 선택한 검사의 실패 없음, `1`은 검사 실패, `2`는 명령 인자 오류입니다. `warning`·`skip`은 검사 미수행 또는 범위 제한이며 배포 승인으로 해석하지 않습니다. `all`도 파일·계약 검사의 전체일 뿐 실제 IIS·Google·브라우저 검증을 포함하지 않습니다.

실제 구현 범위·보안 한도·회귀 사례는 `README_catalog_archive.md`를 함께 읽으세요.
