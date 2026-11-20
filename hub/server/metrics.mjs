const DAY = 86400000;
const KST_OFFSET = 9 * 3600000;
const TREND_DAYS = 90;
export const kstDate = value => new Date(Number(value) + KST_OFFSET).toISOString().slice(0, 10);
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const maturity = (day, n) => Date.parse(`${addDays(day, n + 2)}T00:00:00+09:00`);
const dayStart = day => Date.parse(`${day}T00:00:00+09:00`);
const rate = (numerator, denominator) => denominator ? numerator / denominator : null;

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  const val = lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  return Math.round(val * 10) / 10;
}

function mapEntry(map, key, create) {
  if (!map.has(key)) map.set(key, create());
  return map.get(key);
}

function unionDuration(spans) {
  let total = 0, current;
  for (const span of spans.sort((a, b) => a[0] - b[0])) {
    if (!current) current = [...span];
    else if (span[0] <= current[1]) current[1] = Math.max(current[1], span[1]);
    else { total += current[1] - current[0]; current = [...span]; }
  }
  return total + (current ? current[1] - current[0] : 0);
}

function validatedActivity(events) {
  const byDay = new Map(), firstMilestones = new Map();
  for (const e of events) {
    const gameKey = JSON.stringify([e.subject, e.game_id]);
    // Preserve the first qualifying session as the cohort's initial evidence.
    // Later session milestones alone must not bypass the per-day 10-second rule.
    if (e.name === 'active_play_10s' && !firstMilestones.has(gameKey)) firstMilestones.set(gameKey, { subject:e.subject, gameId:e.game_id, date:kstDate(e.received_at) });
    if (e.name !== 'play_heartbeat' || !(e.props.accepted_active_ms > 0)) continue;
    // accepted_active_ms was overwritten by processEvent after server validation.
    // This also handles databases created before explicit interval fields existed.
    const end = e.received_at, start = end - e.props.accepted_active_ms;
    for (let cursor = start; cursor < end;) {
      const date = kstDate(cursor), boundary = dayStart(date) + DAY;
      const until = Math.min(boundary, end), key = JSON.stringify([e.subject, e.game_id, date]);
      mapEntry(byDay, key, () => ({ subject:e.subject, gameId:e.game_id, date, spans:[] })).spans.push([cursor, until]);
      cursor = until;
    }
  }
  const activity = [...firstMilestones.values()];
  for (const row of byDay.values()) {
    row.activeMs = unionDuration(row.spans);
    if (row.activeMs >= 10000) activity.push({ subject:row.subject, gameId:row.gameId, date:row.date });
  }
  return { activity, intervals:byDay.values() };
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

function playFunnel(started, ready, active10s, active60s) {
  return {
    started, ready, active10s, active60s,
    readyRate:rate(ready, started), active10sRate:rate(active10s, started), active60sRate:rate(active60s, started)
  };
}

function runtimeHealth(errorSessions, started) {
  return { sessions:errorSessions, rate:rate(errorSessions, started) };
}

function saveHealth(successes, restores) {
  // Only successful committed writes, including restores, are recorded.
  return { successes, restores, attempts:null, failures:null, successRate:null };
}

function dailyTrend(asOf, from, to) {
  const today = kstDate(asOf);
  const last = to && to < today ? to : today;
  const oldest = addDays(last, 1 - TREND_DAYS);
  const first = from ? (from < oldest ? oldest : from) : addDays(last, -29);
  const days = new Map();
  for (let date = first; date <= last; date = addDays(date, 1)) {
    days.set(date, { date, visitors:new Set(), playSessions:0, activePlayers:new Set(), activeMs:0 });
  }
  return { days, truncated:Boolean(from && from < oldest), maxDays:TREND_DAYS };
}

function serializeTrend(trend) {
  return {
    truncated:trend.truncated,
    maxDays:trend.maxDays,
    days:[...trend.days.values()].map(d => ({
      date:d.date, visitors:d.visitors.size, playSessions:d.playSessions,
      activePlayers:d.activePlayers.size, activeSeconds:Math.round(d.activeMs / 1000)
    }))
  };
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
  const summary = {
    games:games.length, activeGames:games.filter(g => g.enabled).length,
    visitors:500, playSessions:400, readySessions:380, active10sSessions:353, active60sSessions:170,
    activePlayers:240, totalActiveSeconds:18400, roundsCompleted:260, saveWrites:240,
    impressions:1200, clicks:300, ctr:0.25, impressedUsers:820, clickedUsers:224, userCtr:224 / 820,
    loadP50Seconds:1.8, loadP90Seconds:4.3, medianActiveSeconds:68.5,
    newPlayers:158, returningPlayers:82, returningRatio:82 / 240,
    wishlistAdds:45, wishlistRemovals:8
  };
  const funnel = playFunnel(400, 380, 353, 170);
  const health = { runtimeErrors:runtimeHealth(5, 400), saves:saveHealth(240, 9) };
  const trend = serializeTrend(dailyTrend(asOf, '2026-11-10', '2026-11-16'));
  const trendExample = [
    [87, 56, 39, 2200], [72, 49, 35, 2100], [108, 67, 58, 3000],
    [78, 50, 37, 2300], [81, 55, 47, 2700], [94, 60, 51, 2800], [106, 63, 54, 3300]
  ];
  trend.days.forEach((day, i) => {
    [day.visitors, day.playSessions, day.activePlayers, day.activeSeconds] = trendExample[i];
  });
  const retention = retentionFromActivity(activity, asOf);
  return {
    dataset:'demo', label:'독립 가상 데이터 · 실제 사용자 성과 아님', asOf:new Date(asOf).toISOString(), timezone:'Asia/Seoul',
    summary, funnel, health, dailyTrend:trend,
    games:games.map((g, i) => ({
      id:g.id, title:g.title,
      plays:i ? 0 : 400, ready:i ? 0 : 380, active10s:i ? 0 : 353, active60s:i ? 0 : 170,
      impressions:i ? 0 : 1200, clicks:i ? 0 : 300, ctr:i ? null : 0.25,
      impressedUsers:i ? 0 : 820, clickedUsers:i ? 0 : 224, userCtr:i ? null : 224 / 820,
      loadP50Seconds:i ? null : 1.8, loadP90Seconds:i ? null : 4.3,
      activePlayers:i ? 0 : 240, totalActiveSeconds:i ? 0 : 18400,
      averageActiveSeconds:i ? null : 76.7, medianActiveSeconds:i ? null : 68.5,
      newPlayers:i ? 0 : 158, returningPlayers:i ? 0 : 82, returningRatio:i ? null : 82 / 240,
      d1NewRate:i ? null : (retention.games.find(r => r.gameId === g.id)?.d1?.rate ?? 0.308),
      d1ReturningRate:i ? null : 0.425,
      wishlistAdds:i ? 0 : 45, wishlistRemovals:i ? 0 : 8,
      funnel:i ? playFunnel(0, 0, 0, 0) : funnel,
      health:i ? { runtimeErrors:runtimeHealth(0, 0), saves:saveHealth(0, 0) } : health
    })),
    retention
  };
}

export function liveMetrics(db, games, asOf, filters={}) {
  const dataset=filters.dataset || 'live',from=filters.from || null,to=filters.to || null,gameId=filters.gameId || null,qaRunId=filters.qaRunId || null;
  const start=from?dayStart(from):-Infinity,end=to?dayStart(to)+DAY:Infinity;
  const inPeriod=stamp=>stamp>=start && stamp<end && stamp<=asOf;
  const inDate=date=>(!from || date>=from)&&(!to || date<=to);
  const inGame=id=>!gameId || id===gameId;
  const links = new Map(db.prepare('SELECT source_subject,target_subject FROM analytics_links').all().map(r => [r.source_subject, r.target_subject]));
  const resolve = id => { const seen = new Set(); while (links.has(id) && !seen.has(id)) { seen.add(id); id = links.get(id); } return id; };
  const allEvents = db.prepare('SELECT * FROM events WHERE traffic_type=? AND received_at<=? AND (? IS NULL OR qa_run_id=?) ORDER BY received_at,id').all(dataset,asOf,qaRunId,qaRunId).map(e => ({ ...e, subject: resolve(e.subject_id), props: JSON.parse(e.properties) }));
  const events=allEvents.filter(e=>inPeriod(e.received_at)&&inGame(e.game_id));
  const plays = db.prepare('SELECT * FROM play_sessions WHERE traffic_type=? AND started_at<=? AND (? IS NULL OR qa_run_id=?)').all(dataset,asOf,qaRunId,qaRunId).filter(p=>inPeriod(p.started_at)&&inGame(p.game_id));
  const trend = dailyTrend(asOf, from, to);
  const cohort = new Map();
  for (const play of plays) {
    cohort.set(play.id, { gameId:play.game_id, startedAt:play.started_at, firstReadyAt:null, stages:new Set() });
    const day = trend.days.get(kstDate(play.started_at));
    if (day) day.playSessions++;
  }
  const stageNames = new Set(['game_ready', 'active_play_10s', 'active_play_60s', 'runtime_error']);
  for (const e of allEvents) {
    if (!stageNames.has(e.name)) continue;
    const session = cohort.get(e.play_session_id);
    if (session && session.gameId === e.game_id && e.received_at >= session.startedAt) {
      session.stages.add(e.name);
      if (e.name === 'game_ready' && session.firstReadyAt === null) session.firstReadyAt = e.received_at;
    }
  }
  const cohortCounts = () => ({ started:0, ready:0, active10s:0, active60s:0, errors:0, loadSeconds:[] });
  const totalCohort = cohortCounts(), gameCohorts = new Map();
  for (const {gameId:id, startedAt, firstReadyAt, stages} of cohort.values()) {
    const ready = stages.has('game_ready');
    const active10s = ready && stages.has('active_play_10s');
    const loadSec = firstReadyAt !== null ? (firstReadyAt - startedAt) / 1000 : null;
    for (const counts of [totalCohort, mapEntry(gameCohorts, id, cohortCounts)]) {
      counts.started++;
      if (ready) counts.ready++;
      if (loadSec !== null && loadSec >= 0 && loadSec <= 300) counts.loadSeconds.push(loadSec);
      if (active10s) counts.active10s++;
      if (active10s && stages.has('active_play_60s')) counts.active60s++;
      if (stages.has('runtime_error')) counts.errors++;
    }
  }

  const impressions = new Map();
  const clicked = new Map();
  const visitors = new Set(), gameEvents = new Map();
  const eventCounts = () => ({
    ready:new Set(), active10s:0, active60s:0, roundsCompleted:0, saves:0, restores:0,
    impressions:0, clicks:0, impressedUsers:new Set(), clickedUsers:new Set(),
    wishlistAdds:0, wishlistRemovals:0
  });
  const totalEvents = eventCounts();
  for (const e of events) {
    visitors.add(e.subject);
    trend.days.get(kstDate(e.received_at))?.visitors.add(e.subject);
    if (e.name === 'game_impression' || e.name === 'game_card_click') {
      const key = JSON.stringify([e.subject, e.game_id, e.impression_id]);
      if (e.name === 'game_impression' && e.impression_id) impressions.set(key, { gameId:e.game_id, subject:e.subject });
      if (e.name === 'game_card_click' && e.props.viewability_met !== false) clicked.set(key, { gameId:e.game_id, subject:e.subject });
    }
    for (const count of [totalEvents, mapEntry(gameEvents, e.game_id, eventCounts)]) {
      if (e.name === 'game_ready') count.ready.add(e.play_session_id);
      if (e.name === 'active_play_10s') count.active10s++;
      if (e.name === 'active_play_60s') count.active60s++;
      if (e.name === 'round_complete') count.roundsCompleted++;
      if (e.name === 'save_write_success') {
        count.saves++;
        if (e.props.operation === 'restore') count.restores++;
      }
      if (e.name === 'wishlist_add') count.wishlistAdds++;
      if (e.name === 'wishlist_remove') count.wishlistRemovals++;
    }
  }
  for (const { gameId:id, subject } of impressions.values()) {
    totalEvents.impressions++;
    totalEvents.impressedUsers.add(subject);
    const ge = gameEvents.get(id);
    ge.impressions++;
    ge.impressedUsers.add(subject);
  }
  for (const [key, { gameId:id, subject }] of clicked) if (impressions.has(key)) {
    totalEvents.clicks++;
    totalEvents.clickedUsers.add(subject);
    const ge = gameEvents.get(id);
    ge.clicks++;
    ge.clickedUsers.add(subject);
  }

  const { activity, intervals } = validatedActivity(allEvents);
  const activePlayers = new Set(), gamePlayers = new Map();
  const gameHistory = new Map();
  for (const { subject, gameId:id, date } of activity) {
    const historyUsers = mapEntry(gameHistory, id, () => new Map());
    mapEntry(historyUsers, subject, () => new Set()).add(date);
    if (!inDate(date) || !inGame(id)) continue;
    activePlayers.add(subject);
    mapEntry(gamePlayers, id, () => new Set()).add(subject);
    trend.days.get(date)?.activePlayers.add(subject);
  }
  const daysWithIntervals = new Map(), gameTimes = new Map();
  for (const { subject, gameId:id, date, spans, activeMs } of intervals) {
    if (!inDate(date) || !inGame(id)) continue;
    const times = mapEntry(gameTimes, id, () => ({ totalMs:0, qualifiedMs:0, byPlayer:new Map() }));
    times.totalMs += activeMs;
    if (gamePlayers.get(id)?.has(subject)) {
      times.qualifiedMs += activeMs;
      times.byPlayer.set(subject, (times.byPlayer.get(subject) || 0) + activeMs);
    }
    const subjects = mapEntry(daysWithIntervals, date, () => new Map());
    const spansAcrossGames = mapEntry(subjects, subject, () => []);
    for (const span of spans) spansAcrossGames.push(span);
  }
  let totalActiveMs = 0;
  for (const [date, subjects] of daysWithIntervals) {
    const activeMs = [...subjects.values()].reduce((sum, spans) => sum + unionDuration(spans), 0);
    totalActiveMs += activeMs;
    const day = trend.days.get(date);
    if (day) day.activeMs = activeMs;
  }

  const visibleGames=games.filter(g=>inGame(g.id));
  const retention=retentionFromActivity(activity,asOf,{from,to});
  if(gameId)retention.games=retention.games.filter(g=>g.gameId===gameId);
  const empty=retentionFromActivity([],asOf).platform;
  retention.selected=gameId?(retention.games.find(g=>g.gameId===gameId)||{gameId,...empty}):retention.platform;
  const retentionByGame = new Map(retention.games.map(r => [r.gameId, r]));
  const gameCohortStats = id => {
    const activeSet = gamePlayers.get(id) || new Set();
    const historyUsers = gameHistory.get(id) || new Map();
    let newPlayers = 0, returningPlayers = 0, d1RetDenom = 0, d1RetNum = 0;
    for (const [subject, dates] of historyUsers) {
      const sorted = [...dates].sort();
      const firstDate = sorted[0];
      if (activeSet.has(subject)) {
        if (from) {
          if (firstDate >= from && (!to || firstDate <= to)) newPlayers++;
          else returningPlayers++;
        } else {
          newPlayers++;
          if (sorted.length >= 2) returningPlayers++;
        }
      }
      for (const d of sorted) {
        if (d <= firstDate || !inDate(d)) continue;
        if (asOf < maturity(d, 1)) continue;
        d1RetDenom++;
        if (dates.has(addDays(d, 1))) d1RetNum++;
      }
    }
    const returningRatio = activeSet.size ? returningPlayers / activeSet.size : null;
    const d1NewRate = retentionByGame.get(id)?.d1?.rate ?? null;
    const d1ReturningRate = d1RetDenom ? d1RetNum / d1RetDenom : null;
    return { newPlayers, returningPlayers, returningRatio, d1NewRate, d1ReturningRate };
  };
  const funnelFor = c => playFunnel(c.started, c.ready, c.active10s, c.active60s);
  const healthFor = (c, e) => ({ runtimeErrors:runtimeHealth(c.errors, c.started), saves:saveHealth(e.saves, e.restores) });
  return {
    dataset, asOf:new Date(asOf).toISOString(), timezone:'Asia/Seoul', filters:{ from, to, gameId, qaRunId },
    retentionScope:gameId ? 'game' : 'platform',
    metricSemantics:{
      summary:'activity_in_kst_date_range', retention:'first_activity_in_full_history_then_cohort_date_filter',
      activeTime:'validated_interval_union_clipped_to_range', funnel:'sessions_started_in_period_followed_through_as_of',
      runtimeErrors:'distinct_started_cohort_sessions_reporting_runtime_error_through_as_of',
      saveWrites:'committed_writes_in_period_including_restores', wishlist:'actual_add_and_remove_events_in_period',
      averageActiveTime:'validated_time_of_selected_game_active_players_per_active_player',
      userCtr:'distinct_clicked_subjects_over_distinct_impressed_subjects',
      loadLatency:'game_ready_minus_play_session_started_at_in_seconds_p50_p90',
      d1Returning:'mature_returning_player_days_replaying_next_kst_day'
    },
    summary:{
      games:visibleGames.length, activeGames:visibleGames.filter(g => g.enabled).length,
      visitors:visitors.size, playSessions:plays.length, readySessions:totalEvents.ready.size,
      active10sSessions:totalEvents.active10s, active60sSessions:totalEvents.active60s, activePlayers:activePlayers.size,
      totalActiveSeconds:Math.round(totalActiveMs / 1000), roundsCompleted:totalEvents.roundsCompleted,
      saveWrites:totalEvents.saves, impressions:totalEvents.impressions, clicks:totalEvents.clicks,
      ctr:rate(totalEvents.clicks, totalEvents.impressions),
      impressedUsers:totalEvents.impressedUsers.size, clickedUsers:totalEvents.clickedUsers.size,
      userCtr:rate(totalEvents.clickedUsers.size, totalEvents.impressedUsers.size),
      loadP50Seconds:percentile(totalCohort.loadSeconds, 0.5),
      loadP90Seconds:percentile(totalCohort.loadSeconds, 0.9),
      wishlistAdds:totalEvents.wishlistAdds, wishlistRemovals:totalEvents.wishlistRemovals
    },
    funnel:funnelFor(totalCohort),
    health:healthFor(totalCohort, totalEvents),
    dailyTrend:serializeTrend(trend),
    games:visibleGames.map(g => {
      const c = gameCohorts.get(g.id) || cohortCounts();
      const e = gameEvents.get(g.id) || eventCounts();
      const players = gamePlayers.get(g.id)?.size || 0;
      const time = gameTimes.get(g.id) || { totalMs:0, qualifiedMs:0, byPlayer:new Map() };
      const playerSecList = [...time.byPlayer.values()].map(ms => ms / 1000);
      const cohortStats = gameCohortStats(g.id);
      return {
        id:g.id, title:g.title, plays:c.started, ready:e.ready.size, active10s:e.active10s, active60s:e.active60s,
        impressions:e.impressions, clicks:e.clicks, ctr:rate(e.clicks, e.impressions),
        impressedUsers:e.impressedUsers.size, clickedUsers:e.clickedUsers.size,
        userCtr:rate(e.clickedUsers.size, e.impressedUsers.size),
        loadP50Seconds:percentile(c.loadSeconds, 0.5), loadP90Seconds:percentile(c.loadSeconds, 0.9),
        activePlayers:players, totalActiveSeconds:Math.round(time.totalMs / 1000),
        averageActiveSeconds:players ? Math.round(time.qualifiedMs / players / 100) / 10 : null,
        medianActiveSeconds:percentile(playerSecList, 0.5),
        ...cohortStats,
        wishlistAdds:e.wishlistAdds, wishlistRemovals:e.wishlistRemovals,
        funnel:funnelFor(c), health:healthFor(c,e)
      };
    }),
    retention
  };
}
