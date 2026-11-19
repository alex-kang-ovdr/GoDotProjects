// Reuse the existing QA against its full-catalog route; keep the worktree unchanged.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const experiment = path.dirname(fileURLToPath(import.meta.url));
const target = JSON.parse(fs.readFileSync(path.join(experiment, 'playhub-target.json'), 'utf8'));
const hub = path.join(target.projectRoot, 'hub');
const results = path.join(experiment, 'TestResults');
fs.mkdirSync(results, { recursive: true });
let source = fs.readFileSync(path.join(hub, 'qa/webgames-browser.mjs'), 'utf8');
const replacements = [
  ["const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');", `const root=${JSON.stringify(hub)};`],
  ["const reportDir=path.join(root,'reports');", `const reportDir=${JSON.stringify(results)};`],
  ["url:userUrl+'/?lang=ko'", "url:userUrl+'/?view=browse&lang=ko'"],
  ["await waitFor(\"document.querySelector('#login-form')\");", "await waitFor(\"document.querySelector('#login-form') && !document.querySelector('#login-panel').hidden\");"],
];
for (const [before, after] of replacements) {
  if (source.split(before).length !== 2) throw new Error('Upstream QA changed; review the adapter before running: ' + before);
  source = source.replace(before, after);
}
process.env.PLAYHUB_TEST_GAME = target.smokeGame;
const generated = path.join(results, 'playhub-browser.generated.mjs');
fs.writeFileSync(generated, source);
await import(pathToFileURL(generated));
