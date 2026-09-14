export class SelectionRewriteError extends Error {
  constructor(message, { code = 'selection_rewrite_error' } = {}) {
    super(message);
    this.name = 'SelectionRewriteError';
    this.code = code;
  }
}

const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DD',
  'DIV',
  'DL',
  'DT',
  'FIELDSET',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TD',
  'TH',
  'TR',
  'UL',
]);

function normalizeSelectedText(text) {
  // Collapse all whitespace runs (including the newlines the browser's
  // Selection.toString() inserts between paragraphs) into a single space, so
  // a selection spanning multiple <div>/<p> blocks still matches the draft's
  // HTML text, which has no literal whitespace at those block boundaries.
  return text.replaceAll('\u00a0', ' ').replace(/\s+/g, ' ').trim();
}

function collapseWhitespacePositions(rawText, rawPositions) {
  const text = [];
  const positions = [];
  let lastWasSpace = true;

  for (let index = 0; index < rawText.length; index += 1) {
    const char = rawText[index];
    const isSpace = /\s/.test(char);

    if (isSpace) {
      if (lastWasSpace) {
        continue;
      }
      text.push(' ');
      positions.push(rawPositions[index]);
      lastWasSpace = true;
    } else {
      text.push(char);
      positions.push(rawPositions[index]);
      lastWasSpace = false;
    }
  }

  while (text.length > 0 && text[text.length - 1] === ' ') {
    text.pop();
    positions.pop();
  }

  return { positions, text: text.join('') };
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

function walkForTextIndex(node, state) {
  if (node.nodeType === 3) {
    const value = node.nodeValue ?? '';

    for (let offset = 0; offset < value.length; offset += 1) {
      state.text += value[offset] === '\u00a0' ? ' ' : value[offset];
      state.positions.push({ node, offset });
      state.lastPosition = { node, offset: offset + 1 };
    }

    return;
  }

  if (node.nodeType !== 1) {
    return;
  }

  if (node.tagName === 'BR') {
    state.text += '\n';
    state.positions.push(state.lastPosition ?? { node, offset: 0 });
    return;
  }

  for (const child of node.childNodes ?? []) {
    walkForTextIndex(child, state);
  }

  // Block-level elements render on their own line: insert a synthetic
  // separator so paragraph boundaries in the draft line up with the
  // newlines the browser's Selection API reports for the same selection.
  if (BLOCK_TAGS.has(node.tagName)) {
    state.text += '\n';
    state.positions.push(state.lastPosition ?? { node, offset: 0 });
  }
}

function getDomTextIndex(document) {
  const state = { lastPosition: null, positions: [], text: '' };
  walkForTextIndex(document.body, state);
  return collapseWhitespacePositions(state.text, state.positions);
}

function getRangeBoundary(positions, index) {
  if (index < positions.length) {
    return positions[index];
  }

  const lastPosition = positions.at(-1);
  if (!lastPosition) {
    throw new SelectionRewriteError('Selected text no longer matches the draft.', {
      code: 'selection_not_found',
    });
  }

  return {
    node: lastPosition.node,
    offset: lastPosition.offset + 1,
  };
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

function replaceWithDomParser(html, selectedText, replacementHtml, DOMParserImpl) {
  const parser = new DOMParserImpl();
  const document = parser.parseFromString(html, 'text/html');
  const selected = normalizeSelectedText(selectedText);
  const { positions, text } = getDomTextIndex(document);
  const startIndex = findUniqueSelectionOffset(text, selected);
  const endIndex = startIndex + selected.length;
  const start = getRangeBoundary(positions, startIndex);
  const end = getRangeBoundary(positions, endIndex);
  const range = document.createRange();

  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  range.deleteContents();
  range.insertNode(createReplacementFragment(document, replacementHtml, DOMParserImpl));

  return document.body.innerHTML;
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
          decoded += value[valueIndex] === '\u00a0' ? ' ' : value[valueIndex];
          map.push({ end: semiIndex + 1, start: index });
        }
        index = semiIndex;
        continue;
      }
    }

    decoded += raw[index] === '\u00a0' ? ' ' : raw[index];
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

function replaceWithScanner(html, selectedText, replacementHtml) {
  const tokens = tokenizeHtml(html);
  const selected = normalizeSelectedText(selectedText);
  const fullText = tokens
    .filter((token) => token.type === 'text')
    .map((token) => token.decoded)
    .join('');
  const startIndex = findUniqueSelectionOffset(fullText, selected);
  const endIndex = startIndex + selected.length;
  let textCursor = 0;
  let inserted = false;

  const rewrittenHtml = tokens
    .map((token) => {
      if (token.type !== 'text') {
        return token.raw;
      }

      const tokenStart = textCursor;
      const tokenEnd = tokenStart + token.decoded.length;
      textCursor = tokenEnd;

      if (endIndex <= tokenStart || startIndex >= tokenEnd) {
        return token.raw;
      }

      if (startIndex < tokenStart || endIndex > tokenEnd) {
        throw new SelectionRewriteError(
          'Selected text spans formatting this runtime cannot safely replace.',
          {
            code: 'selection_spans_markup',
          }
        );
      }

      const rawStart = token.map[startIndex - tokenStart]?.start ?? 0;
      const rawEnd = token.map[endIndex - tokenStart - 1]?.end ?? token.raw.length;
      const before = token.raw.slice(0, rawStart);
      const after = token.raw.slice(rawEnd);

      inserted = true;
      return `${before}${replacementHtml}${after}`;
    })
    .join('');

  if (!inserted) {
    throw new SelectionRewriteError('Selected text no longer matches the draft.', {
      code: 'selection_not_found',
    });
  }

  return rewrittenHtml;
}

export function replaceSelectedTextWithHtml(
  html,
  selectedText,
  replacementHtml,
  { DOMParserImpl = globalThis.DOMParser } = {}
) {
  if (typeof html !== 'string' || typeof replacementHtml !== 'string') {
    throw new SelectionRewriteError('Selection rewrite input must be HTML strings.', {
      code: 'invalid_selection_rewrite_input',
    });
  }

  if (!normalizeSelectedText(selectedText ?? '')) {
    throw new SelectionRewriteError('Select text in the compose window to rewrite it.', {
      code: 'missing_selection_text',
    });
  }

  if (typeof DOMParserImpl === 'function') {
    return replaceWithDomParser(html, selectedText, replacementHtml, DOMParserImpl);
  }

  return replaceWithScanner(html, selectedText, replacementHtml);
}
