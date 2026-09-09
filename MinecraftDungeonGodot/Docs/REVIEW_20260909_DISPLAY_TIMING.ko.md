# 표시 조건과 편집 지연 계측

## 현재 확인한 사실

이번 루프는 런타임 최적화가 아니라 비교 재현성과 측정 범위의 결함을 보강한다. 생성 v6/지형·플레이·저장 코드는 변경하지 않는다. 전체 목표는 진행 중이며 과거 좋은 단일 P95를 최종 우위의 증거로 쓰지 않는다.

`Saved/Verification/display-probe/probe.log`의 실제 Godot 출력은 활성 화면 0 한 개, 3840×2160/60Hz, usable 3840×2088, DPI 144, client 1280×720, 위치 (1280,684), Compatibility/RTX 4070이다. 이전 Win32_VideoController의 Intel 165Hz 항목을 현재 활성 화면으로 간주할 수 없다. 과거 창이 어느 화면에 있었는지도 소급해서 입증하지 못한다.

초기 `display-ab-20260909-005104-157`은 화면 0/같은 창 위치·크기, VSync ON/OFF를 순서 교대하며 경계/64청크 분산 편집 각각 3회(총 12개 새 프로세스) 실행했다. 모든 대응 workload의 최종 PNG SHA가 같고 화면/주사율/포커스 조건을 유지했다. ON에서도 유휴 viewport 신호 P95 2.337–4.960ms로 60Hz 주기와 일치하지 않았다. 앱의 VSync 설정값만으로 실제 표시 페이싱을 보장한다고 쓰지 않는다. 최종 대조에는 별도 60FPS 소프트웨어 제한과 무제한을 명시해 다시 측정한다.

## 도구 변경

`benchmark_display.gd`는 실제 화면 목록·주사율·usable rect·DPI·위치·client 크기·창 모드·엔진 FPS 상한·renderer를 기록한다. 알 수 없는 주사율 -1을 임의의 60으로 바꾸지 않는다. `--screen=N`은 해당 벤치마크 창만 1280×720으로 중앙 배치하며 OS 모니터/드라이버 설정은 변경하지 않는다. 헤드리스/잘못된 화면 번호/잘못된 FPS 제한은 생성 전 종료 코드 2로 거부한다.

초기/편집 전/후 snapshot과 각 64회 편집 뒤 가벼운 창 표본을 기록한다. 화면·위치·크기·VSync·주사율/출력 목록·포커스가 변하면 JSON/PNG를 남기되 측정은 INVALID/exit 1이다. 같은 실행의 조건 안정성이지 VSync의 실효성 증명은 아니다. 유휴 30프레임 예열과 120프레임 간격 표본은 초기 준비 시간에서 제외한다. `--max-fps=0|60`은 벤치마크 프로세스의 명시 대조 조건이며 게임의 설정/최적화로 적용하지 않는다.

`Benchmark-Display.ps1`은 화면 고정, VSync 순서 교대, 프로세스 PID/100ms OS 최대 작업 집합/전체 원시 표본/PNG SHA를 보존하고 회차 간 조건 차이를 거부한다. `Benchmark-PlaneCache.ps1`에도 같은 화면 고정·회차 간 비교를 연결했다. `Verify.ps1 -RenderComparison -BenchmarkScreen 0`은 두 렌더러를 같은 화면으로 지정한다.

## 측정 의미의 정정

기존 `edit_to_frame_*`은 편집 시작부터 `RenderingServer.frame_post_draw`까지의 CPU 경과 시간이다. 물리 화면의 scanout이나 입력→광자 지연을 직접 측정한 적이 없다. 기존 JSON 키는 소비자 호환용으로 유지하고 `edit_to_viewport_update_*`와 `timing_scope`를 추가한다. 과거 문서의 “화면 반영”을 물리 presentation 보장으로 읽으면 안 된다. 응답성 목표를 낮추거나 지연 표본을 빼지 않는다.

공식 [DisplayServer 문서](https://docs.godotengine.org/en/4.7/classes/class_displayserver.html)는 화면별 조회/배치와 알 수 없는 주사율을 정의한다. [RenderingServer 신호 문서](https://docs.godotengine.org/en/4.7/classes/class_renderingserver.html#class-renderingserver-signal-frame-post-draw)는 viewport 갱신 후 신호라고 설명한다. [4.7 RenderingServer 구현](https://raw.githubusercontent.com/godotengine/godot/4.7/servers/rendering/rendering_server_default.cpp)은 rasterizer end_frame 이후 신호를 보내지만, 이를 실제 화면 표시 완료와 같다고 추론할 근거는 없다. [Windows OpenGL 구현](https://raw.githubusercontent.com/godotengine/godot/4.7/platform/windows/gl_manager_windows_native.cpp)의 VSync 조회도 저장된 사용 상태를 반환한다. 이 소스 검토는 드라이버/컴포지터의 현재 실행 상태 진단과 다르다.

GPU readback을 사용하는 `render_latency_smoke.gd`는 청크 경계와 음수 청크에서 새 블록/삭제가 첫 관측 viewport에 실제 픽셀로 반영되는지를 따로 검증한다. 읽기 동기화 비용을 지연 표본에 섞지 않고 이 검증 역시 물리 화면 표시 보장은 아니다. 실제 presentation이 필요한 비교는 별도 OS present 추적 또는 외부 측정 근거가 필요하다.

## 남은 판정

아래의 고정 조건 반복, 명시 FPS 대조, 픽셀/기능 회귀를 완료했지만 측정 범위를 명확히 하는 것이 성능 목표 달성 자체는 아니다. 60Hz 출력의 실제 VSync 동작과 이전 약 17ms의 원인, 플레이어/HUD 포함 지연, 동일 조건 Unreal 비교 및 콘텐츠 품질은 남아 있다.

## 반복 대조 결과

명시 60FPS 상한 `display-ab-20260909-005436-092`과 상한 없는 `display-ab-20260909-005713-264`는 각각 12회, 총 24회 새 엔진 프로세스를 완료했다. 각 조건에서 경계/분산 편집을 3회씩, VSync ON/OFF 순서를 교대했다. 화면 0/60Hz·client 1280×720·위치 (1280,684)·해시 392942167/1,062,829셀·게임 조명·포커스를 유지했다. 두 대조군을 포함해 같은 작업 패턴의 모든 PNG SHA는 동일하다. OS나 드라이버 설정은 직접 변경하지 않았다.

- 상한 0/VSync ON: 경계 CPU P95 2.738–3.464ms, viewport 갱신 신호까지 16.939–17.069ms. 분산 CPU 4.283–4.831ms, viewport 16.772–16.966ms. 유휴 중앙 간격은 16.6495–16.672ms로 이번 반복에서는 60Hz 주기와 부합한다. **여섯 회 모두 16.7ms 목표 미달**이다.
- 상한 0/VSync OFF: 경계 CPU 2.873–2.954ms, viewport 5.744–6.532ms. 분산 CPU 5.210–5.277ms, viewport 8.608–8.793ms. 유휴 중앙 간격은 2.206–2.3955ms다. 낮은 지연을 ON의 안정화 성공으로 바꾸어 쓰지 않는다.
- 60FPS 상한: ON/OFF 두 작업의 viewport P95는 16.871–17.460ms이며 모두 미달이다. 유휴 중앙 간격은 약 16.6ms로 VSync OFF에서도 프레임 제한 대기가 지표에 들어간다. 생산 게임에 FPS 제한을 추가하거나 목표를 17.5ms로 바꾸지 않았다.

초기 탐색 12회는 ON에서도 짧은 유휴 간격이었지만 최종 무제한 12회는 ON/OFF에 따라 간격이 구분됐다. 화면 위치·주사율·최대 FPS가 같아도 초기 탐색과 달라진 정확한 드라이버/컴포지터 상태는 확인하지 못했다. FPS 대기가 원시 지표에 미치는 영향을 재현한 것이지 과거 모든 변동의 단일 원인을 확정한 것은 아니다.

`plane-ab-20260909-005929-429`의 고정 화면 기준/캐시 한 회차(두 작업 총 4프로세스)도 종료 코드 0/PNG 동등을 통과했다. 경계 CPU P95 7.526→3.442ms, 분산 16.676→5.351ms다. 캐시 상주량은 대응 회차에서 약 113MiB 증가했다. viewport P95는 경계 17.043→17.131ms, 분산 27.576→16.855ms로 캐시 CPU 개선을 모든 응답성 게이트 통과로 일반화하지 않는다. 한 회차 결과이며 과거 v5 3회 A/B와 구분한다.

이 도구의 ready 시간은 창 배치/초기 8프레임 이후 생성 시작부터이며 유휴 30+120프레임은 제외한다. 전체 프로세스 실행 시간은 별도 process.json에 남긴다. 변경된 예열 조건의 시간을 과거와 무조건 같은 cold-start 지표로 비교하지 않는다.

## 검증

`display-probe/display_contract_smoke.log`의 조건 검사 21개는 정상·출력/위치/크기/VSync/주사율/엔진 상한 변경·알 수 없는 주사율·표본 누락 등을 검사했다. 실제 생성 전 `invalid-screen`/`invalid-fps`와 헤드리스 요청은 예상 exit 2였다. `display-probe/pixel.log`의 실제 픽셀 검사 40개는 x=15/16/-1의 추가/삭제와 첫 관측 viewport 변경을 검증했다. 이끼 블록 PNG도 직접 확인했다.

최종 `Saved/Verification/20260909-010057-071`의 `Verify.ps1 -RenderComparison -BenchmarkScreen 0`은 종료 코드 0/47개 엔진 단계 완료다. 잘못된 게임 옵션 및 화면/FPS/헤드리스 렌더 거부 4개는 예상 exit 2이고 다른 단계는 exit 0이다. ERROR/SCRIPT ERROR/WARNING 로그는 없었다. 신규 표시 조건 21·실제 픽셀 40개, 기존 단위 48·기후 99·랜드마크 118·동굴망 1,021·저장 74·메시 502·캐시 1,005·정리 25·동등성 534개와 실제 입력/렌더 회귀가 모두 통과했다. 동굴 실제 왕복은 57/65개, 랜드마크 41/42개다. Overworld 128시드는 38.546초, Dungeon 128+경계는 2.557초였으며 서로 다른 OS 쓰기/읽기 PID 14632/81476, 45576/85008에서 두 모드 각각 1,000편집을 복원했다.

이번 전체 실행의 별도 청크 준비는 8.280초/642.02MiB, CPU 편집 P95 3.006ms/viewport 신호 6.437ms였다. 같은 GridMap은 49.509초/1,120.95MiB/viewport 28.174ms다. 내부 준비 약 83.3%·메모리 42.7% 감소이며 Unreal 비교가 아니다. 청크 유휴 중앙 간격은 다시 2.2995ms였고 GridMap은 16.1075ms였다. 화면 0/60Hz·위치·크기·VSync=1/상한0/포커스를 기록했지만 앞의 ON 반복과 달라 **단일 6.437ms를 최종 안정화로 채택하지 않는다**. 다른 workload의 유휴 비용도 다르므로 두 유휴 중앙값만으로 VSync 실효성을 판정하지 않는다.

185맵 생성 단독 세 시드 3.769–4.264초, 255 Overworld 교체 21.010초/P95 1.403ms/최대 21.838ms, controls 최대 1,159.72MiB(15,869프레임 진단 trace 포함)다. 255 Dungeon은 1.071초다. 런타임 알고리즘이 바뀌지 않았으므로 이 차이를 코드 개선으로 해석하지 않는다. 최종 청크 전경과 픽셀 검사 PNG를 직접 확인했다.

전체 검사 성공은 도구/기능 회귀 성공이며 응답성·동일 조건 Unreal 우위 게이트 완료가 아니다. 다음 조사는 엔진 포커스 외의 실제 native 창 가시성/전경 상태와 OS present 경로를 함께 기록하는 것이다. 출력 조건 고정으로 일부 혼동을 제거했지만 아직 드라이버/컴포지터 원인은 확정하지 못했다. 실제 다중 화면 이동은 현재 활성 화면이 하나라 실행하지 못했고, 변경 조건은 순수 오류 주입으로 검사했다.
