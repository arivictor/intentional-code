import sharp from 'sharp';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(__dirname, '../public/og-image.svg');
const pngPath = resolve(__dirname, '../public/og-image.png');

const svg = readFileSync(svgPath);

await sharp(svg)
  .resize(1200, 630)
  .flatten({ background: '#ffffff' })
  .png({ compressionLevel: 9 })
  .toFile(pngPath);

console.log('✓ public/og-image.png generated at 1200×630');
