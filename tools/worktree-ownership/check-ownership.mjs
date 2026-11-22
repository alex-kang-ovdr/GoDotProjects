#!/usr/bin/env node
// 사용법: node tools/worktree-ownership/check-ownership.mjs [--branch <name>] [--base <ref>] [--strict]
// 현재 브랜치의 변경 파일(기준 브랜치 분기 이후 커밋 + 스테이지 + 워킹트리 + untracked)을 owners.json과 대조한다.
// fail(다른 브랜치 소유 경로 수정)이 있으면 종료 코드 1, 공유 핫스팟·무소유 경로는 warn.
// 트렁크(baseBranch) 자체에서는 여러 브랜치를 병합하므로 타 브랜치 소유 경로를 fail 대신 '통합' warn으로 표시한다.
// --strict: 미등록 브랜치를 fail로 처리한다(CI PR 게이트용).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(here, 'owners.json'), 'utf8'));
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
const tryGit = (...a) => { try { return git(...a); } catch { return null; } };

const branch = arg('--branch') ?? git('rev-parse', '--abbrev-ref', 'HEAD')[0];
const strict = process.argv.includes('--strict');
const isTrunk = branch === cfg.baseBranch;

// 기준 ref: 명시값 → 로컬 baseBranch → origin/baseBranch 순으로 해석한다.
let base = arg('--base');
if (!base) base = [cfg.baseBranch, `origin/${cfg.baseBranch}`].find((r) => tryGit('rev-parse', '--verify', '--quiet', r));

const SPECIAL = /[.+^${}()|[\]\\]/g;
const globToRe = (g) => new RegExp('^' + g.replace(SPECIAL, (c) => '\\' + c)
  .replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*') + '$');
const matches = (list, f) => list.some((g) => globToRe(g).test(f));

const committed = (!isTrunk && base && tryGit('diff', '--name-only', `${base}...HEAD`)) || [];
const working = git('status', '--porcelain', '-uall').map((l) => l.slice(3).replace(/^"|"$/g, '').split(' -> ').pop());
const files = [...new Set([...committed, ...working])].sort();

const mine = cfg.branches[branch];
const owners = Object.entries(cfg.branches);
const result = { ok: [], warn: [], fail: [] };
for (const f of files) {
  if (mine && matches(mine.owns, f)) { result.ok.push([f, '소유']); continue; }
  if (matches(cfg.shared, f)) { result.warn.push([f, '공유 핫스팟: 사전 합의·최신 리베이스 필요']); continue; }
  const other = owners.find(([n, o]) => n !== branch && matches(o.owns, f));
  if (other && isTrunk) result.warn.push([f, `트렁크 통합: ${other[0]} 소유 경로`]);
  else if (other) result.fail.push([f, `${other[0]} 소유 경로`]);
  else if (!mine && strict) result.fail.push([f, `브랜치 '${branch}' 미등록 — owners.json에 등록 필요`]);
  else result.warn.push([f, mine ? '소유자 없음(트렁크 통합 시 확인)' : `브랜치 '${branch}' 미등록`]);
}

console.log(`브랜치: ${branch}${isTrunk ? ' (트렁크)' : ''}  기준: ${base ?? '(없음)'}  변경 파일: ${files.length}`);
if (!mine) console.log(`WARN  브랜치 '${branch}'가 owners.json에 없습니다. 워크트리 생성 시 owns 경로를 등록하세요.`);
for (const [k, label] of [['fail', 'FAIL'], ['warn', 'WARN']])
  for (const [f, why] of result[k]) console.log(`${label}  ${f}  — ${why}`);
console.log(`ok ${result.ok.length} / warn ${result.warn.length} / fail ${result.fail.length}`);
process.exit(result.fail.length ? 1 : 0);
