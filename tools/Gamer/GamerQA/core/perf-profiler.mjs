import fs from 'node:fs';
import path from 'node:path';
import { readStrictJson } from './fs-utils.mjs';
import { GAMERQA_ROOT } from './paths.mjs';

export function roundNum(value, decimals = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const factor = 10 ** decimals;
  return Math.round(Number(value) * factor) / factor;
}

export function percentile(values, p) {
  const nums = (values || []).filter((v) => Number.isFinite(Number(v))).map(Number).sort((a, b) => a - b);
  if (!nums.length) return null;
  if (nums.length === 1) return nums[0];
  const idx = Math.min(nums.length - 1, Math.max(0, Math.ceil((p / 100) * nums.length) - 1));
  return nums[idx];
}

export function average(values) {
  const nums = (values || []).filter((v) => Number.isFinite(Number(v))).map(Number);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function loadDailyPerfBudgets(explicitPath = null) {
  const filePath = explicitPath
    ? path.resolve(explicitPath)
    : path.join(GAMERQA_ROOT, 'ops', 'daily-perf-budgets.json');
  if (fs.existsSync(filePath)) {
    return readStrictJson(filePath);
  }
  return {
    schemaVersion: 1,
    maxPopularGames: 20,
    budgets: {
      standard: {
        totalBootMs: { warn: 6000, fail: 15000 },
        ttfbMs: { warn: 300, fail: 1000 },
        jsHeapUsedMb: { warn: 256, fail: 512 },
        heapGrowthMb: { warn: 64, fail: 150 },
        inputResponseMs: { warn: 100, fail: 300 },
        frameTimeP95Ms: { warn: 50, fail: 120 },
        minAvgFps: { warn: 24, fail: 10 },
      },
      wasmOrWebgl: {
        totalBootMs: { warn: 12000, fail: 25000 },
        ttfbMs: { warn: 400, fail: 1200 },
        jsHeapUsedMb: { warn: 384, fail: 768 },
        heapGrowthMb: { warn: 96, fail: 220 },
        inputResponseMs: { warn: 140, fail: 400 },
        frameTimeP95Ms: { warn: 80, fail: 180 },
        minAvgFps: { warn: 15, fail: 6 },
      },
    },
    regressionThresholds: {
      baselineWindowDays: 7,
      minBaselineRuns: 1,
      bootIncreasePct: 25,
      bootIncreaseMinMs: 500,
      heapIncreasePct: 20,
      heapIncreaseMinMb: 20,
      responseIncreasePct: 30,
      responseIncreaseMinMs: 25,
      fpsDropPct: 20,
      fpsDropMin: 5,
    },
  };
}

/**
 * Self-contained browser evaluation script (returns a Promise resolving to a JSON-serializable object).
 * Measures navigation/resource loading timings, JS heap memory (when exposed), interactive E2E input latency,
 * requestAnimationFrame FPS / P50 / P95 / long-frame jank, and visual/DOM responsiveness.
 */
export function buildBrowserPerfProbeExpression(sampleDurationMs = 900) {
  const duration = Math.max(250, Math.min(3000, Math.floor(Number(sampleDurationMs) || 900)));
  return `(async () => {
    const safeRound = (v, d = 1) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * (10 ** d)) / (10 ** d) : null);
    const nav = performance.getEntriesByType('navigation')?.[0] || null;
    const paints = performance.getEntriesByType('paint') || [];
    const resources = performance.getEntriesByType('resource') || [];
    const fp = paints.find(e => e.name === 'first-paint');
    const fcp = paints.find(e => e.name === 'first-contentful-paint');
    const transferBytes = resources.reduce((sum, r) => sum + (Number(r.transferSize) || Number(r.encodedBodySize) || 0), 0);

    const readMem = () => {
      const m = performance && performance.memory;
      if (!m) return null;
      return {
        usedBytes: Number(m.usedJSHeapSize) || 0,
        totalBytes: Number(m.totalJSHeapSize) || 0,
        limitBytes: Number(m.jsHeapSizeLimit) || 0,
      };
    };

    const fingerprintState = () => {
      try {
        const c = document.querySelector('canvas');
        if (c && c.width > 0 && c.height > 0) {
          try {
            const ctx = c.getContext('2d');
            if (ctx) {
              const w = Math.min(32, c.width);
              const h = Math.min(32, c.height);
              const data = ctx.getImageData(Math.max(0, Math.floor((c.width - w) / 2)), Math.max(0, Math.floor((c.height - h) / 2)), w, h).data;
              let acc = 0;
              for (let i = 0; i < data.length; i += 4) acc = (acc * 31 + data[i] + data[i + 1] + data[i + 2]) >>> 0;
              return 'c2d:' + acc + ':' + (document.body?.innerText || '').length;
            }
          } catch {}
        }
        return 'dom:' + (document.body?.innerText || '').slice(0, 200) + ':' + (document.body?.querySelectorAll('*').length || 0);
      } catch {
        return 'err';
      }
    };

    const memBefore = readMem();
    const stateBefore = fingerprintState();

    // Interactive input response probe: dispatch click + keydown and measure time to next animation frame
    const targetEl = document.querySelector('canvas') || document.querySelector('button') || document.body || document.documentElement;
    const rect = targetEl?.getBoundingClientRect ? targetEl.getBoundingClientRect() : { left: 0, top: 0, width: 640, height: 400 };
    const cx = Math.round(rect.left + Math.max(10, rect.width / 2));
    const cy = Math.round(rect.top + Math.max(10, rect.height / 2));

    const tInputStart = performance.now();
    try {
      if (targetEl && typeof targetEl.dispatchEvent === 'function') {
        targetEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: cx, clientY: cy }));
        targetEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: cx, clientY: cy }));
        targetEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: cx, clientY: cy }));
        targetEl.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: cx, clientY: cy }));
      }
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
    } catch {}

    const inputResponseMs = await new Promise(resolve => {
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; resolve(performance.now() - tInputStart); } }, 500);
      requestAnimationFrame(() => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(performance.now() - tInputStart);
        }
      });
    });

    try {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }));
    } catch {}

    // Sample requestAnimationFrame deltas to measure FPS, P50/P95 frame time, and long-frame stalls (>50ms)
    const frameDeltas = await new Promise(resolve => {
      const deltas = [];
      const start = performance.now();
      let last = start;
      let stopped = false;
      const safety = setTimeout(() => { stopped = true; resolve(deltas); }, ${duration} + 400);
      function tick(ts) {
        if (stopped) return;
        const dt = ts - last;
        if (deltas.length > 0 || dt > 0) deltas.push(dt);
        last = ts;
        if (ts - start >= ${duration}) {
          stopped = true;
          clearTimeout(safety);
          resolve(deltas);
          return;
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });

    const memAfter = readMem();
    const stateAfter = fingerprintState();
    const validDeltas = frameDeltas.filter(d => Number.isFinite(d) && d > 0);
    const totalSampleMs = validDeltas.reduce((a, b) => a + b, 0);
    const sortedDeltas = validDeltas.slice().sort((a, b) => a - b);
    const pct = p => sortedDeltas.length ? sortedDeltas[Math.min(sortedDeltas.length - 1, Math.max(0, Math.ceil((p / 100) * sortedDeltas.length) - 1))] : null;
    const longTasks = validDeltas.filter(d => d > 50);

    return {
      loading: {
        ttfbMs: nav ? safeRound(Math.max(0, nav.responseStart - nav.requestStart)) : null,
        domContentLoadedMs: nav ? safeRound(Math.max(0, nav.domContentLoadedEventEnd - nav.startTime)) : null,
        loadEventMs: nav ? safeRound(Math.max(0, nav.loadEventEnd - nav.startTime)) : null,
        firstPaintMs: fp ? safeRound(fp.startTime) : null,
        firstContentfulPaintMs: fcp ? safeRound(fcp.startTime) : null,
        resourceCount: resources.length,
        transferBytes,
      },
      memory: {
        jsHeapBeforeBytes: memBefore ? memBefore.usedBytes : null,
        jsHeapAfterBytes: memAfter ? memAfter.usedBytes : null,
        jsHeapTotalBytes: memAfter ? memAfter.totalBytes : null,
        jsHeapLimitBytes: memAfter ? memAfter.limitBytes : null,
      },
      responsiveness: {
        inputResponseMs: safeRound(inputResponseMs),
        frameCount: validDeltas.length,
        sampleDurationMs: safeRound(totalSampleMs),
        avgFps: totalSampleMs > 0 ? safeRound((validDeltas.length * 1000) / totalSampleMs) : null,
        frameTimeP50Ms: safeRound(pct(50)),
        frameTimeP95Ms: safeRound(pct(95)),
        frameTimeMaxMs: safeRound(sortedDeltas.length ? sortedDeltas[sortedDeltas.length - 1] : null),
        longTaskCount: longTasks.length,
        maxLongTaskMs: safeRound(longTasks.length ? Math.max(...longTasks) : 0),
        frameChanged: stateBefore !== stateAfter,
      },
      dom: {
        nodeCount: document.body ? document.body.querySelectorAll('*').length : 0,
      },
    };
  })()`;
}

export function normalizeCdpMetrics(cdpMetricsList = []) {
  const map = new Map();
  for (const item of cdpMetricsList || []) {
    if (item && typeof item.name === 'string' && Number.isFinite(Number(item.value))) {
      map.set(item.name, Number(item.value));
    }
  }
  return {
    jsHeapUsedBytes: map.has('JSHeapUsedSize') ? map.get('JSHeapUsedSize') : null,
    jsHeapTotalBytes: map.has('JSHeapTotalSize') ? map.get('JSHeapTotalSize') : null,
    domNodes: map.has('Nodes') ? map.get('Nodes') : null,
    jsEventListeners: map.has('JSEventListeners') ? map.get('JSEventListeners') : null,
    documents: map.has('Documents') ? map.get('Documents') : null,
    frames: map.has('Frames') ? map.get('Frames') : null,
    layoutCount: map.has('LayoutCount') ? map.get('LayoutCount') : null,
    recalcStyleCount: map.has('RecalcStyleCount') ? map.get('RecalcStyleCount') : null,
  };
}

export function assemblePerformanceProfile({
  totalBootMs = null,
  godotBootMs = null,
  probe = null,
  cdpBefore = null,
  cdpAfter = null,
} = {}) {
  const loading = probe?.loading || {};
  const memProbe = probe?.memory || {};
  const resp = probe?.responsiveness || {};

  const beforeBytes = cdpBefore?.jsHeapUsedBytes ?? memProbe.jsHeapBeforeBytes ?? null;
  const afterBytes = cdpAfter?.jsHeapUsedBytes ?? memProbe.jsHeapAfterBytes ?? beforeBytes;
  const totalBytes = cdpAfter?.jsHeapTotalBytes ?? cdpBefore?.jsHeapTotalBytes ?? memProbe.jsHeapTotalBytes ?? null;
  const peakBytes =
    beforeBytes !== null && afterBytes !== null
      ? Math.max(beforeBytes, afterBytes)
      : afterBytes ?? beforeBytes;
  const growthBytes =
    beforeBytes !== null && afterBytes !== null ? afterBytes - beforeBytes : null;

  const toMb = (b) => (b !== null && Number.isFinite(Number(b)) ? roundNum(Number(b) / (1024 * 1024), 2) : null);

  return {
    loading: {
      totalBootMs: roundNum(totalBootMs, 1),
      godotBootMs: roundNum(godotBootMs, 1),
      ttfbMs: roundNum(loading.ttfbMs, 1),
      domContentLoadedMs: roundNum(loading.domContentLoadedMs, 1),
      loadEventMs: roundNum(loading.loadEventMs, 1),
      firstPaintMs: roundNum(loading.firstPaintMs, 1),
      firstContentfulPaintMs: roundNum(loading.firstContentfulPaintMs, 1),
      resourceCount: Number.isFinite(Number(loading.resourceCount)) ? Number(loading.resourceCount) : null,
      transferBytes: Number.isFinite(Number(loading.transferBytes)) ? Number(loading.transferBytes) : null,
    },
    memory: {
      jsHeapUsedMb: toMb(afterBytes),
      jsHeapPeakMb: toMb(peakBytes),
      jsHeapTotalMb: toMb(totalBytes),
      heapGrowthMb: toMb(growthBytes),
      domNodes: cdpAfter?.domNodes ?? probe?.dom?.nodeCount ?? null,
      jsEventListeners: cdpAfter?.jsEventListeners ?? null,
    },
    responsiveness: {
      inputResponseMs: roundNum(resp.inputResponseMs, 1),
      avgFps: roundNum(resp.avgFps, 1),
      frameCount: Number.isFinite(Number(resp.frameCount)) ? Number(resp.frameCount) : null,
      frameTimeP50Ms: roundNum(resp.frameTimeP50Ms, 1),
      frameTimeP95Ms: roundNum(resp.frameTimeP95Ms, 1),
      frameTimeMaxMs: roundNum(resp.frameTimeMaxMs, 1),
      longTaskCount: Number.isFinite(Number(resp.longTaskCount)) ? Number(resp.longTaskCount) : null,
      maxLongTaskMs: roundNum(resp.maxLongTaskMs, 1),
      frameChanged: typeof resp.frameChanged === 'boolean' ? resp.frameChanged : null,
    },
  };
}

export function evaluatePerfBudgets(perf, manifest = null, budgetsConfig = null) {
  const cfg = budgetsConfig || loadDailyPerfBudgets();
  const isHeavy = Boolean(manifest?.capabilities?.wasm || manifest?.capabilities?.webgl);
  const profileKey = isHeavy ? 'wasmOrWebgl' : 'standard';
  const limits = cfg.budgets?.[profileKey] || cfg.budgets?.standard;
  const issues = [];

  if (!perf || typeof perf !== 'object') {
    return { profile: profileKey, grade: 'unknown', issues: [] };
  }

  const checkUpper = (metric, val, rule, unit) => {
    if (val === null || val === undefined || !Number.isFinite(Number(val)) || !rule) return;
    const num = Number(val);
    if (rule.fail !== undefined && num > rule.fail) {
      issues.push({ level: 'fail', metric, value: num, threshold: rule.fail, unit, message: `${metric}=${num}${unit} > fail(${rule.fail}${unit})` });
    } else if (rule.warn !== undefined && num > rule.warn) {
      issues.push({ level: 'warn', metric, value: num, threshold: rule.warn, unit, message: `${metric}=${num}${unit} > warn(${rule.warn}${unit})` });
    }
  };

  const checkLower = (metric, val, rule, unit) => {
    if (val === null || val === undefined || !Number.isFinite(Number(val)) || !rule) return;
    const num = Number(val);
    if (rule.fail !== undefined && num < rule.fail) {
      issues.push({ level: 'fail', metric, value: num, threshold: rule.fail, unit, message: `${metric}=${num}${unit} < fail(${rule.fail}${unit})` });
    } else if (rule.warn !== undefined && num < rule.warn) {
      issues.push({ level: 'warn', metric, value: num, threshold: rule.warn, unit, message: `${metric}=${num}${unit} < warn(${rule.warn}${unit})` });
    }
  };

  checkUpper('totalBootMs', perf.loading?.totalBootMs, limits?.totalBootMs, 'ms');
  checkUpper('ttfbMs', perf.loading?.ttfbMs, limits?.ttfbMs, 'ms');
  checkUpper('jsHeapUsedMb', perf.memory?.jsHeapUsedMb, limits?.jsHeapUsedMb, 'MB');
  checkUpper('heapGrowthMb', perf.memory?.heapGrowthMb, limits?.heapGrowthMb, 'MB');
  checkUpper('inputResponseMs', perf.responsiveness?.inputResponseMs, limits?.inputResponseMs, 'ms');
  checkUpper('frameTimeP95Ms', perf.responsiveness?.frameTimeP95Ms, limits?.frameTimeP95Ms, 'ms');
  checkLower('avgFps', perf.responsiveness?.avgFps, limits?.minAvgFps, 'fps');

  const grade = issues.some((i) => i.level === 'fail')
    ? 'fail'
    : issues.some((i) => i.level === 'warn')
      ? 'warn'
      : 'pass';

  return { profile: profileKey, grade, issues };
}
