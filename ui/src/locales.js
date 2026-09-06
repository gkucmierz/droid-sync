import { ref, computed, watch } from 'vue';
import pl from './locales/pl.js';
import en from './locales/en.js';

const STORAGE_KEY = 'droid_sync_lang';
const defaultLang = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)
  ? localStorage.getItem(STORAGE_KEY)
  : (typeof navigator !== 'undefined' && navigator.language && navigator.language.startsWith('pl') ? 'pl' : 'en');

export const currentLang = ref(defaultLang);

if (typeof window !== 'undefined') {
  watch(currentLang, (val) => {
    try {
      localStorage.setItem(STORAGE_KEY, val);
      document.documentElement.lang = val;
    } catch {
      // Ignore storage errors
    }
  }, { immediate: true });
}

export const locales = { pl, en };

export function useI18n() {
  const t = computed(() => locales[currentLang.value] || locales.pl);
  const toggleLang = () => {
    currentLang.value = currentLang.value === 'pl' ? 'en' : 'pl';
  };
  const setLang = (lang) => {
    if (locales[lang]) {
      currentLang.value = lang;
    }
  };

  return {
    currentLang,
    t,
    toggleLang,
    setLang
  };
}
