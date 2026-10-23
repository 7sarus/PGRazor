import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'pgrazor-theme';

// The inline script in index.html sets data-theme before paint (default dark),
// so we read it back here to keep React in sync without causing a flash.
function readInitialTheme() {
  if (typeof document !== 'undefined') {
    const current = document.documentElement.dataset.theme;
    if (current === 'light' || current === 'dark') return current;
  }
  return 'dark';
}

export function useTheme() {
  const [theme, setTheme] = useState(readInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#f9fbfd' : '#141b25';
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private mode / blocked storage: keep working, just don't persist.
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggle };
}
