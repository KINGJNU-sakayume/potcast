/**
 * Writes board/sample.json: the manifest `buildBoardTiles` makes from invented records (src/board/fixtures.ts).
 *   npm run board:sample
 * A test fails when the file and the function disagree, so run this after changing either.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildBoardTiles } from '../src/board/buildBoardTiles';
import { SAMPLE_NOW, sampleCovers, sampleData } from '../src/board/fixtures';

const manifest = buildBoardTiles({ data: sampleData(), covers: sampleCovers, accents: { ['a'.repeat(22)]: { h: 24, s: 0.62 } } }, SAMPLE_NOW);
writeFileSync(join(import.meta.dirname, '../board/sample.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`board/sample.json: ${manifest.tiles.length} tiles`);
