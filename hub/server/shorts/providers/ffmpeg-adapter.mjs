// Real FFmpeg 9:16 Vertical Shorts Director, Poster Extractor, and Media Validator.
// Uses execFile (never shell) with strict temp-dir isolation and UTF-8 textfile drawtext.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { STYLE_PRESET_MAP, detectFfmpegBinary } from '../engines.mjs';

const execFileAsync = promisify(execFile);

const FONT_CANDIDATES = [
  'C:\\Windows\\Fonts\\malgunbd.ttf',
  'C:\\Windows\\Fonts\\malgun.ttf',
  'C:\\Windows\\Fonts\\NanumGothicBold.ttf',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/System/Library/Fonts/AppleSDGothicNeo.ttc'
];

function findFontPath() {
  for (const candidate of FONT_CANDIDATES) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {}
  }
  return null;
}

function escapeFilterPath(filePath) {
  return String(filePath)
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'");
}

function wrapText(text, maxCharsPerLine = 18, maxLines = 2) {
  const clean = String(text ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const words = clean.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else if (!current) {
      lines.push(word.slice(0, maxCharsPerLine));
      current = word.slice(maxCharsPerLine, maxCharsPerLine * 2);
    } else {
      lines.push(current);
      current = word;
    }
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines.slice(0, maxLines).join('\n');
}

export function validateVideoBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 32) {
    return { valid: false, reason: 'VIDEO_TOO_SMALL' };
  }
  // ISO BMFF / MP4: bytes 4..7 === 'ftyp'
  const isMp4 = buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  // WebM / Matroska EBML header: 0x1A 0x45 0xDF 0xA3
  const isWebm = buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
  if (!isMp4 && !isWebm) {
    return { valid: false, reason: 'VIDEO_SIGNATURE_INVALID' };
  }
  return {
    valid: true,
    mimeType: isMp4 ? 'video/mp4' : 'video/webm',
    ext: isMp4 ? '.mp4' : '.webm',
    bytes: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex')
  };
}

export function decodeDataUrlImage(dataUrl, maxBytes = 6 * 1024 * 1024) {
  if (typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const mime = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  const buf = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (buf.length < 16 || buf.length > maxBytes) return null;
  const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
  return { mime, ext, buffer: buf };
}

export async function probeVideoFile(videoPath, env = process.env) {
  const { ffprobeBin } = detectFfmpegBinary(env);
  try {
    const { stdout } = await execFileAsync(ffprobeBin, [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      videoPath
    ], { timeout: 10000, windowsHide: true });
    const parsed = JSON.parse(stdout || '{}');
    const vStream = Array.isArray(parsed.streams)
      ? parsed.streams.find(s => s.codec_type === 'video')
      : null;
    const aStream = Array.isArray(parsed.streams)
      ? parsed.streams.find(s => s.codec_type === 'audio')
      : null;
    const durationSec = Number(parsed.format?.duration || vStream?.duration || 0);
    return {
      durationSec: Number.isFinite(durationSec) && durationSec > 0 ? Number(durationSec.toFixed(2)) : 0,
      width: Number(vStream?.width || 720),
      height: Number(vStream?.height || 1280),
      hasAudio: Boolean(aStream)
    };
  } catch {
    return { durationSec: 8, width: 720, height: 1280, hasAudio: false };
  }
}

export async function extractPosterFromVideo(videoPath, posterPath, env = process.env) {
  const { available, bin } = detectFfmpegBinary(env);
  if (!available) return false;
  try {
    await execFileAsync(bin, [
      '-y',
      '-ss', '1.2',
      '-i', videoPath,
      '-frames:v', '1',
      '-vf', 'scale=720:-2',
      '-q:v', '3',
      posterPath
    ], { timeout: 15000, windowsHide: true });
    return fs.existsSync(posterPath) && fs.statSync(posterPath).size > 256;
  } catch {
    try {
      await execFileAsync(bin, [
        '-y',
        '-i', videoPath,
        '-frames:v', '1',
        '-vf', 'scale=720:-2',
        '-q:v', '3',
        posterPath
      ], { timeout: 15000, windowsHide: true });
      return fs.existsSync(posterPath) && fs.statSync(posterPath).size > 256;
    } catch {
      return false;
    }
  }
}

export function buildFallbackPosterSvg({ title, genreLabel, hookText, accent = '#004AC6' }) {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 1280" width="720" height="1280">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0B1530"/>
      <stop offset="55%" stop-color="${esc(accent)}"/>
      <stop offset="100%" stop-color="#11131B"/>
    </linearGradient>
  </defs>
  <rect width="720" height="1280" fill="url(#bg)"/>
  <rect x="48" y="88" width="260" height="52" rx="26" fill="rgba(255,255,255,0.16)"/>
  <text x="178" y="122" text-anchor="middle" fill="#FFFFFF" font-family="sans-serif" font-size="22" font-weight="700">PLAY HUB SHORTS</text>
  <text x="360" y="560" text-anchor="middle" fill="#FFFFFF" font-family="sans-serif" font-size="56" font-weight="800">${esc(String(title || 'PlayHub').slice(0, 22))}</text>
  <text x="360" y="640" text-anchor="middle" fill="#DBE1FF" font-family="sans-serif" font-size="30" font-weight="600">${esc(String(hookText || genreLabel || '').slice(0, 32))}</text>
  <rect x="130" y="1030" width="460" height="84" rx="42" fill="#004AC6"/>
  <text x="360" y="1084" text-anchor="middle" fill="#FFFFFF" font-family="sans-serif" font-size="30" font-weight="800">PLAY HUB에서 지금 플레이 ▶</text>
</svg>`;
}

export async function synthesizeKoreanNarrationWav(narrationSegments, outWavPath, tmpDir, env = process.env) {
  if (process.platform !== 'win32') return null;
  if (env.PLAYHUB_SHORTS_DISABLE_TTS === '1') return null;
  const lines = Array.isArray(narrationSegments)
    ? narrationSegments.map(s => String(s?.text || '').trim()).filter(Boolean)
    : [];
  if (!lines.length) return null;

  const textPath = path.join(tmpDir, 'narration_tts.txt');
  const scriptPath = path.join(tmpDir, 'tts.ps1');
  fs.writeFileSync(textPath, lines.join('. '), 'utf8');
  // Pure file-based PowerShell script: zero string interpolation of untrusted text.
  const psScript = [
    'param([string]$TextFile, [string]$OutWav)',
    'Add-Type -AssemblyName System.Speech',
    '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    '$ko = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like "ko*" } | Select-Object -First 1',
    'if ($ko) { $synth.SelectVoice($ko.VoiceInfo.Name) }',
    '$synth.Rate = 2',
    '$synth.Volume = 100',
    '$txt = [System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8)',
    '$synth.SetOutputToWaveFile($OutWav)',
    '$synth.Speak($txt)',
    '$synth.Dispose()'
  ].join('\r\n');
  fs.writeFileSync(scriptPath, psScript, 'utf8');

  try {
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      textPath,
      outWavPath
    ], { timeout: 9000, windowsHide: true });
    if (fs.existsSync(outWavPath) && fs.statSync(outWavPath).size > 1024) {
      return outWavPath;
    }
  } catch {}
  return null;
}

export async function renderMotionShortsWithFfmpeg({
  storyboard,
  keyframes = [],
  stylePreset = 'google-playground',
  cameraMotion = 'dynamic-zoom',
  durationSec = 8,
  outputVideoPath,
  outputPosterPath,
  onProgress = () => {},
  env = process.env
}) {
  const ffmpeg = detectFfmpegBinary(env);
  if (!ffmpeg.available) {
    throw Object.assign(new Error('FFmpeg가 설치되어 있지 않아 PlayForge Motion Director를 실행할 수 없습니다.'), {
      code: 'FFMPEG_UNAVAILABLE'
    });
  }

  const style = STYLE_PRESET_MAP[stylePreset] || STYLE_PRESET_MAP['google-playground'] || STYLE_PRESET_MAP.cinematic;
  const dur = Math.max(5, Math.min(12, Number(durationSec) || 8));
  const fps = 30;
  const W = 720;
  const H = 1280;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-shorts-'));

  try {
    onProgress(20, '키프레임 · 한국어 나래이션 음성 및 자막 에셋 준비 중');
    const validFrames = [];
    for (let i = 0; i < Math.min(6, keyframes.length); i++) {
      const kf = keyframes[i];
      if (kf?.filePath && fs.existsSync(kf.filePath)) {
        const ext = path.extname(kf.filePath).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
          validFrames.push(kf.filePath);
        }
      } else if (kf?.dataUrl) {
        const decoded = decodeDataUrlImage(kf.dataUrl);
        if (decoded) {
          const fp = path.join(tmpDir, `kf_${i}${decoded.ext}`);
          fs.writeFileSync(fp, decoded.buffer);
          validFrames.push(fp);
        }
      }
    }

    const scenes = Array.isArray(storyboard?.scenes) && storyboard.scenes.length >= 3
      ? storyboard.scenes
      : [
        { startSec: 0, endSec: dur * 0.28, headline: storyboard?.hookText || '지금 바로 플레이!', subline: storyboard?.gameTitle || 'PlayHub' },
        { startSec: dur * 0.28, endSec: dur * 0.72, headline: storyboard?.highlightText || '설치 없이 즉시 실행', subline: storyboard?.genreLabel || '웹 게임' },
        { startSec: dur * 0.72, endSec: dur, headline: storyboard?.ctaText || 'PLAY HUB에서 지금 무료 플레이', subline: storyboard?.gameTitle || 'PlayHub' }
      ];

    const narrationList = Array.isArray(storyboard?.narration) && storyboard.narration.length
      ? storyboard.narration.slice(0, 6)
      : [
        { startSec: 0, endSec: Number((dur * 0.32).toFixed(2)), text: storyboard?.hookText || '지금 바로 시작하세요!' },
        { startSec: Number((dur * 0.32).toFixed(2)), endSec: Number((dur * 0.7).toFixed(2)), text: storyboard?.highlightText || `${storyboard?.gameTitle || 'PlayHub'} 핵심 액션!` },
        { startSec: Number((dur * 0.7).toFixed(2)), endSec: dur, text: storyboard?.ctaText || '플레이허브에서 바로 플레이!' }
      ];

    // Synthesize real Korean TTS voiceover WAV when available (Windows SAPI ko-KR)
    const ttsWavPath = await synthesizeKoreanNarrationWav(
      narrationList,
      path.join(tmpDir, 'narration.wav'),
      tmpDir,
      env
    );

    const writeTxt = (name, content) => {
      const fp = path.join(tmpDir, name);
      fs.writeFileSync(fp, String(content || ''), 'utf8');
      return escapeFilterPath(fp);
    };

    // TikTok / Kakao Webtoon Cuts 2-line bold hook headline (Line 1 White, Line 2 Electric Yellow)
    const headlineLine1 = wrapText(storyboard?.topHeadline?.line1 || `${storyboard?.genreLabel || '웹 게임'} 판도를 뒤집는`, 20, 1);
    const headlineLine2 = wrapText(storyboard?.topHeadline?.line2 || storyboard?.gameTitle || '8초 플레이 하이라이트', 20, 1);
    const topL1File = writeTxt('top_l1.txt', headlineLine1);
    const topL2File = writeTxt('top_l2.txt', headlineLine2);

    const narrFiles = narrationList.map((seg, idx) => ({
      start: Math.max(0, Number(seg.startSec) || 0).toFixed(2),
      end: Math.min(dur, Math.max((Number(seg.startSec) || 0) + 0.4, Number(seg.endSec) || dur)).toFixed(2),
      file: writeTxt(`narr_${idx}.txt`, wrapText(seg.text || '', 18, 2))
    }));

    const fontPath = findFontPath();
    const fontArg = fontPath ? `fontfile='${escapeFilterPath(fontPath)}':` : '';

    const args = ['-y'];
    const filterParts = [];

    if (validFrames.length > 0) {
      const segDur = dur / validFrames.length;
      const segFrames = Math.max(30, Math.ceil(segDur * fps));

      for (let i = 0; i < validFrames.length; i++) {
        args.push('-loop', '1', '-t', String(segDur + 0.4), '-i', validFrames[i]);
      }

      const zoomExpr = cameraMotion === 'orbit-pan'
        ? '1.08'
        : cameraMotion === 'slowmo-hero'
          ? 'min(zoom+0.0007,1.16)'
          : 'min(zoom+0.0014,1.24)';
      const xExpr = cameraMotion === 'orbit-pan'
        ? `iw*0.04*sin(on/${segFrames}*PI)`
        : 'iw/2-(iw/zoom/2)';
      const yExpr = 'ih/2-(ih/zoom/2)';

      for (let i = 0; i < validFrames.length; i++) {
        // Blurred center ambient fill + large crisp zoomed gameplay stage (TikTok/Cuts vertical layout)
        filterParts.push(
          `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=22:3,eq=brightness=-0.26:saturation=1.22,setsar=1[bg${i}]`
        );
        filterParts.push(
          `[${i}:v]scale=1080:-2:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2:(ow-iw)/2:(oh-ih)/2:color=0x090B12,zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${segFrames}:s=696x560:fps=${fps},setsar=1[fg${i}]`
        );
        filterParts.push(
          `[bg${i}][fg${i}]overlay=(W-w)/2:278:shortest=1,trim=duration=${segDur.toFixed(3)},setpts=PTS-STARTPTS[seg${i}]`
        );
      }

      if (validFrames.length === 1) {
        filterParts.push(`[seg0]copy[base]`);
      } else {
        const inputs = validFrames.map((_, i) => `[seg${i}]`).join('');
        filterParts.push(`${inputs}concat=n=${validFrames.length}:v=1:a=0,trim=duration=${dur},setpts=PTS-STARTPTS[base]`);
      }
    } else {
      args.push('-f', 'lavfi', '-i', `color=c=${style.bgHex}:s=${W}x${H}:r=${fps}:d=${dur}`);
      filterParts.push(
        `[0:v]drawbox=x=0:y=252:w=${W}:h=736:color=${style.glowHex}@0.28:t=fill,` +
        `drawbox=x=24:y=282:w=${W - 48}:h=560:color=${style.glowHex}@0.22:t=fill,` +
        `drawbox=x=28:y=286:w=${W - 56}:h=552:color=0xFFE600@0.22:t=2[base]`
      );
    }

    // Audio inputs: upbeat synth BGM + optional real Korean TTS voiceover
    const bgmInputIdx = validFrames.length > 0 ? validFrames.length : 1;
    const synthExpr =
      '0.10*sin(2*PI*220*t)*(0.5+0.5*sin(2*PI*2*t))' +
      '+0.08*sin(2*PI*330*t)*(0.5+0.5*sin(2*PI*4*t))' +
      '+0.06*sin(2*PI*440*t)*(0.5+0.5*sin(2*PI*1*t))' +
      '+0.04*sin(2*PI*110*t)';
    args.push('-f', 'lavfi', '-i', `aevalsrc='${synthExpr}|${synthExpr}':s=44100:d=${dur}`);

    let ttsInputIdx = null;
    if (ttsWavPath) {
      ttsInputIdx = bgmInputIdx + 1;
      args.push('-i', ttsWavPath);
    }

    const s1End = Number(scenes[0]?.endSec ?? dur * 0.28).toFixed(2);
    const s2End = Number(scenes[1]?.endSec ?? dur * 0.72).toFixed(2);

    // TikTok / Kakao Webtoon Cuts visual layout:
    // - Pure black upper letterbox (0..254) with massive 2-line White + Yellow headline
    // - Clean lower dark safe-zone (964..1280) for portal UI overlays
    // - Bold yellow-stroked centered narration subtitles right below visual action (y=852)
    const overlaySteps = [
      `drawbox=x=0:y=0:w=${W}:h=256:color=0x000000@1.0:t=fill`,
      `drawbox=x=0:y=968:w=${W}:h=312:color=0x000000@0.86:t=fill`,
      // 2-Line Bold White + Electric Yellow Hook Headline
      `drawtext=${fontArg}textfile='${topL1File}':fontcolor=0xFFFFFF:fontsize=39:x=(w-text_w)/2:y=108:borderw=2:bordercolor=0x000000`,
      `drawtext=${fontArg}textfile='${topL2File}':fontcolor=0xFFE600:fontsize=42:x=(w-text_w)/2:y=166:borderw=3:bordercolor=0x000000`,
      // Timed Bold Yellow-Stroked Narration Subtitles (Kakao Webtoon Cuts style)
      ...narrFiles.map(nf =>
        `drawtext=${fontArg}textfile='${nf.file}':fontcolor=0xFFE600:fontsize=39:line_spacing=5:x=(w-text_w)/2:y=772:borderw=5:bordercolor=0x000000:shadowcolor=0x000000@0.85:shadowx=0:shadowy=4:enable='between(t,${nf.start},${nf.end})'`
      ),
      // Sleek subtle 3-beat progress bar along very bottom edge
      `drawbox=x=32:y=1254:w=212:h=5:color=0xFFFFFF@0.20:t=fill`,
      `drawbox=x=254:y=1254:w=212:h=5:color=0xFFFFFF@0.20:t=fill`,
      `drawbox=x=476:y=1254:w=212:h=5:color=0xFFFFFF@0.20:t=fill`,
      `drawbox=x=32:y=1254:w=212:h=5:color=0xFFE600@0.98:t=fill:enable='gte(t,0)'`,
      `drawbox=x=254:y=1254:w=212:h=5:color=0xFFE600@0.98:t=fill:enable='gte(t,${s1End})'`,
      `drawbox=x=476:y=1254:w=212:h=5:color=0x4285F4@0.98:t=fill:enable='gte(t,${s2End})'`,
      `fade=t=in:st=0:d=0.25`,
      `fade=t=out:st=${Math.max(0.5, dur - 0.35).toFixed(2)}:d=0.35`
    ];

    filterParts.push(`[base]${overlaySteps.join(',')}[vout]`);
    if (ttsInputIdx !== null) {
      filterParts.push(`[${bgmInputIdx}:a]volume=0.24[bgm_low]`);
      filterParts.push(`[${ttsInputIdx}:a]aresample=44100,aformat=channel_layouts=stereo,volume=1.55[tts_st]`);
      filterParts.push(
        `[bgm_low][tts_st]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,afade=t=in:st=0:d=0.2,afade=t=out:st=${Math.max(0.5, dur - 0.5).toFixed(2)}:d=0.5[aout]`
      );
    } else {
      filterParts.push(
        `[${bgmInputIdx}:a]afade=t=in:st=0:d=0.25,afade=t=out:st=${Math.max(0.5, dur - 0.5).toFixed(2)}:d=0.5[aout]`
      );
    }

    args.push(
      '-filter_complex', filterParts.join(';'),
      '-map', '[vout]',
      '-map', '[aout]',
      '-t', String(dur),
      '-r', String(fps),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      outputVideoPath
    );

    onProgress(54, ttsWavPath ? '9:16 H.264 영상 + 한국어 나래이션 음성 합성 중' : '9:16 H.264 쇼츠 영상 인코딩 중');
    await execFileAsync(ffmpeg.bin, args, {
      timeout: 90000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true
    });

    onProgress(84, '영상 무결성 및 썸네일 추출 중');
    const videoBuf = fs.readFileSync(outputVideoPath);
    const validation = validateVideoBuffer(videoBuf);
    if (!validation.valid) {
      throw Object.assign(new Error('생성된 MP4 검증에 실패했습니다.'), { code: validation.reason });
    }

    let posterExt = '.jpg';
    const extracted = outputPosterPath
      ? await extractPosterFromVideo(outputVideoPath, outputPosterPath, env)
      : false;
    if (!extracted && outputPosterPath) {
      posterExt = '.svg';
      const svgPath = outputPosterPath.replace(/\.[^.]+$/, '.svg');
      fs.writeFileSync(svgPath, buildFallbackPosterSvg({
        title: storyboard?.gameTitle,
        genreLabel: storyboard?.genreLabel,
        hookText: storyboard?.hookText,
        accent: style.accent
      }), 'utf8');
    }

    const meta = await probeVideoFile(outputVideoPath, env);
    onProgress(98, '마무리 중');
    return {
      videoPath: outputVideoPath,
      posterPath: extracted ? outputPosterPath : (outputPosterPath ? outputPosterPath.replace(/\.[^.]+$/, '.svg') : null),
      posterExt,
      mimeType: validation.mimeType,
      bytes: validation.bytes,
      sha256: validation.sha256,
      durationSec: meta.durationSec || dur,
      width: meta.width || W,
      height: meta.height || H,
      aspectRatio: '9:16',
      hasKoreanTts: Boolean(ttsWavPath),
      model: ttsWavPath ? 'ffmpeg-9x16-director-v2-tts' : 'ffmpeg-9x16-director-v2'
    };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

/**
 * Transforms a creator-recorded video (MP4/WebM, landscape or portrait) into a polished 9:16 Short-Form MP4
 * with TikTok/Kakao Webtoon 2-line white+yellow headline, timed bold yellow-stroked Korean subtitles,
 * optional Windows Korean TTS voiceover mixed over ducked original audio or synth BGM, and poster thumbnail.
 */
export async function renderUploadedVideoToShortform({
  inputVideoPath,
  storyboard,
  framingMode = 'fit-blur',
  trimStartSec = 0,
  durationSec = 8,
  includeTts = true,
  keepOriginalAudio = true,
  bgmFallback = true,
  outputVideoPath,
  outputPosterPath,
  onProgress = () => {},
  env = process.env
}) {
  const ffmpeg = detectFfmpegBinary(env);
  if (!ffmpeg.available) {
    throw Object.assign(new Error('FFmpeg가 설치되어 있지 않아 직접 촬영 영상 숏폼화를 실행할 수 없습니다.'), {
      code: 'FFMPEG_UNAVAILABLE'
    });
  }
  if (!inputVideoPath || !fs.existsSync(inputVideoPath)) {
    throw Object.assign(new Error('변환할 원본 영상 파일을 찾을 수 없습니다.'), { code: 'SOURCE_VIDEO_MISSING' });
  }

  const fps = 30;
  const W = 720;
  const H = 1280;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-shortform-'));

  try {
    onProgress(16, '원본 촬영 영상 분석 및 나래이션 준비 중');
    const srcMeta = await probeVideoFile(inputVideoPath, env);
    const srcDur = Math.max(1, Number(srcMeta.durationSec) || 8);
    const safeStart = Math.max(0, Math.min(Math.max(0, srcDur - 1), Number(trimStartSec) || 0));
    const availableDur = Math.max(1, srcDur - safeStart);
    const requestedDur = Math.max(3, Math.min(15, Number(durationSec) || Math.min(12, Math.ceil(availableDur))));
    const dur = Number(Math.min(requestedDur, Math.max(3, availableDur)).toFixed(2));

    const narrationList = Array.isArray(storyboard?.narration) && storyboard.narration.length
      ? storyboard.narration.slice(0, 8)
      : [
        { startSec: 0, endSec: Number((dur * 0.45).toFixed(2)), text: storyboard?.hookText || storyboard?.gameTitle || '직접 플레이 하이라이트!' },
        { startSec: Number((dur * 0.45).toFixed(2)), endSec: dur, text: storyboard?.ctaText || '플레이허브에서 바로 플레이!' }
      ];

    const ttsWavPath = includeTts !== false
      ? await synthesizeKoreanNarrationWav(narrationList, path.join(tmpDir, 'narration.wav'), tmpDir, env)
      : null;

    const writeTxt = (name, content) => {
      const fp = path.join(tmpDir, name);
      fs.writeFileSync(fp, String(content || ''), 'utf8');
      return escapeFilterPath(fp);
    };

    const headlineLine1 = wrapText(storyboard?.topHeadline?.line1 || `${storyboard?.genreLabel || '게임'} 실제 플레이`, 20, 1);
    const headlineLine2 = wrapText(storyboard?.topHeadline?.line2 || storyboard?.gameTitle || '하이라이트 숏폼', 20, 1);
    const topL1File = writeTxt('top_l1.txt', headlineLine1);
    const topL2File = writeTxt('top_l2.txt', headlineLine2);

    // Rescale narration timestamps proportionally if they exceed actual clip duration
    const maxNarrEnd = Math.max(...narrationList.map(n => Number(n.endSec) || 0), dur);
    const timeScale = maxNarrEnd > dur + 0.15 ? dur / maxNarrEnd : 1;
    const narrFiles = narrationList.map((seg, idx) => {
      const st = Math.max(0, (Number(seg.startSec) || 0) * timeScale);
      const en = Math.min(dur, Math.max(st + 0.35, (Number(seg.endSec) || dur) * timeScale));
      return {
        start: st.toFixed(2),
        end: en.toFixed(2),
        file: writeTxt(`narr_${idx}.txt`, wrapText(seg.text || '', 18, 2))
      };
    });

    const fontPath = findFontPath();
    const fontArg = fontPath ? `fontfile='${escapeFilterPath(fontPath)}':` : '';

    const args = ['-y'];
    if (safeStart > 0) args.push('-ss', String(safeStart));
    args.push('-t', String(dur), '-i', inputVideoPath);

    let nextInputIdx = 1;
    let bgmInputIdx = null;
    let ttsInputIdx = null;

    const useOrigAudio = Boolean(srcMeta.hasAudio && keepOriginalAudio !== false);
    if (!useOrigAudio && (bgmFallback !== false || ttsWavPath)) {
      bgmInputIdx = nextInputIdx++;
      const synthExpr =
        '0.09*sin(2*PI*220*t)*(0.5+0.5*sin(2*PI*2*t))' +
        '+0.07*sin(2*PI*330*t)*(0.5+0.5*sin(2*PI*4*t))' +
        '+0.05*sin(2*PI*440*t)*(0.5+0.5*sin(2*PI*1*t))';
      args.push('-f', 'lavfi', '-i', `aevalsrc='${synthExpr}|${synthExpr}':s=44100:d=${dur}`);
    }
    if (ttsWavPath) {
      ttsInputIdx = nextInputIdx++;
      args.push('-i', ttsWavPath);
    }

    const filterParts = [];
    const useCropFill = framingMode === 'crop-fill';

    if (useCropFill) {
      filterParts.push(
        `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${fps},setsar=1[base]`
      );
    } else {
      // Fit-blur (TikTok/Cuts layout): blurred full-bleed background + crisp aspect-preserved gameplay video centered!
      filterParts.push(`[0:v]split=2[vbg][vfg]`);
      filterParts.push(
        `[vbg]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=22:3,eq=brightness=-0.26:saturation=1.2,fps=${fps},setsar=1[bg]`
      );
      filterParts.push(
        `[vfg]scale=704:560:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2:(ow-iw)/2:(oh-ih)/2:color=0x000000,fps=${fps},setsar=1[fg]`
      );
      filterParts.push(`[bg][fg]overlay=(W-w)/2:278+(560-h)/2:shortest=1[base]`);
    }

    const s1End = (dur * 0.33).toFixed(2);
    const s2End = (dur * 0.66).toFixed(2);
    const topBoxOpacity = useCropFill ? '0.78' : '1.0';

    const overlaySteps = [
      `drawbox=x=0:y=0:w=${W}:h=256:color=0x000000@${topBoxOpacity}:t=fill`,
      `drawbox=x=0:y=968:w=${W}:h=312:color=0x000000@0.82:t=fill`,
      `drawtext=${fontArg}textfile='${topL1File}':fontcolor=0xFFFFFF:fontsize=39:x=(w-text_w)/2:y=108:borderw=2:bordercolor=0x000000`,
      `drawtext=${fontArg}textfile='${topL2File}':fontcolor=0xFFE600:fontsize=42:x=(w-text_w)/2:y=166:borderw=3:bordercolor=0x000000`,
      ...narrFiles.map(nf =>
        `drawtext=${fontArg}textfile='${nf.file}':fontcolor=0xFFE600:fontsize=39:line_spacing=5:x=(w-text_w)/2:y=772:borderw=5:bordercolor=0x000000:shadowcolor=0x000000@0.85:shadowx=0:shadowy=4:enable='between(t,${nf.start},${nf.end})'`
      ),
      `drawbox=x=32:y=1254:w=212:h=5:color=0xFFFFFF@0.20:t=fill`,
      `drawbox=x=254:y=1254:w=212:h=5:color=0xFFFFFF@0.20:t=fill`,
      `drawbox=x=476:y=1254:w=212:h=5:color=0xFFFFFF@0.20:t=fill`,
      `drawbox=x=32:y=1254:w=212:h=5:color=0xFFE600@0.98:t=fill:enable='gte(t,0)'`,
      `drawbox=x=254:y=1254:w=212:h=5:color=0xFFE600@0.98:t=fill:enable='gte(t,${s1End})'`,
      `drawbox=x=476:y=1254:w=212:h=5:color=0x4285F4@0.98:t=fill:enable='gte(t,${s2End})'`,
      `fade=t=in:st=0:d=0.2`,
      `fade=t=out:st=${Math.max(0.4, dur - 0.3).toFixed(2)}:d=0.3`
    ];

    filterParts.push(`[base]${overlaySteps.join(',')}[vout]`);

    let hasOutputAudio = true;
    const fadeOutSt = Math.max(0.4, dur - 0.45).toFixed(2);
    if (useOrigAudio && ttsInputIdx !== null) {
      filterParts.push(`[0:a]aresample=44100,aformat=channel_layouts=stereo,volume=0.36[orig_duck]`);
      filterParts.push(`[${ttsInputIdx}:a]aresample=44100,aformat=channel_layouts=stereo,volume=1.6[tts_st]`);
      filterParts.push(`[orig_duck][tts_st]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,afade=t=in:st=0:d=0.15,afade=t=out:st=${fadeOutSt}:d=0.45[aout]`);
    } else if (useOrigAudio) {
      filterParts.push(`[0:a]aresample=44100,aformat=channel_layouts=stereo,afade=t=in:st=0:d=0.15,afade=t=out:st=${fadeOutSt}:d=0.45[aout]`);
    } else if (bgmInputIdx !== null && ttsInputIdx !== null) {
      filterParts.push(`[${bgmInputIdx}:a]volume=0.22[bgm_low]`);
      filterParts.push(`[${ttsInputIdx}:a]aresample=44100,aformat=channel_layouts=stereo,volume=1.55[tts_st]`);
      filterParts.push(`[bgm_low][tts_st]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,afade=t=in:st=0:d=0.15,afade=t=out:st=${fadeOutSt}:d=0.45[aout]`);
    } else if (bgmInputIdx !== null) {
      filterParts.push(`[${bgmInputIdx}:a]afade=t=in:st=0:d=0.2,afade=t=out:st=${fadeOutSt}:d=0.45[aout]`);
    } else if (ttsInputIdx !== null) {
      filterParts.push(`[${ttsInputIdx}:a]aresample=44100,aformat=channel_layouts=stereo,volume=1.45,afade=t=in:st=0:d=0.15,afade=t=out:st=${fadeOutSt}:d=0.45[aout]`);
    } else {
      hasOutputAudio = false;
    }

    args.push('-filter_complex', filterParts.join(';'), '-map', '[vout]');
    if (hasOutputAudio) {
      args.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100');
    } else {
      args.push('-an');
    }
    args.push(
      '-t', String(dur),
      '-r', String(fps),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outputVideoPath
    );

    onProgress(52, ttsWavPath ? '내 촬영 영상 + 자막·한국어 나래이션 9:16 인코딩 중' : '내 촬영 영상 + 자막 9:16 인코딩 중');
    await execFileAsync(ffmpeg.bin, args, {
      timeout: 90000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true
    });

    onProgress(84, '숏폼 MP4 무결성 검증 및 썸네일 추출 중');
    const videoBuf = fs.readFileSync(outputVideoPath);
    const validation = validateVideoBuffer(videoBuf);
    if (!validation.valid) {
      throw Object.assign(new Error('변환된 숏폼 MP4 검증에 실패했습니다.'), { code: validation.reason });
    }

    let posterExt = '.jpg';
    const extracted = outputPosterPath
      ? await extractPosterFromVideo(outputVideoPath, outputPosterPath, env)
      : false;
    if (!extracted && outputPosterPath) {
      posterExt = '.svg';
      const svgPath = outputPosterPath.replace(/\.[^.]+$/, '.svg');
      fs.writeFileSync(svgPath, buildFallbackPosterSvg({
        title: storyboard?.gameTitle,
        genreLabel: storyboard?.genreLabel,
        hookText: storyboard?.hookText
      }), 'utf8');
    }

    const meta = await probeVideoFile(outputVideoPath, env);
    onProgress(98, '마무리 중');
    return {
      videoPath: outputVideoPath,
      posterPath: extracted ? outputPosterPath : (outputPosterPath ? outputPosterPath.replace(/\.[^.]+$/, '.svg') : null),
      posterExt,
      mimeType: validation.mimeType,
      bytes: validation.bytes,
      sha256: validation.sha256,
      durationSec: meta.durationSec || dur,
      width: meta.width || W,
      height: meta.height || H,
      aspectRatio: '9:16',
      hasKoreanTts: Boolean(ttsWavPath),
      sourceAudioKept: useOrigAudio,
      model: ttsWavPath ? 'ffmpeg-creator-video-shortform-tts' : 'ffmpeg-creator-video-shortform'
    };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}
