# Don't Starve Together (Godot 4.7.2 PlayForge Template)

로컬 Steam 설치본(`buildid 26797476`, `v763928`)의 정적 분석 역기획서([`references/dont-starve-together/00_index.md`](../../../references/dont-starve-together/00_index.md))를 바탕으로 구축한 PlayForge Godot 4.7.2 2.5D 생존 템플릿입니다.

## 구현된 원작 검증 시스템
- **2.5D 사선 투영 카메라** (`scripts/dst_camera.gd`): `FOV=35°`, `heading=45°`(Q/E ±45° 회전), 줌(`15..50`) 연동 `pitch=30°..60°`
- **시간·달·계절 엔진** (`scripts/dst_world_sim.gd`): 16세그(`480s`) 하루, 20일 달 주기, 4계절(20/15/20/15), 기온/체온/습기(`35`/`15` 히스테리시스)
- **이중 정신력**: 광기(`15%` 진입 / `17.5%` 복귀) ↔ 달섬 진입 시 달 계몽(`85%` 진입 / `82.5%` 해제)
- **사망·유령·부활**: 전원 유령화 `120s` 리셋 카운트다운, 부활 최대 체력 페널티 `-25%`(최대 `75%` 상한)
- **전투·방어구·평면 피해** (`scripts/dst_database.gd`): DST 다중 방어구(`max(amt)` 흡수 + 비율 내구도 분배 + `0.7×` 내구도), `PlanarEntity` 비선형 감쇄 `(\sqrt{4d+64}-8)\times 4`, 평면 피해/방어 분리 계산
- **요리·농사·보트**: 냄비 우선순위/가중치 판정(`perogies`/`meatballs`/`wetgoop`), 7스트레스 체크포인트(`<=1` 거대 작물), 보트 다중 돛 `0.7^k` 체감

## 조작법
- `WASD` / 방향키: 카메라 기준 이동
- `Space`: 채집 / 모닥불 연료 보충 / 농장 돌봄·수확 / 유령 부활
- `F`: 근접 공격 (카이팅)
- `Q` / `E`: 카메라 ±45° 회전, 마우스 휠: 줌
- `1`~`4`: 음식 섭취(베리/당근/미트볼/피에로기), `T`: 1×/8× 배속 토글
- 좌측 사이드바: 도구·모닥불·과학기계·무기·방어구·요리냄비·농경지·브라이트셰이드 평면 장비 제작

## 자동화 테스트 실행
```powershell
& "D:\Github\GoDotProjects-worktrees\PlayHub-Platform\artifacts\local-runtime\node24\node.exe" --test forge/Tests/dont-starve-together.test.cjs
```
