import { getResearchStatus, researchTechName, RESEARCH_TYPE_NAMES_KO, RESEARCH_BUILDING_NAMES_KO } from './research.js';

import { BUILDINGS } from './engine.js';

const unlockName = (id,game) => game.restoredRules&&id==='steamRocket'?'증기 엔진':({pipe:'액체관',gaspipe:'기체관'}[id] || BUILDINGS[id]?.name || id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const pointText = (costs,progress) => Object.entries(costs).filter(([,value])=>value>0).map(([kind,value])=>`${RESEARCH_TYPE_NAMES_KO[kind]||kind} ${progress?`${Math.floor(progress[kind]||0)} / `:''}${value}`).join(' · ') || '비용 없음';

/** Return a standalone research panel fragment. app.js owns the dialog and event delegation. */
export function renderResearchPanel(game) {
  if (!game?.modernRules) return '<p class="research-empty">4.3 원작 규칙 기지에서 연구 트리를 사용할 수 있어요.</p>';
  const rows = getResearchStatus(game);
  const selected = game.researchProgress?.selected;
  const grouped = new Map();
  for (const row of rows) { const group = grouped.get(row.tier) || []; group.push(row); grouped.set(row.tier, group); }
  const current = selected ? rows.find(row=>row.id===selected) : null;
  const queue = (game.researchProgress?.queue||[]).map(id=>rows.find(row=>row.id===id)?.name).filter(Boolean);
  const intro = current
    ? `<div class="research-current"><span>현재 목표</span><b>${esc(current.name)}</b><small>${esc(pointText(current.costs,current.progress))}</small></div>`
    : '<div class="research-current"><span>현재 목표</span><b>기술을 선택하세요</b><small>선행 기술과 연구 재료가 준비된 항목을 선택해 시작합니다.</small></div>';
  const queueMarkup=queue.length?`<div class="research-queue"><b>연구 대기열</b><span>${queue.map(esc).join(' → ')}</span><small>작업 우선순위가 높은 건설·운영을 마친 뒤 연구합니다.</small><button type="button" data-research-clear>대기열 비우기</button></div>`:'';
  const tiers = [...grouped.entries()].sort((a,b)=>a[0]-b[0]).map(([tier,techs])=>
    `<details class="research-tier-group" ${tier<=3?'open':''}><summary>연구 단계 ${tier}<small>${techs.filter(row=>row.complete).length} / ${techs.length} 완료</small></summary><div class="research-tech-list">${techs.map(row=>{
      const pct=Object.entries(row.costs).reduce((sum,[kind,cost])=>sum+(cost>0?Math.min(1,(row.progress[kind]||0)/cost):0),0)/Math.max(1,Object.values(row.costs).filter(cost=>cost>0).length);
      const reason=row.complete?'완료':row.unsupportedKinds.length?`필요 포인트 미지원 · ${row.unsupportedKinds.map(k=>RESEARCH_TYPE_NAMES_KO[k]||k).join(', ')}`:row.queued?`대기 · 선행 ${row.missingPrerequisites.length}`:row.missingPrerequisites.length?`선행 대기 · ${row.missingPrerequisites.length}개 기술을 자동 추가`:row.available?'선택 가능':'잠김';
      return `<button type="button" class="research-tech ${row.complete?'complete':''} ${row.selected?'selected':''} ${row.queued?'queued':''}" data-research-tech="${esc(row.id)}" ${row.queueable?'':'disabled'}><span class="research-tech-main"><b>${esc(row.name)}</b><small>${esc(pointText(row.costs,row.selected||row.complete||Object.keys(row.progress).length?row.progress:null))}</small></span><span class="research-tech-status">${esc(reason)}</span><i class="research-progress"><i style="width:${(pct*100).toFixed(1)}%"></i></i>${row.unlocks.length?`<small class="research-unlock">해금 · ${row.unlocks.filter(id=>id!=='wastepipe'&&(game.restoredRules||!['researchModule','commandModule'].includes(id))).map(id=>esc(unlockName(id,game))).join(', ')}</small>`:''}</button>`;
    }).join('')}</div></details>`).join('');
  return `${intro}${queueMarkup}<label class="research-search-label">기술 찾기<input type="search" data-research-search placeholder="기술 이름 검색" autocomplete="off"></label><p class="research-points-note">${RESEARCH_BUILDING_NAMES_KO.research}는 흙 50kg, ${RESEARCH_BUILDING_NAMES_KO.supercomputer}는 저장 청수 50kg, ${RESEARCH_BUILDING_NAMES_KO.planetarium}는 데이터 뱅크 1kg을 연구 점수 1점으로 처리합니다.</p><div class="research-tree-list">${tiers}</div>`;
}
