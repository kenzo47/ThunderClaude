const thunderbird = globalThis.messenger ?? globalThis.browser;

const PROVIDERS = [
  {
    defaultModel: 'claude-opus-4-7',
    id: 'anthropic',
    label: 'Anthropic',
    models: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
  },
  {
    defaultModel: 'gpt-5.4',
    id: 'openai',
    label: 'OpenAI',
    models: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-4.1-nano'],
  },
  {
    defaultModel: 'gemini-2.5-pro',
    id: 'gemini',
    label: 'Google Gemini',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
  },
  {
    defaultModel: 'MiniMax-M2',
    id: 'minimax',
    label: 'MiniMax',
    models: ['MiniMax-M2', 'MiniMax-M2-Pro', 'MiniMax-M2-Reasoning'],
  },
  {
    defaultModel: 'deepseek-v4-flash',
    id: 'deepseek',
    label: 'DeepSeek',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'],
  },
  {
    defaultModel: 'openai/gpt-5.4',
    id: 'openrouter',
    label: 'OpenRouter',
    models: ['openai/gpt-5.4', 'anthropic/claude-opus-4.7', 'google/gemini-2.5-pro', 'custom'],
  },
  {
    defaultModel: 'llama3.2',
    id: 'ollama',
    label: 'Ollama',
    models: ['llama3.2', 'gemma3', 'qwen3', 'mistral', 'custom'],
  },
  {
    defaultModel: 'custom',
    id: 'openai-compatible',
    label: 'OpenAI-Compatible',
    models: ['custom'],
    needsBaseUrl: true,
  },
];

const status = document.querySelector('#status');
const composeMode = document.querySelector('#compose-mode');
const form = document.querySelector('#rewrite-form');
const rewriteButton = document.querySelector('#rewrite');
const errorMessage = document.querySelector('#error');
const providerSelect = document.querySelector('#provider');
const modelSelect = document.querySelector('#model');
const customModelField = document.querySelector('#custom-model-field');
const customModelInput = document.querySelector('#custom-model');
const baseUrlField = document.querySelector('#base-url-field');
const baseUrlInput = document.querySelector('#base-url');
const customPrompt = document.querySelector('#custom-prompt');
const presetButtons = [...document.querySelectorAll('[data-preset]')];

let activeTabId = null;
let selectedPreset = 'make-formal';

function setError(message) {
  errorMessage.hidden = !message;
  errorMessage.textContent = message ?? '';
}

function setControlsDisabled(disabled) {
  for (const control of [
    ...presetButtons,
    providerSelect,
    modelSelect,
    customModelInput,
    baseUrlInput,
    customPrompt,
    rewriteButton,
  ]) {
    control.disabled = disabled;
  }
}

function updateRewriteAvailability() {
  rewriteButton.disabled = !activeTabId;
}

function createOption(value, label = value) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function renderProviders() {
  providerSelect.replaceChildren(
    ...PROVIDERS.map((provider) => createOption(provider.id, provider.label))
  );
}

function getSelectedProvider() {
  return PROVIDERS.find((provider) => provider.id === providerSelect.value) ?? PROVIDERS[0];
}

function renderModels() {
  const provider = getSelectedProvider();
  modelSelect.replaceChildren(...provider.models.map((model) => createOption(model)));
  modelSelect.value = provider.defaultModel;
  customModelField.hidden = modelSelect.value !== 'custom';
  baseUrlField.hidden = !provider.needsBaseUrl;
}

function selectPreset(button) {
  selectedPreset = button.dataset.preset;

  for (const presetButton of presetButtons) {
    const isSelected = presetButton === button;
    presetButton.classList.toggle('is-selected', isSelected);
    presetButton.setAttribute('aria-checked', String(isSelected));
  }
}

function currentPayload() {
  const custom = customPrompt.value.trim();
  const provider = getSelectedProvider();
  const modelId = modelSelect.value;
  const customModel = customModelInput.value.trim();
  const baseUrl = baseUrlInput.value.trim();

  if (modelId === 'custom' && !customModel) {
    throw new Error('Enter a custom model.');
  }

  if (provider.needsBaseUrl && !baseUrl) {
    throw new Error('Enter a base URL.');
  }

  return {
    action: 'rewrite',
    baseUrl: provider.needsBaseUrl ? baseUrl : undefined,
    customModel: modelId === 'custom' ? customModel : undefined,
    customPrompt: custom,
    modelId,
    preset: custom ? undefined : selectedPreset,
    providerId: provider.id,
    tabId: activeTabId,
  };
}

async function detectComposeTab() {
  const [tab] = await thunderbird.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error('Open a compose window to use ThunderClaude.');
  }

  const details = await thunderbird.compose.getComposeDetails(tab.id);
  activeTabId = tab.id;
  composeMode.hidden = false;
  composeMode.textContent = details.isPlainText ? 'Plain text' : 'HTML';
  status.textContent = 'Ready to rewrite this draft.';
  updateRewriteAvailability();
}

async function submitRewrite() {
  setError(null);
  setControlsDisabled(true);
  status.textContent = 'Rewriting draft...';

  const response = await thunderbird.runtime.sendMessage(currentPayload());

  if (!response?.ok) {
    throw new Error(response?.error?.message ?? 'Rewrite failed.');
  }

  status.textContent = 'Draft rewritten.';
}

renderProviders();
renderModels();

for (const button of presetButtons) {
  button.setAttribute('role', 'radio');
  button.setAttribute('aria-checked', String(button.classList.contains('is-selected')));
  button.addEventListener('click', () => selectPreset(button));
}

providerSelect.addEventListener('change', () => {
  renderModels();
  setError(null);
});

modelSelect.addEventListener('change', () => {
  customModelField.hidden = modelSelect.value !== 'custom';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    await submitRewrite();
  } catch (error) {
    console.warn('ThunderClaude rewrite failed.', error);
    setError(error.message);
    status.textContent = 'Rewrite failed.';
  } finally {
    setControlsDisabled(false);
    updateRewriteAvailability();
  }
});

try {
  await detectComposeTab();
} catch (error) {
  console.warn('ThunderClaude popup could not read compose details.', error);
  status.textContent = error.message;
  setControlsDisabled(true);
}
