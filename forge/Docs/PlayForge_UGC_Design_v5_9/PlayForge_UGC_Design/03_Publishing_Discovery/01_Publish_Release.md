# 비공개 테스트·배포·Release 아카이브

> PlayForge Cloud | 설계 기준 2026-11-17 | 제안 설계 (구현 완료 아님)

## 배포 흐름

`Source Freeze → Dependency Closure → Source Bundle → Incremental Cook/Build → Security/Performance Validation → Private Build → Review → Git Tag → Public Release → Channel Pointer Update`.

## 불변 식별자

`SourceRevision`=Git SHA, `BuildId`=빌드 산출물, `ReleaseId`=불변 릴리스, `ArtifactHash`=파일 무결성, `Channel`=latest/stable 등 변경 가능한 포인터. Git Tag는 특정 SHA를 기록한다.

## Release Bundle

프로젝트 Source Snapshot, 원본 Mesh/Texture/Audio, 공유 에셋 원본 및 Import Settings, GDScript, Localization, Dependency Lock, Engine/Cooker/SDK Version, Target Cooked Package, Validation Report. 비밀키·타인 비허가 콘텐츠·독점 SDK는 제외.

## 공개 범위

Private(제작자), Test(초대/링크), Unlisted(직접 링크), Public(검색·추천). 테스트 링크는 만료·접근 권한·인원 제한 지원.

## 배포 안전성

자동 GDScript 보안 검사, 권한/라이선스, 성능 예산, 서버/클라이언트 호환, 초기 Replication Barrier, Collision Streaming, 악성 파일 검사, 연령·콘텐츠 표시, 신고 상태를 검사한다.

## 롤백

기존 Release는 수정하지 않는다. Channel Pointer를 이전 정상 Release로 되돌리고 세션 신규 배정에 반영한다. 이미 진행 중인 매치는 정책에 따라 종료 또는 유지.

## 실패·재시도

각 단계는 Job ID와 입력 Hash로 멱등 처리. Git Tag와 Release 상태를 분산 원자 트랜잭션으로 가정하지 않고 중단 지점부터 복구한다.