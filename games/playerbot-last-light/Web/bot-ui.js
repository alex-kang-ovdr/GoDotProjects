// Last Light PlayerBot — Zone 1 Companion Chat, Tactical Quick Controls, Safety/Crisis/Appeal UI & Debug HUD
// Strictly enforces Two-Phase Commit: proposed_intent is committed BEFORE reply_text is displayed!

import { getBotPack } from './bot-packs.js';
import { getSafeRefusalText } from './bot-commit-gate.js';
import { classifyLocalSafety, parseKoreanIntent } from './bot-local-nlu.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createBotUiController({ container, runtime, getState, getExpedition, onStateChanged, toast }) {
  const uiState = {
    activeBotId: 'yun',
    ageMode: 'minor_game_only',
    debugOpen: true,
    artificialDelayMs: 0,
    sending: false,
    crisisCard: null,
    cooldownInfo: null,
    messages: [
      {
        role: 'system',
        text: 'AI 동료 봇(PoC)이 준비되었습니다. 프로그램 AI는 토큰 0으로 지속 실행되며, 자유 대화는 2단계 커밋 검증 후에만 행동 약속을 표시합니다.',
        badge: 'AI 고지 · EU AI Act 제50조 / 한국 AI 기본법',
      },
    ],
    lastLatencyMs: 0,
    lastModelId: 'local-nlu-fallback',
    lastTombstone: null,
    reqSeq: 1,
    gatewayOnline: null,
    oauthOpen: false,
    oauthStatus: { connected: false, active_mode: null, email: '', oauth_configured: false, model: 'gemini-2.5-flash-lite' },
  };

  async function refreshOAuthStatus() {
    try {
      const resp = await fetch('/api/playerbot/oauth/gemini/status');
      if (resp.ok) {
        const data = await resp.json();
        if (data.status) uiState.oauthStatus = data.status;
      }
    } catch {}
    render();
  }

  async function startGeminiOAuth() {
    const form = container?.querySelector('[data-bot-form="oauth"]');
    const clientId = form?.querySelector('[name="clientId"]')?.value?.trim() || '';
    const clientSecret = form?.querySelector('[name="clientSecret"]')?.value?.trim() || '';
    const popup = typeof window !== 'undefined' ? window.open('about:blank', 'gemini_oauth', 'width=540,height=680') : null;
    try {
      const resp = await fetch('/api/playerbot/oauth/gemini/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(clientId ? { clientId } : {}),
          ...(clientSecret ? { clientSecret } : {}),
        }),
      });
      const data = await resp.json();
      if (data.status) uiState.oauthStatus = data.status;
      if (data.ok && data.connect_url) {
        uiState.oauthConnectUrl = data.connect_url;
        uiState.oauthNotice = '';
        if (popup && !popup.closed) {
          popup.location.href = data.connect_url;
          toast?.('Google OAuth 로그인 창을 열었습니다. 인증을 완료해 주세요.', 'info');
        } else {
          uiState.oauthOpen = true;
          toast?.('브라우저 팝업이 차단되었습니다. 아래 [Google 로그인 페이지 열기] 링크를 눌러주세요.', 'info');
        }
      } else {
        if (popup && !popup.closed) popup.close();
        uiState.oauthOpen = true;
        uiState.oauthConnectUrl = '';
        uiState.oauthNotice = data.error || 'OAuth Client ID 또는 API 키/토큰 설정이 필요합니다.';
        toast?.(uiState.oauthNotice, 'bad');
      }
      render();
    } catch {
      if (popup && !popup.closed) popup.close();
      uiState.oauthNotice = '게이트웨이 서버에 연결할 수 없습니다.';
      toast?.(uiState.oauthNotice, 'bad');
      render();
    }
  }

  async function saveGeminiConfig(form) {
    const clientId = form.querySelector('[name="clientId"]')?.value || '';
    const clientSecret = form.querySelector('[name="clientSecret"]')?.value || '';
    const accessToken = form.querySelector('[name="accessToken"]')?.value || '';
    const apiKey = form.querySelector('[name="apiKey"]')?.value || '';
    const model = form.querySelector('[name="model"]')?.value || 'gemini-2.5-flash-lite';
    try {
      const resp = await fetch('/api/playerbot/oauth/gemini/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(clientId ? { clientId } : {}),
          ...(clientSecret ? { clientSecret } : {}),
          ...(accessToken ? { accessToken } : {}),
          ...(apiKey ? { apiKey } : {}),
          model,
        }),
      });
      const data = await resp.json();
      if (data.ok) {
        uiState.oauthStatus = data.status;
        toast?.('Gemini OAuth 설정이 서버에 안전하게 저장되었습니다.', 'good');
        render();
      }
    } catch {
      toast?.('설정 저장에 실패했습니다.', 'bad');
    }
  }

  async function disconnectGeminiOAuth() {
    try {
      const resp = await fetch('/api/playerbot/oauth/gemini/disconnect', { method: 'POST' });
      const data = await resp.json();
      if (data.status) uiState.oauthStatus = data.status;
      toast?.('Gemini OAuth 연결을 해제했습니다.', 'info');
      render();
    } catch {}
  }

  function resolveActiveBotId() {
    const state = getState();
    const exp = getExpedition();
    if (state?.phase === 'expedition' && exp?.companion) {
      uiState.activeBotId = exp.companion.id;
      return exp.companion.id;
    }
    return uiState.activeBotId || 'yun';
  }

  function pushMessage(entry) {
    uiState.messages.push({ ts: new Date().toLocaleTimeString('ko-KR', { hour12: false }), ...entry });
    if (uiState.messages.length > 30) uiState.messages.shift();
  }

  async function callGatewayOrLocal({ botId, text, observation, expectedRevision, requestKey }) {
    const started = performance.now();
    const payload = {
      user_id: 'local-user',
      bot_id: botId,
      text,
      age_mode: uiState.ageMode,
      observation,
      expected_revision: expectedRevision,
      request_key: requestKey,
      artificial_delay_ms: uiState.artificialDelayMs,
    };

    try {
      if (typeof fetch === 'function' && typeof location !== 'undefined' && location.protocol.startsWith('http')) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3200 + uiState.artificialDelayMs);
        try {
          const resp = await fetch('/api/playerbot/chat', {
            method: 'POST',
            signal: ctrl.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (resp.ok) {
            uiState.gatewayOnline = true;
            return await resp.json();
          }
        } finally {
          clearTimeout(timer);
        }
      }
    } catch {
      uiState.gatewayOnline = false;
    }

    // Offline / 3s timeout local fallback (still respects artificialDelayMs for T05 testing!)
    if (uiState.artificialDelayMs > 0) {
      await new Promise(r => setTimeout(r, uiState.artificialDelayMs));
    }
    const safety = classifyLocalSafety(text, { age_mode: uiState.ageMode, phase: observation?.phase });
    if (!safety.allowed) {
      return {
        ok: true,
        blocked: true,
        safety: {
          ...safety,
          message: safety.crisis_card?.message || (safety.verdict === 'game_context_only'
            ? '현재 [게임 맥락 한정 모드]라 생존·수색·전술 주제만 대화할 수 있습니다.'
            : '정책 경계로 대화 응답이 제한되었습니다. 전술 버튼과 프로그램 AI는 계속 동작합니다.'),
        },
        reply_text: safety.crisis_card?.message || '정책 경계로 응답을 보류했습니다.',
        latency_ms: Math.round(performance.now() - started),
        metadata: { ai_generated: false, model_id: 'local-safety', policy_mode: uiState.ageMode },
      };
    }
    const parsed = parseKoreanIntent(safety.normalized, { botId, observation, expectedRevision });
    return {
      ok: true,
      blocked: false,
      safety,
      proposed_intent: parsed.proposed_intent,
      is_renewal: parsed.is_renewal,
      renew_ms: parsed.renew_ms,
      reply_text: parsed.reply_text,
      unverified_claim: parsed.unverified_claim,
      latency_ms: Math.round(performance.now() - started),
      metadata: { ai_generated: true, model_id: 'local-nlu-fallback', policy_mode: uiState.ageMode },
    };
  }

  async function sendUserChat(rawText) {
    const text = String(rawText || '').trim();
    if (!text || uiState.sending) return;
    const botId = resolveActiveBotId();
    const requestKey = `req-${Date.now()}-${uiState.reqSeq++}`;
    const observation = runtime.adapter.observe(botId);
    const expectedRevision = runtime.adapter.getRevision(botId);

    uiState.sending = true;
    uiState.crisisCard = null;
    pushMessage({ role: 'user', text });
    render();

    try {
      const resp = await callGatewayOrLocal({ botId, text, observation, expectedRevision, requestKey });
      uiState.lastLatencyMs = resp.latency_ms ?? 0;
      uiState.lastModelId = resp.metadata?.model_id || 'local-nlu-fallback';

      if (resp.blocked) {
        if (resp.safety?.crisis_card) {
          uiState.crisisCard = resp.safety.crisis_card;
          pushMessage({ role: 'crisis', text: resp.safety.crisis_card.message, badge: '위기 지원 · 위반 미기록' });
        } else {
          if (resp.safety?.appeal_eligible || resp.safety?.stage >= 3) {
            uiState.cooldownInfo = resp.safety;
          }
          pushMessage({ role: 'safety', text: resp.reply_text || resp.safety?.message, badge: `안전 필터 (${resp.safety?.verdict || 'blocked'})` });
        }
        render();
        return;
      }

      // Zone 3 Two-Phase Commit: validate & commit proposed_intent BEFORE revealing reply_text!
      let receipt = null;
      if (resp.is_renewal) {
        receipt = runtime.renewConstraint(botId, resp.renew_ms || 10000, requestKey);
      } else if (resp.proposed_intent) {
        const intentWithRev = { ...resp.proposed_intent, expected_revision: expectedRevision };
        receipt = runtime.commitIntent(botId, intentWithRev, { actor_id: 'player', user_id: 'local-user', team_id: 'survivors', role_rank: 'OWNER' }, { request_key: requestKey });
      }

      const pack = getBotPack(botId);
      const botName = pack?.identity?.name || botId;
      if (receipt && !receipt.accepted) {
        // 2PC INVARIANT (T05): Discard LLM promise reply_text and replace with safe deterministic refusal!
        const safeText = receipt.safe_fallback_text || getSafeRefusalText(receipt.reason_code);
        runtime.setBotUtterance(botId, safeText);
        pushMessage({
          role: 'bot',
          sender: botName,
          text: safeText,
          badge: `2PC 거절 · ${receipt.reason_code} (약속 대사 폐기)`,
          rejected: true,
        });
      } else {
        const finalReply = resp.reply_text || '확인했습니다.';
        runtime.setBotUtterance(botId, finalReply);
        pushMessage({
          role: 'bot',
          sender: botName,
          text: finalReply,
          badge: `${resp.metadata?.model_id || 'local'} · ${resp.latency_ms ?? 0}ms${receipt?.constraint_state ? ` · ${receipt.constraint_state}` : ''}${resp.unverified_claim ? ' · 주장 격리' : ''}`,
        });
      }
      onStateChanged?.();
    } finally {
      uiState.sending = false;
      render();
    }
  }

  // Tactical quick buttons bypass LLM and go straight through Zone 3 2PC (Token 0, works during cooldown!)
  function runQuickCommand(cmdId) {
    const botId = resolveActiveBotId();
    const state = getState();
    const rev = runtime.adapter.getRevision(botId);
    const ctx = { actor_id: 'player', user_id: 'local-user', team_id: 'survivors', role_rank: 'OWNER' };
    const reqKey = `quick-${cmdId}-${Date.now()}-${uiState.reqSeq++}`;
    let intent = null;
    let label = '';

    if (state?.phase === 'expedition') {
      if (cmdId === 'move_hold_no_attack') {
        label = '문 앞 도착 후 10초 대기 + 공격 금지 (T01/T02)';
        intent = {
          schema: 'coop_pve.v1.move_then_hold',
          target_id: 'nearest_door',
          arrival_timeout_ms: 15000,
          sneak: true,
          constraint: {
            clock: 'game_sim_ms',
            start_condition: 'on_arrival',
            duration_ms: 10000,
            channels: { movement: 'hold_with_evasion', attack: 'forbid' },
            on_threat: 'evade_without_attack',
            renewal_policy: { max_renewals: 2, max_cumulative_ms: 30000 },
            resume_policy: 'revalidate_previous_goal',
          },
          expected_revision: rev,
        };
      } else if (cmdId === 'follow') {
        label = '조용히 동행';
        runtime.cancelBotConstraints(botId, 'player_override_follow');
        intent = { schema: 'coop_pve.v1.follow', sneak: true, expected_revision: rev };
      } else if (cmdId === 'support_bandage') {
        label = '응급처치 지원';
        intent = { schema: 'coop_pve.v1.support_ally', mode: 'bandage', expected_revision: rev };
      } else if (cmdId === 'support_distract') {
        label = '소음 유인 투척';
        intent = { schema: 'coop_pve.v1.support_ally', mode: 'distraction', expected_revision: rev };
      } else if (cmdId === 'extract') {
        label = '출입구 집결';
        runtime.cancelBotConstraints(botId, 'player_override_extract');
        intent = { schema: 'coop_pve.v1.extract', expected_revision: rev };
      }
    } else {
      if (cmdId === 'day_cook') {
        label = '두 끼 조리 지시';
        intent = { schema: 'shelter.v1.assign_task', action_id: 'cook', expected_revision: rev };
      } else if (cmdId === 'day_clear') {
        label = '잔해 정리 지시';
        intent = { schema: 'shelter.v1.assign_task', action_id: 'clear', expected_revision: rev };
      } else if (cmdId === 'day_hold_wood') {
        label = '목재 6개 보존 제약';
        intent = {
          schema: 'shelter.v1.hold_resource',
          constraint: { clock: 'game_sim_ms', start_condition: 'immediate', duration_ms: 25000, channels: { resource_policy: 'hold' }, hold_resource: { wood: 6 }, conflict_policy: 'last_writer_wins' },
          expected_revision: rev,
        };
      } else if (cmdId === 'day_pause') {
        label = '작업 잠시 보류';
        intent = {
          schema: 'shelter.v1.pause_work',
          constraint: { clock: 'game_sim_ms', start_condition: 'immediate', duration_ms: 15000, channels: { work: 'pause' }, conflict_policy: 'last_writer_wins' },
          expected_revision: rev,
        };
      }
    }

    if (!intent) return;
    const receipt = runtime.commitIntent(botId, intent, ctx, { request_key: reqKey });
    const pack = getBotPack(botId);
    const botName = pack?.identity?.name || botId;
    if (receipt.accepted) {
      runtime.setBotUtterance(botId, `${label} 수행 중`);
      pushMessage({ role: 'bot', sender: botName, text: `[퀵 명령 · 토큰 0] ${label} 수락 (${receipt.detail || '실행 중'})`, badge: `직결 2PC · ${receipt.constraint_state || 'accepted'}` });
      toast?.(`${botName}: ${label}`, 'good');
    } else {
      pushMessage({ role: 'bot', sender: botName, text: receipt.safe_fallback_text, badge: `직결 2PC 거절 · ${receipt.reason_code}`, rejected: true });
      toast?.(receipt.safe_fallback_text, 'bad');
    }
    onStateChanged?.();
    render();
  }

  async function handleAppeal() {
    try {
      const resp = await fetch('/api/playerbot/appeal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: 'local-user', reason: '게임 전술 대화 오탐 이의신청' }),
      });
      if (resp.ok) {
        uiState.cooldownInfo = null;
        pushMessage({ role: 'system', text: '이의신청이 인용되어 대화 제한과 누적 위반 점수가 원복되었습니다. (개인정보보호법 제37조의2)', badge: '이의신청 인용 · 원복 완료' });
        toast?.('이의신청이 인용되어 제한이 해제되었습니다.', 'good');
        render();
      }
    } catch {
      uiState.cooldownInfo = null;
      render();
    }
  }

  async function handleEraseMemory() {
    try {
      const resp = await fetch('/api/playerbot/erase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: 'local-user' }),
      });
      if (resp.ok) {
        const data = await resp.json();
        uiState.lastTombstone = data.tombstone;
      }
    } catch {
      uiState.lastTombstone = { tombstone_id: `local-tmb-${Date.now()}`, hard_deleted: true };
    }
    uiState.messages = [{ role: 'system', text: `세션 대화·주장 기록이 하드 삭제되었습니다. (Tombstone: ${uiState.lastTombstone?.tombstone_id || 'ok'})`, badge: 'GDPR 제17조 하드 삭제' }];
    toast?.('세션 기억을 하드 삭제했습니다.', 'good');
    render();
  }

  function render() {
    if (!container) return;
    const state = getState();
    const exp = getExpedition();
    const botId = resolveActiveBotId();
    const dbg = runtime.getDebugSnapshot(botId);
    const pack = getBotPack(botId);
    const isNight = state?.phase === 'expedition';
    const hasNightCompanion = Boolean(isNight && exp?.companion);

    const quickButtons = isNight
      ? [
          ['move_hold_no_attack', '문 앞 10초 대기·공격금지'],
          ['follow', '조용히 동행'],
          ['support_bandage', '응급처치'],
          ['support_distract', '소음 유인'],
          ['extract', '출입구 집결'],
        ]
      : [
          ['day_cook', '조리 지시'],
          ['day_clear', '잔해 정리'],
          ['day_hold_wood', '목재 6 보존'],
          ['day_pause', '작업 보류'],
        ];

    const crisisHtml = uiState.crisisCard
      ? `<div class="bot-crisis-card" role="alert"><strong>${esc(uiState.crisisCard.title)}</strong><p>${esc(uiState.crisisCard.message)}</p><ul>${uiState.crisisCard.contacts.map(c => `<li><b>${esc(c.name)} ${esc(c.number)}</b> · ${esc(c.hours)}</li>`).join('')}</ul></div>`
      : '';

    const appealHtml = uiState.cooldownInfo
      ? `<div class="bot-appeal-box"><span>자동화 결정으로 대화가 제한되었습니다 (${esc(uiState.cooldownInfo.category)}). 전술 버튼과 프로그램 AI는 유지됩니다.</span><button class="small-button" data-bot-action="appeal">원클릭 이의신청 (원복)</button></div>`
      : '';

    const debugHtml = uiState.debugOpen
      ? `<div class="bot-debug-hud">
          <div class="bot-debug-grid">
            <div><span>HFSM 상태</span><strong>${esc(dbg.hfsm_state)}</strong></div>
            <div><span>공격 금지</span><strong>${dbg.attack_forbidden ? 'FORBID (반격 0)' : '허용'}</strong></div>
            <div><span>game_sim_ms</span><strong>${dbg.clock.game_sim_ms} ms ${dbg.clock.paused ? '(정지)' : `(${dbg.clock.speed}x)`}</strong></div>
            <div><span>최근 지연 / 모델</span><strong>${uiState.lastLatencyMs} ms · ${esc(uiState.lastModelId)}</strong></div>
            <div><span>Revision (OCC)</span><strong>slot:${dbg.revision.slot_holder_rev} plan:${dbg.revision.plan_rev} tgt:${dbg.revision.target_rev}</strong></div>
            <div><span>2PC 통계</span><strong>수락 ${dbg.gate_stats.accepted} · 거절 ${dbg.gate_stats.rejected} · stale ${dbg.gate_stats.staleDiscards}</strong></div>
          </div>
          <div class="bot-debug-constraints">
            <span>활성 제약:</span>
            ${dbg.active_constraints.length
              ? dbg.active_constraints.map(c => `<code>${esc(c.schema)} [${esc(c.state)}] 잔여 ${Math.ceil(c.remaining_ms / 1000)}s${c.state === 'PENDING_START' ? ` (도착대기 ${Math.ceil(c.arrival_remaining_ms / 1000)}s)` : ''}</code>`).join(' ')
              : '<em>없음</em>'}
          </div>
          <div class="bot-debug-controls">
            <label class="bot-toggle"><input type="checkbox" data-bot-action="toggle-delay" ${uiState.artificialDelayMs > 0 ? 'checked' : ''}> 1,500ms 인공 지연 주입 (T05 stale_state 검증)</label>
            <button class="small-button" data-bot-action="cancel-constraints">활성 제약 해제</button>
            <button class="small-button danger" data-bot-action="erase-memory">기억 하드 삭제 (GDPR)</button>
          </div>
        </div>`
      : '';

    const oa = uiState.oauthStatus;
    const oauthHtml = uiState.oauthOpen
      ? `<form class="bot-oauth-box" data-bot-form="oauth">
          <div class="bot-oauth-head">
            <strong>Gemini OAuth 연결 (${oa.connected ? `연결됨 · ${esc(oa.active_mode)} ${esc(oa.email)}` : '미연결 · 로컬 NLU 폴백 중'})</strong>
            <button type="button" class="small-button" data-bot-action="close-oauth">닫기</button>
          </div>
          <p class="bot-oauth-hint">Redirect URI: <code>${esc(typeof location !== 'undefined' ? location.origin : '')}/api/playerbot/oauth/gemini/callback</code></p>
          <div class="bot-oauth-fields">
            <input name="clientId" placeholder="Google OAuth Client ID (선택)" value="">
            <input name="clientSecret" type="password" placeholder="Google OAuth Client Secret (선택)" value="">
            <input name="accessToken" type="password" placeholder="또는 OAuth Bearer Token (ya29...) 직접 입력" value="">
            <input name="apiKey" type="password" placeholder="또는 Gemini API Key (AIza...) 서버 저장" value="">
            <select name="model">
              <option value="gemini-2.5-flash-lite" ${oa.model === 'gemini-2.5-flash-lite' ? 'selected' : ''}>gemini-2.5-flash-lite (권장 · thinking=0)</option>
              <option value="gemini-3.1-flash-lite" ${oa.model === 'gemini-3.1-flash-lite' ? 'selected' : ''}>gemini-3.1-flash-lite</option>
            </select>
          </div>
          <div class="bot-oauth-actions">
            <button type="submit" class="primary-button">서버에 설정 저장</button>
            <button type="button" class="small-button active" data-bot-action="start-oauth">Google OAuth 브라우저 로그인</button>
            ${oa.oauth_configured ? '<a class="small-button" href="/api/playerbot/oauth/gemini/login" target="_blank" rel="noopener" style="text-decoration:none">새 탭에서 로그인 ↗</a>' : ''}
            ${oa.connected ? '<button type="button" class="small-button danger" data-bot-action="disconnect-oauth">연결 해제</button>' : ''}
          </div>
          ${uiState.oauthConnectUrl ? `<p class="bot-oauth-hint"><a href="${esc(uiState.oauthConnectUrl)}" target="_blank" rel="noopener" style="color:#9ad7ec;font-weight:600">🌐 Google 로그인 페이지 직접 열기 ↗</a></p>` : ''}
          ${uiState.oauthNotice ? `<p class="bot-oauth-hint" style="color:#f2b880">${esc(uiState.oauthNotice)} (<a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener" style="color:#9ad7ec">OAuth Client 발급</a> · <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style="color:#9ad7ec">AI Studio API 키</a>)</p>` : ''}
        </form>`
      : '';

    container.innerHTML = `
      <div class="bot-panel-head">
        <div>
          <span class="bot-ai-badge">AI 동료 · 생성형 응답</span>
          <h3>${esc(pack?.identity?.name || botId)} <small>${esc(pack?.identity?.role || '')} · ${esc(pack?.identity?.role_preset || '')}</small></h3>
        </div>
        <div class="bot-head-controls">
          ${!isNight ? `
            <select data-bot-action="select-bot" aria-label="AI 동료 선택">
              ${['mira', 'yun', 'leo'].map(id => `<option value="${id}" ${id === botId ? 'selected' : ''}>${esc(getBotPack(id)?.identity?.name || id)} (${runtime.bots[id]?.control_mode === 'ai_bot' ? 'AI' : '수동'})</option>`).join('')}
            </select>
            <button class="small-button ${dbg.control_mode === 'ai_bot' ? 'active' : ''}" data-bot-action="toggle-mode">${dbg.control_mode === 'ai_bot' ? 'AI 자율 ON' : '수동 모드'}</button>
          ` : `<span class="bot-night-tag">${hasNightCompanion ? '야간 동행 중' : '단독 수색 (동행 미배정)'}</span>`}
          <button class="small-button ${oa.connected ? 'active' : ''}" data-bot-action="open-oauth">🔑 ${oa.connected ? 'Gemini OAuth 연결됨' : 'Gemini OAuth'}</button>
          <select data-bot-action="age-mode" aria-label="연령 정책 모드">
            <option value="minor_game_only" ${uiState.ageMode === 'minor_game_only' ? 'selected' : ''}>게임 맥락 한정(기본)</option>
            <option value="adult_extended" ${uiState.ageMode === 'adult_extended' ? 'selected' : ''}>성인 확장 모드</option>
          </select>
          <button class="small-button" data-bot-action="toggle-debug">${uiState.debugOpen ? '디버그 HUD 숨기기' : '디버그 HUD'}</button>
        </div>
      </div>
      ${oauthHtml}
      ${crisisHtml}
      ${appealHtml}
      <div class="bot-quick-row">
        ${quickButtons.map(([id, text]) => `<button class="small-button" data-bot-quick="${id}" ${isNight && !hasNightCompanion ? 'disabled' : ''}>${esc(text)}</button>`).join('')}
      </div>
      <div class="bot-messages" id="bot-messages">${uiState.messages.map(m => `
        <div class="bot-msg ${esc(m.role)}${m.rejected ? ' rejected' : ''}">
          <div class="bot-msg-meta">${m.sender ? `<strong>${esc(m.sender)}</strong>` : ''}${m.badge ? `<span>${esc(m.badge)}</span>` : ''}</div>
          <p>${esc(m.text)}</p>
        </div>`).join('')}
      </div>
      <form class="bot-input-row" data-bot-form="chat">
        <input type="text" id="bot-chat-input" placeholder="${isNight ? '예: 문 앞에 도착하면 10초 기다리고 공격하지 마' : '예: 난로 만들어줘 / 목재 6개 밑으로 쓰지 마 / 지금 뭐가 급해?'}" ${uiState.sending || (isNight && !hasNightCompanion) ? 'disabled' : ''}>
        <button type="submit" class="primary-button" ${uiState.sending || (isNight && !hasNightCompanion) ? 'disabled' : ''}>${uiState.sending ? '검증 중…' : '전송'}</button>
      </form>
      ${debugHtml}
    `;
    const msgEl = container.querySelector('#bot-messages');
    if (msgEl) msgEl.scrollTop = msgEl.scrollHeight;
  }

  if (container) {
    container.addEventListener('click', event => {
      const quick = event.target.closest?.('[data-bot-quick]');
      if (quick) { runQuickCommand(quick.dataset.botQuick); return; }
      const btn = event.target.closest?.('[data-bot-action]');
      if (!btn) return;
      const act = btn.dataset.botAction;
      if (act === 'toggle-mode') {
        const botId = resolveActiveBotId();
        const next = runtime.bots[botId]?.control_mode === 'ai_bot' ? 'manual' : 'ai_bot';
        runtime.setBotControlMode(botId, next);
        toast?.(`${getBotPack(botId)?.identity?.name}: ${next === 'ai_bot' ? 'AI 자율 동료 모드' : '수동 조작 전환 (슬롯 인수)'}`, 'info');
        render();
      } else if (act === 'toggle-debug') {
        uiState.debugOpen = !uiState.debugOpen;
        render();
      } else if (act === 'cancel-constraints') {
        runtime.cancelBotConstraints(resolveActiveBotId(), 'manual_clear');
        toast?.('활성 제약을 해제했습니다.', 'info');
        render();
      } else if (act === 'appeal') {
        handleAppeal();
      } else if (act === 'erase-memory') {
        handleEraseMemory();
      } else if (act === 'open-oauth') {
        uiState.oauthOpen = !uiState.oauthOpen;
        refreshOAuthStatus();
      } else if (act === 'close-oauth') {
        uiState.oauthOpen = false;
        render();
      } else if (act === 'start-oauth') {
        startGeminiOAuth();
      } else if (act === 'disconnect-oauth') {
        disconnectGeminiOAuth();
      }
    });

    container.addEventListener('change', event => {
      const target = event.target;
      const act = target?.dataset?.botAction;
      if (act === 'select-bot') { uiState.activeBotId = target.value; render(); }
      else if (act === 'age-mode') { uiState.ageMode = target.value; render(); }
      else if (act === 'toggle-delay') { uiState.artificialDelayMs = target.checked ? 1500 : 0; render(); }
    });

    container.addEventListener('submit', event => {
      event.preventDefault();
      if (event.target?.dataset?.botForm === 'oauth') {
        saveGeminiConfig(event.target);
        return;
      }
      if (event.target?.dataset?.botForm !== 'chat') return;
      const input = container.querySelector('#bot-chat-input');
      const val = input?.value || '';
      if (input) input.value = '';
      sendUserChat(val);
    });
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('message', e => {
      if (e.data?.type === 'playerbot-gemini-oauth') {
        refreshOAuthStatus();
        if (e.data.ok) toast?.('Google OAuth로 Gemini가 연결되었습니다!', 'good');
      }
    });
  }
  refreshOAuthStatus();

  return { render, sendUserChat, runQuickCommand, uiState };
}
