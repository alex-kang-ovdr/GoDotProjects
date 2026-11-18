import { RECONSTRUCTED_OVERRIDES } from './reconstruction.js';
import { evidenceMarkup } from './evidence-ui.js';

/** External developer panel; the live Game owns every balance/cheat mutation. */
export class DeveloperPanel {
  constructor({ cards, icon, getGame, getTeam, getSelection, onStart, onTeam, onHand, onSpawn, onCheat, onChange }) {
    Object.assign(this, { cards, icon, getGame, getTeam, getSelection, onStart, onTeam, onHand, onSpawn, onCheat, onChange });
    this.$ = id => document.getElementById(id);
    this.cardId = 'phalanx'; this.scope = 'both'; this.game = null;
    this.fields = []; this.handSignatures = {};
    this.$('balance-card').replaceChildren(...Object.values(cards).map(card => {
      const option = document.createElement('option'); option.value = card.id; option.textContent = card.name; return option;
    }));
    this.$('balance-card').value = this.cardId;
    this.$('developer-start').addEventListener('click', onStart);
    document.querySelectorAll('[data-control-team]').forEach(button => button.addEventListener('click', () => onTeam(button.dataset.controlTeam)));
    for (const team of ['player', 'enemy']) {
      this.$(`developer-hand-${team}`).addEventListener('click', event => {
        const button = event.target.closest('[data-test-hand]');
        if (button && !button.disabled) onHand(team, Number(button.dataset.testHand));
      });
      this.$(`developer-spawn-${team}`).addEventListener('click', () => onSpawn(team, this.cardId));
      this.$(`developer-infinite-${team}`).addEventListener('change', event => this.applyCheats({ infiniteElixir: { [team]: event.target.checked } }));
    }
    this.$('developer-no-cooldown').addEventListener('change', event => this.applyCheats({ noAbilityCooldown: event.target.checked }));
    this.$('developer-free-placement').addEventListener('change', event => this.applyCheats({ freePlacement: event.target.checked }));
    this.$('developer-clear').addEventListener('click', () => onCheat({ type: 'clear-units', team: 'both' }));
    this.$('developer-heal').addEventListener('click', () => onCheat({ type: 'heal-towers', team: 'both' }));
    this.$('balance-card').addEventListener('change', event => { this.cardId = event.target.value; this.buildFields(); });
    this.$('balance-team').addEventListener('change', event => { this.scope = event.target.value; this.buildFields(); });
    this.$('balance-fields').addEventListener('input', event => this.applyInput(event.target));
    this.$('balance-fields').addEventListener('change', event => {
      if (event.target.matches('input') && !event.target.validity.valid) this.message('표시된 범위 안의 숫자를 입력하세요.', true);
    });
    this.$('balance-apply-evidence').addEventListener('click', () => this.applyEvidence());
    this.$('balance-reset-card').addEventListener('click', () => {
      const result = this.getGame().resetCardBalance(this.cardId, this.scope);
      this.complete(result, `${cards[this.cardId].name} 기본값을 복원했습니다.`);
    });
    this.$('balance-reset-all').addEventListener('click', () => {
      const game = this.getGame();
      for (const id of Object.keys(cards)) {
        if (!game.getCard(id)) continue;
        const result = game.resetCardBalance(id, this.scope);
        if (!result.ok) { this.complete(result); return; }
      }
      this.complete({ ok: true }, '선택한 진영의 모든 카드 기본값을 복원했습니다.');
    });
  }

  message(text, error = false) {
    const box = this.$('developer-feedback'); box.textContent = text;
    box.classList.toggle('error', error);
  }

  complete(result, message = '개발자 설정을 적용했습니다.') {
    if (!result.ok) { this.message(result.reason || '설정을 적용할 수 없습니다.', true); this.render(); return; }
    this.message(message); this.syncFields(); this.onChange();
  }

  applyCheats(patch) { this.complete(this.getGame().setDeveloperCheats(patch)); }

  applyEvidence() {
    const game = this.getGame();
    const fields = new Set(game.getBalanceFields(this.cardId).map(field => field.key));
    const patch = Object.fromEntries(Object.entries(RECONSTRUCTED_OVERRIDES[this.cardId] || {}).filter(([key]) => fields.has(key)));
    if (!Object.keys(patch).length) { this.message('이 카드에 적용할 확인 수치가 없습니다.', true); return; }
    const result = game.setCardBalance(this.cardId, patch, { team: this.scope, applyExisting: true });
    this.complete(result, `${this.cards[this.cardId].name}의 확인 수치를 적용했습니다. 자체 보완값은 기존 설정을 사용합니다.`);
  }

  applyInput(input) {
    if (!input.matches('[data-balance-key]') || input.value.trim() === '' || !input.validity.valid) return;
    const field = this.fields.find(field => field.key === input.dataset.balanceKey);
    if (!field) return;
    const displayed = Number(input.value);
    if (!Number.isFinite(displayed)) return;
    const value = displayed / this.scale(field);
    const result = this.getGame().setCardBalance(this.cardId, { [field.key]: value }, { team: this.scope, applyExisting: true });
    const team = this.scope === 'both' ? '양 팀' : this.scope === 'player' ? '아군' : '적군';
    this.complete(result, `${team} ${this.cards[this.cardId].name} · ${field.label} ${displayed}${this.unit(field)} 적용`);
  }

  scale(field) { return field.key === 'damageReduction' ? 100 : 1; }
  unit(field) { return field.key === 'damageReduction' ? '%' : field.unit || ''; }

  buildFields() {
    const game = this.getGame();
    if (!game?.getDeveloperState?.().enabled) { this.fields = []; this.$('balance-fields').replaceChildren(); return; }
    this.fields = game.getBalanceFields(this.cardId);
    this.$('balance-fields').replaceChildren(...this.fields.map(field => {
      const row = document.createElement('div'); row.className = 'balance-field'; row.dataset.key = field.key;
      const label = document.createElement('label'); label.htmlFor = `balance-value-${field.key}`;
      label.textContent = `${field.label}${this.unit(field) ? ` (${this.unit(field)})` : ''}`;
      const number = document.createElement('input'); number.type = 'number'; number.id = label.htmlFor;
      const range = document.createElement('input'); range.type = 'range'; range.setAttribute('aria-label', `${field.label} 조절`);
      for (const input of [number, range]) {
        const scale = this.scale(field);
        input.min = String(field.min * scale); input.max = String(field.max * scale);
        input.step = String(Number((field.step * scale).toPrecision(10)));
        input.dataset.balanceKey = field.key;
      }
      row.append(label, number, range); return row;
    }));
    this.syncFields();
  }

  syncFields() {
    const game = this.getGame();
    if (!this.fields.length || !game?.getDeveloperState?.().enabled) return;
    const team = this.scope === 'enemy' ? 'enemy' : 'player';
    const card = game.getCard(this.cardId, team), other = game.getCard(this.cardId, 'enemy');
    for (const field of this.fields) {
      const row = this.$('balance-fields').querySelector(`[data-key="${field.key}"]`);
      const mixed = this.scope === 'both' && card[field.key] !== other[field.key];
      row.classList.toggle('mixed', mixed);
      row.title = mixed ? '양 팀 수치가 다릅니다. 아군 값을 표시하며 이 항목을 바꾸면 양 팀에 적용합니다.' : '';
      const value = String(Number((card[field.key] * this.scale(field)).toFixed(5)));
      for (const input of row.querySelectorAll('input')) if (document.activeElement !== input) input.value = value;
    }
    this.renderEvidence(card, other);
  }

  renderEvidence(card, other) {
    const game = this.getGame();
    const signature = JSON.stringify([game.dataProfile, this.scope, card, this.scope === 'both' ? other : null]);
    if (this.evidenceSignature === signature) return;
    this.evidenceSignature = signature;
    const host = this.$('balance-evidence');
    const open = [...host.querySelectorAll('details')].map(node => node.open);
    const mixed = this.scope === 'both' && this.fields.some(field => card[field.key] !== other[field.key]);
    host.innerHTML = `${mixed ? '<p class="evidence-note">양 팀 값이 다릅니다. 아래에는 아군 값을 표시합니다.</p>' : ''}${evidenceMarkup(this.cardId, game.dataProfile, card)}`;
    host.querySelectorAll('details').forEach((node, index) => { node.open = open[index] || false; });
    this.$('balance-apply-evidence').disabled = !Object.keys(RECONSTRUCTED_OVERRIDES[this.cardId] || {}).length;
  }

  render() {
    const game = this.getGame(), state = game?.getDeveloperState?.();
    const enabled = Boolean(state?.enabled);
    this.$('developer-controls').hidden = !enabled;
    this.$('developer-controls').disabled = !enabled || game.state.phase === 'finished';
    this.$('developer-badge').textContent = enabled ? 'LIVE TEST' : 'DEV LAB';
    this.$('developer-badge').classList.toggle('enabled', enabled);
    this.$('developer-start').textContent = enabled ? '전장 초기화 · 조절 수치 유지' : '개발자 테스트 시작';
    this.$('developer-intro').textContent = enabled
      ? '양 팀 직접 제어 · 전적 제외 · 수치와 치트는 이 테스트에 저장됩니다.'
      : '양 팀 직접 배치 · 카드 수치 즉시 조절 · 무한 엘릭서';
    if (this.game !== game) {
      this.game = game; this.handSignatures = {}; this.evidenceSignature = '';
      for (const option of this.$('balance-card').options) option.disabled = game.rulesVersion < 5 && ['minion_giant', 'vines'].includes(option.value);
      if (game.rulesVersion < 5 && ['minion_giant', 'vines'].includes(this.cardId)) this.cardId = 'phalanx';
      this.$('balance-card').value = this.cardId;
      this.buildFields();
    }
    if (!enabled) return;
    document.querySelectorAll('[data-control-team]').forEach(button => {
      const active = button.dataset.controlTeam === this.getTeam();
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
    const selection = this.getSelection();
    for (const team of ['player', 'enemy']) {
      const cards = game.state.hands[team].map(id => game.getCard(id, team));
      const signature = cards.map(card => `${card.id}:${card.cost}`).join('|');
      const host = this.$(`developer-hand-${team}`);
      if (this.handSignatures[team] !== signature) {
        this.handSignatures[team] = signature;
        host.innerHTML = cards.map((card, index) => `<button data-test-hand="${index}" aria-label="${team === 'player' ? '아군' : '적군'} ${card.name}, 엘릭서 ${card.cost}"><span>${card.cost}</span>${this.icon(card.id, 30)}<small>${card.name}</small></button>`).join('');
      }
      host.querySelectorAll('button').forEach((button, index) => {
        button.disabled = !game.state.running || game.state.phase === 'finished';
        const selected = selection.team === team && selection.index === index && !selection.directCard;
        button.setAttribute('aria-pressed', String(selected)); button.classList.toggle('selected', selected);
      });
      this.$(`developer-elixir-${team}`).textContent = state.cheats.infiniteElixir[team] ? '◆ ∞' : `◆ ${game.state.elixir[team].toFixed(1)}`;
      this.$(`developer-infinite-${team}`).checked = state.cheats.infiniteElixir[team];
      this.$(`developer-spawn-${team}`).disabled = !game.state.running || game.state.phase === 'finished';
    }
    this.$('developer-no-cooldown').checked = state.cheats.noAbilityCooldown;
    this.$('developer-free-placement').checked = state.cheats.freePlacement;
    this.syncFields();
  }
}
