import type { ModeType, SideType, StateManager, ZoomState, ZoomStates } from './types';

import Panzoom, { type PanzoomGlobalOptions, type PanzoomObject } from '@panzoom/panzoom';

import { DEFAULT_ZOOM_STATE, DIVIDER_WIDTH, LAYOUT_FLUSH_MS, MODES } from './constants';
import { $ } from './shadow';

/** Track wheel listeners without polluting HTMLElement. */
const wheelListeners = new WeakMap<HTMLElement, (e: WheelEvent) => void>();
const OVERLAY_MODES: ReadonlySet<ModeType> = new Set([MODES.SLIDER, MODES.FADE, MODES.DIFFERENCE]);
const ZOOM_TARGETS = ['left', 'right', 'overlay'] as const;

function applyZoomState(instance: PanzoomObject, zoomState: ZoomState): void {
  instance.zoom(zoomState.scale, { animate: false, silent: true });
  instance.pan(zoomState.x, zoomState.y, { animate: false, silent: true });
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
  const isFromOverlay = isOverlayMode(fromMode);
  const isToOverlay = isOverlayMode(toMode);

  if (isFromOverlay === isToOverlay) {
    return;
  }

  const anchorSide = resolveAnchorSide(state);
  const { zoomStates } = state.get();
  const source = isFromOverlay ? zoomStates.overlay : zoomStates[anchorSide];
  const transitioned = transitionZoomState(source, fromMode, anchorSide);

  if (isToOverlay) {
    state.update('zoomStates', { ...zoomStates, overlay: transitioned });

    return;
  }

  state.update('zoomStates', {
    ...zoomStates,
    left: { ...transitioned },
    right: { ...transitioned },
  });
}

function bindWheelEvents(state: StateManager): void {
  const leftSide = $<HTMLElement>('#left-side');
  const rightSide = $<HTMLElement>('#right-side');
  const { left, right } = state.get().panzoomInstances;

  if (!leftSide || !rightSide || !left || !right) {
    return;
  }

  const lw = makeWheelHandler(left, () => markLastInteractedSide(state, 'left'));
  const rw = makeWheelHandler(right, () => markLastInteractedSide(state, 'right'));

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

/** Save every initialized Panzoom instance into its corresponding view state. */
export function commitZoomState(state: StateManager): void {
  const { panzoomInstances, zoomStates } = state.get();
  const next: ZoomStates = { ...zoomStates };

  for (const target of ZOOM_TARGETS) {
    const instance = panzoomInstances[target];

    if (instance) {
      next[target] = readZoomState(instance);
    }
  }
  state.update('zoomStates', next);
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

function hasImage(side: SideType): boolean {
  return Boolean($<HTMLImageElement>(`#${side}-image`)?.getAttribute('src')?.trim());
}

export function initOverlayPanzoom(state: StateManager): void {
  const overlayPan = $<HTMLElement>('#overlay-pan');
  const container = $<HTMLElement>('#comparison-overlay-container');

  if (!overlayPan || !container) {
    return;
  }

  const instance = Panzoom(overlayPan, { maxScale: Infinity });

  state.update('panzoomInstances', { ...state.get().panzoomInstances, overlay: instance });
  applyZoomState(instance, state.get().zoomStates.overlay);

  const old = wheelListeners.get(container);

  if (old) {
    container.removeEventListener('wheel', old);
    wheelListeners.delete(container);
  }

  const wh = makeWheelHandler(instance);

  wheelListeners.set(container, wh);
  container.addEventListener('wheel', wh);
}

/** Initialize side-by-side Panzoom instances for the left and right images. */
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

function makeWheelHandler(pz: PanzoomObject, onInteraction?: () => void) {
  return (e: WheelEvent) => {
    e.preventDefault();
    onInteraction?.();
    pz.zoomWithWheel(e);
  };
}

function markLastInteractedSide(state: StateManager, side: SideType): void {
  if (hasImage(side) && state.get().lastInteractedSide !== side) {
    state.update('lastInteractedSide', side);
  }
}

function readZoomState(instance: PanzoomObject): ZoomState {
  const pan = instance.getPan();

  return { scale: instance.getScale(), x: pan.x, y: pan.y };
}

/** Reset zoom and pan on one side, or on every Panzoom instance when no side is specified. */
export function resetZoom(state: StateManager, side?: SideType): void {
  const { panzoomInstances, zoomStates } = state.get();
  const targets = side ? [side] : ZOOM_TARGETS;
  const next: ZoomStates = { ...zoomStates };

  for (const target of targets) {
    panzoomInstances[target]?.reset({ animate: false, silent: true });
    next[target] = { ...DEFAULT_ZOOM_STATE };
  }

  if (side) {
    state.update('zoomStates', next);
  } else {
    state.update({ zoomStates: next, lastInteractedSide: 'left' });
  }
}

function resolveAnchorSide(state: StateManager): SideType {
  const { isPanZoomSynced, lastInteractedSide } = state.get();

  if (isPanZoomSynced) {
    return 'left';
  }
  if (hasImage(lastInteractedSide)) {
    return lastInteractedSide;
  }

  const otherSide = lastInteractedSide === 'left' ? 'right' : 'left';

  return hasImage(otherSide) ? otherSide : lastInteractedSide;
}

export function restoreZoomState(state: StateManager): void {
  const { zoomStates, panzoomInstances } = state.get();

  for (const target of ZOOM_TARGETS) {
    const instance = panzoomInstances[target];

    if (instance) {
      applyZoomState(instance, zoomStates[target]);
    }
  }
}

/** Enable or disable synchronized side-by-side pan and zoom. */
export function setPanZoomSync(state: StateManager, isSynced: boolean): void {
  if (state.get().isPanZoomSynced === isSynced) {
    return;
  }

  commitZoomState(state);

  if (!isSynced || state.get().mode !== MODES.SIDE_BY_SIDE) {
    state.update('isPanZoomSynced', isSynced);

    return;
  }

  const anchorSide = resolveAnchorSide(state);
  const targetSide = anchorSide === 'left' ? 'right' : 'left';
  const { panzoomInstances, zoomStates } = state.get();
  const source = zoomStates[anchorSide];

  const target = panzoomInstances[targetSide];

  if (target) {
    applyZoomState(target, source);
  }
  state.update({
    isPanZoomSynced: true,
    zoomStates: {
      ...zoomStates,
      left: { ...source },
      right: { ...source },
    },
  });
}

/** Swap independent side view states so each zoom follows its image. */
export function swapSideZoomStates(state: StateManager): void {
  commitZoomState(state);
  const { isPanZoomSynced, lastInteractedSide, panzoomInstances, zoomStates } = state.get();

  if (isPanZoomSynced) {
    return;
  }

  const next: ZoomStates = {
    ...zoomStates,
    left: { ...zoomStates.right },
    right: { ...zoomStates.left },
  };

  if (panzoomInstances.left) {
    applyZoomState(panzoomInstances.left, next.left);
  }
  if (panzoomInstances.right) {
    applyZoomState(panzoomInstances.right, next.right);
  }
  state.update({
    zoomStates: next,
    lastInteractedSide: lastInteractedSide === 'left' ? 'right' : 'left',
  });
}

/** Synchronize pan and zoom between the left and right Panzoom instances when enabled. */
function syncPanzoom(state: StateManager): void {
  const leftPan = $<HTMLElement>('#left-pan');
  const rightPan = $<HTMLElement>('#right-pan');
  const { left, right } = state.get().panzoomInstances;

  if (!leftPan || !rightPan || !left || !right) {
    return;
  }

  // Prevent infinite recursion if a Panzoom implementation emits changes despite silent updates.
  let isBusy = false;

  const sync = (target: PanzoomObject) => (e: Event) => {
    if (isBusy || !state.get().isPanZoomSynced) {
      return;
    }
    isBusy = true;
    try {
      applyZoomState(target, (e as CustomEvent<ZoomState>).detail);
    } catch (error) {
      console.warn('Panzoom sync failed:', error);
    } finally {
      isBusy = false;
    }
  };

  const leftHandler = sync(right);
  const rightHandler = sync(left);
  const leftStartHandler = () => markLastInteractedSide(state, 'left');
  const rightStartHandler = () => markLastInteractedSide(state, 'right');

  leftPan.addEventListener('panzoomchange', leftHandler);
  rightPan.addEventListener('panzoomchange', rightHandler);
  leftPan.addEventListener('panzoomstart', leftStartHandler);
  rightPan.addEventListener('panzoomstart', rightStartHandler);

  state.update('eventCleanup', [
    ...state.get().eventCleanup,
    () => leftPan.removeEventListener('panzoomchange', leftHandler),
    () => rightPan.removeEventListener('panzoomchange', rightHandler),
    () => leftPan.removeEventListener('panzoomstart', leftStartHandler),
    () => rightPan.removeEventListener('panzoomstart', rightStartHandler),
  ]);
}

function transitionZoomState(
  zoomState: ZoomState,
  fromMode: ModeType,
  referenceSide: SideType,
): ZoomState {
  const refImg = $<HTMLImageElement>(`#${referenceSide}-image`);
  const content = $<HTMLElement>('#comparison-content');

  if (!refImg || !content || !refImg.naturalWidth) {
    return { ...zoomState };
  }

  const divider = $<HTMLElement>('#comparison-divider');
  const dividerWidth = divider?.getBoundingClientRect().width || DIVIDER_WIDTH;
  const sideWidth = (content.clientWidth - dividerWidth) / 2;

  if (sideWidth <= 0 || content.clientHeight <= 0) {
    return { ...zoomState };
  }

  const aspectRatio = refImg.naturalWidth / refImg.naturalHeight;
  const computeImageHeight = (width: number) => Math.min(width / aspectRatio, content.clientHeight);

  const sideBySideHeight = computeImageHeight(sideWidth);
  const overlayHeight = computeImageHeight(content.clientWidth);
  const ratio = isOverlayMode(fromMode)
    ? overlayHeight / sideBySideHeight
    : sideBySideHeight / overlayHeight;

  if (ratio === 1 || ratio <= 0 || !Number.isFinite(ratio)) {
    return { ...zoomState };
  }

  return {
    ...zoomState,
    scale: Math.max(0.1, zoomState.scale * ratio),
    y: zoomState.y * ratio,
  };
}
