(function () {
  'use strict';

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const AVATAR_COLORS = ['#00B06F', '#2563EB', '#7C3AED', '#EA580C', '#DC2626', '#0D9488'];

  function formatTime(raw) {
    if (!raw) return '';
    const d = new Date(raw);
    if (!Number.isFinite(d.getTime())) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  function initialChar(name) {
    const t = String(name || 'P').trim();
    return (t[0] || 'P').toUpperCase();
  }

  function presenceLabel(p) {
    if (!p || !p.online) return '오프라인';
    if (p.status === 'in_game' && p.gameTitle) return `${p.gameTitle} 중`;
    if (p.status === 'in_game') return '게임 플레이 중';
    return '온라인';
  }

  function platformLabel(platform) {
    const p = String(platform || 'web').toLowerCase();
    if (p === 'android') return 'Android';
    if (p === 'ios') return 'iOS';
    return 'PC 웹';
  }

  let activeCleanup = null;

  function unmount() {
    if (typeof activeCleanup === 'function') {
      try { activeCleanup(); } catch (_) {}
      activeCleanup = null;
    }
  }

  async function reportPresence(api, payload) {
    try {
      await api('/api/social/presence', { method: 'POST', body: payload, timeout: 4000 });
    } catch (_) {
      // Non-blocking heartbeat
    }
  }

  async function refreshBadge(api) {
    const badge = document.getElementById('social-badge');
    if (!badge) return;
    try {
      const data = await api('/api/social/friends', { timeout: 4000 });
      const count = Array.isArray(data.incomingRequests) ? data.incomingRequests.length : 0;
      badge.textContent = String(count);
      badge.hidden = count === 0;
    } catch (_) {
      badge.hidden = true;
    }
  }

  async function mountLeaderboard(container, gameId, api) {
    if (!container || !gameId) return;
    let scope = 'global';
    container.innerHTML = `<div class="social-lb-shell">
      <div class="social-lb-header">
        <div>
          <h2 id="leaderboard-title">TOP 리더보드</h2>
          <p class="muted">PC 웹 · Android · iOS 크로스플랫폼 통합 기록</p>
        </div>
        <div class="social-seg" role="group" aria-label="리더보드 범위">
          <button type="button" class="social-seg-btn active" data-lb-scope="global" aria-pressed="true">전체</button>
          <button type="button" class="social-seg-btn" data-lb-scope="friends" aria-pressed="false">친구</button>
        </div>
      </div>
      <div class="social-lb-body" data-testid="leaderboard-list"><p class="muted">리더보드를 불러오는 중…</p></div>
    </div>`;

    const body = container.querySelector('.social-lb-body');

    async function load() {
      body.innerHTML = '<p class="muted">순위를 불러오는 중…</p>';
      try {
        const res = await api(`/api/social/leaderboards/${encodeURIComponent(gameId)}/high_score?scope=${encodeURIComponent(scope)}&limit=10`, { timeout: 5000 });
        const entries = Array.isArray(res.entries) ? res.entries : [];
        if (!entries.length) {
          body.innerHTML = `<p class="muted">${scope === 'friends' ? '아직 등록된 친구 기록이 없습니다. 소셜 탭에서 친구를 추가해 보세요!' : '아직 등록된 점수가 없습니다. 첫 번째 랭커가 되어 보세요!'}</p>`;
          return;
        }
        body.innerHTML = `<ol class="social-lb-list">${entries.map(e => `
          <li class="social-lb-row${e.isMe ? ' is-me' : ''}">
            <span class="social-lb-rank rank-${e.rank <= 3 ? e.rank : 'other'}">#${esc(e.rank)}</span>
            <span class="social-avatar-sm" style="background:${esc(e.avatarColor || '#00B06F')}">${esc(initialChar(e.displayName))}</span>
            <div class="social-lb-user">
              <strong>${esc(e.displayName)}${e.isMe ? ' <span class="social-pill-me">나</span>' : ''}</strong>
              <span class="muted">${esc(e.handle)}</span>
            </div>
            <strong class="social-lb-score">${Number(e.score || 0).toLocaleString('ko-KR')}</strong>
          </li>
        `).join('')}</ol>`;
      } catch (err) {
        body.innerHTML = `<p class="inline-error">${esc(err.message || '리더보드를 불러오지 못했습니다.')}</p>`;
      }
    }

    container.querySelectorAll('[data-lb-scope]').forEach(btn => {
      btn.onclick = () => {
        scope = btn.dataset.lbScope;
        container.querySelectorAll('[data-lb-scope]').forEach(b => {
          const active = b.dataset.lbScope === scope;
          b.classList.toggle('active', active);
          b.setAttribute('aria-pressed', String(active));
        });
        void load();
      };
    });

    await load();
  }

  function mount(container, ctx) {
    unmount();
    const { api, games = [], navigate, toast = () => {}, initialRoomCode = '' } = ctx;
    let disposed = false;
    let pollTimer = null;

    const model = {
      profile: null,
      friends: [],
      incoming: [],
      outgoing: [],
      party: null,
      quickMessages: [],
      filter: 'all', // all | online
      activePanel: null, // null | 'search' | 'create-party' | 'join-party' | 'profile'
      searchQuery: '',
      searchResults: [],
      chatMode: null, // null | { type: 'dm', peer } | { type: 'party' }
      messages: [],
      loading: true,
      error: null
    };

    const cleanup = () => {
      disposed = true;
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    };
    activeCleanup = cleanup;

    function notifyBadge() {
      const badge = document.getElementById('social-badge');
      if (!badge) return;
      badge.textContent = String(model.incoming.length);
      badge.hidden = model.incoming.length === 0;
    }

    async function loadMessages() {
      if (!model.chatMode) { model.messages = []; return; }
      try {
        if (model.chatMode.type === 'dm') {
          const res = await api(`/api/social/messages?channelType=dm&peerId=${encodeURIComponent(model.chatMode.peer.principalId)}&limit=50`);
          if (!disposed) model.messages = res.messages || [];
        } else if (model.chatMode.type === 'party' && model.party) {
          const res = await api(`/api/social/messages?channelType=party&partyId=${encodeURIComponent(model.party.id)}&limit=50`);
          if (!disposed) model.messages = res.messages || [];
        }
      } catch (err) {
        if (!disposed && err.status === 403) {
          toast(err.message);
        }
      }
    }

    async function syncAll({ silent = false } = {}) {
      if (!silent) { model.loading = true; render(); }
      try {
        const [prof, fr, pt, qm] = await Promise.all([
          api('/api/social/profile'),
          api('/api/social/friends'),
          api('/api/social/parties/me'),
          api('/api/social/quick-messages').catch(() => ({ quickMessages: [] }))
        ]);
        if (disposed) return;
        model.profile = prof;
        model.friends = fr.friends || [];
        model.incoming = fr.incomingRequests || [];
        model.outgoing = fr.outgoingRequests || [];
        model.party = pt.party || null;
        model.quickMessages = qm.quickMessages || [];
        model.error = null;
        model.loading = false;
        notifyBadge();

        // Keep active chat peer updated or clear if unfriended/left party
        if (model.chatMode?.type === 'dm') {
          const updatedPeer = model.friends.find(f => f.principalId === model.chatMode.peer.principalId);
          if (updatedPeer) model.chatMode.peer = updatedPeer;
          else model.chatMode = null;
        } else if (model.chatMode?.type === 'party' && !model.party) {
          model.chatMode = null;
        }
        if (model.chatMode) await loadMessages();
        render();
      } catch (err) {
        if (disposed) return;
        model.loading = false;
        model.error = err.message || '소셜 정보를 불러오지 못했습니다.';
        render();
      }
    }

    function copyText(text, label) {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => toast(`${label} 복사됨: ${text}`)).catch(() => toast(text));
      } else {
        toast(`${label}: ${text}`);
      }
    }

    function isChildQuickOnly() {
      return model.profile?.ageCompliance?.ageTier === 'CHILD_PROTECTED';
    }

    function filteredFriends() {
      if (model.filter === 'online') return model.friends.filter(f => f.presence?.online);
      return model.friends;
    }

    function gameTitleById(gameId) {
      if (!gameId) return '자유 로비';
      const found = games.find(g => g.id === gameId);
      return found ? found.title : gameId;
    }

    function render() {
      if (disposed) return;
      if (model.loading && !model.profile) {
        container.innerHTML = `<div class="page social-page"><section class="surface"><p class="muted">소셜 허브를 불러오고 있습니다…</p></section></div>`;
        return;
      }
      if (model.error && !model.profile) {
        container.innerHTML = `<div class="page social-page"><section class="surface"><h1>소셜 허브</h1><p class="inline-error">${esc(model.error)}</p><button class="button primary" type="button" data-social-refresh>다시 시도</button></section></div>`;
        bindEvents();
        return;
      }

      const p = model.profile || {};
      const onlineCount = model.friends.filter(f => f.presence?.online).length;
      const visibleFriends = filteredFriends();
      const myMember = model.party?.members?.find(m => m.principalId === p.principalId);

      container.innerHTML = `<div class="page social-page" data-testid="social-hub">
        <div class="social-hero surface">
          <div class="social-me">
            <span class="social-avatar-lg" style="background:${esc(p.avatarColor || '#00B06F')}">${esc(initialChar(p.displayName))}</span>
            <div>
              <div class="social-me-title">
                <h1>${esc(p.displayName || 'Player')}</h1>
                <span class="social-online-pill">온라인</span>
                ${isChildQuickOnly() ? '<span class="social-child-pill">아동 보호 모드 (안전 퀵메시지)</span>' : ''}
              </div>
              <div class="social-handle-row">
                <code class="social-handle" data-testid="my-social-handle">${esc(p.handle || '')}</code>
                <button type="button" class="text-button" data-copy-handle>핸들 복사</button>
                <button type="button" class="text-button" data-toggle-panel="profile">프로필 꾸미기</button>
              </div>
            </div>
          </div>
          <div class="social-top-actions">
            <button type="button" class="button primary" data-toggle-panel="search" data-testid="social-add-friend-btn">+ 친구 추가</button>
            <button type="button" class="button secondary" data-toggle-panel="create-party" data-testid="social-create-party-btn">파티 만들기</button>
            <button type="button" class="button secondary" data-toggle-panel="join-party" data-testid="social-join-code-btn">코드 합류</button>
            <button type="button" class="text-button" data-social-refresh>새로고침</button>
          </div>
        </div>

        ${model.activePanel === 'profile' ? `
          <section class="surface social-drawer" aria-label="프로필 편집">
            <h2>프로필 설정</h2>
            <form id="social-profile-form" class="social-inline-form">
              <label>표시 이름 <input type="text" name="displayName" maxlength="32" value="${esc(p.displayName || '')}" required></label>
              <div class="social-color-picker" role="group" aria-label="아바타 색상">
                ${AVATAR_COLORS.map(c => `<button type="button" class="social-color-dot${p.avatarColor === c ? ' selected' : ''}" data-pick-color="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}
              </div>
              <button type="submit" class="button primary">저장</button>
              <button type="button" class="button secondary" data-toggle-panel="none">닫기</button>
            </form>
          </section>
        ` : ''}

        ${model.activePanel === 'search' ? `
          <section class="surface social-drawer" aria-label="친구 검색 및 추가" data-testid="social-search-panel">
            <h2>친구 검색 · 추가</h2>
            <p class="muted">PC 웹 · Android · iOS 플레이어를 핸들 또는 이름으로 검색해 친구 요청을 보낼 수 있습니다. (테스트 피어: <code>minjun#1024</code>, <code>seoyeon#2048</code>, <code>jiho#3072</code>)</p>
            <form id="social-search-form" class="social-inline-form">
              <input type="search" name="q" value="${esc(model.searchQuery)}" placeholder="핸들 또는 이름 검색 (예: minjun#1024)" data-testid="social-search-input" required>
              <button type="submit" class="button primary" data-testid="social-search-submit">검색</button>
              <button type="button" class="button secondary" data-toggle-panel="none">닫기</button>
            </form>
            <div class="social-search-results" data-testid="social-search-results">
              ${model.searchResults.length ? model.searchResults.map(u => `
                <div class="social-user-row">
                  <span class="social-avatar-sm" style="background:${esc(u.avatarColor || '#00B06F')}">${esc(initialChar(u.displayName))}</span>
                  <div class="social-user-meta">
                    <strong>${esc(u.displayName)}</strong>
                    <span class="muted">${esc(u.handle)}</span>
                  </div>
                  ${u.relation === 'accepted'
                    ? '<span class="social-status-tag">이미 친구</span>'
                    : u.relation === 'pending_out'
                      ? '<span class="social-status-tag">요청 보냄</span>'
                      : `<button type="button" class="button primary small" data-send-friend-req="${esc(u.principalId)}" data-testid="send-req-${esc(u.handle)}">친구 요청</button>`
                  }
                </div>
              `).join('') : (model.searchQuery ? '<p class="muted">일치하는 플레이어를 찾지 못했습니다.</p>' : '')}
            </div>
          </section>
        ` : ''}

        ${model.activePanel === 'create-party' ? `
          <section class="surface social-drawer" aria-label="파티 만들기">
            <h2>새 파티 만들기</h2>
            <form id="social-create-party-form" class="social-inline-form">
              <input type="text" name="title" maxlength="60" placeholder="파티 이름 (예: 주말 서바이벌 파티)" value="${esc((p.displayName || 'Player') + '의 파티')}">
              <select name="targetGameId" aria-label="대상 게임">
                <option value="">자유 로비 (게임 나중에 선택)</option>
                ${games.map(g => `<option value="${esc(g.id)}">${esc(g.title)}</option>`).join('')}
              </select>
              <button type="submit" class="button primary">파티 생성</button>
              <button type="button" class="button secondary" data-toggle-panel="none">닫기</button>
            </form>
          </section>
        ` : ''}

        ${model.activePanel === 'join-party' ? `
          <section class="surface social-drawer" aria-label="초대 코드로 파티 합류" data-testid="social-join-panel">
            <h2>초대 코드로 파티 합류</h2>
            <form id="social-join-party-form" class="social-inline-form">
              <input type="text" name="roomCode" maxlength="12" placeholder="6자리 초대 코드 (예: PLAY99)" data-testid="social-room-code-input" required>
              <button type="submit" class="button primary" data-testid="social-room-code-submit">합류</button>
              <button type="button" class="button secondary" data-toggle-panel="none">닫기</button>
            </form>
          </section>
        ` : ''}

        ${model.incoming.length ? `
          <section class="surface social-incoming" aria-label="받은 친구 요청" data-testid="social-incoming-requests">
            <div class="social-section-head">
              <h2>받은 친구 요청 <span class="social-count-pill">${model.incoming.length}건</span></h2>
            </div>
            <div class="social-request-list">
              ${model.incoming.map(r => `
                <div class="social-user-row">
                  <span class="social-avatar-sm" style="background:${esc(r.avatarColor || '#7C3AED')}">${esc(initialChar(r.displayName))}</span>
                  <div class="social-user-meta">
                    <strong>${esc(r.displayName)}</strong>
                    <span class="muted">${esc(r.handle)}</span>
                  </div>
                  <div class="social-row-actions">
                    <button type="button" class="button primary small" data-respond-req="${esc(r.principalId)}" data-action="accept" data-testid="accept-req-${esc(r.handle)}">수락</button>
                    <button type="button" class="button secondary small" data-respond-req="${esc(r.principalId)}" data-action="decline">거절</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </section>
        ` : ''}

        ${model.party ? `
          <section class="surface social-party-card" aria-label="활성 파티 로비" data-testid="social-party-lobby">
            <div class="social-party-head">
              <div>
                <h2>${esc(model.party.title)}</h2>
                <p class="muted">게임: <strong>${esc(gameTitleById(model.party.targetGameId))}</strong> · ${model.party.members.length}/${model.party.maxMembers}명</p>
              </div>
              <div class="social-party-code-box">
                <button type="button" class="social-code-pill" data-copy-code="${esc(model.party.roomCode)}" data-testid="party-room-code">코드 ${esc(model.party.roomCode)}</button>
                <button type="button" class="text-button" data-copy-invite="${esc(model.party.roomCode)}">초대 링크 복사</button>
              </div>
            </div>
            <ul class="social-member-list">
              ${model.party.members.map(m => `
                <li class="social-member-row">
                  <span class="social-avatar-sm" style="background:${esc(m.avatarColor || '#00B06F')}">${esc(initialChar(m.displayName))}</span>
                  <div class="social-user-meta">
                    <strong>${esc(m.displayName)}</strong>
                    <span class="muted">${esc(m.handle)}</span>
                  </div>
                  <span class="social-role-badge ${m.role === 'leader' ? 'leader' : (m.ready ? 'ready' : 'waiting')}">
                    ${m.role === 'leader' ? '방장' : (m.ready ? '준비 완료' : '대기 중')}
                  </span>
                </li>
              `).join('')}
            </ul>
            ${model.party.activeLaunch ? `
              <div class="social-launch-banner" data-testid="party-active-launch">
                <div>
                  <strong>🎮 크로스플레이 함께 입장 진행 중</strong>
                  <p class="muted">게임: <strong>${esc(gameTitleById(model.party.activeLaunch.gameId))}</strong> · 매치룸 <code>${esc(model.party.activeLaunch.matchRoomId)}</code></p>
                  <div class="social-launch-roster" data-testid="party-launch-roster">
                    ${(model.party.activeLaunch.participants || []).map(pt => `
                      <span class="social-platform-chip platform-${esc(pt.platform || 'web')}">${esc(platformLabel(pt.platform))} · ${esc(pt.displayName)} (${pt.state === 'entered' ? '입장 완료' : '입장 중'})</span>
                    `).join('')}
                  </div>
                </div>
                <button type="button" class="button primary" data-coentry-join="${esc(model.party.activeLaunch.launchId)}" data-testid="party-coentry-join-btn">🚀 지금 함께 입장</button>
              </div>
            ` : ''}
            <div class="social-party-actions">
              <button type="button" class="button secondary" data-party-ready="${myMember?.ready ? '0' : '1'}" data-testid="party-ready-btn">${myMember?.ready ? '준비 취소' : '준비 완료'}</button>
              <button type="button" class="button secondary" data-open-party-chat data-testid="party-chat-btn">파티 채팅</button>
              ${model.party.targetGameId ? `<button type="button" class="button primary" data-party-launch="${esc(model.party.targetGameId)}" data-testid="party-launch-all-btn">▶ 함께 입장</button>` : ''}
              <button type="button" class="text-button danger-text" data-party-leave data-testid="party-leave-btn">나가기</button>
            </div>
          </section>
        ` : ''}

        <div class="social-workspace">
          <section class="surface social-friends-col" aria-label="친구 목록">
            <div class="social-section-head">
              <h2>친구 목록 <span class="muted">${onlineCount}명 접속 중</span></h2>
              <div class="social-seg">
                <button type="button" class="social-seg-btn${model.filter === 'all' ? ' active' : ''}" data-friend-filter="all">전체</button>
                <button type="button" class="social-seg-btn${model.filter === 'online' ? ' active' : ''}" data-friend-filter="online">접속 중</button>
              </div>
            </div>
            ${visibleFriends.length ? `
              <div class="social-friend-list" data-testid="social-friends-list">
                ${visibleFriends.map(f => {
                  const active = model.chatMode?.type === 'dm' && model.chatMode.peer.principalId === f.principalId;
                  return `<div class="social-friend-item${active ? ' active' : ''}" data-open-dm="${esc(f.principalId)}" data-testid="friend-row-${esc(f.handle)}">
                    <span class="social-avatar-md${f.presence?.online ? ' online' : ''}" style="background:${esc(f.avatarColor || '#00B06F')}">${esc(initialChar(f.displayName))}</span>
                    <div class="social-friend-info">
                      <div class="social-friend-top">
                        <strong>${esc(f.displayName)}</strong>
                        <span class="social-presence-text${f.presence?.online ? ' online' : ''}">${esc(presenceLabel(f.presence))}</span>
                      </div>
                      <p class="social-preview">${esc(f.lastMessage?.body || `${f.handle} · 클릭해 1:1 대화 시작`)}</p>
                    </div>
                    ${f.presence?.roomCode ? `<button type="button" class="button primary small" data-quick-join-code="${esc(f.presence.roomCode)}">합류</button>` : ''}
                  </div>`;
                }).join('')}
              </div>
            ` : `
              <div class="social-empty">
                <p><strong>${model.filter === 'online' ? '현재 접속 중인 친구가 없습니다' : '아직 등록된 친구가 없습니다'}</strong></p>
                <p class="muted">상단 <strong>+ 친구 추가</strong>로 <code>minjun#1024</code> / <code>seoyeon#2048</code>을 검색하거나 <strong>코드 합류</strong>에 <code>PLAY99</code>를 입력해 보세요.</p>
              </div>
            `}
          </section>

          <section class="surface social-chat-col" aria-label="실시간 채팅" data-testid="social-chat-panel">
            ${renderChatPane()}
          </section>
        </div>
      </div>`;

      bindEvents();
      const feed = container.querySelector('.social-msg-feed');
      if (feed) feed.scrollTop = feed.scrollHeight;
    }

    function renderChatPane() {
      if (!model.chatMode) {
        return `<div class="social-chat-empty">
          <h2>실시간 채팅</h2>
          <p class="muted">왼쪽 친구 목록에서 친구를 선택하거나, 활성 파티의 <strong>파티 채팅</strong>을 열어 대화를 시작하세요.</p>
          <p class="muted">PC 웹 · Android · iOS 기기 간 실시간으로 대화와 파티가 동기화됩니다.</p>
        </div>`;
      }
      const isParty = model.chatMode.type === 'party';
      const peer = isParty ? null : model.chatMode.peer;
      const title = isParty ? (model.party?.title || '파티 채팅') : (peer.displayName || '친구');
      const subtitle = isParty
        ? `파티 채팅 · 코드 ${model.party?.roomCode || ''}`
        : `${presenceLabel(peer.presence)} · ${peer.handle}`;

      return `<div class="social-chat-head">
          <div>
            <h2>${esc(title)}</h2>
            <p class="muted">${esc(subtitle)}</p>
          </div>
          <div class="social-row-actions">
            ${!isParty && peer.presence?.roomCode ? `<button type="button" class="button primary small" data-quick-join-code="${esc(peer.presence.roomCode)}">▶ 파티 합류 (${esc(peer.presence.roomCode)})</button>` : ''}
            ${!isParty && peer.presence?.gameId ? `<button type="button" class="button secondary small" data-launch-game="${esc(peer.presence.gameId)}">게임 보기</button>` : ''}
            ${!isParty ? `<button type="button" class="text-button" data-report-user="${esc(peer.principalId)}">신고</button><button type="button" class="text-button danger-text" data-block-user="${esc(peer.principalId)}">차단</button>` : ''}
          </div>
        </div>
        ${!isParty && peer.presence?.status === 'in_game' && peer.presence?.gameTitle ? `
          <div class="social-presence-banner">
            <span>지금 플레이 중 · <strong>${esc(peer.presence.gameTitle)}</strong>${peer.presence.roomCode ? ` (코드 ${esc(peer.presence.roomCode)})` : ''}</span>
            ${peer.presence.roomCode ? `<button type="button" class="button primary small" data-quick-join-code="${esc(peer.presence.roomCode)}">바로 합류</button>` : ''}
          </div>
        ` : ''}
        <div class="social-msg-feed" data-testid="social-msg-feed">
          ${model.messages.length ? model.messages.map(m => `
            <div class="social-msg-wrap${m.senderMe ? ' me' : ''}">
              ${!m.senderMe && isParty ? `<span class="social-msg-sender">${esc(m.senderName)}</span>` : ''}
              <div class="social-msg-bubble">${esc(m.body)}</div>
              <span class="social-msg-time">${m.isQuickMessage ? '안전 퀵메시지 · ' : ''}${esc(formatTime(m.createdAt))}</span>
            </div>
          `).join('') : '<p class="muted social-msg-empty">아직 메시지가 없습니다. 첫 인사를 보내 보세요!</p>'}
        </div>
        ${isChildQuickOnly() ? `
          <div class="social-quick-bar" aria-label="안전 퀵메시지">
            ${model.quickMessages.map(q => `<button type="button" class="button secondary small" data-send-quick="${esc(q.id)}">${esc(q.text)}</button>`).join('')}
          </div>
        ` : `
          <form id="social-msg-form" class="social-composer">
            <input type="text" name="body" maxlength="400" placeholder="${esc(title)}에 메시지 보내기..." data-testid="social-msg-input" autocomplete="off" required>
            <button type="submit" class="button primary" data-testid="social-msg-send">전송</button>
          </form>
        `}`;
    }

    function bindEvents() {
      container.querySelectorAll('[data-social-refresh]').forEach(b => {
        b.onclick = () => void syncAll();
      });
      container.querySelector('[data-copy-handle]')?.addEventListener('click', () => {
        if (model.profile?.handle) copyText(model.profile.handle, '내 핸들');
      });
      container.querySelectorAll('[data-toggle-panel]').forEach(b => {
        b.onclick = () => {
          const next = b.dataset.togglePanel;
          model.activePanel = (next === 'none' || model.activePanel === next) ? null : next;
          render();
        };
      });
      container.querySelectorAll('[data-pick-color]').forEach(b => {
        b.onclick = () => {
          if (model.profile) model.profile.avatarColor = b.dataset.pickColor;
          render();
        };
      });
      container.querySelector('#social-profile-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        try {
          const updated = await api('/api/social/profile', {
            method: 'PUT',
            body: { displayName: String(fd.get('displayName') || '').trim(), avatarColor: model.profile?.avatarColor || '#00B06F' }
          });
          model.profile = { ...model.profile, ...updated };
          model.activePanel = null;
          toast('프로필을 저장했습니다.');
          render();
        } catch (err) { toast(err.message); }
      });
      container.querySelector('#social-search-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const q = String(new FormData(e.currentTarget).get('q') || '').trim();
        model.searchQuery = q;
        if (!q) return;
        try {
          const res = await api(`/api/social/users/search?q=${encodeURIComponent(q)}`);
          model.searchResults = res.users || [];
          render();
        } catch (err) { toast(err.message); }
      });
      container.querySelectorAll('[data-send-friend-req]').forEach(b => {
        b.onclick = async () => {
          b.disabled = true;
          try {
            const res = await api('/api/social/friends/request', {
              method: 'POST',
              body: { targetPrincipalId: b.dataset.sendFriendReq }
            });
            toast(res.status === 'accepted' ? '서로 친구가 되었습니다!' : '친구 요청을 보냈습니다.');
            const hit = model.searchResults.find(u => u.principalId === b.dataset.sendFriendReq);
            if (hit) hit.relation = res.status === 'accepted' ? 'accepted' : 'pending_out';
            await syncAll({ silent: true });
          } catch (err) {
            toast(err.message);
            b.disabled = false;
          }
        };
      });
      container.querySelectorAll('[data-respond-req]').forEach(b => {
        b.onclick = async () => {
          b.disabled = true;
          try {
            await api('/api/social/friends/respond', {
              method: 'POST',
              body: { requesterId: b.dataset.respondReq, action: b.dataset.action }
            });
            toast(b.dataset.action === 'accept' ? '친구 요청을 수락했습니다.' : '친구 요청을 거절했습니다.');
            await syncAll({ silent: true });
          } catch (err) { toast(err.message); b.disabled = false; }
        };
      });
      container.querySelector('#social-create-party-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        try {
          const res = await api('/api/social/parties', {
            method: 'POST',
            body: {
              title: String(fd.get('title') || '').trim() || undefined,
              targetGameId: String(fd.get('targetGameId') || '') || null
            }
          });
          model.party = res.party;
          model.activePanel = null;
          toast(`파티 생성 완료! 초대 코드: ${res.party.roomCode}`);
          render();
        } catch (err) { toast(err.message); }
      });
      container.querySelector('#social-join-party-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const code = String(new FormData(e.currentTarget).get('roomCode') || '').trim().toUpperCase();
        await joinPartyByCode(code);
      });
      container.querySelectorAll('[data-quick-join-code]').forEach(b => {
        b.onclick = e => {
          e.stopPropagation();
          void joinPartyByCode(b.dataset.quickJoinCode);
        };
      });
      container.querySelector('[data-copy-code]')?.addEventListener('click', e => {
        copyText(e.currentTarget.dataset.copyCode, '파티 코드');
      });
      container.querySelector('[data-copy-invite]')?.addEventListener('click', e => {
        const code = e.currentTarget.dataset.copyInvite;
        const inviteUrl = `${location.origin}/?view=social&room=${encodeURIComponent(code)}`;
        copyText(inviteUrl, '파티 초대 링크');
      });
      container.querySelector('[data-party-ready]')?.addEventListener('click', async e => {
        if (!model.party) return;
        const ready = e.currentTarget.dataset.partyReady === '1';
        try {
          const res = await api(`/api/social/parties/${encodeURIComponent(model.party.id)}/ready`, {
            method: 'POST',
            body: { ready }
          });
          model.party = res.party;
          render();
        } catch (err) { toast(err.message); }
      });
      container.querySelector('[data-open-party-chat]')?.addEventListener('click', async () => {
        if (!model.party) return;
        model.chatMode = { type: 'party' };
        await loadMessages();
        render();
      });
      container.querySelector('[data-party-leave]')?.addEventListener('click', async () => {
        if (!model.party) return;
        try {
          await api(`/api/social/parties/${encodeURIComponent(model.party.id)}/leave`, { method: 'POST', body: {} });
          model.party = null;
          if (model.chatMode?.type === 'party') model.chatMode = null;
          toast('파티에서 나갔습니다.');
          render();
        } catch (err) { toast(err.message); }
      });
      container.querySelectorAll('[data-launch-game]').forEach(b => {
        b.onclick = () => navigate(`/play/${encodeURIComponent(b.dataset.launchGame)}/`);
      });
      container.querySelector('[data-party-launch]')?.addEventListener('click', async e => {
        if (!model.party) return;
        const gameId = e.currentTarget.dataset.partyLaunch;
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          const res = await api(`/api/social/parties/${encodeURIComponent(model.party.id)}/launch`, {
            method: 'POST',
            body: { gameId, gameTitle: gameTitleById(gameId), platform: 'web' }
          });
          model.party = res.party;
          const l = res.launch;
          toast(`함께 입장 시작! 매치룸 ${l.matchRoomId}`);
          navigate(`/play/${encodeURIComponent(l.gameId)}/?partyId=${encodeURIComponent(model.party.id)}&room=${encodeURIComponent(l.roomCode)}&launchId=${encodeURIComponent(l.launchId)}&matchRoom=${encodeURIComponent(l.matchRoomId)}&autolaunch=1`);
        } catch (err) {
          toast(err.message);
          btn.disabled = false;
        }
      });
      container.querySelector('[data-coentry-join]')?.addEventListener('click', async e => {
        if (!model.party?.activeLaunch) return;
        const l = model.party.activeLaunch;
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          await api(`/api/social/parties/${encodeURIComponent(model.party.id)}/launch/ack`, {
            method: 'POST',
            body: { launchId: l.launchId, state: 'entered', platform: 'web', gameTitle: gameTitleById(l.gameId) }
          });
          navigate(`/play/${encodeURIComponent(l.gameId)}/?partyId=${encodeURIComponent(model.party.id)}&room=${encodeURIComponent(l.roomCode)}&launchId=${encodeURIComponent(l.launchId)}&matchRoom=${encodeURIComponent(l.matchRoomId)}&autolaunch=1`);
        } catch (err) {
          toast(err.message);
          btn.disabled = false;
        }
      });
      container.querySelectorAll('[data-friend-filter]').forEach(b => {
        b.onclick = () => { model.filter = b.dataset.friendFilter; render(); };
      });
      container.querySelectorAll('[data-open-dm]').forEach(row => {
        row.onclick = async () => {
          const peer = model.friends.find(f => f.principalId === row.dataset.openDm);
          if (!peer) return;
          model.chatMode = { type: 'dm', peer };
          await loadMessages();
          render();
        };
      });
      container.querySelector('#social-msg-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const input = e.currentTarget.querySelector('input[name="body"]');
        const body = String(input.value || '').trim();
        if (!body || !model.chatMode) return;
        input.disabled = true;
        try {
          const payload = model.chatMode.type === 'dm'
            ? { channelType: 'dm', peerId: model.chatMode.peer.principalId, body }
            : { channelType: 'party', partyId: model.party.id, body };
          await api('/api/social/messages', { method: 'POST', body: payload });
          input.value = '';
          await syncAll({ silent: true });
        } catch (err) {
          toast(err.message);
          input.disabled = false;
        }
      });
      container.querySelectorAll('[data-send-quick]').forEach(b => {
        b.onclick = async () => {
          if (!model.chatMode) return;
          try {
            const payload = model.chatMode.type === 'dm'
              ? { channelType: 'dm', peerId: model.chatMode.peer.principalId, quickMessageId: b.dataset.sendQuick }
              : { channelType: 'party', partyId: model.party.id, quickMessageId: b.dataset.sendQuick };
            await api('/api/social/messages', { method: 'POST', body: payload });
            await syncAll({ silent: true });
          } catch (err) { toast(err.message); }
        };
      });
      container.querySelector('[data-report-user]')?.addEventListener('click', async e => {
        const targetId = e.currentTarget.dataset.reportUser;
        const reason = window.prompt('신고 사유를 입력해 주세요 (예: 부적절한 메시지):', '부적절한 언어 사용');
        if (!reason || reason.trim().length < 2) return;
        try {
          await api('/api/social/reports', { method: 'POST', body: { targetType: 'user', targetId, reason: reason.trim() } });
          toast('신고가 접수되었습니다.');
        } catch (err) { toast(err.message); }
      });
      container.querySelector('[data-block-user]')?.addEventListener('click', async e => {
        const targetId = e.currentTarget.dataset.blockUser;
        if (!window.confirm('이 사용자를 차단하면 친구 목록과 대화에서 즉시 제외됩니다. 계속할까요?')) return;
        try {
          await api('/api/social/blocks', { method: 'POST', body: { targetPrincipalId: targetId } });
          model.chatMode = null;
          toast('사용자를 차단했습니다.');
          await syncAll({ silent: true });
        } catch (err) { toast(err.message); }
      });
    }

    async function joinPartyByCode(code) {
      if (!code) return;
      try {
        const res = await api('/api/social/parties/join', { method: 'POST', body: { roomCode: code } });
        model.party = res.party;
        model.activePanel = null;
        toast(`${res.party.title}에 합류했습니다!`);
        render();
      } catch (err) { toast(err.message); }
    }

    void (async () => {
      await syncAll();
      await reportPresence(api, { status: 'online' });
      if (initialRoomCode && !disposed) {
        await joinPartyByCode(initialRoomCode.toUpperCase());
      }
      if (!disposed) {
        pollTimer = setInterval(() => {
          if (!document.hidden && !disposed) void syncAll({ silent: true });
        }, 5000);
      }
    })();

    return cleanup;
  }

  window.PlayHubSocial = { mount, unmount, mountLeaderboard, refreshBadge, reportPresence };
})();
