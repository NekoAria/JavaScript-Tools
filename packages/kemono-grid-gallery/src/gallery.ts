import cssText from './style.css?raw';

interface PreparedGallery {
  grid: HTMLElement;
  loadingOverlay: HTMLDivElement;
}

const GRID_SELECTOR = '.card-list__items';
const POST_CARD_SELECTOR = '.post-card';
const POST_IMAGE_SELECTOR = '.post-card__image';
const STYLE_ELEMENT_ID = 'kemono-grid-gallery-style';

export function addGalleryStyles(): void {
  if (document.querySelector(`#${STYLE_ELEMENT_ID}`)) {
    return;
  }

  const style = document.createElement('style');

  style.id = STYLE_ELEMENT_ID;
  style.textContent = cssText;
  document.head.append(style);
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

function getPostIdFromCard(card: Element): string | null {
  const link = card.querySelector<HTMLAnchorElement>('a[href*="/user/"][href*="/post/"]');

  if (!link) {
    return null;
  }

  return new URL(link.href).pathname.split('/').findLast(Boolean) || null;
}

export async function prepareGallery(): Promise<PreparedGallery> {
  const grid = await waitForElement<HTMLElement>(GRID_SELECTOR);

  grid.style.removeProperty('--card-size');

  return { grid, loadingOverlay: createLoadingOverlay() };
}

async function updateCardThumbnail(
  card: Element,
  imageBaseUrl: string,
  postAttachmentMap: ReadonlyMap<string, string>,
): Promise<void> {
  const postId = getPostIdFromCard(card);

  if (!postId) {
    return;
  }

  const imagePath = postAttachmentMap.get(postId);
  const image = card.querySelector<HTMLImageElement>(POST_IMAGE_SELECTOR);

  if (!image || !imagePath) {
    return;
  }

  await updateImageSource(image, `${imageBaseUrl}${imagePath}`);
}

export async function updateGalleryThumbnails(
  grid: Element,
  imageBaseUrl: string,
  postAttachmentMap: ReadonlyMap<string, string>,
): Promise<void> {
  const cards = [...grid.querySelectorAll<HTMLElement>(POST_CARD_SELECTOR)];

  await Promise.all(
    cards.map((card) => updateCardThumbnail(card, imageBaseUrl, postAttachmentMap)),
  );
}

async function updateImageSource(image: HTMLImageElement, imageUrl: string): Promise<void> {
  if (image.src === imageUrl && image.complete) {
    return;
  }

  const loadPromise = waitForNextImageLoad(image);

  image.src = imageUrl;

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

function waitForNextImageLoad(image: HTMLImageElement): Promise<void> {
  return new Promise((resolve) => {
    const finish = (): void => {
      image.removeEventListener('load', finish);
      image.removeEventListener('error', finish);
      resolve();
    };

    image.addEventListener('load', finish);
    image.addEventListener('error', finish);
  });
}
