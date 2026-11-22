"use strict";
(function (root) {
  const DEFAULT_TIERS = {
    "free-nano": { id: "free-nano", label: "Free-Nano (무료 체험 · ~10 CCU)", recommendedCcu: 10, pointsPerHour: 0 },
    nano: { id: "nano", label: "Nano (3 P/hr · ~10 CCU)", recommendedCcu: 10, pointsPerHour: 3 },
    micro: { id: "micro", label: "Micro S (6 P/hr · ~30 CCU)", recommendedCcu: 30, pointsPerHour: 6 },
    small: { id: "small", label: "Small M (12 P/hr · ~80 CCU)", recommendedCcu: 80, pointsPerHour: 12 },
    medium: { id: "medium", label: "Medium L (24 P/hr · ~200 CCU)", recommendedCcu: 200, pointsPerHour: 24 },
    large: { id: "large", label: "Large XL (48 P/hr · ~400 CCU)", recommendedCcu: 400, pointsPerHour: 48 }
  };

  const ALL_TAGS = ["arcade", "action", "puzzle", "platformer", "strategy", "rpg", "multiplayer"];
  const ALL_CONTROLS = [
    ["keyboard", "키보드"],
    ["mouse", "마우스"],
    ["touch", "터치"],
    ["gamepad", "게임패드"]
  ];

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null) continue;
      if (k === "className") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in node && typeof v === "boolean") node[k] = v;
      else node.setAttribute(k, String(v));
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      node.append(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return node;
  }

  function slugify(text, fallback = "forge-game") {
    const clean = String(text || "")
      .normalize("NFKD")
      .replace(/[^\x00-\x7f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-")
      .slice(0, 48);
    if (!clean || !/^[a-z]/.test(clean)) return fallback;
    return clean;
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "—";
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + " MB";
    return Math.round(bytes / 1024) + " KB";
  }

  function estimatePoints(state, config) {
    const krwPerPoint = config.krwPerPoint || 14;
    const freeLimit = config.freeMonthlyPointLimit || 100;
    const tiers = config.specTiers || DEFAULT_TIERS;
    if (state.deployMode === "singleplay") {
      return { monthlyPoints: 0, monthlyKrw: 0, instances: 0, warnings: [] };
    }
    const tier = tiers[state.specTier] || DEFAULT_TIERS.nano;
    const hours = state.alwaysOn ? 24 : Math.max(0, Math.min(24, Number(state.estHoursPerDay) || 0));
    const ccu = Math.max(1, Number(state.estAvgCcu) || 1);
    const instances = Math.max(1, Math.ceil(ccu / Math.max(1, tier.recommendedCcu || 10)));
    const rate = tier.id === "free-nano" ? 3 : tier.pointsPerHour;
    const usage = Math.ceil(instances * rate * Math.round(hours * 30));
    const billed = state.deployMode === "mo" && tier.id === "free-nano" ? 0 : usage;
    const warnings = [];
    if (state.deployMode === "mmo" && tier.id === "free-nano") {
      warnings.push("MMO 라이브 공개는 유료 프리셋(Small 이상 권장)이 필요합니다. Free-Nano는 1시간 Sandbox 전용입니다.");
    } else if (tier.id === "free-nano" && (ccu > 10 || usage > freeLimit)) {
      warnings.push(`Free-Nano 한도(동접 10명 · 월 ${freeLimit} P)를 초과할 수 있습니다. 예상 사용량 ${usage.toLocaleString()} P`);
    }
    if (state.deployMode === "mmo" && state.alwaysOn) {
      warnings.push("24시간 상시 유지(alwaysOn) 시 접속자가 없어도 시간당 허브 포인트가 차감됩니다.");
    }
    return {
      monthlyPoints: billed,
      estimatedUsage: usage,
      monthlyKrw: Math.round(billed * krwPerPoint),
      instances,
      warnings
    };
  }

  async function hubRequest(url, body, method = "POST") {
    const headers = {};
    if (body) headers["Content-Type"] = "application/json";
    if (body && window.__playforgeCsrfToken) headers["X-CSRF-Token"] = window.__playforgeCsrfToken;
    const res = await fetch(url, body
      ? { method, credentials: "same-origin", cache: "no-store", headers, body: JSON.stringify(body) }
      : { credentials: "same-origin", cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data?.error?.message || data?.error?.code || data?.error || `요청 실패 (${res.status})`;
      const err = new Error(message);
      err.status = res.status;
      err.code = data?.error?.code || data?.error;
      throw err;
    }
    return data;
  }

  function open(ctx) {
    const panelEl = document.getElementById("panel");
    const titleEl = document.getElementById("panelTitle");
    const bodyEl = document.getElementById("panelBody");
    if (!panelEl || !titleEl || !bodyEl || !ctx?.selected) return;

    panelEl.hidden = false;
    panelEl.classList.add("publish-drawer");
    titleEl.textContent = "PlayForge 배포 센터";

    const project = ctx.selected.project;
    const isHubMode = Boolean(window.__playforgeCsrfToken) || Boolean(ctx.hubAuth);

    const state = {
      tab: "wizard", // 'wizard' | 'history'
      step: 1,
      visibility: "public",
      deployMode: "singleplay",
      serverRuntime: "none",
      specTier: "free-nano",
      lobbyMode: "stateless_ui",
      alwaysOn: false,
      idleSleepSec: 180,
      notifyEmail: "",
      estHoursPerDay: 2,
      estAvgCcu: 10,
      label: `리비전 ${ctx.selected.revision}`,
      slug: slugify(project.name, `game-${project.id.slice(0, 8)}`),
      titleKo: project.name || "새 게임",
      titleEn: project.name || "New Game",
      summaryKo: `${project.name} — PlayForge에서 제작된 웹 게임`,
      summaryEn: `${project.name} — Web game built with PlayForge`,
      instructionsKo: "키보드 또는 터치로 플레이하세요.",
      instructionsEn: "Play with keyboard or touch controls.",
      tags: ["arcade"],
      controls: ["keyboard", "mouse"],
      orientation: "landscape",
      viewportWidth: 1280,
      viewportHeight: 720,
      building: false,
      build: ctx.lastBuild && ctx.lastBuild.projectId === project.id ? ctx.lastBuild : null,
      buildError: "",
      showBuildLog: false,
      standardBuilding: false,
      standardBuild: null,
      standardBuildError: "",
      publishing: false,
      publishError: "",
      publishResult: null,
      releases: [],
      submissions: [],
      config: { specTiers: DEFAULT_TIERS, krwPerPoint: 14, freeMonthlyPointLimit: 100 }
    };

    function applyMetadata(gm, dp) {
      if (gm) {
        if (gm.slug) state.slug = gm.slug;
        if (gm.title?.ko) state.titleKo = gm.title.ko;
        if (gm.title?.en) state.titleEn = gm.title.en;
        if (gm.summary?.ko) state.summaryKo = gm.summary.ko;
        if (gm.summary?.en) state.summaryEn = gm.summary.en;
        if (gm.instructions?.ko) state.instructionsKo = gm.instructions.ko;
        if (gm.instructions?.en) state.instructionsEn = gm.instructions.en;
        if (Array.isArray(gm.tags) && gm.tags.length) state.tags = gm.tags.slice();
        if (Array.isArray(gm.controls) && gm.controls.length) state.controls = gm.controls.slice();
        if (gm.viewport?.orientation) state.orientation = gm.viewport.orientation;
        if (Number.isSafeInteger(gm.viewport?.width)) state.viewportWidth = gm.viewport.width;
        if (Number.isSafeInteger(gm.viewport?.height)) state.viewportHeight = gm.viewport.height;
      }
      if (dp) {
        if (dp.deployMode) state.deployMode = dp.deployMode;
        if (dp.serverRuntime) state.serverRuntime = dp.serverRuntime;
        if (dp.specTier) state.specTier = dp.specTier;
        if (dp.lobbyMode) state.lobbyMode = dp.lobbyMode;
        if (Number.isSafeInteger(dp.lifecycle?.idleSleepSec)) state.idleSleepSec = dp.lifecycle.idleSleepSec;
        if (typeof dp.lifecycle?.alwaysOn === "boolean") state.alwaysOn = dp.lifecycle.alwaysOn;
      }
    }

    async function loadMeta() {
      try {
        const [cfg, rel, tpl] = await Promise.all([
          ctx.api("/api/platform/publish-config").catch(() => null),
          ctx.api("/api/platform/projects/" + project.id + "/releases").catch(() => ({ releases: [] })),
          project.template ? ctx.api("/api/platform/templates/" + encodeURIComponent(project.template)).catch(() => null) : Promise.resolve(null)
        ]);
        if (cfg?.specTiers) state.config = cfg;
        state.releases = Array.isArray(rel?.releases) ? rel.releases.slice().reverse() : [];
        if (state.releases[0]?.gameMetadata || state.releases[0]?.deployProfile) {
          applyMetadata(state.releases[0].gameMetadata, state.releases[0].deployProfile);
        } else if (tpl?.template?.publishDefaults) {
          applyMetadata(tpl.template.publishDefaults.gameMetadata, tpl.template.publishDefaults.deployProfile);
        }
        if (isHubMode) {
          const subRes = await hubRequest("/api/creator/submissions").catch(() => null);
          if (Array.isArray(subRes?.submissions)) {
            state.submissions = subRes.submissions.filter(s => s.projectId === project.id);
          }
        }
      } catch {}
      render();
    }

    async function runBuild() {
      if (state.building) return;
      state.building = true;
      state.buildError = "";
      render();
      try {
        await ctx.refresh();
        const latest = ctx.getSelected ? ctx.getSelected() : ctx.selected;
        const start = await ctx.api("/api/platform-builds/" + latest.project.id, { revision: latest.revision });
        let job = start.build;
        state.build = job;
        render();
        const deadline = Date.now() + 180000;
        while (["queued", "running"].includes(job.status) && Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 1000));
          job = (await ctx.api("/api/builds/" + job.id)).build;
          state.build = job;
          render();
        }
        if (job.status !== "succeeded") {
          state.buildError = job.error || "빌드 시간이 초과되었습니다.";
          state.showBuildLog = true;
        } else {
          state.label = `리비전 ${job.revision}`;
          ctx.onBuildChange?.(job);
        }
      } catch (err) {
        state.buildError = err.message || "빌드 실행에 실패했습니다.";
        state.showBuildLog = true;
      } finally {
        state.building = false;
        render();
      }
    }

    async function runStandardGodotWebBuild() {
      if (state.standardBuilding) return;
      state.standardBuilding = true;
      state.standardBuildError = "";
      render();
      try {
        await ctx.refresh();
        const latest = ctx.getSelected ? ctx.getSelected() : ctx.selected;
        const start = await ctx.api("/api/platform-builds/" + latest.project.id, {
          revision: latest.revision,
          buildProfile: "standard-godot"
        });
        let job = start.build;
        state.standardBuild = job;
        render();
        const deadline = Date.now() + 180000;
        while (["queued", "running"].includes(job.status) && Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 1000));
          job = (await ctx.api("/api/builds/" + job.id)).build;
          state.standardBuild = job;
          render();
        }
        if (job.status !== "succeeded") {
          state.standardBuildError = job.error || "표준 Godot 웹 빌드 시간이 초과되었습니다.";
        }
      } catch (err) {
        state.standardBuildError = err.message || "표준 Godot 웹 빌드에 실패했습니다.";
      } finally {
        state.standardBuilding = false;
        render();
      }
    }

    async function executePublish() {
      if (state.publishing) return;
      if (!state.build || state.build.status !== "succeeded") {
        state.publishError = "먼저 Step 3에서 Web 빌드를 완료해 주세요.";
        render();
        return;
      }
      state.publishing = true;
      state.publishError = "";
      state.publishResult = null;
      render();
      try {
        const latest = ctx.getSelected ? ctx.getSelected() : ctx.selected;
        const deployProfile = {
          deployMode: state.deployMode,
          serverRuntime: state.deployMode === "singleplay" ? "none" : state.serverRuntime || "node-wss-v1",
          specTier: state.deployMode === "singleplay" ? "free-nano" : state.specTier,
          lobbyMode: state.lobbyMode,
          lifecycle: {
            alwaysOn: state.deployMode === "mmo" && state.alwaysOn,
            idleSleepSec: Number(state.idleSleepSec) || 180
          },
          billing: { notifyEmail: state.notifyEmail.trim() }
        };
        const gameMetadata = {
          slug: state.slug.trim(),
          title: { ko: state.titleKo.trim(), en: state.titleEn.trim() || state.titleKo.trim() },
          summary: { ko: state.summaryKo.trim(), en: state.summaryEn.trim() || state.summaryKo.trim() },
          instructions: { ko: state.instructionsKo.trim(), en: state.instructionsEn.trim() || state.instructionsKo.trim() },
          tags: state.tags.length ? state.tags : ["arcade"],
          controls: state.controls.length ? state.controls : ["keyboard", "mouse"],
          viewport: { width: state.viewportWidth || 1280, height: state.viewportHeight || 720, orientation: state.orientation, resize: "fit" }
        };

        const relRes = await ctx.api("/api/platform/projects/" + latest.project.id + "/releases", {
          revision: state.build.revision,
          buildId: state.build.id,
          label: state.label.trim() || `리비전 ${state.build.revision}`,
          visibility: state.visibility,
          deployProfile,
          gameMetadata
        });
        const release = relRes.release;

        const outcome = {
          release,
          forgePreviewUrl: ctx.forgePath("/play/" + latest.project.id),
          isolatedPreviewUrl: null,
          submission: null,
          hubNotice: ""
        };

        if (isHubMode) {
          if (state.visibility === "public") {
            const created = await hubRequest("/api/creator/submissions", {
              projectId: latest.project.id,
              releaseId: release.id,
              title: gameMetadata.title.ko,
              description: gameMetadata.summary.ko,
              gameSlug: gameMetadata.slug,
              visibility: "public",
              deployMode: state.deployMode,
              gameMetadata
            });
            const submitted = await hubRequest(`/api/creator/submissions/${created.submission.id}/submit`, {
              revision: created.submission.revision
            });
            outcome.submission = submitted.submission;
            outcome.hubNotice = "PlayHub 공개 심사에 자동 제출되었습니다. 관리자 승인·게시 즉시 카탈로그에 노출됩니다.";
          } else {
            const preview = await hubRequest("/api/creator/publications/preview", {
              projectId: latest.project.id,
              releaseId: release.id,
              visibility: state.visibility,
              gameSlug: gameMetadata.slug,
              title: gameMetadata.title.ko,
              description: gameMetadata.summary.ko,
              deployMode: state.deployMode,
              gameMetadata
            });
            outcome.isolatedPreviewUrl = preview.previewUrl;
            outcome.hubNotice = preview.liveUnchanged
              ? "기존 라이브 버전을 유지한 채 새 테스트 링크를 발급했습니다."
              : "격리 실행 환경(/play-ugc/)에 테스트 빌드가 즉시 반영되었습니다.";
          }
        } else {
          outcome.hubNotice = "단독 Forge 모드입니다. 로컬 미리보기 링크로 바로 테스트할 수 있습니다.";
        }

        state.publishResult = outcome;
        ctx.status?.("배포 릴리스 생성 완료");
        await loadMeta();
      } catch (err) {
        state.publishError = err.message || "배포 처리에 실패했습니다.";
      } finally {
        state.publishing = false;
        render();
      }
    }

    function renderStep1() {
      const calc = estimatePoints(state, state.config);
      const tiers = state.config.specTiers || DEFAULT_TIERS;
      const sec = el("div", { className: "pf-pub-section" });

      sec.append(
        el("div", { className: "pf-pub-field" },
          el("span", { text: "공개 범위" }),
          el("select", {
            value: state.visibility,
            onChange: e => { state.visibility = e.target.value; render(); }
          },
            el("option", { value: "public", selected: state.visibility === "public", text: "PlayHub 공개 제출 (카탈로그 노출 · 심사 필요)" }),
            el("option", { value: "unlisted", selected: state.visibility === "unlisted", text: "링크 공유 (Unlisted · 즉시 격리 URL 발급)" }),
            el("option", { value: "private", selected: state.visibility === "private", text: "비공개 테스트 (Private · 제작자 테스트용)" })
          )
        )
      );

      const modeCards = [
        ["singleplay", "SinglePlay", "서버 없음 · 정적 CDN · 0 P (무료)"],
        ["mo", "MO (룸·매치)", "온디맨드 세션 · Scale-to-Zero · Free-Nano 지원"],
        ["mmo", "MMO (지속 월드)", "자동 채널링 · 스냅샷 슬립 · 유료 전용"]
      ];
      sec.append(
        el("div", { className: "pf-pub-field" },
          el("span", { text: "배포 모드 (deployProfile)" }),
          el("div", { className: "pf-mode-grid" },
            modeCards.map(([id, title, desc]) =>
              el("button", {
                type: "button",
                className: "pf-mode-card" + (state.deployMode === id ? " selected" : ""),
                onClick: () => {
                  state.deployMode = id;
                  state.serverRuntime = id === "singleplay" ? "none" : "node-wss-v1";
                  if (id === "mmo" && state.specTier === "free-nano") state.specTier = "small";
                  if (id === "singleplay") state.specTier = "free-nano";
                  render();
                }
              }, el("strong", { text: title }), el("small", { text: desc }))
            )
          )
        )
      );

      if (state.deployMode !== "singleplay") {
        const tierSelect = el("select", {
          onChange: e => { state.specTier = e.target.value; render(); }
        }, Object.values(tiers).map(t =>
          el("option", { value: t.id, selected: state.specTier === t.id, text: t.label })
        ));

        const calcBox = el("div", { className: "pf-pub-box" },
          el("h4", { text: "실시간 예상 허브 포인트 계산기 (단일 고정 요율 · 피크 할인 없음)" }),
          el("div", { className: "pf-pub-row" },
            el("label", { className: "pf-pub-field" },
              el("span", { text: "서버 스펙 프리셋" }),
              tierSelect
            ),
            el("label", { className: "pf-pub-field" },
              el("span", { text: "로비 처리 모드" }),
              el("select", {
                onChange: e => { state.lobbyMode = e.target.value; render(); }
              },
                el("option", { value: "stateless_ui", selected: state.lobbyMode === "stateless_ui", text: "Stateless UI (0 P · 권장)" }),
                el("option", { value: "realtime_3d_lobby", selected: state.lobbyMode === "realtime_3d_lobby", text: "실시간 3D 광장 (포인트 차감)" })
              )
            )
          ),
          el("div", { className: "pf-pub-row" },
            el("label", { className: "pf-pub-field" },
              el("span", { text: `일일 활성 시간: ${state.alwaysOn ? 24 : state.estHoursPerDay}시간` }),
              el("input", {
                type: "range",
                min: 1,
                max: 24,
                value: state.alwaysOn ? 24 : state.estHoursPerDay,
                disabled: state.alwaysOn,
                onInput: e => { state.estHoursPerDay = Number(e.target.value); render(); }
              })
            ),
            el("label", { className: "pf-pub-field" },
              el("span", { text: `예상 평균 동접: ${state.estAvgCcu}명` }),
              el("input", {
                type: "number",
                min: 1,
                max: 10000,
                value: state.estAvgCcu,
                onInput: e => { state.estAvgCcu = Math.max(1, Number(e.target.value) || 1); render(); }
              })
            )
          ),
          state.deployMode === "mmo"
            ? el("label", { className: "pf-chip-toggle" },
                el("input", {
                  type: "checkbox",
                  checked: state.alwaysOn,
                  onChange: e => { state.alwaysOn = e.target.checked; render(); }
                }),
                "24시간 상시 유지 (자동 슬립 끄기)"
              )
            : null,
          el("div", { className: "pf-calc-result" },
            el("strong", { text: `${calc.monthlyPoints.toLocaleString()} P / 월` }),
            el("span", { text: `약 ₩${calc.monthlyKrw.toLocaleString()} · 인스턴스 ~${calc.instances}대` })
          ),
          ...calc.warnings.map(w => el("div", { className: "pf-pub-warn", text: w })),
          el("label", { className: "pf-pub-field" },
            el("span", { text: "잔액 · Burn Rate 경고 메일 (선택)" }),
            el("input", {
              type: "email",
              placeholder: "creator@example.com",
              value: state.notifyEmail,
              onInput: e => { state.notifyEmail = e.target.value; }
            })
          )
        );
        sec.append(calcBox);
      } else {
        sec.append(el("div", { className: "pf-pub-ok", text: "SinglePlay 모드는 정적 CDN으로 상시 서빙되며 허브 포인트가 차감되지 않습니다 (0 P)." }));
      }

      return sec;
    }

    function renderStep2() {
      const sec = el("div", { className: "pf-pub-section" });
      sec.append(
        el("div", { className: "pf-pub-row" },
          el("label", { className: "pf-pub-field" },
            el("span", { text: "릴리스 라벨" }),
            el("input", { type: "text", maxlength: 80, value: state.label, onInput: e => { state.label = e.target.value; } })
          ),
          el("label", { className: "pf-pub-field" },
            el("span", { text: "게임 슬러그 (영문 소문자·하이픈)" }),
            el("input", {
              type: "text",
              maxlength: 48,
              value: state.slug,
              onInput: e => { state.slug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""); }
            })
          )
        ),
        el("div", { className: "pf-pub-row" },
          el("label", { className: "pf-pub-field" },
            el("span", { text: "게임 제목 (한국어)" }),
            el("input", { type: "text", maxlength: 80, value: state.titleKo, onInput: e => { state.titleKo = e.target.value; } })
          ),
          el("label", { className: "pf-pub-field" },
            el("span", { text: "게임 제목 (English)" }),
            el("input", { type: "text", maxlength: 80, value: state.titleEn, onInput: e => { state.titleEn = e.target.value; } })
          )
        ),
        el("label", { className: "pf-pub-field" },
          el("span", { text: "한 줄 소개 (한국어)" }),
          el("textarea", { rows: 2, maxlength: 240, onInput: e => { state.summaryKo = e.target.value; } }, state.summaryKo)
        ),
        el("label", { className: "pf-pub-field" },
          el("span", { text: "조작 안내 (한국어)" }),
          el("textarea", { rows: 2, maxlength: 600, onInput: e => { state.instructionsKo = e.target.value; } }, state.instructionsKo)
        ),
        el("div", { className: "pf-pub-field" },
          el("span", { text: "장르 태그 (최대 6개)" }),
          el("div", { className: "pf-chip-list" },
            ALL_TAGS.map(tag => el("label", { className: "pf-chip-toggle" },
              el("input", {
                type: "checkbox",
                checked: state.tags.includes(tag),
                onChange: e => {
                  if (e.target.checked && !state.tags.includes(tag)) state.tags.push(tag);
                  else if (!e.target.checked) state.tags = state.tags.filter(t => t !== tag);
                }
              }),
              tag
            ))
          )
        ),
        el("div", { className: "pf-pub-row" },
          el("div", { className: "pf-pub-field" },
            el("span", { text: "지원 조작" }),
            el("div", { className: "pf-chip-list" },
              ALL_CONTROLS.map(([code, label]) => el("label", { className: "pf-chip-toggle" },
                el("input", {
                  type: "checkbox",
                  checked: state.controls.includes(code),
                  onChange: e => {
                    if (e.target.checked && !state.controls.includes(code)) state.controls.push(code);
                    else if (!e.target.checked) state.controls = state.controls.filter(c => c !== code);
                  }
                }),
                label
              ))
            )
          ),
          el("label", { className: "pf-pub-field" },
            el("span", { text: "화면 방향" }),
            el("select", { onChange: e => { state.orientation = e.target.value; } },
              el("option", { value: "landscape", selected: state.orientation === "landscape", text: "가로 (Landscape)" }),
              el("option", { value: "portrait", selected: state.orientation === "portrait", text: "세로 (Portrait)" }),
              el("option", { value: "any", selected: state.orientation === "any", text: "자동 반응형 (Any)" })
            )
          )
        )
      );
      return sec;
    }

    function renderStep3() {
      const sec = el("div", { className: "pf-pub-section" });
      const b = state.build;
      const latestRev = (ctx.getSelected ? ctx.getSelected() : ctx.selected).revision;
      const isUpToDate = b && b.status === "succeeded" && b.revision === latestRev;

      const box = el("div", { className: "pf-pub-box" },
        el("h4", { text: `PlayHub 퍼블리시 Web 빌드 · 현재 리비전 r${latestRev}` }),
        el("div", { style: "font-size:12px;color:#aebed2;" },
          b
            ? `상태: ${b.status} · 빌드 ID: ${b.id} · 리비전 r${b.revision} · 필수 PlayHub 아바타 포함`
            : "PlayHub 배포용 빌드에는 게임 모드에 맞는 필수 PlayHub 아바타 런타임과 SDK 브리지가 자동 포함됩니다."
        ),
        b && b.status === "succeeded"
          ? el("div", { className: "pf-pub-ok" },
              `ZIP 검증 통과 · 크기 ${formatBytes(b.bytes)} (전개 ${formatBytes(b.expandedBytes)}) · PlayHub 아바타 포함 · SDK 브리지(${b.sdkBridgeVersion || "web"}) · SHA-256 ${String(b.artifactSha256 || "").slice(0, 14)}…`
            )
          : null,
        state.buildError ? el("div", { className: "pf-pub-err", text: state.buildError }) : null,
        el("div", { className: "pf-chip-list" },
          el("button", {
            type: "button",
            className: "pf-pub-primary",
            disabled: state.building,
            text: state.building ? "빌드 실행 중…" : (isUpToDate ? "다시 빌드" : "PlayHub Web 빌드 및 검증 시작"),
            onClick: runBuild
          }),
          b && b.status === "succeeded" && b.downloadUrl
            ? el("a", {
                href: ctx.forgePath(b.downloadUrl),
                download: `PlayForge-Web-${b.id}.zip`,
                style: "align-self:center;padding:6px 10px;border:1px solid #3c506c;border-radius:6px;text-decoration:none;"
              }, "PlayForge-Web.zip 다운로드")
            : null,
          b?.log
            ? el("button", {
                type: "button",
                text: state.showBuildLog ? "빌드 로그 숨기기" : "빌드 로그 보기",
                onClick: () => { state.showBuildLog = !state.showBuildLog; render(); }
              })
            : null
        ),
        state.showBuildLog && b?.log ? el("pre", { className: "pf-pub-log", text: b.log }) : null
      );
      sec.append(box);

      const sb = state.standardBuild;
      const latestProjectId = (ctx.getSelected ? ctx.getSelected() : ctx.selected).project.id;
      const standardBox = el("div", { className: "pf-pub-box" },
        el("h4", { text: "일반 표준 Godot 내보내기 (PlayHub 아바타 미포함)" }),
        el("div", { style: "font-size:12px;color:#aebed2;" },
          "허브 퍼블리시 빌드가 아닌 독립 실행용 표준 Godot 내보내기입니다. PlayHub 아바타 런타임·에셋·SDK 브리지·플랫폼 설정이 완전히 제외됩니다."
        ),
        sb && sb.status === "succeeded"
          ? el("div", { className: "pf-pub-ok" },
              `표준 Godot 웹 빌드 완료 · 아바타 제외(avatarIncluded: false) · 크기 ${formatBytes(sb.bytes)}`
            )
          : null,
        state.standardBuildError ? el("div", { className: "pf-pub-err", text: state.standardBuildError }) : null,
        el("div", { className: "pf-chip-list" },
          el("a", {
            href: ctx.forgePath(`/api/platform/projects/${encodeURIComponent(latestProjectId)}/export/godot-project.zip`),
            download: `${state.slug || "project"}-StandardGodot-r${latestRev}.zip`,
            style: "align-self:center;padding:6px 10px;border:1px solid #3c506c;border-radius:6px;text-decoration:none;"
          }, "표준 Godot 프로젝트 ZIP 내보내기 (아바타 제외)"),
          el("button", {
            type: "button",
            disabled: state.standardBuilding,
            text: state.standardBuilding ? "표준 웹 빌드 중…" : "표준 Godot 웹 빌드 (아바타 제외)",
            onClick: runStandardGodotWebBuild
          }),
          sb && sb.status === "succeeded" && sb.downloadUrl
            ? el("a", {
                href: ctx.forgePath(sb.downloadUrl),
                download: `StandardGodot-Web-${sb.id}.zip`,
                style: "align-self:center;padding:6px 10px;border:1px solid #3c506c;border-radius:6px;text-decoration:none;"
              }, "StandardGodot-Web.zip 다운로드")
            : null
        )
      );
      sec.append(standardBox);
      return sec;
    }

    function renderStep4() {
      const sec = el("div", { className: "pf-pub-section" });
      const b = state.build;
      const summary = el("div", { className: "pf-pub-box" },
        el("h4", { text: "배포 요약 확인" }),
        el("div", { style: "font-size:12px;line-height:1.7;color:#c7d5e6;" },
          `• 공개 범위: ${state.visibility}\n`,
          el("br"),
          `• 배포 모드: ${state.deployMode.toUpperCase()} (${state.specTier})\n`,
          el("br"),
          `• 게임 슬러그: ${state.slug} (${state.titleKo})\n`,
          el("br"),
          `• 빌드: ${b && b.status === "succeeded" ? `${b.id} (r${b.revision})` : "미완료 — Step 3에서 먼저 빌드하세요"}`
        )
      );
      sec.append(summary);

      if (state.publishError) {
        sec.append(el("div", { className: "pf-pub-err", text: state.publishError }));
      }

      if (state.publishResult) {
        const res = state.publishResult;
        const okBox = el("div", { className: "pf-pub-ok" },
          el("strong", { text: `릴리스 확정 완료 (${res.release.label})` }),
          el("br"),
          res.hubNotice
        );
        sec.append(okBox);

        const linkUrl = res.isolatedPreviewUrl || res.forgePreviewUrl;
        if (linkUrl) {
          const fullUrl = location.origin + linkUrl;
          sec.append(
            el("div", { className: "pf-link-box" },
              el("a", { href: linkUrl, target: "_blank", rel: "noopener noreferrer", text: fullUrl }),
              el("button", {
                type: "button",
                text: "복사",
                onClick: () => navigator.clipboard?.writeText(fullUrl)
              })
            )
          );
        }
        if (res.submission) {
          sec.append(
            el("div", { className: "pf-pub-box" },
              el("h4", { text: `PlayHub 심사 제출 ID: ${res.submission.id.slice(0, 8)}…` }),
              el("div", { style: "font-size:12px;color:#aebed2;" },
                `상태: ${res.submission.status} · 패키지 검증: ${res.submission.packageValidation} · 공개 상태: ${res.submission.publicationStatus}`
              )
            )
          );
        }
      }

      const actionLabel = state.visibility === "public"
        ? (isHubMode ? "불변 릴리스 생성 및 PlayHub 심사 제출" : "불변 릴리스 생성 (로컬)")
        : "불변 릴리스 생성 및 테스트 링크 발급";

      sec.append(
        el("button", {
          type: "button",
          className: "pf-pub-primary",
          disabled: state.publishing || !b || b.status !== "succeeded",
          text: state.publishing ? "배포 처리 중…" : actionLabel,
          onClick: executePublish
        })
      );
      return sec;
    }

    function renderHistory() {
      const sec = el("div", { className: "pf-pub-section" });
      const activeId = (ctx.getSelected ? ctx.getSelected() : ctx.selected).activeReleaseId;
      if (!state.releases.length) {
        sec.append(el("p", { text: "아직 생성된 배포 릴리스가 없습니다." }));
      }
      for (const r of state.releases) {
        const isActive = r.id === activeId;
        const mode = r.deployProfile?.deployMode || "singleplay";
        const item = el("div", { className: "pf-release-item" },
          el("div", { className: "pf-release-head" },
            el("strong", { text: `${r.label} (r${r.revision})` }),
            el("span", { className: "pf-badge" + (isActive ? " live" : ""), text: isActive ? "활성 릴리스" : mode.toUpperCase() })
          ),
          el("small", { style: "color:#9ab0c7;font-size:11px;", text: `${r.id} · ${r.createdAt || ""}` }),
          el("div", { className: "pf-chip-list" },
            r.previewUrl ? el("a", { href: ctx.forgePath(r.previewUrl), target: "_blank", text: "미리보기 ↗" }) : null,
            r.downloadUrl ? el("a", { href: ctx.forgePath(r.downloadUrl), download: `PlayForge-Web-${r.buildId || r.id}.zip`, text: "ZIP 다운로드" }) : null,
            !isActive
              ? el("button", {
                  type: "button",
                  text: "이 릴리스로 롤백",
                  onClick: async () => {
                    await ctx.refresh();
                    const latest = ctx.getSelected ? ctx.getSelected() : ctx.selected;
                    await ctx.api(`/api/platform/projects/${latest.project.id}/releases/${r.id}/rollback`, { baseRevision: latest.revision });
                    await ctx.refresh();
                    ctx.status?.(`릴리스 ${r.label}로 롤백했습니다.`);
                    await loadMeta();
                  }
                })
              : null
          )
        );
        sec.append(item);
      }

      if (state.submissions.length) {
        sec.append(el("h4", { style: "margin:8px 0 0;font-size:13px;", text: "PlayHub 심사 · 게시 현황" }));
        for (const s of state.submissions.slice(0, 5)) {
          sec.append(
            el("div", { className: "pf-release-item" },
              el("div", { className: "pf-release-head" },
                el("strong", { text: s.title }),
                el("span", { className: "pf-badge" + (s.publicationStatus === "published" ? " live" : ""), text: `${s.status} / ${s.publicationStatus}` })
              ),
              el("small", { style: "color:#9ab0c7;font-size:11px;", text: `패키지: ${s.packageValidation} · 슬러그: ${s.publishedGameId || s.gameSlug || "—"}` })
            )
          );
        }
      }
      return sec;
    }

    function render() {
      bodyEl.replaceChildren();
      const tabs = el("div", { className: "pf-pub-tabs" },
        el("button", {
          type: "button",
          className: "pf-pub-tab" + (state.tab === "wizard" ? " active" : ""),
          text: "새 배포 마법사",
          onClick: () => { state.tab = "wizard"; render(); }
        }),
        el("button", {
          type: "button",
          className: "pf-pub-tab" + (state.tab === "history" ? " active" : ""),
          text: `릴리스 · 롤백 (${state.releases.length})`,
          onClick: () => { state.tab = "history"; render(); }
        })
      );
      bodyEl.append(tabs);

      if (state.tab === "history") {
        bodyEl.append(renderHistory());
        return;
      }

      const stepLabels = ["1. 모드·비용", "2. 메타정보", "3. 빌드·검증", "4. 릴리스·제출"];
      const stepsBar = el("div", { className: "pf-pub-steps" },
        stepLabels.map((lbl, idx) => {
          const n = idx + 1;
          const cls = "pf-pub-step" + (state.step === n ? " active" : (n < state.step ? " done" : ""));
          return el("div", { className: cls, text: lbl, onClick: () => { state.step = n; render(); } });
        })
      );
      bodyEl.append(stepsBar);

      if (state.step === 1) bodyEl.append(renderStep1());
      else if (state.step === 2) bodyEl.append(renderStep2());
      else if (state.step === 3) bodyEl.append(renderStep3());
      else bodyEl.append(renderStep4());

      const nav = el("div", { className: "pf-pub-nav" },
        state.step > 1
          ? el("button", { type: "button", text: "← 이전", onClick: () => { state.step--; render(); } })
          : el("span"),
        state.step < 4
          ? el("button", { type: "button", className: "pf-pub-primary", text: "다음 →", onClick: () => { state.step++; render(); } })
          : el("span")
      );
      bodyEl.append(nav);
    }

    render();
    void loadMeta();
  }

  root.PlayForgePublish = { open, estimatePoints, slugify };
})(window);
