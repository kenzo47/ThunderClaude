const thunderbird = globalThis.messenger ?? globalThis.browser;

const FALLBACK_PROVIDERS = [
  {
    defaultModel: 'claude-opus-4-7',
    id: 'anthropic',
    label: 'Anthropic',
    modelList: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
  },
  {
    defaultModel: 'gpt-5.4',
    id: 'openai',
    label: 'OpenAI',
    modelList: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-4.1-nano'],
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
const targetLanguageField = document.querySelector('#target-language-field');
const targetLanguage = document.querySelector('#target-language');
const presetButtons = [...document.querySelectorAll('[data-preset]')];

let activeTabId = null;
let optionsSnapshot = null;
let providers = FALLBACK_PROVIDERS;
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
    targetLanguage,
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

async function sendMessage(message) {
  const response = await thunderbird.runtime.sendMessage(message);

  if (!response?.ok) {
    throw new Error(response?.error?.message ?? 'ThunderClaude request failed.');
  }

  return response.result;
}

async function loadOptionsSnapshot() {
  try {
    optionsSnapshot = await sendMessage({
      action: 'options:getSnapshot',
    });

    if (!optionsSnapshot.settings.onboardingComplete) {
      setControlsDisabled(true);
      globalThis.location.href = '../onboarding/welcome.html';
      return false;
    }

    providers = optionsSnapshot.providers;
  } catch (error) {
    console.warn('ThunderClaude popup could not load defaults.', error);
  }

  return true;
}

function renderProviders() {
  providerSelect.replaceChildren(
    ...providers.map((provider) => createOption(provider.id, provider.label))
  );

  if (optionsSnapshot?.settings?.defaultProviderId) {
    providerSelect.value = optionsSnapshot.settings.defaultProviderId;
  }
}

function getSelectedProvider() {
  return providers.find((provider) => provider.id === providerSelect.value) ?? providers[0];
}

function isOpenAiCompatible(provider) {
  return provider.id === 'openai-compatible';
}

function renderModels() {
  const provider = getSelectedProvider();
  const configuredModel =
    optionsSnapshot?.settings?.defaultModelByProvider?.[provider.id] ?? provider.defaultModel;
  const modelList = provider.modelList.includes(configuredModel)
    ? provider.modelList
    : [...provider.modelList, 'custom'];

  modelSelect.replaceChildren(...modelList.map((model) => createOption(model)));
  modelSelect.value = modelList.includes(configuredModel) ? configuredModel : 'custom';
  customModelInput.value = modelSelect.value === 'custom' ? configuredModel : '';
  customModelField.hidden = modelSelect.value !== 'custom';
  baseUrlField.hidden = !isOpenAiCompatible(provider);
  baseUrlInput.value = optionsSnapshot?.settings?.customBaseUrlByProvider?.[provider.id] ?? '';
}

function selectPreset(button) {
  selectedPreset = button.dataset.preset;

  for (const presetButton of presetButtons) {
    const isSelected = presetButton === button;
    presetButton.classList.toggle('is-selected', isSelected);
    presetButton.setAttribute('aria-checked', String(isSelected));
  }

  targetLanguageField.hidden = selectedPreset !== 'translate';
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

  if (isOpenAiCompatible(provider) && !baseUrl) {
    throw new Error('Enter a base URL.');
  }

  return {
    action: 'rewrite',
    baseUrl: isOpenAiCompatible(provider) ? baseUrl : undefined,
    customModel: modelId === 'custom' ? customModel : undefined,
    customPrompt: custom,
    modelId,
    preset: custom ? undefined : selectedPreset,
    providerId: provider.id,
    tabId: activeTabId,
    targetLanguage: selectedPreset === 'translate' && !custom ? targetLanguage.value : undefined,
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

  await sendMessage(currentPayload());

  status.textContent = 'Draft rewritten.';
}

const popupCanContinue = await loadOptionsSnapshot();

if (popupCanContinue) {
  renderProviders();
  renderModels();
}

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
  if (popupCanContinue) {
    await detectComposeTab();
  }
} catch (error) {
  console.warn('ThunderClaude popup could not read compose details.', error);
  status.textContent = error.message;
  setControlsDisabled(true);
}
