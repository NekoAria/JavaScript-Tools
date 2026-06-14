import type { AppState, ModeType, StateManager } from './types';

import Panzoom, { type PanzoomGlobalOptions, type PanzoomObject } from '@panzoom/panzoom';

import { DIVIDER_WIDTH, LAYOUT_FLUSH_MS, MODES } from './constants';
import { $ } from './shadow';

/** Track wheel listeners without polluting HTMLElement. */
const wheelListeners = new WeakMap<HTMLElement, (e: WheelEvent) => void>();
const OVERLAY_MODES: ReadonlySet<ModeType> = new Set([MODES.SLIDER, MODES.FADE, MODES.DIFFERENCE]);

/** Return the currently active Panzoom instance, preferring overlay over side-by-side panels. */
function activeZoomInstance(appState: AppState): PanzoomObject | null {
  return (
    appState.panzoomInstances.overlay ??
    appState.panzoomInstances.left ??
    appState.panzoomInstances.right ??
    null
  );
}

/**
 * When switching between overlay and side-by-side modes, the image is rendered at a different
 * effective width (full viewport vs half viewport). Adjust the saved zoom scale and pan offset
 * proportionally so the visual zoom level feels continuous.
 */
export function applyZoomTransition(
  state: StateManager,
  fromMode: ModeType,
  toMode: ModeType,
): void {
  const { zoomState } = state.get();
  const fromOverlay = isOverlayMode(fromMode);
  const toOverlay = isOverlayMode(toMode);

  if (fromOverlay === toOverlay) {
    return;
  }

  const refImg = $<HTMLImageElement>('#left-image');
  const content = $<HTMLElement>('#comparison-content');

  if (!refImg || !content || !refImg.naturalWidth) {
    return;
  }

  const divider = $<HTMLElement>('#comparison-divider');
  const divW = divider?.getBoundingClientRect().width || DIVIDER_WIDTH;
  const sideW = (content.clientWidth - divW) / 2;
  // Calculate displayed image height for a given container width while preserving aspect ratio
  const computeImageHeight = (img: HTMLImageElement, w: number) => {
    if (!img.naturalWidth || !img.naturalHeight) {
      return content.clientHeight;
    }

    return img.naturalWidth / img.naturalHeight > w / content.clientHeight
      ? w / (img.naturalWidth / img.naturalHeight)
      : content.clientHeight;
  };

  const sideBySideH = computeImageHeight(refImg, sideW);
  const overlayH = computeImageHeight(refImg, content.clientWidth);
  const ratio = fromOverlay && !toOverlay ? overlayH / sideBySideH : sideBySideH / overlayH;

  if (ratio !== 1) {
    state.update('zoomState', {
      ...zoomState,
      scale: Math.max(0.1, zoomState.scale * ratio),
      y: zoomState.y * ratio,
    });
  }
}

function bindWheelEvents(state: StateManager): void {
  const leftSide = $<HTMLElement>('#left-side');
  const rightSide = $<HTMLElement>('#right-side');
  const { left, right } = state.get().panzoomInstances;

  if (!leftSide || !rightSide || !left || !right) {
    return;
  }

  const lw = makeWheelHandler(left);
  const rw = makeWheelHandler(right);

  leftSide.addEventListener('wheel', lw);
  rightSide.addEventListener('wheel', rw);

  state.update('eventCleanup', [
    ...state.get().eventCleanup,
    () => leftSide.removeEventListener('wheel', lw),
    () => rightSide.removeEventListener('wheel', rw),
  ]);
}

export function cleanupOverlayWheelListeners(): void {
  const el = $<HTMLElement>('#comparison-overlay-container');

  if (!el) {
    return;
  }
  const h = wheelListeners.get(el);

  if (h) {
    el.removeEventListener('wheel', h);
    wheelListeners.delete(el);
  }
}

/** Persist the active panzoom scale and pan position into state. */
export function commitZoomState(state: StateManager): void {
  const active = activeZoomInstance(state.get());

  if (!active) {
    return;
  }
  const pan = active.getPan();

  state.update('zoomState', { scale: active.getScale(), x: pan.x, y: pan.y });
}

export function destroyAllZoom(state: StateManager): void {
  const { left, right, overlay } = state.get().panzoomInstances;

  for (const pz of [left, right, overlay]) {
    pz?.destroy();
  }
  cleanupOverlayWheelListeners();
  state.update('panzoomInstances', {});
}

export function destroyOverlayZoom(state: StateManager): void {
  const { panzoomInstances } = state.get();

  if (panzoomInstances.overlay) {
    panzoomInstances.overlay.destroy();
    state.update('panzoomInstances', { ...panzoomInstances, overlay: null });
  }
}

export function initOverlayPanzoom(state: StateManager): void {
  const overlayPan = $<HTMLElement>('#overlay-pan');
  const container = $<HTMLElement>('#comparison-overlay-container');

  if (!overlayPan || !container) {
    return;
  }

  const instance = Panzoom(overlayPan, { maxScale: Infinity });

  state.update('panzoomInstances', { ...state.get().panzoomInstances, overlay: instance });

  const { zoomState } = state.get();

  instance.zoom(zoomState.scale, { animate: false, silent: true });
  instance.pan(zoomState.x, zoomState.y, { animate: false, silent: true });

  const old = wheelListeners.get(container);

  if (old) {
    container.removeEventListener('wheel', old);
    wheelListeners.delete(container);
  }

  const wh = makeWheelHandler(instance);

  wheelListeners.set(container, wh);
  container.addEventListener('wheel', wh);
}

/** Initialize side-by-side panzoom instances for the left and right images. */
export function initView(state: StateManager): void {
  const leftPan = $<HTMLElement>('#left-pan');
  const rightPan = $<HTMLElement>('#right-pan');

  if (!leftPan || !rightPan) {
    return;
  }

  const { panzoomInstances } = state.get();

  panzoomInstances.left?.destroy();
  panzoomInstances.right?.destroy();

  const opts: PanzoomGlobalOptions = { maxScale: Infinity };

  state.update('panzoomInstances', {
    ...panzoomInstances,
    left: Panzoom(leftPan, opts),
    right: Panzoom(rightPan, opts),
  });

  setTimeout(() => restoreZoomState(state), LAYOUT_FLUSH_MS);
  syncPanzoom(state);
  bindWheelEvents(state);
}

export function isOverlayMode(mode: ModeType): boolean {
  return OVERLAY_MODES.has(mode);
}

function makeWheelHandler(pz: PanzoomObject) {
  return (e: WheelEvent) => {
    e.preventDefault();
    pz.zoomWithWheel(e);
  };
}

/** Reset zoom and pan on all panzoom instances. */
export function resetZoom(state: StateManager): void {
  const { left, right, overlay } = state.get().panzoomInstances;

  for (const pz of [left, right, overlay]) {
    pz?.reset();
  }
}

export function restoreZoomState(state: StateManager): void {
  const { zoomState, panzoomInstances } = state.get();
  const { left, right, overlay } = panzoomInstances;

  for (const pz of [left, right, overlay]) {
    if (!pz) {
      continue;
    }
    pz.zoom(zoomState.scale, { animate: false, silent: true });
    pz.pan(zoomState.x, zoomState.y, { animate: false, silent: true });
  }
}

/** Synchronize pan and zoom between the left and right panzoom instances. */
function syncPanzoom(state: StateManager): void {
  const leftPan = $<HTMLElement>('#left-pan');
  const rightPan = $<HTMLElement>('#right-pan');
  const { left, right } = state.get().panzoomInstances;

  if (!leftPan || !rightPan || !left || !right) {
    return;
  }

  // Prevent infinite recursion: updating one panzoom fires panzoomchange, which would otherwise sync back to the source
  let busy = false;

  const sync = (target: PanzoomObject) => (e: Event) => {
    if (busy) {
      return;
    }
    busy = true;
    try {
      const { x, y, scale } = (e as CustomEvent<{ x: number; y: number; scale: number }>).detail;

      target.zoom(scale, { animate: false, silent: true });
      target.pan(x, y, { animate: false, silent: true });
    } catch (error) {
      console.warn('Panzoom sync failed:', error);
    } finally {
      busy = false;
    }
  };

  const leftHandler = sync(right);
  const rightHandler = sync(left);

  leftPan.addEventListener('panzoomchange', leftHandler);
  rightPan.addEventListener('panzoomchange', rightHandler);

  state.update('eventCleanup', [
    ...state.get().eventCleanup,
    () => leftPan.removeEventListener('panzoomchange', leftHandler),
    () => rightPan.removeEventListener('panzoomchange', rightHandler),
  ]);
}
