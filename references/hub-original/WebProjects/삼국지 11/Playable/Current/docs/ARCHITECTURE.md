# 동일 게임 2D / 3D 전환 구현

## 1. 단일 게임 상태

```text
도시·부대 입력 → UI → Engine(유일한 상태·난수·명령 처리)
                         │
                         ├─ 확정 상태를 읽기
                         └─ effects를 시각화
                                  │
                             ViewManager
                            /           \
                    Renderer2D       Renderer3D
                    Canvas 2D          WebGL2
                     활성 모드 한쪽만 렌더링
```

모드 전환에서는 `Engine.fresh`, `Engine.load`, 명령 실행, RNG, 턴 진행을 호출하지 않는다.
현재 엔진을 읽는 동일한 `getState` 함수만 두 렌더러에 전달한다.
전환 직전/직후 Engine 객체 동일성과 직렬화 JSON 동일성을 브라우저 검사에서 확인한다.

## 2. 캔버스와 입력

Canvas의 context 모드를 교체하지 않고 전용 캔버스 두 장을 사용한다.
`#world`는 UI 이벤트가 연결된 투명한 입력 전용 캔버스로 유지한다.
`#world-2d` / `#world-3d` 중 활성 캔버스만 표시하고 그 위에 3D 텍스트 레이어를 둔다.
따라서 전환마다 포인터 핸들러를 재등록하지 않으며 캔버스 교체로 선택·입력을 잃지 않는다.
전환 도중 진행 중인 드래그는 capture를 해제하며, 전술 명령과 선택 대상은 유지한다.

참고 API 문서:
- https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext
- https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event

## 3. 카메라 환산

2D의 헥스 반지름은 22, 패딩은 45이다. 3D 반지름은 2.65이며 패딩은 없다.
공통 중심은 헥스 반지름 단위의 평면 좌표로 보관한다.

```text
2D 중심 → 공통: ((x - 45) / 22, (y - 45) / 22)
3D 중심 → 공통: (x / 2.65, z / 2.65)
2D 화면 크기: zoom × 22
3D 화면 크기: viewportHeight × zoom × 2.65 / (92 × tan(0.35))
```

3D 카메라의 yaw/pitch는 해당 렌더러 내부에 유지한다.
모드 변경 시 중심과 화면 크기만 환산하여 북쪽 고정 2D와 자유 회전 3D의 차이를 보존한다.
최소/최대 줌 범위는 2D 0.04–8, 3D 0.065–4.8이다.
극한 줌에서 클램프될 수 있으며 화면 픽셀의 일치까지 보장하지 않는다.

## 4. 연출과 게임 판정의 분리

현재 selection/mode/reach/grid, effects, moves, headings, unitCache를 새 활성 렌더러에 전달한다.
연출의 `time`과 `duration`을 그대로 보존하여 피해 판정을 재실행하거나 애니메이션을 처음부터 반복하지 않는다.
2D 렌더러도 `battle` 이벤트를 `at` 좌표가 있는 일반 텍스트 이벤트와 구분해 처리한다.
이동은 두 모드 모두 확정된 경로의 헥스들을 순서대로 보간한다.

## 5. 생명주기·성능

`setActive(false)`는 requestAnimationFrame 예약을 취소하고 캔버스·오버레이를 감춘다.
`setActive(true)`는 실제 화면 크기를 복구하고 루프 하나만 시작한다.
렌더러 인스턴스는 캐시하므로 전환할 때마다 지형·WebGL context를 새로 만들지 않는다.
비활성 상태에서도 빠른 재전환을 위한 자원은 보관한다.

`dispose()`는 observer·프레임·캔버스·GPU buffer/VAO/program/texture/framebuffer를 해제한다.
GPU 연결 중단 또는 3D 그리기 오류 시 현재 상태를 보존해 2D로 넘기고 실패한 3D 자원을 해제한다.
이 상태에서는 3D 재시도가 반복되지 않도록 버튼을 비활성화한다. JSON 저장 후 재시작하면 새로 확인한다.
3D context가 복구될 때 같은 자원들을 재업로드하는 자동 복원은 구현하지 않았다.

## 6. 저장 호환

게임 schema와 Engine 직렬화는 수정하지 않았다. 모드와 품질은 게임 JSON에 섞지 않는다.
View preference 키: `rtk11-view-preferences-v3`.
Game save 키: `rtk11-web-v2-3d-save` (v2와 공통).
브라우저 저장이 실패해도 화면 전환과 JSON 내보내기는 동작한다.

## 7. 검증

Node 카메라 테스트: 화면 크기별 왕복 변환·잘못된 값 거절·줌 경계·100회 왕복 오차.
브라우저 테스트: 동일 Engine/JSON 유지·선택/전법/격자·같은 시드의 결과 일치·40회 반복 전환·
실제 캔버스 이동/공격·진행 중 연출·AI 턴·v1/v2 저장·다운로드·모바일·GPU 실패·자원 해제.
검증 환경과 한계는 `TEST_REPORT.md`를 따른다.


기존 3D 지형·모델·셰이더 구조는 `v2_archive/ARCHITECTURE.md`에 보존했습니다.
