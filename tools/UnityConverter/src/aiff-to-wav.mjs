import fs from 'node:fs';
import path from 'node:path';

/**
 * IEEE 754 80-bit extended precision float (big-endian) -> JS number
 */
export function readExtended80BE(buf, offset) {
  const expon = buf.readUInt16BE(offset);
  const hiMant = buf.readUInt32BE(offset + 2);
  const loMant = buf.readUInt32BE(offset + 6);
  const sign = (expon & 0x8000) ? -1 : 1;
  const exp = (expon & 0x7fff) - 16383;
  if (exp === -16383 && hiMant === 0 && loMant === 0) return 0;
  const value = hiMant * Math.pow(2, exp - 31) + loMant * Math.pow(2, exp - 63);
  return sign * value;
}

const SUPPORTED_AIFC_COMPRESSIONS = new Set(['NONE', 'twos']);

/**
 * Parse an AIFF/AIFC buffer and return COMM + raw SSND audio metadata.
 * Rejects compressed/unsupported AIFC compressionType and clamps pcmLength to buf.length.
 */
export function parseAiffBuffer(buf) {
  if (buf.length < 12) {
    throw new Error('AIFF buffer too small');
  }
  const form = buf.toString('ascii', 0, 4);
  const formType = buf.toString('ascii', 8, 12);
  if (form !== 'FORM' || (formType !== 'AIFF' && formType !== 'AIFC')) {
    throw new Error(`Unsupported AIFF header: ${form}/${formType}`);
  }

  let off = 12;
  let comm = null;
  let ssnd = null;

  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32BE(off + 4);
    const dataStart = off + 8;

    if (id === 'COMM') {
      const minCommSize = formType === 'AIFC' ? 22 : 18;
      if (size < minCommSize || dataStart + minCommSize > buf.length) {
        throw new Error(`Truncated ${formType} COMM chunk`);
      }
      const channels = buf.readInt16BE(dataStart);
      const numSampleFrames = buf.readUInt32BE(dataStart + 2);
      const sampleSize = buf.readInt16BE(dataStart + 6);
      const sampleRate = Math.round(readExtended80BE(buf, dataStart + 8));
      const compressionType = formType === 'AIFC'
        ? buf.toString('ascii', dataStart + 18, dataStart + 22)
        : 'NONE';
      if (formType === 'AIFC' && !SUPPORTED_AIFC_COMPRESSIONS.has(compressionType)) {
        throw new Error(`Unsupported AIFC compressionType: ${compressionType}`);
      }
      comm = { channels, numSampleFrames, sampleSize, sampleRate, compressionType };
    } else if (id === 'SSND') {
      if (size < 8 || dataStart + 8 > buf.length) {
        throw new Error('Truncated SSND chunk in AIFF');
      }
      const soundOffset = buf.readUInt32BE(dataStart);
      const blockSize = buf.readUInt32BE(dataStart + 4);
      const pcmStart = dataStart + 8 + soundOffset;
      const chunkEnd = Math.min(buf.length, dataStart + size);
      const pcmLength = Math.max(0, chunkEnd - pcmStart);
      ssnd = { soundOffset, blockSize, pcmStart, pcmLength };
    }

    off += 8 + size + (size % 2);
  }

  if (!comm || !ssnd) {
    throw new Error('Missing COMM or SSND chunk in AIFF');
  }

  return { formType, ...comm, ...ssnd };
}

/**
 * Convert an AIFF/AIFC (8/16/24-bit big-endian signed PCM) Buffer to a Godot-compatible
 * 16-bit little-endian signed PCM WAV Buffer.
 */
export function convertAiffBufferToWav(inputBuf) {
  const info = parseAiffBuffer(inputBuf);
  const { channels, numSampleFrames, sampleSize, sampleRate, pcmStart, pcmLength } = info;

  if (channels <= 0 || sampleRate <= 0) {
    throw new Error(`Invalid AIFF audio parameters: channels=${channels}, sampleRate=${sampleRate}`);
  }
  if (sampleSize !== 8 && sampleSize !== 16 && sampleSize !== 24) {
    throw new Error(`Unsupported AIFF bit depth: ${sampleSize}`);
  }

  const bytesPerSrcSample = sampleSize / 8;
  const actualFrames = Math.min(
    numSampleFrames,
    Math.floor(pcmLength / (bytesPerSrcSample * channels)),
  );
  const totalSamples = actualFrames * channels;
  const dstBits = 16;
  const dstByteRate = sampleRate * channels * (dstBits / 8);
  const dstBlockAlign = channels * (dstBits / 8);
  const dstDataSize = totalSamples * 2;

  const wav = Buffer.alloc(44 + dstDataSize);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + dstDataSize, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16); // PCM fmt chunk size
  wav.writeUInt16LE(1, 20);  // PCM format
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(dstByteRate, 28);
  wav.writeUInt16LE(dstBlockAlign, 32);
  wav.writeUInt16LE(dstBits, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dstDataSize, 40);

  let srcPos = pcmStart;
  let dstPos = 44;

  if (sampleSize === 16) {
    for (let i = 0; i < totalSamples; i++) {
      // Big-endian signed 16 -> Little-endian signed 16
      wav[dstPos] = inputBuf[srcPos + 1];
      wav[dstPos + 1] = inputBuf[srcPos];
      srcPos += 2;
      dstPos += 2;
    }
  } else if (sampleSize === 24) {
    for (let i = 0; i < totalSamples; i++) {
      // Big-endian signed 24 (MSB, MID, LSB) -> top 16 bits in Little-endian (MID, MSB)
      wav[dstPos] = inputBuf[srcPos + 1];
      wav[dstPos + 1] = inputBuf[srcPos];
      srcPos += 3;
      dstPos += 2;
    }
  } else {
    for (let i = 0; i < totalSamples; i++) {
      const s8 = inputBuf.readInt8(srcPos);
      wav.writeInt16LE(s8 << 8, dstPos);
      srcPos += 1;
      dstPos += 2;
    }
  }

  return {
    wav,
    info,
    frames: actualFrames,
    dstBits,
  };
}

/**
 * Convert an AIFF (8/16/24-bit big-endian signed PCM) file to a Godot-compatible
 * 16-bit little-endian signed PCM WAV file.
 */
export function convertAiffFileToWav(inputPath, outputPath) {
  const inputBuf = fs.readFileSync(inputPath);
  const { wav, info, frames, dstBits } = convertAiffBufferToWav(inputBuf);
  const { channels, sampleSize, sampleRate } = info;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, wav);

  return {
    input: path.basename(inputPath),
    output: path.basename(outputPath),
    channels,
    sampleRate,
    srcBits: sampleSize,
    dstBits,
    frames,
    durationSec: Number((frames / sampleRate).toFixed(3)),
    inputBytes: inputBuf.length,
    outputBytes: wav.length,
  };
}
