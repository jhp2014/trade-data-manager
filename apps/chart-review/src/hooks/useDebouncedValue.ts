import { useEffect, useState } from "react";

/** 값이 delayMs 동안 안정되면 반영하는 디바운스 훅. 첫 값은 즉시 반영. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
