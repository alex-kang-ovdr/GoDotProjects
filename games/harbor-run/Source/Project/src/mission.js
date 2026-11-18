/* Data-driven contract runner used by the actual browser game and headless tests.
 * World facts (seat ownership, pending reports and collisions) remain engine-owned.
 * This module never grants currency, spawns actors, changes wanted state or teleports.
 */
'use strict';
const HarborMission = (() => {
  const copy = value => JSON.parse(JSON.stringify(value));
  const PHASES = new Set(['reach', 'recover', 'escape', 'deliver', 'complete', 'failed']);
  const EPSILON = 1e-9;
  const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const point = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
  const distanceXZ = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  const assert = (ok, reason) => { if (!ok) throw new Error(reason); };

  function validateDefinition(def) {
    assert(def && def.schemaVersion === 4 && def.id === 'harbor_recovery', '지원하지 않는 임무 정의');
    assert(typeof def.revision === 'string' && def.revision.length > 0, '임무 revision 오류');
    assert(Number.isSafeInteger(def.reward) && def.reward >= 0, '임무 보상 오류');
    for (const name of ['spawn', 'target', 'garage']) assert(point(def.locations?.[name]), '임무 위치 오류: ' + name);
    for (const name of ['reconRadiusM', 'approachVisitRadiusM', 'acquisitionGraceSeconds', 'deliveryHalfExtentM', 'maxDeliverySpeedMps', 'deliveryHoldSeconds']) {
      assert(nonnegative(def.rules?.[name]), '임무 조건 오류: ' + name);
    }
    assert(def.rules.deliveryHoldSeconds > 0 && def.rules.reconRadiusM > 0 && def.rules.deliveryHalfExtentM > 0, '임무 판정 범위 오류');
    for (const name of ['quiet', 'direct']) assert(point(def.approaches?.[name]?.beacon), '접근 경로 오류');
    assert(Array.isArray(def.nodes) && def.nodes.length >= 6, '임무 노드 오류');
    const ids = new Set(def.nodes.map(n => n.id));
    assert(ids.size === def.nodes.length, '중복 임무 노드');
    const supportedGraph = [
      ['briefing', 'reach', 'accepted'], ['recon', 'reach', 'near_target_or_driver'],
      ['acquire', 'recover', 'target_driver'], ['escape', 'escape', 'no_wanted_no_pending_after_grace'],
      ['deliver', 'deliver', 'safe_target_stop_in_depot'], ['complete', 'complete', 'delivery_hold_finished']
    ];
    assert(def.nodes.length === supportedGraph.length, '지원하지 않는 추가 임무 노드');
    for (let i = 0; i < supportedGraph.length; i++) {
      const [id, phase, predicate] = supportedGraph[i], node = def.nodes.find(n => n.id === id);
      assert(node, '누락 임무 노드: ' + id);
      assert(node.phase === phase && node.predicate === predicate &&
        (node.next || null) === (supportedGraph[i + 1]?.[0] || null), '지원하지 않는 임무 전이: ' + id);
    }
    for (const node of def.nodes) {
      assert(PHASES.has(node.phase), '임무 노드 phase 오류');
      assert(!node.next || ids.has(node.next), '임무 노드 참조 오류');
      assert(nonnegative(node.progress) && node.progress <= 1, '임무 진행률 오류');
    }
    let id = 'briefing'; const visited = new Set();
    while (id) {
      assert(!visited.has(id), '임무 그래프 순환'); visited.add(id);
      id = def.nodes.find(n => n.id === id).next;
    }
    assert(visited.size === def.nodes.length, '도달할 수 없는 임무 노드');
    assert(Array.isArray(def.medals) && def.medals.length > 0, '임무 메달 오류');
    const medalIds = new Set();
    for (const medal of def.medals) {
      assert(typeof medal.id === 'string' && !medalIds.has(medal.id), '중복 메달 ID'); medalIds.add(medal.id);
      assert(['all', 'quiet', 'direct'].includes(medal.approach), '메달 접근 방식 오류');
      assert(['no_civilian_casualties', 'delivery_integrity', 'no_shots', 'time_limit'].includes(medal.rule), '알 수 없는 메달 규칙');
      if (['delivery_integrity', 'time_limit'].includes(medal.rule)) assert(nonnegative(medal.threshold), '메달 임계값 오류');
    }
    return def;
  }

  function normalizeFacts(input) {
    assert(input && typeof input.alive === 'boolean' && typeof input.inTarget === 'boolean', '임무 생존/좌석 사실 오류');
    assert(point(input.playerPos) && point(input.targetPos), '임무 위치 사실 오류');
    assert(nonnegative(input.targetHp) && nonnegative(input.targetMaxHp) && input.targetMaxHp > 0, '목표 차량 내구도 오류');
    assert(Number.isFinite(input.targetSpeed), '목표 차량 속도 오류');
    assert(Number.isInteger(input.wanted) && input.wanted >= 0 && input.wanted <= 5, '임무 수배 사실 오류');
    assert(Number.isInteger(input.pendingReports) && input.pendingReports >= 0, '미완료 신고 수 오류');
    const shots = input.shots ?? 0, civilianCasualties = input.civilianCasualties ?? 0;
    assert(Number.isSafeInteger(shots) && shots >= 0 && Number.isSafeInteger(civilianCasualties) && civilianCasualties >= 0, '임무 통계 오류');
    return {
      alive: input.alive, inTarget: input.inTarget, playerPos: input.playerPos.slice(), targetPos: input.targetPos.slice(),
      targetHp: input.targetHp, targetMaxHp: input.targetMaxHp, targetSpeed: input.targetSpeed,
      wanted: input.wanted, pendingReports: input.pendingReports, shots, civilianCasualties
    };
  }

  class ContractRun {
    constructor(definition, approach = 'quiet') {
      validateDefinition(definition);
      assert(approach === 'quiet' || approach === 'direct', '알 수 없는 접근 방식');
      this.definition = copy(definition);
      this.nodes = new Map(this.definition.nodes.map(n => [n.id, n]));
      this.approach = approach;
      this.phase = 'reach';
      this.elapsed = 0;
      this.hold = 0;
      this.acquired = false;
      this.acquiredAt = null;
      this.beaconVisited = false;
      this.completedNodes = new Set(['briefing']);
      this.metrics = { shots: 0, civilianCasualties: 0, targetIntegrity: 1, maxWanted: 0 };
      this.failureReason = null;
      this.eventSequence = 0;
      this.lastFacts = {
        alive: true, inTarget: false, playerPos: this.definition.locations.spawn.slice(),
        targetPos: this.definition.locations.target.slice(), targetHp: 240, targetMaxHp: 240,
        targetSpeed: 0, wanted: 0, pendingReports: 0, shots: 0, civilianCasualties: 0
      };
    }

    _emit(events, type, nodeId, extra = {}) {
      events.push({ type, nodeId, sequence: ++this.eventSequence, elapsed: this.elapsed, ...extra });
    }

    _completeNode(id, events) {
      if (this.completedNodes.has(id)) return false;
      this.completedNodes.add(id);
      const node = this.nodes.get(id);
      if (node.event) this._emit(events, node.event, id, id === 'acquire' ? { checkpoint: true } : {});
      return true;
    }

    update(dt, rawFacts) {
      assert(nonnegative(dt) && dt <= 5, '임무 시간 간격 오류');
      if (this.phase === 'complete' || this.phase === 'failed') return this.result([]);
      const facts = normalizeFacts(rawFacts);
      this.lastFacts = facts;
      this.elapsed += dt;
      this.metrics.shots = Math.max(this.metrics.shots, facts.shots);
      this.metrics.civilianCasualties = Math.max(this.metrics.civilianCasualties, facts.civilianCasualties);
      this.metrics.targetIntegrity = Math.max(0, Math.min(1, facts.targetHp / facts.targetMaxHp));
      this.metrics.maxWanted = Math.max(this.metrics.maxWanted, facts.wanted);
      const events = [];

      // A player dying on the same tick as delivery cannot also receive success.
      if (!facts.alive || facts.targetHp <= 0) {
        this.phase = 'failed'; this.hold = 0;
        this.failureReason = !facts.alive ? 'player_dead' : 'target_destroyed';
        this._emit(events, 'mission_failed', null, { reason: this.failureReason });
        return this.result(events);
      }

      const rules = this.definition.rules;
      const route = this.definition.approaches[this.approach];
      if (!this.beaconVisited && distanceXZ(facts.playerPos, route.beacon) <= rules.approachVisitRadiusM) {
        this.beaconVisited = true;
        this._emit(events, 'route_beacon_reached', 'recon');
      }

      // The advisory route is optional: reaching or entering the target early is valid.
      if (!this.completedNodes.has('recon') &&
          (facts.inTarget || distanceXZ(facts.playerPos, facts.targetPos) <= rules.reconRadiusM)) {
        this._completeNode('recon', events);
      }
      if (facts.inTarget && !this.acquired) {
        this.acquired = true; this.acquiredAt = this.elapsed;
        this._completeNode('recon', events);
        this._completeNode('acquire', events);
      }

      if (!this.acquired) {
        this.phase = this.completedNodes.has('recon') ? 'recover' : 'reach';
        this.hold = 0;
        return this.result(events);
      }
      if (!facts.inTarget) {
        this.phase = 'recover'; this.hold = 0;
        return this.result(events);
      }

      const safeEscape = facts.wanted === 0 && facts.pendingReports === 0 &&
        this.elapsed - this.acquiredAt + EPSILON >= rules.acquisitionGraceSeconds;
      if (!safeEscape) {
        this.phase = 'escape'; this.hold = 0;
        return this.result(events);
      }
      this._completeNode('escape', events);
      this.phase = 'deliver';

      const depot = this.definition.locations.garage;
      const inside = Math.abs(facts.targetPos[0] - depot[0]) <= rules.deliveryHalfExtentM &&
        Math.abs(facts.targetPos[2] - depot[2]) <= rules.deliveryHalfExtentM;
      const stopped = Math.abs(facts.targetSpeed) <= rules.maxDeliverySpeedMps;
      // Do not count the acquisition grace interval as depot hold time on coarse ticks.
      const eligibleHoldDt = Math.min(dt, Math.max(0, this.elapsed - this.acquiredAt - rules.acquisitionGraceSeconds));
      this.hold = inside && stopped ? Math.min(rules.deliveryHoldSeconds, this.hold + eligibleHoldDt) : 0;
      if (this.hold + EPSILON >= rules.deliveryHoldSeconds) {
        this._completeNode('deliver', events);
        this.phase = 'complete';
        this._completeNode('complete', events);
        const event = events.find(e => e.type === 'mission_completed');
        if (event) {
          event.reward = this.definition.reward;
          event.medals = this.medals();
          event.rank = this.rank;
        }
      }
      return this.result(events);
    }

    objective() {
      const facts = this.lastFacts, route = this.definition.approaches[this.approach];
      let node;
      if (this.phase === 'failed') return {
        title: '회수 실패', description: this.definition.failure[this.failureReason],
        markerLabel: '목표 차량', goal: facts.targetPos.slice(), routeCue: route.routeCue, approachLabel: route.label
      };
      if (this.phase === 'recover' && this.acquired) return {
        ...this.definition.recovery, markerLabel: '회수 차량', goal: facts.targetPos.slice(),
        routeCue: route.routeCue, approachLabel: route.label
      };
      const nodeId = { reach: 'recon', recover: 'acquire', escape: 'escape', deliver: 'deliver', complete: 'complete' }[this.phase];
      node = this.nodes.get(nodeId);
      const early = this.phase === 'reach';
      const goal = early && !this.beaconVisited ? route.beacon :
        ['reach', 'recover'].includes(this.phase) ? facts.targetPos : this.definition.locations.garage;
      const markerLabel = early && !this.beaconVisited ? route.markerLabel :
        ['reach', 'recover'].includes(this.phase) ? '회수 차량' : '복귀 차고';
      return {
        title: node.title, description: node.description, markerLabel, goal: goal.slice(),
        routeCue: route.routeCue, approachLabel: route.label
      };
    }

    medals() {
      return this.definition.medals.filter(m => m.approach === 'all' || m.approach === this.approach).map(m => {
        let eligible = false;
        if (m.rule === 'no_civilian_casualties') eligible = this.metrics.civilianCasualties === 0;
        if (m.rule === 'delivery_integrity') eligible = this.metrics.targetIntegrity + EPSILON >= m.threshold;
        if (m.rule === 'no_shots') eligible = this.metrics.shots === 0;
        if (m.rule === 'time_limit') eligible = this.elapsed <= m.threshold + EPSILON;
        // Integrity can still be repaired before delivery; do not show an irreversible failure prematurely.
        const reversible = m.rule === 'delivery_integrity';
        const status = this.phase === 'complete' ? (eligible ? 'earned' : 'missed') :
          this.phase === 'failed' ? 'missed' : !eligible && !reversible ? 'missed' : 'pending';
        return { id: m.id, label: m.label, description: m.description, eligible, earned: this.phase === 'complete' && eligible, status };
      });
    }

    get rank() {
      if (this.phase !== 'complete') return null;
      const count = this.medals().filter(m => m.earned).length;
      return count === 3 ? 'S' : count === 2 ? 'A' : count === 1 ? 'B' : 'C';
    }

    get progress() {
      if (this.phase === 'complete') return 1;
      if (this.phase === 'failed') return 0;
      const nodeId = { reach: 'recon', recover: 'acquire', escape: 'escape', deliver: 'deliver' }[this.phase];
      return this.nodes.get(nodeId).progress;
    }

    result(events) {
      return { phase: this.phase, events, objective: this.objective(), progress: this.progress, medals: this.medals(),
        completedNodes: [...this.completedNodes], elapsed: this.elapsed, hold: this.hold,
        acquired: this.acquired, rank: this.rank, failureReason: this.failureReason };
    }

    snapshot() {
      return copy({ version: 1, definitionId: this.definition.id, definitionRevision: this.definition.revision,
        approach: this.approach, phase: this.phase, elapsed: this.elapsed, hold: this.hold,
        acquired: this.acquired, acquiredAt: this.acquiredAt, beaconVisited: this.beaconVisited,
        completedNodes: [...this.completedNodes], metrics: this.metrics, failureReason: this.failureReason,
        eventSequence: this.eventSequence, lastFacts: this.lastFacts });
    }

    restore(snapshot) {
      const s = ContractRun.validateSnapshot(this.definition, snapshot);
      // Validation finishes before any state is mutated.
      this.approach = s.approach; this.phase = s.phase; this.elapsed = s.elapsed; this.hold = s.hold;
      this.acquired = s.acquired; this.acquiredAt = s.acquiredAt; this.beaconVisited = s.beaconVisited;
      this.completedNodes = new Set(s.completedNodes); this.metrics = copy(s.metrics);
      this.failureReason = s.failureReason; this.eventSequence = s.eventSequence; this.lastFacts = copy(s.lastFacts);
      return this;
    }

    static validateSnapshot(def, snapshot) {
      validateDefinition(def);
      const s = snapshot;
      assert(s && s.version === 1 && s.definitionId === def.id && s.definitionRevision === def.revision, '임무 저장 버전 오류');
      assert(['quiet', 'direct'].includes(s.approach) && PHASES.has(s.phase), '임무 저장 상태 오류');
      assert(nonnegative(s.elapsed) && s.elapsed <= 1e9 && nonnegative(s.hold) && s.hold <= def.rules.deliveryHoldSeconds + EPSILON, '임무 저장 시간 오류');
      assert(typeof s.acquired === 'boolean' && typeof s.beaconVisited === 'boolean', '임무 저장 플래그 오류');
      assert(s.acquired ? nonnegative(s.acquiredAt) && s.acquiredAt <= s.elapsed : s.acquiredAt === null, '차량 확보 시각 오류');
      assert(Array.isArray(s.completedNodes) && s.completedNodes.every(id => def.nodes.some(n => n.id === id)) &&
        new Set(s.completedNodes).size === s.completedNodes.length && s.completedNodes.includes('briefing'), '완료 노드 목록 오류');
      assert(s.acquired === s.completedNodes.includes('acquire'), '차량 확보 노드 불일치');
      if (s.acquired) assert(s.completedNodes.includes('recon'), '정찰 기록 없는 차량 확보');
      if (s.completedNodes.includes('escape')) assert(s.acquired, '차량 확보 없는 추격 해제 기록');
      if (['escape', 'deliver', 'complete'].includes(s.phase)) assert(s.acquired, '차량 확보 없는 임무 상태');
      if (s.phase === 'deliver') assert(s.completedNodes.includes('escape'), '추격 해제 없는 인도 상태');
      if (s.phase === 'reach') assert(!s.acquired && !s.completedNodes.includes('recon'), '잘못된 도착 전 상태');
      if (s.phase === 'recover') assert(s.completedNodes.includes('recon'), '정찰 없는 회수 상태');
      if (s.phase === 'complete') assert(s.completedNodes.includes('complete') && s.completedNodes.includes('deliver') &&
        s.completedNodes.includes('escape') && s.hold + EPSILON >= def.rules.deliveryHoldSeconds, '미완료 임무의 완료 저장');
      else assert(!s.completedNodes.includes('complete') && !s.completedNodes.includes('deliver'), '완료 노드와 상태 불일치');
      if (s.phase !== 'deliver' && s.phase !== 'complete') assert(s.hold === 0, '인도 중이 아닌 대기 시간');
      assert(s.phase === 'failed' ? ['player_dead', 'target_destroyed'].includes(s.failureReason) : s.failureReason === null, '실패 사유 불일치');
      const metrics = s.metrics;
      assert(metrics && Number.isSafeInteger(metrics.shots) && metrics.shots >= 0 &&
        Number.isSafeInteger(metrics.civilianCasualties) && metrics.civilianCasualties >= 0 &&
        nonnegative(metrics.targetIntegrity) && metrics.targetIntegrity <= 1 &&
        Number.isInteger(metrics.maxWanted) && metrics.maxWanted >= 0 && metrics.maxWanted <= 5, '임무 저장 통계 오류');
      assert(Number.isSafeInteger(s.eventSequence) && s.eventSequence >= 0, '임무 이벤트 순번 오류');
      const facts = normalizeFacts(s.lastFacts);
      assert(metrics.shots >= facts.shots && metrics.civilianCasualties >= facts.civilianCasualties && metrics.maxWanted >= facts.wanted, '임무 통계보다 큰 현재 사실');
      assert(Math.abs(metrics.targetIntegrity - Math.max(0, Math.min(1, facts.targetHp / facts.targetMaxHp))) <= EPSILON, '현재 내구도 통계 불일치');
      if (s.phase === 'failed') assert(s.failureReason === 'player_dead' ? !facts.alive : facts.alive && facts.targetHp === 0, '실패 사실 불일치');
      else assert(facts.alive && facts.targetHp > 0, '살아 있지 않은 진행 임무');
      if (['reach', 'recover'].includes(s.phase)) assert(!facts.inTarget, '회수 전 좌석 사실 불일치');
      if (['escape', 'deliver', 'complete'].includes(s.phase)) assert(facts.inTarget, '운전 중 좌석 사실 불일치');
      const safe = facts.wanted === 0 && facts.pendingReports === 0 &&
        s.acquired && s.elapsed - s.acquiredAt + EPSILON >= def.rules.acquisitionGraceSeconds;
      if (s.phase === 'escape') assert(!safe, '이미 추격 해제된 탈출 상태');
      if (s.phase === 'deliver' || s.phase === 'complete') assert(safe, '추격 해제 조건 불일치');
      const depot = def.locations.garage;
      if (s.hold > 0 || s.phase === 'complete') assert(Math.abs(facts.targetSpeed) <= def.rules.maxDeliverySpeedMps &&
        Math.abs(facts.targetPos[0] - depot[0]) <= def.rules.deliveryHalfExtentM &&
        Math.abs(facts.targetPos[2] - depot[2]) <= def.rules.deliveryHalfExtentM, '인도 저장 위치/속도 불일치');
      const expectedEvents = def.nodes.filter(n => n.event && s.completedNodes.includes(n.id)).length +
        (s.beaconVisited ? 1 : 0) + (s.phase === 'failed' ? 1 : 0);
      assert(s.eventSequence === expectedEvents, '임무 이벤트 기록 불일치');
      return copy(s);
    }

    static fromSnapshot(def, snapshot) {
      ContractRun.validateSnapshot(def, snapshot);
      return new ContractRun(def, snapshot.approach).restore(snapshot);
    }
  }

  return { ContractRun, validateDefinition, normalizeFacts };
})();
if (typeof window !== 'undefined') window.HarborMission = HarborMission;
if (typeof module !== 'undefined') module.exports = HarborMission;
