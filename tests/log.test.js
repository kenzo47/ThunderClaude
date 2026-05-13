import { describe, expect, it } from 'vitest';

import { warn } from '../src/lib/log.js';

describe('log helper', () => {
  it('redacts known key patterns and truncates long messages', () => {
    const calls = [];

    warn(
      'context',
      {
        code: 'authentication_error',
        message: `bad key sk-test-fake-key-do-not-use ${'x'.repeat(220)}`,
      },
      {
        consoleImpl: {
          warn(...args) {
            calls.push(args);
          },
        },
      }
    );

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('context');
    expect(calls[0][1]).toMatchObject({
      code: 'authentication_error',
    });
    expect(calls[0][1].message).toContain('[redacted]');
    expect(calls[0][1].message).not.toContain('sk-test-fake-key-do-not-use');
    expect(calls[0][1].message.length).toBeLessThanOrEqual(163);
  });
});
