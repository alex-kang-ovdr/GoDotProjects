import fs from 'node:fs';
import path from 'node:path';
import { FINDING_TYPES } from '../adapters/hub/usecase-catalog.mjs';

function esc(value) {
  return String(value ?? '—').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function renderUseCaseMarkdownReport(report) {
  const s = report.summary || {};
  const sc = report.scores || {};
  const fc = s.findingCounts || {};
  const lines = [];

  lines.push(`# PlayHub 사용자 Use Case 복합 검증 리포트 (${report.runId})`);
  lines.push('');
  lines.push(`- **생성 시각 (KST)**: \`${report.generatedAtKst}\` (총 소요: \`${(report.durationMs / 1000).toFixed(1)}s\`)`);
  lines.push(`- **검증 환경**: Node \`${report.nodeVersion}\` · Chrome CDP (\`${report.browserExecutable || 'auto'}\`)`);
  lines.push(`- **시나리오 결과**: 총 **${s.totalScenarios}개** (통과 **${s.passedScenarios}** / 주의 **${s.warnedScenarios}** / 실패 **${s.failedScenarios}**)`);
  lines.push('');

  lines.push('## 1. 4축 복합 품질 스코어카드');
  lines.push('');
  lines.push('| 검증 축 | 점수 (100점 만점) | 비고 |');
  lines.push('|---|---:|---|');
  lines.push(`| **기능 (Functional)** | **${sc.기능 ?? 0}** | 미동작 ${fc[FINDING_TYPES.BROKEN] || 0}건 · 미구현 ${fc[FINDING_TYPES.UNIMPLEMENTED] || 0}건 |`);
  lines.push(`| **성능 (Performance)** | **${sc.성능 ?? 0}** | 느린반응 ${fc[FINDING_TYPES.SLOW] || 0}건 |`);
  lines.push(`| **안정성 (Stability & Security)** | **${sc.안정성 ?? 0}** | 예외/보안 이슈 ${fc[FINDING_TYPES.STABILITY] || 0}건 |`);
  lines.push(`| **편의성 (Usability & Mobile & L10N)** | **${sc.편의성 ?? 0}** | UX/반응형/번역 이슈 ${fc[FINDING_TYPES.USABILITY] || 0}건 |`);
  lines.push(`| **종합 점수** | **${sc.overall ?? 0}** | 총 발견 이슈 **${s.totalFindings || 0}건** |`);
  lines.push('');

  lines.push('## 2. 발견된 이슈 분류 (미구현 · 미동작 · 느린반응 · 안정성 · 편의성)');
  lines.push('');
  if (!report.findings?.length) {
    lines.push('- 발견된 결함·미구현·지연·편의성 이슈가 없습니다.');
  } else {
    lines.push('| 유형 | 심각도 | Use Case | 이슈 제목 | 실측 근거 | 개선 권고 |');
    lines.push('|---|---|---|---|---|---|');
    for (const f of report.findings) {
      lines.push(
        `| **${esc(f.type)}** | \`${esc(f.severity)}\` | \`${esc(f.useCaseId)}\` | ${esc(f.title)} | ${esc(f.evidence)} | ${esc(f.remediation)} |`
      );
    }
  }
  lines.push('');

  lines.push('## 3. 사용자 Use Case 시나리오별 검증 결과 (UC-01 ~ UC-12)');
  lines.push('');
  lines.push('| ID | 페르소나 | 시나리오 | 검증 축 | 결과 | 소요(ms) | 이슈 수 |');
  lines.push('|---|---|---|---|---|---:|---:|');
  for (const scItem of report.scenarios || []) {
    lines.push(
      `| \`${scItem.id}\` | ${esc(scItem.persona)} | ${esc(scItem.title)} | ${esc((scItem.dimensions || []).join('·'))} | **${String(scItem.status).toUpperCase()}** | ${scItem.durationMs} | ${scItem.findings?.length || 0} |`
    );
  }
  lines.push('');

  if (report.apiProfile?.length) {
    lines.push('## 4. Hub 핵심 API 응답시간 프로파일 (각 10회 반복 실측)');
    lines.push('');
    lines.push('| 엔드포인트 | 상태코드 | 오류 | P50 (ms) | P95 (ms) | Max (ms) |');
    lines.push('|---|---:|---:|---:|---:|---:|');
    for (const ep of report.apiProfile) {
      lines.push(`| \`${esc(ep.name)}\` | ${ep.status} | ${ep.errors} | ${ep.p50Ms} | ${ep.p95Ms} | ${ep.maxMs} |`);
    }
    lines.push('');
  }

  lines.push('## 5. 시나리오별 상세 계측 데이터');
  lines.push('');
  for (const scItem of report.scenarios || []) {
    lines.push(`### ${scItem.id} — ${scItem.title} (\`${scItem.status}\`, ${scItem.durationMs}ms)`);
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(scItem.metrics || {}, null, 2));
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

export function writeUseCaseReportArtifacts({ outDir, report }) {
  fs.mkdirSync(outDir, { recursive: true });
  const md = renderUseCaseMarkdownReport(report);
  const reportMdPath = path.join(outDir, 'HUB_USECASE_REPORT.md');
  const reportJsonPath = path.join(outDir, 'hub-usecases.json');
  fs.writeFileSync(reportMdPath, md, 'utf8');
  fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  return { reportMdPath, reportJsonPath, markdown: md };
}
