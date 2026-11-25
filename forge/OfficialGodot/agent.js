(() => {
  'use strict';

  const el = id => document.getElementById('agent-' + id);
  const ui = Object.fromEntries([
    'app', 'sidebar', 'sidebar-backdrop', 'sidebar-toggle', 'sidebar-new', 'session-list',
    'new', 'status-dot', 'running-label', 'header-title',
    'tab-chat', 'tab-claude-console', 'settings',
    'chat-view', 'claude-console-view',
    'console-status-pill', 'console-model', 'console-connect', 'console-clear',
    'console-output', 'console-form', 'console-input', 'console-stop', 'console-run',
    'transcript', 'studio-changes', 'studio-changes-toggle', 'context-count',
    'stage', 'context-drawer', 'context-label', 'context',
    'approval', 'approval-text', 'approve', 'decline', 'thinking',
    'status-bar', 'status', 'status-connect', 'queue-list',
    'form', 'image-list', 'prompt', 'attachment', 'images',
    'mode-trigger', 'mode-label', 'mode-menu',
    'model-trigger', 'model-label', 'effort-label', 'model-menu', 'model-list',
    'fast-toggle', 'fast-state', 'effort-trigger', 'effort-submenu',
    'queue-btn', 'stop', 'send',
    'config-overlay', 'settings-close', 'connected-badges', 'open-connect',
    'desktop-notifications', 'data-use', 'enter-sends', 'runtime-status', 'replay',
    'config-mcp-tools-section', 'mcp-dot', 'mcp-desc', 'mcp-badge', 'tools',
    'mcp-tools-count', 'mcp-tools-dirty', 'mcp-tools-reset', 'mcp-domains',
    'config-skills-section', 'skills', 'config-close', 'config-save',
    'connect-dialog', 'provider-list', 'provider-global-status', 'provider-refresh', 'connect-close',
  ].map(id => [id, el(id)]));

  const forgeBase = (location.pathname.match(/^(.*?)\/(?:OfficialGodot|Frontends)(?:\/|$)/)?.[1]) || '';
  const forgePath = route => typeof route === 'string' && route.startsWith('/') && forgeBase && !route.startsWith(forgeBase + '/') ? forgeBase + route : route;
  const csrfHeaders = () => {
    let token = window.__playforgeCsrfToken || '';
    if (!token && window.parent !== window) {
      try {
        if (window.parent.location.origin === location.origin) token = window.parent.__playforgeCsrfToken || '';
      } catch {}
    }
    return token ? { 'X-CSRF-Token': token } : {};
  };
  const api = forgePath('/api/agent-chat');
  const storageKey = 'playforge.agent.conversations.v1';
  const embedded = window.parent !== window;
  const preferencesKey = `playforge.agent.preferences.v2.${embedded ? 'editor' : 'standalone'}`;

  const PROVIDER_LOGO_SVGS = {
    openai: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>',
    claude: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" aria-hidden="true"><path d="M8 1.8v4.1M8 10.1v4.1M1.8 8h4.1M10.1 8h4.1M3.6 3.6l2.9 2.9M9.5 9.5l2.9 2.9M12.4 3.6 9.5 6.5M6.5 9.5 3.6 12.4"/></svg>',
    gemini: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1.2c.45 3.45 3.35 6.35 6.8 6.8-3.45.45-6.35 3.35-6.8 6.8-.45-3.45-3.35-6.35-6.8-6.8 3.45-.45 6.35-3.35 6.8-6.8z"/></svg>',
    zai: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="3"/><path d="M5.2 5.3h5.6l-5.6 5.4h5.6"/></svg>',
    ollama: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 6.2V3.8a1.2 1.2 0 0 1 2.4 0v1.4h1.2V3.8a1.2 1.2 0 0 1 2.4 0v2.4a3.6 3.6 0 0 1 1.5 2.9v2.4a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2V9.1A3.6 3.6 0 0 1 5 6.2z"/><circle cx="6.4" cy="9.2" r="0.7" fill="currentColor"/><circle cx="9.6" cy="9.2" r="0.7" fill="currentColor"/></svg>',
  };

  const PROVIDER_META = [
    {
      id: 'chatgpt-connect',
      name: 'ChatGPT',
      logo: 'openai',
      badge: 'CHATGPT (OAUTH)',
      authTag: 'OAuth',
      section: 'Browser Login (OAuth)',
      kind: 'oauth',
      popupLogin: true,
      hint: 'Sign in with your ChatGPT account in your browser.',
    },
    {
      id: 'claude-connect',
      name: 'Claude',
      logo: 'claude',
      badge: 'CLAUDE (OAUTH)',
      authTag: 'OAuth',
      section: 'Browser Login (OAuth)',
      kind: 'oauth',
      supportsCodePaste: true,
      hint: 'Sign in with your Claude account in your browser.',
    },
    {
      id: 'gemini-connect',
      name: 'Gemini',
      logo: 'gemini',
      badge: 'GEMINI (OAUTH)',
      authTag: 'OAuth',
      section: 'Browser Login (OAuth)',
      kind: 'oauth',
      hint: 'Sign in with your Google account in your browser.',
    },
    {
      id: 'claude-console',
      name: 'Claude API',
      logo: 'claude',
      badge: 'CLAUDE API',
      authTag: 'API Key',
      section: 'API Key Connections',
      kind: 'api-key',
      keyPlaceholder: 'sk-ant-...',
      consoleUrl: 'https://console.anthropic.com/settings/keys',
      consoleLabel: 'Open Anthropic Console ↗',
      supportsWorkspace: true,
    },
    {
      id: 'openai-api',
      name: 'OpenAI API',
      logo: 'openai',
      badge: 'OPENAI API',
      authTag: 'API Key',
      section: 'API Key Connections',
      kind: 'api-key',
      keyPlaceholder: 'sk-...',
      consoleUrl: 'https://platform.openai.com/api-keys',
      consoleLabel: 'Open OpenAI API Keys ↗',
    },
    {
      id: 'gemini',
      name: 'Gemini API',
      logo: 'gemini',
      badge: 'GEMINI API',
      authTag: 'API Key',
      section: 'API Key Connections',
      kind: 'api-key',
      keyPlaceholder: 'AIza...',
      consoleUrl: 'https://aistudio.google.com/apikey',
      consoleLabel: 'Open Google AI Studio ↗',
    },
    {
      id: 'zai-coding-plan',
      name: 'z.ai Coding Plan API',
      logo: 'zai',
      badge: 'Z.AI API',
      authTag: 'API Key',
      section: 'API Key Connections',
      kind: 'api-key',
      keyPlaceholder: 'id.secret',
      consoleUrl: 'https://z.ai',
      consoleLabel: 'Open z.ai Console ↗',
    },
    {
      id: 'ollama',
      name: 'Ollama',
      logo: 'ollama',
      badge: 'OLLAMA (LOCAL)',
      authTag: 'Local',
      section: 'Local Runtime',
      kind: 'local',
      hint: 'Connect to a local Ollama service on loopback.',
    },
  ];
  const providerMetaMap = new Map(PROVIDER_META.map(item => [item.id, item]));
  const providerIds = new Set(PROVIDER_META.map(item => item.id));
  const OAUTH_PROVIDER_IDS = ['chatgpt-connect', 'claude-connect', 'gemini-connect'];
  const ALLOWED_OAUTH_HOSTS = new Set([
    'auth.openai.com', 'chatgpt.com',
    'claude.com', 'claude.ai', 'console.anthropic.com', 'platform.claude.com',
    'accounts.google.com',
  ]);

  const MCP_CORE_TOOL_COUNT = 5;
  const MCP_DOMAINS = [
    { id: 'animation', label: 'animation', count: 2, tools: ['animation_create', 'animation_manage'] },
    { id: 'api', label: 'api', count: 1, tools: ['api_manage'] },
    { id: 'audio', label: 'audio', count: 1, tools: ['audio_manage'] },
    { id: 'autoload', label: 'autoload', count: 1, tools: ['autoload_manage'] },
    { id: 'batch', label: 'batch', count: 1, tools: ['batch_execute'] },
    { id: 'camera', label: 'camera', count: 1, tools: ['camera_manage'] },
    { id: 'client', label: 'client', count: 1, tools: ['client_manage'] },
    { id: 'csg', label: 'csg', count: 1, tools: ['csg_manage'] },
    { id: 'custom', label: 'custom', count: 1, tools: ['custom_manage'] },
    { id: 'editor', label: 'editor', count: 4, tools: ['editor_manage', 'editor_reload_plugin', 'editor_screenshot', 'logs_read'] },
    { id: 'filesystem', label: 'filesystem', count: 1, tools: ['filesystem_manage'] },
    { id: 'game', label: 'game', count: 1, tools: ['game_manage'] },
    { id: 'gridmap', label: 'gridmap', count: 1, tools: ['gridmap_manage'] },
    { id: 'input_map', label: 'input_map', count: 1, tools: ['input_map_manage'] },
    { id: 'material', label: 'material', count: 1, tools: ['material_manage'] },
    { id: 'navigation', label: 'navigation', count: 1, tools: ['navigation_manage'] },
    { id: 'node', label: 'node', count: 4, tools: ['node_create', 'node_find', 'node_manage', 'node_set_property'] },
    { id: 'particle', label: 'particle', count: 1, tools: ['particle_manage'] },
    { id: 'project', label: 'project', count: 2, tools: ['project_manage', 'project_run'] },
    { id: 'resource', label: 'resource', count: 1, tools: ['resource_manage'] },
    { id: 'scene', label: 'scene', count: 3, tools: ['scene_manage', 'scene_open', 'scene_save'] },
    { id: 'script', label: 'script', count: 4, tools: ['script_attach', 'script_create', 'script_manage', 'script_patch'] },
    { id: 'signal', label: 'signal', count: 1, tools: ['signal_manage'] },
    { id: 'testing', label: 'testing', count: 2, tools: ['test_manage', 'test_run'] },
    { id: 'theme', label: 'theme', count: 1, tools: ['theme_manage'] },
    { id: 'tilemap', label: 'tilemap', count: 1, tools: ['tilemap_manage'] },
    { id: 'tileset', label: 'tileset', count: 1, tools: ['tileset_manage'] },
    { id: 'ui', label: 'ui', count: 1, tools: ['ui_manage'] },
  ];
  const MCP_TOTAL_TOOL_COUNT = MCP_CORE_TOOL_COUNT + MCP_DOMAINS.reduce((sum, domain) => sum + domain.count, 0);

  const EFFORT_OPTIONS = [
    ['low', 'Low'],
    ['medium', 'Medium'],
    ['high', 'High'],
    ['xhigh', 'Extra High'],
    ['max', 'Max'],
  ];
  const EFFORT_LABELS = Object.fromEntries([
    ['none', 'None'],
    ['minimal', 'Minimal'],
    ['ultra', 'Ultra'],
    ...EFFORT_OPTIONS,
  ]);

  const MODE_LABELS = {
    review: 'Default',
    plan: 'Plan',
    auto: 'Auto',
  };

  const skillDefinitions = [
    [
      'scene-review',
      'scene-review',
      'Inspect visible Godot scene context, node hierarchies, and property relationships before proposing edits.',
      '씬 검토 요청은 제공된 문맥 안에서 구조와 문제를 설명하고 확인이 필요한 사실을 구분하세요.',
    ],
    [
      'godot-script',
      'godot-script',
      'Explain Godot 4 GDScript structure, signals, typed APIs, and short practical examples.',
      '스크립트 답변은 Godot 4 GDScript를 기준으로 구체적인 사용법과 짧은 예제를 설명하세요.',
    ],
    [
      'asset-workflow',
      'asset-workflow',
      'Guide importing, organizing, and placing asset packs into the active PlayForge Godot project.',
      '에셋 답변은 가져오기, 경로, 리소스 설정 단계로 안내하고 확인된 에셋만 언급하세요.',
    ],
  ];

  const toolDefinitions = [
    ['pf_workspace_apply', 'Scene editing (pf_workspace_apply)', 'Add Godot scene nodes or update node properties.'],
    ['pf_asset_pack_import', 'Asset pack import (pf_asset_pack_import)', 'Import a selected Asset Store pack into the active project.'],
    ['pf_asset_pack_status', 'Import status (pf_asset_pack_status)', 'Check progress of an active asset pack import.'],
  ];

  const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
  const maxImageBytes = 512 * 1024;
  const maxPromptLength = 16000;

  let preferences = loadPreferences();
  let selectedSkills = new Set(preferences.skills);
  let selectedTools = new Set(preferences.tools);
  let excludedMcpDomains = new Set(preferences.excludedMcpDomains);
  let enterSends = preferences.enterSends;
  let desktopNotifications = preferences.desktopNotifications;
  let improveService = preferences.improveService;
  let currentMode = 'review';
  let fastMode = false;

  const modelSelection = new Map();
  const effortSelection = new Map();

  let provider = 'chatgpt-connect';
  let providers = new Map();
  let busyProviderId = '';
  let expandedProviderId = '';
  let providerRowErrors = new Map();
  let refreshingProviders = false;
  let connectionVersion = 0;
  let clientsPoll;
  let authPoll;
  const authLinks = new Map();

  let sidebarOpen = false;
  let activeView = 'chat';
  let modelMenuOpen = false;
  let effortMenuOpen = false;
  let modeMenuOpen = false;
  let contextDrawerOpen = false;
  let configDraft = null;
  let consoleEntries = [
    {
      kind: 'system',
      text: 'Claude Console ready. Type a prompt or use /help, /status, /model <id>, /connect, /clear.',
    },
  ];
  let consoleRequest = null;
  let consoleSubmitting = false;

  let port;
  let host = {};
  let request;
  let submitting = false;
  let draftRevision = 0;
  let embeddedTurn;
  let pendingPrompt = '';
  let partial = '';
  let statusNotice = '';
  let statusIsInfo = false;
  let statusNeedsConnect = false;
  let images = [];
  let queuedMessages = [];
  let workspace = loadWorkspace();

  function loadPreferences() {
    const allSkills = skillDefinitions.map(([id]) => id);
    const defaultTools = embedded ? toolDefinitions.map(([id]) => id) : [];
    const validDomains = new Set(MCP_DOMAINS.map(domain => domain.id));
    try {
      const saved = JSON.parse(localStorage.getItem(preferencesKey));
      if (saved && typeof saved === 'object') {
        return {
          skills: Array.isArray(saved.skills) ? allSkills.filter(id => saved.skills.includes(id)) : allSkills,
          tools: Array.isArray(saved.tools) ? defaultTools.filter(id => saved.tools.includes(id)) : defaultTools,
          excludedMcpDomains: Array.isArray(saved.excludedMcpDomains)
            ? saved.excludedMcpDomains.filter(id => validDomains.has(id))
            : [],
          enterSends: saved.enterSends !== false,
          desktopNotifications: saved.desktopNotifications === true,
          improveService: saved.improveService !== false,
        };
      }
    } catch {
      // Browser storage may be unavailable.
    }
    return {
      skills: allSkills,
      tools: defaultTools,
      excludedMcpDomains: [],
      enterSends: true,
      desktopNotifications: false,
      improveService: true,
    };
  }

  function savePreferences() {
    try {
      localStorage.setItem(preferencesKey, JSON.stringify({
        skills: [...selectedSkills],
        tools: [...selectedTools],
        excludedMcpDomains: [...excludedMcpDomains].sort(),
        enterSends,
        desktopNotifications,
        improveService,
      }));
    } catch {
      // Settings remain active for this session.
    }
  }

  function loadWorkspace() {
    if (!embedded) {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey));
        if (saved && Array.isArray(saved.sessions)) {
          const sessions = saved.sessions
            .filter(session => session && typeof session.id === 'string')
            .slice(0, 40)
            .map(session => ({
              id: session.id,
              title: String(session.title || '').slice(0, 100),
              updated: Number(session.updated) || Date.now(),
              messages: cleanMessages(session.messages),
            }));
          if (sessions.some(session => session.id === saved.active)) {
            return { sessions, active: saved.active };
          }
        }
      } catch {
        // Fallback to a clean session list.
      }
    }
    return { sessions: [], active: '' };
  }

  function saveWorkspace() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(workspace));
    } catch {
      setStatusNotice('Conversation is active in memory, but browser storage could not be saved.');
    }
  }

  function cleanMessages(value) {
    return Array.isArray(value)
      ? value
          .filter(message => message && ['user', 'assistant', 'system'].includes(message.role) && typeof message.content === 'string')
          .slice(-100)
          .map(message => ({ role: message.role, content: message.content.slice(0, 64000) }))
      : [];
  }

  function activeSession() {
    return workspace.sessions.find(session => session.id === workspace.active);
  }

  function isUntitled(title) {
    return !title || title === '새 대화' || title === 'New conversation' || title === 'NEW CONVERSATION';
  }

  function formatRelativeTime(timestamp) {
    if (!timestamp) return 'just now';
    const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (diffSec < 45) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  }

  function setStatusNotice(message, { info = false, needsConnect = false } = {}) {
    statusNotice = message || '';
    statusIsInfo = info;
    statusNeedsConnect = needsConnect;
    renderStatusBanner();
  }

  function command(value) {
    if (port) port.postMessage(value);
    else setStatusNotice('Waiting for Godot editor connection...', { info: true });
  }

  function startConversation() {
    if (busy()) return;
    if (embedded) return command({ type: 'new-session', draft: ui.prompt.value });
    const id = crypto.randomUUID();
    workspace.sessions.unshift({ id, title: '', updated: Date.now(), messages: [] });
    workspace.sessions = workspace.sessions.slice(0, 40);
    workspace.active = id;
    ui.prompt.value = '';
    autoSizePrompt();
    images = [];
    setStatusNotice('');
    saveWorkspace();
    render();
  }

  if (embedded) {
    addEventListener('message', function initialize(event) {
      if (event.source !== window.parent || event.origin !== location.origin ||
          event.data?.type !== 'playforge-agent:init' || event.ports.length !== 1) return;
      if (port) port.close();
      port = event.ports[0];
      port.onmessage = ({ data }) => {
        if (data?.type !== 'state' || !data.state || typeof data.state !== 'object') return;
        const switchedSession = host.sessionId !== data.state.sessionId;
        host = data.state;
        if (switchedSession) {
          ui.prompt.value = typeof host.draft === 'string' ? host.draft.slice(0, maxPromptLength) : '';
          autoSizePrompt();
          images = [];
          embeddedTurn = undefined;
        } else if (embeddedTurn) {
          if (host.busy) embeddedTurn.sawBusy = true;
          else if (embeddedTurn.sawBusy || (host.status && host.draft === embeddedTurn.prompt)) {
            if (draftRevision === embeddedTurn.revision && ui.prompt.value === '' && host.draft && typeof host.draft === 'string') {
              ui.prompt.value = host.draft.slice(0, maxPromptLength);
              autoSizePrompt();
            }
            embeddedTurn = undefined;
          }
        }
        render();
        flushQueueIfReady();
      };
      port.start();
      command({ type: 'ready' });
      render();
    });
  }

  function selectedProvider() {
    return providers.get(provider) ?? { id: provider, label: providerMetaMap.get(provider)?.name ?? provider };
  }

  function connectedProviders() {
    return PROVIDER_META
      .map(meta => ({ meta, row: providers.get(meta.id) }))
      .filter(({ row }) => row?.configured);
  }

  function currentModelFor(providerId) {
    const row = providers.get(providerId);
    if (!row) return '';
    return modelSelection.get(providerId) || row.model || row.default_model || row.models?.[0] || '';
  }

  function currentEffortsFor(providerId, model) {
    const row = providers.get(providerId);
    const reported = ['chatgpt-connect', 'claude-connect'].includes(providerId) ? row?.reasoning_efforts?.[model] : null;
    if (Array.isArray(reported) && reported.length) {
      return reported.map(id => [id, EFFORT_LABELS[id] || id]);
    }
    return EFFORT_OPTIONS;
  }

  function currentEffortValue(providerId, model) {
    const options = currentEffortsFor(providerId, model);
    const saved = effortSelection.get(`${providerId}:${model}`) || effortSelection.get(model);
    if (saved && options.some(([id]) => id === saved)) return saved;
    if (options.some(([id]) => id === 'high')) return 'high';
    return options[0]?.[0] || '';
  }

  function busy() {
    return submitting || (embedded ? Boolean(host.busy) : Boolean(request));
  }

  function autoSizePrompt() {
    ui.prompt.style.height = 'auto';
    ui.prompt.style.height = Math.min(ui.prompt.scrollHeight, 180) + 'px';
  }

  function setSidebar(open) {
    sidebarOpen = Boolean(open);
    ui.app.dataset.sidebar = sidebarOpen ? 'open' : 'closed';
    ui.sidebar.hidden = !sidebarOpen;
    ui['sidebar-toggle'].setAttribute('aria-expanded', String(sidebarOpen));
    ui['sidebar-toggle'].classList.toggle('is-active', sidebarOpen);
    ui.new.hidden = sidebarOpen;
    const isNarrow = window.matchMedia('(max-width: 680px)').matches;
    ui['sidebar-backdrop'].hidden = !(sidebarOpen && isNarrow);
    if (sidebarOpen) renderSidebar();
  }

  function closeAllPopovers() {
    modelMenuOpen = false;
    effortMenuOpen = false;
    modeMenuOpen = false;
    ui['model-menu'].hidden = true;
    ui['effort-submenu'].hidden = true;
    ui['mode-menu'].hidden = true;
    ui['model-trigger'].setAttribute('aria-expanded', 'false');
    ui['effort-trigger'].setAttribute('aria-expanded', 'false');
    ui['mode-trigger'].setAttribute('aria-expanded', 'false');
  }

  function toggleModelMenu(force) {
    const next = force !== undefined ? force : !modelMenuOpen;
    closeAllPopovers();
    modelMenuOpen = next;
    ui['model-menu'].hidden = !modelMenuOpen;
    ui['model-trigger'].setAttribute('aria-expanded', String(modelMenuOpen));
    if (modelMenuOpen) renderModelPopover();
  }

  function toggleEffortSubmenu(force) {
    if (!modelMenuOpen) return;
    effortMenuOpen = force !== undefined ? force : !effortMenuOpen;
    ui['effort-submenu'].hidden = !effortMenuOpen;
    ui['effort-trigger'].setAttribute('aria-expanded', String(effortMenuOpen));
    if (effortMenuOpen) {
      renderEffortSubmenu();
      requestAnimationFrame(() => {
        const rect = ui['effort-submenu'].getBoundingClientRect();
        ui['effort-submenu'].classList.toggle('is-flipped', rect.right > window.innerWidth - 10);
      });
    }
  }

  function toggleModeMenu(force) {
    const next = force !== undefined ? force : !modeMenuOpen;
    closeAllPopovers();
    modeMenuOpen = next;
    ui['mode-menu'].hidden = !modeMenuOpen;
    ui['mode-trigger'].setAttribute('aria-expanded', String(modeMenuOpen));
  }

  function switchMainView(nextView) {
    activeView = nextView === 'claude-console' ? 'claude-console' : 'chat';
    const isConsole = activeView === 'claude-console';
    closeAllPopovers();
    ui['tab-chat'].classList.toggle('is-selected', !isConsole);
    ui['tab-chat'].setAttribute('aria-selected', String(!isConsole));
    ui['tab-claude-console'].classList.toggle('is-selected', isConsole);
    ui['tab-claude-console'].setAttribute('aria-selected', String(isConsole));
    ui['chat-view'].hidden = isConsole;
    ui['claude-console-view'].hidden = !isConsole;
    renderHeader();
    if (isConsole) {
      renderClaudeConsole();
      ui['console-input']?.focus();
    }
  }

  function activeClaudeProviderId() {
    if (providers.get('claude-connect')?.configured) return 'claude-connect';
    if (providers.get('claude-console')?.configured) return 'claude-console';
    return 'claude-connect';
  }

  function consoleBusy() {
    return consoleSubmitting || Boolean(consoleRequest);
  }

  function renderHeader() {
    const isConsole = activeView === 'claude-console';
    const working = isConsole ? consoleBusy() : busy();
    const active = isConsole ? (providers.get(activeClaudeProviderId()) ?? {}) : selectedProvider();
    const connected = connectedProviders();
    const isConnected = isConsole
      ? Boolean(providers.get('claude-connect')?.configured || providers.get('claude-console')?.configured)
      : Boolean(active?.configured || connected.length > 0);
    const isPending = isConsole
      ? providers.get('claude-connect')?.auth === 'pending'
      : (active?.auth === 'pending' || [...providers.values()].some(row => row?.auth === 'pending'));

    ui['status-dot'].className = 'status-dot ' + (
      working ? 'is-connected'
        : isPending ? 'is-pending'
          : isConnected ? 'is-connected'
            : 'is-disconnected'
    );

    const session = embedded
      ? (host.sessions ?? []).find(item => item.id === host.sessionId)
      : activeSession();
    const title = session?.title || '';

    ui['running-label'].hidden = !working;
    if (isConsole) {
      ui['header-title'].textContent = working ? 'CLAUDE CONSOLE' : 'CLAUDE CONSOLE';
      ui['header-title'].classList.remove('is-titled');
    } else if (isUntitled(title)) {
      ui['header-title'].textContent = working ? '' : 'NEW CONVERSATION';
      ui['header-title'].classList.remove('is-titled');
    } else {
      ui['header-title'].textContent = title;
      ui['header-title'].classList.add('is-titled');
    }

    ui.new.disabled = working;
    ui['sidebar-new'].disabled = working;
  }

  function renderSidebar() {
    const sessions = embedded ? (host.sessions ?? []) : workspace.sessions;
    const activeId = embedded ? host.sessionId : workspace.active;
    const working = busy();
    ui['session-list'].replaceChildren();

    for (const session of sessions.filter(item => item && typeof item.id === 'string').slice(0, 60)) {
      const isCurrent = session.id === activeId;
      const item = document.createElement('div');
      item.className = 'session-item' + (isCurrent ? ' is-active' : '');
      item.setAttribute('role', 'listitem');

      const selectBtn = document.createElement('button');
      selectBtn.type = 'button';
      selectBtn.className = 'session-select';
      selectBtn.disabled = working && !isCurrent;
      selectBtn.setAttribute('aria-current', isCurrent ? 'true' : 'false');

      const titleRow = document.createElement('div');
      titleRow.className = 'session-title-row';

      if (isCurrent && working) {
        const dot = document.createElement('span');
        dot.className = 'session-dot is-running';
        titleRow.append(dot);
      } else if (!isCurrent && ((session.messages?.length ?? 0) > 0 || !isUntitled(session.title))) {
        const dot = document.createElement('span');
        dot.className = 'session-dot is-activity';
        titleRow.append(dot);
      }

      const titleSpan = document.createElement('span');
      titleSpan.className = 'session-title';
      titleSpan.textContent = isUntitled(session.title) ? 'New conversation' : session.title;
      titleRow.append(titleSpan);

      const timeSpan = document.createElement('span');
      timeSpan.className = 'session-time';
      timeSpan.textContent = formatRelativeTime(session.updated);

      selectBtn.append(titleRow, timeSpan);
      selectBtn.onclick = () => {
        if (working && !isCurrent) return;
        if (embedded) command({ type: 'select-session', id: session.id, draft: ui.prompt.value });
        else {
          workspace.active = session.id;
          saveWorkspace();
          render();
        }
        if (window.matchMedia('(max-width: 680px)').matches) setSidebar(false);
      };

      const actions = document.createElement('div');
      actions.className = 'session-actions';

      const renameBtn = document.createElement('button');
      renameBtn.type = 'button';
      renameBtn.className = 'session-action-btn';
      renameBtn.title = 'Rename';
      renameBtn.setAttribute('aria-label', `Rename ${titleSpan.textContent}`);
      renameBtn.textContent = '✎';
      renameBtn.disabled = working;
      renameBtn.onclick = event => {
        event.stopPropagation();
        const nextTitle = window.prompt('Conversation title', isUntitled(session.title) ? '' : session.title)?.trim().slice(0, 100);
        if (!nextTitle || nextTitle === session.title) return;
        if (embedded) command({ type: 'rename-session', id: session.id, title: nextTitle, draft: ui.prompt.value });
        else {
          session.title = nextTitle;
          saveWorkspace();
          render();
        }
      };

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'session-action-btn is-danger';
      deleteBtn.title = 'Delete';
      deleteBtn.setAttribute('aria-label', `Delete ${titleSpan.textContent}`);
      deleteBtn.textContent = '×';
      deleteBtn.disabled = working;
      deleteBtn.onclick = event => {
        event.stopPropagation();
        if (!window.confirm(`Delete “${titleSpan.textContent}”?`)) return;
        if (embedded) command({ type: 'delete-session', id: session.id, draft: ui.prompt.value });
        else {
          workspace.sessions = workspace.sessions.filter(entry => entry.id !== session.id);
          if (workspace.active === session.id) {
            workspace.active = workspace.sessions[0]?.id ?? '';
            if (!workspace.active) return startConversation();
          }
          saveWorkspace();
          render();
        }
      };

      actions.append(renameBtn, deleteBtn);
      item.append(selectBtn, actions);
      ui['session-list'].append(item);
    }
  }

  function appendMessage(message) {
    const row = document.createElement('article');
    row.className = 'message ' + message.role;
    row.dataset.role = message.role;
    const body = document.createElement('div');
    body.className = 'message-body';
    body.textContent = message.content;
    row.append(body);
    ui.transcript.append(row);
  }

  function renderTranscript() {
    const messages = embedded ? cleanMessages(host.messages) : activeSession()?.messages ?? [];
    const scrollArea = ui.transcript.parentElement;
    const follow = scrollArea.scrollHeight - scrollArea.scrollTop - scrollArea.clientHeight < 80;
    ui.transcript.replaceChildren();
    for (const message of messages) appendMessage(message);
    if (!embedded && pendingPrompt) appendMessage({ role: 'user', content: pendingPrompt });
    if (!embedded && partial) appendMessage({ role: 'assistant', content: partial });
    if (embedded && typeof host.partial === 'string' && host.partial) {
      appendMessage({ role: 'assistant', content: host.partial });
    }
    const showThinking = busy() && !partial && !(embedded && host.partial) && !(embedded && host.proposal);
    ui.thinking.hidden = !showThinking;
    if (follow) scrollArea.scrollTop = scrollArea.scrollHeight;
  }

  function renderContext() {
    const items = Array.isArray(host.context) ? host.context : host.context?.selection;
    const count = Array.isArray(items) ? items.length : 0;
    ui['studio-changes'].hidden = !embedded;
    if (!embedded) return;

    if (ui['context-label']) ui['context-label'].textContent = host.context?.scene || 'Scene context';
    ui['context-count'].textContent = `${count} ${count === 1 ? 'change' : 'changes'}`;
    ui.stage.disabled = busy() || !port || host.context?.canStage === false;
    ui['context-drawer'].hidden = !contextDrawerOpen;
    ui['studio-changes-toggle'].setAttribute('aria-expanded', String(contextDrawerOpen));

    ui.context.replaceChildren();
    if (!count) {
      const empty = document.createElement('span');
      empty.textContent = typeof host.context === 'string' ? host.context : 'No scene nodes attached';
      ui.context.append(empty);
      return;
    }
    for (const item of items.slice(0, 20)) {
      const path = typeof item === 'string' ? item : item?.path ?? item?.name;
      if (typeof path !== 'string' || !path) continue;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.textContent = path + ' ×';
      chip.setAttribute('aria-label', `Remove ${path} from scene context`);
      chip.disabled = busy();
      chip.onclick = () => command({ type: 'remove-selection', path });
      ui.context.append(chip);
    }
  }

  function renderTurnControls() {
    const working = busy();
    const active = selectedProvider();
    const connected = connectedProviders();
    const model = currentModelFor(provider);
    const effort = currentEffortValue(provider, model);

    ui['mode-label'].textContent = MODE_LABELS[currentMode] || 'Default';
    for (const item of ui['mode-menu'].querySelectorAll('[data-mode]')) {
      item.setAttribute('aria-checked', String(item.dataset.mode === currentMode));
    }
    ui['mode-trigger'].disabled = working;

    const ring = ui['model-trigger'].querySelector('.model-ring');
    if (ring) {
      ring.className = 'model-ring ' + (active?.configured ? 'is-connected' : 'is-disconnected');
    }
    if (active?.configured && model) {
      ui['model-label'].textContent = model;
    } else if (connected.length > 0) {
      ui['model-label'].textContent = currentModelFor(connected[0].meta.id) || connected[0].meta.name;
    } else {
      ui['model-label'].textContent = 'Connect AI';
    }

    const showEffortInPill = Boolean(effort) && (['chatgpt-connect', 'claude-connect'].includes(provider) || connected.length === 0);
    ui['effort-label'].hidden = !showEffortInPill;
    if (showEffortInPill) ui['effort-label'].textContent = EFFORT_LABELS[effort] || effort;

    ui['model-trigger'].disabled = working;
    ui.images.disabled = working;
    ui.attachment.classList.toggle('is-disabled', working);

    ui.form.classList.toggle('is-running', working);
    ui.prompt.placeholder = working ? 'Queue a message...' : 'Ask anything...';

    const hasText = Boolean(ui.prompt.value.trim());
    ui.send.hidden = working;
    ui.send.disabled = working || !hasText || (embedded && !port);
    ui.stop.hidden = !working;
    ui['queue-btn'].hidden = !working;
    ui['queue-btn'].disabled = !hasText;

    if (modelMenuOpen) renderModelPopover();
  }

  function renderModelPopover() {
    const connected = connectedProviders();
    const activeModel = currentModelFor(provider);
    ui['model-list'].replaceChildren();

    if (!connected.length) {
      const cta = document.createElement('button');
      cta.type = 'button';
      cta.className = 'menu-option';
      cta.innerHTML = '<span class="menu-check"></span><span class="menu-option-label menu-option-cta">Connect an AI provider...</span>';
      cta.onclick = () => {
        closeAllPopovers();
        openConnectDialog();
      };
      ui['model-list'].append(cta);
    } else {
      const showGroups = connected.length > 1;
      for (const { meta, row } of connected) {
        const names = [...new Set([...(row.models ?? []), row.model, row.default_model, modelSelection.get(meta.id)].filter(Boolean))];
        if (!names.length) names.push(row.model || meta.name);
        if (showGroups) {
          const group = document.createElement('div');
          group.className = 'menu-group-label';
          group.textContent = meta.name;
          ui['model-list'].append(group);
        }
        for (const name of names) {
          const isSelected = meta.id === provider && name === activeModel;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'menu-option' + (isSelected ? ' is-selected' : '');
          btn.setAttribute('role', 'menuitemradio');
          btn.setAttribute('aria-checked', String(isSelected));
          btn.dataset.provider = meta.id;
          btn.dataset.model = name;

          const check = document.createElement('span');
          check.className = 'menu-check';
          check.textContent = '✓';

          const label = document.createElement('span');
          label.className = 'menu-option-label';
          label.textContent = name;

          btn.append(check, label);
          btn.onclick = () => {
            provider = meta.id;
            modelSelection.set(provider, name);
            if (provider !== 'chatgpt-connect') images = [];
            closeAllPopovers();
            render();
          };
          ui['model-list'].append(btn);
        }
      }
    }

    ui['fast-toggle'].setAttribute('aria-checked', String(fastMode));
    ui['fast-state'].textContent = fastMode ? 'On' : 'Off';
    ui['fast-state'].classList.toggle('is-on', fastMode);

    if (effortMenuOpen) renderEffortSubmenu();
  }

  function renderEffortSubmenu() {
    const model = currentModelFor(provider);
    const options = currentEffortsFor(provider, model);
    const selected = currentEffortValue(provider, model);
    ui['effort-submenu'].replaceChildren();

    for (const [id, label] of options) {
      const isSelected = id === selected;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'menu-option' + (isSelected ? ' is-selected' : '');
      btn.setAttribute('role', 'menuitemradio');
      btn.setAttribute('aria-checked', String(isSelected));
      btn.dataset.effort = id;

      const check = document.createElement('span');
      check.className = 'menu-check';
      check.textContent = '✓';

      const text = document.createElement('span');
      text.className = 'menu-option-label';
      text.textContent = label;

      btn.append(check, text);
      btn.onclick = () => {
        effortSelection.set(`${provider}:${model}`, id);
        effortSelection.set(model, id);
        closeAllPopovers();
        renderTurnControls();
      };
      ui['effort-submenu'].append(btn);
    }
  }

  function renderImages() {
    ui['image-list'].replaceChildren();
    for (const file of images) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.textContent = file.name + ' ×';
      chip.setAttribute('aria-label', `Remove attachment ${file.name}`);
      chip.disabled = busy();
      chip.onclick = () => {
        images = images.filter(image => image !== file);
        renderImages();
      };
      ui['image-list'].append(chip);
    }
    ui['image-list'].hidden = !images.length;
  }

  function renderQueue() {
    ui['queue-list'].replaceChildren();
    ui['queue-list'].hidden = !queuedMessages.length;
    for (const [index, text] of queuedMessages.entries()) {
      const row = document.createElement('div');
      row.className = 'queue-item';

      const label = document.createElement('span');
      label.className = 'queue-item-text';
      label.textContent = `Queued: ${text}`;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'queue-item-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Remove queued message');
      remove.onclick = () => {
        queuedMessages.splice(index, 1);
        renderQueue();
      };

      row.append(label, remove);
      ui['queue-list'].append(row);
    }
  }

  function renderStatusBanner() {
    const hostStatus = embedded ? String(host.status || '') : '';
    const text = hostStatus || statusNotice;
    const isEmbeddedInfo = Boolean(hostStatus) && (Boolean(host.busy) || /^(에이전트가 작업 중|응답을 받는 중|편집을 적용할지)/.test(hostStatus));
    ui.status.textContent = text;
    ui['status-bar'].hidden = !text;
    ui['status-bar'].classList.toggle('is-info', statusIsInfo || isEmbeddedInfo);
    ui['status-connect'].hidden = !statusNeedsConnect;
  }

  function render() {
    const working = busy();
    const proposal = host.proposal;
    ui['runtime-status'].textContent = embedded
      ? (port ? 'Godot Editor Connected' : 'Connecting to Godot Editor...')
      : 'Standalone web runtime';
    ui.replay.hidden = !embedded;
    ui.replay.disabled = working || !port || host.replayAvailable === false;
    ui.approval.hidden = !(embedded && proposal);
    if (proposal) {
      ui['approval-text'].textContent = typeof proposal === 'string'
        ? proposal
        : String(proposal.text ?? proposal.description ?? '');
    }

    renderHeader();
    if (sidebarOpen) renderSidebar();
    renderContext();
    renderTranscript();
    renderTurnControls();
    renderImages();
    renderQueue();
    renderStatusBanner();
    renderMcpDialogStatus();
    if (activeView === 'claude-console') renderClaudeConsole();
    if (!ui['config-overlay'].hidden) renderConfigConnectedBadges();
    if (ui['connect-dialog'].open) renderConnectDialog();
  }

  /* ==================== Config Overlay (Image 2) ==================== */

  function renderConfigConnectedBadges() {
    const connected = connectedProviders();
    ui['connected-badges'].replaceChildren();
    if (!connected.length) {
      const pill = document.createElement('span');
      pill.className = 'connected-pill is-none';
      pill.textContent = 'NO AI CONNECTED';
      ui['connected-badges'].append(pill);
      return;
    }
    for (const { meta } of connected) {
      const pill = document.createElement('span');
      pill.className = 'connected-pill';
      pill.textContent = meta.badge;
      ui['connected-badges'].append(pill);
    }
  }

  function renderConfigSkills(draftSkills) {
    ui.skills.replaceChildren();
    for (const [id, name, description] of skillDefinitions) {
      const enabled = draftSkills.has(id);
      const card = document.createElement('label');
      card.className = 'skill-card';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = id;
      checkbox.checked = enabled;

      const copy = document.createElement('div');
      copy.className = 'skill-copy';

      const titleRow = document.createElement('div');
      titleRow.className = 'skill-title-row';

      const title = document.createElement('strong');
      title.textContent = name;

      const badge = document.createElement('span');
      badge.className = 'skill-badge';
      badge.textContent = 'GLOBAL SKILL';

      titleRow.append(title, badge);

      const desc = document.createElement('p');
      desc.className = 'skill-desc';
      desc.textContent = description;

      const status = document.createElement('span');
      status.className = 'skill-status';
      status.textContent = enabled ? 'Enabled · Effective On' : 'Disabled · Effective Off';

      checkbox.onchange = () => {
        if (checkbox.checked) draftSkills.add(id);
        else draftSkills.delete(id);
        status.textContent = checkbox.checked ? 'Enabled · Effective On' : 'Disabled · Effective Off';
      };

      copy.append(titleRow, desc, status);
      card.append(checkbox, copy);
      ui.skills.append(card);
    }
  }

  function enabledMcpToolCount(excludedSet) {
    let count = MCP_CORE_TOOL_COUNT;
    for (const domain of MCP_DOMAINS) {
      if (!excludedSet.has(domain.id)) count += domain.count;
    }
    return count;
  }

  function sameDomainSet(a, b) {
    if (a.size !== b.size) return false;
    for (const item of a) if (!b.has(item)) return false;
    return true;
  }

  function updateMcpToolsHeader(draftExcluded, draftTools = configDraft?.tools ?? selectedTools) {
    ui['mcp-tools-count'].textContent = `${enabledMcpToolCount(draftExcluded)} / ${MCP_TOTAL_TOOL_COUNT}`;
    const domainsSame = sameDomainSet(draftExcluded, excludedMcpDomains);
    const toolsSame = sameDomainSet(draftTools, selectedTools);
    ui['mcp-tools-dirty'].hidden = domainsSame && toolsSame;
    const defaultToolCount = embedded ? toolDefinitions.length : 0;
    ui['mcp-tools-reset'].disabled = draftExcluded.size === 0 && draftTools.size === defaultToolCount;
  }

  function renderConfigMcpTools(draftExcluded, draftTools = configDraft?.tools ?? selectedTools) {
    ui['mcp-domains'].replaceChildren();
    for (const domain of MCP_DOMAINS) {
      const checked = !draftExcluded.has(domain.id);
      const row = document.createElement('label');
      row.className = 'mcp-domain-row';
      row.title = domain.tools.join(', ');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = domain.id;
      checkbox.checked = checked;
      checkbox.onchange = () => {
        if (checkbox.checked) draftExcluded.delete(domain.id);
        else draftExcluded.add(domain.id);
        updateMcpToolsHeader(draftExcluded, draftTools);
      };

      const copy = document.createElement('div');
      copy.className = 'mcp-domain-copy';

      const name = document.createElement('strong');
      name.textContent = domain.label;

      const toolsText = document.createElement('small');
      toolsText.textContent = domain.tools.join(', ');

      copy.append(name, toolsText);

      const count = document.createElement('span');
      count.className = 'mcp-tool-count';
      count.textContent = `${domain.count} ${domain.count === 1 ? 'tool' : 'tools'}`;

      row.append(checkbox, copy, count);
      ui['mcp-domains'].append(row);
    }
    updateMcpToolsHeader(draftExcluded, draftTools);
  }

  function renderMcpDialogStatus() {
    const connected = embedded && Boolean(port);
    ui['mcp-dot'].className = 'status-dot ' + (connected ? 'is-connected' : 'is-disconnected');
    ui['mcp-desc'].textContent = connected
      ? 'Connected to Godot Web Editor bridge'
      : 'Standalone mode — open inside Godot Web Editor for scene & asset editing';
    ui['mcp-badge'].textContent = connected ? 'Connected' : 'Standalone';
  }

  function buildToolsList(draftTools = configDraft?.tools ?? selectedTools, draftExcluded = configDraft?.excludedMcpDomains ?? excludedMcpDomains) {
    ui.tools.replaceChildren();
    if (!embedded) {
      const note = document.createElement('p');
      note.className = 'tools-empty-note';
      note.textContent = 'Godot scene & asset editing tools are available when PlayForge AI Agent is opened inside the Godot editor.';
      ui.tools.append(note);
      return;
    }
    for (const [id, name, detail] of toolDefinitions) {
      const card = document.createElement('label');
      card.className = 'tool-card';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = id;
      checkbox.checked = draftTools.has(id);
      checkbox.onchange = () => {
        if (checkbox.checked) draftTools.add(id);
        else draftTools.delete(id);
        updateMcpToolsHeader(draftExcluded, draftTools);
      };

      const copy = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = name;
      const desc = document.createElement('small');
      desc.textContent = detail;
      copy.append(title, desc);
      card.append(checkbox, copy);
      ui.tools.append(card);
    }
  }

  function openConfig({ scrollToSkills = false, scrollToMcpTools = false } = {}) {
    closeAllPopovers();
    configDraft = {
      skills: new Set(selectedSkills),
      tools: new Set(selectedTools),
      excludedMcpDomains: new Set(excludedMcpDomains),
      enterSends,
      desktopNotifications,
      improveService,
    };
    ui['desktop-notifications'].checked = configDraft.desktopNotifications;
    ui['data-use'].checked = configDraft.improveService;
    ui['enter-sends'].checked = configDraft.enterSends;
    renderConfigConnectedBadges();
    renderMcpDialogStatus();
    buildToolsList(configDraft.tools, configDraft.excludedMcpDomains);
    renderConfigMcpTools(configDraft.excludedMcpDomains, configDraft.tools);
    renderConfigSkills(configDraft.skills);
    ui['config-overlay'].hidden = false;
    refreshProviders(false);
    if (scrollToMcpTools) {
      requestAnimationFrame(() => ui['config-mcp-tools-section'].scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } else if (scrollToSkills) {
      requestAnimationFrame(() => ui['config-skills-section'].scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }

  function closeConfig() {
    configDraft = null;
    ui['config-overlay'].hidden = true;
  }

  function saveConfig() {
    if (configDraft) {
      selectedSkills = new Set(configDraft.skills);
      selectedTools = new Set(configDraft.tools);
      excludedMcpDomains = new Set(configDraft.excludedMcpDomains);
      enterSends = ui['enter-sends'].checked;
      desktopNotifications = ui['desktop-notifications'].checked;
      improveService = ui['data-use'].checked;
      if (desktopNotifications && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
      savePreferences();
    }
    closeConfig();
  }

  /* ==================== Connect AI Modal (Image 3) ==================== */

  function updateClientsPoll() {
    if (ui['connect-dialog'].open) {
      if (!clientsPoll) clientsPoll = setInterval(() => { if (!authPoll) refreshProviders(false); }, 4000);
    } else {
      clearInterval(clientsPoll);
      clientsPoll = undefined;
    }
  }

  function openConnectDialog() {
    closeAllPopovers();
    ui['provider-global-status'].hidden = true;
    ui['provider-global-status'].textContent = '';
    renderConnectDialog();
    if (!ui['connect-dialog'].open) ui['connect-dialog'].showModal();
    updateClientsPoll();
    refreshProviders(false);
  }

  function renderConnectDialog() {
    ui['provider-list'].replaceChildren();
    let currentSection = '';

    for (const meta of PROVIDER_META) {
      if (meta.section && meta.section !== currentSection) {
        currentSection = meta.section;
        const heading = document.createElement('div');
        heading.className = 'provider-section-label';
        heading.textContent = currentSection;
        ui['provider-list'].append(heading);
      }
      const row = providers.get(meta.id) ?? { id: meta.id, auth: 'disconnected', configured: false };
      const isConnected = row.configured || row.auth === 'connected';
      const isPending = row.auth === 'pending';
      const isBusy = busyProviderId === meta.id;
      const isExpanded = expandedProviderId === meta.id && !isConnected;
      const rowError = providerRowErrors.get(meta.id) || '';
      const rowAuthLink = authLinks.get(meta.id) || '';

      const card = document.createElement('div');
      card.className = 'provider-card';
      card.dataset.providerCard = meta.id;
      card.setAttribute('role', 'listitem');

      const mainRow = document.createElement('div');
      mainRow.className = 'provider-row-main';

      const identity = document.createElement('div');
      identity.className = 'provider-identity';

      const dot = document.createElement('span');
      dot.className = 'status-dot ' + (
        isConnected ? 'is-connected' : isPending ? 'is-pending' : 'is-disconnected'
      );
      dot.setAttribute('aria-hidden', 'true');

      const logoEl = document.createElement('span');
      logoEl.className = 'provider-logo';
      logoEl.dataset.logo = meta.logo || 'openai';
      logoEl.setAttribute('aria-hidden', 'true');
      logoEl.innerHTML = PROVIDER_LOGO_SVGS[meta.logo] || PROVIDER_LOGO_SVGS.openai;

      const nameEl = document.createElement('span');
      nameEl.className = 'provider-name';
      nameEl.textContent = meta.name;

      identity.append(dot, logoEl, nameEl);

      const controls = document.createElement('div');
      controls.className = 'provider-controls';

      if (isConnected) {
        const tag = document.createElement('span');
        tag.className = 'provider-auth-tag';
        tag.textContent = meta.authTag;
        if (row.email) tag.title = row.email;
        controls.append(tag);
      } else if (isPending) {
        const tag = document.createElement('span');
        tag.className = 'provider-auth-tag';
        tag.textContent = 'Browser login...';
        controls.append(tag);
      } else if (meta.id === 'ollama' && row.available) {
        const tag = document.createElement('span');
        tag.className = 'provider-auth-tag';
        tag.textContent = 'Detected';
        controls.append(tag);
      }

      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'provider-btn';
      actionBtn.dataset.providerAction = meta.id;
      actionBtn.disabled = Boolean(busyProviderId);

      if (isBusy) {
        actionBtn.textContent = isConnected ? 'Disconnecting...' : 'Connecting...';
      } else if (isConnected) {
        actionBtn.textContent = 'Disconnect';
        actionBtn.onclick = () => changeConnection(meta.id, true);
      } else if (isPending) {
        actionBtn.textContent = 'Cancel';
        actionBtn.onclick = () => changeConnection(meta.id, true);
      } else {
        actionBtn.textContent = 'Connect';
        actionBtn.onclick = () => {
          providerRowErrors.delete(meta.id);
          if (meta.kind === 'oauth') {
            changeConnection(meta.id, false);
          } else {
            expandedProviderId = expandedProviderId === meta.id ? '' : meta.id;
            renderConnectDialog();
          }
        };
      }

      controls.append(actionBtn);
      mainRow.append(identity, controls);
      card.append(mainRow);

      // Browser OAuth pending status, fallback link, and optional manual code paste
      if (meta.kind === 'oauth' && isPending) {
        const note = document.createElement('div');
        note.className = 'provider-row-note';
        const copy = document.createElement('span');
        copy.textContent = `Complete ${meta.name} sign-in in your browser to finish connecting.`;
        note.append(copy);
        if (rowAuthLink) {
          const link = document.createElement('a');
          link.className = 'provider-browser-link';
          link.href = rowAuthLink;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = 'Open browser login ↗';
          note.append(link);
        }
        card.append(note);

        if (meta.supportsCodePaste) {
          const codeForm = document.createElement('form');
          codeForm.className = 'provider-code-form';
          const codeInput = document.createElement('input');
          codeInput.type = 'text';
          codeInput.name = 'code';
          codeInput.autocomplete = 'off';
          codeInput.spellcheck = false;
          codeInput.placeholder = 'Paste authorization code if prompted';
          const codeBtn = document.createElement('button');
          codeBtn.type = 'submit';
          codeBtn.className = 'btn-primary';
          codeBtn.textContent = 'Submit code';
          codeBtn.disabled = Boolean(busyProviderId);
          codeForm.append(codeInput, codeBtn);
          codeForm.onsubmit = event => {
            event.preventDefault();
            const code = codeInput.value.trim();
            if (code) changeConnection(meta.id, false, { code });
          };
          card.append(codeForm);
        }
      }

      // Inline drawer for API Key / Local Ollama (no dropdown hiding!)
      if (isExpanded) {
        const panel = document.createElement('form');
        panel.className = 'provider-inline-panel';

        if (meta.kind === 'api-key') {
          const top = document.createElement('div');
          top.className = 'provider-inline-top';
          const hint = document.createElement('span');
          hint.className = 'provider-inline-hint';
          hint.textContent = `Enter your ${meta.name} API key to connect.`;
          const link = document.createElement('a');
          link.className = 'provider-browser-link';
          link.href = meta.consoleUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = meta.consoleLabel;
          top.append(hint, link);
          panel.append(top);

          const keyField = document.createElement('div');
          keyField.className = 'provider-field';
          const keyLabel = document.createElement('label');
          keyLabel.textContent = 'API Key';
          const keyInput = document.createElement('input');
          keyInput.type = 'password';
          keyInput.name = 'api_key';
          keyInput.autocomplete = 'off';
          keyInput.spellcheck = false;
          keyInput.placeholder = meta.keyPlaceholder;
          keyField.append(keyLabel, keyInput);
          panel.append(keyField);

          let workspaceInput = null;
          if (meta.supportsWorkspace) {
            const wsField = document.createElement('div');
            wsField.className = 'provider-field';
            const wsLabel = document.createElement('label');
            wsLabel.textContent = 'Workspace ID (optional)';
            workspaceInput = document.createElement('input');
            workspaceInput.type = 'text';
            workspaceInput.name = 'workspace';
            workspaceInput.autocomplete = 'off';
            workspaceInput.spellcheck = false;
            workspaceInput.placeholder = 'wrkspc_...';
            wsField.append(wsLabel, workspaceInput);
            panel.append(wsField);
          }

          const modelField = document.createElement('div');
          modelField.className = 'provider-field';
          const modelLabel = document.createElement('label');
          modelLabel.textContent = 'Default model (optional)';
          const modelInput = document.createElement('input');
          modelInput.type = 'text';
          modelInput.name = 'model';
          modelInput.autocomplete = 'off';
          modelInput.spellcheck = false;
          modelInput.value = row.model || '';
          modelInput.placeholder = row.model || 'Model ID';
          modelField.append(modelLabel, modelInput);
          panel.append(modelField);

          const actions = document.createElement('div');
          actions.className = 'provider-inline-actions';
          const cancelBtn = document.createElement('button');
          cancelBtn.type = 'button';
          cancelBtn.className = 'btn-secondary';
          cancelBtn.textContent = 'Cancel';
          cancelBtn.onclick = () => {
            expandedProviderId = '';
            renderConnectDialog();
          };
          const submitBtn = document.createElement('button');
          submitBtn.type = 'submit';
          submitBtn.className = 'btn-primary';
          submitBtn.textContent = 'Save & Connect';
          submitBtn.disabled = Boolean(busyProviderId);
          actions.append(cancelBtn, submitBtn);
          panel.append(actions);

          panel.onsubmit = event => {
            event.preventDefault();
            changeConnection(meta.id, false, {
              api_key: keyInput.value.trim(),
              model: modelInput.value.trim(),
              ...(workspaceInput?.value.trim() ? { workspace: workspaceInput.value.trim() } : {}),
            });
          };
        } else if (meta.kind === 'local') {
          const urlField = document.createElement('div');
          urlField.className = 'provider-field';
          const urlLabel = document.createElement('label');
          urlLabel.textContent = 'Ollama URL';
          const urlInput = document.createElement('input');
          urlInput.type = 'url';
          urlInput.name = 'url';
          urlInput.value = row.url || 'http://127.0.0.1:11434';
          urlInput.placeholder = 'http://127.0.0.1:11434';
          urlField.append(urlLabel, urlInput);
          panel.append(urlField);

          const modelField = document.createElement('div');
          modelField.className = 'provider-field';
          const modelLabel = document.createElement('label');
          modelLabel.textContent = 'Model name';
          const modelInput = document.createElement('input');
          modelInput.type = 'text';
          modelInput.name = 'model';
          modelInput.value = row.model || row.models?.[0] || '';
          modelInput.placeholder = 'e.g. qwen3:4b';
          modelField.append(modelLabel, modelInput);
          panel.append(modelField);

          if (Array.isArray(row.models) && row.models.length) {
            const chips = document.createElement('div');
            chips.className = 'provider-model-chips';
            for (const installedModel of row.models.slice(0, 12)) {
              const chip = document.createElement('button');
              chip.type = 'button';
              chip.className = 'provider-model-chip' + (installedModel === modelInput.value ? ' is-active' : '');
              chip.textContent = installedModel;
              chip.onclick = () => {
                modelInput.value = installedModel;
                for (const other of chips.children) other.classList.remove('is-active');
                chip.classList.add('is-active');
              };
              chips.append(chip);
            }
            panel.append(chips);
          }

          const actions = document.createElement('div');
          actions.className = 'provider-inline-actions';
          const cancelBtn = document.createElement('button');
          cancelBtn.type = 'button';
          cancelBtn.className = 'btn-secondary';
          cancelBtn.textContent = 'Cancel';
          cancelBtn.onclick = () => {
            expandedProviderId = '';
            renderConnectDialog();
          };
          const submitBtn = document.createElement('button');
          submitBtn.type = 'submit';
          submitBtn.className = 'btn-primary';
          submitBtn.textContent = 'Connect Ollama';
          submitBtn.disabled = Boolean(busyProviderId);
          actions.append(cancelBtn, submitBtn);
          panel.append(actions);

          panel.onsubmit = event => {
            event.preventDefault();
            changeConnection(meta.id, false, {
              url: urlInput.value.trim(),
              model: modelInput.value.trim(),
            });
          };
        }

        card.append(panel);
      }

      if (rowError) {
        const err = document.createElement('div');
        err.className = 'provider-row-note is-error';
        err.textContent = rowError;
        card.append(err);
      }

      ui['provider-list'].append(card);
    }

    ui['provider-refresh'].disabled = Boolean(busyProviderId) || refreshingProviders;
  }

  /* ==================== Backend Provider API & OAuth ==================== */

  async function requestJson(endpoint, body) {
    const response = await fetch(endpoint, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(25000),
      ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json', ...csrfHeaders() }, body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not reach the AI provider service.');
    return result;
  }

  function readAuthLink(value) {
    try {
      const url = new URL(value);
      if (url.protocol === 'https:' && !url.username && !url.password && !url.port &&
          ALLOWED_OAUTH_HOSTS.has(url.hostname)) return url.href;
    } catch {
      // Discard invalid login URLs.
    }
    return '';
  }

  function reserveLoginPopup() {
    if (!window.BroadcastChannel) return null;
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    let channel;
    try {
      channel = new BroadcastChannel('playforge-chatgpt-login:' + nonce);
      window.open(forgePath('/OfficialGodot/chatgpt-login.html#' + nonce), '_blank', 'noopener');
    } catch {
      channel?.close();
      return null;
    }
    let result;
    let ready = false;
    const expiry = setTimeout(() => channel.close(), 30000);
    channel.onmessage = ({ data }) => {
      if (data?.type === 'ready') {
        ready = true;
        if (result) channel.postMessage(result);
      } else if (data?.type === 'received') {
        clearTimeout(expiry);
        channel.close();
      }
    };
    return value => {
      result = value;
      if (ready) channel.postMessage(result);
    };
  }

  function pickPreferredProvider() {
    const current = providers.get(provider);
    if (current?.configured) return;
    const firstConnected = connectedProviders()[0];
    if (firstConnected) provider = firstConnected.meta.id;
  }

  function applyProviderStatus(result, preferredProviderId = '', connectTargetId = '') {
    if (!Array.isArray(result.providers)) throw new Error('Could not read provider status.');
    const wasPending = new Set(OAUTH_PROVIDER_IDS.filter(id => providers.get(id)?.auth === 'pending'));
    providers = new Map(result.providers.filter(row => providerIds.has(row?.id)).map(row => [row.id, row]));

    if (result.connect_url && connectTargetId) {
      const safe = readAuthLink(result.connect_url);
      if (safe) authLinks.set(connectTargetId, safe);
    }

    let anyPending = false;
    for (const id of OAUTH_PROVIDER_IDS) {
      const row = providers.get(id);
      if (row?.auth === 'pending') {
        anyPending = true;
      } else {
        authLinks.delete(id);
        if (wasPending.has(id) && row?.configured) {
          provider = id;
          providerRowErrors.delete(id);
          setStatusNotice('');
        }
      }
    }

    if (!anyPending) {
      clearInterval(authPoll);
      authPoll = undefined;
    } else if (!authPoll) {
      authPoll = setInterval(() => refreshProviders(false), 2000);
    }

    if (preferredProviderId && providers.get(preferredProviderId)?.configured) {
      provider = preferredProviderId;
    } else {
      pickPreferredProvider();
    }
  }

  async function refreshProviders(clearErrors = false) {
    if (busyProviderId || refreshingProviders) return;
    refreshingProviders = true;
    const version = connectionVersion;
    if (ui['connect-dialog'].open) ui['provider-refresh'].disabled = true;
    let error;
    try {
      const result = await requestJson(api + '/providers');
      if (version === connectionVersion) {
        if (clearErrors) providerRowErrors.clear();
        applyProviderStatus(result);
      }
    } catch (failure) {
      error = failure.message;
    } finally {
      refreshingProviders = false;
      if (version === connectionVersion) {
        if (error && ui['connect-dialog'].open) {
          ui['provider-global-status'].textContent = error;
          ui['provider-global-status'].hidden = false;
        }
        render();
      }
    }
  }

  async function changeConnection(targetProvider, disconnect = false, credentials = {}) {
    if (busyProviderId) return;
    connectionVersion += 1;
    providerRowErrors.delete(targetProvider);
    ui['provider-global-status'].hidden = true;

    const currentRow = providers.get(targetProvider);
    const meta = providerMetaMap.get(targetProvider);
    const popup = meta?.popupLogin && !disconnect && !currentRow?.configured
      ? reserveLoginPopup()
      : null;

    const body = { provider: targetProvider };
    if (!disconnect) {
      if (credentials.model) body.model = credentials.model;
      if (credentials.api_key) body.api_key = credentials.api_key;
      if (credentials.code) body.code = credentials.code;
      if (targetProvider === 'ollama' && credentials.url !== undefined) body.url = credentials.url;
      if (targetProvider === 'claude-console' && credentials.workspace) body.workspace = credentials.workspace;
    }

    busyProviderId = targetProvider;
    renderConnectDialog();
    try {
      const result = await requestJson(api + '/providers/' + (disconnect ? 'disconnect' : 'connect'), body);
      applyProviderStatus(result, disconnect ? '' : targetProvider, disconnect ? '' : targetProvider);
      modelSelection.delete(targetProvider);
      if (!disconnect && providers.get(targetProvider)?.configured) {
        expandedProviderId = '';
        setStatusNotice('');
      }
      if (popup) {
        const targetLink = authLinks.get(targetProvider);
        if (targetLink) popup({ type: 'navigate', url: targetLink });
        else if (providers.get(targetProvider)?.configured) popup({ type: 'connected' });
        else popup({ type: 'failed', message: 'Check your ChatGPT connection status in PlayForge.' });
      }
    } catch (failure) {
      providerRowErrors.set(targetProvider, failure.message);
      popup?.({ type: 'failed', message: failure.message });
    } finally {
      busyProviderId = '';
      render();
    }
  }

  /* ==================== Chat Submission, Streaming & Queue ==================== */

  async function encodeImages() {
    if (provider !== 'chatgpt-connect') return [];
    return Promise.all(images.map(async file => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 32768) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
      }
      return { mime: file.type, data: btoa(binary) };
    }));
  }

  async function readStream(response) {
    const stream = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await stream.read();
        if (done) throw new Error('Response stream closed before completion.');
        buffer += value;
        if (buffer.length > 1024 * 1024) throw new Error('Response stream exceeded size limit.');
        for (let newline = buffer.indexOf('\n'); newline !== -1; newline = buffer.indexOf('\n')) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          const frame = JSON.parse(line);
          if (frame.type === 'delta' && typeof frame.text === 'string') {
            partial += frame.text;
            if (partial.length > 262144) throw new Error('Response exceeded maximum length.');
            renderTranscript();
          } else if (frame.type === 'final') {
            return frame.message;
          } else if (frame.type === 'error') {
            throw new Error(frame.error || 'Model response failed.');
          }
        }
      }
    } finally {
      await stream.cancel().catch(() => {});
    }
  }

  function notifyBackgroundComplete(summary) {
    if (!desktopNotifications || !document.hidden || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try {
        new Notification('PlayForge AI Agent', { body: summary.slice(0, 120) });
      } catch {
        // Ignore OS notification errors.
      }
    }
  }

  async function standaloneChat(payload) {
    const session = activeSession();
    if (!session) return;
    request = new AbortController();
    const signal = request.signal;
    pendingPrompt = payload.prompt;
    partial = '';
    setStatusNotice('');
    if (isUntitled(session.title)) {
      session.title = payload.prompt.split('\n', 1)[0].slice(0, 100);
      session.updated = Date.now();
    }
    render();
    try {
      const previous = [];
      let remaining = 128000;
      const encoder = new TextEncoder();
      for (const message of session.messages.slice(-32).reverse()) {
        remaining -= encoder.encode(JSON.stringify(message)).byteLength;
        if (remaining < 0) break;
        previous.unshift(message);
      }
      const { prompt, provider: turnProvider, model, reasoning_effort, service_tier, images: attachedImages } = payload;
      const skillGuidance = skillDefinitions.filter(([id]) => payload.skills.includes(id)).map(skill => skill[3]);
      const body = {
        provider: turnProvider,
        model,
        reasoning_effort,
        service_tier,
        images: attachedImages,
        stream: payload.streaming,
        messages: [
          {
            role: 'system',
            content: ['PlayForge의 독립 채팅입니다. 한국어로 답하고 씬을 직접 편집했다고 말하지 마세요.', ...skillGuidance].join(' '),
          },
          ...previous,
          { role: 'user', content: prompt },
        ],
      };
      const response = await fetch(api, {
        method: 'POST',
        redirect: 'error',
        signal,
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify(body),
      });
      const message = response.ok && response.headers.get('content-type')?.startsWith('application/x-ndjson')
        ? await readStream(response)
        : await response.json().then(data => {
            if (!response.ok) throw new Error(data.error || 'Could not reach the AI provider.');
            return data.message;
          });
      if (!message || typeof message.content !== 'string' || !message.content.trim()) {
        throw new Error('No text response received.');
      }
      session.messages = cleanMessages([
        ...session.messages,
        { role: 'user', content: prompt },
        { role: 'assistant', content: message.content },
      ]);
      session.updated = Date.now();
      images = [];
      saveWorkspace();
      notifyBackgroundComplete(message.content);
    } catch (error) {
      if (partial.trim()) {
        session.messages = cleanMessages([
          ...session.messages,
          { role: 'user', content: payload.prompt },
          { role: 'assistant', content: partial + (signal.aborted ? '\n\n[Generation stopped]' : '') },
        ]);
        session.updated = Date.now();
        saveWorkspace();
      }
      if (signal.aborted) {
        setStatusNotice('Generation stopped.', { info: true });
      } else {
        setStatusNotice(error.message, { needsConnect: !selectedProvider()?.configured });
      }
    } finally {
      request = null;
      pendingPrompt = '';
      partial = '';
      render();
    }
  }

  /* ==================== Claude Console Mode ==================== */

  function renderClaudeConsole() {
    const oauthRow = providers.get('claude-connect');
    const apiRow = providers.get('claude-console');
    const oauthConnected = Boolean(oauthRow?.configured);
    const apiConnected = Boolean(apiRow?.configured);
    const pending = oauthRow?.auth === 'pending';
    const isConnected = oauthConnected || apiConnected;

    ui['console-status-pill'].className = 'console-status-pill ' + (isConnected ? 'is-connected' : 'is-disconnected');
    ui['console-status-pill'].textContent = oauthConnected
      ? 'Connected · OAuth'
      : apiConnected
        ? 'Connected · API'
        : pending
          ? 'Browser sign-in...'
          : 'Disconnected';
    ui['console-connect'].textContent = isConnected ? 'Manage Claude' : 'Connect Claude';

    const working = consoleBusy();
    const hasInput = Boolean(ui['console-input'].value.trim());
    ui['console-stop'].hidden = !working;
    ui['console-run'].hidden = working;
    ui['console-run'].disabled = working || !hasInput;

    ui['console-output'].replaceChildren();
    for (const entry of consoleEntries) {
      const block = document.createElement('div');
      block.className = `console-entry is-${entry.kind}`;
      block.textContent = entry.text;
      ui['console-output'].append(block);
    }
    ui['console-output'].scrollTop = ui['console-output'].scrollHeight;
  }

  function appendConsoleEntry(kind, text) {
    const entry = { kind, text };
    consoleEntries.push(entry);
    if (consoleEntries.length > 120) consoleEntries = consoleEntries.slice(-120);
    renderClaudeConsole();
    return entry;
  }

  async function runClaudeConsolePrompt(rawInput) {
    const input = rawInput.trim();
    if (!input || consoleBusy()) return;
    appendConsoleEntry('command', `❯ ${input}`);

    if (input === '/clear') {
      consoleEntries = [{ kind: 'system', text: 'Console cleared.' }];
      renderClaudeConsole();
      return;
    }
    if (input === '/help') {
      appendConsoleEntry(
        'system',
        'Commands:\n  /help            Show Claude Console commands\n  /status          Check Claude OAuth / API connection status\n  /model <id>      Switch Claude model (e.g. claude-sonnet-5-5, claude-opus-5-5)\n  /connect         Open Connect AI settings\n  /clear           Clear console output',
      );
      return;
    }
    if (input === '/connect') {
      openConnectDialog();
      return;
    }
    if (input === '/status') {
      const oauthConnected = Boolean(providers.get('claude-connect')?.configured);
      const apiConnected = Boolean(providers.get('claude-console')?.configured);
      const model = ui['console-model'].value;
      appendConsoleEntry(
        'system',
        `Claude status: ${oauthConnected ? 'Connected via Browser OAuth' : apiConnected ? 'Connected via Claude API Key' : 'Disconnected'} · Model: ${model}`,
      );
      return;
    }
    if (input.startsWith('/model')) {
      const nextModel = input.slice(6).trim();
      if (!nextModel) {
        appendConsoleEntry('system', `Current Claude model: ${ui['console-model'].value}`);
        return;
      }
      if (![...ui['console-model'].options].some(opt => opt.value === nextModel)) {
        const option = document.createElement('option');
        option.value = nextModel;
        option.textContent = nextModel;
        ui['console-model'].append(option);
      }
      ui['console-model'].value = nextModel;
      appendConsoleEntry('system', `Switched Claude Console model to ${nextModel}.`);
      return;
    }

    const targetProvider = activeClaudeProviderId();
    const row = providers.get(targetProvider);
    if (!row?.configured) {
      appendConsoleEntry('error', 'Claude is not connected. Click "Connect Claude" or run /connect to sign in with Claude OAuth or a Claude API key.');
      return;
    }

    consoleSubmitting = true;
    consoleRequest = new AbortController();
    const signal = consoleRequest.signal;
    const responseEntry = appendConsoleEntry('response', 'Thinking...');
    renderHeader();

    try {
      const selectedModel = ui['console-model'].value || row.model || 'claude-sonnet-5-5';
      const streaming = row.streaming === true;
      const response = await fetch(api, {
        method: 'POST',
        redirect: 'error',
        signal,
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({
          provider: targetProvider,
          model: selectedModel,
          stream: streaming,
          messages: [
            { role: 'system', content: 'You are Claude Console inside PlayForge AI Agent. Provide concise, accurate answers.' },
            { role: 'user', content: input },
          ],
        }),
      });

      if (response.ok && response.headers.get('content-type')?.startsWith('application/x-ndjson')) {
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        let collected = '';
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += value;
            for (let nl = buffer.indexOf('\n'); nl !== -1; nl = buffer.indexOf('\n')) {
              const line = buffer.slice(0, nl);
              buffer = buffer.slice(nl + 1);
              if (!line) continue;
              const frame = JSON.parse(line);
              if (frame.type === 'delta' && typeof frame.text === 'string') {
                collected += frame.text;
                responseEntry.text = collected;
                renderClaudeConsole();
              } else if (frame.type === 'final' && frame.message?.content) {
                collected = frame.message.content;
                responseEntry.text = collected;
              } else if (frame.type === 'error') {
                throw new Error(frame.error || 'Claude Console request failed.');
              }
            }
          }
        } finally {
          await reader.cancel().catch(() => {});
        }
        if (!responseEntry.text || responseEntry.text === 'Thinking...') {
          responseEntry.text = '(No text output)';
        }
      } else {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Claude Console could not respond.');
        responseEntry.text = data.message?.content || '(No text output)';
      }
    } catch (error) {
      if (signal.aborted) {
        if (responseEntry.text === 'Thinking...') {
          responseEntry.kind = 'system';
          responseEntry.text = '[Stopped]';
        } else {
          responseEntry.text += '\n[Stopped]';
        }
      } else {
        responseEntry.kind = 'error';
        responseEntry.text = error.message;
      }
    } finally {
      consoleRequest = null;
      consoleSubmitting = false;
      renderClaudeConsole();
      renderHeader();
    }
  }

  function queueCurrentPrompt() {
    const prompt = ui.prompt.value.trim();
    if (!prompt) return;
    if (prompt.length > maxPromptLength) {
      setStatusNotice(`Message must be at most ${maxPromptLength} characters.`);
      return;
    }
    queuedMessages.push(prompt);
    ui.prompt.value = '';
    autoSizePrompt();
    renderQueue();
    renderTurnControls();
  }

  function flushQueueIfReady() {
    if (busy() || !queuedMessages.length) return;
    const next = queuedMessages.shift();
    renderQueue();
    dispatchPrompt(next);
  }

  async function dispatchPrompt(prompt) {
    if (!prompt || busy() || (embedded && !port)) return;
    if (prompt.length > maxPromptLength) {
      setStatusNotice(`Message must be at most ${maxPromptLength} characters.`);
      return;
    }
    if (!embedded && !selectedProvider()?.configured) {
      setStatusNotice('Connect an AI provider before sending a message.', { needsConnect: true });
      return;
    }

    submitting = true;
    renderTurnControls();
    try {
      const model = currentModelFor(provider) || undefined;
      const supportsEffort = ['chatgpt-connect', 'claude-connect'].includes(provider);
      const effort = supportsEffort ? currentEffortValue(provider, model) : '';
      const payload = {
        type: 'submit',
        prompt,
        provider,
        model,
        mode: currentMode === 'auto' ? 'apply' : currentMode || 'review',
        images: await encodeImages(),
        streaming: selectedProvider().streaming === true,
        skills: [...selectedSkills],
        tools: [...selectedTools],
        excluded_mcp_domains: [...excludedMcpDomains].sort(),
        ...(supportsEffort && effort ? { reasoning_effort: effort } : {}),
        ...(provider === 'chatgpt-connect' && fastMode ? { service_tier: 'fast' } : {}),
      };
      if (embedded) {
        embeddedTurn = { prompt, revision: draftRevision, sawBusy: false };
        command(payload);
        images = [];
      } else {
        await standaloneChat(payload);
      }
    } catch (error) {
      setStatusNotice(error.message);
    } finally {
      submitting = false;
      render();
      if (!embedded) flushQueueIfReady();
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (busy()) {
      queueCurrentPrompt();
      return;
    }
    const prompt = ui.prompt.value.trim();
    if (!prompt) return;
    if (!embedded && !selectedProvider()?.configured) {
      setStatusNotice('Connect an AI provider before sending a message.', { needsConnect: true });
      return;
    }
    ui.prompt.value = '';
    autoSizePrompt();
    dispatchPrompt(prompt);
  }

  /* ==================== Event Wiring ==================== */

  if (!embedded && !activeSession()) startConversation();

  ui['sidebar-toggle'].onclick = () => setSidebar(!sidebarOpen);
  ui['sidebar-backdrop'].onclick = () => setSidebar(false);
  ui.new.onclick = startConversation;
  ui['sidebar-new'].onclick = startConversation;

  ui['tab-chat'].onclick = () => switchMainView('chat');
  ui['tab-claude-console'].onclick = () => switchMainView('claude-console');
  ui.settings.onclick = () => openConfig();

  ui['console-connect'].onclick = openConnectDialog;
  ui['console-clear'].onclick = () => {
    consoleEntries = [{ kind: 'system', text: 'Console cleared.' }];
    renderClaudeConsole();
  };
  ui['console-stop'].onclick = () => consoleRequest?.abort();
  ui['console-input'].addEventListener('input', () => {
    ui['console-input'].style.height = 'auto';
    ui['console-input'].style.height = Math.min(ui['console-input'].scrollHeight, 130) + 'px';
    renderClaudeConsole();
  });
  ui['console-input'].addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (!ui['console-run'].disabled) ui['console-form'].requestSubmit();
    }
  });
  ui['console-form'].addEventListener('submit', event => {
    event.preventDefault();
    const text = ui['console-input'].value.trim();
    if (!text || consoleBusy()) return;
    ui['console-input'].value = '';
    ui['console-input'].style.height = 'auto';
    runClaudeConsolePrompt(text);
  });

  ui['settings-close'].onclick = closeConfig;
  ui['config-close'].onclick = closeConfig;
  ui['config-save'].onclick = saveConfig;
  ui['mcp-tools-reset'].onclick = () => {
    if (!configDraft) return;
    configDraft.excludedMcpDomains.clear();
    configDraft.tools = new Set(embedded ? toolDefinitions.map(([id]) => id) : []);
    buildToolsList(configDraft.tools, configDraft.excludedMcpDomains);
    renderConfigMcpTools(configDraft.excludedMcpDomains, configDraft.tools);
  };
  ui['open-connect'].onclick = openConnectDialog;
  ui['status-connect'].onclick = openConnectDialog;

  ui['connect-close'].onclick = () => ui['connect-dialog'].close();
  ui['connect-dialog'].addEventListener('close', () => {
    expandedProviderId = '';
    updateClientsPoll();
  });
  ui['provider-refresh'].onclick = () => refreshProviders(true);

  ui['studio-changes-toggle'].onclick = () => {
    contextDrawerOpen = !contextDrawerOpen;
    renderContext();
  };
  ui.stage.onclick = () => command({ type: 'attach-selection' });
  ui.replay.onclick = () => command({ type: 'replay' });
  ui.approve.onclick = () => command({ type: 'approve', approved: true });
  ui.decline.onclick = () => command({ type: 'approve', approved: false });

  ui['mode-trigger'].onclick = event => {
    event.stopPropagation();
    toggleModeMenu();
  };
  for (const item of ui['mode-menu'].querySelectorAll('[data-mode]')) {
    item.onclick = () => {
      currentMode = item.dataset.mode;
      closeAllPopovers();
      renderTurnControls();
    };
  }

  ui['model-trigger'].onclick = event => {
    event.stopPropagation();
    toggleModelMenu();
  };
  ui['fast-toggle'].onclick = event => {
    event.stopPropagation();
    fastMode = !fastMode;
    renderModelPopover();
  };
  ui['effort-trigger'].onclick = event => {
    event.stopPropagation();
    toggleEffortSubmenu(true);
  };
  ui['effort-trigger'].addEventListener('mouseenter', () => {
    if (modelMenuOpen && !effortMenuOpen) toggleEffortSubmenu(true);
  });
  ui['model-list'].addEventListener('mouseenter', () => {
    if (effortMenuOpen) toggleEffortSubmenu(false);
  });
  ui['fast-toggle'].addEventListener('mouseenter', () => {
    if (effortMenuOpen) toggleEffortSubmenu(false);
  });

  document.addEventListener('click', event => {
    if (!event.target.closest('.popover-anchor')) closeAllPopovers();
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (modelMenuOpen || modeMenuOpen) {
      closeAllPopovers();
    } else if (!ui['config-overlay'].hidden && !ui['connect-dialog'].open) {
      closeConfig();
    }
  });

  ui.form.addEventListener('submit', handleSubmit);
  ui['queue-btn'].onclick = queueCurrentPrompt;
  ui.stop.onclick = () => {
    if (embedded) command({ type: 'cancel' });
    else request?.abort();
  };

  ui.prompt.addEventListener('input', () => {
    draftRevision += 1;
    autoSizePrompt();
    renderTurnControls();
  });

  ui.prompt.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing &&
        (enterSends || event.ctrlKey || event.metaKey)) {
      if (busy()) {
        if (ui.prompt.value.trim()) {
          event.preventDefault();
          queueCurrentPrompt();
        }
      } else if (!ui.send.disabled) {
        event.preventDefault();
        ui.form.requestSubmit();
      }
    }
  });

  ui.images.onchange = () => {
    for (const file of ui.images.files) {
      if (images.length >= 2) {
        setStatusNotice('You can attach up to two images at a time.', { info: true });
        break;
      }
      if (!imageTypes.has(file.type) || file.size < 1 || file.size > maxImageBytes) {
        setStatusNotice('Attach PNG, JPEG, or WebP images up to 512 KiB each.');
        continue;
      }
      images.push(file);
    }
    ui.images.value = '';
    renderImages();
  };

  window.addEventListener('resize', () => {
    if (sidebarOpen) {
      const isNarrow = window.matchMedia('(max-width: 680px)').matches;
      ui['sidebar-backdrop'].hidden = !isNarrow;
    }
  });

  render();
  refreshProviders(true);
})();
