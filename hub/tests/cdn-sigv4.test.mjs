import test from 'node:test';
import assert from 'node:assert/strict';
import { presignUrl, signHeaders, verifyRequest, redactUrl } from '../server/cdn/sigv4.mjs';

// AWS published examples (S3 SigV4 documentation, "examplebucket"): these pin the canonical request
// builder so the local emulator cannot agree with a wrong signer.
const AWS = { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1', date: new Date('2013-05-24T00:00:00Z') };

test('query presign matches the AWS published example signature', () => {
  const { url } = presignUrl({ ...AWS, method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/test.txt', expiresIn: 86400 });
  assert.equal(new URL(url).searchParams.get('X-Amz-Signature'), 'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
  assert.equal(new URL(url).searchParams.get('X-Amz-SignedHeaders'), 'host');
});

test('header signing matches the AWS published GET Object example', () => {
  const headers = signHeaders({ ...AWS, method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/test.txt', headers: { range: 'bytes=0-9' } });
  assert.match(headers.authorization, /Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41$/);
});

test('verification enforces signature, expiry and signed header values', () => {
  const lookupSecret = id => (id === AWS.accessKeyId ? AWS.secretAccessKey : null);
  const { url } = presignUrl({ ...AWS, method: 'PUT', url: 'https://acct.example/bucket/q/key', expiresIn: 600, headers: { 'content-length': '5' } });
  const base = { method: 'PUT', url, lookupSecret, now: AWS.date.getTime() + 1000 };
  assert.deepEqual(verifyRequest({ ...base, headers: { host: 'acct.example', 'content-length': '5' } }).ok, true);
  assert.equal(verifyRequest({ ...base, headers: { host: 'acct.example', 'content-length': '6' } }).code, 'SignatureDoesNotMatch');
  assert.equal(verifyRequest({ ...base, headers: { host: 'acct.example' } }).code, 'SignatureDoesNotMatch');
  assert.equal(verifyRequest({ ...base, method: 'GET', headers: { host: 'acct.example', 'content-length': '5' } }).code, 'SignatureDoesNotMatch');
  assert.equal(verifyRequest({ ...base, now: AWS.date.getTime() + 601000, headers: { host: 'acct.example', 'content-length': '5' } }).code, 'ExpiredRequest');
  assert.equal(verifyRequest({ ...base, url: url.replace('q/key', 'q/other'), headers: { host: 'acct.example', 'content-length': '5' } }).code, 'SignatureDoesNotMatch');
  assert.equal(verifyRequest({ ...base, lookupSecret: () => null, headers: { host: 'acct.example', 'content-length': '5' } }).code, 'InvalidAccessKeyId');
  const signed = signHeaders({ ...AWS, method: 'DELETE', url: 'https://acct.example/bucket/b/key' });
  assert.equal(verifyRequest({ method: 'DELETE', url: 'https://acct.example/bucket/b/key', headers: { ...signed, host: 'acct.example' }, lookupSecret, now: AWS.date.getTime() }).ok, true);
  assert.equal(verifyRequest({ method: 'DELETE', url: 'https://acct.example/bucket/b/key', headers: { ...signed, host: 'acct.example' }, lookupSecret, now: AWS.date.getTime() + 20 * 60 * 1000 }).code, 'RequestTimeTooSkewed');
});

test('presign rejects unbounded lifetimes and redaction drops signing material', () => {
  assert.throws(() => presignUrl({ ...AWS, method: 'GET', url: 'https://a.example/b/k', expiresIn: 604801 }));
  const { url } = presignUrl({ ...AWS, method: 'GET', url: 'https://a.example/b/k', expiresIn: 60 });
  assert.equal(redactUrl(url), 'https://a.example/b/k');
});
