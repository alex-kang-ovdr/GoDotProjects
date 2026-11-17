# v3 검증 결과 — 2D / 3D 동일 게임 전환

검증 일자: 2026-11-16. 대상: 이 패키지의 최종 `PLAY.html`과 소스.

## 결과

| 구분 | 통과 | 결과 파일 |
|---|---:|---|
| 엔진·서버·카메라 좌표 | 92 / 92 | `tests/results/node-v3.txt` |
| 모드 전환·저장·GPU 실패·모바일 | 54 / 54 | `tests/results/browser-dualmode-report.json` |
| 기존 3D UI·내정·전투 회귀 | 31 / 31 | `tests/results/browser-3d-report.json` |
| 3D 효과·품질·GPU 오류 검사 | 8 / 8 | `tests/results/render-effects-report.json` |
| **합계** | **185 / 185** | 미통과 0 |

모든 브라우저 시나리오에서 uncaught JavaScript exception은 0건입니다.
테스트 파일 안의 `check()` 검증 항목과 Node test 항목을 합산했습니다.

## 핵심 확인

1. 2D는 CanvasRenderingContext2D, 3D는 WebGL2RenderingContext를 실제 사용합니다.
2. 전환 전후 Engine 객체 동일성과 게임 JSON 문자열 완전 일치를 확인했습니다.
3. 같은 시드·같은 공격 명령을 두 모드에서 실행한 결과 JSON이 일치했습니다.
4. 선택·현재 전법·격자·카메라 중심과 3D 회전·기울기를 유지했습니다.
5. 40회 반복 전환 후 렌더러 2개와 라벨 캔버스 1개만 존재했습니다.
6. 3D가 비활성일 때 requestAnimationFrame 예약이 0이고 drawCount가 증가하지 않았습니다.
7. 실제 2D·3D 캔버스 클릭 공격, 2D 이동, 두 모드 AI 턴을 실행했습니다.
8. 진행 중 이동·공격 효과를 넘길 때 time을 유지하고 게임 판정을 중복하지 않았습니다.
9. 2D 전체 보기에서 확장된 42개 도시가 화면 안에 들어왔습니다.
10. v1 JSON 변환, v2 JSON 왕복, 브라우저 다운로드 파일의 동일성을 검사했습니다.
11. 390×844 화면에서 버튼 노출·전환·가로 넘침을 검사했습니다.
12. WEBGL_lose_context로 실제 GPU context loss를 발생시킨 후 2D로 계속했고 게임 JSON은 유지됐습니다.
13. WebGL 생성 실패를 주입한 시작 상황에서도 2D 시작과 AI 턴이 동작했습니다.
14. 선호 2D 시작에서는 WebGL을 생성하지 않았고, 3D 선택 시에만 생성했습니다.

## 원본 규칙 유지

v2 ZIP과 비교하여 다음 파일의 바이트가 완전히 동일합니다.

```text
js/engine.js
SHA-256 b2b4636423e5ba07b791d498c5dbfee9736461da86d3f485930b4d271645d75d

data/game-data.json
SHA-256 270590dc9a8b605372fdcc97f25a1ecadeb7f0e5824c3f5af676de8e35de7705
```

이는 화면 전환 과정의 상태 보존 확인이며 원작 삼국지 11과의 규칙 일치를 증명하는 것은 아닙니다.

## 환경과 검증 한계

- Node.js 22.16.0; Linux Chromium 144, Xvfb, SwiftShader 소프트웨어 WebGL2.
- 최종 단일 HTML을 Playwright `set_content()`로 주입하고 네트워크를 offline으로 둔 상태에서 검사했습니다.
- 직접 `file://` 탐색은 환경의 관리자 정책으로 차단되어 검사하지 못했습니다. 정책을 변경하지 않았습니다.
- 물리 GPU·Windows·Edge·Safari·실제 휴대폰·IIS 배포는 검사하지 않았으며 성능 수치를 보장하지 않습니다.
- 선호 모드 재실행 복구는 **메모리 Storage double**을 사용해 저장/복구 로직을 검사했습니다.
  이 환경에서 실제 브라우저 디스크 저장소의 장기 유지나 파일 위치 변경 시 접근성까지 검증한 것은 아닙니다.
- 이번 검사는 기능 회귀이며 원작 전체 재현·장기간 모든 시나리오·모든 드라이버의 무오류 보증이 아닙니다.

## 재실행

```sh
npm run build
npm test
xvfb-run -a python tests/browser_dualmode.py
xvfb-run -a python tests/browser_3d.py
xvfb-run -a python tests/render_effects.py
```

Playwright와 Chromium은 개발 검사 용도입니다. 일반 게임 실행에는 필요하지 않습니다.

## 실제 실행 화면

`tests/artifacts/dual-gameplay-2d.png`와 `dual-gameplay-3d.png`는 같은 게임 상태의 서로 다른 화면입니다.
`dual-full-map-2d.png`는 전체 지도, `dual-mobile-2d.png`는 모바일 크기 레이아웃입니다.
이미지 생성 모델의 결과물이 아니라 실행 중인 브라우저의 캡처입니다.
