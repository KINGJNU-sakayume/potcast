import { createMp3Encoder } from 'wasm-media-encoders';

/**
 * From the model's raw audio to the clip that is published: the rumble below
 * the voice filtered out, silence trimmed off both ends, a pause left after
 * the last word, every clip brought to the same loudness with its peaks kept
 * under full scale, the edges faded so that nothing clicks, and MP3 (which
 * every browser and phone plays).
 *
 * Changing anything here changes how clips sound: bump the `finish` number in
 * NARRATION_ENGINE.id (src/episode/narration/clip.ts) so they are rendered again.
 */

/** Below this a sample counts as silence (about -48 dBFS). */
const SILENCE = 0.004;
const KEEP_HEAD_MS = 30;
/**
 * The pause a clip ends with, as part of the clip: after a finished sentence
 * about as long as the voice itself pauses between two sentences, and shorter
 * where a long sentence was cut at a comma.
 */
export const SENTENCE_PAUSE_MS = 260;
export const CLAUSE_PAUSE_MS = 150;
const FADE_IN_MS = 5;
const FADE_OUT_MS = 25;
/** The vocoder leaves a faint rumble under 50 Hz, also in the pauses; no voice reaches that low. */
const HIGH_PASS_HZ = 60;
/** The loudness clips are brought to: RMS of the voiced parts, about -17 dBFS. */
const TARGET_RMS = 0.14;
/**
 * No sample goes above this (-2 dBFS). The room is for MP3 encoding, which overshoots: with the ceiling at 0.89,
 * four clips of 145 came back from the decoder a sample or two above full scale (the highest at 1.08).
 */
export const PEAK_CEILING = 0.8;
/** How far around a peak the limiter eases the level down and back up. */
const LIMITER_REACH_MS = 5;
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

/** A second-order Butterworth high-pass, run over the samples in place. */
function highPass(samples: Float32Array, sampleRate: number, cutoffHz: number): void {
  const omega = (2 * Math.PI * cutoffHz) / sampleRate;
  const cos = Math.cos(omega);
  const alpha = Math.sin(omega) / Math.SQRT2;
  const a0 = 1 + alpha;
  const b0 = (1 + cos) / 2 / a0;
  const b1 = -(1 + cos) / a0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const x = samples[i]!;
    const y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    samples[i] = y;
  }
}

/**
 * Brings every sample to `ceiling` or under without clipping: around a peak
 * the level is eased down and back up over a few milliseconds, which is not
 * heard, where cutting the peak off would be. Done in place.
 */
export function limit(samples: Float32Array, sampleRate: number, ceiling: number): void {
  const n = samples.length;
  const reach = Math.max(1, Math.round((LIMITER_REACH_MS / 1000) * sampleRate));
  // The gain each sample would need by itself.
  const wanted = new Float32Array(n);
  let over = false;
  for (let i = 0; i < n; i += 1) {
    const level = Math.abs(samples[i]!);
    wanted[i] = level > ceiling ? ceiling / level : 1;
    if (level > ceiling) over = true;
  }
  if (!over) return;

  // The lowest of those within reach on either side (a sliding minimum), so the gain is already down when a peak arrives…
  const lowest = new Float32Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n + reach; i += 1) {
    if (i < n) {
      while (tail > head && wanted[queue[tail - 1]!]! >= wanted[i]!) tail -= 1;
      queue[tail] = i;
      tail += 1;
    }
    const centre = i - reach;
    if (centre < 0) continue;
    while (queue[head]! < centre - reach) head += 1;
    lowest[centre] = wanted[queue[head]!]!;
  }
  // …averaged over the same span, so it moves smoothly. Every value averaged for a sample is at most what that
  // sample needs, so the average is too.
  const running = new Float64Array(n + 1);
  for (let i = 0; i < n; i += 1) running[i + 1] = running[i]! + lowest[i]!;
  for (let i = 0; i < n; i += 1) {
    const from = Math.max(0, i - reach);
    const to = Math.min(n, i + reach + 1);
    samples[i] = samples[i]! * ((running[to]! - running[from]!) / (to - from));
  }
}

/** The pause a clip of `text` ends with. */
export function pauseAfter(text: string): number {
  return /[.!?…]$/.test(text.replace(/\s*<[a-z]+>\s*$/, '')) ? SENTENCE_PAUSE_MS : CLAUSE_PAUSE_MS;
}

export function finishClip(raw: Float32Array, sampleRate: number, tailMs = SENTENCE_PAUSE_MS): FinishedClip {
  const frames = (ms: number) => Math.round((ms / 1000) * sampleRate);
  const input = Float32Array.from(raw);
  // Twice: 24 dB an octave, so 30 Hz is down by more than 20 dB and 100 Hz is left as it was.
  highPass(input, sampleRate, HIGH_PASS_HZ);
  highPass(input, sampleRate, HIGH_PASS_HZ);
  let first = 0;
  while (first < input.length && Math.abs(input[first]!) < SILENCE) first += 1;
  if (first === input.length) throw new Error('The clip is silent.');
  let last = input.length - 1;
  while (last > first && Math.abs(input[last]!) < SILENCE) last -= 1;
  const start = Math.max(0, first - frames(KEEP_HEAD_MS));
  // The fade-out runs over the first moments after the last sound; the rest of the pause is silence.
  const voiced = input.subarray(start, Math.min(input.length, last + 1 + frames(FADE_OUT_MS)));
  const samples = new Float32Array(last + 1 - start + Math.max(frames(tailMs), voiced.length - (last + 1 - start)));
  samples.set(voiced);

  // Every clip to the same loudness; the few peaks that would then go over the ceiling are eased under it.
  const gain = Math.min(TARGET_RMS / measure(samples).rms, MAX_GAIN);
  for (let i = 0; i < voiced.length; i += 1) samples[i] = samples[i]! * gain;
  limit(samples, sampleRate, PEAK_CEILING);

  const fadeIn = Math.min(frames(FADE_IN_MS), voiced.length >> 1);
  const fadeOut = Math.min(frames(FADE_OUT_MS), voiced.length >> 1);
  for (let i = 0; i < voiced.length; i += 1) {
    let level = 1;
    if (i < fadeIn) level *= i / fadeIn;
    const fromEnd = voiced.length - 1 - i;
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
