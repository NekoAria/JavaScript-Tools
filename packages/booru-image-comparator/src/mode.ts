import type { ModeType, StateManager } from './types';

import { LAYOUT_FLUSH_MS, MODES, OVERLAY_INIT_DELAY_MS } from './constants';
import { updateOpacity } from './filter';
import { initOverlayPanzoom, restoreZoomState } from './panzoom';
import { $ } from './shadow';
import { initSlider } from './slider';

function createOverlayImages(): void {
  const pan = $<HTMLElement>('#overlay-pan');
  const leftImg = $<HTMLImageElement>('#left-image');
  const rightImg = $<HTMLImageElement>('#right-image');

  if (!pan || !leftImg || !rightImg) {
    return;
  }

  const leftClone = leftImg.cloneNode(true) as HTMLImageElement;

  leftClone.id = 'overlay-left-image';
  leftClone.classList.add('compared-img', 'overlay-img');

  const rightClone = rightImg.src?.trim()
    ? (rightImg.cloneNode(true) as HTMLImageElement)
    : Object.assign(document.createElement('img'), { alt: rightImg.alt });

  rightClone.id = 'overlay-image';
  rightClone.classList.add('compared-img', 'overlay-img');
  if (!rightImg.src?.trim()) {
    rightClone.classList.add('is-hidden');
  }

  pan.append(leftClone, rightClone);
}

function hideMainElements(): void {
  for (const id of ['left-side', 'right-side', 'comparison-divider'] as const) {
    $<HTMLElement>(`#${id}`)?.classList.add('is-overlay-hidden');
  }
}

function prepareOverlay(state: StateManager): void {
  hideMainElements();
  $<HTMLElement>('#comparison-overlay-container')?.classList.remove('is-hidden');
  createOverlayImages();
  initOverlayPanzoom(state);
}

/** Reset all mode-specific DOM changes to the default side-by-side layout. */
export function resetModeDisplay(): void {
  for (const id of ['left-side', 'right-side', 'comparison-divider'] as const) {
    $<HTMLElement>(`#${id}`)?.classList.remove('is-overlay-hidden');
  }

  const overlay = $<HTMLElement>('#comparison-overlay-container');

  if (overlay) {
    overlay.innerHTML = '<div class="sync-pan" id="overlay-pan"></div>';
    overlay.classList.add('is-hidden');
    overlay.classList.remove('is-inverted');
  }

  $<HTMLElement>('#fade-controls')?.classList.add('is-hidden');
  $<HTMLElement>('#difference-controls')?.classList.add('is-hidden');
  $<HTMLElement>('#filter-controls')?.classList.remove('is-hidden');
}

/** Activate difference comparison mode: hide side-by-side panels, build overlay with difference blend mode. */
function setupDifference(state: StateManager): void {
  prepareOverlay(state);

  const img = $<HTMLImageElement>('#overlay-image');

  if (img?.src?.trim()) {
    img.classList.remove('is-hidden');
    img.classList.add('mode-difference');
  }

  const invertBtn = $<HTMLButtonElement>('#invert-difference');

  if (invertBtn) {
    invertBtn.textContent = 'Invert';
  }

  $<HTMLElement>('#difference-controls')?.classList.remove('is-hidden');
}

/** Activate fade comparison mode: hide side-by-side panels, build overlay with fade-opacity blending. */
function setupFade(state: StateManager): void {
  prepareOverlay(state);

  const img = $<HTMLImageElement>('#overlay-image');

  if (img?.src?.trim()) {
    img.classList.remove('is-hidden');
    img.classList.add('mode-fade');
    updateOpacity();
  }
  $<HTMLElement>('#fade-controls')?.classList.remove('is-hidden');
}

export function setupMode(state: StateManager, mode: ModeType): void {
  switch (mode) {
    case MODES.SLIDER: {
      setupSlider(state);
      break;
    }
    case MODES.FADE: {
      setupFade(state);
      break;
    }
    case MODES.DIFFERENCE: {
      setupDifference(state);
      break;
    }
    default: {
      setTimeout(() => restoreZoomState(state), OVERLAY_INIT_DELAY_MS);
      break;
    }
  }
}

/** Activate slider comparison mode: hide side-by-side panels, build overlay, init panzoom, then init the draggable slider. */
function setupSlider(state: StateManager): void {
  prepareOverlay(state);
  setTimeout(() => initSlider(state), LAYOUT_FLUSH_MS);
}
