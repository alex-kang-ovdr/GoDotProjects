# 03. 재귀 개선·평가·배포 계약

## 1. 개선 루프를 분리

### Loop A — 사용자가 요청한 프로젝트 개선

요청/작업 예산 → 범위 조회 → schema 확인 → 최소 변경 → 검증 → PIE → 필요한 수정 → 사용자 수락.

외부 MCP에서는 클라이언트가 다시 도구를 호출할 때 진행한다. 서버가 외부 개인 구독의 새 모델 응답을 임의로 생성할 수 있다고 전제하지 않는다. 중단되면 awaiting_external 상태를 남기고 임시 테스트 세션을 종료한다.

### Loop B — 플랫폼 공통 제작 방식 개선

허용된 통계/예제 → 병목 가설 → workflow 후보 → 플랫폼 소유 sandbox → 고정 평가 → review → 제한 배포 → 롤백 가능.

사용자 프로젝트 원본에서 실험하지 않는다. 외부 요청의 일반화 요약도 원천 허용조건을 상속한다. 일상 사용자 관측은 가설 생성용이며 곧바로 통제된 벤치마크와 같은 근거가 되지 않는다.

## 2. 실제 개선 예시

관측: 같은 API 이름 오류로 3회 재시도한 실행이 많다.
가설: 첫 수정 전 해당 Component Schema 조회를 강제하면 오류 수정 호출을 줄일 수 있다.
후보: schema 조회 캐시 + Lua API 존재 검사 + batch 편집 순서로 변경.
검증: 이동 API가 다른 여러 독립 프로젝트에서 같은 요구사항으로 실행.
반증: 도구 호출은 줄었지만 결과가 틀리거나 처음부터 완성 템플릿을 제공했다면 성능 우위로 주장하지 않는다.

이 예시의 횟수는 동작 설명용이며 실제 사용자 데이터 관측값이 아니다.

## 3. Agent가 바꿀 수 있는 범위

허용 후보: Query projection, schema cache 사용법, batch 분할, 테스트 순서, 오류 요약, 제한된 프롬프트 템플릿.

review 필요: public tool schema, 범용 native helper 추가, 사용자의 코드를 생성하는 API contract 변경.

금지 자동 변경: ACL, 동의 정책, 공급자 사용 규칙, 결제 한도, 개인 구독 소유자, 로그 보관 기간, evaluator, hidden tests, 성공 판정 기준, 운영 배포 승인.

성능을 높이기 위해 보안 검사를 생략하거나 오류 로그를 삭제하는 후보는 실패로 판정한다. 새로운 게임 전용 에디터 기능으로 벤치마크를 외우게 하지 않는다.

## 4. 비용 제한 제안

한 요청의 자동 수정 최대 3회, batch 최대 200 operation, 응답 기본 8 KB 이내 및 상세 결과 요청 시 분리 반환, 플랫폼 실험 동시 실행 1개에서 시작한다. 모두 초기 튜닝 제안이다.

마지막 성공 snapshot을 보존하되 제한 용량 내에서 수행한다. 메모리·파일·작업시간 예산을 초과하면 실패 상태와 최소 결과를 남기고 멈춘다. 무한 재귀나 '목표 달성까지 무제한 실행'은 제공하지 않는다.

## 5. 증거 수준

| 값 | 근거 |
|---|---|
| Gateway 처리시간 | server measured |
| 도구 첫/마지막 호출 간격 | tool window; 전체 제작시간 아님 |
| 전체 제작시간 | orchestrator 시작부터 완료/실패까지 계측한 실험만 |
| 토큰 | provider-metered, client-reported, unknown 구분 |
| 캐시 토큰 | 공급자 정의에 따라 중복 합산하지 않음 |
| 모델명 | 공급자 확인값과 클라이언트 주장값 분리 |
| 테스트 | 정확한 validation snapshot과 연결 |
| GPU·브라우저 성능 | 환경 및 측정 모드와 함께 기록 |

토큰 null은 0이 아니다. 문자열 길이 추정은 실제 과금 토큰과 구분한다. 자체 reported 결과를 주 성능 주장에 사용하지 않는다.

## 6. Unity MCP 비교 실험

정확한 Unity 버전, MCP 구현/commit, PlayForge 버전, 모델/추론설정, 프롬프트, 제공 에셋, 하드웨어, cold/warm cache 모드, 시간/예산 한도를 동결한다. 템플릿 제공 조건이 다르면 서로 다른 실험군이다.

동일 과제를 양쪽에서 paired run으로 반복하고 실행 순서를 교차한다. 실패·취소·timeout·재시도도 기록하며 성공한 실행만 남기지 않는다. 연습 과제와 held-out 프로젝트를 분리하고 프로젝트 복제본이 양쪽 split에 흩어지지 않도록 한다.

반복 횟수는 변동성과 사전 표본 설계에 따라 정한다. '5회면 통계적으로 충분'이라고 고정하지 않는다. 여러 후보를 반복 평가할 때 검증 과적합을 막고 최종 후보는 독립 held-out에서 확정한다.

## 7. 승격과 경쟁 우위 주장을 분리

버그 수정은 기능·안전·성능 회귀 검사를 거쳐 승격할 수 있다. 모든 수정이 Unity보다 세 지표 모두 우월해야 하는 것은 아니다.

단, '더 빠르고, 토큰이 적고, 품질이 높다'는 결론에는 세 지표의 증거가 모두 필요하다. 제안 수치 예시는 다음과 같다.

```text
mandatory tests = all passed
security/integrity gates = passed
held-out + fixed evaluator = passed
full time & verified token evidence = available
upper95(time_candidate / time_baseline) < 0.95
upper95(tokens_candidate / tokens_baseline) < 0.95
lower95(quality_candidate - quality_baseline) > 0
resource ceiling = passed
```

95% 구간과 5% 개선폭은 프로토콜 제안이며 실제 우위를 확인한 것이 아니다. 시간·토큰 감소율을 평균만으로 비교하지 않는다. 품질 점수는 시각 blind 평가와 기능·안정성·성능 측정으로 정의하고, 품질 비열등을 품질 우월이라고 쓰지 않는다.

C++ EvaluatePromotion은 별도 evaluator가 산출한 입력의 gate만 판정한다. 통계량을 계산하거나 진실성을 증명하지 않으며 결과도 EligibleForReview이지 자동 운영 배포가 아니다.

## 8. 운영 승격

Draft → SandboxValidated → Reviewed → LimitedRollout → Stable.

Candidate Hash, Evaluator Hash, Dataset Manifest Hash, Policy Epoch를 고정한다. 정책·동의 변경 시 dataset eligibility를 재검사한다. Stable에는 관리자 승인 및 이전 버전으로 복귀 가능한 설정 포인터를 둔다. 운영 사용자의 개인 코드나 연결을 실험 A/B에 무단 투입하지 않는다.

## 9. 장애/경계 테스트 계획

| 상황 | 기대 결과 |
|---|---|
| MCP 중복 요청 | 한 번 수정, 한 번 집계 |
| 같은 키 다른 payload | 명시적 오류 |
| 동일 속성 동시 편집 | revision conflict, 상대 변경 보존 |
| 테스트 중 사용자 수정 | 이전 snapshot 결과로 표시, 최신 통과 주장 금지 |
| optional 분석 장애 | 편집·저장 성공 유지 |
| 필수 Operation 저장 장애 | 편집 성공 ACK 금지 |
| 동의 철회 후 대기 실험 | dispatch 차단/재평가 |
| dataset에 제한 source 혼합 | 상속 제한 유지 |
| 토큰 미확인 | 전체 효율 우위 주장 불가 |
| private key 로그 유입 | 저장 전에 제거/거부, 조사 기록 최소화 |
| 개인 연결 해제 | 신규 모델 요청·도구 접근 중단, 프로젝트 보존 |
| Pro 한도 소진 | 명시적 중단, 다른 비용 경로 자동 전환 금지 |

위는 E2E 계획이다. 동봉 unit tests가 실제 네트워크·DB·권한 서비스 장애를 시험한 것은 아니다.

## 10. 성공 기준

첫 단계: 외부 AI가 범용 작업을 적용하고 동일 snapshot을 검증하며 사용자가 변경을 확인/Undo할 수 있다.
두 번째: 허용된 기록만 improvement dataset에 편입되고 철회로 신규 사용이 중단된다.
세 번째: 후보가 고정 평가에서 검증되고 실제 비용·품질 근거로 review된다.
네 번째: 개인 AI 사용량을 플랫폼 자체 실험에 전가하지 않고도 개선 루프가 작동한다.

이 패키지에서 완료된 것은 정책 함수와 스키마 검증이다. 외부 서비스 실제 연동, 재귀 개선 Agent 실행, Unity 비교 성과는 아직 측정하지 않았다.
