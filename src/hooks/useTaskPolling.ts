import { useEffect, useRef } from 'react';
import { useSettingsStore } from '../stores/settings';
import { useTasksStore } from '../stores/tasks';
import { useDownloadToastStore } from '../stores/toast';

const POLL_INTERVAL = 1500;

export function useTaskPolling(): void {
  const knownCompleted = useRef<Set<string> | null>(null);
  const primed = useRef(false);

  useEffect(() => {
    let disposed = false;

    const tick = async () => {
      if (disposed) return;
      if (document.visibilityState === 'hidden') return;
      try {
        await useTasksStore.getState().refresh(true);
      } catch {
        // Polling is best-effort; actions surface their own errors.
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), POLL_INTERVAL);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = useTasksStore.subscribe((state, previous) => {
      if (state.tasks === previous.tasks) return;
      const completed = state.tasks.filter(
        (task) => task.status === 'completed' && !task.skipped,
      );
      const ids = new Set(completed.map((task) => task.id));

      if (!primed.current) {
        knownCompleted.current = ids;
        primed.current = true;
        return;
      }

      const known = knownCompleted.current;
      if (!known) {
        knownCompleted.current = ids;
        return;
      }
      const fresh = completed.filter((task) => !known.has(task.id));
      knownCompleted.current = ids;

      if (fresh.length === 0) return;
      if (!useSettingsStore.getState().settings?.desktopNotifications) return;
      useDownloadToastStore.getState().show(fresh);
    });
    return unsubscribe;
  }, []);
}
