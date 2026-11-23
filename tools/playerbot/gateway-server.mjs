// PlayHub PlayerBot — Zone 4 Standalone Gateway & Static Web Server (Node 24)
// Hosts games/this-war-of-mine/Web/ + /api/playerbot/* (chat, appeal, erase, health, metrics)
// API keys remain strictly on the server (never exposed to browser client).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSafetyPipeline } from './safety-pipeline.mjs';
import { createMemoryStore } from './memory-store.mjs';
import { createProviderRouter, createBudgetTracker } from './provider-router.mjs';
import { createGeminiOAuthManager } from './gemini-oauth.mjs';
import { runHeadlessBatch } from './headless-sim.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GAME_WEB_DIR = path.join(REPO_ROOT, 'games', 'playerbot-last-light', 'Web');
const RIMWORLD_WEB_DIR = path.join(REPO_ROOT, 'games', 'playerbot-frontier-colony', 'Web');
const DEFAULT_DATA_DIR = path.join(REPO_ROOT, 'artifacts');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function readJsonBody(req, maxBytes = 256 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) { reject(new Error('PAYLOAD_TOO_LARGE')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(new Error('INVALID_JSON')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

export function createPlayerBotGateway({ env = process.env, staticDir = GAME_WEB_DIR, rimworldDir = RIMWORLD_WEB_DIR, dataDir = DEFAULT_DATA_DIR, utcNow = () => Date.now(), fetchImpl = globalThis.fetch } = {}) {
  const safety = createSafetyPipeline({ utcNow });
  const memory = createMemoryStore({ utcNow });
  const budget = createBudgetTracker();
  const geminiOAuth = createGeminiOAuthManager({ dataDir, platformRoot: REPO_ROOT, env, fetchImpl, utcNow });
  const router = createProviderRouter({ env, fetchImpl, budget, geminiOAuth });
  const latencies = [];

  async function handleRequest(req, res) {
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const hostHeader = req.headers.host || '127.0.0.1:18190';
    const origin = `${proto}://${hostHeader}`;
    const url = new URL(req.url || '/', origin);

    if (req.method === 'GET' && url.pathname === '/api/playerbot/health') {
      const oauthStatus = geminiOAuth.getStatus();
      return sendJson(res, 200, {
        ok: true,
        service: 'playerbot-gateway',
        version: '0.3.0-poc',
        games: {
          playerbot_last_light: '/playerbot-last-light/',
          playerbot_frontier_colony: '/playerbot-frontier-colony/',
        },
        providers_configured: {
          openai: Boolean(env.OPENAI_API_KEY),
          gemini: oauthStatus.connected,
          gemini_oauth: oauthStatus.active_mode === 'google-oauth2' || oauthStatus.active_mode === 'gemini-cli-oauth',
          local_nlu_fallback: true,
        },
        gemini_oauth: oauthStatus,
        utc_server_ms: utcNow(),
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/playerbot/oauth/gemini/status') {
      return sendJson(res, 200, { ok: true, status: geminiOAuth.getStatus() });
    }

    if (req.method === 'POST' && url.pathname === '/api/playerbot/oauth/gemini/config') {
      let body;
      try { body = await readJsonBody(req); }
      catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
      const status = geminiOAuth.saveConfig(body);
      return sendJson(res, 200, { ok: true, status });
    }

    if (req.method === 'POST' && url.pathname === '/api/playerbot/oauth/gemini/start') {
      let body = {};
      try { body = await readJsonBody(req); } catch {}
      const result = await geminiOAuth.startOAuth({
        origin,
        clientId: body?.clientId,
        clientSecret: body?.clientSecret,
      });
      return sendJson(res, 200, result);
    }

    if (req.method === 'GET' && url.pathname === '/api/playerbot/oauth/gemini/login') {
      const result = await geminiOAuth.startOAuth({ origin });
      if (result.ok && result.connect_url) {
        res.writeHead(302, { Location: result.connect_url, 'Cache-Control': 'no-store' });
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gemini OAuth 설정 안내</title></head><body style="background:#12191d;color:#e4e5df;font:14px/1.6 sans-serif;padding:28px;max-width:600px;margin:0 auto"><h2 style="color:#f0d6b2">Google OAuth Client ID 설정 필요</h2><p>${result.error || 'OAuth Client ID가 아직 등록되지 않았습니다.'}</p><p>1) <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener" style="color:#8fd3e8">Google Cloud OAuth Credentials</a>에서 승인된 리디렉션 URI로 아래 주소를 등록하세요:</p><pre style="background:#1a262d;padding:10px;border-radius:6px;overflow:auto">${result.redirect_uri || `${origin}/api/playerbot/oauth/gemini/callback`}</pre><p>2) 또는 <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style="color:#8fd3e8">Google AI Studio</a>에서 API 키를 발급받아 게임 상단 🔑 AI OAuth 패널에 입력하면 즉시 연결됩니다.</p><p><button onclick="window.close()" style="padding:8px 14px;border-radius:6px;border:1px solid #486474;background:#203440;color:#e5e8e3;cursor:pointer">창 닫고 게임으로 돌아가기</button></p></body></html>`);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/playerbot/headless-sim') {
      let body = {};
      try { body = await readJsonBody(req); }
      catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
      const summary = await runHeadlessBatch({
        game: body.game || 'auto',
        runs: Math.max(1, Math.min(5, Number(body.runs) || 1)),
        seed: Number(body.seed) || 20261123,
        difficulty: body.difficulty || 'standard',
        maxDays: Math.max(1, Math.min(12, Number(body.maxDays) || 12)),
        maxSimSeconds: Math.max(60, Math.min(3600, Number(body.maxSimSeconds) || 1800)),
      });
      return sendJson(res, 200, summary);
    }

    if (req.method === 'GET' && url.pathname === '/api/playerbot/oauth/gemini/callback') {
      const result = await geminiOAuth.handleOAuthCallback({
        code: url.searchParams.get('code'),
        state: url.searchParams.get('state'),
        error: url.searchParams.get('error'),
      });
      res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Gemini OAuth</title></head><body style="background:#12191d;color:#e4e5df;font-family:sans-serif;padding:32px;text-align:center"><h2>${result.ok ? 'Gemini OAuth 연결 완료' : 'Gemini OAuth 연결 실패'}</h2><p>${result.ok ? `${result.email || 'Google 계정'}이 연결되었습니다. 이 창을 닫고 게임으로 돌아가세요.` : result.error}</p><script>if(window.opener){window.opener.postMessage({type:'playerbot-gemini-oauth',ok:${Boolean(result.ok)}},'*');}setTimeout(()=>window.close(),1800);</script></body></html>`);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/playerbot/oauth/gemini/disconnect') {
      return sendJson(res, 200, { ok: true, status: geminiOAuth.disconnect() });
    }

    if (req.method === 'GET' && url.pathname === '/api/playerbot/metrics') {
      const sorted = [...latencies].sort((a, b) => a - b);
      const pct = p => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0);
      return sendJson(res, 200, {
        ok: true,
        budget: budget.usage,
        latency_ms: { count: sorted.length, p50: pct(0.5), p95: pct(0.95) },
        tombstones: memory.getTombstones().length,
        audit_events: safety.getAuditLog().length,
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/playerbot/chat') {
      const started = performance.now();
      let body;
      try { body = await readJsonBody(req); }
      catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }

      const userId = String(body.user_id || 'local-user');
      const botId = String(body.bot_id || 'yun');
      const text = String(body.text || '');
      const ageMode = body.age_mode === 'adult_extended' ? 'adult_extended' : 'minor_game_only';
      const artificialDelayMs = Math.max(0, Math.min(3000, Number(body.artificial_delay_ms || 0)));

      // 1. 3-Layer Safety Gate
      const safetyResult = safety.evaluate({
        userId,
        text,
        context: { age_mode: ageMode, phase: body.observation?.phase, genre: 'survival_stealth' },
      });
      if (!safetyResult.allowed) {
        const latencyMs = Math.round(performance.now() - started);
        return sendJson(res, 200, {
          ok: true,
          blocked: true,
          safety: safetyResult,
          proposed_intent: null,
          reply_text: safetyResult.message,
          latency_ms: latencyMs,
          metadata: { ai_generated: false, policy_mode: ageMode, commit_status: 'blocked_by_safety', utc_server_ms: utcNow() },
        });
      }

      // Optional artificial delay injection for T05 stale_state testing
      if (artificialDelayMs > 0) {
        await new Promise(r => setTimeout(r, artificialDelayMs));
      }

      // 2. Session Memory + Multi-LLM / Local NLU Routing
      const sessionContext = memory.getSessionContext(userId, botId);
      const routed = await router.route({
        botId,
        observation: body.observation || {},
        sessionContext,
        userText: safetyResult.normalized || text,
        expectedRevision: body.expected_revision || null,
        ageMode,
        timeoutMs: 3000,
      });

      memory.recordTurn(userId, {
        botId,
        userText: safetyResult.normalized || text,
        botReply: routed.reply_text,
        unverifiedClaim: routed.unverified_claim,
      });

      const latencyMs = Math.round(performance.now() - started);
      latencies.push(latencyMs);
      if (latencies.length > 200) latencies.shift();

      return sendJson(res, 200, {
        ok: true,
        blocked: false,
        safety: safetyResult,
        proposed_intent: routed.proposed_intent,
        is_renewal: routed.is_renewal,
        renew_ms: routed.renew_ms,
        reply_text: routed.reply_text,
        unverified_claim: routed.unverified_claim,
        latency_ms: latencyMs,
        token_usage: routed.token_usage,
        budget: budget.usage,
        // EU AI Act Art. 50 machine-readable synthetic output metadata
        metadata: {
          ai_generated: true,
          model_id: routed.model_id,
          source: routed.source,
          policy_mode: ageMode,
          lore_entries_used: routed.lore_count,
          utc_server_ms: utcNow(),
        },
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/playerbot/appeal') {
      let body;
      try { body = await readJsonBody(req); }
      catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
      const result = safety.submitAppeal({ userId: String(body.user_id || 'local-user'), reason: body.reason });
      return sendJson(res, 200, result);
    }

    if (req.method === 'POST' && url.pathname === '/api/playerbot/erase') {
      let body;
      try { body = await readJsonBody(req); }
      catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
      const tombstone = memory.eraseUserData(String(body.user_id || 'local-user'));
      return sendJson(res, 200, { ok: true, tombstone });
    }

    // Research Hub landing page at / + separated standalone PoC games (/playerbot-last-light/ & /playerbot-frontier-colony/)
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (url.pathname === '/') {
        const oa = geminiOAuth.getStatus();
        const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Forge PlayerBot Research Hub</title>
<style>body{margin:0;background:#10181d;color:#e5e8e3;font:14px/1.6 "Pretendard","Noto Sans KR",sans-serif;padding:28px 18px}.wrap{max-width:920px;margin:0 auto}h1{margin:0 0 6px;font-size:24px;color:#f0d6b2}.sub{color:#94a8b3;margin:0 0 22px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:16px}.card{background:#18242b;border:1px solid #334854;border-radius:10px;padding:18px;display:flex;flex-direction:column;gap:10px}.tag{display:inline-block;width:fit-content;font-size:11px;padding:2px 8px;border-radius:999px;background:#223845;color:#9cd4e6}.card h2{margin:0;font-size:18px;color:#f2e7d5}.card p{margin:0;color:#a9bac2;font-size:13px;flex:1}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}.btn{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:600;border:1px solid #446070;background:#203440;color:#e8ece8;cursor:pointer}.btn:hover{border-color:#dda36e;background:#294352}.btn.auto{background:#2d402f;border-color:#689e6b;color:#dff6df}.panel{margin-top:18px;padding:16px;background:#142027;border:1px solid #2b3e49;border-radius:10px}.panel h3{margin:0 0 8px;font-size:15px;color:#f0d6b2}.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}select,input{background:#10191f;color:#e5e8e3;border:1px solid #354c59;border-radius:6px;padding:6px 10px;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}th,td{border-bottom:1px solid #263944;padding:7px 6px;text-align:left}th{color:#94a8b3}.meta{margin-top:14px;padding:12px 14px;background:#142027;border:1px solid #2b3e49;border-radius:8px;font-size:12px;color:#9eb3be}</style></head>
<body><div class="wrap"><h1>Forge PlayerBot 리서치 PoC 허브</h1><p class="sub">원본 게임과 분리된 독립 PlayerBot 샘플 2종 · 0.5×~20× 가속 시뮬레이션 · Headless 무인 가속 실행 · 머리 위 토스트 대사 · Gemini OAuth</p>
<div class="grid">
<div class="card"><span class="tag">playerbot-last-light</span><h2>마지막 불빛 · PlayerBot</h2><p>낮 은신처 자율 운영 + 밤 실시간 동행 AI 봇 1기, 0.5×~20× 봇 전용 시뮬레이션, 2단계 커밋(T01~T20) 검증</p><div class="actions"><a class="btn" href="/playerbot-last-light/">게임 열기</a><a class="btn auto" href="/playerbot-last-light/?autostart=1&speed=20">⚡ 20× 무인 자동 실행</a></div></div>
<div class="card"><span class="tag">playerbot-frontier-colony</span><h2>변방의 기록 · PlayerBot</h2><p>정착지 AI 봇(서윤·도현·미나), 0.5×~20× 가속 자동 건설·연구·방어 시뮬레이션, 머리 위 토스트 말풍선</p><div class="actions"><a class="btn" href="/playerbot-frontier-colony/">게임 열기</a><a class="btn auto" href="/playerbot-frontier-colony/?autostart=1&speed=20">⚡ 20× 무인 자동 실행</a></div></div>
</div>
<div class="panel"><h3>⚡ Headless 가속 시뮬레이션 (사용자 선택 없이 자동 실행)</h3><p style="margin:0 0 10px;color:#9eb3be;font-size:12px">브라우저 렌더링·클릭 없이 서버 Node 엔진에서 봇 전용 시뮬레이션을 최대 배속(1,000×~10,000×+)으로 즉시 실행합니다.</p>
<div class="row">
<select id="hl-game"><option value="auto">자동 선택 (2종 모두 실행)</option><option value="playerbot-last-light">마지막 불빛 · PlayerBot</option><option value="playerbot-frontier-colony">변방의 기록 · PlayerBot</option></select>
<label style="font-size:12px;color:#9eb3be">반복 <input id="hl-runs" type="number" min="1" max="5" value="1" style="width:52px"></label>
<label style="font-size:12px;color:#9eb3be">시드 <input id="hl-seed" type="number" value="20261123" style="width:105px"></label>
<button id="hl-run" class="btn auto" type="button">▶ Headless 자동 시뮬레이션 실행</button>
</div>
<div id="hl-out" style="margin-top:10px;font-size:12px;color:#9eb3be">버튼을 누르면 사용자 입력 없이 자동으로 전체 시뮬레이션이 완료됩니다.</div>
</div>
<div class="meta">Gemini OAuth 상태: <strong>${oa.connected ? `연결됨 (${oa.active_mode} · ${oa.email || oa.model})` : '미연결 (로컬 NLU 폴백 활성 — 각 게임 상단 🔑 AI OAuth 버튼에서 연결 가능)'}</strong></div>
</div>
<script>
document.getElementById('hl-run').addEventListener('click', async () => {
  const out = document.getElementById('hl-out');
  const btn = document.getElementById('hl-run');
  btn.disabled = true; out.textContent = 'Headless 가속 시뮬레이션 실행 중...';
  try {
    const resp = await fetch('/api/playerbot/headless-sim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game: document.getElementById('hl-game').value,
        runs: Number(document.getElementById('hl-runs').value || 1),
        seed: Number(document.getElementById('hl-seed').value || 20261123),
      }),
    });
    const data = await resp.json();
    if (!data.ok) { out.textContent = '오류: ' + (data.error || '실행 실패'); return; }
    const rows = data.results.map(r => '<tr><td>'+r.title+'</td><td>'+r.seed+'</td><td>'+r.outcome+'</td><td>'+r.days_survived+'일 ('+r.survivors_alive+'/'+r.survivors_total+'명)</td><td>'+r.simulated_seconds+'s</td><td>'+r.real_elapsed_ms+'ms</td><td><b>'+r.effective_speedup.toLocaleString()+'×</b></td></tr>').join('');
    out.innerHTML = '<div>완료: 총 '+data.total_runs+'회 · 총 시뮬 '+data.total_simulated_seconds+'s / 실소요 '+data.total_real_elapsed_ms+'ms · 평균 <b>'+data.aggregate_speedup.toLocaleString()+'×</b> 가속</div><table><thead><tr><th>게임</th><th>시드</th><th>결과</th><th>생존</th><th>시뮬 시간</th><th>실소요</th><th>유효 배속</th></tr></thead><tbody>'+rows+'</tbody></table>';
  } catch (e) { out.textContent = '요청 실패: ' + e.message; }
  finally { btn.disabled = false; }
});
</script></body></html>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        if (req.method === 'HEAD') { res.end(); return; }
        res.end(html);
        return;
      }

      if (url.pathname === '/last-light' || url.pathname === '/last-light/' || url.pathname === '/playerbot-last-light') {
        res.writeHead(302, { Location: '/playerbot-last-light/' });
        res.end();
        return;
      }
      if (url.pathname === '/frontier-colony' || url.pathname === '/frontier-colony/' || url.pathname === '/playerbot-frontier-colony') {
        res.writeHead(302, { Location: '/playerbot-frontier-colony/' });
        res.end();
        return;
      }

      let baseDir = staticDir;
      let relPath = url.pathname;
      if (relPath.startsWith('/playerbot-frontier-colony/')) {
        baseDir = rimworldDir;
        relPath = relPath.slice('/playerbot-frontier-colony'.length);
      } else if (relPath.startsWith('/frontier-colony/')) {
        baseDir = rimworldDir;
        relPath = relPath.slice('/frontier-colony'.length);
      } else if (relPath.startsWith('/playerbot-last-light/')) {
        relPath = relPath.slice('/playerbot-last-light'.length);
      } else if (relPath.startsWith('/last-light/')) {
        relPath = relPath.slice('/last-light'.length);
      }
      const reqPath = relPath === '/' ? '/index.html' : relPath;
      const safePath = path.normalize(reqPath).replace(/^(\.\.(\/|\\|$))+/, '');
      const fullPath = path.join(baseDir, safePath);
      if (!fullPath.startsWith(baseDir) || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }
      const ext = path.extname(fullPath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(fullPath).pipe(res);
      return;
    }

    sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch(err => {
      sendJson(res, 500, { ok: false, error: err?.message || 'INTERNAL_ERROR' });
    });
  });

  return { server, safety, memory, router, budget, geminiOAuth };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PLAYERBOT_PORT || 18190);
  const host = process.env.PLAYERBOT_HOST || '127.0.0.1';
  const { server } = createPlayerBotGateway();
  server.listen(port, host, () => {
    console.log(`[PlayerBot Gateway] LAST LIGHT & FRONTIER COLONY PoC listening on http://${host}:${port}/`);
  });
}
