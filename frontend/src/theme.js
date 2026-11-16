const KEY = 'theme';

export function getTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* opslag niet beschikbaar */ }
  return 'dark';
}

export function monacoTheme() {
  return getTheme() === 'light' ? 'vs' : 'vs-dark';
}

function apply(theme) {
  document.documentElement.dataset.theme = theme;
  window.monaco?.editor.setTheme(theme === 'light' ? 'vs' : 'vs-dark');
}

export function initTheme() {
  apply(getTheme());
}

export function setTheme(theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* opslag niet beschikbaar */ }
  apply(theme);
}
