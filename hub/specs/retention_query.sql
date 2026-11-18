/*
JavaScript 웹 게임 플랫폼 정확일 리텐션 계산 예시
계획용 PostgreSQL SQL, 2026-11-16. 운영 ETL 또는 서비스 구현 완료물이 아님.

입력 계약
  daily_activity(subject_id text, scope_type text, scope_id text, activity_date date)
  subject_cohorts(subject_id text, scope_type text, scope_id text, cohort_date date)

  scope_type='platform', scope_id='platform': 어떤 게임이든 유효 플레이한 날짜.
  scope_type='game', scope_id=<stable game ID>: 해당 게임에서 유효 플레이한 날짜.
  유효 플레이: ready 이후 누적 활성 10초를 달성한 세션. 중복·테스트·봇 정책 적용 후.
  activity_date = (valid_play_occurred_at AT TIME ZONE 'Asia/Seoul')::date.
  subject_id는 동의한 identity merge가 이미 해결된 분석용 가명 ID.
  코호트는 해당 scope의 전체 이력 MIN(activity_date)다. 보고 기간을 먼저
  적용하여 기존 사용자를 신규 코호트로 만들면 안 된다.
  subject_cohorts는 전체 이력의 최초일을 미리 계산해 유지하는 입력 테이블이다.
  raw event 수집, 개인정보 동의, identity merge, 활성 시간 판정은 이 SQL의 범위 밖이다.

  권장 제약: UNIQUE(subject_id, scope_type, scope_id, activity_date),
             UNIQUE(subject_id, scope_type, scope_id) on subject_cohorts.
  이 예시는 중복 입력에도 분자가 부풀지 않게 DISTINCT를 추가한다.
  identity merge로 최초일이 바뀌면 입력 projection과 관련 코호트를 다시 계산한다.
  event snapshot의 수신 마감은 별도 관리한다. as_of는 성숙도 판단 시각이며,
  이것만 바꾼다고 과거 시점의 수신 데이터 snapshot이 복원되는 것은 아니다.

정의
  Dn = 최초 날짜 + n인 정확한 현지 날짜에 돌아온 subject / 해당 코호트 subject.
  'n일 이내 재방문', 24시간 이동 창, rolling retention과 다르다.
  target_date = cohort_date + n.
  mature_at = target_date 다음 날 00:00 KST + 지연 수집 24시간
            = (cohort_date + n + 2) 00:00 KST.
  immature는 retained_subjects와 retention_rate가 NULL이며 0%가 아니다.
  weighted_summary는 성숙 코호트의 분자 합 / 분모 합만 사용한다.
  retention_rate는 0..1 비율이다. 화면에서만 100을 곱해 %로 표시한다.
  scope에 코호트가 전혀 없으면 행을 반환하지 않는다. UI에서 '데이터 없음' 처리.

참고: https://www.postgresql.org/docs/current/functions-datetime.html
*/

WITH
params AS (
    SELECT
        TIMESTAMPTZ '2026-11-16 12:00:00+09' AS as_of,
        DATE '2026-10-01' AS report_from,
        DATE '2026-11-16' AS report_to,
        'Asia/Seoul'::text AS report_timezone
),
day_offsets(day_number) AS (
    VALUES (1), (7), (30)
),
/* MIN 이전에 report_from을 적용하지 않는다. */
full_history_cohorts AS (
    SELECT
        subject_id,
        scope_type,
        scope_id,
        MIN(cohort_date) AS cohort_date
    FROM subject_cohorts
    WHERE scope_type IN ('platform', 'game')
    GROUP BY subject_id, scope_type, scope_id
),
report_cohort_members AS (
    SELECT c.*
    FROM full_history_cohorts AS c
    CROSS JOIN params AS p
    WHERE c.cohort_date BETWEEN p.report_from AND p.report_to
      AND c.cohort_date <= (p.as_of AT TIME ZONE p.report_timezone)::date
),
deduplicated_activity AS (
    SELECT DISTINCT subject_id, scope_type, scope_id, activity_date
    FROM daily_activity
    WHERE scope_type IN ('platform', 'game')
),
observed_counts AS (
    SELECT
        c.scope_type,
        c.scope_id,
        c.cohort_date,
        d.day_number,
        COUNT(DISTINCT c.subject_id)::bigint AS cohort_size,
        COUNT(DISTINCT a.subject_id)::bigint AS observed_returned
    FROM report_cohort_members AS c
    CROSS JOIN day_offsets AS d
    LEFT JOIN deduplicated_activity AS a
      ON a.subject_id = c.subject_id
     AND a.scope_type = c.scope_type
     AND a.scope_id = c.scope_id
     AND a.activity_date = c.cohort_date + d.day_number
    GROUP BY c.scope_type, c.scope_id, c.cohort_date, d.day_number
),
with_maturity AS (
    SELECT
        o.*,
        p.as_of,
        p.report_timezone,
        ((o.cohort_date + o.day_number + 2)::timestamp
            AT TIME ZONE p.report_timezone) AS mature_at
    FROM observed_counts AS o
    CROSS JOIN params AS p
),
cohort_results AS (
    SELECT
        'cohort'::text AS report_level,
        scope_type,
        scope_id,
        cohort_date,
        day_number,
        as_of,
        report_timezone,
        mature_at,
        (as_of >= mature_at) AS eligible,
        cohort_size,
        CASE WHEN as_of >= mature_at THEN cohort_size ELSE 0 END::bigint
            AS eligible_subjects,
        CASE WHEN as_of >= mature_at THEN observed_returned ELSE NULL END::bigint
            AS retained_subjects,
        CASE WHEN as_of >= mature_at
             THEN ROUND(observed_returned::numeric / NULLIF(cohort_size, 0), 6)
             ELSE NULL
        END AS retention_rate
    FROM with_maturity
),
weighted_results AS (
    SELECT
        'weighted_summary'::text AS report_level,
        scope_type,
        scope_id,
        NULL::date AS cohort_date,
        day_number,
        as_of,
        report_timezone,
        NULL::timestamptz AS mature_at,
        (SUM(eligible_subjects) > 0) AS eligible,
        SUM(cohort_size)::bigint AS cohort_size,
        SUM(eligible_subjects)::bigint AS eligible_subjects,
        CASE WHEN SUM(eligible_subjects) > 0
             THEN SUM(retained_subjects)::bigint
             ELSE NULL
        END AS retained_subjects,
        CASE WHEN SUM(eligible_subjects) > 0
             THEN ROUND(SUM(retained_subjects)::numeric
                        / NULLIF(SUM(eligible_subjects), 0), 6)
             ELSE NULL
        END AS retention_rate
    FROM cohort_results
    GROUP BY scope_type, scope_id, day_number, as_of, report_timezone
)
SELECT * FROM cohort_results
UNION ALL
SELECT * FROM weighted_results
ORDER BY scope_type, scope_id, day_number, report_level, cohort_date NULLS LAST;

/*
문서 15장의 가상 코호트를 입력했을 때의 기대값:
  2026-10-01 size 100: D1 35/100, D7 18/100, D30 9/100
  2026-10-20 size  80: D1 24/80,  D7 12/80,  D30 NULL
  2026-11-10 size  60: D1 15/60,  D7 NULL,   D30 NULL
  weighted D1: 74/240 = 0.308333
  weighted D7: 30/180 = 0.166667
  weighted D30: 9/100 = 0.090000
*/
