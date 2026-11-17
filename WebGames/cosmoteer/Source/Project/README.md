# Cosmoteer 산출물 통합 패키지 — STARFORGE v3

패키지 정리일: 2026-11-16  
실행판: STARFORGE 3.0.0 / 2026-11-14 배포판  
소스 커밋: `f90387acd3f7ca25a8285423f235352dd47d07e4`

## 바로 실행

1. ZIP 파일을 전체 압축 해제합니다.
2. `Cosmoteer/index.html`을 Chrome 또는 Edge 등 최신 브라우저로 엽니다.
3. 도크에서 함선을 조립하고 **작전 선택**으로 출격합니다.

`index.html`은 CSS와 JavaScript가 모두 포함된 단일 실행 파일입니다. 패키지 설치나 웹 서버 없이 실행할 수 있습니다. 브라우저가 로컬 파일의 자동 저장을 제한하면 게임 메뉴의 **저장 파일 내보내기**로 원정을 보관하세요.

웹 실행: https://starforge-drydock-887a.taru00.chatgpt.site/  
웹판은 기존 설정에 따라 ChatGPT 로그인이 필요합니다.

## 폴더 구성

| 경로 | 내용 |
| --- | --- |
| `index.html` | 바로 실행하는 최종 v3 게임 |
| `source/` | 전체 JavaScript 소스, 테스트, 저장 호환성 표본, 문서 |
| `source/dist/index.html` | 개발용 다중 파일 실행 진입점 |
| `source/docs/systems/` | v3 화재·현장 정비, 기술·자재 경제, 저장·이관 문서 3개 |
| `source/docs/VERIFICATION.md` | 55개 자동 검사 및 브라우저 검증 기록 |
| `reverse_design/` | 기존 Cosmoteer 역기획 Markdown 25개 |

원작 시스템 분석의 범위·출처는 [역기획서 목차](reverse_design/README.md)를 확인하세요. 웹게임의 현재 구현 범위와 조작법은 [소스 README](source/README.md), 변경 사항은 [CHANGELOG](source/CHANGELOG.md)에 있습니다.

## 핵심 조작

| 입력 | 기능 |
| --- | --- |
| 부품 선택 후 빈 격자 클릭 | 부품 배치 |
| M / R / V | 대칭 / 회전 / 선택 부품 복제 |
| Ctrl+Z / Ctrl+Shift+Z | 조립 되돌리기 / 다시 적용 |
| 적 부품 클릭 / 빈 전장 클릭 | 공격 표적 지정 / 이동 명령 |
| Space / 1·2·3 | 일시정지 / 배속 |
| U | 도크 기술 개량·정비 자재 보급 |
| 아군 부품 선택 후 G | 우선 정비 지정·해제 |
| C / F | 표시 모드 전환 / 화면 맞춤 |

모바일에서는 화면 버튼으로 핵심 기능을 사용할 수 있습니다.

## 소스 작업과 검증

`source/` 폴더에서 Node.js로 자동 검사를 실행합니다.

```sh
npm test
```

단일 HTML을 다시 생성하려면 같은 폴더에서 실행합니다.

```sh
node scripts/export-offline.cjs
```

기본 출력은 `source/exports/starforge.html`입니다. 이번 패키지는 기존 최종 산출물을 그대로 통합했으며 게임 동작을 추가 변경하지 않았습니다. 기존 v3 검증은 55개 통과이고, 이번 정리에서는 ZIP 무결성과 포함 파일의 원본 일치를 확인했습니다.

## 구현 범위

STARFORGE는 Cosmoteer의 함선 제작·승무원 물류·부품별 전투에서 영감을 받은 독자적인 웹게임입니다. 단일 함선·3구역 싱글플레이 원정, 조립·전투·소화·수리·보상·개량·저장을 지원합니다. 대규모 성계 탐험, 채굴·무역, 복수 함대와 멀티플레이는 포함하지 않습니다. 기존 역기획서는 원작 분석이며, 웹게임 구현 문서와 구분해 제공합니다.
