#!/usr/bin/env node
// 프로젝트 스킬 동기화: 정본 .agents/skills/ → 사본 .claude/skills/
// 사용법: node tools/agent-skills/sync-skills.mjs          (복사)
//         node tools/agent-skills/sync-skills.mjs --check  (불일치 시 종료 코드 1)
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(root, '.agents', 'skills');
const DST = join(root, '.claude', 'skills');
const check = process.argv.includes('--check');

function list(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p); else out.push(relative(dir, p).split(sep).join('/'));
    }
  })(dir);
  return out.sort();
}
const norm = (buf) => buf.toString('utf8').replace(/\r\n/g, '\n');

const src = list(SRC);
const dst = list(DST);
if (!src.length) { console.error('[skills] 정본 .agents/skills/ 가 비어 있습니다.'); process.exit(1); }

const problems = [];
for (const f of src) {
  if (!dst.includes(f)) problems.push(`누락: .claude/skills/${f}`);
  else if (norm(readFileSync(join(SRC, f))) !== norm(readFileSync(join(DST, f)))) problems.push(`불일치: ${f}`);
}
for (const f of dst) if (!src.includes(f)) problems.push(`정본에 없음: .claude/skills/${f}`);

for (const f of src) {
  const text = readFileSync(join(SRC, f), 'utf8');
  if (f.endsWith('SKILL.md') && !/^---\r?\n[\s\S]*?\bname:\s*\S+[\s\S]*?\bdescription:\s*\S+[\s\S]*?\r?\n---/.test(text)) {
    problems.push(`프런트매터(name/description) 누락: .agents/skills/${f}`);
  }
}

if (check) {
  if (problems.length) {
    for (const p of problems) console.error(`[skills] ${p}`);
    console.error('[skills] `npm run sync:skills`로 .agents/skills/ 정본을 .claude/skills/에 반영하세요.');
    process.exit(1);
  }
  console.log(`[skills] 동기화 OK (${src.length}개 파일)`);
  process.exit(0);
}

for (const f of dst) if (!src.includes(f)) rmSync(join(DST, f));
for (const f of src) {
  const to = join(DST, f);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(join(SRC, f), to);
}
console.log(`[skills] .agents/skills → .claude/skills 동기화 완료 (${src.length}개 파일)`);
