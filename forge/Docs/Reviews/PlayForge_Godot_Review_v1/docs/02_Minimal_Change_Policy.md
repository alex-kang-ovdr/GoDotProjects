# 02 · Godot 변경 최소화 정책과 확장 경계

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 네 가지 변경 등급

| 등급 | 의미 | 기본 정책 |
|---|---|---|
| E0 | 공식 빌드·설정·리소스·프로젝트 코드·외부 웹 서비스 사용 | 허용 |
| E1 | 공개 API를 쓰는 승인된 C++ GDExtension | 기본 확장 경로 |
| E2 | 외부 디렉터리 정적 모듈·커스텀 Export Template | 별도 승인. 원본 무패치라도 빌드 책임 증가 |
| E3 | Godot core/servers/renderers 등의 내부 수정 | 기본 금지. 채택 중단 또는 예외 ADR |

**무패치와 무빌드는 다르다.** E2는 원본 엔진 파일을 덜 건드릴 수 있어도 엔진/플랫폼 템플릿을 직접 만들고 시험해야 한다. GDExtension은 공개 C ABI와 생성 API로 연결되며, 정적 모듈은 더 깊게 통합할 수 있는 대신 빌드 범위가 커진다. [G04](../references/Verified_Sources.md#g04)[G05](../references/Verified_Sources.md#g05)[G46](../references/Verified_Sources.md#g46)

## E1의 허용 범위

Godot 객체·Resource·Server 공개 API 호출, 새 Node/Resource/ScriptLanguageExtension 등록, 허용된 물리 서버 구현, 외부 SDK 호출, 자체 배열·태그·네트워크 상태 계산은 후보가 된다. 실제 사용 API가 목표 버전에 노출되는지 `extension_api.json`과 빌드로 확인한다.

반면 내부 헤더를 직접 포함하거나, 동적 링크되지 않는 내부 함수를 강제로 연결하거나, 메모리 오프셋을 추정해 쓰는 방식은 E1이 아니다. 공개 API에서 빠진 기능을 호출하려고 디버그 기호·비공개 포인터에 의존하면 E3로 분류한다.

## E3가 필요해지기 쉬운 요구

- Godot의 전역 렌더 패스·Draw Queue·Shader Compiler를 PlayForge 정책으로 완전히 대체.
- 여러 엔진 인스턴스를 한 프로세스에서 완전 분리하여 동시에 운용.
- 모든 엔진 작업·할당·Scene 객체를 PlayForge 전용 ECS/Job/Allocator로 강제 전환.
- 지원하지 않는 브라우저 그래픽 API를 엔진 백엔드로 새로 추가.
- 엔진 내부 Import/Cook 처리 전체를 특정 스케줄러로 대체.

일부 결과는 공개 저수준 API로 별도 구현 가능하다. 그러나 **공개 API로 화면 효과를 하나 추가하는 것과, 기본 엔진 파이프라인을 완전히 치환하는 것은 다른 범위**다. [G08](../references/Verified_Sources.md#g08)[G09](../references/Verified_Sources.md#g09)[G20](../references/Verified_Sources.md#g20)[G22](../references/Verified_Sources.md#g22)

## Native 확장 공급망

일반 크리에이터는 GDScript·Scene·에셋을 제출한다. 임의 DLL/so/dylib/WASM Extension을 사용자 업로드로 자동 링크하거나 실행하지 않는다. Native 확장은 플랫폼이 검토·서명·버전 고정한 집합만 사용한다.

Godot 내부 ABI를 안정된 상용 플러그인 ABI로 간주하지 않는다. `engine version + precision + extension API + toolchain + target + plugin lock`을 호환성 키로 관리한다. 공식 문서의 하위 목표 버전 호환 정책도 실제 회귀 검증을 대체하지 않는다. [G05](../references/Verified_Sources.md#g05)

## 빌드 정책

Godot는 제공된 엔진 빌드 경로를 유지하고, PlayForge 모듈은 적절한 연동 빌드로 구성한다. 전체 Godot를 CMake 프로젝트로 재작성하는 일을 도입 조건에 넣지 않는다. 엔진 바이너리 재빌드와 프로젝트 GDScript·에셋 반복 빌드를 분리한다.

다음 두 프로필을 먼저 비교한다.

| 프로필 | 목적 | 제한 |
|---|---|---|
| Official + E1 | 네이티브와 웹 확장으로 빠른 검증 | 웹 확장용 템플릿·격리 헤더 검사 |

어느 쪽도 실행 검증 전 운영 기본값으로 확정하지 않는다.

## 예외 승인 양식

`missing_api`, `required_behavior`, `public_api_attempt`, `affected_targets`, `upstream_diff`, `security_impact`, `upgrade_test`, `rollback`, `owner`, `expiry`를 기록한다. 단순 LOC 수보다 내부 서브시스템 변경 범위를 평가한다.

AI Agent는 예외 승인·정책·평가 기준을 바꿀 수 없다. Agent는 구현 후보와 실패 근거를 생성하고 사람이 승인한다. Godot 업스트림에 기여할 때는 제품 내부 MIT 이용 조건과 별개로 현재 기여 규칙을 따른다. [G47](../references/Verified_Sources.md#g47)
