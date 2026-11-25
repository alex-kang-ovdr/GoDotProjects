# Forge와 유사한 Godot 확장 시도 사례 조사

조사 기준일: **2026년 11월 25일, 한국 시간**  
대상: Godot를 기반으로 제작 환경, AI, 협업, 고급 엔진 기능, UGC 유통, 멀티플레이와 전용 서버를 확장한 프로젝트와 서비스  
문서 성격: 공개 1차 자료를 바탕으로 한 사례 조사와 Forge 적용 판단

## 1. 핵심 판단

**Forge와 비슷한 시도는 이미 여러 갈래로 존재한다.** 브라우저 AI 제작은 Shiny Gen과 vbgnt, 통합형 엔진 확장은 Blazium과 Redot, 공동 월드 제작의 역사적 사례는 The Mirror Classic이 대표적이다. WebGPU, 지형, 물리, 협업, 예측과 서버 운영을 따로 확장한 프로젝트도 있다. 각 사례의 공식 근거는 아래 개별 절에 연결했다.

다만 이번 조사에서 **브라우저 공동 제작 + AI 수정·실행 검증 + 네이티브 게임 배포 + 신뢰 가능한 Linux 전용 서버 + Iris에서 참고한 복제 구조 + UGC 운영**을 모두 갖추고 검증한 단일 사례는 확인하지 못했다. 이것은 공개 근거의 범위에 관한 판단이며, 해당 기능을 가진 제품이 없다는 단정은 아니다.

Forge에 가장 유용한 접근은 다음 세 가지다.

1. **제품 흐름은 Shiny Gen·vbgnt·Mirror에서 비교한다.** 편집, 실행, 변경 이력, 소스 반출, 게시 사이의 경계를 살핀다.
2. **엔진 변경은 목적별로 선별한다.** WebGPU는 패치 묶음, 지형은 GDExtension, 물리는 upstream 통합처럼 유지 방식이 다르다.
3. **온라인 기능은 계층별로 조합한다.** Nakama의 계정·매치메이킹, Edgegap의 서버 운영, netfox의 예측·보간과 Forge 자체 권한·복제 설계를 구분한다.

### 조사에서 가정한 Forge의 범위

Forge는 브라우저에서 프로젝트를 제작하고, 여러 제작자와 AI가 변경을 관리하며, Hub에서 UGC를 게시·실행하는 환경을 목표로 한다. 게임 산출물은 Windows·Android·iOS 네이티브 클라이언트와 Linux 전용 서버를 포함한다. GDScript를 기본으로 하며 C#은 선택 사항이다. 엔진 포크는 최소화하고, addon·GDExtension·관리 가능한 패치를 우선한다.

### 증거를 읽는 기준

| 표시 | 이 문서에서의 의미 |
|---|---|
| 공개 코드 | 저장소와 구현 자료가 존재함. 빌드·성능·운영 품질까지 검증했다는 뜻은 아님 |
| 릴리스·배포물 | 릴리스 파일 또는 외부 앱 배포 페이지가 확인됨 |
| 제공사 설명 | 공식 기능·구조 문서에서 설명하지만 이번 조사에서 직접 실행하지 않음 |
| 개발 중·제한 공개 | beta, 초대제, 로드맵, 특정 환경 검증 등 제한이 명시됨 |
| Forge 제안 | 사례를 바탕으로 작성한 설계·도입 판단. 사례 자체의 제공 기능과 구분 |

이번 조사는 공식 문서·저장소·릴리스·개발자 게시물을 확인한 것이다. 로그인 후 제작, 소스 빌드, 부하 시험, 서버 배포, 유료 계약 검증은 수행하지 않았다. 공개 사용량이나 사업 성과가 확인되지 않은 프로젝트를 상업적 성공 사례로 분류하지 않았다.

## 2. 먼저 볼 사례와 우선순위

| 사례 | 확장 방식 | Forge와 가까운 지점 | 현재 근거와 주요 경계 | 활용 판단 |
|---|---|---|---|---|
| **Shiny Gen** | 웹용 Godot fork + AI 제작 서비스 | 브라우저에서 생성·실행·오류 수정·공유 | 제품 문서와 모바일 제작 앱. 게임의 네이티브 export·프로젝트 다운로드는 미제공 | 제품 흐름 비교 우선 |
| **vbgnt** | 클라우드 Godot 작업 환경 + AI·빌드·게시 | 소스 ZIP, 여러 플랫폼 export, AI 검사, arcade | 초대제. 모바일 배포 페이지 존재. 네트워크는 문서상 플레이어 host 방식 | 반출·빌드 UX 비교 우선 |
| **Blazium** | Godot 엔진 fork + 도구·게시 생태계 | 언어·MCP·에디터·배포 기능을 함께 확장 | 공개 MIT 엔진과 실제 릴리스. 모든 플랫폼 기능의 운영 규모는 미검증 | 엔진·도구 설계 분석 우선 |
| **The Mirror Classic** | Godot 기반 공동 월드 제작 플랫폼 | 편집·멀티플레이·스크립팅·UGC 통합 | Classic 코드 공개. 이후 TypeScript 엔진으로 전환 | 통합 구조와 전환 비용 연구 |
| **Fusionery** | 구조화된 제작 데이터 + Godot runtime·빌드·게시 | revision 중심 제작·검증·세션·마켓 설계 | 공식 지원 페이지는 beta 종료와 sign-in 중단 명시 | 구조 참고, 현행 도입 보류 |
| **Redot** | Godot 엔진 fork | 언어 기능·지형·MCP를 엔진에 통합 | 26.3 stable 릴리스. 개발 브랜치 문서와 출시 기능 구분 필요 | 필요한 변경만 선별 |
| **dwalter/godotwebgpu** | 렌더링 backend fork | 브라우저 GPU 기능 확장 | MIT 코드, beta, Forward Mobile. 기기별 검증 제한 | WebGPU 기술 PoC 우선 |
| **Studio Foundation** | upstream Godot + WebGPU 패치 + AI 제작 도구 | 고급 웹 렌더링과 재현 가능한 제작 pipeline | 공개 코드·템플릿. Forward+ 검증 범위와 이용 조건 제한 | 기술 연구와 권리 검토 분리 |
| **Terrain3D / Godot Jolt** | GDExtension 또는 upstream 편입 | 지형·물리 고도화 | 실제 코드·릴리스. Web·모바일·결정성은 별도 조건 | 포크 최소화의 핵심 참고 |
| **netfox / Nakama / Edgegap** | 런타임 addon + 서비스 + 서버 운영 | 예측, 세션, 전용 서버의 조합 | 공개 코드·연동 문서. Iris 전체 대체품으로 검증되지 않음 | 계층별 재사용 PoC |

위 표의 판단 근거와 라이선스 범위는 다음 절에 명시한다. 표의 제품 범위를 넘는 기능은 추정하지 않았다.

## 3. Forge와 가까운 제작 플랫폼

### 3.1 Shiny Gen — 브라우저 Godot와 AI 실행 검증

**공식 설명:** Godot를 WebGPU 기반 웹 환경으로 확장하고, AI가 GDScript 작성, 게임 실행, 화면 확인, 입력 조작, 오류 수정을 반복한다. 에셋 생성과 서비스 내 공유·플레이도 묶여 있다. 2026-11-17 갱신된 Godot AI 안내가 가장 구체적인 제품 범위 자료다.

**중요한 경계:** iPhone·iPad·Android의 Shiny Gen 앱은 제작 서비스에 접근하는 앱이다. 사용자가 만든 게임을 Windows·macOS·Steam·앱스토어용 네이티브 빌드로 내보내는 기능과는 다르다. 안내는 프로젝트 다운로드와 stock Godot editor에서 열기를 아직 제공하지 않는다고 명시한다. GDScript 확인·복사와 웹 ZIP 반출은 별도 범위다. 멀티플레이는 Shiny Gen 서비스 안에서 제공되며 웹 export 결과는 solo 플레이로 제한된다.

외부 AI 연결에는 hosted MCP와 권한 scope를 둔다. Agent session이 작업하는 동안 사람의 편집을 읽기 전용으로 두는 방식은 AI와 사용자 사이의 동시 변경을 제한하는 설계다. 이것만으로 사람 여러 명의 실시간 공동 편집을 구현했다고 볼 수 없다.

**Forge에 적용할 판단:** 생성 후 실행·화면 검사까지 이어지는 흐름은 직접적인 비교 대상이다. Forge는 프로젝트 반출, 네이티브 산출물, 사람·AI의 동시 변경 규칙을 제품 계약으로 명시해야 한다. 공개 WebGPU fork의 MIT를 서비스 전체의 소스 공개 또는 self-host 권한으로 확대해서는 안 된다.

근거: [Godot AI 제품 범위](https://shinygen.ai/godot-ai), [MCP 세션·권한](https://shinygen.ai/docs/mcp), [공개 WebGPU fork](https://github.com/dwalter/godotwebgpu).

### 3.2 vbgnt — 클라우드 제작, 소스 반출, 네이티브 export

**공식 설명:** 웹에서 채팅과 프로젝트 파일을 조작하고, 클라우드에서 Godot 작업·테스트·빌드·arcade 게시를 수행한다. MCP 문서에는 게임 생성·변경, 파일 읽기, 전체 프로젝트 ZIP 다운로드, export 요청과 상태 조회가 나온다. 현재는 **초대제**다. 브라우저 UI로 클라우드 Godot를 조작한다는 설명을 Godot editor 자체가 브라우저 WASM에서 실행된다는 뜻으로 바꾸지 않았다.

Export 문서는 Windows·macOS·Linux·Android와 iOS 산출물을 구분한다. **iOS 결과는 서명된 IPA가 아니라 Xcode project ZIP**이다. iOS의 archive·서명과 스토어 제출 절차는 별도로 남는다. 제공사가 제작 사례로 연결한 Potion Pile의 App Store·Google Play 페이지도 실제로 확인했다. 다만 그 사실만으로 모든 게임의 자동 생성·빌드 성공률을 입증할 수는 없다.

공식 multiplayer 글은 room code와 WebRTC, 플레이어 host의 판정 권한을 설명한다. 해당 초기 버전은 matchmaking·accounts가 없으며 host가 떠나면 종료된다고 적는다. 전용 게임 서버가 필요한 Forge의 경쟁형 게임 구조와는 운영 조건이 다르다. History 문서의 turn별 diff·파일 복원도 실시간 공동 편집의 증거는 아니다.

**Forge에 적용할 판단:** 소스 ZIP, 플랫폼별 빌드 상태, 변경 diff, 웹 실행과 GPU 원격 실행의 구분을 참고할 가치가 크다. 제품·API 비교 대상으로 보고, 공개하지 않은 SaaS 구현을 재사용할 수 있다고 가정하지 않는다.

근거: [홈페이지](https://vbgnt.com/), [MCP](https://vbgnt.com/mcp/), [플랫폼별 export](https://vbgnt.com/blog/export-your-game-for-desktop-and-mobile/), [멀티플레이 구조](https://vbgnt.com/blog/play-with-friends-online-multiplayer/), [history와 diff](https://vbgnt.com/blog/version-history-with-lore/), [공식 모바일 제작기](https://vbgnt.com/blog/the-first-vbgnt-games-on-ios-and-android/), [Potion Pile / Apple](https://apps.apple.com/us/app/potion-pile/id6813139786), [Potion Pile / Google](https://play.google.com/store/apps/details?id=com.instantcitysolutions.potionpile).

명칭 주의: vbgnt는 자체 초기 3D 에셋 pipeline에도 “vbgnt Forge”라는 이름을 쓴다. 이 문서의 사용자 Forge와 동일 제품 또는 관계를 뜻하지 않는다. [공식 소개](https://vbgnt.com/blog/vbgnt-forge-3d-models-rigging-animation/).

### 3.3 The Mirror Classic — 가까운 통합형 선행 사례와 엔진 전환

Classic은 Godot를 기반으로 월드 안에서 편집하고 함께 플레이하며, 에셋·재질·스크립트를 다루는 제작 플랫폼을 시도했다. 공개 저장소는 Godot 애플리케이션과 웹 backend를 함께 보여 준다. Forge의 편집기·게임 runtime·콘텐츠 서비스 간 경계를 연구하기에 좋은 역사적 사례다.

다만 **현재 전략을 계속 Godot로 확장 중인 사례로 소개하면 부정확하다.** 공식 README는 2024년 11월 전환 결정을 기록하고 2025년 7월 TypeScript 엔진 업데이트를 안내한다. Godot fork는 2025-03-29 archived 상태다. 팀의 전환 회고는 요구 구조와 도구·생태계의 적합성을 설명한다. 이를 모든 Godot 프로젝트의 확장 불가능성으로 일반화할 수는 없다.

공개 fork의 `TMUserGDScript`는 동적 사용자 스크립트와 여러 컴포넌트를 지원하지만, 자체 설명에서 sandbox를 제공하지 않는다고 밝힌다. 사용자 콘텐츠를 실행할 수 있다는 것과 격리할 수 있다는 것은 별도 구현 과제다.

**Forge에 적용할 판단:** 오래 유지할 데이터 모델, 에셋 식별자, 편집 명령, 스크립트 API, client/server 계약을 엔진 내부 구조와 과도하게 결합하지 않는다. 전환 시 정적 에셋보다 게임 로직과 제작 도구의 재작성 비용이 커질 수 있다는 점을 초기 구조 검토에 넣는다. Classic 코드와 V2의 공개 계획도 분리한다.

근거: [Mirror Classic 저장소](https://github.com/mirror-engine/the-mirror), [Godot fork·TMUserGDScript](https://github.com/mirror-engine/godot), [공식 기술 회고](https://mirrorengine.io/blog/leaving-godot-thank-you-technical-reflections), [차세대 엔진 방향](https://mirrorengine.io/blog/next-gen-game-engine-ai-text-to-3d-multiplayer-entity-component-system-whats-next).

### 3.4 Fusionery — versioned blueprint에서 게임 세션까지

공식 설명은 구조화된 blueprint를 버전 관리하고, Godot 프로젝트·runtime, headless 검증, build, authoritative session, FusionCastle 게시로 연결한다. 에이전트 작업에도 범위가 제한된 도구와 revision·undo를 설명한다. 전체 흐름의 설계는 Forge와 매우 가깝다.

**상태 판단은 보수적으로 해야 한다.** 지원 페이지는 beta가 닫혔고 sign-in을 중단했다고 명시한다. 다른 페이지의 가입·가격 안내와 상태 표현이 일치하지 않으므로 지금 이용 가능한 완성형 서비스로 추천하지 않는다. Crossplay 페이지도 mobile을 preview로 구분한다. 서버 규모·복제 품질·운영 실적은 이번 자료에서 독립적으로 검증하지 못했다.

**Forge에 적용할 판단:** 제작 revision을 검증·client build·server build·게시 기록과 연결하는 데이터 계약을 참고한다. 현행 서비스 의존이나 직접 코드 도입은 별도 검증 대상으로 남긴다.

근거: [구조와 작업 흐름](https://app.fusionery.com/how-it-works), [개발자 기능](https://app.fusionery.com/developers), [지원·현재 상태](https://app.fusionery.com/support), [플랫폼 범위](https://app.fusionery.com/crossplay).

## 4. 엔진 자체를 확장한 사례

### 4.1 Blazium — 엔진, 에디터 자동화, 게시 도구의 묶음

Godot fork를 바탕으로 언어 기능, 에디터 도구, 온라인 연동과 배포 경험을 확장한다. **2026-10-13 v0.6.927** 릴리스에는 traits·structs·abstract 관련 작업, JustAMCP, undo 가능한 scene 변경, 에셋 검색·태그, headless navmesh export 등이 기록되어 있다. 단순한 향후 로드맵보다 실제 릴리스와 연결된 근거가 강하다.

구성 요소를 구분해서 볼 필요가 있다. **Blazium Hub**는 엔진 버전·프로젝트 등을 관리하는 desktop 도구이고, **Blazium Games**는 게임·앱·mod·asset 게시 플랫폼이다. 별도 CLI와 업로드 도구도 존재한다. “Hub가 있다”는 이유로 사용자 Forge Hub와 동일한 기능 집합으로 보지 않는다. 협업 기능의 표명도 대규모 브라우저 공동 제작의 검증과 구분한다.

**Forge에 적용할 판단:** MCP를 editor undo·scene 검증·에셋 색인·headless 작업에 연결한 방식, upstream 변경을 관리하는 방식, 제작 도구와 유통 도구의 API 경계를 우선 읽는다. 엔진 전체를 교체하기보다 필요한 변경의 의존성을 먼저 분해한다. 엔진 저장소는 MIT지만 배포 플랫폼의 계약과 운영 권리는 별도다.

근거: [v0.6.927 릴리스 설명](https://blazium.app/news/blazium-engine-v06927-the-final-43-release/), [엔진·관련 도구 저장소 안내](https://github.com/blazium-games/blazium), [게시 플랫폼 문서](https://docs.blazium.games/).

### 4.2 Redot — 언어·지형·AI 제어를 core에 통합

**26.3 stable, 2026-10-15** 릴리스에는 structs·traits·nullable 관련 기능, WorldScape3D, 양자화 관련 개선과 MCP 수정이 기록되어 있다. MCP 문서는 scene·resource·code·project·game 제어, headless 작업과 실행 관찰을 다룬다. 다만 `master` 문서의 모든 기능을 stable 산출물에 포함됐다고 보아서는 안 된다.

WorldScape3D는 Terrain3D를 엔진에 내장한 port라는 점이 핵심이다. 이것은 지형 기능의 독립 신규 발명보다, 외부 확장을 엔진 배포·에디터 경험에 통합한 사례다.

**Forge에 적용할 판단:** 언어·core 수준에서 필요한 기능과 addon으로 유지 가능한 기능의 기준을 세운다. Redot 전체를 채택하면 얻는 통합 편의와 버전 추적 비용을, Terrain3D 같은 원래 확장의 독립 도입 비용과 비교한다.

근거: [릴리스 목록](https://github.com/Redot-Engine/redot-engine/releases), [26.3 발표](https://www.redotengine.org/blog/2026/10/15/redot-26-3-stable-release), [MCP 개발 문서](https://github.com/Redot-Engine/redot-engine/blob/master/doc/mcp-integration.md).

### 4.3 dwalter/godotwebgpu — 서비스 요구에서 나온 공개 렌더링 fork

Shiny Gen을 위해 개발한 Godot WebGPU 작업을 공개한 저장소다. Godot 4.6.2 계열의 **Forward Mobile** 경로와 compute 관련 기능을 설명하며, 공개 코드는 MIT다. 서버 backend가 아니라 GPU 렌더링 backend에 해당한다.

현재 beta로 표시되고, README의 시험 표는 macOS 브라우저 결과와 Android·iOS 작업 중, Windows·Linux 추가 검증 필요를 구분한다. 작성자의 특정 하드웨어 성능 수치를 Forge의 모든 브라우저 성능으로 일반화하지 않는다. 소스 공개도 Shiny Gen 전체 플랫폼 공개를 의미하지 않는다.

**Forge에 적용할 판단:** 기존 계획 19의 첫 코드 검토 후보로 삼는다. 장치 생성, shader 변환, compute, texture format, 메모리와 error handling이 native renderer와 어떻게 이어지는지 확인한다. 먼저 고정 revision에서 작은 재현 장면을 확보하고 Forge의 목표 OS·GPU·브라우저를 직접 시험해야 한다.

근거: [공개 저장소와 시험 표](https://github.com/dwalter/godotwebgpu), [프로젝트 beta 안내](https://godotwebgpu.com/).

### 4.4 Studio Foundation — 패치 묶음, Forward+, AI 제작 pipeline

Godot upstream에 WebGPU 패치를 적용하고, AI 도구·에셋 제작·검증을 연결하는 시도다. 공개 설명은 Godot 4.7.1에 33개 패치를 적용한 계열과 `godot-4.7.1-webgpu-p0033` 템플릿을 제시한다. typed operation과 검증을 갖춘 headless Blender 도구, MCP, glTF 등도 포함한다.

**증거 수준에 차이가 있다.** p0033 Forward+는 작성자가 특정 P40 GPU·Chrome·OS에서 검증했다고 설명한다. 공개 live demo는 이전 p0014 Forward Mobile 경로다. 이를 모든 브라우저에서 입증된 Forward+ 지원으로 표현하지 않는다.

라이선스도 별도 판단이 필요하다. 현행 `LICENSE`는 **PolyForm Perimeter 1.0.1과 추가 조건**을 명시하며 경쟁 제품 관련 제한 등이 있다. 이전 공개 revision과 upstream 코드의 조건은 각각 다르다. 공개 저장소라는 이유로 Forge에 그대로 복사할 수 있는 MIT 패키지로 분류하지 않는다.

**Forge에 적용할 판단:** 공식 upstream pin과 패치 series를 유지하는 방식은 유용한 참고다. 기술 검증과 코드 도입 권리 확인을 별도 작업으로 분리한다. 웹 협업 SaaS 전체가 구현됐다는 근거로 사용하지 않는다.

근거: [저장소](https://github.com/lxsolutions/studio-foundation), [템플릿·검증 범위](https://lxsolutions.github.io/studio-foundation/), [현행 LICENSE](https://github.com/lxsolutions/studio-foundation/blob/main/LICENSE), [NOTICE](https://github.com/lxsolutions/studio-foundation/blob/main/NOTICE.md).

## 5. 포크 범위를 줄이는 기능별 확장

### 5.1 Terrain3D — 고급 지형을 GDExtension으로 제공

Terrain3D는 C++ GDExtension으로 지형 편집·LOD·식생·heightmap 등 기능을 제공하고 공식 Godot 빌드와 연결한다. MIT이며 **1.1.0 stable** 릴리스가 있다. 고급 기능을 항상 엔진 전체 fork로 만들 필요가 없음을 보여 준다.

단, 플랫폼 문서는 Web export를 매우 실험적인 상태로 분류하고 모바일에도 제약을 적는다. Desktop에서 동작하는 native GDExtension을 Forge 브라우저에 그대로 포함할 수 있다는 뜻은 아니다. 해당 WebGPU fork와 조합되는지도 별도 검증해야 한다.

**Forge 판단:** 계획 02의 우선 통합 후보. 지형 데이터·편집 operation·streaming 단위를 먼저 정의하고, desktop·mobile·web 빌드를 각각 검증한다. Redot의 내장 port를 선택하는 경우 원본 addon과의 차이도 추적한다.

근거: [구현·MIT](https://github.com/TokisanGames/Terrain3D), [1.1.0 릴리스](https://github.com/TokisanGames/Terrain3D/releases/tag/v1.1.0-stable), [지원 플랫폼과 제한](https://terrain3d.readthedocs.io/en/1.1/docs/platforms.html).

### 5.2 Godot Jolt — 외부 확장에서 공식 엔진으로 들어간 경로

Godot Jolt는 별도 확장에서 시작해 Godot 4.4에 엔진 module로 포함되었다. 공식 4.6 릴리스는 신규 3D 프로젝트의 기본 physics engine으로 설명한다. 외부 확장이 검증된 뒤 upstream으로 들어가는 유지 전략을 보여 주는 사례다.

하지만 extension 문서는 **Godot 통합 수준의 결정성을 보장하지 않는다**고 밝힌다. 더 안정적인 물리 backend를 선택하는 것과 네트워크 rollback을 위한 동일 결과·snapshot·수동 step을 확보하는 것은 서로 다른 작업이다.

**Forge 판단:** 계획 12는 upstream Jolt를 기준 후보로 두되, 계획 27에 필요한 재시뮬레이션 계약을 별도 검증한다. 이미 core에 들어간 기능을 독자 fork로 중복 유지하지 않는다.

근거: [Godot Jolt 저장소](https://github.com/godot-jolt/godot-jolt), [공식 Jolt 통합 문서](https://docs.godotengine.org/en/stable/tutorials/physics/using_jolt_physics.html), [Godot 4.6 발표](https://godotengine.org/releases/4.6/).

### 5.3 Godot Co-op·Team Create — 공동 편집 의미론의 참고 사례

**Godot Co-op**은 MIT addon으로 scene 동기화, script OT, 사용자별 undo, 파일·설정 동기화와 presence를 설명한다. Scene 쪽 host 순서·LWW와 script OT를 구분하고, host 종료·일부 scene override 같은 제약도 공개한다. Native editor와 companion 중심의 구성이므로 Forge 웹 에디터에 바로 붙는 모듈은 아니다.

**Godot Team Create**는 scene 공동 편집과 presence·chat, headless 협업 서버를 설명한다. Script 협업은 개발 중으로 표시한다. 여기서 headless 서버는 **편집 동기화 서버**이며 게임 판정을 수행하는 전용 서버와 구분한다.

**Forge 판단:** 계획 15는 단순 파일 덮어쓰기보다 scene operation, object ID, text operation, undo 범위, reconnect와 충돌 처리를 우선 명세한다. AI도 같은 변경 계약으로 참여하도록 한다. 프로젝트별 isolation과 branch·publish 경계는 Forge에서 추가 설계한다.

근거: [Godot Co-op](https://github.com/i-Roboticist/godot-coop), [Godot Team Create](https://github.com/N3rmis/Godot-Team-Create), [공식 Asset Library 등록](https://godotengine.org/asset-library/asset/5451).

### 5.4 Coding-Solo godot-mcp·GDAI MCP — 에이전트용 엔진 조작 표면

Coding-Solo의 MIT `godot-mcp`는 로컬 Godot 실행·디버그와 scene 작업을 외부 agent에 연결한다. GDAI MCP도 scene·node·script·오류·스크린샷과 editor 실행 도구를 제공한다. 이는 에이전트가 실제 엔진 상태를 읽고 변경한 뒤 검증하는 구현 참고 사례다.

MCP 연결 자체는 공동 편집, 프로젝트 격리, 권한 서버, build farm을 대신하지 않는다. 예를 들어 GDAI MCP 설치 안내의 HTTP 연결은 자체 인증이 없으므로, 그것을 그대로 다중 사용자 cloud endpoint로 간주할 수 없다.

**Forge 판단:** 도구 개수를 늘리기보다 명령마다 대상 revision, 권한, 예상 변경, 검증 결과, undo 가능 여부와 로그를 표준화한다. Browser UI와 agent가 동일한 편집 명령을 쓰게 하되, 실제 실행은 프로젝트에 제한된 worker에서 처리하는 구조를 검토한다.

근거: [Coding-Solo godot-mcp](https://github.com/Coding-Solo/godot-mcp), [GDAI 도구 목록](https://gdaimcp.com/docs/supported-tools), [설치·전송 방식](https://gdaimcp.com/docs/installation).

## 6. 멀티플레이·전용 서버·Iris 관점에서 참고할 사례

### 6.1 서로 다른 책임을 먼저 나눈다

아래 표는 **Forge를 위한 제안 구조**다. 모든 후보가 이 구조를 완성해 제공한다는 뜻은 아니다.

| 계층 | 책임 | 참고·재사용 후보 | Forge에서 확인하거나 구현할 부분 |
|---|---|---|---|
| 계정·파티·매치메이킹 | 사용자 식별, 세션 생성, 접속 자격 | Nakama, W4 관련 서비스 | 프로젝트·게임별 namespace, 참가 권한, 결과 소유권 |
| 서버 fleet | Linux DS 할당, 준비 상태, 주소 반환, 종료 | Edgegap, Nakama FleetManager 연동 | revision별 이미지 선택, 비용·quota, drain·종료 정책 |
| 게임 권한 | 규칙·스폰·승패·인벤토리·검증 | Godot DS + Unreal 방식의 책임 분리 | GameMode·GameState·PlayerState·Pawn 역할과 RPC 검증 |
| 복제 | object ID, schema, 상태 변경, 대상·빈도·예산 | Godot 기반 기능, netfox 일부 구성, Iris 개념 참고 | 대량 object 수명, delta, interest·priority, late join과 버전 호환 |
| 움직임·물리 | 입력 예측, 보간, 보정, 필요 시 재시뮬레이션 | netfox, 선택한 physics backend | authority, history·snapshot·step, 엔진별 제약 |
| 운영·검증 | 접속·버전·결과 검증, 재현·추적 | Edgegap 샘플, backend·telemetry 도구 | DS와 독립 client 2개 이상, 실패·재접속·지연 시나리오 |

Iris는 Unreal의 복제 시스템이다. Nakama 계정 서버, relay, DS 배포 또는 움직임 예측을 도입했다고 Iris에 해당하는 복제 계층까지 완성되는 것은 아니다. Forge의 계획 26은 개념을 참고한 독립 설계로 유지하고, 구체 API·자료구조를 그대로 호환한다고 약속하지 않는다. [Epic 공식 Iris 문서](https://dev.epicgames.com/documentation/en-us/unreal-engine/iris-replication-system-in-unreal-engine).

### 6.2 netfox — 예측·rollback·보간의 공개 구현

MIT addon으로 network time, prediction·reconciliation, rollback과 interpolation 관련 기능을 제공한다. 최근 릴리스에는 property serializer, schema·network ID·object lifetime 관련 개선도 있어 복제·예측 구현 검토에 실질적인 가치가 있다. 다만 FPS 예측의 일부 새 경로는 실험적이라고 표시한다.

RigidBody rollback은 조건이 더 까다롭다. 공식 physics 가이드는 수동 step을 지원하는 backend·fork와 driver를 설명한다. 모든 기능이 변경 없는 vanilla Godot의 addon 하나로 해결된다고 가정해서는 안 된다.

**Forge 판단:** 계획 27의 우선 비교·재현 후보이며 계획 26에도 참고할 부분이 있다. 그러나 “Godot용 Iris 완제품”으로 채택하지 않는다. 우선 캐릭터 입력 예측·보정과 object 수명 처리를 재현하고, 일반 rigid-body rollback은 별도 실험으로 분리한다. 자체 복제와 병행할 경우 tick·object ID·상태 소유자를 일치시키고, 같은 속성을 두 계층이 동시에 갱신하지 않도록 한다.

근거: [netfox 구현](https://github.com/foxssake/netfox), [릴리스](https://github.com/foxssake/netfox/releases), [물리 rollback 조건](https://foxssake.github.io/netfox/latest/netfox.extras/guides/physics/).

### 6.3 Nakama / Heroic Labs — 온라인 제어부와 외부 headless 서버 연결

공식 Godot GDScript SDK가 있으며 계정·소셜·메시징·매치메이킹 등의 API를 제공한다. SDK는 Apache-2.0이다. Session-based multiplayer 문서는 `FleetManager`를 통해 외부 headless 서버를 생성·조회·삭제하고 참가시키는 구조를 설명한다.

Nakama runtime에서 authoritative match logic을 작성하는 방식과 **Godot DS가 scene·물리·GDScript를 실행하는 방식**은 별개다. Forge가 같은 Godot 게임 로직과 물리를 서버에서 실행하려면 DS를 독립 실행 단위로 둔다. Enterprise·managed 기능을 공개 SDK의 조건과 섞지 않는다.

**Forge 판단:** 계획 29의 재사용 후보. 계정·파티·매치메이킹을 Nakama에 맡기고, 할당된 Linux Godot DS가 게임 규칙·복제·결과 검증을 수행하는 구조를 먼저 검증한다. 최종 결과 기록은 권한 있는 서버 경로로 제한한다.

근거: [공식 Godot SDK](https://github.com/heroiclabs/nakama-godot), [session·FleetManager](https://heroiclabs.com/docs/nakama/concepts/multiplayer/session-based/), [authoritative runtime](https://heroiclabs.com/docs/nakama/concepts/multiplayer/authoritative/).

### 6.4 Edgegap — Godot DS 배포와 AI agent 작업 흐름

공개 `llm-agent-skills`는 Godot 서버 build·배포·matchmaking·수명 관리와 Nakama FleetManager 연동을 설명한다. 저장소는 Apache-2.0을 표시한다. 문서에는 특정 Godot 샘플에서 두 client 연결, 동일 DS 할당, 결과 처리·종료까지 시험했다고 기록되어 있다.

이것은 **공급사가 공개한 샘플 검증 결과**다. 이번 조사에서 재현한 결과도, 모든 Forge UGC에 대한 지원 보장도 아니다. AI가 DS 운영 작업을 호출하도록 만들었다는 점은 Forge의 제작·검증 자동화와 직접 비교할 가치가 있다.

**Forge 판단:** 계획 28·29·30의 배포·접속 검증 PoC 후보. 접속 주소가 반환되는 것 외에 READY, client/server revision 일치, 종료·할당 실패·재시도, 서버 결과 서명 또는 자격 검증을 Forge의 운영 계약으로 정의한다.

근거: [공식 agent skills·샘플·시험 기록](https://github.com/edgegap/llm-agent-skills), [Heroic 공식 Edgegap 통합 가이드 — 서버 수명 API·Godot 샘플 안내](https://heroiclabs.com/docs/nakama/guides/concepts/edgegap-integration/).

### 6.5 W4 Games — Godot 전문 서비스·빌드·플랫폼 확장

W4는 공식 사이트에서 Godot 전문 지원, 플랫폼 이식·콘솔·모바일 등의 서비스를 제시한다. W4 Build 문서는 custom engine compile, game export, CI 연결과 산출물 보관을 설명한다. Cloud SDK에도 2026-08-10 변경 이력이 확인된다.

다만 공개 문서가 존재한다는 사실만으로 Cloud·Build managed 상품의 **현재 신규 계약 가능 범위**까지 확정할 수는 없다. 프로젝트 팀 접근 권한도 scene 공동 편집과 구분한다.

**Forge 판단:** 계획 16·21·24의 기술 협업·플랫폼 검증 후보. 특히 콘솔과 특수 플랫폼은 일반 공개 addon의 라이선스와 계약 범위가 다르므로 Forge 제작자에게 제공할 수 있는 export·배포 권리까지 확인해야 한다.

근거: [공식 서비스](https://www.w4games.com/), [W4 Build 문서](https://build.w4.gd/), [Cloud SDK 변경 이력](https://sdk.w4.gd/changelog/).

### 6.6 GD-Sync — 쉬운 동기화·AOI·lobby와 서비스 경계

GD-Sync는 Godot 사용 경험에 host/client 권한, 동기화, AOI와 lobby·relay를 통합하려는 사례다. 빠른 소규모 온라인 게임 제작 UX를 연구하기에 좋다. 다만 확인한 공개 자료는 플레이어 host 중심이며, 신뢰 가능한 Linux Godot DS를 대신 실행하는 호스팅이라고 확인하지 못했다.

서비스 약관은 재판매·credential 공유를 제한하고, 종료 시 backend 공개를 회사 재량으로 둔다. 따라서 Forge 요금제에 포함한 white-label 제공이나 self-host를 당연히 허용된 것으로 가정하지 않는다.

**Forge 판단:** 비경쟁·소규모 세션의 사용 경험 비교 대상으로 적합하다. 신뢰 경계가 필요한 DS 모드와 동일한 구현으로 취급하지 않으며, 직접 번들링 전에는 계약을 확인한다.

근거: [고급 동기화·권한·AOI 문서](https://www.gd-sync.com/docs/advanced), [서비스 약관](https://www.gd-sync.com/terms).

## 7. 추가 관찰할 UGC·협업 시도

| 사례 | 연구 가치 | 현 단계에서의 판단 | 공식 근거 |
|---|---|---|---|
| V-Sekai | Godot 기반 social VR, avatar·world와 backend 경계 | 실험적 프로젝트. 일부 저장소의 archive를 전체 활동 중단으로 일반화하지 않음 | [v-sekai-game](https://github.com/V-Sekai/v-sekai-game) |
| LumoraVR | Social VR와 공동 제작 UX | Steam 출시일 TBA. 현행 source-available v3 라이선스는 상업 이용에 별도 허가 요구 | [Steam](https://store.steampowered.com/app/4237370/LumoraVR/), [LICENSE](https://github.com/LackLuster-Labs/LumoraVR/blob/main/LICENSE.md) |
| BarkVR | Godot 기반 social VR prototype | 2026년 릴리스가 있지만 과거 network 비활성화 기록이 있어 완성된 협업 서비스로 평가하지 않음 | [릴리스](https://github.com/zodiepupper/barkvr/releases) |
| Godaas | 브라우저 Godot·공동 제작·배포의 제품 방향 | 사이트 기능 설명은 있으나 이번 조사에서 공개 구현·릴리스 근거를 충분히 확보하지 못함 | [공식 사이트](https://godaas.org/) |
| GodotTogether | Editor node·file 동기화 구현 | GPL-3.0 적용 범위를 확인할 연구 후보. MIT 후보와 동일하게 취급하지 않음 | [저장소](https://github.com/Wolfyxon/GodotTogether) |

이들은 주력 도입 후보와 동일한 검증 수준으로 묶지 않았다. 또한 Lua/Luau 기반 외부 시도를 Forge의 언어 선택으로 가져오지 않았다.

## 8. Forge에 가져올 것과 직접 설계할 것

### 8.1 비교·재사용 우선순위

| 우선순위 | 대상 | 권장 방식 | 먼저 확인할 결과물 |
|---|---|---|---|
| P0 | Shiny Gen·vbgnt | 제품·작업 흐름 비교 | 생성→수정→실행 검사→반출→게시의 상태·오류·복구 모델 |
| P0 | Blazium·Mirror Classic | 구조·선별 코드 연구 | 편집 명령, engine API 경계, runtime·backend 분리, 변경 유지 비용 |
| P0 | Godot Co-op·MCP 구현 | 편집·agent 명령 의미론 참고 | object ID, revision, undo, 충돌·reconnect 규칙 |
| P0 | Nakama + Godot DS + Edgegap | 교체 가능한 adapter로 PoC | match→allocate→READY→join→결과→종료가 한 revision으로 연결 |
| P0 | netfox | 예측·보정·object 수명 비교 실험 | 지연·손실 상황의 독립 client 상태와 server 결과 |
| P1 | dwalter WebGPU·Terrain3D | 고정 revision의 선택 통합 | Forge 목표 기기·브라우저별 렌더링·메모리·export 결과 |
| P1 | Godot Jolt | upstream 기준 채택 검토 | 안정성·step·snapshot·재시뮬레이션 요구 간의 차이 |
| P1 | Redot·Studio Foundation | 필요한 변경만 분석 | core가 필요한 이유, 라이선스·의존성과 패치 유지 비용 |
| P1 | W4 | 기술 협업·플랫폼 지원 검토 | 대상 플랫폼과 Forge 제작자에게 제공 가능한 범위 |
| 관찰 | Fusionery·social VR·Godaas | 상태·코드·릴리스 추적 | 재개·실제 기능·운영 근거가 확인될 때 재평가 |

P0·P1은 이 조사에서 제안한 검토 순서이며 완료된 도입 결정이 아니다.

### 8.2 Forge가 일관되게 가져야 할 계약

다음 항목은 외부 후보 하나를 설치한다고 자동으로 완성되지 않는다. Forge의 공통 모델로 먼저 정의하는 것이 좋다.

1. **프로젝트 revision:** scene·script·asset·import 설정·addon·엔진 패치·복제 schema의 정확한 버전을 묶는다.
2. **편집 transaction:** 사람과 AI의 변경 대상·기대 revision·권한·검증·undo와 충돌 처리 방식을 일치시킨다.
3. **실행 산출물:** web preview, native client, Linux DS가 어느 revision으로 만들어졌는지 기록한다.
4. **세션 계약:** 매치가 요구하는 build·schema와 접속 자격을 서버가 확인한다. 오래된 client를 조용히 연결하지 않는다.
5. **UGC 수명:** draft·검증·게시·폐기·rollback과 실행 중 세션의 관계를 정의한다.
6. **프로젝트 격리:** 파일·작업 실행·리소스 quota·서비스 자격을 프로젝트 단위로 제한한다. 사용자 코드 실행 기능과 격리 기능을 별도로 검증한다.
7. **이식 가능성:** 소스·에셋·메타데이터 반출 형식과 재빌드에 필요한 버전 정보를 명확히 한다.

### 8.3 기존 30개 개발계획과의 연결

| 기존 계획 | 이번 조사에서 연결할 사례 | 보강할 의사결정 |
|---|---|---|
| 02 지형 | Terrain3D, Redot WorldScape3D | GDExtension 유지와 core 내장 비교, Web·모바일 제약 |
| 12 물리 / 27 예측·네트워크 물리 | Godot Jolt, netfox | 안정성·결정성·수동 step·snapshot의 별도 검증 |
| 13 프로파일링 / 17 모바일 QA | vbgnt 실행 검사, WebGPU 시험 표 | cloud GPU 결과와 실제 client 기기 결과 분리 |
| 15 협업·VCS | Godot Co-op, Team Create, vbgnt history, MCP | scene·text 충돌 규칙, AI revision, undo·reconnect |
| 16 빌드·export·CI | vbgnt, W4 Build, Blazium 도구 | 플랫폼별 산출물·서명·오류 상태와 정확한 revision |
| 19 WebGPU | dwalter fork, Studio Foundation | Forward Mobile·Forward+ 경로와 실제 검증 matrix 구분 |
| 21 콘솔 / 24 협업·지속 운영 | W4, fork 유지 사례 | 계약 범위와 upstream 유지·지원 비용 |
| 22 스토어 / 23 addon·package | Blazium Games, Mirror, Fusionery | package 의존성·권리·검증·게시·폐기 계약 |
| 25 Unreal식 권한 | Godot DS + Nakama 연동 | 게임 규칙·플레이어 상태·RPC 책임을 서버 기준으로 정의 |
| 26 Iris식 복제 | Iris 개념, netfox 일부 구성 | identity·schema·delta·interest·priority·budget·late join |
| 28 전용 서버 / 29 온라인 서비스 | Edgegap, Nakama FleetManager, W4, GD-Sync 비교 | 신뢰 DS·플레이어 host·relay·서비스의 경계 |
| 30 서버 검증 | Edgegap 샘플과 Forge 공통 revision 모델 | 위조 결과, 버전 불일치, 독립 client 접속·재접속 시험 |

이 표는 기존 계획의 수정 제안이다. 이번 조사에서 기존 30개 계획 파일을 변경하지 않았다.

## 9. 조사 다음 단계로 권장하는 세 가지 검증

아래는 **실행하지 않은 제안**이다. 첫 조사·구현 검증 묶음을 약 2주로 timebox할 수 있으나, 범위와 담당자·기기 확보 후 일정은 다시 산정한다. 기능 개발 완료 일정이 아니다.

### A. 브라우저 렌더링과 네이티브 반출

- 후보: dwalter WebGPU, 필요한 Terrain3D 기능, stock native export.
- 최소 장면: 텍스처·애니메이션·compute 사용 여부가 명확한 샘플과 선택적 지형 장면.
- 확인: Windows·Android·iOS 목표 환경별 지원·실패 이유, shader 오류, peak memory, 프레임 시간과 source→build 재현성.
- 통과 기준: 확인된 기기·버전 matrix에서 정해진 장면이 오류 없이 실행되고, 미지원 기능이 명시적으로 드러난다. 성능 목표는 기준 장면 측정 후 결정한다.
- 결정: browser 전용 경로, native 공통 경로, 필요한 최소 core patch를 나눈다.

### B. 사람 2명과 AI의 공동 변경

- 후보: Godot Co-op의 충돌·undo 모델, MCP scene 명령, Forge 웹 편집 API.
- 시나리오: 같은 node 속성 동시 수정, script 수정, node 삭제와 AI 수정의 충돌, 연결 단절 후 재접속, 사용자별 undo.
- 통과 기준: 모든 참가자가 동일 revision으로 수렴하고, 삭제된 object에 오래된 작업이 적용되지 않으며, 실패한 AI 변경을 추적·복구할 수 있다.
- 결정: scene operation과 text operation을 어떻게 분리할지, host 종료에 의존하지 않는 저장·동기화 구조가 필요한지 정한다.

### C. Linux DS와 독립 client 2개의 한 경기

- 후보: Godot DS, Nakama, Edgegap adapter, 필요 범위의 netfox.
- 시나리오: 로그인→match→할당→READY→접속→서버 판정→결과 기록→종료. 지연·손실·늦은 참가·disconnect와 build mismatch를 주입한다.
- 통과 기준: client가 승패·보상을 확정할 수 없고, 다른 build/schema를 거부하며, DS 상태와 두 client의 관측을 대조할 수 있다. 서버 종료 후 잔여 할당도 확인한다.
- 측정: tick CPU, frame time, 연결별 송수신량, 관심 대상 수, 재접속과 준비 시간. 숫자 목표는 목표 player·object 규모를 정한 뒤 고정한다.
- 결정: 기존 기능으로 충족되는 범위와 계획 26의 독자 복제 작업량을 분리한다.

## 10. 최종 판단

**Forge의 방향은 선행 사례가 충분히 있는 방향이다.** 가까운 제품은 웹 제작·AI·게시를 묶고 있고, 엔진 fork들은 언어·도구·그래픽 기능을 공격적으로 확장한다. 동시에 Terrain3D와 Jolt는 addon 또는 upstream 통합으로 유지 부담을 줄이는 경로를 보여 준다.

Forge가 우선 확보할 것은 모든 후보 기능의 일괄 도입보다 **공동 편집 revision이 검증·native client·Linux DS·복제 schema·Hub 게시까지 이어지는 일관성**이다. 공개 구현을 선별해 사용하면서, 그 연결 계약과 Unreal식 서버 권한·Iris에서 참고한 복제 설계를 Forge의 핵심으로 관리하는 구성이 타당하다.

현재 도입 판단에서 가장 주의할 사례는 Godot판 Classic을 남기고 후속 엔진을 TypeScript로 전환한 The Mirror, sign-in이 중단된 Fusionery, 제한된 기기에서 검증된 WebGPU, 상업 이용·경쟁 제품 조건이 있는 공개 코드다. 각각의 상태를 분리해 판단하면 선행 시도의 장점과 비용을 함께 활용할 수 있다.
