import type { StateManager } from './types';

import { OVERLAY_INIT_DELAY_MS } from './constants';
import { buildInterface, getCurrentImageId, updatePostInfo } from './dom';
import {
  handleLoadImage,
  invalidatePendingLoads,
  loadImage,
  loadReferenceImage,
  swapImages,
} from './images';
import { resetModeDisplay } from './mode';
import { destroyAllZoom, initView } from './panzoom';
import { createPostSelector } from './posts';
import { createShadowHost, destroyShadow } from './shadow';
import { unbindSlider } from './slider';
import { restoreBackground, restoreMode } from './storage';
import { resetTransforms } from './transform';
import { bindEvents, updateMode } from './view';

/** Debounce timer for delayed overlay image loading. */
let pendingLoadTimer: ReturnType<typeof setTimeout> | null = null;

/** Original body overflow value saved before opening the comparator. */
let originalBodyOverflow: string | null = null;

/** Close the comparator and clean up all resources. */
function closeComparator(state: StateManager): void {
  if (pendingLoadTimer) {
    clearTimeout(pendingLoadTimer);
    pendingLoadTimer = null;
  }
  invalidatePendingLoads();
  unbindSlider();
  resetTransforms(state);
  resetModeDisplay();
  destroyAllZoom(state);
  for (const fn of state.get().eventCleanup) {
    fn();
  }
  state.update('eventCleanup', []);
  if (originalBodyOverflow !== null) {
    document.body.style.overflow = originalBodyOverflow;
    originalBodyOverflow = null;
  }
  destroyShadow();
}

/** Open the image comparator overlay. */
export async function openComparator(postId: string | null, state: StateManager): Promise<void> {
  const { host, shadow } = createShadowHost();
  const container = buildInterface(state);

  shadow.append(container);
  document.body.append(host);
  originalBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  const { originalImageUrl } = state.get();

  const leftImg = container.querySelector<HTMLImageElement>('#left-image');

  if (leftImg) {
    if (originalImageUrl) {
      leftImg.src = originalImageUrl;
    }
    leftImg.dataset.id = getCurrentImageId(state);
  }

  await setupComparator(state);
  if (postId) {
    // Allow DOM and Panzoom to initialize before loading the overlay image
    pendingLoadTimer = setTimeout(() => loadImage(state, postId), OVERLAY_INIT_DELAY_MS);
  }
}

/** Set up UI controls, event bindings, and load related images. */
async function setupComparator(state: StateManager): Promise<void> {
  await createPostSelector(state, () => handleLoadImage(state));

  bindEvents(state, {
    onClose: () => closeComparator(state),
    onLoadImage: () => handleLoadImage(state),
    onSwapImages: () => swapImages(state),
  });

  initView(state);
  restoreMode(state);
  restoreBackground();

  const { isIqdb, isSimilar, postId, originalImageUrl } = state.get();

  if ((isIqdb && postId && !originalImageUrl) || (isSimilar && postId)) {
    await loadReferenceImage(state);
  }

  updateMode(state);
  updatePostInfo();
}
