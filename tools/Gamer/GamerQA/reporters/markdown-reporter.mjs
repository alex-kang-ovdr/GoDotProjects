import fs from 'node:fs';
import path from 'node:path';

function suiteStatusLabel(checks, suiteName) {
  const subset = checks.filter((c) => c.suite === suiteName);
  if (!subset.length) return 'n/a';
  if (subset.some((c) => c.status === 'error')) return 'ERROR';
  if (subset.some((c) => c.status === 'fail')) return `FAIL (${subset.filter((c) => c.status === 'fail').length})`;
  if (subset.some((c) => c.status === 'skip')) return `SKIP (${subset.filter((c) => c.status === 'skip').length})`;
  if (subset.some((c) => c.status === 'warn')) return `WARN (${subset.filter((c) => c.status === 'warn').length})`;
  return `PASS (${subset.length})`;
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function renderMarkdownReport(report) {
  const lines = [];
  lines.push(`# GamerQA Verification Report — \`${report.runId}\``);
  lines.push('');
  lines.push(`- **Target**: \`${report.target}\` (${report.targetType})`);
  lines.push(`- **Policy Version**: \`${report.policyVersion}\``);
  lines.push(`- **Overall Status**: **${report.status.toUpperCase()}** (passed=\`${report.passed}\`, score=\`${report.score}/100\`)`);
  lines.push(`- **Generated At**: \`${report.generatedAt}\` (${report.durationMs} ms)`);
  lines.push(
    `- **Runner**: Node \`${report.runner?.nodeVersion || 'unknown'}\` (${report.runner?.platform || ''}/${report.runner?.arch || ''}), Browser Driver: \`${report.runner?.browserDriver || 'none'}\``
  );
  lines.push('');

  const s = report.summary;
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('|---|---:|');
  lines.push(`| Total Games | ${s.totalGames} |`);
  lines.push(`| Passed / Warned Games | ${s.passedGames} passed, ${s.warnedGames} warned |`);
  lines.push(`| Failed / Error / Partial Games | ${s.failedGames} failed, ${s.errorGames} error, ${s.partialGames} partial |`);
  lines.push(`| Checks (Pass / Warn / Fail / Error / Skip) | ${s.pass} / ${s.warn} / ${s.fail} / ${s.error} / ${s.skip} (total ${s.totalChecks}) |`);
  lines.push('');

  lines.push('## Game Results');
  lines.push('');
  lines.push('| Game ID | Version | Integration | Status | Score | Static (T0) | Security (T0) | Runtime Web (T1) | Console Errors | Screenshot |');
  lines.push('|---|---|---|---|---:|---|---|---|---:|---|');

  for (const g of report.games) {
    const consoleCheck = g.checks.find((c) => c.ruleId === 'RT-BROWSER-CONSOLE');
    const consoleCount = consoleCheck?.status === 'skip'
      ? 'skip'
      : consoleCheck?.evidence
        ? (consoleCheck.evidence.pageErrorCount || 0) +
          (consoleCheck.evidence.consoleErrorCount || 0) +
          (consoleCheck.evidence.failedAssetCount || 0)
        : '-';
    const shotCell = g.screenshots?.length
      ? `[${path.posix.basename(g.screenshots[0].relativePath)}](${g.screenshots[0].relativePath})`
      : '-';

    lines.push(
      `| \`${escapeCell(g.gameId)}\` | ${escapeCell(g.version || '-')} | ${escapeCell(g.integration || '-')} | **${g.status.toUpperCase()}** | ${g.score} | ${suiteStatusLabel(g.checks, 'static')} | ${suiteStatusLabel(g.checks, 'security')} | ${suiteStatusLabel(g.checks, 'runtime-web')} | ${consoleCount} | ${shotCell} |`
    );
  }
  lines.push('');

  lines.push('## Detailed Findings & Check Breakdown');
  lines.push('');
  for (const g of report.games) {
    lines.push(`### \`${g.gameId}\`${g.title ? ` — ${g.title}` : ''}`);
    lines.push('');
    lines.push(
      `- **Status**: \`${g.status}\` (passed=\`${g.passed}\`, score=\`${g.score}\`, duration=\`${g.durationMs}ms\`)`
    );
    lines.push(`- **Target SHA-256**: \`${g.targetHash}\``);
    if (g.catalogEnabled !== null && g.catalogEnabled !== undefined) {
      lines.push(`- **Catalog Enabled**: \`${g.catalogEnabled}\``);
    }
    if (g.metrics?.fileCount !== undefined) {
      lines.push(`- **Bundle Metrics**: ${g.metrics.fileCount} files, ${(g.metrics.totalBytes / (1024 * 1024)).toFixed(2)} MiB`);
    }
    lines.push('');
    lines.push('| Rule ID | Suite | Tier | Severity | Status | Message |');
    lines.push('|---|---|---:|---|---|---|');
    for (const c of g.checks) {
      lines.push(`| \`${c.ruleId}\` | ${c.suite} | T${c.tier} | ${c.severity} | **${c.status.toUpperCase()}** | ${escapeCell(c.message)} |`);
    }
    lines.push('');

    const notable = g.checks.filter((c) => c.status !== 'pass' || (c.details && c.details.length > 0));
    if (notable.length) {
      lines.push('**Details:**');
      lines.push('');
      for (const c of notable) {
        lines.push(`- \`${c.ruleId}\` (${c.status}): ${c.message}`);
        for (const d of c.details || []) {
          lines.push(`  - ${d}`);
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function writeMarkdownReport(report, outPath) {
  const markdown = renderMarkdownReport(report);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, markdown, 'utf8');
  return outPath;
}
