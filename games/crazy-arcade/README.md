# Bubble Arena (Crazy Arcade 프로토타입) · PlayHub 통합 (v1.1.0)

- 실행 SSOT: [Web/index.html](Web/index.html)
- 참조 자료 분리: [References/reference_data_v5.zip](References/reference_data_v5.zip), [References/README.md](References/README.md) (`Web/`에서 비실행 자료 분리)
- 공개 상태: 신규 통합 후보 (상위 `games/catalog.json` 통합 시 `enabled: false`로 우선 등록)

## 아카이브 이력
- **최신 통합판 ZIP**: [Archive/Releases/crazy-arcade-v1.1.0.zip](Archive/Releases/crazy-arcade-v1.1.0.zip)
  - SHA-256: `97488a004bcc9bac77215111a801520157c53ef7bb679f10a2a5414a9447867f`
- **수집 원본 ZIP**: [Archive/Incoming/CrazyArcade_BnB_Web_Playable_v1_20261120.zip](Archive/Incoming/CrazyArcade_BnB_Web_Playable_v1_20261120.zip)
  - SHA-256: `f352401b6e0d4afdf5315f85cc512151518a03ba8608d4cf43150982825b9e83`

## 안내
- 외부 네트워크 의존성 없는 단일 HTML 오프라인 프로토타입입니다. 원작 공식 에셋 추출본이 아닙니다.
- 통합 수정: 시작 버튼 클릭 전 첫 `requestAnimationFrame`에서 `grid` 미초기화로 발생하던 `TypeError`를 방지하기 위해 `Web/index.html`의 `render()`에 `if(!grid)return;` 가드를 추가했습니다(원본 ZIP은 `Archive/Incoming/`에 원형 보존).
