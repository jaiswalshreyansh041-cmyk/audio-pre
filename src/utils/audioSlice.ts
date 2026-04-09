/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Encode an AudioBuffer to a WAV ArrayBuffer (16-bit PCM). */
export function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numSamples * blockAlign;
  const totalSize = 44 + dataSize;

  const ab = new ArrayBuffer(totalSize);
  const view = new DataView(ab);

  const write = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  write(0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);               // chunk size
  view.setUint16(20, 1, true);                // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);               // bits per sample
  write(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return ab;
}

/** Decode an audio File into an AudioBuffer. */
export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const ctx = new AudioContext();
  try {
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    await ctx.close();
  }
}

/**
 * Return a new AudioBuffer containing only the samples between
 * startSec and endSec.
 */
export function sliceAudioBuffer(
  buffer: AudioBuffer,
  startSec: number,
  endSec: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const start = Math.max(0, Math.floor(startSec * sr));
  const end = Math.min(buffer.length, Math.ceil(endSec * sr));
  const length = Math.max(end - start, 1);

  // OfflineAudioContext can't create detached buffers in all browsers;
  // use a plain object approach instead.
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, length, sr);
  const sliced = ctx.createBuffer(buffer.numberOfChannels, length, sr);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    sliced.copyToChannel(buffer.getChannelData(c).slice(start, end), c);
  }
  return sliced;
}

/** Convert an AudioBuffer slice to a base64-encoded WAV string. */
export function audioBufferToBase64Wav(buffer: AudioBuffer): string {
  const wav = audioBufferToWav(buffer);
  const bytes = new Uint8Array(wav);
  let binary = '';
  // Chunk to avoid call-stack overflow on large segments
  const CHUNK = 8192;
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Convert an AudioBuffer slice to a WAV Blob (for FormData uploads). */
export function audioBufferToBlob(buffer: AudioBuffer): Blob {
  return new Blob([audioBufferToWav(buffer)], { type: 'audio/wav' });
}
