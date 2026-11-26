# Don't Starve Together (Godot 4.7.2 PlayForge Template)

로컬 Steam 설치본(`buildid 26797476`, `v763928`)의 정적 분석 역기획서([`references/dont-starve-together/00_index.md`](../../../references/dont-starve-together/00_index.md))를 바탕으로 구축한 PlayForge Godot 4.7.2 2.5D 생존 템플릿입니다.

## 구현된 원작 검증 시스템
- **2.5D 사선 투영 카메라** (`scripts/dst_camera.gd`): `FOV=35°`, `heading=45°`(Q/E ±45° 회전), 줌(`15..50`) 연동 `pitch=30°..60°`
- **시간·달·계절 엔진** (`scripts/dst_world_sim.gd`): 16세그(`480s`) 하루, 20일 달 주기, 4계절(20/15/20/15), 기온/체온/습기(`35`/`15` 히스테리시스)
- **이중 정신력**: 광기(`15%` 진입 / `17.5%` 복귀) ↔ 달섬 진입 시 달 계몽(`85%` 진입 / `82.5%` 해제)
- **사망·유령·부활**: 전원 유령화 `120s` 리셋 카운트다운, 부활 최대 체력 페널티 `-25%`(최대 `75%` 상한)
- **전투·방어구·평면 피해** (`scripts/dst_database.gd`): DST 다중 방어구(`max(amt)` 흡수 + 비율 내구도 분배 + `0.7×` 내구도), `PlanarEntity` 비선형 감쇄 `(\sqrt{4d+64}-8)\times 4`, 평면 피해/방어 분리 계산
- **요리·농사·보트**: 4슬롯 인터랙티브 냄비 조합 UI(`V`, 피에로기/미트볼/베이컨에그/미트스튜/생선스틱/꿀햄/용과파이/젖은 찌꺼기), 7스트레스 농사(`<=1` 거대 작물), 보트 진수·바다 항해·다중 돛 `0.7^k` 체감
- **지상 ↔ 동굴/유적 2-Shard & 악몽 주기(M4)**: 싱크홀(`C` 또는 근접 `Space`) 하강 시 동굴/유적 전용 심리스 KTEX 지형, 고대 의사과학 기지(Tech Lv 3 → 어둠의 검/툴레사이트 갑옷), 악몽 주기(`calm`→`warn`→`wild`→`dawn`) 및 공포부리 출현
- **사계절 4대 보스 & M3 협동 동기화**: 외눈사슴(4,000 HP)·곰소리(6,000 HP)·큰사슴/거위(6,000 HP)·용파리(27,500 HP)·결정화 외눈사슴(Planar), 서버 권위 19필드 Replica + Classified 채널 및 2~6인 동료 부활(`scripts/dst_net_sync.gd`)
- **6인 캐릭터 고유 기믹 & 스킬트리(M4/M5)**: 윌슨(수염 단열·연금술 변환), 윌로우(라이터 광원·불 정신력 회복), 볼프강(마이티 `2.0×`/약체 `0.75×`), 웬디(아비게일 광역 영혼), 위그프리드(전투 흡혈·육식 전용), WX-78(이속 회로·습기 감전) + 6종 인사이트 스킬 해금
- **2.5D 비주얼·HUD 연출**: 심리스 10종 KTEX 바이옴 스플랫 셰이더, 30종 원작 KAnim 스프라이트, 접지 그림자, 걷기/공격/피격 애니메이션, 3D 플로팅 대미지/채집 팝업, 비/눈 날씨 파티클, 보스 대형 체력바, 원형 3대 배지, 실시간 2D 미니맵, 원작 PNG 아이콘 클릭형 인벤토리

## 조작법
- `WASD` / 방향키: 카메라 기준 이동 (보트 승선 시 바다 항해 가능)
- `Space`: 채집 / 싱크홀 하강·귀환 / 모닥불 연료 보충 / 농장 돌봄·수확 / 유령 부활
- `F`: 근접 공격 (카이팅) · `Q` / `E`: 카메라 ±45° 회전 · 마우스 휠: 줌
- `V`: 4슬롯 요리 냄비 UI · `C`: 지상↔동굴/유적 전환 · `B`: 보트 승선/하선 · `K`: 인사이트 스킬트리 · `M`: 미니맵 토글 · `G`: 연금술 변환(돌 3→금 1) · `T`: 1×/8× 배속 토글
- `1`~`4` 또는 하단 아이콘 클릭: 음식 섭취 / 무기 장착 · 좌측 사이드바: 원작 아이콘 제작 메뉴

## 에셋 추출 도구
1. **웹 런타임 경량 번들 추출 (`tools/extract_dst_assets.py`)**:
   - PlayForge WebAssembly 런타임용 경량 번들(`data/dst_*_extracted.txt`, `data/extraction_manifest.json`) 생성.
   ```powershell
   python forge/Templates/dont-starve-together/tools/extract_dst_assets.py
   ```
2. **로컬 전체 무누락 전수 추출 (`tools/extract_dst_all.py`)**:
   - 로컬 Steam 설치본 `data/` 11,132개 원본 파일 전체를 `extracted_assets/`(Git 제외)로 전수 추출·디코딩하고, 검증 인덱스 `data/full_asset_index.json` 생성 (`unaccounted_source_files == 0`, `failures_total == 0`).
   - 암호화된 Klei 스킨 번들(`data/anim/dynamic/*.dyn`, 3,533건)은 복호화 우회 없이 파일명·크기 인벤토리만 기록.
   ```powershell
   python forge/Templates/dont-starve-together/tools/extract_dst_all.py
   ```

## 자동화 테스트 실행
```powershell
& "D:\Github\GoDotProjects-worktrees\PlayHub-Platform\artifacts\local-runtime\node24\node.exe" --test forge/Tests/dont-starve-together.test.cjs
```
