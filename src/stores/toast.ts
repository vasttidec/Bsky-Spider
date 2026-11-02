import { create } from 'zustand';
import type { DownloadTask } from '../../shared/types';

export interface DownloadToastData {
  id: number;
  count: number;
  fileName?: string;
}

interface DownloadToastState {
  toast: DownloadToastData | null;
  show: (tasks: DownloadTask[]) => void;
  dismiss: () => void;
}

export const useDownloadToastStore = create<DownloadToastState>((set) => ({
  toast: null,
  show: (tasks) => {
    const fresh = tasks.filter((task) => !task.skipped);
    if (fresh.length === 0) return;
    set({
      toast: {
        id: Date.now(),
        count: fresh.length,
        fileName: fresh[0].fileName,
      },
    });
  },
  dismiss: () => set({ toast: null }),
}));
