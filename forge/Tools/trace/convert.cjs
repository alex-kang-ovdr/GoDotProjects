'use strict';
// 기존 프로파일 출력 → TraceSample JSONL 변환 CLI.
// 사용법:
//   node forge/Tools/trace/convert.cjs --from ism-profile   --in ISMProfile/results/godot/gd-r2-vulkan --out <file.jsonl>
//   node forge/Tools/trace/convert.cjs --from havok-profile --in <HavokProfile/results/havok-batch>  --out <file.jsonl>
//   node forge/Tools/trace/convert.cjs --from daily-profile --in artifacts/showcase-daily/history.jsonl --out <file.jsonl>
// build_id: --build-id > env PLAYFORGE_BUILD_ID > env PLAYFORGE_BUILD_MANIFEST > "unknown-<입력 경로를 마지막으로 바꾼 커밋 sha>"
const path = require('node:path');
const { writeJsonl, validateSample } = require('./trace-sample.cjs');
const { resolveTraceBuildId, gitShortSha, unknownBuildId } = require('./build-id.cjs');
const { convertIsmProfile } = require('./adapters/ism-profile.cjs');
const { convertHavokProfile } = require('./adapters/havok-profile.cjs');
const { convertDailyProfile } = require('./adapters/daily-profile.cjs');

const ADAPTERS = {
  'ism-profile': convertIsmProfile,
  'havok-profile': convertHavokProfile,
  'daily-profile': convertDailyProfile,
};

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) o[a.slice(2)] = argv[++i];
  }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const fn = ADAPTERS[o.from];
  if (!fn || !o.in || !o.out) {
    console.error(`usage: convert.cjs --from <${Object.keys(ADAPTERS).join('|')}> --in <path> --out <file.jsonl> [--build-id <id>]`);
    process.exit(2);
  }
  let buildId;
  const r = await resolveTraceBuildId({ buildId: o['build-id'] });
  if (r.origin !== 'fallback:git') buildId = r.buildId;
  else if (o.from !== 'daily-profile') {
    // 과거 결과물은 "지금"의 HEAD 가 아니라 그 결과를 커밋한 시점의 sha 로 귀속한다
    const abs = path.resolve(o.in);
    buildId = unknownBuildId(gitShortSha(path.dirname(abs), abs) || gitShortSha(path.dirname(abs)));
  } // daily-profile 은 runRecord.git.sha 를 레코드별로 사용
  const res = fn(path.resolve(o.in), { buildId });
  const bad = res.samples.map(validateSample).filter(e => e.length);
  if (bad.length) {
    console.error(`adapter produced ${bad.length} invalid sample(s): ${bad[0].join('; ')}`);
    process.exit(1);
  }
  writeJsonl(o.out, res.samples);
  console.log(JSON.stringify({ from: o.from, in: o.in, out: o.out, samples: res.samples.length, buildId: buildId || '(per-record)', meta: res.meta }));
}

module.exports = { ADAPTERS };

if (require.main === module) main().catch(e => { console.error(e.stack || e.message); process.exit(1); });
