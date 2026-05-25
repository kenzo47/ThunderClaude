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
const SIGNATURE_ALLOWED_ELEMENTS = new Set([
  ...ALLOWED_ELEMENTS,
  'b',
  'big',
  'font',
  'i',
  'img',
  'small',
  's',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
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
const SIGNATURE_ALLOWED_STYLE_PROPERTIES = new Set([
  ...ALLOWED_STYLE_PROPERTIES,
  'border',
  'border-bottom',
  'border-collapse',
  'border-left',
  'border-right',
  'border-top',
  'display',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'height',
  'line-height',
  'margin',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'max-width',
  'min-width',
  'padding',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'text-decoration',
  'vertical-align',
  'width',
]);
const URL_STYLE_PATTERN = /(?:expression|url)\s*\(/i;
const SAFE_HREF_PATTERN = /^(?:https?:|mailto:)/i;
const SAFE_IMG_SRC_PATTERN = /^(?:cid:|https?:|data:image\/(?:gif|jpeg|png|webp);base64,)/i;

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
        SAFE_IMG_SRC_PATTERN.test(readAttributeFallback(imageHtml, 'src'))
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

function sanitizeStyle(value, allowedStyleProperties = ALLOWED_STYLE_PROPERTIES) {
  const safeDeclarations = [];

  for (const declaration of value.split(';')) {
    const separatorIndex = declaration.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
    const propertyValue = declaration.slice(separatorIndex + 1).trim();

    if (
      !allowedStyleProperties.has(property) ||
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

function isAllowedImage(element, allowedImages) {
  return (
    element.tagName.toLowerCase() === 'img' &&
    allowedImages.has(element.outerHTML) &&
    SAFE_IMG_SRC_PATTERN.test(element.getAttribute('src') ?? '')
  );
}

function sanitizeTokenAttribute(value) {
  const normalizedValue = value.trim().replace(/\s+/g, ' ');

  return /^[a-zA-Z0-9 _:-]{1,200}$/.test(normalizedValue) ? normalizedValue : '';
}

function sanitizeDimensionAttribute(value) {
  const normalizedValue = value.trim();

  return /^(?:[1-9]\d{0,3}|0)(?:\.\d{1,2})?(?:%|px)?$/.test(normalizedValue) ? normalizedValue : '';
}

function sanitizeSignatureElementAttributes(element, originalAttributes) {
  const tagName = element.tagName.toLowerCase();
  const safeCopyAttributes = new Map([
    ['align', /^(?:left|right|center|justify)$/i],
    ['valign', /^(?:top|middle|bottom|baseline)$/i],
    ['cellpadding', /^\d{1,3}$/],
    ['cellspacing', /^\d{1,3}$/],
    ['border', /^\d{1,3}$/],
    ['alt', /^[^<>]{0,300}$/],
    ['title', /^[^<>]{0,300}$/],
  ]);

  for (const [attributeName, pattern] of safeCopyAttributes.entries()) {
    const value = originalAttributes.get(attributeName);
    if (value && pattern.test(value.trim())) {
      element.setAttribute(attributeName, value.trim());
    }
  }

  for (const attributeName of ['width', 'height']) {
    const value = sanitizeDimensionAttribute(originalAttributes.get(attributeName) ?? '');
    if (value) {
      element.setAttribute(attributeName, value);
    }
  }

  for (const attributeName of ['class', 'id']) {
    const value = sanitizeTokenAttribute(originalAttributes.get(attributeName) ?? '');
    if (value) {
      element.setAttribute(attributeName, value);
    }
  }

  if (tagName === 'img') {
    const src = originalAttributes.get('src')?.trim() ?? '';
    if (SAFE_IMG_SRC_PATTERN.test(src)) {
      element.setAttribute('src', src);
    }
  }
}

function sanitizeElementAttributes(element, { signatureMode = false } = {}) {
  const tagName = element.tagName.toLowerCase();
  const href = element.getAttribute('href');
  const style = element.getAttribute('style');
  const originalAttributes = new Map(
    [...element.attributes].map((attribute) => [attribute.name.toLowerCase(), attribute.value])
  );

  for (const attribute of [...element.attributes]) {
    element.removeAttribute(attribute.name);
  }

  if (tagName === 'a' && href && isAllowedHref(href)) {
    element.setAttribute('href', href.trim());
  }

  if (style) {
    const sanitizedStyle = sanitizeStyle(
      style,
      signatureMode ? SIGNATURE_ALLOWED_STYLE_PROPERTIES : ALLOWED_STYLE_PROPERTIES
    );
    if (sanitizedStyle) {
      element.setAttribute('style', sanitizedStyle);
    }
  }

  if (signatureMode) {
    sanitizeSignatureElementAttributes(element, originalAttributes);
  }
}

function sanitizeNode(node, { allowedElements, allowedImages, signatureMode = false }) {
  if (node.nodeType === 3) {
    return;
  }

  if (node.nodeType !== 1) {
    node.remove();
    return;
  }

  const element = node;
  const tagName = element.tagName.toLowerCase();

  if (!signatureMode && isAllowedImage(element, allowedImages)) {
    return;
  }

  if (DISCARD_CONTENT_ELEMENTS.has(tagName)) {
    element.remove();
    return;
  }

  for (const child of [...element.childNodes]) {
    sanitizeNode(child, { allowedElements, allowedImages, signatureMode });
  }

  if (!allowedElements.has(tagName)) {
    element.replaceWith(...element.childNodes);
    return;
  }

  sanitizeElementAttributes(element, { signatureMode });
}

function allowlistHtmlWithDomParser(
  html,
  { allowedElements, allowedImages, DOMParserImpl, signatureMode }
) {
  const parser = new DOMParserImpl();
  const document = parser.parseFromString(html, 'text/html');

  for (const node of [...document.body.childNodes]) {
    sanitizeNode(node, { allowedElements, allowedImages, signatureMode });
  }

  return document.body.innerHTML;
}

function stripDiscardedFallback(html) {
  return html.replace(
    /<\s*(script|style|template|svg|math|iframe|object|embed|link|meta|base)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>|<\s*(link|meta|base)\b[^>]*>/gi,
    ''
  );
}

function readAttributeFromRaw(rawAttributes, attributeName) {
  const pattern = new RegExp(
    `\\b${attributeName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\\\`]+))`,
    'i'
  );
  const match = rawAttributes.match(pattern);

  return match?.[1] ?? match?.[2] ?? match?.[3] ?? '';
}

function sanitizeSignatureAttributesFallback(tagName, rawAttributes) {
  const attributes = [];
  const safeAttributes = [
    ['align', /^(?:left|right|center|justify)$/i],
    ['valign', /^(?:top|middle|bottom|baseline)$/i],
    ['cellpadding', /^\d{1,3}$/],
    ['cellspacing', /^\d{1,3}$/],
    ['border', /^\d{1,3}$/],
    ['alt', /^[^<>]{0,300}$/],
    ['title', /^[^<>]{0,300}$/],
  ];

  for (const attributeName of ['class', 'id']) {
    const value = sanitizeTokenAttribute(readAttributeFromRaw(rawAttributes, attributeName));
    if (value) {
      attributes.push(`${attributeName}="${escapeHtml(value)}"`);
    }
  }

  for (const attributeName of ['width', 'height']) {
    const value = sanitizeDimensionAttribute(readAttributeFromRaw(rawAttributes, attributeName));
    if (value) {
      attributes.push(`${attributeName}="${escapeHtml(value)}"`);
    }
  }

  for (const [attributeName, pattern] of safeAttributes) {
    const value = readAttributeFromRaw(rawAttributes, attributeName).trim();
    if (value && pattern.test(value)) {
      attributes.push(`${attributeName}="${escapeHtml(value)}"`);
    }
  }

  if (tagName === 'img') {
    const src = readAttributeFromRaw(rawAttributes, 'src').trim();
    if (SAFE_IMG_SRC_PATTERN.test(src)) {
      attributes.push(`src="${escapeHtml(src)}"`);
    }
  }

  return attributes;
}

function sanitizeAttributesFallback(tagName, rawAttributes, { signatureMode = false } = {}) {
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
    const sanitizedStyle = sanitizeStyle(
      style,
      signatureMode ? SIGNATURE_ALLOWED_STYLE_PROPERTIES : ALLOWED_STYLE_PROPERTIES
    );
    if (sanitizedStyle) {
      attributes.push(`style="${escapeHtml(sanitizedStyle)}"`);
    }
  }

  if (signatureMode) {
    attributes.push(...sanitizeSignatureAttributesFallback(tagName, rawAttributes));
  }

  return attributes.length ? ` ${attributes.join(' ')}` : '';
}

function allowlistHtmlWithScanner(html, { allowedElements, allowedImages, signatureMode }) {
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

      if (!allowedElements.has(normalizedTag)) {
        return '';
      }

      if (slash) {
        return `</${normalizedTag}>`;
      }

      return `<${normalizedTag}${sanitizeAttributesFallback(normalizedTag, attrs, {
        signatureMode,
      })}>`;
    }
  );

  for (const [token, imageHtml] of imagePlaceholders.entries()) {
    sanitized = sanitized.split(token).join(imageHtml);
  }

  return sanitized;
}

export function allowlistHtml(
  html,
  { allowedCidImageHtml = [], DOMParserImpl = globalThis.DOMParser, signatureMode = false } = {}
) {
  if (typeof html !== 'string') {
    throw new SanitizerError('HTML input must be a string.', {
      code: 'invalid_sanitizer_input',
    });
  }

  const allowedImages = normalizeAllowedImages(allowedCidImageHtml);
  const allowedElements = signatureMode ? SIGNATURE_ALLOWED_ELEMENTS : ALLOWED_ELEMENTS;

  if (typeof DOMParserImpl === 'function') {
    return allowlistHtmlWithDomParser(html, {
      allowedElements,
      allowedImages,
      DOMParserImpl,
      signatureMode,
    });
  }

  return allowlistHtmlWithScanner(html, { allowedElements, allowedImages, signatureMode });
}
