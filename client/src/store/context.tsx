import { useState } from 'react';
import type { ReactNode } from 'react';
import { createContext, useContext, useCallback } from 'react';

// Lightweight state container — no external deps
export function create<T>(initialState: T) {
  const Ctx = createContext<{ state: T; setState: (updater: (prev: T) => T) => void }>({
    state: initialState,
    setState: () => {},
  });

  function Provider({ children }: { children: ReactNode }) {
    const [state, setStateRaw] = useState<T>(initialState);
    const setState = useCallback((updater: (prev: T) => T) => {
      setStateRaw(updater);
    }, []);
    return <Ctx.Provider value={{ state, setState }}>{children}</Ctx.Provider>;
  }

  function useStore(): T {
    const { state } = useContext(Ctx);
    return state;
  }

  function useStoreUpdate() {
    const { setState } = useContext(Ctx);
    return setState;
  }

  return { Provider, useStore, useStoreUpdate };
}
