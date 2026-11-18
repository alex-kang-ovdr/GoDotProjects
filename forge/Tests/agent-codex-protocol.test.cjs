'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const { test } = require('node:test');
const { createCodexProvider } = require('../Tools/agent-chat-codex.cjs');

test('Codex adapter manages isolated ChatGPT OAuth and returns structured proposals', async t => {
  const parent = fs.realpathSync(os.tmpdir());
  const scratch = fs.mkdtempSync(path.join(parent, 'forge-codex-protocol-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(scratch)), parent);
    assert.match(path.basename(scratch), /^forge-codex-protocol-/);
    fs.rmSync(scratch, { recursive: true, force: true });
  });
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), kill() {} });
  const emit = frame => child.stdout.write(JSON.stringify(frame) + '\n');
  let account = null;
  let denyTool;
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
      case 'model/list': respond({ data: [{ model: 'fixture' }] }); break;
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
        assert.deepEqual(frame.params.sandboxPolicy, { type: 'readOnly', access: {
          type: 'restricted', includePlatformDefaults: false, readableRoots: [path.join(scratch, 'PlayForge', 'agent-chat', 'scratch')],
        } });
        assert.equal(JSON.parse(frame.params.input[0].text).messages[0].content, 'Check my scene.');
        respond({});
        emit({ id: 'server-request', method: 'item/commandExecution/requestApproval', params: {} });
        emit({ method: 'item/completed', params: { threadId: frame.params.threadId, item: {
          type: 'agentMessage', text: JSON.stringify({ content: 'Ready.', tool_calls: [
            { name: 'scene_info', arguments_json: '{}' },
          ] }),
        } } });
        emit({ method: 'turn/completed', params: { threadId: frame.params.threadId, turn: { status: 'completed' } } });
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
  assert.deepEqual(await provider.listModels(), ['fixture']);
  assert.deepEqual(await provider.chat({ messages: [{ role: 'user', content: 'Check my scene.' }], tools: [] },
    'fixture', AbortSignal.timeout(1000)), {
    role: 'assistant', content: 'Ready.', tool_calls: [{ function: { name: 'scene_info', arguments: {} } }],
  });
  assert.equal(denyTool.code, -32601);
  await provider.disconnect();
  assert.equal(account, null);
});
