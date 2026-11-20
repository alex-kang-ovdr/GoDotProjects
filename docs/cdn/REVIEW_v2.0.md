# UGC R2 기획안 v2.0 검토 결과

- 대상: `UGC_R2_Data_Auth_Server_Operations_v2_0_20261120.md` (2,824행, 통합본 00~08)
- 검토일: 2026-11-20 · 브랜치 `PlayHub-CDN`
- 방법: 문서 00–03(1–1536행)과 04–08(1536–2824행)을 나누어 독립 검토하고, 현재 `hub/`·`forge/` 코드를 따로 매핑했다. 공급자 사실은 Cloudflare 공개 문서 기준 지식으로 대조했으며, 실계정 확인은 하지 않았다.
- 표기: 행 번호는 원문 통합본 기준이다. "M1 반영"은 이번 PlayHub-CDN M1 구현에서 처리 여부다.

## 1. 총평

문서는 공급자 한계를 보수적으로 서술했고, 확인 가능한 사실은 대부분 정확하다.

- 정확한 사실:
  - R2 presigned POST 미지원
  - custom domain에서 presigned URL 사용 불가
  - bucket versioning API 미지원
  - D1 무료 한도
  - 비용 예시 6건(`$157.05`, `$14.85`, `$254.25`, `$1,226.25`, `$197.55`, `$217.35`)과 `219,870원`의 산술
- 구현을 막는 공백: 데이터 모델 규모, commit API, GC와 dedup 경합, 원자적 quota 패턴, 검증 실행 환경. 아래 차단·높음 항목이 여기에 해당한다.

## 2. 지적 사항

### 차단

| # | 행 | 문제 | 수정안 | M1 반영 |
|---|---|---|---|---|
| B1 | 311, 1221, 1376 | `manifests/entries`를 DB 행으로 두면 "파일 수 × commit 수"만큼 행이 생긴다. 2,000파일 × 100버전 × 1만 명이면 수십억 행으로 D1 DB 한도를 넘는다. "저장당 8행"(1376) 가정과도 모순된다 | manifest JSON을 객체로 저장하고, DB에는 digest·bytes·파일 수만 둔다 | **반영.** `m/{owner}/{blobId}.json` 객체로 저장하고 `cdn_commits.manifest_blob_id`로 참조한다. blob 참조는 `cdn_blobs.ref_count`로 관리하므로 행 수는 O(blob) |
| B2 | 323–333, 392–411 | path→blob 매핑·expected head·메시지를 제출하는 commit API가 없다. upload 단위와 재사용 판정 응답도 정의되지 않았다 | save-plan → 파일별 PUT → commit의 3단계로 정의한다 | **반영.** `POST save-plans`(upload/reuse 판정) → presigned PUT → `uploads/{id}/complete` → `POST commits`(planId, expectedHead, Idempotency-Key) |
| B3 | 254, 382–390, 1739–1747 | dedup 재사용과 GC가 경합한다. 재사용 판정 직후 GC가 지우면 commit이 깨진다. hash 키에 재업로드하면 진행 중인 DELETE가 새 데이터를 지울 수 있다 | 고유 blob 키, 상태 전이(LIVE→DELETING), 조건부 참조, lease | **반영.** 키는 `b/{owner}/{blobId}`(hash 아님). 참조 추가는 `state='LIVE'`일 때만 하고, GC 전이는 `ref_count=0 AND lease_until<now`일 때만 한다. 둘 다 조건부 UPDATE다. save-plan이 재사용 blob에 lease를 설정한다 |

### 높음

| # | 행 | 문제 | 수정안 | M1 반영 |
|---|---|---|---|---|
| H1 | 251, 321, 1227–1235 | 원자적 quota 예약 패턴이 없다. 금지 사항만 적혀 있다 | 사용자별 카운터에 조건부 UPDATE | **반영.** `UPDATE cdn_storage SET reserved=reserved+? WHERE used+reserved+? <= limit`(changes=1 검사) |
| H2 | 353–364 | 상태 기계가 불완전하다(VERIFYING→FAILED, 만료, 취소, 예약 반환). 단일 PUT URL을 다시 발급하는 경로도 없다 | 상태별 규칙표와 renew API | **반영.** 상태표는 `M1_IMPLEMENTATION.md` §3, `POST uploads/{id}/renew` |
| H3 | 335, 999, 1201–1205, 1663, 2400 | 검증 실행기가 정해지지 않았다. Workers Free의 CPU 10ms로는 MB 단위 SHA-256을 계산할 수 없다. API Worker에 쓰기 binding을 주는 설정(1272–1281)은 "서명과 검증 분리" 원칙과 모순된다 | M1부터 Paid/Queues 또는 별도 검증 작업자 | **반영(Node).** hub 프로세스 안에서 검증한다. 한 번 읽어 hash와 크기를 확인하고 같은 bytes를 최종 키에 쓴다. 파일 상한은 64MiB이며 multipart는 제외한다 |
| H4 | 484–485, 493 | 콘텐츠 도메인이 PSL에 없으면 프로젝트 하위 도메인 사이에서 cookie tossing이 가능하다 | PSL 등록, 미리보기 도메인 분리, `__Host-` 쿠키 | M3 범위(공개 origin). 기록만 함 |
| H5 | 290, 484, 1331 | `prj_example`의 `_`는 호스트명에 쓸 수 없다. 예시 형식도 섞여 있다 | 별도 `host_slug` 규칙 | **반영.** `p` + 소문자 base32 16자 `hostSlug`를 프로젝트 생성 시 발급한다 |
| H6 | 1869, 2396 | DB 백업이 SQLite Online Backup API 기준인데, 채택 스택은 D1이다. D1 Time Travel은 같은 계정 안에 있어 독립 백업이 아니다 | `wrangler d1 export`로 다른 계정에 내보내기, RPO 실측 | M4. 현재 Node 구성은 기존 `tools/backup.mjs` 경로를 쓴다 |
| H7 | 1848–1857 | 백업 쪽 dedup blob의 보존·삭제 규칙이 없다. 백업 GC가 공유 blob을 지우면 복구가 깨진다 | 백업 목적지에도 참조 기반 보존과 tombstone 대조 | M4. 기록만 함 |
| H8 | 1898–1956, 1777–1788, 1969 | 런북·경보·복구 훈련에 담당자, 호출 경로, 목표 대응 시간이 없다. AT-050을 판정할 수 없다 | RB별 담당 직책, 경보 ID, 대응 시간 표 | M4. 기록만 함 |
| H9 | 2347 | Class A 1M/월 가정이 비현실적이다. 저장 1회마다 PUT과 Copy(또는 PUT 2회)가 일어나고, 검증 GET과 GC List/Delete도 생긴다 | 저장 1회당 호출 수 계수표로 다시 계산 | M5. M1 실측 계수는 §4 참고 |

### 중간·낮음

| # | 행 | 문제 | M1 반영 |
|---|---|---|---|
| M1 | 167–173 vs 1073–1079 | 버킷 목록이 문서마다 다르다(`ugc-build-staging-prod` vs `ugc-assets-prod`) | M1은 quarantine·projects 2개만 쓰고 설정 한 곳(`config.cdn.buckets`)에 둔다 |
| M2 | 647, 855, 1152, 1287, 1568, 2788 | 업로드 TTL이 5분, 10분, 15분, 600초로 제각각이다. 08장의 "통일 완료" 주장과도 맞지 않는다 | `uploadUrlTtlSec=600`, `downloadUrlTtlSec=300`을 한 곳에서 정의한다 |
| M3 | 714–716 vs 1128–1133 | quarantine GET 허용 여부와 `x-amz-meta-write-id` 정의가 다르다 | 클라이언트에 quarantine GET을 주지 않고, 메타 헤더는 쓰지 않는다 |
| M4 | 634, 697 | presigned GET이 R2 계정 origin에서 UGC HTML·SVG를 렌더링할 수 있다 | **반영.** `response-content-disposition=attachment`와 `response-content-type=application/octet-stream`을 서명에 넣는다(R2 지원 여부는 계약 시험 필요) |
| M5 | 234, 1241, 1357 | 비공개 전환 시 게이트 확인과 캐시 조회의 순서가 정의되지 않았다 | M3 |
| M6 | 211 | 자동저장 빈도가 정의되지 않았다. 매 자동저장이 commit이 되면 100개 보존이 빠르게 소진된다 | 클라이언트 정책(명시 저장 또는 N분 묶음). 서버는 같은 트리 저장을 `unchanged`로 처리한다 |
| M7 | 1565 vs 1598 | 보존 조건이 "30일 또는 100개"인지 "30일·100개"인지 모호하다 | **보수적 AND로 구현**: 30일을 넘었고 **동시에** 최신 100개 밖일 때만 정리한다. 확정이 필요하다 |
| M8 | 1749, 1922 | 서버 전용 최종 키의 고아(DB 확정 실패) 정리가 없다 | **반영.** 객체를 쓰기 전에 PENDING 행을 기록하고, GC가 오래된 PENDING을 ABANDONED로 정리한다(버킷 List 불필요) |
| M9 | AT-003, 008, 042, 046, 047 | 경계 비교(≤/<), tree digest 정의, 부하 프로필이 미정이다 | 경계는 `≤ limit` 허용(테스트로 고정). 동일 트리 판정은 canonical manifest sha256 |
| L1 | 1289–1290 vs 306 | 플랜 한도가 wrangler `vars`에도, DB `plan_entitlements`에도 있다 | 한도 값은 설정, 사용자별 플랜은 DB(`cdn_storage.plan`) |
| L2 | 374 | 복원 commit의 작성자가 원작성자인지 복원자인지 모호하다 | 복원자를 작성자로 하고 `restoredFrom`으로 원본을 표시한다 |
| L3 | 2659, 2661 | Drive quota 수치는 미검증이다. 750GB/일 한도는 모든 계정에 적용된다 | 07장 범위, M1과 무관 |
| L4 | 2073, 2120 | 로컬 개발 경로가 없다. mock 통과를 표시할 상태값도 없다 | **반영.** 로컬 S3 에뮬레이터(SigV4 실제 검증)를 두고 결과를 `PASS_LOCAL`로 표시한다 |

### MVP 과잉 설계로 이후 단계로 미룬 것

다음 항목은 M1에서 제외했다.

- 프로필 B(ASP.NET EXE)와 C
- 조건부 CopyObject, `If-None-Match`와 후보 키의 이중 장치
- multipart
- 팀 dedup, Editor/Publisher 역할
- 미리보기 교환 코드
- 관리자 5역할 매트릭스
- 역할별 R2 서명자 분리

## 3. 인수 시험(AT) 중 M1 로컬 자동화 범위

- 로컬에서 자동화한 시험:
  - AT-001, 003, 004, 005, 007, 008, 009, 010, 011, 012, 013, 014, 015
  - AT-021, 022, 025, 026, 027, 028, 029, 030, 031, 032, 038
  - 대응 테스트: `hub/tests/cdn-*.test.mjs`
  - 결과 등급: `PASS_LOCAL`
- 실계정이 필요한 시험:
  - AT-020(custom domain)
  - AT-023(R2의 Content-Length 강제)
  - AT-024(실 버킷 CORS)
  - AT-037(r2.dev 등 R2 고유 경로)
- 범위 밖: M2~M5 항목

## 4. 저장 1회당 R2 호출 계수 (M1 구현 기준, H9 보정용)

변경 파일 n개(새 내용), 재사용 파일 r개, 새 manifest 1개 기준이다.

| 단계 | Class A | Class B |
|---|---|---|
| 브라우저 → quarantine PUT | n | – |
| 검증 GET(quarantine) | – | n |
| 최종 키 PUT | n | – |
| quarantine DELETE | 무료(R2 DeleteObject) | – |
| manifest PUT | 1 | – |
| 재사용 파일 | 0 | 0 |
| **합계** | **2n + 1** | **n** |

기획 06장 시나리오(Class A 100만/월)는 위 계수로 다시 계산해야 한다. 예를 들어 월 10만 저장 × 평균 n=4이면 Class A는 90만이다.
