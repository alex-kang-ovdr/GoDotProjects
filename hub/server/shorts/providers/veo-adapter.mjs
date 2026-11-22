// Official Google Flow / Veo Video Generation REST LRO Adapter (Gemini API & Vertex AI).
// Supports Text-to-Video, First-Frame Image-to-Video, and First+Last Frame Interpolation in 9:16.
import fs from 'node:fs';
import { detectVeoConfig } from '../engines.mjs';
import {
  decodeDataUrlImage,
  validateVideoBuffer,
  extractPosterFromVideo,
  probeVideoFile,
  buildFallbackPosterSvg
} from './ffmpeg-adapter.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function extractBase64Payload(frame) {
  if (!frame) return null;
  if (frame.dataUrl) {
    const decoded = decodeDataUrlImage(frame.dataUrl);
    if (!decoded) return null;
    return {
      bytesBase64Encoded: decoded.buffer.toString('base64'),
      mimeType: decoded.mime
    };
  }
  if (frame.filePath && fs.existsSync(frame.filePath)) {
    const ext = frame.filePath.toLowerCase();
    const mimeType = ext.endsWith('.png') ? 'image/png' : ext.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    const buf = fs.readFileSync(frame.filePath);
    if (buf.length > 6 * 1024 * 1024) return null;
    return {
      bytesBase64Encoded: buf.toString('base64'),
      mimeType
    };
  }
  return null;
}

function extractVideoCandidate(opPayload) {
  const resp = opPayload?.response || opPayload?.result || {};
  const generatedSamples =
    resp.generateVideoResponse?.generatedSamples ||
    resp.generatedVideos ||
    resp.videos ||
    resp.predictions ||
    [];
  if (!Array.isArray(generatedSamples) || !generatedSamples.length) return null;
  const first = generatedSamples[0];
  const video = first?.video || first;
  if (typeof video?.uri === 'string' && video.uri) return { uri: video.uri };
  if (typeof video?.bytesBase64Encoded === 'string' && video.bytesBase64Encoded) {
    return { base64: video.bytesBase64Encoded };
  }
  if (typeof first?.bytesBase64Encoded === 'string' && first.bytesBase64Encoded) {
    return { base64: first.bytesBase64Encoded };
  }
  return null;
}

export async function generateShortsWithVeo({
  engineId = 'google-flow-veo-fast',
  storyboard,
  keyframes = [],
  durationSec = 8,
  outputVideoPath,
  outputPosterPath,
  onProgress = () => {},
  env = process.env,
  config = {},
  fetchImpl = globalThis.fetch,
  pollIntervalMs = 2500,
  maxPollAttempts = 90
}) {
  const veo = detectVeoConfig(env, config);
  if (!veo.configured) {
    throw Object.assign(
      new Error('Google Flow / Veo API 키(GEMINI_API_KEY 또는 Vertex AI)가 설정되어 있지 않습니다.'),
      { code: 'VEO_NOT_CONFIGURED' }
    );
  }
  if (typeof fetchImpl !== 'function') {
    throw Object.assign(new Error('HTTP fetch 구현이 필요합니다.'), { code: 'FETCH_UNAVAILABLE' });
  }

  const isPro = engineId === 'google-flow-veo-pro';
  const model = isPro ? veo.proModel : veo.fastModel;
  const resolution = isPro ? '1080p' : '720p';
  const safeDuration = Math.max(5, Math.min(8, Math.round(Number(durationSec) || 8)));

  const firstFrame = extractBase64Payload(keyframes[0]);
  const lastFrame = isPro && keyframes.length >= 2 ? extractBase64Payload(keyframes[keyframes.length - 1]) : null;

  const instance = {
    prompt: storyboard?.flowPrompt || storyboard?.gameTitle || 'Vertical 9:16 game trailer short'
  };
  if (firstFrame) instance.image = firstFrame;
  if (lastFrame) instance.lastFrame = lastFrame;

  const requestPayload = {
    instances: [instance],
    parameters: {
      aspectRatio: '9:16',
      resolution,
      durationSeconds: safeDuration,
      sampleCount: 1
    }
  };

  let endpoint;
  let headers;
  if (veo.mode === 'vertex-ai') {
    endpoint = `https://${veo.vertexLocation}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(veo.vertexProject)}/locations/${encodeURIComponent(veo.vertexLocation)}/publishers/google/models/${encodeURIComponent(model)}:predictLongRunning`;
    headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${veo.vertexAccessToken}`
    };
  } else {
    endpoint = `${veo.apiBaseUrl}/models/${encodeURIComponent(model)}:predictLongRunning`;
    headers = {
      'Content-Type': 'application/json',
      'x-goog-api-key': veo.geminiApiKey
    };
  }

  onProgress(20, `Google Flow (${model}) 영상 생성 요청 전송 중`);
  const startRes = await fetchImpl(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestPayload)
  });
  const startData = await startRes.json().catch(() => ({}));
  if (!startRes.ok) {
    const msg = startData?.error?.message || `Veo API 요청 실패 (HTTP ${startRes.status})`;
    throw Object.assign(new Error(msg), { code: 'VEO_REQUEST_FAILED', status: startRes.status });
  }

  let opData = startData;
  const opName = typeof startData?.name === 'string' ? startData.name : '';
  if (!opData.done && opName) {
    const pollUrl = veo.mode === 'vertex-ai'
      ? `https://${veo.vertexLocation}-aiplatform.googleapis.com/v1/${opName.replace(/^\/+/, '')}`
      : `${veo.apiBaseUrl}/${opName.replace(/^\/+/, '')}`;
    const pollHeaders = veo.mode === 'vertex-ai'
      ? { Authorization: `Bearer ${veo.vertexAccessToken}` }
      : { 'x-goog-api-key': veo.geminiApiKey };

    for (let attempt = 1; attempt <= maxPollAttempts; attempt++) {
      const pct = Math.min(78, 25 + Math.round((attempt / Math.max(8, maxPollAttempts)) * 55));
      onProgress(pct, `Google Flow (${model}) 영상 렌더링 대기 중 (${attempt})`);
      if (pollIntervalMs > 0) await sleep(pollIntervalMs);
      const pollRes = await fetchImpl(pollUrl, { method: 'GET', headers: pollHeaders });
      opData = await pollRes.json().catch(() => ({}));
      if (!pollRes.ok) {
        const msg = opData?.error?.message || `Veo 작업 상태 조회 실패 (HTTP ${pollRes.status})`;
        throw Object.assign(new Error(msg), { code: 'VEO_POLL_FAILED', status: pollRes.status });
      }
      if (opData.done === true) break;
    }
  }

  if (opData?.error) {
    throw Object.assign(
      new Error(opData.error.message || 'Veo 영상 생성 중 오류가 발생했습니다.'),
      { code: 'VEO_GENERATION_ERROR' }
    );
  }
  if (opData?.done !== true) {
    throw Object.assign(new Error('Veo 영상 생성 시간이 초과되었습니다.'), { code: 'VEO_TIMEOUT' });
  }

  const candidate = extractVideoCandidate(opData);
  if (!candidate) {
    throw Object.assign(new Error('Veo 응답에서 영상 결과물을 찾지 못했습니다.'), { code: 'VEO_EMPTY_OUTPUT' });
  }

  onProgress(82, '생성된 Veo MP4 다운로드 및 검증 중');
  let videoBuffer;
  if (candidate.base64) {
    videoBuffer = Buffer.from(candidate.base64, 'base64');
  } else {
    const dlHeaders = veo.mode === 'vertex-ai'
      ? { Authorization: `Bearer ${veo.vertexAccessToken}` }
      : { 'x-goog-api-key': veo.geminiApiKey };
    const dlRes = await fetchImpl(candidate.uri, { method: 'GET', headers: dlHeaders });
    if (!dlRes.ok) {
      throw Object.assign(new Error(`Veo MP4 다운로드 실패 (HTTP ${dlRes.status})`), { code: 'VEO_DOWNLOAD_FAILED' });
    }
    videoBuffer = Buffer.from(await dlRes.arrayBuffer());
  }

  const validation = validateVideoBuffer(videoBuffer);
  if (!validation.valid) {
    throw Object.assign(new Error('다운로드된 Veo 영상 형식이 올바르지 않습니다.'), { code: validation.reason });
  }

  fs.writeFileSync(outputVideoPath, videoBuffer);

  let posterExt = '.jpg';
  const extracted = outputPosterPath
    ? await extractPosterFromVideo(outputVideoPath, outputPosterPath, env)
    : false;
  if (!extracted && outputPosterPath) {
    posterExt = '.svg';
    fs.writeFileSync(
      outputPosterPath.replace(/\.[^.]+$/, '.svg'),
      buildFallbackPosterSvg({
        title: storyboard?.gameTitle,
        genreLabel: storyboard?.genreLabel,
        hookText: storyboard?.hookText
      }),
      'utf8'
    );
  }

  const meta = await probeVideoFile(outputVideoPath, env);
  onProgress(98, 'Veo 쇼츠 등록 준비 완료');

  return {
    videoPath: outputVideoPath,
    posterPath: extracted ? outputPosterPath : (outputPosterPath ? outputPosterPath.replace(/\.[^.]+$/, '.svg') : null),
    posterExt,
    mimeType: validation.mimeType,
    bytes: validation.bytes,
    sha256: validation.sha256,
    durationSec: meta.durationSec || safeDuration,
    width: meta.width || (isPro ? 1080 : 720),
    height: meta.height || (isPro ? 1920 : 1280),
    aspectRatio: '9:16',
    model
  };
}
