// Hub-Agent Hybrid Project Porting Engine (Roblox / Unity / Unreal -> Godot 4.7.2).
// Stage 1: Deterministic API & Structure Static Analyzer (identifies mapped vs AI-translated APIs)
// Stage 2: Gemini AI Deep Porting -> complete Godot 4.7.2 project files (project.godot, scenes/main.tscn, scripts/*.gd, PORTING_REPORT.md)

import { ApiError } from '../security.mjs';
import { extractJsonFromText } from './modeling-glb.mjs';

export const SUPPORTED_SOURCE_ENGINES = new Set(['roblox', 'unity', 'unreal']);

const ENGINE_SIGNATURES = {
  roblox: [
    { pattern: /\bInstance\.new\b/g, sourceApi: 'Instance.new', godotTarget: 'Node / PackedScene.instantiate()', tier: 'deterministic' },
    { pattern: /\bgame:GetService\(\s*["']Players["']\s*\)/g, sourceApi: 'Players Service', godotTarget: 'MultiplayerAPI / SceneTree group "players"', tier: 'deterministic' },
    { pattern: /\bgame:GetService\(\s*["']RunService["']\s*\)/g, sourceApi: 'RunService.Heartbeat/RenderStepped', godotTarget: '_physics_process(delta) / _process(delta)', tier: 'deterministic' },
    { pattern: /\bgame:GetService\(\s*["']TweenService["']\s*\)/g, sourceApi: 'TweenService:Create', godotTarget: 'create_tween().tween_property()', tier: 'deterministic' },
    { pattern: /\bgame:GetService\(\s*["']UserInputService["']\s*\)/g, sourceApi: 'UserInputService', godotTarget: 'Input / _unhandled_input(event)', tier: 'deterministic' },
    { pattern: /\bRemoteEvent\b|\bFireServer\b|\bOnServerEvent\b/g, sourceApi: 'RemoteEvent / RPC', godotTarget: '@rpc("any_peer", "reliable")', tier: 'ai_assisted' },
    { pattern: /\bDataStoreService\b/g, sourceApi: 'DataStoreService', godotTarget: 'PlayHub SSOT DataStore SDK', tier: 'ai_assisted' },
    { pattern: /\.Touched:Connect/g, sourceApi: 'BasePart.Touched', godotTarget: 'Area3D.body_entered signal', tier: 'deterministic' },
    { pattern: /\bHumanoid\b/g, sourceApi: 'Humanoid', godotTarget: 'CharacterBody3D + move_and_slide()', tier: 'deterministic' }
  ],
  unity: [
    { pattern: /\bMonoBehaviour\b/g, sourceApi: 'MonoBehaviour', godotTarget: 'Node / Node2D / Node3D GDScript', tier: 'deterministic' },
    { pattern: /\bRigidbody2D\b/g, sourceApi: 'Rigidbody2D', godotTarget: 'RigidBody2D / CharacterBody2D', tier: 'deterministic' },
    { pattern: /\bRigidbody\b/g, sourceApi: 'Rigidbody', godotTarget: 'RigidBody3D / CharacterBody3D', tier: 'deterministic' },
    { pattern: /\bSerializeField\b/g, sourceApi: '[SerializeField]', godotTarget: '@export var', tier: 'deterministic' },
    { pattern: /\bGetComponent\s*<[^>]+>\s*\(\s*\)/g, sourceApi: 'GetComponent<T>()', godotTarget: 'get_node() / @onready var $Child', tier: 'deterministic' },
    { pattern: /\bInstantiate\s*\(/g, sourceApi: 'Object.Instantiate()', godotTarget: 'PackedScene.instantiate() + add_child()', tier: 'deterministic' },
    { pattern: /\bInput\.GetAxis(?:Raw)?\b|\bInput\.GetKey/g, sourceApi: 'UnityEngine.Input', godotTarget: 'Input.get_vector() / Input.is_action_pressed()', tier: 'deterministic' },
    { pattern: /\bOnTriggerEnter(?:2D)?\b|\bOnCollisionEnter(?:2D)?\b/g, sourceApi: 'Physics Trigger/Collision', godotTarget: 'Area.body_entered / RigidBody.body_entered', tier: 'deterministic' },
    { pattern: /\bCoroutine\b|\bIEnumerator\b|\bWaitForSeconds\b/g, sourceApi: 'StartCoroutine / WaitForSeconds', godotTarget: 'await get_tree().create_timer(sec).timeout', tier: 'ai_assisted' },
    { pattern: /\bScriptableObject\b/g, sourceApi: 'ScriptableObject', godotTarget: 'class_name CustomResource extends Resource', tier: 'ai_assisted' }
  ],
  unreal: [
    { pattern: /\bACharacter\b|\bUCharacterMovementComponent\b/g, sourceApi: 'ACharacter / CharacterMovement', godotTarget: 'CharacterBody3D (cm -> m 0.01 scale)', tier: 'deterministic' },
    { pattern: /\bAActor\b|\bUSceneComponent\b/g, sourceApi: 'AActor / USceneComponent', godotTarget: 'Node3D scene root', tier: 'deterministic' },
    { pattern: /\bUPROPERTY\b/g, sourceApi: 'UPROPERTY(EditAnywhere/BlueprintReadWrite)', godotTarget: '@export var', tier: 'deterministic' },
    { pattern: /\bUFUNCTION\b/g, sourceApi: 'UFUNCTION(BlueprintCallable)', godotTarget: 'Typed GDScript func / Signal', tier: 'deterministic' },
    { pattern: /\bK2Node_Event\b|\bBeginPlay\b|\bEventTick\b/g, sourceApi: 'Blueprint EventGraph (BeginPlay/Tick)', godotTarget: '_ready() / _physics_process(delta)', tier: 'deterministic' },
    { pattern: /\bSpawnActor\b/g, sourceApi: 'UWorld::SpawnActor', godotTarget: 'PackedScene.instantiate() + add_child()', tier: 'deterministic' },
    { pattern: /\bLineTraceSingleByChannel\b/g, sourceApi: 'LineTraceSingleByChannel', godotTarget: 'PhysicsRayQueryParameters3D + intersect_ray()', tier: 'ai_assisted' },
    { pattern: /\bEnhancedInput\b|\bSetupPlayerInputComponent\b/g, sourceApi: 'UE EnhancedInput', godotTarget: 'InputMap + _unhandled_input()', tier: 'ai_assisted' },
    { pattern: /\bNiagara\b|\bSpawnSystemAtLocation\b/g, sourceApi: 'Niagara VFX', godotTarget: 'GPUParticles3D fallback burst', tier: 'ai_assisted' }
  ]
};

export function analyzeSourceProject({ sourceEngine, files = [], sourceCode = '' }) {
  const engine = String(sourceEngine || '').toLowerCase();
  if (!SUPPORTED_SOURCE_ENGINES.has(engine)) {
    throw new ApiError(422, 'UNSUPPORTED_SOURCE_ENGINE', '지원하는 원본 엔진은 roblox, unity, unreal 입니다.');
  }

  const normalizedFiles = [];
  if (Array.isArray(files)) {
    for (const f of files.slice(0, 20)) {
      if (!f || typeof f.path !== 'string' || typeof f.content !== 'string') continue;
      const cleanPath = f.path.replace(/\\/g, '/').replace(/^\/+/, '').slice(0, 120);
      if (!cleanPath || cleanPath.includes('..')) continue;
      normalizedFiles.push({ path: cleanPath, content: f.content.slice(0, 32_000) });
    }
  }
  if (!normalizedFiles.length && typeof sourceCode === 'string' && sourceCode.trim()) {
    const defaultExt = engine === 'roblox' ? 'ServerScriptService/Main.lua'
      : engine === 'unity' ? 'Assets/Scripts/GameController.cs'
        : 'Source/MainCharacter.blueprint.json';
    normalizedFiles.push({ path: defaultExt, content: sourceCode.trim().slice(0, 32_000) });
  }
  if (!normalizedFiles.length) {
    throw new ApiError(400, 'PORTING_SOURCE_REQUIRED', '포팅할 원본 스크립트 또는 프로젝트 파일 내용을 입력해 주세요.');
  }

  const combined = normalizedFiles.map(f => `// FILE: ${f.path}\n${f.content}`).join('\n\n');
  if (/UnrealEngine\/Engine\/Content|StarterContent.*Epic\s+Games\s+Inc\.\s+All\s+Rights\s+Reserved/i.test(combined)) {
    throw new ApiError(422, 'EULA_RESTRICTED_CONTENT', '엔진 독점 배포 제한(EULA) 에셋이 감지되어 변환이 차단되었습니다.');
  }

  const eulaWarnings = [];
  for (const f of normalizedFiles) {
    if (/(?:marketplace|fab|assetstore|megascans)/i.test(f.path) || /\.(?:uasset|umap|rbxm)$/i.test(f.path)) {
      eulaWarnings.push(`외부 마켓플레이스·바이너리 에셋(${f.path}) 라이선스(재배포 허용 여부)를 출시 전 반드시 확인하세요.`);
    }
  }

  const detectedMappings = [];
  for (const rule of ENGINE_SIGNATURES[engine] || []) {
    const matches = combined.match(rule.pattern);
    if (matches && matches.length > 0) {
      detectedMappings.push({
        sourceApi: rule.sourceApi,
        godotTarget: rule.godotTarget,
        tier: rule.tier,
        occurrences: matches.length
      });
    }
  }

  return {
    sourceEngine: engine,
    fileCount: normalizedFiles.length,
    totalChars: combined.length,
    normalizedFiles,
    detectedMappings,
    eulaWarnings
  };
}

export function buildPortingPrompt({ projectName, analysis, instructions = '' }) {
  const engineLabel = {
    roblox: 'Roblox (Luau / RBXLX)',
    unity: 'Unity (C# MonoBehaviour / Scene)',
    unreal: 'Unreal Engine 5 (Blueprint / C++ Actor)'
  }[analysis.sourceEngine];

  const systemPrompt = `You are a Principal Game Engine Porting Architect specializing in porting ${engineLabel} projects to Godot 4.7.2 (GDScript 2.0).
Produce a complete, runnable Godot 4.7.2 project bundle in JSON.

STRICT OUTPUT SCHEMA (JSON ONLY, NO MARKDOWN FENCES):
{
  "projectName": "SafeProjectTitle",
  "summary": "한국어 포팅 결과 핵심 요약 (2~3문장)",
  "files": [
    { "path": "project.godot", "content": "; Engine configuration file.\\nconfig_version=5\\n..." },
    { "path": "scenes/main.tscn", "content": "[gd_scene load_steps=2 format=3]\\n..." },
    { "path": "scripts/main.gd", "content": "extends Node3D\\n..." }
  ],
  "parityNotes": [
    "변환된 핵심 메카닉·단위계(예: UE cm -> Godot m, Roblox Studs -> m, Unity C# -> GDScript 2.0) 설명"
  ],
  "manualFollowUps": [
    "에셋/셰이더 등 수동 확인 권장 항목"
  ]
}

GODOT 4.7.2 RULES:
- Use config_version=5 in project.godot with run/main_scene="res://scenes/main.tscn".
- Use Godot 4.x typed GDScript (@export, @onready, CharacterBody2D/3D, move_and_slide() with velocity property, create_tween(), Signal.connect(callable)).
- Never use Godot 3 APIs (KinematicBody, move_and_slide(vel), yield(), Tween node).
- Ensure every ext_resource path in scenes/main.tscn matches an emitted file in "files".`;

  const userPrompt = [
    `Target Project Name: ${projectName || 'PortedGodotGame'}`,
    `Source Engine: ${engineLabel}`,
    instructions ? `Additional User Instructions: ${instructions}` : '',
    `Stage-1 Static API Analysis:\n${JSON.stringify(analysis.detectedMappings, null, 2)}`,
    `Source Project Files:\n${analysis.normalizedFiles.map(f => `--- ${f.path} ---\n${f.content}`).join('\n\n')}`
  ].filter(Boolean).join('\n\n');

  return { systemPrompt, userPrompt };
}

function sanitizeRelativeProjectPath(rawPath) {
  const clean = String(rawPath || '').replace(/\\/g, '/').replace(/^res:\/\//i, '').replace(/^\/+/, '').trim();
  if (!clean || clean.length > 120 || /[\0-\x1f:]/.test(clean)) return null;
  const segments = clean.split('/');
  if (segments.some(s => !s || s === '.' || s === '..' || s.startsWith('.godot'))) return null;
  return segments.join('/');
}

export function normalizePortedProjectBundle(rawText, { projectName = 'PortedGodotProject', analysis }) {
  const parsed = extractJsonFromText(rawText);
  const safeTitle = String(projectName || parsed.projectName || 'PortedGodotProject').trim().slice(0, 80) || 'PortedGodotProject';
  const rawFiles = Array.isArray(parsed.files) ? parsed.files : [];

  const fileMap = new Map();
  for (const entry of rawFiles.slice(0, 32)) {
    const rel = sanitizeRelativeProjectPath(entry?.path);
    if (!rel || typeof entry?.content !== 'string') continue;
    fileMap.set(rel, entry.content.slice(0, 200_000));
  }

  if (!fileMap.has('scripts/main.gd') && ![...fileMap.keys()].some(k => k.endsWith('.gd'))) {
    fileMap.set('scripts/main.gd', [
      'extends Node2D',
      '',
      'func _ready() -> void:',
      `\tprint(${JSON.stringify(`${safeTitle} ported from ${analysis.sourceEngine}`)})`,
      ''
    ].join('\n'));
  }

  const firstScript = [...fileMap.keys()].find(k => k.endsWith('.gd')) || 'scripts/main.gd';
  if (!fileMap.has('scenes/main.tscn')) {
    fileMap.set('scenes/main.tscn', [
      '[gd_scene load_steps=2 format=3]',
      '',
      `[ext_resource type="Script" path="res://${firstScript}" id="1_main"]`,
      '',
      '[node name="Main" type="Node2D"]',
      'script = ExtResource("1_main")',
      ''
    ].join('\n'));
  }

  if (!fileMap.has('project.godot')) {
    fileMap.set('project.godot', [
      '; Engine configuration file.',
      '; Generated by PlayHub Hub-Agent Project Porting.',
      '',
      'config_version=5',
      '',
      '[application]',
      '',
      `config/name=${JSON.stringify(safeTitle)}`,
      'run/main_scene="res://scenes/main.tscn"',
      'config/features=PackedStringArray("4.7", "Forward Plus")',
      ''
    ].join('\n'));
  }

  const parityNotes = Array.isArray(parsed.parityNotes)
    ? parsed.parityNotes.map(x => String(x).slice(0, 300)).slice(0, 12)
    : [];
  const manualFollowUps = Array.isArray(parsed.manualFollowUps)
    ? parsed.manualFollowUps.map(x => String(x).slice(0, 300)).slice(0, 12)
    : [];
  const summary = String(parsed.summary || `${analysis.sourceEngine.toUpperCase()} → Godot 4.7.2 하이브리드 AI 포팅 완료`).slice(0, 400);

  const reportMd = [
    `# ${safeTitle} — Godot 4.7.2 Porting Report`,
    '',
    `- **원본 엔진**: \`${analysis.sourceEngine}\``,
    `- **생성 파일 수**: ${fileMap.size + 1}개`,
    `- **요약**: ${summary}`,
    '',
    '## 1. 정적 API 매핑 분석',
    analysis.detectedMappings.length
      ? analysis.detectedMappings.map(m => `- \`${m.sourceApi}\` (${m.occurrences}회) → **${m.godotTarget}** [${m.tier}]`).join('\n')
      : '- 커스텀 게임 로직 중심 스크립트 (AI 심층 변환 적용)',
    '',
    '## 2. 동작 동등성 및 변환 노트',
    ...(parityNotes.length ? parityNotes.map(n => `- ${n}`) : ['- Godot 4.7.2 표준 시그널 및 노드 생명주기로 변환됨']),
    '',
    '## 3. 후속 권장 점검',
    ...(manualFollowUps.length ? manualFollowUps.map(n => `- ${n}`) : ['- 에디터에서 입력 맵(InputMap) 및 아트 리소스 연결 확인']),
    ''
  ].join('\n');

  fileMap.set('PORTING_REPORT.md', reportMd);

  const files = [...fileMap.entries()].map(([path, content]) => ({ path, content }));
  return {
    projectName: safeTitle,
    sourceEngine: analysis.sourceEngine,
    summary,
    parityNotes,
    manualFollowUps,
    detectedMappings: analysis.detectedMappings,
    eulaWarnings: analysis.eulaWarnings || [],
    files
  };
}
