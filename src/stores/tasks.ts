import { create } from 'zustand';
import { api, errorMessage } from '../api';
import type {
  DownloadTask,
  TaskBatchAction,
  TaskCounts,
} from '../../shared/types';

interface TasksState {
  tasks: DownloadTask[];
  counts: TaskCounts;
  concurrency: number;
  loading: boolean;
  initialized: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: (silent?: boolean) => Promise<void>;
  setConcurrency: (value: number) => void;
  pause: (id: string) => Promise<void>;
  resume: (id: string) => Promise<void>;
  retry: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  batch: (action: TaskBatchAction) => Promise<void>;
}

const EMPTY_COUNTS: TaskCounts = {
  downloading: 0,
  waiting: 0,
  paused: 0,
  error: 0,
  completed: 0,
};

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  counts: EMPTY_COUNTS,
  concurrency: 3,
  loading: false,
  initialized: false,
  refreshing: false,
  error: null,

  refresh: async (silent = false) => {
    if (get().refreshing) return;
    set({ refreshing: true, ...(silent ? {} : { loading: true }) });
    try {
      const data = await api.getTasks();
      set({
        tasks: data.tasks,
        counts: data.counts,
        concurrency: data.concurrency,
        error: null,
        initialized: true,
        loading: false,
        refreshing: false,
      });
    } catch (error) {
      set({
        error: errorMessage(error),
        loading: false,
        refreshing: false,
      });
      if (!silent) throw error;
    }
  },

  setConcurrency: (value) => set({ concurrency: value }),

  pause: async (id) => {
    await api.taskAction(id, 'pause');
    await get().refresh(true);
  },
  resume: async (id) => {
    await api.taskAction(id, 'resume');
    await get().refresh(true);
  },
  retry: async (id) => {
    await api.taskAction(id, 'retry');
    await get().refresh(true);
  },
  remove: async (id) => {
    await api.removeTask(id);
    await get().refresh(true);
  },
  batch: async (action) => {
    await api.batchTasks(action);
    await get().refresh(true);
  },
}));
