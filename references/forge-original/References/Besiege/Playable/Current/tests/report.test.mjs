import test from 'node:test';
import assert from 'node:assert/strict';
import { makePreset } from '../dist/parts.js';
import { createRunReport, recordRunEvent, sampleRunReport, snapshotRunReport, reportMatchesDesign,
  getReportIssues, reportAdvice, REPORT_EVENT_LIMIT } from '../dist/report.js';

test('report keeps the original design and detects subsequent design or mission changes', () => {
  const parts = makePreset('rover');
  const report = createRunReport(parts, 'outpost');
  assert.equal(reportMatchesDesign(report, [...parts].reverse(), 'outpost'), true);
  assert.equal(reportMatchesDesign(report, parts, 'gate'), false);
  parts[1].power = 1.7;
  assert.equal(reportMatchesDesign(report, parts, 'outpost'), false);
  assert.notEqual(report.blueprint[1].power, 1.7);
  const snapshot = snapshotRunReport(report);
  snapshot.blueprint[0].x = 99;
  assert.notEqual(report.blueprint[0].x, 99);
});

test('bounded event history retains first failure evidence and totals after overflow', () => {
  const parts = makePreset('rover');
  const report = createRunReport(parts, 'outpost');
  const event = { type: 'break', time: 1.2, a: parts[0].id, b: parts[1].id, reason: 'stress', stress: 1.7 };
  recordRunEvent(report, event); event.reason = 'edited';
  for (let i = 0; i < REPORT_EVENT_LIMIT + 30; i++) recordRunEvent(report,
    { type: 'damage', time: 2 + i, partId: parts[1].id, damage: .1, hp: 40, source: 'collision' });
  assert.equal(report.events.length, REPORT_EVENT_LIMIT);
  assert.equal(report.droppedEvents, 31);
  assert.equal(report.firstBreak.reason, 'stress');
  assert.equal(report.firstBreak.time, 1.2);
  assert.ok(Math.abs(report.parts[1].damage - 13) < 1e-9);
  assert.ok(reportAdvice(report).some(s => s.includes('하중')));
});

test('samples preserve damage versus load, detached living parts, and exact break time', () => {
  const parts = makePreset('rover'), report = createRunReport(parts, 'outpost');
  const a = parts[0].id, b = parts[1].id;
  recordRunEvent(report, { type: 'break', time: 2.425, a, b, reason: 'impact', stress: .3 });
  const sim = { elapsed: 2.5, speed: 3.4, shots: 1, integrity: .9, coreHp: 85, checkpointIndex: 0,
    partStates: new Map([[a, { hp: 85, dead: false, connected: true }], [b, { hp: 35, dead: false, connected: false }]]),
    connections: [{ a, b, kind: 'fixed', broken: true, stress: .3, health: 0 }] };
  sampleRunReport(report, sim);
  assert.equal(report.connections[0].peakStress, .3);
  assert.equal(report.connections[0].health, 0);
  assert.equal(report.connections[0].breakAt, 2.425);
  assert.equal(report.connections[0].reason, 'impact');
  assert.equal(getReportIssues(report)[0].id, b);
  sim.connections[0].stress = 99;
  assert.equal(report.connections[0].peakStress, .3);
  assert.ok(reportAdvice(report).some(s => s.includes('HP가 남아도')));
  assert.equal(Number.isFinite(report.peakSpeed), true);
});
