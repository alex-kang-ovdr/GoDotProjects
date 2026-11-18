import { getCardEvidence } from './reconstruction.js';

// Pure markup shared by the external card inspector, detail dialog and live lab.
// Research text and source links are always escaped before entering the DOM.
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const display = value => typeof value === 'number' ? String(Number(value.toFixed(5))) :
  typeof value === 'boolean' ? value ? '있음' : '없음' : typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '—');
const sourceLinks = rows => [...new Set(rows.flatMap(row => row.sourceUrls || []))]
  .filter(url => /^https:\/\//.test(url)).map((url, index) => `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">공식 근거 ${index + 1} ↗</a>`).join('');

export function evidenceMarkup(cardId, profile, liveCard) {
  if (!liveCard) return '<p class="evidence-note">이 전투 규칙에서는 사용할 수 없는 카드입니다.</p>';
  const info = getCardEvidence(cardId, profile, liveCard);
  const sourceRows = [...info.fields, ...info.behaviors];
  const applied = info.fields.filter(field => field.applied).length;
  const matched = info.fields.filter(field => field.matchesEvidence && !field.applied).length;
  const fields = info.fields.map(field => {
    const tone = field.applied ? field.evidenceStatus === 'derived' ? 'derived' : 'confirmed' : field.matchesEvidence ? 'manual' : 'custom';
    const status = field.applied ? field.evidenceStatus === 'derived' ? '조건부 계산 적용' : '근거 수치 적용' :
      field.matchesEvidence ? '근거값 일치 · 수동 설정' : '현재 값 다름';
    return `<li class="evidence-field"><div><strong>${escape(field.label)}</strong><span class="evidence-badge ${tone}">${status}</span></div><p>현재 <b>${escape(display(field.liveValue))}</b><span>근거 ${escape(display(field.value))}</span></p><small>${escape(field.notes)}</small></li>`;
  }).join('');
  const behaviors = info.behaviors.map(row => `<li><strong>${escape(row.label)}</strong><span class="evidence-badge ${row.applied ? 'confirmed' : 'custom'}">${row.applied ? '규칙 재현' : '조절됨'}</span><p>${escape(row.notes)}</p></li>`).join('');
  const prototype = info.prototypeFields.map(row => `<div><dt>${escape(row.label)}</dt><dd>${escape(display(row.value))}</dd></div>`).join('');
  const blocked = info.blocked.map(row => `<li><strong>${escape(row.label)}</strong><p>${escape(row.notes)}</p><small>${escape((row.recordIds || []).join(' · '))}</small></li>`).join('');
  return `<div class="evidence-head"><strong>데이터 근거</strong><span>${applied ? `${applied}개 수치 적용` : matched ? `${matched}개 수치 일치` : '자체 수치'}</span></div>
    <p class="evidence-note">${escape(info.profileName)} · 공개 자료의 부분 재구축</p>
    ${fields ? `<ul class="evidence-fields">${fields}</ul>` : '<p class="evidence-note">이 카드에 자동 적용할 원작 수치는 확보되지 않았습니다.</p>'}
    ${behaviors ? `<details class="evidence-details"><summary>행동 규칙 ${info.behaviors.length}개</summary><ul class="evidence-behaviors">${behaviors}</ul></details>` : ''}
    ${prototype ? `<details class="evidence-details"><summary>자체 보완·조절값 ${info.prototypeFields.length}개</summary><dl class="prototype-values">${prototype}</dl><p class="evidence-note">체력·사거리 등 미확인 항목은 이 게임의 설정값입니다.</p></details>` : ''}
    ${blocked ? `<details class="evidence-details"><summary>적용 제외 근거 ${info.blocked.length}개</summary><ul class="evidence-blocked">${blocked}</ul></details>` : ''}
    ${sourceRows.length ? `<details class="evidence-details"><summary>출처 · ${escape(info.researchAsOf)}</summary><div class="evidence-links">${sourceLinks(sourceRows)}</div><p class="evidence-note">기준 레벨·형상·구성요소를 대조한 항목만 수치에 연결합니다. 원작 전체 카드 프로필의 복원을 뜻하지 않습니다.</p></details>` : ''}`;
}
