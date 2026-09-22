import { describe, expect, it } from 'vitest';
import { replaceSelectedTextWithHtml } from '../src/background/selection.js';

// Selection.toString() output for a selection spanning two paragraphs.
const html = '<p>Hello there\n  Bob,</p>\n<p>see&nbsp;you soon.</p><p>Bye Bob.</p>';

describe('replaceSelectedTextWithHtml', () => {
  it('matches a rendered selection whose whitespace differs from the draft HTML', () => {
    expect(
      replaceSelectedTextWithHtml(html, 'there\nBob,', '<em>X</em>', { DOMParserImpl: null })
    ).toBe('<p>Hello <em>X</em></p>\n<p>see&nbsp;you soon.</p><p>Bye Bob.</p>');
  });

  it('matches a selection with collapsed whitespace inside one text node', () => {
    expect(
      replaceSelectedTextWithHtml(html, 'Hello there Bob,', 'Hi', { DOMParserImpl: null })
    ).toBe('<p>Hi</p>\n<p>see&nbsp;you soon.</p><p>Bye Bob.</p>');
  });

  it('still rejects text that is not in the draft', () => {
    expect(() =>
      replaceSelectedTextWithHtml(html, 'Hello Alice', 'x', { DOMParserImpl: null })
    ).toThrow(expect.objectContaining({ code: 'selection_not_found' }));
  });
});
