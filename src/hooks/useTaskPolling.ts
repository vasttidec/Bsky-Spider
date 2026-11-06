import { useEffect, useRef } from 'react';
import { useSettingsStore } from '../stores/settings';
import { useTasksStore } from '../stores/tasks';
import { useDownloadToastStore } from '../stores/toast';

const POLL_ACTIVE = 1200;
const POLL_IDLE = 3000;
const POLL_IDLE_SMOOTH = 6000;

export function useTaskPolling(): void {
  const knownCompleted = useRef<Set<string> | null>(null);
  const primed = useRef(false);

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;

    const tick = async () => {
      if (disposed) return;
      if (document.visibilityState === 'hidden') return;
      try {
        await useTasksStore.getState().refresh(true);
      } catch {
        // Polling is best-effort; actions surface their own errors.
      }
    };

    const schedule = () => {
      if (disposed) return;
      const counts = useTasksStore.getState().counts;
      const busy = counts.downloading + counts.waiting > 0;
      const smooth = useSettingsStore.getState().settings?.smoothMode === true;
      const idle = smooth ? POLL_IDLE_SMOOTH : POLL_IDLE;
      timer = window.setTimeout(
        () => void tick().finally(schedule),
        busy ? POLL_ACTIVE : idle,
      );
    };

    void tick().finally(schedule);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
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
