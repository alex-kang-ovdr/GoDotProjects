'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const godot = process.env.GODOT_EDITOR || 'D:\\Github\\GoDotProjects\\Godot_v4.7.2-stable_win64.exe';

test('Godot guide bridge decodes revision numbers and resolves nodePath selection targets', { skip: fs.existsSync(godot) ? false : `Godot editor not found: ${godot}`, timeout: 30000 }, () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-guide-bridge-'));
  const addon = path.join(temporary, 'addons', 'playforge_platform');
  fs.mkdirSync(addon, { recursive: true });
  fs.copyFileSync(path.join(root, 'Godot', 'addons', 'playforge_platform', 'plugin.gd'), path.join(addon, 'plugin.gd'));
  fs.writeFileSync(path.join(addon, 'plugin.cfg'), '[plugin]\nname="PlayForge Platform"\ndescription="Bridge regression test"\nauthor="PlayForge"\nversion="1.0"\nscript="plugin.gd"\n');
  fs.writeFileSync(path.join(temporary, 'project.godot'), 'config_version=5\n\n[application]\nconfig/name="GuideBridgeTest"\n');
  fs.writeFileSync(path.join(temporary, 'bridge-check.gd'), String.raw`extends SceneTree

const Bridge = preload("res://addons/playforge_platform/plugin.gd")

func _initialize() -> void:
	var payload := "{\"source\":\"playforge-platform-guide\",\"type\":\"reveal\",\"requestId\":\"case-7\",\"revision\":7.0,\"nodePath\":\"Container/Target\",\"dimension\":\"3d\"}"
	var command := Bridge._decode_guide_message(payload)
	if command.is_empty():
		_fail("A valid JSON command with an integral float revision was rejected.")
		return
	if command["revision"] != 7 or typeof(command["revision"]) != TYPE_INT:
		_fail("Decoded revisions must be normalized to int.")
		return
	if not Bridge._decode_guide_message(payload.replace("7.0", "7.5")).is_empty():
		_fail("A fractional revision was accepted.")
		return
	if not Bridge._decode_guide_message(payload.replace("\"dimension\":\"3d\"", "\"dimension\":\"3d\",\"extra\":true")).is_empty():
		_fail("An unknown command field was accepted.")
		return
	for screen in ["2D", "3D", "Script"]:
		var screen_payload := "{\"source\":\"playforge-platform-guide\",\"type\":\"screen\",\"requestId\":\"screen-case\",\"screen\":\"%s\"}" % screen
		var screen_command := Bridge._decode_guide_message(screen_payload)
		if screen_command.is_empty() or screen_command["screen"] != screen:
			_fail("An allowed screen command was rejected: %s" % screen)
			return
	if not Bridge._decode_guide_message("{\"source\":\"playforge-platform-guide\",\"type\":\"screen\",\"requestId\":\"screen-case\",\"screen\":\"Game\"}").is_empty():
		_fail("A screen outside the allowlist was accepted.")
		return
	if not Bridge._decode_guide_message("{\"source\":\"playforge-platform-guide\",\"type\":\"screen\",\"requestId\":\"screen-case\",\"screen\":\"2D\",\"extra\":true}").is_empty():
		_fail("An extra field on a screen command was accepted.")
		return
	var root := Node.new()
	var container := Node.new()
	container.name = "Container"
	root.add_child(container)
	var target := Node.new()
	target.name = "Target"
	container.add_child(target)
	if Bridge._resolve_guide_node(root, command["nodePath"]) != target:
		_fail("The nodePath did not resolve to the requested child for selection.")
		return
	if Bridge._resolve_guide_node(root, ".") != root or Bridge._resolve_guide_node(root, "../Target") != null:
		_fail("Root or traversal path validation does not match the bridge contract.")
		return
	var button := Button.new()
	button.text = "게임 실행"
	var icon := Label.new()
	button.add_child(icon)
	if Bridge._semantic_button_label(icon) != "게임 실행":
		_fail("A nested control click did not resolve its BaseButton label.")
		return
	button.text = ""
	button.tooltip_text = "협업 현황"
	if Bridge._semantic_button_label(button) != "협업 현황":
		_fail("A button tooltip was not used when its visible text was empty.")
		return
	var texture_button := TextureButton.new()
	texture_button.tooltip_text = "텍스처 버튼 도움말"
	if Bridge._semantic_button_label(texture_button) != "텍스처 버튼 도움말":
		_fail("A TextureButton tooltip should be used without reading a text property it does not provide.")
		return
	var text_field := LineEdit.new()
	if Bridge._semantic_button_label(text_field) != "":
		_fail("Text field content was mistakenly treated as a semantic button label.")
		return
	text_field.free()
	texture_button.free()
	button.free()
	root.free()
	print("GUIDE_BRIDGE_TEST_OK")
	quit(0)

func _fail(message: String) -> void:
	push_error(message)
	quit(1)
`);

  try {
    const result = spawnSync(godot, ['--headless', '--path', temporary, '--script', 'res://bridge-check.gd'], { encoding: 'utf8', timeout: 25000 });
    const evidence = path.join(root, 'Saved', 'Tests', 'platform');
    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, 'guide-bridge.log'), (result.stdout || '') + (result.stderr || ''));
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /GUIDE_BRIDGE_TEST_OK/);
    assert.doesNotMatch(result.stdout + result.stderr, /SCRIPT ERROR|Parse Error|ERROR:/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
