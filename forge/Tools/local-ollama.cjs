'use strict';

const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const HOST = '127.0.0.1:11434';
const PREFERRED_MODELS = ['qwen3:4b', 'qwen2.5-coder:7b'];
const QUERY_TIMEOUT_MS = 1200;
const STARTUP_TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 512 * 1024;

async function query(endpoint, model, timeoutMs = QUERY_TIMEOUT_MS) {
  try {
    const response = await fetch(`http://${HOST}${endpoint}`, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error',
      ...(model ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) } : {}),
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      return null;
    }
    const reader = response.body.getReader();
    let size = 0;
    const chunks = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RESPONSE_BYTES) return null;
        chunks.push(value);
      }
      return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
    } finally {
      await reader.cancel();
    }
  } catch {
    return null;
  }
}

async function localCatalog(timeoutMs) {
  const response = await query('/api/tags', undefined, timeoutMs);
  return Array.isArray(response?.models) ? response.models : null;
}

async function startLocalService() {
  if (process.platform !== 'win32') return false;
  const localData = process.env.LOCALAPPDATA;
  const programFiles = process.env.ProgramFiles;
  const portable = localData && path.join(localData, 'PlayForge', 'Ollama');
  const candidates = [
    portable && { executable: path.join(portable, 'ollama.exe'), models: path.join(portable, 'models') },
    localData && { executable: path.join(localData, 'Programs', 'Ollama', 'ollama.exe') },
    programFiles && { executable: path.join(programFiles, 'Ollama', 'ollama.exe') },
  ].filter(Boolean);
  for (const { executable, models } of candidates) {
    if (!path.isAbsolute(executable) || !existsSync(executable)) continue;
    const started = await new Promise(resolve => {
      const child = spawn(executable, ['serve'], {
        windowsHide: true, detached: true, stdio: 'ignore',
        env: { ...process.env, OLLAMA_HOST: HOST, ...(models ? { OLLAMA_MODELS: models } : {}) },
      });
      child.once('error', () => resolve(false));
      child.once('spawn', () => { child.unref(); resolve(true); });
    });
    if (started) return true;
  }
  return false;
}

async function ensureLocalOllama() {
  let models = await localCatalog();
  if (models === null) {
    if (!await startLocalService()) return { model: '', running: false };
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      models = await localCatalog(Math.min(QUERY_TIMEOUT_MS, Math.max(1, deadline - Date.now())));
      if (models !== null) break;
      if (Date.now() < deadline) await delay(Math.min(250, deadline - Date.now()));
    }
  }
  if (models === null) return { model: '', running: false };
  const installedNames = new Set(models.map(entry => entry?.name ?? entry?.model));
  for (const model of PREFERRED_MODELS) {
    if (!installedNames.has(model)) continue;
    const info = await query('/api/show', model);
    if (Array.isArray(info?.capabilities) && info.capabilities.includes('tools')) {
      return { model, running: true };
    }
  }
  return { model: '', running: true };
}

module.exports = { ensureLocalOllama };
