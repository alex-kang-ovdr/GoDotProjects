# PlayForge Cloud — 외부 AI 작업 기반 재귀 개선 vNext

작성일: 2026-11-17

온라인 협업·무설치 웹 제작·AI 주도 재귀 개선을 위한 **추가 설계와 독립 검증 예제**입니다. 기존 v17 또는 에디터 파일을 수정·통합한 배포본은 아닙니다.

## 핵심 결정

- 플랫폼 AI, 개인 API, 지원되는 개인 구독 연결, 외부 MCP를 공통 Command API에 연결합니다.
- 요청 처리 권한과 데이터의 2차 활용 권한은 별개입니다.
- 서비스에 필요한 최소 기록만 기본 보관합니다. 외부 요청 전체가 자동으로 공통 학습 데이터가 되지는 않습니다.
- 요청·원문·코드·관측 통계 각각의 출처와 적용 조건을 유지합니다. 가명화·요약·재업로드로 원래 제한이 사라지지 않습니다.
- 알 수 없는 모델·토큰·전체 제작 시간은 null/미확인으로 남깁니다.
- 프로젝트 개선과 플랫폼 공통 실험을 구분합니다. 플랫폼 실험은 플랫폼 예산을 사용합니다.
- 재귀 개선 Agent는 평가기·권한·결제·보관·안전 정책을 직접 변경할 수 없습니다.
- 런타임 C++20, 게임 Lua, 웹 TypeScript 정책 유지. Rust 또는 별도 데이터 플랫폼을 추가하지 않습니다.

## 확정 요금제

| 항목 | Free | Pro |
|---|---|---|
| 제작 공간 | 100 MB | 1 GB |
| 소유 프로젝트 | 3개 | 제한 없음 |
| 배포 공간 | 50 MB | 100 MB |
| 플랫폼 AI | 최초 1회 체험권, 양 미정 | 주간 한도, 양 미정 |
| 개인 AI 연결 | 공식 허용 경로 | 동일 |

제작/배포 공간은 계정 합산입니다. 기술 로그는 제작 공간에 넣지 않는 정책을 제안합니다. 실제 프로젝트 소스·원본 에셋·사용자 보관 스냅샷에는 기존 용량 정책을 적용합니다. 모든 숫자 외 실험 상한은 본 패키지의 제안값입니다.

## 구성

- `docs/01_Architecture.md`: 공통 실행 경로, 협업 무결성, MCP 계약, 저장 경계
- `docs/02_DataPolicy_Security.md`: 사용 목적, 공급자별 조건, 철회·보관·마케팅
- `docs/03_RecursiveEvaluation.md`: 개선 루프, 고정 평가, 실패 복구, 완료 기준
- `docs/04_Sources.md`: 공식 자료와 확인 기준
- `schemas/workflow-run.schema.json`: 서버가 작성하는 실행 기록 형식
- `config/`: 미승인 정책 템플릿과 제품 정책 제안
- `examples/`: 가상 데이터이며 실제 측정이 아님
- `cpp/PolicyGate.hpp`: C++20 순수 정책 판정 함수
- `cpp/PolicyGateTests.cpp`: 38개 판정 단위 검사
- `tests/validate_examples.py`: 8개 JSON Schema 검사
- `reports/`: 실제 실행 결과와 환경 정보

## C++ 빌드·실행

외부 라이브러리가 필요하지 않습니다. C++20 컴파일러와 CMake가 필요합니다.

```sh
cmake -S . -B build
cmake --build build --config Debug
ctest --test-dir build -C Debug --output-on-failure
```

JSON Schema 검사는 선택 사항이며 Python의 `jsonschema` 패키지가 필요합니다.

```sh
python tests/validate_examples.py
```

## 검증 범위

Linux 환경에서 C++20 컴파일, CTest, 38개 정책 판정, 8개 Schema 검사, AddressSanitizer/UndefinedBehaviorSanitizer 검사를 수행했습니다. 상세 환경은 reports/verification.json을 확인하십시오.

**아직 없는 기능:** 실제 OAuth 로그인, 실제 개인 구독 연결, MCP 네트워크 서버, 운영 DB·Outbox, DLP/비밀 탐지기, 모델 호출, AI 학습, 브라우저 UI, 실제 Unity 비교 실험, 실서비스 부하·장애 검증.

C++ 코드는 신뢰된 서버 컴포넌트가 이미 확인한 정책·권한 사실을 입력받아 판정하는 예제입니다. boolean을 클라이언트에서 받아 인가에 사용해서는 안 됩니다. 코드 자체는 약관 해석·법률 판단·인증·분산 경합 방지를 수행하지 않습니다. 예제에서 grant를 허용한 정책은 모두 가상 테스트 정책이며 실제 공급자에 대한 허가를 뜻하지 않습니다.

법무·보안 검토와 각 공급자의 현재 계약 및 실제 승인 조건은 운영 전 별도로 필요합니다. 사용자 동의 하나만으로 외부 서비스 이용조건을 변경할 수 없습니다.
