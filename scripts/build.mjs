import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm } from 'node:fs/promises';

const rootDir = new URL('../', import.meta.url);
const distDir = new URL('dist/', rootDir);
const unpackedDir = new URL('unpacked/', distDir);
const pathsToCopy = ['manifest.json', '_locales', 'icons', 'src'];
const manifest = JSON.parse(await readFile(new URL('manifest.json', rootDir), 'utf8'));
const xpiName = `thunderclaude-${manifest.version}.xpi`;

function runWebExtBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'web-ext',
      [
        'build',
        '--source-dir',
        unpackedDir.pathname,
        '--artifacts-dir',
        distDir.pathname,
        '--filename',
        xpiName,
        '--overwrite-dest',
      ],
      {
        shell: process.platform === 'win32',
        stdio: 'inherit',
      }
    );

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`web-ext build stopped by ${signal}.`));
        return;
      }

      if (code) {
        reject(new Error(`web-ext build exited with code ${code}.`));
        return;
      }

      resolve();
    });
  });
}

await rm(distDir, { force: true, recursive: true });
await mkdir(unpackedDir, { recursive: true });

for (const path of pathsToCopy) {
  const source = new URL(path, rootDir);
  if (existsSync(source)) {
    await cp(source, new URL(path, unpackedDir), { recursive: true });
  }
}

await runWebExtBuild();

console.log(`Prepared dist/unpacked and dist/${xpiName}.`);
