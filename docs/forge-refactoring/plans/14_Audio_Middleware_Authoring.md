# 14. 적응형 오디오 저작·FMOD/Wwise 연동 개발 계획

## 1. 계획 요약

| 항목 | 계획 |
|---|---|
| 계획 ID / 기준일 | IMP-14 / 2026-11-24 |
| 원문 대응 | PDF 6-9쪽 오디오 저작·RTPC·룸/포털·미들웨어 |
| 우선순위 | P1 공통 audio event / P2 고급 공간 음향·vendor adapter |
| 구현 위치 | GDScript event API, EditorPlugin, 선택형 native middleware adapter |
| 선행 과제 | 03 asset 수명, 16 플랫폼 빌드, 23 addon 승인·패키지 |
| 담당 | 오디오 엔지니어 1명, 사운드 디자이너 1명, 플랫폼 QA 부분 투입 |
| 예상 공수 | 22-36 PW. Godot 기본 경로와 선택 vendor 1개 제품화 기준 |
| 구현 상태 | 계획 문서. 오디오 bank·기기·라이선스 적합성 시험 미수행 |

## 2. 목표와 범위

사운드 디자이너가 전투 강도·장소·캐릭터 상태에 따른 음악과 효과음을 코드 수정 없이 조정하도록 한다. 게임은 안정적인 event/parameter ID만 사용하고 실제 재생은 Godot native 또는 승인된 middleware provider가 담당한다.

1차는 event catalog, parameter curve, switch/state, playlist/transition, voice limit, bank 의존성, preview·validation이다. 고급 room/portal·반사음은 vendor별 capability에 따라 추가한다. 범용 DAW나 middleware 자체를 새로 제작하지 않는다.

## 3. 확인한 기존 기능

- Godot는 audio bus/effect 경로를 제공하며 `AudioStreamInteractive`는 clip과 transition table 기반의 음악 전환을 지원한다. 기본 적응형 음악까지 모두 새로 구현할 필요는 없다. [Audio buses](https://docs.godotengine.org/en/stable/tutorials/audio/audio_buses.html), [AudioStreamInteractive](https://docs.godotengine.org/en/stable/classes/class_audiostreaminteractive.html)
- FMOD의 공식 GGJ 안내는 Godot 공식 통합이 없다고 설명하면서 Utopia-Rise GDExtension을 안내한다. 이 addon을 vendor의 공식 Godot 지원으로 표시하지 않는다. [FMOD 안내](https://ggj.fmod.com/docs/Development/Godot/working-with-godot.html)
- Wwise Godot 통합 저장소는 event·RTPC·room·portal 등 기능과 Web의 experimental 상태를 명시한다. 지원 타깃은 선택 release와 우리 프로젝트에서 다시 검증한다. [통합 작성자 저장소](https://github.com/alessandrofama/wwise-godot-integration)

이하 구조·API·성능 기준은 자체 제안이다. middleware 사용권과 UGC 재배포 범위는 vendor 확인 전 확정하지 않는다.

## 4. 아키텍처

| 모듈 | 책임 | 경계 |
|---|---|---|
| AudioEventCatalog | event·parameter·switch의 안정 ID | asset 경로 변경과 gameplay API 분리 |
| AudioDirector | 상태→음악 전환·우선순위 | 게임 규칙 결과를 입력받으며 규칙을 소유하지 않음 |
| IAudioProvider | play/stop/parameter/listener/bank | native·FMOD·Wwise·Null 구현 |
| BankManager | 플랫폼별 bank hash·비동기 로드·참조 수 | 메모리/디스크 스트리밍 예산 관리 |
| AuthoringPanel | 검색·미리듣기·curve·전환표·검증 | 기존 Godot UI 또는 vendor 도구 연결 |
| SpatialAdapter | room/portal·occlusion·listener 갱신 | capability 미지원 시 단순 attenuation으로 대응 |
| AudioDiagnostics | voice·CPU·stream underrun·event trace | 게임 frame trace와 상관관계 제공 |

기본 provider는 기존 Godot bus와 interactive stream을 활용한다. middleware를 쓰는 게임은 원본 vendor 프로젝트와 생성 bank를 함께 버전 관리한다. runtime 빌드에는 사용하는 provider 바이너리와 필요한 bank만 포함한다. 두 middleware를 동시에 모든 게임에 배포하지 않는다.

## 5. 제안 API·데이터 계약

아래는 프로젝트 공통 API의 제안이며 기존 엔진 메서드명이 아니다.

```text
Audio.play(event_id, emitter_id, {event_instance_id, position, parameters})
Audio.set_parameter(emitter_id, parameter_id, value, smoothing_ms)
Audio.set_state(group_id, state_id)
Audio.stop(event_instance_id, fade_ms)
Audio.load_bank(bank_id, expected_hash) -> LoadTicket

AudioEvent = {
  stable_id, version, bank_id, spatial_mode, max_instances,
  priority, cooldown_ms, parameters[], fallback_event_id
}
```

event ID와 vendor event GUID를 변환표로 연결한다. 자동 import가 ID를 바꾸면 CI가 사용 중인 event 누락을 보고한다. parameter 값은 범위와 단위를 가진다. 예를 들어 `combat_intensity`는 0-1, `speed_mps`는 m/s이며 provider가 임의로 의미를 바꾸지 않는다.

네트워크에서는 지속 상태는 복제로, 일회성 효과는 중복 제거 가능한 event ID로 전달한다. 클라이언트 예측 사운드는 확인 시 재생하지 않고 취소/확정 처리한다. Dedicated Server는 `NullAudioProvider`를 사용하며 오디오 장치·bank를 로드하지 않는다. 서버 gameplay는 재생 성공 여부에 의존하지 않는다.

## 6. 저작·빌드 흐름

사운드 디자이너는 event를 만들고 parameter curve와 transition을 설정한 뒤 대표 장면에서 preview한다. 저장 시 schema validator가 누락 asset·loop 경계·잘못된 state 전이·과도한 voice 수를 검사한다. 변경한 bank는 플랫폼별 빌드 후 hash manifest를 생성한다.

실제 음량·품질은 hearing test와 미터링을 함께 사용한다. 자동 파형 비교는 클릭·침묵·중복 재생 등의 회귀를 찾는 데 사용하고 음질 우열을 단일 숫자로 판정하지 않는다. DSP clock과 게임 clock의 차이를 관리하며 음악 전환은 가능한 provider의 sample/beat scheduling을 사용한다.

## 7. 플랫폼 지원 프로파일

| 타깃 | 기본 경로 | 확인 항목 |
|---|---|---|
| Windows/macOS | native 또는 선택 vendor | 장치 교체·출력 지연·bank streaming |
| Android/iOS | native 또는 승인 vendor | audio focus·전화/백그라운드·Bluetooth·저메모리 |
| Web | native 검증 profile 우선 | autoplay unlock·sample/stream 모드·thread 조건 |
| Linux Dedicated | NullAudioProvider | audio 없는 환경에서도 gameplay 동일 |
| 콘솔 | 계약·SDK 확보 후 별도 profile | bank 생성·plugin 바이너리·인증 조건 |

Godot의 Web sample 재생 경로에는 effect 제한이 있으며 stream 경로는 다른 지연 특성을 갖는다. Web에서 모든 DSP/공간 음향이 동일하다고 약속하지 않는다. [공식 audio bus의 Web 주의사항](https://docs.godotengine.org/en/stable/tutorials/audio/audio_buses.html)

## 8. 작업분해와 공수

| 작업 ID | 작업 | PW | 산출물 |
|---|---|---:|---|
| AUD-01 | native/vendor 기능·지원·배포 조건 평가 | 2-3 | capability·선택 ADR |
| AUD-02 | event·parameter API·native/Null provider | 4-6 | runtime 모듈·샘플 |
| AUD-03 | 저작 UI·interactive music·validation | 5-8 | editor addon·저작 가이드 |
| AUD-04 | 선택 vendor 하나·bank·공간 음향 adapter | 5-9 | 재현 빌드·매핑·fallback |
| AUD-05 | 플랫폼 lifecycle·네트워크 event·성능 | 3-5 | 기기/서버 테스트 기록 |
| AUD-06 | content pipeline·업데이트·교육·회귀 | 3-5 | CI·기준 장면·운영 가이드 |
| 합계 | native + vendor 1개 제품화 | **22-36** | 두 번째 vendor·고급 acoustic R&D 별도 |

## 9. 완료 기준

| 시험 | 조건 | 계획용 통과 기준 |
|---|---|---|
| 저작 | 디자이너가 코드 수정 없이 10개 event·3개 music state 제작 | import→preview→release bank 흐름 완주 |
| 복제 이벤트 | packet 중복·예측·취소·replay | 동일 event_instance 중복 재생 없음 |
| 부하 | 모바일 32/64 voice, PC 128 voice 프로파일 | 각 타깃 audio CPU·메모리 예산 내, underrun 0 목표 |
| lifecycle | 중단·장치 변경·bank unload 100회 | 멈춘 voice·해제된 emitter 참조 0건 |
| 시간 | 반복 music transition 100회 | 선택 provider의 명세 beat/sample 경계 만족 |
| 패키지 | 게임별 사용 bank·provider 분석 | 미사용 vendor runtime과 bank 배포 제외 |

예산은 60초 warmup·10분 playback·5회 반복으로 결정하며 p50/p95/p99, peak memory, 출력 장치·OS·sample rate·buffer size를 기록한다. voice 수는 계획용 시험 규모이며 보장 성능이 아니다.

## 10. 위험·대안·산출물

vendor 통합의 유지보수가 중단되면 고정 버전과 자체 작은 adapter를 유지하거나 native provider로 전환한다. 공간 음향 capability가 없는 타깃은 distance attenuation·단순 occlusion으로 축소한다. 지원하지 않는 기능을 조용히 무시하지 않고 export report에 표시한다.

산출물은 event schema, provider API, native/Null 및 선택 vendor adapter, bank manifest·빌드 job, 저작 addon, platform capability 표, 사운드 디자이너 가이드, 기준 녹음·trace와 회귀 기록이다.

## 11. 출처

2026-11-24 열람: [Godot Audio buses](https://docs.godotengine.org/en/stable/tutorials/audio/audio_buses.html), [AudioStreamInteractive](https://docs.godotengine.org/en/stable/classes/class_audiostreaminteractive.html), [FMOD의 Godot 안내](https://ggj.fmod.com/docs/Development/Godot/working-with-godot.html), [FMOD GDExtension 작성자 저장소](https://github.com/utopia-rise/fmod-gdextension), [Wwise Godot 작성자 저장소](https://github.com/alessandrofama/wwise-godot-integration).
