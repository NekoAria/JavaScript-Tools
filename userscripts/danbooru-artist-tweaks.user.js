// ==UserScript==
// @name         Danbooru Artist Tweaks
// @namespace    https://github.com/NekoAria/JavaScript-Tools
// @version      1.0.2
// @author       Neko_Aria
// @description  Add Create wiki link for artist pages without wiki page, copy artist name button, replace wiki links with bulk update request links for tag aliases, show pending BURs, highlight unrecognized external hostnames in artist versions, and warn about unmigrated posts on artist rename
// @downloadURL  https://github.com/NekoAria/JavaScript-Tools/raw/refs/heads/main/userscripts/danbooru-artist-tweaks.user.js
// @updateURL    https://github.com/NekoAria/JavaScript-Tools/raw/refs/heads/main/userscripts/danbooru-artist-tweaks.user.js
// @match        *://*.donmai.us/artists/*
// @match        *://*.donmai.us/artist_versions*
// @grant        none
// ==/UserScript==

(function() {
var getArtistTagName = () => {
		const tagElement = document.querySelector(".tag-type-1.heading.text-xl");
		if (tagElement) return tagElement.textContent.trim().replaceAll(/\s+/g, "_");
		return null;
	};
	var createCopyButton = (tagName) => {
		const button = document.createElement("button");
		button.className = "artist-copy-btn";
		button.textContent = "copy";
		button.title = `Copy artist name: ${tagName}`;
		button.addEventListener("click", async (e) => {
			e.preventDefault();
			try {
				await navigator.clipboard.writeText(tagName);
				const originalText = button.textContent;
				button.textContent = "copied!";
				button.classList.add("copied");
				setTimeout(() => {
					button.textContent = originalText;
					button.classList.remove("copied");
				}, 500);
			} catch (error) {
				console.error("Failed to copy artist name:", error);
			}
		});
		return button;
	};
	var createWikiLinkElement = (tagName) => {
		const { hostname } = globalThis.location;
		const link = document.createElement("a");
		link.id = "create-wiki-link";
		link.href = `https://${hostname}/wiki_pages/new?wiki_page[title]=${tagName}`;
		link.textContent = "Create wiki";
		return link;
	};
	var replaceWikiLinksWithBulkUpdateRequests = () => {
		const fineprintLinks = document.querySelectorAll("p.fineprint a");
		for (const link of fineprintLinks) {
			const href = link.getAttribute("href");
			if (href && href.startsWith("/wiki_pages/") && href !== "/wiki_pages/help:tag_aliases") {
				const newHref = `/bulk_update_requests?commit=search[status]=approved&search[tags_include_any]=${href.replace("/wiki_pages/", "")}`;
				link.setAttribute("href", newHref);
			}
		}
	};
	var fetchPendingBURs = async (tagName) => {
		const { origin } = globalThis.location;
		const url = `${origin}/bulk_update_requests.json?search[status]=pending&search[tags_include_any]=${tagName}`;
		try {
			const response = await fetch(url);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			return await response.json();
		} catch (error) {
			console.error("Failed to fetch pending BURs:", error);
			return [];
		}
	};
	var renderPendingBURs = (burs) => {
		document.querySelector("#pending-bur-section")?.remove();
		if (burs.length === 0) return;
		const { origin } = globalThis.location;
		const section = document.createElement("div");
		section.id = "pending-bur-section";
		for (const bur of burs) {
			const p = document.createElement("p");
			p.className = "fineprint pending-bur";
			const burLink = document.createElement("a");
			burLink.className = "wiki-link";
			burLink.href = `${origin}/bulk_update_requests/${bur.id}`;
			burLink.textContent = `BUR #${bur.id}`;
			const forumLink = bur.forum_post_id ? (() => {
				const a = document.createElement("a");
				a.className = "wiki-link";
				a.href = `${origin}/forum_posts/${bur.forum_post_id}`;
				a.textContent = `forum #${bur.forum_post_id}`;
				return a;
			})() : null;
			p.append(document.createTextNode("⏳ Pending "));
			p.append(burLink);
			p.append(document.createTextNode(`: ${bur.script}`));
			if (forumLink) {
				p.append(document.createTextNode(" ("));
				p.append(forumLink);
				p.append(document.createTextNode(")"));
			}
			section.append(p);
		}
		const fineprintParagraphs = document.querySelectorAll("p.fineprint");
		(fineprintParagraphs.length > 0 ? fineprintParagraphs.at(-1) : document.querySelector("#view-artist-link")?.closest("p"))?.insertAdjacentElement("afterend", section);
	};
	var addPendingBURs = async (tagName) => {
		renderPendingBURs(await fetchPendingBURs(tagName));
	};
	var addStyles = () => {
		const style = document.createElement("style");
		style.textContent = `
      .artist-copy-btn {
        background-color: var(--link-color);
        color: white;
        border: none;
        cursor: pointer;
        transition: background-color 0.2s;
        font-size: var(--text-sm);
      }

      .artist-copy-btn:hover {
        background-color: var(--link-hover-color) !important;
      }

      .artist-copy-btn.copied {
        background-color: var(--success-color) !important;
      }

      #pending-bur-section .pending-bur {
        color: var(--warning-color);
      }
    `;
		document.head.append(style);
	};
	var addCopyButton = () => {
		if (document.querySelector(".artist-copy-btn")) return;
		const copyButton = createCopyButton(getArtistTagName());
		document.querySelector(".flex.items-center.gap-2").append(copyButton);
	};
	var addCreateWikiLink = () => {
		if (document.querySelector("#view-wiki-link")) return;
		const editArtistLink = document.querySelector("#view-artist-link");
		const wikiLink = createWikiLinkElement(getArtistTagName());
		const separator = document.createTextNode(" | ");
		editArtistLink.before(wikiLink);
		editArtistLink.before(separator);
	};
	var getArtistIdFromURL = () => {
		return new URLSearchParams(globalThis.location.search).get("search[artist_id]");
	};
	var fetchArtistUnrecognizedHostnames = async (artistId) => {
		const { origin } = globalThis.location;
		const url = `${origin}/artists/${artistId}`;
		try {
			const response = await fetch(url);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const html = await response.text();
			const doc = new DOMParser().parseFromString(html, "text/html");
			const hostnameSet = new Set();
			for (const li of doc.querySelectorAll("li")) if (li.querySelector(".globe-icon")) for (const a of li.querySelectorAll("a[href]")) {
				const href = a.getAttribute("href");
				hostnameSet.add(new URL(href).hostname);
			}
			return hostnameSet;
		} catch (error) {
			console.error("Failed to fetch artist URLs:", error);
			return new Set();
		}
	};
	var prependGlobeIfUnrecognized = (element, hostnameSet, { inside = false } = {}) => {
		const urlText = element.textContent.trim().replace(/^-/, "");
		const { hostname } = new URL(urlText);
		if (!hostnameSet.has(hostname)) return;
		const markerText = "🌐 ";
		if ((inside ? element.firstChild?.textContent : element.previousSibling?.textContent) === markerText) return;
		const markerNode = document.createTextNode(markerText);
		if (inside) element.prepend(markerNode);
		else element.before(markerNode);
	};
	var highlightUnrecognizedHostnamesInVersions = (hostnameSet) => {
		if (hostnameSet.size === 0) return;
		for (const li of document.querySelectorAll("#artist-versions-table .urls-column li")) if (li.classList.contains("changed")) for (const span of li.querySelectorAll("span.removed, span.added")) prependGlobeIfUnrecognized(span, hostnameSet);
		else prependGlobeIfUnrecognized(li, hostnameSet, { inside: true });
	};
	var checkUnmigratedPostsOnRename = async (artistId) => {
		const rows = document.querySelectorAll("#artist-versions-table tbody tr");
		if (rows.length < 2) return;
		let renameIndex = -1;
		for (const [i, row] of rows.entries()) if (row.querySelector(".name-column")?.querySelector("b")) {
			renameIndex = i;
			break;
		}
		if (renameIndex === -1) return;
		const { origin } = globalThis.location;
		const url = `${origin}/artist_versions.json?search[artist_id]=${artistId}`;
		try {
			const response = await fetch(url);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const oldName = (await response.json())[renameIndex + 1]?.name;
			if (!oldName) return;
			const postsUrl = `${origin}/posts.json?tags=${oldName}&limit=1`;
			const postsResponse = await fetch(postsUrl);
			if (!postsResponse.ok) throw new Error(`HTTP ${postsResponse.status}`);
			if ((await postsResponse.json()).some((post) => post.tag_string_artist && post.tag_string_artist.includes(oldName))) renderUnmigratedPostsWarning(oldName);
		} catch (error) {
			console.error("Failed to check unmigrated posts:", error);
		}
	};
	var renderUnmigratedPostsWarning = (oldName) => {
		document.querySelector("#unmigrated-posts-warning")?.remove();
		const { origin } = globalThis.location;
		const section = document.createElement("div");
		section.id = "unmigrated-posts-warning";
		section.className = "notice notice-info flex text-center items-center justify-center gap-2";
		const span = document.createElement("span");
		span.append(document.createTextNode("⚠️ There are posts still tagged with old name "));
		const postLink = document.createElement("a");
		postLink.href = `${origin}/posts?tags=${oldName}`;
		postLink.textContent = oldName;
		span.append(postLink);
		section.append(span);
		const h1 = document.querySelector("h1");
		if (h1) h1.before(section);
	};
	var init = () => {
		addStyles();
		if (globalThis.location.pathname.startsWith("/artist_versions")) {
			const artistId = getArtistIdFromURL();
			if (artistId) {
				fetchArtistUnrecognizedHostnames(artistId).then(highlightUnrecognizedHostnamesInVersions);
				checkUnmigratedPostsOnRename(artistId);
			}
			return;
		}
		addCopyButton();
		addCreateWikiLink();
		replaceWikiLinksWithBulkUpdateRequests();
		const tagName = getArtistTagName();
		if (tagName) addPendingBURs(tagName);
	};
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
	else init();
})();