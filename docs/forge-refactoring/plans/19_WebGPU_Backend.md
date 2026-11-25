# 19. RenderingDevice 기반 WebGPU 백엔드 개발

| 항목 | 계획 |
|---|---|
| 계획 ID / 기준일 | PLAN-19 / 2026-11-24 |
| 원문 연결 | PDF 5, 7-8쪽: WebGPU, 브라우저 Forward+/Mobile·compute |
| 우선순위 / 상태 | P2 R&D / 설계안, 브라우저 실행 검증 미수행 |
| 구현 위치 | Godot Web 플랫폼·RenderingDevice 코어 backend, shader translation, export tooling |
| 담당 | 렌더링 2명, Web/WASM 1명, QA 협업 |
| 예상 공수 | 44-74 PW; 1 PW = 숙련 담당자 5근무일; 전체 렌더러 동등성 보장 제외 |
| 선행 / 연계 | 16 고정 빌드; 04 패스 계약, 01 GPU driven, 17 기기 QA, 20 C# Web는 독립 |

## 1. 목표와 범위

웹에서 RenderingDevice 기능 중 검증된 부분을 사용할 수 있게 하고, 콘텐츠가 요구하는 capability에 따라 렌더러를 선택한다. 첫 제품 범위는 기본 PBR·그림자·스키닝·instancing·제한된 compute와 안정적인 device loss 복구다.

초기 버전에서 데스크톱 Forward+ 전체 기능, 모든 GPU, 모든 브라우저를 동일하게 지원한다고 약속하지 않는다. 지원하지 않는 콘텐츠를 무작정 Compatibility로 실행하여 잘못된 화면을 보여주지 않고 fallback 적합성을 export 때 판정한다.

## 2. 확인 사실과 계획상 전제

확인 당시 Godot stable Web 문서는 WebGL 2.0/Compatibility 경로와 WebGPU 미지원을 설명한다. 공식 priorities는 WebGPU backend를 향후 과제로 제시한다. 해당 roadmap은 우리 개발 일정이나 upstream 병합을 보장하지 않는다. [Web export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html), [Godot priorities](https://godotengine.org/priorities/)

WebGPU는 rendering·compute API와 device loss·오류 모델을 규정한다. 지원 여부는 브라우저 이름만이 아니라 adapter feature·limit로 확인해야 한다. [W3C WebGPU 명세](https://www.w3.org/TR/webgpu/)

이하 수치와 API는 자체 제안이다. 구현 착수 시 현재 upstream 구현 여부를 다시 확인하고 이미 해결된 부분은 재구현 범위에서 제외한다.

## 3. 백엔드 구성

| 구성 | 책임 | 검증할 경계 |
|---|---|---|
| WebGPUDevice | adapter 선택, feature/limit, queue, error scope | secure context, adapter 없음, device loss |
| ResourceBridge | RID↔buffer/texture/sampler/bind group 대응 | lifetime, alignment, usage, format |
| PipelineCompiler | shader translation·pipeline 생성·cache | WGSL 검증, specialization, async 준비 |
| CommandEncoder | draw/compute/copy/pass 명령 생성 | barrier 의미·pass order·readback |
| RenderProfile | MobileSubset/ForwardSubset capability | 미지원 feature 조기 진단 |
| WebExportValidator | 콘텐츠·addon·hosting 설정 검사 | 브라우저/서버 headers와 asset profile |

현재 RD 호출을 API 이름만 바꿔 전달하지 않는다. 동기 readback과 즉시 pipeline 생성 등 브라우저 실행 모델과 맞지 않는 지점을 목록화한다. GPU command 완료를 CPU polling busy loop로 기다리지 않는다.

## 4. 제안 capability 계약

```yaml
# 새로 제안하는 exporter/runtime 계약
web_render_profile:
  backend: webgpu
  schema_version: 1
  required_features: [storage_buffers, compute]
  optional_features: [timestamp_query]
  content_profile: mobile_subset_v1
  shader_bundle_hash: resolved-digest
  fallback_profile: compatibility_low
  fallback_validated: true
```

런타임 `query_web_render_capabilities()`와 export 진단 `validate_web_profile(content)`를 제안한다. 실제 WebGPU feature 이름은 adapter 결과에서 가져오고 위 이름은 제품 수준 capability다.

한 게임의 WebGPU와 WebGL 산출물은 같은 game data schema를 사용하되 shader·texture format·effect 설정은 별도 manifest를 갖는다. Backend 전환은 세션 재시작 경계에서 수행한다. 서버 simulation 규칙은 renderer 선택과 무관하다.

## 5. 구현 핵심

1. RD 사용 호출·format·limit를 추출하여 최소 conformance scene을 만든다.
2. 기존 shader IR에서 WGSL까지의 변환 경로를 비교하고 translator 버전을 고정한다.
3. buffer alignment, texture views, read/write hazard, pass dependency를 명시한다.
4. async pipeline 생성과 asset prewarm을 도입하여 최초 효과 등장 시 hitch를 계측한다.
5. 화면 resize·orientation·device loss 시 resource registry에서 재생성한다.
6. shader cache는 engine/shader/compiler/profile/feature hash로 분리한다.
7. compute가 있어도 GPU-driven/HWRT/Deferred의 모든 기능이 가능한 것으로 취급하지 않는다.

GPU timestamp가 없으면 CPU 관측 범위를 표시한다. 계측값이 없는 GPU 시간을 0 ms로 기록하지 않는다. Shader 오류에는 콘텐츠 작성자가 수정할 수 있는 원본 shader 위치를 포함한다.

## 6. 작업 분해

| 작업 | 내용 | PW | 산출물 |
|---|---|---:|---|
| W19-1 | RD gap·feature matrix·수직 slice spike | 4-6 | 진행/중단 근거, 범위표 |
| W19-2 | resource·device·command backend | 10-18 | 최소 draw/compute/copy 구현 |
| W19-3 | shader translation·pipeline cache | 8-14 | shader bundle·오류 매핑 |
| W19-4 | MobileSubset 렌더러·후보 ForwardSubset | 10-16 | 핵심 장면·fallback validator |
| W19-5 | browser/GPU 회귀·device loss·성능 | 8-12 | 지원 matrix, 재현 보고서 |
| W19-6 | exporter·릴리즈·upstream patch 정리 | 4-8 | 빌드 preset, 문서, patch queue |
| 합계 | 전체 데스크톱 renderer 기능 일치 제외 | **44-74** | 검증된 WebGPU subset |

## 7. 단계별 gate

G0에서 단순 PBR 장면과 compute 결과가 타깃 브라우저 2종에서 일치해야 한다. G1은 모바일 GPU 1종을 포함한 resource lifetime·shader 검증이다. G2는 실제 게임 slice와 fallback 경로, G3는 장시간·memory·loss 복구다.

4-6 PW spike에서 핵심 shader 변환이나 요구 feature가 성립하지 않으면 전체 구현으로 넘어가지 않는다. 지원 feature 축소, upstream 작업 참여, 검증된 WebGL profile 유지 중 하나로 결정한다.

## 8. 완료 기준과 재현 실험

| 항목 | 시험 조건 | 계획 목표 |
|---|---|---|
| 기능 | scene 20개, shader fixture 100개 | 지원 subset의 validation error 0 |
| 화면 | 고정 camera/light/seed, 플랫폼별 기준 이미지 | 장면별 허용 오차 사전 정의, 임계 초과 0 |
| 안정성 | 지원 browser/GPU 조합별 2시간 | crash 0, 무한 대기 0 |
| Device loss | 강제 loss·resize·background 각 30회 | 복구 또는 저장된 상태로 안전 재시작 |
| 메모리 | scene 50회 교체 | 해제 대기 종료 후 잔류 증가 10% 이하 |
| 속도 | warmup 2분, 10분 × 3회 | 목표 기기 30/60 FPS profile별 예산 통과 |
| fallback | adapter 없음·feature 부족 주입 | 적합한 fallback 실행 또는 명확한 미지원 안내 |

성능은 네이티브와 상대 비교하되 웹이 항상 빨라진다는 목표를 두지 않는다. APK/iOS native 대비 browser overhead를 별도 보고한다. p50/p95/p99 CPU/GPU frame time·GPU 메모리·cold start를 기록한다.

## 9. 통합·운영 위험

브라우저 update가 shader validation이나 지원 feature를 바꿀 수 있다. 자동 browser 업데이트 채널에서 nightly를 돌리고 실제 지원 목록에는 검증한 버전 범위를 기록한다. 미검증 기기에 강제 활성화하지 않는다.

WebGPU와 C# Web는 독립 축이다. GDScript WebGPU가 통과해도 C# export gate는 열리지 않는다. WebGPU는 raw UDP를 제공하지 않으므로 네트워크 transport는 29의 WebRTC/WebSocket 경로를 사용한다.

## 10. 제출 산출물·출처

RD backend·shader converter 설정·export validator·conformance scene·browser/GPU matrix·fallback 가이드·upstream 분리 patch가 산출물이다. 이번 문서는 구현 완료 보고서가 아니다.

확인일: 2026-11-24.

- [Godot Web export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html)
- [Godot priorities](https://godotengine.org/priorities/)
- [WebGPU 명세](https://www.w3.org/TR/webgpu/)
