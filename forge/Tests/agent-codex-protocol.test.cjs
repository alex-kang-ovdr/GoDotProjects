'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const { test } = require('node:test');
const { createCodexProvider } = require('../Tools/agent-chat-codex.cjs');
const { createAgentChatProvider } = require('../Tools/agent-chat-provider.cjs');

test('Codex adapter manages isolated ChatGPT OAuth and returns structured proposals', async t => {
  const parent = fs.realpathSync(os.tmpdir());
  const scratch = fs.mkdtempSync(path.join(parent, 'forge-codex-protocol-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(scratch)), parent);
    assert.match(path.basename(scratch), /^forge-codex-protocol-/);
    fs.rmSync(scratch, { recursive: true, force: true });
  });
  let killed = false;
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(), stdout: new PassThrough(), kill() { killed = true; },
  });
  const emit = frame => child.stdout.write(JSON.stringify(frame) + '\n');
  let account = null;
  let denyTool;
  const cancellation = new AbortController();
  let interruptRequested = false;
  child.stdin.setEncoding('utf8').on('data', line => {
    const frame = JSON.parse(line);
    const respond = result => emit({ id: frame.id, result });
    switch (frame.method) {
      case 'initialize':
        assert.equal(frame.params.clientInfo.name, 'playforge_agent_chat');
        respond({});
        break;
      case 'account/read': respond({ account }); break;
      case 'account/login/start':
        assert.equal(frame.params.type, 'chatgpt');
        respond({ loginId: 'fake-entry', authUrl: 'https://auth.openai.com/example' });
        break;
      case 'model/list': respond({ data: [{ model: 'fixture', isDefault: true,
        supportedReasoningEfforts: [{ reasoningEffort: 'high' }] }] }); break;
      case 'thread/start':
        assert.equal(frame.params.approvalPolicy, 'never');
        assert.equal(frame.params.sandbox, 'read-only');
        assert.equal(frame.params.ephemeral, true);
        assert.equal(frame.params.model, 'fixture');
        assert.equal(frame.params.cwd, path.join(scratch, 'PlayForge', 'agent-chat', 'scratch'));
        respond({ thread: { id: 'fixture-thread' } });
        break;
      case 'turn/start':
        assert.equal(frame.params.outputSchema.type, 'object');
        assert.deepEqual(frame.params.sandboxPolicy, { type: 'readOnly' });
        assert.equal(JSON.parse(frame.params.input[0].text).messages[0].content, 'Check my scene.');
        if (frame.params.effort == null) {
          emit({ method: 'turn/started', params: { threadId: frame.params.threadId, turn: { id: 'fixture-turn' } } });
          cancellation.abort();
          break;
        }
        assert.equal(frame.params.effort, 'high');
        assert.equal(frame.params.serviceTierForTurn, 'fast');
        assert.deepEqual(frame.params.input[1], { type: 'image', url: 'data:image/png;base64,aGVsbG8=' });
        respond({ turn: { id: 'fixture-turn' } });
        for (const delta of ['{ "con', 'tent": "Read', 'y.\\n', '\\uD83D', '\\uD', 'C31", "tool_calls":[{"name":"secret_tool"}] }']) {
          emit({ method: 'item/agentMessage/delta', params: { threadId: frame.params.threadId, itemId: 'item-1', delta } });
        }
        emit({ method: 'item/reasoning/textDelta', params: { threadId: frame.params.threadId, itemId: 'item-2', delta: 'secret reasoning' } });
        emit({ id: 'server-request', method: 'item/commandExecution/requestApproval', params: {} });
        emit({ method: 'item/completed', params: { threadId: frame.params.threadId, item: {
          type: 'agentMessage', text: JSON.stringify({ content: 'Ready.', tool_calls: [
            { name: 'scene_info', arguments_json: '{}' },
          ] }),
        } } });
        emit({ method: 'turn/completed', params: { threadId: frame.params.threadId, turn: { status: 'completed' } } });
        break;
      case 'turn/interrupt':
        assert.deepEqual(frame.params, { threadId: 'fixture-thread', turnId: 'fixture-turn' });
        interruptRequested = true;
        respond({});
        break;
      case 'thread/unsubscribe': respond({}); break;
      case 'account/logout': account = null; respond({}); break;
      default:
        if (frame.id === 'server-request') denyTool = frame.error;
    }
  });
  const provider = createCodexProvider({
    env: { LOCALAPPDATA: scratch, ANTHROPIC_API_KEY: 'fixture-secret', OPENAI_API_KEY: 'fixture-secret' },
    spawnCommand: (name, args, options) => {
      assert.equal(name, 'codex');
      assert.deepEqual(args.slice(0, 3), ['app-server', '--listen', 'stdio://']);
      assert.equal(args[args.indexOf('shell_tool') - 1], '--disable');
      assert.equal(options.env.ANTHROPIC_API_KEY, undefined);
      assert.equal(options.env.OPENAI_API_KEY, undefined);
      return child;
    },
  });
  t.after(() => provider.close());
  assert.equal((await provider.account()).connected, false);
  assert.equal(await provider.connect(), 'https://auth.openai.com/example');
  assert.equal((await provider.account()).pending, true);
  account = { type: 'chatgpt' };
  emit({ method: 'account/login/completed', params: { loginId: 'fake-entry', success: true } });
  assert.deepEqual(await provider.account(), { connected: true, pending: false });
  assert.deepEqual(await provider.listModels(), {
    models: ['fixture'], defaultModel: 'fixture', reasoningEfforts: { fixture: ['high'] },
  });
  const deltas = [];
  let started = false;
  assert.deepEqual(await provider.chat({ messages: [{ role: 'user', content: 'Check my scene.' }], tools: [] },
    'fixture', AbortSignal.timeout(1000), {
      effort: 'high', serviceTier: 'fast', images: [{ mime: 'image/png', data: 'aGVsbG8=' }],
      onStart: () => { started = true; }, onDelta: text => deltas.push(text),
    }), {
    role: 'assistant', content: 'Ready.', tool_calls: [{ function: { name: 'scene_info', arguments: {} } }],
  });
  assert.equal(started, true);
  assert.deepEqual(deltas, ['Read', 'y.\n', '🐱']);
  assert.equal(denyTool.code, -32601);
  await assert.rejects(provider.chat({ messages: [{ role: 'user', content: 'Check my scene.' }], tools: [] },
    'fixture', cancellation.signal));
  assert.equal(interruptRequested, true);
  assert.equal(killed, false);
  await provider.disconnect();
  assert.equal(account, null);
});

test('a fresh local bridge probes an existing isolated Codex profile and chats without a new login', async t => {
  const parent = fs.realpathSync(os.tmpdir());
  const scratch = fs.mkdtempSync(path.join(parent, 'forge-codex-restore-'));
  const profile = path.join(scratch, 'PlayForge', 'agent-chat', 'codex-account');
  const marker = path.join(profile, 'auth.json');
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(marker, '{}');
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(scratch)), parent);
    assert.match(path.basename(scratch), /^forge-codex-restore-/);
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  const methods = [];
  const codex = createCodexProvider({
    env: { LOCALAPPDATA: scratch },
    spawnCommand: (_name, _args, options) => {
      assert.equal(options.env.CODEX_HOME, profile);
      assert.equal(fs.existsSync(marker), true);
      const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), kill() {} });
      const emit = frame => child.stdout.write(JSON.stringify(frame) + '\n');
      child.stdin.setEncoding('utf8').on('data', line => {
        const frame = JSON.parse(line);
        methods.push(frame.method);
        const reply = result => emit({ id: frame.id, result });
        switch (frame.method) {
          case 'initialized': break;
          case 'account/read': reply({ account: { type: 'chatgpt' } }); break;
          case 'model/list': reply({ data: [{ id: 'fixture-model', isDefault: true }] }); break;
          case 'thread/start':
            assert.equal(frame.params.model, 'fixture-model');
            reply({ thread: { id: 'restored-thread' } });
            break;
          case 'turn/start':
            reply({ turn: { id: 'restored-turn' } });
            emit({ method: 'item/completed', params: { threadId: 'restored-thread', item: {
              type: 'agentMessage', text: '{"content":"Restored account.","tool_calls":[]}',
            } } });
            emit({ method: 'turn/completed', params: { threadId: 'restored-thread', turn: { status: 'completed' } } });
            break;
          case 'initialize':
          case 'thread/unsubscribe': reply({}); break;
          default: throw Error(`Unexpected app-server method: ${frame.method}`);
        }
      });
      return child;
    },
  });
  const handler = createAgentChatProvider({ env: {}, codex });
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    handler.close();
    return new Promise(resolve => server.close(resolve));
  });
  const endpoint = `http://127.0.0.1:${server.address().port}/api/agent-chat`;
  const status = await (await fetch(endpoint + '/providers')).json();
  const chatgpt = status.providers.find(provider => provider.id === 'chatgpt-connect');
  assert.equal(chatgpt.auth, 'connected');
  assert.equal(chatgpt.configured, true);
  assert.equal(chatgpt.model, 'fixture-model');
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'chatgpt-connect', messages: [{ role: 'user', content: 'Check the restored account.' }],
    }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { message: { role: 'assistant', content: 'Restored account.', tool_calls: [] } });
  assert.deepEqual(methods, ['initialize', 'initialized', 'account/read', 'model/list', 'account/read',
    'thread/start', 'turn/start', 'thread/unsubscribe']);
});
