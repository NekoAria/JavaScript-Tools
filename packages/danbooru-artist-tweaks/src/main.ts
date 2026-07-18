import { initArtistPage } from './artist-page';
import { initArtistVersionsPage } from './artist-versions';
import { initOtherNamesEditor } from './other-names';
import cssText from './style.css?raw';

const addStyles = (): void => {
  const style = document.createElement('style');

  style.textContent = cssText;
  document.head.append(style);
};

const getArtistIdFromUrl = (): string | null => {
  const params = new URLSearchParams(location.search);

  return params.get('search[artist_id]');
};

const init = (): void => {
  addStyles();

  // Artist versions page
  if (location.pathname.startsWith('/artist_versions')) {
    const artistId = getArtistIdFromUrl();

    if (artistId) {
      void initArtistVersionsPage(artistId);
    }

    return;
  }

  // Artist new/edit page: expose a multi-line editor for other names.
  if (document.querySelector('#artist_other_names_string')) {
    initOtherNamesEditor();

    return;
  }

  // Artist page
  initArtistPage();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
