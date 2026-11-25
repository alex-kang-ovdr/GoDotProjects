# AI 국제화·FLocText·크리에이터 생태계

> PlayForge Cloud | 설계 기준 2026-11-17 | 제안 설계 (구현 완료 아님)

## FLocText

`FString` 일반 문자열, `FName` 내부 식별자, `FGameplayTag` 계층형 게임 상태, `FLocText` 지역화 가능한 텍스트. Namespace+Key+SourceText를 저장하고 Locale별 번들로 해석한다.

## AI 번역

Source 변경된 Key만 AI Batch Translation, 변수/ICU MessageFormat 검증, 용어집·문맥 반영. 사람이 검토한 번역은 자동 덮어쓰지 않고 Outdated 표시.

## 다국어 SEO

카테고리/태그 ID는 공통, 표시명·설명만 번역. 언어별 공개 URL과 hreflang. ko/en/ja P0, 기타 언어 점진 확장.

## 크리에이터 프로필

게임/에셋/템플릿 공개 목록, 팀, 팔로우, 사용·재사용 수, 소개, 권한, 신고. 제작자의 GitHub 원본과 공개 Release 링크를 분리 표시한다.

## 생태계 성장

템플릿에서 시작 → AI 제작 → 플레이테스트 → 공개 게임 → GDScript/Prefab 공유 → 다른 제작자의 재사용. 콘텐츠 원본 소유권과 라이선스는 명시적으로 유지한다.