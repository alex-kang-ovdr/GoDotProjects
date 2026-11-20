// Local, filesystem-backed S3 endpoint for development and tests. It enforces SigV4 (presigned query
// and Authorization header), expiry, and signed-header values, so the hub's direct-transfer flow is
// exercised end to end without a Cloudflare account. It is NOT a production store: createCdn refuses
// it when secure cookies are on unless explicitly allowed.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { verifyRequest } from './sigv4.mjs';

function xmlError(res, status, code) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/xml');
  res.end(`<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code></Error>`);
}

export function createLocalS3({ dir, buckets, credentials, origins = [], clock = Date.now, maxObjectBytes = 128 * 1024 * 1024 }) {
  fs.mkdirSync(dir, { recursive: true });
  for (const bucket of buckets) fs.mkdirSync(path.join(dir, bucket), { recursive: true });
  const faults = { failNext: null };
  const stats = { requests: 0, byMethod: {} };
  const fileFor = (bucket, key) => path.join(dir, bucket, encodeURIComponent(key));

  async function handle(req, res) {
    stats.requests++;
    stats.byMethod[req.method] = (stats.byMethod[req.method] || 0) + 1;
    const origin = req.headers.origin;
    if (origin && origins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Expose-Headers', 'ETag');
    }
    if (req.method === 'OPTIONS') {
      if (!origin || !origins.includes(origin)) return xmlError(res, 403, 'CORSResponse');
      res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, HEAD');
      res.setHeader('Access-Control-Allow-Headers', 'content-type, content-length');
      res.setHeader('Access-Control-Max-Age', '600');
      res.statusCode = 204; return res.end();
    }
    const url = new URL(req.url, `http://${req.headers.host}`);
    const parts = url.pathname.split('/');
    const bucket = decodeURIComponent(parts[1] || '');
    const key = decodeURIComponent(parts.slice(2).join('/'));
    if (!buckets.includes(bucket)) return xmlError(res, 404, 'NoSuchBucket');
    if (!key || key.length > 1024 || key.includes('\0')) return xmlError(res, 400, 'InvalidArgument');
    const verdict = verifyRequest({ method: req.method, url: url.toString(), headers: req.headers, lookupSecret: id => (id === credentials.accessKeyId ? credentials.secretAccessKey : null), now: clock() });
    if (!verdict.ok) return xmlError(res, 403, verdict.code);
    if (faults.failNext && (faults.failNext.method === req.method || faults.failNext.method === '*')) {
      const fault = faults.failNext; faults.failNext = null;
      return xmlError(res, fault.status || 500, 'InternalError');
    }
    const file = fileFor(bucket, key);
    if (req.method === 'PUT') {
      const declared = Number(req.headers['content-length']);
      if (!Number.isInteger(declared)) return xmlError(res, 411, 'MissingContentLength');
      if (declared > maxObjectBytes) return xmlError(res, 400, 'EntityTooLarge');
      const temp = `${file}.${randomUUID()}.part`;
      const hash = createHash('md5');
      let size = 0;
      const out = fs.createWriteStream(temp);
      try {
        for await (const chunk of req) {
          size += chunk.length;
          if (size > declared) throw new Error('length');
          hash.update(chunk);
          if (!out.write(chunk)) await new Promise(r => out.once('drain', r));
        }
        await new Promise((resolve, reject) => out.end(err => (err ? reject(err) : resolve())));
        if (size !== declared) throw new Error('length');
      } catch {
        out.destroy();
        fs.rmSync(temp, { force: true });
        return xmlError(res, 400, 'IncompleteBody');
      }
      const etag = `"${hash.digest('hex')}"`;
      fs.renameSync(temp, file);
      fs.writeFileSync(`${file}.meta`, JSON.stringify({ etag, contentType: req.headers['content-type'] || 'application/octet-stream', size }));
      res.setHeader('ETag', etag);
      res.statusCode = 200; return res.end();
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (!fs.existsSync(file)) return xmlError(res, 404, 'NoSuchKey');
      const meta = JSON.parse(fs.readFileSync(`${file}.meta`, 'utf8'));
      res.setHeader('ETag', meta.etag);
      res.setHeader('Content-Length', String(meta.size));
      res.setHeader('Content-Type', url.searchParams.get('response-content-type') || meta.contentType);
      const disposition = url.searchParams.get('response-content-disposition');
      if (disposition) res.setHeader('Content-Disposition', disposition);
      res.statusCode = 200;
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(file).pipe(res);
    }
    if (req.method === 'DELETE') {
      fs.rmSync(file, { force: true });
      fs.rmSync(`${file}.meta`, { force: true });
      res.statusCode = 204; return res.end();
    }
    return xmlError(res, 405, 'MethodNotAllowed');
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch(() => { if (!res.headersSent) xmlError(res, 500, 'InternalError'); else res.destroy(); });
  });
  let endpoint = null;
  return {
    server, faults, stats,
    get endpoint() { return endpoint; },
    exists: (bucket, key) => fs.existsSync(fileFor(bucket, key)),
    keys: bucket => fs.readdirSync(path.join(dir, bucket)).filter(n => !n.endsWith('.meta') && !n.endsWith('.part')).map(decodeURIComponent),
    async listen(port = 0, host = '127.0.0.1') {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
      endpoint = `http://${host}:${server.address().port}`;
      return endpoint;
    },
    close() {
      return new Promise(resolve => { if (!server.listening) return resolve(); server.close(() => resolve()); server.closeAllConnections(); });
    },
  };
}
