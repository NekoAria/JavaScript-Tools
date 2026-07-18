import cssText from './style.css?raw';

interface Attachment {
  path?: string | null;
}

interface GalleryState {
  debounceTimer: ReturnType<typeof setTimeout> | null;
  isPendingInitialization: boolean;
  isProcessing: boolean;
  lastUrl: string;
}

type HistoryMethodName = 'pushState' | 'replaceState';
type JsonRecord = Record<string, unknown>;

interface Post {
  attachments?: Attachment[];
  file?: PostFile | null;
  id?: number | string | null;
}

interface PostFile {
  path?: string | null;
}

interface SiteConfig {
  API_BASE_URL: string;
  IMAGE_BASE_URL: string;
}

interface UserPath {
  service: string;
  userId: string;
}

const CONFIG: {
  SELECTORS: {
    GRID: string;
    POST_CARD: string;
    POST_IMAGE: string;
  };
  SITES: Readonly<Record<string, SiteConfig>>;
  SUPPORTED_IMAGES: ReadonlySet<string>;
} = {
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
    'pawchive.st': {
      API_BASE_URL: 'https://pawchive.st/api/v1',
      IMAGE_BASE_URL: 'https://img.pawchive.st/thumbnail/data',
    },
  },
  SUPPORTED_IMAGES: new Set(['.bmp', '.gif', '.jpeg', '.jpg', '.png', '.webp']),
};

const URL_CHANGE_DEBOUNCE_MS = 200;
const STYLE_ELEMENT_ID = 'kemono-grid-gallery-style';

const galleryState: GalleryState = {
  debounceTimer: null,
  isPendingInitialization: false,
  isProcessing: false,
  lastUrl: location.href,
};

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getOptionalPath = (value: unknown): string | null | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const { path } = value;

  return typeof path === 'string' || path === null ? path : undefined;
};

const parsePost = (value: unknown): Post | null => {
  if (!isRecord(value)) {
    return null;
  }

  const post: Post = {};

  if (typeof value.id === 'string' || typeof value.id === 'number' || value.id === null) {
    post.id = value.id;
  }

  if (Array.isArray(value.attachments)) {
    post.attachments = value.attachments.flatMap((attachment) => {
      if (!isRecord(attachment)) {
        return [];
      }

      return [{ path: getOptionalPath(attachment) }];
    });
  }

  if (value.file === null) {
    post.file = null;
  } else if (isRecord(value.file)) {
    post.file = { path: getOptionalPath(value.file) };
  }

  return post;
};

const parsePosts = (value: unknown): Post[] => {
  if (!Array.isArray(value)) {
    throw new TypeError('Invalid posts response: expected an array');
  }

  return value.flatMap((post) => {
    const parsedPost = parsePost(post);

    return parsedPost ? [parsedPost] : [];
  });
};

function addStyles(): void {
  if (document.querySelector(`#${STYLE_ELEMENT_ID}`)) {
    return;
  }

  const style = document.createElement('style');

  style.id = STYLE_ELEMENT_ID;
  style.textContent = cssText;
  document.head.append(style);
}

function buildPostAttachmentMap(posts: Post[]): Map<string, string> {
  const postAttachments = new Map<string, string>();

  for (const post of posts) {
    const imagePath = getFirstImagePath(post);

    if (post.id != null && imagePath && isImageFile(imagePath)) {
      postAttachments.set(String(post.id), imagePath);
    }
  }

  return postAttachments;
}

function createLoadingOverlay(): HTMLDivElement {
  const overlay = document.createElement('div');

  overlay.className = 'loading-overlay';
  overlay.innerHTML = `
      <div class="loading-spinner"></div>
      <span>Loading images...</span>
    `;
  document.body.append(overlay);

  return overlay;
}

async function fetchPosts(siteConfig: SiteConfig, { service, userId }: UserPath): Promise<Post[]> {
  const url = new URL(`${siteConfig.API_BASE_URL}/${service}/user/${userId}/posts`);

  url.search = location.search;

  const response = await fetch(url.href);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data: unknown = await response.json();

  return parsePosts(data);
}

function getCurrentSiteConfig(): SiteConfig | null {
  return CONFIG.SITES[location.hostname] ?? null;
}

function getFirstImagePath(post: Post): string | null {
  const attachments = post.attachments ?? [];
  const firstImageAttachment = attachments.find((attachment) => isImageFile(attachment.path));

  return firstImageAttachment?.path || post.file?.path || null;
}

function getPostIdFromCard(card: Element): string | null {
  const link = card.querySelector<HTMLAnchorElement>('a[href*="/user/"][href*="/post/"]');

  if (!link) {
    return null;
  }

  return new URL(link.href).pathname.split('/').findLast(Boolean) || null;
}

function handleUrlChange(): void {
  if (location.href === galleryState.lastUrl) {
    return;
  }

  galleryState.lastUrl = location.href;
  scheduleInitializeGallery();
}

async function initializeGallery(): Promise<void> {
  const siteConfig = getCurrentSiteConfig();
  const urlParams = parseUserPath();

  if (!siteConfig || !urlParams) {
    return;
  }

  const grid = await waitForElement<HTMLElement>(CONFIG.SELECTORS.GRID);

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

async function initializeGallerySafely(): Promise<void> {
  if (galleryState.isProcessing) {
    galleryState.isPendingInitialization = true;

    return;
  }

  galleryState.isProcessing = true;

  try {
    do {
      galleryState.isPendingInitialization = false;
      await initializeGallery();
    } while (galleryState.isPendingInitialization);
  } catch (error) {
    console.error('Gallery initialization failed:', error);
  } finally {
    galleryState.isProcessing = false;
  }
}

function isImageFile(path: string | null | undefined): boolean {
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

function parseUserPath(): UserPath | null {
  const match = location.pathname.match(/^\/([^/]+)\/user\/([^/]+)\/?$/);

  if (!match) {
    return null;
  }

  const [, service, userId] = match;

  return { service, userId };
}

async function processCard(
  card: Element,
  siteConfig: SiteConfig,
  postAttachments: ReadonlyMap<string, string>,
): Promise<void> {
  const postId = getPostIdFromCard(card);

  if (!postId) {
    return;
  }

  const imagePath = postAttachments.get(postId);
  const imgElement = card.querySelector<HTMLImageElement>(CONFIG.SELECTORS.POST_IMAGE);

  if (!imgElement || !imagePath) {
    return;
  }

  const imageUrl = `${siteConfig.IMAGE_BASE_URL}${imagePath}`;

  await updateImageSource(imgElement, imageUrl);
}

async function processCards(
  grid: Element,
  siteConfig: SiteConfig,
  postAttachments: ReadonlyMap<string, string>,
): Promise<void> {
  const cards = [...grid.querySelectorAll<HTMLElement>(CONFIG.SELECTORS.POST_CARD)];

  await Promise.all(cards.map((card) => processCard(card, siteConfig, postAttachments)));
}

function scheduleInitializeGallery(): void {
  if (galleryState.debounceTimer !== null) {
    clearTimeout(galleryState.debounceTimer);
  }
  galleryState.debounceTimer = setTimeout(() => {
    void initializeGallerySafely();
  }, URL_CHANGE_DEBOUNCE_MS);
}

function setupHistoryListener(methodName: HistoryMethodName): void {
  const originalMethod: History['pushState'] = history[methodName];
  const wrappedMethod: History['pushState'] = function (...args) {
    const result = Reflect.apply(originalMethod, history, args);

    handleUrlChange();

    return result;
  };

  history[methodName] = wrappedMethod;
}

function setupUrlChangeListener(): void {
  const observer = new MutationObserver(() => handleUrlChange());

  observer.observe(document.body, { childList: true, subtree: true });
  addEventListener('popstate', handleUrlChange);

  setupHistoryListener('pushState');
  setupHistoryListener('replaceState');
}

function start(): void {
  if (!document.body) {
    addEventListener('DOMContentLoaded', start, { once: true });

    return;
  }

  addStyles();
  void initializeGallerySafely();
  setupUrlChangeListener();
}

async function updateImageSource(imgElement: HTMLImageElement, imageUrl: string): Promise<void> {
  if (imgElement.src === imageUrl && imgElement.complete) {
    return;
  }

  const loadPromise = waitForNextImageLoad(imgElement);

  imgElement.src = imageUrl;

  await loadPromise;
}

function waitForElement<T extends Element>(selector: string): Promise<T> {
  return new Promise((resolve) => {
    const element = document.querySelector<T>(selector);

    if (element) {
      resolve(element);

      return;
    }

    const observer = new MutationObserver((_, currentObserver) => {
      const nextElement = document.querySelector<T>(selector);

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

function waitForNextImageLoad(imgElement: HTMLImageElement): Promise<void> {
  return new Promise((resolve) => {
    const finish = (): void => {
      imgElement.removeEventListener('load', finish);
      imgElement.removeEventListener('error', finish);
      resolve();
    };

    imgElement.addEventListener('load', finish);
    imgElement.addEventListener('error', finish);
  });
}

start();
