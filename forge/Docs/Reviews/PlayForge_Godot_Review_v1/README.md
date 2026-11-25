# PlayForge × Godot — 도입·제약·마이그레이션 검토 v1

**기준일: 2026-11-17 · 문서 패키지 · 엔진 포팅/런타임 구현물 아님**

Godot 본체 변경 최소화를 우선하면서 PlayForge의 온라인 협업·무설치 웹 제작·AI 주도 재귀 개선을 유지하기 위한 검토입니다.

## 먼저 열 파일

**[INDEX.html](INDEX.html)** — 설치 없이 브라우저에서 읽는 통합 문서. 외부 JS·CSS·폰트 의존성 없음.

**[전체 검토 한 파일](PlayForge_Godot_Review_Complete.md)** — 공유·AI 컨텍스트용 통합 Markdown.

**[요약 판단](docs/00_Executive_Decision.md)** → **[요구 갭 매트릭스](docs/16_Feature_Gap_Matrix.md)** → **[PoC/완료 기준](docs/14_Roadmap_And_Acceptance.md)** 순서로 읽는 것을 권장합니다.

## 권장안

PlayForge 웹 에디터와 Source/협업/MCP는 유지하고, Godot는 실행 엔진으로 활용합니다. GDExtension을 기본으로 하고 정적 모듈은 예외 승인, 내부 패치는 기본 금지합니다. 이 선택은 아직 채택 확정이 아닙니다.

웹/네이티브 렌더링 차이, GDScript 격리, 로컬 Mip Streaming, 다중 Room, 자체 렌더러·HLSL·정렬 요구가 중요한 검증 지점입니다. 미지원 기능을 조용히 축소하지 않습니다.

## 구성

- `docs/`: 분야별 검토 16개. 구현 난이도·제약·우회·마이그레이션·검증 기준.
- `data/feature-matrix.json`: 66개 요구의 가용성·확장 등급·난이도.
- `data/risk-register.json`: 16개 위험과 책임 역할.
- `data/acceptance-tests.json`: 64개 Runtime 수락 시험. **모두 미실시**.
- `references/`: 47개 공식/원저자 자료와 입력 ZIP 해시.
- `examples/`, `schemas/`: 제안 계약의 JSON 예시·Schema. 실제 실행 설정 아님.
- `tools/verify_bundle.py`: 문서 패키지 검증.
- `reports/`: 패키지 검사 결과 및 Runtime 시험 체크리스트.
- `MANIFEST.json`: 파일 목록·SHA-256. 자기 자신의 hash는 제외.

## 유지한 요구

게임은 GDScript(Lua·C# 미지원), 런타임/백엔드는 C++20, 웹은 TypeScript입니다. Rust·Device 전용 시스템을 추가하지 않습니다. Listen Host는 단일 Authority World이며 별도 Local Client World/Loopback을 만들지 않습니다. Actor별 Asset Streaming과 런타임 CDN 다운로드를 지원하지 않습니다.

클라우드 Snapshot이 기본 버전관리이고 GitHub는 선택입니다. Free는 제작 100 MB·프로젝트 3개·배포 50 MB, Pro는 제작 1 GB·프로젝트 개수 무제한·배포 100 MB입니다. 가격·AI 사용량의 구체 수치는 미정이며 Godot 도입으로 변경하지 않습니다.

## 검증과 한계

공식 자료 대조와 입력 ZIP의 텍스트·CRC 확인을 수행했습니다. 본 패키지의 JSON/참조/해시/링크 검사는 별도 보고서에 기록합니다. **Godot 설치·빌드·Export·브라우저 PIE·Havok·Box2D·멀티플레이·실기기·실측 비교는 수행하지 않았습니다.**

현재 확인한 기준 안정판은 4.7.2, 개발 채널은 4.8 beta3입니다. 정확한 채택 버전·commit·템플릿 해시는 PoC에서 확정합니다. stable/latest 문서의 기능을 버전 고정 바이너리에서 다시 검증해야 합니다. [공식 배포 목록](https://godotengine.org/download/archive/)

## 패키지 검사

Python 3 표준 라이브러리만으로 기본 무결성 검사를 실행할 수 있습니다.

```sh
python tools/verify_bundle.py
```

`jsonschema`가 설치되어 있으면 예시의 정식 JSON Schema 검사도 수행합니다. 라이브러리가 없으면 해당 검사를 건너뛰었다고 표시하고 기본 구조·hash 검사는 수행합니다. Godot 런타임 시험을 실행하는 명령이 아닙니다.

## 목차

- [00 · 도입 판단과 의사결정 요약](docs/00_Executive_Decision.md)
- [01 · 기존 요구사항과 변경 금지 기준](docs/01_Product_Baseline.md)
- [02 · Godot 변경 최소화 정책과 확장 경계](docs/02_Minimal_Change_Policy.md)
- [04 · 무설치 웹 에디터·협업·MCP·재귀 개선](docs/04_Web_Collaboration_AI.md)
- [05 · 렌더링·셰이더·카메라·정렬 제약](docs/05_Rendering_Cameras_Sorting.md)
- [06 · Havok·Box2D·Navigation·Animation·ECS](docs/06_Physics_Animation_Nav_ECS.md)
- [07 · 멀티플레이·Listen·PIE·초기 준비 장벽](docs/07_Multiplayer_PIE_Ready.md)
- [08 · World Cell·Texture Streaming·로컬 패키지](docs/08_World_Texture_Streaming.md)
- [09 · Import·증분 Cook·빌드·배포](docs/09_Import_Cook_Build_Release.md)
- [10 · 기존 산출물 마이그레이션과 좌표·단위](docs/10_Migration_Identity_Coordinates.md)
- [11 · INI·Console·Device Profile·진단·지역화](docs/11_Config_Diagnostics_Localization.md)
- [12 · 라이선스·UGC 보안·AI 운영](docs/12_License_Security_Governance.md)
- [13 · 운영·서버 리소스·패키지·요금제 영향](docs/13_Operations_And_Capacity.md)
- [14 · 단계별 PoC·완료 기준·중단 기준](docs/14_Roadmap_And_Acceptance.md)
- [15 · ADR·미결정 항목·기존 설명 보완](docs/15_ADR_Open_Issues_Corrections.md)
- [16 · 전체 요구사항 갭 매트릭스](docs/16_Feature_Gap_Matrix.md)

[출처 목록](references/Verified_Sources.md) · [기존 파일 확인](references/Existing_Artifacts.md) · [고지](NOTICE.md)
