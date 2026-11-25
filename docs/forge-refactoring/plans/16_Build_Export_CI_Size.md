# 16. 재현 가능한 빌드·헤드리스 익스포트·배포 용량 개선

| 항목 | 계획 |
|---|---|
| 계획 ID / 기준일 | PLAN-16 / 2026-11-24 |
| 원문 연결 | PDF 5-10쪽: CLI 익스포트 안정화, 커스텀 템플릿, 버전 고정, 빌드 경량화 |
| 우선순위 / 상태 | P0 / 개발 계획, 미구현·미측정 |
| 구현 위치 | 공용 빌드 서비스, 프로젝트별 export preset, 템플릿 빌더; 재현된 엔진 결함만 코어 패치 |
| 담당 | 빌드 엔지니어, 플랫폼 담당, QA; 최대 2명 병행 기준 |
| 예상 공수 | 17-27 사람-주(PW); 1 PW는 숙련 담당자 1명의 5근무일 |
| 선행 / 연계 | 기준 엔진 고정, 23 패키지 잠금; 13 심볼, 17 기기 QA, 28 서버 빌드 |

## 1. 목표와 범위

동일 소스와 빌드 계약으로 같은 실행 동작·리소스 집합을 얻고, 실패 원인을 재현할 수 있는 빌드 체계를 만든다. 첫 지원 대상은 Windows 클라이언트, Linux 데디케이티드 서버, Android와 iOS다. Web은 별도 preset으로 관리한다.

프로젝트 게임 데이터와 권한은 분리하고 빌드 실행기·캐시·검증 도구만 공유한다. 에디터를 설치한 개발자뿐 아니라 Forge에서 요청한 빌드도 같은 계약을 사용한다. 이 계획에서 실제 배포 서비스나 저장소 변경을 수행하지 않는다.

## 2. 확인된 기반과 보완 지점

Godot는 `--headless`, `--export-release`, `--export-debug`를 제공한다. 익스포트에는 에디터 바이너리, 맞는 템플릿과 preset이 필요하다. 따라서 CLI를 새로 만드는 과제가 아니라 입력 고정, 오류 검출, 격리, 회귀 검증이 핵심이다. [공식 CLI 문서](https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html)

Godot의 size 최적화 문서는 build profile, 모듈 축소, 크기 최적화 옵션을 제공하면서 동적으로 사용하는 기능을 정적 탐지가 놓칠 수 있다고 설명한다. 자동 제거 목록을 그대로 출하하지 않는다. [공식 크기 최적화 문서](https://docs.godotengine.org/en/stable/engine_details/development/compiling/optimizing_for_size.html)

이하 구조·수치·일정은 자체 개발 제안이며 기존 엔진의 보장 사양이 아니다.

## 3. 빌드 계약과 실행 구조

| 계층 | 책임 | 실패 시 처리 |
|---|---|---|
| Build API | 인증, 프로젝트 권한, 요청 중복 방지, 목표 플랫폼 선택 | 실행 전 명시적인 오류 반환 |
| Resolver | engine/template/SDK/addon/content digest 확정 | 잠금 누락 시 빌드 거절 |
| Worker | 격리된 임시 디렉터리에서 import, export, package | 제한시간·자원 상한으로 종료 |
| Validator | 실행 부팅, 필수 파일, 크기, 라이선스 고지 검사 | artifact를 실패 상태로 보존 |
| Artifact Registry | 실행 파일, manifest, 심볼 연결, 검증 결과 저장 | 불완전 업로드는 게시 불가 |
| Promotion | 검증된 artifact digest를 환경에 연결 | 재빌드 없이 이전 digest로 복구 |

플랫폼마다 worker image와 툴체인 버전을 고정한다. iOS 서명 단계는 접근이 제한된 macOS 실행기로 분리한다. 인증서·키와 공개 로그는 서로 다른 저장 경로를 사용한다.

서명 시각·서명 서버 응답·플랫폼 패키징 차이 때문에 최종 패키지의 바이트 동일성이 항상 가능하지는 않다. 재현성 수준을 `unsigned_binary`, `content_manifest`, `signed_package`로 나누어 보고한다.

## 4. 제안 데이터 계약

다음은 새로 만들 빌드 서비스 스키마이며 Godot 내장 API가 아니다.

```json
{
  "project_id": "project-A",
  "source_commit": "resolved-commit",
  "engine_commit": "resolved-engine-commit",
  "template_sha256": "resolved-template-digest",
  "toolchain_lock_sha256": "resolved-lock-digest",
  "addon_lock_sha256": "resolved-addon-lock-digest",
  "target": "android-arm64",
  "profile": "shipping",
  "export_preset": "AndroidShipping",
  "content_manifest_sha256": "resolved-content-digest",
  "idempotency_key": "request-uuid"
}
```

API는 `POST /builds`, `GET /builds/{id}`, `POST /builds/{id}/cancel`, `GET /artifacts/{digest}/manifest`를 제안한다. 취소는 요청·실행·서명·업로드 단계별로 안전한 종료점을 가진다.

캐시 키는 엔진 commit·import 설정·source hash·renderer profile·target ABI·확장 바이너리 hash를 포함한다. 다른 프로젝트의 비공개 에셋을 캐시 적중 정보로 노출하지 않는다. 캐시가 없어도 성공하는 clean build가 기준이다.

## 5. 용량 개선 절차

1. 엔진 코드, 네이티브 플러그인, 텍스처·오디오, 중복 리소스, 심볼을 분리 계측한다.
2. 목표 ABI와 renderer에 필요 없는 기능을 profile 후보에서 제외한다.
3. 동적 `load()`·reflection·생성 스크립트·원격 콘텐츠가 요구하는 기능을 allowlist에 복원한다.
4. 작은 기본 템플릿과 확장된 기능 템플릿을 계층화하고 기능 조합 수를 제한한다.
5. 설치 용량, 다운로드 크기, 실행 메모리, cold-start 시간의 회귀를 함께 판정한다.
6. 심볼은 분석 저장소에 보관하고 사용자가 받는 패키지와 분리한다.

웹은 압축 전·전송 압축 후 WASM/PCK 크기를 별도 기록한다. APK와 AAB의 크기를 같은 지표로 비교하지 않는다. 크기 절감 때문에 필요한 클래스나 GDExtension ABI를 제거하면 실패로 판정한다.

## 6. 작업 분해와 공수

| 작업 | 내용 | PW | 완료 산출물 |
|---|---|---:|---|
| B16-1 | 지원 플랫폼·잠금 스키마·재현성 수준 정의 | 2-3 | BuildContract v1, 고정 툴체인 목록 |
| B16-2 | clean import/export runner와 실패 분류 | 3-5 | worker, 구조화 로그, 취소·재시도 |
| B16-3 | 템플릿 feature profile와 용량 분석 | 4-6 | 최소/표준 템플릿, 크기 보고서 |
| B16-4 | artifact·심볼·서명 분리와 권한 설정 | 3-5 | manifest, 심볼 연결, 서명 단계 |
| B16-5 | 다중 플랫폼 회귀·캐시 검증 | 3-5 | 재현성 비교, 깨진 캐시 복구 |
| B16-6 | 운영 대시보드·롤백·인수 문서 | 2-3 | runbook, 실패 코드, 운영 시연 |
| 합계 | 외부 스토어 심사 대기와 장비 구매 제외 | **17-27** | 통합 빌드 기반 |

## 7. 단계와 의존성

첫 단계는 Windows/Linux clean export 한 경로를 끝까지 완성한다. 두 번째 단계에서 모바일과 서명·심볼을 추가한다. 세 번째 단계에서 용량 profile과 캐시를 적용하고 17의 실기기 검증을 릴리즈 gate로 묶는다.

28의 전용 서버 템플릿은 renderer·오디오 제거 여부를 별도 확인한다. 서버 authority에 필요한 animation·collision 데이터까지 제거하지 않는다. 23의 패키지 lock 미확정 빌드는 production으로 승격할 수 없다.

## 8. 완료 기준과 실험

모든 수치는 설계 목표다. 동일 소스·장치·SDK·engine commit을 기록하여 비교한다.

| 검증 | 방법 | 통과 목표 |
|---|---|---|
| 재현성 | clean worker 2대에서 각 10회 빌드 | unsigned/content 수준의 지정 hash 일치 100% |
| 자동화 | 대표 프로젝트 5종, 지원 플랫폼별 20회 | 재시도 없는 성공률 98% 이상; 제품 결함 재시도 은폐 금지 |
| 경량화 | 표준 템플릿과 최소 템플릿 A/B | 후보 2개 이상에서 전송 크기 15% 이상 감소, 기능 누락 0 |
| 런타임 회귀 | 60초 부팅·핵심 플레이, 3회 반복 | crash 0; p95 frame time 기존 대비 5% 초과 악화 금지 |
| 캐시 오염 | SDK/ABI/import 변경 및 손상 파일 주입 | 잘못된 재사용 0, clean rebuild 자동 선택 |
| 운영 복구 | 중단·worker 소멸·업로드 실패 주입 | 중복 게시 0, 이전 artifact 복구 경로 재현 |

98%는 고정 시험 집합의 기술 gate이며 실서비스 SLA가 아니다. headless 성공은 GPU 플레이 검증을 대신하지 않는다.

## 9. 위험과 중단 기준

엔진 버전 갱신마다 코어 패치와 템플릿 ABI를 함께 검증한다. 2주 안에 재현·원인 분리되지 않는 export 문제는 임시 재시도로 숨기지 않고 이전 고정 버전 유지 또는 해당 플랫폼 gate 보류로 처리한다.

모든 프로젝트를 각기 다른 템플릿으로 만드는 방식은 조합 폭증 위험이 있다. 기본 3개 capability profile 이내에서 시작하고 실제 용량 이득으로 추가 profile을 승인한다. 신규 네이티브 플러그인은 모바일 전체 SDK 조합을 재검증한다.

## 10. 제출 산출물

- BuildContract/ToolchainLock/ArtifactManifest 스키마와 worker 소스.
- 프로젝트별 preset 예시, feature profile, 크기 변화와 회귀 보고서.
- 실패 재현 자료, 심볼 보관 정책, 릴리즈·복구 runbook.

## 11. 확인 자료·출처

확인일: 2026-11-24. `stable` URL은 변할 수 있으므로 구현 착수 시 문서 버전도 고정한다.

- [Godot CLI](https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html)
- [Godot build size](https://docs.godotengine.org/en/stable/engine_details/development/compiling/optimizing_for_size.html)
- [GitHub Actions OIDC](https://docs.github.com/en/actions/concepts/security/openid-connect): 단기 자격증명을 사용하는 빌드 서비스 인증 참고.
