import type { StateManager } from './types';

import { fetchSinglePost } from './api';
import { MODES } from './constants';
import { updateInfoUI, updatePostInfo } from './dom';
import { resetZoom } from './panzoom';
import { extractImageUrl, getRelatedPosts } from './posts';
import { $ } from './shadow';
import { applyTransforms } from './transform';
import { detectSiteFromHostname, extractPostIdFromUrl, isValidPostUrl } from './utils';
import { updateMode } from './view';

/** Tracks in-flight AbortControllers keyed by image element. Uses WeakMap so controllers are automatically garbage-collected when their element is removed from the DOM. */
const loadAbortMap = new WeakMap<HTMLImageElement, AbortController>();

// Monotonically incremented token to discard stale async results and prevent race-condition overwrites
let currentLoadToken = 0;

/** Clear the right image and reset overlay state. */
function clearRightImage(): void {
  const rightImg = $<HTMLImageElement>('#right-image');
  const overlayImg = $<HTMLImageElement>('#overlay-image');

  if (rightImg) {
    rightImg.src = '';
    delete rightImg.dataset.id;
  }
  if (overlayImg) {
    overlayImg.src = '';
    overlayImg.classList.remove('mode-difference', 'mode-fade');
    overlayImg.classList.add('is-hidden');
    overlayImg.style.removeProperty('--fade-opacity');
    overlayImg.style.clipPath = '';
  }
  updatePostInfo();
}

/** Refresh overlay and UI after an image loads. */
function finalizeImageLoad(state: StateManager, postId: string): void {
  updateInfoUI(postId);
  resetZoom(state);
  updateMode(state);
}

function generateLoadToken(): number {
  return ++currentLoadToken;
}

/** Read the input field and trigger loading the comparison image. */
export function handleLoadImage(state: StateManager): void {
  const input = $<HTMLInputElement>('#second-image-input');
  const value = input?.value.trim();

  if (!value) {
    alert('Please enter a valid post ID or URL');

    return;
  }
  loadImage(state, value);
}

/** Cancel all pending image loads and bump the load token. */
export function invalidatePendingLoads(): void {
  ++currentLoadToken;
  const rightImg = $<HTMLImageElement>('#right-image');

  if (rightImg) {
    loadAbortMap.get(rightImg)?.abort();
  }
}

/** Load an image directly from a user-provided URL. */
function loadDirectUrl(state: StateManager, url: string): void {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Invalid URL format');
    }
    const rightImg = $<HTMLImageElement>('#right-image');

    if (!rightImg) {
      return;
    }

    const ac = new AbortController();

    loadAbortMap.set(rightImg, ac);

    rightImg.addEventListener(
      'error',
      () => {
        alert(`Failed to load image: ${url}`);
        clearRightImage();
      },
      { once: true, signal: ac.signal },
    );
    rightImg.addEventListener(
      'load',
      () => {
        rightImg.dataset.id = 'custom';
        finalizeImageLoad(state, 'custom');
      },
      { once: true, signal: ac.signal },
    );
    rightImg.src = url;
  } catch {
    alert('Invalid URL format');
  }
}

/** Load a comparison image by post ID, URL, or direct link. */
export function loadImage(state: StateManager, input: string): void {
  const rightImg = $<HTMLImageElement>('#right-image');

  if (rightImg) {
    loadAbortMap.get(rightImg)?.abort();
  }
  clearRightImage();

  const token = generateLoadToken();

  if (/^\d+$/.test(input)) {
    void loadPostById(state, input, token);
  } else if (isValidPostUrl(input)) {
    const id = extractPostIdFromUrl(input);

    if (id) {
      void loadPostById(state, id, token);
    } else {
      alert('Could not extract post ID from URL');
    }
  } else {
    loadDirectUrl(state, input);
  }
}

/**
 * Fetch post data and set the right image source.
 * Uses a two-phase cancellation pattern:
 * 1. A monotonically increasing `token` discards stale async results at key points.
 * 2. An AbortController (via `loadAbortMap`) cancels in-flight image DOM loads for direct URLs.
 */
async function loadPostById(state: StateManager, postId: string, token: number): Promise<void> {
  try {
    // Bail out early if a newer load has been requested while we were awaiting
    const posts = await getRelatedPosts(state);

    if (currentLoadToken !== token) {
      return;
    }

    const postData = posts.find((p) => p.id === postId);
    const sourceHost = postData?.sourceHost;
    const useExternalHost = sourceHost && sourceHost !== document.location.hostname;
    const data = await (useExternalHost
      ? fetchSinglePost(postId, state, sourceHost)
      : fetchSinglePost(postId, state));

    if (currentLoadToken !== token) {
      return;
    }

    const rightImg = $<HTMLImageElement>('#right-image');

    if (!rightImg) {
      return;
    }

    const sourceSite =
      (postData?.sourceHost && detectSiteFromHostname(postData.sourceHost)) || state.get().site;
    const imageUrl = extractImageUrl(data, sourceSite ?? 'danbooru');

    rightImg.src = imageUrl;
    rightImg.dataset.id = postId;
    finalizeImageLoad(state, postId);
  } catch (error) {
    if (currentLoadToken !== token) {
      return;
    }
    alert(`Failed to load post: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Load the left (reference) image for IQDB or similar-search pages. */
export async function loadReferenceImage(state: StateManager): Promise<void> {
  const leftImg = $<HTMLImageElement>('#left-image');

  if (!leftImg) {
    return;
  }
  const { postId, isSimilar, searchUrl } = state.get();

  try {
    if (postId) {
      const data = await fetchSinglePost(postId, state);

      leftImg.src = extractImageUrl(data);
      leftImg.dataset.id = postId;
    } else if (isSimilar && searchUrl) {
      leftImg.src = searchUrl;
      leftImg.dataset.id = 'similar';
    }
  } catch (error) {
    console.warn(`Failed to load search image: ${(error as Error).message}`);
  }
  updatePostInfo();
}

/**
 * Swap a dataset attribute between two elements, handling undefined cleanly.
 * When one side lacks the attribute, it must be deleted (not set to 'undefined' string)
 * to preserve the semantics of `dataset` getter behavior.
 */
function swapDataAttr(a: HTMLElement, b: HTMLElement, key: string): void {
  const av = a.dataset[key];
  const bv = b.dataset[key];

  if (bv === undefined) {
    delete a.dataset[key];
  } else {
    a.dataset[key] = bv;
  }
  if (av === undefined) {
    delete b.dataset[key];
  } else {
    b.dataset[key] = av;
  }
}

/** Swap the left and right images along with their transforms. */
export function swapImages(state: StateManager): void {
  const leftImg = $<HTMLImageElement>('#left-image');
  const rightImg = $<HTMLImageElement>('#right-image');

  if (!leftImg || !rightImg) {
    return;
  }

  if (!rightImg.src.trim()) {
    return;
  }

  [leftImg.src, rightImg.src] = [rightImg.src, leftImg.src];
  swapDataAttr(leftImg, rightImg, 'id');

  const { transforms: t, mode } = state.get();

  state.update('transforms', { left: t.right, right: t.left });
  updatePostInfo();

  if (mode === MODES.SIDE_BY_SIDE) {
    applyTransforms(state);
  } else {
    updateMode(state);
  }
}
