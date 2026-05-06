import { openComparator } from './comparator';
import { addCompareLinks, addMainMenuLink } from './page';
import { getOriginalImageUrl } from './posts';
import { subscribeSliderUpdater } from './slider';
import { createAppState } from './state';
import { isValidPage } from './utils';

/** Initialize the comparator: build state, inject UI links, and watch for dynamic content. */
const init = (): void => {
  if (!isValidPage()) {
    return;
  }

  const state = createAppState();

  state.update('originalImageUrl', getOriginalImageUrl(state));

  // Register slider updater once for the page lifetime.
  subscribeSliderUpdater(state);

  const onCompare = (postId: string | null) => openComparator(postId, state);

  addCompareLinks(state, (id) => void onCompare(id));
  addMainMenuLink(state, () => void onCompare(null));

  const target =
    document.querySelector('.posts-container, .iqdb-posts, #post-list-posts') ?? document.body;

  let pendingRaf: number | null = null;
  const observer = new MutationObserver(() => {
    if (pendingRaf) {
      return;
    }
    pendingRaf = requestAnimationFrame(() => {
      pendingRaf = null;
      addCompareLinks(state, (id) => void onCompare(id));
    });
  });

  observer.observe(target, { childList: true, subtree: true });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
