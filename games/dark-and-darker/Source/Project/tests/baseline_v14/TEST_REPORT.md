# v14 실행 검증 보고서

## 결과

| 검사 | 결과 | 원본 결과 파일 |
|---|---:|---|
| JavaScript 구문 | 6 / 6 | syntax_results.json |
| 공통 로직·시뮬레이션 | 55 / 55 | core_results.json |
| WebGL·UI 통합 | 21 / 21 | browser_results.json |
| 실제 마우스·키보드 | 10 / 10 | input_results.json |
| v14 그래픽 파이프라인 | 26 / 26 | graphics_results.json |

**총 112개 동작 검사 통과.** 구문 검사는 별도다. 300개 던전 연결성 시드와 100개 스폰 검사는 공통 검사 안에 포함되며 중복 합산하지 않는다.

## 원본 규칙 보존

`src/core.js`, `src/game.js`는 v13 ZIP 내부 소스와 바이트 단위 일치한다.
해시 증거는 `simulation_preservation.json`에 있다. 따라서 이번 변경을 원작 데이터 R1의 게임 적용으로 해석하면 안 된다.

## 브라우저 조건

Chromium 144.0.7559.96, Playwright, Xvfb, SwiftShader 소프트웨어 WebGL.
완성된 단일 `index.html`을 사용했다. 초기 `file://` 탐색은 환경 정책에서 `ERR_BLOCKED_BY_ADMINISTRATOR`로 차단되어 HTML을 `about:blank`에 `page.set_content`로 주입했다.
브라우저 정책을 수정하거나 우회하지 않았다. 실제 WebGL 셰이더·텍스처·프레임버퍼·DOM·입력을 사용했다.
통합 테스트는 1440×900, 입력은 1024×700, 그래픽 검사는 1280×800을 사용하며 일부 픽셀 비교에서는 렌더 스케일을 낮췄다.
재현이 필요한 전투·정산 구간은 고정 간격 수동 전진을 사용했다.

## 그래픽에서 실제로 검사한 내용

- 내장 아틀라스 두 장 디코딩과 초기 정상 화면.
- 아치·벽 부조가 있는 정적 메시.
- 그림자 / 장면 / 블러 프레임버퍼 완전성.
- 그림자 on/off가 실제 픽셀을 변경함.
- 노멀 매핑 on/off가 실제 픽셀을 변경함.
- 발광 on/off가 실제 픽셀을 변경함.
- 노출 증가에 따라 실제 화면 평균 밝기가 증가함.
- 성능 설정 3드로우, 균형 설정 7드로우, 고품질 2048 그림자 맵.
- 렌더링 설정 변경 전후 게임 스냅샷 동일.
- 해상도 변경 및 재할당 후 WebGL 오류 없음.
- 설정 UI의 프리셋·밝기·그림자·발광 작동.
- F2로 HUD를 숨겨도 시간이 멈추지 않으며 디버그 패널이 함께 열리지 않음.
- 새 출전 시 HUD 숨김 초기화.
- 몬스터 네 종류의 생존/사망 자세와 근접 무기 세 종류: 유한한 메시 값.
- 보스·화염구·타격 효과의 실제 렌더링.
- 최종 실행의 JavaScript/WebGL 오류 보고 0건, 외부 HTTP 요청 0건.

## 수치의 의미

픽셀 차이는 특정 고정 QA 장면에서의 평균 절대 RGB 차이다. 효과 경로가 실제 작동하는지 확인하는 검사이며 시각적 품질 점수나 플레이어 만족도 지표가 아니다.
성능 측정에 소프트웨어 GPU를 사용했으므로 사용자 PC FPS를 추정하지 않는다.

## 검증하지 않은 것

- 관리 정책이 없는 사용자 PC에서 `file://`로 직접 여는 동작.
- 파일 출처별 영구 localStorage 유지·이전 경로와 저장 공유.
- 실제 하드웨어 GPU / 모든 브라우저 / 모바일 터치 조작.
- 전체 매치를 사람이 반복 플레이한 재미·장기 안정성 인증.
- 실시간 GI / 모든 점광원의 그림자 / 완전한 삼각형 물리 / 온라인 PvP.

## 스크린샷

`docs/menu.png`, `gameplay.png`, `inventory.png`, `combat.png`, `combat_detail.png`, `boss_magic.png`, `settings.png`는 제공 HTML을 실행해 캡처했다.
`combat_detail.png`와 `boss_magic.png`는 재현을 위해 테스트 인터페이스로 적 위치·체력·시간을 지정한 QA 장면이다. 별도의 합성 컨셉 이미지가 아니다.
`docs/materials.png`는 재질 생성 도구가 만든 원본 아틀라스다.

## 재실행

```sh
python build.py
node tests/test_core.cjs
DISPLAY=:99 python tests/test_browser.py
DISPLAY=:99 python tests/test_input.py
DISPLAY=:99 python tests/test_graphics.py
```

브라우저 테스트를 다시 실행하려면 Chromium, Playwright와 표시 환경이 필요하다. 게임 실행에는 필요하지 않다.
