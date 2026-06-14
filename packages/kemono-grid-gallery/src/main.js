import cssText from './style.css?raw';

const CONFIG = {
  SELECTORS: {
    GRID: '.card-list__items',
    POST_CARD: '.post-card',
    POST_IMAGE: '.post-card__image',
  },
  SITES: {
    'coomer.st': {
      API_BASE_URL: 'https://coomer.st/api/v1',
      IMAGE_BASE_URL: 'https://img.coomer.st/thumbnail/data',
    },
    'kemono.cr': {
      API_BASE_URL: 'https://kemono.cr/api/v1',
      IMAGE_BASE_URL: 'https://img.kemono.cr/thumbnail/data',
    },
  },
  SUPPORTED_IMAGES: new Set(['.bmp', '.gif', '.jpeg', '.jpg', '.png', '.webp']),
};

const URL_CHANGE_DEBOUNCE_MS = 200;
const STYLE_ELEMENT_ID = 'kemono-grid-gallery-style';

let debounceTimer;
let isProcessing = false;
let lastUrl = globalThis.location.href;
let pendingInitialization = false;

function addStyles() {
  if (document.querySelector(`#${STYLE_ELEMENT_ID}`)) {
    return;
  }

  const style = document.createElement('style');

  style.id = STYLE_ELEMENT_ID;
  style.textContent = cssText;
  document.head.append(style);
}

function buildPostAttachmentMap(posts) {
  const postAttachments = new Map();

  for (const post of posts) {
    const imagePath = getFirstImagePath(post);

    if (post.id != null && imagePath && isImageFile(imagePath)) {
      postAttachments.set(String(post.id), imagePath);
    }
  }

  return postAttachments;
}

function createLoadingOverlay() {
  const overlay = document.createElement('div');

  overlay.className = 'loading-overlay';
  overlay.innerHTML = `
      <div class="loading-spinner"></div>
      <span>Loading images...</span>
    `;
  document.body.append(overlay);

  return overlay;
}

async function fetchPosts(siteConfig, { service, userId }) {
  const url = new URL(`${siteConfig.API_BASE_URL}/${service}/user/${userId}/posts`);

  url.search = globalThis.location.search;

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

function getCurrentSiteConfig() {
  return CONFIG.SITES[globalThis.location.hostname] || null;
}

function getFirstImagePath(post) {
  const attachments = Array.isArray(post.attachments) ? post.attachments : [];
  const firstImageAttachment = attachments.find((attachment) => isImageFile(attachment.path));

  return firstImageAttachment?.path || post.file?.path || null;
}

function getPostIdFromCard(card) {
  const link = card.querySelector('a[href*="/user/"][href*="/post/"]');

  if (!link) {
    return null;
  }

  return new URL(link.href).pathname.split('/').findLast(Boolean) || null;
}

function handleUrlChange() {
  if (globalThis.location.href === lastUrl) {
    return;
  }

  lastUrl = globalThis.location.href;
  scheduleInitializeGallery();
}

async function initializeGallery() {
  const siteConfig = getCurrentSiteConfig();
  const urlParams = parseUserPath();

  if (!siteConfig || !urlParams) {
    return;
  }

  const grid = await waitForElement(CONFIG.SELECTORS.GRID);

  grid.style.removeProperty('--card-size');

  const loadingOverlay = createLoadingOverlay();

  try {
    const posts = await fetchPosts(siteConfig, urlParams);
    const postAttachments = buildPostAttachmentMap(posts);

    await processCards(grid, siteConfig, postAttachments);
  } catch (error) {
    console.error('Failed to initialize gallery:', error);
  } finally {
    loadingOverlay.remove();
  }
}

async function initializeGallerySafely() {
  if (isProcessing) {
    pendingInitialization = true;

    return;
  }

  isProcessing = true;

  try {
    do {
      pendingInitialization = false;
      await initializeGallery();
    } while (pendingInitialization);
  } catch (error) {
    console.error('Gallery initialization failed:', error);
  } finally {
    isProcessing = false;
  }
}

function isImageFile(path) {
  if (!path) {
    return false;
  }

  const cleanPath = path.split(/[?#]/, 1)[0].toLowerCase();
  const extensionStart = cleanPath.lastIndexOf('.');

  if (extensionStart === -1) {
    return false;
  }

  return CONFIG.SUPPORTED_IMAGES.has(cleanPath.slice(extensionStart));
}

function parseUserPath() {
  const match = globalThis.location.pathname.match(/^\/([^/]+)\/user\/([^/]+)\/?$/);

  if (!match) {
    return null;
  }

  const [, service, userId] = match;

  return { service, userId };
}

async function processCard(card, siteConfig, postAttachments) {
  const postId = getPostIdFromCard(card);

  if (!postId) {
    return;
  }

  const imagePath = postAttachments.get(postId);
  const imgElement = card.querySelector(CONFIG.SELECTORS.POST_IMAGE);

  if (!imgElement || !imagePath) {
    return;
  }

  const imageUrl = `${siteConfig.IMAGE_BASE_URL}${imagePath}`;

  await updateImageSource(imgElement, imageUrl);
}

async function processCards(grid, siteConfig, postAttachments) {
  const cards = [...grid.querySelectorAll(CONFIG.SELECTORS.POST_CARD)];

  await Promise.all(cards.map((card) => processCard(card, siteConfig, postAttachments)));
}

function scheduleInitializeGallery() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(initializeGallerySafely, URL_CHANGE_DEBOUNCE_MS);
}

function setupHistoryListener(methodName) {
  const originalMethod = history[methodName];

  history[methodName] = function (...args) {
    const result = Reflect.apply(originalMethod, history, args);

    handleUrlChange();

    return result;
  };
}

function setupUrlChangeListener() {
  const observer = new MutationObserver(handleUrlChange);

  observer.observe(document.body, { childList: true, subtree: true });
  globalThis.addEventListener('popstate', handleUrlChange);

  setupHistoryListener('pushState');
  setupHistoryListener('replaceState');
}

function start() {
  if (!document.body) {
    globalThis.addEventListener('DOMContentLoaded', start, { once: true });

    return;
  }

  addStyles();
  initializeGallerySafely();
  setupUrlChangeListener();
}

async function updateImageSource(imgElement, imageUrl) {
  if (imgElement.src === imageUrl && imgElement.complete) {
    return;
  }

  const loadPromise = waitForNextImageLoad(imgElement);

  imgElement.src = imageUrl;

  await loadPromise;
}

function waitForElement(selector) {
  return new Promise((resolve) => {
    const element = document.querySelector(selector);

    if (element) {
      resolve(element);

      return;
    }

    const observer = new MutationObserver((_, currentObserver) => {
      const nextElement = document.querySelector(selector);

      if (nextElement) {
        currentObserver.disconnect();
        resolve(nextElement);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
}

function waitForNextImageLoad(imgElement) {
  return new Promise((resolve) => {
    const finish = () => {
      imgElement.removeEventListener('load', finish);
      imgElement.removeEventListener('error', finish);
      resolve();
    };

    imgElement.addEventListener('load', finish);
    imgElement.addEventListener('error', finish);
  });
}

start();
