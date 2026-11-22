(() => {
  'use strict';

  const query = new URLSearchParams(location.search);
  const embedded = query.get('embedded') === '1';
  const projectId = query.get('project') || '';
  const forgeBase = (location.pathname.match(/^(.*?)\/(?:OfficialGodot|Studio|StudioGodot|Frontends)(?:\/|$)/)?.[1]) || '';
  const apiPath = route => (forgeBase && route.startsWith('/') && !route.startsWith(forgeBase + '/')) ? forgeBase + route : route;

  const $ = id => document.getElementById(id);

  // Header
  const backToForge = $('back-to-forge');
  const closeDrawerBtn = $('close-drawer-btn');
  const modePill = $('mode-pill');
  const balancePill = $('balance-pill');
  const openConfigBtn = $('open-config-btn');

  // Generation controls
  const genTabBtns = document.querySelectorAll('[data-gen-tab]');
  const presetChipsEl = $('preset-chips');
  const promptInput = $('prompt-input');
  const negativePromptInput = $('negative-prompt-input');
  const singleDropzone = $('single-dropzone');
  const singleFileInput = $('single-file-input');
  const singlePreviewImg = $('single-preview-img');
  const singleDropHint = $('single-drop-hint');
  const captureGodotBtn = $('capture-godot-btn');
  const clearSingleImgBtn = $('clear-single-img-btn');
  const singleUploadStatus = $('single-upload-status');
  const imageHintInput = $('image-hint-input');
  const mvSlots = document.querySelectorAll('.mv-slot');
  const mvHintInput = $('mv-hint-input');

  const modelSelect = $('model-select');
  const texQualitySelect = $('tex-quality-select');
  const faceLimitSelect = $('face-limit-select');
  const seedInput = $('seed-input');
  const optTexture = $('opt-texture');
  const optPbr = $('opt-pbr');
  const optQuad = $('opt-quad');
  const creditEstimateBadge = $('credit-estimate-badge');

  const generateBtn = $('generate-btn');
  const cancelJobBtn = $('cancel-job-btn');
  const progressWrap = $('progress-wrap');
  const progressStage = $('progress-stage');
  const progressPct = $('progress-pct');
  const progressFill = $('progress-fill');
  const statusBanner = $('status-banner');

  // Viewport & Post-processing
  const viewportTitle = $('viewport-title');
  const metricsBadges = $('metrics-badges');
  const toggleSpinBtn = $('toggle-spin-btn');
  const toggleWireBtn = $('toggle-wire-btn');
  const resetCamBtn = $('reset-cam-btn');
  const canvas = $('glb-canvas');
  const canvasEmpty = $('canvas-empty');

  const rigTypeSelect = $('rig-type-select');
  const rigBtn = $('rig-btn');
  const animPresetSelect = $('anim-preset-select');
  const retargetBtn = $('retarget-btn');
  const optFaceSelect = $('opt-face-select');
  const convertBtn = $('convert-btn');

  const posX = $('pos-x');
  const posY = $('pos-y');
  const posZ = $('pos-z');
  const placeGodotBtn = $('place-godot-btn');
  const downloadGlbBtn = $('download-glb-btn');

  // Bottom tabs
  const bottomTabBtns = document.querySelectorAll('[data-bottom-tab]');
  const assetCountEl = $('asset-count');
  const assetListEl = $('asset-list');
  const inspectorOutput = $('inspector-output');
  const refreshAllBtn = $('refresh-all-btn');

  // Config Modal
  const configModal = $('config-modal');
  const closeConfigBtn = $('close-config-btn');
  const cfgMode = $('cfg-mode');
  const cfgRegion = $('cfg-region');
  const cfgApiKey = $('cfg-apikey');
  const cfgKeyMasked = $('cfg-key-masked');
  const cfgFeedback = $('cfg-feedback');
  const cfgClearKeyBtn = $('cfg-clear-key-btn');
  const cfgSaveBtn = $('cfg-save-btn');

  if (embedded) {
    backToForge.hidden = true;
    closeDrawerBtn.hidden = false;
    captureGodotBtn.hidden = false;
    closeDrawerBtn.addEventListener('click', () => {
      window.parent?.postMessage({ source: 'playforge-tripo-studio', type: 'close' }, location.origin);
    });
  } else {
    backToForge.href = apiPath('/OfficialGodot/');
  }

  let csrfToken = null;
  let activeGenTab = 'text_to_model';
  let statusState = null;
  let assetsCache = [];
  let selectedAsset = null;
  let activeJobId = null;
  let pollTimer = null;
  let singleUpload = null;
  const multiviewUploads = [null, null, null, null];

  const viewer = createGlbViewer(canvas);

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function setStatus(text, tone = '') {
    statusBanner.textContent = text;
    statusBanner.className = 'status-banner' + (tone ? ' ' + tone : '');
  }

  async function readJsonSafe(res) {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { ok: false, error: `JSON 파싱 오류 (HTTP ${res.status})` };
    }
  }

  async function ensureCsrf() {
    if (csrfToken) return csrfToken;
    const res = await fetch(apiPath('/api/session'), { credentials: 'same-origin', cache: 'no-store' });
    const data = await readJsonSafe(res);
    csrfToken = typeof data?.csrfToken === 'string' ? data.csrfToken : null;
    return csrfToken;
  }

  async function apiFetch(route, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = { ...(options.headers || {}) };
    if (method !== 'GET' && method !== 'HEAD') {
      const token = await ensureCsrf();
      if (token) headers['X-PlayForge-CSRF'] = token;
    }
    const res = await fetch(apiPath(route), {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      method,
      headers,
    });
    const data = await readJsonSafe(res);
    return { res, data };
  }

  function updateCreditEstimate() {
    const models = statusState?.models || [];
    const found = models.find(m => m.id === modelSelect.value) || models[0];
    const est = found?.estimatedCredits?.[activeGenTab] ?? 20;
    const modeLabel = statusState?.mode === 'live' ? `예상 ~${est} cr` : `시뮬 ~${est} cr (실과금 0)`;
    creditEstimateBadge.textContent = modeLabel;
  }

  function renderInspector(traces, extra = null) {
    const payload = {
      apiBase: statusState?.baseUrl || 'https://openapi.tripo3d.ai/v3',
      mode: statusState?.mode || 'simulation',
      selectedAsset: selectedAsset ? {
        assetId: selectedAsset.assetId,
        tripo: selectedAsset.tripo,
        metrics: selectedAsset.metrics,
        artifact: selectedAsset.artifact,
      } : null,
      recentTraces: traces || statusState?.recentTraces || [],
      ...(extra ? { latestEvent: extra } : {}),
    };
    inspectorOutput.textContent = JSON.stringify(payload, null, 2);
  }

  function applyStatus(data) {
    statusState = data;
    const isLive = data.mode === 'live';
    modePill.textContent = isLive ? 'LIVE TRIPO v3' : 'SIMULATION';
    modePill.className = 'status-pill ' + (isLive ? 'live' : 'sim');

    if (data.balance && typeof data.balance.balance === 'number') {
      const frozenTxt = data.balance.frozen ? ` (예약 ${data.balance.frozen})` : '';
      balancePill.textContent = `🪙 ${data.balance.balance} cr${frozenTxt}`;
    } else if (data.balance?.error) {
      balancePill.textContent = '🪙 조회 실패';
    } else {
      balancePill.textContent = '🪙 -- cr';
    }

    if (modelSelect.options.length === 0 && Array.isArray(data.models)) {
      for (const m of data.models) {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.label;
        if (m.id === data.defaultModel) opt.selected = true;
        modelSelect.appendChild(opt);
      }
    }

    if (animPresetSelect.options.length === 0 && Array.isArray(data.animationPresets)) {
      for (const p of data.animationPresets) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.label;
        animPresetSelect.appendChild(opt);
      }
    }

    if (presetChipsEl.children.length === 0 && Array.isArray(data.promptPresets)) {
      for (const preset of data.promptPresets) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'preset-chip';
        btn.textContent = preset.label;
        btn.addEventListener('click', () => {
          promptInput.value = preset.prompt;
          negativePromptInput.value = preset.negativePrompt || '';
        });
        presetChipsEl.appendChild(btn);
      }
    }

    cfgMode.value = data.mode || 'simulation';
    cfgRegion.value = data.region || 'global';
    cfgKeyMasked.textContent = data.hasApiKey ? `(현재: ${data.apiKeyMasked})` : '(미설정)';
    updateCreditEstimate();
    renderInspector(data.recentTraces);
  }

  async function loadStatus() {
    const { data } = await apiFetch('/api/tripo/status');
    if (data?.ok) applyStatus(data);
  }

  async function loadAssets(selectFirst = false) {
    const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    const { data } = await apiFetch('/api/tripo/assets' + qs);
    if (!data?.ok) return;
    assetsCache = Array.isArray(data.assets) ? data.assets : [];
    assetCountEl.textContent = String(assetsCache.length);
    renderAssetList();
    if (selectFirst && assetsCache.length > 0 && !selectedAsset) {
      selectAsset(assetsCache[0]);
    }
  }

  function renderAssetList() {
    if (assetsCache.length === 0) {
      assetListEl.innerHTML = '<div class="muted-note">아직 생성된 Tripo 3D 에셋이 없습니다. 왼쪽에서 첫 모델을 생성해 보세요!</div>';
      return;
    }
    assetListEl.innerHTML = '';
    for (const asset of assetsCache) {
      const card = document.createElement('div');
      card.className = 'asset-card' + (selectedAsset?.assetId === asset.assetId ? ' selected' : '');
      const m = asset.metrics || {};
      const t = asset.tripo || {};
      const kb = Math.round((asset.artifact?.bytes || 0) / 1024);
      const tags = [];
      tags.push(`<span class="atag ${t.mode === 'live' ? 'live' : ''}">${t.mode === 'live' ? 'LIVE' : 'SIM'}</span>`);
      tags.push(`<span class="atag">${escapeHtml(t.taskType || '3D')}</span>`);
      if (m.skinCount > 0) tags.push(`<span class="atag rig">RIG ${m.boneCount}B</span>`);
      if (m.animationCount > 0) tags.push(`<span class="atag anim">ANIM ${m.animationCount}</span>`);

      card.innerHTML = `
        <div class="asset-card-head">
          <span class="asset-name" title="${escapeHtml(asset.name)}">${escapeHtml(asset.name)}</span>
          <button type="button" class="asset-del-btn" title="삭제">🗑️</button>
        </div>
        <div class="asset-tags">${tags.join('')}</div>
        <div class="asset-meta">▲ ${Number(m.triangleCount || 0).toLocaleString()} tris · ${kb} KB · Grade ${escapeHtml(m.gameReadiness?.grade || '-')}</div>
      `;
      card.addEventListener('click', e => {
        if (e.target.closest('.asset-del-btn')) return;
        selectAsset(asset);
      });
      card.querySelector('.asset-del-btn').addEventListener('click', async e => {
        e.stopPropagation();
        await apiFetch(`/api/tripo/assets/${encodeURIComponent(asset.assetId)}`, { method: 'DELETE' });
        if (selectedAsset?.assetId === asset.assetId) {
          selectedAsset = null;
          resetViewportUi();
        }
        await loadAssets(false);
        await loadStatus();
      });
      assetListEl.appendChild(card);
    }
  }

  function resetViewportUi() {
    viewportTitle.textContent = '3D GLB 뷰포트';
    metricsBadges.innerHTML = '';
    canvasEmpty.hidden = false;
    rigBtn.disabled = true;
    retargetBtn.disabled = true;
    convertBtn.disabled = true;
    placeGodotBtn.disabled = true;
    downloadGlbBtn.classList.add('disabled-link');
    downloadGlbBtn.href = '#';
  }

  async function selectAsset(asset) {
    selectedAsset = asset;
    renderAssetList();
    viewportTitle.textContent = `${asset.name} (${asset.tripo?.modelVersion || 'Tripo v3'})`;

    const m = asset.metrics || {};
    const gr = m.gameReadiness || {};
    const kb = ((asset.artifact?.bytes || 0) / 1024).toFixed(1);
    const badges = [
      `<span class="m-badge grade-${escapeHtml(gr.grade || 'A')}">Game Grade ${escapeHtml(gr.grade || 'A')}</span>`,
      `<span class="m-badge">▲ ${Number(m.triangleCount || 0).toLocaleString()} tris</span>`,
      `<span class="m-badge">• ${Number(m.vertexCount || 0).toLocaleString()} verts</span>`,
      `<span class="m-badge">🎨 ${m.materialCount || 0} mat / ${m.textureCount || 0} tex</span>`,
      `<span class="m-badge">📦 ${kb} KB</span>`,
    ];
    if (m.skinCount > 0) badges.push(`<span class="m-badge rig">🦴 Rigged (${m.boneCount} bones)</span>`);
    if (m.animationCount > 0) badges.push(`<span class="m-badge rig">🏃 ${escapeHtml((m.animationNames || []).join(', '))}</span>`);
    metricsBadges.innerHTML = badges.join('');

    rigBtn.disabled = false;
    retargetBtn.disabled = false;
    convertBtn.disabled = false;
    placeGodotBtn.disabled = false;

    const glbHref = apiPath(asset.artifact?.glbUrl || `/api/tripo/assets/${encodeURIComponent(asset.assetId)}/model.glb`);
    downloadGlbBtn.href = glbHref;
    downloadGlbBtn.download = `${asset.slug || asset.assetId}.glb`;
    downloadGlbBtn.classList.remove('disabled-link');

    try {
      const res = await fetch(glbHref, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`GLB HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      await viewer.loadGlb(buf);
      canvasEmpty.hidden = true;
      renderInspector(statusState?.recentTraces);
    } catch (err) {
      setStatus(`GLB 뷰어 로드 오류: ${err.message}`, 'error');
    }
  }

  // Tab switching
  genTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      activeGenTab = btn.dataset.genTab;
      genTabBtns.forEach(b => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', String(active));
      });
      document.querySelectorAll('.tab-pane').forEach(p => {
        const active = p.id === `tab-${activeGenTab}`;
        p.hidden = !active;
        p.classList.toggle('active', active);
      });
      updateCreditEstimate();
    });
  });

  bottomTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.bottomTab;
      bottomTabBtns.forEach(b => b.classList.toggle('active', b === btn));
      $('bottom-gallery').hidden = target !== 'gallery';
      $('bottom-inspector').hidden = target !== 'inspector';
    });
  });

  modelSelect.addEventListener('change', updateCreditEstimate);

  // Image reading & uploading helper
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
      reader.readAsDataURL(file);
    });
  }

  async function uploadImageDataUrl(dataUrl, filename) {
    const { res, data } = await apiFetch('/api/tripo/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl, filename }),
    });
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || `이미지 업로드 실패 (HTTP ${res.status})`);
    }
    return data.upload;
  }

  async function handleSingleImageFile(file) {
    if (!file) return;
    singleUploadStatus.textContent = '업로드 중…';
    try {
      const dataUrl = await fileToDataUrl(file);
      const uploaded = await uploadImageDataUrl(dataUrl, file.name);
      singleUpload = uploaded;
      singlePreviewImg.src = dataUrl;
      singlePreviewImg.hidden = false;
      singleDropHint.hidden = true;
      clearSingleImgBtn.hidden = false;
      singleUploadStatus.textContent = `업로드 완료 (${Math.round(uploaded.bytes / 1024)} KB · token 발급됨)`;
      if (!imageHintInput.value.trim()) {
        imageHintInput.value = file.name.replace(/\.[^.]+$/, '');
      }
      setStatus(`이미지 '${file.name}' 업로드 완료. [Tripo 3D 모델 생성]을 눌러 Image-to-3D를 실행하세요.`, 'success');
    } catch (err) {
      singleUploadStatus.textContent = err.message;
      setStatus(err.message, 'error');
    }
  }

  singleDropzone.addEventListener('click', () => singleFileInput.click());
  singleDropzone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); singleFileInput.click(); }
  });
  singleDropzone.addEventListener('dragover', e => { e.preventDefault(); singleDropzone.classList.add('dragover'); });
  singleDropzone.addEventListener('dragleave', () => singleDropzone.classList.remove('dragover'));
  singleDropzone.addEventListener('drop', e => {
    e.preventDefault();
    singleDropzone.classList.remove('dragover');
    if (e.dataTransfer?.files?.[0]) handleSingleImageFile(e.dataTransfer.files[0]);
  });
  singleFileInput.addEventListener('change', () => {
    if (singleFileInput.files?.[0]) handleSingleImageFile(singleFileInput.files[0]);
  });
  clearSingleImgBtn.addEventListener('click', () => {
    singleUpload = null;
    singlePreviewImg.hidden = true;
    singlePreviewImg.src = '';
    singleDropHint.hidden = false;
    clearSingleImgBtn.hidden = true;
    singleUploadStatus.textContent = '';
    singleFileInput.value = '';
  });

  captureGodotBtn.addEventListener('click', () => {
    if (embedded && window.parent) {
      window.parent.postMessage({ source: 'playforge-tripo-studio', type: 'capture-frame' }, location.origin);
      setStatus('Godot 에디터 뷰포트 캡처를 요청했습니다…');
    }
  });

  // Multiview upload slots
  mvSlots.forEach(slot => {
    const idx = Number(slot.dataset.mvIdx);
    const input = slot.querySelector('input[type="file"]');
    const img = slot.querySelector('.mv-img');
    slot.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await fileToDataUrl(file);
        const uploaded = await uploadImageDataUrl(dataUrl, file.name);
        multiviewUploads[idx] = uploaded;
        img.src = dataUrl;
        img.hidden = false;
        slot.classList.add('filled');
        setStatus(`다각도 슬롯 #${idx + 1} 업로드 완료 (${multiviewUploads.filter(Boolean).length}/4장).`, 'success');
      } catch (err) {
        setStatus(err.message, 'error');
      }
    });
  });

  // Job submission & polling
  function setBusy(busy) {
    generateBtn.disabled = busy;
    rigBtn.disabled = busy || !selectedAsset;
    retargetBtn.disabled = busy || !selectedAsset;
    convertBtn.disabled = busy || !selectedAsset;
    cancelJobBtn.hidden = !busy;
    progressWrap.hidden = !busy;
  }

  function updateProgressUi(stage, pct) {
    const stageLabels = {
      submitting: 'Tripo v3 작업 요청 전송 중…',
      creating_task: 'Tripo API 태스크 생성 중…',
      rig_check: 'Tripo Rig-Check 실행 중…',
      polling_tripo: 'Tripo 3D 모델링 · PBR 생성 진행 중…',
      downloading_glb: '서명된 GLB 아티팩트 로컬 캐싱 중 (만료 방지)…',
      validating_glb: 'glTF 2.0 바이너리 무결성 · 게임 적합성 검증 중…',
      completed: '완료!',
    };
    progressStage.textContent = stageLabels[stage] || stage || '처리 중…';
    const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
    progressPct.textContent = `${clamped}%`;
    progressFill.style.width = `${clamped}%`;
  }

  async function startPollingJob(jobId) {
    activeJobId = jobId;
    setBusy(true);
    updateProgressUi('creating_task', 8);

    const tick = async () => {
      if (!activeJobId) return;
      const { res, data } = await apiFetch(`/api/tripo/jobs/${encodeURIComponent(activeJobId)}`);
      if (!res.ok || !data?.ok || !data.job) {
        activeJobId = null;
        setBusy(false);
        setStatus(data?.error || '작업 상태 조회 실패', 'error');
        return;
      }
      const job = data.job;
      updateProgressUi(job.stage, job.progress);
      renderInspector(data.traces, { jobId: job.jobId, status: job.status, stage: job.stage, progress: job.progress });

      if (job.status === 'queued' || job.status === 'running') {
        pollTimer = setTimeout(tick, 450);
        return;
      }

      activeJobId = null;
      setBusy(false);
      await loadStatus();
      await loadAssets(false);

      if (job.status === 'succeeded' && job.asset) {
        await selectAsset(job.asset);
        const sec = ((job.durationMs || 0) / 1000).toFixed(2);
        setStatus(`Tripo 3D 작업 완료 (${sec}s)! '${job.asset.name}' GLB 검증 및 로컬 캐싱 완료.`, 'success');
      } else if (job.status === 'cancelled') {
        setStatus('사용자가 Tripo 작업을 중단했습니다.');
      } else {
        setStatus(`Tripo 작업 실패: ${job.error || job.status}`, 'error');
      }
    };

    pollTimer = setTimeout(tick, 220);
  }

  generateBtn.addEventListener('click', async () => {
    const body = {
      taskType: activeGenTab,
      model: modelSelect.value,
      texture: optTexture.checked,
      pbr: optPbr.checked,
      textureQuality: texQualitySelect.value,
      quad: optQuad.checked,
      projectId,
    };
    if (faceLimitSelect.value) body.faceLimit = Number(faceLimitSelect.value);
    if (seedInput.value !== '') body.modelSeed = Number(seedInput.value);

    if (activeGenTab === 'text_to_model') {
      body.prompt = promptInput.value.trim();
      body.negativePrompt = negativePromptInput.value.trim();
      if (!body.prompt) {
        setStatus('Text-to-3D 프롬프트를 입력해 주세요.', 'error');
        return;
      }
    } else if (activeGenTab === 'image_to_model') {
      if (!singleUpload?.uploadId) {
        setStatus('Image-to-3D를 실행할 기준 이미지를 먼저 업로드해 주세요.', 'error');
        return;
      }
      body.uploadId = singleUpload.uploadId;
      body.prompt = imageHintInput.value.trim();
      body.name = imageHintInput.value.trim() || 'ImageTo3D';
    } else if (activeGenTab === 'multiview_to_model') {
      const ids = multiviewUploads.filter(Boolean).map(u => u.uploadId);
      if (ids.length < 2) {
        setStatus('Multiview-to-3D에는 최소 2장 이상의 각도 이미지를 업로드해야 합니다.', 'error');
        return;
      }
      body.multiviewUploadIds = ids;
      body.prompt = mvHintInput.value.trim();
      body.name = mvHintInput.value.trim() || 'Multiview3D';
    }

    setBusy(true);
    updateProgressUi('submitting', 4);
    setStatus('Tripo API v3 생성 작업을 제출하고 있습니다…');

    const { res, data } = await apiFetch('/api/tripo/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok || !data?.ok || !data.job?.jobId) {
      setBusy(false);
      setStatus(`생성 요청 오류: ${data?.error || `HTTP ${res.status}`}`, 'error');
      return;
    }
    startPollingJob(data.job.jobId);
  });

  cancelJobBtn.addEventListener('click', async () => {
    if (!activeJobId) return;
    clearTimeout(pollTimer);
    const id = activeJobId;
    activeJobId = null;
    await apiFetch(`/api/tripo/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
    setBusy(false);
    setStatus('Tripo 작업 중단을 요청했습니다.');
  });

  // Post-processing actions
  async function runPostProcess(action, payload) {
    if (!selectedAsset) return;
    setBusy(true);
    updateProgressUi('submitting', 5);
    setStatus(`'${selectedAsset.name}'에 Tripo ${action} 후처리를 요청 중…`);
    const { res, data } = await apiFetch(`/api/tripo/assets/${encodeURIComponent(selectedAsset.assetId)}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok || !data?.ok || !data.job?.jobId) {
      setBusy(false);
      setStatus(`후처리 오류: ${data?.error || `HTTP ${res.status}`}`, 'error');
      return;
    }
    startPollingJob(data.job.jobId);
  }

  rigBtn.addEventListener('click', () => runPostProcess('rig', { rigType: rigTypeSelect.value }));
  retargetBtn.addEventListener('click', () => runPostProcess('retarget', { animation: animPresetSelect.value }));
  convertBtn.addEventListener('click', () => runPostProcess('convert', {
    format: 'GLTF',
    faceLimit: Number(optFaceSelect.value) || 10000,
    quad: optQuad.checked,
  }));

  // Godot scene placement
  placeGodotBtn.addEventListener('click', () => {
    if (!selectedAsset) return;
    const manifest = {
      ...selectedAsset,
      placement: {
        position: [Number(posX.value) || 0, Number(posY.value) || 0, Number(posZ.value) || 0],
        rotationDeg: [0, 0, 0],
        scale: [1, 1, 1],
      },
    };
    if (embedded && window.parent && window.parent !== window) {
      window.parent.postMessage({ source: 'playforge-tripo-studio', type: 'place-asset', manifest }, location.origin);
      setStatus(`Web Godot 에디터로 '${selectedAsset.name}' GLB 즉시 임포트·씬 배치를 요청했습니다.`, 'success');
    } else {
      setStatus(`단독 스튜디오 모드입니다. Web Godot 에디터 상단 [Tripo 3D] 버튼으로 열면 씬에 즉시 배치됩니다 (${selectedAsset.artifact?.suggestedResPath}).`, 'success');
    }
  });

  // Listen to Godot editor messages
  window.addEventListener('message', async event => {
    if (event.origin !== location.origin) return;
    if (event.data?.source === 'playforge-godot-editor' && event.data?.type === 'tripo-placed') {
      const d = event.data.detail || {};
      if (d.ok && d.placed) {
        const extra = d.boneCount ? ` · 뼈대 ${d.boneCount}본` : '';
        setStatus(`Godot 씬 배치 완료! 노드 '${d.nodeName}' (${d.resGlbPath}${extra})`, 'success');
      } else if (d.error) {
        setStatus(`Godot 배치 오류: ${d.error}`, 'error');
      }
    }
    if (event.data?.source === 'playforge-godot-editor' && event.data?.type === 'captured-frame') {
      if (event.data.ok && event.data.dataUrl) {
        try {
          const uploaded = await uploadImageDataUrl(event.data.dataUrl, 'godot_viewport.png');
          singleUpload = uploaded;
          singlePreviewImg.src = event.data.dataUrl;
          singlePreviewImg.hidden = false;
          singleDropHint.hidden = true;
          clearSingleImgBtn.hidden = false;
          singleUploadStatus.textContent = `Godot 뷰포트 캡처 업로드 완료 (${Math.round(uploaded.bytes / 1024)} KB)`;
          setStatus('Godot 뷰포트 화면을 Image-to-3D 기준으로 불러왔습니다.', 'success');
        } catch (err) {
          setStatus(err.message, 'error');
        }
      } else {
        setStatus(event.data.error || '뷰포트 캡처 실패', 'error');
      }
    }
  });

  // Viewport controls
  toggleSpinBtn.addEventListener('click', () => {
    const spinning = viewer.toggleSpin();
    toggleSpinBtn.textContent = spinning ? '회전 ON' : '회전 OFF';
  });
  toggleWireBtn.addEventListener('click', () => {
    const wire = viewer.toggleWireframe();
    toggleWireBtn.textContent = wire ? '와이어 ON' : '와이어';
  });
  resetCamBtn.addEventListener('click', () => viewer.resetCamera());
  refreshAllBtn.addEventListener('click', () => { loadStatus(); loadAssets(false); });

  // Config Modal
  function openConfigModal() {
    cfgFeedback.hidden = true;
    cfgApiKey.value = '';
    configModal.hidden = false;
  }
  openConfigBtn.addEventListener('click', openConfigModal);
  closeConfigBtn.addEventListener('click', () => { configModal.hidden = true; });
  configModal.addEventListener('click', e => {
    if (e.target === configModal) configModal.hidden = true;
  });

  cfgSaveBtn.addEventListener('click', async () => {
    cfgFeedback.hidden = false;
    cfgFeedback.className = 'cfg-feedback';
    cfgFeedback.textContent = '설정 저장 및 연결 확인 중…';
    const payload = {
      mode: cfgMode.value,
      region: cfgRegion.value,
      testConnection: cfgMode.value === 'live',
    };
    if (cfgApiKey.value.trim()) payload.apiKey = cfgApiKey.value.trim();

    const { res, data } = await apiFetch('/api/tripo/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok || !data?.ok) {
      cfgFeedback.className = 'cfg-feedback err';
      cfgFeedback.textContent = data?.error || `설정 저장 실패 (HTTP ${res.status})`;
      return;
    }
    const balText = data.balance?.ok ? ` · 잔액 ${data.balance.balance} cr 확인!` : '';
    cfgFeedback.className = 'cfg-feedback ok';
    cfgFeedback.textContent = `저장 완료 (모드: ${data.config.mode.toUpperCase()}${balText})`;
    await loadStatus();
  });

  cfgClearKeyBtn.addEventListener('click', async () => {
    const { res, data } = await apiFetch('/api/tripo/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clearApiKey: true, mode: 'simulation' }),
    });
    cfgFeedback.hidden = false;
    if (res.ok && data?.ok) {
      cfgFeedback.className = 'cfg-feedback ok';
      cfgFeedback.textContent = 'API 키가 삭제되었고 시뮬레이션 모드로 전환되었습니다.';
      await loadStatus();
    } else {
      cfgFeedback.className = 'cfg-feedback err';
      cfgFeedback.textContent = data?.error || '키 삭제 실패';
    }
  });

  // Boot
  loadStatus();
  loadAssets(true);

  // =========================================================================
  // Zero-Dependency WebGL glTF 2.0 PBR + Embedded Albedo Texture Viewer
  // =========================================================================
  function createGlbViewer(canvasEl) {
    const gl = canvasEl.getContext('webgl', { antialias: true, alpha: true });
    let autoSpin = true;
    let wireframe = false;
    let yaw = 0.65;
    let pitch = 0.28;
    let distance = 3.2;
    let target = [0, 0.85, 0];
    let drawCalls = [];
    let texturesToFree = [];
    let gridBuf = null;
    let gridCount = 0;

    if (!gl) {
      return {
        async loadGlb() {},
        toggleSpin() { return false; },
        toggleWireframe() { return false; },
        resetCamera() {},
      };
    }

    const vsSrc = `
      attribute vec3 aPos;
      attribute vec3 aNorm;
      attribute vec2 aUv;
      uniform mat4 uMvp;
      uniform mat4 uModel;
      varying vec3 vNorm;
      varying vec3 vWorldPos;
      varying vec2 vUv;
      void main() {
        vec4 wp = uModel * vec4(aPos, 1.0);
        vWorldPos = wp.xyz;
        vNorm = normalize(mat3(uModel) * aNorm);
        vUv = aUv;
        gl_Position = uMvp * vec4(aPos, 1.0);
      }
    `;
    const fsSrc = `
      precision mediump float;
      varying vec3 vNorm;
      varying vec3 vWorldPos;
      varying vec2 vUv;
      uniform vec4 uColor;
      uniform vec3 uEmissive;
      uniform float uMetallic;
      uniform float uRoughness;
      uniform vec3 uCamPos;
      uniform float uUnlit;
      uniform float uHasTex;
      uniform sampler2D uTex;
      void main() {
        if (uUnlit > 0.5) { gl_FragColor = uColor; return; }
        vec4 albedo = uColor;
        if (uHasTex > 0.5) {
          albedo *= texture2D(uTex, vUv);
        }
        vec3 N = normalize(vNorm);
        vec3 V = normalize(uCamPos - vWorldPos);
        vec3 L1 = normalize(vec3(0.6, 1.0, 0.65));
        vec3 L2 = normalize(vec3(-0.7, 0.35, -0.6));
        float d1 = max(dot(N, L1), 0.0);
        float d2 = max(dot(N, L2), 0.0) * 0.38;
        vec3 H = normalize(L1 + V);
        float shininess = mix(96.0, 8.0, clamp(uRoughness, 0.05, 1.0));
        float spec = pow(max(dot(N, H), 0.0), shininess) * mix(0.25, 0.9, uMetallic);
        float hemi = 0.30 + 0.18 * (N.y * 0.5 + 0.5);
        vec3 base = albedo.rgb * (hemi + d1 * 0.82 + d2);
        vec3 specCol = mix(vec3(1.0), albedo.rgb, uMetallic) * spec;
        vec3 rim = vec3(0.22, 0.72, 0.82) * pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.28;
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
      aUv: gl.getAttribLocation(prog, 'aUv'),
      uMvp: gl.getUniformLocation(prog, 'uMvp'),
      uModel: gl.getUniformLocation(prog, 'uModel'),
      uColor: gl.getUniformLocation(prog, 'uColor'),
      uEmissive: gl.getUniformLocation(prog, 'uEmissive'),
      uMetallic: gl.getUniformLocation(prog, 'uMetallic'),
      uRoughness: gl.getUniformLocation(prog, 'uRoughness'),
      uCamPos: gl.getUniformLocation(prog, 'uCamPos'),
      uUnlit: gl.getUniformLocation(prog, 'uUnlit'),
      uHasTex: gl.getUniformLocation(prog, 'uHasTex'),
      uTex: gl.getUniformLocation(prog, 'uTex'),
    };

    // Fallback 1x1 white texture
    const whiteTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, whiteTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));

    // Grid lines
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
      distance = Math.max(0.5, Math.min(30, distance * (e.deltaY > 0 ? 1.1 : 0.9)));
    }, { passive: false });

    function decodeImageBlob(blob) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image decode failed')); };
        img.src = url;
      });
    }

    async function loadGlb(arrayBuffer) {
      for (const dc of drawCalls) {
        gl.deleteBuffer(dc.posBuf);
        gl.deleteBuffer(dc.normBuf);
        gl.deleteBuffer(dc.uvBuf);
        if (dc.idxBuf) gl.deleteBuffer(dc.idxBuf);
      }
      for (const tx of texturesToFree) gl.deleteTexture(tx);
      drawCalls = [];
      texturesToFree = [];

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

      // Decode embedded glTF images to WebGL textures
      const glTextures = [];
      for (const texDef of gltf.textures || []) {
        const imgDef = gltf.images?.[texDef.source];
        if (!imgDef || typeof imgDef.bufferView !== 'number') {
          glTextures.push(null);
          continue;
        }
        try {
          const bv = gltf.bufferViews[imgDef.bufferView];
          const slice = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
          const blob = new Blob([slice], { type: imgDef.mimeType || 'image/png' });
          const img = await decodeImageBlob(blob);
          const glTex = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, glTex);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          glTextures.push(glTex);
          texturesToFree.push(glTex);
        } catch {
          glTextures.push(null);
        }
      }

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
      const extUint = gl.getExtension('OES_element_index_uint');

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
            const norm = typeof prim.attributes.NORMAL === 'number' ? readAccessor(prim.attributes.NORMAL) : computeUpNormals(pos);
            const uv = typeof prim.attributes.TEXCOORD_0 === 'number'
              ? readAccessor(prim.attributes.TEXCOORD_0)
              : new Float32Array((pos.length / 3) * 2);
            let idxArr = typeof prim.indices === 'number' ? readAccessor(prim.indices) : null;
            let idxType = gl.UNSIGNED_SHORT;
            if (idxArr instanceof Uint8Array) idxType = gl.UNSIGNED_BYTE;
            else if (idxArr instanceof Uint32Array) {
              if (extUint) idxType = gl.UNSIGNED_INT;
              else idxArr = new Uint16Array(idxArr);
            }

            for (let i = 0; i < pos.length; i += 3) {
              const p = transformPoint(world, pos[i], pos[i + 1], pos[i + 2]);
              minB[0] = Math.min(minB[0], p[0]); minB[1] = Math.min(minB[1], p[1]); minB[2] = Math.min(minB[2], p[2]);
              maxB[0] = Math.max(maxB[0], p[0]); maxB[1] = Math.max(maxB[1], p[1]); maxB[2] = Math.max(maxB[2], p[2]);
            }

            const mat = typeof prim.material === 'number' ? gltf.materials?.[prim.material] : null;
            const pbr = mat?.pbrMetallicRoughness || {};
            const texIdx = pbr.baseColorTexture?.index;
            const glTex = typeof texIdx === 'number' ? glTextures[texIdx] : null;

            const posBuf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
            gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);

            const normBuf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
            gl.bufferData(gl.ARRAY_BUFFER, norm, gl.STATIC_DRAW);

            const uvBuf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
            gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);

            let idxBuf = null;
            if (idxArr) {
              idxBuf = gl.createBuffer();
              gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
              gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxArr, gl.STATIC_DRAW);
            }

            drawCalls.push({
              world, posBuf, normBuf, uvBuf, idxBuf,
              count: idxArr ? idxArr.length : pos.length / 3,
              idxType,
              tex: glTex,
              color: pbr.baseColorFactor || [0.78, 0.82, 0.88, 1.0],
              emissive: mat?.emissiveFactor || [0, 0, 0],
              metallic: pbr.metallicFactor ?? 0.15,
              roughness: pbr.roughnessFactor ?? 0.55,
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
        const radius = Math.max(0.45, Math.hypot(maxB[0] - minB[0], maxB[1] - minB[1], maxB[2] - minB[2]) * 0.5);
        distance = radius * 2.55;
      }
    }

    function frame() {
      resize();
      if (autoSpin && !dragging) yaw += 0.007;
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
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(loc.uTex, 0);

      // Grid
      gl.uniform1f(loc.uUnlit, 1.0);
      gl.uniform1f(loc.uHasTex, 0.0);
      gl.uniform4f(loc.uColor, 0.22, 0.30, 0.44, 0.55);
      gl.uniformMatrix4fv(loc.uModel, false, mat4Identity());
      gl.uniformMatrix4fv(loc.uMvp, false, vp);
      gl.bindBuffer(gl.ARRAY_BUFFER, gridBuf);
      gl.enableVertexAttribArray(loc.aPos);
      gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.disableVertexAttribArray(loc.aNorm);
      gl.vertexAttrib3f(loc.aNorm, 0, 1, 0);
      gl.disableVertexAttribArray(loc.aUv);
      gl.vertexAttrib2f(loc.aUv, 0, 0);
      gl.drawArrays(gl.LINES, 0, gridCount);

      // Meshes
      gl.uniform1f(loc.uUnlit, wireframe ? 1.0 : 0.0);
      for (const dc of drawCalls) {
        gl.uniformMatrix4fv(loc.uModel, false, dc.world);
        gl.uniformMatrix4fv(loc.uMvp, false, mat4Mul(vp, dc.world));
        gl.uniform4fv(loc.uColor, wireframe ? [0.22, 0.85, 0.78, 1.0] : dc.color);
        gl.uniform3fv(loc.uEmissive, dc.emissive);
        gl.uniform1f(loc.uMetallic, dc.metallic);
        gl.uniform1f(loc.uRoughness, dc.roughness);
        gl.uniform1f(loc.uHasTex, !wireframe && dc.tex ? 1.0 : 0.0);
        gl.bindTexture(gl.TEXTURE_2D, dc.tex || whiteTex);

        gl.bindBuffer(gl.ARRAY_BUFFER, dc.posBuf);
        gl.enableVertexAttribArray(loc.aPos);
        gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, dc.normBuf);
        gl.enableVertexAttribArray(loc.aNorm);
        gl.vertexAttribPointer(loc.aNorm, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, dc.uvBuf);
        gl.enableVertexAttribArray(loc.aUv);
        gl.vertexAttribPointer(loc.aUv, 2, gl.FLOAT, false, 0, 0);

        const primMode = wireframe ? gl.LINES : gl.TRIANGLES;
        if (dc.idxBuf) {
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, dc.idxBuf);
          gl.drawElements(primMode, dc.count, dc.idxType, 0);
        } else {
          gl.drawArrays(primMode, 0, dc.count);
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    return {
      loadGlb,
      toggleSpin() { autoSpin = !autoSpin; return autoSpin; },
      toggleWireframe() { wireframe = !wireframe; return wireframe; },
      resetCamera() { yaw = 0.65; pitch = 0.28; },
    };
  }

  function computeUpNormals(pos) {
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
