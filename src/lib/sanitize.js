const ALLOWED_ELEMENTS = new Set([
  'a',
  'blockquote',
  'br',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'ol',
  'p',
  'span',
  'strong',
  'u',
  'ul',
]);

const DISCARD_CONTENT_ELEMENTS = new Set([
  'base',
  'embed',
  'iframe',
  'link',
  'math',
  'meta',
  'object',
  'script',
  'style',
  'svg',
  'template',
]);

const ALLOWED_STYLE_PROPERTIES = new Set(['background-color', 'color', 'text-align']);
const URL_STYLE_PATTERN = /(?:expression|url)\s*\(/i;
const SAFE_HREF_PATTERN = /^(?:https?:|mailto:)/i;
const CID_SRC_PATTERN = /^cid:/i;

export class SanitizerError extends Error {
  constructor(message, { code = 'sanitizer_error' } = {}) {
    super(message);
    this.name = 'SanitizerError';
    this.code = code;
  }
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function normalizeAllowedImages(allowedCidImageHtml) {
  const images =
    allowedCidImageHtml instanceof Set
      ? [...allowedCidImageHtml]
      : Array.isArray(allowedCidImageHtml)
        ? allowedCidImageHtml
        : [];

  return new Set(
    images.filter(
      (imageHtml) =>
        typeof imageHtml === 'string' &&
        /^<\s*img\b/i.test(imageHtml) &&
        CID_SRC_PATTERN.test(readAttributeFallback(imageHtml, 'src'))
    )
  );
}

function readAttributeFallback(html, attributeName) {
  const attributePattern = new RegExp(
    `\\b${attributeName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\\\`]+))`,
    'i'
  );
  const match = html.match(attributePattern);

  return match?.[1] ?? match?.[2] ?? match?.[3] ?? '';
}

function isAllowedHref(value) {
  return SAFE_HREF_PATTERN.test(value.trim());
}

function sanitizeStyle(value) {
  const safeDeclarations = [];

  for (const declaration of value.split(';')) {
    const separatorIndex = declaration.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
    const propertyValue = declaration.slice(separatorIndex + 1).trim();

    if (
      !ALLOWED_STYLE_PROPERTIES.has(property) ||
      !propertyValue ||
      URL_STYLE_PATTERN.test(propertyValue) ||
      propertyValue.includes('<') ||
      propertyValue.includes('>')
    ) {
      continue;
    }

    safeDeclarations.push(`${property}: ${propertyValue}`);
  }

  return safeDeclarations.join('; ');
}

function isAllowedCidImage(element, allowedImages) {
  return (
    element.tagName.toLowerCase() === 'img' &&
    allowedImages.has(element.outerHTML) &&
    CID_SRC_PATTERN.test(element.getAttribute('src') ?? '')
  );
}

function sanitizeElementAttributes(element) {
  const tagName = element.tagName.toLowerCase();
  const href = element.getAttribute('href');
  const style = element.getAttribute('style');

  for (const attribute of [...element.attributes]) {
    element.removeAttribute(attribute.name);
  }

  if (tagName === 'a' && href && isAllowedHref(href)) {
    element.setAttribute('href', href.trim());
  }

  if (style) {
    const sanitizedStyle = sanitizeStyle(style);
    if (sanitizedStyle) {
      element.setAttribute('style', sanitizedStyle);
    }
  }
}

function sanitizeNode(node, allowedImages) {
  if (node.nodeType === 3) {
    return;
  }

  if (node.nodeType !== 1) {
    node.remove();
    return;
  }

  const element = node;
  const tagName = element.tagName.toLowerCase();

  if (isAllowedCidImage(element, allowedImages)) {
    return;
  }

  if (DISCARD_CONTENT_ELEMENTS.has(tagName)) {
    element.remove();
    return;
  }

  for (const child of [...element.childNodes]) {
    sanitizeNode(child, allowedImages);
  }

  if (!ALLOWED_ELEMENTS.has(tagName)) {
    element.replaceWith(...element.childNodes);
    return;
  }

  sanitizeElementAttributes(element);
}

function allowlistHtmlWithDomParser(html, { allowedImages, DOMParserImpl }) {
  const parser = new DOMParserImpl();
  const document = parser.parseFromString(html, 'text/html');

  for (const node of [...document.body.childNodes]) {
    sanitizeNode(node, allowedImages);
  }

  return document.body.innerHTML;
}

function stripDiscardedFallback(html) {
  return html.replace(
    /<\s*(script|style|template|svg|math|iframe|object|embed|link|meta|base)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>|<\s*(link|meta|base)\b[^>]*>/gi,
    ''
  );
}

function sanitizeAttributesFallback(tagName, rawAttributes) {
  const hrefMatch = rawAttributes.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
  const styleMatch = rawAttributes.match(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
  const attributes = [];

  if (tagName === 'a') {
    const href = hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? '';
    if (href && isAllowedHref(href)) {
      attributes.push(`href="${escapeHtml(href.trim())}"`);
    }
  }

  const style = styleMatch?.[1] ?? styleMatch?.[2] ?? styleMatch?.[3] ?? '';
  if (style) {
    const sanitizedStyle = sanitizeStyle(style);
    if (sanitizedStyle) {
      attributes.push(`style="${escapeHtml(sanitizedStyle)}"`);
    }
  }

  return attributes.length ? ` ${attributes.join(' ')}` : '';
}

function allowlistHtmlWithScanner(html, allowedImages) {
  const imagePlaceholders = new Map();
  let imageIndex = 0;
  let sanitized = stripDiscardedFallback(html);

  for (const imageHtml of allowedImages) {
    const token = `__TC_ALLOWED_IMG_${imageIndex++}__`;
    imagePlaceholders.set(token, imageHtml);
    sanitized = sanitized.split(imageHtml).join(token);
  }

  sanitized = sanitized.replace(
    /<\s*(\/?)([a-z0-9]+)\b([^>]*)>/gi,
    (match, slash, tagName, attrs) => {
      const normalizedTag = tagName.toLowerCase();

      if (imagePlaceholders.has(match)) {
        return match;
      }

      if (!ALLOWED_ELEMENTS.has(normalizedTag)) {
        return '';
      }

      if (slash) {
        return `</${normalizedTag}>`;
      }

      return `<${normalizedTag}${sanitizeAttributesFallback(normalizedTag, attrs)}>`;
    }
  );

  for (const [token, imageHtml] of imagePlaceholders.entries()) {
    sanitized = sanitized.split(token).join(imageHtml);
  }

  return sanitized;
}

export function allowlistHtml(
  html,
  { allowedCidImageHtml = [], DOMParserImpl = globalThis.DOMParser } = {}
) {
  if (typeof html !== 'string') {
    throw new SanitizerError('HTML input must be a string.', {
      code: 'invalid_sanitizer_input',
    });
  }

  const allowedImages = normalizeAllowedImages(allowedCidImageHtml);

  if (typeof DOMParserImpl === 'function') {
    return allowlistHtmlWithDomParser(html, { allowedImages, DOMParserImpl });
  }

  return allowlistHtmlWithScanner(html, allowedImages);
}
