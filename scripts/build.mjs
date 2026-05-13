import { existsSync } from 'node:fs';
import { cp, mkdir, rm } from 'node:fs/promises';

const rootDir = new URL('../', import.meta.url);
const distDir = new URL('dist/', rootDir);
const manifestFile = new URL('manifest.json', rootDir);

await rm(distDir, { force: true, recursive: true });
await mkdir(distDir, { recursive: true });

if (existsSync(manifestFile)) {
  await cp(manifestFile, new URL('manifest.json', distDir));
  console.log('Created dist/ with manifest.json');
} else {
  console.log('No manifest.json yet; prepared empty dist/ for the scaffold.');
}
