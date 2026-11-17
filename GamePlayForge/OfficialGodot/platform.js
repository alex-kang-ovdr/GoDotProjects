"use strict";
const $ = (id) => document.getElementById(id);
let selected = null, events = null, lastBuild = null, selectionSequence = 0;
const status = (text) => $("status").textContent = text;
async function api(url, body, method = "POST") {
  const r = await fetch(url, body ? { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "\uC694\uCCAD \uC2E4\uD328");
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
  $("templates").replaceChildren(...t.templates.map((x) => card(x.name, (x.assetCount ? `에셋 ${x.assetCount}개 포함 · ` : "") + x.description || "\uC0C8 \uD504\uB85C\uC81D\uD2B8\uB85C \uC2DC\uC791", () => create(x.id))));
  $("projects").replaceChildren(...p.projects.map((x) => card(x.name, "\uB9AC\uBE44\uC804 " + x.revision, () => openProject(x.id))));
}
async function create(template) {
  const name = prompt("\uD504\uB85C\uC81D\uD2B8 \uC774\uB984", template === "blank3d" ? "\uC0C8\uB85C\uC6B4 \uC138\uACC4" : "\uC608\uC81C \uC138\uACC4");
  if (!name?.trim()) return;
  const guided = template !== "blank3d" && await PlayForgeGuided.choose();
  if (guided === null) return;
  const d = await api("/api/platform/projects", { name: name.trim(), template, mode: guided ? "guided" : "ready" });
  await openProject(d.project.id);
  if (guided) PlayForgeGuided.start(d.project.id, template);
}
async function openProject(id) {
  $("panel").hidden = true;
  $("panelBody").replaceChildren();
  const sequence = ++selectionSequence;
  const result = await api("/api/platform/projects/" + id);
  if (sequence !== selectionSequence) return;
  selected = result;
  lastBuild = null;
  $("library").hidden = true;
  $("workspace").hidden = false;
  $("projectName").textContent = selected.project.name;
  $("editor").dataset.ready = "";
  $("editor").src = "editor.html?project=" + encodeURIComponent(id);
  history.replaceState(null, "", "?project=" + id);
  events?.close();
  events = new EventSource("/api/platform/projects/" + id + "/events");
  events.onopen = () => {
    $("connection").textContent = "\uACF5\uB3D9 \uC791\uC5C5 \uC5F0\uACB0\uB428";
  };
  events.onerror = () => {
    $("connection").textContent = "\uC7AC\uC5F0\uACB0 \uC911";
  };
  events.addEventListener("presence", (e) => {
    try {
      $("connection").textContent = "\uD568\uAED8 \uC791\uC5C5 \uC911 " + JSON.parse(e.data).count + "\uBA85";
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
    selected = result;
    status("\uACF5\uC720 \uD504\uB85C\uC81D\uD2B8 \xB7 \uB9AC\uBE44\uC804 " + selected.revision);
  } catch (e) {
    status(e.message);
  }
}
window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.source !== $("editor").contentWindow) return;
  if (event.data?.source !== "playforge-godot-editor") return;
  if (event.data.type === "pluginready") $("editor").dataset.ready = "true";
  if (event.data.type === "activity") {
    PlayForgeGuided.activity(event.data);
    return;
  }
  if (event.data.type === "loadingerror") status("\uC5D0\uB514\uD130 \uC624\uB958: " + event.data.message);
  else if (["ready", "pluginready"].includes(event.data.type)) status("\uC5D0\uB514\uD130 \uC5F0\uACB0\uB428 \xB7 \uACF5\uC720 \uB9AC\uBE44\uC804 " + event.data.revision);
  else if (event.data.type === "loading") status("Godot \uC5D0\uB514\uD130\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\u2026");
});
$("home").onclick = async () => {
  $("panel").hidden = true;
  $("panelBody").replaceChildren();
  ++selectionSequence;
  PlayForgeGuided.stop();
  $("library").hidden = false;
  $("workspace").hidden = true;
  $("editor").removeAttribute("src");
  events?.close();
  selected = null;
  history.replaceState(null, "", location.pathname);
  await library();
};
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
$("closePanel").onclick = () => $("panel").hidden = true;
$("test").onclick = async () => {
  try {
    $("test").disabled = true;
    const b = await build();
    const p = panel("\uD568\uAED8 \uD14C\uC2A4\uD2B8\uD558\uAE30");
    const a = document.createElement("a");
    a.href = b.previewUrl;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "\uD14C\uC2A4\uD2B8 \uAC8C\uC784 \uC5F4\uAE30 \u2197";
    p.append(a, document.createElement("br"), button("\uD14C\uC2A4\uD2B8 \uB9C1\uD06C \uBCF5\uC0AC", () => navigator.clipboard.writeText(location.origin + b.previewUrl)));
    const n = document.createElement("p");
    n.textContent = "\uC774 \uB9AC\uBE44\uC804\uC758 \uAC19\uC740 \uBE4C\uB4DC\uB97C \uD300\uACFC \uACF5\uC720\uD569\uB2C8\uB2E4. \uBA40\uD2F0\uD50C\uB808\uC774 \uC138\uC158\uC740 \uBCC4\uB3C4 \uAC8C\uC784 \uAD6C\uD604\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.";
    p.append(n);
  } catch (e) {
    status(e.message);
  } finally {
    $("test").disabled = false;
  }
};
$("versions").onclick = async () => {
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
$("publish").onclick = async () => {
  if (!selected) return;
  try {
    $("publish").disabled = true;
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
    $("publish").disabled = false;
  }
};
(async () => {
  await library();
  const id = new URLSearchParams(location.search).get("project");
  if (id) await openProject(id);
  else {
    const p = await api("/api/platform/projects");
    if (!p.projects.length) {
      const d = await api("/api/platform/projects", { name: "\uB098\uC758 \uCCAB \uBC88\uC9F8 \uC138\uACC4", template: "blank3d" });
      await openProject(d.project.id);
    } else status("\uD504\uB85C\uC81D\uD2B8 \uB610\uB294 \uC608\uC81C\uB9F5\uC744 \uC120\uD0DD\uD558\uC138\uC694.");
  }
})().catch((e) => status(e.message));
