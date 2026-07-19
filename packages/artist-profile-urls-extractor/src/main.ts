// Based on TypeA2's original bookmarklet: https://gist.github.com/TypeA2/dc1bb0ba549369dd079f15e44e5623eb

import type { ProfileUrls } from './extractor';

import { extractProfileUrls, utils } from './extractor';
import cssText from './style.css?raw';

const UI_ROOT_ID = 'artist-profile-urls-extractor-ui';
const COPY_FEEDBACK_DELAY = 1200;
const DRAG_THRESHOLD = 4;
const INITIAL_REFRESH_DELAY = 500;
const LOCATION_POLL_INTERVAL = 1000;
const MAX_REFRESH_RETRIES = 3;
const REFRESH_RETRY_DELAY = 1000;
const SPA_REFRESH_DELAY = 700;

interface DragState {
  height: number;
  initialLeft: number;
  initialTop: number;
  moved: boolean;
  startX: number;
  startY: number;
  width: number;
}

interface UiState {
  displayedProfileUrls: ProfileUrls | null;
  displayedSourceUrl: string | null;
  hostElement: HTMLDivElement | null;
  isSuppressNextClick: boolean;
  isWatchingNavigation: boolean;
  lastUrl: string;
  modalElement: HTMLDivElement | null;
  refreshTimer: ReturnType<typeof setTimeout> | null;
  refreshToken: number;
}

const uiState: UiState = {
  displayedProfileUrls: null,
  displayedSourceUrl: null,
  hostElement: null,
  isSuppressNextClick: false,
  isWatchingNavigation: false,
  lastUrl: location.href,
  modalElement: null,
  refreshTimer: null,
  refreshToken: 0,
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

const createElement = <K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  return element;
};

const createButton = (
  className: string,
  textContent: string,
  onClick: (event: MouseEvent) => void,
): HTMLButtonElement => {
  const button = createElement('button', className);

  button.type = 'button';
  button.textContent = textContent;
  button.addEventListener('click', onClick);

  return button;
};

const areProfileUrlsEqual = (left: ProfileUrls | null, right: ProfileUrls): boolean =>
  left?.primaryUrl === right.primaryUrl && left?.secondaryUrl === right.secondaryUrl;

const copyToClipboard = async (text: string, button: HTMLButtonElement): Promise<void> => {
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

const handleModalEscape = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') {
    closeModal();
  }
};

const closeModal = (): void => {
  document.removeEventListener('keydown', handleModalEscape);
  uiState.modalElement?.remove();
  uiState.modalElement = null;
};

const createUrlRow = (label: string, value: string): HTMLDivElement => {
  const row = createElement('div', 'url-row');
  const labelElement = createElement('label', 'url-label');
  const input = createElement('input', 'url-input');
  const copyButton = createButton('modal-button copy-button', 'Copy', () => {
    void copyToClipboard(value, copyButton);
  });

  labelElement.textContent = label;
  input.readOnly = true;
  input.type = 'text';
  input.value = value;
  row.append(labelElement, input, copyButton);

  return row;
};

const createModalActions = (
  output: string,
): { actions: HTMLDivElement; closeButton: HTMLButtonElement } => {
  const actions = createElement('div', 'actions');
  const copyAllButton = createButton('modal-button copy-all-button', 'Copy All', () => {
    void copyToClipboard(output, copyAllButton);
  });
  const closeButton = createButton('modal-button close-button', 'Close', closeModal);

  actions.append(copyAllButton, closeButton);

  return { actions, closeButton };
};

const showModal = (profileUrls: ProfileUrls): void => {
  closeModal();

  const backdrop = createElement('div', 'backdrop');
  const modal = createElement('section', 'modal');
  const title = createElement('h2', 'modal-title');
  const output = [profileUrls.primaryUrl, profileUrls.secondaryUrl].filter(Boolean).join('\n');
  const { actions, closeButton } = createModalActions(output);
  const rows: Array<[string, string | null]> = [
    ['Primary URL', profileUrls.primaryUrl],
    ['Secondary URL', profileUrls.secondaryUrl],
  ];
  const visibleRows = rows.filter((row): row is [string, string] => Boolean(row[1]));

  modal.setAttribute('aria-label', 'Profile URLs');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('role', 'dialog');
  title.textContent = 'Profile URLs';
  backdrop.addEventListener('click', (event: MouseEvent) => {
    if (event.target === backdrop) {
      closeModal();
    }
  });

  modal.append(title, ...visibleRows.map(([label, value]) => createUrlRow(label, value)), actions);
  backdrop.append(modal);
  uiState.hostElement?.shadowRoot?.append(backdrop);
  uiState.modalElement = backdrop;
  document.addEventListener('keydown', handleModalEscape);
  closeButton.focus();
};

const enableDrag = (button: HTMLButtonElement): void => {
  let dragState: DragState | null = null;

  button.addEventListener('pointerdown', (event: PointerEvent) => {
    if (event.button !== 0) {
      return;
    }

    const rect = uiState.hostElement?.getBoundingClientRect();

    if (!rect) {
      return;
    }

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

  button.addEventListener('pointermove', (event: PointerEvent) => {
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

    const { hostElement } = uiState;

    if (!hostElement) {
      return;
    }

    hostElement.style.left = `${clamp(
      dragState.initialLeft + deltaX,
      0,
      innerWidth - dragState.width,
    )}px`;
    hostElement.style.right = 'auto';
    hostElement.style.top = `${clamp(
      dragState.initialTop + deltaY,
      0,
      innerHeight - dragState.height,
    )}px`;
    event.preventDefault();
  });

  button.addEventListener('pointerup', () => {
    if (!dragState) {
      return;
    }

    uiState.isSuppressNextClick = dragState.moved;
    dragState = null;
    setTimeout(() => {
      uiState.isSuppressNextClick = false;
    }, 0);
  });

  button.addEventListener('pointercancel', () => {
    dragState = null;
  });
};

const createFloatingButton = (): HTMLButtonElement => {
  const button = createButton('floating-button', '🔗', () => {
    if (uiState.isSuppressNextClick) {
      uiState.isSuppressNextClick = false;

      return;
    }

    if (uiState.displayedProfileUrls) {
      showModal(uiState.displayedProfileUrls);
    }
  });

  button.setAttribute('aria-label', 'Show profile URLs');
  button.title = 'Drag to move. Click to show profile URLs.';
  enableDrag(button);

  return button;
};

const destroyFloatingUi = (): void => {
  closeModal();
  uiState.hostElement?.remove();
  uiState.displayedProfileUrls = null;
  uiState.displayedSourceUrl = null;
  uiState.hostElement = null;
};

const createFloatingUi = (profileUrls: ProfileUrls, sourceUrl: string): void => {
  destroyFloatingUi();
  document.querySelector(`#${UI_ROOT_ID}`)?.remove();

  const hostElement = document.createElement('div');
  const shadowRoot = hostElement.attachShadow({ mode: 'open' });

  hostElement.id = UI_ROOT_ID;

  const style = createElement('style');

  style.textContent = cssText;
  shadowRoot.append(style, createFloatingButton());
  document.documentElement.append(hostElement);
  uiState.hostElement = hostElement;
  uiState.displayedProfileUrls = profileUrls;
  uiState.displayedSourceUrl = sourceUrl;
};

const scheduleFloatingUiRefresh = (
  delay = INITIAL_REFRESH_DELAY,
  retriesLeft = MAX_REFRESH_RETRIES,
): void => {
  if (uiState.refreshTimer !== null) {
    clearTimeout(uiState.refreshTimer);
  }
  uiState.refreshTimer = setTimeout(() => refreshFloatingUi(retriesLeft), delay);
};

const refreshFloatingUi = async (retriesLeft = MAX_REFRESH_RETRIES): Promise<void> => {
  const currentToken = ++uiState.refreshToken;
  const refreshUrl = location.href;

  try {
    const profileUrls = await extractProfileUrls();

    if (currentToken !== uiState.refreshToken || refreshUrl !== location.href) {
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
      uiState.hostElement?.isConnected &&
      uiState.displayedSourceUrl === refreshUrl &&
      areProfileUrlsEqual(uiState.displayedProfileUrls, profileUrls)
    ) {
      return;
    }

    createFloatingUi(profileUrls, refreshUrl);
  } catch (error) {
    utils.warnUnexpectedError('Unexpected floating UI refresh error', error);

    if (currentToken !== uiState.refreshToken || refreshUrl !== location.href) {
      return;
    }

    destroyFloatingUi();

    if (retriesLeft > 0) {
      scheduleFloatingUiRefresh(REFRESH_RETRY_DELAY, retriesLeft - 1);
    }
  }
};

const handlePotentialNavigation = (): void => {
  if (location.href === uiState.lastUrl) {
    return;
  }

  uiState.lastUrl = location.href;
  // Prevent in-flight refreshes from recreating UI for the previous SPA route.
  uiState.refreshToken += 1;
  destroyFloatingUi();
  scheduleFloatingUiRefresh(SPA_REFRESH_DELAY);
};

const watchSpaNavigation = (): void => {
  if (uiState.isWatchingNavigation) {
    return;
  }

  uiState.isWatchingNavigation = true;
  addEventListener('popstate', handlePotentialNavigation);
  addEventListener('hashchange', handlePotentialNavigation);
  setInterval(handlePotentialNavigation, LOCATION_POLL_INTERVAL);
};

const initializeProfileUrlsExtractor = (): void => {
  watchSpaNavigation();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleFloatingUiRefresh(0), {
      once: true,
    });
  } else {
    scheduleFloatingUiRefresh(0);
  }

  if (document.readyState !== 'complete') {
    addEventListener('load', () => scheduleFloatingUiRefresh(), { once: true });
  }
};

initializeProfileUrlsExtractor();
