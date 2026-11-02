import { useCallback, useEffect, useRef } from 'react';

export function useInfiniteScroll<T extends HTMLElement>(
  onReach: () => void,
  enabled: boolean,
  rootMargin = '500px',
) {
  const sentinelRef = useRef<T | null>(null);
  const callbackRef = useRef(onReach);
  callbackRef.current = onReach;

  useEffect(() => {
    if (!enabled) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          callbackRef.current();
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, rootMargin]);

  return sentinelRef;
}

export function useDebouncedCallback<T extends (...args: never[]) => unknown>(
  callback: T,
  delay = 600,
): (...args: Parameters<T>) => void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        callbackRef.current(...args);
      }, delay);
    },
    [delay],
  );
}
