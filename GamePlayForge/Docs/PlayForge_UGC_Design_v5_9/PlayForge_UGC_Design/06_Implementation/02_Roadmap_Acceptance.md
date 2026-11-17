# P0/P1/P2 개발 계획 및 수용 기준

> PlayForge Cloud | 설계 기준 2026-11-17 | 제안 설계 (구현 완료 아님)

## P0 — 완결된 제작·배포 루프

1. Actor/Component/Prefab/Instance Override + Lua Reflection
2. AI Command/ChangeSet/Review + PIE 자동 검사
3. 협업 Presence/Revision/Undo + GitHub Commit
4. Single/Listen/Dedicated PIE + Initial Play Barrier
5. EOS Connect/Session + 최소 Quick Match/Room 배정
6. 무료 Asset Registry/Search/Reuse + Pre-Cook
7. Private Build/Publish/Release Rollback + 공개 SSR 페이지
8. 기본 분석/신고/운영 차단 + 서버 Authority 검증

## P1 — 품질·확장

멀티플레이 부하·네트워크 에뮬레이션, EOS Voice/EAC 지원 PC, 추천 랭킹, AI 번역 검토, Mesh LOD/HLOD, 고급 분석, 협업 품질, 콘텐츠 품질 심사.

## P2 — 장기

개인화 추천, 고급 LiveOps/A-B 테스트, AI 자동 QA/밸런싱, Sparse Texture/GPU Feedback, 크리에이터 수익화(별도 결정 시). 런타임 CDN 다운로드와 Actor 단위 Asset Streaming은 범위에 포함하지 않는다.

## E2E 수용 시나리오

A. 빈 템플릿에서 AI로 PvP 게임 생성→Lua/Prefab 리뷰→2인 PIE→Private Build→Public Release→다른 사용자 플레이
B. 공유 에셋 검색→3D/Audio Preview→Scale Import→프로젝트 참조→Pre-Cook Cache Hit→Release Bundle
C. Dedicated 매치 참가→초기 Actor/Collision 준비→Ready ACK→StartPlay→Teleport Barrier→재접속
D. 신고→검토→공개 중단→검색 제외→이의제기→복구
E. Lua만 수정→Native Rebuild 0, Texture만 수정→Mesh/Physics Cook 0.

## 계측·성능

PIE 준비 시간, Initial Sync 완료율, Teleport 안전 실패율, Cook Cache Hit, Actor 활성화 스파이크, Replication CPU/Bytes, 매치 대기시간, D1/D7/D30, 콘텐츠 재사용률, 신고 처리 시간. 목표치는 벤치마크 후 확정한다.

## 미구현 명시

이 문서들은 실행 코드가 아닌 설계 산출물이다. EOS/EAC SDK 접근, 실제 게임 런타임, 서버, 결제, 추천 모델, 자동 번역 서비스 연결을 완료했다고 주장하지 않는다.