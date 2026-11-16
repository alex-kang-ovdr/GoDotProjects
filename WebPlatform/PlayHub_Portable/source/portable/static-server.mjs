import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const topFiles = new Set(['index.html','admin.js','admin.css','config.js','contracts.js','locale.js','locale-data.js','robots.txt','favicon.ico']);
const assetDirectories = new Set(['assets','images','fonts']);
const types = new Map(Object.entries({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'}));
const inside = (root, filename) => filename === root || filename.startsWith(root + path.sep);

function noLinks(filename) {
  const absolute = path.resolve(filename), parsed = path.parse(absolute);
  let cursor = parsed.root;
  for (const segment of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Administrator web paths cannot contain links or junctions.');
  }
  return absolute;
}

function allowedPath(parts) {
  if (!parts.length || parts.some(p => !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(p) || p === '.' || p === '..')) return false;
  if (parts.length === 1) return topFiles.has(parts[0]);
  return assetDirectories.has(parts[0]) && types.has(path.extname(parts.at(-1)).toLowerCase()) && !['.html','.js','.mjs'].includes(path.extname(parts.at(-1)).toLowerCase());
}

/** The administrator root is deliberately narrower than a general static host. */
export function assertAdminRoot(root) {
  const absolute = noLinks(root);
  if (!fs.statSync(absolute).isDirectory()) throw new Error('Administrator web root must be a directory.');
  function inspect(directory, parents = []) {
    for (const name of fs.readdirSync(directory)) {
      const filename = path.join(directory, name), stat = fs.lstatSync(filename), parts = [...parents, name];
      if (stat.isSymbolicLink()) throw new Error('Administrator web root cannot contain links or junctions.');
      if (stat.isDirectory()) {
        if ((parts.length === 1 && !assetDirectories.has(name)) || parts.some(p => !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(p))) throw new Error('Administrator root contains a non-administrator directory.');
        inspect(filename, parts);
      } else if (!stat.isFile() || !allowedPath(parts)) throw new Error('Administrator root contains an unsupported or non-administrator file.');
    }
  }
  inspect(absolute);
  if (!fs.statSync(path.join(absolute,'index.html')).isFile()) throw new Error('Administrator index.html is required.');
  return fs.realpathSync(absolute);
}

export function adminContentSecurityPolicy(adminApiPort) {
  if (!Number.isInteger(adminApiPort) || adminApiPort < 1 || adminApiPort > 65535) throw new Error('Invalid administrator API port.');
  return `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src http://localhost:${adminApiPort} http://127.0.0.1:${adminApiPort}; base-uri 'none'; form-action 'self'; object-src 'none'; frame-ancestors 'none'; worker-src 'none'`;
}

/** Only an IPv4 loopback listener is created. No proxy or API routing is provided. */
export function createAdminStaticServer({root, port = 8081, adminApiPort = 8091} = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid administrator website port.');
  const rootReal = assertAdminRoot(root), policy = adminContentSecurityPolicy(adminApiPort);
  const server = http.createServer(async (req,res) => {
    res.setHeader('Content-Security-Policy', policy);
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('X-Robots-Tag','noindex, nofollow');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cache-Control','no-store');
    function finish(status, text) { res.statusCode = status; res.setHeader('Content-Type','text/plain; charset=utf-8'); res.end(req.method === 'HEAD' ? undefined : text); }
    let file;
    try {
      if (!['GET','HEAD'].includes(req.method)) { res.setHeader('Allow','GET, HEAD'); finish(405,'Method not allowed'); return; }
      let host;
      try { host = new URL('http://' + req.headers.host); } catch { finish(400,'Invalid host'); return; }
      const actualPort = server.address()?.port;
      if (!['localhost','127.0.0.1'].includes(host.hostname) || Number(host.port || 80) !== actualPort || host.username || host.password || host.pathname !== '/') { finish(403,'Host not allowed'); return; }
      const raw = req.url || '';
      if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || raw.includes('#')) { finish(404,'Not found'); return; }
      let pathname;
      try { pathname = decodeURIComponent(raw.split('?')[0]); } catch { finish(400,'Invalid path'); return; }
      if (/[\\%\u0000-\u001f\u007f:]/.test(pathname) || pathname.startsWith('//')) { finish(404,'Not found'); return; }
      if (pathname === '/__playhub/health') {
        const body = JSON.stringify({ok:true,service:'admin-static'});
        res.setHeader('Content-Type','application/json; charset=utf-8'); res.setHeader('Content-Length',Buffer.byteLength(body)); res.end(req.method === 'HEAD' ? undefined : body); return;
      }
      const parts = (pathname === '/' ? '/index.html' : pathname).slice(1).split('/');
      if (!allowedPath(parts)) { finish(404,'Not found'); return; }
      const candidate = noLinks(path.join(rootReal,...parts));
      if (!inside(rootReal,candidate) || !inside(rootReal,fs.realpathSync(candidate))) { finish(404,'Not found'); return; }
      file = await fs.promises.open(candidate, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      const stat = await file.stat();
      if (!stat.isFile()) { finish(404,'Not found'); return; }
      res.setHeader('Content-Type',types.get(path.extname(candidate).toLowerCase())); res.setHeader('Content-Length',stat.size);
      if (req.method === 'HEAD') { res.end(); return; }
      // Read through the verified handle, so replacing the pathname cannot expose another file.
      res.end(await file.readFile());
    } catch (error) {
      if (!res.headersSent) finish(404,'Not found');
      else res.destroy();
    } finally { if (file) await file.close().catch(()=>{}); }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000;
  let closing;
  return {server,root:rootReal,
    listen() { return new Promise((resolve,reject) => { server.once('error',reject); server.listen(port,'127.0.0.1',()=>{server.off('error',reject);resolve(server.address());}); }); },
    close() { return closing ||= new Promise(resolve => { if (!server.listening) return resolve(); server.close(resolve); server.closeAllConnections(); }); }
  };
}
