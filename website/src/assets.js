// Resolve a path inside /public against Vite's configured base (e.g. /PGRazor/),
// so links work both at the repo root and on GitHub Pages.
const base = import.meta.env.BASE_URL;

export function asset(path) {
  return `${base}${String(path).replace(/^\/+/, '')}`;
}
