import { create } from 'zustand';
import dayjs, { type Dayjs } from 'dayjs';
import { api, errorMessage } from '../api';
import type {
  BatchDownloadResult,
  BskyProfile,
  MediaItem,
  MediaKind,
} from '../../shared/types';
import { useTasksStore } from './tasks';

export interface HomeFilters {
  from: Dayjs | null;
  to: Dayjs | null;
  mediaTypes: MediaKind[];
  maxPosts: number;
}

export const DEFAULT_FILTERS: HomeFilters = {
  from: null,
  to: null,
  mediaTypes: ['image', 'video'],
  maxPosts: 300,
};

export function normalizeHandleInput(value: string): string {
  let text = (value || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      const parts = url.pathname.split('/').filter(Boolean);
      const index = parts.indexOf('profile');
      if (index >= 0 && parts[index + 1]) {
        text = decodeURIComponent(parts[index + 1]);
      }
    } catch {
      // Keep as-is; the API will return a useful error.
    }
  }
  if (text.startsWith('@')) text = text.slice(1);
  return text.trim();
}

function uniqueItems(items: MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  const result: MediaItem[] = [];
  for (const item of items) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    result.push(item);
  }
  return result;
}

interface HomeState {
  keyword: string;
  profile: BskyProfile | null;
  items: MediaItem[];
  cursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  initialLoaded: boolean;
  error: string | null;
  filter: HomeFilters;
  history: string[];
  historyLoaded: boolean;
  selected: Set<string>;
  activeMedia: MediaItem | null;
  downloading: boolean;
  search: (value: string) => Promise<void>;
  loadMore: () => Promise<void>;
  setKeyword: (value: string) => void;
  setFilter: (patch: Partial<HomeFilters>) => void;
  resetFilter: () => void;
  toggleSelected: (key: string) => void;
  selectAll: (keys: string[]) => void;
  clearSelection: () => void;
  setActiveMedia: (media: MediaItem | null) => void;
  downloadAll: () => Promise<BatchDownloadResult>;
  downloadSelected: () => Promise<BatchDownloadResult>;
  downloadItems: (items: MediaItem[]) => Promise<BatchDownloadResult>;
  downloadOne: (media: MediaItem) => Promise<BatchDownloadResult>;
  loadHistory: () => Promise<void>;
  reloadHistory: () => Promise<void>;
  addHistory: (handle: string) => void;
  clearHistory: () => void;
  reset: () => void;
}

let searchSequence = 0;

export const useHomeStore = create<HomeState>((set, get) => ({
  keyword: '',
  profile: null,
  items: [],
  cursor: null,
  loading: false,
  loadingMore: false,
  initialLoaded: false,
  error: null,
  filter: { ...DEFAULT_FILTERS },
  history: [],
  historyLoaded: false,
  selected: new Set<string>(),
  activeMedia: null,
  downloading: false,

  setKeyword: (value) => set({ keyword: value }),

  search: async (value) => {
    const handle = normalizeHandleInput(value);
    if (!handle) return;
    const seq = ++searchSequence;
    set({
      keyword: handle,
      loading: true,
      error: null,
      profile: null,
      items: [],
      cursor: null,
      initialLoaded: false,
      selected: new Set(),
      activeMedia: null,
    });
    try {
      const [profile, feed] = await Promise.all([
        api.getProfile(handle),
        api.getFeed(handle),
      ]);
      if (seq !== searchSequence) return;
      set({
        profile,
        items: uniqueItems(feed.items),
        cursor: feed.cursor,
        loading: false,
        initialLoaded: true,
        error: null,
      });
      get().addHistory(profile.handle || handle);
    } catch (error) {
      if (seq !== searchSequence) return;
      set({
        loading: false,
        initialLoaded: true,
        error: errorMessage(error),
      });
      throw error;
    }
  },

  loadMore: async () => {
    const state = get();
    if (state.loading || state.loadingMore || !state.cursor) return;
    const seq = searchSequence;
    const cursor = state.cursor;
    set({ loadingMore: true });
    try {
      let nextCursor: string | null = cursor;
      let collected: MediaItem[] = [];
      for (let i = 0; i < 3; i += 1) {
        const page = await api.getFeed(state.keyword, nextCursor);
        if (seq !== searchSequence) return;
        nextCursor = page.cursor;
        collected = uniqueItems([...collected, ...page.items]);
        if (collected.length > 0 || !nextCursor) break;
      }
      if (seq !== searchSequence) return;
      set((current) => ({
        items: uniqueItems([...current.items, ...collected]),
        cursor: nextCursor,
        loadingMore: false,
      }));
    } catch (error) {
      if (seq !== searchSequence) return;
      set({ loadingMore: false, error: errorMessage(error) });
      throw error;
    }
  },

  setFilter: (patch) =>
    set((state) => ({
      filter: { ...state.filter, ...patch },
      selected: new Set(),
    })),

  resetFilter: () =>
    set({ filter: { ...DEFAULT_FILTERS }, selected: new Set() }),

  toggleSelected: (key) =>
    set((state) => {
      const selected = new Set(state.selected);
      if (selected.has(key)) selected.delete(key);
      else selected.add(key);
      return { selected };
    }),

  selectAll: (keys) =>
    set((state) => {
      const allSelected = keys.every((key) => state.selected.has(key));
      const selected = new Set(state.selected);
      for (const key of keys) {
        if (allSelected) selected.delete(key);
        else selected.add(key);
      }
      return { selected };
    }),

  clearSelection: () => set({ selected: new Set() }),
  setActiveMedia: (media) => set({ activeMedia: media }),

  downloadAll: async () => {
    const state = get();
    if (!state.profile) throw new Error('请先加载用户');
    if (state.filter.mediaTypes.length === 0) {
      throw new Error('请至少选择一种媒体类型');
    }
    set({ downloading: true });
    try {
      const result = await api.batchDownload({
        actor: state.profile.handle,
        mediaTypes: state.filter.mediaTypes,
        from: state.filter.from?.format('YYYY-MM-DD') || null,
        to: state.filter.to?.format('YYYY-MM-DD') || null,
        maxPosts: state.filter.maxPosts,
      });
      await useTasksStore.getState().refresh(true);
      return result;
    } finally {
      set({ downloading: false });
    }
  },

  downloadSelected: async () => {
    const state = get();
    if (!state.profile) throw new Error('请先加载用户');
    const selectedItems = state.items.filter((item) =>
      state.selected.has(`${item.postUri}|${item.id}`),
    );
    if (selectedItems.length === 0) throw new Error('请先选择要下载的媒体');
    set({ downloading: true });
    try {
      const result = await api.batchDownload({
        actor: state.profile.handle,
        mediaTypes: state.filter.mediaTypes,
        items: selectedItems,
        maxPosts: state.filter.maxPosts,
      });
      await useTasksStore.getState().refresh(true);
      return result;
    } finally {
      set({ downloading: false });
    }
  },

  downloadItems: async (mediaItems) => {
    const state = get();
    if (!state.profile) throw new Error('请先加载用户');
    if (mediaItems.length === 0) throw new Error('没有可下载的媒体');
    set({ downloading: true });
    try {
      const result = await api.batchDownload({
        actor: state.profile.handle,
        mediaTypes: state.filter.mediaTypes,
        items: mediaItems,
        maxPosts: state.filter.maxPosts,
      });
      await useTasksStore.getState().refresh(true);
      return result;
    } finally {
      set({ downloading: false });
    }
  },

  downloadOne: async (media) => {
    const state = get();
    if (!state.profile) throw new Error('请先加载用户');
    const result = await api.batchDownload({
      actor: state.profile.handle,
      mediaTypes: [media.kind],
      items: [media],
    });
    await useTasksStore.getState().refresh(true);
    return result;
  },

  loadHistory: async () => {
    if (get().historyLoaded) return;
    try {
      const response = await api.getSearchHistory();
      if (get().history.length === 0) {
        set({
          history: Array.isArray(response.history) ? response.history : [],
          historyLoaded: true,
        });
      } else {
        set({ historyLoaded: true });
      }
    } catch {
      set({ historyLoaded: true });
    }
  },

  // History belongs to one account: clear the cached list before refetching so
  // switching accounts never shows another account's searches.
  reloadHistory: async () => {
    set({ history: [], historyLoaded: false });
    await get().loadHistory();
  },

  addHistory: (handle) => {
    const clean = normalizeHandleInput(handle);
    if (!clean) return;
    const history = [
      clean,
      ...get().history.filter((item) => item !== clean),
    ].slice(0, 12);
    set({ history });
    void api
      .addSearchHistory(clean)
      .then((response) => {
        if (Array.isArray(response.history)) {
          set({ history: response.history, historyLoaded: true });
        }
      })
      .catch(() => undefined);
  },

  clearHistory: () => {
    set({ history: [] });
    void api.clearSearchHistory().catch(() => undefined);
  },

  reset: () => {
    searchSequence += 1;
    set({
      keyword: '',
      profile: null,
      items: [],
      cursor: null,
      loading: false,
      loadingMore: false,
      initialLoaded: false,
      error: null,
      filter: { ...DEFAULT_FILTERS },
      selected: new Set(),
      activeMedia: null,
      downloading: false,
    });
  },
}));

export function filterVisibleItems(
  items: MediaItem[],
  filters: HomeFilters,
): MediaItem[] {
  return items.filter((item) => {
    if (!filters.mediaTypes.includes(item.kind)) return false;
    const created = dayjs(item.createdAt);
    if (filters.from && created.isBefore(filters.from.startOf('day'))) {
      return false;
    }
    if (filters.to && created.isAfter(filters.to.endOf('day'))) return false;
    return true;
  });
}
