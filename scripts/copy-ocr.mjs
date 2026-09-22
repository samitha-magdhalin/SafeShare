import { mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
const target = 'public/ocr';
await mkdir(target, { recursive: true });
await mkdir(join(target, 'core'), { recursive: true });
await copyFile('node_modules/tesseract.js/dist/worker.min.js', join(target, 'worker.min.js'));
await copyFile('node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', join(target, 'eng.traineddata.gz'));
for (const variant of ['lstm', 'simd-lstm', 'relaxedsimd-lstm']) {
  for (const suffix of ['.wasm.js', '.wasm']) {
    const name = `tesseract-core-${variant}${suffix}`;
    await copyFile(join('node_modules/tesseract.js-core', name), join(target, 'core', name));
  }
}
