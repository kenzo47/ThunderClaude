import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';

import { extractSelectedHtml, replaceSelectedTextWithHtml } from '../src/background/selection.js';

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

describe('extractSelectedHtml without a DOMParser', () => {
  it('returns the raw selected slice inside one text run', () => {
    expect(extractSelectedHtml(html, 'there\nBob,', { DOMParserImpl: null })).toBe('there\n  Bob,');
  });

  it('rejects a selection that spans markup', () => {
    expect(() => extractSelectedHtml(html, 'Bob,\nsee', { DOMParserImpl: null })).toThrow(
      expect.objectContaining({ code: 'selection_spans_markup' })
    );
  });
});

describe('selection with a DOMParser', () => {
  const { DOMParser } = new JSDOM('').window;
  const opts = { DOMParserImpl: DOMParser };
  const body =
    '<div>Hello there<br>\n  Bob,</div><div>see&nbsp;you <b>soon</b>.</div><p>Bye Bob.</p>';

  it('replaces a selection that spans a line break', () => {
    expect(replaceSelectedTextWithHtml(body, 'there\nBob,', '<em>X</em>', opts)).toBe(
      '<div>Hello <em>X</em></div><div>see&nbsp;you <b>soon</b>.</div><p>Bye Bob.</p>'
    );
  });

  it('replaces a selection that spans blocks, nbsp and inline formatting', () => {
    expect(replaceSelectedTextWithHtml(body, 'Bob,\nsee you soon.', 'Z', opts)).toBe(
      '<div>Hello there<br>\n  </div>Z<p>Bye Bob.</p>'
    );
  });

  it('keeps the selection uniqueness and not-found checks', () => {
    expect(() => replaceSelectedTextWithHtml(body, 'Bob', 'R', opts)).toThrow(
      expect.objectContaining({ code: 'selection_not_unique' })
    );
    expect(() => replaceSelectedTextWithHtml(body, 'Alice', 'R', opts)).toThrow(
      expect.objectContaining({ code: 'selection_not_found' })
    );
  });

  it('extracts the selected fragment including images inside it', () => {
    const withImage = '<p>Hello <img src="cid:a"> Bob,</p><p>bye <b>now</b>.</p>';

    expect(extractSelectedHtml(withImage, 'Hello  Bob,\nbye now.', opts)).toBe(
      '<p>Hello <img src="cid:a"> Bob,</p><p>bye <b>now</b>.</p>'
    );
    expect(extractSelectedHtml(withImage, 'Bob,\nbye', opts)).toBe('<p>Bob,</p><p>bye</p>');
  });

  it('replaces a selection that contains an image with a fragment that carries it back', () => {
    const withImage = '<p>Hello <img src="cid:a"> Bob,</p><p>bye.</p>';

    expect(
      replaceSelectedTextWithHtml(
        withImage,
        'Hello  Bob,',
        '<p>Hi <img src="cid:a"> Robert,</p>',
        opts
      )
    ).toBe('<p>Hi <img src="cid:a"> Robert,</p><p>bye.</p>');
  });
});
