import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FINDING_TYPES, HUB_USE_CASES } from '../adapters/hub/usecase-catalog.mjs';
import { renderUseCaseMarkdownReport, writeUseCaseReportArtifacts } from '../reporters/usecase-report.mjs';

test('HUB_USE_CASES defines 12 distinct user scenarios covering functional, performance, stability, and usability', () => {
  assert.equal(HUB_USE_CASES.length, 12);
  const ids = new Set(HUB_USE_CASES.map((u) => u.id));
  assert.equal(ids.size, 12);
  const allDims = new Set(HUB_USE_CASES.flatMap((u) => u.dimensions));
  for (const required of ['기능', '성능', '안정성', '편의성']) {
    assert.ok(allDims.has(required), `missing dimension ${required}`);
  }
});

test('renderUseCaseMarkdownReport formats scorecard, categorized findings, scenario matrix, and API profile', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gamerqa-uc-rep-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const sample = {
    schemaVersion: 1,
    runId: 'hub-uc-sample',
    generatedAtKst: '2026-11-21T14:00:00+09:00',
    durationMs: 12345,
    browserExecutable: 'chrome.exe',
    nodeVersion: process.version,
    summary: {
      totalScenarios: 12,
      passedScenarios: 10,
      warnedScenarios: 1,
      failedScenarios: 1,
      totalFindings: 2,
      findingCounts: {
        [FINDING_TYPES.UNIMPLEMENTED]: 1,
        [FINDING_TYPES.BROKEN]: 0,
        [FINDING_TYPES.SLOW]: 0,
        [FINDING_TYPES.STABILITY]: 0,
        [FINDING_TYPES.USABILITY]: 1,
      },
    },
    scores: { 기능: 97, 성능: 100, 안정성: 100, 편의성: 92, overall: 97 },
    apiProfile: [{ name: 'GET /api/games', status: 200, errors: 0, p50Ms: 2.1, p95Ms: 4.5, maxMs: 6.2 }],
    scenarios: [
      { id: 'UC-01', persona: '신규 방문자', title: '첫 방문 홈 탐색', dimensions: ['기능', '성능'], status: 'passed', durationMs: 400, metrics: { cardCount: 23 }, findings: [] },
    ],
    findings: [
      { useCaseId: 'UC-07', type: FINDING_TYPES.USABILITY, severity: 'medium', title: '미번역 한글 잔존', evidence: '전체 게임', remediation: 'L10N 키 추가' },
      { useCaseId: 'UC-08', type: FINDING_TYPES.UNIMPLEMENTED, severity: 'low', title: '로컬 Google OAuth 미설정', evidence: 'googleEnabled=false', remediation: '환경변수 주입' },
    ],
  };

  const written = writeUseCaseReportArtifacts({ outDir: tmp, report: sample });
  assert.ok(fs.existsSync(written.reportMdPath));
  assert.ok(fs.existsSync(written.reportJsonPath));
  const md = renderUseCaseMarkdownReport(sample);
  assert.match(md, /4축 복합 품질 스코어카드/);
  assert.match(md, /미번역 한글 잔존/);
  assert.match(md, /GET \/api\/games/);
});
