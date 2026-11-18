# 플랫폼·게임 분석 및 운영

> PlayForge Cloud | 설계 기준 2026-11-17 | 제안 설계 (구현 완료 아님)

## 플랫폼 핵심 지표

콘텐츠 노출, CTR, 상세→플레이 시작, 플레이 성공, D1/D7/D30, 평균 세션 길이, 재방문, 검색→재사용, 공유·배포 전환, 크리에이터 활성도. D1 등은 코호트 기준과 시간대를 명시한다.

## 게임 이벤트

`session_start/end`, `tutorial_start/complete`, `checkpoint`, `level_complete`, `death`, `match_start/end`, `asset_reuse`, `publish`. Event Schema Registry로 타입/필드/허용 크기 검증.

## 데이터 수집

클라이언트 이벤트는 중복·조작 가능성이 있으므로 경제/승패/보상 등 핵심 이벤트는 서버 Authority가 기록. EventId·SessionId·Timestamp로 중복 제거. PII 및 자유 텍스트 수집 제한.

## 운영 콘솔

게임별 DAU/Retention/Funnel, Crash/ANR, 서버 CPU·메모리·네트워크, Replication 지표, Voice 상태, 매치 대기 시간, 버전별 지표, 신고·제재 현황, Release Rollback.

## 실험

P1에서 Feature Flag와 A/B 실험: 안정적인 사용자 버킷, 지표 정의, 안전 중단, 게임 버전별 결과. 운영자 임의 실험은 공개 정책과 동의 요구를 따른다.

## 알림

서버 장애율, 매치 실패율, 초기 Ready 실패율, 크래시율, 비정상 신고 급증에 경보. 경보는 원인·게임·Release·지역 단위로 분류한다.