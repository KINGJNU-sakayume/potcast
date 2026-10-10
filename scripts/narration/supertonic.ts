import { readFile } from 'node:fs/promises';
import path from 'node:path';
import * as ort from 'onnxruntime-node';
import { splitUtterances } from '../../src/episode/speechText';
import { maxChunkLength, prepareText, textIds } from './text';

/**
 * Supertonic 3 (Supertone's on-device text-to-speech model) on ONNX Runtime
 * for Node: a port of the reference implementation in
 * supertone-oss-archive/supertonic (web/helper.js and nodejs/helper.js, MIT).
 *
 * Four networks run in turn: a duration predictor says how long the line
 * lasts, a text encoder turns the characters into embeddings, a vector
 * estimator denoises a latent in a fixed number of steps (flow matching), and
 * a vocoder turns the latent into 44.1 kHz audio. The voice is a pair of
 * style tensors read from `voice_styles/<name>.json`.
 */

interface SupertonicConfig {
  ae: { sample_rate: number; base_chunk_size: number };
  ttl: { chunk_compress_factor: number; latent_dim: number };
}

interface StyleFile {
  style_ttl: { dims: number[]; data: unknown[] };
  style_dp: { dims: number[]; data: unknown[] };
}

interface Style {
  ttl: ort.Tensor;
  dp: ort.Tensor;
}

export interface SynthesisOptions {
  language: string;
  /** Denoising steps: more is slower and a little cleaner. */
  steps: number;
  /** 1.05 is the model's default pace; higher is faster. */
  speed: number;
  /** Fixes the noise the voice is made from, so the same line comes out the same way again. */
  seed: number;
}

export interface Synthesis {
  samples: Float32Array;
  sampleRate: number;
  /** Characters the model has no token for; they were left out. */
  unknown: string[];
}

/** A small seeded generator (mulberry32) with a normal distribution on top (Box–Muller). */
function gaussian(seed: number): () => number {
  let state = seed >>> 0;
  const uniform = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(Math.max(1e-4, uniform()))) * Math.cos(2 * Math.PI * uniform());
}

const SILENCE_BETWEEN_CHUNKS_S = 0.3;

export class Supertonic {
  private readonly styles = new Map<string, Promise<Style>>();

  private constructor(
    private readonly dir: string,
    private readonly config: SupertonicConfig,
    private readonly indexer: readonly number[],
    private readonly durationPredictor: ort.InferenceSession,
    private readonly textEncoder: ort.InferenceSession,
    private readonly vectorEstimator: ort.InferenceSession,
    private readonly vocoder: ort.InferenceSession,
  ) {}

  /** `dir` holds `onnx/` and `voice_styles/` as in the model repository. */
  static async load(dir: string, threads?: number): Promise<Supertonic> {
    const onnx = path.join(dir, 'onnx');
    const config = JSON.parse(await readFile(path.join(onnx, 'tts.json'), 'utf8')) as SupertonicConfig;
    const indexer = JSON.parse(await readFile(path.join(onnx, 'unicode_indexer.json'), 'utf8')) as number[];
    const options: ort.InferenceSession.SessionOptions = { graphOptimizationLevel: 'all', ...(threads ? { intraOpNumThreads: threads } : {}) };
    const session = (name: string) => ort.InferenceSession.create(path.join(onnx, name), options);
    // One at a time: together they would peak at several times the memory.
    const durationPredictor = await session('duration_predictor.onnx');
    const textEncoder = await session('text_encoder.onnx');
    const vectorEstimator = await session('vector_estimator.onnx');
    const vocoder = await session('vocoder.onnx');
    return new Supertonic(dir, config, indexer, durationPredictor, textEncoder, vectorEstimator, vocoder);
  }

  get sampleRate(): number {
    return this.config.ae.sample_rate;
  }

  /** The names of each network's inputs and outputs, for telling a different model apart. */
  describe(): string {
    const io = (name: string, session: ort.InferenceSession) => `${name}: (${session.inputNames.join(', ')}) → (${session.outputNames.join(', ')})`;
    return [
      io('duration_predictor', this.durationPredictor),
      io('text_encoder', this.textEncoder),
      io('vector_estimator', this.vectorEstimator),
      io('vocoder', this.vocoder),
      `sample rate ${this.sampleRate}, latent ${this.config.ttl.latent_dim}×${this.config.ttl.chunk_compress_factor}, chunk ${this.config.ae.base_chunk_size}`,
    ].join('\n');
  }

  private style(voice: string): Promise<Style> {
    let style = this.styles.get(voice);
    if (!style) {
      style = readFile(path.join(this.dir, 'voice_styles', `${voice}.json`), 'utf8').then((raw) => {
        const file = JSON.parse(raw) as StyleFile;
        const tensor = (part: StyleFile['style_ttl']) => new ort.Tensor('float32', Float32Array.from(part.data.flat(Infinity) as number[]), part.dims);
        return { ttl: tensor(file.style_ttl), dp: tensor(file.style_dp) };
      });
      this.styles.set(voice, style);
    }
    return style;
  }

  /** Says `text` in `voice`. A text longer than the model takes at once is said in parts with a short pause between. */
  async synthesize(text: string, voice: string, options: SynthesisOptions): Promise<Synthesis> {
    const style = await this.style(voice);
    const limit = maxChunkLength(options.language);
    const chunks = text.length <= limit ? [text] : splitUtterances(text, limit);
    const parts: Float32Array[] = [];
    const unknown: string[] = [];
    for (const [index, chunk] of chunks.entries()) {
      const part = await this.infer(chunk, style, { ...options, seed: options.seed + index });
      if (index > 0) parts.push(new Float32Array(Math.floor(SILENCE_BETWEEN_CHUNKS_S * this.sampleRate)));
      parts.push(part.samples);
      unknown.push(...part.unknown);
    }
    const samples = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      samples.set(part, offset);
      offset += part.length;
    }
    return { samples, sampleRate: this.sampleRate, unknown };
  }

  private async infer(text: string, style: Style, { language, steps, speed, seed }: SynthesisOptions): Promise<{ samples: Float32Array; unknown: string[] }> {
    const { ids, unknown } = textIds(prepareText(text, language), this.indexer);
    const length = ids.length;
    const textIdsTensor = new ort.Tensor('int64', BigInt64Array.from(ids, (id) => BigInt(id)), [1, length]);
    const textMask = new ort.Tensor('float32', new Float32Array(length).fill(1), [1, 1, length]);

    const predicted = await this.durationPredictor.run({ text_ids: textIdsTensor, style_dp: style.dp, text_mask: textMask });
    const seconds = Number((predicted.duration!.data as Float32Array)[0]) / speed;
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`The duration predictor returned ${seconds}s for "${text}".`);

    const encoded = await this.textEncoder.run({ text_ids: textIdsTensor, style_ttl: style.ttl, text_mask: textMask });
    const textEmbedding = encoded.text_emb!;

    const { sample_rate: sampleRate, base_chunk_size: baseChunk } = this.config.ae;
    const { chunk_compress_factor: compress, latent_dim: latentDim } = this.config.ttl;
    const wavLength = Math.floor(seconds * sampleRate);
    const chunkSize = baseChunk * compress;
    const latentLength = Math.max(1, Math.floor((wavLength + chunkSize - 1) / chunkSize));
    const channels = latentDim * compress;
    const shape = [1, channels, latentLength];

    const normal = gaussian(seed);
    let latent = new Float32Array(channels * latentLength);
    for (let i = 0; i < latent.length; i += 1) latent[i] = normal();
    const latentMask = new ort.Tensor('float32', new Float32Array(latentLength).fill(1), [1, 1, latentLength]);
    const totalStep = new ort.Tensor('float32', Float32Array.of(steps), [1]);

    for (let step = 0; step < steps; step += 1) {
      const estimated = await this.vectorEstimator.run({
        noisy_latent: new ort.Tensor('float32', latent, shape),
        text_emb: textEmbedding,
        style_ttl: style.ttl,
        latent_mask: latentMask,
        text_mask: textMask,
        current_step: new ort.Tensor('float32', Float32Array.of(step), [1]),
        total_step: totalStep,
      });
      latent = Float32Array.from(estimated.denoised_latent!.data as Float32Array);
    }

    const voiced = await this.vocoder.run({ latent: new ort.Tensor('float32', latent, shape) });
    const wav = voiced.wav_tts!.data as Float32Array;
    return { samples: Float32Array.from(wav.subarray(0, Math.min(wav.length, wavLength))), unknown };
  }
}
