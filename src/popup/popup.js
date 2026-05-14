import { warn } from '../lib/log.js';
const thunderbird = globalThis.messenger ?? globalThis.browser;

const status = document.querySelector('#status');
const composeMode = document.querySelector('#compose-mode');
const form = document.querySelector('#rewrite-form');
const rewriteButton = document.querySelector('#rewrite');
const errorMessage = document.querySelector('#error');
const providerSelect = document.querySelector('#provider');
const modelSelect = document.querySelector('#model');
const customModelField = document.querySelector('#custom-model-field');
const customModelInput = document.querySelector('#custom-model');
const customPrompt = document.querySelector('#custom-prompt');
const targetLanguageField = document.querySelector('#target-language-field');
const targetLanguage = document.querySelector('#target-language');
const allowImageRelocation = document.querySelector('#allow-image-relocation');
const themeToggle = document.querySelector('#theme-toggle');
const presetButtons = [...document.querySelectorAll('[data-preset]')];

let activeTabId = null;
let optionsSnapshot = null;
let providers = [];
let selectedPreset = 'make-formal';

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  themeToggle.checked = theme === 'dark';
}

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
    customPrompt,
    targetLanguage,
    allowImageRelocation,
    themeToggle,
    rewriteButton,
  ]) {
    control.disabled = disabled;
  }
}

function providerIsVerified(providerId) {
  return Boolean(
    optionsSnapshot?.providerConfigs?.[providerId]?.verified ||
    optionsSnapshot?.settings?.verifiedProviderIds?.[providerId]
  );
}

function selectedProviderVerified() {
  return providerIsVerified(getSelectedProvider()?.id);
}

function findVerifiedProviderId() {
  const defaultProviderId = optionsSnapshot?.settings?.defaultProviderId;
  if (defaultProviderId && providerIsVerified(defaultProviderId)) {
    return defaultProviderId;
  }

  return providers.find((provider) => providerIsVerified(provider.id))?.id ?? null;
}

function updateRewriteAvailability() {
  const providerVerified = selectedProviderVerified();
  rewriteButton.disabled = !activeTabId || !providerVerified;

  if (!activeTabId) {
    status.textContent = 'Open a compose window to use ThunderClaude.';
  } else if (!providerVerified) {
    status.textContent = 'Test this provider in options before rewriting.';
  } else {
    status.textContent = 'Ready to rewrite this draft.';
  }
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
    const error = new Error(response?.error?.message ?? 'ThunderClaude request failed.');
    error.code = response?.error?.code;
    throw error;
  }

  return response.result;
}

async function loadOptionsSnapshot() {
  try {
    optionsSnapshot = await sendMessage({
      action: 'options:getSnapshot',
    });
    applyTheme(optionsSnapshot.settings.theme);

    if (!optionsSnapshot.settings.onboardingComplete) {
      setControlsDisabled(true);
      globalThis.location.href = '../onboarding/welcome.html';
      return false;
    }

    providers = optionsSnapshot.providers;
  } catch (error) {
    warn('ThunderClaude popup could not load defaults.', error);
    setControlsDisabled(true);
    setError('ThunderClaude settings failed to load. Open options and try again.');
    status.textContent = 'Settings unavailable.';
    return false;
  }

  return true;
}

function renderProviders() {
  providerSelect.replaceChildren(
    ...providers.map((provider) => createOption(provider.id, provider.label))
  );

  providerSelect.value =
    findVerifiedProviderId() ?? optionsSnapshot?.settings?.defaultProviderId ?? providers[0]?.id;
}

function getSelectedProvider() {
  return providers.find((provider) => provider.id === providerSelect.value) ?? providers[0];
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

function readSelectionFromFrame() {
  const selection = globalThis.getSelection?.();
  return selection?.toString().trim() ?? '';
}

async function getSelectedText() {
  if (!thunderbird.scripting?.executeScript) {
    throw new Error('Select text in the compose window to draft a reply.');
  }

  let results;
  try {
    results = await thunderbird.scripting.executeScript({
      func: readSelectionFromFrame,
      injectImmediately: true,
      target: {
        allFrames: true,
        tabId: activeTabId,
      },
    });
  } catch {
    throw new Error('Select text in the compose window to draft a reply.');
  }

  return (results ?? []).map((entry) => entry?.result?.trim()).find(Boolean) ?? '';
}

async function currentPayload() {
  const custom = customPrompt.value.trim();
  const provider = getSelectedProvider();
  const modelId = modelSelect.value;
  const customModel = customModelInput.value.trim();
  let selectionText;

  if (modelId === 'custom' && !customModel) {
    throw new Error('Enter a custom model.');
  }

  if (!selectedProviderVerified()) {
    throw new Error('Test this provider in options before rewriting.');
  }

  if (selectedPreset === 'reply-draft' && !custom) {
    selectionText = await getSelectedText();

    if (!selectionText) {
      throw new Error('Select text in the compose window to draft a reply.');
    }
  } else {
    selectionText = await getSelectedText().catch(() => '');

    if (!selectionText && !globalThis.confirm('Rewrite full mail?')) {
      throw new Error('Rewrite canceled.');
    }
  }

  return {
    action: 'rewrite',
    allowImageRelocation: allowImageRelocation.checked,
    customModel: modelId === 'custom' ? customModel : undefined,
    customPrompt: custom,
    modelId,
    preset: custom ? undefined : selectedPreset,
    providerId: provider.id,
    selectionText,
    tabId: activeTabId,
    targetLanguage: selectedPreset === 'translate' && !custom ? targetLanguage.value : undefined,
  };
}

async function detectComposeTab() {
  const requestedTabIdParam = new URL(globalThis.location.href).searchParams.get('composeTabId');
  const requestedTabId = requestedTabIdParam === null ? null : Number(requestedTabIdParam);
  const [tab] =
    Number.isInteger(requestedTabId) && requestedTabId >= 0
      ? [{ id: requestedTabId }]
      : await thunderbird.tabs.query({ active: true, currentWindow: true });

  if (!Number.isInteger(tab?.id)) {
    throw new Error('Open a compose window to use ThunderClaude.');
  }

  const details = await thunderbird.compose.getComposeDetails(tab.id);
  activeTabId = tab.id;
  composeMode.hidden = false;
  composeMode.textContent = details.isPlainText ? 'Plain text' : 'HTML';
  updateRewriteAvailability();
}

async function submitRewrite() {
  setError(null);
  setControlsDisabled(true);
  status.textContent = 'Rewriting draft...';

  const payload = await currentPayload();
  await sendMessage(payload);

  status.textContent = 'Draft rewritten.';
}

const popupCanContinue = await loadOptionsSnapshot();

if (popupCanContinue) {
  renderProviders();
  renderModels();
  form.hidden = false;
}

for (const button of presetButtons) {
  button.setAttribute('role', 'radio');
  button.setAttribute('aria-checked', String(button.classList.contains('is-selected')));
  button.addEventListener('click', () => selectPreset(button));
}

providerSelect.addEventListener('change', () => {
  renderModels();
  setError(null);
  updateRewriteAvailability();
});

modelSelect.addEventListener('change', () => {
  customModelField.hidden = modelSelect.value !== 'custom';
});

themeToggle.addEventListener('change', async () => {
  setError(null);
  const theme = themeToggle.checked ? 'dark' : 'light';
  applyTheme(theme);

  try {
    const settings = await sendMessage({
      action: 'options:setTheme',
      theme,
    });
    optionsSnapshot = {
      ...optionsSnapshot,
      settings,
    };
  } catch (error) {
    setError(error.message);
    applyTheme(optionsSnapshot?.settings?.theme);
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    await submitRewrite();
  } catch (error) {
    warn('ThunderClaude rewrite failed.', error);
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
  warn('ThunderClaude popup could not read compose details.', error);
  status.textContent = error.message;
  setControlsDisabled(true);
}
