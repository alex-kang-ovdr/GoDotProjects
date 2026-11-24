# 경계 저편에서 사랑을 노래하는 소녀 호라이즌 (HORIZON)

> **브랜치 소유권**: `PlayHub-JavaGames-horizon-drifter` (`games/horizon-drifter/**`)  
> **핵심 아키텍처 기둥**: **병렬 분기 그래프(A.D.M.S.), 플래그 추적(로컬/글로벌 상태 분리), 루트 간 정보·아이템 계승**

## 1. 프로젝트 개요 `[확인]`
- **원제**: 『この世の果てで恋を唄う少女YU-NO』 / *YU-NO: A Girl Who Chants Love at the Bound of This World*
- **원작 기획·각본·게임 디자인**: 칸노 히로유키(菅野ひろゆき / 剣乃ゆきひろ)
- **원작 제작·발매**: 엘프(elf) — PC-9801(1996.12.26), 세가새턴(1997.12.04), Windows(2000.12.22) / MAGES.(5pb.) 풀 리메이크(2017.03.16)
- **장르**: 커맨드 선택·포인트 앤 클릭 SF 미스터리 어드벤처 (병렬세계 분기 그래프 + 루트 간 아이템 계승)

## 2. 빠른 실행 (Playable Web Prototype)
외부 CDN 없이 오프라인(`file://`) 및 로컬 HTTP 서버 모두에서 즉시 실행됩니다.
- **실행 진입점**: `games/horizon-drifter/Web/index.html`을 브라우저에서 직접 열거나 정적 서버로 서빙합니다.
- **주요 플레이 기능**:
  - **35노드 A.D.M.S. 병렬 분기 SVG 그래프**: 프롤로그 → 사카이마치 6대 히로인 분기 → 서재 수렴 → 데라 그란트 이세계편 → 트루 엔딩까지 전체 병렬세계 트리와 5대 교차 계승 궤적을 실시간 시각화합니다. 금색 보옥 앵커가 꽂힌 노드를 클릭하면 즉시 리플렉터 점프 프리뷰가 열립니다.
  - **팔각형 리플렉터 디바이스 위젯**: PC-98(초기 2 + 발견 6 = **8슬롯**)과 SS/리메이크(초기 4 + 발견 6 = **10슬롯**) 모드 전환, 분기 예고 점멸등, 보옥 배치·점프·원격 회수, 추가 광점 보옥 6종 추적.
  - **ADV 장면 & 커맨드 패널**: 로케이션별 프로시저럴 SVG 배경, 인물 배지, 현장 조사(`inspectLocation`), 아이템 사용(`useItem`, 예: 1일차 거점에서 서재 열쇠 사용 → 괘종시계 `6→3` 보옥 6 획득), 잠긴 관문 사유 툴팁.
  - **비대칭 상태 추적기 & 3슬롯 시스템 세이브**: 시간축 점프 시 유지되는 **계승 상태(Global Items 14종 · Global Flags 11종)**와 점프 시 스냅샷 복원되는 **로컬 상태(Local Items 3종 · Local Flags 12종)** 및 5대 루트 간 교차 계승 체인을 실시간 비교합니다.

## 3. 데이터 동기화 · 검증 · 자동화 테스트 실행
리포지터리 루트에서 다음 명령을 순서대로 실행합니다.
```bash
# 1. verified_data/*.json -> Web/data/game-data.js 번들 동기화
node games/horizon-drifter/Source/sync-data.mjs

# 2. SSOT 데이터 무결성 & 고정점 도달성 검증 (0 errors)
node games/horizon-drifter/ReverseDesign/verified_data/validate_data.mjs

# 3. 헤드리스 A.D.M.S. & 리플렉터 엔진 자동화 테스트 (node --test)
node --test games/horizon-drifter/Source/engine.test.mjs

# 4. PlayHub 브랜치 소유권 & 스킬 게이트 검증
npm run check:ownership
npm run check:skills
```

## 4. 디렉터리 구성
- `game.manifest.json`: PlayHub 게임 매니페스트 (`id: "horizon-drifter"`, `version: "1.0.0"`)
- `Source/sync-data.mjs`: `ReverseDesign/verified_data/*.json` → `Web/data/game-data.js` SSOT 번들러
- `Source/engine.test.mjs`: 보옥 경제·소용돌이 복구·5대 교차 계승·트루 엔딩 완주·직렬화 결정성 테스트
- `Web/index.html`, `Web/styles.css`, `Web/app.js`: 플레이어블 A.D.M.S. 웹 UI
- `Web/engine.js`: 무상태/결정론적 헤드리스 A.D.M.S. & 리플렉터 엔진 (UMD)
- `Web/data/game-data.js`: SSOT 생성 데이터 번들 (`globalThis.YUNO_DATA` + `module.exports`)
- `Web/assets/cover.svg`: 리플렉터 디바이스 & 평행세계 성좌 커버 아트
- [ReverseDesign/README.md](ReverseDesign/README.md): 역기획서 전체 색인 및 문서 맵 (00~08, `verified_data/`)
