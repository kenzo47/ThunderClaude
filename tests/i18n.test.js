import { describe, expect, it } from 'vitest';

import { message } from '../src/lib/i18n.js';

describe('i18n helper', () => {
  it('returns localized messages from the extension API', () => {
    const calls = [];
    const i18n = {
      getMessage(name, substitutions) {
        calls.push({ name, substitutions });
        return 'Localized text';
      },
    };

    expect(message('extensionName', ['value'], { i18n })).toBe('Localized text');
    expect(calls).toEqual([
      {
        name: 'extensionName',
        substitutions: ['value'],
      },
    ]);
  });

  it('falls back to the message key when no translation is available', () => {
    expect(message('missingKey', null, { i18n: { getMessage: () => '' } })).toBe('missingKey');
    expect(message('', null, { i18n: null })).toBe('');
  });
});
