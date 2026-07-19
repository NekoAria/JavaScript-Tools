export interface ProfileUrls {
  primaryUrl: string;
  secondaryUrl: string | null;
}

interface ExtractProfileUrlsOptions {
  requireAdditionalUrl?: boolean;
  throwOnFailure?: boolean;
}

type JsonRecord = Record<string, unknown>;
type PlatformHandler = () => ProfileUrls | null | Promise<ProfileUrls | null>;

interface TumblrBlog {
  blogViewUrl?: string;
  blog_view_url?: string;
  url?: string;
  uuid?: string;
}

interface TwitterUserEntity {
  additionalName: string;
  identifier: string | number;
}

declare global {
  // External pages expose these values before the userscript runs.
  var __NEXT_DATA__: unknown;
  var ytInitialData: unknown;
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): JsonRecord | null => (isRecord(value) ? value : null);

const getRecord = (value: unknown, key: string): JsonRecord | null => {
  const record = asRecord(value);

  return record ? asRecord(record[key]) : null;
};

const getRecordAt = (value: unknown, ...path: string[]): JsonRecord | null => {
  let current: unknown = value;

  for (const key of path) {
    const next = getRecord(current, key);

    if (!next) {
      return null;
    }
    current = next;
  }

  return asRecord(current);
};

const getValueAt = (value: unknown, ...path: string[]): unknown => {
  let current: unknown = value;

  for (const key of path) {
    const record = asRecord(current);

    if (!record) {
      return undefined;
    }
    current = record[key];
  }

  return current;
};

const getString = (value: unknown, key: string): string | null => {
  const candidate = asRecord(value)?.[key];

  return typeof candidate === 'string' && candidate ? candidate : null;
};

const getArrayAt = (value: unknown, ...path: string[]): unknown[] => {
  const candidate = getValueAt(value, ...path);

  return Array.isArray(candidate) ? candidate : [];
};

const createProfileResult = (
  primaryUrl: string,
  secondaryUrl: string | null = null,
): ProfileUrls => ({ primaryUrl, secondaryUrl });
const LOG_PREFIX = '[artist-profile-urls-extractor]';
const TWITTER_RESERVED_PATHS = new Set([
  'compose',
  'explore',
  'home',
  'i',
  'messages',
  'notifications',
  'search',
  'settings',
]);
const TWITTER_PROFILE_TAB_PATHS = new Set(['', 'articles', 'highlights', 'media', 'with_replies']);
const TWITTER_STATUS_PATH_PATTERN = /^status\/\d+(?:\/(?:photo|video)\/\d+)?$/;
const TUMBLR_API_AUTHORIZATION = 'Bearer aIcXSOoTtqrzR8L8YEIOmBeW94c3FmbSNSWAUbxsny9KKx5VFh';

const utils = {
  safeJsonParse(text: string | null | undefined): unknown {
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  },

  async safeFetch(url: RequestInfo | URL, options?: RequestInit): Promise<Response | null> {
    try {
      const response = await fetch(url, options);

      return response.ok ? response : null;
    } catch {
      return null;
    }
  },

  getMetaContent(name: string, property = 'name'): string | undefined {
    // eslint-disable-next-line unicorn/require-css-escape -- Callers only pass static meta names.
    return document.querySelector<HTMLMetaElement>(`meta[${property}='${name}']`)?.content;
  },

  userNotFoundError(platform: string): string {
    return `Unable to retrieve user information from ${platform}`;
  },

  debugInfo(message: string, details?: unknown): void {
    if (details === undefined) {
      // eslint-disable-next-line no-console -- Debug logs are intentionally hidden by default.
      console.debug(LOG_PREFIX, message);
    } else {
      // eslint-disable-next-line no-console -- Debug logs are intentionally hidden by default.
      console.debug(LOG_PREFIX, message, details);
    }
  },

  warnUnexpectedError(message: string, error: unknown): void {
    console.warn(LOG_PREFIX, message, error);
  },
};

class ProfileExtractionError extends Error {
  readonly details: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'ProfileExtractionError';
    this.details = details;
  }
}

const fail = (message: string, details?: unknown): never => {
  throw new ProfileExtractionError(message, details);
};

const handleBluesky = async () => {
  const profileMatch = /\/profile\/([^/]+)/.exec(location.pathname);

  if (!profileMatch?.[1]) {
    return fail(utils.userNotFoundError('Bluesky'));
  }

  const identifier = profileMatch[1];
  let primaryUrl = `https://bsky.app/profile/${identifier}`;
  let secondaryUrl;

  if (identifier.startsWith('did:')) {
    // Prefer handle URLs for display, while keeping the DID URL as a stable fallback.
    const profileResponse = await utils.safeFetch(
      `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${identifier}`,
    );

    if (profileResponse) {
      const profileData: unknown = await profileResponse.json();
      const handle = getString(profileData, 'handle');

      if (handle) {
        primaryUrl = `https://bsky.app/profile/${handle}`;
      }
    }
    secondaryUrl = `https://bsky.app/profile/${identifier}`;
  } else {
    const identityResponse = await utils.safeFetch(
      `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${identifier}`,
    );

    if (identityResponse) {
      const identityData: unknown = await identityResponse.json();
      const did = getString(identityData, 'did');

      secondaryUrl = did ? `https://bsky.app/profile/${did}` : null;
    } else {
      secondaryUrl = null;
    }
  }

  return createProfileResult(primaryUrl, secondaryUrl);
};

const handleFacebook = () => {
  const androidUrl = utils.getMetaContent('al:android:url', 'property');
  const ogUrl = utils.getMetaContent('og:url', 'property');

  if (!androidUrl || !ogUrl) {
    return fail(utils.userNotFoundError('Facebook'));
  }

  const profileIdMatch = /\d+/.exec(androidUrl);

  if (!profileIdMatch?.[0]) {
    return fail(utils.userNotFoundError('Facebook'));
  }

  const primaryUrl = ogUrl;
  const secondaryUrl = `https://www.facebook.com/profile.php?id=${profileIdMatch[0]}`;

  return createProfileResult(primaryUrl, secondaryUrl);
};

const handleFantia = () => {
  const creatorProfileLink = document.querySelector<HTMLAnchorElement>('.fanclub-header a');

  if (!creatorProfileLink) {
    return fail(utils.userNotFoundError('Fantia'));
  }

  const creatorPath = creatorProfileLink.getAttribute('href');

  if (!creatorPath) {
    return fail(utils.userNotFoundError('Fantia'));
  }

  const primaryUrl = `https://fantia.jp${creatorPath}`;

  const creatorNickname = document.querySelector('#nickname');
  const nicknameValue = creatorNickname?.getAttribute('value');
  const secondaryUrl = nicknameValue ? `https://fantia.jp/${nicknameValue}` : null;

  return createProfileResult(primaryUrl, secondaryUrl);
};

const handleGumroad = () => {
  const rawPageData = document.querySelector<HTMLElement>('#app')?.dataset.page;

  if (!rawPageData) {
    return fail(utils.userNotFoundError('Gumroad'));
  }

  const pageData = utils.safeJsonParse(rawPageData);
  const creatorProfile = getRecordAt(pageData, 'props', 'creator_profile');
  const subdomain = getString(creatorProfile, 'subdomain');

  if (!subdomain) {
    return fail(utils.userNotFoundError('Gumroad'));
  }

  const primaryUrl = `https://${subdomain}`;
  const externalId = getString(creatorProfile, 'external_id');
  const secondaryUrl = externalId ? `https://${externalId}.gumroad.com` : null;

  return createProfileResult(primaryUrl, secondaryUrl);
};

const handleInkbunny = () => {
  const watchListLink = document
    .querySelector('a[href^="watchlist_process.php"]')
    ?.getAttribute('href');

  if (!watchListLink) {
    return fail(utils.userNotFoundError('Inkbunny'));
  }

  const watchListUrl = new URL(watchListLink, location.origin);
  const userId = watchListUrl.searchParams.get('user_id');

  if (!userId) {
    return fail(utils.userNotFoundError('Inkbunny'));
  }

  const primaryUrl = location.href;
  const secondaryUrl = `https://inkbunny.net/user.php?user_id=${userId}`;

  return createProfileResult(primaryUrl, secondaryUrl);
};

const handleKoFi = () => {
  const pageId = document.querySelector<HTMLElement>('[data-page-id]')?.dataset.pageId;

  if (!pageId) {
    return fail(utils.userNotFoundError('KoFi'));
  }

  const primaryUrl = location.href;
  const secondaryUrl = `https://ko-fi.com/${pageId}`;

  return createProfileResult(primaryUrl, secondaryUrl);
};

const handleLofter = () => {
  const controlFrame = document.querySelector<HTMLIFrameElement>('#control_frame');

  if (!controlFrame) {
    return fail(utils.userNotFoundError('Lofter'));
  }

  const primaryUrl = controlFrame.baseURI.replace(/\/$/, '');
  const url = new URL(controlFrame.src);
  const blogId = url.searchParams.get('blogId');

  if (!blogId) {
    return fail(utils.userNotFoundError('Lofter'));
  }

  const secondaryUrl = `https://www.lofter.com/mentionredirect.do?blogId=${blogId}`;

  return createProfileResult(primaryUrl, secondaryUrl);
};

const handleMihuashi = async () => {
  const { pathname } = location;
  const usernameElement = document.querySelector<HTMLElement>('h2.user-profile__name');

  if (!usernameElement) {
    return fail(utils.userNotFoundError('Mihuashi'));
  }

  // The name element includes a nested badge; clone it so the live DOM stays untouched.
  const clonedElement = usernameElement.cloneNode(true) as HTMLElement;
  const spanElement = clonedElement.querySelector('span');

  if (spanElement) {
    spanElement.remove();
  }
  const username = clonedElement.textContent?.trim() ?? '';

  if (!username) {
    return fail(utils.userNotFoundError('Mihuashi'));
  }

  const userUrl = `https://www.mihuashi.com/users/${username}`;

  if (pathname.startsWith('/profiles/')) {
    const profileIdMatch = /\/profiles\/(\d+)/.exec(pathname);

    if (!profileIdMatch?.[1]) {
      return fail(utils.userNotFoundError('Mihuashi'));
    }

    const profileId = profileIdMatch[1];
    const profileUrl = `https://www.mihuashi.com/profiles/${profileId}`;

    return createProfileResult(profileUrl, userUrl);
  }

  if (pathname.startsWith('/users/')) {
    const apiResponse = await utils.safeFetch(
      `https://www.mihuashi.com/api/v1/users/${username}/?by=name`,
    );

    if (!apiResponse) {
      return fail(utils.userNotFoundError('Mihuashi'));
    }

    const apiData: unknown = await apiResponse.json();
    const profileIdValue = getValueAt(apiData, 'user', 'id');

    if (typeof profileIdValue !== 'string' && typeof profileIdValue !== 'number') {
      return fail('Invalid user data returned from API');
    }

    const profileId = String(profileIdValue);
    const profileUrl = `https://www.mihuashi.com/profiles/${profileId}`;

    return createProfileResult(profileUrl, userUrl);
  }

  return fail(utils.userNotFoundError('Mihuashi'));
};

const PATREON_BASE_URL = 'https://www.patreon.com';
const PATREON_NON_VANITY_PATHS = new Set([
  'checkout',
  'creation',
  'explore',
  'home',
  'join',
  'login',
  'm',
  'messages',
  'notifications',
  'posts',
  'profile',
  'search',
  'settings',
  'signup',
  'user',
]);

const toPatreonNumericId = (value: unknown): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const id = String(value).trim();

  return /^\d+$/.test(id) ? id : null;
};

const getPatreonRelationshipId = (resource: unknown, relationshipName: string): string | null =>
  toPatreonNumericId(getValueAt(resource, 'relationships', relationshipName, 'data', 'id'));
const getPatreonUserProfileUrl = (userId: string): string => `${PATREON_BASE_URL}/user?u=${userId}`;

const getPatreonVanityPath = (value: unknown): string | null => {
  const path = typeof value === 'string' ? value.trim() : '';

  return path && !/[/?#]/.test(path) ? path : null;
};

const getPatreonVanityPathFromUrl = ({ pathname }: URL): string | null => {
  const [firstSegment, secondSegment] = pathname.split('/').filter(Boolean);
  const topLevelPath = firstSegment?.toLowerCase();

  if (topLevelPath === 'c' || topLevelPath === 'cw') {
    return getPatreonVanityPath(secondSegment);
  }

  if (!firstSegment || PATREON_NON_VANITY_PATHS.has(topLevelPath)) {
    return null;
  }

  return getPatreonVanityPath(firstSegment);
};

const getPatreonCampaignVanityPath = (campaign: unknown): string | null => {
  const vanityPath = getPatreonVanityPath(getValueAt(campaign, 'attributes', 'vanity'));

  if (vanityPath) {
    return vanityPath;
  }

  const campaignUrl = getValueAt(campaign, 'attributes', 'url');

  try {
    return typeof campaignUrl === 'string'
      ? getPatreonVanityPathFromUrl(new URL(campaignUrl, PATREON_BASE_URL))
      : null;
  } catch {
    return null;
  }
};

const getPatreonHtmlUserId = (): string | null => {
  const normalizedHtml = document.documentElement.outerHTML.replaceAll(String.raw`\/`, '/');

  return toPatreonNumericId(
    normalizedHtml.match(/https:\/\/www\.patreon\.com\/api\/user\/(\d+)/)?.[1],
  );
};

const handlePatreon = () => {
  const currentUrl = new URL(location.href);
  const explicitUserId = /^\/(?:user|profile\/creators)(?:\/|$)/.test(currentUrl.pathname)
    ? toPatreonNumericId(currentUrl.searchParams.get('u'))
    : null;

  if (explicitUserId) {
    return createProfileResult(getPatreonUserProfileUrl(explicitUserId));
  }

  const nextData =
    asRecord(globalThis.__NEXT_DATA__) ??
    asRecord(utils.safeJsonParse(document.querySelector('#__NEXT_DATA__')?.textContent));
  const pageProps = getRecordAt(nextData, 'props', 'pageProps');
  const bootstrap = getRecord(pageProps, 'bootstrapEnvelope') ?? pageProps;
  const routeVanityPath = getPatreonVanityPathFromUrl(currentUrl);
  const routeVanityKey = routeVanityPath?.toLowerCase();
  const campaignCandidates = [
    getRecordAt(bootstrap, 'pageBootstrap', 'campaign', 'data'),
    getRecordAt(bootstrap, 'commonBootstrap', 'campaign', 'data'),
  ]
    .filter((campaign): campaign is JsonRecord => campaign !== null)
    .map((campaign) => {
      const vanityPath = getPatreonCampaignVanityPath(campaign);

      return {
        creatorUserId: getPatreonRelationshipId(campaign, 'creator'),
        id: toPatreonNumericId(campaign.id),
        vanityKey: vanityPath?.toLowerCase(),
        vanityPath,
      };
    });
  const membershipCampaignId = toPatreonNumericId(
    /^\/m\/(\d+)(?:\/|$)/.exec(currentUrl.pathname)?.[1],
  );
  const matchedCampaign = campaignCandidates.find(({ id, vanityKey }) => {
    if (membershipCampaignId) {
      return id === membershipCampaignId;
    }

    return Boolean(routeVanityKey && vanityKey === routeVanityKey);
  });
  const currentPost = getRecordAt(bootstrap, 'pageBootstrap', 'post', 'data');
  const postId = toPatreonNumericId(
    currentUrl.pathname.startsWith('/creation')
      ? currentUrl.searchParams.get('hid')
      : /^\/posts\/(?:[^/]*-)?(\d+)\/?$/.exec(currentUrl.pathname)?.[1],
  );
  const queryVanityKey = getPatreonVanityPath(
    getValueAt(nextData, 'query', 'vanity'),
  )?.toLowerCase();
  const isCurrentBootstrapPost = postId
    ? toPatreonNumericId(currentPost?.id) === postId
    : Boolean(routeVanityKey && queryVanityKey === routeVanityKey);
  const hasCreatorRouteContext = Boolean(routeVanityPath || membershipCampaignId || postId);
  const pageUserId = hasCreatorRouteContext
    ? toPatreonNumericId(getValueAt(bootstrap, 'pageBootstrap', 'pageUser', 'data', 'id'))
    : null;
  const creatorUserId =
    (isCurrentBootstrapPost ? getPatreonRelationshipId(currentPost, 'user') : null) ??
    matchedCampaign?.creatorUserId ??
    pageUserId ??
    (hasCreatorRouteContext ? getPatreonHtmlUserId() : null);

  if (!creatorUserId) {
    return fail(utils.userNotFoundError('Patreon'));
  }

  const creatorVanityPath =
    matchedCampaign?.vanityPath ??
    campaignCandidates.find(
      ({ creatorUserId: campaignCreatorUserId }) => campaignCreatorUserId === creatorUserId,
    )?.vanityPath ??
    routeVanityPath;
  const userProfileUrl = getPatreonUserProfileUrl(creatorUserId);
  const primaryUrl = creatorVanityPath
    ? `${PATREON_BASE_URL}/${creatorVanityPath}`
    : userProfileUrl;
  const secondaryUrl = creatorVanityPath ? userProfileUrl : null;

  return createProfileResult(primaryUrl, secondaryUrl);
};

const handleRule34 = () => {
  const usernameElement = document.querySelector('#content > h2');
  const username = usernameElement?.textContent?.trim();

  const idLink = document.querySelector(
    'a[href*="s=tag_edits"][href*="id="], ' +
      'a[href*="page=favorites"][href*="id="], ' +
      'a[href*="s=report"][href*="user_id="]',
  );
  const userId = idLink?.getAttribute('href')?.match(/(?:user_)?id=(\d+)/)?.[1];

  if (!username || !userId) {
    return fail(utils.userNotFoundError('Rule34'));
  }

  const primaryUrl = `https://rule34.xxx/index.php?page=account&s=profile&uname=${username}`;
  const secondaryUrl = `https://rule34.xxx/index.php?page=account&s=profile&id=${userId}`;

  return createProfileResult(primaryUrl, secondaryUrl);
};

const getTwitterProfileName = (): string => {
  const profileMatch = /^\/([^/]+)(?:\/(.+?))?\/?$/.exec(location.pathname);
  const profileName = profileMatch?.[1];
  const profileSubpath = profileMatch?.[2]?.toLowerCase() ?? '';

  if (
    !profileName ||
    !/^[a-zA-Z0-9_]{1,15}$/.test(profileName) ||
    TWITTER_RESERVED_PATHS.has(profileName.toLowerCase()) ||
    (!TWITTER_PROFILE_TAB_PATHS.has(profileSubpath) &&
      !TWITTER_STATUS_PATH_PATTERN.test(profileSubpath))
  ) {
    return fail('Please open the profile page');
  }

  return profileName;
};

const normalizeTwitterProfileName = (profileName: string): string =>
  profileName.replace(/^@/, '').toLowerCase();

const findTwitterUserEntity = (
  root: ParentNode,
  expectedProfileName: string,
): TwitterUserEntity | null => {
  const expectedName = normalizeTwitterProfileName(expectedProfileName);
  const scriptTags = root.querySelectorAll<HTMLScriptElement>("script[type='application/ld+json']");

  for (const scriptTag of scriptTags) {
    const structuredData = utils.safeJsonParse(scriptTag.textContent);
    const userEntity = getRecord(structuredData, 'mainEntity');
    const additionalName = getString(userEntity, 'additionalName');
    const identifier = userEntity?.identifier;

    if (
      additionalName &&
      (typeof identifier === 'string' || typeof identifier === 'number') &&
      normalizeTwitterProfileName(additionalName) === expectedName
    ) {
      return { additionalName, identifier };
    }
  }

  return null;
};

const handleTwitter = async () => {
  const profileName = getTwitterProfileName();
  let userEntity = findTwitterUserEntity(document, profileName);

  if (!userEntity) {
    const profileUrl = new URL(`/${profileName}`, location.origin).href;
    const profileResponse = await utils.safeFetch(profileUrl, { cache: 'no-store' });
    const profileHtml = await profileResponse?.text();

    if (profileHtml) {
      const profileDocument = new DOMParser().parseFromString(profileHtml, 'text/html');

      userEntity = findTwitterUserEntity(profileDocument, profileName);
    }
  }

  if (!userEntity) {
    return fail(utils.userNotFoundError('Twitter'));
  }

  const primaryUrl = `https://x.com/${userEntity.additionalName}`;
  const secondaryUrl = `https://x.com/i/user/${userEntity.identifier}`;

  return createProfileResult(primaryUrl, secondaryUrl);
};

const handleFanbox = async () => {
  const { host } = location;
  let username;

  if (host === 'www.fanbox.cc') {
    const usernameMatch = /^\/@([a-zA-Z0-9_-]+)$/.exec(location.pathname);

    if (!usernameMatch?.[1]) {
      return fail(utils.userNotFoundError('Fanbox'));
    }
    username = usernameMatch[1];
  } else {
    username = host.split('.', 1)[0];
  }

  const apiResponse = await utils.safeFetch(
    `https://api.fanbox.cc/creator.get?creatorId=${username}`,
  );

  if (!apiResponse) {
    return fail(utils.userNotFoundError('Fanbox'));
  }

  const apiData: unknown = await apiResponse.json();
  const userIdValue = getValueAt(apiData, 'body', 'user', 'userId');

  if (typeof userIdValue !== 'string' && typeof userIdValue !== 'number') {
    return fail('Invalid user data returned from API');
  }

  const primaryUrl = location.href;
  const secondaryUrl = `https://www.pixiv.net/fanbox/creator/${String(userIdValue)}`;

  return createProfileResult(primaryUrl, secondaryUrl);
};

const handlePixiv = async () => {
  let primaryUrl;

  if (location.pathname.includes('users')) {
    primaryUrl = location.toString().replace('en/', '');
  } else {
    const userLink = document.querySelector<HTMLAnchorElement>("a[href*='/users/']");
    const userId = userLink?.dataset.gtmValue;

    if (!userId) {
      return fail(utils.userNotFoundError('Pixiv'));
    }
    primaryUrl = `https://www.pixiv.net/users/${userId}`;
  }

  const staccUrl = primaryUrl.replace('en/', '').replace('users', 'stacc/id');
  const secondaryResponse = await utils.safeFetch(staccUrl);
  const secondaryUrl = secondaryResponse?.url ?? null;

  return createProfileResult(primaryUrl, secondaryUrl);
};

const extractTiebaPortraitId = (avatarUrl: string | null | undefined): string | null => {
  if (!avatarUrl) {
    return null;
  }

  try {
    const avatarPath = new URL(avatarUrl.trim(), location.href).pathname;

    return /\/portrait\/item\/([^/]+)/.exec(avatarPath)?.[1] ?? null;
  } catch {
    return null;
  }
};

const handleTieba = () => {
  const username =
    document.querySelector('.user-information-wrapper .head-name')?.textContent?.trim() || null;

  const avatarImage = document.querySelector<HTMLImageElement>(
    '.user-information-wrapper .user-avatar img',
  );
  const avatarUrl = avatarImage?.dataset.src || avatarImage?.getAttribute('src');
  const portraitId = extractTiebaPortraitId(avatarUrl);

  if (!username || !portraitId) {
    return fail(utils.userNotFoundError('Tieba'));
  }

  const primaryUrl = `https://tieba.baidu.com/home/main?un=${username}`;
  const secondaryUrl = `https://tieba.baidu.com/home/main?id=${portraitId}`;

  return createProfileResult(primaryUrl, secondaryUrl);
};

const getTumblrBlogIdentifier = () => {
  const subdomain = /^(.+)\.tumblr\.com$/.exec(location.host)?.[1];

  if (subdomain && subdomain !== 'www') {
    return subdomain;
  }

  return /^\/([^/]+)/.exec(location.pathname)?.[1] ?? null;
};

const handleTumblr = async () => {
  const blogIdentifier = getTumblrBlogIdentifier();

  if (!blogIdentifier) {
    return fail(utils.userNotFoundError('Tumblr'));
  }

  const initialState = utils.safeJsonParse(
    document.querySelector('#___INITIAL_STATE___')?.textContent,
  );
  let blog: TumblrBlog | null = null;

  for (const query of getArrayAt(initialState, 'queries', 'queries')) {
    const data = getRecordAt(query, 'state', 'data');

    if (getString(data, 'name') === blogIdentifier) {
      blog = {
        blogViewUrl: getString(data, 'blogViewUrl') ?? undefined,
        blog_view_url: getString(data, 'blog_view_url') ?? undefined,
        url: getString(data, 'url') ?? undefined,
        uuid: getString(data, 'uuid') ?? undefined,
      };
      break;
    }
  }

  if (!blog) {
    const apiResponse = await utils.safeFetch(
      `https://api.tumblr.com/v2/blog/${encodeURIComponent(blogIdentifier)}/info`,
      { headers: { Authorization: TUMBLR_API_AUTHORIZATION } },
    );

    if (!apiResponse) {
      return fail(utils.userNotFoundError('Tumblr'));
    }

    const apiData: unknown = await apiResponse.json();
    const apiBlog = getRecordAt(apiData, 'response', 'blog');

    blog = apiBlog
      ? {
          blogViewUrl: getString(apiBlog, 'blogViewUrl') ?? undefined,
          blog_view_url: getString(apiBlog, 'blog_view_url') ?? undefined,
          url: getString(apiBlog, 'url') ?? undefined,
          uuid: getString(apiBlog, 'uuid') ?? undefined,
        }
      : null;
  }

  const blogUrl = blog?.url || blog?.blogViewUrl || blog?.blog_view_url;
  const primaryUrl =
    typeof blogUrl === 'string' ? blogUrl.replace(/^http:/, 'https:').replace(/\/$/, '') : null;

  if (!blog?.uuid || !primaryUrl) {
    return fail(utils.userNotFoundError('Tumblr'));
  }

  return createProfileResult(primaryUrl, `https://www.tumblr.com/blog/view/${blog.uuid}`);
};

const handleWeibo = () => {
  const nameElement = document.querySelector('[class^="_name_"]');
  const username = nameElement?.textContent?.trim();

  const followLink = document.querySelector('a[href*="/u/page/follow/"]');
  const followHref = followLink?.getAttribute('href');
  const userIdMatch = followHref ? /\/u\/page\/follow\/(\d+)/.exec(followHref) : null;
  const userId = userIdMatch?.[1];

  if (!username || !userId) {
    return fail(utils.userNotFoundError('Weibo'));
  }

  const primaryUrl = `https://www.weibo.com/n/${username}`;
  const secondaryUrl = `https://www.weibo.com/u/${userId}`;

  return createProfileResult(primaryUrl, secondaryUrl);
};

const handleYouTube = () => {
  const path = location.pathname;

  if (path.startsWith('/watch') || path.startsWith('/playlist')) {
    return fail('Please open the channel page');
  }

  const initialData = asRecord(globalThis.ytInitialData);

  if (!getRecord(initialData, 'metadata')) {
    return fail('Metadata not found');
  }

  const metadataRenderer = getRecordAt(initialData, 'metadata', 'channelMetadataRenderer');

  if (!metadataRenderer) {
    return fail('Channel metadata renderer not found');
  }

  let vanityChannelUrl = getString(metadataRenderer, 'vanityChannelUrl');
  const channelUrl = getString(metadataRenderer, 'channelUrl');

  if (vanityChannelUrl) {
    const urlObj = new URL(vanityChannelUrl);

    if (urlObj.protocol === 'http:') {
      urlObj.protocol = 'https:';
    }
    vanityChannelUrl = decodeURI(urlObj.href);
  }

  if (!vanityChannelUrl || !channelUrl) {
    return fail('Failed to extract channel URLs');
  }

  return createProfileResult(vanityChannelUrl, channelUrl);
};

const handleXfolio = (pageUrl: URL, ogUrl: string): ProfileUrls => {
  const creatorInfo = document.querySelector<HTMLElement>('div.creatorInfo');

  if (creatorInfo) {
    const primaryUrl = creatorInfo.dataset.creatorPortfolioTopUrl;

    if (!primaryUrl) {
      return fail(utils.userNotFoundError('Xfolio'));
    }

    const secondaryUrl = creatorInfo.dataset.creatorUrl;

    return createProfileResult(primaryUrl, secondaryUrl);
  }

  if (pageUrl.pathname.startsWith('/users/')) {
    const profileLink = document.querySelector<HTMLAnchorElement>('div.userProfile__btn a');

    if (!profileLink?.href) {
      return fail(utils.userNotFoundError('Xfolio'));
    }

    const profileUrl = new URL(profileLink.href);

    let primaryUrl;

    if (profileUrl.host === 'xfolio.jp') {
      const pathSegments = profileUrl.pathname.split('/').slice(-2).join('/');

      primaryUrl = `https://xfolio.jp/${pathSegments}`;
    } else {
      primaryUrl = profileUrl.origin;
    }

    return createProfileResult(primaryUrl, ogUrl);
  }

  return fail(utils.userNotFoundError('Xfolio'));
};

const handleMisskey = (host: string, userId: string): ProfileUrls => {
  const ogUrl = utils.getMetaContent('og:url', 'property');

  if (!ogUrl) {
    return fail(utils.userNotFoundError('Misskey'));
  }

  const primaryUrl = ogUrl;
  const secondaryUrl = `https://${host}/users/${userId}`;

  return createProfileResult(primaryUrl, secondaryUrl);
};

const handleOtherPlatforms = (host: string): ProfileUrls => {
  const ogUrl = utils.getMetaContent('og:url', 'property');

  if (!ogUrl) {
    return fail(`Unsupported site: ${host}`);
  }

  const pageUrl = new URL(ogUrl);

  if (pageUrl.host === 'xfolio.jp') {
    return handleXfolio(pageUrl, ogUrl);
  }

  // Some creator portfolio domains are backed by xfolio but keep their own host in og:url.
  const stylesheets = document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]');
  const isXfolio = [...stylesheets].some((link) => {
    try {
      return new URL(link.href).host === 'xfolio.jp';
    } catch {
      return false;
    }
  });

  if (isXfolio) {
    return handleXfolio(pageUrl, ogUrl);
  }

  const misskeyUserId = utils.getMetaContent('misskey:user-id');

  if (misskeyUserId) {
    return handleMisskey(host, misskeyUserId);
  }

  return fail(`Unsupported site: ${host}`);
};

const PLATFORM_HANDLERS: Record<string, PlatformHandler> = {
  'bsky.app': handleBluesky,
  'fantia.jp': handleFantia,
  'inkbunny.net': handleInkbunny,
  'ko-fi.com': handleKoFi,
  'rule34.xxx': handleRule34,
  'tieba.baidu.com': handleTieba,
  'www.facebook.com': handleFacebook,
  'www.patreon.com': handlePatreon,
  'www.pixiv.net': handlePixiv,
  'www.youtube.com': handleYouTube,
  'x.com': handleTwitter,
};

const SUBDOMAIN_HANDLERS: ReadonlyArray<readonly [string, PlatformHandler]> = [
  ['fanbox.cc', handleFanbox],
  ['gumroad.com', handleGumroad],
  ['lofter.com', handleLofter],
  ['mihuashi.com', handleMihuashi],
  ['tumblr.com', handleTumblr],
  ['weibo.com', handleWeibo],
];

const isHostWithinDomain = (host: string, domain: string): boolean =>
  host === domain || host.endsWith(`.${domain}`);

const getHandlerForHost = (host: string): PlatformHandler | null => {
  if (Object.hasOwn(PLATFORM_HANDLERS, host)) {
    return PLATFORM_HANDLERS[host];
  }

  for (const [domain, handler] of SUBDOMAIN_HANDLERS) {
    if (isHostWithinDomain(host, domain)) {
      return handler;
    }
  }

  return null;
};

const getComparableUrl = (url: string | null): string | null => {
  if (!url) {
    return null;
  }

  try {
    return new URL(url, location.href).href;
  } catch {
    return url;
  }
};

const normalizeProfileUrls = (
  profileUrls: ProfileUrls,
  sourceUrl: string,
  host: string,
  options: Pick<ExtractProfileUrlsOptions, 'requireAdditionalUrl'> = {},
): ProfileUrls => {
  const { requireAdditionalUrl = true } = options;

  if (!profileUrls?.primaryUrl) {
    return fail(`Invalid profile URLs extracted from ${host}`, profileUrls);
  }

  const { primaryUrl } = profileUrls;
  let { secondaryUrl } = profileUrls;

  secondaryUrl ||= null;
  const comparablePrimaryUrl = getComparableUrl(primaryUrl);

  if (secondaryUrl && getComparableUrl(secondaryUrl) === comparablePrimaryUrl) {
    secondaryUrl = null;
  }

  const normalizedProfileUrls = createProfileResult(primaryUrl, secondaryUrl);

  if (!secondaryUrl) {
    // Missing or duplicate secondary URLs are fine, but they should not create extra UI rows.
    utils.debugInfo(`Secondary profile URL unavailable on ${host}`, normalizedProfileUrls);
  }

  const hasUsefulPrimaryUrl = comparablePrimaryUrl !== getComparableUrl(sourceUrl);
  const hasUsefulSecondaryUrl = Boolean(secondaryUrl);

  if (requireAdditionalUrl && !hasUsefulPrimaryUrl && !hasUsefulSecondaryUrl) {
    return fail(`No additional profile URLs found on ${host}`, normalizedProfileUrls);
  }

  return normalizedProfileUrls;
};

const extractProfileUrls = async (
  options: ExtractProfileUrlsOptions = {},
): Promise<ProfileUrls | null> => {
  const { requireAdditionalUrl = true, throwOnFailure = false } = options;
  const { host, href: sourceUrl } = location;

  try {
    const handler = getHandlerForHost(host);
    const profileUrls = handler ? await handler() : handleOtherPlatforms(host);

    if (!profileUrls) {
      return null;
    }

    return normalizeProfileUrls(profileUrls, sourceUrl, host, { requireAdditionalUrl });
  } catch (error) {
    if (throwOnFailure) {
      throw error;
    }

    if (error instanceof ProfileExtractionError) {
      utils.debugInfo(error.message, error.details);
    } else {
      utils.warnUnexpectedError(`Unexpected extraction error on ${host}`, error);
    }

    return null;
  }
};

export { extractProfileUrls, utils };
