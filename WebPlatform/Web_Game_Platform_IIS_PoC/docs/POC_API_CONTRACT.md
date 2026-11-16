# IIS PoC API 계약

이 문서는 실제 PoC 백엔드와 사용자·관리자 UI 사이의 계약이다. public API는 기본 8090, admin API는 loopback 8091이며, 두 listener는 서로의 전용 경로를 제공하지 않는다. JSON 요청에는 `Content-Type: application/json`을 사용한다. 브라우저 fetch는 `credentials: 'include'`가 필요하다. 변경 요청은 해당 listener에서 받은 `X-CSRF-Token`과 허용된 `Origin`이 필수다.

양쪽 세션 cookie는 서로 다른 이름, `HttpOnly; SameSite=Lax; Path=/api`를 사용하며 로그아웃도 동일한 Path로 삭제한다. `/games/`와 사이트 정적 자산에는 이 cookie를 보내지 않는다. Cookie Path는 권한 경계 자체가 아니므로 서버는 listener·session kind·Origin·CSRF도 각각 검사한다.

## 세션과 사용자 API

| Method 경로 | 요청 | 응답 |
|---|---|---|
| GET /api/health | 없음 | `{ok:true,service:'public' 또는 'admin',version:'0.2.0'}` |
| GET /api/session | 없음 | `{kind:'anonymous'|'guest'|'registered',csrfToken,displayName,googleEnabled,pendingMerge:null 또는 객체,trafficType:'live'|'qa',qaRunId:null 또는 UUID}`. 익명 수집 session을 cookie로 만들지만 users 행은 생성하지 않음 |
| POST /api/qa/session | 새 익명 public session의 CSRF + `{}` | QA 준비 세션을 새 cookie·CSRF로 회전하여 201과 같은 profile 반환. 이미 QA anonymous이면 200. guest/회원은 409 `QA_REQUIRES_FRESH_SESSION` |
| GET /api/games | 없음 | `{games:[{id,title,description,genre,tags,instructions,enabled,entryUrl,coverUrl,buildId,controls,orientation,saveSchemaVersion}]}`. 공개 활성 게임만 |
| GET /api/games/:id | 없음 | 같은 game 객체. 없거나 비활성은 404 |
| POST /api/play-sessions | `{gameId}` | `{id,gameId,entryUrl,kind,saveSchemaVersion}`. 익명 session을 guest로 승격. UI는 Game iframe에 cookie/CSRF를 주지 않고 broker 사용 |
| GET /api/saves/:gameId?slot=main | 기존 public session | `{slot,schemaVersion,revision,payload,updatedAt}` + `ETag: "r1"`. 없으면 404 |
| PUT /api/saves/:gameId?slot=main | `{payload,schemaVersion:1}`와 기존 `If-Match: "rN"` 또는 최초 `If-None-Match: *`; `Idempotency-Key` 권장 | 같은 save 객체. 조건 충돌 412. payload 최대 256KiB |
| GET /api/saves/:gameId/slots | 본인 public session; `X-CSRF-Token` 권장 | 슬롯과 복구 가능한 백업의 metadata 목록. 저장 payload는 포함하지 않음 |
| POST /api/saves/:gameId/restore | 아래 복구 body + CSRF + `Idempotency-Key` 필수 | 이전 main 백업 후 revision을 증가시킨 save 객체 + 복구 정보, `ETag`. stale revision은 412 |
| DELETE /api/saves/:gameId?slot=보관슬롯 | CSRF + 현재 슬롯 `If-Match: "rN"` | `{ok:true,deletedSlot,previousBackupId}`. main 삭제는 403, 조건 누락 428, stale 412. 제거한 원본은 복구 백업 보존 |
| POST /api/events | 아래 이벤트 batch | `{accepted:[event_id],duplicates:[event_id],rejected:[{event_id,code}]}` |
| GET /api/auth/google/start?returnTo=/ | 브라우저 이동. userOrigins에 속하는 절대 returnTo도 허용 | 실제 Google authorization endpoint로 302. 미설정은 503 `GOOGLE_DISABLED`. UI·현재 API·callback의 hostname이 다르면 `GOOGLE_ORIGIN_UNSUPPORTED` |
| GET /api/auth/google/callback | OAuth code/state | 검증 뒤 사용자 사이트로 302. 가짜 로그인 없음 |
| POST /api/auth/merge | `{mergeId,consent:true,linkAnalyticsHistory:false,choices:[{gameId,slot,action:'keep_account'|'keep_guest'|'copy_guest',expectedTargetRevision}]}` | `{ok:true,status:'completed'}`. 미선택 충돌은 409와 conflicts 배열. 원본은 backup 보존 |
| POST /api/auth/logout | `{}` | `{ok:true}`. cookie·session·연결된 play session 폐기. UI는 iframe/메모리도 정리 |

session의 `pendingMerge`는 `{id,sourceSaveCount,conflicts:[{gameId,slot,sourceRevision,targetRevision}]}`다. source guest와 target 계정은 서버가 OAuth 시도와 연결하며 임의 사용자 ID를 받지 않는다.

### 게스트 식별자와 세션 수명

새 anonymous 방문 세션은 90일이고 첫 플레이에서 guest로 승격할 때 승격 시각부터 다시 90일을 부여한다. **아직 유효한 guest 세션으로 `GET /api/session`에 재방문하면 그 시각부터 90일 idle 만료로 갱신**하며 서버 `expires_at`과 cookie `Max-Age=7776000`을 함께 맞춘다. 이 갱신은 기존 cookie 값·CSRF·게스트 principal·분석 subject를 바꾸지 않아 저장과 D30 코호트 연결을 유지한다. 이전 버전의 30일 guest 세션도 아직 만료되지 않았다면 같은 경로에서 90일로 갱신된다. anonymous 상태에서는 최초 발급 90일이며, 첫 guest 승격 전의 단순 조회만으로 계속 연장하지 않는다.

Google registered 세션은 로그인 시점부터 30일(`Max-Age=2592000`)이며 guest idle 갱신을 적용하지 않는다. 관리자 인증 세션은 기존 8시간(`Max-Age=28800`), 로그인 전 관리자 임시 세션은 10분이다. QA의 anonymous/guest도 일반 게스트와 같은 기간을 사용하지만 실제 지표와 계정 권한은 별도로 분리한다.

서버 만료 시각 이상인 세션은 갱신하지 않는다. 만료되거나 로그아웃으로 폐기된 cookie로는 기존 주체의 저장·플레이 API를 사용할 수 없고, 이후 session 조회는 새 anonymous 세션을 만든다. 첫 승격도 body 처리 후 세션이 여전히 유효한지 다시 확인하여 이미 폐기된 요청이 게스트를 되살리지 못하게 한다. cookie 삭제·브라우저 데이터 제거·90일 미방문·로그아웃 뒤의 게스트 기록 자동 재연결을 보장하는 정책은 아니며, DB 복구 작업이 폐기한 인증 세션도 이 갱신으로 복원되지 않는다.

### QA 트래픽과 실제 이용 분리

자동 검사 도구는 **새 cookie jar/browser context에서** `GET /api/session → POST /api/qa/session {}` 순서로 준비한 뒤 페이지를 열거나 이벤트·게임·저장 API를 사용한다. POST는 첫 GET의 CSRF를 보내야 하며, 응답으로 회전한 cookie·CSRF를 이후 요청에 사용한다. 이 기능은 관리자 인증이나 일반 저장 권한을 부여하지 않는다. 첫 플레이에서 정상 게스트 승격을 거치고 소유권·CSRF·Origin·revision 제한도 동일하게 적용한다.

서버가 `traffic_type`과 `qa_run_id`를 세션, 실행 세션, 이벤트, 실행 오류에 기록한다. raw event의 임의 `is_test`·`traffic_type`·`qa_run_id`로 지표 소속을 바꿀 수 없다. 이벤트 속성의 테스트 메모도 분류 근거로 신뢰하지 않는다. 로그아웃하거나 session이 만료되어도 이미 기록된 QA 분류는 남는다. QA 준비 세션에는 Google 연결을 제공하지 않으며 직접 호출도 `403 QA_GOOGLE_DISABLED`로 거부한다. QA 게스트의 저장은 실제 계정과 병합되지 않는다.

`qaRunId`는 계정·관리자 인증 토큰이 아니다. 관리자 지표에서 한 검사 실행을 필터링하는 서버 식별자이며, 이것만으로 다른 사용자의 저장이나 QA 지표에 접근할 수 없다. QA로 전환하기 전에 해당 방문이 이미 보낸 일반 노출 이벤트는 소급 변경하지 않는다. 기존 버전에서 QA 표시 없이 수집된 과거 행도 자동으로 판별할 수 없어 `live`로 유지한다. 새 검사 도구는 첫 이벤트 전에 QA 세션을 준비해야 한다.

### 저장 목록·충돌·복구

일반 저장 GET과 목록 GET에 `X-CSRF-Token`을 보내면 현재 cookie 세션의 CSRF와 비교한다. 다른 탭의 로그인·로그아웃으로 cookie가 바뀐 상태에서 이전 탭이 오래된 CSRF를 보내면 `403 CSRF_INVALID`가 되어 새 계정의 저장을 잘못 읽지 않는다. 기존 HTTP 도구의 무헤더 GET은 유지하지만, 사용자 UI는 헤더를 붙이고 신원 변경이 감지되면 실행 iframe을 정리한 뒤 session을 다시 확인한다.

목록 응답은 다음 구조다.

```json
{
  "gameId": "slide-puzzle",
  "mainRevision": 3,
  "slotLimit": 10,
  "slots": [
    {"slot":"main","schemaVersion":1,"revision":3,"updatedAt":"2026-11-16T03:00:00.000Z","reason":"main"},
    {"slot":"recovery-tab","schemaVersion":1,"revision":1,"updatedAt":"2026-11-16T02:59:00.000Z","reason":"additional_slot"}
  ],
  "backups": [
    {"id":"서버가 발급한 백업 UUID","sourceSlot":"main","schemaVersion":1,"revision":2,"createdAt":"2026-11-16T03:00:00.000Z","reason":"restore_previous","source":"account"}
  ]
}
```

슬롯 `reason`은 `main`, `merge_guest_copy`, `additional_slot`이다. 백업 `reason`은 `merge_conflict`, `restore_previous`, `slot_deleted`이며 `source`는 현재 주체가 소유한 원본이면 `account`, 완료한 명시적 병합의 이전 게스트 원본이면 `guest`다. 여기서 `account`는 현재 소유 주체라는 의미로 일반 게스트도 포함한다. 목록은 본인 자료와 본인이 명시 병합을 완료한 원본에만 한정하며, 다른 계정·다른 게임의 ID를 넣어 접근할 수 없다.

별도 슬롯을 main으로 복구할 때:

```json
{"sourceSlot":"recovery-tab","expectedSourceRevision":1,"expectedMainRevision":3}
```

불변 백업을 main으로 복구할 때:

```json
{"backupId":"목록에서 받은 백업 UUID","expectedMainRevision":3}
```

`sourceSlot`과 `backupId`는 정확히 하나만 보낸다. sourceSlot=`main`은 허용하지 않으며, 슬롯 복구는 원본 revision도 검사한다. main이 없으면 `expectedMainRevision:0`을 사용한다. 이 body의 revision 조건은 복구의 필수 조건이며 일반 PUT의 `If-Match` 계약은 유지한다. 복구 POST에는 재시도 동안 유지하는 `Idempotency-Key`가 필요하다. 같은 key·같은 요청은 이전 성공 결과를 재사용하고, 같은 key로 다른 요청을 보내면 `409 IDEMPOTENCY_CONFLICT`다.

서버는 하나의 SQLite transaction 안에서 소유권, 원본 schema, 원본·대상 revision, 슬롯 한도를 확인한다. 검사를 통과하면 기존 main을 먼저 백업하고, 복구 원본을 복사해 main revision을 1 증가시킨다. 원본 슬롯·백업은 소모하지 않는다. 응답은 기존 save 객체에 `restoredFrom:{type:'slot'|'backup',id}`와 `previousBackupId:null|UUID`를 추가한다. 오래된 main 또는 source revision이면 412이며 기존 main과 원본을 모두 보존한다. 실패한 요청은 복구 백업도 만들지 않는다.

게임당 쓰기 가능한 슬롯은 10개다. 명시적 계정 병합도 이 한도를 지키며 초과 시 전체 병합을 취소한다. main이 이미 있으면 슬롯이 가득 차도 기존 main 복구는 가능하다. UI는 사용자가 확인한 보관 슬롯을 DELETE로 제거해 여유를 만들 수 있다. 서버는 해당 revision을 확인하고 원본을 `slot_deleted` 백업으로 남긴 후 슬롯을 비우며, main 삭제는 `403 MAIN_SLOT_DELETE_FORBIDDEN`으로 거부한다. 없거나 이미 바뀐 슬롯에 오래된 If-Match를 보내면 412다. 삭제 완료 후 목록을 다시 읽으며, 응답을 잃어 재시도했을 때도 목록으로 결과를 확인한다.

삭제한 이름으로 슬롯을 재생성해도 revision을 1로 되돌리지 않는다. 별도 `save_slot_versions`에 마지막 revision을 유지하므로 이전 탭의 오래된 삭제·수정 조건이 새 기록에 우연히 맞지 않는다. 삭제한 슬롯의 기존 PUT idempotency 결과는 제거하여 이전 성공 응답이 새 저장을 대신하지 않게 한다.

명시 복구와 슬롯 제거 때 만든 `restore_previous`, `slot_deleted` 백업은 합쳐서 사용자·게임별 최근 20개를 유지한다. `merge_conflict` 원본은 이 순환 보관으로 지우지 않는다. 매번 발생하는 자동 저장 전체를 영구 버전으로 보관하는 기능은 아니므로, 충돌한 현재 탭의 진행은 UI가 별도 recovery 슬롯에 먼저 보존한 뒤 main 복구를 요청한다.

## 이벤트 입력

```json
{
  "events": [{
    "event_id": "브라우저에서 생성한 고유 UUID",
    "event_name": "game_impression",
    "game_id": "match3-garden",
    "impression_id": "노출 기회 UUID",
    "occurred_at": "2026-11-16T03:00:00.000Z",
    "properties": {
      "visible_fraction": 0.5,
      "visible_duration_ms": 1000,
      "document_visible": true
    }
  }]
}
```

허용 이름은 `game_impression`, `game_card_click`, `game_detail_view`, `play_click`, `game_ready`, `play_heartbeat`, `game_pause`, `game_resume`, `game_end`, `round_start`, `round_complete`, `runtime_error`다. 카드 클릭은 `impression_id`와 `properties.viewability_met`를 포함한다. 게임 이벤트는 서버의 `play_session_id`가 필요하며 해당 session의 game과 현재 cookie 주체를 검사한다. `subject_id`, `source`, `is_test`, `received_at`은 서버 필드다.

`game_ready` 뒤 heartbeat는 `properties:{sequence:0,active_delta_ms:15000,document_visible:true,paused:false,game_updating:true}`를 약 15초마다 보낸다. 서버가 실제 경과 시간·순서와 active 상태로 상한을 적용하고 누적 10초·60초 milestone을 1회 파생한다. 클라이언트가 `active_play_10s`나 `active_play_60s`를 직접 확정할 수 없다. 라운드 완료는 `properties:{run_id:'uuid',result:'win'|'loss'|'abandoned',score:123}`다. 이벤트 재시도는 같은 event_id를 유지한다.

## 관리자 API

관리자 API는 별도 cookie·CSRF·비밀번호를 사용한다. public listener에서 `/api/admin/*`는 항상 404다. 초기 비밀번호 기본값은 없으며 설치 과정이 만든 scrypt hash가 없으면 관리 로그인이 비활성이다.

| Method 경로 | 요청 | 응답 |
|---|---|---|
| GET /api/admin/session | 없음 | `{authenticated:false 또는 true,csrfToken,username:null 또는 이름}` |
| POST /api/admin/login | `{username,password}` + admin CSRF | `{authenticated:true,csrfToken,username}`. 성공 시 session 회전 |
| POST /api/admin/logout | `{}` + admin CSRF | `{ok:true}` |
| GET /api/admin/metrics?dataset=live 또는 qa 또는 demo | 관리자 session; from/to/gameId/qaRunId 선택 | 아래 metrics 객체. 기본 live는 QA 제외 |
| GET /api/admin/games | 관리자 session | `{games:[공개 game 필드와 enabled 상태]}` |
| PATCH /api/admin/games/:id | `{enabled:true 또는 false}` + admin CSRF | `{game:변경된 객체}` |
| GET /api/admin/errors | 관리자 session; metrics와 같은 필터 | `{errors:[{id,code,message,gameId,createdAt,trafficType,qaRunId}],filters}`. 기본 live만, demo는 빈 배열 |
| GET /api/admin/audit | 관리자 session | `{audit:[{id,action,target,detail,createdAt}]}` |

metrics 응답은 `{dataset,asOf,timezone:'Asia/Seoul',filters:{from,to,gameId,qaRunId},retentionScope:'platform'|'game',metricSemantics,summary,games,retention}`이다. 필터를 생략한 값은 null이다. demo는 고정 예제이므로 날짜·게임·QA run 필터를 함께 보내면 `400 DEMO_FILTERS_UNSUPPORTED`다.

`from`과 `to`는 유효한 `YYYY-MM-DD` KST 날짜이며 양 끝 날짜를 포함한다. 생략한 하한·상한은 전체 이력·현재 수신 이력이다. 잘못된 달력 날짜나 뒤집힌 범위는 400이다. `gameId`는 비공개 게임도 조회할 수 있으나 존재하지 않는 ID는 404다. `qaRunId`는 `dataset=qa`에서만 사용할 수 있으며 다른 조합은 `400 QA_RUN_FILTER_INVALID`다. 예: `/api/admin/metrics?dataset=qa&from=2026-11-01&to=2026-11-07&gameId=slide-puzzle&qaRunId=<UUID>`.

`summary`에는 `games`, `activeGames`, `visitors`, `playSessions`, `readySessions`, `active10sSessions`, `active60sSessions`, `activePlayers`, `totalActiveSeconds`, `roundsCompleted`, `saveWrites`, `impressions`, `clicks`, `ctr`가 있다. CTR은 0~1 비율 또는 분모 없을 때 null이다. `games`는 `{id,title,plays,ready,active10s,active60s,impressions,clicks,ctr}` 배열이다.

`retention`은 `{platform:{d1,d7,d30,cohorts:[]},games:[{gameId,d1,d7,d30,cohorts:[]}],selected:{d1,d7,d30,cohorts:[]}}`다. `selected`는 게임 필터가 있으면 해당 게임 코호트, 없으면 platform과 같다. UI의 현재 필터 카드·표는 `selected`를 사용한다. `platform` 자체는 모든 게임을 기준으로 한 최초일 의미를 유지하며 게임 필터 때문에 최초일을 바꾸지 않는다. 각 d 값은 `{eligible,cohortSize,retained,rate}`이며 미성숙은 retained/rate가 null이다. cohort 행은 `{cohortDate,day,cohortSize,eligible,retained,rate,matureAt}`다. KST 정확일 D1/D7/D30이고 대상일 종료+24시간 뒤 확정한다. demo는 live 데이터에 삽입하지 않는 독립 가상 데이터다.

summary·게임 표의 방문, 노출, 클릭, ready, milestone, 저장 수는 **해당 기간 서버 수신 활동**을 센다. 실행 세션 수는 해당 기간 생성된 세션 수다. 각 단계의 발생 날짜가 다를 수 있어 기간 필터를 건 독립 카운터를 동일 세션 코호트 전환율로 해석하지 않는다. 활성 시간은 승인 구간을 날짜 범위에 맞춰 잘라 합집합으로 계산하므로 자정을 가로지른 heartbeat를 통째로 누락하지 않는다.

리텐션의 날짜 필터는 **코호트 최초 날짜**에 적용한다. 선택한 traffic dataset·QA run의 전체 이력으로 먼저 최초일을 찾고, 그 뒤 from/to 범위의 코호트만 표시한다. 재방문 판정에는 표시 기간 밖의 이후 이력도 사용하며 확정 시각은 응답 asOf다. 예를 들어 11월 1일에 시작한 사람이 11월 2일에 돌아와도 11월 2일 신규 코호트로 재분류하지 않는다. 11월 2일 코호트의 11월 3일 플레이는 화면의 to가 11월 2일이어도 성숙한 D1 분자에 반영한다.

최초 유효 세션의 서버 `active_play_10s` 날짜를 초기 코호트 근거로 보존한다. 이후 날짜 활동은 서버가 승인한 heartbeat의 시간 구간을 KST 자정으로 나눠, 사용자·게임·날짜마다 겹친 구간의 합집합이 10,000ms 이상일 때 추가한다. 여러 탭의 중복 시간은 두 번 세지 않는다. 따라서 같은 iframe에서 이미 최초 milestone을 만든 뒤 자정 이후 계속 플레이하거나 재개해도 다음 날짜 활동을 집계한다. 클라이언트 `occurred_at`을 활동 날짜로 신뢰하거나 원본 이벤트 날짜를 바꾸지 않는다. 전체 플레이 시간은 게임을 가로질러 사용자별 구간 합집합으로 집계한다.

## 설정과 실행

`node server/index.mjs --config <absolute-config-path>`로 실행한다. config는 publicPort/adminPort, publicHost/adminHost, userOrigins/adminOrigins, publicBaseUrl/userBaseUrl/adminBaseUrl, dataDir, secureCookies, google 및 admin을 사용한다. 프로젝트 root는 server의 상위 폴더다.

config는 Windows PowerShell이 작성한 UTF-8 BOM을 허용한다. config 파일이 외부 InstallRoot/config에 있어도 게임·catalog 경로는 config 위치가 아닌 실행 중인 server 폴더의 상위 release root에서 읽는다. dataDir는 별도의 절대경로다.

현재 SQLite `PRAGMA user_version`은 1이다. 기존 버전 0의 저장·identity·이벤트를 유지하면서 QA 분류 컬럼과 복구 백업 이유를 추가한다. 이미 버전 1인 DB 재기동은 같은 컬럼을 중복 생성하지 않는다. 버전 1보다 새로운 DB는 임의 변경 없이 기동을 거부한다. dataDir의 `maintenance.lock`가 있으면 DB를 열거나 마이그레이션하기 전에 기동을 거부하며, 오래된 marker도 자동으로 무시하지 않는다. 복구 작업이 중간에 멈춘 경우 운영 복구 절차로 확인해야 한다. 응답·오류에 marker 원문을 노출하지 않는다.

admin 설정은 `{username,passwordHash,salt}`이며 `passwordHash = scryptSync(password, saltHex문자열, 64).toString('hex')`, salt는 16바이트의 hex 문자열이다. Google 설정은 `{clientId,clientSecret,redirectUri}`다. LAN Google 로그인은 HTTPS의 실제 등록 도메인 구성이 필요하며, local HTTP는 별도 PoC 실행 조건이다. Google 미설정은 disabled 상태로 명확히 응답한다.

오류는 `{error:{code,message},requestId}` 형태다. 응답·로그에 cookie, 비밀번호, Google 토큰·code·clientSecret을 넣지 않는다. SQLite는 웹 루트 밖 dataDir에 저장한다.
