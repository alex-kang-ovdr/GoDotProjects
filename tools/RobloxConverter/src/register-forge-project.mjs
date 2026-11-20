import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportRobloxPlaceToGodot } from './godot-exporter.mjs';
import { exportRojoProjectToGodot } from './rojo-exporter.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dir, '..', '..', '..');
const DEFAULT_PROJECTS_DIR = path.join(REPO_ROOT, 'forge', 'Saved', 'Platform', 'projects');

function collectProjectFiles(rootDir, rel = '', acc = {}) {
  for (const entry of fs.readdirSync(path.join(rootDir, rel), { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.')) continue;
      collectProjectFiles(rootDir, childRel, acc);
    } else {
      if (childRel === 'ir.json' || childRel === 'conversion_report.json') continue;
      acc[childRel] = fs.readFileSync(path.join(rootDir, childRel), 'utf8');
    }
  }
  return acc;
}

export function registerRobloxPortInForge({
  inputPath,
  format = 'rbxlx',
  projectId,
  projectName,
  projectsDir = DEFAULT_PROJECTS_DIR
}) {
  if (!/^[a-f0-9]{24}$/.test(projectId)) {
    throw new Error(`projectId must be 24 lowercase hex characters, got: ${projectId}`);
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-roblox-port-'));
  try {
    const report =
      format === 'rojo'
        ? exportRojoProjectToGodot(inputPath, tmpDir, { projectName })
        : exportRobloxPlaceToGodot(inputPath, tmpDir, { projectName });
    const files = collectProjectFiles(tmpDir);
    const now = new Date().toISOString();
    const record = {
      id: projectId,
      name: projectName,
      template: 'blank3d',
      revision: 1,
      files,
      updatedAt: now,
      activeReleaseId: null,
      history: [
        {
          revision: 1,
          files,
          createdAt: now,
          clientId: null,
          message: `Imported Roblox ${format} (${path.basename(inputPath)}) via RobloxConverter`
        }
      ],
      releases: []
    };

    const targetDir = path.join(projectsDir, projectId);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'project.json'), JSON.stringify(record), 'utf8');

    return {
      projectId,
      projectName,
      format,
      fileCount: Object.keys(files).length,
      editorUrlPath: `/OfficialGodot/editor.html?project=${projectId}`,
      report
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const fixturesDir = path.resolve(__dir, '..', 'fixtures');
  const results = [
    registerRobloxPortInForge({
      inputPath: path.join(fixturesDir, 'chaos-obby', 'ChaosObby.rbxlx'),
      format: 'rbxlx',
      projectId: 'c4a050bb0000000000000001',
      projectName: 'Chaos Obby (Roblox → Godot Port)'
    }),
    registerRobloxPortInForge({
      inputPath: path.join(fixturesDir, 'war-tycoon', 'default.project.json'),
      format: 'rojo',
      projectId: 'c4a050bb0000000000000012',
      projectName: 'War Tycoon (Roblox → Godot Port)'
    }),
    registerRobloxPortInForge({
      inputPath: path.join(fixturesDir, 'power-punch-sim', 'default.project.json'),
      format: 'rojo',
      projectId: 'c4a050bb0000000000000013',
      projectName: 'Power Punch Simulator (Roblox → Godot Port)'
    }),
    registerRobloxPortInForge({
      inputPath: path.join(fixturesDir, 'lantai-runtuh', 'default.project.json'),
      format: 'rojo',
      projectId: 'c4a050bb0000000000000014',
      projectName: 'Lantai Runtuh (Roblox → Godot Port)'
    }),
    registerRobloxPortInForge({
      inputPath: path.join(fixturesDir, 'baseplate-413', 'xml.rbxlx'),
      format: 'rbxlx',
      projectId: 'ba5e04130000000000000002',
      projectName: 'Baseplate 413 (Roblox → Godot Port)'
    })
  ];
  console.log(JSON.stringify(results.map(({ report: _r, ...rest }) => rest), null, 2));
}
