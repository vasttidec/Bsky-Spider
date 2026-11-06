import type { DownloadTask, TaskCounts } from '../../shared/types';

export interface TasksPayload {
  tasks: DownloadTask[];
  counts: TaskCounts;
  concurrency: number;
}

/**
 * True when two polling payloads are semantically identical. Keeping the old
 * array reference avoids re-rendering every task row on each poll tick.
 */
export function tasksPayloadEqual(
  previous: TasksPayload,
  next: TasksPayload,
): boolean {
  if (previous.concurrency !== next.concurrency) return false;
  if (previous.tasks === next.tasks && previous.counts === next.counts) {
    return true;
  }
  try {
    return (
      JSON.stringify(previous.tasks) === JSON.stringify(next.tasks) &&
      JSON.stringify(previous.counts) === JSON.stringify(next.counts)
    );
  } catch {
    return false;
  }
}
