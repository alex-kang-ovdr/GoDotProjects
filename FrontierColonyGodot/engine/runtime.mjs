import { readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { gzipSync } from 'node:zlib';
import {
  ColonyGame, BUILDINGS, RESEARCH, RESOURCE_LABELS, JOB_LABELS, RECIPES,
  EQUIPMENT, TRADE_PRICES, SCHEDULE_MODES, SCHEDULE_PRESETS,
} from './engine.js';

const catalog = {
  buildings: BUILDINGS,
  research: RESEARCH,
  resources: RESOURCE_LABELS,
  jobs: JOB_LABELS,
  recipes: RECIPES,
  equipment: EQUIPMENT,
  trade_prices: TRADE_PRICES,
  schedule_modes: SCHEDULE_MODES,
  schedule_presets: SCHEDULE_PRESETS,
};
const saveFormat = 'frontier-colony-save';
const maxSaveLength = 4_000_000;

let game;

function atomicWrite(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(value), { flag: 'wx' });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function snapshot() {
  return {
    state: game.state,
    summary: game.getSummary(),
    objectives: game.getObjectives(),
    catalog,
    mood_factors: Object.fromEntries(game.state.colonists.map(c => [c.id, game.getMoodFactors(c)])),
    equipment_stats: Object.fromEntries(game.state.colonists.map(c => [c.id, game.getEquipmentStats(c)])),
  };
}

function loadSave(path) {
  // The web version limits UTF-16 code units. Four UTF-8 bytes per unit is a safe file bound.
  if (statSync(path).size > maxSaveLength * 4) throw new Error('저장 파일이 너무 큽니다.');
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  if (text.length > maxSaveLength) throw new Error('저장 파일이 너무 큽니다.');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('저장 파일의 JSON 형식이 올바르지 않습니다.');
  }
  if (data && Object.hasOwn(data, 'format')) {
    if (data.format !== saveFormat || data.version !== 1 || !data.game) {
      throw new Error('지원하는 정착지 저장 파일이 아닙니다.');
    }
    return ColonyGame.fromJSON(data.game);
  }
  return ColonyGame.fromJSON(data);
}

function applyCommand(payload) {
  if (!Array.isArray(payload.batch)) return game.command(payload.type, payload.payload);

  let count = 0;
  let lastMessage = '적용할 명령이 없습니다.';
  for (const command of payload.batch) {
    if (!command || typeof command.type !== 'string') continue;
    const result = game.command(command.type, command.payload);
    if (result.ok) count++;
    lastMessage = result.message;
  }
  const total = payload.batch.length;
  return { ok: count > 0, count, total, message: count > 0 ? `${count}/${total}칸에 명령을 적용했습니다.` : lastMessage };
}

function perform(action, payload) {
  if (action === 'start') {
    game = new ColonyGame(payload);
    return { result: { ok: true }, snapshot: snapshot() };
  }
  if (action === 'load') {
    game = loadSave(payload.path);
    return { result: { ok: true, path: payload.path }, snapshot: snapshot() };
  }
  if (!game) throw new Error('먼저 새 정착지를 시작하거나 저장 파일을 불러오세요.');

  switch (action) {
    case 'tick':
      if (!Number.isFinite(payload.seconds) || payload.seconds < 0) {
        throw new Error('시뮬레이션 시간은 0 이상이어야 합니다.');
      }
      game.update(payload.seconds);
      return { result: { ok: true }, snapshot: snapshot() };
    case 'command':
      return { result: applyCommand(payload), snapshot: snapshot() };
    case 'save':
      atomicWrite(payload.path, {
        format: saveFormat,
        version: 1,
        savedAt: new Date().toISOString(),
        game: game.state,
      });
      return { result: { ok: true, path: payload.path, quiet: payload.quiet === true } };
    default:
      throw new Error(`지원하지 않는 동작입니다. ${action}`);
  }
}

function respond(request) {
  const { id, action, payload } = request;
  try {
    return { id, ...perform(action, payload) };
  } catch (error) {
    return { id, result: { ok: false, message: error.message } };
  }
}

const requests = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of requests) {
  const header = JSON.parse(line);
  let response;
  try {
    const request = header.requestFile
      ? JSON.parse(readFileSync(new URL('./request.json', import.meta.url), 'utf8'))
      : header;
    response = respond(request);
  } catch (error) {
    response = { id: header.id, result: { ok: false, message: error.message } };
  }
  const json = JSON.stringify(response);
  // Full-map states otherwise saturate the small Windows pipe buffer across multiple frames.
  const frame = response.snapshot ? `~${gzipSync(json, { level: 1 }).toString('base64')}` : json;
  await new Promise((resolve, reject) => {
    process.stdout.write(`${frame}\n`, error => error ? reject(error) : resolve());
  });
}
