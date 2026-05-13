import { fetchProviderJson, ProviderError, registerProvider } from './index.js';

const ENDPOINT_HOST = 'api.openai.com';
const RESPONSES_URL = `https://${ENDPOINT_HOST}/v1/responses`;
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

function extractOpenAiText(body) {
  if (!Array.isArray(body?.output)) {
    throw new ProviderError('Provider response did not include output items.', {
      code: 'malformed_response',
    });
  }

  const text = body.output
    .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .filter((part) => part?.type === 'output_text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');

  if (!text) {
    throw new ProviderError('Provider response did not include text output.', {
      code: 'empty_response',
    });
  }

  return text;
}

async function createResponse({
  key,
  model,
  system,
  user,
  signal,
  fetchImpl,
  maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
}) {
  const body = await fetchProviderJson(RESPONSES_URL, {
    body: JSON.stringify({
      input: user,
      instructions: system,
      max_output_tokens: maxOutputTokens,
      model: model ?? openaiProvider.defaultModel,
      store: false,
    }),
    endpointHost: ENDPOINT_HOST,
    fetchImpl,
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    method: 'POST',
    signal,
  });

  return extractOpenAiText(body);
}

const openaiProvider = {
  id: 'openai',
  label: 'OpenAI',
  defaultModel: 'gpt-5.4',
  modelList: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-4.1-nano'],
  keyHelpUrl: 'https://platform.openai.com/api-keys',
  endpointHost: ENDPOINT_HOST,
  async testConnection(key, options = {}) {
    try {
      await createResponse({
        key,
        maxOutputTokens: 8,
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
    return createResponse({
      key,
      model,
      system,
      user,
      signal,
      fetchImpl,
    });
  },
};

export default registerProvider(openaiProvider);
