const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const REQUIRED_ENDPOINT_ORIGINS = new Set([
  'http://localhost:11434/*',
  'http://localhost:1234/*',
  'https://api.anthropic.com/*',
  'https://api.deepseek.com/*',
  'https://api.minimax.io/*',
  'https://api.openai.com/*',
  'https://api.x.ai/*',
  'https://api.z.ai/*',
  'https://generativelanguage.googleapis.com/*',
  'https://openrouter.ai/*',
]);

export function createCustomEndpointOriginPattern(baseUrl) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('Provider base URL is invalid.');
  }

  if (url.search || url.hash) {
    throw new Error('Provider base URL cannot include query or fragment.');
  }

  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))
  ) {
    throw new Error('Provider base URL must use HTTPS unless it is loopback.');
  }

  return `${url.protocol}//${url.host}/*`;
}

export async function ensureCustomEndpointPermission(providerId, baseUrl, permissionsApi) {
  if (!providerId || !baseUrl) {
    return null;
  }

  const origin = createCustomEndpointOriginPattern(baseUrl);
  const permission = {
    origins: [origin],
  };

  if (REQUIRED_ENDPOINT_ORIGINS.has(origin)) {
    return origin;
  }

  if (!permissionsApi?.contains || !permissionsApi?.request) {
    throw new Error('Host permission requests are unavailable in this Thunderbird build.');
  }

  if (await permissionsApi.contains(permission)) {
    return origin;
  }

  if (!(await permissionsApi.request(permission))) {
    throw new Error('Allow access to the custom endpoint before testing or saving it.');
  }

  return origin;
}
