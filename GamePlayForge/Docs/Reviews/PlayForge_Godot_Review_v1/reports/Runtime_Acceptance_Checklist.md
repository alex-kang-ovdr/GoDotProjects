# Runtime 수락 시험 체크리스트

**전체 상태: 미실시.** 이 체크리스트는 앞으로 수행할 Godot/PlayForge 통합 시험이며, 문서 ZIP 검증 통과를 런타임 통과로 바꾸지 않습니다.


## GATE-0

| ID | 시험 | 통과 조건 | 상태 |
|---|---|---|---|
| T001 | 엔진·템플릿·확장 버전 고정 | 버전·commit·precision·API·target hash 누락 시 빌드 후보 거부 | 미실시 |
| T002 | E3 patch 검사 | upstream 수정이 있으면 예외 승인 없이는 실패 | 미실시 |
| T003 | 서드파티 고지 | 실제 배포 모듈의 LICENSE·NOTICE 목록 완전 | 미실시 |
| T004 | SDK 권한 확인 | Havok/EOS target별 승인 범위 불명확 시 공개 배포 불가 | 미실시 |

## GATE-1

| ID | 시험 | 통과 조건 | 상태 |
|---|---|---|---|
| T005 | Lua 5.4 실제 Web 실행 | 게임 규칙이 Lua에서 실행되고 JS는 입력·표현만 담당 | 미실시 |
| T006 | Windows와 Web 동일 규칙 | 입력 시나리오별 상태 전이가 허용 오차 내 일치 | 미실시 |
| T007 | Chrome/Firefox/Safari 브라우저 조합 | target별 지원·실패 조건이 보고됨 | 미실시 |
| T008 | Thread/Extension 보안 헤더 | 지원 조합에서만 로드, 실패 시 설명 제공 | 미실시 |
| T009 | Lua stale object handle | 삭제 후 접근이 안전 오류로 처리 | 미실시 |
| T010 | Lua 무한 루프·과다 할당 | 작업/프로세스 예산으로 중단, 다른 프로젝트 무영향 | 미실시 |
| T011 | Native 장시간 호출 | Lua hook 외 watchdog이 제어하고 실패 기록 | 미실시 |
| T012 | 권한 없는 API 접근 | OS/JS eval/파일/네트워크 secret 접근 거부 | 미실시 |

## GATE-2

| ID | 시험 | 통과 조건 | 상태 |
|---|---|---|---|
| T013 | 2D·3D 범용 Scene 편집 | 게임 전용 분기 없이 두 예제 동작 | 미실시 |
| T014 | 동일 타입 Component 복수 생성 | 서로 다른 GUID로 독립 편집 | 미실시 |
| T015 | 명시적 동일 값 Override | 부모 기본값 변경 시 override 값 보존 | 미실시 |
| T016 | Variant/구조 Override | 부모 변경과 추가·삭제 tombstone 일관 | 미실시 |
| T017 | Rename/Reparent | 영구 ID와 참조 유지 | 미실시 |
| T018 | PackedScene owner 누락 | 저장 누락을 검출하거나 올바르게 생성 | 미실시 |
| T019 | 좌표 1m/축/앞면 | 축·winding·ray·camera fixture 통과 | 미실시 |
| T020 | 2D PPU/중력 변환 | legacy pixel과 meter 혼용 없음 | 미실시 |
| T021 | Skin/root motion/joint | bind와 animation·physics 방향 일치 | 미실시 |

## GATE-3

| ID | 시험 | 통과 조건 | 상태 |
|---|---|---|---|
| T022 | 두 브라우저 동시 독립 속성 편집 | 양쪽 source/runtime 동기화 | 미실시 |
| T023 | 동일 Property 충돌 | 다른 사용자 수정 보존, 조건부 거부 | 미실시 |
| T024 | 재전송 멱등성 | 중복 Actor·Op·사용량 없음 | 미실시 |
| T025 | Undo/Redo 후속 변경 | 다른 사용자의 새 값 덮어쓰기 없음 | 미실시 |
| T026 | Snapshot 복원 epoch | 과거 명령/결과 차단, 초안 보존 | 미실시 |
| T027 | 오프라인 재접속 | 확정 변경 누락 없음, 로컬 초안 표시 | 미실시 |
| T028 | AI 수정·검증 snapshot 연결 | 테스트한 버전과 기여 변경 구분 | 미실시 |
| T029 | 외부 AI token 미확인 | null 처리, 비용 우위 비교 제외 | 미실시 |
| T030 | 데이터 활용 철회 | 후속 선택적 재사용 차단, 원래 편집은 유지 | 미실시 |

## GATE-4

| ID | 시험 | 통과 조건 | 상태 |
|---|---|---|---|
| T031 | Dedicated 1+2 Client | 실제 transport로 spawn/state/RPC 검증 | 미실시 |
| T032 | Listen Host 직접 입력 | 별도 Client World/Loopback 생성 없음 | 미실시 |
| T033 | 초기 필수 객체 일부 누락 | 게임플레이 시작 차단 | 미실시 |
| T034 | 중복/역순 Initial Delta | ID+Generation+Revision 기준 일치 | 미실시 |
| T035 | 필수 객체 초기화 중 Destroy | tombstone 반영 후 일관된 barrier | 미실시 |
| T036 | Collision 미준비 | Ready/input/prediction 차단 | 미실시 |
| T037 | 고해상도 Mip 미준비 | 다른 조건 충족 시 플레이 가능 | 미실시 |
| T038 | Ready 이전 공격 요청 | 서버 거부 | 미실시 |
| T039 | 장거리 Teleport/Cell 경계 | 주변 충돌 준비·safe spawn 후 이동 | 미실시 |
| T040 | Teleport 타임아웃·취소 | 기존 위치 유지, pin 정리 | 미실시 |
| T041 | 이전 Teleport epoch 패킷 | 신규 상태 덮어쓰기 없음 | 미실시 |
| T042 | Room shared resource 오염 | 다른 Room 상태 변경 없음 | 미실시 |
| T043 | 프로세스 장애 영향 | 설정한 격리 경계 밖 세션 유지 | 미실시 |

## GATE-5

| ID | 시험 | 통과 조건 | 상태 |
|---|---|---|---|
| T044 | DX12/Vulkan 2D·3D 화면 | 명시한 capability 범위의 기능·화면 통과 | 미실시 |
| T045 | Android 발열·메모리 | 고정 시나리오 장시간 P99·memory 수집 | 미실시 |
| T046 | iOS 빌드·서명·실기기 | 클라우드 빌드 후 실제 기기 실행 | 미실시 |
| T047 | Ortho/Perspective 카메라 | 투영·aspect·picking·depth 검증 | 미실시 |
| T048 | 정렬/그룹/투명 겹침 | 지원한 의미와 미지원 오류 일치 | 미실시 |
| T049 | Debug View 격리 | 공유 Material·다른 View를 수정하지 않음 | 미실시 |
| T050 | 실제 패키지 용량 | 50/100 MB 정책 대비 항목별 실측 | 미실시 |
| T051 | runtime Asset HTTP 차단 | 시작 후 에셋 다운로드 없음, 게임 네트워크는 별도 허용 | 미실시 |
| T052 | Headless 시각 리소스 제거 | 서버용 package·메모리·GPU 미초기화 확인 | 미실시 |

## GATE-6

| ID | 시험 | 통과 조건 | 상태 |
|---|---|---|---|
| T053 | Havok·Box2D 계약 | Query·Joint·Sleep·CCD·이벤트 검증 | 미실시 |
| T054 | backend 전환 요청 | 실행 중 전환 거부, 재시작 안내 | 미실시 |
| T055 | Mip VRAM 실제 반환 | 단순 LOD sampling과 구별, peak/fence 확인 | 미실시 |
| T056 | Cell 경계 왕복·취소 | thrashing·stale completion·pin 누수 없음 | 미실시 |
| T057 | 악성 Asset/Scene/Shader | 격리 worker에서 제한되고 credential 무노출 | 미실시 |
| T058 | iframe 메시지 위조 | origin/source/nonce/schema 검사 실패 | 미실시 |
| T059 | 임의 Native Plugin 업로드 | 실행·패키징 거부 | 미실시 |

## GATE-7

| ID | 시험 | 통과 조건 | 상태 |
|---|---|---|---|
| T060 | Clean/Incremental build 비교 | 동일 입력 결과 동등, miss 이유 기록 | 미실시 |
| T061 | Engine minor upgrade | API·Physics·Render·Save·Network 회귀 통과 | 미실시 |
| T062 | Release rollback | 이전 source/runtime 복원, Save 호환 별도 검증 | 미실시 |
| T063 | Unity MCP 동등 조건 비교 | 모델·도구·자산·시간·실패·token 근거 고정 | 미실시 |
| T064 | 미공개 과제·평가기 보호 | Agent가 정답·policy·기준 변경 불가 | 미실시 |
