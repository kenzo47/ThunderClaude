const INLINE_MEDIA_TOKEN_PATTERN = /\[\[TC_IMG_\d+\]\]/g;

export function splitAroundInlineMediaTokens(html) {
  const segments = [];
  let cursor = 0;
  let match;

  INLINE_MEDIA_TOKEN_PATTERN.lastIndex = 0;
  while ((match = INLINE_MEDIA_TOKEN_PATTERN.exec(html))) {
    if (match.index > cursor) {
      segments.push({
        type: 'html',
        value: html.slice(cursor, match.index),
      });
    }

    segments.push({
      type: 'token',
      value: match[0],
    });
    cursor = match.index + match[0].length;
  }
  INLINE_MEDIA_TOKEN_PATTERN.lastIndex = 0;

  if (cursor < html.length) {
    segments.push({
      type: 'html',
      value: html.slice(cursor),
    });
  }

  return segments;
}

export function hasRewriteableText(html) {
  return (
    html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .trim().length > 0
  );
}
