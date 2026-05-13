import { describe, expect, it } from 'vitest';

import { hasRewriteableText, splitAroundInlineMediaTokens } from '../src/lib/html-segments.js';

describe('html segments', () => {
  it('splits html around inline media tokens', () => {
    expect(splitAroundInlineMediaTokens('<p>A[[TC_IMG_1]]B[[TC_IMG_2]]</p>')).toEqual([
      {
        type: 'html',
        value: '<p>A',
      },
      {
        type: 'token',
        value: '[[TC_IMG_1]]',
      },
      {
        type: 'html',
        value: 'B',
      },
      {
        type: 'token',
        value: '[[TC_IMG_2]]',
      },
      {
        type: 'html',
        value: '</p>',
      },
    ]);
  });

  it('detects segments with rewriteable text', () => {
    expect(hasRewriteableText('<p>&nbsp;</p>')).toBe(false);
    expect(hasRewriteableText('</p><p>')).toBe(false);
    expect(hasRewriteableText('<p>Hello</p>')).toBe(true);
  });
});
