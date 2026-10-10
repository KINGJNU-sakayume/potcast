import { createMp3Encoder } from 'wasm-media-encoders';

/**
 * From the model's raw audio to the clip that is published: silence trimmed
 * off both ends, every clip brought to the same loudness, the edges faded so
 * that nothing clicks, and MP3 (which every browser and phone plays).
 */

/** Below this a sample counts as silence (about -48 dBFS). */
const SILENCE = 0.004;
const KEEP_HEAD_MS = 30;
const KEEP_TAIL_MS = 90;
const FADE_IN_MS = 5;
const FADE_OUT_MS = 25;
/** The loudness clips are brought to: RMS of the voiced parts, about -17 dBFS. */
const TARGET_RMS = 0.14;
const PEAK_CEILING = 0.97;
const MAX_GAIN = 4;
/** MP3 bitrate in kbit/s: mono speech at 44.1 kHz is clean at this rate. */
export const MP3_BITRATE = 64;

export interface FinishedClip {
  samples: Float32Array;
  /** Length in milliseconds. */
  ms: number;
  /** RMS of the voiced parts and the peak, after levelling. */
  rms: number;
  peak: number;
}

/** Loudness of the parts that are not silence, and the peak. */
export function measure(samples: Float32Array): { rms: number; peak: number } {
  let sum = 0;
  let count = 0;
  let peak = 0;
  for (const sample of samples) {
    const level = Math.abs(sample);
    if (level > peak) peak = level;
    if (level >= SILENCE) {
      sum += sample * sample;
      count += 1;
    }
  }
  return { rms: count > 0 ? Math.sqrt(sum / count) : 0, peak };
}

export function finishClip(input: Float32Array, sampleRate: number): FinishedClip {
  const frames = (ms: number) => Math.round((ms / 1000) * sampleRate);
  let first = 0;
  while (first < input.length && Math.abs(input[first]!) < SILENCE) first += 1;
  if (first === input.length) throw new Error('The clip is silent.');
  let last = input.length - 1;
  while (last > first && Math.abs(input[last]!) < SILENCE) last -= 1;
  const start = Math.max(0, first - frames(KEEP_HEAD_MS));
  const end = Math.min(input.length, last + 1 + frames(KEEP_TAIL_MS));
  const samples = Float32Array.from(input.subarray(start, end));

  const before = measure(samples);
  const gain = Math.min(TARGET_RMS / before.rms, PEAK_CEILING / before.peak, MAX_GAIN);
  const fadeIn = Math.min(frames(FADE_IN_MS), samples.length >> 1);
  const fadeOut = Math.min(frames(FADE_OUT_MS), samples.length >> 1);
  for (let i = 0; i < samples.length; i += 1) {
    let level = gain;
    if (i < fadeIn) level *= i / fadeIn;
    const fromEnd = samples.length - 1 - i;
    if (fromEnd < fadeOut) level *= fromEnd / fadeOut;
    samples[i] = samples[i]! * level;
  }
  const after = measure(samples);
  return { samples, ms: Math.round((samples.length / sampleRate) * 1000), rms: after.rms, peak: after.peak };
}

type Mp3Encoder = Awaited<ReturnType<typeof createMp3Encoder>>;
let encoder: Promise<Mp3Encoder> | null = null;

/** Mono samples in [-1, 1] as a constant-bitrate MP3 file. */
export async function encodeMp3(samples: Float32Array, sampleRate: number): Promise<Uint8Array> {
  encoder ??= createMp3Encoder();
  const mp3 = await encoder;
  mp3.configure({ sampleRate, channels: 1, bitrate: MP3_BITRATE });
  // The encoder hands back views into its own memory: each is copied before the next call.
  const body = Uint8Array.from(mp3.encode([samples]));
  const tail = Uint8Array.from(mp3.finalize());
  const file = new Uint8Array(body.length + tail.length);
  file.set(body, 0);
  file.set(tail, body.length);
  return file;
}
