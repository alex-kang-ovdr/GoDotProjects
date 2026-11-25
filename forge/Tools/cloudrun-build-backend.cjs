'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { extractValidatedDeploymentZip } = require('./deployment-zip-validator.cjs');

const METADATA_BASE = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default';

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function encodeRfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, ch => '%' + ch.charCodeAt(0).toString(16).toUpperCase());
}

function encodeObjectPath(objectName) {
  return String(objectName).split('/').map(encodeRfc3986).join('/');
}

async function fetchMetadataText(subpath, fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(`${METADATA_BASE}/${subpath}`, {
    headers: { 'Metadata-Flavor': 'Google' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`GCP metadata ${subpath} failed (${res.status})`);
  return (await res.text()).trim();
}

async function getAccessToken(fetchImpl = globalThis.fetch) {
  if (process.env.PLAYFORGE_GCP_ACCESS_TOKEN) return process.env.PLAYFORGE_GCP_ACCESS_TOKEN;
  const raw = await fetchMetadataText('token', fetchImpl);
  const parsed = JSON.parse(raw);
  if (!parsed?.access_token) throw new Error('GCP metadata token response missing access_token');
  return parsed.access_token;
}

async function getServiceAccountEmail(fetchImpl = globalThis.fetch) {
  if (process.env.PLAYFORGE_SIGNER_SA_EMAIL) return process.env.PLAYFORGE_SIGNER_SA_EMAIL;
  return fetchMetadataText('email', fetchImpl);
}

/** Generate a GCS V4 Signed URL using IAM Credentials signBlob (no static JSON key needed). */
async function createGcsV4SignedUrl({
  bucket,
  objectName,
  method = 'GET',
  contentType = '',
  expiresSeconds = 300,
  serviceAccountEmail,
  accessToken,
  now = new Date(),
  fetchImpl = globalThis.fetch,
}) {
  const isoDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const datestamp = isoDate.slice(0, 8);
  const credentialScope = `${datestamp}/auto/storage/goog4_request`;
  const credential = `${serviceAccountEmail}/${credentialScope}`;
  const host = 'storage.googleapis.com';
  const canonicalUri = `/${encodeRfc3986(bucket)}/${encodeObjectPath(objectName)}`;

  const headerPairs = [['host', host]];
  if (contentType) headerPairs.push(['content-type', contentType]);
  headerPairs.sort((a, b) => a[0].localeCompare(b[0]));
  const signedHeaders = headerPairs.map(([k]) => k).join(';');
  const canonicalHeaders = headerPairs.map(([k, v]) => `${k}:${v}\n`).join('');

  const queryPairs = [
    ['X-Goog-Algorithm', 'GOOG4-RSA-SHA256'],
    ['X-Goog-Credential', credential],
    ['X-Goog-Date', isoDate],
    ['X-Goog-Expires', String(expiresSeconds)],
    ['X-Goog-SignedHeaders', signedHeaders],
  ].sort((a, b) => a[0].localeCompare(b[0]));
  const canonicalQuery = queryPairs.map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`).join('&');

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'GOOG4-RSA-SHA256',
    isoDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signUrl = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccountEmail)}:signBlob`;
  const signRes = await fetchImpl(signUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ payload: Buffer.from(stringToSign, 'utf8').toString('base64') }),
    signal: AbortSignal.timeout(10000),
  });
  if (!signRes.ok) {
    throw new Error(`IAM signBlob failed (${signRes.status}): ${(await signRes.text()).slice(0, 300)}`);
  }
  const signData = await signRes.json();
  if (!signData?.signedBlob) throw new Error('IAM signBlob response missing signedBlob');
  const signatureHex = Buffer.from(signData.signedBlob, 'base64').toString('hex');

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Goog-Signature=${signatureHex}`;
}

async function uploadGcsObject({ bucket, objectName, body, contentType, accessToken, fetchImpl = globalThis.fetch }) {
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': contentType,
    },
    body,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    throw new Error(`GCS upload ${objectName} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
}

async function downloadGcsObject({ bucket, objectName, accessToken, fetchImpl = globalThis.fetch }) {
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}?alt=media`;
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    throw new Error(`GCS download ${objectName} failed (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function readCloudRunBackendConfig(env = process.env) {
  const project = String(env.PLAYFORGE_BUILD_PROJECT || '').trim();
  const region = String(env.PLAYFORGE_BUILD_REGION || 'us-west1').trim();
  const jobName = String(env.PLAYFORGE_BUILD_JOB || 'forge-build-worker').trim();
  const bucket = String(env.PLAYFORGE_BUILD_BUCKET || '').trim();
  const timeoutMs = Number(env.PLAYFORGE_BUILD_TIMEOUT_MS || 180000);
  const pollMs = Number(env.PLAYFORGE_BUILD_POLL_MS || 2000);
  if (!project || !bucket) {
    throw new Error('Cloud Run build backend requires PLAYFORGE_BUILD_PROJECT and PLAYFORGE_BUILD_BUCKET');
  }
  return { project, region, jobName, bucket, timeoutMs, pollMs };
}

/**
 * Execute a P0 isolated Godot Web build via GCP Cloud Run Jobs + GCS V4 Signed URLs.
 * Writes PlayForge-Web.zip into outputDir and populates job fields matching BuildQueue.
 */
async function runCloudRunBuild(job, snapshot, outputDir, deps = {}) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const sleep = deps.sleep || (ms => new Promise(r => setTimeout(r, ms)));
  const cfg = readCloudRunBackendConfig(env);

  const accessToken = deps.accessToken || await getAccessToken(fetchImpl);
  const signerEmail = deps.signerEmail || await getServiceAccountEmail(fetchImpl);

  const prefix = `builds/${job.id}`;
  const inputObject = `${prefix}/input/snapshot.json`;
  const zipObject = `${prefix}/output/PlayForge-Web.zip`;
  const resultObject = `${prefix}/output/result.json`;

  const snapshotPayload = JSON.stringify({
    buildId: job.id,
    id: snapshot.id || null,
    revision: snapshot.revision ?? null,
    ownerKey: snapshot.ownerKey || null,
    files: snapshot.files || [],
  });

  await uploadGcsObject({
    bucket: cfg.bucket,
    objectName: inputObject,
    body: Buffer.from(snapshotPayload, 'utf8'),
    contentType: 'application/json',
    accessToken,
    fetchImpl,
  });

  const now = deps.now ? deps.now() : new Date();
  const [inputUrl, outputZipUrl, resultUrl] = await Promise.all([
    createGcsV4SignedUrl({ bucket: cfg.bucket, objectName: inputObject, method: 'GET', expiresSeconds: 300, serviceAccountEmail: signerEmail, accessToken, now, fetchImpl }),
    createGcsV4SignedUrl({ bucket: cfg.bucket, objectName: zipObject, method: 'PUT', contentType: 'application/zip', expiresSeconds: 300, serviceAccountEmail: signerEmail, accessToken, now, fetchImpl }),
    createGcsV4SignedUrl({ bucket: cfg.bucket, objectName: resultObject, method: 'PUT', contentType: 'application/json', expiresSeconds: 300, serviceAccountEmail: signerEmail, accessToken, now, fetchImpl }),
  ]);

  const runUrl = `https://run.googleapis.com/v2/projects/${encodeURIComponent(cfg.project)}/locations/${encodeURIComponent(cfg.region)}/jobs/${encodeURIComponent(cfg.jobName)}:run`;
  const runRes = await fetchImpl(runUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      overrides: {
        containerOverrides: [{
          env: [
            { name: 'BUILD_INPUT_URL', value: inputUrl },
            { name: 'BUILD_OUTPUT_ZIP_URL', value: outputZipUrl },
            { name: 'BUILD_RESULT_URL', value: resultUrl },
          ],
        }],
        taskCount: 1,
        timeout: `${Math.max(30, Math.ceil(cfg.timeoutMs / 1000))}s`,
      },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!runRes.ok) {
    throw new Error(`Cloud Run Job trigger failed (${runRes.status}): ${(await runRes.text()).slice(0, 300)}`);
  }
  const operation = await runRes.json();
  const opName = operation?.name;
  if (!opName) throw new Error('Cloud Run Job trigger did not return operation name');

  const deadline = Date.now() + cfg.timeoutMs;
  let op = operation;
  while (!op.done) {
    if (Date.now() > deadline) throw new Error('Cloud Run build worker timed out');
    await sleep(cfg.pollMs);
    const pollRes = await fetchImpl(`https://run.googleapis.com/v2/${opName}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!pollRes.ok) throw new Error(`Cloud Run Job poll failed (${pollRes.status})`);
    op = await pollRes.json();
  }

  let workerResult = null;
  try {
    const rawResult = await downloadGcsObject({ bucket: cfg.bucket, objectName: resultObject, accessToken, fetchImpl });
    workerResult = JSON.parse(rawResult.toString('utf8'));
  } catch {}

  if (op.error || !workerResult || workerResult.status !== 'succeeded') {
    const detail = workerResult?.error || op.error?.message || 'Isolated build worker failed';
    if (workerResult?.log) job.log = String(workerResult.log).slice(-12000);
    throw new Error(detail);
  }

  const zipBuffer = await downloadGcsObject({ bucket: cfg.bucket, objectName: zipObject, accessToken, fetchImpl });
  const zipValidation = extractValidatedDeploymentZip(zipBuffer, outputDir);
  const expectedSha256 = typeof workerResult.artifactSha256 === 'string'
    ? workerResult.artifactSha256.trim().toLowerCase()
    : '';
  if (!/^[a-f0-9]{64}$/.test(expectedSha256) || expectedSha256 !== zipValidation.sha256) {
    throw new Error('Isolated build ZIP integrity mismatch');
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'PlayForge-Web.zip'), zipBuffer);

  const extractedFiles = Array.isArray(zipValidation.extractedFiles) ? zipValidation.extractedFiles : [];
  const hasPreview = extractedFiles.includes('index.html');
  job.files = [...extractedFiles, 'PlayForge-Web.zip'];
  job.downloadUrl = '/api/builds/' + job.id + '/files/PlayForge-Web.zip';
  job.previewUrl = hasPreview ? ('/api/builds/' + job.id + '/files/index.html') : null;
  job.artifactSha256 = zipValidation.sha256;
  job.bytes = zipValidation.bytes;
  job.expandedBytes = zipValidation.expandedBytes;
  job.entryCount = zipValidation.entries;
  job.sdkBridgeVersion = workerResult.sdkBridgeVersion || null;
  if (workerResult.log) job.log = String(workerResult.log).slice(-12000);
  job.backend = 'cloudrun-job';
}

module.exports = {
  createGcsV4SignedUrl,
  readCloudRunBackendConfig,
  runCloudRunBuild,
};
