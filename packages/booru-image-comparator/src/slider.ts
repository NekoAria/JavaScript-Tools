import type { StateManager } from './types';

import { LAYOUT_FLUSH_MS, MODES } from './constants';
import { $ } from './shadow';

/** Cleanup array for slider DOM listeners. */
let sliderCleanup: Array<() => void> = [];

function bindSliderEvents(
  state: StateManager,
  sliderEl: HTMLElement,
  rightImg: HTMLImageElement,
  container: HTMLElement,
): void {
  unbindSlider();
  let dragging = false;

  const move = (e: MouseEvent) => {
    const x = e.clientX - container.getBoundingClientRect().left;

    updateSlider(state, sliderEl, rightImg, x, container);
  };

  // Recompute clip-path after zoom or pan gestures since the image's on-screen position changed
  const onPanzoomChange = () => {
    const raw = Number.parseInt(sliderEl.style.left);

    updateSlider(
      state,
      sliderEl,
      rightImg,
      Number.isNaN(raw) ? container.clientWidth / 2 : raw,
      container,
    );
  };

  const onSliderMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    dragging = true;
  };
  const onContainerMouseMove = (e: MouseEvent) => {
    if (dragging) {
      move(e);
    }
  };
  const onContainerMouseDown = (e: MouseEvent) => {
    if (e.target !== sliderEl) {
      move(e);
      dragging = true;
    }
  };
  const onMouseUp = () => {
    dragging = false;
  };

  sliderEl.addEventListener('mousedown', onSliderMouseDown);
  container.addEventListener('mousemove', onContainerMouseMove);
  container.addEventListener('mousedown', onContainerMouseDown);
  document.addEventListener('mouseup', onMouseUp);

  const newCleanup: Array<() => void> = [
    () => sliderEl.removeEventListener('mousedown', onSliderMouseDown),
    () => container.removeEventListener('mousemove', onContainerMouseMove),
    () => container.removeEventListener('mousedown', onContainerMouseDown),
    () => document.removeEventListener('mouseup', onMouseUp),
  ];

  const overlayPan = $<HTMLElement>('#overlay-pan');

  if (overlayPan && state.get().panzoomInstances.overlay) {
    for (const ev of ['panzoomchange', 'panzoomzoom', 'panzoompan'] as const) {
      overlayPan.addEventListener(ev, onPanzoomChange);
      newCleanup.push(() => overlayPan.removeEventListener(ev, onPanzoomChange));
    }
  }

  sliderCleanup = newCleanup;
}

/** Create and initialize the slider element in overlay mode. */
export function initSlider(state: StateManager): void {
  const container = $<HTMLElement>('#comparison-overlay-container');
  const rightImg = $<HTMLImageElement>('#overlay-image');

  if (!container || !rightImg?.src?.trim()) {
    return;
  }

  let el = $<HTMLElement>('#comparison-slider');

  if (!el) {
    el = document.createElement('div');
    el.id = 'comparison-slider';
    el.className = 'comparison-slider';
    container.append(el);
  }

  updateSlider(state, el, rightImg, container.clientWidth / 2, container);
  bindSliderEvents(state, el, rightImg, container);
}

/** Subscribe to state changes to recompute slider position when needed. */
export function subscribeSliderUpdater(state: StateManager): () => void {
  return state.subscribe((next, prev) => {
    if (
      next.mode === MODES.SLIDER &&
      // JSON.stringify for deep comparison of nested transform/zoom objects
      (JSON.stringify(next.transforms) !== JSON.stringify(prev.transforms) ||
        prev.mode !== MODES.SLIDER ||
        JSON.stringify(next.zoomState) !== JSON.stringify(prev.zoomState))
    ) {
      setTimeout(() => updateSliderIfNeeded(state), LAYOUT_FLUSH_MS);
    }
  });
}

/** Remove all slider event listeners. */
export function unbindSlider(): void {
  for (const fn of sliderCleanup) {
    fn();
  }
  sliderCleanup = [];
}

/** Position the slider divider and update the right image's clip-path. When panzoom is active,
 *  convert screen coordinates to image-local coordinates (accounting for pan offset and scale). */
function updateSlider(
  state: StateManager,
  sliderEl: HTMLElement,
  rightImg: HTMLImageElement,
  containerX: number,
  container: HTMLElement,
): void {
  const x = Math.max(0, Math.min(containerX, container.clientWidth));

  sliderEl.style.left = `${x}px`;

  const { panzoomInstances, transforms } = state.get();
  const pz = panzoomInstances.overlay;
  const flipped = transforms.right.flipH;

  if (pz) {
    const scale = pz.getScale();
    const imgRect = rightImg.getBoundingClientRect();
    const contRect = container.getBoundingClientRect();
    // Convert screen-space slider X to image-local X: subtract the image's left offset relative to container, then divide by scale
    const relX = x - (imgRect.left - contRect.left);
    const clipX = Math.max(0, relX / scale);

    rightImg.style.clipPath = flipped ? `inset(0 ${clipX}px 0 0)` : `inset(0 0 0 ${clipX}px)`;
  } else {
    rightImg.style.clipPath = flipped ? `inset(0 ${x}px 0 0)` : `inset(0 0 0 ${x}px)`;
  }
}

function updateSliderIfNeeded(state: StateManager): void {
  if (state.get().mode !== MODES.SLIDER) {
    return;
  }
  const sliderEl = $<HTMLElement>('#comparison-slider');
  const rightImg = $<HTMLImageElement>('#overlay-image');
  const container = $<HTMLElement>('#comparison-overlay-container');

  if (sliderEl && rightImg && container) {
    const raw = Number.parseInt(sliderEl.style.left);
    const x = Number.isNaN(raw) ? container.clientWidth / 2 : raw;

    updateSlider(state, sliderEl, rightImg, x, container);
  }
}
