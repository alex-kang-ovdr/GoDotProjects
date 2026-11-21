import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportRobloxPlaceToGodot } from './godot-exporter.mjs';
import { exportRojoProjectToGodot } from './rojo-exporter.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const CONVERTER_ROOT = path.resolve(__dir, '..');
const REPO_ROOT = path.resolve(CONVERTER_ROOT, '..', '..');
const TEMPLATES_ROOT = path.join(REPO_ROOT, 'forge', 'Templates');

const TEMPLATE_SPECS = [
  {
    id: 'roblox-chaos-obby',
    name: 'Chaos Obby (Roblox Port)',
    description:
      'MIT 오픈소스 Roblox 오비 게임(SBdevz/Chaos-Obby)을 Godot 4.7.2로 자동 포팅한 3D 템플릿: 회전 장애물, 사라지는 발판, 용암, 체크포인트, 카오스 안개/속도 이벤트 및 타이머 HUD 포함.',
    format: 'rbxlx',
    inputPath: path.join(CONVERTER_ROOT, 'fixtures', 'chaos-obby', 'ChaosObby.rbxlx'),
    licensePath: path.join(CONVERTER_ROOT, 'fixtures', 'chaos-obby', 'LICENSE'),
    upstreamUrl: 'https://github.com/SBdevz/Chaos-Obby',
    controlsNote: '방향키/WASD 이동, Space 점프. 씬 실행 시 회전 빔·사라지는 발판·용암 리스폰·체크포인트·카오스 타이머 HUD가 동작합니다.'
  },
  {
    id: 'roblox-war-tycoon',
    name: 'War Tycoon (Roblox Port)',
    description:
      'MIT 오픈소스 Roblox 타이쿤+전투 게임(ManBoyx/roblox-war-tycoon)을 Godot 4.7.2로 자동 포팅한 3D 템플릿: 4팀 컬러 플롯, 드로퍼·터렛, leaderstats 경제(Economy) 및 처치 보상(Combat·RemoteEvent) 포함.',
    format: 'rojo',
    inputPath: path.join(CONVERTER_ROOT, 'fixtures', 'war-tycoon', 'default.project.json'),
    licensePath: path.join(CONVERTER_ROOT, 'fixtures', 'war-tycoon', 'LICENSE'),
    upstreamUrl: 'https://github.com/ManBoyx/roblox-war-tycoon',
    controlsNote: '4개 팀 베이스 플롯과 변환된 Config/Economy/Combat 모듈이 포함됩니다.'
  },
  {
    id: 'roblox-power-punch-sim',
    name: 'Power Punch Simulator (Roblox Port)',
    description:
      'MIT 오픈소스 Roblox 클리커 시뮬레이터(LILRINO71/power-punch-simulator)를 Godot 4.7.2로 자동 포팅한 3D 템플릿: 5개 트레이닝 존(Beach·City·Volcano·Space·VIP), Formulas 배율·약어 계산 및 MarketplaceService X등급 스텁 포함.',
    format: 'rojo',
    inputPath: path.join(CONVERTER_ROOT, 'fixtures', 'power-punch-sim', 'default.project.json'),
    licensePath: path.join(CONVERTER_ROOT, 'fixtures', 'power-punch-sim', 'LICENSE'),
    upstreamUrl: 'https://github.com/LILRINO71/power-punch-simulator',
    controlsNote: '5개 트레이닝 존과 변환된 Config/Formulas 모듈, X등급 MarketplaceService/DataStoreService 로컬 스텁이 포함됩니다.'
  },
  {
    id: 'roblox-lantai-runtuh',
    name: 'Lantai Runtuh (Roblox Port)',
    description:
      'MIT 오픈소스 strict Luau 낙하 타일 파티 게임(lukaririnki26/lantai-runtuh)을 Godot 4.7.2로 자동 포팅한 3D 템플릿: 12×12(144타일) 안전색 패턴 생성(Pattern), 라운드 보상(Rewards) 및 비안전 타일 낙하 시뮬레이션 포함.',
    format: 'rojo',
    inputPath: path.join(CONVERTER_ROOT, 'fixtures', 'lantai-runtuh', 'default.project.json'),
    licensePath: path.join(CONVERTER_ROOT, 'fixtures', 'lantai-runtuh', 'LICENSE'),
    upstreamUrl: 'https://github.com/lukaririnki26/lantai-runtuh',
    controlsNote: '12×12 아레나 타일과 변환된 strict Luau Config/Pattern/Rewards 모듈이 포함됩니다.'
  }
];

function copyTreeFiltered(srcDir, dstDir, rel = '') {
  const curSrc = path.join(srcDir, rel);
  const curDst = path.join(dstDir, rel);
  fs.mkdirSync(curDst, { recursive: true });
  for (const entry of fs.readdirSync(curSrc, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.')) continue;
      copyTreeFiltered(srcDir, dstDir, childRel);
    } else {
      if (childRel === 'ir.json' || childRel === 'conversion_report.json') continue;
      if (childRel === 'main.tscn') {
        const scenesDir = path.join(dstDir, 'scenes');
        fs.mkdirSync(scenesDir, { recursive: true });
        fs.copyFileSync(path.join(srcDir, childRel), path.join(scenesDir, 'main.tscn'));
      } else if (childRel === 'project.godot') {
        const content = fs
          .readFileSync(path.join(srcDir, childRel), 'utf8')
          .replace(/run\/main_scene="res:\/\/main\.tscn"/g, 'run/main_scene="res://scenes/main.tscn"');
        fs.writeFileSync(path.join(dstDir, childRel), content, 'utf8');
      } else {
        fs.copyFileSync(path.join(srcDir, childRel), path.join(dstDir, childRel));
      }
    }
  }
}

function listScriptFiles(templateDir) {
  const out = [];
  const scriptsDir = path.join(templateDir, 'scripts');
  if (fs.existsSync(scriptsDir)) {
    for (const f of fs.readdirSync(scriptsDir).sort()) {
      if (f.endsWith('.gd')) out.push(`scripts/${f}`);
    }
  }
  for (const top of ['place_bootstrap.gd', 'game_controller.gd']) {
    if (fs.existsSync(path.join(templateDir, top))) out.push(top);
  }
  out.push('scenes/main.tscn', 'project.godot');
  return out;
}

export function exportAllGodotTemplates({ templatesRoot = TEMPLATES_ROOT } = {}) {
  const summaries = [];
  for (const spec of TEMPLATE_SPECS) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `godot-tpl-${spec.id}-`));
    try {
      if (spec.format === 'rojo') {
        exportRojoProjectToGodot(spec.inputPath, tmpDir, { projectName: spec.name });
      } else {
        exportRobloxPlaceToGodot(spec.inputPath, tmpDir, { projectName: spec.name });
      }

      const targetDir = path.join(templatesRoot, spec.id);
      fs.rmSync(targetDir, { recursive: true, force: true });
      fs.mkdirSync(targetDir, { recursive: true });

      copyTreeFiltered(tmpDir, targetDir);

      if (fs.existsSync(spec.licensePath)) {
        fs.copyFileSync(spec.licensePath, path.join(targetDir, 'LICENSE.txt'));
      }

      const guideOrder = listScriptFiles(targetDir);
      const metadata = {
        id: spec.id,
        name: spec.name,
        description: spec.description,
        dimension: '3d',
        assetPaths: [],
        guideOrder,
        guide: 'README.md'
      };
      fs.writeFileSync(path.join(targetDir, 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n', 'utf8');

      const readme = `# ${spec.name}\n\n` +
        `- **원본 Roblox 프로젝트**: ${spec.upstreamUrl} (MIT License, \`LICENSE.txt\` 포함)\n` +
        `- **변환 도구**: \`tools/RobloxConverter\` + \`addons/playforge_roblox_compat\`\n` +
        `- **렌더러**: Godot 4.7.2 \`GL Compatibility\` (데스크톱 및 PlayForge 웹 에디터 호환)\n\n` +
        `## 실행 및 편집\n\n` +
        `- 메인 씬: \`res://scenes/main.tscn\`\n` +
        `- ${spec.controlsNote}\n`;
      fs.writeFileSync(path.join(targetDir, 'README.md'), readme, 'utf8');

      summaries.push({
        id: spec.id,
        name: spec.name,
        targetDir,
        fileCount: guideOrder.length
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
  return summaries;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const summaries = exportAllGodotTemplates();
  console.log(JSON.stringify(summaries, null, 2));
}
