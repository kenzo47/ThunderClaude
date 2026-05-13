import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const EXTENSION_PAGES = [
  'src/onboarding/welcome.html',
  'src/options/options.html',
  'src/popup/popup.html',
];

const SOURCE_FILES = [
  'src/background/index.js',
  'src/background/inline-media.js',
  'src/background/options-router.js',
  'src/background/rewrite.js',
  'src/lib/i18n.js',
  'src/lib/sanitize.js',
  'src/onboarding/welcome.js',
  'src/options/options.js',
  'src/popup/popup.js',
];

async function readProjectFile(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
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
    for (const file of SOURCE_FILES) {
      const source = await readProjectFile(file);

      expect(source, file).not.toMatch(/\binnerHTML\s*=/);
      expect(source, file).not.toMatch(/\binsertAdjacentHTML\s*\(/);
      expect(source, file).not.toMatch(/\beval\s*\(/);
      expect(source, file).not.toMatch(/\bnew\s+Function\b/);
    }
  });
});
