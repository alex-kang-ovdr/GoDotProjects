import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAiffBuffer } from './aiff-to-wav.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONVERTER_ROOT = path.resolve(__dirname, '..');

function walkFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

export function parseSpriteSheetMeta(metaPath, pngPath) {
  const meta = fs.readFileSync(metaPath, 'utf8');
  const png = fs.readFileSync(pngPath);
  const texWidth = png.readUInt32BE(16);
  const texHeight = png.readUInt32BE(20);
  const ppuMatch = meta.match(/spritePixelsToUnits:\s*([\d.]+)/);
  const pixelsPerUnit = ppuMatch ? Number(ppuMatch[1]) : 32;

  const fileIdToName = {};
  const fileIdSection = meta.split('fileIDToRecycleName:')[1]?.split('externalObjects:')[0] || '';
  for (const m of fileIdSection.matchAll(/^\s*(\d+):\s*(.+)$/gm)) {
    fileIdToName[Number(m[1])] = m[2].trim();
  }

  const sprites = [];
  const spriteBlocks = meta.split(/\r?\n\s*- serializedVersion: 2\r?\n\s*name:\s*/).slice(1);
  for (const block of spriteBlocks) {
    const name = block.split(/\r?\n/)[0].trim();
    const rectMatch = block.match(
      /rect:[\s\S]*?x:\s*([\d.-]+)[\s\S]*?y:\s*([\d.-]+)[\s\S]*?width:\s*([\d.-]+)[\s\S]*?height:\s*([\d.-]+)/,
    );
    if (!rectMatch) continue;
    const ux = Number(rectMatch[1]);
    const uy = Number(rectMatch[2]);
    const w = Number(rectMatch[3]);
    const h = Number(rectMatch[4]);
    // Unity sprite meta rect origin is bottom-left; Godot AtlasTexture origin is top-left
    const gx = ux;
    const gy = texHeight - uy - h;
    sprites.push({
      name,
      index: Number(name.split('_').pop()),
      unityRect: { x: ux, y: uy, w, h },
      godotRegion: { x: gx, y: gy, w, h },
    });
  }

  return { texWidth, texHeight, pixelsPerUnit, fileIdToName, sprites };
}

export function extractBinarySpriteRefs(filePath, fileIdToName) {
  const buf = fs.readFileSync(filePath);
  const isYaml = buf.subarray(0, 5).toString('ascii') === '%YAML';
  const versionMatch = buf.subarray(0, 64).toString('latin1').match(/\d+\.\d+\.\d+[a-z]\d+/);
  const found = [];

  if (isYaml) {
    const text = buf.toString('utf8');
    for (const m of text.matchAll(/fileID:\s*(\d+)/g)) {
      const id = Number(m[1]);
      if (fileIdToName[id]) found.push(fileIdToName[id]);
    }
  } else {
    for (let i = 0; i <= buf.length - 8; i += 4) {
      const lo = buf.readInt32LE(i);
      const hi = buf.readInt32LE(i + 4);
      if (hi === 0 && fileIdToName[lo]) {
        found.push(fileIdToName[lo]);
      }
    }
  }

  return {
    format: isYaml ? 'yaml' : 'binary',
    unityVersion: versionMatch ? versionMatch[0] : 'unknown',
    bytes: buf.length,
    spriteRefs: [...new Set(found)],
  };
}

const UNITY_API_PATTERNS = [
  { id: 'MonoBehaviour.Awake_Start_Update', regex: /\b(Awake|Start|Update)\s*\(/ },
  { id: 'Transform.position', regex: /\btransform\.position\b/ },
  { id: 'Animator.SetTrigger', regex: /\bSetTrigger\s*\(/ },
  { id: 'SpriteRenderer.sprite_sortingLayer', regex: /\bSpriteRenderer\b/ },
  { id: 'Rigidbody2D.MovePosition_Coroutine', regex: /\b(MovePosition|StartCoroutine|IEnumerator)\b/ },
  { id: 'Physics2D.Linecast_LayerMask', regex: /\b(Physics2D\.Linecast|LayerMask|BoxCollider2D)\b/ },
  { id: 'Collider2D.OnTriggerEnter2D', regex: /\bOnTriggerEnter2D\b/ },
  { id: 'Object.Instantiate_SetParent', regex: /\b(Instantiate|SetParent)\s*\(/ },
  { id: 'Object.DontDestroyOnLoad_SceneManager', regex: /\b(DontDestroyOnLoad|SceneManager|OnLevelWasLoaded)\b/ },
  { id: 'AudioSource.RandomizeSfx', regex: /\bAudioSource\b/ },
  { id: 'Input.GetAxisRaw', regex: /\bInput\.GetAxisRaw\b/ },
  { id: 'UnityEngine.UI.Text_Canvas', regex: /\bUnityEngine\.UI\b/ },
  { id: 'MonoBehaviour.Invoke', regex: /\bInvoke\s*\(/ },
  { id: 'UnityEditor.ReadmeEditor', regex: /\bUnityEditor\b/ },
];

export function analyzeUnityProject(projectRoot) {
  const registryPath = path.join(CONVERTER_ROOT, 'mappings', 'unity-core-api.v0.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const gradeById = Object.fromEntries(registry.entries.map((e) => [e.id, e.grade]));

  const allFiles = walkFiles(projectRoot);
  const assetsDir = path.join(projectRoot, 'Assets');
  const settingsDir = path.join(projectRoot, 'ProjectSettings');
  const assetFiles = walkFiles(assetsDir);
  const settingFiles = walkFiles(settingsDir);

  const sumBytes = (files) => files.reduce((acc, f) => acc + fs.statSync(f).size, 0);

  // SpriteSheet metadata
  const spriteMetaPath = path.join(assetsDir, 'Sprites', 'Scavengers_SpriteSheet.png.meta');
  const spritePngPath = path.join(assetsDir, 'Sprites', 'Scavengers_SpriteSheet.png');
  const spriteSheet = fs.existsSync(spriteMetaPath) && fs.existsSync(spritePngPath)
    ? parseSpriteSheetMeta(spriteMetaPath, spritePngPath)
    : null;

  // Gameplay C# scripts vs Editor/Tutorial scripts
  const gameplayScriptsDir = path.join(assetsDir, 'Scripts');
  const gameplayScriptFiles = walkFiles(gameplayScriptsDir).filter((f) => f.endsWith('.cs'));
  const allCsFiles = assetFiles.filter((f) => f.endsWith('.cs'));

  const apiUsageMap = new Map();
  const scriptsDetail = gameplayScriptFiles.map((filePath) => {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const nonEmptyLines = lines.filter((l) => l.trim().length > 0).length;
    const matchedApis = [];
    for (const pat of UNITY_API_PATTERNS) {
      if (pat.regex.test(content)) {
        matchedApis.push(pat.id);
        apiUsageMap.set(pat.id, (apiUsageMap.get(pat.id) || 0) + 1);
      }
    }
    return {
      file: path.relative(projectRoot, filePath).replace(/\\/g, '/'),
      lines: lines.length,
      nonEmptyLines,
      bytes: fs.statSync(filePath).size,
      apis: matchedApis,
    };
  });

  // Also scan TutorialInfo editor scripts for UnityEditor usage
  for (const filePath of allCsFiles) {
    if (gameplayScriptFiles.includes(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    if (/\bUnityEditor\b/.test(content)) {
      apiUsageMap.set('UnityEditor.ReadmeEditor', (apiUsageMap.get('UnityEditor.ReadmeEditor') || 0) + 1);
    }
  }

  // Prefabs
  const prefabDir = path.join(assetsDir, 'Prefabs');
  const prefabs = walkFiles(prefabDir)
    .filter((f) => f.endsWith('.prefab'))
    .map((f) => ({
      name: path.basename(f, '.prefab'),
      ...extractBinarySpriteRefs(f, spriteSheet ? spriteSheet.fileIdToName : {}),
    }));

  // Animations
  const animDir = path.join(assetsDir, 'Animations', 'Animations');
  const animations = walkFiles(animDir)
    .filter((f) => f.endsWith('.anim'))
    .map((f) => ({
      name: path.basename(f, '.anim'),
      ...extractBinarySpriteRefs(f, spriteSheet ? spriteSheet.fileIdToName : {}),
    }));

  // Scenes
  const scenes = assetFiles
    .filter((f) => f.endsWith('.unity'))
    .map((f) => ({
      file: path.relative(projectRoot, f).replace(/\\/g, '/'),
      ...extractBinarySpriteRefs(f, spriteSheet ? spriteSheet.fileIdToName : {}),
    }));

  // Audio
  const audioDir = path.join(assetsDir, 'Audio');
  const audioFiles = walkFiles(audioDir)
    .filter((f) => f.endsWith('.aif') || f.endsWith('.wav') || f.endsWith('.ogg'))
    .map((f) => {
      const buf = fs.readFileSync(f);
      const parsed = f.endsWith('.aif') ? parseAiffBuffer(buf) : null;
      return {
        file: path.basename(f),
        ext: path.extname(f).toLowerCase(),
        bytes: buf.length,
        channels: parsed?.channels ?? null,
        sampleRate: parsed?.sampleRate ?? null,
        bits: parsed?.sampleSize ?? null,
        durationSec: parsed ? Number((parsed.numSampleFrames / parsed.sampleRate).toFixed(3)) : null,
      };
    });

  // Add asset-level APIs
  if (spriteSheet) apiUsageMap.set('SpriteSheet.meta.sprites', spriteSheet.sprites.length);
  if (audioFiles.some((a) => a.ext === '.aif')) apiUsageMap.set('AudioClip.aif', audioFiles.length);

  const gradeSummary = { D: 0, A: 0, R: 0, X: 0 };
  const detectedApis = [...apiUsageMap.entries()].map(([id, occurrences]) => {
    const grade = gradeById[id] || 'X';
    gradeSummary[grade] = (gradeSummary[grade] || 0) + 1;
    return { id, grade, occurrences };
  });

  const versionTxtPath = path.join(settingsDir, 'ProjectVersion.txt');
  const projectVersion = fs.existsSync(versionTxtPath)
    ? fs.readFileSync(versionTxtPath, 'utf8').trim()
    : 'unknown';

  return {
    analyzedAt: new Date().toISOString(),
    projectName: 'Unity 2D Roguelike (Scavengers)',
    sourceRepo: 'https://github.com/omiroshn/2DRoguelike',
    projectVersion,
    totals: {
      allFilesCount: allFiles.length,
      allBytes: sumBytes(allFiles),
      sourceAndAssetsFilesCount: assetFiles.length + settingFiles.length,
      sourceAndAssetsBytes: sumBytes(assetFiles) + sumBytes(settingFiles),
      gameplayScriptCount: scriptsDetail.length,
      gameplayScriptLines: scriptsDetail.reduce((a, s) => a + s.lines, 0),
      gameplayScriptNonEmptyLines: scriptsDetail.reduce((a, s) => a + s.nonEmptyLines, 0),
      totalCsFilesCount: allCsFiles.length,
      prefabCount: prefabs.length,
      animationClipCount: animations.length,
      sceneCount: scenes.length,
      audioCount: audioFiles.length,
      audioBytes: audioFiles.reduce((a, f) => a + f.bytes, 0),
      spriteSliceCount: spriteSheet ? spriteSheet.sprites.length : 0,
    },
    serializationNotes: {
      binaryPrefabs: prefabs.filter((p) => p.format === 'binary').length,
      binaryAnims: animations.filter((a) => a.format === 'binary').length,
      binaryScenes: scenes.filter((s) => s.format === 'binary').length,
      aiffAudioFiles: audioFiles.filter((a) => a.ext === '.aif').length,
      aiff24BitFiles: audioFiles.filter((a) => a.bits === 24).length,
      deprecatedUnityApis: ['MonoBehaviour.OnLevelWasLoaded (Unity 5.x)'],
    },
    gradeSummary,
    detectedApis,
    spriteSheet: spriteSheet
      ? {
          texWidth: spriteSheet.texWidth,
          texHeight: spriteSheet.texHeight,
          pixelsPerUnit: spriteSheet.pixelsPerUnit,
          sprites: spriteSheet.sprites,
        }
      : null,
    scripts: scriptsDetail,
    prefabs,
    animations,
    scenes,
    audioFiles,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inputDir = process.argv[2] || path.join(CONVERTER_ROOT, 'samples', 'unity-2d-roguelike');
  const outPath = process.argv[3] || path.join(CONVERTER_ROOT, 'reports', 'before-unity-metrics.json');
  const report = analyzeUnityProject(inputDir);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Analyzed Unity project -> ${outPath}`);
  console.log(JSON.stringify({
    totals: report.totals,
    serializationNotes: report.serializationNotes,
    gradeSummary: report.gradeSummary,
  }, null, 2));
}
