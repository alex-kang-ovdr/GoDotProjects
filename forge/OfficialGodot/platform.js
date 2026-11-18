"use strict";
const $ = (id) => document.getElementById(id);
let selected = null, events = null, lastBuild = null, selectionSequence = 0;
let connection = "연결 중", presence = { count: 0, sessions: [] }, panelMode = "", publishing = false;
const recentChanges = [];
let syncState = { text: "동기화를 준비하고 있습니다.", conflicted: false };
let showcaseProjectId = null;
function editorMessage(type, detail = {}) {
  $("editor").contentWindow?.postMessage({ source: "playforge-platform", type, ...detail }, location.origin);
}
const status = (text) => {
  $("status").textContent = text;
  editorMessage("service-status", { text });
};
function syncCollaboration() {
  editorMessage("collaboration-status", { text: `${connection} · 버전 ${selected?.revision || "—"}${syncState.conflicted ? " · 충돌 확인" : ""}` });
  if (panelMode === "collaboration" && !$("panel").hidden) renderCollaboration();
}
function renderCollaboration() {
  $("panelTitle").textContent = "협업 현황";
  const body = $("panelBody");
  body.replaceChildren();
  const info = document.createElement("p");
  info.textContent = `${connection} · 저장 버전 ${selected?.revision || "—"}`;
  body.append(info);
  const sync = document.createElement("p");
  sync.textContent = syncState.text;
  body.append(sync);
  const cursorLabel = document.createElement("label");
  cursorLabel.className = "cursor-sharing-setting";
  const cursorCheckbox = document.createElement("input");
  cursorCheckbox.type = "checkbox";
  cursorCheckbox.id = "cursor-sharing";
  cursorCheckbox.checked = PlayForgeCollaboration.getCursorSharing();
  cursorCheckbox.addEventListener("change", () => PlayForgeCollaboration.setCursorSharing(cursorCheckbox.checked));
  cursorLabel.append(cursorCheckbox, document.createTextNode(" 커서 이동 공유"));
  body.append(cursorLabel);
  if (syncState.conflicted) body.append(button("충돌 해결", () => editorMessage("show-conflicts")));
  for (const [index, session] of (presence.sessions || []).entries()) {
    const row = document.createElement("article");
    row.textContent = `${session.sessionId === presence.sessionId ? "나" : "참여자 " + (index + 1)} · 접속 ${new Date(session.connectedAt).toLocaleTimeString()}`;
    body.append(row);
  }
  const heading = document.createElement("h3");
  heading.textContent = "최근 저장";
  body.append(heading);
  if (!recentChanges.length) {
    const empty = document.createElement("p"); empty.textContent = "새 변경 사항을 기다리는 중입니다."; body.append(empty);
  }
  for (const change of recentChanges) {
    const row = document.createElement("p"); row.textContent = change; body.append(row);
  }
  body.append(button("초대 링크 복사", () => navigator.clipboard.writeText(location.href)));
}
async function api(url, body, method = "POST") {
  const r = await fetch(url, body ? { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  const d = await r.json();
  if (!r.ok) {
    const error = Error(d.error || "\uC694\uCCAD \uC2E4\uD328");
    error.status = r.status;
    throw error;
  }
  return d;
}
function button(text, action) {
  const b = document.createElement("button");
  b.textContent = text;
  b.onclick = () => Promise.resolve(action()).catch((e) => status(e.message));
  return b;
}
function card(title, description, action) {
  const b = button("", action);
  b.className = "card";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const small = document.createElement("small");
  small.textContent = description;
  b.append(strong, small);
  return b;
}
async function library() {
  const [t, p] = await Promise.all([api("/api/platform/templates"), api("/api/platform/projects")]);
  $("templates").replaceChildren(...t.templates.map((x) => card(x.name, (x.assetCount ? `에셋 ${x.assetCount}개 포함 · ` : "") + x.description || "\uC0C8 \uD504\uB85C\uC81D\uD2B8\uB85C \uC2DC\uC791", () => create(x.id, x.showcase === true))));
  $("projects").replaceChildren(...p.projects.map((x) => card(x.name, "\uB9AC\uBE44\uC804 " + x.revision, () => openProject(x.id))));
}
async function create(template, showcase = false) {
  const name = prompt("\uD504\uB85C\uC81D\uD2B8 \uC774\uB984", template === "blank3d" ? "\uC0C8\uB85C\uC6B4 \uC138\uACC4" : "\uC608\uC81C \uC138\uACC4");
  if (!name?.trim()) return;
  const guided = template !== "blank3d" && await PlayForgeGuided.choose({ showcase });
  if (guided === null) return;
  const playShowcase = Boolean(guided && showcase);
  const mode = playShowcase ? "showcase" : guided ? "guided" : "ready";
  const d = await api("/api/platform/projects", { name: name.trim(), template, mode });
  await openProject(d.project.id);
  if (guided && !playShowcase && selected?.project.id === d.project.id) PlayForgeGuided.start(d.project.id, template);
}
async function openProject(id) {
  $("panel").hidden = true;
  $("panelBody").replaceChildren();
  const sequence = ++selectionSequence;
  const result = await api("/api/platform/projects/" + id);
  if (sequence !== selectionSequence) return;
  const playShowcase = result.project.mode === "showcase";
  selected = result;
  lastBuild = null;
  $("library").hidden = true;
  $("workspace").hidden = false;
  presence = { count: 0, sessions: [] };
  connection = "연결 중";
  recentChanges.length = 0;
  syncState = { text: "동기화를 준비하고 있습니다.", conflicted: false };
  panelMode = "";
  $("editor").dataset.ready = "";
  showcaseProjectId = playShowcase ? id : null;
  PlayForgeGuided.renderShowcase([]);
  $("editor").src = "editor.html?project=" + encodeURIComponent(id) + (playShowcase ? "&showcase=1" : "");
  history.replaceState(null, "", "?project=" + encodeURIComponent(id) + (playShowcase ? "&showcase=1" : ""));
  events?.close();
  events = new EventSource("/api/platform/projects/" + id + "/events");
  events.onopen = () => {
    connection = "협업 연결됨";
    syncCollaboration();
  };
  events.onerror = () => {
    connection = "다시 연결 중";
    syncCollaboration();
  };
  events.addEventListener("presence", (e) => {
    try {
      presence = JSON.parse(e.data);
      connection = `접속 ${presence.count}명`;
      syncCollaboration();
    } catch {
    }
  });
  events.addEventListener("activity", (e) => {
    try {
      PlayForgeGuided.receive(JSON.parse(e.data));
    } catch {
    }
  });
  events.onmessage = () => refresh();
  ["updated", "revision", "project", "restored", "release", "change"].forEach((type) => events.addEventListener(type, () => refresh()));
  status("\uD3B8\uC9D1\uAE30\uB97C \uC900\uBE44\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4. \uC800\uC7A5\uB41C \uD30C\uC77C\uC740 \uD300\uACFC \uB3D9\uAE30\uD654\uB429\uB2C8\uB2E4.");
}
async function refresh() {
  if (!selected) return;
  try {
    const id = selected.project.id;
    const result = await api("/api/platform/projects/" + id);
    if (selected?.project.id !== id) return;
    if (selected.revision !== result.revision) {
      recentChanges.unshift(`${new Date().toLocaleTimeString()} · 버전 ${result.revision} 저장됨`);
      recentChanges.splice(12);
    }
    selected = result;
    syncCollaboration();
    status("");
  } catch (e) {
    status(e.message);
  }
}
window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.source !== $("editor").contentWindow) return;
  if (event.data?.source !== "playforge-godot-editor") return;
  if (event.data.type === "showcase-cursors") {
    if (showcaseProjectId && showcaseProjectId === event.data.projectId && Array.isArray(event.data.roles)) {
      PlayForgeGuided.renderShowcase(event.data.roles.slice(0, 8));
    }
    return;
  }
  if (event.data.type === "sync-status") {
    syncState = { text: String(event.data.text || "").slice(0, 1000), conflicted: event.data.conflicted === true };
    syncCollaboration();
    return;
  }
  if (event.data.type === "platform-action") {
    const actions = { home: showLibrary, versions: showVersions, publish: publishProject, collaboration: showCollaboration };
    const action = actions[event.data.action];
    if (Object.hasOwn(actions, event.data.action)) Promise.resolve(action()).catch(e => status(e.message));
    return;
  }
  if (event.data.type === "pluginready") { $("editor").dataset.ready = "true"; syncCollaboration(); }
  if (event.data.type === "activity") {
    PlayForgeGuided.activity(event.data);
    return;
  }
  if (event.data.type === "loadingerror") status("\uC5D0\uB514\uD130 \uC624\uB958: " + event.data.message);
  else if (["ready", "pluginready"].includes(event.data.type)) status("");
  else if (event.data.type === "loading") status("Godot \uC5D0\uB514\uD130\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\u2026");
});
async function showLibrary() {
  $("panel").hidden = true;
  $("panelBody").replaceChildren();
  ++selectionSequence;
  PlayForgeGuided.stop();
  showcaseProjectId = null;
  PlayForgeGuided.renderShowcase([]);
  $("library").hidden = false;
  $("workspace").hidden = true;
  $("editor").removeAttribute("src");
  events?.close();
  selected = null;
  history.replaceState(null, "", location.pathname);
  panelMode = "";
  await library();
}
async function build() {
  if (!selected) throw Error("\uD504\uB85C\uC81D\uD2B8\uB97C \uBA3C\uC800 \uC120\uD0DD\uD558\uC138\uC694.");
  await refresh();
  const d = await api("/api/platform-builds/" + selected.project.id, { revision: selected.revision });
  let b = d.build;
  status("\uD14C\uC2A4\uD2B8\uC6A9 Web \uBE4C\uB4DC \uC911\u2026");
  const deadline = Date.now() + 18e4;
  while (["queued", "running"].includes(b.status) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1e3));
    b = (await api("/api/builds/" + b.id)).build;
  }
  if (b.status !== "succeeded") throw Error(b.error || "\uBE4C\uB4DC \uC2DC\uAC04 \uCD08\uACFC");
  lastBuild = b;
  status("\uD14C\uC2A4\uD2B8 \uBE4C\uB4DC \uC644\uB8CC \xB7 \uB9AC\uBE44\uC804 " + b.revision);
  return b;
}
function panel(title) {
  $("panel").hidden = false;
  $("panelTitle").textContent = title;
  $("panelBody").replaceChildren();
  return $("panelBody");
}
function showCollaboration() {
  panelMode = "collaboration";
  $("panel").hidden = false;
  renderCollaboration();
}
$("closePanel").onclick = () => { $("panel").hidden = true; panelMode = ""; };
$("editor").addEventListener("load", syncCollaboration);
async function showVersions() {
  panelMode = "versions";
  if (!selected) return;
  try {
    const id = selected.project.id;
    const [h, r] = await Promise.all([api("/api/platform/projects/" + id + "/history"), api("/api/platform/projects/" + id + "/releases")]);
    const p = panel("\uBC84\uC804\uACFC \uBC30\uD3EC \uAE30\uB85D");
    for (const v of h.history) {
      const a = document.createElement("article");
      a.textContent = "\uB9AC\uBE44\uC804 " + v.revision + " \xB7 " + (v.createdAt || v.timestamp || "");
      a.append(document.createElement("br"), button("\uC774 \uBC84\uC804\uC73C\uB85C \uBCF5\uC6D0", async () => {
        await refresh();
        await api("/api/platform/projects/" + id + "/restore", { revision: v.revision, baseRevision: selected.revision });
        await refresh();
        status("\uC0C8 \uB9AC\uBE44\uC804\uC73C\uB85C \uBCF5\uC6D0\uD588\uC2B5\uB2C8\uB2E4.");
      }));
      p.append(a);
    }
    for (const v of r.releases) {
      const a = document.createElement("article");
      a.textContent = "\uBC30\uD3EC " + v.id + " \xB7 \uB9AC\uBE44\uC804 " + v.revision;
      if (v.previewUrl) {
        const link = document.createElement("a");
        link.href = v.previewUrl;
        link.target = "_blank";
        link.textContent = " \uC5F4\uAE30";
        a.append(link);
      }
      a.append(button("\uC774 \uBC30\uD3EC\uB85C \uB418\uB3CC\uB9AC\uAE30", async () => {
        await refresh();
        await api("/api/platform/projects/" + id + "/releases/" + v.id + "/rollback", { baseRevision: selected.revision });
        await refresh();
        status("\uBC30\uD3EC \uBC84\uC804\uC744 \uBCF5\uC6D0\uD588\uC2B5\uB2C8\uB2E4.");
      }));
      p.append(a);
    }
  } catch (e) {
    status(e.message);
  }
};
async function publishProject() {
  if (!selected || publishing) return;
  panelMode = "publish";
  try {
    publishing = true;
    await refresh();
    if (!lastBuild || lastBuild.revision !== selected.revision) await build();
    if (selected?.project.id !== lastBuild.projectId) throw Error("\uD504\uB85C\uC81D\uD2B8\uAC00 \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uBC30\uD3EC\uD558\uC138\uC694.");
    const label = prompt("\uBC30\uD3EC \uC774\uB984", "\uB9AC\uBE44\uC804 " + lastBuild.revision);
    if (label === null) return;
    await api("/api/platform/projects/" + selected.project.id + "/releases", { revision: lastBuild.revision, buildId: lastBuild.id, label });
    const p = panel("\uBC30\uD3EC \uC644\uB8CC");
    const a = document.createElement("a");
    a.href = "/play/" + selected.project.id;
    a.target = "_blank";
    a.textContent = "\uAC8C\uC2DC\uB41C \uAC8C\uC784 \uC5F4\uAE30 \u2197";
    p.append(a, document.createElement("br"), button("\uBC30\uD3EC \uB9C1\uD06C \uBCF5\uC0AC", () => navigator.clipboard.writeText(location.origin + a.getAttribute("href"))));
    status("\uD604\uC7AC \uC11C\uBC84\uC5D0 \uAC8C\uC2DC\uD588\uC2B5\uB2C8\uB2E4. \uAC19\uC740 \uC8FC\uC18C\uC5D0\uC11C \uD65C\uC131 \uBC84\uC804\uC744 \uC81C\uACF5\uD569\uB2C8\uB2E4.");
  } catch (e) {
    status(e.message);
  } finally {
    publishing = false;
  }
};
(async () => {
  await library();
  const query = new URLSearchParams(location.search);
  const id = query.get("project");
  if (id) await openProject(id);
  else {
    const p = await api("/api/platform/projects");
    if (!p.projects.length) {
      const d = await api("/api/platform/projects", { name: "\uB098\uC758 \uCCAB \uBC88\uC9F8 \uC138\uACC4", template: "blank3d" });
      await openProject(d.project.id);
    } else status("\uD504\uB85C\uC81D\uD2B8 \uB610\uB294 \uC608\uC81C\uB9F5\uC744 \uC120\uD0DD\uD558\uC138\uC694.");
  }
})().catch((e) => status(e.message));
