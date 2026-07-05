export const SUPPORTED_LANGUAGES = [
  { code: 'en', nativeName: 'English' },
  { code: 'no', nativeName: 'Norsk' },
  { code: 'ru', nativeName: 'Русский' },
  { code: 'es', nativeName: 'Español' },
  { code: 'de', nativeName: 'Deutsch' },
  { code: 'fr', nativeName: 'Français' },
  { code: 'zh', nativeName: '中文' },
  { code: 'it', nativeName: 'Italiano' },
  { code: 'pt', nativeName: 'Português' },
  { code: 'pl', nativeName: 'Polski' }
];

const SUPPORTED_CODES = new Set(SUPPORTED_LANGUAGES.map((language) => language.code));
const LOCALE_VERSION = 'clean-ui-2026-07-05';

export function createI18n({
  basePath = './locales',
  defaultLanguage = 'en',
  storageKey = 'mandel-v2.language'
} = {}) {
  const cache = new Map();
  const state = {
    language: normalizeLanguage(localStorage.getItem(storageKey)) || detectBrowserLanguage() || defaultLanguage,
    dictionary: {}
  };

  async function loadDictionary(language) {
    const normalized = normalizeLanguage(language) || defaultLanguage;
    if (cache.has(normalized)) return cache.get(normalized);

    const response = await fetch(`${basePath}/${normalized}.json?v=${LOCALE_VERSION}`, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`Cannot load locale: ${normalized}`);
    }

    const dictionary = await response.json();
    cache.set(normalized, dictionary);
    return dictionary;
  }

  async function setLanguage(language) {
    const normalized = normalizeLanguage(language) || defaultLanguage;
    state.dictionary = await loadDictionary(normalized);
    state.language = normalized;

    document.documentElement.lang = normalized;
    document.body.dataset.lang = normalized;
    localStorage.setItem(storageKey, normalized);
    applyTranslations();

    window.dispatchEvent(new CustomEvent('i18n:change', {
      detail: { language: normalized, dictionary: state.dictionary }
    }));
  }

  function t(key, params = {}, fallback = '') {
    const value = getByPath(state.dictionary, key);
    if (typeof value !== 'string') return fallback || key;
    return interpolate(value, params);
  }

  function applyTranslations(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((node) => {
      node.textContent = t(node.dataset.i18n, {}, node.textContent);
    });

    root.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
      node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder, {}, node.getAttribute('placeholder') || ''));
    });

    root.querySelectorAll('[data-i18n-title]').forEach((node) => {
      node.setAttribute('title', t(node.dataset.i18nTitle, {}, node.getAttribute('title') || ''));
    });

    root.querySelectorAll('[data-i18n-aria-label]').forEach((node) => {
      node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel, {}, node.getAttribute('aria-label') || ''));
    });
  }

  function bindLanguageSelect(select) {
    const element = typeof select === 'string' ? document.querySelector(select) : select;
    if (!element) return;

    element.replaceChildren(...SUPPORTED_LANGUAGES.map((language) => {
      const option = document.createElement('option');
      option.value = language.code;
      option.textContent = language.nativeName;
      return option;
    }));

    element.value = state.language;
    element.addEventListener('change', () => setLanguage(element.value));
    window.addEventListener('i18n:change', (event) => {
      element.value = event.detail.language;
    });
  }

  async function init({ languageSelect } = {}) {
    bindLanguageSelect(languageSelect);
    await setLanguage(state.language);
  }

  return {
    init,
    setLanguage,
    applyTranslations,
    t,
    get language() {
      return state.language;
    },
    get dictionary() {
      return state.dictionary;
    }
  };
}

function normalizeLanguage(language) {
  if (!language) return '';
  const code = String(language).toLowerCase().split('-')[0];
  return SUPPORTED_CODES.has(code) ? code : '';
}

function detectBrowserLanguage() {
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  return candidates.map(normalizeLanguage).find(Boolean) || '';
}

function getByPath(source, path) {
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), source);
}

function interpolate(value, params) {
  return value.replace(/\{(\w+)\}/g, (_, key) => (params[key] ?? ''));
}
