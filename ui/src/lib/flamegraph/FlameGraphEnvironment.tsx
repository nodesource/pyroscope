import { createContext, useContext, type ReactNode } from 'react';

type FlameGraphEnvironmentValue = {
  root: HTMLElement | null;
};

const FlameGraphEnvironmentContext =
  createContext<FlameGraphEnvironmentValue | null>(null);

export function FlameGraphEnvironment({
  root,
  children,
}: FlameGraphEnvironmentValue & { children: ReactNode }) {
  return (
    <FlameGraphEnvironmentContext.Provider value={{ root }}>
      {children}
    </FlameGraphEnvironmentContext.Provider>
  );
}

export function useFlameGraphRoot(): HTMLElement | null {
  return useContext(FlameGraphEnvironmentContext)?.root ?? null;
}

export function useFlameGraphPortalRoot(): HTMLElement | null {
  const root = useFlameGraphRoot();
  if (root) return root;
  return typeof document === 'undefined' ? null : document.body;
}
