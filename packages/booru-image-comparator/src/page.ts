import type { StateManager } from './types';

import { extractPostIdFromArticle } from './utils';

/** Inject "compare" links into post preview articles on listing pages. */
export function addCompareLinks(state: StateManager, onCompare: (postId: string) => void): void {
  const { site } = state.get();
  const selector =
    site === 'danbooru'
      ? '.posts-container .post-preview, .iqdb-posts .post-preview'
      : '#post-list-posts li';

  for (const article of document.querySelectorAll<HTMLElement>(selector)) {
    const postId = extractPostIdFromArticle(article);

    if (!postId || postId === state.get().postId || article.querySelector('.compare-link')) {
      continue;
    }

    const container = document.createElement('div');

    if (site === 'danbooru') {
      container.className = 'text-xs text-center mt-1';
    } else {
      container.style.cssText = 'text-align:center;margin-top:0.625rem';
    }

    const link = document.createElement('a');

    link.className = 'compare-link';
    link.textContent = 'compare »';
    link.href = '#';
    link.addEventListener('click', (e) => {
      e.preventDefault();
      onCompare(postId);
    });
    container.append(link);

    const score = article.querySelector('.post-preview-score');

    if (score) {
      score.before(container);
    } else {
      article.append(container);
    }
  }
}

/** Add a "Compare" entry to the site main navigation menu. */
export function addMainMenuLink(state: StateManager, onCompare: () => void): void {
  const { site } = state.get();
  const mainMenu =
    document.querySelector<HTMLElement>('#main-menu > ul') ??
    document.querySelector<HTMLElement>('#main-menu');

  if (!mainMenu || mainMenu.querySelector('#nav-compare')) {
    return;
  }

  const link = document.createElement('a');

  link.id = 'nav-compare';
  link.textContent = 'Compare';
  link.href = '#';
  // Heuristic: detect Danbooru's Tailwind-based UI by checking for a common utility class.
  if (document.querySelector('.px-3')) {
    link.className = 'py-1.5 px-3';
  }
  link.addEventListener('click', (e) => {
    e.preventDefault();
    onCompare();
  });

  if (site === 'danbooru') {
    mainMenu.append(link);
  } else {
    const li = document.createElement('li');

    li.append(link);
    mainMenu.append(li);
  }
}
