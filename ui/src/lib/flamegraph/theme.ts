import { useEffect, useState } from 'react';

import { useFlameGraphRoot } from './FlameGraphEnvironment';

/**
 * Tracks whether the app is in light mode by observing the html `data-theme`
 * attribute (the same hook the rest of the app uses to switch themes). The
 * vendored flamegraph code originally took a `theme.isLight` from
 * `@grafana/data` createTheme; this replaces that single bit of JS-side state.
 */
export function useIsLight(): boolean {
  const root = useFlameGraphRoot();
  const [isLight, setIsLight] = useState(() => getIsLight(root));

  useEffect(() => {
    const themeRoot = root ?? document.documentElement;
    setIsLight(getIsLight(root));
    const observer = new MutationObserver(() => setIsLight(getIsLight(root)));
    observer.observe(themeRoot, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, [root]);

  return isLight;
}

function getIsLight(root: HTMLElement | null): boolean {
  if (typeof document === 'undefined') return false;
  return (
    (root ?? document.documentElement).getAttribute('data-theme') === 'light'
  );
}

/** Reads a `--var` from the flamegraph root computed style. */
export function cssVar(name: string, root?: HTMLElement | null): string {
  if (typeof getComputedStyle === 'undefined') return '';
  return getComputedStyle(root ?? document.documentElement)
    .getPropertyValue(name)
    .trim();
}
