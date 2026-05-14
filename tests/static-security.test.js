import { readdir, readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const EXTENSION_PAGES = [
  'src/onboarding/welcome.html',
  'src/options/options.html',
  'src/popup/popup.html',
];

const SRC_ROOT = new URL('../src/', import.meta.url);

async function readProjectFile(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

async function listSourceFiles(directory = SRC_ROOT, pathPrefix = 'src') {
  const entries = await readdir(directory, { withFileTypes: true });
  const sortedEntries = entries.toSorted((left, right) => left.name.localeCompare(right.name));
  const files = [];

  for (const entry of sortedEntries) {
    const childPath = `${pathPrefix}/${entry.name}`;

    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(new URL(`${entry.name}/`, directory), childPath)));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(childPath);
    }
  }

  return files;
}

function readCspContent(html) {
  return html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? '';
}

describe('static extension security', () => {
  it('keeps extension pages on a strict self-only CSP', async () => {
    for (const page of EXTENSION_PAGES) {
      const csp = readCspContent(await readProjectFile(page));

      expect(csp).toBe(
        "default-src 'self'; connect-src 'none'; object-src 'none'; script-src 'self'; style-src 'self'"
      );
    }
  });

  it('does not use unsafe html injection or dynamic code execution', async () => {
    for (const file of await listSourceFiles()) {
      const source = await readProjectFile(file);

      expect(source, file).not.toMatch(/\binnerHTML\s*=/);
      expect(source, file).not.toMatch(/\binsertAdjacentHTML\s*\(/);
      expect(source, file).not.toMatch(/\beval\s*\(/);
      expect(source, file).not.toMatch(/\bnew\s+Function\b/);
    }
  });

  it('routes extension warnings through the redacting logger', async () => {
    for (const file of (await listSourceFiles()).filter((path) => path !== 'src/lib/log.js')) {
      const source = await readProjectFile(file);

      expect(source, file).not.toMatch(/\bconsole\.(?:warn|error)\s*\(/);
    }
  });

  it('does not open direct network channels outside provider plumbing', async () => {
    for (const file of await listSourceFiles()) {
      const source = await readProjectFile(file);

      expect(source, file).not.toMatch(/\bfetch\s*\(/);
      expect(source, file).not.toMatch(/\bXMLHttpRequest\b/);
      expect(source, file).not.toMatch(/\bWebSocket\b/);
      expect(source, file).not.toMatch(/\bEventSource\b/);
      expect(source, file).not.toMatch(/\bsendBeacon\s*\(/);
    }
  });

  it('keeps compose body writes in the rewrite orchestrator', async () => {
    for (const file of await listSourceFiles()) {
      const source = await readProjectFile(file);

      if (file === 'src/background/rewrite.js') {
        expect(source, file).toMatch(/\bcompose\.setComposeDetails\s*\(/);
      } else {
        expect(source, file).not.toMatch(/\bcompose\.setComposeDetails\s*\(/);
      }
    }
  });
});
