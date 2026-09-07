import { ref } from 'vue';

const THEME_KEY = 'droid_sync_theme';

function getInitialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
  } catch (e) {}
  return 'dark';
}

const currentTheme = ref(getInitialTheme());

function applyTheme(theme) {
  currentTheme.value = theme;
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#182234' : '#f1f5f9');
    }
  }
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (e) {}
}

// Initialize on import
if (typeof document !== 'undefined') {
  applyTheme(currentTheme.value);
}

export function useTheme() {
  function toggleTheme() {
    const next = currentTheme.value === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  }

  return {
    theme: currentTheme,
    isDark: () => currentTheme.value === 'dark',
    toggleTheme,
    setTheme: applyTheme
  };
}
