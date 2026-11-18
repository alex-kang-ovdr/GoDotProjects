import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { scryptSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app.mjs';
import { createBackup } from '../tools/backup.mjs';
import { inspectDatabase } from '../tools/restore-data.mjs';

const userOrigin = 'http://127.0.0.1:8080';
const adminOrigin = 'http://127.0.0.1:8081';
const password = 'isolated-test-password';
const gameOne = '/api/games/one/community';
const gameTwo = '/api/games/two/community';
const entryPath = item => '/api/community/' + item.id;

class Client {
  constructor(port, origin) {
    this.port = port;
    this.origin = origin;
    this.jar = new Map();
    this.csrf = null;
  }

  headers(method, hasBody, csrf = true) {
    const headers = { Origin:this.origin };
    if (this.jar.size) headers.Cookie = [...this.jar.values()].join('; ');
    if (hasBody) headers['Content-Type'] = 'application/json';
    if (csrf && this.csrf && method !== 'GET') headers['X-CSRF-Token'] = this.csrf;
    return headers;
  }

  async call(target, {method = 'GET', body, csrf = true} = {}) {
    const response = await fetch('http://127.0.0.1:' + this.port + target, {
      method, headers:this.headers(method, body !== undefined, csrf), body:body === undefined ? undefined : JSON.stringify(body)
    });
    for (const value of response.headers.getSetCookie()) {
      const token = value.split(';')[0];
      this.jar.set(token.split('=')[0], token);
    }
    const data = await response.json();
    if (data.csrfToken) this.csrf = data.csrfToken;
    return {status:response.status, data};
  }
}

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-community-'));
  const dataDir = path.join(root, 'data');
  const configPath = path.join(root, 'config.json');
  const entries = ['one', 'two'].map(id => ({id, path:'games/' + id, enabled:true}));
  fs.mkdirSync(path.join(root, 'catalog'));
  fs.writeFileSync(path.join(root, 'catalog/games.json'), JSON.stringify({schemaVersion:1, entries}));
  for (const {id, path:relative} of entries) {
    fs.mkdirSync(path.join(root, relative), {recursive:true});
    fs.writeFileSync(path.join(root, relative, 'game.manifest.json'), JSON.stringify({id, entry:'index.html', title:{en:id}}));
  }
  const salt = 'a'.repeat(32);
  const config = {
    publicHost:'127.0.0.1', publicPort:0, adminHost:'127.0.0.1', adminPort:0,
    userOrigins:[userOrigin], adminOrigins:[adminOrigin], userBaseUrl:userOrigin, dataDir,
    admin:{username:'admin', salt, passwordHash:scryptSync(password, salt, 64).toString('hex')}
  };
  fs.writeFileSync(configPath, JSON.stringify(config));
  let stamp = Date.now();
  const app = createApp(config, {rootDir:root, clock:() => stamp++});
  t.after(async () => {
    await app.close();
    fs.rmSync(root, {recursive:true, force:true, maxRetries:3, retryDelay:100});
  });
  const {public:publicServer, admin:adminServer} = await app.listen();
  return {
    root, configPath, app, db:app.db,
    visitor:() => new Client(publicServer.port, userOrigin),
    admin:new Client(adminServer.port, adminOrigin)
  };
}

async function post(client, kind, body, destination = gameOne) {
  const response = await client.call(destination, {method:'POST', body:{kind, title:kind === 'suggestion' ? 'An idea' : '', body}});
  assert.equal(response.status, 201, JSON.stringify(response.data));
  return response.data.item;
}

async function loginAdmin(admin) {
  assert.equal((await admin.call('/api/admin/session')).status, 200);
  assert.equal((await admin.call('/api/admin/login', {method:'POST', body:{username:'admin', password}})).status, 200);
}

test('public community reads are anonymous and writes are scoped to their game and owner', async t => {
  const f = await fixture(t), owner = f.visitor(), visitor = f.visitor();
  assert.deepEqual((await visitor.call(gameOne)).data, {items:[], total:0, hasMore:false});
  const body = {kind:'comment', title:'', body:'  <b>Plain text</b>\nAnother line  '};
  assert.equal((await owner.call(gameOne, {method:'POST', body})).status, 401);
  assert.equal((await owner.call('/api/session')).data.kind, 'anonymous');
  assert.equal((await owner.call(gameOne, {method:'POST', body, csrf:false})).status, 403);
  const created = await owner.call(gameOne, {method:'POST', body});
  assert.equal(created.status, 201);
  const item = created.data.item;
  assert.deepEqual({
    ...item, id:'item', createdAt:'created', updatedAt:'updated'
  }, {
    id:'item', gameId:'one', kind:'comment', title:'', body:'<b>Plain text</b>\nAnother line',
    authorName:'Guest', isOwner:true, createdAt:'created', updatedAt:'updated', status:'open', voteCount:0, voted:false, hidden:false
  });
  assert.ok(Number.isFinite(Date.parse(item.createdAt)));
  assert.equal((await owner.call('/api/session')).data.kind, 'guest');
  assert.equal((await visitor.call(gameOne)).data.items[0].isOwner, false);
  assert.deepEqual((await visitor.call(gameTwo)).data.items, []);
  await visitor.call('/api/session');
  const edit = {method:'PATCH', body:{body:'Updated note'}};
  assert.equal((await visitor.call(entryPath(item), edit)).status, 403);
  assert.equal((await visitor.call(entryPath(item), {method:'DELETE'})).status, 403);
  const edited = await owner.call(entryPath(item), edit);
  assert.equal(edited.data.item.body, 'Updated note');
  assert.ok(edited.data.item.updatedAt > item.updatedAt);
  assert.equal((await owner.call(entryPath(item), {method:'DELETE'})).status, 200);
  assert.equal((await visitor.call(gameOne)).data.total, 0);
});

test('votes and reports deduplicate and moderation keeps hidden and disabled items private', async t => {
  const f = await fixture(t), owner = f.visitor(), voter = f.visitor();
  await owner.call('/api/session');
  const suggestion = await post(owner, 'suggestion', 'A new game mode');
  const comment = await post(owner, 'comment', 'A different post');
  await voter.call('/api/session');
  const vote = entryPath(suggestion) + '/vote';
  const report = entryPath(suggestion) + '/report';
  assert.equal((await voter.call(entryPath(comment) + '/vote', {method:'PUT'})).status, 422);
  assert.equal((await voter.call(vote, {method:'DELETE'})).data.item.voted, false);
  assert.equal((await voter.call('/api/session')).data.kind, 'anonymous');
  for (let attempt=0; attempt<2; attempt++) {
    const voted = (await voter.call(vote, {method:'PUT'})).data.item;
    assert.equal(voted.voteCount, 1);
    assert.equal(voted.voted, true);
  }
  assert.equal((await owner.call(gameOne + '?kind=suggestion')).data.items[0].voted, false);
  for (const reason of ['  Please review  ', 'Duplicate reason']) {
    assert.deepEqual((await voter.call(report, {method:'POST', body:{reason}})).data, {ok:true});
  }
  assert.equal('reports' in (await voter.call(gameOne + '?kind=suggestion')).data.items[0], false);
  assert.equal((await owner.call('/api/admin/community')).status, 404);
  assert.equal((await f.admin.call('/api/admin/community')).status, 401);
  await loginAdmin(f.admin);
  assert.equal((await f.admin.call(gameOne)).status, 404);
  const list = await f.admin.call('/api/admin/community?gameId=one&kind=suggestion&visibility=visible');
  const listed = list.data.items[0];
  assert.equal(listed.reportCount, 1);
  assert.deepEqual(listed.reports, [{reason:'Please review', createdAt:listed.reports[0].createdAt}]);
  assert.ok(Number.isFinite(Date.parse(listed.reports[0].createdAt)));
  const adminEntry = '/api/admin/community/' + suggestion.id;
  const moderation = {method:'PATCH', body:{hidden:true, status:'planned'}};
  assert.equal((await f.admin.call(adminEntry, {...moderation, csrf:false})).status, 403);
  assert.equal((await f.admin.call(adminEntry, moderation)).data.item.status, 'planned');
  assert.equal((await f.admin.call('/api/admin/community?visibility=hidden')).data.items[0].id, suggestion.id);
  assert.equal((await owner.call(gameOne + '?kind=suggestion')).data.total, 0);
  const attempts = [
    [entryPath(suggestion), {method:'PATCH', body:{body:'No hidden edit'}}],
    [entryPath(suggestion), {method:'DELETE'}],
    [vote, {method:'PUT'}], [vote, {method:'DELETE'}],
    [report, {method:'POST', body:{reason:'No hidden report'}}]
  ];
  for (const [url, options] of attempts) {
    const rejected = await owner.call(url, options);
    assert.equal(rejected.status, 404);
    assert.equal(JSON.stringify(rejected.data).includes(suggestion.body), false);
  }
  assert.equal((await f.admin.call(adminEntry, {method:'PATCH', body:{hidden:false}})).status, 200);
  for (let attempt=0; attempt<2; attempt++) assert.equal((await voter.call(vote, {method:'DELETE'})).data.item.voteCount, 0);
  await f.admin.call('/api/admin/games/one', {method:'PATCH', body:{enabled:false}});
  assert.equal((await voter.call(gameOne)).status, 404);
  assert.equal((await owner.call(gameOne, {method:'POST', body:{kind:'comment', body:'Disabled game'}})).status, 404);
  assert.equal((await voter.call(vote, {method:'PUT'})).status, 404);
  assert.equal((await f.admin.call('/api/admin/community?gameId=one')).data.total, 2);
  const audit = (await f.admin.call('/api/admin/audit')).data.audit.filter(row => row.action === 'community_moderated');
  assert.equal(audit.length, 2);
});

test('community pagination and write validation are bounded', async t => {
  const f = await fixture(t), owner = f.visitor();
  await owner.call('/api/session');
  const first = await post(owner, 'comment', 'First');
  const second = await post(owner, 'suggestion', 'Second');
  const third = await post(owner, 'comment', 'Third');
  await post(owner, 'comment', 'Other game', gameTwo);
  assert.deepEqual((await owner.call(gameOne + '?offset=1&limit=1')).data, {items:[second], total:3, hasMore:true});
  assert.deepEqual((await owner.call(gameOne + '?offset=3&limit=2')).data, {items:[], total:3, hasMore:false});
  assert.deepEqual((await owner.call(gameOne + '?kind=comment')).data.items.map(item => item.id), [third.id, first.id]);
  for (const query of ['offset=-1', 'limit=0', 'limit=101', 'kind=unknown']) assert.equal((await owner.call(gameOne + '?' + query)).status, 400);
  for (const body of [
    {kind:'suggestion', body:'Missing title'}, {kind:'suggestion', title:'a'.repeat(101), body:'Too long'},
    {kind:'comment', title:'Invalid title', body:'Hi'}, {kind:'comment', body:'  '},
    {kind:'comment', body:'a'.repeat(2001)}, {kind:'comment', body:'ok', authorName:'spoofed'},
    {kind:'unknown', body:'Invalid kind'}
  ]) assert.equal((await owner.call(gameOne, {method:'POST', body})).status, 422);
  assert.equal((await owner.call(gameOne, {method:'POST', body:{kind:'comment', body:'a'.repeat(17000)}})).status, 413);
});

test('community write limits hold when a principal uses a second session', async t => {
  const f = await fixture(t), owner = f.visitor(), anotherSession = f.visitor();
  await owner.call('/api/session');
  const idea = await post(owner, 'suggestion', 'One vote only');
  const vote = entryPath(idea) + '/vote';
  for (let attempt=0; attempt<29; attempt++) assert.equal((await owner.call(vote, {method:'PUT'})).status, 200);
  assert.equal((await owner.call(vote, {method:'PUT'})).status, 429);
  await anotherSession.call('/api/session');
  f.db.exec('UPDATE sessions SET principal_id=(SELECT id FROM users) WHERE principal_id IS NULL');
  assert.equal((await anotherSession.call(vote, {method:'PUT'})).status, 429);
  assert.equal((await anotherSession.call(gameOne)).data.items[0].voteCount, 1);
});

test('community write rechecks an existing session after a delayed body', async t => {
  const f = await fixture(t), client = f.visitor();
  await client.call('/api/session');
  const body = JSON.stringify({kind:'comment', body:'This must not be stored'});
  const gotHeaders = new Promise(resolve => f.app.publicServer.once('request', resolve));
  let request;
  const response = new Promise((resolve, reject) => {
    request = http.request({
      hostname:'127.0.0.1', port:client.port, path:gameOne, method:'POST',
      headers:{...client.headers('POST', true), 'Content-Length':Buffer.byteLength(body)}
    }, res => { res.resume(); res.once('end', () => resolve(res.statusCode)); });
    request.once('error', reject);
    request.write(body.slice(0, 7));
  });
  await gotHeaders;
  assert.equal((await client.call('/api/auth/logout', {method:'POST', body:{}})).status, 200);
  request.end(body.slice(7));
  assert.equal(await response, 401);
  assert.equal((await client.call(gameOne)).data.total, 0);
});

test('guest merge transfers authorship and deduplicates votes and reports', async t => {
  const f = await fixture(t), guest = f.visitor(), account = f.visitor();
  await guest.call('/api/session');
  const idea = await post(guest, 'suggestion', 'Move me');
  const guestId = f.db.prepare("SELECT id FROM users WHERE kind='guest'").get().id;
  await account.call('/api/session');
  f.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('account', 'registered', 'Registered name', Date.now());
  f.db.prepare("UPDATE sessions SET principal_id='account' WHERE principal_id IS NULL").run();
  const vote = entryPath(idea) + '/vote';
  for (const client of [guest, account]) {
    assert.equal((await client.call(vote, {method:'PUT'})).status, 200);
    assert.equal((await client.call(entryPath(idea) + '/report', {method:'POST', body:{reason:client === guest ? 'guest reason' : 'account reason'}})).status, 200);
  }
  f.db.prepare('INSERT INTO merge_requests VALUES(?,?,?,?,?,?,?,?)').run('merge-id', guestId, 'account', 'source', 'target', 'pending', Date.now()+60000, null);
  const merge = await account.call('/api/auth/merge', {method:'POST', body:{consent:true, mergeId:'merge-id'}});
  assert.equal(merge.status, 200);
  const mine = (await account.call(gameOne)).data.items[0];
  assert.equal(mine.authorName, 'Registered name');
  assert.equal(mine.isOwner, true);
  assert.equal(mine.voteCount, 1);
  assert.equal(mine.voted, true);
  assert.equal((await guest.call(gameOne)).data.items[0].isOwner, false);
  assert.deepEqual(f.db.prepare('SELECT reason FROM community_reports').all().map(row => row.reason), ['account reason']);
});

test('online backup carries community data and validation accepts pre-community snapshots', async t => {
  const f = await fixture(t), owner = f.visitor();
  await owner.call('/api/session');
  const idea = await post(owner, 'suggestion', 'Save this idea');
  await owner.call(entryPath(idea) + '/vote', {method:'PUT'});
  await owner.call(entryPath(idea) + '/report', {method:'POST', body:{reason:'Save this report'}});
  const backup = await createBackup({configPath:f.configPath, out:path.join(f.root, 'snapshot.sqlite')});
  assert.equal(inspectDatabase(backup.path).integrity, 'ok');
  const copy = new DatabaseSync(backup.path);
  try {
    assert.equal(copy.prepare('SELECT body FROM community_items').get().body, idea.body);
    assert.equal(copy.prepare('SELECT COUNT(*) AS total FROM community_votes').get().total, 1);
    assert.equal(copy.prepare('SELECT reason FROM community_reports').get().reason, 'Save this report');
    copy.exec('DROP TABLE community_reports; DROP TABLE community_votes; DROP TABLE community_items');
  } finally { copy.close(); }
  assert.equal(inspectDatabase(backup.path).integrity, 'ok');
});
