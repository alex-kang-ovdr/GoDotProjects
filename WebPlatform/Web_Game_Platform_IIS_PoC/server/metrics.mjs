const DAY = 86400000;
export const kstDate = value => new Date(Number(value) + 9 * 3600000).toISOString().slice(0, 10);
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const maturity = (day, n) => Date.parse(`${addDays(day, n + 2)}T00:00:00+09:00`);

function unionDuration(spans) {
  let total = 0, current;
  for (const span of spans.sort((a, b) => a[0] - b[0])) {
    if (!current) current = [...span];
    else if (span[0] <= current[1]) current[1] = Math.max(current[1], span[1]);
    else { total += current[1] - current[0]; current = [...span]; }
  }
  return total + (current ? current[1] - current[0] : 0);
}

function validatedActivity(events, range={}) {
  const intervals = new Map(), byDay = new Map(), firstMilestones = new Map();
  for (const e of events) {
    const gameKey = JSON.stringify([e.subject, e.game_id]);
    // Preserve the first qualifying session as the cohort's initial evidence.
    // Later session milestones alone must not bypass the per-day 10-second rule.
    if (e.name === 'active_play_10s' && !firstMilestones.has(gameKey)) firstMilestones.set(gameKey, { subject:e.subject, gameId:e.game_id, date:kstDate(e.received_at) });
    if (e.name !== 'play_heartbeat' || !(e.props.accepted_active_ms > 0)) continue;
    // accepted_active_ms was overwritten by processEvent after server validation.
    // This also handles databases created before explicit interval fields existed.
    const end = e.received_at, start = end - e.props.accepted_active_ms;
    const clippedStart=Math.max(start,range.start ?? -Infinity),clippedEnd=Math.min(end,range.end ?? Infinity);
    if(clippedEnd>clippedStart){
      if (!intervals.has(e.subject)) intervals.set(e.subject, []);
      intervals.get(e.subject).push([clippedStart, clippedEnd]);
    }
    for (let cursor = start; cursor < end;) {
      const date = kstDate(cursor), boundary = Date.parse(`${addDays(date, 1)}T00:00:00+09:00`);
      const until = Math.min(boundary, end), key = JSON.stringify([e.subject, e.game_id, date]);
      if (!byDay.has(key)) byDay.set(key, { subject:e.subject, gameId:e.game_id, date, spans:[] });
      byDay.get(key).spans.push([cursor, until]);
      cursor = until;
    }
  }
  const activity = [...firstMilestones.values()];
  for (const {spans, ...row} of byDay.values()) if (unionDuration(spans) >= 10000) activity.push(row);
  return { activity, totalActiveMs:[...intervals.values()].reduce((total, spans) => total + unionDuration(spans), 0) };
}

export function retentionFromActivity(activity, asOf, filters={}) {
  const scopes = new Map();
  for (const row of activity) {
    const keys = ['platform', `game:${row.gameId}`];
    for (const key of keys) {
      if (!scopes.has(key)) scopes.set(key, new Map());
      const users = scopes.get(key);
      if (!users.has(row.subject)) users.set(row.subject, new Set());
      users.get(row.subject).add(row.date);
    }
  }
  function calculate(users = new Map()) {
    const cohorts = new Map();
    for (const [subject, dates] of users) {
      const first = [...dates].sort()[0];
      // Find first activity over the full history before filtering cohort dates.
      if((filters.from && first<filters.from)||(filters.to && first>filters.to))continue;
      if (!cohorts.has(first)) cohorts.set(first, []);
      cohorts.get(first).push({ subject, dates });
    }
    const result = { d1: null, d7: null, d30: null, cohorts: [] };
    for (const n of [1, 7, 30]) {
      let denominator = 0, numerator = 0;
      for (const [day, members] of [...cohorts].sort(([a], [b]) => a.localeCompare(b))) {
        const eligible = asOf >= maturity(day, n);
        const retained = eligible ? members.filter(m => m.dates.has(addDays(day, n))).length : null;
        if (eligible) { denominator += members.length; numerator += retained; }
        result.cohorts.push({ cohortDate: day, day: n, cohortSize: members.length, eligible, retained, rate: eligible ? retained / members.length : null, matureAt: new Date(maturity(day, n)).toISOString() });
      }
      result[`d${n}`] = { eligible: denominator > 0, cohortSize: denominator, retained: denominator ? numerator : null, rate: denominator ? numerator / denominator : null };
    }
    return result;
  }
  return { platform: calculate(scopes.get('platform')), games: [...scopes].filter(([k]) => k.startsWith('game:')).map(([key, users]) => ({ gameId: key.slice(5), ...calculate(users) })) };
}

export function demoMetrics(games = []) {
  const activity = [];
  for (const [prefix, count, day, returned] of [['a', 100, '2026-10-01', { 1: 35, 7: 18, 30: 9 }], ['b', 80, '2026-10-20', { 1: 24, 7: 12 }], ['c', 60, '2026-11-10', { 1: 15 }]]) {
    for (let i = 0; i < count; i++) {
      activity.push({ subject: `${prefix}${i}`, gameId: games[0]?.id || 'demo-puzzle', date: day });
      for (const [n, amount] of Object.entries(returned)) if (i < amount) activity.push({ subject: `${prefix}${i}`, gameId: games[0]?.id || 'demo-puzzle', date: addDays(day, Number(n)) });
    }
  }
  const asOf = Date.parse('2026-11-16T12:00:00+09:00');
  return { dataset: 'demo', label: '독립 가상 데이터 · 실제 사용자 성과 아님', asOf: new Date(asOf).toISOString(), timezone: 'Asia/Seoul', summary: { games: games.length, activeGames: games.filter(g => g.enabled).length, visitors: 500, playSessions: 400, readySessions: 380, active10sSessions: 353, active60sSessions: 170, activePlayers: 240, totalActiveSeconds: 18400, roundsCompleted: 260, saveWrites: 240, impressions: 1200, clicks: 300, ctr: 0.25 }, games: games.map((g, i) => ({ id: g.id, title: g.title, plays: i ? 0 : 400, ready: i ? 0 : 380, active10s: i ? 0 : 353, active60s: i ? 0 : 170, impressions: i ? 0 : 1200, clicks: i ? 0 : 300, ctr: i ? null : 0.25 })), retention: retentionFromActivity(activity, asOf) };
}

export function liveMetrics(db, games, asOf, filters={}) {
  const dataset=filters.dataset || 'live',from=filters.from || null,to=filters.to || null,gameId=filters.gameId || null,qaRunId=filters.qaRunId || null;
  const start=from?Date.parse(`${from}T00:00:00+09:00`):-Infinity,end=to?Date.parse(`${addDays(to,1)}T00:00:00+09:00`):Infinity;
  const inPeriod=stamp=>stamp>=start && stamp<end && stamp<=asOf;
  const inDate=date=>(!from || date>=from)&&(!to || date<=to);
  const inGame=id=>!gameId || id===gameId;
  const links = new Map(db.prepare('SELECT source_subject,target_subject FROM analytics_links').all().map(r => [r.source_subject, r.target_subject]));
  const resolve = id => { const seen = new Set(); while (links.has(id) && !seen.has(id)) { seen.add(id); id = links.get(id); } return id; };
  const allEvents = db.prepare('SELECT * FROM events WHERE traffic_type=? AND received_at<=? AND (? IS NULL OR qa_run_id=?) ORDER BY received_at,id').all(dataset,asOf,qaRunId,qaRunId).map(e => ({ ...e, subject: resolve(e.subject_id), props: JSON.parse(e.properties) }));
  const events=allEvents.filter(e=>inPeriod(e.received_at)&&inGame(e.game_id));
  const plays = db.prepare('SELECT * FROM play_sessions WHERE traffic_type=? AND started_at<=? AND (? IS NULL OR qa_run_id=?)').all(dataset,asOf,qaRunId,qaRunId).filter(p=>inPeriod(p.started_at)&&inGame(p.game_id));
  const impressions = new Map();
  for (const e of events) if (e.name === 'game_impression' && e.impression_id) impressions.set(`${e.subject}|${e.game_id}|${e.impression_id}`, e);
  const clicked = new Set();
  for (const e of events) if (e.name === 'game_card_click' && e.props.viewability_met !== false) {
    const key = `${e.subject}|${e.game_id}|${e.impression_id}`;
    if (impressions.has(key)) clicked.add(key);
  }
  const ten = events.filter(e => e.name === 'active_play_10s'), sixty = events.filter(e => e.name === 'active_play_60s');
  const allActivity=validatedActivity(allEvents).activity;
  const {activity, totalActiveMs} = validatedActivity(allEvents.filter(e=>inGame(e.game_id)),{start,end:Math.min(end,asOf)});
  const selectedActivity=activity.filter(row=>inDate(row.date));
  const visibleGames=games.filter(g=>inGame(g.id));
  const retention=retentionFromActivity(allActivity,asOf,{from,to});
  if(gameId)retention.games=retention.games.filter(g=>g.gameId===gameId);
  const empty=retentionFromActivity([],asOf).platform;
  retention.selected=gameId?(retention.games.find(g=>g.gameId===gameId)||{gameId,...empty}):retention.platform;
  return { dataset, asOf: new Date(asOf).toISOString(), timezone: 'Asia/Seoul',filters:{from,to,gameId,qaRunId},retentionScope:gameId?'game':'platform',metricSemantics:{summary:'activity_in_kst_date_range',retention:'first_activity_in_full_history_then_cohort_date_filter',activeTime:'validated_interval_union_clipped_to_range'}, summary: {
    games: visibleGames.length, activeGames: visibleGames.filter(g => g.enabled).length,
    visitors: new Set(events.map(e => e.subject)).size, playSessions: plays.length, readySessions: new Set(events.filter(e=>e.name==='game_ready').map(e=>e.play_session_id)).size,
    active10sSessions: ten.length, active60sSessions: sixty.length, activePlayers: new Set(selectedActivity.map(e => e.subject)).size,
    totalActiveSeconds: Math.round(totalActiveMs / 1000), roundsCompleted: events.filter(e => e.name === 'round_complete').length,
    saveWrites: events.filter(e => e.name === 'save_write_success').length, impressions: impressions.size, clicks: clicked.size, ctr: impressions.size ? clicked.size / impressions.size : null
  }, games: visibleGames.map(g => {
    const count = [...impressions.values()].filter(e => e.game_id === g.id).length;
    const clickCount = [...clicked].filter(key => impressions.get(key).game_id === g.id).length;
    return { id: g.id, title: g.title, plays: plays.filter(p => p.game_id === g.id).length, ready: new Set(events.filter(e=>e.name==='game_ready'&&e.game_id===g.id).map(e=>e.play_session_id)).size, active10s: ten.filter(e => e.game_id === g.id).length, active60s: sixty.filter(e => e.game_id === g.id).length, impressions: count, clicks: clickCount, ctr: count ? clickCount / count : null };
  }), retention };
}
