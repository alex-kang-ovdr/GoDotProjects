/* Nexus Front: observable battle guidance and role-based equipment recommendations. */
(function (root) {
  'use strict';

  let rules = root.NexusGame;
  if (!rules && typeof module !== 'undefined' && module.exports) rules = require('./game.js');
  const { ITEMS, MAP } = rules;
  const ITEM_BY_ID = Object.fromEntries(ITEMS.map(item => [item.id, item]));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const STRUCTURES = new Set(['tower', 'inhibitor', 'nexus']);
  const MILESTONES = [
    { id: 'equipment', title: '출전 장비', description: '시작 장비를 선택하거나 상점에서 아이템을 구매하세요.' },
    { id: 'move', title: '전장 탐색', description: '시작 지점에서 100 이상 떨어진 곳으로 이동하세요. 점멸·귀환도 위치 이동에 포함됩니다.' },
    { id: 'skill', title: '스킬 사용', description: '학습한 Q·W·E·R 중 하나를 시전하세요. Q는 처음부터 사용할 수 있습니다.' },
    { id: 'cs', title: '첫 CS', description: '미니언 또는 일반 정글 몬스터를 마지막 타격으로 처치하세요.' },
    { id: 'growth', title: '스킬 성장', description: '레벨을 올리고 스킬 포인트를 한 번 투자하세요.' },
    { id: 'structure', title: '첫 구조물', description: '팀과 함께 적 구조물 하나를 파괴하세요. 개인 마지막 타격은 필요하지 않습니다.' }
  ];
  const BUILDS = {
    mage: ['crown', 'boots', 'heart', 'plate'],
    warrior: ['edge', 'boots', 'plate', 'heart'],
    ranger: ['bow', 'boots', 'edge', 'heart', 'plate']
  };
  const WHY = {
    focus: '주문력과 마나로 리아의 스킬 교전을 강화합니다.',
    crown: '별빛 수정을 조합해 주문력과 체력을 함께 높입니다.',
    blade: '기본 공격과 물리 스킬의 피해를 높입니다.',
    edge: '새벽의 검을 조합해 공격력과 체력을 함께 높입니다.',
    bow: '공격 속도와 공격력으로 지속적인 기본 공격을 강화합니다.',
    boots: '이동 속도를 높여 합류와 위험 회피를 돕습니다.',
    plate: '방어력과 체력으로 물리 공격을 견딥니다.',
    heart: '최대 체력을 높여 교전에서 생존할 여유를 만듭니다.'
  };

  function starter(heroId) {
    return heroId === 'warrior' ? 'blade' : heroId === 'ranger' ? 'bow' : 'focus';
  }

  function inventoryOf(player) {
    return (Array.isArray(player.inventory) ? player.inventory : [])
      .map(value => typeof value === 'string' ? value : value && value.id);
  }

  function atShop(game) {
    return !game.player.alive || distance(game.player, MAP.bases[game.player.team === 1 ? 1 : 0]) <= 180;
  }

  function recommend(game) {
    const player = game.player, inventory = inventoryOf(player), shop = atShop(game);
    const candidates = [];
    for (const finalId of BUILDS[player.hero] || BUILDS.mage) {
      if (inventory.includes(finalId)) continue;
      const final = ITEM_BY_ID[finalId];
      const component = (final.components || []).find(id => !inventory.includes(id));
      const itemId = component || finalId;
      const info = game.getPurchaseInfo(itemId);
      const cost = finite(info.cost) ? info.cost : 0;
      const consumed = Array.isArray(info.consumedIndices) ? info.consumedIndices.length : 0;
      candidates.push({ itemId, title: ITEM_BY_ID[itemId].name,
        reason: WHY[itemId], cost, canBuy: info.canBuy === true,
        missingGold: Math.max(0, Math.ceil(cost - player.gold)),
        atShop: shop, complete: false, blockedBySlots: inventory.length - consumed >= 6 });
    }
    if (!candidates.length) return { itemId: null, title: '핵심 빌드 완성',
      reason: '추천 핵심 장비를 갖췄습니다. 남은 슬롯은 전황에 맞게 선택하세요.',
      cost: 0, canBuy: false, missingGold: 0, atShop: shop, complete: true, blockedBySlots: false };
    // A full inventory must still recommend a possible component upgrade.
    const result = candidates.find(candidate => !candidate.blockedBySlots) || candidates[0];
    if (result.blockedBySlots) result.reason = '새 장비를 넣을 공간이 없습니다. 상점에서 기존 장비를 판매하거나 보유 재료를 조합하세요.';
    return result;
  }

  function normalizeJourney(game, previous) {
    const p = game.player, saved = object(previous) && previous.version === 1 ? previous : {};
    const origin = object(saved.origin) && finite(saved.origin.x) && finite(saved.origin.y) &&
      saved.origin.x >= 0 && saved.origin.x <= MAP.width && saved.origin.y >= 0 && saved.origin.y <= MAP.height
      ? { x: saved.origin.x, y: saved.origin.y } : { x: p.x, y: p.y };
    const completed = {};
    for (const milestone of MILESTONES) completed[milestone.id] = !!(object(saved.completed) && saved.completed[milestone.id] === true);
    return { version: 1, origin, completed };
  }

  function updateJourney(game, previous) {
    const journey = normalizeJourney(game, previous), p = game.player;
    const observed = {
      equipment: inventoryOf(p).length > 0,
      move: game.started && p.alive && distance(p, journey.origin) >= 100,
      skill: game.started && ['q', 'w', 'e', 'r'].some(slot => finite(p.cd?.[slot]) && p.cd[slot] > 0),
      cs: p.cs > 0,
      growth: ['q', 'w', 'e', 'r'].reduce((sum, slot) => sum + (p.skillRanks?.[slot] || 0), 0) > 1,
      structure: game.started && game.entities.some(entity => STRUCTURES.has(entity.type) && entity.team === 1 - p.team && !entity.alive)
    };
    for (const milestone of MILESTONES) journey.completed[milestone.id] ||= observed[milestone.id] === true;
    return journey;
  }

  function advice(id, title, description, tone, action) {
    return { id, title, description, tone: tone || 'info', action: action || null };
  }

  function battleAdvice(game, journey) {
    const p = game.player, team = p.team, enemyTeam = 1 - team, now = game.time;
    const build = recommend(game);
    if (game.over) return advice('finished', game.winner === team ? '전선 돌파 성공' : '경기 종료',
      '전투 보고서에서 성장과 팀 기여를 확인하고 다음 경기를 준비하세요.', game.winner === team ? 'good' : 'info');
    if (!game.started) return advice('prepare', '장비를 갖추고 출전하세요',
      '영웅에 맞는 시작 장비를 고르고 세 공격로의 전투를 시작하세요.');
    if (!p.alive) return advice('respawn', '부활을 준비하세요',
      build.canBuy ? `${build.title}을 구매할 수 있습니다. 부활 대기 중에는 어디서든 거래할 수 있습니다.` :
        '사망 분석으로 위험을 확인하세요. 부활 후에도 레벨·골드·장비는 유지됩니다.', 'info', build.canBuy ? 'shop' : null);

    const hazard = (game.getHazards ? game.getHazards(team) : [])
      .filter(h => h.at > now && distance(p, h) <= h.radius + p.r + 12)
      .sort((a, b) => a.at - b.at)[0];
    if (hazard) return advice('hazard', '예고 원 밖으로 이동하세요',
      `${hazard.label} · ${(Math.max(0, hazard.at - now)).toFixed(1)}초 뒤 타격됩니다.`, 'danger');
    const targetedTower = game.entities.find(entity => entity.type === 'tower' && entity.alive &&
      entity.team === enemyTeam && !game.isProtected(entity) && game.isVisible(entity, team) &&
      distance(entity, p) <= entity.range + p.r + 40 &&
      (entity.targetId === p.id || entity.aggroTargetId === p.id));
    if (targetedTower) return advice('tower', '포탑 사거리에서 벗어나세요',
      '포탑이 당신을 조준합니다. 같은 영웅에게 연속 발사하면 피해가 더 커집니다.', 'danger');
    if (p.recallLeft > 0) return advice('recalling', '귀환 중 · 위치를 유지하세요',
      '이동·스킬·피격은 귀환을 취소합니다. 도착 후 회복과 장비 구매를 준비하세요.');
    const visibleEnemies = game.entities.filter(entity => entity.alive && entity.team === enemyTeam &&
      ['hero', 'minion'].includes(entity.type) && game.isVisible(entity, team));
    const closeEnemies = visibleEnemies.some(entity => distance(entity, p) < 500);
    // Only observed threats inform advice. The message describes visible safety,
    // not a guarantee about enemies still hidden by fog of war.
    const quiet = !closeEnemies && now - (p.lastDamageAt || 0) > 3.2;
    if (p.hp / p.maxHp <= 0.3) {
      if (build.atShop) return advice('recover', '기지에서 체력을 회복하세요', '회복을 기다린 뒤 미니언과 함께 전선으로 복귀하세요.');
      return quiet ? advice('recall-low', '귀환으로 체력을 회복하세요',
        '주변에 보이는 적이 없습니다. 안전한 위치를 확인한 뒤 귀환하세요.', 'info', 'recall') :
        advice('retreat', '교전을 벗어나세요', '체력이 부족합니다. 아군 쪽으로 이동해 거리를 벌린 뒤 귀환하세요.', 'danger');
    }
    const baseThreats = visibleEnemies.filter(entity => distance(entity, MAP.bases[team]) < 570);
    if (baseThreats.length && game.order?.type !== 'defend') return advice('defend', '기지 근처의 적을 막으세요',
      '아군 시야에 들어온 적이 기지 가까이 있습니다. 팀에 기지 방어를 지시할 수 있습니다.', 'danger', 'defend');
    if (p.skillPoints > 0) return advice('upgrade', '사용하지 않은 스킬 포인트',
      `${p.skillPoints}포인트가 남았습니다. 스킬을 강화하거나 추천 배분을 사용하세요.`, 'good', 'upgrade');
    if (!build.complete && !build.blockedBySlots && build.missingGold === 0) {
      if (build.canBuy) return advice('shop', `${build.title} 구매 가능`, `${build.reason} 현재 결제액은 ${build.cost}골드입니다.`, 'good', 'shop');
      if (!build.atShop && quiet) return advice('recall-item', '모은 골드를 장비로 바꾸세요',
        `${build.title}에 필요한 ${build.cost}골드를 모았습니다. 안전을 확인하고 귀환하세요.`, 'info', 'recall');
    }
    if (game.order && game.order.expiresAt > now) return advice('order',
      { dragon: '드래곤 공략에 합류하세요', boss: '심연 거인 공략에 합류하세요', push: '미니언과 중앙을 압박하세요', defend: '기지 방어에 합류하세요', rally: '집결 지점으로 합류하세요' }[game.order.type] || '팀과 함께 움직이세요',
      `팀 지시가 ${Math.ceil(game.order.expiresAt - now)}초 남았습니다. 아군이 합류하는 동안 무리한 진입을 피하세요.`);

    if (p.hp / p.maxHp >= 0.65 && !closeEnemies) {
      const ready = game.entities.filter(entity => entity.type === 'monster' && entity.alive &&
        ['boss', 'dragon'].includes(entity.kind) && p.level >= (entity.kind === 'boss' ? 9 : 4) &&
        distance(p, { x: entity.homeX, y: entity.homeY }) <= 900)
        .sort((a, b) => (b.kind === 'boss') - (a.kind === 'boss'));
      for (const objective of ready) {
        const allies = game.entities.filter(entity => entity.type === 'hero' && entity.team === team &&
          entity.id !== p.id && entity.alive && !entity.retreating && entity.recallLeft <= 0 &&
          entity.hp / entity.maxHp >= 0.5 && distance(entity, { x: objective.homeX, y: objective.homeY }) < 900);
        if (allies.length) return advice('objective-' + objective.kind, `${objective.name} 공략 준비`,
          '팀에 합류를 요청하고 시야를 확보하세요. 혼자 먼저 공격하지 말고 아군과 함께 진입하세요.', 'good', objective.kind);
      }
    }
    if (!journey.completed.cs) return advice('first-cs', '미니언 마지막 타격을 노리세요',
      '금색 체력바 표식은 기본 공격 한 번으로 처치 가능한 적 미니언입니다. 자동 공격은 Space로 전환합니다.');
    const next = game.entities.filter(entity => entity.alive && entity.team === enemyTeam && STRUCTURES.has(entity.type) &&
      (entity.lane === p.lane || entity.lane === 'base') && !game.isProtected(entity))
      .sort((a, b) => distance(a, p) - distance(b, p))[0];
    return advice('push', next ? `${next.name}을 향해 전진하세요` : '아군 미니언과 함께 전진하세요',
      '미니언이 앞서 도착한 뒤 공성하세요. 앞선 구조물을 파괴하면 다음 목표가 열립니다.', 'info', 'push');
  }

  function read(game, previous) {
    const journey = updateJourney(game, previous);
    return { journey, milestones: MILESTONES.map(milestone => ({ ...milestone, done: journey.completed[milestone.id] })),
      advice: battleAdvice(game, journey) };
  }

  const api = { starter, recommend, read, updateJourney };
  root.NexusCoach = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
