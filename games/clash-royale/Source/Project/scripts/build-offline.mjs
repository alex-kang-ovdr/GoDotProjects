import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script } from 'node:vm';
import assert from 'node:assert/strict';

// A tiny bundler for these known ES modules. No external packages required.
const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const strip = text => text.replace(/^import[^\n]*\n/gm, '').replace(/^export (?=const |class |function )/gm, '');
const reconstruction = `const Reconstruction = (() => {\n${strip(read('dist/js/reconstruction.js'))}\nreturn { DATA_PROFILES, DEFAULT_DATA_PROFILE, RECONSTRUCTED_OVERRIDES, getCardEvidence };\n})();`;
const evidenceUI = `const EvidenceUI = (({ getCardEvidence }) => {\n${strip(read('dist/js/evidence-ui.js'))}\nreturn { evidenceMarkup };\n})(Reconstruction);`;
const balance = `const Balance = (() => {\n${strip(read('dist/js/balance.js'))}\nreturn { getBalanceFieldsForCard, validateBalancePatch, resolveCardBalance, createDeveloperData, validateCheatPatch, validateDeveloperData, validateFrozenCard };\n})();`;
const engine = `const Engine = (({ getBalanceFieldsForCard, validateBalancePatch, resolveCardBalance, createDeveloperData, validateCheatPatch, validateDeveloperData, validateFrozenCard }, { DATA_PROFILES, DEFAULT_DATA_PROFILE, RECONSTRUCTED_OVERRIDES }) => {\n${strip(read('dist/js/engine.js'))}\nreturn { Game, CARDS, DEFAULT_DECK, selectSpellTargets };\n})(Balance, Reconstruction);`;
const ai = `const AI = (({ CARDS, selectSpellTargets }) => {\n${strip(read('dist/js/ai.js'))}\nreturn { BattleAI };\n})(Engine);`;
const renderer = `const Renderer = (() => {\n${strip(read('dist/js/renderer.js'))}\nreturn { ArenaRenderer, cardIcon };\n})();`;
const renderer3d = `const Renderer3D = (() => {\n${strip(read('dist/js/renderer3d.js'))}\nreturn { ArenaRenderer3D };\n})();`;
const view = `const View = (({ ArenaRenderer }, { ArenaRenderer3D }) => {\n${strip(read('dist/js/view.js'))}\nreturn { ArenaView };\n})(Renderer, Renderer3D);`;
const devtools = `const DevTools = (({ RECONSTRUCTED_OVERRIDES }, { evidenceMarkup }) => {\n${strip(read('dist/js/devtools.js'))}\nreturn { DeveloperPanel };\n})(Reconstruction, EvidenceUI);`;
const decks = `const Decks = (() => {\n${strip(read('dist/js/decks.js'))}\nreturn { DECK_PRESETS, OPPONENTS };\n})();`;
const session = `const Session = (({ Game, CARDS }) => {\n${strip(read('dist/js/session.js'))}\nreturn { ReplayPlayer, FIXED_STEP, summarizeBattle, serializeReplayFile, parseReplayFile };\n})(Engine);`;
const training = `const Training = (({ Game, CARDS }) => {\n${strip(read('dist/js/training.js'))}\nreturn { TrainingRun, TRAINING_MISSIONS };\n})(Engine);`;
const campaign = `const Campaign = (({ Game, CARDS }, { OPPONENTS }, { DATA_PROFILES, DEFAULT_DATA_PROFILE }) => {\n${strip(read('dist/js/campaign.js'))}\nreturn { CampaignProgress, CAMPAIGN_STAGES };\n})(Engine, Decks, Reconstruction);`;
const history = `const History = (({ Game }, { ReplayPlayer }) => {\n${strip(read('dist/js/history.js'))}\nreturn { BattleHistory, HISTORY_LIMIT };\n})(Engine, Session);`;
const debug = `const Debug = (({ Game, CARDS }) => {\n${strip(read('dist/js/debug.js'))}\nreturn { applyCheat, inspectTarget };\n})(Engine);`;
const app = `{\nconst { Game, CARDS, DEFAULT_DECK } = Engine;\nconst { BattleAI } = AI;\nconst { cardIcon } = Renderer;\nconst { ArenaView } = View;\nconst { DeveloperPanel } = DevTools;\nconst { DECK_PRESETS, OPPONENTS } = Decks;\nconst { ReplayPlayer, FIXED_STEP, summarizeBattle, serializeReplayFile, parseReplayFile } = Session;\nconst { TrainingRun, TRAINING_MISSIONS } = Training;\nconst { CAMPAIGN_STAGES, CampaignProgress } = Campaign;\nconst { BattleHistory } = History;\nconst { applyCheat, inspectTarget } = Debug;\nconst { DATA_PROFILES, DEFAULT_DATA_PROFILE } = Reconstruction;\nconst { evidenceMarkup } = EvidenceUI;\n${strip(read('dist/js/app.js'))}\n}`;
const modules = `${reconstruction}\n${evidenceUI}\n${balance}\n${engine}\n${ai}\n${renderer}\n${renderer3d}\n${view}\n${devtools}\n${decks}\n${session}\n${training}\n${campaign}\n${history}\n${debug}`;
const js = `'use strict';\n(() => {\n${modules}\n${app}\n})();`;
new Script(js, { filename: 'crownfall-offline.js' });
// Execute only pure module composition, not the DOM app, to catch a missing
// dependency binding in this buildless offline artifact.
const moduleCheck = new Script(`(() => { ${modules}\nconst campaign = new Campaign.CampaignProgress();
const {config,context} = campaign.beginAttempt('stage-1', Engine.DEFAULT_DECK);
const game = new Engine.Game(config);
const practice = new Engine.Game({ practice: true });
const developer = new Engine.Game({ practice: true, developerMode: true });
const tuned = developer.setCardBalance('knight', {damage:222}, {team:'enemy',applyExisting:true});
return [Object.keys(Engine.CARDS).length, campaign.bindGame(game,context),
new History.BattleHistory().list().length, new Training.TrainingRun('defend').game.state.tick,
Debug.applyCheat(practice,{type:'fill-elixir',team:'player'}).ok,practice.state.elixir.player,
tuned.ok,developer.getCard('knight','enemy').damage,game.rulesVersion]; })()`)
  .runInNewContext({}, { timeout: 2000 });
assert.deepEqual(Array.from(moduleCheck), [21, true, 0, 0, true, 10, true, 222, 5]);
const icon = `data:image/svg+xml,${encodeURIComponent(read('dist/icon.svg'))}`;
let html = read('dist/index.html')
  .replace('<link rel="stylesheet" href="styles.css">', `<style>\n${read('dist/styles.css')}\n</style>`)
  .replace('<link rel="stylesheet" href="workspace.css">', `<style>\n${read('dist/workspace.css')}\n</style>`)
  .replace('href="icon.svg"', `href="${icon}"`)
  .replace('<script type="module" src="js/app.js"></script>', `<script>\n${js.replaceAll('</script', '<\\/script')}\n</script>`)
  .replace(/<a href="crownfall-offline\.html"[^>]*>[\s\S]*?<\/a>/, '<span>오프라인 버전 · 설치 없이 실행</span>')
  .replace(/<a href="source\.zip"[^>]*>[\s\S]*?<\/a>/, '');
writeFileSync(resolve(root, 'dist/crownfall-offline.html'), html);
console.log(`Offline HTML built: ${Buffer.byteLength(html).toLocaleString()} bytes. All game assets are embedded.`);
