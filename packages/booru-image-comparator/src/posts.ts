import type { BooruPostData, PostData, RelationshipType, SiteType, StateManager } from './types';

import { fetchPostsByTag } from './api';
import { RELATIONSHIP_PRIORITY } from './constants';
import { $ } from './shadow';
import { detectSiteFromHostname, extractPostIdFromArticle } from './utils';

function addPostFromPreview(
  el: HTMLElement,
  isParent: boolean,
  postId: string | null,
  posts: PostData[],
): void {
  const { id } = el.dataset;

  if (
    !id ||
    !el.querySelector('.post-preview-image') ||
    id === postId ||
    posts.some((p) => p.id === id)
  ) {
    return;
  }

  const parentId = document.body.dataset.postParentId;
  const relationshipType: RelationshipType = isParent
    ? id === parentId
      ? 'Parent'
      : 'Sibling'
    : 'Child';

  posts.push({ id, relationshipType });
}

function bindPostSelectorEvents(select: HTMLSelectElement, onSelect: () => void): void {
  select.addEventListener('change', () => {
    if (!select.value) {
      return;
    }
    const input = $<HTMLInputElement>('#second-image-input');

    if (input) {
      input.value = select.value;
    }
    onSelect();
  });
}

function buildPostSelector(state: StateManager, posts: PostData[]): HTMLElement {
  const { isIqdb, isSimilar, isUpload } = state.get();
  const label = isIqdb || isSimilar || isUpload ? 'Similar: ' : 'Related: ';

  const container = document.createElement('div');

  container.className = 'post-selector';

  const span = document.createElement('span');

  span.textContent = label;

  const select = document.createElement('select');

  select.className = 'form-control';
  populatePostSelector(select, posts);

  container.append(span, select);

  return container;
}

export async function createPostSelector(state: StateManager, onSelect: () => void): Promise<void> {
  const posts = await getRelatedPosts(state);

  if (posts.length === 0) {
    return;
  }
  const input = $<HTMLInputElement>('#second-image-input');

  if (!input?.parentElement) {
    return;
  }
  const wrap = buildPostSelector(state, posts);

  input.parentElement.insertBefore(wrap, input);
  const select = wrap.querySelector<HTMLSelectElement>('select');

  if (select) {
    bindPostSelectorEvents(select, onSelect);
  }
}

/** Extract parent/child post IDs from danbooru notice banners. */
function extractFromNotices(state: StateManager, posts: PostData[]): void {
  const { postId } = state.get();
  const notice = document.querySelector('.post-notice-parent, .post-notice-child');

  if (!notice) {
    return;
  }
  for (const link of notice.querySelectorAll<HTMLAnchorElement>(
    "a[href*='parent'], a[href*='child']",
  )) {
    const href = link.getAttribute('href');

    if (!href) {
      continue;
    }
    const decoded = decodeURIComponent(href);
    const isParent = /parent:/.test(decoded);
    const id = decoded.match(/(?:parent|child):(\d+)/)?.[1];

    if (id && id !== postId && posts.every((p) => p.id !== id)) {
      posts.push({ id, relationshipType: isParent ? 'Parent' : 'Child' });
    }
  }
}

/**
 * Extract related post IDs from relationship preview sections.
 * Reads parent/child/sibling links from the DOM preview elements rather than fetching via API,
 * since these relationships are already rendered on the page.
 */
function extractFromPreviews(state: StateManager, posts: PostData[]): void {
  const { postId } = state.get();

  for (const { selector, isParent } of [
    { selector: '#has-parent-relationship-preview', isParent: true },
    { selector: '#has-children-relationship-preview', isParent: false },
  ]) {
    const preview = document.querySelector(selector);

    if (!preview) {
      continue;
    }
    for (const el of preview.querySelectorAll<HTMLElement>('.post-preview')) {
      addPostFromPreview(el, isParent, postId, posts);
    }
  }
}

export function extractImageUrl(data: BooruPostData, site: SiteType = 'danbooru'): string {
  const url =
    site === 'danbooru' ? data.file_url || data.large_file_url : data.file_url || data.jpeg_url;

  if (!url) {
    throw new Error('No image URL found in post data');
  }

  return url;
}

/** Fetch child posts of the current post via the booru API. */
async function fetchChildren(state: StateManager, posts: PostData[]): Promise<void> {
  const { postId } = state.get();
  const children = await fetchPostsByTag(`parent:${postId}`);

  for (const p of children) {
    if (p.id.toString() !== postId) {
      posts.push({ id: p.id.toString(), relationshipType: 'Child' });
    }
  }
}

/** Fetch the parent and sibling posts of the current post via the booru API. */
async function fetchParentSiblings(state: StateManager, posts: PostData[]): Promise<void> {
  const { postId } = state.get();
  const resp = await fetchPostsByTag(`id:${postId}`);

  if (resp.length === 0) {
    return;
  }

  const current = resp.find((p: BooruPostData) => p.id.toString() === postId);

  if (!current?.parent_id) {
    return;
  }

  const siblings = await fetchPostsByTag(`parent:${current.parent_id}`);

  for (const p of siblings) {
    if (p.id.toString() === postId) {
      continue;
    }
    const rel: RelationshipType =
      p.id.toString() === current.parent_id?.toString() ? 'Parent' : 'Sibling';

    posts.push({ id: p.id.toString(), relationshipType: rel });
  }
}

function getDanbooru(state: StateManager): PostData[] {
  const { isIqdb, isUpload } = state.get();

  if (isIqdb || isUpload) {
    return getDanbooruSimilar(state);
  }

  const posts: PostData[] = [];

  extractFromPreviews(state, posts);
  extractFromNotices(state, posts);

  return posts;
}

/** Extract similar posts from Danbooru IQDB results already rendered on the page. */
function getDanbooruSimilar(state: StateManager): PostData[] {
  const { postId } = state.get();
  const posts: PostData[] = [];

  for (const el of document.querySelectorAll<HTMLElement>('.iqdb-posts .post-preview')) {
    const { id } = el.dataset;

    if (!id || id === postId) {
      continue;
    }
    const match = el
      .querySelector('.iqdb-similarity-score')
      ?.textContent?.match(/(\d+)%\s*similar/);

    posts.push({ id, relationshipType: 'Similar', similarity: match ? +match[1] : null });
  }

  return posts;
}

/** Resolve the best-available source URL for the current page's main image, falling back through multiple selectors per site. */
export function getOriginalImageUrl(state: StateManager): string | null {
  const { site, isUpload, isIqdb, isSimilar, searchUrl } = state.get();

  if (site === 'danbooru') {
    if (isUpload) {
      return document.querySelector<HTMLImageElement>('.media-asset-image')?.src || null;
    }
    if (isIqdb) {
      return searchUrl;
    }

    return (
      document.querySelector<HTMLAnchorElement>('.image-view-original-link')?.href ||
      document.querySelector<HTMLImageElement>('#image')?.src ||
      null
    );
  }
  if (isSimilar) {
    return searchUrl;
  }

  return document.querySelector<HTMLAnchorElement>('a#highres')?.href || null;
}

/** Gather related/similar posts for the current page context. */
export async function getRelatedPosts(state: StateManager): Promise<PostData[]> {
  const { site } = state.get();

  return site === 'danbooru' ? getDanbooru(state) : getYandereKonachan(state);
}

/** Build related posts list for Yandere/Konachan pages. */
async function getYandereKonachan(state: StateManager): Promise<PostData[]> {
  const { isSimilar, postId } = state.get();

  if (isSimilar) {
    return getYandereSimilar();
  }

  const posts: PostData[] = [];

  if (postId) {
    try {
      await fetchParentSiblings(state, posts);
    } catch (error) {
      console.warn('Failed to fetch parent/siblings:', error);
    }
    try {
      await fetchChildren(state, posts);
    } catch (error) {
      console.warn('Failed to fetch children:', error);
    }
  }

  return sortPosts(posts);
}

/** Extract similar posts from Yandere/Konachan similar-results page. */
function getYandereSimilar(): PostData[] {
  const posts: PostData[] = [];

  for (const el of document.querySelectorAll<HTMLElement>('#post-list-posts li')) {
    const id = extractPostIdFromArticle(el);

    if (!id) {
      continue;
    }
    const sourceHost = el.querySelector<HTMLImageElement>(':scope .similar-text img[alt]')?.alt;

    posts.push({ id, relationshipType: 'Similar', sourceHost: sourceHost || undefined });
  }

  return posts;
}

/** Fill the dropdown with related post options. */
function populatePostSelector(select: HTMLSelectElement, posts: PostData[]): void {
  select.append(new Option('-- Select post --', ''));
  const currentRightId = $<HTMLImageElement>('#right-image')?.dataset.id || null;

  // Build option text: similarity % > relationship type > source site label
  for (const post of posts) {
    let text = `#${post.id}`;

    if (post.similarity) {
      text += ` (${post.similarity}%)`;
    } else if (post.relationshipType !== 'Similar') {
      text += ` (${post.relationshipType})`;
    }
    if (post.sourceHost) {
      const site = detectSiteFromHostname(post.sourceHost);

      if (site) {
        text += ` [${site}]`;
      }
    }
    select.append(new Option(text, post.id));
  }

  if (currentRightId && posts.some((p) => p.id === currentRightId)) {
    select.value = currentRightId;
  }
}

/**
 * Sort posts by relationship priority, then by ID.
 * Priority order (lower = earlier): Similar > Parent > Sibling > Child.
 * Within the same priority, posts are ordered by numeric ID ascending.
 */
function sortPosts(posts: PostData[]): PostData[] {
  return posts.toSorted((a, b) => {
    const pa = RELATIONSHIP_PRIORITY[a.relationshipType] ?? 5;
    const pb = RELATIONSHIP_PRIORITY[b.relationshipType] ?? 5;

    return pa === pb ? +a.id - +b.id : pa - pb;
  });
}
