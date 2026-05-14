import { warn } from '../lib/log.js';
import { ensureCustomEndpointPermission } from '../lib/host-permissions.js';

const thunderbird = globalThis.messenger ?? globalThis.browser;

const status = document.querySelector('#status');
const phraseForm = document.querySelector('#phrase-form');
const storagePhraseInput = document.querySelector('#storage-phrase');
const lockButton = document.querySelector('#lock');
const providerList = document.querySelector('#provider-list');
const providerForm = document.querySelector('#provider-form');
const providerName = document.querySelector('#provider-name');
const providerHost = document.querySelector('#provider-host');
const keyHelp = document.querySelector('#key-help');
const defaultModel = document.querySelector('#default-model');
const customModelField = document.querySelector('#custom-model-field');
const customModel = document.querySelector('#custom-model');
const baseUrlField = document.querySelector('#base-url-field');
const baseUrl = document.querySelector('#base-url');
const localAccessField = document.querySelector('#local-access-field');
const localAccess = document.querySelector('#local-access');
const apiKey = document.querySelector('#api-key');
const keyStatus = document.querySelector('#key-status');
const errorMessage = document.querySelector('#error');
const testButton = document.querySelector('#test-provider');
const keyModeInputs = [...document.querySelectorAll('[name="key-mode"]')];

let snapshot = null;
let selectedProviderId = null;

function setStatus(message) {
  status.textContent = message;
}

function setError(message) {
  errorMessage.hidden = !message;
  errorMessage.textContent = message ?? '';
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
    throw new Error(response?.error?.message ?? 'Options request failed.');
  }

  return response.result;
}

function getSelectedProvider() {
  return snapshot.providers.find((provider) => provider.id === selectedProviderId);
}

function getSelectedConfig() {
  return snapshot.providerConfigs[selectedProviderId];
}

function selectedKeyMode() {
  return keyModeInputs.find((input) => input.checked)?.value ?? 'encrypted';
}

function renderProviderList() {
  providerList.replaceChildren(
    ...snapshot.providers.map((provider) => {
      const button = document.createElement('button');
      button.className = 'provider-button';
      button.type = 'button';
      button.dataset.providerId = provider.id;
      button.classList.toggle('is-selected', provider.id === selectedProviderId);
      button.textContent = provider.label;
      button.addEventListener('click', () => {
        selectedProviderId = provider.id;
        render();
      });
      return button;
    })
  );
}

function renderProviderForm() {
  const provider = getSelectedProvider();
  const config = getSelectedConfig();
  const configuredModel = config.defaultModel;
  const modelList = provider.modelList.includes(configuredModel)
    ? provider.modelList
    : [...provider.modelList, 'custom'];
  const visibleModel = modelList.includes(configuredModel) ? configuredModel : 'custom';

  providerName.textContent = provider.label;
  providerHost.textContent =
    provider.endpointHost === 'user-configured' ? 'Custom endpoint' : provider.endpointHost;
  keyHelp.href = provider.keyHelpUrl;
  defaultModel.replaceChildren(...modelList.map((model) => createOption(model)));
  defaultModel.value = visibleModel;
  customModel.value = visibleModel === 'custom' ? configuredModel : '';
  customModelField.hidden = visibleModel !== 'custom';
  baseUrlField.hidden = provider.id !== 'openai-compatible';
  baseUrl.value = config.customBaseUrl;
  localAccessField.hidden = provider.id !== 'ollama';
  localAccess.checked = Boolean(config.localAccessEnabled);
  apiKey.value = '';

  for (const radio of keyModeInputs) {
    radio.checked = radio.value === config.keyMode;
    radio.disabled = provider.id === 'ollama';
  }

  keyStatus.textContent = config.hasKey ? 'A key is stored for this provider.' : 'No key stored.';
}

function renderSession() {
  lockButton.disabled = snapshot.session.locked;
}

function render() {
  renderProviderList();
  renderProviderForm();
  renderSession();
}

function providerPayload() {
  const provider = getSelectedProvider();
  const model = defaultModel.value === 'custom' ? customModel.value.trim() : defaultModel.value;

  if (!model) {
    throw new Error('Enter a custom model.');
  }

  if (provider.id === 'openai-compatible' && !baseUrl.value.trim()) {
    throw new Error('Enter a base URL.');
  }

  return {
    apiKey: apiKey.value.trim(),
    customBaseUrl: provider.id === 'openai-compatible' ? baseUrl.value.trim() : '',
    defaultModel: model,
    keyMode: provider.id === 'ollama' ? 'none' : selectedKeyMode(),
    localAccessEnabled: provider.id === 'ollama' ? localAccess.checked : false,
    providerId: provider.id,
  };
}

async function refresh() {
  snapshot = await sendMessage({
    action: 'options:getSnapshot',
  });
  selectedProviderId ??= snapshot.settings.defaultProviderId;
  if (!snapshot.providers.some((provider) => provider.id === selectedProviderId)) {
    selectedProviderId = snapshot.providers[0].id;
  }
  render();
}

phraseForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setError(null);

  try {
    snapshot = await sendMessage({
      action: 'options:unlock',
      storagePhrase: storagePhraseInput.value,
    });
    storagePhraseInput.value = '';
    render();
    setStatus('Encrypted key storage unlocked.');
  } catch (error) {
    setError(error.message);
  }
});

lockButton.addEventListener('click', async () => {
  snapshot = await sendMessage({
    action: 'options:lock',
  });
  render();
  setStatus('Encrypted key storage locked.');
});

defaultModel.addEventListener('change', () => {
  customModelField.hidden = defaultModel.value !== 'custom';
});

providerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setError(null);

  try {
    const payload = providerPayload();
    await ensureCustomEndpointPermission(
      payload.providerId,
      payload.customBaseUrl,
      thunderbird.permissions
    );
    snapshot = await sendMessage({
      action: 'options:saveProvider',
      ...payload,
    });
    apiKey.value = '';
    render();
    setStatus('Provider settings saved.');
  } catch (error) {
    setError(error.message);
  }
});

testButton.addEventListener('click', async () => {
  setError(null);
  testButton.disabled = true;
  setStatus('Testing provider connection...');

  try {
    const payload = providerPayload();
    await ensureCustomEndpointPermission(
      payload.providerId,
      payload.customBaseUrl,
      thunderbird.permissions
    );
    const result = await sendMessage({
      action: 'options:testProvider',
      ...payload,
    });
    setStatus(
      result.verified
        ? 'Connection test passed.'
        : result.connected
          ? 'Connection test passed for unsaved settings.'
          : 'Connection test failed.'
    );
  } catch (error) {
    setError(error.message);
    setStatus('Connection test failed.');
  } finally {
    testButton.disabled = false;
  }
});

try {
  await refresh();
  setStatus(
    snapshot.session.locked ? 'Settings loaded. Encrypted storage is locked.' : 'Settings loaded.'
  );
} catch (error) {
  warn('ThunderClaude options failed to load.', error);
  setError(error.message);
  setStatus('Options failed to load.');
}
