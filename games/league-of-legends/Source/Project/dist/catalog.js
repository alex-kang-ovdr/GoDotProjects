/* Restored data codex: bounded rendering of the pinned source catalogue. */
(function (root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize = value => String(value ?? '').toLocaleLowerCase().replace(/\s+/g, '');
  const match = (entry, query) => !query || [entry.name, entry.nameEn, entry.key, entry.sourceId, entry.id].some(value => normalize(value).includes(query));
  function filterChampions(data, query = '', scope = 'all') {
    const key = normalize(query);
    return (data.champions || []).filter(entry => match(entry, key) && (scope !== 'playable' || entry.playableId)).sort((a,b) => a.name.localeCompare(b.name, 'ko'));
  }
  function filterItems(data, query = '', scope = 'all') {
    const key = normalize(query);
    return (data.items || []).filter(entry => match(entry, key) && (scope !== 'playable' || entry.playable) && (scope !== 'sr' || entry.srCandidate)).sort((a,b) => Number(a.cost) - Number(b.cost) || a.name.localeCompare(b.name, 'ko'));
  }
  const formatArray = values => Array.isArray(values) && values.length ? values.map(value => value === null ? '—' : Number.isFinite(value) ? Number(value.toFixed(3)) : String(value)).join(' / ') : '—';
  const labels = { hp:'체력', hpperlevel:'체력 성장', mp:'자원', mpperlevel:'자원 성장', attackdamage:'공격력', attackdamageperlevel:'공격력 성장', armor:'방어력', armorperlevel:'방어력 성장', spellblock:'마법 저항력', spellblockperlevel:'마법 저항력 성장', movespeed:'이동 속도', attackrange:'공격 사거리', attackspeed:'공격 속도', attackspeedperlevel:'공격 속도 성장(%)', hpregen:'체력 재생', hpregenperlevel:'체력 재생 성장', mpregen:'자원 재생', mpregenperlevel:'자원 재생 성장', crit:'치명타 확률', critperlevel:'치명타 성장', FlatHPPoolMod:'체력', FlatMPPoolMod:'마나', FlatPhysicalDamageMod:'공격력', FlatMagicDamageMod:'주문력', FlatArmorMod:'방어력', FlatSpellBlockMod:'마법 저항력', FlatMovementSpeedMod:'이동 속도', PercentAttackSpeedMod:'공격 속도(비율)', FlatCritChanceMod:'치명타 확률(비율)', PercentLifeStealMod:'생명력 흡수(비율)' };
  const statsHTML = stats => Object.entries(stats || {}).filter(([,v]) => v !== 0).map(([key,value]) => `<div><span>${esc(labels[key] || key)}</span><strong>${esc(value)}</strong></div>`).join('') || '<p class="codex-muted">구조화 스탯이 없습니다.</p>';

  function create(options) {
    const doc = options.document || document, data = options.data, pageSize = 24;
    const get = id => doc.getElementById(id);
    let type = 'champions', selectedId = null, page = 0, lastContext = null;
    function entries() { return type === 'champions' ? filterChampions(data, get('catalog-search').value, get('catalog-scope').value) : filterItems(data, get('catalog-search').value, get('catalog-scope').value); }
    function setType(value) {
      type = value === 'items' ? 'items' : 'champions'; selectedId = null; page = 0;
      get('catalog-search').value = '';
      get('catalog-search').placeholder = type === 'champions' ? '챔피언 이름 · 영문 이름 검색' : '아이템 이름 · ID 검색';
      get('catalog-scope').innerHTML = `<option value="all">전체 데이터</option><option value="playable">${type === 'champions' ? '플레이 가능' : '게임 상점 지원'}</option>${type === 'items' ? '<option value="sr">협곡 상점 후보</option>' : ''}`;
      get('catalog-scope').value = 'all';
      doc.querySelectorAll('[data-catalog-tab]').forEach(button => { button.classList.toggle('selected', button.dataset.catalogTab === type); button.setAttribute('aria-selected', button.dataset.catalogTab === type); });
      render();
    }
    function render() {
      const found = entries();
      page = Math.min(page, Math.max(0, Math.ceil(found.length / pageSize) - 1));
      const visible = found.slice(page * pageSize, (page + 1) * pageSize);
      if (!visible.some(entry => String(entry.id) === selectedId)) selectedId = visible.length ? String(visible[0].id) : null;
      get('catalog-list').innerHTML = visible.map(entry => `<button class="codex-entry ${String(entry.id) === selectedId ? 'selected' : ''}" data-catalog-id="${esc(entry.id)}" aria-pressed="${String(entry.id) === selectedId}"><strong>${esc(entry.name)}</strong><small>${esc(entry.nameEn || entry.key || entry.sourceId)}</small><span class="codex-entry-state ${entry.playableId || entry.playable ? 'available' : ''}">${type === 'champions' ? entry.playableId ? '플레이 가능' : '도감' : entry.playable ? '상점 지원' : '도감'}</span></button>`).join('') || '<p class="codex-empty">검색 결과가 없습니다.</p>';
      get('catalog-count').textContent = `${found.length}개 · ${found.length ? page * pageSize + 1 : 0}–${Math.min((page + 1) * pageSize, found.length)}`;
      get('catalog-page').textContent = `${page + 1} / ${Math.max(1, Math.ceil(found.length / pageSize))}`;
      get('catalog-prev').disabled = page <= 0;
      get('catalog-next').disabled = (page + 1) * pageSize >= found.length;
      detail(found.find(entry => String(entry.id) === selectedId));
    }
    function detail(entry) {
      const target = get('catalog-detail');
      if (!entry) { target.innerHTML = '<p class="codex-empty">다른 이름으로 검색해 보세요.</p>'; return; }
      const hero = type === 'champions' ? (data.playableHeroes || []).find(h => h.id === entry.playableId) : null;
      const item = type === 'items' ? (data.shopItems || []).find(i => i.id === entry.id) : null;
      const portrait = hero?.portrait || item?.portrait;
      const heading = `<div class="codex-detail-heading">${portrait ? `<img src="${esc(portrait)}" alt="" width="64" height="64">` : '<span class="codex-detail-glyph">◇</span>'}<div><span class="eyebrow">${type === 'champions' ? 'CHAMPION' : 'ITEM'} · ${esc(entry.key || entry.sourceId)}</span><h3>${esc(entry.name)}</h3><p>${esc(entry.title || entry.nameEn)}</p></div></div>`;
      if (type === 'champions') {
        const casting = (entry.spells || []).map(spell => `<details class="codex-spell"><summary><b>${esc(spell.slot.toUpperCase())}</b><strong>${esc(spell.name)}</strong><small>${spell.maxRank}단계</small></summary><dl><dt>재사용(초)</dt><dd>${esc(formatArray(spell.cooldownByRank))}</dd><dt>소모 자원</dt><dd>${esc(formatArray(spell.costByRank))}</dd><dt>원본 사거리</dt><dd>${esc(formatArray(spell.rangeByRank))}</dd></dl>${hero?.skills?.[spell.slot]?.description ? `<p>${esc(hero.skills[spell.slot].description)}</p>` : ''}<small class="codex-muted">피해 공식·특수 판정은 정적 배열만으로 확정되지 않습니다.</small></details>`).join('');
        target.innerHTML = heading + `<div class="codex-state">${hero ? '이 챔피언으로 플레이할 수 있습니다.' : '데이터 수록 · 전투 동작은 아직 지원하지 않습니다.'}</div><div class="codex-stats">${statsHTML(entry.stats)}</div><h4>Q · W · E · R</h4>${casting}<p class="codex-note">위 수치는 원작 데이터 단위입니다. 웹 전장에서는 이동·거리 단위를 0.5배로 변환합니다. 피해·충돌·일부 특수 효과는 이 게임의 재구성 규칙을 사용합니다.</p>${hero ? `<button class="secondary-button" id="catalog-select-hero" ${lastContext?.canSelect === false ? 'disabled' : ''}>${lastContext?.canSelect === false ? '다음 경기에서 선택 가능' : `${esc(entry.name)} 선택하고 준비 화면으로`}</button>` : ''}`;
      } else {
        const recipe = (entry.components || []).map(id => data.items.find(i => i.id === id)?.name || id).join(' + ');
        target.innerHTML = heading + `<div class="codex-price"><span>가격 <strong>${entry.cost}G</strong></span><span>판매 <strong>${entry.sell}G</strong></span></div><div class="codex-state">${entry.playable ? '게임 상점에서 구매 가능' : '도감 수록 · 게임 상점 미지원'}${entry.srCandidate ? ' · 협곡 정적 후보' : ''}</div><h4>구조화 능력치</h4><div class="codex-stats">${statsHTML(entry.stats)}</div><h4>조합 재료</h4><p>${esc(recipe || '기본 아이템 / 공개 조합 없음')}</p>${item ? `<h4>게임에 적용되는 효과</h4><p>${esc(item.description)}</p>` : '<p class="codex-note">이 아이템의 설명 전용 효과나 사용 조건은 아직 게임에 연결하지 않았습니다.</p>'}<p class="codex-note">전체 목록에는 여러 모드·특수 업그레이드가 포함됩니다. 협곡 후보 여부만으로 실제 구매 조건을 확정하지 않습니다.</p>`;
      }
      if (entry.source && /^https:\/\//.test(entry.source)) target.innerHTML += `<a class="codex-source" href="${esc(entry.source)}" target="_blank" rel="noopener noreferrer">공식 정적 데이터 · ${esc(data.version)} ↗</a>`;
      // Bind after completing the markup, so each action has one handler.
      if (hero) get('catalog-select-hero').addEventListener('click', () => { if (lastContext?.canSelect !== false) options.onChooseHero?.(hero.id); });
    }
    doc.querySelectorAll('[data-catalog-tab]').forEach(button => button.addEventListener('click', () => setType(button.dataset.catalogTab)));
    get('catalog-search').addEventListener('input', () => { page = 0; selectedId = null; render(); });
    get('catalog-scope').addEventListener('change', () => { page = 0; selectedId = null; render(); });
    get('catalog-list').addEventListener('click', event => {
      const button = event.target.closest('[data-catalog-id]');
      if (button) { selectedId = button.dataset.catalogId; render(); }
    });
    get('catalog-prev').addEventListener('click', () => { page--; render(); });
    get('catalog-next').addEventListener('click', () => { page++; render(); });
    return { open(context = {}) {
      lastContext = context;
      setType(context.type || 'champions');
      if (context.heroId && type === 'champions') {
        const found = entries(), at = found.findIndex(entry => entry.playableId === context.heroId);
        if (at >= 0) { selectedId = String(found[at].id); page = Math.floor(at / pageSize); render(); }
      }
      get('catalog-summary').textContent = `챔피언 ${data.champions.length}명 · 아이템 ${data.items.length}개 · 데이터 ${data.version}`;
    }, render };
  }
  const api = { create, filterChampions, filterItems, formatArray };
  root.NexusCatalog = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
