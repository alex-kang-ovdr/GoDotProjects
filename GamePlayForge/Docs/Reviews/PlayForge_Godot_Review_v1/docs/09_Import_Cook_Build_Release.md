# 09 · Import·증분 Cook·빌드·배포

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 책임 경계

Godot Import/Export를 재사용하지만, 브라우저 런타임에 데스크톱 Importer 전체를 넣는 것을 요구하지 않는다. 웹에서는 썸네일·가벼운 preview·옵션 편집을 하고 신뢰 가능한 최종 처리는 격리된 클라우드 Build Worker가 담당한다.

Godot는 원본에 대한 Import 설정과 파생 데이터를 관리하며 `.godot/imported`에 결과를 둔다. 원본·설정·엔진 버전은 재현 입력이고 캐시는 삭제 후 재생성 가능한 결과다. [G28](../references/Verified_Sources.md#g28)

```text
원본 업로드 / 공유 패키지 고정
→ 형식·권한·해시 검증
→ Canonical 입력·Import 설정
→ 격리된 Godot Import Worker
→ Preview/Target 파생 결과
→ Export Template + 게임 데이터
→ Release Source Bundle + 실행 패키지
```

## 증분 처리

TaskKey는 source hash, 적용 설정 hash, 실제 입력 목록, 엔진/플러그인/Importer 버전, target, renderer, precision으로 만든다. 작업에 영향 없는 입력을 넣어 무조건 cache miss를 만들지 않는다.

| 변경 | 최소 재처리 제안 |
|---|---|
| Actor Transform | Scene/Cell 생성 데이터 |
| Lua 함수 | 스크립트 검증·번들·허용된 재시작 |
| Texture 원본 | 해당 Import와 타겟 Texture |
| Material scalar | 파라미터·Scene/Material 데이터 |
| Shading model | 생성 Shader·관련 pipeline 준비 |
| Collider source | 해당 물리 Cook와 Cell 메타데이터 |
| 엔진/Plugin ABI | 관련 실행 모듈·파생 캐시·회귀 시험 |

이 표는 목표다. Godot Importer가 공개하는 세분성보다 더 미세한 invalidation을 약속하지 않는다. 같은 Input에서 clean build와 incremental build의 의미적 일치를 비교한다. 버전·환경 차이로 바뀐 파생 결과를 낡은 캐시에 붙이지 않는다.

## 파일 포함·경로 규칙

PlayForge Source를 generated Godot project로 투영한다. `.lua`, 자체 JSON/loc 데이터 등 비표준 리소스는 export 결과의 포함 목록을 검증한다. Runtime에서 실제 파일이 없는데 에디터 로컬 파일 덕분에 성공하는 상황을 테스트로 잡는다.

생성 파일의 경로보다 GUID 매핑을 우선한다. `.import` 설정과 리소스 UID가 재생성될 때 기존 Source identity를 바꾸지 않는다. 생성 산출물을 Creator의 소스 원본처럼 양방향 편집하지 않는다.

## 타겟 빌드

| 타겟 | 기본 검증 |
|---|---|
| Windows Client/Listen | DX12, 대체 Vulkan을 별도 결과로 기록 |
| Android Client | ARM64/Vulkan, 터치·발열·메모리 |
| iOS Client | macOS/Xcode 빌드와 서명, 네이티브 실행 |
| Windows/Linux Dedicated | headless·불필요한 시각 데이터 제거 |
| Web PIE | WASM·Compatibility·Lua·보안 헤더 |

iOS export는 macOS와 Xcode가 필요한 공식 경로다. 제작자가 로컬 SDK를 설치하지 않아도 된다는 제품 요구는 서버 빌드 호스트의 SDK 요구까지 없앤다는 뜻이 아니다. [G45](../references/Verified_Sources.md#g45)

## Export Template과 공통 런타임

최초 설치·시작에 필요한 파일을 준비한 뒤 게임 실행을 시작한다. 공용 런타임을 캐시하는 경우에도 게임 릴리스가 요구하는 정확한 템플릿 버전을 확인한다. 캐시가 사라지거나 부족하면 PlayReady 전에 복구·오류를 처리한다.

Free 50 MB/Pro 100 MB 배포 한도에서 실제 템플릿 포함 크기를 측정한다. 압축 전 설치량·전송량·과금 집계량을 구분하며, 공통 엔진 용량 제외를 무단으로 정책화하지 않는다.

## Release 보관

배포 소스 Snapshot, 원본 에셋, 외부 패키지 고정 버전, Import 설정, Godot 생성 프로젝트, 엔진/템플릿/SDK lock, 테스트·라이선스 보고서, 플랫폼 실행 패키지를 연결한다. 비밀키·서명 인증서·SDK 재배포 금지 파일은 Source Bundle에 복사하지 않는다.

GitHub 미연결이면 Snapshot ID와 Release ID로 식별한다. 연동을 선택한 배포만 commit/tag를 연결한다. 공개 Release는 불변이고 rollback은 이전 검증된 Release로 전환하며 Save Schema의 읽기 호환성을 별도 검사한다.

## 패키징 정확성

단순히 전체 PCK를 비교하는 것만으로 증분 효율을 판단하지 않는다. Import 재실행 수, cache miss 이유, 파일 포함·제외, 시작 전 준비 시간, Native relink 횟수를 기록한다. Godot가 파생 리소스 의존성을 해석할 수 있으므로 '모든 내부 그래프가 완전히 사라진다'고 주장하지 않는다. [G28](../references/Verified_Sources.md#g28)
