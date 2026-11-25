# 무료 공유 에셋 Registry 및 버전 재사용

> PlayForge Cloud | 설계 기준 2026-11-17 | 제안 설계 (구현 완료 아님)

## 범위

구매/결제/정산 없음. Private/Team/Public 공유, 검색·Preview(3D/2D/Audio), Import Scale/Axis/Compression, Add to Project, Fork, 정수 버전 v1/v2/v3.

## 버전 원칙

Asset ID + 정수 Version. 게시된 버전은 불변, 프로젝트는 특정 버전을 Pin. 기존 프로젝트 자동 업데이트 없음. 공유 에셋 자체에 Branch/Merge/PR 없음.

## 데이터 모델

`Assets(Id,OwnerId,Name,Visibility,LatestVersion)` / `AssetVersions(AssetId,Version,StorageKey,CreatedAt)` / `AssetUses(AssetId,Version,ProjectId)`. 프로젝트 GitHub의 `packages.lock`에 ID/Version 기록.

## 보관 수명

등록된 프로젝트 참조가 있는 버전은 유지. 최신 공유 버전은 기본 유지. 참조 없는 이전 버전은 장기 유예 후 정리 후보. 배포 Release에는 원본 Snapshot 보관. 외부 GitHub에만 존재하는 미등록 참조는 플랫폼이 알 수 없으므로 과거 재빌드 보장 정책을 명시해야 한다.

## 미리보기·Import

Mesh 회전·줌·애니메이션, Texture Alpha/Mip, Audio 청취·Waveform·Trim, GDScript 코드 정적 Preview. Scale/Unit/Axis, Collider, Compression Profile 설정. Import 결과는 Pre-Cook DDC 재사용.

## 콘텐츠 품질

필수 썸네일·설명·태그, 중복 Hash, 저작권/라이선스 확인, 악성 GDScript 검사, 호환성 테스트, 신고/Unshare. 사용 횟수는 인기 지표이며 삭제 안전성은 참조 레코드로 결정.