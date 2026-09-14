import { extractTextBlocks, fetchProviderJson, registerProvider } from './index.js';

const ENDPOINT_HOST = 'api.anthropic.com';
const DEFAULT_BASE_URL = `https://${ENDPOINT_HOST}/v1`;
const API_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 4096;

function createMessagesUrl(baseUrl = DEFAULT_BASE_URL) {
  const url = new URL(baseUrl);
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith('/messages') ? path : `${path}/messages`.replace(/^\/?/, '/');
  return url.toString();
}

async function createMessage({
  baseUrl,
  key,
  model,
  system,
  user,
  signal,
  fetchImpl,
  maxTokens = DEFAULT_MAX_TOKENS,
}) {
  const url = createMessagesUrl(baseUrl);
  const body = await fetchProviderJson(url, {
    body: JSON.stringify({
      max_tokens: maxTokens,
      messages: [
        {
          content: user,
          role: 'user',
        },
      ],
      model: model ?? anthropicProvider.defaultModel,
      system,
    }),
    endpointHost: new URL(url).hostname,
    fetchImpl,
    headers: {
      'anthropic-dangerous-direct-browser-access': 'true',
      'anthropic-version': API_VERSION,
      'content-type': 'application/json',
      'x-api-key': key,
    },
    method: 'POST',
    signal,
  });

  return extractTextBlocks(body);
}

const anthropicProvider = {
  id: 'anthropic',
  label: 'Anthropic',
  defaultModel: 'claude-opus-5',
  modelList: ['claude-opus-5', 'claude-sonnet-5', 'claude-fable-5', 'claude-haiku-4-5'],
  defaultBaseUrl: DEFAULT_BASE_URL,
  keyHelpUrl: 'https://console.anthropic.com/settings/keys',
  endpointHost: ENDPOINT_HOST,
  async testConnection(key, options = {}) {
    try {
      await createMessage({
        key,
        maxTokens: 4,
        model: this.defaultModel,
        system: 'Reply with OK.',
        user: 'Connection test.',
        ...options,
      });
      return true;
    } catch (error) {
      if (options.throwOnError) {
        throw error;
      }

      return false;
    }
  },
  async rewrite({ key, baseUrl, model, system, user, signal, fetchImpl }) {
    return createMessage({
      baseUrl,
      key,
      model,
      system,
      user,
      signal,
      fetchImpl,
    });
  },
};

export default registerProvider(anthropicProvider);
