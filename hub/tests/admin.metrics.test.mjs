import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../server/db.mjs';
import { demoMetrics, liveMetrics } from '../server/metrics.mjs';

const games = [
  { id:'alpha', title:{ ko:'알파' }, enabled:true },
  { id:'beta', title:{ ko:'베타' }, enabled:true }
];
const stamp = value => Date.parse(value + '+09:00');
const dayOne = { from:'2026-11-01', to:'2026-11-01' };
const asOf = stamp('2026-11-02T12:00:00');

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'playhub-admin-metrics-'));
  const db = openDatabase(directory);
  t.after(() => {
    db.close();
    rmSync(directory, { recursive:true, force:true });
  });
  let sequence = 0;
  const addPlay = db.prepare(`INSERT INTO play_sessions
    (id,session_hash,principal_id,subject_id,game_id,build_id,started_at,expires_at,traffic_type,qa_run_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const addEvent = db.prepare(`INSERT INTO events
    (id,fingerprint,name,subject_id,visit_id,play_session_id,game_id,impression_id,occurred_at,received_at,properties,source,traffic_type,qa_run_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  return {
    db,
    play(id, date, { subject='alice', game='alpha', run=null } = {}) {
      const time = stamp(date);
      addPlay.run(id, subject, subject, subject, game, 'build', time, time + 7200000, run ? 'qa' : 'live', run);
    },
    event(name, date, { subject='alice', game='alpha', play=null, id=null, properties={}, run=null } = {}) {
      const time = stamp(date);
      addEvent.run(String(++sequence), 'fixture', name, subject, subject, play, game, id, time, time,
        JSON.stringify(properties), name.startsWith('active_play') ? 'server' : 'sdk', run ? 'qa' : 'live', run);
    },
    snapshot(filters=dayOne, now=asOf) {
      return liveMetrics(db, games, now, filters);
    }
  };
}

test('play funnel and runtime errors follow one started cohort across KST midnight', t => {
  const { play, event, snapshot } = fixture(t);
  play('previous', '2026-10-31T23:59:50');
  play('started', '2026-11-01T23:59:59');
  play('unready', '2026-11-01T23:30:00');
  play('beta', '2026-11-01T23:45:00', { game:'beta' });
  play('next', '2026-11-02T00:00:00');
  event('game_ready', '2026-11-01T00:00:01', { play:'previous' });
  event('runtime_error', '2026-11-01T00:00:02', { play:'previous' });
  event('active_play_10s', '2026-11-01T00:00:15', { play:'previous' });
  event('game_ready', '2026-11-02T00:00:01', { play:'started' });
  event('game_ready', '2026-11-02T00:00:02', { play:'started' });
  event('runtime_error', '2026-11-02T00:00:03', { play:'started' });
  event('runtime_error', '2026-11-02T00:00:04', { play:'started' });
  event('active_play_10s', '2026-11-02T00:00:11', { play:'started' });
  event('active_play_10s', '2026-11-02T00:00:13', { play:'started' });
  event('active_play_60s', '2026-11-02T00:01:05', { play:'started' });
  event('runtime_error', '2026-11-01T23:55:00', { play:'beta' }); // Mismatched game ID.
  event('active_play_60s', '2026-11-01T23:55:01', { game:'beta', play:'beta' }); // No earlier stages.
  event('game_ready', '2026-11-02T00:00:01', { play:'next' });

  const metrics = snapshot();
  assert.equal(metrics.summary.playSessions, 3);
  assert.equal(metrics.summary.readySessions, 1);
  assert.equal(metrics.summary.active10sSessions, 1);
  assert.deepEqual(metrics.funnel, {
    started:3, ready:1, active10s:1, active60s:1,
    readyRate:1/3, active10sRate:1/3, active60sRate:1/3
  });
  assert.deepEqual(metrics.health.runtimeErrors, { sessions:1, rate:1/3 });
  assert.equal(metrics.games[0].funnel.readyRate, .5);
  assert.equal(metrics.games[0].health.runtimeErrors.rate, .5);
  assert.equal(metrics.games[1].funnel.active60s, 0);
  assert.equal(metrics.games[1].health.runtimeErrors.rate, 0);
  assert.equal(snapshot(dayOne, stamp('2026-11-02T00:00:30')).funnel.active60s, 0);
  const nextDay = snapshot({ from:'2026-11-02', to:'2026-11-02' });
  assert.equal(nextDay.funnel.started, 1);
  assert.equal(nextDay.funnel.readyRate, 1);
  assert.equal(nextDay.health.runtimeErrors.rate, 0);
});

test('daily and game activity split at KST midnight and merge overlapping identities and spans', t => {
  const { db, play, event, snapshot } = fixture(t);
  db.prepare('INSERT INTO analytics_links VALUES(?,?,?)').run('guest', 'alice', asOf);
  play('late', '2026-11-01T23:58:00', { subject:'guest' });
  play('early', '2026-11-02T00:01:00', { game:'beta' });
  function beat(date, activeMs, extra={}) {
    event('play_heartbeat', date, {
      ...extra, properties:{ accepted_active_ms:activeMs, active_interval_start_at:0, active_interval_end_at:1 }
    });
  }
  beat('2026-11-01T23:59:58', 10000, { subject:'guest' });
  beat('2026-11-02T00:00:05', 10000);
  beat('2026-11-02T00:00:06', 12000, { game:'beta' });
  beat('2026-11-01T23:59:00', 4000, { subject:'bob' });
  beat('2026-11-02T00:01:00', 2000, { subject:'bob', game:'beta' });
  event('game_impression', '2026-11-01T23:59:56', { subject:'guest', id:'card' });
  event('game_card_click', '2026-11-01T23:59:59', { id:'card' });
  event('game_card_click', '2026-11-01T23:59:59', { id:'card' });

  const range = snapshot({ ...dayOne, to:'2026-11-02' });
  assert.deepEqual(range.dailyTrend.days, [
    { date:'2026-11-01', visitors:2, playSessions:1, activePlayers:1, activeSeconds:16 },
    { date:'2026-11-02', visitors:2, playSessions:1, activePlayers:0, activeSeconds:8 }
  ]);
  assert.equal(range.summary.totalActiveSeconds, 24);
  assert.equal(range.summary.activePlayers, 1);
  assert.equal(range.summary.visitors, 2);
  assert.equal(range.summary.ctr, 1);
  assert.equal(range.summary.clicks, 1);
  assert.equal(range.games[0].activePlayers, 1);
  assert.equal(range.games[0].totalActiveSeconds, 21);
  assert.equal(range.games[0].averageActiveSeconds, 17);
  assert.equal(range.games[1].activePlayers, 0);
  assert.equal(range.games[1].totalActiveSeconds, 14);
  assert.equal(range.games[1].averageActiveSeconds, null);
  assert.equal(snapshot().games[0].averageActiveSeconds, 12);
  const beta = snapshot({ ...dayOne, gameId:'beta' });
  assert.deepEqual(beta.dailyTrend.days, [
    { date:'2026-11-01', visitors:0, playSessions:0, activePlayers:0, activeSeconds:6 }
  ]);
  assert.equal(beta.summary.totalActiveSeconds, 6);
  assert.equal(beta.funnel.readyRate, null);
});

test('period saves, wishlist changes and engagement stay isolated across live and QA runs', t => {
  const { play, event, snapshot } = fixture(t);
  for (const [label, run] of [['live', null], ['qa1', 'run-one'], ['qa2', 'run-two']]) {
    play(label, '2026-11-01T10:00:00', { run });
    event('game_ready', '2026-11-01T10:00:01', { run, play:label });
    event('save_write_success', '2026-11-01T10:00:02', { run, properties:{ slot:'main', revision:1 } });
    event('save_write_success', '2026-11-01T10:00:03', { run, properties:{ slot:'main', revision:2, operation:'restore' } });
    event('wishlist_add', '2026-11-01T10:00:04', { run });
    event('wishlist_remove', '2026-11-01T10:00:05', { run });
    event('wishlist_add', '2026-11-02T00:00:00', { run });
  }
  event('wishlist_add', '2026-11-01T10:00:06', { game:'beta' });
  event('runtime_error', '2026-11-01T10:00:07', { run:'run-one', play:'qa1' });

  const live = snapshot(), qa = snapshot({ ...dayOne, dataset:'qa' });
  const run = snapshot({ ...dayOne, dataset:'qa', qaRunId:'run-one' });
  assert.equal(live.summary.saveWrites, 2);
  assert.deepEqual(live.health.saves, { successes:2, restores:1, attempts:null, failures:null, successRate:null });
  assert.deepEqual(qa.health.saves, { successes:4, restores:2, attempts:null, failures:null, successRate:null });
  assert.deepEqual(run.health.saves, live.health.saves);
  assert.equal(live.health.runtimeErrors.rate, 0);
  assert.equal(qa.health.runtimeErrors.rate, .5);
  assert.equal(run.health.runtimeErrors.rate, 1);
  assert.deepEqual(live.games.map(g => [g.wishlistAdds,g.wishlistRemovals]), [[1,1],[1,0]]);
  assert.deepEqual(qa.games.map(g => [g.wishlistAdds,g.wishlistRemovals]), [[2,2],[0,0]]);
  assert.deepEqual([run.summary.wishlistAdds,run.summary.wishlistRemovals], [1,1]);
  assert.deepEqual([live.summary.wishlistAdds,live.summary.wishlistRemovals], [2,1]);
  assert.equal(demoMetrics(games).dataset, 'demo');
  assert.equal(demoMetrics(games).funnel.started, 400);
  assert.equal(snapshot().summary.playSessions, 1);
});

test('empty, historical and open-ended trends have bounded calendar ranges and null ratios', t => {
  const { snapshot } = fixture(t);
  const empty = snapshot();
  assert.deepEqual(empty.dailyTrend.days, [
    { date:'2026-11-01', visitors:0, playSessions:0, activePlayers:0, activeSeconds:0 }
  ]);
  assert.equal(empty.funnel.readyRate, null);
  assert.equal(empty.health.runtimeErrors.rate, null);
  assert.equal(empty.summary.ctr, null);
  assert.equal(empty.games[0].averageActiveSeconds, null);
  assert.equal(snapshot({}).dailyTrend.days.length, 30);
  const historical = snapshot({ from:'2000-01-01', to:'2026-09-01' }).dailyTrend;
  assert.equal(historical.truncated, true);
  assert.equal(historical.days.length, 90);
  assert.equal(historical.days.at(-1).date, '2026-09-01');
  assert.deepEqual(snapshot({ from:'2026-11-04', to:'2026-11-05' }).dailyTrend.days, []);
});

test('per-game user CTR, load p50/p90, median active time, new/returning split and D1 returning rate', t => {
  const { event, play, snapshot } = fixture(t);
  const d1 = '2026-11-01', d2 = '2026-11-02', d3 = '2026-11-03';
  const now = stamp('2026-11-06T00:00:00');
  // Impressions & clicks: u1 sees 2 impressions and clicks 1; u2 sees 1 and does not click -> CTR=1/3, userCtr=1/2
  event('game_impression', `${d2}T10:00:00`, { subject:'u1', game:'alpha', id:'i1' });
  event('game_impression', `${d2}T10:01:00`, { subject:'u1', game:'alpha', id:'i2' });
  event('game_card_click', `${d2}T10:00:05`, { subject:'u1', game:'alpha', id:'i1' });
  event('game_impression', `${d2}T10:02:00`, { subject:'u2', game:'alpha', id:'i3' });

  // u1 plays on d1 (new on d1), returns on d2 (returning on d2), returns on d3 (D1 returning = 100% for d2)
  play('p1', `${d1}T10:00:00`, { subject:'u1', game:'alpha' });
  event('game_ready', `${d1}T10:00:02`, { subject:'u1', game:'alpha', play:'p1' });
  event('play_heartbeat', `${d1}T10:00:30`, { subject:'u1', game:'alpha', play:'p1', properties:{ accepted_active_ms:20000 } });

  play('p2', `${d2}T11:00:00`, { subject:'u1', game:'alpha' });
  event('game_ready', `${d2}T11:00:04`, { subject:'u1', game:'alpha', play:'p2' }); // 4.0s
  event('play_heartbeat', `${d2}T11:01:00`, { subject:'u1', game:'alpha', play:'p2', properties:{ accepted_active_ms:30000 } });

  // u2 is new on d2, load time = 10.0s, active = 90s, does NOT return on d3 -> d1NewRate for d2 = 0%
  play('p3', `${d2}T12:00:00`, { subject:'u2', game:'alpha' });
  event('game_ready', `${d2}T12:00:10`, { subject:'u2', game:'alpha', play:'p3' }); // 10.0s
  event('play_heartbeat', `${d2}T12:02:00`, { subject:'u2', game:'alpha', play:'p3', properties:{ accepted_active_ms:90000 } });

  // u1 returns on d3
  play('p4', `${d3}T10:00:00`, { subject:'u1', game:'alpha' });
  event('game_ready', `${d3}T10:00:02`, { subject:'u1', game:'alpha', play:'p4' });
  event('play_heartbeat', `${d3}T10:00:30`, { subject:'u1', game:'alpha', play:'p4', properties:{ accepted_active_ms:15000 } });

  const day2 = snapshot({ from:d2, to:d2 }, now).games[0];
  assert.equal(day2.impressions, 3);
  assert.equal(day2.clicks, 1);
  assert.equal(day2.ctr, 1 / 3);
  assert.equal(day2.impressedUsers, 2);
  assert.equal(day2.clickedUsers, 1);
  assert.equal(day2.userCtr, 0.5);
  assert.equal(day2.loadP50Seconds, 7);
  assert.equal(day2.loadP90Seconds, 9.4);
  assert.equal(day2.activePlayers, 2);
  assert.equal(day2.medianActiveSeconds, 60);
  assert.equal(day2.newPlayers, 1);
  assert.equal(day2.returningPlayers, 1);
  assert.equal(day2.returningRatio, 0.5);
  assert.equal(day2.d1NewRate, 0);
  assert.equal(day2.d1ReturningRate, 1);
});
