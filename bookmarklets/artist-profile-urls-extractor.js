// Original: https://gist.github.com/TypeA2/dc1bb0ba549369dd079f15e44e5623eb
javascript: void (async () => {
  const createProfileResult = (primaryUrl, secondaryUrl) => ({ primaryUrl, secondaryUrl });

  const utils = {
    safeJsonParse(text) {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    },

    async safeFetch(url) {
      try {
        const response = await fetch(url);
        return response.ok ? response : null;
      } catch {
        return null;
      }
    },

    getMetaContent(name, property = "name") {
      return document.querySelector(`meta[${property}='${name}']`)?.content;
    },

    showError(message) {
      alert(`Error: ${message}`);
    },

    userNotFoundError(platform) {
      return `Unable to retrieve user information from ${platform}`;
    },
  };

  const handleBluesky = async () => {
    const profileMatch = /\/profile\/([^/]+)/.exec(location.pathname);

    if (!profileMatch?.[1]) {
      throw new Error(utils.userNotFoundError("Bluesky"));
    }

    const identifier = profileMatch[1];
    let primaryUrl = `https://bsky.app/profile/${identifier}`;
    let secondaryUrl;

    if (identifier.startsWith("did:")) {
      // Handle DID format identifier
      const profileResponse = await utils.safeFetch(
        `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${identifier}`,
      );

      if (profileResponse) {
        const profileData = await profileResponse.json();
        primaryUrl = `https://bsky.app/profile/${profileData.handle}`;
      }
      secondaryUrl = `https://bsky.app/profile/${identifier}`;
    } else {
      // Handle `handle` format identifier
      const didResponse = await utils.safeFetch(
        `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${identifier}`,
      );

      if (didResponse) {
        const didData = await didResponse.json();
        secondaryUrl = `https://bsky.app/profile/${didData.did}`;
      } else {
        secondaryUrl = primaryUrl;
      }
    }

    return createProfileResult(primaryUrl, secondaryUrl);
  };

  const handleFacebook = async () => {
    const androidUrl = utils.getMetaContent("al:android:url", "property");
    const ogUrl = utils.getMetaContent("og:url", "property");

    if (!ogUrl) {
      throw new Error(utils.userNotFoundError("Facebook"));
    }

    const profileIdMatch = /\d+/.exec(androidUrl);
    const primaryUrl = ogUrl;
    const secondaryUrl = `https://www.facebook.com/profile.php?id=${profileIdMatch[0]}`;

    return createProfileResult(primaryUrl, secondaryUrl);
  };

  const handleFantia = async () => {
    const creatorProfileLink = document.querySelector(".fanclub-header a");

    if (!creatorProfileLink) {
      throw new Error(utils.userNotFoundError("Fantia"));
    }

    const creatorPath = creatorProfileLink.getAttribute("href");
    const primaryUrl = `https://fantia.jp${creatorPath}`;

    const creatorNickname = document.querySelector("#nickname");
    const nicknameValue = creatorNickname?.getAttribute("value");
    const secondaryUrl = nicknameValue ? `https://fantia.jp/${nicknameValue}` : primaryUrl;

    return createProfileResult(primaryUrl, secondaryUrl);
  };

  const handleGumroad = async () => {
    const reactComponents = document.querySelectorAll(".js-react-on-rails-component");

    for (const element of reactComponents) {
      const componentData = utils.safeJsonParse(element.textContent);
      const creatorProfile = componentData?.creator_profile;

      if (creatorProfile) {
        const primaryUrl = `https://${creatorProfile.subdomain}`;
        const secondaryUrl = `https://${creatorProfile.external_id}.gumroad.com`;
        return createProfileResult(primaryUrl, secondaryUrl);
      }
    }

    throw new Error(utils.userNotFoundError("Gumroad"));
  };

  const handleInkbunny = async () => {
    const watchListLink = document
      .querySelector('a[href^="watchlist_process.php"]')
      ?.getAttribute("href");

    if (watchListLink?.includes("user_id=")) {
      const primaryUrl = location.href;
      const userId = watchListLink.split("user_id=")[1];
      const secondaryUrl = `https://inkbunny.net/user.php?user_id=${userId}`;
      return createProfileResult(primaryUrl, secondaryUrl);
    }

    throw new Error(utils.userNotFoundError("Inkbunny"));
  };

  const handleKoFi = async () => {
    const pageId = document.querySelector("[data-page-id]")?.getAttribute("data-page-id");

    if (pageId) {
      const primaryUrl = location.href;
      const secondaryUrl = `https://ko-fi.com/${pageId}`;
      return createProfileResult(primaryUrl, secondaryUrl);
    }

    throw new Error(utils.userNotFoundError("KoFi"));
  };

  const handleLofter = async () => {
    const controlFrame = document.querySelector("#control_frame");
    if (!controlFrame) {
      throw new Error(utils.userNotFoundError("Lofter"));
    }

    const primaryUrl = controlFrame.baseURI.replace(/\/$/, "");
    const url = new URL(controlFrame.src);
    const blogId = url.searchParams.get("blogId");

    if (!blogId) {
      throw new Error(utils.userNotFoundError("Lofter"));
    }

    const secondaryUrl = `https://www.lofter.com/mentionredirect.do?blogId=${blogId}`;

    return createProfileResult(primaryUrl, secondaryUrl);
  };

  const handleMihuashi = async () => {
    const { pathname } = location;

    // Extract username from DOM
    const userNameElement = document.querySelector("h2.user-profile__name");
    if (!userNameElement) {
      throw new Error(utils.userNotFoundError("Mihuashi"));
    }

    // Get username by cloning the element and removing the span
    const clonedElement = userNameElement.cloneNode(true);
    const spanElement = clonedElement.querySelector("span");
    if (spanElement) {
      spanElement.remove();
    }
    const username = clonedElement.textContent.trim();

    if (!username) {
      throw new Error(utils.userNotFoundError("Mihuashi"));
    }

    let primaryUrl, secondaryUrl;

    if (pathname.startsWith("/profiles/")) {
      // Extract profile ID from URL
      const profileIdMatch = /\/profiles\/(\d+)/.exec(pathname);
      if (!profileIdMatch?.[1]) {
        throw new Error(utils.userNotFoundError("Mihuashi"));
      }

      const profileId = profileIdMatch[1];
      primaryUrl = `https://www.mihuashi.com/profiles/${profileId}`;
      secondaryUrl = `https://www.mihuashi.com/users/${username}`;
    } else if (pathname.startsWith("/users/")) {
      // Get profile ID via API
      const apiResponse = await utils.safeFetch(
        `https://www.mihuashi.com/api/v1/users/${username}/?by=name`,
      );

      if (!apiResponse) {
        throw new Error(utils.userNotFoundError("Mihuashi"));
      }

      const apiData = await apiResponse.json();
      if (!apiData?.user?.id) {
        throw new Error("Invalid user data returned from API");
      }

      const profileId = apiData.user.id;
      primaryUrl = `https://www.mihuashi.com/profiles/${profileId}`;
      secondaryUrl = `https://www.mihuashi.com/users/${username}`;
    } else {
      throw new Error(utils.userNotFoundError("Mihuashi"));
    }

    return createProfileResult(primaryUrl, secondaryUrl);
  };

  const handlePatreon = async () => {
    let userId;

    const nextDataScript = document.querySelector("script#__NEXT_DATA__");

    if (nextDataScript) {
      const pageData = utils.safeJsonParse(nextDataScript.textContent);
      const bootstrap = pageData?.props?.pageProps?.bootstrapEnvelope;

      // Try to get user ID from multiple possible paths
      userId =
        bootstrap?.commonBootstrap?.campaign?.data?.relationships?.creator?.data?.id ||
        bootstrap?.pageBootstrap?.campaign?.data?.relationships?.creator?.data?.id ||
        bootstrap?.pageBootstrap?.pageUser?.data?.id;
    } else {
      userId = document.documentElement.outerHTML.match(
        /https:\/\/www\.patreon\.com\/api\/user\/(\d+)/,
      )?.[1];
    }

    if (!userId) {
      throw new Error(utils.userNotFoundError("Patreon"));
    }

    let primaryUrl = location.href
      .replace("http://", "https://")
      .replace(":443", "")
      .replace("/c/", "")
      .replace("/cw/", "/")
      .replace("/home", "")
      .replace("/profile/creators", "/user")
      .replace(/\/$/, "");

    let url = new URL(primaryUrl);
    if (url.hostname === "patreon.com") {
      url.hostname = "www.patreon.com";
    }
    url.searchParams.delete("__cf_chl_tk");

    primaryUrl = url.toString();
    const secondaryUrl = `https://www.patreon.com/user?u=${userId}`;

    return createProfileResult(primaryUrl, secondaryUrl);
  };

  const handleTwitter = async () => {
    const scriptTag = document.querySelector("script[type='application/ld+json']");

    if (!scriptTag) {
      throw new Error("Please open the profile page");
    }

    const structuredData = utils.safeJsonParse(scriptTag.innerText);
    const userEntity = structuredData?.mainEntity;

    if (!userEntity) {
      throw new Error(utils.userNotFoundError("Twitter"));
    }

    const primaryUrl = `https://twitter.com/${userEntity.additionalName}`;
    const secondaryUrl = `https://twitter.com/intent/user?user_id=${userEntity.identifier}`;

    return createProfileResult(primaryUrl, secondaryUrl);
  };

  const handleFanbox = async () => {
    const { host } = location;
    let userName;

    if (host === "www.fanbox.cc") {
      const usernameMatch = /^\/@([a-zA-Z0-9_-]+)$/.exec(location.pathname);
      if (!usernameMatch?.[1]) {
        throw new Error(utils.userNotFoundError("Fanbox"));
      }
      userName = usernameMatch[1];
    } else {
      userName = host.split(".")[0];
    }

    const apiResponse = await utils.safeFetch(
      `https://api.fanbox.cc/creator.get?creatorId=${userName}`,
    );

    if (!apiResponse) {
      throw new Error(utils.userNotFoundError("Fanbox"));
    }

    const apiData = await apiResponse.json();
    if (!apiData?.body?.user) {
      throw new Error("Invalid user data returned from API");
    }

    const primaryUrl = location.href;
    const secondaryUrl = `https://www.pixiv.net/fanbox/creator/${apiData.body.user.userId}`;

    return createProfileResult(primaryUrl, secondaryUrl);
  };

  const handlePixiv = async () => {
    let primaryUrl;

    if (location.pathname.includes("users")) {
      primaryUrl = location.toString().replace("en/", "");
    } else {
      const userLink = document.querySelector("a[href*='/users/']");
      const userId = userLink?.dataset.gtmValue;

      if (!userId) {
        throw new Error(utils.userNotFoundError("Pixiv"));
      }
      primaryUrl = `https://www.pixiv.net/users/${userId}`;
    }

    const staccUrl = primaryUrl.replace("en/", "").replace("users", "stacc/id");
    const secondaryResponse = await utils.safeFetch(staccUrl);
    const secondaryUrl = secondaryResponse?.url || primaryUrl;

    return createProfileResult(primaryUrl, secondaryUrl);
  };

  const handleWeibo = async () => {
    const nameElement = document.querySelector('[class^="ProfileHeader_name_"]');
    const userName = nameElement?.textContent?.trim();

    const followLink = document.querySelector('a[href*="/u/page/follow/"]');
    const followHref = followLink?.getAttribute("href");
    const userIdMatch = followHref ? /\/u\/page\/follow\/(\d+)/.exec(followHref) : null;
    const userId = userIdMatch?.[1];

    if (!userName || !userId) {
      throw new Error(utils.userNotFoundError("Weibo"));
    }

    const primaryUrl = `https://www.weibo.com/n/${userName}`;
    const secondaryUrl = `https://www.weibo.com/u/${userId}`;

    return createProfileResult(primaryUrl, secondaryUrl);
  };

  const handleYouTube = async () => {
    if (location.pathname.includes("/watch")) {
      throw new Error("Please open the channel page");
    }

    const channelHandleSpan = document.querySelector("yt-content-metadata-view-model span");
    const channelHandle = channelHandleSpan?.textContent?.trim();
    if (!channelHandle?.startsWith("@")) {
      throw new Error("Please reload the channel page");
    }

    const canonicalUrl = document.querySelector("link[rel='canonical']")?.href;
    const primaryUrl = `https://www.youtube.com/${channelHandle}`;
    const secondaryUrl = canonicalUrl || primaryUrl;

    return createProfileResult(primaryUrl, secondaryUrl);
  };

  const handleXfolio = (pageUrl, ogUrl) => {
    const creatorInfo = document.querySelector("div.creatorInfo");

    if (creatorInfo) {
      const primaryUrl = creatorInfo.dataset.creatorPortfolioTopUrl;
      const secondaryUrl = creatorInfo.dataset.creatorUrl;
      return createProfileResult(primaryUrl, secondaryUrl);
    }

    if (pageUrl.pathname.startsWith("/users/")) {
      const profileLink = document.querySelector("div.userProfile__btn a");
      const profileUrl = new URL(profileLink.href);

      let primaryUrl;
      if (profileUrl.host === "xfolio.jp") {
        const pathSegments = profileUrl.pathname.split("/").slice(-2).join("/");
        primaryUrl = `https://xfolio.jp/${pathSegments}`;
      } else {
        primaryUrl = profileUrl.origin;
      }

      return createProfileResult(primaryUrl, ogUrl);
    }

    throw new Error(utils.userNotFoundError("Xfolio"));
  };

  const handleMisskey = (host, userId) => {
    const ogUrl = utils.getMetaContent("og:url", "property");

    if (!ogUrl) {
      throw new Error(utils.userNotFoundError("Misskey"));
    }

    const primaryUrl = ogUrl;
    const secondaryUrl = `https://${host}/users/${userId}`;

    return createProfileResult(primaryUrl, secondaryUrl);
  };

  // Generic handler for other platforms
  const handleOtherPlatforms = async (host) => {
    const ogUrl = utils.getMetaContent("og:url", "property");

    if (!ogUrl) {
      throw new Error(`Unsupported site: ${host}`);
    }

    const pageUrl = new URL(ogUrl);

    if (pageUrl.host === "xfolio.jp") {
      return handleXfolio(pageUrl, ogUrl);
    }

    // Handle Misskey instances
    const misskeyUserId = utils.getMetaContent("misskey:user-id");
    if (misskeyUserId) {
      return handleMisskey(host, misskeyUserId);
    }

    throw new Error(`Unsupported site: ${host}`);
  };

  const displayResult = (result, host) => {
    const output = `${result.primaryUrl}\n${result.secondaryUrl}`;

    if (navigator.userAgent.toLowerCase().includes("firefox")) {
      alert(output);
    } else {
      prompt(`${host} URLs`, output);
    }
  };

  // Platform handler mapping
  const PLATFORM_HANDLERS = {
    "bsky.app": handleBluesky,
    "fantia.jp": handleFantia,
    "inkbunny.net": handleInkbunny,
    "ko-fi.com": handleKoFi,
    "www.facebook.com": handleFacebook,
    "www.patreon.com": handlePatreon,
    "www.pixiv.net": handlePixiv,
    "www.youtube.com": handleYouTube,
    "x.com": handleTwitter,
  };

  const getHandlerForHost = (host) => {
    if (PLATFORM_HANDLERS[host]) {
      return PLATFORM_HANDLERS[host];
    }

    const subdomainChecks = [
      ["fanbox.cc", handleFanbox],
      ["gumroad.com", handleGumroad],
      ["lofter.com", handleLofter],
      ["mihuashi.com", handleMihuashi],
      ["weibo.com", handleWeibo],
    ];

    for (const [domain, handler] of subdomainChecks) {
      if (host.includes(domain)) {
        return handler;
      }
    }

    return null;
  };

  // Main execution function
  const main = async () => {
    const { host } = location;

    try {
      const handler = getHandlerForHost(host);
      const result = handler ? await handler() : await handleOtherPlatforms(host);
      displayResult(result, host);
    } catch (error) {
      utils.showError(error.message);
    }
  };

  await main();
})();
