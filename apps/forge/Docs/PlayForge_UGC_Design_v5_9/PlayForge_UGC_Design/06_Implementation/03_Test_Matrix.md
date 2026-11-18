# QA 테스트 매트릭스

> PlayForge Cloud | 설계 기준 2026-11-17 | 제안 설계 (구현 완료 아님)

## 기능 테스트

| ID | 테스트 | 기대 결과 |
|---|---|---|
| PF-01 | Prefab 기본값 변경 | 비Override 인스턴스만 갱신 |
| PF-02 | AI와 사용자 동시 Property 수정 | Revision 충돌 처리 |
| PF-03 | Lua 무한 루프 | 샌드박스 Budget 중단 |
| PF-04 | Listen Host | 별도 Client World 없음 |
| PF-05 | Initial Snapshot 일부 누락 | 플레이 시작 차단 |
| PF-06 | Teleport 목적지 Collision 지연 | 기존 위치 유지 |
| PF-07 | EOS Voice 장애 | 게임 진행 유지 |
| PF-08 | 동일 Room 동시 예약 | 중복 예약 방지 |
| PF-09 | Asset v1/v2 | 기존 프로젝트 v1 고정 |
| PF-10 | Texture 변경 | 관련 Texture만 Cook |
| PF-11 | 비공개 게임 SEO | noindex/접근 차단 |
| PF-12 | Release Rollback | 이전 정상 버전으로 신규 접속 |
| PF-13 | 신고 후 게시 중단 | 검색·신규 실행 차단 |
| PF-14 | FLocText 원문 변경 | 검토 번역 Outdated |

## 비기능 테스트

부하(다중 Room), 네트워크 손실·지연, 서버 장애, 캐시 손상, GitHub 권한 만료, 모바일 메모리 압박, 고속 이동 Cell 경계, IME 협업, API 권한 우회, 음성·신고 스팸.

## 릴리스 게이트

Critical 보안·데이터 손상·초기 Sync 실패·Collision 관통은 차단. Performance 예산 초과는 Target별 정책으로 차단/경고. 수동 검토와 자동 테스트 결과를 Release에 첨부한다.