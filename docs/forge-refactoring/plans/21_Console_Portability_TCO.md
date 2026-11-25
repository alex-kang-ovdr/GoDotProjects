# 21. 콘솔 포팅 경계·출시 준비·총소유비용 검증

| 항목 | 계획 |
|---|---|
| 계획 ID / 기준일 | PLAN-21 / 2026-11-24 |
| 원문 연결 | PDF 4, 8-10쪽: 콘솔 미들웨어, 지원 버전, TCO, 사전 도입 gate |
| 우선순위 / 상태 | P3, 콘솔 타이틀 확정 후 착수 / 계획만 작성 |
| 구현 위치 | 게임 platform adapter·비공개 콘솔 build pipeline, 최소 engine port patch |
| 담당 | 포팅 엔지니어, 플랫폼 QA, 계약·출시 담당 |
| 예상 공수 | 공통 기반+선택 콘솔 1개 수직 slice 12-22 PW; 완성 게임 포팅·인증은 별도 추정 |
| 선행 / 연계 | 승인된 SDK/장비/미들웨어, 16 빌드, 18 입력, 23 addon 지원표 |

## 1. 목표와 범위

콘솔 출하를 실제로 선택한 게임이 플랫폼별 인증·성능·입력·저장 요구를 충족하도록 경계를 만들고, 지원하지 않는 엔진/언어/addon 조합을 본 개발 전에 발견한다.

첫 플랫폼은 타깃 시장·예상 매출·필수 기능·유지 계약을 비교해 1개만 선정한다. Windows·모바일·Linux 데디케이티드 서버의 기본 개발을 콘솔 승인 대기로 멈추지 않는다. 사용자 게임은 개별 프로젝트로 관리하고 포팅 공용 도구만 재사용한다.

## 2. 공식 확인과 원문 보정

Godot는 콘솔 제조사 승인·공식 SDK·개발킷·별도 export template가 필요하고, 자체 포팅 또는 허가된 middleware/포팅사 경로를 설명한다. 공개 페이지는 공급자 후보를 찾는 근거이지 모든 버전·언어·장르 지원을 보증하지 않는다. [Godot Console Support](https://godotengine.org/consoles/index.html)

Godot의 MIT 라이선스는 수정 코드의 전면 공개를 강제하는 라이선스가 아니다. 원문의 '전체 코드 공개 원칙'을 기술적 법적 금지로 확대하지 않고, 폐쇄 SDK와 계약·재단 운영 범위를 구분한다. [Godot License](https://godotengine.org/license/)

W4 등의 정확한 현행 가격·C#·신형 콘솔·지원 엔진 버전은 견적과 계약 지원표로 확정한다. 원문에 제시된 정액·인원 손익분기 숫자는 이 계획의 예산으로 재사용하지 않는다.

## 3. 공통 플랫폼 경계

| 인터페이스 제안 | 처리할 기능 | PC/mobile 기본 구현 |
|---|---|---|
| PlatformIdentity | 로그인·계정 전환·사용자 프로필 | 29의 계정 adapter |
| PlatformStorage | 저장·quota·동기화·손상 복구 | 프로젝트별 user storage |
| PlatformCommerce | entitlement·구매 UI·복원 | 18 구매 adapter |
| PlatformSocial | 초대·친구·presence·blocked user | 권한 있는 서비스별 경로 |
| PlatformLifecycle | suspend/resume·장치 해제·종료 | OS 수명주기 이벤트 |
| PlatformInput | controller·초기 player assign·재연결 | 공통 action mapping |

공개 repository에는 위 추상 계약과 mock만 둔다. 콘솔 SDK·문서·내부 요구 식별자·키·template는 계약 범위에 맞는 비공개 저장·실행기로 분리한다. 코어 게임은 SDK header를 직접 포함하지 않도록 한다.

## 4. 제안 지원 manifest

```yaml
# 자체 제안, 콘솔 제조사 규격을 대체하지 않음
console_target:
  platform: selected-approved-platform
  engine_port_commit: licensed-port-commit
  middleware_contract: internal-contract-reference
  sdk_version: restricted-version-reference
  language_profile: gdscript
  native_addons: [approved-addon-digests]
  multiplayer_protocol_hash: shared-game-protocol
  support_until: contracted-date
```

공개 로그에는 실제 제한 정보 대신 내부 참조 ID만 기록한다. 익스포트 전 패키지 resolver가 콘솔용 binary·재배포 권한·지원 기간을 확인한다. 지원 경로가 없는 addon은 초기 콘텐츠 검사에서 차단한다.

## 5. 3년 TCO 모델

다음 식은 의사결정 도구이며 견적이 아니다.

`TCO_3y = 초기 포팅 인건비 + middleware/지원 계약 + 장비 + QA/인증 재제출 + CI/운영 + 3년 패치 유지 + 업그레이드 위험 예산`

| 입력 | 산정 방법 | 민감도 축 |
|---|---|---|
| 포팅 공수 | 동일 slice의 실제 작업시간 | 플랫폼 1/2/3개 |
| 미들웨어 | 타이틀·좌석·IP 조건을 포함한 서면 견적 | 지원 등급·계약 종료 |
| 업데이트 유지 | 연간 engine/SDK 변경 횟수 × 회귀 공수 | LTS 고정 vs 잦은 업그레이드 |
| 외부 addon | 콘솔 build·license·support 비용 | GDScript-only vs native |
| 인증·QA | checklist 범위·재제출 예상 | online·commerce·UGC 기능 |
| 지연 비용 | 출시가 늦어질 때의 사업 추정 | 낙관/기준/보수 시나리오 |

자체 포팅, middleware+내부 개발, 포팅사 일괄 위탁을 같은 기능 범위로 비교한다. 엔진 라이선스 비용만 비교하지 않는다. 상업적 손익분기는 실제 견적과 보유 인력에서 계산하며 일반 인원수로 고정하지 않는다.

## 6. 작업 분해

| 작업 | 내용 | PW | 산출물 |
|---|---|---:|---|
| K21-1 | 요구·승인·지원표·견적 수집 설계 | 2-4 | 콘솔 선택 gate, TCO 입력표 |
| K21-2 | 공통 platform adapter·mock | 2-4 | 공개 interface·테스트 double |
| K21-3 | 선택 콘솔 1개 build·수직 slice | 3-5 | 비공개 실행본, 포팅 병목 |
| K21-4 | 저장·계정·수명주기·입력 검증 | 2-4 | 핵심 시나리오 결과 |
| K21-5 | 성능·메모리·addon 검증 | 2-3 | 지원 가능한 콘텐츠 예산 |
| K21-6 | 출시·유지 runbook과 TCO 재산정 | 1-2 | 진행/중단 결론 |
| 합계 | 제조사 승인·개발킷·계약 대기 제외 | **12-22** | 첫 플랫폼의 타당성 검증 |

12-22 PW에는 전체 상업 게임의 모든 콘텐츠 포팅이나 인증 통과를 포함하지 않는다. slice 측정 후 남은 게임별 작업과 플랫폼별 인증 공수를 별도 산정한다.

## 7. 단계별 gate

G0: 제조사 승인·SDK 접근·미들웨어 지원 범위와 유지 조건 확인. G1: 선택 버전으로 빈 프로젝트 부팅 및 controller. G2: 대표 게임 slice·저장·online 흐름. G3: 출시 일정과 남은 기능 목록·TCO 확정.

계약상 지원되는 engine 버전이 production 기준과 다르면 별도 장기 branch의 유지 비용을 계산한다. 최신 버전 추종보다 호환 가능한 commit을 우선하되 보안·필수 SDK 갱신을 누락하지 않는다.

## 8. 완료 기준

| 검증 | 방법 | 목표 |
|---|---|---|
| 빌드 | 승인된 clean runner 10회 | 수동 파일 복사 없는 성공 10회 |
| 입력 | controller detach/reattach 30회 | player 귀속 오류·입력 고착 0 |
| 저장 | 저장 중 종료·공간 부족·계정 전환 | 타 계정 노출 0, 복구 가능한 이전 save |
| 수명주기 | suspend/resume 30회 | crash 0, 권한·세션 상태 재검증 |
| 네트워크 | DS+콘솔+PC client, reconnect | 25-30의 동일 authority·protocol 규칙 |
| 성능 | 고정 slice 30분, 3회 | platform별 사전 합의 frame/memory budget |
| 지원 범위 | 모든 addon과 SDK 목록 검사 | 미확인 배포 권한·native dependency 0 |

위 목표는 준비 완료 gate다. 실제 제조사 인증 결과는 해당 절차가 끝난 뒤에만 '통과'로 기록한다.

## 9. 위험·대안·중단 기준

핵심 native addon 또는 C#이 선택 콘솔에서 지원되지 않으면 2주 spike로 대체 구현 범위를 산정한다. 제품 핵심을 훼손하거나 승인된 예산을 넘으면 해당 플랫폼 출시를 보류한다.

정적 game bundle과 동적 UGC 다운로드는 검토할 정책·기술 범위가 다르다. UGC 플랫폼 전체를 콘솔에 배포하는 계획은 개별 게임 포팅 성공 후 별도 과제로 다룬다. 공개 저장소와 NDA 자료의 자동 동기화는 하지 않는다.

## 10. 제출 산출물·출처

산출물은 플랫폼 추상 계층, 비공개 build preset, addon 지원표, 수직 slice 증거, 3년 TCO sheet의 Markdown 입력·산식, 출시 checklist와 유지 계약 검토표다.

확인일: 2026-11-24.

- [Godot 콘솔 지원·공급자·승인 절차](https://godotengine.org/consoles/index.html)
- [Godot License](https://godotengine.org/license/)
- 원문 PDF 4, 9-10쪽은 요구사항 출처이며 현재 가격·지원표의 증빙으로 사용하지 않는다.
