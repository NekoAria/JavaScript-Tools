// Based on TypeA2's original bookmarklet: https://gist.github.com/TypeA2/dc1bb0ba549369dd079f15e44e5623eb

import { extractProfileUrls, utils } from './extractor.js';
import cssText from './style.css?raw';

const UI_ROOT_ID = 'artist-profile-urls-extractor-ui';
const COPY_FEEDBACK_DELAY = 1200;
const DRAG_THRESHOLD = 4;
const INITIAL_REFRESH_DELAY = 500;
const LOCATION_POLL_INTERVAL = 1000;
const MAX_REFRESH_RETRIES = 3;
const REFRESH_RETRY_DELAY = 1000;
const SPA_REFRESH_DELAY = 700;

let displayedProfileUrls = null;
let displayedSourceUrl = null;
let hostElement = null;
let isWatchingNavigation = false;
let lastUrl = location.href;
let modalElement = null;
let refreshTimer = null;
let refreshToken = 0;
let shadowRoot = null;
let suppressNextClick = false;

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

const createElement = (tagName, className) => {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  return element;
};

const createButton = (className, textContent, onClick) => {
  const button = createElement('button', className);

  button.type = 'button';
  button.textContent = textContent;
  button.addEventListener('click', onClick);

  return button;
};

const areProfileUrlsEqual = (left, right) =>
  left?.primaryUrl === right?.primaryUrl && left?.secondaryUrl === right?.secondaryUrl;

const copyToClipboard = async (text, button) => {
  const originalText = button.textContent;

  button.disabled = true;

  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Copy failed';
  }

  setTimeout(() => {
    button.disabled = false;
    button.textContent = originalText;
  }, COPY_FEEDBACK_DELAY);
};

const handleModalEscape = (event) => {
  if (event.key === 'Escape') {
    closeModal();
  }
};

const closeModal = () => {
  document.removeEventListener('keydown', handleModalEscape);
  modalElement?.remove();
  modalElement = null;
};

const createUrlRow = (label, value) => {
  const row = createElement('div', 'url-row');
  const labelElement = createElement('label', 'url-label');
  const input = createElement('input', 'url-input');
  const copyButton = createButton('modal-button copy-button', 'Copy', () =>
    copyToClipboard(value, copyButton),
  );

  labelElement.textContent = label;
  input.readOnly = true;
  input.type = 'text';
  input.value = value;
  row.append(labelElement, input, copyButton);

  return row;
};

const createModalActions = (output) => {
  const actions = createElement('div', 'actions');
  const copyAllButton = createButton('modal-button copy-all-button', 'Copy All', () =>
    copyToClipboard(output, copyAllButton),
  );
  const closeButton = createButton('modal-button close-button', 'Close', closeModal);

  actions.append(copyAllButton, closeButton);

  return { actions, closeButton };
};

const showModal = (profileUrls) => {
  closeModal();

  const backdrop = createElement('div', 'backdrop');
  const modal = createElement('section', 'modal');
  const title = createElement('h2', 'modal-title');
  const output = [profileUrls.primaryUrl, profileUrls.secondaryUrl].filter(Boolean).join('\n');
  const { actions, closeButton } = createModalActions(output);
  const rows = [
    ['Primary URL', profileUrls.primaryUrl],
    ['Secondary URL', profileUrls.secondaryUrl],
  ].filter(([, value]) => value);

  modal.setAttribute('aria-label', 'Profile URLs');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('role', 'dialog');
  title.textContent = 'Profile URLs';
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      closeModal();
    }
  });

  modal.append(title, ...rows.map(([label, value]) => createUrlRow(label, value)), actions);
  backdrop.append(modal);
  shadowRoot.append(backdrop);
  modalElement = backdrop;
  document.addEventListener('keydown', handleModalEscape);
  closeButton.focus();
};

const enableDrag = (button) => {
  let dragState = null;

  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) {
      return;
    }

    const rect = hostElement.getBoundingClientRect();

    dragState = {
      height: rect.height,
      initialLeft: rect.left,
      initialTop: rect.top,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
    };
    button.setPointerCapture(event.pointerId);
  });

  button.addEventListener('pointermove', (event) => {
    if (!dragState) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;

    if (Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD) {
      dragState.moved = true;
    }

    if (!dragState.moved) {
      return;
    }

    hostElement.style.left = `${clamp(
      dragState.initialLeft + deltaX,
      0,
      globalThis.innerWidth - dragState.width,
    )}px`;
    hostElement.style.right = 'auto';
    hostElement.style.top = `${clamp(
      dragState.initialTop + deltaY,
      0,
      globalThis.innerHeight - dragState.height,
    )}px`;
    event.preventDefault();
  });

  button.addEventListener('pointerup', () => {
    if (!dragState) {
      return;
    }

    suppressNextClick = dragState.moved;
    dragState = null;
    setTimeout(() => {
      suppressNextClick = false;
    }, 0);
  });

  button.addEventListener('pointercancel', () => {
    dragState = null;
  });
};

const createFloatingButton = () => {
  const button = createButton('floating-button', '🔗', () => {
    if (suppressNextClick) {
      suppressNextClick = false;

      return;
    }

    if (displayedProfileUrls) {
      showModal(displayedProfileUrls);
    }
  });

  button.setAttribute('aria-label', 'Show profile URLs');
  button.title = 'Drag to move. Click to show profile URLs.';
  enableDrag(button);

  return button;
};

const destroyFloatingUi = () => {
  closeModal();
  hostElement?.remove();
  displayedProfileUrls = null;
  displayedSourceUrl = null;
  hostElement = null;
  shadowRoot = null;
};

const createFloatingUi = (profileUrls, sourceUrl) => {
  destroyFloatingUi();
  document.querySelector(`#${UI_ROOT_ID}`)?.remove();

  hostElement = document.createElement('div');
  hostElement.id = UI_ROOT_ID;
  shadowRoot = hostElement.attachShadow({ mode: 'open' });

  const style = createElement('style');

  style.textContent = cssText;
  shadowRoot.append(style, createFloatingButton());
  document.documentElement.append(hostElement);
  displayedProfileUrls = profileUrls;
  displayedSourceUrl = sourceUrl;
};

const scheduleFloatingUiRefresh = (
  delay = INITIAL_REFRESH_DELAY,
  retriesLeft = MAX_REFRESH_RETRIES,
) => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refreshFloatingUi(retriesLeft), delay);
};

const refreshFloatingUi = async (retriesLeft = MAX_REFRESH_RETRIES) => {
  const currentToken = ++refreshToken;
  const refreshUrl = location.href;

  try {
    const profileUrls = await extractProfileUrls();

    if (currentToken !== refreshToken || refreshUrl !== location.href) {
      return;
    }

    if (!profileUrls) {
      destroyFloatingUi();

      if (retriesLeft > 0) {
        scheduleFloatingUiRefresh(REFRESH_RETRY_DELAY, retriesLeft - 1);
      }

      return;
    }

    if (
      hostElement?.isConnected &&
      displayedSourceUrl === refreshUrl &&
      areProfileUrlsEqual(displayedProfileUrls, profileUrls)
    ) {
      return;
    }

    createFloatingUi(profileUrls, refreshUrl);
  } catch (error) {
    utils.warnUnexpectedError('Unexpected floating UI refresh error', error);

    if (currentToken !== refreshToken || refreshUrl !== location.href) {
      return;
    }

    destroyFloatingUi();

    if (retriesLeft > 0) {
      scheduleFloatingUiRefresh(REFRESH_RETRY_DELAY, retriesLeft - 1);
    }
  }
};

const handlePotentialNavigation = () => {
  if (location.href === lastUrl) {
    return;
  }

  lastUrl = location.href;
  // Prevent in-flight refreshes from recreating UI for the previous SPA route.
  refreshToken += 1;
  destroyFloatingUi();
  scheduleFloatingUiRefresh(SPA_REFRESH_DELAY);
};

const watchSpaNavigation = () => {
  if (isWatchingNavigation) {
    return;
  }

  isWatchingNavigation = true;
  globalThis.addEventListener('popstate', handlePotentialNavigation);
  globalThis.addEventListener('hashchange', handlePotentialNavigation);
  setInterval(handlePotentialNavigation, LOCATION_POLL_INTERVAL);
};

const initializeProfileUrlsExtractor = () => {
  watchSpaNavigation();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleFloatingUiRefresh(0), {
      once: true,
    });
  } else {
    scheduleFloatingUiRefresh(0);
  }

  if (document.readyState !== 'complete') {
    globalThis.addEventListener('load', () => scheduleFloatingUiRefresh(), { once: true });
  }
};

initializeProfileUrlsExtractor();
