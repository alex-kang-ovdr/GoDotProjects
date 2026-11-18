/* Playable reconstruction of six champion kits. Numeric damage/geometry values
 * below are authored simulation tuning, not recovered proprietary spell code.
 * Pinned official resource/cooldown/range arrays live in restored-data.js. */
(function (root) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const structure = e => ['tower', 'inhibitor', 'nexus'].includes(e.type);
  const enabled = h => !!h && typeof h.hero === 'string' && h.hero.startsWith('lol_');
  const rankValue = (array, rank) => array[clamp(rank - 1, 0, array.length - 1)];
  const keyOf = h => h.hero.slice(4);
  const COLORS = { ahri: '#ffb6de', ashe: '#8bdfff', garen: '#e8cd84', lux: '#fff2a6', leesin: '#ffc59e', jhin: '#d7abef' };
  const PROJECTILES = new Set(['ahri_q_out', 'ahri_q_return', 'ahri_e', 'ashe_w', 'ashe_r', 'lux_q', 'lux_w_out', 'lux_w_return', 'leesin_q', 'jhin_w', 'jhin_r']);
  const EFFECTS = new Set(['foxfire', 'lux_zone', 'jhin_trap', 'reveal_travel', 'vision', 'bounce', 'lux_laser']);
  const RECAST_SLOTS = ['q', 'w', 'e', 'r'];
  const TUNING = Object.freeze({
    evidence: 'authored_reconstruction_not_original_formula',
    ahri: { q: [40, 65, 90, 115, 140], w: [50, 75, 100, 125, 150], e: [80, 110, 140, 170, 200], r: [60, 90, 120] },
    ashe: { w: [20, 35, 50, 65, 80], r: [200, 400, 600], eRecharge: [90, 80, 70, 60, 50] },
    garen: { q: [30, 60, 90, 120, 150], e: [4, 8, 12, 16, 20], r: [150, 300, 450] },
    lux: { q: [80, 120, 160, 200, 240], w: [40, 55, 70, 85, 100], e: [65, 115, 165, 215, 265], r: [300, 400, 500] },
    leesin: { q: [55, 80, 105, 130, 155], w: [50, 100, 150, 200, 250], e: [35, 65, 95, 125, 155], r: [175, 400, 625] },
    jhin: { q: [45, 70, 95, 120, 145], w: [60, 95, 130, 165, 200], e: [20, 80, 140, 200, 260], r: [64, 154, 244], eRecharge: [28, 27, 26, 25, 24] }
  });

  function fresh(h) {
    return { key: keyOf(h), castCount: 0, recasts: { q: null, w: null, e: null, r: null },
      stacks: 0, essenceStacks: 0, stackUntil: 0, ammo: 4, reloadUntil: 0, buffUntil: 0, empoweredUntil: 0,
      guardUntil: 0, guardFactor: 1, spinUntil: 0, spinNextAt: 0, spinTicks: 0,
      lifestealUntil: 0, flurryUntil: 0, flurryHits: 0, energyNextAt: 0,
      eCharges: 2, eNextAt: 0, channelUntil: 0, channelAngle: 0, channelShots: 0,
      channelNextAt: 0, lastCastSlot: null };
  }

  function initHero(g, h, template) {
    if (!enabled(h)) return;
    h.restored = fresh(h);
    h.sourceProfile = 'lol16.22'; h.archetype = template.archetype;
    h.resourceType = template.resourceType || 'mana';
    h.magicResist = template.magicResist || 0;
    h.rootedUntil = 0; h.silencedUntil = 0; h.charmedUntil = 0; h.charmSourceId = null;
    h.critChance = 0; h.critDamageBonus = 0; h.lifeSteal = 0; h.abilityHaste = 0;
  }

  function recast(g, h, slot) {
    const state = h.restored && h.restored.recasts[slot];
    return state && state.until > g.time && state.remaining > 0 ? state : null;
  }

  function resourceName(h) { return h.resourceType === 'energy' ? '기력' : h.resourceType === 'none' ? '자원' : '마나'; }

  function describe(g, h, info) {
    const s = h.restored, key = keyOf(h), slot = info.slot, r = recast(g, h, slot);
    const out = Object.assign({}, info, { resourceType: h.resourceType || 'mana', charges: null, maxCharges: null,
      phase: r ? 'recast' : h.cd[slot] > 0.001 ? 'cooldown' : 'ready', phaseRemaining: Math.max(0, h.cd[slot]),
      ready: false, statusText: '', disabledReason: null, mechanicsEvidence: TUNING.evidence });
    if (r) {
      out.phaseRemaining = Math.max(0, r.until - g.time);
      out.cost = key === 'leesin' ? 30 : 0;
      out.charges = r.remaining; out.maxCharges = key === 'ahri' ? 3 : key === 'jhin' ? 4 : 1;
      out.name = key === 'leesin' ? ({ q: '공명의 일격', w: '강철의 의지', e: '무력화' })[slot] || info.name : info.name;
      if (key === 'lux' && slot === 'e') out.name = '광휘의 특이점 · 폭발';
      out.statusText = key === 'jhin' ? '남은 탄환 ' + r.remaining : '재시전 ' + r.remaining;
    }
    if (key === 'garen' && slot === 'e' && s.spinUntil > g.time) {
      out.phase = 'recast'; out.cost = 0; out.name = '심판 · 중지'; out.phaseRemaining = s.spinUntil - g.time; out.statusText = '회전 중지';
    }
    if ((key === 'ashe' || key === 'jhin') && slot === 'e') {
      out.charges = s.eCharges; out.maxCharges = 2;
      out.rechargeDuration = rankValue(TUNING[key].eRecharge, Math.max(1, info.rank)) / (1 + h.abilityHaste / 100);
      out.phaseRemaining = s.eCharges === 0 ? Math.max(0, s.eNextAt - g.time) : Math.max(0, h.cd.e);
      out.phase = s.eCharges === 0 ? 'recharging' : h.cd.e > 0.001 ? 'cooldown' : 'ready';
      out.statusText = s.eCharges + '/2 충전';
    }
    if (key === 'ashe' && slot === 'q') out.statusText = s.buffUntil > g.time ? '집중 강화 중' : '집중 ' + s.stacks + '/4';
    if (!info.learned) out.disabledReason = '아직 배우지 않은 스킬입니다. + 버튼으로 스킬 포인트를 사용하세요.';
    else if (!g.started || g.over || g.paused || !h.alive) out.disabledReason = !h.alive ? '부활 후 사용할 수 있습니다.' : '진행 중인 경기에서 사용할 수 있습니다.';
    else if (h.stunnedUntil > g.time || h.charmedUntil > g.time) out.disabledReason = '행동 불가 상태입니다.';
    else if (h.silencedUntil > g.time) out.disabledReason = '침묵 중에는 스킬을 사용할 수 없습니다.';
    else if (s.channelUntil > g.time && slot !== 'r') out.disabledReason = '커튼 콜 중입니다. 이동하거나 S로 취소할 수 있습니다.';
    else if (h.rootedUntil > g.time && ((key === 'ahri' && slot === 'r') || (key === 'leesin' && (slot === 'w' && !r || slot === 'q' && r)))) out.disabledReason = '속박 중에는 이동 스킬을 사용할 수 없습니다.';
    else if (h.mana + 1e-6 < out.cost) out.disabledReason = resourceName(h) + '이 부족합니다.';
    else if (r && g.time < r.nextAt) out.disabledReason = '재시전 준비 중입니다.';
    else if (r && key === 'leesin' && slot === 'q' && !validMark(g, h, r.targetId)) out.disabledReason = '표식 대상이 사라졌습니다.';
    else if ((key === 'ashe' || key === 'jhin') && slot === 'e' && s.eCharges <= 0) out.disabledReason = '충전 중입니다.';
    else if (key === 'ashe' && slot === 'q' && (s.stacks < 4 || s.buffUntil > g.time)) out.disabledReason = s.buffUntil > g.time ? '이미 집중이 활성화되어 있습니다.' : '기본 공격으로 집중 4중첩을 쌓으세요.';
    else if (!r && !(key === 'garen' && slot === 'e' && s.spinUntil > g.time) && h.cd[slot] > 0.001) out.disabledReason = '재사용 대기 중입니다.';
    out.ready = !out.disabledReason;
    if (!out.statusText) out.statusText = out.ready ? '사용 가능' : out.phase === 'cooldown' ? '재사용 대기' : out.disabledReason;
    return out;
  }

  function validMark(g, h, targetId) {
    const t = g._byId.get(targetId);
    // The mark belongs to this cast, not to a single mutable field on the
    // victim. Another Lee Sin's Q/E must not steal an existing Q recast.
    const mark = recast(g, h, 'q');
    return t && t.alive && t.team !== h.team && mark && mark.targetId === targetId;
  }
  function validEnemy(g, h, e, heroOnly) {
    return e && e.alive && e.team !== h.team && e.type !== 'ward' && !structure(e) && (!heroOnly || e.type === 'hero') && g.isVisible(e, h.team);
  }
  function pick(g, h, aim, range, heroOnly) {
    return g._near(aim.x, aim.y, 85, e => validEnemy(g, h, e, heroOnly) && dist(h, e) <= range + e.r)
      .sort((a, b) => dist(a, aim) - dist(b, aim) || a.id.localeCompare(b.id))[0] || null;
  }
  function marked(g, h, t) {
    if (!t.alive) return;
    t.illuminatedBy = h.id; t.illuminatedUntil = g.time + 6;
  }
  function luxMarkDamage(g, h, t) {
    return t.illuminatedBy === h.id && t.illuminatedUntil > g.time && t.alive ? 10 + h.level * 10 + h.abilityPower * 0.2 : 0;
  }
  function consumeLuxMark(g, h, t, attackOrigin) {
    const amount = luxMarkDamage(g, h, t);
    if (!amount) return;
    t.illuminatedUntil = 0;
    g.damage(t, amount, h, 'magic', attackOrigin);
  }
  function enemies(g, h, x, y, r) { return g._near(x, y, r, e => e.team !== h.team && e.type !== 'ward' && !structure(e)); }
  function hit(g, h, t, amount, kind, flags, origin) {
    if (!t || !t.alive || structure(t) || t.type === 'ward') return 0;
    const attackOrigin = origin ? { x: origin.originX, y: origin.originY } : { x: h.x, y: h.y };
    const value = g.damage(t, amount, h, kind, attackOrigin);
    if (value > 0 && flags && t.alive) {
      if (flags.slow) g._slow(t, flags.slow, flags.slowDuration || 1.5);
      if (flags.root) { t.rootedUntil = Math.max(t.rootedUntil || 0, g.time + flags.root); g._clearPath(t); }
      if (flags.charm) { t.charmedUntil = g.time + flags.charm; t.charmSourceId = h.id; g._cancelAttack(t); t.recallLeft = 0; }
      if (flags.stun) { t.stunnedUntil = Math.max(t.stunnedUntil || 0, g.time + flags.stun); g._cancelAttack(t); }
      if (flags.lux) marked(g, h, t);
    }
    return value;
  }
  function spawn(g, h, kind, aim, range, speed, radius, damage, type, hits, extra) {
    const p = { id: g._id('spell'), source: h, sourceId: h.id, x: h.x, y: h.y, originX: h.x, originY: h.y,
      vx: aim.dx * speed, vy: aim.dy * speed, speed, r: radius, damage, damageType: type, team: h.team,
      homing: false, remainingRange: range, remainingHits: hits, hitIds: new Set(),
      kind: ['ashe', 'jhin'].includes(keyOf(h)) ? 'arrow' : 'magic', color: COLORS[keyOf(h)],
      life: Math.max(1, range / speed + 3), maxLife: Math.max(1, range / speed + 3),
      restoredKind: kind, travelled: 0, ...extra };
    g.projectiles.push(p); g._effect('burst', h.x, h.y, 25, p.color, 0.18);
    return p;
  }
  function addEffect(g, h, kind, x, y, duration, extra) {
    const placed = kind === 'lux_zone' || kind === 'jhin_trap';
    const effect = { id: g._id('restored'), sourceId: h.id, team: h.team, kind, x, y, at: g.time,
      until: g.time + duration, radius: 0, originX: placed ? x : h.x, originY: placed ? y : h.y, ...extra };
    g._restoredEffects.push(effect);
    return effect;
  }
  function openRecast(g, h, slot, duration, remaining, extra) {
    h.restored.recasts[slot] = { until: g.time + duration, nextAt: g.time + 0.2, remaining, ...extra };
  }
  function closeRecast(h, slot) { h.restored.recasts[slot] = null; }
  function useCharge(g, h, rank) {
    const s = h.restored;
    if (s.eCharges === 2) s.eNextAt = g.time + rankValue(TUNING[keyOf(h)].eRecharge, rank) / (1 + h.abilityHaste / 100);
    s.eCharges--;
  }

  function cast(g, h, slot, x, y) {
    const info = g.getSkillInfo(slot, h), s = h.restored, key = keyOf(h), r = recast(g, h, slot);
    if (!info || !info.ready) return { ok: false, reason: info && info.disabledReason || '지금 사용할 수 없는 스킬입니다.' };
    const aim = g._aim(h, x, y, info.range || 200), rank = info.rank, ap = h.abilityPower;
    let target = null;
    if ((key === 'garen' && slot === 'r') || (key === 'leesin' && slot === 'r') || (key === 'jhin' && slot === 'q')) {
      target = pick(g, h, aim, info.range, slot === 'r');
      if (!target) return { ok: false, reason: '사거리 안의 보이는 적을 지정하세요.' };
    }
    if (key === 'leesin' && slot === 'q' && r) {
      target = g._byId.get(r.targetId);
      if (!validMark(g, h, r.targetId) || dist(h, target) > 650) return { ok: false, reason: '표식 대상이 사라졌거나 너무 멉니다.' };
    }
    if (key === 'jhin' && slot === 'r' && r) {
      const delta = Math.atan2(Math.sin(aim.angle - s.channelAngle), Math.cos(aim.angle - s.channelAngle));
      if (Math.abs(delta) > Math.PI * 0.23) return { ok: false, reason: '커튼 콜 부채꼴 안으로 조준하세요.' };
    }
    let ally = h;
    if (key === 'leesin' && slot === 'w' && !r && finite(x) && finite(y)) {
      ally = g._near(aim.x, aim.y, 70, e => e.team === h.team && !structure(e) && (e.type === 'hero' || e.type === 'minion' || e.type === 'ward') && dist(h, e) <= info.range + e.r)
        .sort((a, b) => dist(a, aim) - dist(b, aim))[0];
      if (!ally) return { ok: false, reason: '자신 또는 사거리 안 아군·와드를 지정하세요.' };
    }
    // Every validity check above happens before resource/cooldown/state mutation.
    h.mana = Math.max(0, h.mana - info.cost); h.recallLeft = 0; g._cancelAttack(h);
    if (!r && !(key === 'garen' && slot === 'e' && s.spinUntil > g.time)) h.cd[slot] = info.cooldown;
    h.facing = aim.angle; h.revealedUntil = g.time + 1.2;
    s.castCount++; s.lastCastSlot = slot;
    const base = value => rankValue(value, rank);
    const bonusAD = Math.max(0, h.damage - (h.baseDamage || h.damage));

    if (key === 'ahri') {
      if (slot === 'q') spawn(g, h, 'ahri_q_out', aim, info.range, 750, 28, base(TUNING.ahri.q) + 0.5 * ap, 'magic', 128);
      if (slot === 'w') { h.hasteUntil = g.time + 1.5; addEffect(g, h, 'foxfire', h.x, h.y, 3, { remaining: 3, nextAt: g.time, hits: {}, damage: base(TUNING.ahri.w) + 0.3 * ap }); }
      if (slot === 'e') spawn(g, h, 'ahri_e', aim, info.range, 775, 27, base(TUNING.ahri.e) + 0.6 * ap, 'magic', 1, { charm: 1.1 + rank * 0.1 });
      if (slot === 'r') {
        if (!r) openRecast(g, h, 'r', 15, 2, { nextAt: g.time + 0.7 });
        else { r.remaining--; r.nextAt = g.time + 0.7; if (!r.remaining) closeRecast(h, 'r'); }
        const old = { x: h.x, y: h.y }; g._dash(h, aim.x, aim.y, false);
        g._effect('slash', old.x, old.y, 45, COLORS.ahri, 0.35, { x2: h.x, y2: h.y });
        const targets = enemies(g, h, h.x, h.y, 300).filter(e => g.isVisible(e, h.team)).sort((a, b) => (a.type === 'hero' ? -1 : 0) - (b.type === 'hero' ? -1 : 0) || dist(h, a) - dist(h, b)).slice(0, 3);
        for (const t of targets) { hit(g, h, t, base(TUNING.ahri.r) + 0.35 * ap, 'magic'); g._effect('slash', h.x, h.y, 25, COLORS.ahri, 0.3, { x2: t.x, y2: t.y }); }
      }
    } else if (key === 'ashe') {
      if (slot === 'q') { s.stacks = 0; s.buffUntil = g.time + 4; g._effect('ring', h.x, h.y, 45, COLORS.ashe, 0.5); }
      if (slot === 'w') {
        const volleyId = g._id('volley');
        for (let i = -4; i <= 4; i++) { const angle = aim.angle + i * 0.085; spawn(g, h, 'ashe_w', { dx: Math.cos(angle), dy: Math.sin(angle) }, info.range, 850, 10, base(TUNING.ashe.w) + h.damage, 'physical', 1, { volleyId }); }
      }
      if (slot === 'e') {
        useCharge(g, h, rank);
        const length = Math.min(dist(h, aim), Math.hypot(g.map.width, g.map.height));
        addEffect(g, h, 'reveal_travel', h.x, h.y, length / 650 + 5, { radius: 220, vx: aim.dx * 650, vy: aim.dy * 650, remaining: length });
      }
      if (slot === 'r') spawn(g, h, 'ashe_r', aim, Math.hypot(g.map.width, g.map.height), 800, 45, base(TUNING.ashe.r) + ap, 'magic', 1);
    } else if (key === 'garen') {
      if (slot === 'q') { s.empoweredUntil = g.time + 4.5; h.hasteUntil = g.time + 1 + rank * 0.3; h.slowUntil = 0; h.attackCooldown = 0; g._effect('ring', h.x, h.y, 50, COLORS.garen, 0.5); }
      if (slot === 'w') { s.guardUntil = g.time + 2 + rank * 0.6; s.guardFactor = 0.7; g._shield(h, 65 + 0.18 * Math.max(0, h.maxHp - (h.baseMaxHp || h.maxHp)), 0.75); }
      if (slot === 'e') {
        if (s.spinUntil > g.time) { s.spinUntil = 0; s.spinTicks = 0; }
        else { s.spinUntil = g.time + 3; s.spinNextAt = g.time; s.spinTicks = 7 + Math.floor(Math.max(0, h.attackSpeed / Math.max(0.1, h.baseAttackSpeed) - 1) / 0.25); }
      }
      if (slot === 'r') { hit(g, h, target, base(TUNING.garen.r) + (0.2 + rank * 0.05) * (target.maxHp - target.hp), 'true'); g._effect('burst', target.x, target.y, 100, '#fff3bb', 0.6); }
    } else if (key === 'lux') {
      if (slot === 'q') spawn(g, h, 'lux_q', aim, info.range, 600, 30, base(TUNING.lux.q) + 0.6 * ap, 'magic', 2);
      if (slot === 'w') {
        const amount = base(TUNING.lux.w) + 0.35 * ap;
        g._shield(h, amount, 2.5);
        const p = spawn(g, h, 'lux_w_out', aim, info.range, 700, 40, 0, 'magic', 128, { shieldValue: amount });
        p.hitIds.add(h.id);
      }
      if (slot === 'e') {
        if (r) {
          const zone = g._restoredEffects.find(e => e.id === r.effectId && e.kind === 'lux_zone');
          if (zone) { explodeLux(g, h, zone); zone.until = 0; }
          closeRecast(h, 'e');
        } else {
          const zone = addEffect(g, h, 'lux_zone', aim.x, aim.y, 5, { radius: 155, damage: base(TUNING.lux.e) + 0.8 * ap, nextAt: g.time });
          openRecast(g, h, 'e', 5, 1, { effectId: zone.id });
          g._effect('ring', aim.x, aim.y, zone.radius, COLORS.lux, 5);
        }
      }
      if (slot === 'r') { addEffect(g, h, 'lux_laser', h.x, h.y, 1.5, { fireAt: g.time + 0.6, fired: false, dx: aim.dx, dy: aim.dy, range: info.range, radius: 55, damage: base(TUNING.lux.r) + 1.2 * ap }); g._effect('beam', h.x, h.y, 15, COLORS.lux, 0.6, { x2: h.x + aim.dx * info.range, y2: h.y + aim.dy * info.range }); }
    } else if (key === 'leesin') {
      s.flurryUntil = g.time + 3; s.flurryHits = 2;
      if (slot === 'q') {
        if (r) {
          const damage = (base(TUNING.leesin.q) + 1.1 * bonusAD) * (1 + 1 - target.hp / target.maxHp);
          g._dash(h, target.x, target.y, true); hit(g, h, target, damage, 'physical'); closeRecast(h, 'q'); target.leeMarkUntil = 0;
        } else spawn(g, h, 'leesin_q', aim, info.range, 900, 28, base(TUNING.leesin.q) + 1.1 * bonusAD, 'physical', 1);
      }
      if (slot === 'w') {
        if (r) { s.lifestealUntil = g.time + 4; closeRecast(h, 'w'); }
        else {
          if (ally !== h) g._dash(h, ally.x, ally.y, true);
          const amount = base(TUNING.leesin.w) + 0.8 * ap; g._shield(h, amount, 2);
          if (ally !== h && ally.type === 'hero') g._shield(ally, amount, 2);
          openRecast(g, h, 'w', 3, 1);
        }
      }
      if (slot === 'e') {
        if (r) {
          for (const id of r.targetIds || []) {
            const t = g._byId.get(id);
            if (t && t.alive && t.team !== h.team && dist(h, t) <= 300) g._slow(t, 0.8 - rank * 0.05, 4);
          }
          closeRecast(h, 'e');
        }
        else {
          const targetIds = [];
          for (const t of enemies(g, h, h.x, h.y, 225)) {
            hit(g, h, t, base(TUNING.leesin.e) + bonusAD, 'magic');
            t.leeMarkedBy = h.id; t.leeEMarkUntil = g.time + 4; t.revealedUntil = g.time + 4;
            if (t.alive) targetIds.push(t.id);
          }
          openRecast(g, h, 'e', 3, 1, { targetIds }); g._effect('burst', h.x, h.y, 225, COLORS.leesin, 0.4);
        }
      }
      if (slot === 'r') {
        const old = { x: target.x, y: target.y }, angle = Math.atan2(target.y - h.y, target.x - h.x);
        const amount = base(TUNING.leesin.r) + 2 * bonusAD;
        hit(g, h, target, amount, 'physical', { stun: 1 });
        if (target.alive) g._dash(target, target.x + Math.cos(angle) * 350, target.y + Math.sin(angle) * 350, false);
        for (const other of enemies(g, h, (old.x + target.x) / 2, (old.y + target.y) / 2, 400)) if (other !== target && lineDistance(other, old.x, old.y, target.x, target.y) <= other.r + 35) hit(g, h, other, amount + target.maxHp * 0.1, 'physical', { stun: 1 });
        g._effect('slash', old.x, old.y, 70, COLORS.leesin, 0.4, { x2: target.x, y2: target.y });
      }
    } else if (key === 'jhin') {
      if (slot === 'q') addEffect(g, h, 'bounce', target.x, target.y, 3, { targetId: target.id, hits: [], remaining: 4, nextAt: g.time, damage: base(TUNING.jhin.q) + 0.44 * h.damage + 0.6 * ap });
      if (slot === 'w') spawn(g, h, 'jhin_w', aim, info.range, 1500, 22, base(TUNING.jhin.w) + 0.5 * h.damage, 'physical', 128);
      if (slot === 'e') {
        useCharge(g, h, rank);
        const own = g._restoredEffects.filter(e => e.kind === 'jhin_trap' && e.sourceId === h.id && e.until > g.time);
        if (own.length >= 4) own[0].until = 0;
        addEffect(g, h, 'jhin_trap', aim.x, aim.y, 120, { radius: 110, armAt: g.time + 1, triggerAt: 0, damage: base(TUNING.jhin.e) + 1.2 * h.damage + ap });
        g._effect('ring', aim.x, aim.y, 45, COLORS.jhin, 1);
      }
      if (slot === 'r') {
        if (!r) {
          s.channelUntil = g.time + 10; s.channelAngle = aim.angle; s.channelShots = 4; s.channelNextAt = g.time + 0.4;
          openRecast(g, h, 'r', 10, 4, { nextAt: g.time + 0.4 });
          if (h.isPlayer) { g._input = { x: 0, y: 0 }; g._moveDestination = null; g._attackMoveDestination = null; g._playerTargetId = null; }
          h.targetId = null; h.aiMove = null; g._clearPath(h); g._effect('ring', h.x, h.y, 80, COLORS.jhin, 1);
        } else {
          const last = r.remaining === 1;
          spawn(g, h, 'jhin_r', aim, info.range, 1800, 35, base(TUNING.jhin.r) + 0.25 * h.damage, 'physical', 1, { fourth: last });
          r.remaining--; r.nextAt = g.time + 1; s.channelShots = r.remaining; s.channelNextAt = r.nextAt;
          if (!r.remaining) cancelChannel(h);
        }
      }
    }
    return { ok: true, phase: g.getSkillInfo(slot, h).phase };
  }

  function lineDistance(p, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    const t = len ? clamp(((p.x - ax) * dx + (p.y - ay) * dy) / len, 0, 1) : 0;
    return Math.hypot(p.x - ax - t * dx, p.y - ay - t * dy);
  }
  function turnAround(g, p) {
    if (p.restoredKind === 'ahri_q_out') { p.restoredKind = 'ahri_q_return'; p.damageType = 'true'; }
    else if (p.restoredKind === 'lux_w_out') p.restoredKind = 'lux_w_return';
    else return false;
    p.hitIds.clear(); p.remainingRange = Math.hypot(g.map.width, g.map.height); p.remainingHits = 128; p.life = 4;
    return true;
  }

  function updateProjectile(g, p, dt) {
    p.life -= dt;
    if (p.life <= 0) return false;
    const returning = p.restoredKind.endsWith('_return');
    if (returning) {
      const d = dist(p, p.source);
      p.vx = (p.source.x - p.x) / Math.max(d, 0.001) * p.speed;
      p.vy = (p.source.y - p.y) / Math.max(d, 0.001) * p.speed;
    }
    const oldX = p.x, oldY = p.y, travel = Math.min(p.speed * dt, p.remainingRange);
    p.x += p.vx / p.speed * travel; p.y += p.vy / p.speed * travel;
    p.remainingRange -= travel; p.travelled += travel;
    const shield = p.restoredKind.startsWith('lux_w');
    const hits = g._near((oldX + p.x) / 2, (oldY + p.y) / 2, travel + 90, e =>
      (shield ? e.team === p.team && e.type === 'hero' : e.team !== p.team && e.type !== 'ward' && !structure(e)) &&
      (!['ashe_r', 'jhin_r'].includes(p.restoredKind) || e.type === 'hero') &&
      !p.hitIds.has(e.id) && lineDistance(e, oldX, oldY, p.x, p.y) <= e.r + p.r)
      .sort((a, b) => Math.hypot(a.x - oldX, a.y - oldY) - Math.hypot(b.x - oldX, b.y - oldY));
    for (const t of hits) {
      p.hitIds.add(t.id);
      if (shield) g._shield(t, (t.shieldUntil > g.time ? t.shield : 0) + p.shieldValue, 2.5);
      else if (p.restoredKind === 'ashe_w') {
        if (t.lastVolleyId !== p.volleyId) { hit(g, p.source, t, p.damage, 'physical', { slow: 0.65, slowDuration: 2 }, p); t.lastVolleyId = p.volleyId; }
      } else if (p.restoredKind === 'ashe_r') {
        const stun = clamp(1 + p.travelled / 700, 1, 3.5);
        hit(g, p.source, t, p.damage, 'magic', { stun }, p);
        for (const e of enemies(g, p.source, t.x, t.y, 125)) if (e !== t) hit(g, p.source, e, p.damage * 0.5, 'magic', { slow: 0.5 }, p);
      } else if (p.restoredKind === 'leesin_q') {
        hit(g, p.source, t, p.damage, 'physical', null, p);
        if (t.alive) { t.leeMarkedBy = p.source.id; t.leeMarkUntil = g.time + 3; t.revealedUntil = g.time + 3; openRecast(g, p.source, 'q', 3, 1, { targetId: t.id }); }
      } else if (p.restoredKind === 'jhin_w') {
        const rootDuration = t.jhinMarkedUntil > g.time || t.lastHeroHitAt > g.time - 4 && t.lastHeroHitId && g._byId.get(t.lastHeroHitId)?.team === p.team ? 1 + p.source.skillRanks.w * 0.2 : 0;
        hit(g, p.source, t, p.damage * (t.type === 'hero' ? 1 : 0.75), 'physical', { root: rootDuration }, p);
        if (t.type === 'hero') p.remainingHits = 1;
      } else if (p.restoredKind === 'jhin_r') {
        hit(g, p.source, t, p.damage * (1 + 2 * (1 - t.hp / t.maxHp)) * (p.fourth ? 2 : 1), 'physical', { slow: 0.2, slowDuration: 0.5 }, p);
      } else hit(g, p.source, t, p.damage, p.damageType, { root: p.restoredKind === 'lux_q' ? 2 : 0, charm: p.charm || 0, lux: p.restoredKind === 'lux_q' }, p);
      g._effect('burst', t.x, t.y, shield ? 40 : 30, p.color, 0.25);
      p.remainingHits--; if (p.remainingHits <= 0) return false;
    }
    if (returning && (dist(p, p.source) < p.speed * dt + 20 || lineDistance(p.source, oldX, oldY, p.x, p.y) < 15)) return false;
    if (p.remainingRange <= 0 || p.x < 0 || p.y < 0 || p.x > g.map.width || p.y > g.map.height) {
      p.x = clamp(p.x, 0, g.map.width); p.y = clamp(p.y, 0, g.map.height);
      return turnAround(g, p);
    }
    return true;
  }

  function explodeLux(g, h, zone) {
    for (const t of enemies(g, h, zone.x, zone.y, zone.radius)) hit(g, h, t, zone.damage, 'magic', { lux: true }, zone);
    g._effect('burst', zone.x, zone.y, zone.radius, COLORS.lux, 0.45);
  }

  function updateEffects(g, dt) {
    const kept = [];
    for (const e of g._restoredEffects) {
      const h = g._byId.get(e.sourceId);
      if (!h || e.until === 0) continue;
      if (e.kind === 'lux_zone' && e.until <= g.time) { explodeLux(g, h, e); closeRecast(h, 'e'); continue; }
      if (e.until <= g.time) continue;
      if (e.kind === 'foxfire') {
        if (!h.alive) continue;
        e.x = h.x; e.y = h.y;
        if (e.nextAt <= g.time) {
          const target = enemies(g, h, h.x, h.y, 350).filter(t => g.isVisible(t, h.team)).sort((a, b) => (a.type === 'hero' ? -500 : 0) + dist(h, a) - ((b.type === 'hero' ? -500 : 0) + dist(h, b)))[0];
          if (target) { const previous = e.hits[target.id] || 0; hit(g, h, target, e.damage * (previous ? 0.3 : 1), 'magic'); e.hits[target.id] = previous + 1; e.remaining--; e.nextAt = g.time + 0.18; g._effect('slash', h.x, h.y, 25, COLORS.ahri, 0.3, { x2: target.x, y2: target.y }); }
        }
        if (!e.remaining) continue;
      } else if (e.kind === 'lux_zone') {
        for (const t of enemies(g, h, e.x, e.y, e.radius)) g._slow(t, 0.75 - 0.05 * h.skillRanks.e, 0.25);
        if (e.nextAt <= g.time) { e.nextAt = g.time + 0.6; g._effect('ring', e.x, e.y, e.radius, COLORS.lux, 0.7); }
      } else if (e.kind === 'jhin_trap') {
        if (!e.triggerAt && e.armAt <= g.time && enemies(g, h, e.x, e.y, 55).length) { e.triggerAt = g.time + 2; g._effect('ring', e.x, e.y, e.radius, COLORS.jhin, 2); }
        if (e.triggerAt) {
          for (const t of enemies(g, h, e.x, e.y, e.radius)) { g._slow(t, 0.65, 0.25); t.jhinMarkedUntil = g.time + 4; }
          if (e.triggerAt <= g.time) { for (const t of enemies(g, h, e.x, e.y, e.radius)) hit(g, h, t, e.damage, 'magic', null, e); g._effect('burst', e.x, e.y, e.radius, COLORS.jhin, 0.5); continue; }
        }
      } else if (e.kind === 'reveal_travel') {
        const step = Math.min(e.remaining, 650 * dt); e.x = clamp(e.x + e.vx / 650 * step, 0, g.map.width); e.y = clamp(e.y + e.vy / 650 * step, 0, g.map.height); e.remaining -= step;
        if (e.remaining <= 0) { e.kind = 'vision'; e.until = g.time + 5; g._effect('ring', e.x, e.y, e.radius, COLORS.ashe, 1); }
      } else if (e.kind === 'bounce' && e.nextAt <= g.time) {
        const t = g._byId.get(e.targetId);
        if (!t || !t.alive) continue;
        const wasAlive = t.alive; hit(g, h, t, e.damage, 'physical', null, e); e.hits.push(t.id); e.remaining--;
        if (wasAlive && !t.alive) e.damage *= 1.35;
        e.x = t.x; e.y = t.y;
        if (!e.remaining) continue;
        const next = enemies(g, h, e.x, e.y, 225).filter(a => !e.hits.includes(a.id)).sort((a, b) => dist(a, e) - dist(b, e) || a.id.localeCompare(b.id))[0];
        if (!next) continue;
        g._effect('slash', e.x, e.y, 25, COLORS.jhin, 0.25, { x2: next.x, y2: next.y }); e.targetId = next.id; e.nextAt = g.time + 0.15;
      } else if (e.kind === 'lux_laser' && !e.fired && e.fireAt <= g.time) {
        e.fired = true;
        const bx = e.x + e.dx * e.range, by = e.y + e.dy * e.range;
        for (const t of enemies(g, h, (e.x + bx) / 2, (e.y + by) / 2, e.range / 2 + 70)) if (lineDistance(t, e.x, e.y, bx, by) <= e.radius + t.r) { consumeLuxMark(g, h, t, { x: e.originX, y: e.originY }); hit(g, h, t, e.damage, 'magic', { lux: true }, e); }
        g._effect('beam', e.x, e.y, e.radius, '#fff7ca', 0.55, { x2: bx, y2: by });
      }
      if (e.kind === 'vision' || e.kind === 'reveal_travel') for (const t of enemies(g, h, e.x, e.y, e.radius)) t.revealedUntil = Math.max(t.revealedUntil || 0, g.time + 0.2);
      kept.push(e);
    }
    g._restoredEffects = kept;
  }

  function controlled(g, h, dt) {
    if (!(h.charmedUntil > g.time)) return false;
    g._cancelAttack(h); h.recallLeft = 0;
    const source = g._byId.get(h.charmSourceId);
    if (source && source.alive) { const oldSpeed = h.speed; h.speed *= 0.45; g._move(h, source.x, source.y, dt, 30); h.speed = oldSpeed; }
    return true;
  }
  function updateHero(g, h, dt) {
    if (!enabled(h)) return false;
    const s = h.restored, key = keyOf(h);
    for (const slot of RECAST_SLOTS) if (s.recasts[slot] && s.recasts[slot].until <= g.time) s.recasts[slot] = null;
    if (s.stackUntil <= g.time && s.buffUntil <= g.time) s.stacks = 0;
    if (s.reloadUntil && s.reloadUntil <= g.time) { s.ammo = 4; s.reloadUntil = 0; }
    if ((key === 'ashe' || key === 'jhin') && s.eCharges < 2 && s.eNextAt <= g.time) {
      s.eCharges++; s.eNextAt = s.eCharges < 2 ? g.time + rankValue(TUNING[key].eRecharge, Math.max(1, h.skillRanks.e)) / (1 + h.abilityHaste / 100) : 0;
    }
    if (!h.alive) { cancelChannel(h); s.spinUntil = 0; return false; }
    if (s.channelUntil && (s.channelUntil <= g.time || h.stunnedUntil > g.time || h.charmedUntil > g.time || h.silencedUntil > g.time)) cancelChannel(h);
    if (key === 'garen') {
      if (g.time - h.lastDamageAt > 8) h.hp = Math.min(h.maxHp, h.hp + h.maxHp * (0.015 + h.level * 0.0008) * dt);
      if (s.spinUntil > g.time && s.spinTicks > 0 && s.spinNextAt <= g.time) {
        const rank = Math.max(1, h.skillRanks.e), amount = rankValue(TUNING.garen.e, rank) + 0.35 * h.damage;
        for (const t of enemies(g, h, h.x, h.y, 165)) hit(g, h, t, amount, 'physical');
        g._effect('slash', h.x, h.y, 165, COLORS.garen, 0.3);
        s.spinTicks--; s.spinNextAt = g.time + Math.max(0.12, (s.spinUntil - g.time) / (s.spinTicks + 1));
      }
    }
    if (s.channelUntil > g.time) {
      if (!h.isPlayer && g.time >= s.channelNextAt) {
        const t = enemies(g, h, h.x, h.y, 1600).filter(t => t.type === 'hero' && g.isVisible(t, h.team) && Math.abs(Math.atan2(Math.sin(Math.atan2(t.y - h.y, t.x - h.x) - s.channelAngle), Math.cos(Math.atan2(t.y - h.y, t.x - h.x) - s.channelAngle))) < 0.65).sort((a, b) => dist(a, h) - dist(b, h))[0];
        if (t) g._cast(h, 'r', t.x, t.y);
      }
      return true;
    }
    return false;
  }
  function cancelChannel(h) { if (h && h.restored) { h.restored.channelUntil = 0; h.restored.channelShots = 0; if (keyOf(h) === 'jhin') closeRecast(h, 'r'); } }
  function canAttack(g, h) {
    return !enabled(h) || !(h.restored.channelUntil > g.time || h.restored.reloadUntil > g.time || h.restored.spinUntil > g.time || h.charmedUntil > g.time);
  }
  function attackSpeed(g, h, value) {
    if (!enabled(h)) return value;
    const s = h.restored;
    if (keyOf(h) === 'ashe' && s.buffUntil > g.time) value *= 1.25 + 0.075 * Math.max(0, h.skillRanks.q - 1);
    if (keyOf(h) === 'leesin' && s.flurryHits && s.flurryUntil > g.time) value *= 1.4;
    return Math.min(value, 3.1);
  }
  // Shared, side-effect-free launch calculation. Randomness and resource use
  // remain in attack(), so inspection cannot reroll a crit or spend a bullet.
  function attackPayload(g, h, t, baseDamage, critical) {
    const s = h.restored, key = keyOf(h);
    let amount = baseDamage;
    const critMultiplier = 2 + (h.critDamageBonus || 0);
    if (key === 'ashe') {
      if (t.frostUntil > g.time) amount *= 1.2 + h.critChance * (critMultiplier - 1);
      if (s.buffUntil > g.time) amount *= 1 + 0.05 * h.skillRanks.q;
    } else if (critical) amount *= critMultiplier * (key === 'jhin' ? 0.86 : 1);
    const empowered = key === 'garen' && s.empoweredUntil > g.time;
    if (empowered) amount += rankValue(TUNING.garen.q, Math.max(1, h.skillRanks.q)) + 0.5 * h.damage;
    const fourth = key === 'jhin' && s.ammo === 1;
    return { damage: amount, data: { key, empowered, fourth, critical, frost: key === 'ashe' } };
  }
  function impactDamage(h, t, amount, data) {
    return amount + (data.fourth && !structure(t) ? (t.maxHp - t.hp) * (0.15 + 0.1 * (h.level - 1) / 17) : 0);
  }
  function previewBasicAttack(g, h, t, baseDamage) {
    if (!enabled(h) || !t || !t.alive || h.team === t.team || !finite(baseDamage) || baseDamage < 0 || g.isProtected(t)) return null;
    const key = keyOf(h), guaranteed = key !== 'ashe' && (key === 'jhin' && h.restored.ammo === 1 || h.critChance >= 1);
    const possible = key !== 'ashe' && (guaranteed || h.critChance > 0);
    const low = attackPayload(g, h, t, baseDamage, guaranteed), high = attackPayload(g, h, t, baseDamage, possible);
    const components = [{ kind: 'physical', label: '기본 공격', rawMin: impactDamage(h, t, low.damage, low.data), rawMax: impactDamage(h, t, high.damage, high.data) }];
    const mark = key === 'lux' && !structure(t) && t.type !== 'ward' ? luxMarkDamage(g, h, t) : 0;
    if (mark) components.push({ kind: 'magic', label: '광채', rawMin: mark, rawMax: mark });
    let rawMin = 0, rawMax = 0, mitigatedMin = 0, mitigatedMax = 0;
    for (const component of components) {
      rawMin += component.rawMin; rawMax += component.rawMax;
      component.mitigatedMin = g._damageValue(t, component.rawMin, h, component.kind);
      component.mitigatedMax = g._damageValue(t, component.rawMax, h, component.kind);
      mitigatedMin += component.mitigatedMin; mitigatedMax += component.mitigatedMax;
    }
    const shield = Math.max(0, t.shield || 0), hp = Math.max(0, t.hp);
    const shieldDamageMin = Math.min(shield, mitigatedMin), shieldDamageMax = Math.min(shield, mitigatedMax);
    const hpDamageMin = Math.min(hp, Math.max(0, mitigatedMin - shieldDamageMin));
    const hpDamageMax = Math.min(hp, Math.max(0, mitigatedMax - shieldDamageMax));
    return { sourceId: h.id, targetId: t.id, snapshotAt: g.time, rawMin, rawMax, mitigatedMin, mitigatedMax,
      shieldDamageMin, shieldDamageMax, hpDamageMin, hpDamageMax,
      guaranteedKill: mitigatedMin + 1e-6 >= hp + shield, possibleKill: mitigatedMax + 1e-6 >= hp + shield,
      critical: guaranteed ? 'guaranteed' : possible ? 'possible' : 'none', components };
  }
  function attack(g, h, t, baseDamage) {
    const s = h.restored, key = keyOf(h);
    const critical = key !== 'ashe' && ((key === 'jhin' && s.ammo === 1) || g._random() < h.critChance);
    const result = attackPayload(g, h, t, baseDamage, critical);
    if (result.data.empowered) s.empoweredUntil = 0;
    if (key === 'jhin') { s.ammo--; if (s.ammo <= 0) s.reloadUntil = g.time + 2.5; if (critical) h.hasteUntil = g.time + 2; }
    if (key === 'leesin' && s.flurryHits > 0 && s.flurryUntil > g.time) { h.mana = Math.min(h.maxMana, h.mana + (s.flurryHits === 2 ? 20 : 10)); s.flurryHits--; }
    return result;
  }
  function attackHit(g, h, t, amount, data, attackOrigin) {
    const hp = t.hp;
    amount = impactDamage(h, t, amount, data);
    const value = g.damage(t, amount, h, 'physical', attackOrigin);
    const hpLost = Math.max(0, hp - t.hp);
    if (!structure(t) && t.type !== 'ward') {
      let steal = h.lifeSteal || 0;
      if (keyOf(h) === 'leesin' && h.restored.lifestealUntil > g.time) steal += 0.05 + h.skillRanks.w * 0.05;
      if (steal && h.alive) g._heal(h, hpLost * steal);
      if (data.frost) {
        t.frostUntil = g.time + 2; g._slow(t, 0.8 - 0.15 * (h.level - 1) / 17, 2);
        if (h.restored.buffUntil <= g.time) h.restored.stacks = Math.min(4, h.restored.stacks + 1);
        h.restored.stackUntil = g.time + 6;
      }
      if (data.empowered && t.alive) { t.silencedUntil = Math.max(t.silencedUntil || 0, g.time + 1.5); if (enabled(t)) cancelChannel(t); }
      if (keyOf(h) === 'lux') consumeLuxMark(g, h, t, attackOrigin);
      if (keyOf(h) === 'jhin') t.jhinMarkedUntil = g.time + 4;
    }
    if (data.critical) g._float(t.x, t.y - 13, '치명타', '#ffe2a0');
    return value;
  }
  function autoCast(g, h, t) {
    const key = keyOf(h), d = dist(h, t), s = h.restored;
    if (s.channelUntil > g.time) return;
    const ready = slot => g.getSkillInfo(slot, h)?.ready;
    const use = slot => g._cast(h, slot, t.x, t.y).ok;
    if (key === 'garen') {
      if (h.hp < h.maxHp * 0.7 && ready('w')) return g._cast(h, 'w');
      if (t.type === 'hero' && d < 225 && t.hp / t.maxHp < 0.45 && ready('r')) return use('r');
      if (d < 180 && ready('e') && s.spinUntil <= g.time) return use('e');
      if (d < 300 && ready('q')) return use('q');
    } else if (key === 'leesin') {
      if (h.hp < h.maxHp * 0.65 && ready('w')) return g._cast(h, 'w');
      if (d < 225 && ready('e')) return use('e');
      if (d < 600 && ready('q')) return use('q');
      if (t.type === 'hero' && d < 225 && ready('r')) return use('r');
    } else if (key === 'lux') {
      if (h.hp < h.maxHp * 0.7 && ready('w')) return g._cast(h, 'w', h.x + 50, h.y);
      if (t.type === 'hero' && d < 1200 && ready('r')) return use('r');
      if (d < 585 && ready('q')) return use('q');
      if (d < 550 && ready('e')) return use('e');
    } else if (key === 'ahri') {
      if (d < 500 && ready('e') && t.type === 'hero') return use('e');
      if (d < 490 && ready('q')) return use('q');
      if (d < 350 && ready('w')) return g._cast(h, 'w');
      if (d < 500 && d > 150 && t.type === 'hero' && ready('r')) return use('r');
    } else if (key === 'ashe') {
      if (d < h.range + 30 && ready('q')) return g._cast(h, 'q');
      if (t.type === 'hero' && d > 220 && ready('r')) return use('r');
      if (d < 600 && ready('w')) return use('w');
    } else if (key === 'jhin') {
      if (t.type === 'hero' && d > 330 && ready('r')) return use('r');
      if (d < 300 && ready('q')) return use('q');
      if (d < 1200 && ready('w')) return use('w');
      if (d < 375 && ready('e')) return use('e');
    }
    return false;
  }
  function death(h) {
    if (!enabled(h)) return;
    const s = h.restored; cancelChannel(h); s.recasts = { q: null, w: null, e: null, r: null };
    s.buffUntil = s.empoweredUntil = s.spinUntil = s.guardUntil = 0; s.stacks = 0;
  }
  function takedown(g, h, target) {
    if (!enabled(h) || !h.alive || keyOf(h) !== 'ahri' || target.team === h.team) return;
    if (target.type === 'hero') g._heal(h, 80 + 8 * h.level + 0.3 * h.abilityPower);
    else if (target.type === 'minion' || target.type === 'monster') {
      h.restored.essenceStacks++;
      if (h.restored.essenceStacks >= 9) { h.restored.essenceStacks = 0; g._heal(h, 50 + 5 * h.level + 0.15 * h.abilityPower); }
    }
  }
  function respawn(h) {
    if (!enabled(h)) return;
    h.rootedUntil = h.silencedUntil = h.charmedUntil = 0; h.charmSourceId = null;
    h.restored.ammo = 4; h.restored.reloadUntil = 0;
  }
  function extraVision(g, x, y, team) { return g._restoredEffects.some(e => e.team === team && e.until > g.time && ['vision', 'reveal_travel'].includes(e.kind) && Math.hypot(e.x - x, e.y - y) <= e.radius); }
  // v8 kept one shared Lee Sin owner on each victim. Preserve every Q target
  // from its caster's recast and reconstruct only the E targets still recorded
  // in that old save; information already overwritten by v8 cannot be guessed.
  function migrateState(g, engineVersion) {
    if (engineVersion >= 9) return;
    for (const h of g.entities) {
      if (!enabled(h) || keyOf(h) !== 'leesin') continue;
      const r = h.restored.recasts.e;
      if (r && !Object.hasOwn(r, 'targetIds')) r.targetIds = g.entities
        .filter(t => t.alive && t.team !== h.team && t.leeMarkedBy === h.id && t.leeEMarkUntil > g.time).map(t => t.id);
    }
    for (const e of g._restoredEffects || []) {
      if (finite(e.originX) && finite(e.originY)) continue;
      const source = g._byId.get(e.sourceId), placed = e.kind === 'lux_zone' || e.kind === 'jhin_trap';
      e.originX = placed ? e.x : source ? source.x : e.x;
      e.originY = placed ? e.y : source ? source.y : e.y;
    }
  }
  function validateHero(h, engineVersion = 9) {
    if (!enabled(h)) return !h.restored;
    const s = h.restored;
    if (!s || s.key !== keyOf(h) || !['ahri', 'ashe', 'garen', 'lux', 'leesin', 'jhin'].includes(s.key)) return false;
    const baseline = fresh(h);
    if (Object.keys(s).some(k => !Object.hasOwn(baseline, k)) || Object.keys(baseline).some(k => !Object.hasOwn(s, k))) return false;
    for (const [key, v] of Object.entries(s)) if (typeof baseline[key] === 'number' && (!finite(v) || (key === 'channelAngle' ? Math.abs(v) > Math.PI : v < 0 || v > 1e8))) return false;
    if (!Number.isInteger(s.castCount) || !Number.isInteger(s.ammo) || s.ammo > 4 || !Number.isInteger(s.eCharges) || s.eCharges > 2 || !Number.isInteger(s.stacks) || s.stacks > 4 || !Number.isInteger(s.essenceStacks) || s.essenceStacks > 8 || s.guardFactor > 1 || !Number.isInteger(s.channelShots) || s.channelShots > 4) return false;
    if (!Number.isInteger(s.spinTicks) || s.spinTicks > 100 || !Number.isInteger(s.flurryHits) || s.flurryHits > 2) return false;
    if (s.lastCastSlot !== null && !RECAST_SLOTS.includes(s.lastCastSlot)) return false;
    if (!s.recasts || Object.keys(s.recasts).length !== 4) return false;
    for (const slot of RECAST_SLOTS) {
      const r = s.recasts[slot];
      if (r === null) continue;
      if (!(s.key === 'leesin' && ['q', 'w', 'e'].includes(slot) || s.key === 'ahri' && slot === 'r' || s.key === 'lux' && slot === 'e' || s.key === 'jhin' && slot === 'r')) return false;
      if (!r || !finite(r.until) || r.until < 0 || !finite(r.nextAt) || r.nextAt < 0 || !Number.isInteger(r.remaining) || r.remaining < 1 || r.remaining > 4) return false;
      if (s.key === 'ahri' && r.remaining > 2 || ['leesin', 'lux'].includes(s.key) && r.remaining !== 1) return false;
      if (r.targetId !== undefined && typeof r.targetId !== 'string' || r.effectId !== undefined && typeof r.effectId !== 'string') return false;
      if (s.key === 'leesin' && slot === 'q' && (typeof r.targetId !== 'string' || !r.targetId.length || r.targetId.length > 96)) return false;
      if (s.key === 'lux' && slot === 'e' && (typeof r.effectId !== 'string' || !r.effectId.length || r.effectId.length > 96)) return false;
      if (r.targetIds !== undefined || s.key === 'leesin' && slot === 'e' && engineVersion >= 9) {
        if (s.key !== 'leesin' || slot !== 'e' || !Array.isArray(r.targetIds) || r.targetIds.length > 512 ||
          r.targetIds.some(id => typeof id !== 'string' || !id.length || id.length > 96) || new Set(r.targetIds).size !== r.targetIds.length) return false;
      }
      if (Object.keys(r).some(k => !['until', 'nextAt', 'remaining', 'targetId', 'effectId', 'targetIds'].includes(k))) return false;
    }
    return true;
  }
  function validateEffects(effects, entities, map, engineVersion = 9) {
    if (!Array.isArray(effects) || effects.length > 128) return false;
    const ids = new Set(entities.keys());
    const fields = new Set(['id', 'sourceId', 'team', 'kind', 'x', 'y', 'originX', 'originY', 'at', 'until', 'radius', 'remaining', 'nextAt', 'damage', 'hits', 'armAt', 'triggerAt', 'fireAt', 'fired', 'dx', 'dy', 'vx', 'vy', 'range', 'targetId']);
    const required = { foxfire: ['remaining', 'nextAt', 'damage'], lux_zone: ['damage', 'nextAt'], jhin_trap: ['armAt', 'triggerAt', 'damage'], reveal_travel: ['remaining', 'vx', 'vy'], vision: [], bounce: ['remaining', 'nextAt', 'damage'], lux_laser: ['fireAt', 'dx', 'dy', 'range', 'damage'] };
    const owners = { foxfire: 'ahri', lux_zone: 'lux', jhin_trap: 'jhin', reveal_travel: 'ashe', vision: 'ashe', bounce: 'jhin', lux_laser: 'lux' };
    for (const e of effects) {
      if (!e || !EFFECTS.has(e.kind) || typeof e.id !== 'string' || !e.id.length || e.id.length > 96 || ids.has(e.id) || !entities.has(e.sourceId) || entities.get(e.sourceId).team !== e.team || !enabled(entities.get(e.sourceId)) || keyOf(entities.get(e.sourceId)) !== owners[e.kind]) return false;
      if (Object.keys(e).some(key => !fields.has(key)) || required[e.kind].some(key => !finite(e[key]))) return false;
      ids.add(e.id);
      for (const key of ['x', 'y', 'at', 'until', 'radius']) if (!finite(e[key]) || e[key] < 0) return false;
      if (e.x > map.width || e.y > map.height || e.radius > 1000) return false;
      if (engineVersion >= 9 || e.originX !== undefined || e.originY !== undefined) {
        if (!finite(e.originX) || !finite(e.originY) || e.originX < 0 || e.originY < 0 || e.originX > map.width || e.originY > map.height) return false;
      }
      for (const key of ['remaining', 'nextAt', 'damage', 'armAt', 'triggerAt', 'fireAt', 'range']) if (e[key] !== undefined && (!finite(e[key]) || e[key] < 0 || e[key] > 1e8)) return false;
      for (const key of ['vx', 'vy', 'dx', 'dy']) if (e[key] !== undefined && (!finite(e[key]) || Math.abs(e[key]) > 1e5)) return false;
      if (e.kind === 'foxfire' && (!Number.isInteger(e.remaining) || e.remaining < 1 || e.remaining > 3 || !e.hits || typeof e.hits !== 'object' || Array.isArray(e.hits) || Object.entries(e.hits).length > 3 || Object.entries(e.hits).some(([key, n]) => !key.length || key.length > 96 || !Number.isInteger(n) || n < 1 || n > 3))) return false;
      if (e.kind === 'bounce' && (!Array.isArray(e.hits) || e.hits.length > 4 || !e.hits.every(v => typeof v === 'string' && v.length > 0 && v.length <= 96) || new Set(e.hits).size !== e.hits.length || typeof e.targetId !== 'string' || !e.targetId.length || e.targetId.length > 96 || !Number.isInteger(e.remaining) || e.remaining < 1 || e.remaining > 4)) return false;
      if (e.kind === 'lux_laser' && typeof e.fired !== 'boolean') return false;
    }
    return true;
  }
  const api = { enabled, initHero, describe, cast, updateProjectile, updateEffects, controlled, updateHero, canAttack, attackSpeed,
    attack, attackHit, previewBasicAttack, autoCast, death, respawn, takedown, cancelChannel, extraVision, migrateState, validateHero, validateEffects, PROJECTILES, TUNING };
  root.NexusRestoredGameplay = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
