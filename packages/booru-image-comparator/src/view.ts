import type { ModeType, StateManager } from './types';

import { LAYOUT_FLUSH_MS, MODES } from './constants';
import {
  resetFilters,
  toggleDifferenceInvert,
  updateBackground,
  updateFilters,
  updateOpacity,
} from './filter';
import { resetModeDisplay, setupMode } from './mode';
import {
  applyZoomTransition,
  cleanupOverlayWheelListeners,
  commitZoomState,
  destroyOverlayZoom,
  isOverlayMode,
  resetZoom,
} from './panzoom';
import { $ } from './shadow';
import { unbindSlider } from './slider';
import { persistBackground, persistMode } from './storage';
import { applyTransforms, resetTransforms, rotateTransform, toggleTransform } from './transform';

interface ComparatorCallbacks {
  onClose: () => void;
  onLoadImage: () => void;
  onSwapImages: () => void;
}

/** Bind all comparator UI event listeners and register cleanup handlers. */
export function bindEvents(state: StateManager, deps: ComparatorCallbacks): void {
  const cleanup: Array<() => void> = [];

  const on = (id: string, handler: () => void, event = 'click') => {
    const el = $<HTMLElement>(`#${id}`);

    if (!el) {
      throw new Error(`Comparator UI element #${id} not found`);
    }
    el.addEventListener(event, handler);
    cleanup.push(() => el.removeEventListener(event, handler));
  };

  bindNavigationEvents(on, deps, state);
  bindModeEvents(on, state);
  bindTransformEvents(on, state);
  bindFilterEvents(on);
  bindKeyboardEvents(deps, cleanup);

  state.update('eventCleanup', cleanup);
}

function bindFilterEvents(on: (id: string, handler: () => void, event?: string) => void): void {
  on('opacity-slider', () => updateOpacity(), 'input');
  on('brightness-slider', () => updateFilters(), 'input');
  on('saturate-slider', () => updateFilters(), 'input');
  on(
    'comparison-background',
    () => {
      updateBackground();
      persistBackground();
    },
    'change',
  );
  on('invert-difference', () => toggleDifferenceInvert());
  on('reset-filters', () => resetFilters());
}

function bindKeyboardEvents(deps: ComparatorCallbacks, cleanup: Array<() => void>): void {
  const input = $<HTMLInputElement>('#second-image-input');

  if (input) {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        deps.onLoadImage();
      }
    };

    input.addEventListener('keydown', handleKeyPress);
    cleanup.push(() => input.removeEventListener('keydown', handleKeyPress));
  }

  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      deps.onClose();
    }
  };

  document.addEventListener('keydown', handleEscape);
  cleanup.push(() => document.removeEventListener('keydown', handleEscape));
}

function bindModeEvents(
  on: (id: string, handler: () => void, event?: string) => void,
  state: StateManager,
): void {
  on(
    'comparison-mode',
    () => {
      updateMode(state);
      persistMode();
    },
    'change',
  );
}

function bindNavigationEvents(
  on: (id: string, handler: () => void, event?: string) => void,
  deps: ComparatorCallbacks,
  state: StateManager,
): void {
  on('close-comparison', deps.onClose);
  on('load-comparison', deps.onLoadImage);
  on('swap-images', deps.onSwapImages);
  on('reset-zoom', () => resetZoom(state));
}

function bindTransformEvents(
  on: (id: string, handler: () => void, event?: string) => void,
  state: StateManager,
): void {
  on('flip-h-left', () => toggleTransform(state, 'left', 'flipH'));
  on('flip-v-left', () => toggleTransform(state, 'left', 'flipV'));
  on('rotate-left', () => rotateTransform(state, 'left'));
  on('flip-h-right', () => toggleTransform(state, 'right', 'flipH'));
  on('flip-v-right', () => toggleTransform(state, 'right', 'flipV'));
  on('rotate-right', () => rotateTransform(state, 'right'));
  on('reset-transform', () => resetTransforms(state));
}

/** Switch comparison mode, saving zoom state and rebuilding the overlay. */
export function updateMode(state: StateManager): void {
  commitZoomState(state);
  destroyOverlayZoom(state);
  cleanupOverlayWheelListeners();

  if (state.get().mode === MODES.SLIDER) {
    unbindSlider();
  }

  const sel = $<HTMLSelectElement>('#comparison-mode');

  if (!sel) {
    return;
  }

  const next = sel.value as ModeType;
  const prev = state.get().mode;

  state.update('mode', next);

  if (prev !== next && isOverlayMode(prev) !== isOverlayMode(next)) {
    applyZoomTransition(state, prev, next);
  }

  resetModeDisplay();
  setupMode(state, next);

  setTimeout(() => {
    applyTransforms(state);
    updateFilters();
    $<HTMLElement>('#image-comparison-container')?.focus();
  }, LAYOUT_FLUSH_MS);
}
