import { existsSync } from 'node:fs';
import { cp, mkdir, rm } from 'node:fs/promises';

const rootDir = new URL('../', import.meta.url);
const distDir = new URL('dist/', rootDir);
const pathsToCopy = ['manifest.json', 'icons', 'src'];

await rm(distDir, { force: true, recursive: true });
await mkdir(distDir, { recursive: true });

for (const path of pathsToCopy) {
  const source = new URL(path, rootDir);
  if (existsSync(source)) {
    await cp(source, new URL(path, distDir), { recursive: true });
  }
}

console.log('Prepared dist/ extension files.');
