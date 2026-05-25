import { describe, expect, it } from 'vitest';

import { allowlistHtml } from '../src/lib/sanitize.js';

describe('HTML sanitizer', () => {
  it('keeps allowed formatting elements', () => {
    expect(
      allowlistHtml(
        '<div><p>Hello <strong>there</strong><br><em>friend</em><u>!</u></p>' +
          '<blockquote><h2>Title</h2><ul><li>One</li></ul><ol><li>Two</li></ol></blockquote></div>',
        { DOMParserImpl: null }
      )
    ).toBe(
      '<div><p>Hello <strong>there</strong><br><em>friend</em><u>!</u></p>' +
        '<blockquote><h2>Title</h2><ul><li>One</li></ul><ol><li>Two</li></ol></blockquote></div>'
    );
  });

  it('strips event handlers and disallowed attributes', () => {
    expect(
      allowlistHtml('<p id="x" onclick="steal()">Hello <span data-x="1">safe</span></p>', {
        DOMParserImpl: null,
      })
    ).toBe('<p>Hello <span>safe</span></p>');
  });

  it('keeps only safe links', () => {
    expect(
      allowlistHtml(
        '<a href="https://example.test/a" target="_blank">web</a>' +
          '<a href="mailto:hello">mail</a>' +
          '<a href="javascript:alert(1)">bad</a>' +
          '<a href="/relative">relative</a>',
        { DOMParserImpl: null }
      )
    ).toBe(
      '<a href="https://example.test/a">web</a>' +
        '<a href="mailto:hello">mail</a>' +
        '<a>bad</a>' +
        '<a>relative</a>'
    );
  });

  it('keeps only approved style declarations', () => {
    expect(
      allowlistHtml(
        '<p style="color: red; position: fixed; text-align: center; background-color: #fff;' +
          ' background-image: url(https://example.test/x.png)">Styled</p>',
        { DOMParserImpl: null }
      )
    ).toBe('<p style="color: red; text-align: center; background-color: #fff">Styled</p>');
  });

  it('drops dangerous elements and their contents', () => {
    expect(
      allowlistHtml(
        '<p>Hi</p><script>alert(1)</script><style>p{display:none}</style>' +
          '<svg><text>bad</text></svg><iframe src="https://example.test"></iframe>',
        { DOMParserImpl: null }
      )
    ).toBe('<p>Hi</p>');
  });

  it('unwraps unknown non-dangerous elements', () => {
    expect(
      allowlistHtml(
        '<section><article><p>Kept</p><custom-tag>Text</custom-tag></article></section>',
        {
          DOMParserImpl: null,
        }
      )
    ).toBe('<p>Kept</p>Text');
  });

  it('strips images unless they are explicitly allowed', () => {
    expect(
      allowlistHtml(
        '<p>A<img src="cid:first@example">B<img src="https://example.test/x.png"></p>',
        {
          DOMParserImpl: null,
        }
      )
    ).toBe('<p>AB</p>');

    expect(
      allowlistHtml('<p>A<img src="cid:first@example">B<img src="cid:spoof@example"></p>', {
        allowedCidImageHtml: ['<img src="cid:first@example">'],
        DOMParserImpl: null,
      })
    ).toBe('<p>A<img src="cid:first@example">B</p>');

    expect(
      allowlistHtml('<p><img src="https://example.test/x.png"></p>', {
        allowedCidImageHtml: ['<img src="https://example.test/x.png">'],
        DOMParserImpl: null,
      })
    ).toBe('<p><img src="https://example.test/x.png"></p>');

    expect(
      allowlistHtml('<p><img src="data:image/png;base64,iVBORw0KGgo="></p>', {
        allowedCidImageHtml: ['<img src="data:image/png;base64,iVBORw0KGgo=">'],
        DOMParserImpl: null,
      })
    ).toBe('<p><img src="data:image/png;base64,iVBORw0KGgo="></p>');
  });

  it('keeps body images only when their exact markup is allowlisted', () => {
    expect(
      allowlistHtml('<p><img src="https://example.test/injected.png"></p>', {
        allowedCidImageHtml: ['<img src="https://example.test/original.png">'],
        DOMParserImpl: null,
      })
    ).toBe('<p></p>');

    expect(
      allowlistHtml('<p><img src="file:///etc/passwd"></p>', {
        allowedCidImageHtml: ['<img src="file:///etc/passwd">'],
        DOMParserImpl: null,
      })
    ).toBe('<p></p>');
  });

  it('preserves sanitized HTML signature layout in signature mode', () => {
    expect(
      allowlistHtml(
        '<table onclick="bad()" cellpadding="0" style="width: 320px; position: fixed">' +
          '<tr><td style="font-family: Arial; line-height: 1.3">' +
          '<img src="https://example.test/logo.png" width="120" onerror="bad()" alt="Logo">' +
          '<img src="cid:logo@example" onerror="bad()" height="48">' +
          '<a href="mailto:ken@example.test" target="_blank">Ken</a>' +
          '</td></tr></table>',
        {
          DOMParserImpl: null,
          signatureMode: true,
        }
      )
    ).toBe(
      '<table style="width: 320px" cellpadding="0"><tr><td style="font-family: Arial; ' +
        'line-height: 1.3"><img width="120" alt="Logo" src="https://example.test/logo.png">' +
        '<img height="48" src="cid:logo@example">' +
        '<a href="mailto:ken@example.test">Ken</a></td></tr></table>'
    );
  });

  it('uses DOMParser when available', () => {
    class FakeDOMParser {
      parseFromString() {
        return {
          body: {
            childNodes: [],
            innerHTML: '<p>parsed</p>',
          },
        };
      }
    }

    expect(allowlistHtml('<p>raw</p>', { DOMParserImpl: FakeDOMParser })).toBe('<p>parsed</p>');
  });

  it('requires a string input', () => {
    expect(() => allowlistHtml(null)).toThrow('HTML input must be a string.');
  });
});
