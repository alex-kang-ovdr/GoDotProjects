'use strict';
// TraceSample JSONL → 지표별 p50/p95/p99 요약 (로드맵 §12: 원시 샘플 + p50/p95/p99 + 반복 분산).
// 백분위수는 최근접 순위(nearest-rank) 방식: 정렬된 n개에서 ceil(p/100*n) 번째 값(항상 실제 샘플 값).
const fs = require('node:fs');
const path = require('node:path');
const { parseJsonl, isAggregateMetric } = require('./trace-sample.cjs');

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1];
}

function round(v, d = 4) {
  if (v === null || !Number.isFinite(v)) return null;
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = n ? sorted.reduce((a, b) => a + b, 0) / n : null;
  const variance = n > 1 ? sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  return {
    n,
    min: round(sorted[0] ?? null),
    p50: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
    p99: round(percentile(sorted, 99)),
    max: round(sorted[n - 1] ?? null),
    mean: round(mean),
    stdev: round(Math.sqrt(variance)),
  };
}

/**
 * @param {object[]} samples 검증된 TraceSample 배열
 * @param {{groupBy?: string[]}} opts groupBy: 추가 그룹 키로 쓸 tags 이름(예: ['case','mode'])
 */
function summarize(samples, opts = {}) {
  const groupBy = opts.groupBy || [];
  const groups = new Map();
  const preAggregated = new Map();
  const buildIds = new Set();
  const devices = new Map();
  const sources = new Set();
  for (const s of samples) {
    buildIds.add(s.build_id);
    sources.add(s.source);
    devices.set(JSON.stringify(s.device), s.device);
    const tagKey = groupBy.map(k => `${k}=${s.tags && k in s.tags ? s.tags[k] : ''}`);
    const key = [s.source, s.metric, s.unit, s.clock_domain, s.exact ? 'exact' : 'estimated', ...tagKey].join('|');
    const target = isAggregateMetric(s.metric) ? preAggregated : groups;
    if (!target.has(key)) {
      const g = { source: s.source, metric: s.metric, unit: s.unit, clock_domain: s.clock_domain, exact: s.exact, values: [] };
      for (const k of groupBy) g[k] = s.tags && k in s.tags ? s.tags[k] : null;
      target.set(key, g);
    }
    target.get(key).values.push(s.value);
  }
  const finish = map => [...map.values()]
    .map(({ values, ...g }) => ({ ...g, ...stats(values) }))
    .sort((a, b) => (a.source + a.metric).localeCompare(b.source + b.metric));
  return {
    schemaVersion: 1,
    percentileMethod: 'nearest-rank',
    totalSamples: samples.length,
    buildIds: [...buildIds].sort(),
    sources: [...sources].sort(),
    devices: [...devices.values()],
    groupBy,
    metrics: finish(groups),
    // 원본이 이미 집계해 둔 값(.p50/.p95 등) — 원시 샘플이 아니므로 백분위를 다시 내지 않고 값 분포만 보인다
    preAggregated: finish(preAggregated),
  };
}

function formatTable(summary) {
  const lines = ['| source | metric | unit | exact | n | p50 | p95 | p99 | max | stdev |', '|---|---|---|---|---:|---:|---:|---:|---:|---:|'];
  for (const m of summary.metrics) {
    const extra = summary.groupBy.map(k => `${k}=${m[k]}`).join(',');
    lines.push(`| ${m.source} | ${m.metric}${extra ? ` (${extra})` : ''} | ${m.unit} | ${m.exact} | ${m.n} | ${m.p50} | ${m.p95} | ${m.p99} | ${m.max} | ${m.stdev} |`);
  }
  return lines.join('\n');
}

module.exports = { percentile, stats, summarize, formatTable };

if (require.main === module) {
  // 사용법: node forge/Tools/trace/summarize.cjs <in.jsonl> [--group-by case,mode] [--out summary.json]
  const args = process.argv.slice(2);
  const input = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--group-by' && args[args.indexOf(a) - 1] !== '--out');
  const gi = args.indexOf('--group-by');
  const oi = args.indexOf('--out');
  if (!input) { console.error('usage: summarize.cjs <in.jsonl> [--group-by tag1,tag2] [--out summary.json]'); process.exit(2); }
  const parsed = parseJsonl(fs.readFileSync(input, 'utf8'));
  if (parsed.errors.length) {
    console.error(`${parsed.errors.length} invalid line(s); first: line ${parsed.errors[0].line}: ${parsed.errors[0].errors.join('; ')}`);
    process.exit(1);
  }
  const summary = summarize(parsed.samples, { groupBy: gi >= 0 ? args[gi + 1].split(',').filter(Boolean) : [] });
  if (oi >= 0) {
    fs.mkdirSync(path.dirname(path.resolve(args[oi + 1])), { recursive: true });
    fs.writeFileSync(args[oi + 1], JSON.stringify(summary, null, 2) + '\n', 'utf8');
  }
  console.log(formatTable(summary));
  console.log(`samples=${summary.totalSamples} build_ids=${summary.buildIds.join(',')} preAggregated=${summary.preAggregated.length}`);
}
