#!/usr/bin/env node
// 사용법: node tools/worktree-ownership/check-ownership.mjs [--branch <name>] [--base <ref>]
// 현재 브랜치의 변경 파일(기준 브랜치 분기 이후 커밋 + 스테이지 + 워킹트리 + untracked)을 owners.json과 대조한다.
// fail(다른 브랜치 소유 경로 수정)이 있으면 종료 코드 1, 공유 핫스팟·무소유 경로는 warn.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(here, 'owners.json'), 'utf8'));
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).split('\n').filter(Boolean);

const branch = arg('--branch') ?? git('rev-parse', '--abbrev-ref', 'HEAD')[0];
const base = arg('--base') ?? cfg.baseBranch;

const SPECIAL = /[.+^${}()|[\]\\]/g;
const globToRe = (g) => new RegExp('^' + g.replace(SPECIAL, (c) => '\\' + c)
  .replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*') + '$');
const matches = (list, f) => list.some((g) => globToRe(g).test(f));

let committed = [];
try { committed = git('diff', '--name-only', `${base}...HEAD`); } catch { /* base 없음 */ }
const working = git('status', '--porcelain', '-uall').map((l) => l.slice(3).replace(/^"|"$/g, '').split(' -> ').pop());
const files = [...new Set([...committed, ...working])].sort();

const mine = cfg.branches[branch];
const owners = Object.entries(cfg.branches);
const result = { ok: [], warn: [], fail: [] };
for (const f of files) {
  if (mine && matches(mine.owns, f)) { result.ok.push([f, '소유']); continue; }
  if (matches(cfg.shared, f)) { result.warn.push([f, '공유 핫스팟: 사전 합의·최신 리베이스 필요']); continue; }
  const other = owners.find(([n, o]) => n !== branch && matches(o.owns, f));
  if (other) result.fail.push([f, `${other[0]} 소유 경로`]);
  else result.warn.push([f, mine ? '소유자 없음(트렁크 통합 시 확인)' : `브랜치 '${branch}' 미등록`]);
}

console.log(`브랜치: ${branch}  기준: ${base}  변경 파일: ${files.length}`);
for (const [k, label] of [['fail', 'FAIL'], ['warn', 'WARN']])
  for (const [f, why] of result[k]) console.log(`${label}  ${f}  — ${why}`);
console.log(`ok ${result.ok.length} / warn ${result.warn.length} / fail ${result.fail.length}`);
process.exit(result.fail.length ? 1 : 0);
