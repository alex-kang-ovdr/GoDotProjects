# PlayForge UGC 통합 설계 패키지

> PlayForge Cloud | 설계 기준 2026-11-17 | 제안 설계 (구현 완료 아님)

## 목표

크리에이터가 AI로 게임을 생성하고 → 공동 편집 → 멀티플레이 검증 → 비공개 테스트 → 공개 배포 → 발견·재사용 → 분석·운영하는 전체 루프를 구현한다.

## 확정된 기술 원칙

- C++20 Core / GDScript Gameplay / TypeScript Web Editor
- 일반 Actor/Component/Prefab/GDScript 사용; **Device 전용 시스템 없음**
- UI·AI·MCP는 동일 Workspace Command API 사용
- GitHub는 프로젝트 원본, Workspace는 임시 공동 편집 상태, Release는 불변 아카이브
- EOS Connect/Session/Voice 연동; PlayForge가 Matchmaker·서버 배정·Authority 담당
- Listen Host는 단일 Authority World의 직접 Local Player; Loopback/별도 Client World 없음
- 월드 Cell 로딩 + 로컬 Texture Mip Streaming만 지원; Actor 단위 Asset Streaming 및 런타임 CDN 다운로드 미지원

## 문서 목차

1. `01_Prefab_AI_Lua/` — Prefab 재사용
2. `02_Multiplayer_Collaboration/` — PIE·EOS·협업·Initial Play Barrier
3. `03_Publishing_Discovery/` — Release·SEO·추천·검색
4. `04_Analytics_Safety/` — 지표·운영·안전성·안티치트
5. `05_Creator_Ecosystem/` — 공유 에셋·버전·재사용·AI 국제화
6. `06_Implementation/` — API·스키마·마일스톤·QA

## 공통 성공 기준

크리에이터는 로그인 없이 탐색·공개 게임 플레이가 가능하고, 로그인 후 프로젝트 저장·공유·배포할 수 있다. AI 변경은 리뷰·Undo·Git Commit 가능해야 한다. 공개 게임은 서버 권한·보안·분석·롤백을 갖춘다.