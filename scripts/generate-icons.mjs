// Generate PNG icons from the master SVG.
// Run via Docker: `docker run --rm -v $PWD:/app -w /app node:22-alpine sh -c "npm i sharp --no-save && node scripts/generate-icons.mjs"`
//
// Outputs into public/icons/{16,32,48,128,512}.png.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SRC = path.join(REPO_ROOT, 'assets/icon-master.svg');
const OUT_DIR = path.join(REPO_ROOT, 'public/icons');
const SIZES = [16, 32, 48, 128, 512];

async function main() {
  const svg = await fs.readFile(SRC);
  await fs.mkdir(OUT_DIR, { recursive: true });
  for (const size of SIZES) {
    const out = path.join(OUT_DIR, `${size}.png`);
    await sharp(svg)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(out);
    const stat = await fs.stat(out);
    console.log(`✓ ${out}  (${stat.size} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
