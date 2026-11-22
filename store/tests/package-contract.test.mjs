import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SAMPLE_CATALOG,
  STORE_STATES,
  COMMERCIAL_GAME_ALLOWED_LICENSES,
  canInstallInStoreWeb,
  isCommercialHubDistributable,
  validateReleaseContract
} from '../web/store-catalog.js';
import { loadMergedCatalog } from '../server/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('package-contract.schema.json parses and defines required contract fields', () => {
  const schemaPath = path.join(root, 'schemas', 'package-contract.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  assert.equal(schema.type, 'object');
  for (const field of [
    'asset_id',
    'asset_version_id',
    'release_id',
    'release_kind',
    'artifact_id',
    'artifact_digest',
    'dependency_manifest_hash',
    'engine_compatibility',
    'file_manifest',
    'license_snapshot_ref',
    'installation_record'
  ]) {
    assert.ok(schema.properties[field], `schema must define ${field}`);
  }
  assert.deepEqual(schema.properties.release_kind.enum, ['package', 'editorial']);
  assert.deepEqual(schema.properties.store_state.enum, STORE_STATES);
});

test('all sample catalog entries satisfy the release contract and keep editorial non-installable', () => {
  const packages = SAMPLE_CATALOG.filter((item) => item.release_kind === 'package');
  const editorials = SAMPLE_CATALOG.filter((item) => item.release_kind === 'editorial');
  assert.equal(packages.length, 3);
  assert.equal(editorials.length, 1);
  for (const item of SAMPLE_CATALOG) {
    assert.deepEqual(validateReleaseContract(item), [], `${item.asset_id} should pass validation`);
  }
  assert.equal(canInstallInStoreWeb(), false, 'Store web must not directly install into projects');
});

test('contract validator rejects package without digest and editorial with install artifact', () => {
  const brokenPackage = { ...SAMPLE_CATALOG[0], artifact_digest: 'bad-digest' };
  assert.ok(validateReleaseContract(brokenPackage).length > 0);

  const brokenEditorial = {
    ...SAMPLE_CATALOG.find((x) => x.release_kind === 'editorial'),
    artifact_id: 'art-invalid-editorial'
  };
  assert.ok(validateReleaseContract(brokenEditorial).length > 0);
});

test('merged Store catalog contains ONLY commercial Forge game & PlayHub distributable licenses', () => {
  const catalog = loadMergedCatalog(root);
  assert.ok(catalog.length > 10000, `expected full open catalog, got ${catalog.length}`);
  for (const item of catalog) {
    assert.equal(isCommercialHubDistributable(item), true, `non-distributable item leaked: ${item.asset_id} (${item.license})`);
    assert.notEqual(item.hosting_policy, 'external_link_only');
    assert.notEqual(item.license_tier, 'tier4_external_only');
    assert.notEqual(item.license, 'Custom-No-Redist');
    if (item.license) {
      assert.equal(COMMERCIAL_GAME_ALLOWED_LICENSES.has(item.license), true, `unexpected license: ${item.license}`);
    }
  }
  assert.equal(isCommercialHubDistributable({ asset_id: 'x', release_kind: 'package', license: 'GPL-3.0' }), false);
  assert.equal(isCommercialHubDistributable({ asset_id: 'x', release_kind: 'package', license: 'CC-BY-NC-4.0' }), false);
  assert.equal(isCommercialHubDistributable({ asset_id: 'x', release_kind: 'package', license: 'CC-BY-SA-4.0' }), false);
  assert.equal(isCommercialHubDistributable({ asset_id: 'x', release_kind: 'package', license: 'CC-BY-ND-4.0' }), false);
  assert.equal(isCommercialHubDistributable({ asset_id: 'x', release_kind: 'editorial', license: 'Custom-No-Redist', hosting_policy: 'external_link_only' }), false);
});
