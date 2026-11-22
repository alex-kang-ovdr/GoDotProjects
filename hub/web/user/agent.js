// PlayHub Built-in AI Studio Controller (/?view=agent)
// Surfaces Hub-Agent Chat, 3D Modeling (.glb), Project Porting (Roblox/Unity/Unreal -> Godot 4.7.2),
// Free Trial / Pro Weekly Quota bar, PlayCoin Overage receipts, and optional 0-coin BYOK.

(function () {
  'use strict';

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const PORTING_SAMPLES = {
    roblox: {
      name: 'RobloxObbyCheckpoint',
      code: `local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")

local checkpoint = workspace:WaitForChild("CheckpointPad")
checkpoint.Touched:Connect(function(hit)
  local plr = Players:GetPlayerFromCharacter(hit.Parent)
  if plr then
    plr:SetAttribute("Stage", 2)
  end
end)`
    },
    unity: {
      name: 'UnityArenaMover',
      code: `using UnityEngine;

public class ArenaMover : MonoBehaviour {
    [SerializeField] private float speed = 7.0f;
    private Rigidbody rb;
    void Start() { rb = GetComponent<Rigidbody>(); }
    void FixedUpdate() {
        Vector3 dir = new Vector3(Input.GetAxis("Horizontal"), 0f, Input.GetAxis("Vertical"));
        rb.MovePosition(rb.position + dir * (speed * Time.fixedDeltaTime));
    }
}`
    },
    unreal: {
      name: 'UnrealJumpPadActor',
      code: `class AJumpPadActor : public AActor {
  UPROPERTY(EditAnywhere)
  float LaunchVelocityZ = 950.0f;
  UFUNCTION()
  void OnOverlapBegin(ACharacter* OtherChar) {
    if (OtherChar) OtherChar->LaunchCharacter(FVector(0, 0, LaunchVelocityZ), false, true);
  }
};`
    }
  };

  function formatReceipt(b) {
    if (!b) return '';
    if (b.authMode === 'user_byok') {
      return `본인 API 키 연동 (${b.provider}) · 기본 한도 0 · PlayCoin 0 차감`;
    }
    const tu = b.tokenUsage || {};
    const parts = [
      `토큰 ${Number(tu.totalTokens || 0).toLocaleString()} (입력 ${tu.inputTokens || 0} / 캐시 ${tu.cachedTokens || 0} / 출력·추론 ${(tu.outputTokens || 0) + (tu.thinkingTokens || 0)})`,
      `가중 ${Number(tu.weightedTokens || 0).toLocaleString()}`
    ];
    if (tu.quotaTokensUsed > 0) {
      parts.push(`${b.planTier === 'pro' ? 'Pro 주간 한도' : 'Free 체험 한도'} -${Number(tu.quotaTokensUsed).toLocaleString()}`);
    }
    parts.push(b.chargedCoins > 0 ? `🪙 PlayCoin -${b.chargedCoins} 차감` : '🪙 PlayCoin 0 차감');
    return parts.join(' · ');
  }

  // Lightweight 2D isometric/perspective wireframe + shaded preview of MeshRecipe v1 on HTML5 Canvas
  function startRecipePreview(canvas, recipe) {
    if (!canvas || !recipe?.parts?.length) return () => {};
    const ctx = canvas.getContext('2d');
    let rafId = 0;
    let angle = 0.5;
    let alive = true;

    function draw() {
      if (!alive || !canvas.isConnected) return;
      const w = canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1);
      const h = canvas.height = canvas.clientHeight * (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, w, h);

      angle += 0.012;
      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      const scale = Math.min(w, h) * 0.24;
      const cx = w * 0.5, cy = h * 0.72;

      const projected = recipe.parts.map(p => {
        const [x, y, z] = p.position;
        const rx = x * cosA - y * sinA;
        const ry = x * sinA + y * cosA;
        return { part: p, rx, ry, z };
      }).sort((a, b) => a.ry - b.ry);

      for (const item of projected) {
        const { part, rx, ry, z } = item;
        const sx = Math.max(8, part.scale[0] * scale);
        const sz = Math.max(8, part.scale[2] * scale);
        const px = cx + rx * scale;
        const py = cy - z * scale + ry * scale * 0.22;

        ctx.save();
        ctx.fillStyle = part.color || '#6366f1';
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = Math.max(1, (window.devicePixelRatio || 1));
        if (part.shape === 'sphere' || part.shape === 'icosphere' || part.shape === 'torus') {
          ctx.beginPath();
          ctx.ellipse(px, py, sx * 0.5, sz * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.roundRect(px - sx * 0.5, py - sz * 0.5, sx, sz, 4);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }
      rafId = requestAnimationFrame(draw);
    }
    rafId = requestAnimationFrame(draw);
    return () => { alive = false; cancelAnimationFrame(rafId); };
  }

  function mount(root, { api, toast, navigate, session }) {
    let activeTab = 'chat';
    let statusData = null;
    let usageData = null;
    let chatMessages = [
      { role: 'assistant', content: '안녕하세요! PlayHub 내장 Gemini 에이전트입니다. 게임 기획·GDScript 코드·3D 모델링·프로젝트 포팅을 도와드릴게요.', receipt: '' }
    ];
    let latestModelResult = null;
    let latestPortResult = null;
    let stopPreview = null;
    const byokState = { provider: '', apiKey: '', model: '' };

    function cleanup() {
      if (stopPreview) { stopPreview(); stopPreview = null; }
    }

    function currentByok() {
      if (!byokState.provider || !byokState.apiKey.trim()) return null;
      return {
        provider: byokState.provider,
        apiKey: byokState.apiKey.trim(),
        ...(byokState.model.trim() ? { model: byokState.model.trim() } : {})
      };
    }

    async function refreshStatusAndHeader() {
      try {
        statusData = await api('/api/hub-agent/status');
        void window.PlayHubBilling?.refreshHeaderBalance(api);
      } catch (err) {
        toast(err.message);
      }
    }

    function renderHeaderSummary() {
      const registered = session?.kind === 'registered';
      if (!registered) {
        return `<section class="surface">
          <h1>PlayHub AI 스튜디오 (Hub-Agent)</h1>
          <p>Free 계정 기본 체험 한도와 Pro 주간 포함 한도, 토큰 비례 PlayCoin 과금으로 AI 채팅 · 3D 모델링 · 프로젝트 포팅을 이용할 수 있습니다. 먼저 계정에 로그인해 주세요.</p>
          <div class="save-actions">
            <a class="button primary" href="/?view=account" data-route>로그인 / 회원가입하기</a>
          </div>
        </section>`;
      }

      const q = statusData?.quota;
      const w = statusData?.wallet;
      const p = statusData?.pricing;
      const isPro = statusData?.planTier === 'pro';
      const limit = q?.limitTokens || (isPro ? 500000 : 50000);
      const rem = q?.remainingTokens ?? limit;
      const pctRemaining = limit > 0 ? Math.round((rem / limit) * 100) : 0;
      const agentReadyBadge = statusData?.available
        ? `<span class="state-label state-approved">내장 Gemini 연결됨 (${esc(statusData.defaultModel || 'gemini-3.5-flash')})</span>`
        : `<span class="state-label state-changes_requested">내장 Gemini 미연결 (본인 키 연동 또는 Admin 연결 필요)</span>`;

      return `<section class="surface">
        <div class="agent-hero">
          <div>
            <h1>PlayHub AI 스튜디오</h1>
            <p class="muted">플랜 기본 포함 한도를 먼저 차감하며(0 코인), 한도 소진 후 초과분만 가중 ${Number(p?.tokensPerCoin || 2000).toLocaleString()}토큰당 1 PlayCoin이 차감됩니다.</p>
          </div>
          <div>${agentReadyBadge}</div>
        </div>

        <div class="agent-quota-grid">
          <div class="agent-stat-card">
            <span class="agent-stat-label">${isPro ? 'Pro 주간 포함 AI 한도 (월요일 00:00 KST 리셋)' : 'Free 기본 AI 체험 한도 (가입 1회 제공)'}</span>
            <strong>${Number(rem).toLocaleString()} / ${Number(limit).toLocaleString()} 토큰</strong>
            <div class="agent-meter-bar"><div class="agent-meter-fill" style="width:${pctRemaining}%"></div></div>
          </div>
          <div class="agent-stat-card">
            <span class="agent-stat-label">내 지갑 보유 PlayCoin (초과 시 자동 차감)</span>
            <strong>🪙 ${Number(w?.available || 0).toLocaleString()} PlayCoin</strong>
            <div style="margin-top:6px;display:flex;gap:8px;font-size:12px">
              <a href="/?view=billing" data-route>충전 (+25% 보너스)</a>
              <span>·</span>
              <a href="/?view=wallet" data-route>지갑/구독 관리</a>
            </div>
          </div>
          <div class="agent-stat-card">
            <span class="agent-stat-label">현재 과금 모드</span>
            <strong>${currentByok() ? `본인 키 (${esc(byokState.provider)}) · 0 코인` : '내장 Gemini (포함 한도 → PlayCoin)'}</strong>
            <p class="muted" style="margin:4px 0 0;font-size:12px">PlayForge 에디터 AI Chat · 3D · 포팅과 한도/지갑 공유</p>
          </div>
        </div>

        <details class="agent-byok-bar" ${currentByok() ? 'open' : ''}>
          <summary style="cursor:pointer;font-weight:700;font-size:13px">본인 AI 계정(API Key) 연동 설정 — 연동 시 포함 한도·PlayCoin 차감 없음 (0 코인)</summary>
          <div class="agent-byok-fields">
            <label>공급자
              <select id="hub-byok-provider">
                <option value="" ${byokState.provider === '' ? 'selected' : ''}>사용 안 함 (PlayHub 내장 Gemini 사용)</option>
                <option value="gemini" ${byokState.provider === 'gemini' ? 'selected' : ''}>Gemini API Key (AIza...)</option>
                <option value="openai" ${byokState.provider === 'openai' ? 'selected' : ''}>OpenAI API Key (sk-...)</option>
                <option value="anthropic" ${byokState.provider === 'anthropic' ? 'selected' : ''}>Anthropic Claude API Key</option>
              </select>
            </label>
            <label>본인 API Key (브라우저 메모리에만 유지)
              <input id="hub-byok-key" type="password" value="${esc(byokState.apiKey)}" placeholder="API 키 입력">
            </label>
            <label>모델 ID (선택)
              <input id="hub-byok-model" type="text" value="${esc(byokState.model)}" placeholder="비워두면 기본 모델">
            </label>
          </div>
        </details>
      </section>`;
    }

    function renderBody() {
      if (session?.kind !== 'registered') {
        root.innerHTML = `<div class="page agent-page">${renderHeaderSummary()}</div>`;
        return;
      }

      let panelHtml = '';
      if (activeTab === 'chat') {
        panelHtml = `<section class="surface">
          <h2>허브 내장 에이전트 채팅</h2>
          <div id="agent-chat-log" class="agent-chat-log">
            ${chatMessages.map(m => `<div class="agent-msg ${esc(m.role)}">${esc(m.content)}${m.receipt ? `<div class="agent-receipt">${esc(m.receipt)}</div>` : ''}</div>`).join('')}
          </div>
          <form id="agent-chat-form" class="agent-form-row">
            <textarea id="agent-chat-input" rows="2" maxlength="8000" placeholder="Godot 4.7 GDScript 작성, 게임 밸런스 설계, 멀티플레이 구조 등을 질문하세요…" required></textarea>
            <button type="submit" class="button primary" id="agent-chat-send">전송</button>
          </form>
        </section>`;
      } else if (activeTab === 'modeling') {
        panelHtml = `<section class="surface">
          <h2>AI 3D 모델링 생성 (MeshRecipe v1 → glTF 2.0 .glb)</h2>
          <div class="agent-split">
            <form id="agent-model-form" style="display:grid;gap:10px;align-content:start">
              <label>3D 모델 자연어 설명
                <textarea id="agent-model-prompt" class="agent-textarea" rows="3" maxlength="2000" placeholder="예: 파란 에너지 코어와 황금 어깨 장갑을 가진 스타일라이즈드 전투 로봇" required>${esc(latestModelResult?.promptText || '')}</textarea>
              </label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <label>비주얼 스타일
                  <select id="agent-model-style">
                    <option value="stylized">Stylized (캐주얼 PBR)</option>
                    <option value="low-poly">Low-Poly 아케이드</option>
                    <option value="sci-fi">Sci-Fi 메카닉</option>
                    <option value="fantasy">Fantasy 중세/마법</option>
                  </select>
                </label>
                <label>에셋 이름 (영문 선택)
                  <input id="agent-model-name" type="text" maxlength="40" placeholder="GuardianBot">
                </label>
              </div>
              <div class="save-actions">
                <button type="submit" class="button primary" id="agent-model-btn">3D 모델 생성 (.glb)</button>
                ${latestModelResult ? `<button type="button" class="button secondary" id="agent-glb-download-btn">.glb 파일 다운로드 (${Math.round(latestModelResult.metrics.byteLength / 1024)} KB)</button>` : ''}
              </div>
              ${latestModelResult ? `<p class="agent-receipt">${esc(latestModelResult.receiptText)} · ${latestModelResult.metrics.partCount}개 파트 / ${latestModelResult.metrics.triangleCount} Triangles</p>` : ''}
            </form>
            <div>
              <canvas id="agent-3d-canvas" class="agent-3d-canvas"></canvas>
              <p class="muted" style="margin:6px 0 0;font-size:12px">${latestModelResult ? esc(latestModelResult.recipe.summary) : '생성 후 실시간 3D 파트 프리뷰와 Godot 4.7.2 호환 .glb 다운로드가 활성화됩니다.'}</p>
            </div>
          </div>
        </section>`;
      } else if (activeTab === 'porting') {
        panelHtml = `<section class="surface">
          <h2>AI 프로젝트 포팅 (Roblox · Unity · Unreal → Godot 4.7.2)</h2>
          <div class="agent-chip-row">
            <button type="button" class="agent-chip" data-port-sample="roblox">예제 불러오기: Roblox Luau</button>
            <button type="button" class="agent-chip" data-port-sample="unity">예제 불러오기: Unity C#</button>
            <button type="button" class="agent-chip" data-port-sample="unreal">예제 불러오기: Unreal AActor</button>
          </div>
          <form id="agent-port-form" style="display:grid;gap:10px">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <label>원본 엔진
                <select id="agent-port-engine">
                  <option value="roblox">Roblox (Luau / RBXLX)</option>
                  <option value="unity">Unity (C# MonoBehaviour)</option>
                  <option value="unreal">Unreal Engine 5 (Blueprint / C++)</option>
                </select>
              </label>
              <label>타깃 프로젝트 이름
                <input id="agent-port-name" type="text" maxlength="80" value="PortedGodotProject">
              </label>
            </div>
            <label>원본 스크립트 / 씬 코드
              <textarea id="agent-port-code" class="agent-textarea" rows="6" placeholder="변환할 원본 엔진 스크립트를 붙여넣으세요." required></textarea>
            </label>
            <div class="save-actions">
              <button type="submit" class="button primary" id="agent-port-btn">Godot 4.7.2 포팅 실행</button>
              <a class="button secondary" href="/forge/OfficialGodot/">PlayForge 에디터에서 포팅 스튜디오 열기</a>
            </div>
          </form>
          ${latestPortResult ? `<div style="margin-top:14px">
            <strong>${esc(latestPortResult.projectName)} — 변환 완료 (${latestPortResult.files.length}개 파일)</strong>
            <p class="agent-receipt">${esc(latestPortResult.receiptText)}</p>
            <div class="agent-chip-row" id="agent-port-file-tabs">
              ${latestPortResult.files.map((f, idx) => `<button type="button" class="agent-chip" data-file-idx="${idx}">${esc(f.path)}</button>`).join('')}
            </div>
            <pre id="agent-port-viewer" class="agent-code-pre">${esc(latestPortResult.files[0]?.content || '')}</pre>
          </div>` : ''}
        </section>`;
      } else {
        const records = usageData?.records || [];
        panelHtml = `<section class="surface">
          <h2>내 AI 토큰 및 PlayCoin 차감 내역</h2>
          <div style="overflow-x:auto">
            <table class="agent-table">
              <thead>
                <tr>
                  <th>시각</th>
                  <th>기능</th>
                  <th>모드</th>
                  <th>모델</th>
                  <th>실측 토큰</th>
                  <th>가중 토큰</th>
                  <th>포함 한도 사용</th>
                  <th>PlayCoin 차감</th>
                </tr>
              </thead>
              <tbody>
                ${records.length ? records.map(r => `<tr>
                  <td>${esc(new Date(r.createdAt).toLocaleString('ko-KR'))}</td>
                  <td>${esc(r.feature)}</td>
                  <td>${r.authMode === 'user_byok' ? '본인 키 (0 코인)' : esc(r.planTier.toUpperCase())}</td>
                  <td>${esc(r.model)}</td>
                  <td>${Number(r.totalTokens).toLocaleString()}</td>
                  <td>${Number(r.weightedTokens).toLocaleString()}</td>
                  <td>${Number(r.quotaTokensUsed).toLocaleString()}</td>
                  <td>🪙 ${Number(r.chargedCoins).toLocaleString()}</td>
                </tr>`).join('') : '<tr><td colspan="8">아직 AI 사용 내역이 없습니다.</td></tr>'}
              </tbody>
            </table>
          </div>
        </section>`;
      }

      cleanup();
      root.innerHTML = `<div class="page agent-page">
        ${renderHeaderSummary()}
        <div class="agent-tabs" role="tablist" aria-label="AI 기능 선택">
          <button type="button" class="agent-tab-btn" role="tab" data-agent-tab="chat" aria-selected="${activeTab === 'chat'}">허브 AI 채팅</button>
          <button type="button" class="agent-tab-btn" role="tab" data-agent-tab="modeling" aria-selected="${activeTab === 'modeling'}">3D 모델링 생성</button>
          <button type="button" class="agent-tab-btn" role="tab" data-agent-tab="porting" aria-selected="${activeTab === 'porting'}">프로젝트 포팅</button>
          <button type="button" class="agent-tab-btn" role="tab" data-agent-tab="usage" aria-selected="${activeTab === 'usage'}">토큰·코인 내역</button>
        </div>
        ${panelHtml}
      </div>`;

      bindEvents();
      if (activeTab === 'modeling' && latestModelResult?.recipe) {
        stopPreview = startRecipePreview(root.querySelector('#agent-3d-canvas'), latestModelResult.recipe);
      }
    }

    function bindEvents() {
      root.querySelectorAll('[data-agent-tab]').forEach(btn => {
        btn.onclick = async () => {
          activeTab = btn.dataset.agentTab;
          if (activeTab === 'usage') {
            try { usageData = await api('/api/hub-agent/usage'); } catch {}
          }
          renderBody();
        };
      });

      const byokProv = root.querySelector('#hub-byok-provider');
      const byokKey = root.querySelector('#hub-byok-key');
      const byokMod = root.querySelector('#hub-byok-model');
      if (byokProv) byokProv.onchange = () => { byokState.provider = byokProv.value; renderBody(); };
      if (byokKey) byokKey.oninput = () => { byokState.apiKey = byokKey.value; };
      if (byokMod) byokMod.oninput = () => { byokState.model = byokMod.value; };

      const chatForm = root.querySelector('#agent-chat-form');
      if (chatForm) {
        chatForm.onsubmit = async e => {
          e.preventDefault();
          const input = root.querySelector('#agent-chat-input');
          const sendBtn = root.querySelector('#agent-chat-send');
          const text = input.value.trim();
          if (!text) return;
          chatMessages.push({ role: 'user', content: text });
          input.value = '';
          renderBody();
          sendBtn.disabled = true;
          try {
            const out = await api('/api/hub-agent/chat', {
              method: 'POST',
              timeout: 120000,
              body: {
                messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
                byok: currentByok()
              }
            });
            chatMessages.push({
              role: 'assistant',
              content: out.message?.content || '',
              receipt: formatReceipt(out.billing)
            });
            await refreshStatusAndHeader();
          } catch (err) {
            toast(err.message);
            chatMessages.push({ role: 'assistant', content: `오류: ${err.message}`, receipt: 'PlayCoin 미차감' });
          } finally {
            renderBody();
          }
        };
      }

      const modelForm = root.querySelector('#agent-model-form');
      if (modelForm) {
        modelForm.onsubmit = async e => {
          e.preventDefault();
          const promptText = root.querySelector('#agent-model-prompt').value.trim();
          const style = root.querySelector('#agent-model-style').value;
          const name = root.querySelector('#agent-model-name').value.trim();
          const btn = root.querySelector('#agent-model-btn');
          btn.disabled = true;
          btn.textContent = '3D 모델 설계 및 .glb 컴파일 중…';
          try {
            const out = await api('/api/hub-agent/modeling', {
              method: 'POST',
              timeout: 150000,
              body: { prompt: promptText, style, name, byok: currentByok() }
            });
            latestModelResult = {
              ...out,
              promptText,
              receiptText: formatReceipt(out.billing)
            };
            await refreshStatusAndHeader();
          } catch (err) {
            toast(err.message);
          } finally {
            renderBody();
          }
        };
      }

      const dlGlbBtn = root.querySelector('#agent-glb-download-btn');
      if (dlGlbBtn && latestModelResult?.glbBase64) {
        dlGlbBtn.onclick = () => {
          const bytes = Uint8Array.from(atob(latestModelResult.glbBase64), c => c.charCodeAt(0));
          const blob = new Blob([bytes], { type: 'model/gltf-binary' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = latestModelResult.filename || 'model.glb';
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        };
      }

      root.querySelectorAll('[data-port-sample]').forEach(btn => {
        btn.onclick = () => {
          const key = btn.dataset.portSample;
          const s = PORTING_SAMPLES[key];
          if (!s) return;
          root.querySelector('#agent-port-engine').value = key;
          root.querySelector('#agent-port-name').value = s.name;
          root.querySelector('#agent-port-code').value = s.code;
        };
      });

      const portForm = root.querySelector('#agent-port-form');
      if (portForm) {
        portForm.onsubmit = async e => {
          e.preventDefault();
          const sourceEngine = root.querySelector('#agent-port-engine').value;
          const projectName = root.querySelector('#agent-port-name').value.trim();
          const sourceCode = root.querySelector('#agent-port-code').value.trim();
          const btn = root.querySelector('#agent-port-btn');
          btn.disabled = true;
          btn.textContent = 'Godot 4.7.2 프로젝트 변환 중…';
          try {
            const out = await api('/api/hub-agent/porting', {
              method: 'POST',
              timeout: 150000,
              body: { sourceEngine, projectName, sourceCode, byok: currentByok() }
            });
            latestPortResult = {
              ...out,
              receiptText: formatReceipt(out.billing)
            };
            await refreshStatusAndHeader();
          } catch (err) {
            toast(err.message);
          } finally {
            renderBody();
          }
        };
      }

      root.querySelectorAll('[data-file-idx]').forEach(btn => {
        btn.onclick = () => {
          const idx = Number(btn.dataset.fileIdx);
          const viewer = root.querySelector('#agent-port-viewer');
          if (viewer && latestPortResult?.files?.[idx]) {
            viewer.textContent = latestPortResult.files[idx].content;
          }
        };
      });
    }

    (async () => {
      await refreshStatusAndHeader();
      renderBody();
    })();

    return cleanup;
  }

  window.PlayHubAgentUI = { mount };
})();
