import sharp from 'sharp';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Optional basename arg, e.g. `node scripts/generate-og.mjs og-image-mock`.
// Defaults to the live og-image.
const name = process.argv[2] || 'og-image';
const svgPath = resolve(__dirname, `../public/${name}.svg`);
const pngPath = resolve(__dirname, `../public/${name}.png`);

const svg = readFileSync(svgPath);

await sharp(svg)
  .resize(1200, 630)
  .flatten({ background: '#ffffff' })
  .png({ compressionLevel: 9 })
  .toFile(pngPath);

console.log(`✓ public/${name}.png generated at 1200×630`);
