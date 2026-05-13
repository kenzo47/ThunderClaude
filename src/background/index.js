const thunderbird = globalThis.messenger ?? globalThis.browser;

thunderbird.runtime.onInstalled.addListener(() => {
  console.info('ThunderClaude installed.');
});
