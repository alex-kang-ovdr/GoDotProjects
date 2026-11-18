import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyProject } from '../tools/verify.mjs';

const ids = ['match3-garden','falling-blocks','bubble-split','brick-breaker','slide-puzzle','mines-grid','memory-pairs','merge-tiles'];
const game = ids[0];
const text = {ko:'Use the game controls to move.',en:'Use the game controls to move.'};
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#112233"/><text x="32" y="46">三</text></svg>';
const encodedIcon = `data:image/svg+xml,${encodeURIComponent(svg)}`;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'playhub-static-verification-'));
  t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  const put = (name,bytes) => {
    const file = path.join(root,name);
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,bytes);
  };
  const catalog = JSON.stringify({schemaVersion:1,entries:ids.map(id=>({id,path:`games/${id}`,enabled:false}))});
  put('package.json',JSON.stringify({type:'module'}));
  put('catalog/games.json',catalog);
  put('dist/user/catalog/games.json',catalog);
  put('dist/admin/index.html','<title>Admin fixture</title>');
  for (const id of ids) {
    const destination = `dist/user/games/${id}`;
    put(`${destination}/index.html`,'<title>Game fixture</title>');
    put(`${destination}/cover.svg`,svg);
    put(`${destination}/game.manifest.json`,JSON.stringify({
      schemaVersion:1,id,slug:id,entry:'index.html',controls:['keyboard'],title:text,summary:text,instructions:text,
      seo:{title:text,description:text},capabilities:{workers:false,externalNetwork:[]},
      save:{enabled:true,schemaVersion:1,maxSlots:1},media:{cover:'cover.svg',screenshots:[]}
    }));
  }
  const gameDir = `dist/user/games/${game}`;
  const check = id => verifyProject({root}).checks.find(row=>row.id===id);
  return {root,put,gameDir,check};
}

test('static verification permits a pinned sync-only parse5 package', t => {
  const {put,check} = fixture(t);
  for (const [dependencies,status] of [
    [{devDependencies:{parse5:'8.1.1'}},'pass'],
    [{devDependencies:{parse5:'^8.1.1'}},'fail'],
    [{devDependencies:{parse5:'8.1.1',unknown:'1.0.0'}},'fail'],
    ...['dependencies','optionalDependencies','peerDependencies'].map(field=>[{[field]:{parse5:'8.1.1'}},'fail'])
  ]) {
    put('package.json',JSON.stringify({type:'module',...dependencies}));
    const result = check('VERIFY-DEPS');
    assert.equal(result.status,status,JSON.stringify(dependencies));
  }
});

test('static verification accepts internal assets and passive inline favicons in generated HTML', t => {
  const {put,gameDir,check} = fixture(t);
  const base64Icon = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  put(`${gameDir}/assets/game.js`,'0;');
  put(`${gameDir}/index.html`, `<link rel="icon" href="${encodedIcon}">
    <link rel="icon" href="${base64Icon}">
    <script type="application/x-playhub-script" data-src="./assets/game.js"></script>`);
  const result = check(`VERIFY-GAME-${game}`);
  assert.equal(result.status,'pass',result.message);
});

test('static verification rejects active or misplaced inline content and paths outside the game', t => {
  const {root,put,gameDir,check} = fixture(t);
  put('outside/favicon.svg',svg);
  fs.symlinkSync(path.join(root,'outside'),path.join(root,gameDir,'link'),'junction');
  const icon = body => `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(body)}">`;
  for (const html of [
    `<script src="${encodedIcon}"></script>`,
    `<link rel="stylesheet" href="${encodedIcon}">`,
    '<link rel="icon" href="data:text/html,example">',
    '<link rel="icon" href="data:image/svg+xml;base64,!">',
    icon(svg.replace('<rect','<rect onload="example"')),
    icon(svg.replace('</svg>','<script/></svg>')),
    icon(svg.replace('#112233','url(https://outside.invalid/paint)')),
    '<img src=https://outside.invalid/a.png>',
    '<script type="application/x-playhub-script" data-src="/shared/game.js"></script>',
    '<img src="../outside/favicon.svg">',
    '<img src="link/favicon.svg">'
  ]) {
    put(`${gameDir}/index.html`,html);
    const result = check(`VERIFY-GAME-${game}`);
    assert.equal(result.status,'fail',html);
  }
});
