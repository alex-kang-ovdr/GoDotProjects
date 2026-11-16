import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script } from 'node:vm';
import assert from 'node:assert/strict';

// A tiny bundler for these known ES modules. No external packages required.
const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const strip = text => text.replace(/^import[^\n]*\n/gm, '').replace(/^export (?=const |class |function )/gm, '');
const engine = `const Engine = (() => {\n${strip(read('dist/js/engine.js'))}\nreturn { Game, CARDS, DEFAULT_DECK };\n})();`;
const ai = `const AI = (({ CARDS }) => {\n${strip(read('dist/js/ai.js'))}\nreturn { BattleAI };\n})(Engine);`;
const renderer = `const Renderer = (() => {\n${strip(read('dist/js/renderer.js'))}\nreturn { ArenaRenderer, cardIcon };\n})();`;
const decks = `const Decks = (() => {\n${strip(read('dist/js/decks.js'))}\nreturn { DECK_PRESETS, OPPONENTS };\n})();`;
const session = `const Session = (({ Game, CARDS }) => {\n${strip(read('dist/js/session.js'))}\nreturn { ReplayPlayer, FIXED_STEP, summarizeBattle, serializeReplayFile, parseReplayFile };\n})(Engine);`;
const training = `const Training = (({ Game, CARDS }) => {\n${strip(read('dist/js/training.js'))}\nreturn { TrainingRun, TRAINING_MISSIONS };\n})(Engine);`;
const campaign = `const Campaign = (({ Game, CARDS }, { OPPONENTS }) => {\n${strip(read('dist/js/campaign.js'))}\nreturn { CampaignProgress, CAMPAIGN_STAGES };\n})(Engine, Decks);`;
const history = `const History = (({ Game }, { ReplayPlayer }) => {\n${strip(read('dist/js/history.js'))}\nreturn { BattleHistory, HISTORY_LIMIT };\n})(Engine, Session);`;
const app = `{\nconst { Game, CARDS, DEFAULT_DECK } = Engine;\nconst { BattleAI } = AI;\nconst { ArenaRenderer, cardIcon } = Renderer;\nconst { DECK_PRESETS, OPPONENTS } = Decks;\nconst { ReplayPlayer, FIXED_STEP, summarizeBattle, serializeReplayFile, parseReplayFile } = Session;\nconst { TrainingRun, TRAINING_MISSIONS } = Training;\nconst { CAMPAIGN_STAGES, CampaignProgress } = Campaign;\nconst { BattleHistory } = History;\n${strip(read('dist/js/app.js'))}\n}`;
const modules = `${engine}\n${ai}\n${renderer}\n${decks}\n${session}\n${training}\n${campaign}\n${history}`;
const js = `'use strict';\n(() => {\n${modules}\n${app}\n})();`;
new Script(js, { filename: 'crownfall-offline.js' });
// Execute only pure module composition, not the DOM app, to catch a missing
// dependency binding in this buildless offline artifact.
const moduleCheck = new Script(`(() => { ${modules}\nconst campaign = new Campaign.CampaignProgress();
const {config,context} = campaign.beginAttempt('stage-1', Engine.DEFAULT_DECK);
const game = new Engine.Game(config);
return [Object.keys(Engine.CARDS).length, campaign.bindGame(game,context),
new History.BattleHistory().list().length, new Training.TrainingRun('defend').game.state.tick]; })()`)
  .runInNewContext({}, { timeout: 2000 });
assert.deepEqual(Array.from(moduleCheck), [18, true, 0, 0]);
const icon = `data:image/svg+xml,${encodeURIComponent(read('dist/icon.svg'))}`;
let html = read('dist/index.html')
  .replace('<link rel="stylesheet" href="styles.css">', `<style>\n${read('dist/styles.css')}\n</style>`)
  .replace('href="icon.svg"', `href="${icon}"`)
  .replace('<script type="module" src="js/app.js"></script>', `<script>\n${js.replaceAll('</script', '<\\/script')}\n</script>`)
  .replace(/<a href="crownfall-offline\.html"[^>]*>[\s\S]*?<\/a>/, '<span>오프라인 버전 · 설치 없이 실행</span>')
  .replace(/<a href="source\.zip"[^>]*>[\s\S]*?<\/a>/, '');
writeFileSync(resolve(root, 'dist/crownfall-offline.html'), html);
console.log(`Offline HTML built: ${Buffer.byteLength(html).toLocaleString()} bytes. All game assets are embedded.`);
