# 23. 애드온 패키지·Global Addons·CLI·서명 검증

| 항목 | 계획 |
|---|---|
| 계획 ID / 기준일 | PLAN-23 / 2026-11-24 |
| 원문 연결 | PDF 6-9쪽: Global Addons, 자동 updater, CLI upload, 공급망·버전 고정 |
| 우선순위 / 상태 | P0 / 개발 계획, resolver·CLI 미구현 |
| 구현 위치 | package registry·공용 resolver·Godot EditorPlugin·빌드 서비스 |
| 담당 | 플랫폼 엔지니어, editor addon, 보안·QA |
| 예상 공수 | 16-26 PW, 1 PW = 숙련 담당자 5근무일 |
| 선행 / 연계 | 계정/권한; 16 CI, 22 스토어, 24 인증, 10 C# binding |

## 1. 목표와 범위

사용한 addon의 버전·출처·hash·플랫폼 요구가 프로젝트와 함께 재현되게 한다. Native 확장은 검증된 플랫폼별 binary만 출하하고, GDScript addon도 사용하는 API·renderer·권한에 따라 검증한다.

Global Addons는 에디터 도구의 공통 설치와 캐시를 의미한다. 게임 runtime 의존성은 항상 프로젝트 lock에 명시한다. 한 프로젝트의 업데이트가 다른 게임을 조용히 변경하지 않도록 분리한다.

## 2. 공식 기반과 제안의 경계

Godot EditorPlugin은 `addons/` 아래 plugin.cfg와 tool script로 구성할 수 있다. 이 경로를 활용하여 프로젝트 설치를 먼저 제공한다. [공식 plugin 문서](https://docs.godotengine.org/en/stable/tutorials/plugins/editor/making_plugins.html)

공식 Store roadmap의 CLI·Global Addons·updater는 계획 항목이다. 아래 자체 package manager는 그 기능이 이미 제공된다고 가정하지 않으며, 향후 공식 API가 생기면 adapter로 연결한다. [Store roadmap](https://store.godotengine.org/roadmap/)

서명은 파일 출처·무결성을 확인하는 수단이다. 정상 서명이 악성 동작 부재나 모바일·웹 호환성을 보증하지 않는다. 선언된 권한은 별도 실행 격리 없이 강제되는 sandbox가 아니다.

## 3. 패키지 모델

| 유형 | 설치 범위 | 배포 검증 |
|---|---|---|
| Editor tool | 사용자/조직 공통 cache, workspace 선택 활성화 | editor version·tool 실행 권한 |
| Runtime GDScript | 프로젝트 lock, 프로젝트별 import | API·renderer·플랫폼 capability |
| Native GDExtension | 프로젝트 lock, target별 artifact | ABI·arch·debug/release·license |
| Managed addon | 선택 .NET profile | runtime version·AOT·Web 지원표 |
| Content pack | 원본 hash·import preset·license | target texture/audio 변환 결과 |

공용 캐시는 immutable content hash로 저장하고 읽기 전용으로 제공한다. 프로젝트의 설정 변경은 overlay/config로 분리한다. 임의 패키지의 설치 후 script가 빌드 host 전체 권한으로 자동 실행되지 않게 한다.

## 4. 제안 manifest·lock

```yaml
# 새로운 패키지 규격 제안, Godot 자체 manifest가 아님
package:
  id: publisher.package
  version: 1.2.3
  kind: runtime_gdscript
  engine_range: verified-version-range
  entry: addons/package/plugin.cfg
  license: license-reference
  dependencies: {publisher.base: "^1.0"}
  capabilities: [rendering_3d]
  targets: [windows, linux, android, ios]
  content_sha256: resolved-digest
  publisher_key_id: registered-key
```

lock에는 range가 아닌 정확한 version·digest·dependency graph·engine commit·target artifact를 기록한다. Signature envelope는 manifest hash와 package hash, publisher identity, signed_at, key_id를 묶는다. key 회전·폐기와 재검증 정책도 버전 관리한다.

Dependency resolver는 순환, 충돌, 같은 전역 class 이름, addon path 겹침, incompatible ABI를 설치 전에 보고한다. 무조건 최신 버전을 자동 선택하지 않는다.

## 5. 제안 CLI·편집기 흐름

```text
forge-pkg inspect <package>
forge-pkg resolve --project <path> --target <profile>
forge-pkg install --locked
forge-pkg update <package> --preview
forge-pkg publish --manifest <file> --artifact <file>
forge-pkg verify --locked
```

위 명령은 개발할 CLI의 인터페이스 초안이며 현재 사용 가능한 명령으로 안내하지 않는다. Update preview에는 직접·간접 의존성, 삭제·추가 파일, binary 크기, 재빌드 target, 호환성이 바뀌는 게임을 보여준다.

설치는 staging 디렉터리에서 unpack·path traversal 방지·hash 검증·compatibility 확인 후 atomic 교체한다. Editor tool이 열린 파일을 잡고 있으면 안전 재시작으로 전환한다. 실패 시 이전 lock과 설치 디렉터리를 함께 복구한다.

## 6. 발행·빌드 흐름

발행자는 version을 예약하고 immutable artifact를 올린다. 서버는 signature·license metadata·압축 경로·크기 상한·기본 검사와 24의 인증 결과를 붙인다. 심사중·발행·폐기 상태를 분리한다.

CI 발행은 최소 scope의 단기 credential과 프로젝트 제한을 사용한다. 같은 version에 다른 bytes를 덮어쓰지 않는다. 취약 버전은 신규 설치 차단·고지·수정 버전 제시로 처리하고 사용자 프로젝트를 자동으로 손상시키지 않는다.

Native addon은 Windows/Linux/Android/iOS/Web 각각 build artifact가 있어야 해당 지원을 표시한다. C++ 사용 자체를 전면 허용하는 것이 아니라 플랫폼 검증을 통과한 확장만 사용하도록 한다.

## 7. 작업 분해

| 작업 | 내용 | PW | 산출물 |
|---|---|---:|---|
| P23-1 | manifest·lock·target 규격 | 2-3 | schema와 호환성 규칙 |
| P23-2 | resolver·immutable cache·atomic install | 4-6 | 설치/충돌/복구 core |
| P23-3 | registry·서명·key lifecycle | 3-5 | 발행·검증·폐기 서비스 |
| P23-4 | CLI·EditorPlugin·update preview | 3-5 | 개발자 작업 흐름 |
| P23-5 | 다중 플랫폼·native 검사·CI 통합 | 3-5 | artifact matrix·빌드 gate |
| P23-6 | 전환·문서·운영 인수 | 1-2 | 기존 addon migration 도구 |
| 합계 | 모든 외부 addon 포팅 비용 제외 | **16-26** | 패키지 관리 기반 |

## 8. 단계와 의존성

첫 단계는 내부 검증 addon 5개, 프로젝트 3개로 exact lock·install·rebuild를 완성한다. 다음 단계는 registry/CLI·발행 권한, 마지막은 workspace Global Addons와 update preview다.

C# addon은 .NET runtime을 설치하지 않은 표준 게임 profile에서 자동 활성화하지 않는다. Global tool이 runtime 코드를 포함하면 export dependency 검사에서 명시적으로 드러나야 한다. 16의 build profile 축소는 이 capability 계약을 입력으로 삼는다.

## 9. 완료 기준

| 검증 | 시험 | 계획 목표 |
|---|---|---|
| 재현성 | 3개 프로젝트, clean machine 2대 | 동일 lock에서 dependency digest 100% 일치 |
| 설치 복구 | 다운로드·unpack·교체 각 단계 중단 | 기존 프로젝트 부팅 가능, 반설치 0 |
| 무결성 | artifact 1바이트 변조·서명 불일치 | 모든 변조 차단 |
| 의존성 | 순환·version 충돌·class/path 충돌 20종 | 해결안 또는 명확한 실패, 조용한 덮어쓰기 0 |
| 격리 | Global addon 업데이트 뒤 프로젝트 재빌드 | 잠긴 runtime dependency 변경 0 |
| target | native binary 없는 플랫폼 export | export 전 차단과 누락 target 표시 |
| 공급망 | 폐기 key·금지 version·경로 탈출 패키지 | 신규 설치 차단·사유 기록 |

서명 검증 통과는 인증 배지 발급과 별개다. GDScript-only도 Web 미지원 API나 플랫폼 SDK 의존성이 있으면 해당 target 지원을 표시하지 않는다.

## 10. 위험·대체 경로

구형 프로젝트와 충돌하면 기존 `addons/`를 즉시 변환하지 않고 분석 보고서와 lock 생성부터 제공한다. Global scope 때문에 namespace 충돌이 빈발하면 공용 download cache만 유지하고 프로젝트별 설치를 기본으로 한다.

UGC creator의 임의 코드 실행은 에디터·빌드·서버 격리 설계가 필요하다. 이 패키지 관리기의 permission 필드만으로 안전이 확보되었다고 표현하지 않는다. 30과 별도 runtime 격리 정책을 연결한다.

## 11. 제출 산출물·출처

산출물: manifest/lock schema, resolver·CLI·EditorPlugin, registry·signature verifier, 호환성 검사기, migration guide, 실패·복구 시험 자료.

확인일: 2026-11-24.

- [Godot EditorPlugin 제작](https://docs.godotengine.org/en/stable/tutorials/plugins/editor/making_plugins.html)
- [Godot Store roadmap](https://store.godotengine.org/roadmap/)
- [GitHub Actions OIDC](https://docs.github.com/en/actions/concepts/security/openid-connect): 자동 발행의 단기 인증 참고.
