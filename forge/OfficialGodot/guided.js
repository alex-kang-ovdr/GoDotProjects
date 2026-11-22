(() => {
  "use strict";
  const clientId = "web-" + crypto.randomUUID(), cursors = /* @__PURE__ */ new Map();
  const showcaseCursors = new Map();
  const phases = {
    search: ["탐색", "#a4c6ef", "search"], target: ["대상", "#88d9ed", "target"],
    execute: ["실행", "#ffc979", "click"], change: ["변경", "#dcadff", "change"],
    progress: ["진행 중", "#93c8ff", "import"], success: ["완료", "#9ae6ae", "success"],
    failure: ["실패", "#ffa09b", "error"], hidden: ["대기", "#bec8d6", "wait"],
    drag: ["드래그", "#85dfcc", "drag"], wire: ["연결", "#99c9ff", "wire"],
    undo: ["실행 취소", "#e5bbef", "undo"], redo: ["다시 실행", "#b7cdf8", "redo"]
  };
  const symbols = { search: "🔍", target: "◎", click: "☞", change: "↔", import: "↓", success: "✓",
    error: "!", wait: "…", drag: "✥", wire: "⌁", undo: "↶", redo: "↷" };
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const effectClocks = new WeakMap();
  let animationFrame = 0;
  reducedMotion.addEventListener("change", () => { if (showcaseRoles.length) layoutShowcase(); });
  let run = 0, paused = false, speed = 1, lastActivity = 0, lastGuide = null;
  const cursorStorageKey = "playforge-cursor-sharing";
  let cursorSharing = localStorage.getItem(cursorStorageKey) !== "false";
  let localPointer = { x: 0.5, y: 0.5 };
  const layer = document.createElement("div");
  layer.className = "activity-layer";
  document.body.append(layer);
  const showcaseLayer = document.createElement("div");
  showcaseLayer.className = "showcase-layer";
  layer.append(showcaseLayer);
  const targetOutline = document.createElement("div");
  targetOutline.className = "showcase-target";
  targetOutline.setAttribute("aria-hidden", "true");
  let showcaseRoles = [], observedCanvas = null;
  const showcaseResize = new ResizeObserver(layoutShowcase);
  window.addEventListener("resize", () => { if (showcaseRoles.length) layoutShowcase(); });
  const box = document.createElement("section");
  box.className = "guided";
  box.hidden = true;
  box.innerHTML = '<b>템플릿 제작 과정</b><p>준비된 스크립트는 한 번에 붙여넣고, 씬에서 물체를 선택하며 구성을 살펴봅니다.</p><label>속도 <select id="guideSpeed"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label> <button id="guidePause">일시정지</button> <button id="guideStop">중지</button> <button id="guideRestart" title="현재 프로젝트를 보존하고 새 프로젝트에서 다시 만듭니다." hidden>처음부터 다시</button><p id="guideStep" aria-live="polite"></p>';
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
  function createCursor(parent = layer) {
    const cursor = document.createElement("div");
    cursor.className = "peer-cursor";
    cursor.innerHTML = "<span>➤</span><small></small><em></em>";
    parent.append(cursor);
    return cursor;
  }
  function positionCursor(cursor, frame, x, y) {
    cursor.style.left = frame.left + x * frame.width + "px";
    cursor.style.top = frame.top + y * frame.height + "px";
  }
  function renderShowcase(roles) {
    showcaseRoles = roles;
    layoutShowcase();
  }
  function observedPoint(point) {
    return point && [point.x, point.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1);
  }
  function effectFrame(cursor, role, now) {
    const e = role.effect;
    if (!e || !Object.hasOwn(phases, e.phase)) {
      effectClocks.delete(cursor);
      return null;
    }
    let clock = effectClocks.get(cursor);
    if (!clock || clock.id !== e.eventId || clock.phase !== e.phase) {
      clock = { id: e.eventId, phase: e.phase, start: now };
      effectClocks.set(cursor, clock);
    }
    const [label, color, defaultIcon] = phases[e.phase];
    const icon = typeof e.icon === "string" && e.icon.length ? e.icon : defaultIcon;
    const symbol = Object.hasOwn(symbols, icon) ? symbols[icon] : [...icon].slice(0, 3).join("");
    const speed = Math.min(4, Math.max(0.1, Number.isFinite(e.speed) ? e.speed : 1));
    const duration = Math.min(10000, Math.max(1, Number.isFinite(e.durationMs) ? e.durationMs : 200));
    const elapsed = (now - clock.start) * speed;
    const strength = Math.min(1, Math.max(0, Number.isFinite(e.strength) ? e.strength : 1));
    const reduced = reducedMotion.matches || e.reduceMotion === true || strength <= 0;
    const t = reduced ? 1 : Math.min(1, elapsed / duration);
    const burst = Math.sin(t * Math.PI) * strength;
    const loop = !reduced && e.pulse !== false && ["search", "progress"].includes(e.phase);
    let pulse = loop ? (0.5 - 0.5 * Math.cos(elapsed * Math.PI * 2 / (e.phase === "search" ? 1400 : 850))) * strength
      : (e.pulse === false ? 0 : burst);
    const drag = e.drag ?? e.phase === "drag";
    const wire = e.wire ?? e.phase === "wire";
    const route = e.phase !== "hidden" && (drag || wire) && observedPoint(e.from) && observedPoint(e.to);
    const verified = route && e.completed === true;
    const replay = verified && e.replayPath === true;
    const move = replay ? Math.min(1, t / 0.72) : t;
    const travel = verified && !replay ? 1 : move * move * (3 - 2 * move);
    const landed = verified && travel >= 1;
    const x = route ? e.from.x + (e.to.x - e.from.x) * travel : role.x;
    const y = route ? e.from.y + (e.to.y - e.from.y) * travel : role.y;
    const impact = replay ? Math.sin(Math.max(0, (t - 0.72) / 0.28) * Math.PI) * strength : burst;
    const connected = wire && landed && e.pulse !== false;
    if (wire) pulse = connected ? impact : 0;
    const squash = e.squash !== false && (e.phase === "execute" || (drag && landed)) ? impact : 0;
    const shake = e.phase === "failure" && e.shake !== false ? Math.sin(t * Math.PI * 6) * (1 - t) * strength : 0;
    let detail = label;
    if (e.phase === "change" && Object.hasOwn(e, "before") && Object.hasOwn(e, "after")) detail = String(e.before) + " → " + String(e.after);
    if (e.phase === "progress" && Number.isFinite(e.progress) && e.progress >= 0 && e.progress <= 1) detail += " " + Math.round(e.progress * 100) + "%";
    if (e.phase === "failure" && e.reason) detail += " · " + String(e.reason);
    return { phase: e.phase, symbol, detail, color, x, y, pulse, squash, shake, route, wire, travel, connected,
      animate: !reduced && strength > 0 && (loop || t < 1) };
  }
  function decorateShowcaseCursor(cursor) {
    const readout = document.createElement("div");
    readout.className = "showcase-readout";
    const badge = document.createElement("b");
    badge.className = "showcase-state";
    const header = document.createElement("div");
    header.className = "showcase-role-state";
    header.append(cursor.querySelector("small"), badge);
    readout.append(header, cursor.querySelector("em"));
    cursor.append(readout);
    const route = document.createElement("div");
    route.className = "showcase-route";
    route.hidden = true;
    route.setAttribute("aria-hidden", "true");
    showcaseLayer.prepend(route);
    cursor.showcaseRoute = route;
  }
  function applyEffect(cursor, fx, role, bounds) {
    const badge = cursor.querySelector(".showcase-state");
    const route = cursor.showcaseRoute;
    badge.hidden = !fx;
    route.hidden = !fx?.route;
    cursor.dataset.phase = fx?.phase || (role.effect?.phase === "idle" ? "idle" : "");
    if (!fx) {
      cursor.querySelector("span").style.transform = "";
      return;
    }
    const text = fx.symbol + " " + fx.detail;
    if (badge.textContent !== text) badge.textContent = text;
    badge.title = fx.detail;
    badge.dataset.icon = role.effect.icon || phases[fx.phase][2];
    badge.style.setProperty("--state-color", fx.color);
    const pop = 1 + fx.pulse * 0.1;
    badge.style.transform = "translateX(" + (fx.shake * 4) + "px) scale(" + pop + ")";
    cursor.querySelector("span").style.transform = "scale(" + (1 + fx.squash * 0.18) + "," + (1 - fx.squash * 0.2) + ")";
    if (fx.route) {
      const { from, to } = role.effect;
      const dx = (to.x - from.x) * bounds.width, dy = (to.y - from.y) * bounds.height;
      positionCursor(route, bounds, from.x, from.y);
      route.style.width = Math.hypot(dx, dy) + "px";
      route.style.transform = "rotate(" + Math.atan2(dy, dx) + "rad)";
      route.style.setProperty("--traveled", (fx.travel * 100) + "%");
      route.style.setProperty("--state-color", fx.color);
      route.classList.toggle("wire", fx.wire);
      route.classList.toggle("connected", fx.connected);
    }
  }
  function layoutShowcase() {
    const visible = new Set();
    const editor = get("editor");
    const canvas = showcaseRoles.length ? editor.contentDocument?.getElementById("editor-canvas") : null;
    if (observedCanvas !== canvas) {
      showcaseResize.disconnect();
      observedCanvas = canvas;
      if (canvas) {
        showcaseResize.observe(editor);
        showcaseResize.observe(canvas);
      }
    }
    const frame = editor.getBoundingClientRect();
    const rect = canvas?.getBoundingClientRect();
    const scaleX = frame.width / editor.offsetWidth, scaleY = frame.height / editor.offsetHeight;
    const bounds = rect?.width && rect.height && frame.width && frame.height ? {
      left: frame.left + (editor.clientLeft + rect.left) * scaleX,
      top: frame.top + (editor.clientTop + rect.top) * scaleY,
      width: rect.width * scaleX, height: rect.height * scaleY
    } : null;
    if (bounds) {
      const right = Math.min(frame.right, bounds.left + bounds.width);
      const bottom = Math.min(frame.bottom, bounds.top + bounds.height);
      showcaseLayer.style.clipPath = `inset(${Math.max(frame.top, bounds.top)}px calc(100% - ${right}px) calc(100% - ${bottom}px) ${Math.max(frame.left, bounds.left)}px)`;
    }
    let hasTarget = false;
    let animating = false;
    const now = performance.now();
    for (const role of bounds ? showcaseRoles : []) {
      if (!role || typeof role.id !== "string" || !/^[a-z0-9_-]{1,40}$/i.test(role.id) ||
          typeof role.label !== "string" || typeof role.caption !== "string" ||
          !Number.isFinite(role.x) || role.x < 0 || role.x > 1 ||
          !Number.isFinite(role.y) || role.y < 0 || role.y > 1) continue;
      let cursor = showcaseCursors.get(role.id);
      if (!cursor) {
        cursor = createCursor(showcaseLayer);
        cursor.classList.add("showcase-cursor");
        decorateShowcaseCursor(cursor);
        cursor.dataset.showcaseRole = role.id;
        if (/^#[\da-f]{6}$/i.test(role.color)) cursor.style.setProperty("--role-color", role.color);
        cursor.querySelector("small").textContent = role.label.slice(0, 40);
        showcaseCursors.set(role.id, cursor);
      }
      visible.add(role.id);
      const main = role.main === true;
      cursor.dataset.main = String(main);
      const fx = effectFrame(cursor, role, now);
      animating ||= Boolean(fx?.animate);
      const xTip = fx?.x ?? role.x, yTip = fx?.y ?? role.y;
      positionCursor(cursor, bounds, xTip, yTip);
      cursor.classList.toggle("caption-left", xTip > 0.68);
      cursor.classList.toggle("caption-above", yTip > 0.85);
      applyEffect(cursor, fx, role, bounds);
      const caption = cursor.querySelector("em");
      const idle = role.effect?.phase === "idle";
      const text = idle ? "" : role.caption;
      if (caption.textContent !== text) caption.textContent = text;
      const target = role.target;
      if (hasTarget || !main || idle || fx?.phase === "hidden" || !target ||
          typeof target.kind !== "string" || typeof target.label !== "string" ||
          ![target.x, target.y, target.w, target.h].every(Number.isFinite)) continue;
      const x = Math.max(0, target.x), y = Math.max(0, target.y);
      const w = Math.min(1, target.x + target.w) - x, h = Math.min(1, target.y + target.h) - y;
      if (w <= 0 || h <= 0) continue;
      hasTarget = true;
      targetOutline.dataset.showcaseTargetRole = role.id;
      targetOutline.dataset.targetKind = target.kind;
      targetOutline.dataset.targetLabel = target.label;
      targetOutline.style.setProperty("--target-width", (2 + (fx?.pulse || 0) * 2) + "px");
      targetOutline.style.setProperty("--role-color", cursor.style.getPropertyValue("--role-color"));
      positionCursor(targetOutline, bounds, x, y);
      targetOutline.style.width = w * bounds.width + "px";
      targetOutline.style.height = h * bounds.height + "px";
      if (!targetOutline.isConnected) showcaseLayer.prepend(targetOutline);
    }
    if (!hasTarget) targetOutline.remove();
    for (const [id, cursor] of showcaseCursors) {
      if (visible.has(id)) continue;
      cursor.showcaseRoute.remove();
      cursor.remove();
      showcaseCursors.delete(id);
    }
    if (animating && !animationFrame) {
      animationFrame = requestAnimationFrame(() => { animationFrame = 0; layoutShowcase(); });
    } else if (!animating && animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
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

  // Mount PlayForge-internal "AI 스튜디오" menu (moved from PlayHub nav) + fix mobile sidebar pill bar
  function mountForgeStudioNavAndMobileFix() {
    if (!document.getElementById("forge-mobile-sidebar-fix")) {
      const style = document.createElement("style");
      style.id = "forge-mobile-sidebar-fix";
      style.textContent = `
        @media (max-width: 900px) {
          .forge-sidebar {
            flex-direction: row !important;
            align-items: center !important;
            flex-wrap: nowrap !important;
            overflow-x: auto !important;
            scrollbar-width: none;
            gap: 8px !important;
            padding: 10px 14px !important;
            min-height: 0 !important;
          }
          .forge-sidebar::-webkit-scrollbar { display: none; }
          .forge-sidebar-group {
            flex-direction: row !important;
            align-items: center !important;
            gap: 6px !important;
            flex: 0 0 auto;
          }
          .forge-sidebar .forge-dev-demo-card { display: none !important; }
          .forge-sidebar .forge-nav-item {
            flex: 0 0 auto;
            white-space: nowrap;
            padding: 7px 12px !important;
            border-radius: 999px !important;
            font-size: 13px !important;
            background: #F3F3FE;
          }
          .forge-sidebar .forge-nav-item.active {
            background: #DBE1FF;
            color: #003594;
          }
        }
      `;
      document.head.append(style);
    }

    const sidebar = document.querySelector(".forge-sidebar");
    if (sidebar && !document.getElementById("forge-nav-ai-studio")) {
      const groups = sidebar.querySelectorAll(".forge-sidebar-group");
      const targetGroup = groups[1] || groups[0] || sidebar;
      const aiStudioLink = document.createElement("a");
      aiStudioLink.id = "forge-nav-ai-studio";
      aiStudioLink.className = "forge-nav-item";
      aiStudioLink.href = "/?view=agent";
      aiStudioLink.dataset.testid = "forge-nav-ai-studio";
      aiStudioLink.textContent = "✨ AI 스튜디오";
      const label = targetGroup.querySelector(".forge-sidebar-label");
      if (label && label.nextSibling) targetGroup.insertBefore(aiStudioLink, label.nextSibling);
      else targetGroup.prepend(aiStudioLink);
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountForgeStudioNavAndMobileFix, { once: true });
  } else {
    mountForgeStudioNavAndMobileFix();
  }
})();
