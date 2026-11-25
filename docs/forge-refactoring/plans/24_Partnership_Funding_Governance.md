# 24. 벤더 통합 인증·유지보수 파트너십·개발 재원 운영

| 항목 | 계획 |
|---|---|
| 계획 ID / 기준일 | PLAN-24 / 2026-11-24 |
| 원문 연결 | PDF 1-2, 7-8쪽: 벤더 공식 GDExtension, 인증 배지, 스토어 환원·지정 후원 |
| 우선순위 / 상태 | P1 운영 기반, 공식 제휴·재단 정책은 외부 협의 / 제안 단계 |
| 구현 위치 | 자체 파트너 portal·인증 CI·지원 registry·예산 원장 |
| 담당 | 플랫폼 리드, 파트너 운영, QA, 재무/계약 담당 |
| 예상 공수 | 초기 시스템·정책 10-16 PW, 1 PW = 숙련 담당자 5근무일 |
| 선행 / 연계 | 23 패키지, 16 CI, 17 기기 QA, 22 스토어; 14 오디오·18 SDK·30 보안 |

## 1. 목표와 통제 범위

FMOD/Wwise, 모바일 SDK, EOS, VCS와 같은 외부 통합의 유지 주체·지원 버전·검증 증거·업데이트 비용을 명확하게 한다. 엔진 팀 한 곳이 모든 plugin을 장기 유지하는 구조를 피하고, 계약과 시험 결과로 책임을 배분한다.

자체 조직은 내부 검증 기준·인증 dashboard·유지보수 예산을 결정할 수 있다. 벤더의 공식 Godot 지원, 재단의 인증 제도·수수료 환원·전담 인력 증원은 외부 당사자가 결정한다. 현재 제휴나 후원을 확보한 것으로 기술하지 않는다.

## 2. 공식 근거와 원문 보정

Godot priorities는 우선순위를 이상적인 wishlist로 설명하며 기여·후원·담당자 자원에 영향을 받는다고 밝힌다. 일정 약정으로 해석하지 않는다. [Godot priorities](https://godotengine.org/priorities/)

Godot Development Fund는 개인·기업 후원 경로를 제공한다. 원문 재원 수치·2-3배 확대는 이 계획의 확정 예산이나 달성 목표로 승격하지 않는다. [Development Fund](https://fund.godotengine.org/)

MIT 라이선스와 각 addon/SDK의 라이선스는 별개다. 자체 배지나 상업 계약이 원저작권·재배포 조건을 바꾸지 않는다. [Godot License](https://godotengine.org/license/)

## 3. 파트너 분류와 지원 책임

| 구분 | 표시 가능한 상태 | 근거 | 유지 책임 |
|---|---|---|---|
| Community integration | 커뮤니티 구현 | 공개 repo·maintainer | repo 담당자와 내부 owner |
| Platform tested | 자체 플랫폼 검증 | exact version+test report | 내부 support window |
| Vendor maintained | 벤더 유지 통합 | 벤더 공개 명시 또는 계약 | 벤더 범위+내부 adapter |
| Contract supported | 계약 기술지원 | 유효한 계약·응답 범위 | 계약 주체 |
| Deprecated/Revoked | 지원 종료·인증 해제 | 종료 근거·실패 결과 | migration 담당 |

`Platform tested`를 벤더 공식 인증처럼 표시하지 않는다. Badge에는 engine/platform/version·검증일·만료일을 연결하고 사용자가 실제 증거를 열어볼 수 있게 한다.

## 4. 제안 registry·인증 API

```yaml
# 자체 운영 데이터 계약
IntegrationCertification:
  package_id: vendor.integration
  package_digest: resolved-sha256
  engine_commit: resolved-commit
  targets: [windows, android]
  test_suite_version: cert-suite-v1
  test_report_digest: resolved-report
  status: platform_tested
  maintainer: verified-organization-reference
  support_window: versioned-support-policy
  expires_at: reviewed-expiry
  vendor_endorsement_evidence: optional-reference
```

제안 API는 `submit_candidate`, `run_certification`, `publish_status`, `revoke_status`, `query_supported_targets`다. 인증된 package digest가 바뀌면 인증을 승계하지 않고 차이 범위에 맞게 재검증한다.

UI는 사용자에게 호환성·유지 주체·기능·대체 옵션을 보여준다. 영업 표현 대신 확인된 지원 정보를 우선 노출한다. 지원 종료된 plugin도 기존 프로젝트의 기록과 dependency 분석에는 남긴다.

## 5. 인증 시험 팩

공통 시험은 설치/삭제, engine 업데이트, target별 export, 최소 기능, crash·메모리, 동시 사용 조합, 라이선스 고지와 native dependency 목록을 포함한다.

분야별로 오디오는 bank·streaming·suspend, 결제는 중복·환불·보류, 광고는 앱 중단·보상 검증, VCS는 lock·rename·충돌, EOS는 계정·session·운영 정책을 추가한다. 25-30의 네트워크 authority는 SDK 인증과 별개로 검증한다.

Web 지원은 Web 바이너리·API와 browser fixture가 통과해야 표시한다. iOS/콘솔의 인증은 플랫폼 접근 권한이 있는 담당이 별도 환경에서 수행한다. 테스트 성공이 해당 플랫폼 스토어 심사 합격을 대신하지 않는다.

## 6. 유지보수·재원 모델

개발비는 신규 기능과 운영 유지비를 분리한다. 프로젝트별 직접 통합 비용은 개별 원가로, 공용 adapter·CI·지원 도구는 공용 원가로 기록한다. 나중에 공용 비용을 모든 게임에 중복 청구하지 않도록 배분 규칙을 둔다.

`유지 재원 = 내부 승인 예산 + 확정 계약 지원금 + 실제 수령 후원금 + 승인된 스토어 순수익 배분`

스토어 순수익은 매출에서 PSP 수수료·환불·정산 비용·운영비 등 정의한 항목을 뺀 값으로, gross 매출과 구분한다. 배분율은 현금흐름 검토 이후 결정하며 아직 지급되지 않은 매출로 장기 고용을 약속하지 않는다.

지정 후원은 milestone, 공개 가능한 산출물, 유지 기간, 미달 시 처리, upstream 독립성, 이해충돌을 기록한다. 재단 수용 여부가 불확실하면 자체 구현/유지 범위에서 계약하고 공식 병합을 계약 결과로 약속하지 않는다.

## 7. 작업 분해

| 작업 | 내용 | PW | 산출물 |
|---|---|---:|---|
| G24-1 | 통합 inventory·owner·지원 분류 | 2-3 | vendor/adapter 지원 registry |
| G24-2 | 인증 policy·시험 규격·배지 의미 | 1-2 | certification schema |
| G24-3 | CI 검증·증거·상태 게시 | 2-3 | 자동 검사와 dashboard |
| G24-4 | 파트너 portal·지원·종료 workflow | 2-3 | 제출·갱신·revocation 흐름 |
| G24-5 | 예산·성과·원가 dashboard | 2-3 | 유지비 모델·자금 기록 |
| G24-6 | pilot 3건·운영 인수 | 1-2 | pilot 결과·개선 backlog |
| 합계 | 제휴 협상·외부 회신·법무 대기 제외 | **10-16** | 자체 운영 기반 |

## 8. 단계와 의존성

첫 pilot은 실제 사용하는 통합 3개를 선정한다. 예를 들어 오디오·결제·VCS에서 각 1개를 골라 검증 증거와 유지 책임을 정리한다. 이 목록은 특정 벤더와의 계약 체결을 뜻하지 않는다.

23의 immutable artifact와 16의 재현 build가 있어야 인증 대상을 고정할 수 있다. 스토어 판매·노출 우대는 기술 인증 통과와 운영 정책을 별도로 검토한다. 유료 sponsor라는 이유만으로 검증 실패를 면제하지 않는다.

## 9. 완료 기준·운영 KPI

| 검증 | 시험 | 계획 목표 |
|---|---|---|
| 책임 추적 | pilot integration 3개 | owner·지원 버전·종료 경로 누락 0 |
| 증거 정합 | badge에서 artifact/test report 추적 | 다른 digest의 인증 재사용 0 |
| 갱신 | engine·SDK·package 변경 시뮬레이션 | 재검증 대상 100% 식별 |
| 철회 | 치명 오류 발견·key 폐기 시뮬레이션 | 신규 설치 안내와 대체 버전 조회 가능 |
| 비용 | pilot 1달 운영 입력으로 원가 재산정 | 신규/유지·프로젝트/공용 비용 분리 |
| 사업 성과 | 실제 체결/입금/지원 성과 집계 | 검증된 기록만 표시, 예상과 실적 분리 |

지원 응답 시간은 계약/인력에 따라 정한다. 초기 내부 목표는 P0 장애 접수 후 1영업일 내 owner 지정이며 24시간 복구 SLA로 홍보하지 않는다. 기금 배수 증가는 완료 기준이 아니다.

## 10. 위험과 대체 경로

벤더가 공식 통합을 제공하지 않으면 검증된 community adapter와 내부 유지 owner를 사용하되 위험 비용을 표기한다. 2회 연속 지원 버전 갱신을 놓치면 신규 프로젝트 추천을 중단하고 대체 integration을 평가한다.

원문이 요청한 재단 거버넌스 개편은 공동 제안서와 타당성 자료까지만 자체 deliverable로 삼는다. 재단 승인·벤더 공식 지원·후원 수입은 외부 gate로 관리하며 일정에 확정 반영하지 않는다.

## 11. 제출 산출물·출처

산출물: integration registry, 인증 시험·배지 정책, 자동 검증 dashboard, 지원·종료 runbook, 비용 배분·후원 milestone 서식, pilot 3건 결과 양식. 실제 파트너 연락·계약·송금은 수행하지 않았다.

확인일: 2026-11-24.

- [Godot priorities](https://godotengine.org/priorities/)
- [Godot Development Fund](https://fund.godotengine.org/)
- [Godot License](https://godotengine.org/license/)
- [Godot SDK Integrations](https://github.com/godot-sdk-integrations): 현재 통합 후보 inventory 참고.
