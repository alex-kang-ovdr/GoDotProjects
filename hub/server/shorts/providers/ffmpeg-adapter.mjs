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
    const durationSec = Number(parsed.format?.duration || vStream?.duration || 0);
    return {
      durationSec: Number.isFinite(durationSec) && durationSec > 0 ? Number(durationSec.toFixed(2)) : 0,
      width: Number(vStream?.width || 720),
      height: Number(vStream?.height || 1280)
    };
  } catch {
    return { durationSec: 8, width: 720, height: 1280 };
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

export async function renderMotionShortsWithFfmpeg({
  storyboard,
  keyframes = [],
  stylePreset = 'cinematic',
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

  const style = STYLE_PRESET_MAP[stylePreset] || STYLE_PRESET_MAP.cinematic;
  const dur = Math.max(5, Math.min(12, Number(durationSec) || 8));
  const fps = 30;
  const W = 720;
  const H = 1280;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-shorts-'));

  try {
    onProgress(22, '키프레임 및 자막 에셋 준비 중');
    const validFrames = [];
    for (let i = 0; i < Math.min(3, keyframes.length); i++) {
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

    // Write UTF-8 textfiles for FFmpeg drawtext (prevents escaping issues with Korean/Unicode)
    const scenes = Array.isArray(storyboard?.scenes) && storyboard.scenes.length >= 3
      ? storyboard.scenes
      : [
        { startSec: 0, endSec: dur * 0.3, headline: storyboard?.hookText || '지금 바로 플레이!', subline: storyboard?.gameTitle || 'PlayHub' },
        { startSec: dur * 0.3, endSec: dur * 0.72, headline: storyboard?.highlightText || '설치 없이 즉시 실행', subline: storyboard?.genreLabel || '웹 게임' },
        { startSec: dur * 0.72, endSec: dur, headline: storyboard?.ctaText || 'PLAY HUB에서 지금 무료 플레이', subline: storyboard?.gameTitle || 'PlayHub' }
      ];

    const writeTxt = (name, content) => {
      const fp = path.join(tmpDir, name);
      fs.writeFileSync(fp, String(content || ''), 'utf8');
      return escapeFilterPath(fp);
    };

    const badgeFile = writeTxt('badge.txt', `PLAY HUB SHORTS · ${storyboard?.genreLabel || 'GAME'}`);
    const titleFile = writeTxt('title.txt', wrapText(storyboard?.gameTitle || 'PlayForge Game', 15, 2));
    const s1HeadFile = writeTxt('s1h.txt', wrapText(scenes[0]?.headline || '', 18, 2));
    const s2HeadFile = writeTxt('s2h.txt', wrapText(scenes[1]?.headline || '', 20, 2));
    const s2SubFile = writeTxt('s2s.txt', wrapText(scenes[1]?.subline || '', 26, 1));
    const s3HeadFile = writeTxt('s3h.txt', wrapText(scenes[2]?.headline || 'PLAY HUB에서 지금 무료 플레이', 20, 2));
    const tagsLine = Array.isArray(storyboard?.hashtags) ? storyboard.hashtags.slice(0, 3).join(' ') : '#PlayHub #PlayForge';
    const tagsFile = writeTxt('tags.txt', tagsLine);

    const fontPath = findFontPath();
    const fontArg = fontPath ? `fontfile='${escapeFilterPath(fontPath)}':` : '';

    const args = ['-y'];
    const filterParts = [];

    if (validFrames.length > 0) {
      // Multi-keyframe or single-keyframe vertical Shorts pipeline
      const segDur = dur / validFrames.length;
      const segFrames = Math.max(30, Math.ceil(segDur * fps));

      for (let i = 0; i < validFrames.length; i++) {
        args.push('-loop', '1', '-t', String(segDur + 0.4), '-i', validFrames[i]);
      }

      const zoomExpr = cameraMotion === 'orbit-pan'
        ? '1.08'
        : cameraMotion === 'slowmo-hero'
          ? 'min(zoom+0.0007,1.16)'
          : 'min(zoom+0.0014,1.22)';
      const xExpr = cameraMotion === 'orbit-pan'
        ? `iw*0.04*sin(on/${segFrames}*PI)`
        : 'iw/2-(iw/zoom/2)';
      const yExpr = 'ih/2-(ih/zoom/2)';

      for (let i = 0; i < validFrames.length; i++) {
        // Blurred full-bleed 9:16 vertical backdrop + sharp zoomed gameplay showcase card
        filterParts.push(
          `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=20:3,eq=brightness=-0.22:saturation=1.25,setsar=1[bg${i}]`
        );
        filterParts.push(
          `[${i}:v]scale=960:-2:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2:(ow-iw)/2:(oh-ih)/2:color=${style.bgHex},zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${segFrames}:s=664x460:fps=${fps},setsar=1[fg${i}]`
        );
        filterParts.push(
          `[bg${i}][fg${i}]overlay=(W-w)/2:(H-h)/2-20:shortest=1,trim=duration=${segDur.toFixed(3)},setpts=PTS-STARTPTS[seg${i}]`
        );
      }

      if (validFrames.length === 1) {
        filterParts.push(`[seg0]copy[base]`);
      } else {
        const inputs = validFrames.map((_, i) => `[seg${i}]`).join('');
        filterParts.push(`${inputs}concat=n=${validFrames.length}:v=1:a=0,trim=duration=${dur},setpts=PTS-STARTPTS[base]`);
      }
    } else {
      // Stylized procedural studio motion canvas when no raster keyframe is supplied
      args.push('-f', 'lavfi', '-i', `color=c=${style.bgHex}:s=${W}x${H}:r=${fps}:d=${dur}`);
      filterParts.push(
        `[0:v]drawbox=x=0:y=0:w=${W}:h=420:color=${style.glowHex}@0.28:t=fill,` +
        `drawbox=x=36:y=380:w=${W - 72}:h=460:color=${style.glowHex}@0.22:t=fill,` +
        `drawbox=x=44:y=388:w=${W - 88}:h=444:color=0xFFFFFF@0.12:t=2,` +
        `drawbox=x=0:y=860:w=${W}:h=420:color=0x000000@0.42:t=fill[base]`
      );
    }

    // Add synthesized upbeat arcade/electronic soundtrack via aevalsrc (stereo 44.1kHz)
    const audioInputIdx = validFrames.length > 0 ? validFrames.length : 1;
    const synthExpr =
      '0.12*sin(2*PI*220*t)*(0.5+0.5*sin(2*PI*2*t))' +
      '+0.09*sin(2*PI*330*t)*(0.5+0.5*sin(2*PI*4*t))' +
      '+0.07*sin(2*PI*440*t)*(0.5+0.5*sin(2*PI*1*t))' +
      '+0.05*sin(2*PI*110*t)';
    args.push('-f', 'lavfi', '-i', `aevalsrc='${synthExpr}|${synthExpr}':s=44100:d=${dur}`);

    const s1End = Number(scenes[0]?.endSec ?? dur * 0.28).toFixed(2);
    const s2End = Number(scenes[1]?.endSec ?? dur * 0.72).toFixed(2);

    // Sleek dark top/bottom scrims + progress bar + 3-scene timed kinetic typography
    const overlayChain = [
      `drawbox=x=0:y=0:w=${W}:h=290:color=0x090D1A@0.68:t=fill`,
      `drawbox=x=0:y=${H - 350}:w=${W}:h=350:color=0x090D1A@0.78:t=fill`,
      // Top PlayHub Shorts badge pill
      `drawbox=x=44:y=58:w=340:h=46:color=${style.glowHex}@0.92:t=fill`,
      `drawtext=${fontArg}textfile='${badgeFile}':fontcolor=white:fontsize=20:x=64:y=70`,
      // Persistent Game Title
      `drawtext=${fontArg}textfile='${titleFile}':fontcolor=white:fontsize=46:line_spacing=8:x=44:y=128:shadowcolor=black@0.75:shadowx=0:shadowy=3`,
      // Scene 1: Hook banner (0..s1End)
      `drawbox=x=44:y=964:w=${W - 88}:h=118:color=${style.glowHex}@0.88:t=fill:enable='between(t,0,${s1End})'`,
      `drawtext=${fontArg}textfile='${s1HeadFile}':fontcolor=white:fontsize=32:line_spacing=6:x=(w-text_w)/2:y=996:enable='between(t,0,${s1End})'`,
      // Scene 2: Gameplay highlight callout (s1End..s2End)
      `drawtext=${fontArg}textfile='${s2HeadFile}':fontcolor=white:fontsize=30:line_spacing=8:x=44:y=960:shadowcolor=black@0.8:shadowx=0:shadowy=2:enable='between(t,${s1End},${s2End})'`,
      `drawtext=${fontArg}textfile='${s2SubFile}':fontcolor=0xB4C5FF:fontsize=22:x=44:y=1066:enable='between(t,${s1End},${s2End})'`,
      // Scene 3: PlayHub CTA Finale (s2End..dur)
      `drawbox=x=44:y=964:w=${W - 88}:h=110:color=0x004AC6@0.96:t=fill:enable='gte(t,${s2End})'`,
      `drawtext=${fontArg}textfile='${s3HeadFile}':fontcolor=white:fontsize=30:line_spacing=6:x=(w-text_w)/2:y=1002:enable='gte(t,${s2End})'`,
      // Hashtags footer + 3-scene chapter progress bar
      `drawtext=${fontArg}textfile='${tagsFile}':fontcolor=0xDBE1FF:fontsize=21:x=44:y=1142`,
      `drawbox=x=44:y=1212:w=202:h=8:color=0xFFFFFF@0.22:t=fill`,
      `drawbox=x=259:y=1212:w=202:h=8:color=0xFFFFFF@0.22:t=fill`,
      `drawbox=x=474:y=1212:w=202:h=8:color=0xFFFFFF@0.22:t=fill`,
      `drawbox=x=44:y=1212:w=202:h=8:color=${style.glowHex}@0.98:t=fill:enable='gte(t,0)'`,
      `drawbox=x=259:y=1212:w=202:h=8:color=${style.glowHex}@0.98:t=fill:enable='gte(t,${s1End})'`,
      `drawbox=x=474:y=1212:w=202:h=8:color=0x004AC6@0.98:t=fill:enable='gte(t,${s2End})'`,
      `fade=t=in:st=0:d=0.35`,
      `fade=t=out:st=${Math.max(0.5, dur - 0.4).toFixed(2)}:d=0.4`
    ].join(',');

    filterParts.push(`[base]${overlayChain}[vout]`);
    filterParts.push(
      `[${audioInputIdx}:a]afade=t=in:st=0:d=0.35,afade=t=out:st=${Math.max(0.5, dur - 0.6).toFixed(2)}:d=0.6[aout]`
    );

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

    onProgress(52, '9:16 H.264 쇼츠 영상 인코딩 중');
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
      model: 'ffmpeg-9x16-director-v1'
    };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}
