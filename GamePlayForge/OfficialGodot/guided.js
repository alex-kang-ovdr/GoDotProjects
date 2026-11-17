(() => {
  "use strict";
  const clientId = "web-" + crypto.randomUUID(), cursors = /* @__PURE__ */ new Map();
  let run = 0, paused = false, speed = 1, lastActivity = 0;
  const layer = document.createElement("div");
  layer.className = "activity-layer";
  document.body.append(layer);
  const box = document.createElement("section");
  box.className = "guided";
  box.hidden = true;
  box.innerHTML = '<b>\uD15C\uD50C\uB9BF \uC81C\uC791 \uACFC\uC815 \xB7 MCP \uC2A4\uD0C0\uC77C \uC2DC\uC5F0</b><p>\uC2E4\uC81C \uD504\uB85C\uC81D\uD2B8 \uD30C\uC77C\uC744 \uB2E8\uACC4\uBCC4\uB85C \uC800\uC7A5\uD569\uB2C8\uB2E4. \uCEE4\uC11C\uB294 \uC791\uC5C5\uC744 \uC124\uBA85\uD558\uB294 \uC2DC\uC5F0\uC785\uB2C8\uB2E4.</p><label>\uC18D\uB3C4 <select id="guideSpeed"><option value="0.5">0.5\xD7</option><option value="1" selected>1\xD7</option><option value="2">2\xD7</option><option value="4">4\xD7</option></select></label> <button id="guidePause">\uC77C\uC2DC\uC815\uC9C0</button> <button id="guideStop">\uC911\uC9C0</button><p id="guideStep"></p><pre id="guideCode"></pre>';
  document.body.append(box);
  const get = (id) => document.getElementById(id);
  get("guideSpeed").onchange = (e) => speed = Number(e.target.value);
  get("guidePause").onclick = () => {
    paused = !paused;
    get("guidePause").textContent = paused ? "\uACC4\uC18D" : "\uC77C\uC2DC\uC815\uC9C0";
  };
  get("guideStop").onclick = () => stop();
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
  function receive(e) {
    if (!e || !e.clientId || e.clientId === clientId) return;
    let cursor = cursors.get(e.clientId);
    if (!cursor) {
      cursor = document.createElement("div");
      cursor.className = "peer-cursor";
      cursor.innerHTML = "<span>\u27A4</span><small></small><em></em>";
      layer.append(cursor);
      cursors.set(e.clientId, cursor);
    }
    const frame = document.getElementById("editor").getBoundingClientRect();
    if (Number.isFinite(e.x)) {
      cursor.style.left = frame.left + e.x * frame.width + "px";
      cursor.style.top = frame.top + e.y * frame.height + "px";
    }
    cursor.querySelector("small").textContent = e.label || "\uACF5\uB3D9 \uC791\uC5C5\uC790";
    cursor.querySelector("em").textContent = e.kind === "typing" ? "\u2328 " + (e.text || "") : e.kind === "step" ? e.text || "" : "";
    cursor.classList.toggle("click", e.kind === "step");
    cursor.hidden = false;
    clearTimeout(cursor.timer);
    cursor.timer = setTimeout(() => cursor.hidden = true, 3500);
  }
  async function activity(e, automated = false) {
    if (!selected) return;
    const now = performance.now();
    if (e.kind === "cursor" && now - lastActivity < 100) return;
    lastActivity = now;
    const payload = { clientId: automated ? clientId + "-guide" : clientId, label: automated ? "\uD15C\uD50C\uB9BF \uAC00\uC774\uB4DC" : "\uACF5\uB3D9 \uC791\uC5C5\uC790", kind: e.kind, x: e.x ?? 0.5, y: e.y ?? 0.5, text: (e.text || "").slice(0, 120) };
    if (automated) receive(payload);
    try {
      await api("/api/platform/projects/" + selected.project.id + "/activity", payload);
    } catch {
    }
  }
  async function choose() {
    return new Promise((resolve) => {
      const d = document.createElement("dialog");
      d.className = "start-dialog";
      const title = document.createElement("h2");
      title.textContent = "\uC5B4\uB5BB\uAC8C \uC2DC\uC791\uD560\uAE4C\uC694?";
      const a = button("\uC644\uC131\uB41C \uD15C\uD50C\uB9BF \uC5F4\uAE30", () => done(false)), b = button("\uB9CC\uB4DC\uB294 \uACFC\uC815 \uBCF4\uAE30", () => done(true));
      const p = document.createElement("p");
      p.textContent = "\uCEE4\uC11C \uC774\uB3D9\uACFC \uD0C0\uC774\uD551\uC744 \uBCF4\uBA74\uC11C \uB9F5\uC774 \uB9CC\uB4E4\uC5B4\uC9C0\uB294 \uACFC\uC815\uC744 \uB530\uB77C\uAC11\uB2C8\uB2E4. \uC18D\uB3C4 \uC870\uC808\uACFC \uC77C\uC2DC\uC815\uC9C0\uAC00 \uAC00\uB2A5\uD569\uB2C8\uB2E4.";
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
  async function start(id, template) {
    const token = ++run;
    paused = false;
    box.hidden = false;
    get("guidePause").textContent = "\uC77C\uC2DC\uC815\uC9C0";
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
      const order = t.template.guideOrder || [];
      const assemblyFiles = t.files.filter(file => file.path !== 'scenes/main.tscn' && !assets.has(file.path));
      assemblyFiles.sort((a,b) => {
        const rank = file => file.path === 'project.godot' ? -1 : order.includes(file.path) ? order.indexOf(file.path) : order.length;
        return rank(a)-rank(b);
      });
      const steps = [];
      for (const f of assemblyFiles) steps.push({ title: f.path === "project.godot" ? "\uD504\uB85C\uC81D\uD2B8 \uC124\uC815" : "\uC2A4\uD06C\uB9BD\uD2B8 \uC791\uC131", file: f });
      let text = prefix;
      for (let i = 0; i < sections.length; i++) {
        text += sections[i];
        steps.push({ title: "\uC52C \uAD6C\uC131 \xB7 " + (sections[i].match(/name="([^"]+)"/)?.[1] || "Node"), file: { path: scene.path, content: text } });
      }
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        get("guideStep").textContent = i + 1 + " / " + steps.length + " \xB7 " + step.title;
        await activity({ kind: "step", x: 0.15, y: 0.2 + i % 5 * 0.09, text: step.title }, true);
        await wait(500, token);
        get("guideCode").textContent = "";
        const content = step.file.content;
        for (let j = 0; j < content.length; j += 8) {
          get("guideCode").textContent = content.slice(0, j + 8);
          get("guideCode").scrollTop = get("guideCode").scrollHeight;
          if (j % 64 === 0) await activity({ kind: "typing", x: 0.45, y: 0.4, text: content.slice(j, j + 12) }, true);
          await wait(35, token);
        }
        await wait(100, token);
        current = await api("/api/platform/projects/" + id, { baseRevision: current.revision, files: [...current.files.filter((f) => f.path !== step.file.path), step.file], clientId: clientId + "-guide" }, "PUT");
        await wait(900, token);
      }
      get("guideStep").textContent = "\uC644\uB8CC \xB7 \uC2E4\uC81C \uD504\uB85C\uC81D\uD2B8\uAC00 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uD14C\uC2A4\uD2B8\uB85C \uC2E4\uD589\uD574 \uBCF4\uC138\uC694.";
      await activity({ kind: "step", x: 0.8, y: 0.05, text: "\uC81C\uC791 \uC644\uB8CC" }, true);
      await refresh();
    } catch (e) {
      get("guideStep").textContent = e.message;
      status(e.message);
    }
  }
  window.PlayForgeGuided = { choose, start, stop, receive, activity };
})();
