// Original deck recipes and opponents. Difficulty is selected independently.
// Arrays are immutable so editing a player's draft never changes a preset.
const preset = (id, name, subtitle, description, cards) => Object.freeze({
  id, name, subtitle, description, cards: Object.freeze(cards),
});

export const DECK_PRESETS = Object.freeze([
  preset('beatdown', '거인의 행진', '튼튼한 전열 · 묵직한 한 방',
    '거인을 후방에 배치하고 총사와 폭탄병을 붙이세요. 강철 검사로 큰 적을 막은 뒤 살아남은 병력과 역공합니다.',
    ['giant', 'duelist', 'musketeer', 'bomber', 'minions', 'goblins', 'fireball', 'zap']),
  preset('rapid', '번개의 질주', '빠른 순환 · 양쪽 레인 압박',
    '대포와 저렴한 병력으로 수비한 뒤 돌격 기수를 보내세요. 얼음 정령과 감전으로 기수의 공격 시간을 벌 수 있습니다.',
    ['hog_rider', 'knight', 'musketeer', 'skeletons', 'ice_spirit', 'cannon', 'fireball', 'zap']),
  preset('control', '안개의 성채', '수비와 역공 · 지속 피해',
    '광역 수비와 대공 병력으로 공격을 받아낸 뒤 돌격 기수로 역공합니다. 독 안개는 한곳에 머무르는 병력과 건물을 함께 노리세요.',
    ['hog_rider', 'valkyrie', 'archers', 'spear_goblins', 'cannon', 'poison', 'arrows', 'ice_spirit']),
  preset('phalanx', '방패의 진군', '밀집 방어 · 지휘하는 돌격',
    '밀집보병 뒤에 원거리 지원을 붙이세요. 방패벽으로 공격을 받아낸 뒤 엘릭서 1의 방패 돌격으로 대형을 풀어 돌진합니다.',
    ['phalanx', 'musketeer', 'archers', 'bomber', 'minions', 'cannon', 'arrows', 'zap']),
]);

const opponent = (id, name, subtitle, description, style, deck) => Object.freeze({
  id, name, subtitle, description, style, deck: Object.freeze([...deck]),
});

export const OPPONENTS = Object.freeze([
  opponent('bran', '철벽의 브란', '거인과 지원 병력의 진군',
    '엘릭서를 모아 거인 뒤에 병력을 쌓습니다. 전열이 완성되기 전에 반대쪽을 압박하거나 지원 병력을 먼저 정리하세요.',
    'beatdown', DECK_PRESETS[0].cards),
  opponent('luna', '질주의 루나', '틈을 파고드는 빠른 순환',
    '돌격 기수를 자주 보내고 상대 병력이 몰린 레인의 반대편을 노립니다. 수비 건물을 아껴두면 급습을 막기 좋습니다.',
    'cycle', DECK_PRESETS[1].cards),
  opponent('sera', '안개의 세라', '침착한 수비와 독 안개',
    '수비에 엘릭서를 남겨두고 살아남은 병력으로 역공합니다. 좁은 곳에 병력을 겹쳐 배치하면 독 안개의 표적이 됩니다.',
    'control', DECK_PRESETS[2].cards),
]);
