/* HORIZON Interactive Web Runtime — Phase 2 (60-Node A.D.M.S. Graph + SVG Hotspots + Chain Highlighter + Dela Grante Mini-Systems) */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var SAVE_KEY_PREFIX = 'yuno_playhub_sys_slot_v2_';
  var AUTOSAVE_KEY = 'yuno_playhub_autosave_v2';
  var SYSTEM_SLOT_COUNT = 3;

  var engine = new globalThis.YunoEngine(globalThis.YUNO_DATA, { edition: 'pc98_8jewels' });

  // Restore autosave if present and valid
  try {
    var savedAuto = localStorage.getItem(AUTOSAVE_KEY);
    if (savedAuto) {
      engine.deserialize(savedAuto);
    }
  } catch (_err) {
    // Ignore corrupted storage and start fresh
  }

  // UI state
  var ui = {
    zoom: 1,
    fogMode: false,
    showTransfers: true,
    activeChainId: null,
    useItemOpen: false,
    armedItemId: null,
    selectedGraphNodeId: null,
    pendingJumpNodeId: null,
    feedback: null, // { type: 'info' | 'warn' | 'error', text: string }
    rePinReminderNodeId: null,
  };

  /* Hand-tuned 60-node A.D.M.S. Graph Layout (1520 x 760) */
  var NODE_POS = {
    // Zone 1: Prologue & Day 1 Hub (7 nodes)
    node_prologue_start:              { x: 76,   y: 78,  short: '프롤로그' },
    node_prologue_coast_cape:         { x: 76,   y: 158, short: '밤10시 해안' },
    node_prologue_triangle_encounter: { x: 76,   y: 238, short: '삼각산 조우⚡' },
    node_day1_hub:                    { x: 76,   y: 342, short: '1일차 거점★' },
    node_jewel1_drawer:               { x: 204,  y: 215, short: '보옥1 서랍' },
    node_day1_living_ayumi:           { x: 204,  y: 292, short: '거실 아유미' },
    node_school_day1_gate:            { x: 256,  y: 382, short: '학원 정문⚡' },

    // Zone 2 — Row 1: Mitsuki Route (7 nodes)
    node_mitsuki_call:                { x: 412,  y: 78,  short: '미츠키 저택★' },
    node_mitsuki_ryuzoji_ambush:      { x: 544,  y: 34,  short: '류조지구속🌀' },
    node_mitsuki_mansion_sneak:       { x: 544,  y: 92,  short: '저택 잠입⚡' },
    node_mitsuki_rope_lockout:        { x: 682,  y: 42,  short: '로프 함정🌀' },
    node_mitsuki_storehouse:          { x: 682,  y: 102, short: '토장 보옥2' },
    node_mitsuki_well_medal:          { x: 822,  y: 102, short: '우물 은메달' },
    node_mitsuki_end:                 { x: 960,  y: 102, short: '미츠키 END' },

    // Zone 2 — Row 2: Ayumi Route (8 nodes)
    node_ayumi_branch:                { x: 412,  y: 188, short: '아유미 사옥⚡' },
    node_ayumi_card_trap_whirlpool:   { x: 544,  y: 146, short: '카드 함정🌀' },
    node_ayumi_jewel3_mountain:       { x: 544,  y: 204, short: '삼각산 보옥3' },
    node_ayumi_desk_safe:             { x: 682,  y: 196, short: '책상·금고' },
    node_ayumi_toyotomi_confront:     { x: 816,  y: 196, short: '도요토미 대치⚡' },
    node_ayumi_toyotomi_bad:          { x: 954,  y: 156, short: '도요토미함정🌀' },
    node_ayumi_blue_card:             { x: 954,  y: 214, short: '블루카드' },
    node_ayumi_end:                   { x: 1076, y: 214, short: '아유미 END' },

    // Zone 2 — Row 3: Kaori Route (6 nodes)
    node_kaori_branch:                { x: 412,  y: 294, short: '카오리 취재★' },
    node_kaori_dossier_analysis:      { x: 548,  y: 294, short: '20P 서류' },
    node_kaori_gate_blue_card:        { x: 686,  y: 294, short: '보안문🔒' },
    node_kaori_alarm_whirlpool:       { x: 826,  y: 262, short: '보안경보🌀' },
    node_kaori_infiltrate_lab:        { x: 826,  y: 312, short: '보옥4·초념석' },
    node_kaori_end:                   { x: 974,  y: 312, short: '카오리 END' },

    // Zone 2 — Row 4: Mio Route (7 nodes)
    node_mio_branch:                  { x: 412,  y: 392, short: '미오 사당⚡' },
    node_mio_cave_yuki:               { x: 546,  y: 368, short: '동굴 보옥5' },
    node_mio_cave_solo:               { x: 546,  y: 422, short: '단독 동굴' },
    node_mio_cave_collapse_whirlpool: { x: 686,  y: 444, short: '낙반 조난🌀' },
    node_mio_cave_puzzle:             { x: 686,  y: 388, short: '유적 관문🔒' },
    node_mio_coast_revelation:        { x: 830,  y: 388, short: '400년 전승' },
    node_mio_end:                     { x: 974,  y: 388, short: '미오 END' },

    // Zone 2 — Row 5: Eriko Route (4 nodes)
    node_eriko_branch:                { x: 412,  y: 500, short: '에리코 보건실⚡' },
    node_eriko_dismissed_whirlpool:   { x: 576,  y: 536, short: '기억 간섭🌀' },
    node_eriko_infirmary_probe:       { x: 576,  y: 486, short: '차원 계측기' },
    node_eriko_end:                   { x: 750,  y: 486, short: '에리코 END' },

    // Zone 2 — Row 6: Kanna Route (7 nodes)
    node_town_drunk_reacquire:        { x: 356,  y: 604, short: '취객 수첩회수' },
    node_kanna_rooftop:               { x: 484,  y: 594, short: '칸나 옥상★' },
    node_kanna_solitude_home:         { x: 606,  y: 594, short: '칸나 거주지' },
    node_kanna_hospital_crisis:       { x: 726,  y: 594, short: '병원 발작⚡' },
    node_kanna_crisis_gate:           { x: 848,  y: 594, short: '칸나 위기🔒' },
    node_kanna_bad_no_stone:          { x: 982,  y: 636, short: '구명 실패🌀' },
    node_kanna_end:                   { x: 982,  y: 572, short: '칸나END·열쇠' },

    // Bottom Convergence Bridge (4 nodes)
    node_study_unlock:                { x: 86,   y: 510, short: '서재 개방🔒' },
    node_study_clock_puzzle:          { x: 186,  y: 632, short: '시계 보옥6' },
    node_study_kodai_manuscript:      { x: 356,  y: 696, short: '코다이 수기' },
    node_convergence_cave:            { x: 1045, y: 696, short: '삼각산 수렴⚡' },

    // Zone 3: Dela Grante Isekai Arc (10 nodes snaking upward)
    node_dg_arrival:                  { x: 1218, y: 676, short: '1장 국경보더' },
    node_dg_frontier_yuno:            { x: 1396, y: 676, short: '2장 유노탄생' },
    node_dg_desert_trek:              { x: 1396, y: 562, short: '3장 사막횡단🧩' },
    node_dg_oasis_sarah:              { x: 1218, y: 562, short: '4장 오아시스' },
    node_dg_quarry_escape:            { x: 1218, y: 448, short: '5장 채굴장' },
    node_dg_underground_1:            { x: 1396, y: 448, short: '6장 지하도1🧩' },
    node_dg_underground_capital:      { x: 1396, y: 334, short: '7장 제도·신제' },
    node_dg_underground_2:            { x: 1218, y: 334, short: '8장 지하도2🧩' },
    node_dg_sanctuary_climax:         { x: 1280, y: 210, short: '9장 성당결전' },
    node_true_end:                    { x: 1396, y: 92,  short: '트루 엔딩🌟' },
  };

  var CHAIN_SHORT_LABELS = {
    xfer_ayumi_to_kaori_blue_card: '블루카드 (아유미→카오리)',
    xfer_mitsuki_to_mio_silver_medal: '은메달 (미츠키→미오)',
    xfer_kaori_to_mio_chounenseki: '초념석 (카오리→미오)',
    xfer_kaori_to_kanna_chounenseki: '초념석 (카오리→칸나)',
    xfer_kanna_to_convergence_study_key: '서재열쇠 (칸나→1일차)',
  };

  var NODE_COLORS = {
    root:                   { fill: '#0ea5e9', stroke: '#bae6fd' },
    checkpoint_recommended: { fill: '#2563eb', stroke: '#93c5fd' },
    divergence:             { fill: '#0284c7', stroke: '#7dd3fc' },
    shining_point:          { fill: '#ca8a04', stroke: '#fef08a' },
    event:                  { fill: '#4f46e5', stroke: '#c7d2fe' },
    lock_gate:              { fill: '#c2410c', stroke: '#fdba74' },
    whirlpool:              { fill: '#be123c', stroke: '#fda4af' },
    route_end:              { fill: '#7c3aed', stroke: '#ddd6fe' },
    convergence:            { fill: '#0891b2', stroke: '#67e8f9' },
    isekai_stage:           { fill: '#6d28d9', stroke: '#f0abfc' },
    true_end:               { fill: '#d97706', stroke: '#fef9c3' },
  };

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'className') node.className = attrs[k];
        else if (k === 'disabled') node.disabled = Boolean(attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (text != null) node.textContent = text;
    return node;
  }

  function svgEl(tag, attrs, text) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        node.setAttribute(k, String(attrs[k]));
      });
    }
    if (text != null) node.textContent = text;
    return node;
  }

  function persistAutosave() {
    try {
      localStorage.setItem(AUTOSAVE_KEY, engine.serialize());
    } catch (_err) {
      // Ignore storage quota / private mode
    }
  }

  function setFeedback(type, text) {
    ui.feedback = text ? { type: type || 'info', text: text } : null;
  }

  function toggleChainHighlight(chainId) {
    ui.activeChainId = ui.activeChainId === chainId ? null : chainId;
    if (ui.activeChainId) {
      ui.showTransfers = true;
      var chk = document.getElementById('chk-show-transfers');
      if (chk) chk.checked = true;
    }
    renderAll();
  }

  /* ---------- Render Top HUD (with GAP-07 Modern vs Isekai Split) ---------- */
  function renderTopHud() {
    var gs = engine.globalState;
    var loc = engine.getCurrentLocation();
    var isIsekai = loc && loc.world === 'isekai_dela_grante';
    var brk = engine.getMapCompletionBreakdown();

    var worldPill = document.getElementById('pill-world');
    worldPill.textContent = isIsekai
      ? '이세계편 · 데라 그란트 (A.D.M.S. 봉인)'
      : '현세편 · 사카이마치';
    worldPill.className = 'stat-pill world-pill' + (isIsekai ? ' isekai' : '');

    document.getElementById('pill-jewels').textContent =
      '광점 보옥 ' + gs.collectedLightJewels.length + ' / 6';

    var heroineFlags = [
      'flag_global_route_mitsuki_clear',
      'flag_global_route_ayumi_clear',
      'flag_global_route_kaori_clear',
      'flag_global_route_mio_clear',
      'flag_global_route_eriko_clear',
      'flag_global_route_kanna_clear',
    ];
    var clearedCount = heroineFlags.filter(function (f) {
      return gs.globalFlags.indexOf(f) !== -1;
    }).length;
    document.getElementById('pill-routes').textContent = '현세 루트 ' + clearedCount + ' / 6';
    document.getElementById('pill-nodes').textContent =
      '현세 ' + brk.modern.percent + '% · 이세계 ' + brk.isekai.percent + '%';
    document.getElementById('badge-node-count').textContent = engine.data.nodes.length + ' Nodes';
    document.getElementById('select-edition').value = gs.edition;
  }

  /* ---------- Render Chain Quick Highlighter Bar ---------- */
  function renderChainBar() {
    var bar = document.getElementById('adms-chain-bar');
    bar.innerHTML = '';
    bar.appendChild(el('span', { className: 'chain-bar-label' }, '⚡ 교차 계승 체인 강조:'));

    engine.getInheritanceStatus().forEach(function (xf) {
      var active = ui.activeChainId === xf.id;
      var btn = el('button', {
        type: 'button',
        className: 'chain-pill ' + xf.status + (active ? ' active' : ''),
        title: xf.mechanism_ko,
      }, (xf.status === 'completed' ? '✓ ' : (xf.status === 'carried' ? '💎 ' : '')) + (CHAIN_SHORT_LABELS[xf.id] || xf.id));
      btn.addEventListener('click', function () {
        toggleChainHighlight(xf.id);
      });
      bar.appendChild(btn);
    });

    if (ui.activeChainId) {
      var clearBtn = el('button', { type: 'button', className: 'btn btn-xs btn-ghost' }, '강조 해제');
      clearBtn.addEventListener('click', function () {
        ui.activeChainId = null;
        renderAll();
      });
      bar.appendChild(clearBtn);
    }
  }

  /* ---------- Render Interactive 60-Node A.D.M.S. SVG Graph ---------- */
  function renderAdmsGraph() {
    var svg = document.getElementById('adms-svg');
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var gs = engine.globalState;
    var ls = engine.localState;
    var baseW = 1520;
    var baseH = 760;
    svg.style.width = Math.round(baseW * ui.zoom) + 'px';
    svg.style.height = Math.round(baseH * ui.zoom) + 'px';

    var activeChain = ui.activeChainId ? engine.getInheritanceChainVisual(ui.activeChainId) : null;
    var chainNodeSet = {};
    if (activeChain) {
      activeChain.highlightNodeIds.forEach(function (id) { chainNodeSet[id] = true; });
    }

    // Defs (arrowheads)
    var defs = svgEl('defs');
    var mkMarker = function (id, color) {
      var m = svgEl('marker', {
        id: id, viewBox: '0 0 10 10', refX: '8', refY: '5',
        markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse',
      });
      m.appendChild(svgEl('path', { d: 'M 0 1 L 10 5 L 0 9 z', fill: color }));
      return m;
    };
    defs.appendChild(mkMarker('arrow-normal', '#476496'));
    defs.appendChild(mkMarker('arrow-active', '#38e8ff'));
    defs.appendChild(mkMarker('arrow-xfer', '#fbbf24'));
    defs.appendChild(mkMarker('arrow-done', '#34d399'));
    defs.appendChild(mkMarker('arrow-trap', '#f43f5e'));
    defs.appendChild(mkMarker('arrow-chain-cyan', '#38e8ff'));
    defs.appendChild(mkMarker('arrow-chain-gold', '#fde047'));
    svg.appendChild(defs);

    // Zone divider bands
    var bandsGroup = svgEl('g', { opacity: '0.58' });
    bandsGroup.appendChild(svgEl('rect', { x: 14, y: 12, width: 300, height: 736, rx: 10, fill: 'rgba(14,165,233,0.04)', stroke: 'rgba(56,189,248,0.18)' }));
    bandsGroup.appendChild(svgEl('text', { x: 26, y: 30, fill: '#7dd3fc', 'font-size': '11.5', 'font-weight': '700' }, '프롤로그 · 1일차 거점 & 서재 수렴'));

    bandsGroup.appendChild(svgEl('rect', { x: 326, y: 12, width: 806, height: 736, rx: 10, fill: 'rgba(139,92,246,0.04)', stroke: 'rgba(167,139,250,0.18)' }));
    bandsGroup.appendChild(svgEl('text', { x: 340, y: 30, fill: '#c4b5fd', 'font-size': '11.5', 'font-weight': '700' }, '사카이마치 6대 병렬 분기 · 8대 소용돌이 함정 (현세편 50노드)'));

    bandsGroup.appendChild(svgEl('rect', { x: 1146, y: 12, width: 360, height: 736, rx: 10, fill: 'rgba(217,70,239,0.05)', stroke: 'rgba(244,114,182,0.22)' }));
    bandsGroup.appendChild(svgEl('text', { x: 1160, y: 30, fill: '#f5d0fe', 'font-size': '11.5', 'font-weight': '700' }, '데라 그란트 10장 (이세계편 · A.D.M.S. 봉인)'));
    svg.appendChild(bandsGroup);

    // 1. Standard graph edges
    var edgesGroup = svgEl('g', { fill: 'none' });
    engine.data.nodes.forEach(function (node) {
      var p1 = NODE_POS[node.id];
      if (!p1) return;
      (node.edges || []).forEach(function (edge) {
        var p2 = NODE_POS[edge.to];
        if (!p2) return;

        var edgeKey = node.id + '->' + edge.to;
        var discovered = gs.discoveredEdges.indexOf(edgeKey) !== -1;
        var fromKnown = gs.discoveredNodes.indexOf(node.id) !== -1;
        if (ui.fogMode && !fromKnown && !discovered) return;

        var dx = p2.x - p1.x;
        var dy = p2.y - p1.y;
        var dist = Math.hypot(dx, dy) || 1;
        var rPad = 16;
        var x1 = p1.x + (dx / dist) * rPad;
        var y1 = p1.y + (dy / dist) * rPad;
        var x2 = p2.x - (dx / dist) * (rPad + 3);
        var y2 = p2.y - (dy / dist) * (rPad + 3);

        var pathD;
        if (node.id === 'node_study_kodai_manuscript' && edge.to === 'node_convergence_cave') {
          pathD = 'M ' + x1 + ' ' + y1 + ' Q 700 738 ' + x2 + ' ' + y2;
        } else if (Math.abs(dy) > 22 && Math.abs(dx) > 36) {
          var cx = (x1 + x2) / 2;
          pathD = 'M ' + x1 + ' ' + y1 + ' C ' + cx + ' ' + y1 + ', ' + cx + ' ' + y2 + ', ' + x2 + ' ' + y2;
        } else {
          pathD = 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2;
        }

        var stroke = discovered ? '#38e8ff' : '#354c78';
        var marker = discovered ? 'url(#arrow-active)' : 'url(#arrow-normal)';
        var width = discovered ? 2.1 : 1.3;
        var dash = null;

        if (edge.edge_type === 'trap') {
          stroke = discovered ? '#f43f5e' : 'rgba(244,63,94,0.45)';
          marker = 'url(#arrow-trap)';
          dash = '4 3';
        } else if (edge.edge_type === 'cross_timeline_unlock' || edge.edge_type === 'convergence') {
          stroke = discovered ? '#34d399' : '#d97706';
          marker = discovered ? 'url(#arrow-done)' : 'url(#arrow-xfer)';
          width = discovered ? 2.4 : 1.7;
        }

        var edgeOpacity = activeChain ? '0.18' : (discovered ? '0.92' : '0.58');
        var attrs = {
          d: pathD,
          stroke: stroke,
          'stroke-width': width,
          'marker-end': marker,
          opacity: edgeOpacity,
        };
        if (dash) attrs['stroke-dasharray'] = dash;
        edgesGroup.appendChild(svgEl('path', attrs));
      });
    });
    svg.appendChild(edgesGroup);

    // 2. Cross-Route Inheritance Arcs (clickable to highlight!)
    if (ui.showTransfers) {
      var xferGroup = svgEl('g', { fill: 'none' });
      engine.getInheritanceStatus().forEach(function (xf) {
        var isSelectedChain = ui.activeChainId === xf.id;
        if (activeChain && !isSelectedChain) return;

        var p1 = NODE_POS[xf.sourceNodeId];
        var p2 = NODE_POS[xf.targetNode ? xf.targetNode.id : ''];
        if (!p1 || !p2) return;

        var mx = (p1.x + p2.x) / 2;
        var my = (p1.y + p2.y) / 2;
        var offset = xf.id === 'xfer_kanna_to_convergence_study_key'
          ? 120
          : (xf.id === 'xfer_mitsuki_to_mio_silver_medal' ? 92 : -42);
        var cx = mx + (xf.id === 'xfer_mitsuki_to_mio_silver_medal' ? 88 : 0);
        var cy = my + offset;

        var color = xf.status === 'completed' ? '#34d399' : (xf.status === 'carried' ? '#fbbf24' : 'rgba(251,191,36,0.36)');
        var marker = xf.status === 'completed' ? 'url(#arrow-done)' : 'url(#arrow-xfer)';

        if (!isSelectedChain) {
          xferGroup.appendChild(svgEl('path', {
            d: 'M ' + p1.x + ' ' + p1.y + ' Q ' + cx + ' ' + cy + ' ' + p2.x + ' ' + p2.y,
            stroke: color,
            'stroke-width': xf.status === 'locked' ? '1.2' : '2.1',
            'stroke-dasharray': '5 4',
            'marker-end': marker,
          }));

          var lx = 0.25 * p1.x + 0.5 * cx + 0.25 * p2.x;
          var ly = 0.25 * p1.y + 0.5 * cy + 0.25 * p2.y;
          var tagG = svgEl('g', { style: 'cursor:pointer;' });
          tagG.appendChild(svgEl('rect', {
            x: lx - 28, y: ly - 8, width: 56, height: 15, rx: 4,
            fill: '#070d20', stroke: color, 'stroke-width': '1',
          }));
          tagG.appendChild(svgEl('text', {
            x: lx, y: ly + 3, 'text-anchor': 'middle',
            fill: xf.status === 'completed' ? '#6ee7b7' : '#fde68a',
            'font-size': '9', 'font-weight': '700',
          }, xf.item ? xf.item.name_ko.slice(0, 5) : xf.id));
          tagG.addEventListener('click', function () {
            toggleChainHighlight(xf.id);
          });
          xferGroup.appendChild(tagG);
        }
      });

      // Active Chain Multi-Segment Pulsing Cyan/Gold Highlight Trajectory!
      if (activeChain) {
        activeChain.segments.forEach(function (seg, idx) {
          var sp1 = NODE_POS[seg.from];
          var sp2 = NODE_POS[seg.to];
          if (!sp1 || !sp2) return;
          var smx = (sp1.x + sp2.x) / 2;
          var smy = (sp1.y + sp2.y) / 2;
          var bend = idx === 0 ? -52 : (idx === 1 ? 42 : -22);
          var segColor = seg.kind === 'reflector_jump' ? '#38e8ff' : (seg.kind === 'branch_travel' ? '#fde047' : '#34d399');
          var segMarker = seg.kind === 'reflector_jump' ? 'url(#arrow-chain-cyan)' : (seg.kind === 'branch_travel' ? 'url(#arrow-chain-gold)' : 'url(#arrow-done)');

          xferGroup.appendChild(svgEl('path', {
            d: 'M ' + sp1.x + ' ' + sp1.y + ' Q ' + smx + ' ' + (smy + bend) + ' ' + sp2.x + ' ' + sp2.y,
            stroke: segColor,
            'stroke-width': '3.5',
            'stroke-dasharray': '9 5',
            'marker-end': segMarker,
            class: 'chain-highlight-path',
          }));

          var slx = 0.25 * sp1.x + 0.5 * smx + 0.25 * sp2.x;
          var sly = 0.25 * sp1.y + 0.5 * (smy + bend) + 0.25 * sp2.y;
          xferGroup.appendChild(svgEl('rect', {
            x: slx - 36, y: sly - 9, width: 72, height: 17, rx: 5,
            fill: '#050b1c', stroke: segColor, 'stroke-width': '1.2',
          }));
          xferGroup.appendChild(svgEl('text', {
            x: slx, y: sly + 3, 'text-anchor': 'middle',
            fill: '#ffffff', 'font-size': '9.5', 'font-weight': '800',
          }, (idx + 1) + '. ' + seg.label_ko));
        });
      }

      svg.appendChild(xferGroup);
    }

    // 3. Render all 60 nodes
    var nodesGroup = svgEl('g');
    engine.data.nodes.forEach(function (node) {
      var pos = NODE_POS[node.id];
      if (!pos) return;

      var isCurrent = ls.currentNodeId === node.id;
      var hasJewel = Object.prototype.hasOwnProperty.call(gs.placedJewels, node.id);
      var isDiscovered = gs.discoveredNodes.indexOf(node.id) !== -1;
      var isShiningCollected = node.grants_jewel && gs.collectedLightJewels.indexOf(node.grants_jewel) !== -1;
      var isInChain = Boolean(chainNodeSet[node.id]);
      var palette = NODE_COLORS[node.node_type] || { fill: '#3b82f6', stroke: '#bfdbfe' };

      var cls = 'adms-node' +
        (!isDiscovered ? (ui.fogMode ? ' fog-hidden' : ' undiscovered') : '') +
        (isCurrent ? ' is-current' : '') +
        (hasJewel ? ' has-jewel' : '') +
        (activeChain ? (isInChain ? ' chain-focus' : ' chain-dimmed') : '');

      var g = svgEl('g', {
        class: cls,
        transform: 'translate(' + pos.x + ',' + pos.y + ')',
        'data-node-id': node.id,
      });

      // Chain highlight double halo
      if (activeChain && isInChain) {
        var ringColor = node.id === activeChain.sourceNodeId ? '#fde047'
          : (node.id === activeChain.jumpHubNodeId ? '#38e8ff'
          : (node.id === activeChain.gateNodeId ? '#fb923c' : '#34d399'));
        g.appendChild(svgEl('circle', {
          r: '24', fill: 'none', stroke: ringColor, 'stroke-width': '2.8',
          class: 'pulse-ring',
        }));
      }

      // Current location pulsing cyan ring
      if (isCurrent) {
        g.appendChild(svgEl('circle', {
          r: '20', fill: 'none', stroke: '#38e8ff', 'stroke-width': '2.4',
          class: 'pulse-ring',
        }));
      }

      var shapeFill = isShiningCollected ? '#059669' : palette.fill;
      var shapeStroke = isCurrent ? '#ffffff' : (hasJewel ? '#fde047' : palette.stroke);
      var strokeW = isCurrent || hasJewel || isInChain ? '2.3' : '1.5';

      if (node.node_type === 'divergence' || node.node_type === 'convergence') {
        g.appendChild(svgEl('polygon', {
          points: '0,-14 14,0 0,14 -14,0',
          fill: shapeFill, stroke: shapeStroke, 'stroke-width': strokeW, class: 'node-shape',
        }));
      } else if (node.node_type === 'lock_gate') {
        g.appendChild(svgEl('rect', {
          x: '-12', y: '-12', width: '24', height: '24', rx: '5',
          fill: shapeFill, stroke: shapeStroke, 'stroke-width': strokeW, class: 'node-shape',
        }));
      } else {
        g.appendChild(svgEl('circle', {
          r: node.node_type === 'true_end' ? '15' : '12',
          fill: shapeFill, stroke: shapeStroke, 'stroke-width': strokeW, class: 'node-shape',
        }));
      }

      var sym = '•';
      if (node.node_type === 'root') sym = 'S';
      else if (node.node_type === 'checkpoint_recommended') sym = '★';
      else if (node.node_type === 'divergence') sym = '⚡';
      else if (node.node_type === 'shining_point') sym = isShiningCollected ? '✓' : '✦';
      else if (node.node_type === 'lock_gate') sym = '🔒';
      else if (node.node_type === 'whirlpool') sym = '🌀';
      else if (node.node_type === 'route_end') sym = '★';
      else if (node.node_type === 'convergence') sym = '◈';
      else if (node.node_type === 'isekai_stage') sym = node.puzzle_id ? '🧩' : '❖';
      else if (node.node_type === 'true_end') sym = '☀';

      g.appendChild(svgEl('text', {
        x: '0', y: '4', 'text-anchor': 'middle', fill: '#ffffff',
        'font-size': '10', 'font-weight': '800',
      }, sym));

      if (hasJewel) {
        var gemG = svgEl('g', { transform: 'translate(12, -12)', class: 'jewel-pulse' });
        gemG.appendChild(svgEl('polygon', {
          points: '0,-7 6,0 0,7 -6,0',
          fill: '#fbbf24', stroke: '#fffbeb', 'stroke-width': '1.3',
        }));
        g.appendChild(gemG);
      }

      g.appendChild(svgEl('text', {
        x: '0', y: '24', 'text-anchor': 'middle',
        fill: isCurrent ? '#38e8ff' : (isInChain ? '#fef08a' : (hasJewel ? '#fde68a' : '#cbd5e1')),
        'font-size': '9.5', 'font-weight': isCurrent || hasJewel || isInChain ? '700' : '500',
      }, pos.short));

      g.addEventListener('mouseenter', function () {
        renderGraphDetail(node.id);
      });

      g.addEventListener('click', function () {
        ui.selectedGraphNodeId = node.id;
        renderGraphDetail(node.id);
        if (hasJewel && !engine.isIsekaiLocked()) {
          openJumpPreviewModal(node.id);
        } else if (hasJewel && engine.isIsekaiLocked()) {
          setFeedback('warn', '이세계편(데라 그란트)에서는 A.D.M.S. 리플렉터 점프가 봉인되어 있습니다.');
          renderAll();
        }
      });

      nodesGroup.appendChild(g);
    });
    svg.appendChild(nodesGroup);
  }

  function renderGraphDetail(nodeId) {
    var bar = document.getElementById('graph-detail-bar');
    bar.innerHTML = '';

    if (ui.activeChainId && !nodeId) {
      var cv = engine.getInheritanceChainVisual(ui.activeChainId);
      if (cv) {
        bar.appendChild(el('span', null,
          '⚡ 강조 체인 [' + (cv.item ? cv.item.name_ko : cv.id) + ']: ' + cv.mechanism_ko
        ));
        return;
      }
    }

    var node = engine.nodeMap[nodeId || ui.selectedGraphNodeId || engine.localState.currentNodeId];
    if (!node) return;

    var route = engine.routeMap[node.route_id];
    var loc = engine.locationMap[node.location_id];
    var hasJewel = Object.prototype.hasOwnProperty.call(engine.globalState.placedJewels, node.id);

    bar.appendChild(el('span', null,
      '[' + (route ? route.name_ko : node.route_id) + '] ' +
      node.title_ko + ' · 위치: ' + (loc ? loc.name_ko : node.location_id)
    ));

    if (hasJewel && !engine.isIsekaiLocked()) {
      var jBtn = el('button', { type: 'button', className: 'btn btn-gold btn-xs' }, '💎 이 보옥으로 점프');
      jBtn.addEventListener('click', function () { openJumpPreviewModal(node.id); });
      bar.appendChild(jBtn);
    } else if (node.grants_jewel) {
      var got = engine.globalState.collectedLightJewels.indexOf(node.grants_jewel) !== -1;
      bar.appendChild(el('span', { className: 'badge' }, got ? '광점 보옥 회수 완료' : '미수집 광점 보옥 위치'));
    } else if (node.puzzle_id) {
      bar.appendChild(el('span', { className: 'badge' }, '🧩 데라 그란트 플레이어블 미궁'));
    }
  }

  /* ---------- Render Octagonal Reflector Device Widget ---------- */
  function renderReflectorDevice() {
    var gs = engine.globalState;
    var node = engine.getCurrentNode();
    var slots = engine.getJewelSlots();
    var totalCollected = engine.getTotalCollectedJewels();
    var isIsekai = engine.isIsekaiLocked();

    document.getElementById('reflector-count-badge').textContent =
      '가용 ' + gs.availableJewels + ' / 보유 ' + totalCollected + ' / 최대 ' + gs.jewelCapacity;

    var placeBtn = document.getElementById('btn-place-jewel');
    var cmdPlaceBtn = document.getElementById('btn-cmd-place-jewel');
    var alreadyPlacedHere = Object.prototype.hasOwnProperty.call(gs.placedJewels, node.id);
    var canPlace = !isIsekai && !engine.localState.isVortexDeadEnd && (alreadyPlacedHere || gs.availableJewels > 0);
    var placeLabel = isIsekai
      ? '🔒 이세계 봉인'
      : (alreadyPlacedHere ? '💎 현재 보옥 갱신' : '💎 보옥 세이브 (' + gs.availableJewels + ')');

    placeBtn.textContent = placeLabel;
    placeBtn.disabled = !canPlace;
    cmdPlaceBtn.textContent = placeLabel;
    cmdPlaceBtn.disabled = !canPlace;

    var svg = document.getElementById('reflector-svg');
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var cx = 120, cy = 120;
    var octPts = function (r) {
      var pts = [];
      for (var i = 0; i < 8; i++) {
        var ang = (Math.PI / 8) + i * (Math.PI / 4);
        pts.push((cx + r * Math.cos(ang)).toFixed(1) + ',' + (cy + r * Math.sin(ang)).toFixed(1));
      }
      return pts.join(' ');
    };

    svg.appendChild(svgEl('polygon', {
      points: octPts(108), fill: '#0b1430', stroke: isIsekai ? '#9d174d' : '#60a5fa', 'stroke-width': '3',
    }));
    svg.appendChild(svgEl('polygon', {
      points: octPts(94), fill: '#070d22', stroke: isIsekai ? '#6b21a8' : '#d97706', 'stroke-width': '1.6',
    }));
    svg.appendChild(svgEl('circle', {
      cx: cx, cy: cy, r: '36', fill: '#0d1c44',
      stroke: node.reflector_blinks && !isIsekai ? '#fbbf24' : '#38e8ff',
      'stroke-width': node.reflector_blinks && !isIsekai ? '2.6' : '1.6',
      class: node.reflector_blinks && !isIsekai ? 'jewel-pulse' : '',
    }));
    svg.appendChild(svgEl('text', {
      x: cx, y: cy - 4, 'text-anchor': 'middle', fill: '#e0f2fe', 'font-size': '11', 'font-weight': '800',
    }, isIsekai ? 'SEALED' : 'A.D.M.S.'));
    svg.appendChild(svgEl('text', {
      x: cx, y: cy + 13, 'text-anchor': 'middle', fill: '#fde68a', 'font-size': '12', 'font-weight': '700',
    }, gs.availableJewels + ' / ' + totalCollected));

    var count = slots.length;
    var ringR = 68;
    slots.forEach(function (slot, idx) {
      var angle = -Math.PI / 2 + (idx * 2 * Math.PI) / count;
      var sx = cx + ringR * Math.cos(angle);
      var sy = cy + ringR * Math.sin(angle);

      var fill = '#111a33';
      var stroke = '#334155';
      if (slot.status === 'available') {
        fill = '#38e8ff';
        stroke = '#e0f2fe';
      } else if (slot.status === 'placed') {
        fill = '#fbbf24';
        stroke = '#fef9c3';
      }

      var sg = svgEl('g', {
        transform: 'translate(' + sx.toFixed(1) + ',' + sy.toFixed(1) + ')',
        style: slot.status === 'placed' ? 'cursor:pointer;' : '',
      });
      sg.appendChild(svgEl('circle', {
        r: count === 10 ? '11' : '12.5',
        fill: '#080e22', stroke: stroke, 'stroke-width': '1.6',
      }));
      sg.appendChild(svgEl('circle', {
        r: count === 10 ? '7' : '8.2',
        fill: fill,
        class: slot.status === 'placed' ? 'jewel-pulse' : '',
      }));
      if (slot.status === 'placed' && slot.placedNodeId) {
        sg.addEventListener('click', function () {
          if (!engine.isIsekaiLocked()) openJumpPreviewModal(slot.placedNodeId);
        });
      }
      svg.appendChild(sg);
    });

    var blinkLabel = document.getElementById('reflector-blink-label');
    if (isIsekai) {
      blinkLabel.className = 'blink-label sealed';
      blinkLabel.textContent = '🔒 데라 그란트 — 보옥 세이브/로드 봉인';
    } else if (node.reflector_blinks) {
      blinkLabel.className = 'blink-label active';
      blinkLabel.textContent = '⚡ 하단 보옥 점멸 — 주요 분기점!';
    } else {
      blinkLabel.className = 'blink-label';
      blinkLabel.textContent = '리플렉터 정상 가동 중';
    }

    var anchorWrap = document.getElementById('placed-jewels-list');
    anchorWrap.innerHTML = '';
    var placedIds = Object.keys(gs.placedJewels);
    if (placedIds.length === 0) {
      anchorWrap.appendChild(el('div', { className: 'chip-empty' }, '배치된 보옥 앵커가 없습니다. 분기점에서 보옥 세이브를 설치하세요.'));
    } else {
      placedIds.forEach(function (nid) {
        var n = engine.nodeMap[nid];
        var row = el('div', { className: 'anchor-item' });
        var info = el('div', { className: 'anchor-info' });
        info.appendChild(el('div', { className: 'anchor-title' }, '💎 ' + (NODE_POS[nid] ? NODE_POS[nid].short : nid)));
        info.appendChild(el('div', { className: 'anchor-sub' }, n ? n.title_ko : nid));
        row.appendChild(info);

        var acts = el('div', { className: 'anchor-actions' });
        var jBtn = el('button', { type: 'button', className: 'btn btn-gold btn-xs', disabled: isIsekai }, '점프');
        jBtn.addEventListener('click', function () { openJumpPreviewModal(nid); });
        var rBtn = el('button', { type: 'button', className: 'btn btn-ghost btn-xs', disabled: isIsekai }, '회수');
        rBtn.addEventListener('click', function () {
          var res = engine.retrieveJewel(nid);
          setFeedback(res.ok ? 'info' : 'error', res.ok ? '보옥을 원격 회수했습니다. (가용 보옥: ' + res.availableJewels + ')' : res.error);
          persistAutosave();
          renderAll();
        });
        acts.appendChild(jBtn);
        acts.appendChild(rBtn);
        row.appendChild(acts);
        anchorWrap.appendChild(row);
      });
    }

    var findWrap = document.getElementById('findable-jewels-list');
    findWrap.innerHTML = '';
    engine.data.jewels.filter(function (j) { return j.category === 'findable'; }).forEach(function (j, idx) {
      var got = gs.collectedLightJewels.indexOf(j.id) !== -1;
      var item = el('div', {
        className: 'jewel-mini' + (got ? ' collected' : ''),
        title: j.condition_ko,
      }, (got ? '✓ ' : '✦ ') + (idx + 1) + '. ' + j.name_ko.replace(/^발견 보옥 \d+ /, ''));
      findWrap.appendChild(item);
    });
  }

  /* ---------- Hotspot Activation Helper ---------- */
  function activateHotspot(hotspotId) {
    var res;
    if (ui.armedItemId) {
      res = engine.useItemOnHotspot(ui.armedItemId, hotspotId);
      if (!res.ok) {
        setFeedback('error', res.error);
      } else {
        var fType = res.action === 'advance' ? 'info' : (res.action === 'noop' ? 'warn' : 'info');
        setFeedback(fType, res.message);
        if (res.action === 'advance') {
          ui.armedItemId = null;
          ui.useItemOpen = false;
          ui.rePinReminderNodeId = null;
        }
      }
    } else {
      res = engine.inspectHotspot(hotspotId);
      if (!res.ok) {
        setFeedback('error', res.error);
      } else {
        setFeedback('info', res.message || res.text);
        if (res.action === 'advance') {
          ui.rePinReminderNodeId = null;
        }
      }
    }
    persistAutosave();
    renderAll();
  }

  /* ---------- Procedural Atmospheric Location SVG + Clickable SVG Hotspots ---------- */
  function renderLocationBackdrop(loc, node, hotspots) {
    var svg = document.getElementById('location-svg');
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var isIsekai = loc && loc.world === 'isekai_dela_grante';
    var skyTop = isIsekai ? '#2d0b3a' : '#08142e';
    var skyBot = isIsekai ? '#581c5c' : '#132a57';
    if (node.node_type === 'whirlpool') {
      skyTop = '#2a0614'; skyBot = '#5b0e28';
    } else if (node.node_type === 'true_end') {
      skyTop = '#0c1f4a'; skyBot = '#b45309';
    } else if (loc && loc.id === 'loc_arima_study') {
      skyTop = '#1c140d'; skyBot = '#3d2817';
    } else if (loc && loc.id === 'loc_dg_desert_oasis') {
      skyTop = '#451a03'; skyBot = '#b45309';
    } else if (loc && (loc.id === 'loc_shrine_cave' || loc.id === 'loc_ryuzoji_storehouse' || loc.id === 'loc_dg_underground_1')) {
      skyTop = '#090d16'; skyBot = '#1e293b';
    }

    var defs = svgEl('defs');
    var grad = svgEl('linearGradient', { id: 'locSky', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
    grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': skyTop }));
    grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': skyBot }));
    defs.appendChild(grad);
    svg.appendChild(defs);

    svg.appendChild(svgEl('rect', { width: '560', height: '175', fill: 'url(#locSky)' }));

    for (var i = 0; i < 18; i++) {
      var sx = (i * 97 + 23) % 540 + 10;
      var sy = (i * 43 + 11) % 85 + 8;
      svg.appendChild(svgEl('circle', { cx: sx, cy: sy, r: (i % 3 === 0 ? 1.5 : 1), fill: '#e0f2fe', opacity: '0.6' }));
    }

    var lid = loc ? loc.id : '';
    if (lid === 'loc_arima_study') {
      svg.appendChild(svgEl('rect', { x: '245', y: '20', width: '70', height: '142', rx: '6', fill: '#2a1a0f', stroke: '#d97706', 'stroke-width': '2' }));
      svg.appendChild(svgEl('circle', { cx: '280', cy: '58', r: '22', fill: '#fef3c7', stroke: '#b45309', 'stroke-width': '2' }));
      svg.appendChild(svgEl('line', { x1: '280', y1: '58', x2: '280', y2: '73', stroke: '#1e293b', 'stroke-width': '2.5' }));
      svg.appendChild(svgEl('line', { x1: '280', y1: '58', x2: '296', y2: '58', stroke: '#b91c1c', 'stroke-width': '2' }));
      svg.appendChild(svgEl('text', { x: '280', y: '115', 'text-anchor': 'middle', fill: '#fde68a', 'font-size': '11', 'font-weight': '700' }, '6 → 3'));
      svg.appendChild(svgEl('rect', { x: '112', y: '108', width: '80', height: '50', rx: '4', fill: '#1e130b', stroke: '#92400e' }));
    } else if (lid === 'loc_triangle_mountain' || lid === 'loc_coast_construction') {
      svg.appendChild(svgEl('polygon', { points: '120,175 280,28 440,175', fill: '#0b132b', stroke: '#38bdf8', 'stroke-width': '1.2' }));
      svg.appendChild(svgEl('polyline', { points: '310,0 292,44 314,46 298,94', fill: 'none', stroke: '#fde047', 'stroke-width': '2.4' }));
      svg.appendChild(svgEl('ellipse', { cx: '235', cy: '150', rx: '34', ry: '22', fill: '#1e293b' }));
      svg.appendChild(svgEl('ellipse', { cx: '325', cy: '152', rx: '30', ry: '20', fill: '#1e293b' }));
    } else if (lid.indexOf('loc_school') === 0) {
      svg.appendChild(svgEl('rect', { x: '70', y: '68', width: '420', height: '107', fill: '#0f1c3f', stroke: '#60a5fa', 'stroke-width': '1.2' }));
      for (var w = 0; w < 9; w++) {
        svg.appendChild(svgEl('rect', { x: 90 + w * 42, y: 84, width: 24, height: 18, fill: w % 2 === 0 ? '#fde68a' : '#38bdf8', opacity: '0.52' }));
        svg.appendChild(svgEl('rect', { x: 90 + w * 42, y: 114, width: 24, height: 18, fill: '#38bdf8', opacity: '0.32' }));
      }
    } else if (lid === 'loc_geo_technics') {
      svg.appendChild(svgEl('rect', { x: '185', y: '18', width: '190', height: '157', fill: '#0b1838', stroke: '#38e8ff', 'stroke-width': '1.8' }));
      for (var g = 0; g < 6; g++) {
        svg.appendChild(svgEl('line', { x1: '195', y1: 36 + g * 20, x2: '365', y2: 36 + g * 20, stroke: '#38e8ff', 'stroke-width': '1', opacity: '0.42' }));
      }
    } else if (lid === 'loc_dg_desert_oasis') {
      svg.appendChild(svgEl('circle', { cx: '455', cy: '44', r: '24', fill: '#fef08a', opacity: '0.85' }));
      svg.appendChild(svgEl('path', { d: 'M 0 132 Q 140 100 280 128 T 560 118 L 560 175 L 0 175 Z', fill: '#92400e' }));
      svg.appendChild(svgEl('ellipse', { cx: '268', cy: '136', rx: '68', ry: '14', fill: '#0284c7', opacity: '0.78' }));
    } else if (lid === 'loc_dg_underground_1' || lid === 'loc_shrine_cave') {
      svg.appendChild(svgEl('path', { d: 'M 40 175 L 150 40 L 410 40 L 520 175 Z', fill: '#0f172a', stroke: '#475569', 'stroke-width': '1.4' }));
      svg.appendChild(svgEl('rect', { x: '210', y: '62', width: '140', height: '90', rx: '68', fill: '#020617', stroke: '#38bdf8', 'stroke-width': '1.2', opacity: '0.8' }));
    } else if (isIsekai) {
      svg.appendChild(svgEl('circle', { cx: '445', cy: '48', r: '26', fill: '#f5d0fe', opacity: '0.82' }));
      svg.appendChild(svgEl('circle', { cx: '400', cy: '66', r: '12', fill: '#38e8ff', opacity: '0.75' }));
      svg.appendChild(svgEl('path', { d: 'M 0 140 Q 160 112 310 138 T 560 130 L 560 175 L 0 175 Z', fill: '#1e1035' }));
      svg.appendChild(svgEl('polygon', { points: '280,55 318,145 242,145', fill: '#3b0764', stroke: '#fde047', 'stroke-width': '1.4' }));
    } else {
      svg.appendChild(svgEl('polygon', { points: '150,95 280,35 410,95', fill: '#1e293b', stroke: '#93c5fd', 'stroke-width': '1.4' }));
      svg.appendChild(svgEl('rect', { x: '175', y: '95', width: '210', height: '80', fill: '#0f172a', stroke: '#475569' }));
      svg.appendChild(svgEl('rect', { x: '252', y: '115', width: '56', height: '40', fill: '#fbbf24', opacity: '0.35' }));
    }

    if (node.node_type === 'whirlpool') {
      svg.appendChild(svgEl('circle', { cx: '280', cy: '86', r: '52', fill: 'none', stroke: '#f43f5e', 'stroke-width': '3', 'stroke-dasharray': '10 6' }));
      svg.appendChild(svgEl('circle', { cx: '280', cy: '86', r: '30', fill: 'none', stroke: '#fb7185', 'stroke-width': '2.4', 'stroke-dasharray': '7 5' }));
      svg.appendChild(svgEl('text', { x: '280', y: '91', 'text-anchor': 'middle', fill: '#fecdd3', 'font-size': '14', 'font-weight': '800' }, 'WHIRLPOOL'));
    }

    // Location Zone label pill top-left
    svg.appendChild(svgEl('rect', { x: '10', y: '10', width: '210', height: '22', rx: '6', fill: 'rgba(5,9,23,0.82)', stroke: 'rgba(56,232,255,0.35)' }));
    svg.appendChild(svgEl('text', { x: '20', y: '25', fill: '#bae6fd', 'font-size': '11', 'font-weight': '700' }, (loc ? loc.zone_ko : '') + ' · ' + (loc ? loc.name_jp : '')));

    // Clickable SVG Spatial Hotspots overlaid directly on scene!
    (hotspots || []).forEach(function (hs) {
      var isActionable = hs.canClickAdvance || (ui.armedItemId && hs.matchingHeldItems.indexOf(ui.armedItemId) !== -1);
      var ringStroke = isActionable ? '#fde047' : (hs.inspected ? '#34d399' : '#38e8ff');
      var coreFill = isActionable ? '#fbbf24' : (hs.inspected ? '#34d399' : '#38e8ff');

      var hg = svgEl('g', {
        class: 'hotspot-reticle',
        transform: 'translate(' + hs.x + ',' + hs.y + ')',
        'data-hotspot-id': hs.id,
      });

      hg.appendChild(svgEl('circle', {
        r: '15', fill: 'rgba(5,9,23,0.45)', stroke: ringStroke, 'stroke-width': '1.8',
        class: 'reticle-ring',
      }));
      hg.appendChild(svgEl('circle', {
        r: '5.2', fill: coreFill, stroke: '#ffffff', 'stroke-width': '1.2',
        class: 'reticle-core',
      }));

      var labelW = Math.max(66, hs.label_ko.length * 8 + 14);
      var pillY = hs.y < 58 ? 20 : -28;
      hg.appendChild(svgEl('rect', {
        x: (-labelW / 2).toFixed(1), y: pillY, width: labelW, height: '16', rx: '5',
        fill: 'rgba(5,9,23,0.88)', stroke: ringStroke, 'stroke-width': '0.9',
      }));
      hg.appendChild(svgEl('text', {
        x: '0', y: pillY + 11.5, 'text-anchor': 'middle',
        fill: isActionable ? '#fef08a' : '#e0f2fe', 'font-size': '9.5', 'font-weight': '700',
      }, hs.label_ko));

      hg.addEventListener('click', function () {
        activateHotspot(hs.id);
      });
      svg.appendChild(hg);
    });
  }

  /* ---------- Render Dela Grante Survival & Underground Maze Panel ---------- */
  function renderIsekaiPuzzlePanel() {
    var panel = document.getElementById('isekai-puzzle-panel');
    panel.innerHTML = '';
    var active = engine.getActiveIsekaiPuzzle();
    if (!active) {
      panel.classList.add('hidden');
      return;
    }

    panel.classList.remove('hidden');
    var p = active.puzzle;
    var st = active.state;

    var head = el('div', { className: 'isekai-puzzle-head' });
    head.appendChild(el('h3', null, '🧩 ' + p.title_ko));
    head.appendChild(el('span', { className: 'badge' }, st.completed ? '✓ 돌파 완료!' : '진행 중'));
    panel.appendChild(head);
    panel.appendChild(el('p', { className: 'isekai-hint' }, p.hint_ko));

    if (p.type === 'desert_crossing') {
      var meters = el('div', { className: 'survival-meters' });

      var wBox = el('div', { className: 'meter-box' });
      var wLbl = el('div', { className: 'meter-label' });
      wLbl.appendChild(el('span', null, '💧 식수 (Water)'));
      wLbl.appendChild(el('strong', null, st.water + '%'));
      var wTrack = el('div', { className: 'meter-track' });
      wTrack.appendChild(el('div', { className: 'meter-fill meter-water', style: 'width:' + st.water + '%;' }));
      wBox.appendChild(wLbl);
      wBox.appendChild(wTrack);
      meters.appendChild(wBox);

      var rBox = el('div', { className: 'meter-box' });
      var rLbl = el('div', { className: 'meter-label' });
      rLbl.appendChild(el('span', null, '🥖 식량 (Rations)'));
      rLbl.appendChild(el('strong', null, st.rations + '%'));
      var rTrack = el('div', { className: 'meter-track' });
      rTrack.appendChild(el('div', { className: 'meter-fill meter-rations', style: 'width:' + st.rations + '%;' }));
      rBox.appendChild(rLbl);
      rBox.appendChild(rTrack);
      meters.appendChild(rBox);

      panel.appendChild(meters);

      var goals = el('div', { className: 'desert-goals' });
      goals.appendChild(el('span', { className: 'goal-chip' + (st.distance >= p.rules.goal_distance ? ' done' : '') },
        '행군 ' + st.distance + '/' + p.rules.goal_distance));
      goals.appendChild(el('span', { className: 'goal-chip' + (st.talkCount >= p.rules.goal_talk_yuno ? ' done' : '') },
        '유노 대화 ' + st.talkCount + '/' + p.rules.goal_talk_yuno));
      goals.appendChild(el('span', { className: 'goal-chip' + (st.lookCount >= p.rules.goal_look_around ? ' done' : '') },
        '주변 조사 ' + st.lookCount + '/' + p.rules.goal_look_around));
      panel.appendChild(goals);

      var actionsGrid = el('div', { className: 'isekai-actions-grid' });
      [
        { cmd: 'walk', label: '🚶 사막 전진 (+거리)', cls: 'btn-primary' },
        { cmd: 'talk_yuno', label: '💬 유노에게 말 걸기', cls: 'btn-secondary' },
        { cmd: 'look_around', label: '👁 주변 살펴보기', cls: 'btn-secondary' },
        { cmd: 'forage', label: '🌵 선인장·이슬 채집 (+보급)', cls: 'btn-emerald' },
      ].forEach(function (a) {
        var b = el('button', { type: 'button', className: 'btn btn-sm ' + a.cls, disabled: st.completed }, a.label);
        b.addEventListener('click', function () {
          var res = engine.stepDesertAction(a.cmd);
          setFeedback(res.ok ? (res.justCompleted ? 'info' : 'warn') : 'error', res.ok ? res.message : res.error);
          persistAutosave();
          renderAll();
        });
        actionsGrid.appendChild(b);
      });
      panel.appendChild(actionsGrid);
    } else if (p.type === 'underground_maze') {
      var viz = el('div', { className: 'maze-visual' });
      if (p.id === 'puzzle_dg_underground_1') {
        for (var d = 0; d <= 3; d++) {
          var isHere = st.corridor === 'main' && st.depth === d;
          var cellTxt = d === 0 ? '입구(0)' : (d === 3 ? '막다른길(3)' : '통로(' + d + ')');
          var cellCls = 'maze-cell' + (isHere ? ' current' : '') + (d === 3 ? ' deadend' : '');
          viz.appendChild(el('span', { className: cellCls }, cellTxt));
        }
        var secretCls = 'maze-cell secret' + (st.corridor === 'east_secret' ? ' current' : '');
        viz.appendChild(el('span', { className: secretCls },
          st.deadEndHit ? '➡ 우측 비밀통로 (깊이2→우측)' : '🔒 우측 벽(?)'
        ));
      } else {
        for (var k = 0; k <= 3; k++) {
          var kHere = st.depth === k;
          viz.appendChild(el('span', { className: 'maze-cell' + (kHere ? ' current' : '') },
            k === 3 ? '성당 출구(3)' : '추적(' + k + ')'));
        }
      }
      panel.appendChild(viz);

      var dpad = el('div', { className: 'maze-dpad' });
      var mkDirBtn = function (dir, label) {
        var btn = el('button', { type: 'button', className: 'btn btn-sm btn-secondary', disabled: st.completed }, label);
        btn.addEventListener('click', function () {
          var res = engine.stepUndergroundMaze(dir);
          setFeedback(res.ok ? (res.justCompleted ? 'info' : 'warn') : 'error', res.ok ? res.message : res.error);
          persistAutosave();
          renderAll();
        });
        return btn;
      };
      dpad.appendChild(el('span', null, ''));
      dpad.appendChild(mkDirBtn('forward', '⬆ 전진'));
      dpad.appendChild(el('span', null, ''));
      dpad.appendChild(mkDirBtn('left', '⬅ 좌측'));
      dpad.appendChild(mkDirBtn('back', '⬇ 1칸 후퇴'));
      dpad.appendChild(mkDirBtn('right', '➡ 우측'));
      panel.appendChild(dpad);
    }

    if (st.lastMessage) {
      panel.appendChild(el('div', { className: 'maze-status-msg' }, st.lastMessage));
    }
  }

  /* ---------- Render ADV Scene, Hotspots & Transitions ---------- */
  function renderAdvScene() {
    var node = engine.getCurrentNode();
    var loc = engine.getCurrentLocation();
    var route = engine.getCurrentRoute();
    var beat = engine.getNarrativeBeat(node.id);
    var chars = engine.getSceneCharacters();
    var hotspots = engine.getHotspotsForCurrentScene();

    document.getElementById('scene-location-title').textContent = loc ? loc.name_ko : node.location_id;
    document.getElementById('scene-route-badge').textContent = route ? route.name_ko : node.route_id;
    document.getElementById('scene-node-id').textContent = node.id;

    renderLocationBackdrop(loc, node, hotspots);

    // Character badges on stage
    var charWrap = document.getElementById('scene-characters');
    charWrap.innerHTML = '';
    chars.forEach(function (c) {
      var b = el('span', { className: 'char-badge', title: c.summary_ko });
      b.appendChild(el('strong', null, c.name_ko));
      b.appendChild(el('span', { className: 'char-role' }, c.affiliation_ko.split('·')[0].trim()));
      charWrap.appendChild(b);
    });

    // Accessible Hotspot Chips & Armed Item Banner
    var hsBar = document.getElementById('scene-hotspots-bar');
    hsBar.innerHTML = '';
    if (ui.armedItemId) {
      var armedObj = engine.itemMap[ui.armedItemId];
      var armedBan = el('div', { className: 'armed-banner' });
      armedBan.appendChild(el('span', null,
        '🎒 [' + (armedObj ? armedObj.name_ko : ui.armedItemId) + '] 장착 중 — 배경 마커나 아래 핫스팟을 클릭해 사용!'
      ));
      var armedBtns = el('div', { style: 'display:flex; gap:5px; flex-wrap:wrap;' });
      var useDirectBtn = el('button', { type: 'button', className: 'btn btn-xs btn-gold' }, '즉시 사용');
      useDirectBtn.addEventListener('click', function () {
        var r = engine.useItem(ui.armedItemId);
        setFeedback(r.ok ? (r.action === 'advance' ? 'info' : 'warn') : 'error', r.ok ? r.message : r.error);
        if (r.ok && r.action === 'advance') {
          ui.armedItemId = null;
          ui.useItemOpen = false;
          ui.rePinReminderNodeId = null;
        }
        persistAutosave();
        renderAll();
      });
      var cancelArmBtn = el('button', { type: 'button', className: 'btn btn-xs btn-ghost' }, '장착 해제');
      cancelArmBtn.addEventListener('click', function () {
        ui.armedItemId = null;
        renderAdvScene();
      });
      armedBtns.appendChild(useDirectBtn);
      armedBtns.appendChild(cancelArmBtn);
      armedBan.appendChild(armedBtns);
      hsBar.appendChild(armedBan);
    }

    hsBar.appendChild(el('span', { className: 'hotspot-bar-title' }, '🎯 씬 핫스팟:'));
    if (hotspots.length === 0) {
      hsBar.appendChild(el('span', { className: 'chip-empty' }, '현재 장면 핫스팟 없음'));
    } else {
      hotspots.forEach(function (hs) {
        var actionable = hs.canClickAdvance || (ui.armedItemId && hs.matchingHeldItems.indexOf(ui.armedItemId) !== -1);
        var cls = 'hotspot-chip' + (actionable ? ' actionable' : (hs.inspected ? ' inspected' : ''));
        var prefix = actionable ? '⚡ ' : (hs.inspected ? '✓ ' : '◎ ');
        var chip = el('button', { type: 'button', className: cls, title: hs.inspect_ko }, prefix + hs.label_ko);
        chip.addEventListener('click', function () {
          activateHotspot(hs.id);
        });
        hsBar.appendChild(chip);
      });
    }

    // Alert banner
    var alertBox = document.getElementById('scene-alert-banner');
    var emergencyBtn = document.getElementById('btn-cmd-emergency');
    var placedCount = Object.keys(engine.globalState.placedJewels).length;

    emergencyBtn.classList.add('hidden');
    alertBox.className = 'scene-alert hidden';
    alertBox.textContent = '';

    if (node.node_type === 'true_end') {
      alertBox.className = 'scene-alert true-end';
      alertBox.textContent = '🌟 트루 엔딩 달성! 60개 A.D.M.S. 노드 · 6개 광점 보옥 · 5대 교차 계승 · 데라 그란트 대서사를 완주했습니다!';
    } else if (engine.localState.isVortexDeadEnd) {
      alertBox.className = 'scene-alert vortex';
      alertBox.textContent = '🌀 소용돌이(막다른 분기)에 도달했습니다! A.D.M.S. 그래프에서 금색 보옥 노드를 클릭해 리플렉터 점프로 탈출하세요.';
      if (placedCount === 0) emergencyBtn.classList.remove('hidden');
    } else if (engine.localState.isEnding) {
      var activeEnd = engine.getActiveEnding();
      alertBox.className = 'scene-alert ending';
      alertBox.textContent = '⭐ ' + (activeEnd ? activeEnd.title_ko : '루트 엔딩') + ' 완료! 획득한 아이템과 글로벌 플래그를 유지한 채 보옥 점프로 다른 분기에 도전하세요.';
      if (placedCount === 0 && !engine.isIsekaiLocked()) emergencyBtn.classList.remove('hidden');
    } else if (ui.rePinReminderNodeId === node.id && !Object.prototype.hasOwnProperty.call(engine.globalState.placedJewels, node.id)) {
      alertBox.className = 'scene-alert repin';
      alertBox.textContent = '💡 보옥 점프로 보옥이 회수되었습니다! 이곳은 핵심 허브이므로 [💎 보옥 세이브]를 다시 눌러 앵커를 재고정해 두세요.';
    } else if (node.reflector_blinks && !engine.isIsekaiLocked()) {
      alertBox.className = 'scene-alert blink';
      alertBox.textContent = '⚡ 리플렉터 하단 보옥 점멸! 중대한 평행세계 분기점입니다 — 진행 전 [💎 보옥 세이브]를 권장합니다.';
    }

    // Dialogue box
    document.getElementById('dialogue-speaker').textContent = beat.speaker;
    document.getElementById('dialogue-node-title').textContent = node.title_ko + ' (' + node.title_jp + ')';
    document.getElementById('dialogue-text').textContent = beat.dialogue;

    // Feedback toast
    var fbBox = document.getElementById('feedback-box');
    if (ui.feedback) {
      fbBox.className = 'feedback-box' + (ui.feedback.type === 'warn' ? ' warn' : (ui.feedback.type === 'error' ? ' error' : ''));
      fbBox.textContent = ui.feedback.text;
    } else {
      fbBox.className = 'feedback-box hidden';
    }

    // Dela Grante mini-puzzle panel (auto-activates during Isekai desert & underground stages)
    renderIsekaiPuzzlePanel();

    // Use Item Tray
    var tray = document.getElementById('use-item-tray');
    tray.innerHTML = '';
    if (ui.useItemOpen) {
      tray.classList.remove('hidden');
      var allHeld = engine.globalState.carriedItems.concat(engine.localState.localItems);
      if (allHeld.length === 0) {
        tray.appendChild(el('span', { className: 'chip-empty' }, '사용할 수 있는 소지품이 없습니다.'));
      } else {
        tray.appendChild(el('span', { className: 'hint-inline' }, '클릭해 장착 후 핫스팟 클릭 (다시 클릭 시 즉시 사용):'));
        allHeld.forEach(function (itemId) {
          var item = engine.itemMap[itemId];
          var isArmed = ui.armedItemId === itemId;
          var btn = el('button', {
            type: 'button',
            className: 'btn btn-xs ' + (isArmed ? 'btn-gold' : (item.carries_across_timelines ? 'btn-primary' : 'btn-secondary')),
            title: item.paradox_risk_note_ko,
          }, (isArmed ? '⚡ ' : (item.carries_across_timelines ? '🌐 ' : '⏳ ')) + item.name_ko);
          btn.addEventListener('click', function () {
            if (ui.armedItemId === itemId) {
              var res = engine.useItem(itemId);
              if (!res.ok) {
                setFeedback('error', res.error);
              } else {
                setFeedback(res.action === 'advance' ? 'info' : 'warn', res.message);
                if (res.action === 'advance') {
                  ui.useItemOpen = false;
                  ui.armedItemId = null;
                  ui.rePinReminderNodeId = null;
                }
              }
              persistAutosave();
              renderAll();
            } else {
              ui.armedItemId = itemId;
              setFeedback('info', '🎒 "' + item.name_ko + '" 장착! 배경 씬 핫스팟을 클릭해 사용하거나 아이템을 한 번 더 클릭해 즉시 사용하세요.');
              renderAdvScene();
            }
          });
          tray.appendChild(btn);
        });
      }
    } else {
      tray.classList.add('hidden');
    }

    // Transitions list
    var transWrap = document.getElementById('transitions-list');
    transWrap.innerHTML = '';
    var transitions = engine.getAvailableTransitions();

    if (transitions.length === 0) {
      var msg = engine.localState.currentNodeId === 'node_true_end'
        ? '이야기가 트루 엔딩으로 완결되었습니다. 상단 [↺ 초기화]로 새 플레이를 시작할 수 있습니다.'
        : '더 이상 직진할 분기가 없는 종단 노드입니다. A.D.M.S. 맵의 금색 보옥을 클릭해 다른 평행세계로 점프하세요!';
      transWrap.appendChild(el('div', { className: 'chip-empty' }, msg));
    } else {
      transitions.forEach(function (tr) {
        var extraCls = '';
        if (!tr.unlocked) extraCls = ' locked';
        else if (tr.edge_type === 'cross_timeline_unlock') extraCls = ' cross-unlock';
        else if (tr.edge_type === 'convergence' || tr.edge_type === 'arc_transition') extraCls = ' convergence';
        else if (tr.edge_type === 'trap') extraCls = ' trap';

        var btn = el('button', {
          type: 'button',
          className: 'transition-btn' + extraCls,
          disabled: !tr.unlocked,
        });

        var head = el('div', { className: 'transition-head' });
        head.appendChild(el('span', null, (tr.unlocked ? '▶ ' : '🔒 ') + tr.label_ko));

        var tagText = tr.edge_type === 'cross_timeline_unlock' ? '교차 계승'
          : (tr.edge_type === 'convergence' ? '최종 수렴'
          : (tr.edge_type === 'trap' ? '위험/함정'
          : (tr.edge_type === 'divergence' ? '분기' : '진행')));
        head.appendChild(el('span', { className: 'transition-tag' }, tagText));
        btn.appendChild(head);

        if (!tr.unlocked && tr.lockReasons.length > 0) {
          var reasonsDiv = el('div', { className: 'transition-lock-reasons' });
          tr.lockReasons.forEach(function (reason) {
            reasonsDiv.appendChild(el('span', null, '• ' + reason));
          });
          btn.appendChild(reasonsDiv);
        }

        if (tr.unlocked) {
          btn.addEventListener('click', function () {
            var res = engine.advanceToNode(tr.to);
            if (!res.ok) {
              setFeedback('error', res.error);
            } else {
              ui.rePinReminderNodeId = null;
              ui.armedItemId = null;
              var parts = [];
              if (res.newlyGrantedJewel) parts.push('✨ 광점 보옥 획득: ' + res.newlyGrantedJewel.name_ko);
              if (res.newlyGrantedItems.length > 0) {
                parts.push('🎒 획득: ' + res.newlyGrantedItems.map(function (i) { return i.name_ko; }).join(', '));
              }
              if (res.triggeredTransfers.length > 0) {
                parts.push('⚡ 루트 간 교차 계승 돌파!');
              }
              setFeedback(parts.length > 0 ? 'info' : null, parts.join(' | '));
            }
            persistAutosave();
            renderAll();
          });
        }
        transWrap.appendChild(btn);
      });
    }
  }

  /* ---------- Render Cross-Route State Inspector ---------- */
  function renderInspector() {
    var gs = engine.globalState;
    var ls = engine.localState;

    // 1. Global Carried Items
    document.getElementById('count-carried').textContent = gs.carriedItems.length;
    var carriedWrap = document.getElementById('list-carried-items');
    carriedWrap.innerHTML = '';
    if (gs.carriedItems.length === 0) {
      carriedWrap.appendChild(el('span', { className: 'chip-empty' }, '보유 중인 계승 아이템 없음'));
    } else {
      gs.carriedItems.forEach(function (id) {
        var it = engine.itemMap[id];
        carriedWrap.appendChild(el('span', {
          className: 'chip chip-global',
          title: it ? it.paradox_risk_note_ko : id,
        }, '🌐 ' + (it ? it.name_ko : id)));
      });
    }

    // 2. Global Flags
    document.getElementById('count-gflags').textContent = gs.globalFlags.length;
    var gfWrap = document.getElementById('list-global-flags');
    gfWrap.innerHTML = '';
    if (gs.globalFlags.length === 0) {
      gfWrap.appendChild(el('span', { className: 'chip-empty' }, '달성된 글로벌 플래그 없음'));
    } else {
      gs.globalFlags.forEach(function (fid) {
        var f = engine.globalFlagMap[fid];
        gfWrap.appendChild(el('span', {
          className: 'chip chip-global',
          title: f ? f.description_ko : fid,
        }, '✓ ' + (f ? f.name_ko : fid)));
      });
    }

    // 3. Local Items
    document.getElementById('count-local-items').textContent = ls.localItems.length;
    var liWrap = document.getElementById('list-local-items');
    liWrap.innerHTML = '';
    if (ls.localItems.length === 0) {
      liWrap.appendChild(el('span', { className: 'chip-empty' }, '현재 시간축 로컬 아이템 없음'));
    } else {
      ls.localItems.forEach(function (id) {
        var it = engine.itemMap[id];
        liWrap.appendChild(el('span', {
          className: 'chip chip-local',
          title: it ? it.paradox_risk_note_ko : id,
        }, '⏳ ' + (it ? it.name_ko : id)));
      });
    }

    // 4. Local Flags
    document.getElementById('count-lflags').textContent = ls.localFlags.length;
    var lfWrap = document.getElementById('list-local-flags');
    lfWrap.innerHTML = '';
    if (ls.localFlags.length === 0) {
      lfWrap.appendChild(el('span', { className: 'chip-empty' }, '현재 시간축 로컬 플래그 없음'));
    } else {
      ls.localFlags.forEach(function (fid) {
        var f = engine.localFlagMap[fid];
        var isTrap = fid === 'flag_local_storehouse_wall_first' || fid === 'flag_local_guard_card_wasted';
        lfWrap.appendChild(el('span', {
          className: 'chip ' + (isTrap ? 'chip-trap' : 'chip-local'),
          title: f ? f.description_ko : fid,
        }, (isTrap ? '⚠ ' : '• ') + (f ? f.name_ko : fid)));
      });
    }

    // 5. 5 Cross-Route Transfers (Clickable to Highlight on A.D.M.S. Graph!)
    var xferWrap = document.getElementById('transfers-list');
    xferWrap.innerHTML = '';
    engine.getInheritanceStatus().forEach(function (xf) {
      var isHighlighted = ui.activeChainId === xf.id;
      var row = el('div', { className: 'transfer-row ' + xf.status + (isHighlighted ? ' active-chain' : '') });
      var top = el('div', { className: 'transfer-top' });
      top.appendChild(el('span', null,
        (isHighlighted ? '✨ ' : '') +
        (xf.item ? xf.item.name_ko : '') + ' : ' +
        (xf.fromRoute ? xf.fromRoute.name_ko.split('—')[0].trim() : '') + ' → ' +
        (xf.toRoute ? xf.toRoute.name_ko.split('—')[0].trim() : '')
      ));
      var stText = xf.status === 'completed' ? '✓ 관문 돌파 완료'
        : (xf.status === 'carried' ? '💎 계승 보유 (점프 대기)' : '미획득');
      top.appendChild(el('span', { className: 'transfer-status ' + xf.status }, stText));
      row.appendChild(top);
      row.appendChild(el('div', { className: 'transfer-desc' }, xf.mechanism_ko));
      row.addEventListener('click', function () {
        toggleChainHighlight(xf.id);
      });
      xferWrap.appendChild(row);
    });

    // 6. 100% Map Completion Breakdown (GAP-07 Modern vs Isekai Split)
    var brkBox = document.getElementById('map-breakdown-box');
    brkBox.innerHTML = '';
    var brk = engine.getMapCompletionBreakdown();
    var bHead = el('div', { className: 'partition-head' });
    bHead.appendChild(el('h3', null, '🗺 100% 맵 달성률 분리 집계 (GAP-07 해소)'));
    bHead.appendChild(el('span', null, '전체 ' + brk.total.discovered + '/' + brk.total.total + ' (' + brk.total.percent + '%)'));
    brkBox.appendChild(bHead);

    var bGrid = el('div', { className: 'breakdown-grid' });
    var mkBar = function (title, discovered, total, pct, cls) {
      var box = el('div', { className: 'meter-box' });
      var lbl = el('div', { className: 'meter-label' });
      lbl.appendChild(el('span', null, title));
      lbl.appendChild(el('strong', null, discovered + '/' + total + ' (' + pct + '%)'));
      var trk = el('div', { className: 'meter-track' });
      trk.appendChild(el('div', { className: 'meter-fill ' + cls, style: 'width:' + pct + '%;' }));
      box.appendChild(lbl);
      box.appendChild(trk);
      return box;
    };
    bGrid.appendChild(mkBar('현세편 (사카이마치)', brk.modern.discovered, brk.modern.total, brk.modern.percent, 'meter-modern'));
    bGrid.appendChild(mkBar('이세계편 (데라 그란트)', brk.isekai.discovered, brk.isekai.total, brk.isekai.percent, 'meter-isekai'));
    brkBox.appendChild(bGrid);
    brkBox.appendChild(el('div', { className: 'breakdown-note' },
      '소용돌이 함정 회수: ' + brk.whirlpools.discovered + '/' + brk.whirlpools.total + ' · ' + brk.note_ko
    ));

    // 7. Endings list (15 endings: 6 heroine + 8 whirlpool + 1 true end)
    var endWrap = document.getElementById('endings-list');
    endWrap.innerHTML = '';
    engine.data.endings.forEach(function (e) {
      var unlocked = gs.unlockedEndings.indexOf(e.id) !== -1;
      var cls = 'ending-card' +
        (unlocked ? ' unlocked' : '') +
        (e.type === 'true_end' ? ' true-end' : (e.type === 'whirlpool_bad_end' ? ' whirlpool-end' : ''));
      var card = el('div', { className: cls });
      var icon = unlocked ? (e.type === 'whirlpool_bad_end' ? '🌀 ' : '★ ') : '○ ';
      card.appendChild(el('div', { style: 'font-weight:700;' }, icon + e.title_ko));
      card.appendChild(el('div', { style: 'font-size:10.5px; opacity:0.85;' }, e.summary_ko));
      endWrap.appendChild(card);
    });

    // 8. Action Log (newest first)
    var logWrap = document.getElementById('action-log-list');
    logWrap.innerHTML = '';
    gs.actionLog.slice().reverse().forEach(function (entry) {
      var row = el('div', { className: 'log-entry' });
      row.appendChild(el('span', { className: 'log-step' }, '#' + entry.step));
      row.appendChild(el('span', null, entry.message));
      logWrap.appendChild(row);
    });
  }

  /* ---------- Modals: Jump Preview & System Save ---------- */
  function openJumpPreviewModal(nodeId) {
    var snapshot = engine.globalState.placedJewels[nodeId];
    var targetNode = engine.nodeMap[nodeId];
    if (!snapshot || !targetNode) return;

    ui.pendingJumpNodeId = nodeId;
    var body = document.getElementById('modal-jump-body');
    body.innerHTML = '';

    body.appendChild(el('p', null,
      '목표 시간축: ' + targetNode.title_ko + ' (' + nodeId + ')'
    ));

    var grid = el('div', { className: 'preview-grid' });

    var gBox = el('div', { className: 'preview-box' });
    gBox.appendChild(el('h4', null, '🌐 그대로 들고 가는 글로벌 계승 상태'));
    var carriedNames = engine.globalState.carriedItems.map(function (id) {
      return engine.itemMap[id] ? engine.itemMap[id].name_ko : id;
    });
    gBox.appendChild(el('p', null, '소지품(' + carriedNames.length + '): ' + (carriedNames.join(', ') || '없음')));
    gBox.appendChild(el('p', null, '광점 보옥: ' + engine.globalState.collectedLightJewels.length + '/6 · 글로벌 플래그: ' + engine.globalState.globalFlags.length + '개'));
    grid.appendChild(gBox);

    var lBox = el('div', { className: 'preview-box' });
    lBox.appendChild(el('h4', null, '⏳ 과거 스냅샷으로 복원되는 로컬 상태'));
    var snapFlags = (snapshot.localFlags || []).map(function (fid) {
      return engine.localFlagMap[fid] ? engine.localFlagMap[fid].name_ko : fid;
    });
    lBox.appendChild(el('p', null, '복원 위치: ' + (engine.locationMap[snapshot.locationId] ? engine.locationMap[snapshot.locationId].name_ko : snapshot.locationId)));
    lBox.appendChild(el('p', null, '로컬 플래그: ' + (snapFlags.join(', ') || '초기 상태')));
    grid.appendChild(lBox);

    body.appendChild(grid);
    body.appendChild(el('p', { className: 'modal-note' },
      '※ 원작 규칙: 보옥 점프 시 배치했던 보옥 1개가 리플렉터로 회수됩니다. 허브 지점(1일차 거점/학원 정문)은 "점프 후 즉시 재고정"을 권장합니다.'
    ));

    document.getElementById('modal-jump').classList.remove('hidden');
  }

  function executeJump(rePin) {
    if (!ui.pendingJumpNodeId) return;
    var targetId = ui.pendingJumpNodeId;
    var res = engine.jumpToJewel(targetId, { keepPlaced: Boolean(rePin) });
    document.getElementById('modal-jump').classList.add('hidden');
    ui.pendingJumpNodeId = null;

    if (!res.ok) {
      setFeedback('error', res.error);
    } else {
      ui.rePinReminderNodeId = res.recommendRePin ? targetId : null;
      ui.armedItemId = null;
      setFeedback(
        'info',
        '⚡ 리플렉터 점프 완료 → ' + res.node.title_ko +
          (rePin ? ' (앵커 즉시 재고정 유지)' : ' (보옥 +1 회수, 가용 ' + res.availableJewels + '개)')
      );
    }
    persistAutosave();
    renderAll();
  }

  function renderSaveSlotsModal() {
    var wrap = document.getElementById('save-slots-list');
    wrap.innerHTML = '';

    for (var slot = 1; slot <= SYSTEM_SLOT_COUNT; slot++) {
      (function (slotNum) {
        var key = SAVE_KEY_PREFIX + slotNum;
        var raw = null;
        try { raw = localStorage.getItem(key); } catch (_e) {}
        var meta = null;
        if (raw) {
          try { meta = JSON.parse(raw); } catch (_e) {}
        }

        var row = el('div', { className: 'save-slot-row' });
        var info = el('div', { className: 'save-slot-meta' });
        if (meta && meta.localState && meta.globalState) {
          var n = engine.nodeMap[meta.localState.currentNodeId];
          info.appendChild(el('div', { style: 'font-weight:700;' }, '슬롯 ' + slotNum + ' — ' + (n ? n.title_ko : meta.localState.currentNodeId)));
          info.appendChild(el('div', { className: 'save-slot-sub' },
            '광점 ' + (meta.globalState.collectedLightJewels || []).length + '/6 · 탐색 ' +
            (meta.globalState.discoveredNodes || []).length + '/' + engine.data.nodes.length + ' · 모드: ' + meta.globalState.edition
          ));
        } else {
          info.appendChild(el('div', { style: 'font-weight:700;' }, '슬롯 ' + slotNum + ' — (비어 있음)'));
          info.appendChild(el('div', { className: 'save-slot-sub' }, '저장된 시스템 세이브가 없습니다.'));
        }
        row.appendChild(info);

        var btns = el('div', { style: 'display:flex; gap:6px;' });
        var saveBtn = el('button', { type: 'button', className: 'btn btn-primary btn-xs' }, '저장');
        saveBtn.addEventListener('click', function () {
          try {
            localStorage.setItem(key, engine.serialize());
            setFeedback('info', '시스템 세이브 슬롯 ' + slotNum + '에 저장했습니다.');
          } catch (_err) {
            setFeedback('error', '브라우저 저장소에 기록할 수 없습니다.');
          }
          renderSaveSlotsModal();
          renderAll();
        });

        var loadBtn = el('button', { type: 'button', className: 'btn btn-gold btn-xs', disabled: !meta }, '로드');
        loadBtn.addEventListener('click', function () {
          if (!raw) return;
          try {
            engine.deserialize(raw);
            document.getElementById('modal-save').classList.add('hidden');
            ui.armedItemId = null;
            setFeedback('info', '시스템 세이브 슬롯 ' + slotNum + '을 불러왔습니다.');
            persistAutosave();
            renderAll();
          } catch (err) {
            setFeedback('error', '세이브 로드 실패: ' + err.message);
          }
        });

        btns.appendChild(saveBtn);
        btns.appendChild(loadBtn);
        row.appendChild(btns);
        wrap.appendChild(row);
      })(slot);
    }
  }

  /* ---------- Full Re-render ---------- */
  function renderAll() {
    renderTopHud();
    renderChainBar();
    renderAdmsGraph();
    renderGraphDetail(ui.activeChainId ? null : (ui.selectedGraphNodeId || engine.localState.currentNodeId));
    renderReflectorDevice();
    renderAdvScene();
    renderInspector();
  }

  /* ---------- Wire Controls & Events ---------- */
  function handlePlaceJewel() {
    var res = engine.placeJewel();
    if (!res.ok) {
      setFeedback('error', res.error);
    } else {
      ui.rePinReminderNodeId = null;
      setFeedback(
        'info',
        (res.overwritten ? '현재 위치 보옥 스냅샷을 갱신했습니다.' : '현재 위치에 보옥 세이브를 배치했습니다!') +
          ' (가용 보옥: ' + res.availableJewels + ')'
      );
    }
    persistAutosave();
    renderAll();
  }

  document.getElementById('btn-place-jewel').addEventListener('click', handlePlaceJewel);
  document.getElementById('btn-cmd-place-jewel').addEventListener('click', handlePlaceJewel);

  document.getElementById('btn-cmd-inspect').addEventListener('click', function () {
    var res = engine.inspectLocation();
    var msg = res.text + (res.hints.length > 0 ? '  [' + res.hints.join(' / ') + ']' : '');
    setFeedback('info', '🔍 ' + msg);
    persistAutosave();
    renderAll();
  });

  document.getElementById('btn-cmd-items').addEventListener('click', function () {
    ui.useItemOpen = !ui.useItemOpen;
    if (!ui.useItemOpen) ui.armedItemId = null;
    renderAdvScene();
  });

  document.getElementById('btn-cmd-emergency').addEventListener('click', function () {
    var res = engine.emergencyRecallToHub();
    setFeedback(res.ok ? 'warn' : 'error', res.ok ? '⚡ 비상 귀환: 글로벌 상태를 유지한 채 본편 1일차 거점으로 복귀했습니다. 잊지 말고 보옥을 배치하세요!' : res.error);
    persistAutosave();
    renderAll();
  });

  document.getElementById('select-edition').addEventListener('change', function (e) {
    var res = engine.setEdition(e.target.value);
    if (!res.ok) {
      setFeedback('error', res.error);
      e.target.value = engine.globalState.edition;
    } else {
      setFeedback('info', '리플렉터 버전 모드 전환 완료 (최대 슬롯 ' + res.jewelCapacity + ', 가용 보옥 ' + res.availableJewels + ')');
      persistAutosave();
    }
    renderAll();
  });

  document.getElementById('chk-fog-mode').addEventListener('change', function (e) {
    ui.fogMode = Boolean(e.target.checked);
    renderAdmsGraph();
  });

  document.getElementById('chk-show-transfers').addEventListener('change', function (e) {
    ui.showTransfers = Boolean(e.target.checked);
    if (!ui.showTransfers) ui.activeChainId = null;
    renderAll();
  });

  document.getElementById('btn-zoom-in').addEventListener('click', function () {
    ui.zoom = Math.min(1.5, +(ui.zoom + 0.15).toFixed(2));
    renderAdmsGraph();
  });
  document.getElementById('btn-zoom-out').addEventListener('click', function () {
    ui.zoom = Math.max(0.65, +(ui.zoom - 0.15).toFixed(2));
    renderAdmsGraph();
  });
  document.getElementById('btn-zoom-fit').addEventListener('click', function () {
    ui.zoom = 1;
    renderAdmsGraph();
  });

  document.getElementById('btn-confirm-jump-reclaim').addEventListener('click', function () { executeJump(false); });
  document.getElementById('btn-confirm-jump-repin').addEventListener('click', function () { executeJump(true); });

  document.getElementById('btn-system-save').addEventListener('click', function () {
    renderSaveSlotsModal();
    document.getElementById('modal-save').classList.remove('hidden');
  });

  document.getElementById('btn-help').addEventListener('click', function () {
    document.getElementById('modal-help').classList.remove('hidden');
  });

  document.getElementById('btn-reset').addEventListener('click', function () {
    engine.reset({ edition: engine.globalState.edition });
    ui.selectedGraphNodeId = null;
    ui.rePinReminderNodeId = null;
    ui.activeChainId = null;
    ui.useItemOpen = false;
    ui.armedItemId = null;
    setFeedback('info', 'A.D.M.S. 60노드 시뮬레이션을 프롤로그부터 초기화했습니다.');
    persistAutosave();
    renderAll();
  });

  // Modal close buttons
  document.querySelectorAll('[data-close-modal]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-close-modal');
      document.getElementById(id).classList.add('hidden');
    });
  });

  // Inspector tabs
  document.querySelectorAll('.tab-btn').forEach(function (tabBtn) {
    tabBtn.addEventListener('click', function () {
      var target = tabBtn.getAttribute('data-tab');
      document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-pane').forEach(function (p) { p.classList.remove('active'); });
      tabBtn.classList.add('active');
      document.getElementById('tab-' + target).classList.add('active');
    });
  });

  // Initial render
  renderAll();
})();
