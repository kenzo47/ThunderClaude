const SIGNATURE_ATTRIBUTE_PATTERN =
  /<([a-z][\w:-]*)\b[^>]*(?:class\s*=\s*(?:"[^"]*\b(?:moz-signature|signature)\b[^"]*"|'[^']*\b(?:moz-signature|signature)\b[^']*'|[^\s"'=<>`]*\b(?:moz-signature|signature)\b[^\s"'=<>`]*)|id\s*=\s*(?:"[^"]*\bsignature\b[^"]*"|'[^']*\bsignature\b[^']*'|[^\s"'=<>`]*\bsignature\b[^\s"'=<>`]*))[^>]*>/gi;
const SIGNATURE_DELIMITER_PATTERN =
  /(?:^|<br\s*\/?>|<\/(?:div|p|li|pre)>|\r?\n)\s*(?:<(?:div|p|span|font)\b[^>]*>\s*)*--(?:\s|&nbsp;)*(?:<br\s*\/?>|\r?\n|<\/(?:div|p|span|font)>)/gi;
const SIGNATURE_CONTAINER_PATTERN = /<(table|div|section|p)\b[^>]*>/gi;
const SIGNATURE_CONTACT_PATTERNS = [
  /mailto:/i,
  /tel:/i,
  /linkedin\.com|facebook\.com|instagram\.com/i,
  /www\.|https?:\/\//i,
  /@/,
  /\b(?:phone|mobile|tel|email)\b/i,
  /\b(?:kind regards|regards|sincerely)\b/i,
  /<img\b/i,
  /<table\b/i,
];

function stripHtml(html) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findLastSignatureAttributeIndex(html) {
  let match;
  let signatureIndex = -1;

  SIGNATURE_ATTRIBUTE_PATTERN.lastIndex = 0;
  while ((match = SIGNATURE_ATTRIBUTE_PATTERN.exec(html))) {
    signatureIndex = match.index;
  }
  SIGNATURE_ATTRIBUTE_PATTERN.lastIndex = 0;

  return signatureIndex;
}

function findLastDelimiterIndex(html) {
  const trailingStart = Math.max(0, html.length - 5000);
  let match;
  let delimiterIndex = -1;

  SIGNATURE_DELIMITER_PATTERN.lastIndex = trailingStart;
  while ((match = SIGNATURE_DELIMITER_PATTERN.exec(html))) {
    const candidateIndex = match[0].search(/--/);
    const prefix = match[0].slice(0, Math.max(candidateIndex, 0));
    const wrapperMatch = prefix.match(/<(?:div|p|span|font)\b[^>]*>\s*$/i);
    const index = wrapperMatch
      ? match.index + wrapperMatch.index
      : match.index + Math.max(candidateIndex, 0);
    const before = stripHtml(html.slice(0, index));
    const after = stripHtml(html.slice(index));

    if (before && after) {
      delimiterIndex = index;
    }
  }
  SIGNATURE_DELIMITER_PATTERN.lastIndex = 0;

  return delimiterIndex;
}

function signatureHeuristicScore(html) {
  return SIGNATURE_CONTACT_PATTERNS.reduce(
    (score, pattern) => score + (pattern.test(html) ? 1 : 0),
    0
  );
}

function findLastHeuristicSignatureIndex(html) {
  const trailingStart = Math.max(0, html.length - 8000);
  const trailingHtml = html.slice(trailingStart);
  let match;
  let signatureIndex = -1;

  SIGNATURE_CONTAINER_PATTERN.lastIndex = 0;
  while ((match = SIGNATURE_CONTAINER_PATTERN.exec(trailingHtml))) {
    const index = trailingStart + match.index;
    const before = stripHtml(html.slice(0, index));
    const candidate = html.slice(index);

    if (before && signatureHeuristicScore(candidate) >= 2 && stripHtml(candidate).length <= 1200) {
      signatureIndex = index;
    }
  }
  SIGNATURE_CONTAINER_PATTERN.lastIndex = 0;

  return signatureIndex;
}

export function splitSignature(html) {
  if (typeof html !== 'string' || !html) {
    return {
      bodyHtml: typeof html === 'string' ? html : '',
      signatureHtml: '',
    };
  }

  const signatureIndex = findLastSignatureAttributeIndex(html);
  const delimiterIndex = findLastDelimiterIndex(html);
  const heuristicIndex = findLastHeuristicSignatureIndex(html);
  const splitIndex =
    signatureIndex >= 0 ? signatureIndex : delimiterIndex >= 0 ? delimiterIndex : heuristicIndex;

  if (splitIndex < 0) {
    return {
      bodyHtml: html,
      signatureHtml: '',
    };
  }

  return {
    bodyHtml: html.slice(0, splitIndex),
    signatureHtml: html.slice(splitIndex),
  };
}
