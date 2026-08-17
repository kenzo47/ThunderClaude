import { fetchProviderJson, ProviderError, registerProvider } from './index.js';

const ENDPOINT_HOST = 'api.openai.com';
const DEFAULT_BASE_URL = `https://${ENDPOINT_HOST}/v1`;
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

function createResponsesUrl(baseUrl = DEFAULT_BASE_URL) {
  const url = new URL(baseUrl);
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith('/responses') ? path : `${path}/responses`.replace(/^\/?/, '/');
  return url.toString();
}

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
  baseUrl,
  key,
  model,
  system,
  user,
  signal,
  fetchImpl,
  maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
}) {
  const url = createResponsesUrl(baseUrl);
  const body = await fetchProviderJson(url, {
    body: JSON.stringify({
      input: user,
      instructions: system,
      max_output_tokens: maxOutputTokens,
      model: model ?? openaiProvider.defaultModel,
      store: false,
    }),
    endpointHost: new URL(url).hostname,
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
  defaultModel: 'gpt-5.6-sol',
  modelList: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.4-mini'],
  defaultBaseUrl: DEFAULT_BASE_URL,
  keyHelpUrl: 'https://platform.openai.com/api-keys',
  endpointHost: ENDPOINT_HOST,
  async testConnection(key, options = {}) {
    try {
      await createResponse({
        key,
        maxOutputTokens: 16,
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
    return createResponse({
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

export default registerProvider(openaiProvider);
