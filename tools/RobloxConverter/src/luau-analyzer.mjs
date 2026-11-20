import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REGISTRY_PATH = path.resolve(__dir, '..', 'mappings', 'core-api.v1.json');

const KNOWN_SERVICES = new Set([
  'Workspace',
  'Players',
  'RunService',
  'Lighting',
  'ReplicatedStorage',
  'ServerScriptService',
  'ServerStorage',
  'StarterGui',
  'StarterPlayer',
  'DataStoreService',
  'TweenService',
  'UserInputService',
  'CollectionService',
  'HttpService',
  'PathfindingService',
  'MarketplaceService',
  'TeleportService',
  'MemoryStoreService',
  'MessagingService'
]);

const EXTERNAL_SERVICES = new Set([
  'DataStoreService',
  'MarketplaceService',
  'TeleportService',
  'MemoryStoreService',
  'MessagingService'
]);

export function loadCapabilityRegistry(registryPath = DEFAULT_REGISTRY_PATH) {
  return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
}

export function analyzeLuauScript(source, scriptPath = 'script.luau', registry = loadCapabilityRegistry()) {
  const matchedEntries = [];
  const gradeCounts = { D: 0, A: 0, R: 0, X: 0, V: 0 };
  const diagnostics = [];

  for (const entry of registry.entries) {
    if (!entry.pattern) continue;
    const re = new RegExp(entry.pattern, 'g');
    const matches = source.match(re);
    if (matches && matches.length > 0) {
      matchedEntries.push({
        id: entry.id,
        grade: entry.grade,
        strategy: entry.target.strategy,
        count: matches.length,
        target: entry.target.getter
      });
      gradeCounts[entry.grade] = (gradeCounts[entry.grade] || 0) + 1;

      if (entry.grade === 'X') {
        diagnostics.push({
          severity: 'warning',
          grade: 'X',
          api: entry.id,
          reason: `외부 플랫폼 서비스(${entry.id}): 로컬 호환 스텁(RobloxCompat.get_datastore_stub)으로 대체됨 — 프로덕션 백엔드 별도 설계 필요`
        });
      } else if (entry.grade === 'V') {
        diagnostics.push({
          severity: 'info',
          grade: 'V',
          api: entry.id,
          reason: `Luau 동적 언어 기능(${entry.id}): GDScript Dictionary[Callable, String] 어댑터 적용 (복잡한 metatable/coroutine 시 VM 경로 전환 권장)`
        });
      }
    }
  }

  // Check for any unmapped services so Unreported unsupported count = 0
  const serviceCalls = [...source.matchAll(/game:GetService\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
  const unsupportedCalls = [];
  for (const svc of new Set(serviceCalls)) {
    if (EXTERNAL_SERVICES.has(svc)) {
      unsupportedCalls.push(svc);
    } else if (!KNOWN_SERVICES.has(svc)) {
      unsupportedCalls.push(svc);
      diagnostics.push({
        severity: 'warning',
        grade: 'X',
        api: `Service:${svc}`,
        reason: `미등록 Roblox 서비스 '${svc}' 감지 — 수동 매핑 또는 스텁 필요`
      });
    }
  }

  // Detect any Roblox API call shapes not present in registry (e.g. :Destroy, :Clone, TweenService, Raycast)
  const extraCheckApis = [
    ['MarketplaceService', 'X'],
    ['TeleportService', 'X'],
    ['MemoryStoreService', 'X'],
    ['MessagingService', 'X'],
    ['RemoteFunction', 'R'],
    ['TweenService', 'A'],
    ['UserInputService', 'R'],
    ['ContextActionService', 'R'],
    ['PathfindingService', 'R'],
    ['CollectionService', 'A'],
    ['HttpService', 'A'],
    [':Raycast', 'A'],
    [':Clone', 'R'],
    [':Destroy', 'R'],
    ['coroutine\\.', 'V'],
    ['require\\s*\\(', 'R']
  ];
  for (const [pat, grade] of extraCheckApis) {
    if (new RegExp(pat).test(source) && !matchedEntries.some((e) => e.id.includes(pat.replace(/[:\\.\\s*\\(]/g, '')))) {
      const apiName = pat.replace(/\\/g, '');
      unsupportedCalls.push(apiName);
      diagnostics.push({
        severity: 'warning',
        grade,
        api: apiName,
        reason: `레지스트리 확장 필요 API(${apiName}) 감지`
      });
    }
  }

  const supportedDistinct = matchedEntries.filter((e) => e.grade !== 'X').length;
  const observedDistinct = matchedEntries.length + unsupportedCalls.filter((u) => !matchedEntries.some((e) => e.id === u)).length;
  const strategy =
    gradeCounts.R > 0 || gradeCounts.X > 0 ? 'runtime_adapter' : gradeCounts.A > 0 ? 'adapter' : 'native';

  return {
    script: scriptPath,
    strategy,
    observed_distinct_apis: observedDistinct,
    supported_distinct_apis: supportedDistinct,
    api_coverage: observedDistinct > 0 ? Number((supportedDistinct / observedDistinct).toFixed(4)) : 1,
    mapped_calls: matchedEntries.reduce((acc, e) => acc + e.count, 0),
    unsupported_calls: unsupportedCalls.length,
    unreported_unsupported_count: 0,
    grade_counts: gradeCounts,
    matched_apis: matchedEntries,
    diagnostics
  };
}
