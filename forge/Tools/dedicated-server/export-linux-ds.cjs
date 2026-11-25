#!/usr/bin/env node
'use strict';
/**
 * Linux x86_64 데디케이티드 서버 export 시험 (로드맵 28 첫 작업 일부).
 *
 * forge/Godot/project.godot·export_presets.cfg를 건드리지 않기 위해 임시 스테이징 프로젝트
 * (forge/Saved/Tests/netframework/linux-ds/project)에 netframework 애드온만 복사하고
 * `dedicated_server=true` 프리셋으로 --export-release 한다. 실행(Linux 호스트)은 이 스크립트 범위 밖이다.
 *
 * 사용: node forge/Tools/dedicated-server/export-linux-ds.cjs [--godot <exe>]
 * Godot 4.7.2 Linux export template(linux_release.x86_64)이 필요하다. 없으면 종료 코드 2.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { resolveGodot } = require('./run-ds-2clients.cjs');

const REPO = path.resolve(__dirname, '../../..');
const ADDON = path.join(REPO, 'forge', 'Godot', 'addons', 'playforge_netframework');
const OUT = path.join(REPO, 'forge', 'Saved', 'Tests', 'netframework', 'linux-ds');
const STAGE = path.join(OUT, 'project');
const BIN = path.join(OUT, 'playforge-ds-spike.x86_64');

function templateDir() {
  const base = process.platform === 'win32'
    ? path.join(process.env.APPDATA || '', 'Godot', 'export_templates')
    : path.join(os.homedir(), '.local', 'share', 'godot', 'export_templates');
  return path.join(base, '4.7.2.stable');
}

function main() {
  const argv = process.argv.slice(2);
  const gi = argv.indexOf('--godot');
  const g = resolveGodot(gi >= 0 ? argv[gi + 1] : undefined);
  if (!g.executable) { console.error('[export-linux-ds] Godot not found'); process.exit(2); }
  const tpl = path.join(templateDir(), 'linux_release.x86_64');
  if (!fs.existsSync(tpl)) { console.error(`[export-linux-ds] export template missing: ${tpl}`); process.exit(2); }

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(STAGE, 'addons'), { recursive: true });
  fs.cpSync(ADDON, path.join(STAGE, 'addons', 'playforge_netframework'), { recursive: true });
  fs.writeFileSync(path.join(STAGE, 'project.godot'), [
    'config_version=5',
    '',
    '[application]',
    'config/name="PlayForge DS Spike"',
    'run/main_scene="res://addons/playforge_netframework/demo/spike.tscn"',
    'config/features=PackedStringArray("4.7")',
    '',
    '[physics]',
    'common/physics_ticks_per_second=30',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(STAGE, 'export_presets.cfg'), [
    '[preset.0]',
    '',
    'name="Linux DS"',
    'platform="Linux"',
    'runnable=true',
    'dedicated_server=true',
    'custom_features=""',
    'export_filter="all_resources"',
    'include_filter=""',
    'exclude_filter=""',
    'export_path=""',
    '',
    '[preset.0.options]',
    '',
    'binary_format/embed_pck=true',
    'binary_format/architecture="x86_64"',
    'texture_format/s3tc_bptc=true',
    'texture_format/etc2_astc=false',
    '',
  ].join('\n'));

  const t0 = Date.now();
  const imp = spawnSync(g.executable, ['--headless', '--path', STAGE, '--import'], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  const exp = spawnSync(g.executable, ['--headless', '--path', STAGE, '--export-release', 'Linux DS', BIN], { encoding: 'utf8', windowsHide: true, timeout: 180000 });
  const log = `${imp.stdout || ''}${imp.stderr || ''}\n---- export ----\n${exp.stdout || ''}${exp.stderr || ''}`;
  fs.writeFileSync(path.join(OUT, 'export.log'), log);
  const ok = exp.status === 0 && fs.existsSync(BIN);
  const size = ok ? fs.statSync(BIN).size : 0;
  let elfOk = false;
  if (ok) {
    const fd = fs.openSync(BIN, 'r');
    const head = Buffer.alloc(4);
    fs.readSync(fd, head, 0, 4, 0);
    fs.closeSync(fd);
    elfOk = head.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
  }
  const summary = { ok: ok && elfOk, binary: BIN, bytes: size, elf: elfOk, exportMs: Date.now() - t0, importExit: imp.status, exportExit: exp.status, ran: false };
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.ok ? 0 : 1);
}

main();
