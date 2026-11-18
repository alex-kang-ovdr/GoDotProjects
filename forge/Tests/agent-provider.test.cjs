'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { createAgentChatProvider } = require('../Tools/agent-chat-provider.cjs');
const { createServer } = require('../server.cjs');

const messages = [{ role: 'user', content: '장면을 확인해 주세요.' }];
const tools = [{ type: 'function', function: { name: 'scene_info', parameters: { type: 'object' } } }];
const message = {
  role: 'assistant', content: '장면을 확인합니다.',
  tool_calls: [{ function: { name: 'scene_info', arguments: { name: '장면' } } }],
};

async function start(t, server) {
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => {
    server.once('close', resolve);
    if (server.shutdown) server.shutdown();
    else server.close();
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

function setEnvironment(t, name, value) {
  const previous = process.env[name];
  process.env[name] = value;
  t.after(() => {
    if (previous == null) delete process.env[name];
    else process.env[name] = previous;
  });
}

function post(url, body = { messages, tools }, headers = {}) {
  return fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
    body: JSON.stringify(body),
  });
}

function postWithHost(url, host) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method: 'POST', headers: { host, 'content-type': 'application/json' } }, async response => {
      try {
        const chunks = [];
        for await (const chunk of response) chunks.push(chunk);
        resolve(new Response(Buffer.concat(chunks), { status: response.statusCode }));
      } catch (error) {
        reject(error);
      }
    });
    request.once('error', reject);
    request.end(JSON.stringify({ messages }));
  });
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(body));
}

function standaloneProvider(options) {
  const handler = createAgentChatProvider(options);
  return http.createServer((request, response) => handler(request, response,
    (status, body) => sendJson(response, status, body)));
}

test('agent-chat forwards Ollama tool conversations and stays limited to local, same-origin use', async t => {
  const received = [];
  const ollama = await start(t, http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received.push({ path: request.url, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
    sendJson(response, 200, { model: 'configured', message, done: true, irrelevant: 'ignored' });
  }));
  setEnvironment(t, 'PLAYFORGE_AGENT_MODEL', 'configured');
  setEnvironment(t, 'PLAYFORGE_OLLAMA_URL', ollama + '/api/chat');
  const temp = fs.realpathSync(os.tmpdir());
  const workspace = fs.mkdtempSync(path.join(temp, 'forge-agent-provider-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(workspace)), temp);
    assert.match(path.basename(workspace), /^forge-agent-provider-/);
    fs.rmSync(workspace, { recursive: true, force: true });
  });
  const base = await start(t, createServer({
    publicOrigin: 'https://forge.example.test',
    workspace: path.join(workspace, 'legacy'),
    platformWorkspace: path.join(workspace, 'platform'),
    buildDirectory: path.join(workspace, 'builds'),
  }));
  const route = base + '/api/agent-chat';
  const history = [...messages, message, { role: 'tool', tool_name: 'scene_info', content: '완료' }];
  const valid = await post(route, { messages: history, tools, model: 'client-override', stream: true }, { Origin: base });
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), { message });
  assert.deepEqual(received, [{ path: '/api/chat', body: { model: 'configured', messages: history, tools, stream: false } }]);

  const rejected = [
    [await post(route, { messages }, { Origin: 'https://forge.example.test' }), 403],
    [await post(route, { messages }, { Forwarded: 'for=203.0.113.2;host=forge.example.test' }), 403],
    [await postWithHost(route, 'forge.example.test'), 403],
    [await fetch(route), 405],
    [await post(route, { messages }, { 'content-type': 'text/plain' }), 415],
    [await post(route, { messages: [{ role: 'user', content: 2 }] }), 400],
    [await post(route, { messages: [{ role: 'user', content: '한'.repeat(100000) }] }), 413],
  ];
  for (const [response, status] of rejected) {
    assert.equal(response.status, status);
    assert.deepEqual(Object.keys(await response.json()), ['error']);
  }
  assert.equal(received.length, 1);
});

test('agent-chat requires configured loopback Ollama and rejects outbound redirects', async t => {
  const missing = await start(t, standaloneProvider({ env: {} }));
  assert.equal((await post(missing)).status, 503);
  const foreign = await start(t, standaloneProvider({ env: {
    PLAYFORGE_AGENT_MODEL: 'configured', PLAYFORGE_OLLAMA_URL: 'http://example.test/api/chat',
  } }));
  assert.equal((await post(foreign)).status, 503);

  let redirected = false;
  const target = await start(t, http.createServer((request, response) => {
    redirected = true;
    sendJson(response, 200, { message });
  }));
  const redirect = await start(t, http.createServer((request, response) => {
    response.writeHead(307, { location: target + '/api/chat' }).end();
  }));
  const provider = await start(t, standaloneProvider({ env: {
    PLAYFORGE_AGENT_MODEL: 'configured', PLAYFORGE_OLLAMA_URL: redirect + '/api/chat',
  } }));
  assert.equal((await post(provider)).status, 502);
  assert.equal(redirected, false);
});

test('agent-chat limits concurrent requests and times out an outstanding provider response', async t => {
  const responses = [];
  let receiveTwo;
  const twoReceived = new Promise(resolve => { receiveTwo = resolve; });
  const ollama = await start(t, http.createServer((request, response) => {
    request.resume();
    responses.push(response);
    if (responses.length === 2) receiveTwo();
  }));
  const env = { PLAYFORGE_AGENT_MODEL: 'configured', PLAYFORGE_OLLAMA_URL: ollama + '/api/chat' };
  const provider = await start(t, standaloneProvider({ env }));
  const first = post(provider);
  const second = post(provider);
  await twoReceived;
  assert.equal((await post(provider)).status, 429);
  for (const response of responses) sendJson(response, 200, { message });
  const completed = await Promise.all([first, second]);
  for (const response of completed) assert.equal(response.status, 200);

  const deadline = await start(t, standaloneProvider({ env, timeoutMs: 100 }));
  assert.equal((await post(deadline)).status, 504);
});

test('local provider settings verify Claude credentials, translate tool history, and keep credentials server-side', async t => {
  const requests = [];
  const apiKey = 'sk-ant-test_fixture_123';
  const base = await start(t, standaloneProvider({
    env: {},
    fetchProvider: async (url, options) => {
      requests.push({ url, options });
      if (url.includes('/models?')) return Response.json({ data: [{ id: 'claude-fixture' }] });
      if (url.includes('/models/')) return Response.json({ id: 'fixture-model' });
      return Response.json({ role: 'assistant', content: [
        { type: 'text', text: message.content },
        { type: 'tool_use', name: 'scene_info', input: { name: '장면' } },
      ] });
    },
  }));
  const chat = base + '/api/agent-chat';
  const route = chat + '/providers';
  const config = { provider: 'claude-console', api_key: apiKey, model: 'fixture-model', workspace: 'wrkspc_test' };
  assert.equal((await post(route + '/connect', config, { Origin: 'https://forge.example.test' })).status, 403);
  assert.equal(requests.length, 0);
  const connected = await post(route + '/connect', config);
  assert.equal(connected.status, 200);
  const payload = await connected.text();
  assert.equal(payload.includes(apiKey), false);
  assert.equal(JSON.parse(payload).providers.find(item => item.id === config.provider).configured, true);
  assert.equal(requests[0].url, 'https://api.anthropic.com/v1/models/fixture-model');
  assert.equal(requests[0].options.headers['x-api-key'], apiKey);

  const history = [{ role: 'system', content: 'Act carefully.' }, ...messages, message,
    { role: 'tool', tool_name: 'scene_info', content: '완료' }];
  const response = await post(chat, { provider: config.provider, messages: history, tools });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { message });
  assert.equal(requests[2].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(requests[2].options.redirect, 'error');
  const sent = JSON.parse(requests[2].options.body);
  assert.equal(sent.system, 'Act carefully.');
  assert.deepEqual(sent.messages.at(-1).content, [{ type: 'tool_result', tool_use_id: 'toolu_forge_2_0', content: '완료' }]);
  assert.equal(sent.tools[0].input_schema.type, 'object');

  await post(route + '/disconnect', { provider: config.provider });
  assert.equal((await post(chat, { provider: config.provider, messages })).status, 503);
});

test('ChatGPT Connect reports login transition and sends selected model and scene tools', async t => {
  let account = { connected: false };
  const observed = [];
  const codex = {
    account: async () => account,
    connect: async () => {
      account = { connected: false, pending: true };
      return 'https://auth.openai.com/example';
    },
    disconnect: async () => { account = { connected: false }; },
    chat: async (conversation, model) => { observed.push({ conversation, model }); return message; },
    close() {},
  };
  const base = await start(t, standaloneProvider({ env: {}, codex }));
  const chat = base + '/api/agent-chat';
  const route = chat + '/providers';
  const provider = 'chatgpt-connect';
  const loadStatus = async () => (await (await fetch(route)).json()).providers.find(item => item.id === provider);
  const connect = await post(route + '/connect', { provider, model: 'fixture-model' });
  assert.equal(connect.status, 200);
  assert.equal((await connect.json()).connect_url, 'https://auth.openai.com/example');
  assert.equal((await loadStatus()).auth, 'pending');
  account = { connected: true };
  assert.equal((await loadStatus()).auth, 'connected');
  assert.deepEqual(await (await post(chat, { provider, messages, tools })).json(), { message });
  assert.deepEqual(observed, [{ conversation: { messages, tools }, model: 'fixture-model' }]);
  assert.equal((await post(route + '/disconnect', { provider })).status, 200);
  assert.equal((await loadStatus()).auth, 'disconnected');
});

test('OpenAI, Gemini and z.ai use fixed upstreams and preserve function call result IDs', async t => {
  const observed = [];
  const base = await start(t, standaloneProvider({
    env: {},
    fetchProvider: async (url, options) => {
      observed.push({ url, options });
      if (url.endsWith('/models')) {
        return Response.json({ data: [{ id: url.includes('googleapis') ? 'gemini-fixture' : 'gpt-fixture' }] });
      }
      return Response.json({ choices: [{ message: { role: 'assistant', tool_calls: [{
        id: 'call_2', type: 'function', function: { name: 'scene_info', arguments: '{"name":"장면"}' },
      }] } }] });
    },
  }));
  const chat = base + '/api/agent-chat';
  for (const [provider, upstream, model, apiKey] of [
    ['openai-api', 'https://api.openai.com/v1', 'gpt-fixture', 'fixture_key'],
    ['gemini', 'https://generativelanguage.googleapis.com/v1beta/openai', 'gemini-fixture', 'fixture_key'],
    ['zai-coding-plan', 'https://api.z.ai/api/coding/paas/v4', 'glm-5.3', 'fixture_key.fixture_secret'],
  ]) {
    const connected = await post(chat + '/providers/connect', { provider, api_key: apiKey });
    assert.equal(connected.status, 200);
    assert.ok((await connected.json()).providers.find(item => item.id === provider).models.includes(model));
    const history = [...messages, message, { role: 'tool', tool_name: 'scene_info', content: '완료' }];
    const replied = await post(chat, { provider, messages: history, tools });
    assert.equal(replied.status, 200);
    assert.equal((await replied.json()).message.tool_calls[0].id, 'call_2');
    const { url, options } = observed.at(-1);
    assert.equal(url, upstream + '/chat/completions');
    const sent = JSON.parse(options.body);
    assert.equal(sent.model, model);
    assert.equal(sent.messages.at(-1).tool_call_id, sent.messages.at(-2).tool_calls[0].id);
  }
});
