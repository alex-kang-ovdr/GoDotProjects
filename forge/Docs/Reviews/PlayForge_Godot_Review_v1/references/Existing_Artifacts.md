# 기존 산출물 확인 범위

입력 파일은 대화에 첨부된 파일을 실제 경로에서 확인했습니다. Files 검색에는 파싱 결과가 없어 ZIP 내부 텍스트를 직접 읽었습니다. 원본 ZIP은 이번 검토 패키지에 중복 포함하지 않았습니다.

| 입력 | CRC | 파일 수 | 확인 내용 |
|---|---|---:|---|
| PlayForge_Cloud_Consolidated_v17.zip | 정상 | 46 | v16 README, 통합 README, Tappy project/scene/settings, 파일 구조 |
| PlayForge_AI_Workflow_vNext.zip | 정상 | 21 | README, 구성, 정책·검증 예제의 범위 |

정확한 SHA-256과 크기는 [input-artifacts.json](input-artifacts.json)에 있습니다.

## 보존한 한계

v16 웹 에디터는 Canvas 기반이며 실제 C++ Reflection/스크립트 런타임이 아닙니다. Component는 타입명 기반 제한이 있습니다. Tappy의 Scene·설정 값은 픽셀 좌표처럼 보이며 단위가 확정된 물리 데이터로 보지 않았습니다.

AI Workflow 패키지의 기존 테스트 보고서는 이번에 실행한 테스트가 아닙니다. 본 문서는 이를 실제 Godot 보안/런타임 테스트로 인용하지 않습니다.

## 대화 결정 반영

뒤의 대화에서 확정된 클라우드 Snapshot 기본 저장, GitHub 선택 연결, 최신 Free/Pro 한도, GDScript 단일 지원(Lua 미지원), Actor Asset Streaming·런타임 CDN 미지원, 외부 AI 목적별 사용 정책이 오래된 v17 일반 설명보다 우선합니다.
