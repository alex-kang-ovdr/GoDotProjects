#!/usr/bin/env node
/** Read-only package/dist checks. This does not install IIS or run a browser. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILTINS = ['match3-garden','falling-blocks','bubble-split','brick-breaker','slide-puzzle','mines-grid','memory-pairs','merge-tiles'];
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const decode = value => value.replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, name) => ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",'#39':"'"}[name]));
const identifier = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const LIMIT = 4 * 1024 * 1024;
const SVG_ICON_LIMIT = 4 * 1024;
const iconElements = new Set(['svg','g','rect','path','circle','ellipse','line','polyline','polygon','text']);
const iconAttributes = new Set(['xmlns','viewBox','width','height','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry',
  'd','points','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','text-anchor','font-size']);

function read(file, limit = LIMIT) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) throw new Error('Regular file and size limit required.');
  return fs.readFileSync(file, 'utf8');
}
function guarded(base, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes(':') || relative.startsWith('/') || relative.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Unsafe relative path.');
  let target = base;
  for (const part of relative.split('/')) {
    target = path.join(target, part);
    if (fs.lstatSync(target).isSymbolicLink()) throw new Error('Symlink not allowed.');
  }
  const real = fs.realpathSync(target), rel = path.relative(fs.realpathSync(base), real);
  if (rel.startsWith('..' + path.sep) || rel === '..' || path.isAbsolute(rel)) throw new Error('Path leaves its root.');
  return real;
}
function walk(root, {ignore = new Set(), max = 12000} = {}) {
  const files = [], issues = [], pending = [[root,0]];
  let count = 0;
  while (pending.length) {
    const [directory, depth] = pending.pop();
    for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
      if (ignore.has(entry.name)) continue;
      if (++count > max) throw new Error('File count limit exceeded.');
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) issues.push(path.relative(root,target));
      else if (entry.isDirectory()) {
        if (depth > 32) throw new Error('Directory depth limit exceeded.');
        pending.push([target,depth+1]);
      } else if (entry.isFile()) files.push(target);
      else issues.push(path.relative(root,target));
    }
  }
  return {files,issues};
}
function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/(?:^|\s)([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
    const name = match[1].toLowerCase();
    if (!Object.hasOwn(result,name)) result[name] = decode(match[2] ?? match[3] ?? match[4]);
  }
  return result;
}
function verifyInlineIcon(ref) {
  const badIcon = 'Inline favicon must be a small static SVG image.';
  assert(ref.length <= SVG_ICON_LIMIT * 3, badIcon);
  const match = /^data:image\/svg\+xml(;base64)?,(.+)$/is.exec(ref);
  assert(match, badIcon);
  let svg;
  try {
    const bytes = match[1] ? Buffer.from(match[2], 'base64') : null;
    if (bytes && bytes.toString('base64') !== match[2]) throw new Error();
    svg = (bytes ? new TextDecoder('utf-8',{fatal:true}).decode(bytes) : decodeURIComponent(match[2])).trim();
  } catch { throw new Error(badIcon); }
  assert(Buffer.byteLength(svg) <= SVG_ICON_LIMIT && !/[&\\\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(svg), badIcon);
  const tokens = svg.match(/<[^<>]+>|[^<>]+/g) || [];
  assert(tokens.length && tokens.join('') === svg, badIcon);

  const stack = [];
  let rootSeen = false;
  const attribute = /\s+([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const token of tokens) {
    if (!token.startsWith('<')) {
      assert(!token.trim() || stack.at(-1) === 'text', badIcon);
      continue;
    }
    const tag = /^<(\/?)([a-z]+)([^<>]*?)(\/?)>$/.exec(token);
    assert(tag && iconElements.has(tag[2]), badIcon);
    const [, closing, name, attrs, selfClosing] = tag;
    if (closing) {
      assert(!attrs.trim() && !selfClosing && stack.pop() === name, badIcon);
      continue;
    }
    const parsed = Object.fromEntries([...attrs.matchAll(attribute)].map(m => [m[1], m[2] ?? m[3]]));
    assert(!attrs.replace(attribute,'').trim() && [...attrs.matchAll(attribute)].length === Object.keys(parsed).length, badIcon);
    for (const [key,value] of Object.entries(parsed)) {
      assert(iconAttributes.has(key) && !/url\s*\(|@import|(?:javascript|vbscript)\s*:/i.test(value), badIcon);
    }
    if (!stack.length) {
      assert(!rootSeen && name === 'svg' && parsed.xmlns === 'http://www.w3.org/2000/svg', badIcon);
      rootSeen = true;
    } else assert(name !== 'svg' && !Object.hasOwn(parsed,'xmlns'), badIcon);
    if (!selfClosing) stack.push(name);
  }
  assert(rootSeen && !stack.length, badIcon);
}
function references(html) {
  const refs = [];
  for (const match of html.matchAll(/<(script|link|img|source|audio|video)\b(?:[^<>"']|"[^"]*"|'[^']*')*>/gi)) {
    const attrs = attributes(match[0]), tag = match[1].toLowerCase();
    if (attrs.src) refs.push(attrs.src);
    if (attrs.poster) refs.push(attrs.poster);
    if (tag === 'script' && attrs.type === 'application/x-playhub-script' && attrs['data-src']) refs.push(attrs['data-src']);
    if (tag === 'link' && /(?:^|\s)(stylesheet|icon|preload|modulepreload)(?:\s|$)/i.test(attrs.rel || '') && attrs.href) {
      if (attrs.rel.trim().toLowerCase() === 'icon' && /^data:/i.test(attrs.href)) verifyInlineIcon(attrs.href);
      else refs.push(attrs.href);
    }
  }
  return [...new Set(refs)];
}
function localAsset(game, ref) {
  const base = new URL('https://package.invalid/game/index.html');
  const url = new URL(ref, base);
  if (url.origin !== base.origin || !url.pathname.startsWith('/game/') || ref.startsWith('/') || ref.includes('\\')) throw new Error('Game asset must be relative and inside its game folder.');
  return guarded(game, decodeURIComponent(url.pathname.slice('/game/'.length)));
}
function assert(condition, message) { if (!condition) throw new Error(message); }
function summarise(checks) {
  return Object.fromEntries(['pass','fail','warning','skip'].map(status => [status, checks.filter(c => c.status === status).length]));
}
function writeReport(report, destination) {
  fs.mkdirSync(path.dirname(destination), {recursive:true});
  fs.writeFileSync(destination, JSON.stringify(report,null,2) + '\n');
  const rows = report.checks.map(c => `<tr><td>${escape(c.id)}</td><td>${escape(c.status)}</td><td>${escape(c.title)}</td><td>${escape(c.message)}</td></tr>`).join('');
  const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PoC 패키지 검증</title><style>body{font:16px/1.55 system-ui,sans-serif;max-width:1200px;margin:32px auto;padding:0 20px;color:#203331}h1{color:#126b5b}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cdd9d5;padding:10px;text-align:left;vertical-align:top}th{background:#eaf3ef}td{overflow-wrap:anywhere}code{background:#eff3f1;padding:3px}</style><h1>PoC 패키지 검증</h1><p>${escape(report.generatedAt)} · ${escape(report.environment.node)} · ${escape(report.environment.platform)}</p><p>pass ${report.summary.pass} / fail ${report.summary.fail} / warning ${report.summary.warning} / skip ${report.summary.skip}</p><p>정적 파일·구문 검사 결과입니다. 실제 브라우저·IIS 설치·Google 로그인 완료를 의미하지 않습니다.</p><table><thead><tr><th>ID</th><th>상태</th><th>검사</th><th>결과</th></tr></thead><tbody>${rows}</tbody></table></html>`;
  fs.writeFileSync(destination.replace(/\.json$/i,'') + '.html', html);
}

export function verifyProject({root = DEFAULT_ROOT, tests = false, report: destination} = {}) {
  root = path.resolve(root);
  const checks = [];
  const add = (id,title,status,message,evidence) => checks.push({id,title,status,message,...(evidence ? {evidence} : {})});
  const check = (id,title,callback) => {
    try { const answer = callback(); add(id,title,'pass',answer?.message || '확인했습니다.',answer?.evidence); return answer; }
    catch (error) { add(id,title,'fail',String(error.message || '검사 실패').slice(0,600)); return null; }
  };
  check('VERIFY-ENV','Node 실행 버전',() => { assert(Number(process.versions.node.split('.')[0]) >= 24,'Node.js 24 이상이 필요합니다.'); return {message:`Node ${process.versions.node}`}; });
  const required = ['Validate.cmd','scripts/Test-PoC.ps1','scripts/Test-Browser.ps1','scripts/Restore-Data.ps1','tools/restore-data.mjs','tools/backup.mjs','tools/acceptance.mjs','tools/check-stack.mjs','qa/browser.e2e.mjs','docs/POC_GAMES.md','package.json','tools/setup.mjs','tools/build.mjs','tools/verify.mjs','tools/smoke.mjs','server/index.mjs','server/app.mjs','server/security.mjs','server/db.mjs','server/google.mjs','server/metrics.mjs','catalog/games.json','docs/POC_API_CONTRACT.md','scripts/Install-IIS.ps1','scripts/Test-IIS.ps1','dist/user/index.html','dist/admin/index.html','dist/user/config.js','dist/admin/config.js','dist/user/web.config','dist/admin/web.config','dist/user/robots.txt','dist/admin/robots.txt','dist/user/sitemap.xml'];
  check('VERIFY-FILES','필수 설치·실행 파일',() => {
    const missing = required.filter(relative => { try { return !fs.statSync(guarded(root,relative)).isFile(); } catch { return true; } });
    assert(!missing.length,'필수 파일 누락/잘못된 경로: ' + missing.join(', '));
    return {message:`필수 파일 ${required.length}개 확인`};
  });
  check('VERIFY-DEPS','런타임 npm 의존성 없음',() => {
    const pkg = JSON.parse(read(guarded(root,'package.json')));
    for (const field of ['dependencies','optionalDependencies','peerDependencies']) assert(!pkg[field] || Object.keys(pkg[field]).length === 0,`${field}에 외부 패키지가 선언되어 있습니다.`);
    const development = pkg.devDependencies ?? {};
    assert(development && typeof development === 'object' && !Array.isArray(development)
      && Object.entries(development).every(([name,version]) => name === 'parse5' && /^\d+\.\d+\.\d+$/.test(version)),
    'devDependencies에는 버전을 고정한 게임 동기화 도구 parse5만 선언할 수 있습니다.');
    assert(pkg.type === 'module','package type=module 필요');
    return {message:'런타임 외부 npm 패키지가 없으며, 게임 동기화용 parse5는 개발 의존성으로만 허용합니다.'};
  });
  check('VERIFY-SYNTAX','JavaScript 구문 검사',() => {
    const {files,issues} = walk(root,{ignore:new Set(['node_modules','.git','data','reports','config','runtime','releases','dist.previous'])});
    assert(!issues.length,'symlink/특수 파일: '+issues.slice(0,10).join(', '));
    const seen = new Set(); let checked = 0;
    for (const file of files.filter(file => /\.(?:mjs|js)$/.test(file))) {
      const code = read(file), hash = createHash('sha256').update(code).digest('hex');
      if (seen.has(hash)) continue;
      seen.add(hash);
      try { execFileSync(process.execPath,['--check',file],{stdio:'pipe',timeout:15000,maxBuffer:128*1024}); }
      catch { throw new Error('Node 구문 검사 실패: '+path.relative(root,file)); }
      checked++;
    }
    assert(checked > 0,'검사할 JavaScript 파일이 없습니다.');
    return {message:`내용 중복을 제거한 JS/MJS ${checked}개 구문 통과`};
  });
  const user = path.join(root,'dist/user'), admin = path.join(root,'dist/admin');
  check('VERIFY-SEPARATION','사용자·관리자 산출물 분리',() => {
    assert(fs.realpathSync(user) !== fs.realpathSync(admin),'두 web root가 동일합니다.');
    const {files} = walk(user);
    const leaked = files.filter(file => /(?:^|[\\/])admin(?:[.\\/]|$)/i.test(path.relative(user,file)) || /\b(?:PLAYHUB_ADMIN_CONFIG|\/api\/admin\/)\b/.test(/\.(?:js|html)$/.test(file) ? read(file) : ''));
    assert(!leaked.length,'사용자 web root에 관리자 전용 파일/코드가 있습니다: '+leaked.slice(0,10).map(f=>path.relative(user,f)).join(', '));
    assert(fs.existsSync(path.join(admin,'admin.js')),'관리자 전용 JS가 없습니다.');
    return {message:'두 web root가 분리되고 사용자 폴더에 관리자 전용 UI가 없습니다.'};
  });
  for (const [label,base] of [['USER',user],['ADMIN',admin]]) check(`VERIFY-SECRETS-${label}`,`${label} 공개 파일 제한`,() => {
    const {files,issues} = walk(base);
    assert(!issues.length,'공개 폴더에 symlink/특수 파일이 있습니다.');
    const forbidden = [];
    for (const file of files) {
      const relative = path.relative(base,file).replaceAll(path.sep,'/'), name = path.basename(file);
      if (/(?:^|\/)(?:data|server|node_modules|reports|config|runtime)\//i.test(relative) || /^\.env(?:\.|$)/i.test(name) || /\.(?:sqlite(?:3)?(?:-wal|-shm)?|db(?:-wal|-shm)?|pem|key|pfx|p12|ps1|cmd)$/i.test(name) || /^(?:credentials|secrets)(?:\.|$)/i.test(name)) forbidden.push(relative);
      if (/\.(?:js|mjs|json|html|txt)$/i.test(name)) {
        const text = read(file);
        if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:clientSecret|passwordHash|adminPassword)\s*["']?\s*[:=]\s*["'][^"'\r\n]+["']/i.test(text)) forbidden.push(relative+' (secret-like assignment)');
      }
    }
    assert(!forbidden.length,'공개하면 안 되는 파일/설정: '+forbidden.slice(0,10).join(', '));
    return {message:`공개 파일 ${files.length}개 검사. 비밀값 본문은 보고서에 기록하지 않습니다.`};
  });
  let catalog, games = [];
  check('VERIFY-CATALOG','8종 카탈로그와 배포 목록',() => {
    catalog = JSON.parse(read(guarded(user,'catalog/games.json')));
    assert(catalog.schemaVersion === 1 && Array.isArray(catalog.entries) && catalog.entries.length >= 8 && catalog.entries.length <= 1000,'schemaVersion=1과 기본 8종 카탈로그가 필요합니다.');
    const ids = new Set(), paths = new Set();
    for (const entry of catalog.entries) {
      assert(typeof entry.id === 'string' && entry.id.length <= 64 && identifier.test(entry.id) && entry.path === `games/${entry.id}` && typeof entry.enabled === 'boolean','잘못된 카탈로그 항목입니다.');
      assert(!ids.has(entry.id) && !paths.has(entry.path),'중복 catalog ID/path입니다.'); ids.add(entry.id); paths.add(entry.path);
      games.push(entry);
    }
    assert(BUILTINS.every(id => ids.has(id)),'기본 게임 8종 중 누락이 있습니다.');
    const source = JSON.parse(read(guarded(root,'catalog/games.json')));
    assert(JSON.stringify(source) === JSON.stringify(catalog),'원본과 dist 카탈로그가 다릅니다. 다시 빌드하세요.');
    return {message:`카탈로그 ${games.length}종, 기본 8종 모두 존재`,evidence:{sha256:createHash('sha256').update(JSON.stringify(catalog)).digest('hex')}};
  });
  const expectedRoutes = [];
  for (const game of games) check('VERIFY-GAME-'+game.id,game.id+' 산출물·SEO',() => {
    const folder = guarded(user,game.path), manifest = JSON.parse(read(guarded(folder,'game.manifest.json')));
    assert(manifest.schemaVersion === 1 && manifest.id === game.id && manifest.slug === game.id && manifest.entry === 'index.html','manifest ID/slug/entry 계약이 다릅니다.');
    assert(Array.isArray(manifest.controls) && manifest.controls.length > 0 && manifest.controls.every(c=>['keyboard','mouse','touch','gamepad'].includes(c)),'controls 배열이 올바르지 않습니다.');
    for (const language of ['ko','en']) {
      for (const field of ['title','summary','instructions']) assert(typeof manifest[field]?.[language] === 'string' && manifest[field][language].trim().length >= (field === 'instructions' ? 20 : 1),`${field}.${language} 누락/빈 내용`);
      assert(manifest.instructions[language].length <= 4000,'instructions 길이 초과');
      for (const field of ['title','description']) assert(typeof manifest.seo?.[field]?.[language] === 'string' && manifest.seo[field][language].trim(),`seo.${field}.${language} 누락`);
    }
    assert(manifest.capabilities?.workers === false && Array.isArray(manifest.capabilities.externalNetwork) && !manifest.capabilities.externalNetwork.length,'초기 실행 프로필과 다른 capabilities입니다.');
    assert(manifest.save?.enabled === true && Number.isInteger(manifest.save.schemaVersion) && manifest.save.schemaVersion >= 1 && manifest.save.maxSlots >= 1 && manifest.save.maxSlots <= 10,'기본 게임 저장 선언이 잘못됐습니다.');
    const html = read(guarded(folder,'index.html'));
    assert(html.trim().length > 0,'진입 HTML이 비어 있습니다.');
    for (const reference of references(html)) assert(fs.statSync(localAsset(folder,reference)).isFile(),'없는 HTML 자산');
    for (const reference of [manifest.media?.cover,...(manifest.media?.screenshots || [])]) assert(fs.statSync(guarded(folder,reference)).isFile(),'없는 표지/스크린샷');
    if (game.enabled) {
      const seoPage = read(guarded(user,`play/${game.id}/index.html`));
      assert(seoPage.includes(escape(manifest.title.ko)) && seoPage.includes(escape(manifest.summary.ko)) && seoPage.includes(escape(manifest.instructions.ko)),'정적 상세 HTML에 제목·소개·조작 본문이 없습니다.');
      const tags = [...seoPage.matchAll(/<(?:meta|link)\b[^>]*>/gi)].map(match=>attributes(match[0]));
      assert(tags.some(a=>a.name === 'description' && a.content?.trim()),'description meta 누락');
      const canonical = tags.find(a=>a.rel === 'canonical')?.href;
      assert(canonical && new URL(canonical).pathname === `/play/${game.id}/`,'canonical 경로 오류');
      assert(tags.some(a=>a.property === 'og:image' && a.content),'대표 OG 이미지 누락');
      if (manifest.seo.indexable) expectedRoutes.push(`/play/${game.id}/`);
    }
    return {message:'독립 게임 파일·정적 참조·저장 선언·활성 게임 SEO 본문 확인'};
  });
  check('VERIFY-SEARCH','robots·sitemap 구성',() => {
    const userRobots = read(guarded(user,'robots.txt')), adminRobots = read(guarded(admin,'robots.txt'));
    assert(/^User-agent:\s*\*/im.test(userRobots) && /^Disallow:\s*\/(?:games\/)?\s*$/im.test(userRobots),'사용자 robots의 기본 정책이 없습니다.');
    assert(/^Disallow:\s*\/\s*$/im.test(adminRobots),'관리자 robots는 전체 비노출 정책이어야 합니다.');
    const sitemap = read(guarded(user,'sitemap.xml'));
    assert(!/<!DOCTYPE|<!ENTITY/i.test(sitemap) && /<urlset\s+xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/.test(sitemap) && /<\/urlset>\s*$/.test(sitemap),'sitemap 구조 오류');
    const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>new URL(decode(match[1])));
    const routes = urls.map(url=>url.pathname);
    assert(urls.every(url=>['http:','https:'].includes(url.protocol) && !url.username && !url.password),'sitemap URL 오류');
    assert(new Set(urls.map(url=>url.href)).size === urls.length,'중복 sitemap URL');
    assert(routes.length === expectedRoutes.length + 1 && routes.includes('/') && expectedRoutes.every(route=>routes.includes(route)),'sitemap과 공개 indexable 게임 목록이 다릅니다.');
    assert(!routes.some(route=>/^\/(?:games|admin|shared|catalog)(?:\/|$)/.test(route)),'내부 경로가 sitemap에 있습니다.');
    return {message:`기본 경로와 활성 indexable 게임 ${expectedRoutes.length}종의 sitemap 확인`};
  });
  check('VERIFY-IIS-CONFIG','IIS 정적 설정 파일',() => {
    for (const base of [user,admin]) {
      const xml = read(guarded(base,'web.config'));
      assert(/<configuration>/.test(xml) && /directoryBrowse\s+enabled="false"/.test(xml) && /X-Content-Type-Options/.test(xml) && /fileExtension="\.sqlite"\s+allowed="false"/.test(xml),'web.config의 필수 정적 설정이 없습니다.');
    }
    return {message:'web.config 텍스트의 필수 정책 확인. 실제 IIS 적용 여부는 별도 현장 시험입니다.'};
  });
  if (tests) check('VERIFY-TESTS','Node 회귀 테스트',() => {
    const directory = path.join(root,'tests');
    const files = fs.readdirSync(directory).filter(file=>file.endsWith('.mjs')).map(file=>path.join(directory,file));
    assert(files.length > 0,'실행할 tests/*.mjs가 없습니다.');
    let output;
    try { output = execFileSync(process.execPath,['--test','--test-reporter=tap',...files],{cwd:root,encoding:'utf8',timeout:480000,maxBuffer:16*1024*1024,stdio:'pipe'}); }
    catch (err) {
      const rawOut = String(err?.stdout || '');
      const failedNames = [...rawOut.matchAll(/^not ok \d+ - ([^\r\n]{1,120})/gm)].map(m => m[1].trim()).slice(0, 6);
      const reason = err?.code === 'ETIMEDOUT' ? '시간 초과(480s)' : (failedNames.length ? `실패 항목: ${failedNames.join(' | ')}` : '실패/시간 초과');
      throw new Error(`node --test ${reason}. 로컬에서 테스트 명령으로 상세 원인을 확인하세요. 비밀값 유출을 막기 위해 원시 출력은 보고서에 넣지 않습니다.`);
    }
    const count = output.match(/# tests (\d+)/)?.[1];
    return {message:`Node 테스트 ${count || '지정'}개 통과`,evidence:{testFiles:files.length,...(count ? {tests:Number(count)} : {})}};
  });
  else add('VERIFY-TESTS','Node 회귀 테스트','skip','--tests를 지정하지 않아 회귀 테스트는 실행하지 않았습니다.');
  add('VERIFY-PYTHON','전체 JSON Schema·SVG 프로필','skip','Python catalog 검사기는 별도로 dist/user와 계획 패키지 specs를 전달해 실행하세요. 이 Node 검사는 핵심 계약의 부분 검사입니다.');
  add('VERIFY-BROWSER-IIS','브라우저·IIS·Google 실환경','skip','이 도구는 정적 검사입니다. 실제 게임 조작, Windows/IIS 설치, 실제 Google 인증은 별도 증거가 필요합니다.');
  const report = {schemaVersion:1,kind:'poc-package-verification',generatedAt:new Date().toISOString(),root,environment:{node:process.version,platform:process.platform,iisVerified:false,browserExecuted:false,googleVerified:false},summary:summarise(checks),checks};
  report.ok = report.summary.fail === 0;
  const target = path.resolve(destination || path.join(root,'reports/verification.json'));
  writeReport(report,target);
  return report;
}

function main() {
  const args = process.argv.slice(2), options = {};
  for (let i=0;i<args.length;i++) {
    if (args[i] === '--tests') options.tests = true;
    else if (args[i] === '--root' || args[i] === '--report') {
      if (!args[i+1] || args[i+1].startsWith('--')) throw new Error('Missing option value.');
      options[args[i].slice(2)] = args[++i];
    } else if (args[i] === '--help') { console.log('node tools/verify.mjs [--root path] [--report path.json] [--tests]'); return; }
    else throw new Error('Unknown option. Use --help.');
  }
  const report = verifyProject(options);
  console.log(JSON.stringify({ok:report.ok,summary:report.summary,report:path.resolve(options.report || path.join(options.root || DEFAULT_ROOT,'reports/verification.json'))},null,2));
  process.exitCode = report.ok ? 0 : 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error('Verification could not finish: '+String(error.message).slice(0,400)); process.exitCode = 2; }
}
