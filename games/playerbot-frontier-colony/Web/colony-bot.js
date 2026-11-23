// Frontier Colony (변방의 기록) — PlayerBot PoC Runtime, 2PC Gate, 0.5x~20x Auto-Sim, Head Toasts & Gemini OAuth UI
// Mirrors Forge NPC SDK v0.2 (3-Clock, 5-Adapter, 2-Phase Commit, 3-Layer Safety, GDPR Erase, Gemini OAuth)

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ROLE_PRESETS = Object.freeze({
  '서윤': { preset: 'colony_architect', style: '실용·설계 중심', greeting: '거처 벽과 전력망부터 챙길게요.' },
  '도현': { preset: 'frontier_pioneer', style: '든든한 개척자', greeting: '식량과 채집은 저한테 맡기세요.' },
  '미나': { preset: 'colony_medic', style: '침착한 의무관', greeting: '부상 치료와 연구를 우선 살필게요.' },
});

export function createColonyBotController({ container, getGame, getSpeed, setSpeed, toast }) {
  const clock = { game_sim_ms: 0, sim_ticks: 0 };
  const revision = { slot_holder_rev: 1, owner_rev: 1, plan_rev: 1, target_rev: 1 };
  const constraints = new Map(); // colonistId -> ConstraintSpec[]
  const idempotency = new Map();
  const toasts = new Map(); // colonistId -> { text, createdAt, expiresAt, tone }
  const stats = { accepted: 0, rejected: 0, staleDiscards: 0, offensiveBlocked: 0 };

  const uiState = {
    activeColonistId: null,
    autoPlayMode: false,
    ageMode: 'minor_game_only',
    debugOpen: true,
    oauthOpen: false,
    artificialDelayMs: 0,
    sending: false,
    lastLatencyMs: 0,
    lastModelId: 'local-nlu-fallback',
    crisisCard: null,
    cooldownInfo: null,
    oauthStatus: { connected: false, active_mode: null, email: '', oauth_configured: false, model: 'gemini-2.5-flash-lite' },
    messages: [
      { role: 'system', text: '변방의 기록 AI 동료 봇(PoC)이 준비되었습니다. 대사는 캐릭터 머리 위 토스트로 표시됩니다.', badge: 'AI 고지 · EU AI Act 제50조' },
    ],
    reqSeq: 1,
    autoDecisionCooldownMs: 0,
  };

  function getActiveColonist() {
    const game = getGame();
    const alive = (game?.state?.colonists || []).filter(c => !c.dead);
    if (!alive.length) return null;
    const found = alive.find(c => c.id === uiState.activeColonistId);
    if (found) return found;
    uiState.activeColonistId = alive[0].id;
    return alive[0];
  }

  function showHeadToast(colonistId, text, tone = 'info', durationMs = 4800) {
    if (!colonistId || !text) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    toasts.set(colonistId, {
      text: String(text).slice(0, 64),
      createdAt: now,
      expiresAt: now + durationMs,
      tone,
    });
  }

  function getActiveToasts(now = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
    const out = {};
    for (const [id, entry] of toasts.entries()) {
      if (entry.expiresAt > now) out[id] = entry;
      else toasts.delete(id);
    }
    return out;
  }

  function pushMessage(entry) {
    uiState.messages.push({ ts: new Date().toLocaleTimeString('ko-KR', { hour12: false }), ...entry });
    if (uiState.messages.length > 26) uiState.messages.shift();
  }

  function isAttackForbidden(colonistId) {
    return (constraints.get(colonistId) || []).some(c => (c.state === 'ACTIVE' || c.state === 'PENDING_START') && c.channels?.attack === 'forbid');
  }

  function observe(colonistId) {
    const game = getGame();
    const s = game?.state;
    const c = s?.colonists?.find(p => p.id === colonistId) || getActiveColonist();
    const sum = game?.getSummary?.() || {};
    return {
      sim_time_ms: clock.game_sim_ms,
      phase: s?.activeRaid ? 'expedition' : 'day',
      day: sum.day || 1,
      location_id: 'frontier_colony',
      location_name: '해솔 정착지',
      weather: { label: s?.weather || 'clear', cold: (sum.temperature ?? 18) < 8 },
      self_state: c ? {
        id: c.id,
        name: c.name,
        role: c.role,
        pos: { x: Math.round(c.x), y: Math.round(c.y) },
        hp_ratio: Math.round((c.health / 100) * 100) / 100,
        hunger: Math.round(100 - c.hunger),
        fatigue: Math.round(100 - c.energy),
        morale: Math.round(c.mood),
        drafted: Boolean(c.drafted),
        status: c.status,
        resources: { ...(s?.resources || {}) },
      } : {},
      visible_entities: (s?.raiders || []).filter(r => !r.dead).map(r => ({
        id: r.id, name: '약탈자', kind: 'raider', team: 'hostile',
        pos: { x: Math.round(r.x), y: Math.round(r.y) },
        hp_ratio: Math.round((r.health / Math.max(1, r.maxHp)) * 100) / 100,
      })),
      known_facts: [
        `day:${sum.day || 1}`,
        `wood:${s?.resources?.wood || 0}`,
        `steel:${s?.resources?.steel || 0}`,
        `meals:${s?.resources?.meals || 0}`,
        `indoor_beds:${sum.indoorBeds || 0}/3`,
        `fires:${sum.fireCount || 0}`,
        `raid:${s?.activeRaid ? 'active' : 'calm'}`,
      ],
    };
  }

  function getRevision() {
    const game = getGame();
    return {
      phase: game?.state?.activeRaid ? 'raid' : 'colony',
      day: game?.getSummary?.()?.day || 1,
      ...revision,
    };
  }

  function commitIntent(colonistId, intent, requestKey = '') {
    const game = getGame();
    const c = game?.state?.colonists?.find(p => p.id === colonistId && !p.dead);
    if (!c) return { accepted: false, reason_code: 'bot_unavailable', safe_fallback_text: '활동 가능한 정착민이 없습니다.' };
    if (requestKey && idempotency.has(requestKey)) {
      return { ...idempotency.get(requestKey), idempotent_replay: true };
    }

    // OCC expected_revision check (T05)
    const curRev = getRevision();
    if (intent?.expected_revision) {
      for (const k of ['slot_holder_rev', 'owner_rev', 'plan_rev', 'target_rev']) {
        if (intent.expected_revision[k] !== undefined && intent.expected_revision[k] !== curRev[k]) {
          stats.rejected += 1;
          stats.staleDiscards += 1;
          const res = { accepted: false, reason_code: 'stale_state', discard_reply: true, safe_fallback_text: '그사이 정착지 상황이 바뀌어 방금 약속은 적용하지 않았습니다.' };
          if (requestKey) idempotency.set(requestKey, res);
          return res;
        }
      }
    }

    // Offensive channel barrier (T02)
    if (intent?.effect_tags?.includes('offensive') && isAttackForbidden(colonistId)) {
      stats.rejected += 1;
      stats.offensiveBlocked += 1;
      const res = { accepted: false, reason_code: 'offensive_forbidden', discard_reply: true, safe_fallback_text: '공격 금지 제약이 활성 중이라 공격 명령을 차단했습니다.' };
      if (requestKey) idempotency.set(requestKey, res);
      return res;
    }

    let detail = '';
    if (intent.kind === 'hold_position') {
      if (!c.drafted) game.command('draft', { id: c.id, value: true });
      const tx = intent.x ?? 23;
      const ty = intent.y ?? 16;
      const already = Math.hypot(c.x - tx, c.y - ty) <= 1.6;
      if (!already) game.command('move', { id: c.id, x: tx, y: ty });
      else game.command('hold', { id: c.id });
      const list = constraints.get(c.id) || [];
      const cst = {
        id: `fc-${Date.now()}`,
        schema: 'colony.v1.move_then_hold',
        target: { x: tx, y: ty },
        state: already ? 'ACTIVE' : 'PENDING_START',
        arrival_remaining_ms: already ? 0 : 15000,
        duration_ms: intent.duration_ms || 10000,
        remaining_ms: intent.duration_ms || 10000,
        channels: intent.forbid_attack ? { movement: 'hold_with_evasion', attack: 'forbid' } : { movement: 'hold_with_evasion' },
      };
      list.push(cst);
      constraints.set(c.id, list.slice(-4));
      detail = `${cst.state} (${Math.ceil(cst.duration_ms / 1000)}s${intent.forbid_attack ? ', 공격금지' : ''})`;
    } else if (intent.kind === 'forbid_attack') {
      const list = constraints.get(c.id) || [];
      list.push({
        id: `fc-${Date.now()}`,
        schema: 'colony.v1.forbid_attack',
        state: 'ACTIVE',
        arrival_remaining_ms: 0,
        duration_ms: intent.duration_ms || 15000,
        remaining_ms: intent.duration_ms || 15000,
        channels: { attack: 'forbid', movement: 'hold_with_evasion' },
      });
      constraints.set(c.id, list.slice(-4));
      if (c.drafted) game.command('draft', { id: c.id, value: false });
      detail = '공격 금지 · 회피 모드';
    } else if (intent.kind === 'set_priority') {
      const r = game.command('priority', { id: c.id, work: intent.work || 'build', value: 1 });
      if (!r.ok) {
        stats.rejected += 1;
        return { accepted: false, reason_code: 'invalid_schema', discard_reply: true, safe_fallback_text: r.message };
      }
      detail = `${intent.work} 최우선(1)`;
    } else if (intent.kind === 'draft_defend') {
      if (isAttackForbidden(c.id)) {
        stats.rejected += 1;
        stats.offensiveBlocked += 1;
        return { accepted: false, reason_code: 'offensive_forbidden', discard_reply: true, safe_fallback_text: '공격 금지 제약이 활성 중이라 전투 징집을 보류했습니다.' };
      }
      game.command('draft', { id: c.id, value: true });
      const raider = (game.state.raiders || []).find(r => !r.dead);
      if (raider) game.command('attack', { id: c.id, targetId: raider.id });
      else game.command('hold', { id: c.id });
      detail = raider ? '약탈자 교전' : '징집 경계';
    } else if (intent.kind === 'undraft') {
      game.command('draft', { id: c.id, value: false });
      detail = '일상 업무 복귀';
    } else if (intent.kind === 'research_next') {
      const next = ['electricity', 'communications', 'refrigeration'].find(id => !game.state.research.unlocked.includes(id));
      if (next) game.command('research', { id: next });
      detail = next ? `연구: ${next}` : '모든 연구 완료';
    } else if (intent.kind === 'auto_cook') {
      game.command('autoCook', { value: true, target: 20 });
      detail = '자동 조리 ON';
    }

    stats.accepted += 1;
    revision.plan_rev += 1;
    const res = { accepted: true, detail, discard_reply: false };
    if (requestKey) idempotency.set(requestKey, res);
    return res;
  }

  function parseColonyKorean(text, colonistId) {
    const t = String(text || '').trim();
    const rev = getRevision();
    const forbid = /(공격\s*하지\s*마|싸우지\s*마|공격\s*금지|비전투)/.test(t);
    const secMatch = t.match(/(\d+)\s*초/);
    const durationMs = secMatch ? Math.max(3, Math.min(30, parseInt(secMatch[1], 10))) * 1000 : 10000;

    if (/(기다려|대기|거점|문\s*앞|자리\s*지켜)/.test(t)) {
      return {
        intent: { kind: 'hold_position', x: 23, y: 12, duration_ms: durationMs, forbid_attack: forbid, expected_revision: rev },
        reply: `알겠어요. 문 앞 도착 시점부터 ${Math.round(durationMs / 1000)}초 대기${forbid ? '하고 공격은 금지' : ''}할게요.`,
      };
    }
    if (forbid) {
      return {
        intent: { kind: 'forbid_attack', duration_ms: 15000, expected_revision: rev },
        reply: '공격 금지 적용했어요. 위험하면 회피만 할게요.',
      };
    }
    if (/(방어|징집|약탈자|싸워|경계)/.test(t)) {
      return {
        intent: { kind: 'draft_defend', effect_tags: ['offensive'], expected_revision: rev },
        reply: '바로 징집해서 정착지 방어에 나설게요!',
      };
    }
    if (/(해제|복귀|일해)/.test(t)) {
      return {
        intent: { kind: 'undraft', expected_revision: rev },
        reply: '징집 해제하고 일상 작업으로 돌아갈게요.',
      };
    }
    if (/(건설|벽|침대|지[어으])/.test(t)) {
      return { intent: { kind: 'set_priority', work: 'build', expected_revision: rev }, reply: '건설 작업을 최우선으로 처리할게요.' };
    }
    if (/(요리|조리|식사|밥)/.test(t)) {
      return { intent: { kind: 'auto_cook', expected_revision: rev }, reply: '자동 조리를 켜고 식사를 비축할게요.' };
    }
    if (/(연구|전기|통신)/.test(t)) {
      return { intent: { kind: 'research_next', expected_revision: rev }, reply: '다음 핵심 연구를 진행할게요.' };
    }
    if (/(치료|의료|간호)/.test(t)) {
      return { intent: { kind: 'set_priority', work: 'doctor', expected_revision: rev }, reply: '치료·간호 우선순위를 최상위로 올릴게요.' };
    }
    const obs = observe(colonistId);
    return {
      intent: null,
      reply: `현재 ${obs.day}일차 · 목재 ${obs.self_state.resources?.wood || 0} · 강철 ${obs.self_state.resources?.steel || 0} · 식사 ${obs.self_state.resources?.meals || 0}. 필요한 작업을 지시해 주세요.`,
    };
  }

  // Autonomous Bot-Only Colony Simulation (0.5x~20x): builds shelter gaps, 3rd bed, power, research, raids, beacon!
  function stepAutoColony(deltaSimMs) {
    const game = getGame();
    if (!game || game.state.gameOver || game.state.victory) return;
    const s = game.state;

    // Step constraints on game_sim_ms
    for (const c of s.colonists) {
      if (c.dead) continue;
      const list = constraints.get(c.id);
      if (!list?.length) continue;
      for (const cst of list) {
        if (cst.state === 'PENDING_START') {
          const arrived = cst.target && Math.hypot(c.x - cst.target.x, c.y - cst.target.y) <= 1.6;
          if (arrived) {
            cst.state = 'ACTIVE';
            cst.arrival_remaining_ms = 0;
            game.command('hold', { id: c.id });
            showHeadToast(c.id, `도착! ${Math.ceil(cst.remaining_ms / 1000)}초 대기 시작`, 'info');
          } else {
            cst.arrival_remaining_ms = Math.max(0, cst.arrival_remaining_ms - deltaSimMs);
            if (cst.arrival_remaining_ms <= 0) cst.state = 'FAILED_START';
          }
        } else if (cst.state === 'ACTIVE') {
          cst.remaining_ms = Math.max(0, cst.remaining_ms - deltaSimMs);
          if (cst.remaining_ms <= 0) {
            cst.state = 'EXPIRED';
            if (c.drafted && !s.activeRaid) game.command('draft', { id: c.id, value: false });
            showHeadToast(c.id, '대기 제약 종료, 일상 복귀!', 'good');
          }
        }
      }
    }

    if (!uiState.autoPlayMode) return;
    uiState.autoDecisionCooldownMs = Math.max(0, uiState.autoDecisionCooldownMs - deltaSimMs);
    if (uiState.autoDecisionCooldownMs > 0) return;
    uiState.autoDecisionCooldownMs = 3000;

    const alive = s.colonists.filter(c => !c.dead);
    if (!alive.length) return;
    const leader = alive[0];

    // 1. Raid response (respecting attack: "forbid"!)
    const activeRaider = (s.raiders || []).find(r => !r.dead);
    if (s.activeRaid && activeRaider) {
      for (const c of alive) {
        if (c.health < 25) continue;
        if (isAttackForbidden(c.id)) {
          if (c.drafted) game.command('draft', { id: c.id, value: false });
          showHeadToast(c.id, '공격 금지 중! 안전 구역 회피', 'warn');
          continue;
        }
        if (!c.drafted) {
          game.command('draft', { id: c.id, value: true });
          game.command('attack', { id: c.id, targetId: activeRaider.id });
          showHeadToast(c.id, '약탈자 출현! 정착지 방어 개시', 'warn');
        }
      }
      return;
    } else {
      // Undraft once raid is over (unless holding by constraint)
      for (const c of alive) {
        const holding = (constraints.get(c.id) || []).some(x => x.state === 'ACTIVE' || x.state === 'PENDING_START');
        if (c.drafted && !holding) {
          game.command('draft', { id: c.id, value: false });
          showHeadToast(c.id, '위협 해제, 정착지 작업 복귀!', 'good');
        }
      }
    }

    // 2. Close shelter east/south doors & place 3rd bed
    const placeIfEmpty = (x, y, kind, msg) => {
      const tile = game.tile(x, y);
      if (tile && !tile.building) {
        const res = game.command('build', { x, y, kind });
        if (res.ok) { showHeadToast(leader.id, msg, 'good'); return true; }
      }
      return false;
    };
    if (placeIfEmpty(27, 16, 'door', '동쪽 출입문 설치 지시!')) return;
    if (placeIfEmpty(23, 19, 'door', '남쪽 출입문 닫고 실내 밀폐!')) return;
    if (placeIfEmpty(25, 13, 'bed', '세 번째 침대 건설 시작!')) return;

    // 3. Research progression: electricity -> communications
    if (!s.research.unlocked.includes('electricity') && s.research.active !== 'electricity') {
      game.command('research', { id: 'electricity' });
      showHeadToast(alive[alive.length - 1].id, '전기 공학 연구 시작!', 'info');
      return;
    }
    if (s.research.unlocked.includes('electricity') && !s.research.unlocked.includes('communications') && s.research.active !== 'communications') {
      game.command('research', { id: 'communications' });
      showHeadToast(alive[alive.length - 1].id, '장거리 통신 연구 착수!', 'info');
      return;
    }

    // 4. Power infrastructure once electricity unlocked
    if (s.research.unlocked.includes('electricity')) {
      if (placeIfEmpty(22, 21, 'solar', '태양광 발전기 설치!')) return;
      if (placeIfEmpty(24, 21, 'battery', '축전지 설치 중!')) return;
      if (placeIfEmpty(23, 21, 'conduit', '전력선 연결!')) return;
    }

    // 5. Rescue beacon once communications unlocked
    if (s.research.unlocked.includes('communications')) {
      if (placeIfEmpty(25, 21, 'beacon', '구조 신호기 건설 착수!')) return;
    }

    // 6. Auto-designate wood / ore / berry if stock is low
    if ((s.resources.wood || 0) < 35) {
      const tree = s.tiles.find(t => t.feature === 'tree' && !t.designation && Math.hypot(t.x - 23, t.y - 16) < 16);
      if (tree) { game.command('designate', { x: tree.x, y: tree.y, kind: 'chop' }); showHeadToast(leader.id, '목재 확보를 위해 벌목 지정!', 'info'); return; }
    }
    if ((s.resources.steel || 0) < 25) {
      const ore = s.tiles.find(t => t.feature === 'ore' && !t.designation && Math.hypot(t.x - 23, t.y - 16) < 18);
      if (ore) { game.command('designate', { x: ore.x, y: ore.y, kind: 'mine' }); showHeadToast(leader.id, '강철 채광 구역 지정!', 'info'); return; }
    }
    if ((s.resources.meals || 0) + (s.resources.rawfood || 0) < 16) {
      const berry = s.tiles.find(t => t.feature === 'berry' && !t.designation && Math.hypot(t.x - 23, t.y - 16) < 18);
      if (berry) { game.command('designate', { x: berry.x, y: berry.y, kind: 'harvest' }); showHeadToast(leader.id, '식량 확보를 위해 열매 채집!', 'info'); return; }
    }
  }

  function step(deltaSeconds) {
    const speed = Number(getSpeed?.() ?? 1);
    if (speed <= 0 || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    const deltaSimMs = Math.round(Math.min(deltaSeconds, 10) * 1000 * speed);
    clock.game_sim_ms += deltaSimMs;
    clock.sim_ticks += 1;
    stepAutoColony(deltaSimMs);
  }

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
    // Open popup synchronously inside user click gesture so browser popup blockers never block it
    const form = container?.querySelector('[data-cbot-form="oauth"]');
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
        toast?.(uiState.oauthNotice, 'error');
      }
      render();
    } catch {
      if (popup && !popup.closed) popup.close();
      uiState.oauthNotice = '게이트웨이 서버에 연결할 수 없습니다.';
      toast?.(uiState.oauthNotice, 'error');
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
        toast?.('Gemini OAuth 설정이 서버에 안전하게 저장되었습니다.', 'success');
        render();
      }
    } catch {
      toast?.('설정 저장에 실패했습니다.', 'error');
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

  async function sendChat(rawText) {
    const text = String(rawText || '').trim();
    const c = getActiveColonist();
    if (!text || !c || uiState.sending) return;
    uiState.sending = true;
    uiState.crisisCard = null;
    const reqKey = `fc-${Date.now()}-${uiState.reqSeq++}`;
    const snapRev = getRevision();
    const obs = observe(c.id);
    pushMessage({ role: 'user', text });
    render();

    try {
      let gatewayResp = null;
      try {
        const resp = await fetch('/api/playerbot/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: 'local-user',
            bot_id: 'yun',
            text,
            age_mode: uiState.ageMode,
            observation: obs,
            expected_revision: snapRev,
            request_key: reqKey,
            artificial_delay_ms: uiState.artificialDelayMs,
          }),
        });
        if (resp.ok) gatewayResp = await resp.json();
      } catch {}

      if (gatewayResp?.blocked) {
        if (gatewayResp.safety?.crisis_card) {
          uiState.crisisCard = gatewayResp.safety.crisis_card;
          pushMessage({ role: 'crisis', text: gatewayResp.safety.crisis_card.message, badge: '위기 지원 · 위반 0' });
        } else {
          if (gatewayResp.safety?.appeal_eligible) uiState.cooldownInfo = gatewayResp.safety;
          pushMessage({ role: 'safety', text: gatewayResp.reply_text || gatewayResp.safety?.message, badge: `안전 필터 (${gatewayResp.safety?.verdict})` });
        }
        render();
        return;
      }

      const localParsed = parseColonyKorean(text, c.id);
      const replyText = gatewayResp?.metadata?.source === 'remote_llm' && gatewayResp.reply_text
        ? gatewayResp.reply_text
        : localParsed.reply;
      uiState.lastLatencyMs = gatewayResp?.latency_ms ?? 0;
      uiState.lastModelId = gatewayResp?.metadata?.model_id || 'local-nlu-fallback';

      let receipt = null;
      if (localParsed.intent) {
        receipt = commitIntent(c.id, { ...localParsed.intent, expected_revision: snapRev }, reqKey);
      }

      if (receipt && !receipt.accepted) {
        showHeadToast(c.id, receipt.safe_fallback_text, 'warn');
        pushMessage({ role: 'bot', sender: c.name, text: receipt.safe_fallback_text, badge: `2PC 거절 · ${receipt.reason_code}`, rejected: true });
      } else {
        showHeadToast(c.id, replyText, 'info');
        pushMessage({ role: 'bot', sender: c.name, text: replyText, badge: `${uiState.lastModelId} · ${uiState.lastLatencyMs}ms${receipt?.detail ? ` · ${receipt.detail}` : ''}` });
      }
    } finally {
      uiState.sending = false;
      render();
    }
  }

  function render() {
    if (!container) return;
    const game = getGame();
    const alive = (game?.state?.colonists || []).filter(c => !c.dead);
    const active = getActiveColonist();
    const preset = ROLE_PRESETS[active?.name] || { preset: 'colonist_ai' };
    const activeCst = active ? (constraints.get(active.id) || []).filter(x => x.state === 'PENDING_START' || x.state === 'ACTIVE') : [];
    const oa = uiState.oauthStatus;

    const oauthModalHtml = uiState.oauthOpen ? `
      <form class="cbot-oauth-box" data-cbot-form="oauth">
        <div class="cbot-oauth-head">
          <strong>Gemini OAuth 연결 (${oa.connected ? `연결됨 · ${esc(oa.active_mode)} ${esc(oa.email)}` : '미연결 · 로컬 NLU 폴백 중'})</strong>
          <button type="button" class="cbot-btn" data-cbot-act="close-oauth">닫기</button>
        </div>
        <p class="cbot-oauth-hint">Redirect URI: <code>${esc(typeof location !== 'undefined' ? location.origin : '')}/api/playerbot/oauth/gemini/callback</code></p>
        <div class="cbot-oauth-fields">
          <input name="clientId" placeholder="Google OAuth Client ID (선택)" value="">
          <input name="clientSecret" type="password" placeholder="Google OAuth Client Secret (선택)" value="">
          <input name="accessToken" type="password" placeholder="또는 OAuth Bearer Token (ya29...) 직접 입력" value="">
          <input name="apiKey" type="password" placeholder="또는 Gemini API Key (AIza...) 서버 저장" value="">
          <select name="model">
            <option value="gemini-2.5-flash-lite" ${oa.model === 'gemini-2.5-flash-lite' ? 'selected' : ''}>gemini-2.5-flash-lite (권장 · thinking=0)</option>
            <option value="gemini-3.1-flash-lite" ${oa.model === 'gemini-3.1-flash-lite' ? 'selected' : ''}>gemini-3.1-flash-lite</option>
          </select>
        </div>
        <div class="cbot-oauth-actions">
          <button type="submit" class="cbot-btn primary">서버에 설정 저장</button>
          <button type="button" class="cbot-btn accent" data-cbot-act="start-oauth">Google OAuth 브라우저 로그인</button>
          ${oa.oauth_configured ? '<a class="cbot-btn" href="/api/playerbot/oauth/gemini/login" target="_blank" rel="noopener">새 탭에서 로그인 ↗</a>' : ''}
          ${oa.connected ? '<button type="button" class="cbot-btn danger" data-cbot-act="disconnect-oauth">연결 해제</button>' : ''}
        </div>
        ${uiState.oauthConnectUrl ? `<p class="cbot-oauth-hint"><a href="${esc(uiState.oauthConnectUrl)}" target="_blank" rel="noopener" style="color:#9ad7ec;font-weight:600">🌐 Google 로그인 페이지 직접 열기 ↗</a></p>` : ''}
        ${uiState.oauthNotice ? `<p class="cbot-oauth-hint" style="color:#f2b880">${esc(uiState.oauthNotice)} (<a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener" style="color:#9ad7ec">OAuth Client 발급</a> · <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style="color:#9ad7ec">AI Studio API 키</a>)</p>` : ''}
      </form>` : '';

    const crisisHtml = uiState.crisisCard ? `
      <div class="cbot-crisis"><strong>${esc(uiState.crisisCard.title)}</strong><p>${esc(uiState.crisisCard.message)}</p>
      <ul>${uiState.crisisCard.contacts.map(x => `<li><b>${esc(x.name)} ${esc(x.number)}</b> · ${esc(x.hours)}</li>`).join('')}</ul></div>` : '';

    const debugHtml = uiState.debugOpen ? `
      <div class="cbot-debug">
        <span>sim: <b>${clock.game_sim_ms}ms</b> (${getSpeed?.() ?? 1}×)</span>
        <span>공격금지: <b>${active && isAttackForbidden(active.id) ? 'FORBID' : '허용'}</b></span>
        <span>2PC: <b>수락 ${stats.accepted} · 거절 ${stats.rejected} · stale ${stats.staleDiscards}</b></span>
        <span>모델: <b>${esc(uiState.lastModelId)} (${uiState.lastLatencyMs}ms)</b></span>
        <span>제약: ${activeCst.length ? activeCst.map(x => `<code>${esc(x.schema)}[${esc(x.state)} ${Math.ceil(x.remaining_ms / 1000)}s]</code>`).join(' ') : '<em>없음</em>'}</span>
        <label><input type="checkbox" data-cbot-act="toggle-delay" ${uiState.artificialDelayMs > 0 ? 'checked' : ''}> 1,500ms 지연주입</label>
      </div>` : '';

    container.innerHTML = `
      <div class="cbot-head">
        <div>
          <span class="cbot-badge">AI 정착민 봇 · 생성형 응답</span>
          <strong>${esc(active?.name || '정착민')}</strong> <small>${esc(active?.role || '')} · ${esc(preset.preset)}</small>
        </div>
        <div class="cbot-controls">
          <select data-cbot-act="select-colonist">
            ${alive.map(p => `<option value="${esc(p.id)}" ${p.id === active?.id ? 'selected' : ''}>${esc(p.name)} (${esc(p.role)})</option>`).join('')}
          </select>
          <button class="cbot-btn ${uiState.autoPlayMode ? 'active' : ''}" data-cbot-act="toggle-auto">${uiState.autoPlayMode ? '🤖 봇 시뮬 ON' : '🤖 봇 전용 시뮬'}</button>
          <button class="cbot-btn ${oa.connected ? 'active' : ''}" data-cbot-act="open-oauth">🔑 ${oa.connected ? 'Gemini OAuth 연결됨' : 'Gemini OAuth'}</button>
          <button class="cbot-btn" data-cbot-act="toggle-debug">${uiState.debugOpen ? 'HUD 숨김' : 'HUD'}</button>
        </div>
      </div>
      ${oauthModalHtml}
      ${crisisHtml}
      <div class="cbot-quick">
        <button class="cbot-btn" data-cbot-quick="hold_no_attack">문 앞 10초 대기·공격금지</button>
        <button class="cbot-btn" data-cbot-quick="build_prio">건설 최우선</button>
        <button class="cbot-btn" data-cbot-quick="research">다음 연구</button>
        <button class="cbot-btn" data-cbot-quick="defend">징집 방어</button>
        <button class="cbot-btn" data-cbot-quick="undraft">업무 복귀</button>
      </div>
      <div class="cbot-msgs" id="cbot-msgs">
        ${uiState.messages.slice(-8).map(m => `<div class="cbot-msg ${esc(m.role)}${m.rejected ? ' rejected' : ''}"><span>${m.sender ? `<b>${esc(m.sender)}</b> · ` : ''}${esc(m.badge || '')}</span><p>${esc(m.text)}</p></div>`).join('')}
      </div>
      <form class="cbot-form" data-cbot-form="chat">
        <input type="text" id="cbot-input" placeholder="예: 문 앞에 도착하면 10초 기다리고 공격하지 마 / 건설 우선해줘" ${uiState.sending ? 'disabled' : ''}>
        <button type="submit" class="cbot-btn primary" ${uiState.sending ? 'disabled' : ''}>${uiState.sending ? '검증중…' : '전송'}</button>
      </form>
      ${debugHtml}
    `;
    const box = container.querySelector('#cbot-msgs');
    if (box) box.scrollTop = box.scrollHeight;
  }

  if (container) {
    container.addEventListener('click', e => {
      const q = e.target.closest?.('[data-cbot-quick]');
      if (q) {
        const c = getActiveColonist();
        if (!c) return;
        const rev = getRevision();
        const map = {
          hold_no_attack: [{ kind: 'hold_position', x: 23, y: 12, duration_ms: 10000, forbid_attack: true, expected_revision: rev }, '문 앞 도착 후 10초 대기·공격 금지!'],
          build_prio: [{ kind: 'set_priority', work: 'build', expected_revision: rev }, '건설 작업을 최우선으로 잡을게요!'],
          research: [{ kind: 'research_next', expected_revision: rev }, '핵심 연구를 이어서 진행할게요!'],
          defend: [{ kind: 'draft_defend', effect_tags: ['offensive'], expected_revision: rev }, '정착지 방어 태세로 전환합니다!'],
          undraft: [{ kind: 'undraft', expected_revision: rev }, '징집을 해제하고 일상 업무로 돌아가요.'],
        };
        const pair = map[q.dataset.cbotQuick];
        if (!pair) return;
        const r = commitIntent(c.id, pair[0], `q-${Date.now()}`);
        const msg = r.accepted ? pair[1] : r.safe_fallback_text;
        showHeadToast(c.id, msg, r.accepted ? 'good' : 'warn');
        pushMessage({ role: 'bot', sender: c.name, text: msg, badge: r.accepted ? `퀵 2PC · ${r.detail}` : `2PC 거절 · ${r.reason_code}`, rejected: !r.accepted });
        render();
        return;
      }
      const btn = e.target.closest?.('[data-cbot-act]');
      if (!btn) return;
      const act = btn.dataset.cbotAct;
      if (act === 'toggle-auto') {
        uiState.autoPlayMode = !uiState.autoPlayMode;
        if (uiState.autoPlayMode && (getSpeed?.() ?? 0) === 0) setSpeed?.(5);
        const c = getActiveColonist();
        if (c && uiState.autoPlayMode) showHeadToast(c.id, '자동 시뮬레이션 시작! 정착지 운영을 맡겨주세요.', 'good');
        render();
      } else if (act === 'open-oauth') { uiState.oauthOpen = !uiState.oauthOpen; refreshOAuthStatus(); }
      else if (act === 'close-oauth') { uiState.oauthOpen = false; render(); }
      else if (act === 'start-oauth') startGeminiOAuth();
      else if (act === 'disconnect-oauth') disconnectGeminiOAuth();
      else if (act === 'toggle-debug') { uiState.debugOpen = !uiState.debugOpen; render(); }
    });
    container.addEventListener('change', e => {
      const act = e.target?.dataset?.cbotAct;
      if (act === 'select-colonist') { uiState.activeColonistId = e.target.value; render(); }
      else if (act === 'toggle-delay') { uiState.artificialDelayMs = e.target.checked ? 1500 : 0; render(); }
    });
    container.addEventListener('submit', e => {
      e.preventDefault();
      if (e.target?.dataset?.cbotForm === 'chat') {
        const inp = container.querySelector('#cbot-input');
        const val = inp?.value || '';
        if (inp) inp.value = '';
        sendChat(val);
      } else if (e.target?.dataset?.cbotForm === 'oauth') {
        saveGeminiConfig(e.target);
      }
    });
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('message', e => {
      if (e.data?.type === 'playerbot-gemini-oauth') {
        refreshOAuthStatus();
        if (e.data.ok) toast?.('Google OAuth로 Gemini가 연결되었습니다!', 'success');
      }
    });
    refreshOAuthStatus();
  }

  return {
    step,
    render,
    showHeadToast,
    getActiveToasts,
    setAutoPlayMode: on => { uiState.autoPlayMode = Boolean(on); render(); },
    isAutoPlayMode: () => uiState.autoPlayMode,
    commitIntent,
    observe,
    getRevision,
    getDebugSnapshot: () => ({ clock: { ...clock }, stats: { ...stats } }),
    uiState,
  };
}
