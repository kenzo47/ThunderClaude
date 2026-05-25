import { describe, expect, it } from 'vitest';

import { splitQuotedReply } from '../src/background/quoted-reply.js';

describe('splitQuotedReply', () => {
  it('returns the whole body when there is no quoted thread', () => {
    expect(splitQuotedReply('<p>Just a new note</p>')).toEqual({
      bodyHtml: '<p>Just a new note</p>',
      quotedHtml: '',
    });
  });

  it('splits at the Thunderbird reply citation line', () => {
    const body = '<p>Reply text</p>';
    const quoted =
      '<div class="moz-cite-prefix">On 5/25/26, Sam wrote:</div>' +
      '<blockquote type="cite"><p>Earlier</p></blockquote>';
    expect(splitQuotedReply(`${body}${quoted}`)).toEqual({ bodyHtml: body, quotedHtml: quoted });
  });

  it('splits at a bare cite blockquote without a citation prefix', () => {
    const body = '<p>Reply text</p>';
    const quoted = '<blockquote type="cite" cite="mid:1"><p>Earlier</p></blockquote>';
    expect(splitQuotedReply(`${body}${quoted}`)).toEqual({ bodyHtml: body, quotedHtml: quoted });
  });

  it('splits at a forwarded message container', () => {
    const body = '<p>FYI</p>';
    const quoted = '<div class="moz-forward-container"><p>Forwarded</p></div>';
    expect(splitQuotedReply(`${body}${quoted}`)).toEqual({ bodyHtml: body, quotedHtml: quoted });
  });

  it('splits at a gmail-style quoted thread', () => {
    const body = '<p>Reply text</p>';
    const quoted =
      '<div class="gmail_quote"><blockquote class="gmail_quote">Earlier</blockquote></div>';
    expect(splitQuotedReply(`${body}${quoted}`)).toEqual({ bodyHtml: body, quotedHtml: quoted });
  });

  it('uses the earliest boundary so the citation line stays with the quote', () => {
    const body = '<p>Reply</p>';
    const quoted =
      '<div class="moz-cite-prefix">On ..., wrote:</div>' +
      '<blockquote type="cite"><p>Earlier</p></blockquote>';
    const result = splitQuotedReply(`${body}${quoted}`);
    expect(result.bodyHtml).toBe(body);
    expect(result.quotedHtml.startsWith('<div class="moz-cite-prefix">')).toBe(true);
  });

  it('handles non-string input', () => {
    expect(splitQuotedReply(undefined)).toEqual({ bodyHtml: '', quotedHtml: '' });
    expect(splitQuotedReply(null)).toEqual({ bodyHtml: '', quotedHtml: '' });
  });
});
