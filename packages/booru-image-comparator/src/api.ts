import type { BooruPostData, StateManager } from './types';

import { detectSiteFromHostname } from './utils';

/** Fetch posts matching the given tag query from the current booru site. */
export async function fetchPostsByTag(query: string): Promise<BooruPostData[]> {
  const host = document.location.hostname;
  const endpoint = `/post.json?tags=${query}`;
  const res = await fetch(`https://${host}${endpoint}`);

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = (await res.json()) as BooruPostData | BooruPostData[];

  return Array.isArray(data) ? data : [data];
}

/** Fetch a single post by ID, optionally from a different host. */
export async function fetchSinglePost(
  postId: string,
  state: StateManager,
  sourceHost: string | null = null,
): Promise<BooruPostData> {
  const targetHost = sourceHost ?? document.location.hostname;
  const sourceSite = sourceHost ? detectSiteFromHostname(sourceHost) : state.get().site;
  const endpoint =
    sourceSite === 'danbooru' ? `/posts/${postId}.json` : `/post.json?tags=id:${postId}`;

  const res = await fetch(`https://${targetHost}${endpoint}`);

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = (await res.json()) as BooruPostData | BooruPostData[];

  return Array.isArray(data) ? data[0] : data;
}
