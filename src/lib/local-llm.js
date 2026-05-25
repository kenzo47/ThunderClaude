const OLLAMA_LOCALHOST_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const OLLAMA_DEFAULT_PORT = '11434';

/**
 * Detects the default Ollama endpoint on a loopback host (localhost:11434).
 * The options and onboarding UIs use it to decide whether to surface the
 * "enable Ollama localhost access" control. This is intentionally distinct
 * from the Local LLMs provider's protocol-shape check, which classifies any
 * non-OpenAI-style base URL as Ollama regardless of host or port.
 *
 * @param {string} value Base URL to test.
 * @returns {boolean} True when the URL targets localhost:11434.
 */
export function isOllamaLocalhostEndpoint(value) {
  try {
    const url = new URL(value);
    return OLLAMA_LOCALHOST_HOSTS.includes(url.hostname) && url.port === OLLAMA_DEFAULT_PORT;
  } catch {
    return false;
  }
}
