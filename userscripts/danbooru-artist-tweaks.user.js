// ==UserScript==
// @name         Danbooru Artist Tweaks
// @namespace    https://github.com/NekoAria/JavaScript-Tools
// @version      1.0.5
// @author       Neko_Aria
// @description  Add Create wiki link for artist pages without wiki page, copy artist name button, replace wiki links with bulk update request links for tag aliases, show pending BURs, highlight unrecognized external hostnames in artist versions, provide an expandable multi-line editor for the artist "Other Names" field, and warn about unmigrated posts on artist rename
// @homepageURL  https://github.com/NekoAria/JavaScript-Tools/tree/main/packages/danbooru-artist-tweaks
// @supportURL   https://github.com/NekoAria/JavaScript-Tools/issues
// @match        *://*.donmai.us/artists/*
// @match        *://*.donmai.us/artist_versions*
// @grant        none
// ==/UserScript==

(function() {
	"use strict";
	var style_default = ".artist-copy-btn,\n.other-names-toggle-btn {\n  font-size: var(--text-sm);\n  color: white;\n  cursor: pointer;\n  background-color: var(--link-color);\n  border: none;\n  transition: background-color 0.2s;\n}\n\n.artist-copy-btn:hover,\n.other-names-toggle-btn:hover {\n  background-color: var(--link-hover-color) !important;\n}\n\n.artist-copy-btn.copied {\n  background-color: var(--success-color);\n}\n\n#pending-bur-section .pending-bur {\n  color: var(--warning-color);\n}\n\n.other-names-wrapper {\n  display: flex;\n  gap: 0.5rem;\n}\n\n.other-names-wrapper > #artist_other_names_string {\n  flex: 1;\n}\n\n.other-names-toggle-btn {\n  flex-shrink: 0;\n  max-height: 2.25em;\n  padding: 0 0.75rem;\n}\n\nform.simple_form div.input .hint {\n  padding-left: 0 !important;\n}\n";
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
		const { hostname } = location;
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
		const { origin } = location;
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
		const { origin } = location;
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
		style.textContent = style_default;
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
		return new URLSearchParams(location.search).get("search[artist_id]");
	};
	var fetchArtistUnrecognizedHostnames = async (artistId) => {
		const { origin } = location;
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
	var fetchTagAliases = async (antecedentName) => {
		const { origin } = location;
		const url = `${origin}/tag_aliases.json?${new URLSearchParams({ "search[antecedent_name_matches]": antecedentName })}`;
		const response = await fetch(url);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return await response.json();
	};
	var hasActiveTagAlias = (aliases, antecedentName, consequentName) => aliases.some((alias) => alias.status === "active" && alias.antecedent_name === antecedentName && alias.consequent_name === consequentName);
	var hasActiveTagAliasBetweenNames = async (oldName, newName) => {
		if (hasActiveTagAlias(await fetchTagAliases(oldName), oldName, newName)) return true;
		return hasActiveTagAlias(await fetchTagAliases(newName), newName, oldName);
	};
	var fetchActiveArtistByName = async (name) => {
		const { origin } = location;
		const url = `${origin}/artists.json?${new URLSearchParams({
			"search[name]": name,
			"search[is_deleted]": "false",
			limit: "1",
			only: "id,name,is_deleted"
		})}`;
		const response = await fetch(url);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return await response.json();
	};
	var hasActiveArtistEntry = async (name) => {
		return (await fetchActiveArtistByName(name)).some((artist) => artist.name === name && !artist.is_deleted);
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
		const { origin } = location;
		const url = `${origin}/artist_versions.json?search[artist_id]=${artistId}`;
		try {
			const response = await fetch(url);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const versions = await response.json();
			const newName = versions[renameIndex]?.name;
			const oldName = versions[renameIndex + 1]?.name;
			if (!oldName || !newName) return;
			if (await hasActiveTagAliasBetweenNames(oldName, newName)) return;
			if (await hasActiveArtistEntry(oldName)) return;
			const postsUrl = `${origin}/posts.json?${new URLSearchParams({
				limit: "1",
				tags: oldName
			})}`;
			const postsResponse = await fetch(postsUrl);
			if (!postsResponse.ok) throw new Error(`HTTP ${postsResponse.status}`);
			if ((await postsResponse.json()).some((post) => (post.tag_string_artist ?? "").split(/\s+/).includes(oldName))) renderUnmigratedPostsWarning(oldName);
		} catch (error) {
			console.error("Failed to check unmigrated posts:", error);
		}
	};
	var renderUnmigratedPostsWarning = (oldName) => {
		document.querySelector("#unmigrated-posts-warning")?.remove();
		const { origin } = location;
		const section = document.createElement("div");
		section.id = "unmigrated-posts-warning";
		section.className = "notice notice-info flex text-center items-center justify-center gap-2";
		const span = document.createElement("span");
		span.append(document.createTextNode("⚠️ There may still be posts tagged with the old name: "));
		const postLink = document.createElement("a");
		postLink.href = `${origin}/posts?tags=${encodeURIComponent(oldName)}`;
		postLink.textContent = oldName;
		span.append(postLink);
		section.append(span);
		const h1 = document.querySelector("h1");
		if (h1) h1.before(section);
	};
	var otherNamesAttrsToCopy = [
		"name",
		"id",
		"placeholder",
		"required"
	];
	var normalizeOtherNamesValue = (value) => value.replaceAll(/\s+/g, " ").trim();
	var getOtherNamesLines = (value) => value.trim().split(/\s+/).filter(Boolean);
	var copyOtherNamesAttrs = (from, to) => {
		for (const attrName of otherNamesAttrsToCopy) {
			const value = from.getAttribute(attrName);
			if (value !== null) to.setAttribute(attrName, value);
		}
	};
	var normalizeOtherNamesField = (field) => {
		if (field?.tagName === "TEXTAREA") field.value = normalizeOtherNamesValue(field.value);
	};
	var createOtherNamesInput = (current) => {
		const input = document.createElement("input");
		copyOtherNamesAttrs(current, input);
		input.type = "text";
		input.className = "w-full max-w-360px string optional iac-autocomplete";
		input.value = normalizeOtherNamesValue(current.value);
		return input;
	};
	var createOtherNamesTextarea = (current, form) => {
		const textarea = document.createElement("textarea");
		copyOtherNamesAttrs(current, textarea);
		textarea.className = "text optional iac-autocomplete";
		const lines = getOtherNamesLines(current.value);
		textarea.value = lines.join("\n");
		textarea.rows = Math.min(20, Math.max(4, lines.length + 1));
		textarea.addEventListener("keydown", (e) => {
			if (!((e.ctrlKey || e.metaKey) && e.key === "Enter")) return;
			e.preventDefault();
			form?.requestSubmit();
		});
		return textarea;
	};
	var addOtherNamesToggleButton = () => {
		const field = document.querySelector("#artist_other_names_string");
		if (!field || document.querySelector("#other-names-toggle-btn")) return;
		const form = field.closest("form");
		const wrapper = document.createElement("div");
		wrapper.className = "other-names-wrapper";
		field.before(wrapper);
		wrapper.append(field);
		const button = document.createElement("button");
		button.id = "other-names-toggle-btn";
		button.type = "button";
		button.className = "other-names-toggle-btn";
		button.textContent = "expand";
		button.title = "Toggle multi-line view";
		wrapper.append(button);
		button.addEventListener("click", (e) => {
			e.preventDefault();
			const current = wrapper.querySelector("#artist_other_names_string");
			if (!current) {
				console.warn("Other names field not found inside wrapper.");
				button.disabled = true;
				return;
			}
			const isTextarea = current.tagName === "TEXTAREA";
			const nextField = isTextarea ? createOtherNamesInput(current) : createOtherNamesTextarea(current, form);
			current.replaceWith(nextField);
			button.textContent = isTextarea ? "expand" : "collapse";
		});
		form?.addEventListener("submit", () => {
			normalizeOtherNamesField(wrapper.querySelector("#artist_other_names_string"));
		}, { capture: true });
	};
	var init = async () => {
		addStyles();
		if (location.pathname.startsWith("/artist_versions")) {
			const artistId = getArtistIdFromURL();
			if (artistId) {
				const unrecognizedHostnames = fetchArtistUnrecognizedHostnames(artistId);
				checkUnmigratedPostsOnRename(artistId);
				highlightUnrecognizedHostnamesInVersions(await unrecognizedHostnames);
			}
			return;
		}
		if (document.querySelector("#artist_other_names_string")) {
			addOtherNamesToggleButton();
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
