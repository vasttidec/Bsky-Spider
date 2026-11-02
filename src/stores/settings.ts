import { create } from 'zustand';
import { api, errorMessage } from '../api';
import type { AppSettings, SystemInfo } from '../../shared/types';
import { useTasksStore } from './tasks';

interface SettingsState {
  settings: AppSettings | null;
  system: SystemInfo | null;
  saving: boolean;
  savedAt: number | null;
  saveError: string | null;
  saveSeq: number;
  load: () => Promise<void>;
  loadSystem: () => Promise<void>;
  save: (patch: Partial<AppSettings>) => Promise<void>;
  reset: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  system: null,
  saving: false,
  savedAt: null,
  saveError: null,
  saveSeq: 0,

  load: async () => {
    const settings = await api.getSettings();
    set({ settings });
  },

  loadSystem: async () => {
    try {
      const system = await api.getSystem();
      set({ system });
    } catch {
      // Diagnostics are optional and should not block the app.
    }
  },

  save: async (patch) => {
    const seq = get().saveSeq + 1;
    set({ saveSeq: seq, saving: true, saveError: null });
    try {
      const updated = await api.saveSettings(patch);
      if (get().saveSeq === seq) {
        set({ settings: updated, saving: false, savedAt: Date.now() });
        useTasksStore.getState().setConcurrency(updated.concurrency);
      }
    } catch (error) {
      if (get().saveSeq === seq) {
        set({ saving: false, saveError: errorMessage(error) });
      }
      throw error;
    }
  },

  reset: async () => {
    const seq = get().saveSeq + 1;
    set({ saveSeq: seq, saving: true, saveError: null });
    try {
      const updated = await api.resetSettings();
      if (get().saveSeq === seq) {
        set({ settings: updated, saving: false, savedAt: Date.now() });
        useTasksStore.getState().setConcurrency(updated.concurrency);
      }
    } catch (error) {
      if (get().saveSeq === seq) {
        set({ saving: false, saveError: errorMessage(error) });
      }
      throw error;
    }
  },
}));
