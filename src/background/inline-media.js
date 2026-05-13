const TOKEN_PREFIX = '[[TC_IMG_';
const TOKEN_SUFFIX = ']]';
const TOKEN_PATTERN = /\[\[TC_IMG_(\d+)\]\]/g;
const CID_SRC_PATTERN = /^cid:/i;

export class InlineMediaError extends Error {
  constructor(message, { code = 'inline_media_error' } = {}) {
    super(message);
    this.name = 'InlineMediaError';
    this.code = code;
  }
}

function createToken(index) {
  return `${TOKEN_PREFIX}${index}${TOKEN_SUFFIX}`;
}

function createMediaMap() {
  return new Map();
}

function assertNoReservedTokens(html) {
  if (TOKEN_PATTERN.test(html)) {
    TOKEN_PATTERN.lastIndex = 0;
    throw new InlineMediaError('Draft already contains a reserved inline-media token.', {
      code: 'reserved_inline_media_token',
    });
  }
  TOKEN_PATTERN.lastIndex = 0;
}

function serializeMediaEntries(mediaMap) {
  return [...mediaMap.entries()].map(([token, entry]) => ({
    outerHTML: entry.outerHTML,
    token,
  }));
}

function tokenizeWithDomParser(html, DomParserImpl) {
  const parser = new DomParserImpl();
  const document = parser.parseFromString(html, 'text/html');
  const mediaMap = createMediaMap();

  for (const image of document.querySelectorAll('img')) {
    const src = image.getAttribute('src') ?? '';

    if (!CID_SRC_PATTERN.test(src)) {
      continue;
    }

    const token = createToken(mediaMap.size + 1);
    mediaMap.set(token, {
      outerHTML: image.outerHTML,
    });
    image.replaceWith(document.createTextNode(token));
  }

  return {
    media: serializeMediaEntries(mediaMap),
    mediaMap,
    text: document.body.innerHTML,
  };
}

function readImageSrc(imageTag) {
  const srcMatch = imageTag.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);

  return srcMatch?.[1] ?? srcMatch?.[2] ?? srcMatch?.[3] ?? '';
}

function tokenizeWithScanner(html) {
  const mediaMap = createMediaMap();
  const text = html.replace(/<img\b[^>]*>/gi, (imageTag) => {
    if (!CID_SRC_PATTERN.test(readImageSrc(imageTag))) {
      return imageTag;
    }

    const token = createToken(mediaMap.size + 1);
    mediaMap.set(token, {
      outerHTML: imageTag,
    });
    return token;
  });

  return {
    media: serializeMediaEntries(mediaMap),
    mediaMap,
    text,
  };
}

export function tokenize(html, { DOMParserImpl = globalThis.DOMParser } = {}) {
  if (typeof html !== 'string') {
    throw new InlineMediaError('Draft body HTML must be a string.', {
      code: 'invalid_inline_media_input',
    });
  }

  assertNoReservedTokens(html);

  if (typeof DOMParserImpl === 'function') {
    return tokenizeWithDomParser(html, DOMParserImpl);
  }

  return tokenizeWithScanner(html);
}

function normalizeMediaMap(mediaMap) {
  if (mediaMap instanceof Map) {
    return mediaMap;
  }

  if (Array.isArray(mediaMap)) {
    return new Map(mediaMap.map((entry) => [entry.token, { outerHTML: entry.outerHTML }]));
  }

  throw new InlineMediaError('Inline media map is invalid.', {
    code: 'invalid_inline_media_map',
  });
}

function countResponseTokens(html) {
  const counts = new Map();
  let match;

  TOKEN_PATTERN.lastIndex = 0;
  while ((match = TOKEN_PATTERN.exec(html))) {
    const token = match[0];
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  TOKEN_PATTERN.lastIndex = 0;

  return counts;
}

function validateTokenCounts(html, mediaMap) {
  const tokenCounts = countResponseTokens(html);

  for (const token of tokenCounts.keys()) {
    if (!mediaMap.has(token)) {
      throw new InlineMediaError('AI dropped an image, retry?', {
        code: 'inline_media_token_mismatch',
      });
    }
  }

  for (const token of mediaMap.keys()) {
    if (tokenCounts.get(token) !== 1) {
      throw new InlineMediaError('AI dropped an image, retry?', {
        code: 'inline_media_token_mismatch',
      });
    }
  }
}

function validateTokenOrder(html, mediaMap) {
  const expectedTokens = [...mediaMap.keys()];
  const actualTokens = [...html.matchAll(TOKEN_PATTERN)].map((match) => match[0]);
  TOKEN_PATTERN.lastIndex = 0;

  if (actualTokens.some((token, index) => token !== expectedTokens[index])) {
    throw new InlineMediaError('AI moved an image, retry?', {
      code: 'inline_media_token_order_mismatch',
    });
  }
}

export function restore(html, mediaMap, { requireOriginalOrder = false } = {}) {
  if (typeof html !== 'string') {
    throw new InlineMediaError('Rewritten body HTML must be a string.', {
      code: 'invalid_inline_media_input',
    });
  }

  const normalizedMediaMap = normalizeMediaMap(mediaMap);
  validateTokenCounts(html, normalizedMediaMap);
  if (requireOriginalOrder) {
    validateTokenOrder(html, normalizedMediaMap);
  }

  return html.replace(TOKEN_PATTERN, (token) => normalizedMediaMap.get(token).outerHTML);
}
