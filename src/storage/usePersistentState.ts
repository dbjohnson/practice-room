import { useCallback, useState } from 'react';
import { readLocal, writeLocal } from './library';

/** State that survives a reload. Stored values that fail `valid` fall back to the default. */
export function usePersistentState<T>(
  key: string,
  fallback: T,
  valid: (value: unknown) => boolean,
) {
  const [value, setValue] = useState<T>(() => {
    const stored = readLocal<unknown>(key, fallback);
    return valid(stored) ? (stored as T) : fallback;
  });
  // Pass `remember: false` for a temporary change, such as a guided exercise's setup.
  const set = useCallback(
    (next: T, remember = true) => {
      setValue(next);
      if (remember) writeLocal(key, next);
    },
    [key],
  );
  return [value, set] as const;
}
export const isBoolean = (value: unknown) => typeof value === 'boolean';
export const oneOf =
  <T>(options: readonly T[]) =>
  (value: unknown) =>
    options.includes(value as T);
