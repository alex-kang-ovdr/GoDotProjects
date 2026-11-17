# 발견·검색·SEO·추천

> PlayForge Cloud | 설계 기준 2026-11-17 | 제안 설계 (구현 완료 아님)

## 공개 사이트

`/en/games/{id}/{slug}`, `/ko/assets/{id}/{slug}`, `/creators/{handle}` 등 언어별 SSR/SSG. Canonical, hreflang, Sitemap, OG Image, JSON-LD, 비공개 noindex. 에디터는 SPA.

## 분류

Game/Asset/Template 공통 Content 검색, Type별 Category 최대 2단계, Tag 최대 10개, 태그 별칭·다국어 DisplayName, 플랫폼·2D/3D·호환성·무료 여부 필터.

## 검색 랭킹

텍스트 관련성 우선, 그다음 최근 유효 플레이/재사용, 품질, 최신성. 조회수 단독 정렬 금지. 신규 콘텐츠 탐색 기회를 확보하고 중복·태그 스팸을 제한한다.

## 추천

P0는 최신·인기·카테고리·태그 관련 콘텐츠의 설명 가능한 규칙 기반 추천. P1에서 개인화 실험 및 탐색/활용 균형. 개인정보 최소 수집, 미성년자 안전 정책 적용.

## 전환 퍼널

Search Impression → Click → Detail → Preview → Play/Reuse → Retention/Publish. 검색엔진 노출 데이터는 Search Console 등 외부 집계와 구분한다.

## 수용 기준

공개/비공개 색인 분리, 301 Slug 변경, 언어별 URL 정합성, 태그 정규화, 추천 중복 제한, 삭제/게시 중단 시 검색 제외.