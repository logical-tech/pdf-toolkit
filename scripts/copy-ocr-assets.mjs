// Copies tesseract.js worker, LSTM cores and ita/eng traineddata into public/ocr so OCR runs fully offline.
import { cpSync, mkdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const root = join(dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(join(root, 'package.json'));
const pkgDir = (name, from = require) => dirname(from.resolve(`${name}/package.json`));

const tess = pkgDir('tesseract.js');
// tesseract.js-core is a dependency of tesseract.js, not of the app, so resolve it from there.
const core = pkgDir('tesseract.js-core', createRequire(join(realpathSync(tess), 'package.json')));
const out = join(root, 'public', 'ocr');
mkdirSync(join(out, 'core'), { recursive: true });
mkdirSync(join(out, 'lang'), { recursive: true });

cpSync(join(tess, 'dist', 'worker.min.js'), join(out, 'worker.min.js'));
// ocr.ts pins OEM.LSTM_ONLY, so getCore.js only ever requests these three (wasm is inlined in each .wasm.js).
for (const v of ['lstm', 'simd-lstm', 'relaxedsimd-lstm']) {
  cpSync(join(core, `tesseract-core-${v}.wasm.js`), join(out, 'core', `tesseract-core-${v}.wasm.js`));
}
for (const lang of ['ita', 'eng']) {
  cpSync(join(pkgDir(`@tesseract.js-data/${lang}`), '4.0.0_best_int', `${lang}.traineddata.gz`), join(out, 'lang', `${lang}.traineddata.gz`));
}
console.log(`OCR assets copied to ${out}`);
