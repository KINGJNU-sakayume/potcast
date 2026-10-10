import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * The Supertonic 3 model files. Supertone archived the project in 2026; the
 * weights live on at Hugging Face under `supertone-oss-archive`, and the
 * revision is pinned so that every render uses the same model. The model is
 * under the OpenRAIL-M licence (see the README's section on recorded voices).
 */
export const MODEL = {
  repository: 'supertone-oss-archive/supertonic-3',
  revision: 'aafc6e32416a594460b32413efc49d7fe4ce6d46',
} as const;

const NETWORK_FILES = [
  'onnx/tts.json',
  'onnx/unicode_indexer.json',
  'onnx/duration_predictor.onnx',
  'onnx/text_encoder.onnx',
  'onnx/vector_estimator.onnx',
  'onnx/vocoder.onnx',
];

/** Where the model is kept between renders: `SUPERTONIC_DIR`, or a folder in the user's cache. */
export function modelDirectory(): string {
  return process.env.SUPERTONIC_DIR ?? path.join(os.homedir(), '.cache', 'potcast', `supertonic-3-${MODEL.revision.slice(0, 8)}`);
}

async function exists(file: string): Promise<boolean> {
  try {
    return (await stat(file)).size > 0;
  } catch {
    return false;
  }
}

/** Downloads whatever of the model and the given voices is not in `dir` yet (about 400 MB the first time). */
export async function ensureModel(dir: string, voices: readonly string[], log: (line: string) => void): Promise<void> {
  const files = [...NETWORK_FILES, ...voices.map((voice) => `voice_styles/${voice}.json`)];
  for (const file of files) {
    const target = path.join(dir, file);
    if (await exists(target)) continue;
    const url = `https://huggingface.co/${MODEL.repository}/resolve/${MODEL.revision}/${file}`;
    const started = Date.now();
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok || !response.body) throw new Error(`Could not download ${url}: HTTP ${response.status}`);
    await mkdir(path.dirname(target), { recursive: true });
    const partial = `${target}.part`;
    try {
      await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(partial));
      await rename(partial, target);
    } catch (error) {
      await rm(partial, { force: true });
      throw error;
    }
    const megabytes = (await stat(target)).size / 1_000_000;
    log(`downloaded ${file} (${megabytes.toFixed(1)} MB, ${((Date.now() - started) / 1000).toFixed(1)} s)`);
  }
}
