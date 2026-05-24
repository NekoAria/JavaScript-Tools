const createProfileResult = (primaryUrl, secondaryUrl = null) => ({ primaryUrl, secondaryUrl });
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

const utils = {
  safeJsonParse(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  },

  async safeFetch(url, options) {
    try {
      const response = await fetch(url, options);

      return response.ok ? response : null;
    } catch {
      return null;
    }
  },

  getMetaContent(name, property = 'name') {
    return document.querySelector(`meta[${property}='${name}']`)?.content;
  },

  userNotFoundError(platform) {
    return `Unable to retrieve user information from ${platform}`;
  },

  debugInfo(message, details) {
    if (details === undefined) {
      // eslint-disable-next-line no-console -- Debug logs are intentionally hidden by default.
      console.debug(LOG_PREFIX, message);
    } else {
      // eslint-disable-next-line no-console -- Debug logs are intentionally hidden by default.
      console.debug(LOG_PREFIX, message, details);
    }
  },

  warnUnexpectedError(message, error) {
    console.warn(LOG_PREFIX, message, error);
  },
};

class ProfileExtractionError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ProfileExtractionError';
    this.details = details;
  }
}

const fail = (message, details) => {
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
      const profileData = await profileResponse.json();

      if (profileData?.handle) {
        primaryUrl = `https://bsky.app/profile/${profileData.handle}`;
      }
    }
    secondaryUrl = `https://bsky.app/profile/${identifier}`;
  } else {
    const didResponse = await utils.safeFetch(
      `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${identifier}`,
    );

    if (didResponse) {
      const didData = await didResponse.json();

      secondaryUrl = didData?.did ? `https://bsky.app/profile/${didData.did}` : null;
    } else {
      secondaryUrl = null;
    }
  }

  return createProfileResult(primaryUrl, secondaryUrl);
};

const handleFacebook = async () => {
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

const handleFantia = async () => {
  const creatorProfileLink = document.querySelector('.fanclub-header a');

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

const handleGumroad = async () => {
  const rawPageData = document.querySelector('#app')?.dataset.page;

  if (!rawPageData) {
    return fail(utils.userNotFoundError('Gumroad'));
  }

  const pageData = utils.safeJsonParse(rawPageData);
  const creatorProfile = pageData?.props?.creator_profile;

  if (!creatorProfile?.subdomain) {
    return fail(utils.userNotFoundError('Gumroad'));
  }

  const primaryUrl = `https://${creatorProfile.subdomain}`;
  const secondaryUrl = creatorProfile.external_id
    ? `https://${creatorProfile.external_id}.gumroad.com`
    : null;

  return createProfileResult(primaryUrl, secondaryUrl);
};

const handleInkbunny = async () => {
  const watchListLink = document
    .querySelector('a[href^="watchlist_process.php"]')
    ?.getAttribute('href');

  if (watchListLink) {
    const watchListUrl = new URL(watchListLink, location.origin);
    const userId = watchListUrl.searchParams.get('user_id');

    if (!userId) {
      return fail(utils.userNotFoundError('Inkbunny'));
    }

    const primaryUrl = location.href;
    const secondaryUrl = `https://inkbunny.net/user.php?user_id=${userId}`;

    return createProfileResult(primaryUrl, secondaryUrl);
  }

  return fail(utils.userNotFoundError('Inkbunny'));
};

const handleKoFi = async () => {
  const pageId = document.querySelector('[data-page-id]')?.dataset.pageId;

  if (pageId) {
    const primaryUrl = location.href;
    const secondaryUrl = `https://ko-fi.com/${pageId}`;

    return createProfileResult(primaryUrl, secondaryUrl);
  }

  return fail(utils.userNotFoundError('KoFi'));
};

const handleLofter = async () => {
  const controlFrame = document.querySelector('#control_frame');

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
  const usernameElement = document.querySelector('h2.user-profile__name');

  if (!usernameElement) {
    return fail(utils.userNotFoundError('Mihuashi'));
  }

  // The name element includes a nested badge; clone it so the live DOM stays untouched.
  const clonedElement = usernameElement.cloneNode(true);
  const spanElement = clonedElement.querySelector('span');

  if (spanElement) {
    spanElement.remove();
  }
  const username = clonedElement.textContent.trim();

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
  } else if (pathname.startsWith('/users/')) {
    const apiResponse = await utils.safeFetch(
      `https://www.mihuashi.com/api/v1/users/${username}/?by=name`,
    );

    if (!apiResponse) {
      return fail(utils.userNotFoundError('Mihuashi'));
    }

    const apiData = await apiResponse.json();

    if (!apiData?.user?.id) {
      return fail('Invalid user data returned from API');
    }

    const profileId = apiData.user.id;
    const profileUrl = `https://www.mihuashi.com/profiles/${profileId}`;

    return createProfileResult(profileUrl, userUrl);
  } else {
    return fail(utils.userNotFoundError('Mihuashi'));
  }
};

const handlePatreon = async () => {
  const nextData = globalThis.__NEXT_DATA__;
  let userId;

  if (nextData) {
    const bootstrap = nextData?.props?.pageProps?.bootstrapEnvelope;

    // Patreon exposes creator IDs through different bootstrap shapes across page variants.
    userId =
      bootstrap?.commonBootstrap?.campaign?.data?.relationships?.creator?.data?.id ||
      bootstrap?.pageBootstrap?.campaign?.data?.relationships?.creator?.data?.id ||
      bootstrap?.pageBootstrap?.pageUser?.data?.id;
  }

  if (!userId) {
    userId = document.documentElement.outerHTML.match(
      /https:\/\/www\.patreon\.com\/api\/user\/(\d+)/,
    )?.[1];
  }

  if (!userId) {
    return fail(utils.userNotFoundError('Patreon'));
  }

  const urlObj = new URL(location.href);

  urlObj.protocol = 'https:';

  if (urlObj.hostname === 'patreon.com') {
    urlObj.hostname = 'www.patreon.com';
  }

  const cleanPath = urlObj.pathname
    .replace(/\/$/, '')
    .replace(/^\/c\//, '/')
    .replace(/^\/cw\//, '/')
    .replace(/\/home$/, '')
    .replace(/\/profile\/creators/, '/user');

  urlObj.pathname = cleanPath;

  const primaryUrl = urlObj.toString();
  const secondaryUrl = `https://www.patreon.com/user?u=${userId}`;

  return createProfileResult(primaryUrl, secondaryUrl);
};

const handleRule34 = async () => {
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

const getTwitterProfileName = () => {
  const profileMatch = /^\/([^/?#]+)\/?$/.exec(location.pathname);
  const profileName = profileMatch?.[1];

  if (
    !profileName ||
    !/^[a-zA-Z0-9_]{1,15}$/.test(profileName) ||
    TWITTER_RESERVED_PATHS.has(profileName.toLowerCase())
  ) {
    return fail('Please open the profile page');
  }

  return profileName;
};

const normalizeTwitterProfileName = (profileName) => profileName?.replace(/^@/, '').toLowerCase();

const findTwitterUserEntity = (root, expectedProfileName) => {
  const expectedName = normalizeTwitterProfileName(expectedProfileName);
  const scriptTags = root.querySelectorAll("script[type='application/ld+json']");

  for (const scriptTag of scriptTags) {
    const structuredData = utils.safeJsonParse(scriptTag.textContent);
    const userEntity = structuredData?.mainEntity;
    const entityName = normalizeTwitterProfileName(userEntity?.additionalName);

    if (userEntity?.identifier && entityName === expectedName) {
      return userEntity;
    }
  }

  return null;
};

const handleTwitter = async () => {
  const profileName = getTwitterProfileName();

  if (!profileName) {
    return null;
  }

  let userEntity = findTwitterUserEntity(document, profileName);

  if (!userEntity) {
    const profileUrl = new URL(`/${profileName}`, location.origin).toString();
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
  let userName;

  if (host === 'www.fanbox.cc') {
    const usernameMatch = /^\/@([a-zA-Z0-9_-]+)$/.exec(location.pathname);

    if (!usernameMatch?.[1]) {
      return fail(utils.userNotFoundError('Fanbox'));
    }
    userName = usernameMatch[1];
  } else {
    userName = host.split('.')[0];
  }

  const apiResponse = await utils.safeFetch(
    `https://api.fanbox.cc/creator.get?creatorId=${userName}`,
  );

  if (!apiResponse) {
    return fail(utils.userNotFoundError('Fanbox'));
  }

  const apiData = await apiResponse.json();

  if (!apiData?.body?.user) {
    return fail('Invalid user data returned from API');
  }

  const primaryUrl = location.href;
  const secondaryUrl = `https://www.pixiv.net/fanbox/creator/${apiData.body.user.userId}`;

  return createProfileResult(primaryUrl, secondaryUrl);
};

const handlePixiv = async () => {
  let primaryUrl;

  if (location.pathname.includes('users')) {
    primaryUrl = location.toString().replace('en/', '');
  } else {
    const userLink = document.querySelector("a[href*='/users/']");
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

const handleTieba = async () => {
  const pageContent = document.documentElement.outerHTML;
  const userInfoMatch = pageContent.match(
    /_.Module\.use\('ihome\/widget\/Userinfo',\s*(\{.*?\})\s*\);/,
  );

  let username = null;
  let portrait = null;

  const userInfo = userInfoMatch ? utils.safeJsonParse(userInfoMatch[1]) : null;

  if (userInfo?.user) {
    username = userInfo.user.homeUserName || userInfo.user.show_nickname;
    portrait = userInfo.user.portrait?.split('?')[0];
  }

  if (!username) {
    const pageDataMatch = pageContent.match(/PageData\.current_page_uname\s*=\s*['"]([^'"]+)['"]/);

    username = pageDataMatch?.[1] ?? null;
  }

  if (!username) {
    return fail(utils.userNotFoundError('Tieba'));
  }

  const primaryUrl = `https://tieba.baidu.com/home/main?un=${username}`;
  const secondaryUrl = portrait ? `https://tieba.baidu.com/home/main?id=${portrait}` : null;

  return createProfileResult(primaryUrl, secondaryUrl);
};

const handleWeibo = async () => {
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

const handleYouTube = async () => {
  const path = location.pathname;

  if (path.startsWith('/watch') || path.startsWith('/playlist')) {
    return fail('Please open the channel page');
  }

  const initialData = globalThis.ytInitialData;

  if (!initialData?.metadata) {
    return fail('Metadata not found');
  }

  const metadataRenderer = initialData?.metadata?.channelMetadataRenderer;

  if (!metadataRenderer) {
    return fail('Channel metadata renderer not found');
  }

  let { vanityChannelUrl, channelUrl } = metadataRenderer;

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

const handleXfolio = (pageUrl, ogUrl) => {
  const creatorInfo = document.querySelector('div.creatorInfo');

  if (creatorInfo) {
    const primaryUrl = creatorInfo.dataset.creatorPortfolioTopUrl;
    const secondaryUrl = creatorInfo.dataset.creatorUrl;

    if (!primaryUrl) {
      return fail(utils.userNotFoundError('Xfolio'));
    }

    return createProfileResult(primaryUrl, secondaryUrl);
  }

  if (pageUrl.pathname.startsWith('/users/')) {
    const profileLink = document.querySelector('div.userProfile__btn a');

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

const handleMisskey = (host, userId) => {
  const ogUrl = utils.getMetaContent('og:url', 'property');

  if (!ogUrl) {
    return fail(utils.userNotFoundError('Misskey'));
  }

  const primaryUrl = ogUrl;
  const secondaryUrl = `https://${host}/users/${userId}`;

  return createProfileResult(primaryUrl, secondaryUrl);
};

const handleOtherPlatforms = async (host) => {
  const ogUrl = utils.getMetaContent('og:url', 'property');

  if (!ogUrl) {
    return fail(`Unsupported site: ${host}`);
  }

  const pageUrl = new URL(ogUrl);

  if (pageUrl.host === 'xfolio.jp') {
    return handleXfolio(pageUrl, ogUrl);
  }

  // Some creator portfolio domains are backed by xfolio but keep their own host in og:url.
  const stylesheets = document.querySelectorAll('link[rel="stylesheet"][href]');
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

const PLATFORM_HANDLERS = {
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

const SUBDOMAIN_HANDLERS = [
  ['fanbox.cc', handleFanbox],
  ['gumroad.com', handleGumroad],
  ['lofter.com', handleLofter],
  ['mihuashi.com', handleMihuashi],
  ['weibo.com', handleWeibo],
];

const isHostWithinDomain = (host, domain) => host === domain || host.endsWith(`.${domain}`);

const getHandlerForHost = (host) => {
  if (PLATFORM_HANDLERS[host]) {
    return PLATFORM_HANDLERS[host];
  }

  for (const [domain, handler] of SUBDOMAIN_HANDLERS) {
    if (isHostWithinDomain(host, domain)) {
      return handler;
    }
  }

  return null;
};

const getComparableUrl = (url) => {
  if (!url) {
    return null;
  }

  try {
    return new URL(url, location.href).href;
  } catch {
    return url;
  }
};

const normalizeProfileUrls = (profileUrls, sourceUrl, host, options = {}) => {
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

const extractProfileUrls = async (options = {}) => {
  const { requireAdditionalUrl = true, throwOnFailure = false } = options;
  const { host, href: sourceUrl } = location;

  try {
    const handler = getHandlerForHost(host);
    const profileUrls = handler ? await handler() : await handleOtherPlatforms(host);

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
