(() => {
  "use strict";
  const clientId = "web-" + crypto.randomUUID(), cursors = /* @__PURE__ */ new Map();
  const showcaseCursors = new Map();
  let run = 0, paused = false, speed = 1, lastActivity = 0, lastGuide = null;
  const cursorStorageKey = "playforge-cursor-sharing";
  let cursorSharing = localStorage.getItem(cursorStorageKey) !== "false";
  let localPointer = { x: 0.5, y: 0.5 };
  const layer = document.createElement("div");
  layer.className = "activity-layer";
  document.body.append(layer);
  const box = document.createElement("section");
  box.className = "guided";
  box.hidden = true;
  box.innerHTML = '<b>템플릿 제작 과정</b><p>준비된 스크립트는 한 번에 붙여넣고, 씬에서 물체를 선택하며 구성을 살펴봅니다.</p><label>속도 <select id="guideSpeed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label> <button id="guidePause">일시정지</button> <button id="guideStop">중지</button> <button id="guideRestart" title="현재 프로젝트를 보존하고 새 프로젝트에서 다시 만듭니다." hidden>처음부터 다시</button><p id="guideStep" aria-live="polite"></p>';
  document.body.append(box);
  const get = (id) => document.getElementById(id);
  get("guideSpeed").onchange = (e) => speed = Number(e.target.value);
  get("guidePause").onclick = () => {
    paused = !paused;
    get("guidePause").textContent = paused ? "\uACC4\uC18D" : "\uC77C\uC2DC\uC815\uC9C0";
  };
  get("guideStop").onclick = () => stop();
  get("guideRestart").onclick = () => {
    if (!lastGuide || !selected) return;
    const previous = selected;
    const nextRun = ++run;
    paused = false;
    get("guideStep").textContent = "현재 프로젝트를 보존하고 새 프로젝트를 준비합니다…";
    get("guideRestart").hidden = true;
    api("/api/platform/projects", {
      name: `${previous.project.name} (다시 시작)`.slice(0, 80),
      template: lastGuide.template,
      mode: "guided"
    }).then(async result => {
      if (nextRun !== run) return;
      await openProject(result.project.id);
      start(result.project.id, lastGuide.template);
    }).catch(error => {
      if (nextRun !== run) return;
      get("guideStep").textContent = error.message;
      get("guideRestart").hidden = false;
    });
  };
  function stop() {
    run++;
    box.hidden = true;
    paused = false;
    for (const c of cursors.values()) c.remove();
    cursors.clear();
  }
  async function wait(ms, token) {
    let left = ms;
    while (left > 0) {
      if (token !== run) throw Error("\uC2DC\uC5F0\uC744 \uC911\uC9C0\uD588\uC2B5\uB2C8\uB2E4. \uC644\uB8CC\uB41C \uB2E8\uACC4\uB294 \uD504\uB85C\uC81D\uD2B8\uC5D0 \uB0A8\uC2B5\uB2C8\uB2E4.");
      await new Promise((r) => setTimeout(r, 40));
      if (!paused) left -= 40 * speed;
    }
  }
  function ensureActive(token) {
    if (token !== run) throw Error("시연을 중지했습니다. 완료된 단계는 프로젝트에 남습니다.");
  }
  async function saveWithRebase(id, snapshot, updates, token) {
    let base = snapshot;
    for (let attempt = 0; attempt < 3; attempt++) {
      ensureActive(token);
      const merged = new Map(base.files.map(file => [file.path, file]));
      for (const update of updates) merged.set(update.path, update);
      try {
        return await api("/api/platform/projects/" + id, {
          baseRevision: base.revision, files: [...merged.values()], clientId: clientId + "-guide"
        }, "PUT");
      } catch (error) {
        if (error.status !== 409 || attempt === 2) throw error;
        const latest = await api("/api/platform/projects/" + id);
        const expected = new Map(base.files.map(file => [file.path, file.content]));
        const actual = new Map(latest.files.map(file => [file.path, file.content]));
        const conflicting = updates.find(file => actual.get(file.path) !== expected.get(file.path));
        if (conflicting) throw Error(`다른 참여자가 ${conflicting.path} 파일을 수정했습니다. 해당 변경을 보존하기 위해 시연을 멈췄습니다.`);
        base = latest;
      }
    }
    throw Error("협업 중 변경된 프로젝트 버전을 확인하지 못했습니다. 다시 시도해 주세요.");
  }
  function createCursor() {
    const cursor = document.createElement("div");
    cursor.className = "peer-cursor";
    cursor.innerHTML = "<span>➤</span><small></small><em></em>";
    layer.append(cursor);
    return cursor;
  }
  function positionCursor(cursor, frame, x, y) {
    cursor.style.left = frame.left + x * frame.width + "px";
    cursor.style.top = frame.top + y * frame.height + "px";
  }
  function renderShowcase(roles) {
    const visible = new Set();
    const editor = get("editor");
    const frame = editor.getBoundingClientRect();
    const canvas = editor.contentDocument?.getElementById("editor-canvas")?.getBoundingClientRect();
    const bounds = canvas && {
      left: frame.left + canvas.left, top: frame.top + canvas.top, width: canvas.width, height: canvas.height
    };
    for (const role of bounds ? roles : []) {
      if (!role || typeof role.id !== "string" || !/^[a-z0-9_-]{1,40}$/i.test(role.id) ||
          typeof role.label !== "string" || typeof role.caption !== "string" ||
          !Number.isFinite(role.x) || role.x < 0 || role.x > 1 ||
          !Number.isFinite(role.y) || role.y < 0 || role.y > 1) continue;
      let cursor = showcaseCursors.get(role.id);
      if (!cursor) {
        cursor = createCursor();
        cursor.classList.add("showcase-cursor");
        cursor.dataset.showcaseRole = role.id;
        if (/^#[\da-f]{6}$/i.test(role.color)) cursor.style.setProperty("--role-color", role.color);
        cursor.querySelector("small").textContent = role.label.slice(0, 40);
        showcaseCursors.set(role.id, cursor);
      }
      visible.add(role.id);
      positionCursor(cursor, bounds, role.x, role.y);
      cursor.classList.toggle("caption-left", role.x > 0.68);
      const caption = cursor.querySelector("em");
      const text = role.caption.slice(0, 120);
      if (caption.textContent !== text) caption.textContent = text;
    }
    for (const [id, cursor] of showcaseCursors) {
      if (visible.has(id)) continue;
      cursor.remove();
      showcaseCursors.delete(id);
    }
  }
  function receive(e) {
    if (!e || !e.clientId || e.clientId === clientId) return;
    let cursor = cursors.get(e.clientId);
    if (!cursor) {
      cursor = createCursor();
      cursors.set(e.clientId, cursor);
    }
    const frame = document.getElementById("editor").getBoundingClientRect();
    if (Number.isFinite(e.x)) {
      positionCursor(cursor, frame, e.x, e.y);
    }
    cursor.querySelector("small").textContent = e.label || "\uACF5\uB3D9 \uC791\uC5C5\uC790";
    // Typing and meaningful button clicks get short captions; guide narration stays in its progress panel.
    const now = performance.now();
    if (e.kind === "typing" || (e.kind === "step" && e.clickLabel)) {
      cursor.caption = e.kind === "typing" ? "⌨ " + (e.text || "") : "클릭: " + String(e.clickLabel).slice(0, 60);
      cursor.captionKind = e.kind;
      cursor.captionUntil = now + 1500;
    }
    const showCaption = now < (cursor.captionUntil || 0);
    cursor.querySelector("em").textContent = showCaption ? cursor.caption : "";
    cursor.classList.toggle("click", showCaption && cursor.captionKind === "step");
    cursor.hidden = false;
    clearTimeout(cursor.timer);
    cursor.timer = setTimeout(() => cursor.hidden = true, 3500);
  }
  async function activity(e, automated = false) {
    if (!selected) return;
    if (!automated && Number.isFinite(e.x) && Number.isFinite(e.y)) localPointer = { x: e.x, y: e.y };
    const now = performance.now();
    if (e.kind === "cursor" && (!cursorSharing || now - lastActivity < 100)) return;
    lastActivity = now;
    const payload = { clientId: automated ? clientId + "-guide" : clientId, label: automated ? "\uD15C\uD50C\uB9BF \uAC00\uC774\uB4DC" : "\uACF5\uB3D9 \uC791\uC5C5\uC790", kind: e.kind, x: e.x ?? localPointer.x, y: e.y ?? localPointer.y, text: (e.text || "").slice(0, 120) };
    if (e.kind === "step" && typeof e.clickLabel === "string") payload.clickLabel = e.clickLabel.slice(0, 60);
    if (automated) receive(payload);
    try {
      await api("/api/platform/projects/" + selected.project.id + "/activity", payload);
    } catch {
    }
  }
  async function choose({ showcase = false } = {}) {
    return new Promise((resolve) => {
      const d = document.createElement("dialog");
      d.className = "start-dialog";
      const title = document.createElement("h2");
      title.textContent = "\uC5B4\uB5BB\uAC8C \uC2DC\uC791\uD560\uAE4C\uC694?";
      const a = button("\uC644\uC131\uB41C \uD15C\uD50C\uB9BF \uC5F4\uAE30", () => done(false)), b = button("\uB9CC\uB4DC\uB294 \uACFC\uC815 \uBCF4\uAE30", () => done(true));
      const p = document.createElement("p");
      p.textContent = showcase
        ? "빈 시연 씬에서 역할별 커서를 따라 노드가 추가되고 위치와 속성이 바뀌는 과정을 봅니다."
        : "준비된 에셋으로 씬을 구성하는 과정을 마우스 이동과 선택 중심으로 보여줍니다. 스크립트는 한 번에 붙여넣습니다. 속도 조절과 일시정지가 가능합니다.";
      d.append(title, p, a, b);
      function done(value) {
        d.close();
        d.remove();
        resolve(value);
      }
      d.addEventListener("cancel", (e) => {
        e.preventDefault();
        done(null);
      });
      document.body.append(d);
      d.showModal();
    });
  }
  let pointer = { x: 0.5, y: 0.5 };
  async function moveTo(x, y, token) {
    const from = { ...pointer };
    for (let i = 1; i <= 8; i++) {
      await wait(65, token);
      pointer = { x: from.x + (x - from.x) * i / 8, y: from.y + (y - from.y) * i / 8 };
      await activity({ kind: "cursor", ...pointer }, true);
    }
  }
  function describeNode(name, section) {
    if (/Bird/i.test(name)) return "새를 배치하고 화면에서 위치를 확인합니다.";
    if (/Wheel/i.test(name)) return "수레에 바퀴를 배치합니다.";
    if (/Floor|Ground/i.test(name)) return "게임의 바닥을 배치합니다.";
    if (/Sky|Cloud/i.test(name)) return "배경을 구성합니다.";
    if (/Camera/i.test(name)) return "게임을 보여줄 카메라를 배치합니다.";
    if (/Light|Sun/i.test(name)) return "장면을 밝힐 조명을 배치합니다.";
    if (/Score/i.test(name)) return "점수를 보여줄 표시를 배치합니다.";
    if (/Hud|Hint|Status/i.test(name)) return "플레이 안내를 보여줄 화면을 구성합니다.";
    if (/Pipe|Hurdle/i.test(name)) return "피하거나 넘어갈 장애물을 준비합니다.";
    if (/Target/i.test(name)) return "맞혀야 할 목표물을 배치합니다.";
    if (/Chassis|Cart|Turret/i.test(name)) return "수레의 몸체와 부품을 조립합니다.";
    if (!/parent=/.test(section)) return "씬의 기본 구성을 시작합니다.";
    return "씬에 새 항목을 추가하고 모양을 확인합니다.";
  }
  async function revealNode(revision, nodePath, dimension, token) {
    const requestId = crypto.randomUUID();
    const frame = get("editor");
    let response;
    const listener = event => {
      if (event.origin === location.origin && event.source === frame.contentWindow &&
          event.data?.source === "playforge-godot-editor" && event.data.type === "guide-result" && event.data.requestId === requestId) response = event.data;
    };
    window.addEventListener("message", listener);
    try {
      frame.contentWindow.postMessage({ source: "playforge-platform-guide", type: "reveal", requestId, revision, nodePath, dimension }, location.origin);
      const deadline = Date.now() + 30000;
      while (!response) {
        if (Date.now() > deadline) throw Error("에디터에서 선택 결과를 확인하지 못했습니다. 연결을 확인한 뒤 다시 시작해 주세요.");
        await wait(80, token);
      }
      if (!response.ok) throw Error(response.error || "씬의 항목을 선택하지 못했습니다.");
      return response;
    } finally { window.removeEventListener("message", listener); }
  }
  async function start(id, template) {
    lastGuide = { id, template };
    const token = ++run;
    paused = false;
    box.hidden = false;
    get("guidePause").textContent = "\uC77C\uC2DC\uC815\uC9C0";
    get("guideRestart").hidden = true;
    try {
      get("guideStep").textContent = "\uC5D0\uB514\uD130\uB97C \uC900\uBE44\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4\u2026";
      const deadline = Date.now() + 18e4;
      while (get("editor").dataset.ready !== "true") {
        if (Date.now() > deadline) throw Error("\uC5D0\uB514\uD130 \uC5F0\uACB0 \uC2DC\uAC04\uC744 \uCD08\uACFC\uD588\uC2B5\uB2C8\uB2E4. \uC900\uBE44 \uC0C1\uD0DC\uB97C \uD655\uC778\uD558\uACE0 \uB2E4\uC2DC \uC2DC\uC791\uD558\uC138\uC694.");
        await wait(200, token);
      }
      const t = await api("/api/platform/templates/" + template);
      let current = await api("/api/platform/projects/" + id);
      const scene = t.files.find((f) => f.path === "scenes/main.tscn");
      const sections = scene.content.split(/(?=\[node )/);
      const prefix = sections.shift();
      const assets = new Set(t.template.assetPaths || []);
      for (const asset of assets) {
        if (!current.files.some(file => file.path === asset && file.content === t.files.find(source => source.path === asset)?.content)) throw Error('미리 포함된 에셋을 확인할 수 없습니다: ' + asset);
      }
      const assemblyFiles = t.files.filter(file => file.path !== scene.path && !assets.has(file.path));
      get("guideStep").textContent = "게임 동작에 필요한 스크립트와 설정을 한 번에 붙여넣습니다.";
      await moveTo(0.12, 0.72, token);
      await activity({ kind: "step", x: 0.12, y: 0.72, text: "준비된 스크립트를 한 번에 적용합니다." }, true);
      await wait(600, token);
      ensureActive(token);
      current = await saveWithRebase(id, current, assemblyFiles, token);
      await wait(900, token);
      let text = prefix;
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        text += section;
        const name = section.match(/name="([^"]+)"/)?.[1] || "Node";
        const parent = section.match(/parent="([^"]+)"/)?.[1];
        const nodePath = parent === undefined ? "." : parent === "." ? name : parent + "/" + name;
        const description = describeNode(name, section);
        get("guideStep").textContent = `${i + 1} / ${sections.length} · ${description}`;
        await moveTo(0.12, 0.18 + Math.min(i, 9) * 0.025, token);
        await wait(250, token);
        const file = { path: scene.path, content: text };
        ensureActive(token);
        current = await saveWithRebase(id, current, [file], token);
        const result = await revealNode(current.revision, nodePath, t.template.dimension || "3d", token);
        await wait(40, token);
        if (result.target && Number.isFinite(result.target.x) && Number.isFinite(result.target.y)) {
          await moveTo(result.target.x, result.target.y, token);
        }
        await activity({ kind: "step", ...pointer, text: description }, true);
        await wait(650, token);
        get("guideStep").textContent = `${i + 1} / ${sections.length} · 선택한 항목의 위치와 모양을 속성 패널에서 확인합니다.`;
        await moveTo(0.87, 0.3, token);
        await wait(900, token);
      }
      get("guideStep").textContent = "완료 · 씬 구성이 저장되었습니다. 테스트 버튼으로 게임을 실행해 보세요.";
      get("guideRestart").hidden = false;
      await moveTo(0.72, 0.06, token);
      await activity({ kind: "step", ...pointer, text: "씬 구성을 마쳤습니다." }, true);
      await refresh();
    } catch (e) {
      if (token !== run) return;
      get("guideStep").textContent = e.message;
      get("guideRestart").hidden = false;
      status(e.message);
    }
  }
  window.PlayForgeGuided = { choose, start, stop, receive, activity, renderShowcase };
  window.PlayForgeCollaboration = {
    setCursorSharing(enabled) {
      cursorSharing = Boolean(enabled);
      localStorage.setItem(cursorStorageKey, String(cursorSharing));
      const toggle = document.getElementById("cursor-sharing");
      if (toggle) toggle.checked = cursorSharing;
      return cursorSharing;
    },
    getCursorSharing() { return cursorSharing; }
  };
})();
