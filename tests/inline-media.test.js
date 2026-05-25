import { describe, expect, it } from 'vitest';

import { restore, tokenize } from '../src/background/inline-media.js';

class FakeDOMParser {
  parseFromString(html) {
    let parsedHtml = html;
    const body = {
      get innerHTML() {
        return parsedHtml;
      },
    };
    const imageOuterHTML = '<img src="cid:first@example" alt="First">';
    const image = {
      getAttribute(name) {
        return name === 'src' ? 'cid:first@example' : null;
      },
      outerHTML: imageOuterHTML,
      replaceWith(node) {
        parsedHtml = parsedHtml.replace(imageOuterHTML, node.textContent);
      },
    };

    return {
      body,
      createTextNode(text) {
        return {
          textContent: text,
        };
      },
      querySelectorAll(selector) {
        return selector === 'img' ? [image] : [];
      },
    };
  }
}

describe('inline media', () => {
  it('tokenizes cid images with DOMParser when available', () => {
    const result = tokenize('<p>Hi <img src="cid:first@example" alt="First"></p>', {
      DOMParserImpl: FakeDOMParser,
    });

    expect(result.text).toBe('<p>Hi [[TC_IMG_1]]</p>');
    expect(result.media).toEqual([
      {
        outerHTML: '<img src="cid:first@example" alt="First">',
        token: '[[TC_IMG_1]]',
      },
    ]);
    expect(result.mediaMap.get('[[TC_IMG_1]]')).toEqual({
      outerHTML: '<img src="cid:first@example" alt="First">',
    });
  });

  it('tokenizes multiple cid images and leaves remote images in place', () => {
    const result = tokenize(
      '<p>A<img src="cid:first@example" alt="One">B<img src="https://example.test/a.png">C' +
        '<IMG alt="Two" SRC=\'cid:second@example\'></p>',
      { DOMParserImpl: null }
    );

    expect(result.text).toBe(
      '<p>A[[TC_IMG_1]]B<img src="https://example.test/a.png">C[[TC_IMG_2]]</p>'
    );
    expect(result.media).toEqual([
      {
        outerHTML: '<img src="cid:first@example" alt="One">',
        token: '[[TC_IMG_1]]',
      },
      {
        outerHTML: '<IMG alt="Two" SRC=\'cid:second@example\'>',
        token: '[[TC_IMG_2]]',
      },
    ]);
  });

  it('tokenizes every image when includeAllImages is set', () => {
    const result = tokenize(
      '<p>A<img src="cid:first@example">B<img src="https://example.test/a.png">C' +
        '<img src="data:image/png;base64,iVBORw0KGgo="></p>',
      { DOMParserImpl: null, includeAllImages: true }
    );

    expect(result.text).toBe('<p>A[[TC_IMG_1]]B[[TC_IMG_2]]C[[TC_IMG_3]]</p>');
    expect(result.media.map((entry) => entry.outerHTML)).toEqual([
      '<img src="cid:first@example">',
      '<img src="https://example.test/a.png">',
      '<img src="data:image/png;base64,iVBORw0KGgo=">',
    ]);
  });

  it('restores tokens after the LLM moves them', () => {
    const { mediaMap } = tokenize(
      '<p>Start<img src="cid:first@example">Middle<img src="cid:second@example">End</p>',
      { DOMParserImpl: null }
    );

    expect(restore('<p>[[TC_IMG_2]] Rewritten [[TC_IMG_1]]</p>', mediaMap)).toBe(
      '<p><img src="cid:second@example"> Rewritten <img src="cid:first@example"></p>'
    );
  });

  it('rejects moved tokens when original order is required', () => {
    const { mediaMap } = tokenize(
      '<p>Start<img src="cid:first@example">Middle<img src="cid:second@example">End</p>',
      { DOMParserImpl: null }
    );

    expect(() =>
      restore('<p>[[TC_IMG_2]] Rewritten [[TC_IMG_1]]</p>', mediaMap, {
        requireOriginalOrder: true,
      })
    ).toThrow('AI moved an image, retry?');
  });

  it('restores from serializable media entries', () => {
    const { media, text } = tokenize('<p>Hi<img src="cid:first@example"></p>', {
      DOMParserImpl: null,
    });

    expect(restore(text, media)).toBe('<p>Hi<img src="cid:first@example"></p>');
  });

  it('rejects missing image tokens', () => {
    const { mediaMap } = tokenize('<p>Hi<img src="cid:first@example"></p>', {
      DOMParserImpl: null,
    });

    expect(() => restore('<p>No image here.</p>', mediaMap)).toThrow('AI dropped an image, retry?');
  });

  it('rejects duplicated image tokens', () => {
    const { mediaMap } = tokenize('<p>Hi<img src="cid:first@example"></p>', {
      DOMParserImpl: null,
    });

    expect(() => restore('<p>[[TC_IMG_1]][[TC_IMG_1]]</p>', mediaMap)).toThrow(
      'AI dropped an image, retry?'
    );
  });

  it('rejects invented image tokens', () => {
    const { mediaMap } = tokenize('<p>Hi<img src="cid:first@example"></p>', {
      DOMParserImpl: null,
    });

    expect(() => restore('<p>[[TC_IMG_1]][[TC_IMG_2]]</p>', mediaMap)).toThrow(
      'AI dropped an image, retry?'
    );
  });

  it('rejects draft text that already contains reserved tokens', () => {
    expect(() => tokenize('<p>[[TC_IMG_1]]</p>', { DOMParserImpl: null })).toThrow(
      'Draft already contains a reserved inline-media token.'
    );
  });

  it('requires string inputs', () => {
    expect(() => tokenize(null)).toThrow('Draft body HTML must be a string.');
    expect(() => restore(null, new Map())).toThrow('Rewritten body HTML must be a string.');
  });
});
