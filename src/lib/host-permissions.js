const OPENAI_COMPATIBLE_PROVIDER_ID = 'openai-compatible';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function createCustomEndpointOriginPattern(baseUrl) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('OpenAI-compatible base URL is invalid.');
  }

  if (url.search || url.hash) {
    throw new Error('OpenAI-compatible base URL cannot include query or fragment.');
  }

  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))
  ) {
    throw new Error('OpenAI-compatible base URL must use HTTPS unless it is loopback.');
  }

  return `${url.protocol}//${url.host}/*`;
}

export async function ensureCustomEndpointPermission(providerId, baseUrl, permissionsApi) {
  if (providerId !== OPENAI_COMPATIBLE_PROVIDER_ID) {
    return null;
  }

  const origin = createCustomEndpointOriginPattern(baseUrl);
  const permission = {
    origins: [origin],
  };

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
