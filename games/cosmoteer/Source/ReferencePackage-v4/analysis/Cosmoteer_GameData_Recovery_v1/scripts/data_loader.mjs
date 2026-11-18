/** Read-only helpers for the recovered catalogue. Does not patch STARFORGE. */
export function validateCatalogue(catalogue) {
  if (!catalogue || catalogue.dataset_id !== 'cosmoteer_public_reconstruction_v1') {
    throw new TypeError('Expected the Cosmoteer public reconstruction dataset.');
  }
  if (catalogue.schema_version !== '1.0.0' || typeof catalogue.observed_at !== 'string' ||
      !Array.isArray(catalogue.records) || !Array.isArray(catalogue.sources) || !Array.isArray(catalogue.conflicts)) {
    throw new TypeError('Catalogue metadata or required arrays are missing.');
  }
  const ids = new Set();
  const sourceIds = new Set(catalogue.sources.map(source => source.id));
  const statuses = new Set(['patch_confirmed', 'wiki_snapshot', 'wiki_history_resolved', 'derived', 'conflict', 'unverified', 'not_applicable']);
  for (const record of catalogue.records) {
    if (!record.id || ids.has(record.id)) throw new TypeError(`Duplicate/empty id: ${record.id}`);
    ids.add(record.id);
    if (!record.fields || !record.evidence || !record.field_status) throw new TypeError(`Missing record observations: ${record.id}`);
    for (const [key, stat] of Object.entries(record.fields)) {
      if (!stat || !('value' in stat) || typeof stat.unit !== 'string') {
        throw new TypeError(`Invalid observation: ${record.id}.${key}`);
      }
      if (typeof stat.value === 'number' && !Number.isFinite(stat.value)) {
        throw new TypeError(`Non-finite value: ${record.id}.${key}`);
      }
      const status = record.field_status[key];
      const evidence = record.evidence[key];
      if (!statuses.has(status) || !Array.isArray(evidence) || evidence.some(id => !sourceIds.has(id))) {
        throw new TypeError(`Invalid status or source: ${record.id}.${key}`);
      }
      if (stat.value !== null && (status === 'conflict' || status === 'unverified' || !evidence.length)) {
        throw new TypeError(`Unresolved value was adopted: ${record.id}.${key}`);
      }
    }
  }
  return catalogue;
}

export async function loadCatalogue(url = '../data/cosmoteer_original.json') {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Catalogue request failed: ${response.status}`);
  return validateCatalogue(await response.json());
}

export function getRecord(catalogue, id) {
  const record = catalogue.records.find(row => row.id === id);
  if (!record) throw new RangeError(`Unknown record: ${id}`);
  return record;
}

export function getObservation(catalogue, id, field) {
  const row = getRecord(catalogue, id);
  const stat = row.fields[field];
  if (!stat) return { value: null, unit: null, status: 'unverified', sources: [] };
  return {
    ...stat,
    status: row.field_status[field] || 'unverified',
    sources: row.evidence[field] || [],
    mode: row.mode,
    version_scope: row.version_scope,
  };
}

export function requireNumber(catalogue, id, field, options = {}) {
  const observation = getObservation(catalogue, id, field);
  const acceptable = options.allowedStatuses || ['patch_confirmed'];
  if (['conflict', 'unverified', 'not_applicable'].includes(observation.status)) {
    throw new TypeError(`Unresolved observation: ${id}.${field}`);
  }
  if (typeof observation.value !== 'number' || !Number.isFinite(observation.value)) {
    throw new TypeError(`No confirmed numeric value for ${id}.${field}`);
  }
  if (!acceptable.includes(observation.status)) {
    throw new TypeError(`Status ${observation.status} is not allowed for ${id}.${field}`);
  }
  if (options.unit && observation.unit !== options.unit) {
    throw new TypeError(`Unit mismatch for ${id}.${field}: ${observation.unit}`);
  }
  return observation.value;
}

export function selectRecords(catalogue, { type, category, mode } = {}) {
  return catalogue.records.filter(row =>
    (!type || row.record_type === type) &&
    (!category || row.category === category) &&
    (!mode || row.mode === mode));
}
