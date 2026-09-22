export class SelectionRewriteError extends Error {
  constructor(message, { code = 'selection_rewrite_error' } = {}) {
    super(message);
    this.name = 'SelectionRewriteError';
    this.code = code;
  }
}

// Selection.toString() returns rendered text (block boundaries and <br> become
// newlines, source whitespace collapses), while the draft HTML keeps its raw
// text nodes. Match with all whitespace removed so both sides agree.
function normalizeSelectedText(text) {
  return text.replace(/\s/g, '');
}

function isWhitespace(character) {
  return /\s/.test(character);
}

function findUniqueSelectionOffset(haystack, needle) {
  const firstIndex = haystack.indexOf(needle);

  if (firstIndex === -1) {
    throw new SelectionRewriteError('Selected text no longer matches the draft.', {
      code: 'selection_not_found',
    });
  }

  if (haystack.indexOf(needle, firstIndex + needle.length) !== -1) {
    throw new SelectionRewriteError(
      'Selected text appears more than once. Select a larger unique passage.',
      {
        code: 'selection_not_unique',
      }
    );
  }

  return firstIndex;
}

function collectTextNodes(node, textNodes = []) {
  if (node.nodeType === 3) {
    textNodes.push(node);
    return textNodes;
  }

  for (const child of node.childNodes ?? []) {
    collectTextNodes(child, textNodes);
  }

  return textNodes;
}

function getDomTextIndex(document) {
  const textNodes = collectTextNodes(document.body);
  const positions = [];
  let text = '';

  for (const node of textNodes) {
    const value = node.nodeValue ?? '';

    for (let offset = 0; offset < value.length; offset += 1) {
      if (isWhitespace(value[offset])) {
        continue;
      }
      text += value[offset];
      positions.push({ node, offset });
    }
  }

  return { positions, text };
}

function createReplacementFragment(document, replacementHtml, DOMParserImpl) {
  const parser = new DOMParserImpl();
  const replacementDocument = parser.parseFromString(replacementHtml, 'text/html');
  const fragment = document.createDocumentFragment();

  for (const node of [...replacementDocument.body.childNodes]) {
    fragment.append(node);
  }

  return fragment;
}

function resolveDomRange(html, selectedText, DOMParserImpl) {
  const parser = new DOMParserImpl();
  const document = parser.parseFromString(html, 'text/html');
  const selected = normalizeSelectedText(selectedText);
  const { positions, text } = getDomTextIndex(document);
  const startIndex = findUniqueSelectionOffset(text, selected);
  const endIndex = startIndex + selected.length;
  const start = positions[startIndex];
  const last = positions[endIndex - 1];
  const range = document.createRange();

  range.setStart(start.node, start.offset);
  range.setEnd(last.node, last.offset + 1);
  expandRangeToBlocks(document, range);

  return { document, range };
}

const BLOCK_TAGS = new Set([
  'BLOCKQUOTE',
  'DIV',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'UL',
]);

function isBlankFragment(fragment) {
  return !fragment.querySelector('img') && !(fragment.textContent ?? '').trim();
}

// Climbs from a range end through block parents whose content on that side
// of the range is blank. Returns the nodes reached, nearest first.
function climbBlankBlocks(document, range, side) {
  const container = side === 'start' ? range.startContainer : range.endContainer;
  const offset = side === 'start' ? range.startOffset : range.endOffset;
  const reached = [];
  let node = container;

  while (node.parentNode && node.parentNode !== document.body) {
    const parent = node.parentNode;
    if (!BLOCK_TAGS.has(parent.nodeName)) {
      break;
    }
    const rest = document.createRange();
    if (side === 'start') {
      rest.setStart(parent, 0);
      rest.setEnd(container, offset);
    } else {
      rest.setStart(container, offset);
      rest.setEnd(parent, parent.childNodes.length);
    }
    if (!isBlankFragment(rest.cloneContents())) {
      break;
    }
    reached.push(parent);
    node = parent;
  }

  return reached;
}

// A selection that covers a block's whole content (Selection.toString() drops
// the surrounding markup) replaces the block itself, so block-level output from
// the model does not end up nested inside a half-emptied paragraph.
function expandRangeToBlocks(document, range) {
  const ancestor = range.commonAncestorContainer;
  const startBlocks = climbBlankBlocks(document, range, 'start');
  const endBlocks = climbBlankBlocks(document, range, 'end');

  // Both ends sit at the edges of the same block: replace that block whole.
  if (startBlocks.includes(ancestor) && endBlocks.includes(ancestor)) {
    range.selectNode(ancestor);
    return;
  }

  // Otherwise never climb past the node that contains both ends, or one end
  // would jump outside the block the other end still sits in.
  const startTop = startBlocks.filter((node) => node !== ancestor).at(-1);
  const endTop = endBlocks.filter((node) => node !== ancestor).at(-1);
  if (startTop) {
    range.setStartBefore(startTop);
  }
  if (endTop) {
    range.setEndAfter(endTop);
  }
}

function replaceWithDomParser(html, selectedText, replacementHtml, DOMParserImpl) {
  const { document, range } = resolveDomRange(html, selectedText, DOMParserImpl);

  range.deleteContents();
  range.insertNode(createReplacementFragment(document, replacementHtml, DOMParserImpl));

  return document.body.innerHTML;
}

function extractWithDomParser(html, selectedText, DOMParserImpl) {
  const { document, range } = resolveDomRange(html, selectedText, DOMParserImpl);
  const container = document.createElement('div');

  container.append(range.cloneContents());

  return container.innerHTML;
}

function decodeEntity(entity) {
  const namedEntities = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };

  if (entity.startsWith('#x') || entity.startsWith('#X')) {
    const codePoint = Number.parseInt(entity.slice(2), 16);
    return isValidCodePoint(codePoint) ? String.fromCodePoint(codePoint) : null;
  }

  if (entity.startsWith('#')) {
    const codePoint = Number.parseInt(entity.slice(1), 10);
    return isValidCodePoint(codePoint) ? String.fromCodePoint(codePoint) : null;
  }

  return namedEntities[entity] ?? null;
}

function isValidCodePoint(codePoint) {
  return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff;
}

function decodeTextWithMap(raw) {
  const map = [];
  let decoded = '';

  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] === '&') {
      const semiIndex = raw.indexOf(';', index + 1);
      const entity = semiIndex === -1 ? '' : raw.slice(index + 1, semiIndex);
      const value = entity.length <= 20 ? decodeEntity(entity) : null;

      if (value !== null) {
        for (let valueIndex = 0; valueIndex < value.length; valueIndex += 1) {
          if (isWhitespace(value[valueIndex])) {
            continue;
          }
          decoded += value[valueIndex];
          map.push({ end: semiIndex + 1, start: index });
        }
        index = semiIndex;
        continue;
      }
    }

    if (isWhitespace(raw[index])) {
      continue;
    }
    decoded += raw[index];
    map.push({ end: index + 1, start: index });
  }

  return { decoded, map };
}

function tokenizeHtml(html) {
  const tokens = [];
  const tagPattern = /<[^>]*>/g;
  let cursor = 0;
  let match;

  while ((match = tagPattern.exec(html))) {
    if (match.index > cursor) {
      const raw = html.slice(cursor, match.index);
      tokens.push({
        raw,
        type: 'text',
        ...decodeTextWithMap(raw),
      });
    }

    tokens.push({
      raw: match[0],
      type: 'tag',
    });
    cursor = tagPattern.lastIndex;
  }

  if (cursor < html.length) {
    const raw = html.slice(cursor);
    tokens.push({
      raw,
      type: 'text',
      ...decodeTextWithMap(raw),
    });
  }

  return tokens;
}

// Without a DOMParser the selection must sit inside one text run; images and
// other markup inside the selection are not supported on this path.
function locateInScanner(html, selectedText) {
  const tokens = tokenizeHtml(html);
  const selected = normalizeSelectedText(selectedText);
  const fullText = tokens
    .filter((token) => token.type === 'text')
    .map((token) => token.decoded)
    .join('');
  const startIndex = findUniqueSelectionOffset(fullText, selected);
  const endIndex = startIndex + selected.length;
  let textCursor = 0;

  for (const [index, token] of tokens.entries()) {
    if (token.type !== 'text') {
      continue;
    }

    const tokenStart = textCursor;
    const tokenEnd = tokenStart + token.decoded.length;
    textCursor = tokenEnd;

    if (endIndex <= tokenStart || startIndex >= tokenEnd) {
      continue;
    }

    if (startIndex < tokenStart || endIndex > tokenEnd) {
      throw new SelectionRewriteError(
        'Selected text spans formatting this runtime cannot safely replace.',
        {
          code: 'selection_spans_markup',
        }
      );
    }

    return {
      index,
      rawEnd: token.map[endIndex - tokenStart - 1]?.end ?? token.raw.length,
      rawStart: token.map[startIndex - tokenStart]?.start ?? 0,
      tokens,
    };
  }

  throw new SelectionRewriteError('Selected text no longer matches the draft.', {
    code: 'selection_not_found',
  });
}

function replaceWithScanner(html, selectedText, replacementHtml) {
  const { index, rawEnd, rawStart, tokens } = locateInScanner(html, selectedText);

  return tokens
    .map((token, tokenIndex) => {
      if (tokenIndex !== index) {
        return token.raw;
      }

      return `${token.raw.slice(0, rawStart)}${replacementHtml}${token.raw.slice(rawEnd)}`;
    })
    .join('');
}

function extractWithScanner(html, selectedText) {
  const { index, rawEnd, rawStart, tokens } = locateInScanner(html, selectedText);

  return tokens[index].raw.slice(rawStart, rawEnd);
}

function assertSelectionInput(html, selectedText) {
  if (typeof html !== 'string') {
    throw new SelectionRewriteError('Selection rewrite input must be HTML strings.', {
      code: 'invalid_selection_rewrite_input',
    });
  }

  if (!normalizeSelectedText(selectedText ?? '')) {
    throw new SelectionRewriteError('Select text in the compose window to rewrite it.', {
      code: 'missing_selection_text',
    });
  }
}

// Returns the HTML fragment covered by the selection, images included, so it
// can be tokenized and rewritten the same way as a full draft.
export function extractSelectedHtml(
  html,
  selectedText,
  { DOMParserImpl = globalThis.DOMParser } = {}
) {
  assertSelectionInput(html, selectedText);

  if (typeof DOMParserImpl === 'function') {
    return extractWithDomParser(html, selectedText, DOMParserImpl);
  }

  return extractWithScanner(html, selectedText);
}

export function replaceSelectedTextWithHtml(
  html,
  selectedText,
  replacementHtml,
  { DOMParserImpl = globalThis.DOMParser } = {}
) {
  if (typeof replacementHtml !== 'string') {
    throw new SelectionRewriteError('Selection rewrite input must be HTML strings.', {
      code: 'invalid_selection_rewrite_input',
    });
  }
  assertSelectionInput(html, selectedText);

  if (typeof DOMParserImpl === 'function') {
    return replaceWithDomParser(html, selectedText, replacementHtml, DOMParserImpl);
  }

  return replaceWithScanner(html, selectedText, replacementHtml);
}
