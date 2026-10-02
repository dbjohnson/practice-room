import { useSyncExternalStore } from 'react';

// Values that change many times a second live outside React state, so only the
// components that show them re-render, not the whole room.
export function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
export type Store<T> = ReturnType<typeof createStore<T>>;
export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get);
}
