import { describe, expect, it } from 'vitest';
import { CLAUSE_PAUSE_MS, encodeMp3, finishClip, limit, measure, MP3_BITRATE, pauseAfter, SENTENCE_PAUSE_MS } from './audio';

const RATE = 44_100;
const frames = (ms: number) => Math.round((ms / 1000) * RATE);

/** Silence, a tone, silence — with a rumble far below any voice running under all of it. */
function recording(options: { toneHz?: number; level?: number; rumble?: number; leadMs?: number; toneMs?: number; trailMs?: number } = {}): Float32Array {
  const { toneHz = 220, level = 0.05, rumble = 0, leadMs = 200, toneMs = 1000, trailMs = 400 } = options;
  const samples = new Float32Array(frames(leadMs + toneMs + trailMs));
  for (let i = 0; i < samples.length; i += 1) {
    const inTone = i >= frames(leadMs) && i < frames(leadMs + toneMs);
    samples[i] = (inTone ? level * Math.sin((2 * Math.PI * toneHz * i) / RATE) : 0) + rumble * Math.sin((2 * Math.PI * 20 * i) / RATE);
  }
  return samples;
}

describe('finishing a clip', () => {
  it('trims the silence before the voice and leaves the pause asked for after it', () => {
    const clip = finishClip(recording(), RATE, 260);
    // 30 ms of lead-in, the second of sound, 260 ms of pause.
    expect(clip.ms).toBeGreaterThan(1000 + 30 + 260 - 15);
    expect(clip.ms).toBeLessThan(1000 + 30 + 260 + 15);
    const tail = clip.samples.subarray(clip.samples.length - frames(200));
    expect(Math.max(...tail.map(Math.abs))).toBe(0);
    expect(finishClip(recording(), RATE, 150).ms).toBeLessThan(clip.ms - 100);
  });

  it('brings quiet and loud takes to the same loudness without clipping', () => {
    const quiet = finishClip(recording({ level: 0.08 }), RATE);
    const loud = finishClip(recording({ level: 0.6 }), RATE);
    expect(quiet.rms).toBeGreaterThan(0.12);
    expect(quiet.rms).toBeLessThan(0.15);
    expect(Math.abs(quiet.rms - loud.rms)).toBeLessThan(0.01);
    expect(quiet.peak).toBeLessThanOrEqual(0.89);
    expect(loud.peak).toBeLessThanOrEqual(0.89);
  });

  it('reaches that loudness even for a take with sharp peaks, by easing the peaks down', () => {
    // A steady tone with a much louder click every 100 ms: levelled by its peaks alone it would end up far too quiet.
    const peaky = recording({ level: 0.05 });
    for (let i = frames(250); i < frames(1150); i += frames(100)) peaky[i] = 0.9;
    const clip = finishClip(peaky, RATE);
    // Scaled down as a whole until its clicks fit, it would be at about 0.035.
    expect(clip.rms).toBeGreaterThan(0.11);
    expect(clip.peak).toBeLessThanOrEqual(0.89 + 1e-6);
  });

  it('starts and ends without a click', () => {
    const { samples } = finishClip(recording({ leadMs: 0, toneHz: 2000 }), RATE);
    expect(Math.abs(samples[0]!)).toBe(0);
    expect(Math.abs(samples[1]!)).toBeLessThan(0.01);
  });

  it('takes out the rumble under the voice and keeps the voice', () => {
    const rumbling = recording({ rumble: 0.02 });
    // Without the filter the rumble would count as sound and nothing would be trimmed.
    const clip = finishClip(rumbling, RATE, 260);
    expect(clip.ms).toBeLessThan(1400);
    const low = finishClip(recording({ toneHz: 100, level: 0.2 }), RATE);
    expect(low.rms).toBeGreaterThan(0.12);
  });

  it('refuses a clip with nothing in it', () => {
    expect(() => finishClip(new Float32Array(RATE), RATE)).toThrow('silent');
  });

  it('measures only the sounding parts', () => {
    const half = new Float32Array(1000);
    half.fill(0.5, 0, 500);
    expect(measure(half)).toEqual({ rms: 0.5, peak: 0.5 });
    expect(measure(new Float32Array(10))).toEqual({ rms: 0, peak: 0 });
  });
});

describe('the limiter', () => {
  it('leaves a signal under the ceiling exactly as it was', () => {
    const quiet = Float32Array.from({ length: 2000 }, (_, i) => 0.5 * Math.sin(i / 7));
    const copy = Float32Array.from(quiet);
    limit(quiet, RATE, 0.89);
    expect(quiet).toEqual(copy);
  });

  it('brings every sample under the ceiling and moves the level smoothly around a peak', () => {
    const samples = new Float32Array(4000).fill(0.5);
    samples[2000] = 1.5;
    samples[0] = 1.2;
    samples[3999] = -1.4;
    limit(samples, RATE, 0.89);
    expect(Math.max(...samples.map(Math.abs))).toBeLessThanOrEqual(0.89 + 1e-6);
    // Far from any peak nothing has changed; next to one the level has already come down part of the way.
    expect(samples[1000]).toBeCloseTo(0.5, 6);
    expect(samples[2000 - 150]!).toBeLessThan(0.5);
    expect(samples[2000 - 150]!).toBeGreaterThan(0.3);
    // No jumps: from one sample to the next the level never moves by more than a few percent.
    for (let i = 1500; i < 2500; i += 1) {
      if (i === 2000 || i === 2001) continue;
      expect(Math.abs(samples[i]! - samples[i - 1]!)).toBeLessThan(0.02);
    }
  });
});

describe('the pause after a clip', () => {
  it('is a sentence\'s after a sentence and shorter after a clause', () => {
    expect(pauseAfter('이야기는 하나죠.')).toBe(SENTENCE_PAUSE_MS);
    expect(pauseAfter('그렇죠?')).toBe(SENTENCE_PAUSE_MS);
    expect(pauseAfter('그건 좀 심했죠. <laugh>')).toBe(SENTENCE_PAUSE_MS);
    expect(pauseAfter('타일러는 이 앨범을 직접 쓰고 프로듀싱했고,')).toBe(CLAUSE_PAUSE_MS);
    expect(pauseAfter('마침표 없이')).toBe(CLAUSE_PAUSE_MS);
  });
});

describe('MP3', () => {
  it('encodes a clip at the constant bitrate', async () => {
    const { samples } = finishClip(recording(), RATE);
    const file = await encodeMp3(samples, RATE);
    // An MPEG audio frame starts with eleven set bits.
    expect(file[0]).toBe(0xff);
    expect(file[1]! & 0xe0).toBe(0xe0);
    const expected = ((samples.length / RATE) * MP3_BITRATE * 1000) / 8;
    expect(file.length).toBeGreaterThan(expected * 0.9);
    expect(file.length).toBeLessThan(expected * 1.15);
    // The encoder is reused: a second clip is as good as the first.
    expect((await encodeMp3(samples, RATE)).length).toBe(file.length);
  });
});
