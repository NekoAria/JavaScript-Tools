import type { SiteType } from './types';

const SITE_MAP: Record<string, SiteType> = {
  'danbooru.donmai.us': 'danbooru',
  'betabooru.donmai.us': 'danbooru',
  'safebooru.donmai.us': 'danbooru',
  'sonohara.donmai.us': 'danbooru',
  'hijiribe.donmai.us': 'danbooru',
  'yande.re': 'yandere',
  'konachan.com': 'konachan',
};

/** Detect the current booru site from window.location. */
export function detectSite(): SiteType | null {
  return detectSiteFromHostname(globalThis.location.hostname);
}

/** Map a hostname to a known booru site identifier. */
export function detectSiteFromHostname(hostname: string): SiteType | null {
  return SITE_MAP[hostname] ?? null;
}

/** Extract a post ID from a preview article element. */
export function extractPostIdFromArticle(el: HTMLElement): string | null {
  const direct = el.dataset.id;

  if (direct) {
    return direct;
  }

  return (
    el
      .querySelector<HTMLAnchorElement>('a.thumb')
      ?.getAttribute('href')
      ?.match(/\/(?:post\/show|posts)\/(\d+)/)?.[1] ?? null
  );
}

/** Extract a post ID from a URL pathname. */
export function extractPostIdFromPath(pathname: string): string | null {
  return pathname.match(/\/(?:show|similar)\/(\d+)/)?.[1] ?? null;
}

/** Extract a post ID from a full post URL. */
export function extractPostIdFromUrl(url: string): string | null {
  return url.match(/\/(?:posts|show)\/(\d+)/)?.[1] ?? null;
}

/** Check if the current page is one the comparator should activate on. */
export function isValidPage(): boolean {
  const { hostname, pathname, href } = globalThis.location;

  if (hostname.endsWith('.donmai.us')) {
    return /\/posts\/\d+/.test(href) || /\/uploads\/\d+/.test(href) || /\/iqdb_queries/.test(href);
  }

  return /\/post\/(show|similar)/.test(pathname);
}

/** Validate that a string is a recognized booru post URL. */
export function isValidPostUrl(url: string): boolean {
  return /https:\/\/([\w.-]+\.donmai\.us\/posts|yande\.re\/post\/show|konachan\.com\/post\/show)\/\d+/.test(
    url,
  );
}
