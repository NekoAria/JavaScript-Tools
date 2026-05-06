import type { AppState, StateManager } from './types';

import { MODES } from './constants';
import { detectSite, extractPostIdFromPath } from './utils';

/** Create the initial application state by inspecting the current page. */
export function createAppState(): StateManager {
  const site = detectSite();
  const { pathname, search } = globalThis.location;

  let isUpload: boolean | undefined;
  let isIqdb: boolean | undefined;
  let isSimilar: boolean | undefined;
  let postId: string | null;
  let searchUrl: string | null;

  if (site === 'danbooru') {
    isUpload = pathname.startsWith('/uploads');
    isIqdb = pathname.startsWith('/iqdb_queries');
    const params = new URLSearchParams(search);

    postId = isIqdb
      ? params.get('post_id') ||
        document.querySelector<HTMLInputElement>('#search_post_id')?.value?.trim() ||
        null
      : document.querySelector<HTMLMetaElement>('meta[name="post-id"]')?.content || null;

    searchUrl = isIqdb
      ? params.get('url') ||
        document.querySelector<HTMLInputElement>('#search_url')?.value?.trim() ||
        null
      : null;
  } else {
    isSimilar = /\/post\/similar/.test(pathname);
    const params = new URLSearchParams(search);

    postId = extractPostIdFromPath(pathname);
    searchUrl = isSimilar
      ? safeDecodeURIComponent(params.get('url')) ||
        document.querySelector<HTMLInputElement>('#url')?.value?.trim() ||
        null
      : null;
  }

  const state = createReactiveState({
    site,
    isUpload,
    isIqdb,
    isSimilar,
    postId,
    searchUrl,
    mode: MODES.SIDE_BY_SIDE,
    transforms: {
      left: { flipH: false, flipV: false, rotation: 0 },
      right: { flipH: false, flipV: false, rotation: 0 },
    },
    zoomState: { scale: 1, x: 0, y: 0 },
    panzoomInstances: {},
    eventCleanup: [],
    originalImageUrl: null,
  });

  return state;
}

/** Create a reactive state container with get/update/subscribe. */
function createReactiveState(initial: AppState): StateManager {
  let state = { ...initial };
  const listeners = new Set<(next: AppState, prev: AppState) => void>();

  const manager: StateManager = {
    get: () => ({ ...state }),

    update(keyOrPartial: Parameters<StateManager['update']>[0], value?: unknown) {
      const prev = { ...state };
      let hasChanged = false;

      if (typeof keyOrPartial === 'object' && keyOrPartial !== null) {
        const partial = keyOrPartial;

        for (const [k, v] of Object.entries(partial)) {
          const key = k as keyof AppState;

          // Deep-equal check via JSON serialization. Safe for plain-object state; avoid for cycles or functions.
          if (JSON.stringify(prev[key]) !== JSON.stringify(v)) {
            hasChanged = true;
          }
        }
        state = { ...state, ...partial };
      } else {
        const key = keyOrPartial as keyof AppState;

        if (JSON.stringify(prev[key]) !== JSON.stringify(value)) {
          hasChanged = true;
        }
        state = { ...state, [key]: value };
      }

      if (hasChanged) {
        for (const fn of listeners) {
          fn(state, prev);
        }
      }
    },

    subscribe(fn) {
      listeners.add(fn);

      return () => listeners.delete(fn);
    },
  };

  return manager;
}

/** Decode a URL parameter, falling back to the raw value on malformed encoding. */
function safeDecodeURIComponent(raw: string | null): string | null {
  if (raw === null) {
    return null;
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
