import { extractTextBlocks, fetchProviderJson, registerProvider } from './index.js';

const ENDPOINT_HOST = 'api.anthropic.com';
const MESSAGES_URL = `https://${ENDPOINT_HOST}/v1/messages`;
const API_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 4096;

async function createMessage({
  key,
  model,
  system,
  user,
  signal,
  fetchImpl,
  maxTokens = DEFAULT_MAX_TOKENS,
}) {
  const body = await fetchProviderJson(MESSAGES_URL, {
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
    endpointHost: ENDPOINT_HOST,
    fetchImpl,
    headers: {
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
  defaultModel: 'claude-opus-4-7',
  modelList: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
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
    } catch {
      return false;
    }
  },
  async rewrite({ key, model, system, user, signal, fetchImpl }) {
    return createMessage({
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
