export function message(name, substitutions, { i18n = globalThis.messenger?.i18n } = {}) {
  if (!name) {
    return '';
  }

  const translated = i18n?.getMessage?.(name, substitutions);
  return translated || name;
}
