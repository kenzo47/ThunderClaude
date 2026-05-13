const thunderbird = globalThis.messenger ?? globalThis.browser;

const status = document.querySelector('#status');

async function readComposeStatus() {
  const [tab] = await thunderbird.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    return 'Open a compose window to use ThunderClaude.';
  }

  const details = await thunderbird.compose.getComposeDetails(tab.id);
  const mode = details.isPlainText ? 'plain-text' : 'HTML';
  return `Compose draft detected (${mode}). Rewrite controls land in a later step.`;
}

try {
  status.textContent = await readComposeStatus();
} catch (error) {
  console.warn('ThunderClaude popup could not read compose details.', error);
  status.textContent = 'Open a compose window to use ThunderClaude.';
}
