# 카탈로그 검증 전용 fixture

이 디렉터리는 Python 정적 검증기의 회귀 테스트 입력이다. `fixture-demo`는 HTML·JS·CSS·이미지 파일 참조가 연결된 최소 표본이며 실제 서비스 게임이나 기본 8종 구현이 아니다. Google 로그인·게임 SDK·클라우드 저장·랭킹을 구현하지 않았다. 실제 IIS PoC의 게임과 배포 경로도 별도다.

`catalog/games.json`과 게임별 `game.manifest.json`을 복사·변형해 정상 입력, 누락 파일, 중복 ID, symlink, 상대 자산 이탈, SEO 본문 오류를 검사한다. `seo.indexable=true`는 검증 분기 입력이며 이 fixture를 검색 사이트에 배포하라는 뜻이 아니다.

`assets/cover.png`는 테스트에 필요한 1×1 PNG다. 표지·레이아웃·게임 디자인 시안이 아니다. 각 테스트는 임시 디렉터리에서 이 표본을 복제하고 원본을 변경하지 않는다.
