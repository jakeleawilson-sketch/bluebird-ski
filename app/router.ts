// Tiny history-API router.
import { useEffect, useState } from 'preact/hooks';

const listeners = new Set<() => void>();

export function navigate(to: string, replace = false) {
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  listeners.forEach((l) => l());
  if (!replace) window.scrollTo({ top: 0 });
}

export function useLocation() {
  const [loc, setLoc] = useState(() => location.pathname + location.search);
  useEffect(() => {
    const update = () => setLoc(location.pathname + location.search);
    listeners.add(update);
    window.addEventListener('popstate', update);
    return () => {
      listeners.delete(update);
      window.removeEventListener('popstate', update);
    };
  }, []);
  return loc;
}

/** Intercept same-origin <a> clicks so links don't reload the page. */
export function installLinkInterceptor() {
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest?.('a');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || a.target || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
    e.preventDefault();
    navigate(url.pathname + url.search);
  });
}
