// When the user replies to or forwards a message, Thunderbird inserts the
// quoted history below the new message they are writing. A full-mail rewrite
// must only touch that new message, never the quoted thread, so we split the
// quoted history off and keep it byte-for-byte intact. These patterns match
// the markup Thunderbird (and Gmail-composed mail) uses to open that history.
const QUOTE_BOUNDARY_PATTERNS = [
  // "On <date>, <sender> wrote:" citation line that precedes a reply quote.
  /<div\b[^>]*\bclass\s*=\s*(?:"[^"]*\bmoz-cite-prefix\b[^"]*"|'[^']*\bmoz-cite-prefix\b[^']*')[^>]*>/i,
  // Thunderbird reply quote body.
  /<blockquote\b[^>]*\btype\s*=\s*["']?cite\b[^>]*>/i,
  // Inline-forwarded message container.
  /<div\b[^>]*\bclass\s*=\s*(?:"[^"]*\bmoz-forward-container\b[^"]*"|'[^']*\bmoz-forward-container\b[^']*')[^>]*>/i,
  // Gmail-style quoted thread, kept when replying to mail composed in Gmail.
  /<(?:div|blockquote)\b[^>]*\bclass\s*=\s*(?:"[^"]*\bgmail_quote\b[^"]*"|'[^']*\bgmail_quote\b[^']*')[^>]*>/i,
];

export function splitQuotedReply(html) {
  if (typeof html !== 'string' || !html) {
    return {
      bodyHtml: typeof html === 'string' ? html : '',
      quotedHtml: '',
    };
  }

  let boundaryIndex = -1;
  for (const pattern of QUOTE_BOUNDARY_PATTERNS) {
    const match = pattern.exec(html);
    if (match && (boundaryIndex < 0 || match.index < boundaryIndex)) {
      boundaryIndex = match.index;
    }
  }

  if (boundaryIndex < 0) {
    return {
      bodyHtml: html,
      quotedHtml: '',
    };
  }

  return {
    bodyHtml: html.slice(0, boundaryIndex),
    quotedHtml: html.slice(boundaryIndex),
  };
}
