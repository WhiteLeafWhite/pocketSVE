// Explicit assets used by https://svgdb.me/leaders/2808. No game/login endpoints.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'app/src/main/assets/audio');
await fs.mkdir(output, { recursive: true });
const records = [];
// SVGDB labels 001–007 as the seven emotes, 008/009 as match-start variants.
// It has no turn-start / turn-end voice: do not relabel victory/concede as those.
for (const index of ['001', '002', '003', '004', '005', '006', '007', '008']) {
  const url = `https://svgdb.me/assets/audio/jp/vo_2808_000_${index}_0.mp3`;
  const filename = `ralmia-2808-jp-${index}.mp3`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 1000 || !(buffer.subarray(0, 3).toString() === 'ID3' || buffer[0] === 255)) throw new Error(`Unexpected audio: ${url}`);
  await fs.writeFile(path.join(output, filename), buffer);
  records.push({ url, file: `audio/${filename}`, bytes: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex') });
}
await fs.writeFile(path.join(root, 'analysis/svgdb-2808/audio-assets.json'), JSON.stringify(records, null, 2));
console.log(JSON.stringify({ files: records.length, bytes: records.reduce((sum, file) => sum + file.bytes, 0) }));
