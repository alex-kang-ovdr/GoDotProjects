#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_REPO_ROOT, escapeHtml, formatDuration, isExistingDir, isExistingFile } from './common.mjs';
import { generateMorningBriefing } from './briefing.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
};

function listBuildRuns(buildsRoot) {
  if (!isExistingDir(buildsRoot)) return [];
  const runs = [];
  for (const entry of fs.readdirSync(buildsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.toLowerCase() === 'previews') continue;
    const runDir = path.join(buildsRoot, entry.name);
    const unified = path.join(runDir, 'DAILY_BUILD_MANIFEST.json');
    const det = path.join(runDir, 'deterministic-manifest.json');
    const manifestPath = isExistingFile(unified) ? unified : isExistingFile(det) ? det : null;
    if (!manifestPath) continue;
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      runs.push({
        runId: m.runId || entry.name,
        dirName: entry.name,
        overallStatus: m.overallStatus || 'unknown',
        commit: m.git?.shortCommit || '—',
        branch: m.git?.branch || '—',
        durationMs: m.durationMs ?? 0,
        finishedAt: m.finishedAt || '',
        summary: m.summary || {},
        archiveStatus: m.archive?.archiveStatus || 'none',
        hasUnifiedHtml: isExistingFile(path.join(runDir, 'DAILY_REPORT.html')),
        hasDetHtml: isExistingFile(path.join(runDir, 'deterministic-report.html')),
        manifest: m,
      });
    } catch {
      // ignore invalid manifest
    }
  }
  return runs.sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)));
}

async function renderPortalHtml(repoRoot, buildsRoot) {
  const runs = listBuildRuns(buildsRoot);
  const briefing = await generateMorningBriefing({ repoRoot });
  const latest = runs[0] || null;
  const badgeColor =
    briefing.verdict === 'PASS' ? '#157347' : briefing.verdict === 'FAIL' ? '#b02a37' : '#9a6700';

  const latestStagesHtml = latest
    ? (latest.manifest.stages || [])
        .map(
          (s) =>
            `<tr><td><code>${escapeHtml(s.id)}</code></td><td>${escapeHtml(s.title)}</td><td><strong class="st-${escapeHtml(s.status)}">${escapeHtml(String(s.status).toUpperCase())}</strong></td><td>${escapeHtml(formatDuration(s.durationMs))}</td><td>${escapeHtml(s.message || '')}</td></tr>`,
        )
        .join('')
    : '<tr><td colspan="5">아직 실행된 CI 빌드가 없습니다.</td></tr>';

  const artifactsHtml =
    latest && (latest.manifest.artifacts || []).length
      ? latest.manifest.artifacts
          .map(
            (a) =>
              `<tr><td><code>${escapeHtml(a.relativePath)}</code></td><td>${escapeHtml((a.bytes / 1024 / 1024).toFixed(2))} MiB</td><td><code>${escapeHtml(a.sha256)}</code></td></tr>`,
          )
          .join('')
      : '<tr><td colspan="3">생성된 패키지 아티팩트 없음</td></tr>';

  const runsHtml = runs.length
    ? runs
        .map((r) => {
          const reportLink = r.hasUnifiedHtml
            ? `/runs/${encodeURIComponent(r.dirName)}/DAILY_REPORT.html`
            : r.hasDetHtml
              ? `/runs/${encodeURIComponent(r.dirName)}/deterministic-report.html`
              : '#';
          const jsonLink = `/runs/${encodeURIComponent(r.dirName)}/${r.hasUnifiedHtml ? 'DAILY_BUILD_MANIFEST.json' : 'deterministic-manifest.json'}`;
          return `<tr><td><a href="${reportLink}"><strong>${escapeHtml(r.runId)}</strong></a></td><td><strong class="st-${escapeHtml(r.overallStatus)}">${escapeHtml(String(r.overallStatus).toUpperCase())}</strong></td><td><code>${escapeHtml(r.commit)}</code> (${escapeHtml(r.branch)})</td><td>pass ${r.summary.pass ?? 0} / fail ${r.summary.fail ?? 0} / skip ${r.summary.skip ?? 0}</td><td>${escapeHtml(formatDuration(r.durationMs))}</td><td><a href="${reportLink}">HTML</a> · <a href="${jsonLink}">JSON</a></td></tr>`;
        })
        .join('')
    : '<tr><td colspan="6">빌드 이력 없음</td></tr>';

  const actionsHtml = (briefing.actions || []).map((a) => `<li>${escapeHtml(a)}</li>`).join('');
  const commitsHtml = (briefing.recentCommits || [])
    .slice(0, 6)
    .map((c) => `<li><code>${escapeHtml(c.sha)}</code> ${escapeHtml(c.subject)}</li>`)
    .join('');

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PlayHub CI Build & Archive Portal</title><style>
  body{font:14px/1.6 system-ui,-apple-system,sans-serif;background:#f4f7f5;color:#172a23;max-width:1040px;margin:20px auto;padding:0 14px}
  header,section{background:#fff;border:1px solid #d5e1db;border-radius:12px;padding:18px;margin:14px 0;box-shadow:0 1px 3px rgba(0,0,0,.04)}
  h1{margin:0 0 8px;font-size:20px}h2{margin:0 0 12px;font-size:16px}
  .badge{display:inline-block;padding:4px 10px;border-radius:999px;color:#fff;font-weight:700;font-size:12px;background:${badgeColor}}
  .meta{color:#496157;font-size:13px;margin:6px 0 0}
  .table-wrap{overflow-x:auto}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{border-bottom:1px solid #e4ece8;padding:9px 8px;text-align:left;vertical-align:top}
  .st-pass{color:#157347}.st-fail,.st-error{color:#b02a37}.st-partial,.st-skip,.st-warn,.st-not_run{color:#9a6700}
  code{font-size:12px;background:#f0f4f2;padding:1px 5px;border-radius:4px;word-break:break-all}
  a{color:#0f5c43;text-decoration:none}a:hover{text-decoration:underline}
  ul{margin:6px 0;padding-left:20px}
  .foot{font-size:12px;color:#5a7066}
  </style></head><body>
  <header>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
      <h1>PlayHub CI 빌드 · 아카이브 리포트 포털</h1>
      <span class="badge">${escapeHtml(briefing.verdict)}</span>
    </div>
    <p class="meta">기준일(KST): ${escapeHtml(briefing.todayKst)} · 최신 실행: <code>${escapeHtml(briefing.runId || '없음')}</code> · 커밋: <code>${escapeHtml(briefing.commit)}</code> (${escapeHtml(briefing.branch)}) · 읽기 전용(Read-Only) 뷰어</p>
  </header>
  <section>
    <h2>오전 브리핑 요약</h2>
    <ul>${actionsHtml}</ul>
    <p class="foot">최근 24시간 커밋</p>
    <ul>${commitsHtml || '<li>최근 커밋 없음</li>'}</ul>
  </section>
  <section>
    <h2>최신 CI 빌드 스테이지 결과 ${latest ? `(${escapeHtml(latest.runId)})` : ''}</h2>
    <div class="table-wrap"><table><thead><tr><th>Stage</th><th>검증 항목</th><th>상태</th><th>소요</th><th>결과</th></tr></thead><tbody>${latestStagesHtml}</tbody></table></div>
  </section>
  <section>
    <h2>생성 아티팩트 & SHA-256</h2>
    <div class="table-wrap"><table><thead><tr><th>파일</th><th>크기</th><th>SHA-256</th></tr></thead><tbody>${artifactsHtml}</tbody></table></div>
  </section>
  <section>
    <h2>전체 빌드 이력</h2>
    <div class="table-wrap"><table><thead><tr><th>실행 ID</th><th>상태</th><th>커밋</th><th>집계</th><th>소요</th><th>리포트</th></tr></thead><tbody>${runsHtml}</tbody></table></div>
    <p class="foot">보안 경계: 본 페이지는 정적 CI 리포트 읽기 전용이며, 관리자 인증·DB·시크릿·쓰기 API를 노출하지 않습니다.</p>
  </section>
  </body></html>\n`;
}

// Returns the absolute file path for a /runs/<rel> request, or null when the path
// escapes buildsRoot or points into the previews directory (case-insensitive so
// `Previews/` cannot bypass the block on case-insensitive filesystems).
export function resolveRunFilePath(buildsRoot, rel) {
  if (typeof rel !== 'string' || !rel) return null;
  if (rel.includes('..') || rel.includes('\\') || rel.includes('\0')) return null;
  const root = path.resolve(buildsRoot);
  const target = path.resolve(root, rel);
  if (!target.startsWith(root + path.sep)) return null;
  const firstSegment = path.relative(root, target).split(path.sep)[0];
  if (!firstSegment || firstSegment.toLowerCase() === 'previews') return null;
  return target;
}

export function startServer() {
  const args = process.argv.slice(2);
  let repoRoot = DEFAULT_REPO_ROOT;
  let port = 18350;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo-root') repoRoot = path.resolve(args[++i]);
    else if (args[i] === '--port') port = Number(args[++i]);
  }
  const buildsRoot = path.join(repoRoot, 'artifacts', 'daily-builds');
  fs.mkdirSync(buildsRoot, { recursive: true });

  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, service: 'playhub-ci-report-portal', readOnly: true }));
      return;
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const html = await renderPortalHtml(repoRoot, buildsRoot);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : html);
      return;
    }
    if (url.pathname.startsWith('/runs/')) {
      let rel;
      try {
        rel = decodeURIComponent(url.pathname.slice('/runs/'.length));
      } catch {
        rel = null;
      }
      const target = rel === null ? null : resolveRunFilePath(buildsRoot, rel);
      if (!target) {
        res.writeHead(400);
        res.end('Bad path');
        return;
      }
      const ext = path.extname(target).toLowerCase();
      if (!MIME[ext] || !isExistingFile(target)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[ext], 'Cache-Control': 'no-cache' });
      if (req.method === 'HEAD') res.end();
      else fs.createReadStream(target).pipe(res);
      return;
    }
    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`PlayHub CI Report Portal READY at http://127.0.0.1:${port}/`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer();
}
