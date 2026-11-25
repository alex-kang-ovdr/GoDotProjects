(() => {
  'use strict';

  const query = new URLSearchParams(location.search);
  const embedded = query.get('embedded') === '1';
  const projectId = query.get('project') || '';
  const forgeBase = (location.pathname.match(/^(.*?)\/(?:OfficialGodot|Frontends)(?:\/|$)/)?.[1]) || '';
  const apiPath = route => (forgeBase && route.startsWith('/') && !route.startsWith(forgeBase + '/')) ? forgeBase + route : route;

  const blenderStatusPill = document.getElementById('blender-status-pill');
  const threejsStatusPill = document.getElementById('threejs-status-pill');
  const aiProviderSelect = document.getElementById('ai-provider-select');
  const aiModelSelect = document.getElementById('ai-model-select');
  const connectBox = document.getElementById('connect-box');
  const connectBoxLabel = document.getElementById('connect-box-label');
  const connectApiKeyInput = document.getElementById('connect-api-key');
  const connectProviderBtn = document.getElementById('connect-provider-btn');
  const connectLinkWrap = document.getElementById('connect-link-wrap');

  // Stage 1 elements
  const ideaInput = document.getElementById('idea-input');
  const styleSelect = document.getElementById('style-select');
  const conceptVarBadge = document.getElementById('concept-var-badge');
  const genConceptBtn = document.getElementById('gen-concept-btn');
  const conceptPlaceholder = document.getElementById('concept-placeholder');
  const conceptPreviewImg = document.getElementById('concept-preview-img');
  const conceptStrip = document.getElementById('concept-strip');
  const gotoStage2Btn = document.getElementById('goto-stage2-btn');

  // Stage 2 elements
  const stage2ConceptBadge = document.getElementById('stage2-concept-badge');
  const genPromptBtn = document.getElementById('gen-prompt-btn');
  const modelingPromptInput = document.getElementById('modeling-prompt-input');
  const promptChecklist = document.getElementById('prompt-checklist');
  const gotoStage3Btn = document.getElementById('goto-stage3-btn');

  // Stage 3 elements
  const planPartsBadge = document.getElementById('plan-parts-badge');
  const posX = document.getElementById('pos-x');
  const posY = document.getElementById('pos-y');
  const posZ = document.getElementById('pos-z');
  const autoOffsetX = document.getElementById('auto-offset-x');
  const planBtn = document.getElementById('plan-btn');
  const executeBtn = document.getElementById('execute-btn');
  const planSummaryBox = document.getElementById('plan-summary-box');
  const cancelOpBtn = document.getElementById('cancel-op-btn');

  // Shared & viewport elements
  const jobStatus = document.getElementById('job-status');
  const inspectorOutput = document.getElementById('inspector-output');
  const viewportTitle = document.getElementById('viewport-title');
  const canvas = document.getElementById('glb-canvas');
  const canvasEmpty = document.getElementById('canvas-empty');
  const metricsBar = document.getElementById('metrics-bar');
  const assetListEl = document.getElementById('asset-list');
  const assetCountEl = document.getElementById('asset-count');
  const placeInGodotBtn = document.getElementById('place-in-godot-btn');
  const downloadGlbBtn = document.getElementById('download-glb-btn');
  const toggleSpinBtn = document.getElementById('toggle-spin-btn');
  const resetCamBtn = document.getElementById('reset-cam-btn');
  const refreshAssetsBtn = document.getElementById('refresh-assets-btn');
  const backToForge = document.getElementById('back-to-forge');
  const closeDrawerBtn = document.getElementById('close-drawer-btn');

  if (embedded) {
    backToForge.hidden = true;
    closeDrawerBtn.hidden = false;
    closeDrawerBtn.addEventListener('click', () => {
      window.parent?.postMessage({ source: 'playforge-blender-studio', type: 'close' }, location.origin);
    });
  } else {
    backToForge.href = apiPath('/OfficialGodot/');
  }

  let csrfToken = null;
  let activeStage = 1;
  let activeBottomTab = 'gallery';
  let activeAbort = null;
  let conceptVariationCounter = 1;
  let conceptsCache = [];
  let selectedConcept = null;
  let latestPlan = null;
  let latestJob = null;
  let selectedAsset = null;
  let assetsCache = [];
  let aiCatalog = { recommended: { provider: 'heuristic', model: 'offline-v1' }, providers: [] };

  const OAUTH_PROVIDERS = new Set(['gemini-connect', 'claude-connect', 'chatgpt-connect']);
  const NO_KEY_PROVIDERS = new Set(['ollama']);

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function readJsonSafe(res) {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      const hint = res.status === 502 || res.status === 503
        ? `서버 연결이 일시적으로 끊어졌습니다 (HTTP ${res.status}). 잠시 후 다시 시도해 주세요.`
        : `서버가 JSON이 아닌 응답을 반환했습니다 (HTTP ${res.status}).`;
      return { ok: false, error: hint };
    }
  }

  async function ensureCsrf() {
    if (csrfToken) return csrfToken;
    const res = await fetch(apiPath('/api/session'), { credentials: 'same-origin', cache: 'no-store' });
    const data = await readJsonSafe(res);
    csrfToken = typeof data?.csrfToken === 'string' ? data.csrfToken : null;
    return csrfToken;
  }

  function setStatus(text, tone = '') {
    jobStatus.textContent = text;
    jobStatus.className = 'status-banner' + (tone ? ' ' + tone : '');
  }

  function selectedEngineId() {
    const checked = document.querySelector('input[name="engineId"]:checked');
    return checked ? checked.value : 'blender-cli';
  }

  function currentAiSelection() {
    return {
      aiProvider: aiProviderSelect?.value || 'auto',
      aiModel: aiModelSelect?.value || '',
    };
  }

  function currentPlacement() {
    return {
      position: [Number(posX.value) || 0, Number(posY.value) || 0, Number(posZ.value) || 0],
      rotationDeg: [0, 0, 0],
      scale: [1, 1, 1],
      parentPath: '.',
    };
  }

  // --- Stage Navigation ---
  function setStage(stageNum) {
    activeStage = Number(stageNum);
    document.querySelectorAll('.step-tab').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.stage) === activeStage);
    });
    for (const s of [1, 2, 3]) {
      const pane = document.getElementById(`stage-${s}`);
      if (pane) pane.hidden = s !== activeStage;
    }
  }

  document.querySelectorAll('.step-tab').forEach(btn => {
    btn.addEventListener('click', () => setStage(btn.dataset.stage));
  });
  document.querySelectorAll('[data-jump]').forEach(btn => {
    btn.addEventListener('click', () => setStage(btn.dataset.jump));
  });

  // Engine radio cards
  document.querySelectorAll('.engine-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.engine-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });

  // Preset chips
  document.querySelectorAll('#preset-chips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      ideaInput.value = chip.dataset.idea || '';
      conceptVariationCounter = 1;
      conceptVarBadge.textContent = `변형 #${conceptVariationCounter}`;
      ideaInput.focus();
    });
  });

  // Cancel active long operation
  function beginOperation() {
    if (activeAbort) {
      try { activeAbort.abort(); } catch { /* ignore */ }
    }
    activeAbort = new AbortController();
    cancelOpBtn.hidden = false;
    return activeAbort.signal;
  }
  function endOperation() {
    activeAbort = null;
    cancelOpBtn.hidden = true;
  }
  cancelOpBtn.addEventListener('click', () => {
    if (activeAbort) {
      activeAbort.abort();
      setStatus('진행 중인 작업을 취소했습니다. 다른 모델이나 엔진으로 바로 다시 실행할 수 있습니다.');
    }
  });

  // --- AI Model Selection & Connection ---
  function populateModelOptions(providerId, preferredModel = '') {
    if (!aiModelSelect) return;
    aiModelSelect.innerHTML = '';
    if (providerId === 'auto') {
      const rec = aiCatalog.recommended || {};
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = rec.provider && rec.provider !== 'heuristic'
        ? `자동 추천 (${rec.provider} · ${rec.model})`
        : '자동 (로컬 규칙 플래너)';
      aiModelSelect.appendChild(opt);
      return;
    }
    const found = (aiCatalog.providers || []).find(p => p.id === providerId);
    const models = found?.models?.length ? found.models : [found?.defaultModel || 'default'];
    for (const m of models) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      aiModelSelect.appendChild(opt);
    }
    if (preferredModel && models.includes(preferredModel)) aiModelSelect.value = preferredModel;
    else if (found?.defaultModel && models.includes(found.defaultModel)) aiModelSelect.value = found.defaultModel;
  }

  function updateConnectBox(providerId) {
    if (!connectBox) return;
    if (!providerId || providerId === 'auto' || providerId === 'heuristic') {
      connectBox.hidden = true;
      return;
    }
    const found = (aiCatalog.providers || []).find(p => p.id === providerId);
    if (!found || found.configured) {
      connectBox.hidden = true;
      return;
    }
    connectBox.hidden = false;
    const isOauth = OAUTH_PROVIDERS.has(providerId);
    const isNoKey = NO_KEY_PROVIDERS.has(providerId);
    connectApiKeyInput.hidden = isOauth || isNoKey;
    connectLinkWrap.hidden = true;
    connectLinkWrap.innerHTML = '';
    const isLocalHost = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
    if (!isLocalHost) {
      connectBoxLabel.textContent = `${found.label} 신규 연결은 보안상 PC 로컬 주소에서만 가능합니다. 연결된 Claude / Ollama 등을 선택해 사용하세요.`;
      connectProviderBtn.disabled = true;
      connectProviderBtn.textContent = 'PC 로컬에서 연결';
      return;
    }
    connectProviderBtn.disabled = false;
    if (isNoKey) {
      connectBoxLabel.textContent = `${found.label} 로컬 서버가 감지되었습니다. 키 없이 바로 연결할 수 있습니다.`;
      connectProviderBtn.textContent = '로컬 Ollama 연결';
    } else if (isOauth) {
      connectBoxLabel.textContent = `${found.label} PC 브라우저 로그인 연결이 필요합니다.`;
      connectProviderBtn.textContent = `${found.label} 브라우저 로그인`;
    } else {
      connectBoxLabel.textContent = `${found.label} API 키를 입력해 연결하세요.`;
      connectProviderBtn.textContent = 'API 키 연결';
    }
  }

  async function loadAiModels() {
    if (!aiProviderSelect) return;
    try {
      const res = await fetch(apiPath('/api/blender/models'), { credentials: 'same-origin', cache: 'no-store' });
      const data = await readJsonSafe(res);
      if (!res.ok || !data.ok) return;
      aiCatalog = data;
      const savedProvider = localStorage.getItem('playforge_blender_ai_provider') || 'auto';
      const savedModel = localStorage.getItem('playforge_blender_ai_model') || '';

      aiProviderSelect.innerHTML = '';
      const autoOpt = document.createElement('option');
      autoOpt.value = 'auto';
      autoOpt.textContent = data.recommended?.provider && data.recommended.provider !== 'heuristic'
        ? `자동 (${data.recommended.provider} 추천)`
        : '자동 (로컬 규칙)';
      aiProviderSelect.appendChild(autoOpt);

      for (const p of data.providers || []) {
        const opt = document.createElement('option');
        opt.value = p.id;
        const badge = p.configured ? (p.id === 'heuristic' ? '오프라인' : '연결됨') : '미연결';
        opt.textContent = `${p.label} [${badge}]`;
        aiProviderSelect.appendChild(opt);
      }

      const validSaved = [...aiProviderSelect.options].some(o => o.value === savedProvider);
      aiProviderSelect.value = validSaved ? savedProvider : 'auto';
      populateModelOptions(aiProviderSelect.value, savedModel);
      updateConnectBox(aiProviderSelect.value);
    } catch { /* ignore */ }
  }

  connectProviderBtn?.addEventListener('click', async () => {
    const providerId = aiProviderSelect?.value;
    if (!providerId || providerId === 'auto' || providerId === 'heuristic') return;
    const isOauth = OAUTH_PROVIDERS.has(providerId);
    const isNoKey = NO_KEY_PROVIDERS.has(providerId);
    const apiKey = connectApiKeyInput?.value?.trim() || '';
    if (!isOauth && !isNoKey && !apiKey) return setStatus('API 키를 입력해 주세요.', 'error');
    connectProviderBtn.disabled = true;
    try {
      const token = await ensureCsrf();
      const res = await fetch(apiPath('/api/blender/models/connect'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'X-CSRF-Token': token } : {}) },
        body: JSON.stringify({ provider: providerId, ...(apiKey ? { api_key: apiKey } : {}) }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.connectUrl || data.browserOpened) {
        if (data.connectUrl) {
          connectLinkWrap.hidden = false;
          connectLinkWrap.innerHTML = `<a href="${escapeHtml(data.connectUrl)}" target="_blank" rel="noopener noreferrer">브라우저 로그인 열기</a>`;
          window.open(data.connectUrl, '_blank', 'noopener,noreferrer');
        }
        setStatus('PC 브라우저에서 로그인을 완료해 주세요. 연결을 자동 확인합니다…');
        for (let i = 0; i < 45; i++) {
          await new Promise(r => setTimeout(r, 2000));
          await loadAiModels();
          const nowFound = (aiCatalog.providers || []).find(p => p.id === providerId);
          if (nowFound?.configured) {
            setStatus(`${nowFound.label} 연결 완료!`, 'success');
            break;
          }
        }
      } else {
        await loadAiModels();
        setStatus(`${providerId} 연결 완료!`, 'success');
      }
    } catch (err) {
      setStatus(`연결 오류: ${err.message}`, 'error');
    } finally {
      connectProviderBtn.disabled = false;
    }
  });

  aiProviderSelect?.addEventListener('change', () => {
    populateModelOptions(aiProviderSelect.value);
    updateConnectBox(aiProviderSelect.value);
    try {
      localStorage.setItem('playforge_blender_ai_provider', aiProviderSelect.value);
      localStorage.setItem('playforge_blender_ai_model', aiModelSelect?.value || '');
    } catch { /* ignore */ }
  });
  aiModelSelect?.addEventListener('change', () => {
    try { localStorage.setItem('playforge_blender_ai_model', aiModelSelect.value); } catch { /* ignore */ }
  });

  // =========================================================================
  // STAGE 1: Concept Image Generation (Repeatable / Multi-variation)
  // =========================================================================
  function selectConcept(concept) {
    selectedConcept = concept;
    if (!concept) return;
    conceptPlaceholder.hidden = true;
    conceptPreviewImg.hidden = false;
    conceptPreviewImg.src = apiPath(concept.imageUrl);
    stage2ConceptBadge.textContent = `${concept.title} (#${concept.variation || 1})`;
    document.querySelector('.step-tab[data-stage="1"]')?.classList.add('done');
    renderConceptStrip();
  }

  function renderConceptStrip() {
    conceptStrip.innerHTML = '';
    for (const c of conceptsCache.slice(0, 12)) {
      const btn = document.createElement('div');
      btn.className = 'concept-thumb' + (selectedConcept?.conceptId === c.conceptId ? ' selected' : '');
      btn.innerHTML = `<img src="${escapeHtml(apiPath(c.imageUrl))}" alt="${escapeHtml(c.title)}"><span>${escapeHtml(c.title)}</span>`;
      btn.addEventListener('click', () => selectConcept(c));
      conceptStrip.appendChild(btn);
    }
  }

  async function loadConcepts() {
    try {
      const res = await fetch(apiPath('/api/blender/concepts'), { credentials: 'same-origin', cache: 'no-store' });
      const data = await readJsonSafe(res);
      if (!res.ok || !data.ok) return;
      conceptsCache = Array.isArray(data.concepts) ? data.concepts : [];
      renderConceptStrip();
      if (!selectedConcept && conceptsCache.length > 0) {
        selectConcept(conceptsCache[0]);
      }
    } catch { /* ignore */ }
  }

  async function runStage1Concept() {
    const idea = ideaInput.value.trim();
    if (!idea) return setStatus('1단계: 컨셉 아이디어를 입력해 주세요.', 'error');
    const { aiProvider, aiModel } = currentAiSelection();
    const signal = beginOperation();
    genConceptBtn.disabled = true;
    const variation = conceptVariationCounter;
    setStatus(`1단계: 컨셉 이미지 #${variation} 생성 중… (AI: ${aiProvider}${aiModel ? '/' + aiModel : ''})`);
    try {
      const token = await ensureCsrf();
      const res = await fetch(apiPath('/api/blender/concept'), {
        method: 'POST',
        credentials: 'same-origin',
        signal,
        headers: { 'Content-Type': 'application/json', ...(token ? { 'X-CSRF-Token': token } : {}) },
        body: JSON.stringify({
          prompt: idea,
          style: styleSelect.value,
          variation,
          aiProvider,
          aiModel: aiModel || undefined,
        }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok || !data.ok || !data.concept) throw new Error(data.error || `HTTP ${res.status}`);
      conceptVariationCounter += 1;
      conceptVarBadge.textContent = `변형 #${conceptVariationCounter}`;
      conceptsCache.unshift(data.concept);
      selectConcept(data.concept);
      const aiNote = data.concept.ai?.usedLlm ? `LLM ${data.concept.ai.model}` : '오프라인 컨셉 시트';
      setStatus(`1단계 완료 [${aiNote}]: '${data.concept.title}' 생성됨. 다시 눌러 변형을 추가하거나 2단계로 이동하세요.`, 'success');
    } catch (err) {
      if (err.name !== 'AbortError') setStatus(`1단계 오류: ${err.message}`, 'error');
    } finally {
      genConceptBtn.disabled = false;
      endOperation();
    }
  }

  genConceptBtn.addEventListener('click', runStage1Concept);
  gotoStage2Btn.addEventListener('click', () => {
    setStage(2);
    if (!modelingPromptInput.value.trim()) {
      runStage2Prompt();
    }
  });

  // =========================================================================
  // STAGE 2: 3D Modeling Prompt Generation (Repeatable & Editable)
  // =========================================================================
  async function runStage2Prompt() {
    const idea = ideaInput.value.trim() || selectedConcept?.idea || '';
    if (!idea) return setStatus('2단계: 먼저 1단계에서 아이디어를 입력해 주세요.', 'error');
    const { aiProvider, aiModel } = currentAiSelection();
    const signal = beginOperation();
    genPromptBtn.disabled = true;
    setStatus(`2단계: 컨셉 기반 3D 모델링 프롬프트 생성 중… (AI: ${aiProvider})`);
    try {
      const token = await ensureCsrf();
      const res = await fetch(apiPath('/api/blender/prompt'), {
        method: 'POST',
        credentials: 'same-origin',
        signal,
        headers: { 'Content-Type': 'application/json', ...(token ? { 'X-CSRF-Token': token } : {}) },
        body: JSON.stringify({
          idea,
          conceptId: selectedConcept?.conceptId || undefined,
          style: styleSelect.value,
          aiProvider,
          aiModel: aiModel || undefined,
        }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      modelingPromptInput.value = data.modelingPrompt || '';
      promptChecklist.innerHTML = (data.checklist || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
      document.querySelector('.step-tab[data-stage="2"]')?.classList.add('done');
      const aiNote = data.ai?.usedLlm ? `LLM ${data.ai.model}` : '구조화 프롬프트 생성기';
      setStatus(`2단계 완료 [${aiNote}]: 프롬프트를 자유롭게 수정한 뒤 3단계로 이동하세요.`, 'success');
    } catch (err) {
      if (err.name !== 'AbortError') setStatus(`2단계 오류: ${err.message}`, 'error');
    } finally {
      genPromptBtn.disabled = false;
      endOperation();
    }
  }

  genPromptBtn.addEventListener('click', runStage2Prompt);
  gotoStage3Btn.addEventListener('click', () => setStage(3));

  // =========================================================================
  // STAGE 3: Modeling Plan -> Execute with Blender OR Three.js (Repeatable!)
  // =========================================================================
  function effectivePromptText() {
    return modelingPromptInput.value.trim() || ideaInput.value.trim();
  }

  function renderPlanSummary(planData) {
    if (!planData) return;
    const recipe = planData.recipe || {};
    const parts = Array.isArray(recipe.parts) ? recipe.parts : [];
    const partNames = parts.slice(0, 14).map(p => `${p.name}(${p.shape})`).join(', ');
    planPartsBadge.textContent = parts.length ? `${parts.length}개 커스텀 파트` : `아키타입: ${recipe.archetype}`;
    planSummaryBox.textContent = [
      `[설계 요약] ${planData.plan?.summary || recipe.name}`,
      `[AI 플래너] ${planData.ai?.usedLlm ? `${planData.ai.provider}/${planData.ai.model}` : (planData.plan?.planner || 'local')}`,
      parts.length ? `[주요 파트 ${parts.length}개] ${partNames}${parts.length > 14 ? ' …' : ''}` : `[치수] ${recipe.dimensions?.width}×${recipe.dimensions?.depth}×${recipe.dimensions?.height}m`,
      '',
      ...(planData.plan?.steps || []),
    ].join('\n');
    renderBottomInspector();
  }

  async function runStage3Plan() {
    const prompt = effectivePromptText();
    if (!prompt) return setStatus('3단계: 먼저 1~2단계에서 프롬프트를 준비해 주세요.', 'error');
    const { aiProvider, aiModel } = currentAiSelection();
    const signal = beginOperation();
    planBtn.disabled = true;
    executeBtn.disabled = true;
    const startedAt = Date.now();
    const tick = setInterval(() => {
      const sec = Math.floor((Date.now() - startedAt) / 1000);
      setStatus(`3-1단계: AI 모델(${aiProvider}${aiModel ? '/' + aiModel : ''})이 3D 모델링 계획(MeshRecipe) 수립 중… (${sec}초)`);
    }, 1000);
    setStatus(`3-1단계: AI 모델(${aiProvider}${aiModel ? '/' + aiModel : ''})이 3D 모델링 계획 수립 중…`);
    try {
      const token = await ensureCsrf();
      const res = await fetch(apiPath('/api/blender/plan'), {
        method: 'POST',
        credentials: 'same-origin',
        signal,
        headers: { 'Content-Type': 'application/json', ...(token ? { 'X-CSRF-Token': token } : {}) },
        body: JSON.stringify({
          prompt,
          name: selectedConcept?.assetName || undefined,
          engineId: selectedEngineId(),
          aiProvider,
          aiModel: aiModel || undefined,
          placement: currentPlacement(),
        }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      latestPlan = data;
      renderPlanSummary(data);
      setStatus(`3-1단계 계획 수립 완료! [③-2 3D 모델링 실행]을 눌러 ${selectedEngineId() === 'threejs-cli' ? 'Three.js' : 'Blender'}로 GLB를 생성하세요.`, 'success');
      return data;
    } catch (err) {
      if (err.name !== 'AbortError') setStatus(`3-1단계 계획 오류: ${err.message}`, 'error');
      return null;
    } finally {
      clearInterval(tick);
      planBtn.disabled = false;
      executeBtn.disabled = false;
      endOperation();
    }
  }

  async function runStage3Execute() {
    const prompt = effectivePromptText();
    if (!prompt && !latestPlan?.recipe) return setStatus('3단계: 프롬프트 또는 모델링 계획이 필요합니다.', 'error');

    const engineId = selectedEngineId();
    const engineLabel = engineId === 'threejs-cli' ? 'Three.js Headless' : 'Blender 4.3 Headless';
    const { aiProvider, aiModel } = currentAiSelection();
    const signal = beginOperation();
    planBtn.disabled = true;
    executeBtn.disabled = true;

    const payload = {
      prompt: prompt || latestPlan.plan?.prompt || 'Custom 3D Model',
      engineId,
      conceptId: selectedConcept?.conceptId || undefined,
      projectId: projectId || undefined,
      placement: currentPlacement(),
      autoImport: embedded,
    };

    // Reuse reviewed Stage 3-1 recipe if present (fast execution & allows running BOTH Blender and Three.js on the exact same plan!)
    if (latestPlan?.recipe) {
      payload.recipe = latestPlan.recipe;
      payload.ai = latestPlan.ai;
      setStatus(`3-2단계: 검토된 모델링 계획을 ${engineLabel} 독립 프로세스로 실행 중…`);
    } else {
      payload.aiProvider = aiProvider;
      payload.aiModel = aiModel || undefined;
      setStatus(`3단계: 모델링 계획 수립 후 ${engineLabel} 실행 중…`);
    }

    try {
      const token = await ensureCsrf();
      const submitRes = await fetch(apiPath('/api/blender/jobs'), {
        method: 'POST',
        credentials: 'same-origin',
        signal,
        headers: { 'Content-Type': 'application/json', ...(token ? { 'X-CSRF-Token': token } : {}) },
        body: JSON.stringify(payload),
      });
      const submitData = await readJsonSafe(submitRes);
      if (!submitRes.ok || !submitData.ok) throw new Error(submitData.error || `HTTP ${submitRes.status}`);

      let job = submitData.job;
      const startedAt = Date.now();
      const deadline = startedAt + 240000;
      let transientErrors = 0;

      while (['planning', 'queued', 'running'].includes(job.status)) {
        if (signal.aborted) throw Object.assign(new Error('취소됨'), { name: 'AbortError' });
        if (Date.now() > deadline) throw new Error('작업 대기 시간이 초과되었습니다.');
        await new Promise(r => setTimeout(r, engineId === 'threejs-cli' ? 350 : 750));
        let pollRes;
        try {
          pollRes = await fetch(apiPath(`/api/blender/jobs/${encodeURIComponent(job.id)}`), {
            credentials: 'same-origin',
            cache: 'no-store',
            signal,
          });
        } catch (netErr) {
          if (netErr.name === 'AbortError') throw netErr;
          if (++transientErrors <= 3) continue;
          throw new Error('서버 연결이 끊어졌습니다.');
        }
        if ([502, 503, 504].includes(pollRes.status) && ++transientErrors <= 3) continue;
        const pollData = await readJsonSafe(pollRes);
        if (!pollRes.ok || !pollData.ok) throw new Error(pollData.error || `HTTP ${pollRes.status}`);
        transientErrors = 0;
        job = pollData.job;
        const sec = Math.floor((Date.now() - startedAt) / 1000);
        if (job.status === 'planning') {
          setStatus(`3-1단계: AI 모델(${job.ai?.provider || aiProvider})이 3D 파트 설계 중… (${sec}초)`);
        } else if (job.status === 'running') {
          if (job.plan && !latestPlan) {
            latestPlan = { plan: job.plan, recipe: job.recipe, placement: job.placement, ai: job.ai };
            renderPlanSummary(latestPlan);
          }
          setStatus(`3-2단계: ${engineLabel} 프로세스가 GLB 생성 중… (${sec}초)`);
        }
      }

      latestJob = job;
      if (job.plan) {
        latestPlan = { plan: job.plan, recipe: job.recipe, placement: job.placement, ai: job.ai };
        renderPlanSummary(latestPlan);
      }
      renderBottomInspector();

      if (job.status !== 'succeeded' || !job.asset) {
        throw new Error(job.error || '3D 모델링 실행에 실패했습니다.');
      }

      document.querySelector('.step-tab[data-stage="3"]')?.classList.add('done');
      const ms = job.metrics?.processElapsedMs ?? job.metrics?.durationMs ?? 0;
      setStatus(`생성 완료! ${job.asset.name} [${engineLabel} · ${job.metrics?.triangleCount ?? 0} tris · ${ms}ms] — 엔진을 바꾸거나 다시 눌러 여러 번 생성할 수 있습니다.`, 'success');

      if (autoOffsetX?.checked) {
        posX.value = String((Number(posX.value) || 0) + 2);
      }

      await loadAssets(false);
      await selectAsset(job.asset);

      if (embedded) {
        triggerGodotPlacement(job.asset);
      }
    } catch (err) {
      if (err.name !== 'AbortError') setStatus(`실행 실패: ${err.message}`, 'error');
    } finally {
      planBtn.disabled = false;
      executeBtn.disabled = false;
      endOperation();
    }
  }

  planBtn.addEventListener('click', runStage3Plan);
  executeBtn.addEventListener('click', runStage3Execute);

  // =========================================================================
  // Bottom Inspector Tabs & Asset History Gallery
  // =========================================================================
  function renderBottomInspector() {
    if (activeBottomTab === 'gallery') {
      assetListEl.hidden = false;
      inspectorOutput.hidden = true;
      return;
    }
    assetListEl.hidden = true;
    inspectorOutput.hidden = false;
    if (activeBottomTab === 'plan') {
      inspectorOutput.textContent = latestPlan?.recipe
        ? JSON.stringify(latestPlan.recipe, null, 2)
        : '3단계에서 [모델링 계획 수립]을 실행하면 MeshRecipe v1 JSON이 표시됩니다.';
    } else if (activeBottomTab === 'request') {
      inspectorOutput.textContent = latestJob?.ipc?.request
        ? JSON.stringify(latestJob.ipc.request, null, 2)
        : '실행된 작업의 request.json IPC 데이터가 없습니다.';
    } else if (activeBottomTab === 'response') {
      inspectorOutput.textContent = latestJob?.ipc?.response
        ? JSON.stringify(latestJob.ipc.response, null, 2)
        : '실행된 작업의 response.json IPC 데이터가 없습니다.';
    }
  }

  document.querySelectorAll('.inspector-tabs .tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.inspector-tabs .tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeBottomTab = btn.dataset.tab;
      renderBottomInspector();
    });
  });

  // --- Lightweight Pure-WebGL GLB 2.0 Viewer ---
  const viewer = createGlbViewer(canvas);
  toggleSpinBtn.addEventListener('click', () => {
    const on = viewer.toggleSpin();
    toggleSpinBtn.textContent = `회전: ${on ? 'ON' : 'OFF'}`;
  });
  resetCamBtn.addEventListener('click', () => viewer.resetCamera());

  function updateSelectedAssetUi(asset) {
    selectedAsset = asset;
    if (!asset) {
      viewportTitle.textContent = '3D GLB 프리뷰';
      placeInGodotBtn.disabled = true;
      downloadGlbBtn.hidden = true;
      metricsBar.hidden = true;
      return;
    }
    viewportTitle.textContent = `3D GLB 프리뷰 · ${asset.name}`;
    placeInGodotBtn.disabled = false;
    downloadGlbBtn.hidden = false;
    downloadGlbBtn.href = apiPath(asset.artifact.url);
    downloadGlbBtn.download = `${asset.slug || asset.name}.glb`;

    const m = asset.metrics || {};
    const size = m.boundingBox?.size || [0, 0, 0];
    const aiLabel = asset.ai?.usedLlm ? `${asset.ai.provider}/${asset.ai.model}` : (asset.ai?.provider || 'local');
    const engName = asset.engine?.id === 'threejs-cli' ? `Three.js (${asset.engine?.version || ''})` : `Blender ${asset.engine?.version || ''}`;
    metricsBar.hidden = false;
    metricsBar.innerHTML = [
      `<span>엔진: <strong>${escapeHtml(engName)}</strong></span>`,
      `<span>AI: <strong>${escapeHtml(aiLabel)}</strong></span>`,
      `<span>삼각형: <strong>${m.triangleCount ?? '-'}</strong></span>`,
      `<span>시간: <strong>${m.processElapsedMs ?? m.durationMs ?? '-'}ms</strong></span>`,
      `<span>크기: <strong>${size.map(v => Number(v).toFixed(2)).join('×')}m</strong></span>`,
      `<span>GLB: <strong>${((asset.artifact?.bytes || 0) / 1024).toFixed(1)} KB</strong></span>`,
    ].join('');
  }

  async function selectAsset(asset) {
    updateSelectedAssetUi(asset);
    renderAssetList();
    if (!asset?.artifact?.url) return;
    try {
      const res = await fetch(apiPath(asset.artifact.url), { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`GLB 다운로드 실패 (${res.status})`);
      const buf = await res.arrayBuffer();
      viewer.loadGlb(buf);
      canvasEmpty.style.display = 'none';
    } catch (err) {
      setStatus(`GLB 프리뷰 로드 오류: ${err.message}`, 'error');
    }
  }

  function renderAssetList() {
    assetCountEl.textContent = String(assetsCache.length);
    if (!assetsCache.length) {
      assetListEl.innerHTML = '<div class="asset-empty">아직 생성된 3D 에셋이 없습니다. 1→2→3단계를 거쳐 첫 모델을 만들어 보세요.</div>';
      return;
    }
    assetListEl.innerHTML = '';
    for (const asset of assetsCache) {
      const isThree = asset.engine?.id === 'threejs-cli';
      const card = document.createElement('div');
      card.className = 'asset-card' + (selectedAsset?.assetId === asset.assetId ? ' selected' : '');
      card.innerHTML = `
        <div class="asset-card-title">
          <span>${escapeHtml(asset.name)}</span>
          <span class="badge ${isThree ? 'badge-threejs' : 'badge-blender'}">${isThree ? 'Three.js' : 'Blender'}</span>
        </div>
        <div class="asset-card-meta" title="${escapeHtml(asset.prompt || '')}">${escapeHtml(asset.prompt || '')}</div>
        <div class="asset-card-meta">${asset.metrics?.triangleCount ?? 0} tris · ${asset.metrics?.processElapsedMs ?? asset.metrics?.durationMs ?? 0}ms · ${((asset.artifact?.bytes || 0) / 1024).toFixed(1)} KB</div>
      `;
      card.addEventListener('click', () => selectAsset(asset));
      assetListEl.appendChild(card);
    }
  }

  async function loadStatus() {
    try {
      const res = await fetch(apiPath('/api/blender/status'), { credentials: 'same-origin', cache: 'no-store' });
      const data = await readJsonSafe(res);
      const bl = (data.engines || []).find(e => e.id === 'blender-cli');
      const tjs = (data.engines || []).find(e => e.id === 'threejs-cli');
      if (bl?.available) {
        blenderStatusPill.textContent = `● Blender ${bl.version || ''}`;
        blenderStatusPill.className = 'pill pill-ok';
      } else {
        blenderStatusPill.textContent = '○ Blender 미감지';
        blenderStatusPill.className = 'pill pill-warn';
      }
      if (tjs?.available) {
        threejsStatusPill.textContent = `● ${tjs.version || 'Three.js'}`;
        threejsStatusPill.className = 'pill pill-ok';
      } else {
        threejsStatusPill.textContent = '○ Three.js 미감지';
        threejsStatusPill.className = 'pill pill-warn';
      }
    } catch {
      blenderStatusPill.textContent = '○ 서버 연결 실패';
      blenderStatusPill.className = 'pill pill-warn';
    }
  }

  async function loadAssets(autoSelectFirst = false) {
    try {
      const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
      const res = await fetch(apiPath(`/api/blender/assets${qs}`), { credentials: 'same-origin', cache: 'no-store' });
      const data = await readJsonSafe(res);
      assetsCache = Array.isArray(data.assets) ? data.assets : [];
      renderAssetList();
      if (autoSelectFirst && !selectedAsset && assetsCache.length > 0) {
        await selectAsset(assetsCache[0]);
      }
    } catch { /* ignore */ }
  }

  function triggerGodotPlacement(asset) {
    if (!asset) return;
    const manifest = { ...asset, placement: currentPlacement() };
    if (embedded && window.parent && window.parent !== window) {
      window.parent.postMessage({ source: 'playforge-blender-studio', type: 'place-asset', manifest }, location.origin);
      setStatus(`Web Godot 에디터로 '${asset.name}' 자동 임포트·배치 명령을 전송했습니다.`, 'success');
    } else {
      setStatus(`단독 모드입니다. Web Godot 에디터의 [AI 3D] 버튼으로 열면 씬에 즉시 배치됩니다. (${asset.artifact?.suggestedResPath})`, 'success');
    }
  }

  window.addEventListener('message', event => {
    if (event.origin !== location.origin) return;
    if (event.data?.source === 'playforge-godot-editor' && event.data?.type === 'blender-placed') {
      const d = event.data.detail || {};
      if (d.ok && d.placed) setStatus(`Godot 씬 배치 완료! 노드 '${d.nodeName}' (${d.resGlbPath})`, 'success');
      else if (d.error) setStatus(`Godot 배치 오류: ${d.error}`, 'error');
    }
  });

  refreshAssetsBtn.addEventListener('click', () => loadAssets(false));
  placeInGodotBtn.addEventListener('click', () => triggerGodotPlacement(selectedAsset));

  loadStatus();
  loadAiModels();
  loadConcepts();
  loadAssets(true);

  // =========================================================================
  // Minimal Zero-Dependency WebGL glTF 2.0 (.glb) Renderer
  // =========================================================================
  function createGlbViewer(canvasEl) {
    const gl = canvasEl.getContext('webgl', { antialias: true, alpha: true });
    let autoSpin = true;
    let yaw = 0.65;
    let pitch = 0.35;
    let distance = 3.2;
    let target = [0, 0.8, 0];
    let drawCalls = [];
    let gridBuf = null;
    let gridCount = 0;

    if (!gl) return { loadGlb() {}, toggleSpin() { return false; }, resetCamera() {} };

    const vsSrc = `
      attribute vec3 aPos;
      attribute vec3 aNorm;
      uniform mat4 uMvp;
      uniform mat4 uModel;
      varying vec3 vNorm;
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = uModel * vec4(aPos, 1.0);
        vWorldPos = wp.xyz;
        vNorm = normalize(mat3(uModel) * aNorm);
        gl_Position = uMvp * vec4(aPos, 1.0);
      }
    `;
    const fsSrc = `
      precision mediump float;
      varying vec3 vNorm;
      varying vec3 vWorldPos;
      uniform vec4 uColor;
      uniform vec3 uEmissive;
      uniform float uMetallic;
      uniform float uRoughness;
      uniform vec3 uCamPos;
      uniform float uUnlit;
      void main() {
        if (uUnlit > 0.5) { gl_FragColor = uColor; return; }
        vec3 N = normalize(vNorm);
        vec3 V = normalize(uCamPos - vWorldPos);
        vec3 L1 = normalize(vec3(0.65, 1.0, 0.55));
        vec3 L2 = normalize(vec3(-0.7, 0.4, -0.6));
        float d1 = max(dot(N, L1), 0.0);
        float d2 = max(dot(N, L2), 0.0) * 0.35;
        vec3 H = normalize(L1 + V);
        float shininess = mix(96.0, 8.0, clamp(uRoughness, 0.05, 1.0));
        float spec = pow(max(dot(N, H), 0.0), shininess) * mix(0.25, 0.9, uMetallic);
        float hemi = 0.28 + 0.16 * (N.y * 0.5 + 0.5);
        vec3 base = uColor.rgb * (hemi + d1 * 0.82 + d2);
        vec3 specCol = mix(vec3(1.0), uColor.rgb, uMetallic) * spec;
        vec3 rim = vec3(0.32, 0.52, 0.85) * pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.25;
        vec3 col = base + specCol + rim + uEmissive;
        col = col / (col + vec3(1.0));
        col = pow(col, vec3(1.0 / 2.2));
        gl_FragColor = vec4(col, 1.0);
      }
    `;

    function compile(type, src) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    }

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const loc = {
      aPos: gl.getAttribLocation(prog, 'aPos'),
      aNorm: gl.getAttribLocation(prog, 'aNorm'),
      uMvp: gl.getUniformLocation(prog, 'uMvp'),
      uModel: gl.getUniformLocation(prog, 'uModel'),
      uColor: gl.getUniformLocation(prog, 'uColor'),
      uEmissive: gl.getUniformLocation(prog, 'uEmissive'),
      uMetallic: gl.getUniformLocation(prog, 'uMetallic'),
      uRoughness: gl.getUniformLocation(prog, 'uRoughness'),
      uCamPos: gl.getUniformLocation(prog, 'uCamPos'),
      uUnlit: gl.getUniformLocation(prog, 'uUnlit'),
    };

    {
      const lines = [];
      const half = 6;
      for (let i = -half; i <= half; i++) {
        lines.push(-half, 0, i, half, 0, i);
        lines.push(i, 0, -half, i, 0, half);
      }
      gridBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, gridBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.STATIC_DRAW);
      gridCount = lines.length / 3;
    }

    function resize() {
      const rect = canvasEl.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvasEl.width !== w || canvasEl.height !== h) {
        canvasEl.width = w;
        canvasEl.height = h;
      }
    }

    let dragging = false, lastX = 0, lastY = 0;
    canvasEl.addEventListener('pointerdown', e => {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      canvasEl.setPointerCapture(e.pointerId);
    });
    canvasEl.addEventListener('pointermove', e => {
      if (!dragging) return;
      yaw -= (e.clientX - lastX) * 0.01;
      pitch = Math.max(-1.3, Math.min(1.45, pitch + (e.clientY - lastY) * 0.01));
      lastX = e.clientX; lastY = e.clientY;
    });
    canvasEl.addEventListener('pointerup', () => { dragging = false; });
    canvasEl.addEventListener('pointercancel', () => { dragging = false; });
    canvasEl.addEventListener('wheel', e => {
      e.preventDefault();
      distance = Math.max(0.6, Math.min(30, distance * (e.deltaY > 0 ? 1.1 : 0.9)));
    }, { passive: false });

    function loadGlb(arrayBuffer) {
      for (const dc of drawCalls) {
        gl.deleteBuffer(dc.posBuf);
        gl.deleteBuffer(dc.normBuf);
        if (dc.idxBuf) gl.deleteBuffer(dc.idxBuf);
      }
      drawCalls = [];

      const view = new DataView(arrayBuffer);
      if (view.getUint32(0, true) !== 0x46546c67) throw new Error('Invalid GLB header');
      let offset = 12, gltf = null, bin = null;
      while (offset + 8 <= arrayBuffer.byteLength) {
        const len = view.getUint32(offset, true);
        const type = view.getUint32(offset + 4, true);
        offset += 8;
        if (type === 0x4e4f534a) gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(arrayBuffer, offset, len)));
        else if (type === 0x004e4942) bin = new Uint8Array(arrayBuffer, offset, len);
        offset += len;
      }
      if (!gltf || !bin) throw new Error('Incomplete GLB chunks');

      function readAccessor(idx) {
        const acc = gltf.accessors[idx];
        const bv = gltf.bufferViews[acc.bufferView];
        const byteOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
        const compCounts = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
        const nComp = compCounts[acc.type] || 1;
        const count = acc.count * nComp;
        const stride = bv.byteStride || 0;
        const base = bin.byteOffset + byteOffset;
        if (!stride) {
          if (acc.componentType === 5126) return new Float32Array(bin.buffer, base, count);
          if (acc.componentType === 5123) return new Uint16Array(bin.buffer, base, count);
          if (acc.componentType === 5125) return new Uint32Array(bin.buffer, base, count);
          if (acc.componentType === 5121) return new Uint8Array(bin.buffer, base, count);
        }
        const out = new Float32Array(count);
        const dv = new DataView(bin.buffer, bin.byteOffset + (bv.byteOffset || 0), bv.byteLength);
        for (let i = 0; i < acc.count; i++) {
          const elemOff = (acc.byteOffset || 0) + i * stride;
          for (let c = 0; c < nComp; c++) out[i * nComp + c] = dv.getFloat32(elemOff + c * 4, true);
        }
        return out;
      }

      const minB = [Infinity, Infinity, Infinity];
      const maxB = [-Infinity, -Infinity, -Infinity];

      function nodeMatrix(node) {
        if (Array.isArray(node.matrix) && node.matrix.length === 16) return new Float32Array(node.matrix);
        return mat4FromTrs(node.translation || [0, 0, 0], node.rotation || [0, 0, 0, 1], node.scale || [1, 1, 1]);
      }

      function visitNode(nodeIdx, parentMat) {
        const node = gltf.nodes[nodeIdx];
        const world = mat4Mul(parentMat, nodeMatrix(node));
        if (typeof node.mesh === 'number') {
          const mesh = gltf.meshes[node.mesh];
          for (const prim of mesh.primitives || []) {
            const pos = readAccessor(prim.attributes.POSITION);
            const norm = typeof prim.attributes.NORMAL === 'number' ? readAccessor(prim.attributes.NORMAL) : computeFlatNormals(pos);
            let idxArr = typeof prim.indices === 'number' ? readAccessor(prim.indices) : null;
            if (idxArr instanceof Uint32Array) idxArr = new Uint16Array(idxArr);
            for (let i = 0; i < pos.length; i += 3) {
              const p = transformPoint(world, pos[i], pos[i + 1], pos[i + 2]);
              minB[0] = Math.min(minB[0], p[0]); minB[1] = Math.min(minB[1], p[1]); minB[2] = Math.min(minB[2], p[2]);
              maxB[0] = Math.max(maxB[0], p[0]); maxB[1] = Math.max(maxB[1], p[1]); maxB[2] = Math.max(maxB[2], p[2]);
            }
            const mat = typeof prim.material === 'number' ? gltf.materials?.[prim.material] : null;
            const pbr = mat?.pbrMetallicRoughness || {};
            const posBuf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
            gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
            const normBuf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
            gl.bufferData(gl.ARRAY_BUFFER, norm, gl.STATIC_DRAW);
            let idxBuf = null;
            if (idxArr) {
              idxBuf = gl.createBuffer();
              gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
              gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxArr, gl.STATIC_DRAW);
            }
            drawCalls.push({
              world, posBuf, normBuf, idxBuf,
              count: idxArr ? idxArr.length : pos.length / 3,
              idxType: idxArr instanceof Uint8Array ? gl.UNSIGNED_BYTE : gl.UNSIGNED_SHORT,
              color: pbr.baseColorFactor || [0.75, 0.78, 0.84, 1.0],
              emissive: mat?.emissiveFactor || [0, 0, 0],
              metallic: pbr.metallicFactor ?? 0.1,
              roughness: pbr.roughnessFactor ?? 0.6,
            });
          }
        }
        for (const childIdx of node.children || []) visitNode(childIdx, world);
      }

      const scene = gltf.scenes?.[gltf.scene ?? 0] || { nodes: (gltf.nodes || []).map((_, i) => i) };
      const ident = mat4Identity();
      for (const nIdx of scene.nodes || []) visitNode(nIdx, ident);

      if (Number.isFinite(minB[0])) {
        target = [(minB[0] + maxB[0]) * 0.5, (minB[1] + maxB[1]) * 0.5, (minB[2] + maxB[2]) * 0.5];
        const radius = Math.max(0.5, Math.hypot(maxB[0] - minB[0], maxB[1] - minB[1], maxB[2] - minB[2]) * 0.5);
        distance = radius * 2.65;
      }
    }

    function frame() {
      resize();
      if (autoSpin && !dragging) yaw += 0.008;
      gl.viewport(0, 0, canvasEl.width, canvasEl.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);

      const aspect = canvasEl.width / Math.max(1, canvasEl.height);
      const proj = mat4Perspective(Math.PI / 4, aspect, 0.05, 200);
      const cam = [
        target[0] + Math.sin(yaw) * Math.cos(pitch) * distance,
        target[1] + Math.sin(pitch) * distance,
        target[2] + Math.cos(yaw) * Math.cos(pitch) * distance,
      ];
      const view = mat4LookAt(cam, target, [0, 1, 0]);
      const vp = mat4Mul(proj, view);
      gl.uniform3fv(loc.uCamPos, cam);

      gl.uniform1f(loc.uUnlit, 1.0);
      gl.uniform4f(loc.uColor, 0.24, 0.30, 0.42, 0.6);
      gl.uniformMatrix4fv(loc.uModel, false, mat4Identity());
      gl.uniformMatrix4fv(loc.uMvp, false, vp);
      gl.bindBuffer(gl.ARRAY_BUFFER, gridBuf);
      gl.enableVertexAttribArray(loc.aPos);
      gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.disableVertexAttribArray(loc.aNorm);
      gl.vertexAttrib3f(loc.aNorm, 0, 1, 0);
      gl.drawArrays(gl.LINES, 0, gridCount);

      gl.uniform1f(loc.uUnlit, 0.0);
      for (const dc of drawCalls) {
        gl.uniformMatrix4fv(loc.uModel, false, dc.world);
        gl.uniformMatrix4fv(loc.uMvp, false, mat4Mul(vp, dc.world));
        gl.uniform4fv(loc.uColor, dc.color);
        gl.uniform3fv(loc.uEmissive, dc.emissive);
        gl.uniform1f(loc.uMetallic, dc.metallic);
        gl.uniform1f(loc.uRoughness, dc.roughness);
        gl.bindBuffer(gl.ARRAY_BUFFER, dc.posBuf);
        gl.enableVertexAttribArray(loc.aPos);
        gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, dc.normBuf);
        gl.enableVertexAttribArray(loc.aNorm);
        gl.vertexAttribPointer(loc.aNorm, 3, gl.FLOAT, false, 0, 0);
        if (dc.idxBuf) {
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, dc.idxBuf);
          gl.drawElements(gl.TRIANGLES, dc.count, dc.idxType, 0);
        } else {
          gl.drawArrays(gl.TRIANGLES, 0, dc.count);
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    return {
      loadGlb,
      toggleSpin() { autoSpin = !autoSpin; return autoSpin; },
      resetCamera() { yaw = 0.65; pitch = 0.35; },
    };
  }

  function computeFlatNormals(pos) {
    const out = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) { out[i] = 0; out[i + 1] = 1; out[i + 2] = 0; }
    return out;
  }
  function mat4Identity() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
  function mat4FromTrs(t, q, s) {
    const [x, y, z, w] = q;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    return new Float32Array([
      (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
      (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
      (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
      t[0], t[1], t[2], 1,
    ]);
  }
  function mat4Mul(a, b) {
    const out = new Float32Array(16);
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        out[col * 4 + row] =
          a[0 * 4 + row] * b[col * 4 + 0] +
          a[1 * 4 + row] * b[col * 4 + 1] +
          a[2 * 4 + row] * b[col * 4 + 2] +
          a[3 * 4 + row] * b[col * 4 + 3];
      }
    }
    return out;
  }
  function mat4Perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }
  function mat4LookAt(eye, center, up) {
    let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
    let zl = Math.hypot(zx, zy, zz) || 1; zx /= zl; zy /= zl; zz /= zl;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    let xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([
      xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
      -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
      -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
      -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
      1,
    ]);
  }
  function transformPoint(m, x, y, z) {
    return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
  }
})();
