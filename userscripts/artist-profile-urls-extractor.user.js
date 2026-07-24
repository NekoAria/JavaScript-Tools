// ==UserScript==
// @name         Artist Profile URLs Extractor
// @namespace    https://github.com/NekoAria/JavaScript-Tools
// @version      1.0.9
// @author       Neko_Aria
// @description  Add a draggable floating button on supported artist profile pages that opens a modal with canonical profile URLs and copy actions
// @homepageURL  https://github.com/NekoAria/JavaScript-Tools/tree/main/packages/artist-profile-urls-extractor
// @supportURL   https://github.com/NekoAria/JavaScript-Tools/issues
// @match        https://*/*
// @grant        none
// @run-at       document-start
// @noframes
// ==/UserScript==

(function() {
	"use strict";
	var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
	var asRecord = (value) => isRecord(value) ? value : null;
	var getRecord = (value, key) => {
		const record = asRecord(value);
		return record ? asRecord(record[key]) : null;
	};
	var getRecordAt = (value, ...path) => {
		let current = value;
		for (const key of path) {
			const next = getRecord(current, key);
			if (!next) return null;
			current = next;
		}
		return asRecord(current);
	};
	var getValueAt = (value, ...path) => {
		let current = value;
		for (const key of path) {
			const record = asRecord(current);
			if (!record) return;
			current = record[key];
		}
		return current;
	};
	var getString = (value, key) => {
		const candidate = asRecord(value)?.[key];
		return typeof candidate === "string" && candidate ? candidate : null;
	};
	var getArrayAt = (value, ...path) => {
		const candidate = getValueAt(value, ...path);
		return Array.isArray(candidate) ? candidate : [];
	};
	var createProfileResult = (primaryUrl, secondaryUrl = null) => ({
		primaryUrl,
		secondaryUrl
	});
	var LOG_PREFIX = "[artist-profile-urls-extractor]";
	var TWITTER_RESERVED_PATHS = new Set([
		"compose",
		"explore",
		"home",
		"i",
		"messages",
		"notifications",
		"search",
		"settings"
	]);
	var TWITTER_PROFILE_TAB_PATHS = new Set([
		"",
		"articles",
		"highlights",
		"media",
		"with_replies"
	]);
	var TWITTER_STATUS_PATH_PATTERN = /^status\/\d+(?:\/(?:photo|video)\/\d+)?$/;
	var TUMBLR_API_AUTHORIZATION = "Bearer aIcXSOoTtqrzR8L8YEIOmBeW94c3FmbSNSWAUbxsny9KKx5VFh";
	var utils = {
		safeJsonParse(text) {
			if (!text) return null;
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
		getMetaContent(name, property = "name") {
			return document.querySelector(`meta[${property}='${name}']`)?.content;
		},
		userNotFoundError(platform) {
			return `Unable to retrieve user information from ${platform}`;
		},
		debugInfo(message, details) {
			if (details === void 0) console.debug(LOG_PREFIX, message);
			else console.debug(LOG_PREFIX, message, details);
		},
		warnUnexpectedError(message, error) {
			console.warn(LOG_PREFIX, message, error);
		}
	};
	var ProfileExtractionError = class extends Error {
		details;
		constructor(message, details) {
			super(message);
			this.name = "ProfileExtractionError";
			this.details = details;
		}
	};
	var fail = (message, details) => {
		throw new ProfileExtractionError(message, details);
	};
	var handleBluesky = async () => {
		const profileMatch = /\/profile\/([^/]+)/.exec(location.pathname);
		if (!profileMatch?.[1]) return fail(utils.userNotFoundError("Bluesky"));
		const identifier = profileMatch[1];
		let primaryUrl = `https://bsky.app/profile/${identifier}`;
		let secondaryUrl;
		if (identifier.startsWith("did:")) {
			const profileResponse = await utils.safeFetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${identifier}`);
			if (profileResponse) {
				const handle = getString(await profileResponse.json(), "handle");
				if (handle) primaryUrl = `https://bsky.app/profile/${handle}`;
			}
			secondaryUrl = `https://bsky.app/profile/${identifier}`;
		} else {
			const identityResponse = await utils.safeFetch(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${identifier}`);
			if (identityResponse) {
				const did = getString(await identityResponse.json(), "did");
				secondaryUrl = did ? `https://bsky.app/profile/${did}` : null;
			} else secondaryUrl = null;
		}
		return createProfileResult(primaryUrl, secondaryUrl);
	};
	var handleFacebook = () => {
		const androidUrl = utils.getMetaContent("al:android:url", "property");
		const ogUrl = utils.getMetaContent("og:url", "property");
		if (!androidUrl || !ogUrl) return fail(utils.userNotFoundError("Facebook"));
		const profileIdMatch = /\d+/.exec(androidUrl);
		if (!profileIdMatch?.[0]) return fail(utils.userNotFoundError("Facebook"));
		return createProfileResult(ogUrl, `https://www.facebook.com/profile.php?id=${profileIdMatch[0]}`);
	};
	var handleFantia = () => {
		const creatorProfileLink = document.querySelector(".fanclub-header a");
		if (!creatorProfileLink) return fail(utils.userNotFoundError("Fantia"));
		const creatorPath = creatorProfileLink.getAttribute("href");
		if (!creatorPath) return fail(utils.userNotFoundError("Fantia"));
		const primaryUrl = `https://fantia.jp${creatorPath}`;
		const nicknameValue = document.querySelector("#nickname")?.getAttribute("value");
		return createProfileResult(primaryUrl, nicknameValue ? `https://fantia.jp/${nicknameValue}` : null);
	};
	var handleGumroad = () => {
		const rawPageData = document.querySelector("#app")?.dataset.page;
		if (!rawPageData) return fail(utils.userNotFoundError("Gumroad"));
		const creatorProfile = getRecordAt(utils.safeJsonParse(rawPageData), "props", "creator_profile");
		const subdomain = getString(creatorProfile, "subdomain");
		if (!subdomain) return fail(utils.userNotFoundError("Gumroad"));
		const primaryUrl = `https://${subdomain}`;
		const externalId = getString(creatorProfile, "external_id");
		return createProfileResult(primaryUrl, externalId ? `https://${externalId}.gumroad.com` : null);
	};
	var handleInkbunny = () => {
		const watchListLink = document.querySelector("a[href^=\"watchlist_process.php\"]")?.getAttribute("href");
		if (!watchListLink) return fail(utils.userNotFoundError("Inkbunny"));
		const userId = new URL(watchListLink, location.origin).searchParams.get("user_id");
		if (!userId) return fail(utils.userNotFoundError("Inkbunny"));
		const primaryUrl = location.href;
		return createProfileResult(primaryUrl, `https://inkbunny.net/user.php?user_id=${userId}`);
	};
	var handleKoFi = () => {
		const canonicalUrl = document.querySelector("link[rel='canonical'][href]")?.href;
		const pageId = document.querySelector("[data-page-id]")?.dataset.pageId;
		if (!canonicalUrl || !pageId) return fail(utils.userNotFoundError("KoFi"));
		return createProfileResult(canonicalUrl, `https://ko-fi.com/${pageId}`);
	};
	var handleLofter = () => {
		const controlFrame = document.querySelector("#control_frame");
		if (!controlFrame) return fail(utils.userNotFoundError("Lofter"));
		const primaryUrl = controlFrame.baseURI.replace(/\/$/, "");
		const blogId = new URL(controlFrame.src).searchParams.get("blogId");
		if (!blogId) return fail(utils.userNotFoundError("Lofter"));
		return createProfileResult(primaryUrl, `https://www.lofter.com/mentionredirect.do?blogId=${blogId}`);
	};
	var handleMihuashi = async () => {
		const { pathname } = location;
		const usernameElement = document.querySelector("h2.user-profile__name");
		if (!usernameElement) return fail(utils.userNotFoundError("Mihuashi"));
		const clonedElement = usernameElement.cloneNode(true);
		const spanElement = clonedElement.querySelector("span");
		if (spanElement) spanElement.remove();
		const username = clonedElement.textContent?.trim() ?? "";
		if (!username) return fail(utils.userNotFoundError("Mihuashi"));
		const userUrl = `https://www.mihuashi.com/users/${username}`;
		if (pathname.startsWith("/profiles/")) {
			const profileIdMatch = /\/profiles\/(\d+)/.exec(pathname);
			if (!profileIdMatch?.[1]) return fail(utils.userNotFoundError("Mihuashi"));
			return createProfileResult(`https://www.mihuashi.com/profiles/${profileIdMatch[1]}`, userUrl);
		}
		if (pathname.startsWith("/users/")) {
			const apiResponse = await utils.safeFetch(`https://www.mihuashi.com/api/v1/users/${username}/?by=name`);
			if (!apiResponse) return fail(utils.userNotFoundError("Mihuashi"));
			const profileIdValue = getValueAt(await apiResponse.json(), "user", "id");
			if (typeof profileIdValue !== "string" && typeof profileIdValue !== "number") return fail("Invalid user data returned from API");
			return createProfileResult(`https://www.mihuashi.com/profiles/${String(profileIdValue)}`, userUrl);
		}
		return fail(utils.userNotFoundError("Mihuashi"));
	};
	var PATREON_BASE_URL = "https://www.patreon.com";
	var PATREON_NON_VANITY_PATHS = new Set([
		"checkout",
		"creation",
		"explore",
		"home",
		"join",
		"login",
		"m",
		"messages",
		"notifications",
		"posts",
		"profile",
		"search",
		"settings",
		"signup",
		"user"
	]);
	var toPatreonNumericId = (value) => {
		if (typeof value !== "string" && typeof value !== "number") return null;
		const id = String(value).trim();
		return /^\d+$/.test(id) ? id : null;
	};
	var getPatreonRelationshipId = (resource, relationshipName) => toPatreonNumericId(getValueAt(resource, "relationships", relationshipName, "data", "id"));
	var getPatreonUserProfileUrl = (userId) => `${PATREON_BASE_URL}/user?u=${userId}`;
	var getPatreonVanityPath = (value) => {
		const path = typeof value === "string" ? value.trim() : "";
		return path && !/[/?#]/.test(path) ? path : null;
	};
	var getPatreonVanityPathFromUrl = ({ pathname }) => {
		const [firstSegment, secondSegment] = pathname.split("/").filter(Boolean);
		const topLevelPath = firstSegment?.toLowerCase();
		if (topLevelPath === "c" || topLevelPath === "cw") return getPatreonVanityPath(secondSegment);
		if (!firstSegment || PATREON_NON_VANITY_PATHS.has(topLevelPath)) return null;
		return getPatreonVanityPath(firstSegment);
	};
	var getPatreonCampaignVanityPath = (campaign) => {
		const vanityPath = getPatreonVanityPath(getValueAt(campaign, "attributes", "vanity"));
		if (vanityPath) return vanityPath;
		const campaignUrl = getValueAt(campaign, "attributes", "url");
		try {
			return typeof campaignUrl === "string" ? getPatreonVanityPathFromUrl(new URL(campaignUrl, PATREON_BASE_URL)) : null;
		} catch {
			return null;
		}
	};
	var getPatreonHtmlUserId = () => {
		return toPatreonNumericId(document.documentElement.outerHTML.replaceAll(String.raw`\/`, "/").match(/https:\/\/www\.patreon\.com\/api\/user\/(\d+)/)?.[1]);
	};
	var handlePatreon = () => {
		const currentUrl = new URL(location.href);
		const explicitUserId = /^\/(?:user|profile\/creators)(?:\/|$)/.test(currentUrl.pathname) ? toPatreonNumericId(currentUrl.searchParams.get("u")) : null;
		if (explicitUserId) return createProfileResult(getPatreonUserProfileUrl(explicitUserId));
		const nextData = asRecord(globalThis.__NEXT_DATA__) ?? asRecord(utils.safeJsonParse(document.querySelector("#__NEXT_DATA__")?.textContent));
		const pageProps = getRecordAt(nextData, "props", "pageProps");
		const bootstrap = getRecord(pageProps, "bootstrapEnvelope") ?? pageProps;
		const routeVanityPath = getPatreonVanityPathFromUrl(currentUrl);
		const routeVanityKey = routeVanityPath?.toLowerCase();
		const campaignCandidates = [getRecordAt(bootstrap, "pageBootstrap", "campaign", "data"), getRecordAt(bootstrap, "commonBootstrap", "campaign", "data")].filter((campaign) => campaign !== null).map((campaign) => {
			const vanityPath = getPatreonCampaignVanityPath(campaign);
			return {
				creatorUserId: getPatreonRelationshipId(campaign, "creator"),
				id: toPatreonNumericId(campaign.id),
				vanityKey: vanityPath?.toLowerCase(),
				vanityPath
			};
		});
		const membershipCampaignId = toPatreonNumericId(/^\/m\/(\d+)(?:\/|$)/.exec(currentUrl.pathname)?.[1]);
		const matchedCampaign = campaignCandidates.find(({ id, vanityKey }) => {
			if (membershipCampaignId) return id === membershipCampaignId;
			return Boolean(routeVanityKey && vanityKey === routeVanityKey);
		});
		const currentPost = getRecordAt(bootstrap, "pageBootstrap", "post", "data");
		const postId = toPatreonNumericId(currentUrl.pathname.startsWith("/creation") ? currentUrl.searchParams.get("hid") : /^\/posts\/(?:[^/]*-)?(\d+)\/?$/.exec(currentUrl.pathname)?.[1]);
		const queryVanityKey = getPatreonVanityPath(getValueAt(nextData, "query", "vanity"))?.toLowerCase();
		const isCurrentBootstrapPost = postId ? toPatreonNumericId(currentPost?.id) === postId : Boolean(routeVanityKey && queryVanityKey === routeVanityKey);
		const hasCreatorRouteContext = Boolean(routeVanityPath || membershipCampaignId || postId);
		const pageUserId = hasCreatorRouteContext ? toPatreonNumericId(getValueAt(bootstrap, "pageBootstrap", "pageUser", "data", "id")) : null;
		const creatorUserId = (isCurrentBootstrapPost ? getPatreonRelationshipId(currentPost, "user") : null) ?? matchedCampaign?.creatorUserId ?? pageUserId ?? (hasCreatorRouteContext ? getPatreonHtmlUserId() : null);
		if (!creatorUserId) return fail(utils.userNotFoundError("Patreon"));
		const creatorVanityPath = matchedCampaign?.vanityPath ?? campaignCandidates.find(({ creatorUserId: campaignCreatorUserId }) => campaignCreatorUserId === creatorUserId)?.vanityPath ?? routeVanityPath;
		const userProfileUrl = getPatreonUserProfileUrl(creatorUserId);
		return createProfileResult(creatorVanityPath ? `${PATREON_BASE_URL}/${creatorVanityPath}` : userProfileUrl, creatorVanityPath ? userProfileUrl : null);
	};
	var handleRule34 = () => {
		const username = document.querySelector("#content > h2")?.textContent?.trim();
		const userId = document.querySelector("a[href*=\"s=tag_edits\"][href*=\"id=\"], a[href*=\"page=favorites\"][href*=\"id=\"], a[href*=\"s=report\"][href*=\"user_id=\"]")?.getAttribute("href")?.match(/(?:user_)?id=(\d+)/)?.[1];
		if (!username || !userId) return fail(utils.userNotFoundError("Rule34"));
		return createProfileResult(`https://rule34.xxx/index.php?page=account&s=profile&uname=${username}`, `https://rule34.xxx/index.php?page=account&s=profile&id=${userId}`);
	};
	var getTwitterProfileName = () => {
		const profileMatch = /^\/([^/]+)(?:\/(.+?))?\/?$/.exec(location.pathname);
		const profileName = profileMatch?.[1];
		const profileSubpath = profileMatch?.[2]?.toLowerCase() ?? "";
		if (!profileName || !/^[a-zA-Z0-9_]{1,15}$/.test(profileName) || TWITTER_RESERVED_PATHS.has(profileName.toLowerCase()) || !TWITTER_PROFILE_TAB_PATHS.has(profileSubpath) && !TWITTER_STATUS_PATH_PATTERN.test(profileSubpath)) return fail("Please open the profile page");
		return profileName;
	};
	var normalizeTwitterProfileName = (profileName) => profileName.replace(/^@/, "").toLowerCase();
	var findTwitterUserEntity = (root, expectedProfileName) => {
		const expectedName = normalizeTwitterProfileName(expectedProfileName);
		const scriptTags = root.querySelectorAll("script[type='application/ld+json']");
		for (const scriptTag of scriptTags) {
			const userEntity = getRecord(utils.safeJsonParse(scriptTag.textContent), "mainEntity");
			const additionalName = getString(userEntity, "additionalName");
			const identifier = userEntity?.identifier;
			if (additionalName && (typeof identifier === "string" || typeof identifier === "number") && normalizeTwitterProfileName(additionalName) === expectedName) return {
				additionalName,
				identifier
			};
		}
		return null;
	};
	var handleTwitter = async () => {
		const profileName = getTwitterProfileName();
		let userEntity = findTwitterUserEntity(document, profileName);
		if (!userEntity) {
			const profileUrl = new URL(`/${profileName}`, location.origin).href;
			const profileHtml = await (await utils.safeFetch(profileUrl, { cache: "no-store" }))?.text();
			if (profileHtml) userEntity = findTwitterUserEntity(new DOMParser().parseFromString(profileHtml, "text/html"), profileName);
		}
		if (!userEntity) return fail(utils.userNotFoundError("Twitter"));
		return createProfileResult(`https://x.com/${userEntity.additionalName}`, `https://x.com/i/user/${userEntity.identifier}`);
	};
	var handleFanbox = async () => {
		const { host } = location;
		let username;
		if (host === "www.fanbox.cc") {
			const usernameMatch = /^\/@([a-zA-Z0-9_-]+)$/.exec(location.pathname);
			if (!usernameMatch?.[1]) return fail(utils.userNotFoundError("Fanbox"));
			username = usernameMatch[1];
		} else username = host.split(".", 1)[0];
		const apiResponse = await utils.safeFetch(`https://api.fanbox.cc/creator.get?creatorId=${username}`);
		if (!apiResponse) return fail(utils.userNotFoundError("Fanbox"));
		const userIdValue = getValueAt(await apiResponse.json(), "body", "user", "userId");
		if (typeof userIdValue !== "string" && typeof userIdValue !== "number") return fail("Invalid user data returned from API");
		const primaryUrl = location.href;
		return createProfileResult(primaryUrl, `https://www.pixiv.net/fanbox/creator/${String(userIdValue)}`);
	};
	var handlePixiv = async () => {
		let primaryUrl;
		if (location.pathname.includes("users")) primaryUrl = location.toString().replace("en/", "");
		else {
			const userId = document.querySelector("a[href*='/users/']")?.dataset.gtmValue;
			if (!userId) return fail(utils.userNotFoundError("Pixiv"));
			primaryUrl = `https://www.pixiv.net/users/${userId}`;
		}
		const staccUrl = primaryUrl.replace("en/", "").replace("users", "stacc/id");
		const secondaryUrl = (await utils.safeFetch(staccUrl))?.url ?? null;
		return createProfileResult(primaryUrl, secondaryUrl);
	};
	var extractTiebaPortraitId = (avatarUrl) => {
		if (!avatarUrl) return null;
		try {
			const avatarPath = new URL(avatarUrl.trim(), location.href).pathname;
			return /\/portrait\/item\/([^/]+)/.exec(avatarPath)?.[1] ?? null;
		} catch {
			return null;
		}
	};
	var handleTieba = () => {
		const username = document.querySelector(".user-information-wrapper .head-name")?.textContent?.trim() || null;
		const avatarImage = document.querySelector(".user-information-wrapper .user-avatar img");
		const portraitId = extractTiebaPortraitId(avatarImage?.dataset.src || avatarImage?.getAttribute("src"));
		if (!username || !portraitId) return fail(utils.userNotFoundError("Tieba"));
		return createProfileResult(`https://tieba.baidu.com/home/main?un=${username}`, `https://tieba.baidu.com/home/main?id=${portraitId}`);
	};
	var getTumblrBlogIdentifier = () => {
		const subdomain = /^(.+)\.tumblr\.com$/.exec(location.host)?.[1];
		if (subdomain && subdomain !== "www") return subdomain;
		return /^\/([^/]+)/.exec(location.pathname)?.[1] ?? null;
	};
	var handleTumblr = async () => {
		const blogIdentifier = getTumblrBlogIdentifier();
		if (!blogIdentifier) return fail(utils.userNotFoundError("Tumblr"));
		const initialState = utils.safeJsonParse(document.querySelector("#___INITIAL_STATE___")?.textContent);
		let blog = null;
		for (const query of getArrayAt(initialState, "queries", "queries")) {
			const data = getRecordAt(query, "state", "data");
			if (getString(data, "name") === blogIdentifier) {
				blog = {
					blogViewUrl: getString(data, "blogViewUrl") ?? void 0,
					blog_view_url: getString(data, "blog_view_url") ?? void 0,
					url: getString(data, "url") ?? void 0,
					uuid: getString(data, "uuid") ?? void 0
				};
				break;
			}
		}
		if (!blog) {
			const apiResponse = await utils.safeFetch(`https://api.tumblr.com/v2/blog/${encodeURIComponent(blogIdentifier)}/info`, { headers: { Authorization: TUMBLR_API_AUTHORIZATION } });
			if (!apiResponse) return fail(utils.userNotFoundError("Tumblr"));
			const apiBlog = getRecordAt(await apiResponse.json(), "response", "blog");
			blog = apiBlog ? {
				blogViewUrl: getString(apiBlog, "blogViewUrl") ?? void 0,
				blog_view_url: getString(apiBlog, "blog_view_url") ?? void 0,
				url: getString(apiBlog, "url") ?? void 0,
				uuid: getString(apiBlog, "uuid") ?? void 0
			} : null;
		}
		const blogUrl = blog?.url || blog?.blogViewUrl || blog?.blog_view_url;
		const primaryUrl = typeof blogUrl === "string" ? blogUrl.replace(/^http:/, "https:").replace(/\/$/, "") : null;
		if (!blog?.uuid || !primaryUrl) return fail(utils.userNotFoundError("Tumblr"));
		return createProfileResult(primaryUrl, `https://www.tumblr.com/blog/view/${blog.uuid}`);
	};
	var handleWeibo = () => {
		const username = document.querySelector("[class^=\"_name_\"]")?.textContent?.trim();
		const followHref = document.querySelector("a[href*=\"/u/page/follow/\"]")?.getAttribute("href");
		const userId = (followHref ? /\/u\/page\/follow\/(\d+)/.exec(followHref) : null)?.[1];
		if (!username || !userId) return fail(utils.userNotFoundError("Weibo"));
		return createProfileResult(`https://www.weibo.com/n/${username}`, `https://www.weibo.com/u/${userId}`);
	};
	var handleYouTube = () => {
		const path = location.pathname;
		if (path.startsWith("/watch") || path.startsWith("/playlist")) return fail("Please open the channel page");
		const initialData = asRecord(globalThis.ytInitialData);
		if (!getRecord(initialData, "metadata")) return fail("Metadata not found");
		const metadataRenderer = getRecordAt(initialData, "metadata", "channelMetadataRenderer");
		if (!metadataRenderer) return fail("Channel metadata renderer not found");
		let vanityChannelUrl = getString(metadataRenderer, "vanityChannelUrl");
		const channelUrl = getString(metadataRenderer, "channelUrl");
		if (vanityChannelUrl) {
			const urlObj = new URL(vanityChannelUrl);
			if (urlObj.protocol === "http:") urlObj.protocol = "https:";
			vanityChannelUrl = decodeURI(urlObj.href);
		}
		if (!vanityChannelUrl || !channelUrl) return fail("Failed to extract channel URLs");
		return createProfileResult(vanityChannelUrl, channelUrl);
	};
	var handleXfolio = (pageUrl, ogUrl) => {
		const creatorInfo = document.querySelector("div.creatorInfo");
		if (creatorInfo) {
			const primaryUrl = creatorInfo.dataset.creatorPortfolioTopUrl;
			if (!primaryUrl) return fail(utils.userNotFoundError("Xfolio"));
			const secondaryUrl = creatorInfo.dataset.creatorUrl;
			return createProfileResult(primaryUrl, secondaryUrl);
		}
		if (pageUrl.pathname.startsWith("/users/")) {
			const profileLink = document.querySelector("div.userProfile__btn a");
			if (!profileLink?.href) return fail(utils.userNotFoundError("Xfolio"));
			const profileUrl = new URL(profileLink.href);
			let primaryUrl;
			if (profileUrl.host === "xfolio.jp") primaryUrl = `https://xfolio.jp/${profileUrl.pathname.split("/").slice(-2).join("/")}`;
			else primaryUrl = profileUrl.origin;
			return createProfileResult(primaryUrl, ogUrl);
		}
		return fail(utils.userNotFoundError("Xfolio"));
	};
	var handleMisskey = (host, userId) => {
		const ogUrl = utils.getMetaContent("og:url", "property");
		if (!ogUrl) return fail(utils.userNotFoundError("Misskey"));
		return createProfileResult(ogUrl, `https://${host}/users/${userId}`);
	};
	var handleOtherPlatforms = (host) => {
		const ogUrl = utils.getMetaContent("og:url", "property");
		if (!ogUrl) return fail(`Unsupported site: ${host}`);
		const pageUrl = new URL(ogUrl);
		if (pageUrl.host === "xfolio.jp") return handleXfolio(pageUrl, ogUrl);
		if ([...document.querySelectorAll("link[rel=\"stylesheet\"][href]")].some((link) => {
			try {
				return new URL(link.href).host === "xfolio.jp";
			} catch {
				return false;
			}
		})) return handleXfolio(pageUrl, ogUrl);
		const misskeyUserId = utils.getMetaContent("misskey:user-id");
		if (misskeyUserId) return handleMisskey(host, misskeyUserId);
		return fail(`Unsupported site: ${host}`);
	};
	var PLATFORM_HANDLERS = {
		"bsky.app": handleBluesky,
		"fantia.jp": handleFantia,
		"inkbunny.net": handleInkbunny,
		"ko-fi.com": handleKoFi,
		"rule34.xxx": handleRule34,
		"tieba.baidu.com": handleTieba,
		"www.facebook.com": handleFacebook,
		"www.patreon.com": handlePatreon,
		"www.pixiv.net": handlePixiv,
		"www.youtube.com": handleYouTube,
		"x.com": handleTwitter
	};
	var SUBDOMAIN_HANDLERS = [
		["fanbox.cc", handleFanbox],
		["gumroad.com", handleGumroad],
		["lofter.com", handleLofter],
		["mihuashi.com", handleMihuashi],
		["tumblr.com", handleTumblr],
		["weibo.com", handleWeibo]
	];
	var isHostWithinDomain = (host, domain) => host === domain || host.endsWith(`.${domain}`);
	var getHandlerForHost = (host) => {
		if (Object.hasOwn(PLATFORM_HANDLERS, host)) return PLATFORM_HANDLERS[host];
		for (const [domain, handler] of SUBDOMAIN_HANDLERS) if (isHostWithinDomain(host, domain)) return handler;
		return null;
	};
	var getComparableUrl = (url) => {
		if (!url) return null;
		try {
			return new URL(url, location.href).href;
		} catch {
			return url;
		}
	};
	var normalizeProfileUrls = (profileUrls, sourceUrl, host, options = {}) => {
		const { requireAdditionalUrl = true } = options;
		if (!profileUrls?.primaryUrl) return fail(`Invalid profile URLs extracted from ${host}`, profileUrls);
		const { primaryUrl } = profileUrls;
		let { secondaryUrl } = profileUrls;
		secondaryUrl ||= null;
		const comparablePrimaryUrl = getComparableUrl(primaryUrl);
		if (secondaryUrl && getComparableUrl(secondaryUrl) === comparablePrimaryUrl) secondaryUrl = null;
		const normalizedProfileUrls = createProfileResult(primaryUrl, secondaryUrl);
		if (!secondaryUrl) utils.debugInfo(`Secondary profile URL unavailable on ${host}`, normalizedProfileUrls);
		const hasUsefulPrimaryUrl = comparablePrimaryUrl !== getComparableUrl(sourceUrl);
		if (requireAdditionalUrl && !hasUsefulPrimaryUrl && !Boolean(secondaryUrl)) return fail(`No additional profile URLs found on ${host}`, normalizedProfileUrls);
		return normalizedProfileUrls;
	};
	var extractProfileUrls = async (options = {}) => {
		const { requireAdditionalUrl = true, throwOnFailure = false } = options;
		const { host, href: sourceUrl } = location;
		try {
			const handler = getHandlerForHost(host);
			const profileUrls = handler ? await handler() : handleOtherPlatforms(host);
			if (!profileUrls) return null;
			return normalizeProfileUrls(profileUrls, sourceUrl, host, { requireAdditionalUrl });
		} catch (error) {
			if (throwOnFailure) throw error;
			if (error instanceof ProfileExtractionError) utils.debugInfo(error.message, error.details);
			else utils.warnUnexpectedError(`Unexpected extraction error on ${host}`, error);
			return null;
		}
	};
	var style_default = ":host {\n  --color-neutral-50: oklch(98.5% 0 0);\n  --color-neutral-200: oklch(92.2% 0 0);\n  --color-neutral-700: oklch(37.1% 0 0);\n  --color-neutral-800: oklch(26.9% 0 0);\n  --color-neutral-900: oklch(20.5% 0 0);\n  --color-neutral-950: oklch(14.5% 0 0);\n  --color-blue-500: oklch(62.3% 0.214 259.815);\n  --color-black: #000;\n\n  --bg: var(--color-neutral-900);\n  --panel: var(--color-neutral-800);\n  --hover: var(--color-neutral-700);\n  --text: var(--color-neutral-50);\n  --muted: var(--color-neutral-200);\n  --border: var(--color-neutral-700);\n  --accent: var(--color-blue-500);\n  --ring: oklch(62.3% 0.214 259.815 / 25%);\n  --backdrop: oklch(14.5% 0 0 / 72%);\n  --modal-shadow: rgb(0 0 0 / 45%);\n  --radius: 4px;\n  --ui-font-family: Verdana, system-ui, -apple-system, Helvetica, sans-serif;\n\n  all: initial;\n  position: fixed;\n  top: 16px;\n  right: 16px;\n  z-index: 2147483647;\n  display: block;\n  width: 32px;\n  height: 32px;\n  font-family: var(--ui-font-family);\n  font-size: 14px;\n  line-height: 1.5;\n  color: var(--text);\n  color-scheme: dark;\n  -webkit-text-size-adjust: none;\n  text-size-adjust: none;\n}\n\n*,\n*::before,\n*::after {\n  box-sizing: border-box;\n}\n\nbutton,\ninput {\n  font: inherit;\n  color: var(--text);\n  appearance: none;\n  outline: none;\n  background: var(--panel);\n  border: 1px solid var(--border);\n  border-radius: var(--radius);\n}\n\n/* Page styles can still target the shadow host, so reset inherited UI text styles inside it. */\n.floating-button,\n.backdrop {\n  font: 400 14px / 1.5 var(--ui-font-family);\n  color: var(--text);\n  text-align: left;\n  text-transform: none;\n  letter-spacing: normal;\n  color-scheme: dark;\n  -webkit-text-size-adjust: none;\n  text-size-adjust: none;\n}\n\nbutton:focus-visible,\ninput:focus-visible {\n  border-color: var(--accent);\n  box-shadow: 0 0 0 2px var(--ring);\n}\n\nbutton:hover:not(:disabled),\ninput:hover {\n  background: var(--hover);\n}\n\nbutton:disabled {\n  cursor: not-allowed;\n  opacity: 0.55;\n}\n\n.floating-button {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: 32px;\n  height: 32px;\n  padding: 0;\n  font-size: 16px;\n  line-height: 1;\n  touch-action: none;\n  cursor: grab;\n  user-select: none;\n  background: var(--bg);\n}\n\n.floating-button:active {\n  cursor: grabbing;\n}\n\n.backdrop {\n  position: fixed;\n  inset: 0;\n  z-index: 2;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  padding: 24px;\n  background: var(--backdrop);\n}\n\n.modal {\n  width: min(640px, 100%);\n  padding: 16px;\n  color: var(--text);\n  background: var(--bg);\n  border: 1px solid var(--border);\n  border-radius: var(--radius);\n  box-shadow: 0 16px 48px var(--modal-shadow);\n}\n\n.modal-title {\n  margin: 0 0 16px;\n  font-size: 16px;\n  line-height: 1.25;\n}\n\n.url-row {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) auto;\n  gap: 8px;\n  margin-bottom: 12px;\n}\n\n.url-label {\n  grid-column: 1 / -1;\n  font-size: 12px;\n  color: var(--muted);\n}\n\n.url-input {\n  width: 100%;\n  min-width: 0;\n  padding: 4px 8px;\n}\n\n.url-input::selection {\n  color: var(--text);\n  background: var(--accent);\n}\n\n.actions {\n  display: flex;\n  gap: 8px;\n  justify-content: flex-end;\n  margin-top: 16px;\n}\n\n.modal-button {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  padding: 4px 12px;\n  line-height: 1.25;\n  white-space: nowrap;\n  cursor: pointer;\n}\n\n@media (max-width: 576px) {\n  .url-row {\n    grid-template-columns: 1fr;\n  }\n\n  .actions {\n    flex-direction: column;\n  }\n\n  .modal-button {\n    width: 100%;\n  }\n}\n";
	var UI_ROOT_ID = "artist-profile-urls-extractor-ui";
	var COPY_FEEDBACK_DELAY = 1200;
	var DRAG_THRESHOLD = 4;
	var INITIAL_REFRESH_DELAY = 500;
	var LOCATION_POLL_INTERVAL = 1e3;
	var MAX_REFRESH_RETRIES = 3;
	var REFRESH_RETRY_DELAY = 1e3;
	var SPA_REFRESH_DELAY = 700;
	var uiState = {
		displayedProfileUrls: null,
		displayedSourceUrl: null,
		hostElement: null,
		isSuppressNextClick: false,
		isWatchingNavigation: false,
		lastUrl: location.href,
		modalElement: null,
		refreshTimer: null,
		refreshToken: 0
	};
	var clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
	var createElement = (tagName, className) => {
		const element = document.createElement(tagName);
		if (className) element.className = className;
		return element;
	};
	var createButton = (className, textContent, onClick) => {
		const button = createElement("button", className);
		button.type = "button";
		button.textContent = textContent;
		button.addEventListener("click", onClick);
		return button;
	};
	var areProfileUrlsEqual = (left, right) => left?.primaryUrl === right.primaryUrl && left?.secondaryUrl === right.secondaryUrl;
	var copyToClipboard = async (text, button) => {
		const originalText = button.textContent;
		button.disabled = true;
		try {
			await navigator.clipboard.writeText(text);
			button.textContent = "Copied";
		} catch {
			button.textContent = "Copy failed";
		}
		setTimeout(() => {
			button.disabled = false;
			button.textContent = originalText;
		}, COPY_FEEDBACK_DELAY);
	};
	var handleModalEscape = (event) => {
		if (event.key === "Escape") closeModal();
	};
	var closeModal = () => {
		document.removeEventListener("keydown", handleModalEscape);
		uiState.modalElement?.remove();
		uiState.modalElement = null;
	};
	var createUrlRow = (label, value) => {
		const row = createElement("div", "url-row");
		const labelElement = createElement("label", "url-label");
		const input = createElement("input", "url-input");
		const copyButton = createButton("modal-button copy-button", "Copy", () => {
			copyToClipboard(value, copyButton);
		});
		labelElement.textContent = label;
		input.readOnly = true;
		input.type = "text";
		input.value = value;
		row.append(labelElement, input, copyButton);
		return row;
	};
	var createModalActions = (output) => {
		const actions = createElement("div", "actions");
		const copyAllButton = createButton("modal-button copy-all-button", "Copy All", () => {
			copyToClipboard(output, copyAllButton);
		});
		const closeButton = createButton("modal-button close-button", "Close", closeModal);
		actions.append(copyAllButton, closeButton);
		return {
			actions,
			closeButton
		};
	};
	var showModal = (profileUrls) => {
		closeModal();
		const backdrop = createElement("div", "backdrop");
		const modal = createElement("section", "modal");
		const title = createElement("h2", "modal-title");
		const { actions, closeButton } = createModalActions([profileUrls.primaryUrl, profileUrls.secondaryUrl].filter(Boolean).join("\n"));
		const visibleRows = [["Primary URL", profileUrls.primaryUrl], ["Secondary URL", profileUrls.secondaryUrl]].filter((row) => Boolean(row[1]));
		modal.setAttribute("aria-label", "Profile URLs");
		modal.setAttribute("aria-modal", "true");
		modal.setAttribute("role", "dialog");
		title.textContent = "Profile URLs";
		backdrop.addEventListener("click", (event) => {
			if (event.target === backdrop) closeModal();
		});
		modal.append(title, ...visibleRows.map(([label, value]) => createUrlRow(label, value)), actions);
		backdrop.append(modal);
		uiState.hostElement?.shadowRoot?.append(backdrop);
		uiState.modalElement = backdrop;
		document.addEventListener("keydown", handleModalEscape);
		closeButton.focus();
	};
	var enableDrag = (button) => {
		let dragState = null;
		button.addEventListener("pointerdown", (event) => {
			if (event.button !== 0) return;
			const rect = uiState.hostElement?.getBoundingClientRect();
			if (!rect) return;
			dragState = {
				height: rect.height,
				initialLeft: rect.left,
				initialTop: rect.top,
				moved: false,
				startX: event.clientX,
				startY: event.clientY,
				width: rect.width
			};
			button.setPointerCapture(event.pointerId);
		});
		button.addEventListener("pointermove", (event) => {
			if (!dragState) return;
			const deltaX = event.clientX - dragState.startX;
			const deltaY = event.clientY - dragState.startY;
			if (Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD) dragState.moved = true;
			if (!dragState.moved) return;
			const { hostElement } = uiState;
			if (!hostElement) return;
			hostElement.style.left = `${clamp(dragState.initialLeft + deltaX, 0, innerWidth - dragState.width)}px`;
			hostElement.style.right = "auto";
			hostElement.style.top = `${clamp(dragState.initialTop + deltaY, 0, innerHeight - dragState.height)}px`;
			event.preventDefault();
		});
		button.addEventListener("pointerup", () => {
			if (!dragState) return;
			uiState.isSuppressNextClick = dragState.moved;
			dragState = null;
			setTimeout(() => {
				uiState.isSuppressNextClick = false;
			}, 0);
		});
		button.addEventListener("pointercancel", () => {
			dragState = null;
		});
	};
	var createFloatingButton = () => {
		const button = createButton("floating-button", "🔗", () => {
			if (uiState.isSuppressNextClick) {
				uiState.isSuppressNextClick = false;
				return;
			}
			if (uiState.displayedProfileUrls) showModal(uiState.displayedProfileUrls);
		});
		button.setAttribute("aria-label", "Show profile URLs");
		button.title = "Drag to move. Click to show profile URLs.";
		enableDrag(button);
		return button;
	};
	var destroyFloatingUi = () => {
		closeModal();
		uiState.hostElement?.remove();
		uiState.displayedProfileUrls = null;
		uiState.displayedSourceUrl = null;
		uiState.hostElement = null;
	};
	var createFloatingUi = (profileUrls, sourceUrl) => {
		destroyFloatingUi();
		document.querySelector(`#${UI_ROOT_ID}`)?.remove();
		const hostElement = document.createElement("div");
		const shadowRoot = hostElement.attachShadow({ mode: "open" });
		hostElement.id = UI_ROOT_ID;
		const style = createElement("style");
		style.textContent = style_default;
		shadowRoot.append(style, createFloatingButton());
		document.documentElement.append(hostElement);
		uiState.hostElement = hostElement;
		uiState.displayedProfileUrls = profileUrls;
		uiState.displayedSourceUrl = sourceUrl;
	};
	var scheduleFloatingUiRefresh = (delay = INITIAL_REFRESH_DELAY, retriesLeft = MAX_REFRESH_RETRIES) => {
		if (uiState.refreshTimer !== null) clearTimeout(uiState.refreshTimer);
		uiState.refreshTimer = setTimeout(() => refreshFloatingUi(retriesLeft), delay);
	};
	var refreshFloatingUi = async (retriesLeft = MAX_REFRESH_RETRIES) => {
		const currentToken = ++uiState.refreshToken;
		const refreshUrl = location.href;
		try {
			const profileUrls = await extractProfileUrls();
			if (currentToken !== uiState.refreshToken || refreshUrl !== location.href) return;
			if (!profileUrls) {
				destroyFloatingUi();
				if (retriesLeft > 0) scheduleFloatingUiRefresh(REFRESH_RETRY_DELAY, retriesLeft - 1);
				return;
			}
			if (uiState.hostElement?.isConnected && uiState.displayedSourceUrl === refreshUrl && areProfileUrlsEqual(uiState.displayedProfileUrls, profileUrls)) return;
			createFloatingUi(profileUrls, refreshUrl);
		} catch (error) {
			utils.warnUnexpectedError("Unexpected floating UI refresh error", error);
			if (currentToken !== uiState.refreshToken || refreshUrl !== location.href) return;
			destroyFloatingUi();
			if (retriesLeft > 0) scheduleFloatingUiRefresh(REFRESH_RETRY_DELAY, retriesLeft - 1);
		}
	};
	var handlePotentialNavigation = () => {
		if (location.href === uiState.lastUrl) return;
		uiState.lastUrl = location.href;
		uiState.refreshToken += 1;
		destroyFloatingUi();
		scheduleFloatingUiRefresh(SPA_REFRESH_DELAY);
	};
	var watchSpaNavigation = () => {
		if (uiState.isWatchingNavigation) return;
		uiState.isWatchingNavigation = true;
		addEventListener("popstate", handlePotentialNavigation);
		addEventListener("hashchange", handlePotentialNavigation);
		setInterval(handlePotentialNavigation, LOCATION_POLL_INTERVAL);
	};
	var initializeProfileUrlsExtractor = () => {
		watchSpaNavigation();
		if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => scheduleFloatingUiRefresh(0), { once: true });
		else scheduleFloatingUiRefresh(0);
		if (document.readyState !== "complete") addEventListener("load", () => scheduleFloatingUiRefresh(), { once: true });
	};
	initializeProfileUrlsExtractor();
})();
