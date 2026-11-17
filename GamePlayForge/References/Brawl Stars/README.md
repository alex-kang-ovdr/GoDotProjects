# Brawl Stars

현재 실행본: `Playable/Current/`

수집 ZIP: `Playable/Latest_Playable.zip`

원본: `Brawl_Lab_4_All_Deliverables.zip`

실행 진입점: `Current/game/dist/index.html`

이전 기획서 및 산출물은 그대로 보존했습니다. 최신 실행본은 반드시 Playable/Current를 사용하세요.

ZIP 무결성과 초기 HTML 참조·스크립트 문법은 통과했습니다. 브라우저 실행/장시간 플레이 검증은 하지 못했습니다.

## PlayForge Godot 템플릿

`../../Templates/brawllabs/`에는 이 참고 자료의 문서화된 전투·젬 수집 루프를 바탕으로 한 독립 Godot 구현이 있습니다. 구현 범위는 단일 Gem Grab-inspired 3대3 세로 조각이며, 7개 경쟁 모드와 연습장 등 Brawl Lab 전체 실행본의 기능을 옮기지 않았습니다. 원본 참고 실행본과 파일은 수정하지 않았고, 템플릿은 자체 제작 SVG와 Godot 코드만 사용합니다. 정확한 범위·조작·검증은 템플릿의 [README](../../Templates/brawllabs/README.md)를 참조하세요.


### 2026-11-17 멀티플레이 적용 갱신

Godot 서비스 템플릿에는 별도 서버 권한형 3대3 모드를 추가했다. 원본 Brawl Lab 참고 자료의 온라인 기능을 확인했다고 주장하는 것이 아니라 PlayForge 자체 구현이다. 팀 선택/Ready, 2인 이상 준비 후 5초 시작, 20초 초과 미준비 관전자, 빈자리·중도 이탈 봇 대체를 포함한다. 상세 구현 및 검증 범위는 [Godot 템플릿 README](../../Templates/brawllabs/README.md)를 참조한다. 원본 실행 자료는 수정하지 않았다.
