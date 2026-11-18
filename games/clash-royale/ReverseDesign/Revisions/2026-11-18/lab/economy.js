/* Royale Reconstruction Lab v3 — pure, offline calculation contracts.
 * Inputs are the supplied, versioned tables. No live-game data is inferred.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RoyaleEconomy = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const RARITIES = Object.freeze(['common', 'rare', 'epic', 'legendary', 'champion']);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const whole = x => Number.isSafeInteger(x) && x >= 0;
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const unique = xs => Array.from(new Set(xs));
  const copy = x => Array.isArray(x) ? x.map(copy) : object(x)
    ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, copy(v)])) : x;
  const canonical = x => JSON.stringify(Array.isArray(x) ? x.map(canonicalValue) : canonicalValue(x));
  function canonicalValue(x) {
    if (Array.isArray(x)) return x.map(canonicalValue);
    return object(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canonicalValue(x[k])])) : x;
  }
  function provenance(rows) {
    return {
      recordIds: rows.map(r => r.record_id).filter(x => typeof x === 'string'),
      sourceIds: unique(rows.flatMap(r => Array.isArray(r.source_ids) ? r.source_ids : [])),
      versionNotes: unique(rows.map(r => r.version_note).filter(x => typeof x === 'string')),
      effectiveFrom: unique(rows.map(r => r.effective_from).filter(x => x != null)),
      effectiveTo: unique(rows.map(r => r.effective_to).filter(x => x != null)),
      evidenceStatuses: unique(rows.map(r => r.evidence_status).filter(x => typeof x === 'string')),
      scope: 'supplied_versioned_table_only',
      liveGameVerified: false
    };
  }
  function fail(errors, extra) {
    return Object.assign({ok: false, complete: false, blocked: true, errors, issues: []}, extra || {});
  }
  function sameVersion(rows) {
    const signature = r => canonical({
      effective_from: r.effective_from == null ? null : r.effective_from,
      effective_to: r.effective_to == null ? null : r.effective_to,
      version_note: r.version_note == null ? null : r.version_note
    });
    return new Set(rows.map(signature)).size <= 1;
  }

  /** Calculate an already-owned card's upgrade path; never include unlocking. */
  function planUpgrade(rows, options) {
    const errors = [];
    if (!Array.isArray(rows)) return fail(['rows must be an array.']);
    if (!object(options)) return fail(['options must be an object.']);
    const {rarity, fromLevel, toLevel} = options;
    if (!RARITIES.includes(rarity)) errors.push('rarity must be common, rare, epic, legendary, or champion.');
    if (!whole(fromLevel) || fromLevel < 1) errors.push('fromLevel must be a positive safe integer.');
    if (!whole(toLevel) || toLevel < 1) errors.push('toLevel must be a positive safe integer.');
    if (whole(fromLevel) && whole(toLevel) && toLevel < fromLevel) errors.push('toLevel cannot be below fromLevel.');
    for (const field of ['ownedCopies', 'ownedGold']) {
      if (has(options, field) && !whole(options[field])) errors.push(field + ' must be a nonnegative safe integer when provided.');
    }
    if (errors.length) return fail(errors);

    const baseRows = rows.filter(r => object(r) && r.key === 'rarity_base_level' && r.rarity === rarity);
    const recipeRows = rows.filter(r => object(r) && r.key === 'upgrade_recipe' && object(r.value) && r.value.rarity === rarity);
    if (baseRows.length !== 1 || !whole(baseRows[0].value) || baseRows[0].value < 1) {
      return fail(['Exactly one valid rarity_base_level record is required.']);
    }
    const baseLevel = baseRows[0].value;
    const upgrades = recipeRows.filter(r => r.value.transaction_kind === 'upgrade');
    if (!upgrades.length) return fail(['No upgrade recipes are available for this rarity.']);
    const targets = upgrades.map(r => r.value.target_level);
    if (targets.some(x => !whole(x) || x <= baseLevel)) return fail(['Invalid target_level in supplied upgrade recipes.']);
    const maxLevel = Math.max(...targets);
    if (fromLevel < baseLevel || toLevel > maxLevel) {
      return fail(['Requested levels must be within the supplied rarity range.'], {baseLevel, maxLevel});
    }
    // Bound loops by the supplied range rather than by an arbitrary huge input.
    const used = [baseRows[0]];
    const recipes = [];
    const issues = [];
    const knownSubtotal = {copies: 0, gold: 0};
    const known = {copies: true, gold: true};
    for (let target = fromLevel + 1; target <= toLevel; target++) {
      const matches = upgrades.filter(r => r.value.target_level === target);
      if (matches.length > 1) {
        errors.push('Ambiguous duplicate upgrade recipe for level ' + target + '.');
        known.copies = known.gold = false;
        continue;
      }
      if (!matches.length) {
        known.copies = known.gold = false;
        issues.push({code: 'missing_recipe', targetLevel: target, fields: ['copies', 'gold']});
        recipes.push({recordId: null, fromLevel: target - 1, targetLevel: target, copies: null, gold: null, missing: true, sourceIds: []});
        continue;
      }
      const r = matches[0];
      used.push(r);
      if (r.value.from_level !== target - 1) errors.push('Recipe predecessor mismatch at level ' + target + '.');
      const item = {recordId: r.record_id, fromLevel: r.value.from_level, targetLevel: target,
        copies: r.value.copies == null ? null : r.value.copies,
        gold: r.value.gold == null ? null : r.value.gold,
        sourceIds: copy(r.source_ids || []), evidenceStatus: r.evidence_status,
        fieldEvidence: copy(r.field_evidence || {}), missing: false};
      for (const field of ['copies', 'gold']) {
        const value = r.value[field];
        const fieldStatus = object(r.field_evidence) ? r.field_evidence[field] : undefined;
        if (value == null || fieldStatus === 'unverified' || r.evidence_status === 'unverified') {
          known[field] = false;
          item[field] = null;
          issues.push({code: 'unknown_cost', targetLevel: target, field, recordId: r.record_id});
        } else if (!whole(value)) {
          known[field] = false;
          item[field] = null;
          errors.push('Invalid ' + field + ' cost at level ' + target + '.');
        } else {
          knownSubtotal[field] += value;
          if (!Number.isSafeInteger(knownSubtotal[field])) errors.push('Cost sum exceeds safe integer range.');
        }
      }
      recipes.push(item);
    }
    if (!sameVersion(used)) errors.push('Conflicting rule versions must not be combined in one upgrade plan.');
    const prov = provenance(used);
    const ids = prov.recordIds;
    if (ids.length !== new Set(ids).size) errors.push('Duplicate record IDs in the selected plan.');
    const complete = errors.length === 0 && known.copies && known.gold;
    const totals = {copies: known.copies && !errors.length ? knownSubtotal.copies : null,
      gold: known.gold && !errors.length ? knownSubtotal.gold : null};
    const deficits = {
      copies: totals.copies !== null && has(options, 'ownedCopies') ? Math.max(0, totals.copies - options.ownedCopies) : null,
      gold: totals.gold !== null && has(options, 'ownedGold') ? Math.max(0, totals.gold - options.ownedGold) : null
    };
    const balancesProvided = has(options, 'ownedCopies') && has(options, 'ownedGold');
    return Object.assign({ok: errors.length === 0, complete, blocked: !complete, errors, issues,
      rarity, fromLevel, toLevel, baseLevel, maxLevel, recipes, totals, knownSubtotal,
      deficits, balancesProvided,
      affordable: complete && balancesProvided ? deficits.copies === 0 && deficits.gold === 0 : null,
      assumptions: ['The card is already owned at fromLevel.',
        'ownedCopies is the usable, unspent balance for this specific card; wild-card allocation is not automatic.',
        'No shop purchase, unlock cost, currency conversion, or future income is included.'],
      calculationKind: 'derived_upgrade_path'}, prov);
  }

  /** Inspect exactly one conditional group, retaining printed probabilities. */
  function analyzeProbabilityGroup(rows, group) {
    if (!Array.isArray(rows)) return fail(['rows must be an array.']);
    if (typeof group !== 'string' || !group.trim()) return fail(['group must be a nonempty string.']);
    const selected = rows.filter(r => object(r) && r.probability_group === group);
    if (!selected.length) return fail(['No records found for the exact probability group.'], {group});
    const errors = [];
    const issues = [];
    const prov = provenance(selected);
    if (prov.recordIds.length !== selected.length || new Set(prov.recordIds).size !== selected.length) {
      errors.push('Each selected probability row must have a unique record_id.');
    }
    const conditions = new Set(selected.map(r => canonical(r.conditional_on)));
    if (conditions.size !== 1 || selected.some(r => !object(r.conditional_on))) {
      errors.push('Conflicting or missing conditional_on values in the same group.');
    }
    if (!sameVersion(selected)) errors.push('Conflicting rule versions must not be combined in one probability group.');
    const exhaustiveValues = new Set(selected.map(r => r.exhaustive_group));
    if (exhaustiveValues.size !== 1 || ![true, false].includes(selected[0].exhaustive_group)) {
      errors.push('Inconsistent or missing exhaustive_group metadata.');
    }
    const tolerances = selected.map(r => has(r, 'probability_sum_tolerance') ? r.probability_sum_tolerance : 0);
    if (tolerances.some(x => !finite(x) || x < 0 || x >= 1)) errors.push('Probability tolerance must be a finite number in [0,1).');
    if (new Set(tolerances).size > 1) errors.push('Inconsistent probability tolerances in the same group.');
    const tolerance = finite(tolerances[0]) ? tolerances[0] : 0;
    const outcomes = selected.map(r => object(r.value) ? r.value.outcome : null);
    if (outcomes.some(x => !object(x))) errors.push('Each selected row requires an explicit outcome object.');
    if (new Set(outcomes.map(canonical)).size !== outcomes.length) errors.push('Duplicate outcomes must not be counted twice.');
    let knownSubtotal = 0;
    let unknownCount = 0;
    selected.forEach(r => {
      const p = r.probability;
      if (p == null) {
        unknownCount++;
        issues.push({code: 'unknown_probability', recordId: r.record_id});
      } else if (!finite(p) || p < 0 || p > 1) errors.push('Probability must be finite and in [0,1]: ' + r.record_id);
      else knownSubtotal += p;
      if (object(r.value) && has(r.value, 'probability') && r.value.probability !== p) {
        errors.push('Conflicting top-level and nested probability: ' + r.record_id);
      }
    });
    const exhaustive = selected.every(r => r.exhaustive_group === true);
    const publishedSum = unknownCount ? null : knownSubtotal;
    // This epsilon addresses floating-point addition only, not source rounding.
    const arithmeticEpsilon = Number.EPSILON * Math.max(1, selected.length) * 4;
    const sumWithinTolerance = publishedSum === null ? null : Math.abs(publishedSum - 1) <= tolerance + arithmeticEpsilon;
    if (exhaustive && publishedSum !== null && !sumWithinTolerance) errors.push('Exhaustive probability group does not sum to 1 within its stated tolerance.');
    if (!exhaustive && publishedSum !== null && publishedSum > 1 + tolerance + arithmeticEpsilon) errors.push('Partial probability group exceeds total probability 1.');
    if (!exhaustive) issues.push({code: 'non_exhaustive_group'});
    const complete = errors.length === 0 && !unknownCount && exhaustive && sumWithinTolerance;
    const starsOnly = outcomes.every(o => object(o) && Object.keys(o).length === 1 && whole(o.final_stars) && o.final_stars >= 1);
    const expectedFinalStars = complete && starsOnly
      ? selected.reduce((sum, r) => sum + r.probability * r.value.outcome.final_stars, 0) : null;
    return Object.assign({ok: errors.length === 0, complete, blocked: !complete, errors, issues,
      group, conditionalOn: conditions.size === 1 ? copy(selected[0].conditional_on) : null,
      exhaustive, tolerance, publishedSum, knownSubtotal, sumWithinTolerance, unknownCount,
      normalization: 'none', expectedFinalStars,
      expectationKind: expectedFinalStars === null ? null : 'weighted_sum_of_published_probabilities',
      roundedInputApproximation: publishedSum !== null && Math.abs(publishedSum - 1) > arithmeticEpsilon,
      historicalOnly: selected.some(r => /legacy_|event_specific_/.test(r.version_note || '')),
      rows: selected.map(r => ({recordId: r.record_id, outcome: copy(object(r.value) ? r.value.outcome : null),
        probability: r.probability == null ? null : r.probability,
        sourceIds: copy(r.source_ids || []), evidenceStatus: r.evidence_status})),
      assumptions: ['Only records with the exact selected group identifier are analyzed.',
        'Published probabilities are not normalized or extended to other account/chest conditions.',
        'Expected final stars are a displayed-input calculation, not a reward-value or acquisition-time estimate.'],
      calculationKind: 'conditional_probability_audit'}, prov);
  }

  /** Theoretical repeated identical independent trials; no sampling or guarantee. */
  function probabilityAtLeastOne(probability, attempts) {
    const errors = [];
    if (!finite(probability) || probability < 0 || probability > 1) errors.push('probability must be a finite number in [0,1].');
    if (!whole(attempts)) errors.push('attempts must be a nonnegative safe integer.');
    if (errors.length) return fail(errors, {probability: null, attempts: whole(attempts) ? attempts : null});
    const result = attempts === 0 || probability === 0 ? 0 : probability === 1 ? 1
      : -Math.expm1(attempts * Math.log1p(-probability));
    return {ok: true, complete: true, blocked: false, errors: [], issues: [],
      inputProbability: probability, attempts, probability: result,
      calculationKind: 'theoretical_independent_repeated_trials',
      calculation_label: 'theoretical', independence_assumed: true,
      assumptions: ['Every attempt has the same input probability.', 'Attempts are independent.',
        'No pity system, guarantee, changing eligibility, inventory conversion, or event expiry is modeled.'],
      scope: 'user_supplied_probability_only', liveGameVerified: false};
  }

  return Object.freeze({planUpgrade, analyzeProbabilityGroup, probabilityAtLeastOne,
    supportedRarities: RARITIES, version: '3.0.0'});
}));
