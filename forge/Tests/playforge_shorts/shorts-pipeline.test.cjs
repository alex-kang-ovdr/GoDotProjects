'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createShortsPipelineHandler } = require('../../Tools/shorts-pipeline/handler.cjs');

const forgeRoot = path.resolve(__dirname, '..', '..');

async function startTestServer(handler) {
  const server = http.createServer(async (req, res) => {
    const parsed = new URL(req.url, 'http://127.0.0.1');
    const handled = await handler(req, res, parsed);
    if (!handled) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'NOT_FOUND' }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

test('PlayForge Shorts Pipeline: config, storyboard composition, and local FFmpeg job lifecycle', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-shorts-test-'));
  const handler = createShortsPipelineHandler(forgeRoot, { storageDir: tmpDir });
  const { server, baseUrl } = await startTestServer(handler);

  try {
    const cfgRes = await fetch(`${baseUrl}/api/shorts/config`);
    assert.equal(cfgRes.status, 200);
    const cfg = await cfgRes.json();
    assert.equal(cfg.ok, true);
    assert.equal(cfg.mode, 'forge-local');
    assert.ok(Array.isArray(cfg.engines) && cfg.engines.length >= 4);

    const sbRes = await fetch(`${baseUrl}/api/shorts/storyboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Fortress War',
        description: '턴제 지형 파괴 포격 대전',
        tags: ['strategy', 'multiplayer'],
        stylePreset: 'cinematic',
        cameraMotion: 'orbit-pan',
        durationSec: 6
      })
    });
    assert.equal(sbRes.status, 200);
    const sbData = await sbRes.json();
    assert.equal(sbData.ok, true);
    assert.equal(sbData.storyboard.scenes.length, 3);
    assert.match(sbData.storyboard.flowPrompt, /Fortress War/);

    if (cfg.ffmpegAvailable) {
      const jobRes = await fetch(`${baseUrl}/api/shorts/jobs?sync=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Fortress War Shorts',
          description: '파괴 물리 포격 쇼츠',
          engineId: 'forge-motion-ffmpeg',
          stylePreset: 'cinematic',
          durationSec: 5
        })
      });
      assert.equal(jobRes.status, 201);
      const jobData = await jobRes.json();
      assert.equal(jobData.ok, true);
      assert.equal(jobData.job.status, 'ready');
      assert.ok(jobData.job.bytes > 10000);

      const rangeRes = await fetch(`${baseUrl}${jobData.job.videoUrl}`, {
        headers: { Range: 'bytes=0-31' }
      });
      assert.equal(rangeRes.status, 206);
      const chunk = Buffer.from(await rangeRes.arrayBuffer());
      assert.equal(chunk.length, 32);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
