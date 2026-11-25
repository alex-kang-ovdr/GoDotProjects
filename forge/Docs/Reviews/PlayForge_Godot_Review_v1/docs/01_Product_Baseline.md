# 01 · 기존 요구사항과 변경 금지 기준

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 이 패키지가 보존하는 결정

기존 대화와 첨부 산출물을 기준으로 정리했다. 오래된 설계의 GitHub 필수·Rust 도입·게임 전용 에디터·런타임 CDN 다운로드를 다시 가져오지 않는다.

| 영역 | 기준 |
|---|---|
| 제품 핵심 | 실시간 온라인 협업, 무설치 웹 제작, AI 주도 재귀 개선 |
| 언어 | C++20 런타임/백엔드, GDScript 게임(Lua·C# 미지원), TypeScript 웹. Rust 제외 |
| 에디터 | Unity식 Hierarchy/Scene/Inspector/Project, 브라우저 내부 패널 |
| 게임 독립성 | Tappy Chicken은 예제 프로젝트. 전용 도구를 플랫폼에 하드코딩하지 않음 |
| UGC 로직 | Device 전용 시스템 없음. Actor/Component/Prefab/GDScript 생성 |
| 플랫폼 | Windows 클라이언트/서버, Android/iOS 클라이언트 우선. Linux는 서버 중심 |
| 렌더링 | Windows DX12, Android Vulkan 우선. iOS는 검증된 네이티브 경로 |
| Material | Mobile/Desktop PBR, Toon, Debug View, Ortho/Perspective, 정렬 제어 |
| 미들웨어 | 독립 API, Havok 선택형, Box2D 2D. 지원 여부는 백엔드별 명시 |
| 협업 저장 | 서버 순차 Command, Revision, 조건부 Undo, 클라우드 Snapshot |
| GitHub | 선택 연결. 미연결 프로젝트도 저장·복원·배포 가능 |
| 공유 콘텐츠 | 구매·결제 없는 공유·검색·고정 버전 재사용 |
| 배포 아카이브 | 소스·원본·Import 설정·실행 패키지 함께 보관 |
| 스트리밍 | Cell 기반 로컬 로드, 로컬 Texture Mip Residency |
| 미지원 | Actor별 Asset Streaming, 게임 실행 중 CDN Asset 다운로드 |
| 플레이 안전 | 필수 초기 복제 + Collision + 서버 승인 후 입력/예측 활성화 |
| Listen Host | Authority World 하나와 로컬 플레이어. Host용 Client World 없음 |
| AI | 외부 AI 포함 공통 작업 기록. 2차 활용은 목적·권한·공급자 조건별 판단 |

## 요금제 / 저장 원칙

| 항목 | Free | Pro |
|---|---:|---:|
| 제작 공간, 계정 합산 | 100 MB | 1 GB |
| 소유 프로젝트 | 3개 | 제한 없음 |
| 활성 배포본 합산 | 50 MB | 100 MB |
| 플랫폼 AI | 가입 최초 1회 체험량, 수치 미정 | 주간 한도, 수치 미정 |
| 구독 가격 | 무료 | 미정 |

Godot 공통 런타임의 용량을 배포 사용량에서 제외할지는 **미확정**이다. 기술 설계가 과금 기준을 임의로 바꾸지 않는다. MB/GB의 정확한 byte convention도 출시 설정에서 명시해야 하며 이번 문서는 사용자가 지정한 표시 단위를 보존한다.

수동/주기적 버전 저장은 협업 명령의 내구성 저장과 다르다. 자동 스냅샷 옵션을 꺼도 서버가 승인한 변경 기록을 버리지 않는다. 내부 Cook 캐시와 계측 로그를 사용자 소스로 가장해 용량에 중복 차감하지 않는다.

## 확인한 기존 파일 상태

`PlayForge_Cloud_Consolidated_v17.zip`의 v16 README는 Canvas 투영 목업, 실제 C++ Reflection/스크립트 런타임 미연동, Component 타입명 기반 식별 제한을 명시한다. 따라서 현재 전환 대상은 **이미 완성된 C++ 엔진의 바이너리 교체가 아니라, 기존 웹 프로토타입·프로젝트 규약을 실제 실행 엔진으로 연결하는 작업**이다.

`PlayForge_AI_Workflow_vNext.zip`은 정책 예제·스키마·검증 자료이며 실제 OAuth/MCP 운영 서버나 게임 엔진을 포함한 배포본이 아니다. 본 패키지에서는 기존 테스트를 재실행했다고 주장하지 않는다. 입력 ZIP의 CRC와 파일 해시만 확인했다. 정확한 식별자는 `references/input-artifacts.json`을 참조한다.

## 요구 변경은 ADR로 남긴다

가령 HLSL을 Godot Shader로 바꾸는 것은 엔진 재사용 수단의 변경이다. 반대로 런타임 다운로드를 추가하는 것은 사용자 요구 변경이다. 후자를 단순한 구현 편의로 승인해서는 안 된다.

각 변경안은 기존 요구, 새 의미, 사용자 영향, 실패 시 되돌리는 방법을 포함한다. 이 검토 패키지의 제안만으로 구현·채택 상태를 자동 변경하지 않는다.
