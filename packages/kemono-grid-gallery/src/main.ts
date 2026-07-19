import { addGalleryStyles, prepareGallery, updateGalleryThumbnails } from './gallery';
import { getCurrentUserPath, setupUrlChangeListener } from './navigation';
import { fetchPostAttachmentMap, getCurrentSiteConfig } from './posts';

interface GalleryState {
  debounceTimer: ReturnType<typeof setTimeout> | null;
  isPendingInitialization: boolean;
  isProcessing: boolean;
}

const URL_CHANGE_DEBOUNCE_MS = 200;

const galleryState: GalleryState = {
  debounceTimer: null,
  isPendingInitialization: false,
  isProcessing: false,
};

async function initializeGallery(): Promise<void> {
  const siteConfig = getCurrentSiteConfig();
  const userPath = getCurrentUserPath();

  if (!siteConfig || !userPath) {
    return;
  }

  const { grid, loadingOverlay } = await prepareGallery();

  try {
    const postAttachmentMap = await fetchPostAttachmentMap(siteConfig, userPath);

    await updateGalleryThumbnails(grid, siteConfig.IMAGE_BASE_URL, postAttachmentMap);
  } catch (error) {
    console.error('Failed to initialize gallery:', error);
  } finally {
    loadingOverlay.remove();
  }
}

async function requestGalleryInitialization(): Promise<void> {
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

function scheduleGalleryInitialization(): void {
  if (galleryState.debounceTimer !== null) {
    clearTimeout(galleryState.debounceTimer);
  }
  galleryState.debounceTimer = setTimeout(() => {
    void requestGalleryInitialization();
  }, URL_CHANGE_DEBOUNCE_MS);
}

function start(): void {
  if (!document.body) {
    addEventListener('DOMContentLoaded', start, { once: true });

    return;
  }

  addGalleryStyles();
  void requestGalleryInitialization();
  setupUrlChangeListener(scheduleGalleryInitialization);
}

start();
