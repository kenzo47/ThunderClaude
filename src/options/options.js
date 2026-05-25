import { warn } from '../lib/log.js';
import { ensureCustomEndpointPermission } from '../lib/host-permissions.js';
import { isOllamaLocalhostEndpoint } from '../lib/local-llm.js';

const thunderbird = globalThis.messenger ?? globalThis.browser;

const status = document.querySelector('#status');
const providerList = document.querySelector('#provider-list');
const providerForm = document.querySelector('#provider-form');
const providerName = document.querySelector('#provider-name');
const providerHost = document.querySelector('#provider-host');
const keyHelp = document.querySelector('#key-help');
const defaultModel = document.querySelector('#default-model');
const customModelField = document.querySelector('#custom-model-field');
const customModel = document.querySelector('#custom-model');
const baseUrl = document.querySelector('#base-url');
const localAccessField = document.querySelector('#local-access-field');
const localAccess = document.querySelector('#local-access');
const storageNote = document.querySelector('#storage-note');
const keyField = document.querySelector('#key-field');
const apiKey = document.querySelector('#api-key');
const keyStatus = document.querySelector('#key-status');
const errorMessage = document.querySelector('#error');
const testButton = document.querySelector('#test-provider');
const themeToggle = document.querySelector('#theme-toggle');

let snapshot = null;
let selectedProviderId = null;

function setStatus(message, tone = 'neutral') {
  status.textContent = message;
  status.dataset.tone = tone;
}

function setError(message) {
  errorMessage.hidden = !message;
  errorMessage.textContent = message ?? '';
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  themeToggle.checked = theme === 'dark';
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
  baseUrl.value = config.customBaseUrl || provider.defaultBaseUrl || '';
  renderLocalAccess(provider, config);
  keyField.hidden = provider.id === 'local-llms';
  storageNote.hidden = provider.id === 'local-llms';
  apiKey.value = '';

  keyStatus.textContent =
    provider.id === 'local-llms'
      ? 'Local LLMs use localhost access and do not store a provider key.'
      : config.hasKey
        ? 'A key is stored for this provider, encrypted with a profile-local AES-GCM key.'
        : 'No key stored for this provider.';
}

function renderLocalAccess(provider = getSelectedProvider(), config = getSelectedConfig()) {
  const showLocalAccess =
    provider.id === 'local-llms' && isOllamaLocalhostEndpoint(baseUrl.value.trim());

  localAccessField.hidden = !showLocalAccess;
  localAccess.checked = showLocalAccess ? config.localAccessEnabled !== false : false;
}

function render() {
  renderProviderList();
  renderProviderForm();
}

function providerPayload() {
  const provider = getSelectedProvider();
  const model = defaultModel.value === 'custom' ? customModel.value.trim() : defaultModel.value;

  if (!model) {
    throw new Error('Enter a custom model.');
  }

  if (!baseUrl.value.trim()) {
    throw new Error('Enter a base URL.');
  }

  return {
    apiKey: apiKey.value.trim(),
    customBaseUrl: baseUrl.value.trim(),
    defaultModel: model,
    keyMode: provider.id === 'local-llms' ? 'none' : 'encrypted',
    localAccessEnabled:
      provider.id === 'local-llms' && isOllamaLocalhostEndpoint(baseUrl.value.trim())
        ? localAccess.checked
        : false,
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
  applyTheme(snapshot.settings.theme);
  render();
}

defaultModel.addEventListener('change', () => {
  customModelField.hidden = defaultModel.value !== 'custom';
});

baseUrl.addEventListener('input', () => {
  renderLocalAccess();
});

providerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setError(null);
  setStatus('Testing provider connection before saving...', 'neutral');

  try {
    const payload = providerPayload();
    await ensureCustomEndpointPermission(
      payload.providerId,
      payload.customBaseUrl,
      thunderbird.permissions
    );
    snapshot = await sendMessage({
      action: 'options:testAndSaveProvider',
      ...payload,
    });
    apiKey.value = '';
    render();
    setStatus('Connection test passed. Provider settings were saved.', 'success');
  } catch (error) {
    setError(error.message);
    setStatus(`Save blocked: ${error.message}`, 'error');
  }
});

testButton.addEventListener('click', async () => {
  setError(null);
  testButton.disabled = true;
  setStatus('Testing provider connection...', 'neutral');

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
    if (result.verified) {
      setStatus('Connection test passed. Saved settings are verified.', 'success');
    } else if (result.connected) {
      setStatus('Connection test passed, but these settings are not saved yet.', 'warning');
    } else {
      setStatus(
        `Connection test failed${result.error?.message ? `: ${result.error.message}` : '.'}`,
        'error'
      );
    }
  } catch (error) {
    setError(error.message);
    setStatus(`Connection test failed: ${error.message}`, 'error');
  } finally {
    testButton.disabled = false;
  }
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
    snapshot = {
      ...snapshot,
      settings,
    };
    setStatus('Theme saved.');
  } catch (error) {
    setError(error.message);
    applyTheme(snapshot?.settings?.theme);
  }
});

try {
  await refresh();
  setStatus('Settings loaded.');
} catch (error) {
  warn('ThunderClaude options failed to load.', error);
  setError(error.message);
  setStatus('Options failed to load.');
}
