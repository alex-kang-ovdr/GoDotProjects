# 이 세상 끝에서 사랑을 노래하는 소녀 YU-NO (YU-NO)

> **브랜치 소유권**: `PlayHub-JavaGames-yuno` (`games/yu-no/**`)  
> **핵심 아키텍처 기둥**: **병렬 분기 그래프(A.D.M.S.), 플래그 추적(로컬/글로벌 상태 분리), 루트 간 정보·아이템 계승**

## 1. 프로젝트 개요 `[확인]`
- **원제**: 『この世の果てで恋を唄う少女YU-NO』 / *YU-NO: A Girl Who Chants Love at the Bound of This World*
- **원작 기획·각본·게임 디자인**: 칸노 히로유키(菅野ひろゆき / 剣乃ゆきひろ)
- **원작 제작·발매**: 엘프(elf) — PC-9801(1996.12.26), 세가새턴(1997.12.04), Windows(2000.12.22) / MAGES.(5pb.) 풀 리메이크(2017.03.16)
- **장르**: 커맨드 선택·포인트 앤 클릭 SF 미스터리 어드벤처 (병렬세계 분기 그래프 + 루트 간 아이템 계승)

## 2. 디렉터리 구성
- [ReverseDesign/README.md](ReverseDesign/README.md): 역기획서 전체 색인 및 문서 맵
- [ReverseDesign/00_scope_evidence_and_glossary.md](ReverseDesign/00_scope_evidence_and_glossary.md): 분석 범위, 버전 차이, 증거 태그 기준, 용어집
- [ReverseDesign/01_core_loop_and_state_machine.md](ReverseDesign/01_core_loop_and_state_machine.md): 게임 코어 루프 및 2부(현세편→이세계편) 상태 머신
- [ReverseDesign/02_adms_parallel_branching_graph.md](ReverseDesign/02_adms_parallel_branching_graph.md): A.D.M.S. 병렬 분기 그래프, 리플렉터 디바이스, 보옥(8개/10개) 경제학
- [ReverseDesign/03_flag_tracking_and_cross_route_inheritance.md](ReverseDesign/03_flag_tracking_and_cross_route_inheritance.md): 로컬·글로벌 상태 분할, 루트 간 아이템·플래그 계승 매트릭스, 패러독스·교착 방지
- [ReverseDesign/04_modern_to_isekai_convergence_and_routes.md](ReverseDesign/04_modern_to_isekai_convergence_and_routes.md): 현세편(사카이마치) 6대 히로인 루트 → 서재·삼각산 수렴 → 이세계편(데라 그란트)
- [ReverseDesign/05_characters_and_content_structure.md](ReverseDesign/05_characters_and_content_structure.md): 정규 등장인물 20명, 27개 로케이션, 9개 루트·9개 엔딩 구조
- [ReverseDesign/06_ui_ux_and_save_architecture.md](ReverseDesign/06_ui_ux_and_save_architecture.md): 포인트 앤 클릭 ADV UI, A.D.M.S. 맵 뷰어, 리플렉터 보옥 슬롯 및 세이브 아키텍처
- [ReverseDesign/07_data_schemas_and_engine_architecture.md](ReverseDesign/07_data_schemas_and_engine_architecture.md): PlayHub용 TypeScript/JSON 스키마 및 결정론적 A.D.M.S. 그래프·플래그 엔진 설계
- [ReverseDesign/08_verification_and_test_plan.md](ReverseDesign/08_verification_and_test_plan.md): 자동화 검증 계획, 그래프 도달성/순서 독립성 테스트
- [ReverseDesign/SOURCE_REGISTER.md](ReverseDesign/SOURCE_REGISTER.md): 원작 고증 출처 레지스터
- [ReverseDesign/DATA_GAPS.md](ReverseDesign/DATA_GAPS.md): 미확정·버전 차이·1차 바이너리 대조 필요 갭 목록
- [ReverseDesign/verified_data/](ReverseDesign/verified_data/): 정규화된 원작 복원 데이터(JSON 6종, CSV 2종) 및 Node ESM 검증기(`validate_data.mjs`)

## 3. 데이터 무결성 검증 실행
```bash
node games/yu-no/ReverseDesign/verified_data/validate_data.mjs
```
- **검증 항목**: JSON/CSV 행·열 일치, 전 엔티티 참조 무결성(dangling ID 0), 보옥 불변식(PC-98 2+6=8 / SS·리메이크 4+6=10), A.D.M.S. 그래프 도달성 및 교차 루트 고정점 만족성(트루 엔딩 도달 가능성) 검증.
