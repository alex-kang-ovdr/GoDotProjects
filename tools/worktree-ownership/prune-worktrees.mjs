#!/usr/bin/env node
// 워크트리 수명주기 점검/정리 도구.
// 사용법:
//   node tools/worktree-ownership/prune-worktrees.mjs                    (기본: 미리보기, 아무것도 변경하지 않음)
//   node tools/worktree-ownership/prune-worktrees.mjs --json             (미리보기 JSON 출력)
//   node tools/worktree-ownership/prune-worktrees.mjs --apply --only A,B (승인된 대상만 정리)
//
// 판정 기준:
//   KEEP        미커밋 변경 / .worktree-lock.json 존재 / 최근 N일(--idle-days, 기본 7) 내 커밋 / 트렁크 미머지
//   PUSH-FIRST  트렁크에 머지됐지만 브랜치가 origin에 없거나 origin보다 앞섬 → 먼저 푸시 필요
//   PRUNABLE    깨끗함 + 트렁크 머지 + origin 동기화 + 유휴 → 정리 가능
// --apply는 PRUNABLE 대상만 처리한다: archive/<branch>/<YYYYMMDD> 태그 생성·푸시 후 `git worktree remove`.
// 브랜치는 삭제하지 않으므로 `git worktree add <경로> <브랜치>`로 언제든 다시 만들 수 있다.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(here, 'owners.json'), 'utf8'));
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const has = (n) => process.argv.includes(n);
const run = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const tryRun = (cwd, ...a) => { try { return run(cwd, ...a); } catch { return null; } };

const trunk = arg('--trunk') ?? cfg.baseBranch;
const idleDays = Number(arg('--idle-days') ?? 7);
const apply = has('--apply');
const only = new Set((arg('--only') ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const repo = run(process.cwd(), 'rev-parse', '--path-format=absolute', '--git-common-dir').replace(/[\\/]\.git$/, '');

tryRun(repo, 'fetch', '--quiet', '--prune', 'origin');
const trunkRef = tryRun(repo, 'rev-parse', '--verify', '--quiet', `origin/${trunk}`) ? `origin/${trunk}` : trunk;

const blocks = run(repo, 'worktree', 'list', '--porcelain').split(/\r?\n\r?\n/).filter(Boolean);
const rows = [];
for (const b of blocks) {
  const info = Object.fromEntries(b.split(/\r?\n/).map((l) => { const i = l.indexOf(' '); return i < 0 ? [l, true] : [l.slice(0, i), l.slice(i + 1)]; }));
  const path = info.worktree;
  const branch = info.branch ? info.branch.replace('refs/heads/', '') : null;
  const row = { path, branch: branch ?? '(detached)', verdict: 'KEEP', reasons: [] };
  rows.push(row);
  if (path.replace(/\\/g, '/').toLowerCase() === repo.replace(/\\/g, '/').toLowerCase()) { row.reasons.push('메인 저장소'); continue; }
  if (!existsSync(path)) { row.verdict = 'PRUNABLE'; row.reasons.push('경로 없음(git worktree prune 대상)'); continue; }
  if (!branch) { row.reasons.push('detached HEAD(임시 체크아웃) — 수동 확인'); continue; }
  if (branch === trunk) { row.reasons.push('트렁크'); continue; }

  const dirty = (tryRun(path, 'status', '--porcelain') ?? '').split(/\r?\n/).filter(Boolean).length;
  const lock = existsSync(join(path, '.worktree-lock.json'));
  const lastTs = Number(tryRun(path, 'log', '-1', '--format=%ct') ?? 0);
  const ageDays = lastTs ? (Date.now() / 1000 - lastTs) / 86400 : Infinity;
  const merged = tryRun(repo, 'merge-base', '--is-ancestor', branch, trunkRef) !== null;
  const remote = tryRun(repo, 'rev-parse', '--verify', '--quiet', `origin/${branch}`);
  const local = tryRun(repo, 'rev-parse', branch);
  const pushed = Boolean(remote) && tryRun(repo, 'merge-base', '--is-ancestor', branch, `origin/${branch}`) !== null;
  Object.assign(row, { dirty, lock, ageDays: Number(ageDays.toFixed(1)), merged, pushed, head: local?.slice(0, 7) });

  if (dirty) row.reasons.push(`미커밋 변경 ${dirty}개`);
  if (lock) row.reasons.push('.worktree-lock.json(작업 중)');
  if (ageDays < idleDays) row.reasons.push(`최근 ${row.ageDays}일 내 커밋`);
  if (!merged) row.reasons.push(`${trunkRef}에 미머지`);
  if (row.reasons.length) continue;
  if (!pushed) { row.verdict = 'PUSH-FIRST'; row.reasons.push(remote ? 'origin보다 앞선 커밋 있음' : 'origin에 브랜치 없음'); continue; }
  row.verdict = 'PRUNABLE';
  row.reasons.push(`머지·푸시 완료, ${row.ageDays}일 유휴`);
}

if (has('--json')) { console.log(JSON.stringify({ trunk: trunkRef, idleDays, rows }, null, 2)); }
else {
  console.log(`기준 트렁크: ${trunkRef}  유휴 기준: ${idleDays}일  워크트리: ${rows.length}개`);
  for (const v of ['PRUNABLE', 'PUSH-FIRST', 'KEEP']) {
    const list = rows.filter((r) => r.verdict === v);
    console.log(`\n[${v}] ${list.length}개`);
    for (const r of list) console.log(`  ${r.branch.padEnd(36)} ${r.reasons.join(' · ')}`);
  }
}

if (!apply) { if (!has('--json')) console.log('\n미리보기 모드입니다. 정리하려면 승인 후 --apply --only <브랜치,...>를 사용하세요.'); process.exit(0); }
if (!only.size) { console.error('--apply에는 --only <브랜치,...>로 승인된 대상을 명시해야 합니다.'); process.exit(2); }

const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
let failed = 0;
for (const name of only) {
  const r = rows.find((x) => x.branch === name);
  if (!r) { console.error(`SKIP ${name}: 워크트리를 찾을 수 없음`); failed++; continue; }
  if (r.verdict !== 'PRUNABLE') { console.error(`SKIP ${name}: ${r.verdict} (${r.reasons.join(' · ')})`); failed++; continue; }
  try {
    if (r.head) {
      const tag = `archive/${name}/${stamp}`;
      if (!tryRun(repo, 'rev-parse', '--verify', '--quiet', `refs/tags/${tag}`)) run(repo, 'tag', '-a', tag, '-m', `archive worktree ${name} @ ${r.head}`, name);
      tryRun(repo, 'push', 'origin', `refs/tags/${tag}`);
      console.log(`TAG  ${tag}`);
    }
    if (existsSync(r.path)) run(repo, 'worktree', 'remove', r.path); else run(repo, 'worktree', 'prune');
    console.log(`DONE ${name}: 워크트리 제거(브랜치 유지) — 재생성: git worktree add "${r.path}" ${name}`);
  } catch (e) { console.error(`FAIL ${name}: ${e.message}`); failed++; }
}
process.exit(failed ? 1 : 0);
