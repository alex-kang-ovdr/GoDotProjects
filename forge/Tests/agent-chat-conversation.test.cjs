'use strict';

const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { promisify } = require('node:util');
const { appendEditorPlugin } = require('../Tools/platform-project.cjs');
const { prepareTemplateShowcase } = require('../Tools/prepare-template-showcase.cjs');

const run = promisify(execFile);
const godot = process.env.GODOT_EDITOR || 'D:\\Github\\GoDotProjects\\Godot_v4.7.2-stable_win64.exe';

test('native chat validates provider tool calls before approval, applies the valid edit, and replays Undo', {
  skip: process.platform !== 'win32' || !fs.existsSync(godot) ? 'Windows Godot unavailable' : false,
  timeout: 120000,
}, async t => {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const temporary = fs.mkdtempSync(path.join(tempRoot, 'playforge-conversation-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(temporary)), tempRoot);
    assert.ok(path.basename(temporary).startsWith('playforge-conversation-'));
    fs.rmSync(temporary, { recursive: true, force: true });
  });
  const project = path.join(temporary, 'project');
  const config = prepareTemplateShowcase('tappy-chicken', project, 'ready');
  const calls = [];
  const server = http.createServer(async (req, res) => {
    const parts = [];
    for await (const part of req) parts.push(part);
    calls.push({ url: req.url, method: req.method, body: JSON.parse(Buffer.concat(parts).toString()) });
    const tool = operations => ({
      tool_calls: [{ function: { name: 'pf_workspace_apply', arguments: { operations } } }],
    });
    const raw = JSON.stringify({ name: 'pf_workspace_apply', arguments: { objectId: '.', operations: [] } });
    const responses = [
      { content: '선택한 문구를 바꿨어요.', ...tool([{
        kind: 'property.set', objectId: 'Hud/Status', propertyId: 'text', value: '준비 완료',
        role: 'gui', description: '상태 문구 변경',
      }]) },
      { content: '현재 상태 문구는 준비 완료입니다.' },
      { content: raw },
      { content: '```json\n' + raw + '\n```' },
      { content: '', ...tool([]) },
      { content: '', ...tool([{ kind: 'unknown.op', objectId: 'Hud/Status', role: 'gui', description: '지원 불가 작업' }]) },
      { content: '상태 문구 노드를 삭제했어요.', ...tool([{ kind: 'node.delete', objectId: 'Hud/Status', role: 'gui', description: '상태 문구 삭제' }]) },
      { content: '씬의 모든 노드를 지워 빈 맵으로 초기화했어요.', ...tool([{ kind: 'scene.clear', objectId: '.', role: 'level', description: '빈 맵 초기화' }]) },
      { content: '이 설명은 편집 검증이 실패해도 대화창에서 사라지지 않고 유지되어야 합니다.', ...tool([{ kind: 'unknown.op', objectId: '.', role: 'level', description: '검증 실패 작업' }]) },
      { content: '개별 에셋 파일을 삭제했어요.', ...tool([{ kind: 'asset.delete', objectId: '.', value: 'res://Assets/egg.svg', role: 'assets', description: '알 에셋 삭제' }]) },
      { content: '모든 에셋을 지우고 빈 맵에서 TappyChicken을 새로 만들어 Replay 시연을 시작합니다.', ...tool([
        { kind: 'assets.clear', objectId: '.', role: 'assets', description: '기존 에셋 전체 초기화' },
        { kind: 'pack.import', objectId: '.', value: 'tappy-original', role: 'assets', description: 'TappyChicken 에셋 팩 가져오기' },
        { kind: 'script.write', objectId: '.', path: 'res://Scripts/TappyBuilt.gd', value: 'extends Node2D\n\nvar score := 0\n', role: 'script', description: 'TappyChicken 스크립트 작성' },
        { kind: 'scene.clear', objectId: '.', role: 'level', description: '빈 맵 초기화' },
        { kind: 'node.add', objectId: 'Sky', type: 'ColorRect', role: 'level', description: '하늘 배경 추가' },
        { kind: 'property.set', objectId: 'Sky', propertyId: 'offset_bottom', value: 640.0, role: 'level', description: '하늘 높이 설정' },
        { kind: 'node.add', objectId: 'Bird', type: 'Sprite2D', role: 'script', description: '플레이어 닭 추가' },
        { kind: 'property.set', objectId: 'Bird', propertyId: 'texture', value: 'res://Assets/chicken.svg', role: 'assets', description: '닭 텍스처 연결' },
        { kind: 'property.set', objectId: 'Bird', propertyId: 'position', value: [240, 294], role: 'script', description: '닭 시작 위치 배치' },
        { kind: 'node.add', objectId: 'Pipes', type: 'Node2D', role: 'level', description: '장애물 컨테이너 추가' },
        { kind: 'node.add', objectId: 'Hud', type: 'CanvasLayer', role: 'gui', description: 'HUD 추가' },
        { kind: 'node.add', objectId: 'Hud/Score', type: 'Label', role: 'gui', description: '점수 라벨 추가' },
        { kind: 'property.set', objectId: 'Hud/Score', propertyId: 'text', value: '0', role: 'gui', description: '시작 점수 설정' },
        { kind: 'script.attach', objectId: '.', value: 'res://Scripts/TappyBuilt.gd', role: 'script', description: '루트에 TappyBuilt.gd 연결' },
        { kind: 'replay.play', objectId: '.', role: 'level', description: '처음부터 제작 과정 Replay 시연' },
      ]) },
    ];
    const response = responses[calls.length - 1];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: { role: 'assistant', ...response }, done: true }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const evidence = path.join(__dirname, '../Saved/Tests/agent-chat-conversation');
  fs.mkdirSync(evidence, { recursive: true });
  const env = { ...process.env, APPDATA: temporary, PLAYFORGE_AGENT_MODEL: 'conversation-fixture',
    PLAYFORGE_OLLAMA_URL: `http://127.0.0.1:${server.address().port}/api/chat` };
  async function launch(args, label) {
    let result;
    try {
      result = await run(godot, ['--headless', '--editor', '--path', project, ...args], { env, timeout: 50000, windowsHide: true });
    } catch (error) {
      result = error;
    }
    const log = (result.stdout || '') + (result.stderr || '');
    fs.writeFileSync(path.join(evidence, label + '.log'), log);
    if (result instanceof Error) throw result;
    assert.doesNotMatch(log, /SCRIPT ERROR:|^ERROR:/m);
    return log;
  }
  await launch(['--import', '--quit'], 'import');
  const probe = path.join(project, 'addons', 'conversation_probe');
  fs.mkdirSync(probe);
  fs.copyFileSync(path.join(__dirname, 'fixtures/agent-chat-conversation.gd'), path.join(probe, 'probe.gd'));
  fs.writeFileSync(path.join(probe, 'plugin.cfg'), '[plugin]\nname="Agent Conversation Probe"\nscript="probe.gd"\n');
  fs.writeFileSync(config, appendEditorPlugin(fs.readFileSync(config, 'utf8'), 'res://addons/conversation_probe/plugin.cfg'));
  const scene = path.join(project, 'scenes/main.tscn');
  const original = fs.readFileSync(scene);
  const output = await launch(['res://scenes/main.tscn'], 'conversation');
  assert.match(output, /PLAYFORGE_AGENT_CONVERSATION_OK/);
  assert.deepEqual(fs.readFileSync(scene), original);
  assert.equal(calls.length, 11);
  for (const [index, { url, method, body }] of calls.entries()) {
    assert.equal(url, '/api/chat');
    assert.equal(method, 'POST');
    assert.equal(body.model, 'conversation-fixture');
    assert.equal(body.stream, false);
    assert.deepEqual(body.tools.map(tool => tool.function.name), ['pf_workspace_apply', 'pf_asset_pack_import', 'pf_asset_pack_status']);
    const system = body.messages[0];
    assert.equal(system.role, 'system');
    assert.match(system.content, /node\.add.*property\.set.*node\.delete.*scene\.clear.*asset\.delete.*assets\.clear.*script\.write.*replay\.play/);
    const ctx = JSON.parse(system.content.slice(system.content.indexOf('{')));
    assert.equal(ctx.scene, 'res://scenes/main.tscn');
    assert.equal(ctx.rootType, 'Node2D');
    assert.deepEqual(ctx.selection, index === 0 ? [{ path: 'Hud/Status', type: 'Label' }] : []);
    assert.ok(Array.isArray(ctx.nodes) && ctx.nodes.some(node => node.path === 'Hud/Status'));
    assert.ok(Array.isArray(ctx.assets), 'Context must include project assets array');
    assert.ok(Array.isArray(ctx.storePacks) && ctx.storePacks.some(p => p.id === 'tappy-original'), 'Context must list storePacks');
  }
  const firstTurn = calls[0].body.messages.slice(1);
  assert.deepEqual(firstTurn, [{ role: 'user', content: '선택한 상태 문구를 준비 완료로 바꿔 줘.' }]);
  const nextTurn = calls[1].body.messages.slice(1);
  assert.deepEqual(nextTurn.map(item => item.role), ['user', 'assistant', 'user']);
  assert.deepEqual(nextTurn[0], firstTurn[0]);
  assert.match(nextTurn[1].content, /선택한 문구를 바꿨어요\./);
  assert.equal(nextTurn[2].content, '지금 상태 문구를 설명해 줘.');
});
