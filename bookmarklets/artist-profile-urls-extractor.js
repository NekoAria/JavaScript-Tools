// original: https://gist.github.com/TypeA2/dc1bb0ba549369dd079f15e44e5623eb
javascript: void (async () => {
  let profileUrl;
  let secondaryUrl;
  const { host } = location;
  try {
    if (["twitter.com", "x.com"].includes(host)) {
      const scriptTag = document.querySelector("script[type='application/ld+json']");
      if (scriptTag) {
        const { mainEntity } = JSON.parse(scriptTag.innerText);
        if (mainEntity) {
          profileUrl = `https://twitter.com/${mainEntity.additionalName}`;
          secondaryUrl = `https://twitter.com/intent/user?user_id=${mainEntity.identifier}`;
        }
      } else {
        alert("Please open the profile page.");
        return;
      }
    } else if (host === "www.pixiv.net") {
      if (location.pathname.includes("users")) {
        profileUrl = location.toString().replace("en/", "");
      } else {
        const userLink = document.querySelector("a[href*='/users/']");
        profileUrl = `https://${host}/users/${userLink.dataset.gtmValue}`;
      }
      secondaryUrl = await fetch(profileUrl.replace("en/", "").replace("users", "stacc/id")).then(
        (res) => res.url,
      );
    } else if (host === "bsky.app") {
      const profileRegex = /\/profile\/([^/]+)/;
      const match = location.pathname.match(profileRegex);
      if (match && match[1]) {
        const identifier = match[1];
        profileUrl = `https://bsky.app/profile/${identifier}`;
        if (identifier.startsWith("did:")) {
          secondaryUrl = profileUrl;
          profileUrl = `https://bsky.app/profile/${await fetch(
            `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${identifier}`,
          )
            .then((res) => res.json())
            .then((json) => json.handle)}`;
        } else {
          secondaryUrl = `https://bsky.app/profile/${await fetch(
            `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${identifier}`,
          )
            .then((res) => res.json())
            .then((json) => json.did)}`;
        }
      } else {
        throw new Error("Unable to retrieve user information from Bluesky URL.");
      }
    } else if (host === "www.youtube.com") {
      if (location.pathname.includes("/watch")) {
        alert("Please open the channel page.");
        return;
      }
      let channelHandle = null;
      const channelIdSpan = document.querySelector(
        "span.yt-content-metadata-view-model-wiz__metadata-text",
      );
      if (channelIdSpan?.textContent.trim().startsWith("@")) {
        channelHandle = channelIdSpan.textContent;
      }
      const canonicalLink = document.querySelector("link[rel='canonical']");
      if (channelHandle) {
        profileUrl = `https://www.youtube.com/${channelHandle}`;
        secondaryUrl = canonicalLink.href;
      } else {
        alert("Please reload the channel page.");
        return;
      }
    } else if (host.includes("fanbox.cc")) {
      let userName;
      if (host === "www.fanbox.cc") {
        const match = location.pathname.match(/^\/@([a-zA-Z0-9_-]+)$/);
        if (match && match[1]) {
          userName = match[1];
        } else {
          throw new Error("Unable to retrieve username from Fanbox URL.");
        }
      } else {
        userName = location.hostname.split(".")[0];
      }
      const response = await fetch(`https://api.fanbox.cc/creator.get?creatorId=${userName}`);
      const data = await response.json();
      if (data?.body?.user) {
        profileUrl = location.href;
        secondaryUrl = `https://www.pixiv.net/fanbox/creator/${data.body.user.userId}`;
      } else {
        throw new Error("Unable to retrieve user information from Fanbox API.");
      }
    } else if (host.includes("gumroad.com")) {
      document.querySelectorAll(".js-react-on-rails-component").forEach((element) => {
        const userData = JSON.parse(element.textContent).creator_profile;
        if (userData) {
          profileUrl = `https://${userData.subdomain}`;
          secondaryUrl = `https://${userData.external_id}.gumroad.com`;
        }
      });
    } else if (host.includes("patreon.com")) {
      const scriptTag = document.querySelector("script#__NEXT_DATA__");
      if (scriptTag) {
        const data = JSON.parse(scriptTag.textContent);
        let userId =
          data?.props?.pageProps?.bootstrapEnvelope?.commonBootstrap?.campaign?.data?.relationships
            ?.creator?.data?.id ||
          data?.props?.pageProps?.bootstrapEnvelope?.pageBootstrap?.campaign?.data?.relationships
            ?.creator?.data?.id ||
          data?.props?.pageProps?.bootstrapEnvelope?.pageBootstrap?.pageUser?.data?.id;
        if (userId) {
          profileUrl = location.href
            .replace("http://", "https://")
            .replace(":443", "")
            .replace("/c/", "")
            .replace("/home", "")
            .replace(/\/$/, "");
          secondaryUrl = `https://www.patreon.com/user?u=${userId}`;
          if (profileUrl.includes("patreon.com") && !profileUrl.includes("www.patreon.com")) {
            profileUrl = profileUrl.replace("patreon.com", "www.patreon.com");
          }
        } else {
          throw new Error("Unable to extract user ID from Patreon page");
        }
      } else {
        throw new Error("The necessary data on the Patreon page cannot be found");
      }
    } else if (host === "fantia.jp") {
      const creatorProfileLink = document.querySelector(".fanclub-header a");
      if (creatorProfileLink) {
        const creatorPath = creatorProfileLink.getAttribute("href");
        profileUrl = `https://fantia.jp${creatorPath}`;
        const creatorNickname = document.querySelector("#nickname");
        if (creatorNickname?.getAttribute("value")) {
          secondaryUrl = `https://fantia.jp/${creatorNickname.getAttribute("value")}`;
        } else {
          secondaryUrl = profileUrl;
        }
      } else {
        throw new Error("Unable to find creator information on Fantia page");
      }
    } else if (host.includes("lofter.com")) {
      profileUrl = window.hostUrl;
      const blogId = document.querySelector('input[name="blogId"]')?.value;
      if (blogId) {
        secondaryUrl = `https://www.lofter.com/mentionredirect.do?blogId=${blogId}`;
      } else {
        throw new Error("Unable to find blog ID on Lofter page");
      }
    } else {
      const ogUrl = document.querySelector("meta[property='og:url']")?.content;
      const url = ogUrl ? new URL(ogUrl) : null;
      const host = url ? url.host : null;
      if (host === "xfolio.jp") {
        const creatorInfo = document.querySelector("div.creatorInfo");
        if (creatorInfo) {
          profileUrl = creatorInfo.dataset.creatorPortfolioTopUrl;
          secondaryUrl = creatorInfo.dataset.creatorUrl;
        } else if (url.pathname.startsWith("/users/")) {
          const profileLink = document.querySelector("div.userProfile__btn a");
          const url = new URL(profileLink.href);
          if (url.host === "xfolio.jp") {
            const path = url.pathname.split("/").slice(-2).join("/");
            profileUrl = `https://xfolio.jp/${path}`;
          } else {
            profileUrl = url.origin;
          }
          secondaryUrl = ogUrl;
        }
      } else {
        const username = document.querySelector("meta[name='misskey:user-username']")?.content;
        if (username) {
          const userId = document.querySelector("meta[name='misskey:user-id']").content;
          profileUrl = `https://misskey.io/@${username}`;
          secondaryUrl = `https://misskey.io/users/${userId}`;
        } else {
          alert(`Unsupported site: ${host}`);
          return;
        }
      }
    }
  } catch (error) {
    alert(`Error: ${error.message}`);
    return;
  }
  if (navigator.userAgent.toLowerCase().includes("firefox")) {
    alert(`${profileUrl}\n${secondaryUrl}`);
  } else {
    prompt(`${host} URLs`, `${profileUrl}\n${secondaryUrl}`);
  }
})();
