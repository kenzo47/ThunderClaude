const SIGNATURE_ATTRIBUTE_PATTERN =
  /<([a-z][\w:-]*)\b[^>]*(?:class\s*=\s*(?:"[^"]*\b(?:moz-signature|signature)\b[^"]*"|'[^']*\b(?:moz-signature|signature)\b[^']*'|[^\s"'=<>`]*\b(?:moz-signature|signature)\b[^\s"'=<>`]*)|id\s*=\s*(?:"[^"]*\bsignature\b[^"]*"|'[^']*\bsignature\b[^']*'|[^\s"'=<>`]*\bsignature\b[^\s"'=<>`]*))[^>]*>/gi;
const SIGNATURE_DELIMITER_PATTERN =
  /(?:^|<br\s*\/?>|<\/(?:div|p|li|pre)>|\r?\n)\s*(?:<(?:div|p|span|font)\b[^>]*>\s*)*--(?:\s|&nbsp;)*(?:<br\s*\/?>|\r?\n|<\/(?:div|p|span|font)>)/gi;

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

export function splitSignature(html) {
  if (typeof html !== 'string' || !html) {
    return {
      bodyHtml: typeof html === 'string' ? html : '',
      signatureHtml: '',
    };
  }

  const signatureIndex = findLastSignatureAttributeIndex(html);
  const delimiterIndex = findLastDelimiterIndex(html);
  const splitIndex = signatureIndex >= 0 ? signatureIndex : delimiterIndex;

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
