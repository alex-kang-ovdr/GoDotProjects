"use strict";
const $ = (id) => document.getElementById(id);
const forgeBase = (location.pathname.match(/^(.*?)\/(?:OfficialGodot|Studio|StudioGodot|Frontends)(?:\/|$)/)?.[1]) || "";
const forgePath = (route) => typeof route === "string" && route.startsWith("/") && forgeBase && !route.startsWith(forgeBase + "/") ? forgeBase + route : route;
window.__playforgeBasePath = forgeBase;
let csrfToken = null;
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
  body.append(button("초대 링크 복사", () => copyText(location.href)));
}
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      status("링크를 클립보드에 복사했습니다.");
      return;
    }
  } catch {}
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    if (ok) { status("링크를 클립보드에 복사했습니다."); return; }
  } catch {}
  status("복사할 주소: " + text);
}
function isNativePrompt() {
  try { return typeof window.prompt === "function" && Function.prototype.toString.call(window.prompt).includes("[native code]"); }
  catch { return false; }
}
function askProjectName(title, defaultValue, hint = "") {
  if (!isNativePrompt()) return Promise.resolve(window.prompt(title, defaultValue));
  const dialog = $("createProjectModal");
  if (!dialog?.showModal) return Promise.resolve(window.prompt(title, defaultValue));
  return new Promise((resolve) => {
    const titleEl = $("createModalTitle");
    const hintEl = $("createModalHint");
    const inputEl = $("createModalInput");
    const cancelBtn = $("createModalCancel");
    const formEl = $("createModalForm");
    if (titleEl) titleEl.textContent = title;
    if (hintEl) { hintEl.textContent = hint; hintEl.hidden = !hint; }
    inputEl.value = defaultValue || "";
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      dialog.removeEventListener("close", onClose);
      cancelBtn.removeEventListener("click", onCancel);
      formEl.removeEventListener("submit", onSubmit);
      if (dialog.open) dialog.close();
      resolve(value);
    };
    const onSubmit = (e) => { e.preventDefault(); finish(inputEl.value); };
    const onCancel = () => finish(null);
    const onClose = () => finish(null);
    formEl.addEventListener("submit", onSubmit);
    cancelBtn.addEventListener("click", onCancel);
    dialog.addEventListener("close", onClose);
    dialog.showModal();
    inputEl.focus();
    inputEl.select();
  });
}
async function ensureSession() {
  const response = await fetch(forgePath("/api/session"), { credentials: "same-origin", cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = Error(data.error || "PlayHub Google 로그인이 필요합니다.");
    error.status = response.status;
    error.loginUrl = data.loginUrl || "/?view=account";
    throw error;
  }
  csrfToken = typeof data.csrfToken === "string" ? data.csrfToken : null;
  window.__playforgeCsrfToken = csrfToken;
  return data;
}
async function api(url, body, method = "POST") {
  const headers = {};
  const hasBody = body !== undefined && body !== null;
  const effectiveMethod = hasBody ? method : (method && method !== "POST" ? method : "GET");
  if (hasBody) headers["Content-Type"] = "application/json";
  if (effectiveMethod !== "GET" && csrfToken) headers["X-CSRF-Token"] = csrfToken;
  const init = effectiveMethod !== "GET"
    ? { method: effectiveMethod, credentials: "same-origin", cache: "no-store", headers, ...(hasBody ? { body: JSON.stringify(body) } : {}) }
    : { credentials: "same-origin", cache: "no-store" };
  const r = await fetch(forgePath(url), init);
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
function card(title, description, action, badges = []) {
  const b = button("", action);
  b.className = "card";
  if (badges.length) {
    const wrap = document.createElement("div");
    wrap.className = "card-badges";
    for (const badge of badges) {
      const span = document.createElement("span");
      span.className = "card-badge" + (badge.kind ? " " + badge.kind : "");
      span.textContent = badge.label;
      wrap.append(span);
    }
    b.append(wrap);
  }
  const strong = document.createElement("strong");
  strong.textContent = title;
  const small = document.createElement("small");
  small.textContent = description;
  b.append(strong, small);
  return b;
}
let cachedTemplates = [];
let activeTemplateFilter = "all";
let templateSearchQuery = "";
let filtersBound = false;
function templateMatchesFilter(x) {
  const id = String(x.id || "").toLowerCase();
  const dim = String(x.dimension || "3d").toLowerCase();
  if (activeTemplateFilter === "showcase" && x.showcase !== true) return false;
  if (activeTemplateFilter === "2d" && dim !== "2d") return false;
  if (activeTemplateFilter === "3d" && dim !== "3d") return false;
  if (activeTemplateFilter === "multiplayer" && !/(mmo|brawllabs|fortress)/i.test(id + " " + (x.description || ""))) return false;
  if (activeTemplateFilter === "ported" && !/^(unity|roblox)-/.test(id)) return false;
  if (templateSearchQuery) {
    const hay = `${x.id} ${x.name} ${x.description || ""} ${dim}`.toLowerCase();
    if (!hay.includes(templateSearchQuery)) return false;
  }
  return true;
}
function renderTemplates() {
  const filtered = cachedTemplates.filter(templateMatchesFilter);
  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "empty-hint";
    empty.textContent = "조건에 맞는 템플릿이 없습니다. 검색어나 필터를 초기화해 보세요.";
    $("templates").replaceChildren(empty);
    return;
  }
  $("templates").replaceChildren(...filtered.map((x) => {
    const badges = [];
    if (x.dimension) badges.push({ label: String(x.dimension).toUpperCase() });
    if (x.showcase === true) badges.push({ label: "제작과정 보기", kind: "showcase" });
    return card(
      x.name,
      (x.assetCount ? `에셋 ${x.assetCount}개 포함 · ` : "") + (x.description || "\uC0C8 \uD504\uB85C\uC81D\uD2B8\uB85C \uC2DC\uC791"),
      () => create(x.id, x.showcase === true, x.name),
      badges
    );
  }));
}
function bindTemplateToolbar() {
  if (filtersBound) return;
  filtersBound = true;
  const search = $("templateSearch");
  if (search) {
    search.addEventListener("input", () => {
      templateSearchQuery = search.value.trim().toLowerCase();
      renderTemplates();
    });
  }
  const newBtn = $("newBlankProjectBtn");
  if (newBtn) {
    newBtn.addEventListener("click", () => {
      Promise.resolve(create("blank3d", false, "빈 3D 프로젝트")).catch((e) => status(e.message));
    });
  }
  const filters = $("templateFilters");
  if (filters) {
    filters.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-filter]");
      if (!btn) return;
      activeTemplateFilter = btn.dataset.filter || "all";
      for (const b of filters.querySelectorAll("button[data-filter]")) {
        b.setAttribute("aria-pressed", String(b === btn));
      }
      renderTemplates();
    });
  }
  window.addEventListener("playforge:dev-demo-ui-change", (e) => {
    const enabled = Boolean(e?.detail?.enabled);
    if (!enabled && activeTemplateFilter === "showcase") {
      activeTemplateFilter = "all";
      const filtersEl = $("templateFilters");
      if (filtersEl) {
        for (const b of filtersEl.querySelectorAll("button[data-filter]")) {
          b.setAttribute("aria-pressed", String(b.dataset.filter === "all"));
        }
      }
      renderTemplates();
    }
  });
}
function projectCard(x) {
  const wrap = document.createElement("div");
  wrap.className = "project-card-wrap";
  const openBtn = card(x.name, "\uB9AC\uBE44\uC804 " + x.revision, () => openProject(x.id));
  const actions = document.createElement("div");
  actions.className = "project-card-actions";
  const renameBtn = button("이름 변경", async () => {
    const nextName = await askProjectName("프로젝트 이름 변경", x.name, "새 이름을 입력해 주세요 (1~80자).");
    if (!nextName?.trim() || nextName.trim() === x.name) return;
    await api("/api/platform/projects/" + x.id, { name: nextName.trim() }, "PATCH");
    status("프로젝트 이름을 변경했습니다.");
    await library();
  });
  renameBtn.dataset.action = "rename";
  const delBtn = button("삭제", async () => {
    const ok = typeof window.confirm === "function" ? window.confirm(`"${x.name}" 프로젝트를 삭제할까요? 이 작업은 되돌릴 수 없습니다.`) : true;
    if (!ok) return;
    await api("/api/platform/projects/" + x.id, null, "DELETE");
    status("프로젝트를 삭제했습니다.");
    await library();
  });
  delBtn.className = "danger";
  delBtn.dataset.action = "delete";
  actions.append(renameBtn, delBtn);
  wrap.append(openBtn, actions);
  return wrap;
}
async function library() {
  bindTemplateToolbar();
  const [t, p] = await Promise.all([api("/api/platform/templates"), api("/api/platform/projects")]);
  cachedTemplates = t.templates || [];
  if ($("kpi-templates")) $("kpi-templates").textContent = `${cachedTemplates.length}종`;
  if ($("kpi-projects")) $("kpi-projects").textContent = `${(p.projects || []).length}개`;
  renderTemplates();
  if (!p.projects.length) {
    const empty = document.createElement("p");
    empty.className = "empty-hint";
    empty.textContent = "아직 만든 프로젝트가 없습니다. 위 템플릿을 선택해 첫 프로젝트를 시작해 보세요.";
    $("projects").replaceChildren(empty);
  } else {
    $("projects").replaceChildren(...p.projects.map((x) => projectCard(x)));
  }
}
async function create(template, showcase = false, templateName = "") {
  const defaultName = template === "blank3d" ? "\uC0C8\uB85C\uC6B4 \uC138\uACC4" : (templateName ? `${templateName} 프로젝트` : "\uC608\uC81C \uC138\uACC4");
  const name = await askProjectName("\uD504\uB85C\uC81D\uD2B8 \uC774\uB984", defaultName, templateName ? `선택한 템플릿: ${templateName}` : "");
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
  // Both template sessions and chat recordings publish cursors from the mounted editor.
  showcaseProjectId = id;
  PlayForgeGuided.renderShowcase([]);
  $("editor").src = "editor.html?project=" + encodeURIComponent(id) + (playShowcase ? "&showcase=1" : "");
  history.replaceState(null, "", "?project=" + encodeURIComponent(id) + (playShowcase ? "&showcase=1" : ""));
  events?.close();
  events = new EventSource(forgePath("/api/platform/projects/" + id + "/events"));
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
  events.addEventListener("remote-command", (e) => {
    try {
      editorMessage("remote-command", { command: JSON.parse(e.data) });
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
    if (/불러오는 중|준비하고 있습니다/.test($("status").textContent || "")) status("");
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
  $("panel").classList.remove("publish-drawer");
  $("panelTitle").textContent = title;
  $("panelBody").replaceChildren();
  return $("panelBody");
}
function showCollaboration() {
  panelMode = "collaboration";
  $("panel").hidden = false;
  $("panel").classList.remove("publish-drawer");
  renderCollaboration();
}
$("closePanel").onclick = () => { $("panel").hidden = true; $("panel").classList.remove("publish-drawer"); panelMode = ""; };
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
        link.href = forgePath(v.previewUrl);
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
  if (!selected) return;
  panelMode = "publish";
  await refresh();
  if (window.PlayForgePublish?.open) {
    window.PlayForgePublish.open({
      selected,
      getSelected: () => selected,
      lastBuild,
      hubAuth: Boolean(csrfToken),
      forgePath,
      api,
      status,
      refresh,
      build,
      onBuildChange: (b) => { lastBuild = b; }
    });
    return;
  }
  if (publishing) return;
  try {
    publishing = true;
    if (!lastBuild || lastBuild.revision !== selected.revision) await build();
    if (selected?.project.id !== lastBuild.projectId) throw Error("\uD504\uB85C\uC81D\uD2B8\uAC00 \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uBC30\uD3EC\uD558\uC138\uC694.");
    const label = prompt("\uBC30\uD3EC \uC774\uB984", "\uB9AC\uBE44\uC804 " + lastBuild.revision);
    if (label === null) return;
    await api("/api/platform/projects/" + selected.project.id + "/releases", { revision: lastBuild.revision, buildId: lastBuild.id, label });
    const p = panel("\uBC30\uD3EC \uC644\uB8CC");
    const a = document.createElement("a");
    a.href = forgePath("/play/" + selected.project.id);
    a.target = "_blank";
    a.textContent = "\uAC8C\uC2DC\uB41C \uAC8C\uC784 \uC5F4\uAE30 \u2197";
    p.append(a, document.createElement("br"), button("\uBC30\uD3EC \uB9C1\uD06C \uBCF5\uC0AC", () => copyText(location.origin + a.getAttribute("href"))));
    status("\uD604\uC7AC \uC11C\uBC84\uC5D0 \uAC8C\uC2DC\uD588\uC2B5\uB2C8\uB2E4. \uAC19\uC740 \uC8FC\uC18C\uC5D0\uC11C \uD65C\uC131 \uBC84\uC804\uC744 \uC81C\uACF5\uD569\uB2C8\uB2E4.");
  } catch (e) {
    status(e.message);
  } finally {
    publishing = false;
  }
};
const desktopDownloadBtn = document.getElementById("desktopDownloadBtn");
const sidebarDesktopDownloadBtn = document.getElementById("sidebarDesktopDownloadBtn");
const desktopDownloadModal = document.getElementById("desktopDownloadModal");
const desktopDownloadClose = document.getElementById("desktopDownloadClose");
const desktopDownloadList = document.getElementById("desktopDownloadList");

function detectClientOs() {
  const ua = String(navigator.userAgent || "").toLowerCase();
  if (ua.includes("windows")) return "windows";
  if (ua.includes("mac os") || ua.includes("macintosh")) return "macos";
  if (ua.includes("linux")) return "linux";
  return "windows";
}
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
async function openDesktopDownloadModal() {
  if (!desktopDownloadModal || !desktopDownloadList) return;
  desktopDownloadList.innerHTML = '<p class="muted">다운로드 목록을 불러오는 중…</p>';
  if (typeof desktopDownloadModal.showModal === "function" && !desktopDownloadModal.open) {
    desktopDownloadModal.showModal();
  }
  try {
    const res = await fetch(forgePath("/api/desktop-downloads"), { credentials: "same-origin", cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok || !Array.isArray(data.items)) {
      throw new Error(data?.error || "다운로드 정보를 불러오지 못했습니다.");
    }
    const clientOs = detectClientOs();
    desktopDownloadList.textContent = "";
    const sorted = [...data.items].sort((a, b) => Number(b.os === clientOs) - Number(a.os === clientOs));
    for (const item of sorted) {
      const card = document.createElement("div");
      card.className = "desktop-dl-card" + (item.os === clientOs && item.available ? " is-recommended" : "");
      const meta = document.createElement("div");
      meta.className = "desktop-dl-meta";
      const titleRow = document.createElement("div");
      titleRow.className = "desktop-dl-title";
      const titleSpan = document.createElement("span");
      titleSpan.textContent = item.title;
      titleRow.append(titleSpan);
      if (item.os === clientOs && item.available) {
        const badge = document.createElement("span");
        badge.className = "desktop-dl-badge";
        badge.textContent = "권장";
        titleRow.append(badge);
      }
      const sub = document.createElement("div");
      sub.className = "desktop-dl-sub";
      sub.textContent = item.subtitle;
      const size = document.createElement("div");
      size.className = "desktop-dl-size";
      size.textContent = item.available
        ? `${item.filename}${item.sizeBytes ? " · " + formatBytes(item.sizeBytes) : ""}`
        : `${item.filename} · 배포 준비 중`;
      meta.append(titleRow, sub, size);

      const action = document.createElement("a");
      action.className = "forge-btn " + (item.available ? "primary" : "secondary is-disabled") + " desktop-dl-action";
      if (item.available && item.downloadUrl) {
        action.href = item.downloadUrl;
        action.download = item.filename;
        action.textContent = "다운로드";
      } else {
        action.href = "#";
        action.setAttribute("aria-disabled", "true");
        action.textContent = "준비 중";
      }
      card.append(meta, action);
      desktopDownloadList.append(card);
    }
  } catch (e) {
    desktopDownloadList.textContent = e?.message || "다운로드 목록을 불러오지 못했습니다.";
  }
}
if (desktopDownloadBtn) desktopDownloadBtn.onclick = () => openDesktopDownloadModal();
if (sidebarDesktopDownloadBtn) sidebarDesktopDownloadBtn.onclick = () => openDesktopDownloadModal();
if (desktopDownloadClose && desktopDownloadModal) desktopDownloadClose.onclick = () => desktopDownloadModal.close();
if (desktopDownloadModal) {
  desktopDownloadModal.addEventListener("click", (e) => {
    if (e.target === desktopDownloadModal) desktopDownloadModal.close();
  });
}

(async () => {
  await ensureSession();
  await library();
  const query = new URLSearchParams(location.search);
  const id = query.get("project");
  if (id) await openProject(id);
  else {
    status("원하는 템플릿을 선택하거나 새 프로젝트를 만들어 시작하세요.");
    // Warm browser HTTP cache with the release Web Editor WASM while user browses templates (PC desktop, non-saveData only)
    const conn = navigator.connection;
    const lowBandwidth = Boolean(conn && (conn.saveData || /(?:2g|slow-2g)/i.test(String(conn.effectiveType || ""))));
    if (!lowBandwidth && window.innerWidth >= 900) {
      const warm = () => {
        for (const asset of ["/OfficialGodot/vendor/godot.editor.js", "/OfficialGodot/vendor/godot.editor.wasm"]) {
          fetch(forgePath(asset), { credentials: "same-origin", priority: "low" }).then((r) => r.body?.cancel?.()).catch(() => {});
        }
      };
      if (typeof requestIdleCallback === "function") requestIdleCallback(warm, { timeout: 2500 });
      else setTimeout(warm, 1200);
    }
  }
})().catch((e) => status(e.message));
