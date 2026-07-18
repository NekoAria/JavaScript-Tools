// ==UserScript==
// @name         Danbooru Artist Tweaks
// @namespace    https://github.com/NekoAria/JavaScript-Tools
// @version      1.0.8
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
	var isRecord$1 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
	var parsePendingBulkUpdateRequests = (value) => {
		if (!Array.isArray(value)) throw new TypeError("Invalid pending BUR response: expected an array");
		return value.map((item) => {
			if (!isRecord$1(item)) throw new TypeError("Invalid pending BUR response item");
			const { forum_post_id: forumPostId, id, script } = item;
			if (typeof id !== "number" && typeof id !== "string" || typeof script !== "string") throw new TypeError("Invalid pending BUR fields");
			if (forumPostId !== void 0 && forumPostId !== null && typeof forumPostId !== "number" && typeof forumPostId !== "string") throw new TypeError("Invalid pending BUR forum post ID");
			return {
				forumPostId: forumPostId ?? null,
				id,
				script
			};
		});
	};
	var getArtistTagName = () => {
		const text = document.querySelector(".tag-type-1.heading.text-xl")?.textContent.trim();
		return text ? text.replaceAll(/\s+/g, "_") : null;
	};
	var createCopyButton = (tagName) => {
		const button = document.createElement("button");
		button.className = "artist-copy-btn";
		button.textContent = "copy";
		button.title = `Copy artist name: ${tagName}`;
		const copyArtistName = async () => {
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
		};
		button.addEventListener("click", (event) => {
			event.preventDefault();
			copyArtistName();
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
			if (href?.startsWith("/wiki_pages/") && href !== "/wiki_pages/help:tag_aliases") {
				const newHref = `/bulk_update_requests?commit=search[status]=approved&search[tags_include_any]=${href.replace("/wiki_pages/", "")}`;
				link.setAttribute("href", newHref);
			}
		}
	};
	var fetchPendingBulkUpdateRequests = async (tagName) => {
		const { origin } = location;
		const url = `${origin}/bulk_update_requests.json?search[status]=pending&search[tags_include_any]=${tagName}`;
		try {
			const response = await fetch(url);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			return parsePendingBulkUpdateRequests(await response.json());
		} catch (error) {
			console.error("Failed to fetch pending BURs:", error);
			return [];
		}
	};
	var getBulkUpdateRequestScriptLines = (script) => script.split(/\r?\n/).filter((line) => line.trim());
	var artistTagPairPattern = /^(\s*)((?:(?:create|remove)\s+)?alias|rename)(\s+)(\S+)(\s+->\s+)(\S+)(\s*)$/;
	var createArtistTagLink = (tagName) => {
		const link = document.createElement("a");
		link.className = "wiki-link artist-tag-link";
		link.href = `${location.origin}/artists/show_or_new?${new URLSearchParams({ name: tagName })}`;
		link.textContent = tagName;
		return link;
	};
	var createArtistTagNode = (tagName, currentTagName) => tagName === currentTagName ? document.createTextNode(tagName) : createArtistTagLink(tagName);
	var createBulkUpdateRequestScriptCode = (line, currentTagName) => {
		const code = document.createElement("code");
		const match = line.match(artistTagPairPattern);
		if (!match) {
			code.textContent = line;
			return code;
		}
		const [, leadingSpacing, command, commandSpacing, sourceTag, arrowSpacing, targetTag, trailingSpacing] = match;
		code.append(`${leadingSpacing}${command}${commandSpacing}`, createArtistTagNode(sourceTag, currentTagName), arrowSpacing, createArtistTagNode(targetTag, currentTagName), trailingSpacing);
		return code;
	};
	var renderPendingBulkUpdateRequests = (requests, currentTagName) => {
		document.querySelector("#pending-bur-section")?.remove();
		if (requests.length === 0) return;
		const { origin } = location;
		const section = document.createElement("div");
		section.id = "pending-bur-section";
		for (const request of requests) {
			const pendingBur = document.createElement("div");
			pendingBur.className = "fineprint pending-bur";
			const header = document.createElement("div");
			header.className = "pending-bur-header";
			const icon = document.createElement("span");
			icon.setAttribute("aria-hidden", "true");
			icon.textContent = "⏳";
			const burLink = document.createElement("a");
			burLink.className = "wiki-link";
			burLink.href = `${origin}/bulk_update_requests/${request.id}`;
			burLink.textContent = `BUR #${request.id}`;
			header.append(icon, " Pending ", burLink);
			if (request.forumPostId) {
				const forumLink = document.createElement("a");
				forumLink.className = "wiki-link";
				forumLink.href = `${origin}/forum_posts/${request.forumPostId}`;
				forumLink.textContent = `forum #${request.forumPostId}`;
				header.append(" (", forumLink, ")");
			}
			pendingBur.append(header);
			const scriptLines = getBulkUpdateRequestScriptLines(request.script);
			if (scriptLines.length > 0) {
				const scriptList = document.createElement("ul");
				scriptList.className = "pending-bur-script";
				for (const line of scriptLines) {
					const listItem = document.createElement("li");
					listItem.append(createBulkUpdateRequestScriptCode(line, currentTagName));
					scriptList.append(listItem);
				}
				pendingBur.append(scriptList);
			}
			section.append(pendingBur);
		}
		const fineprintParagraphs = document.querySelectorAll("p.fineprint");
		(fineprintParagraphs.length > 0 ? fineprintParagraphs.item(fineprintParagraphs.length - 1) : document.querySelector("#view-artist-link")?.closest("p"))?.after(section);
	};
	var addPendingBulkUpdateRequests = async (tagName) => {
		renderPendingBulkUpdateRequests(await fetchPendingBulkUpdateRequests(tagName), tagName);
	};
	var addCopyButton = (tagName) => {
		if (document.querySelector(".artist-copy-btn")) return;
		document.querySelector(".flex.items-center.gap-2")?.append(createCopyButton(tagName));
	};
	var addCreateWikiLink = (tagName) => {
		if (document.querySelector("#view-wiki-link")) return;
		const editArtistLink = document.querySelector("#view-artist-link");
		if (!editArtistLink) return;
		const wikiLink = createWikiLinkElement(tagName);
		const separator = document.createTextNode(" | ");
		editArtistLink.before(wikiLink);
		editArtistLink.before(separator);
	};
	function initArtistPage() {
		const tagName = getArtistTagName();
		if (tagName) {
			addCopyButton(tagName);
			addCreateWikiLink(tagName);
		}
		replaceWikiLinksWithBulkUpdateRequests();
		if (tagName) addPendingBulkUpdateRequests(tagName);
	}
	var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
	var expectArray = (value, label) => {
		if (!Array.isArray(value)) throw new TypeError(`Invalid ${label} response: expected an array`);
		return value;
	};
	var parseTagAliases = (value) => expectArray(value, "tag aliases").map((item) => {
		if (!isRecord(item)) throw new TypeError("Invalid tag alias response item");
		const { antecedent_name: antecedentName, consequent_name: consequentName, status } = item;
		if (typeof antecedentName !== "string" || typeof consequentName !== "string" || typeof status !== "string") throw new TypeError("Invalid tag alias fields");
		return {
			antecedentName,
			consequentName,
			status
		};
	});
	var parseArtists = (value) => expectArray(value, "artists").map((item) => {
		if (!isRecord(item) || typeof item.name !== "string" || typeof item.is_deleted !== "boolean") throw new TypeError("Invalid artist response item");
		return {
			isDeleted: item.is_deleted,
			name: item.name
		};
	});
	var parseArtistVersions = (value) => expectArray(value, "artist versions").map((item) => {
		if (!isRecord(item) || typeof item.name !== "string") throw new TypeError("Invalid artist version response item");
		return { name: item.name };
	});
	var parsePosts = (value) => expectArray(value, "posts").map((item) => {
		if (!isRecord(item)) throw new TypeError("Invalid post response item");
		const { tag_string_artist: artistTags } = item;
		if (artistTags !== void 0 && artistTags !== null && typeof artistTags !== "string") throw new TypeError("Invalid post artist tags");
		return { artistTags: artistTags ?? "" };
	});
	var fetchArtistUnrecognizedHostnames = async (artistId) => {
		const { origin } = location;
		const url = `${origin}/artists/${artistId}`;
		try {
			const response = await fetch(url);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const html = await response.text();
			const doc = new DOMParser().parseFromString(html, "text/html");
			const hostnameSet = new Set();
			for (const listItem of doc.querySelectorAll("li")) if (listItem.querySelector(".globe-icon")) for (const anchor of listItem.querySelectorAll("a[href]")) {
				const href = anchor.getAttribute("href");
				if (href) hostnameSet.add(new URL(href).hostname);
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
		for (const listItem of document.querySelectorAll("#artist-versions-table .urls-column li")) if (listItem.classList.contains("changed")) for (const span of listItem.querySelectorAll("span.removed, span.added")) prependGlobeIfUnrecognized(span, hostnameSet);
		else prependGlobeIfUnrecognized(listItem, hostnameSet, { inside: true });
	};
	var fetchTagAliases = async (antecedentName) => {
		const { origin } = location;
		const url = `${origin}/tag_aliases.json?${new URLSearchParams({ "search[antecedent_name_matches]": antecedentName })}`;
		const response = await fetch(url);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return parseTagAliases(await response.json());
	};
	var hasActiveTagAlias = (aliases, antecedentName, consequentName) => aliases.some((alias) => alias.status === "active" && alias.antecedentName === antecedentName && alias.consequentName === consequentName);
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
		return parseArtists(await response.json());
	};
	var hasActiveArtistEntry = async (name) => {
		return (await fetchActiveArtistByName(name)).some((artist) => artist.name === name && !artist.isDeleted);
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
		document.querySelector("h1")?.before(section);
	};
	var checkUnmigratedPostsOnRename = async (artistId) => {
		const rows = document.querySelectorAll("#artist-versions-table tbody tr");
		if (rows.length < 2) return;
		let renameIndex = -1;
		for (const [index, row] of rows.entries()) if (row.querySelector(".name-column")?.querySelector("b")) {
			renameIndex = index;
			break;
		}
		if (renameIndex === -1) return;
		const { origin } = location;
		const url = `${origin}/artist_versions.json?search[artist_id]=${artistId}`;
		try {
			const response = await fetch(url);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const versions = parseArtistVersions(await response.json());
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
			if (parsePosts(await postsResponse.json()).some((post) => post.artistTags.split(/\s+/).includes(oldName))) renderUnmigratedPostsWarning(oldName);
		} catch (error) {
			console.error("Failed to check unmigrated posts:", error);
		}
	};
	async function initArtistVersionsPage(artistId) {
		const unrecognizedHostnames = fetchArtistUnrecognizedHostnames(artistId);
		checkUnmigratedPostsOnRename(artistId);
		highlightUnrecognizedHostnamesInVersions(await unrecognizedHostnames);
	}
	var otherNamesAttributesToCopy = [
		"name",
		"id",
		"placeholder",
		"required"
	];
	var normalizeOtherNamesValue = (value) => value.replaceAll(/\s+/g, " ").trim();
	var getOtherNamesLines = (value) => value.trim().split(/\s+/).filter(Boolean);
	var isOtherNamesTextarea = (field) => field.tagName === "TEXTAREA";
	var copyOtherNamesAttributes = (from, to) => {
		for (const attributeName of otherNamesAttributesToCopy) {
			const value = from.getAttribute(attributeName);
			if (value !== null) to.setAttribute(attributeName, value);
		}
	};
	var normalizeOtherNamesField = (field) => {
		if (field && isOtherNamesTextarea(field)) field.value = normalizeOtherNamesValue(field.value);
	};
	var createOtherNamesInput = (current) => {
		const input = document.createElement("input");
		copyOtherNamesAttributes(current, input);
		input.type = "text";
		input.className = "w-full max-w-360px string optional iac-autocomplete";
		input.value = normalizeOtherNamesValue(current.value);
		return input;
	};
	var createOtherNamesTextarea = (current, form) => {
		const textarea = document.createElement("textarea");
		copyOtherNamesAttributes(current, textarea);
		textarea.className = "text optional iac-autocomplete";
		const lines = getOtherNamesLines(current.value);
		textarea.value = lines.join("\n");
		textarea.rows = Math.min(20, Math.max(4, lines.length + 1));
		textarea.addEventListener("keydown", (event) => {
			if (!((event.ctrlKey || event.metaKey) && event.key === "Enter")) return;
			event.preventDefault();
			form?.requestSubmit();
		});
		return textarea;
	};
	function initOtherNamesEditor() {
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
		button.addEventListener("click", (event) => {
			event.preventDefault();
			const current = wrapper.querySelector("#artist_other_names_string");
			if (!current) {
				console.warn("Other names field not found inside wrapper.");
				button.disabled = true;
				return;
			}
			const isTextarea = isOtherNamesTextarea(current);
			const nextField = isTextarea ? createOtherNamesInput(current) : createOtherNamesTextarea(current, form);
			current.replaceWith(nextField);
			button.textContent = isTextarea ? "expand" : "collapse";
		});
		form?.addEventListener("submit", () => {
			normalizeOtherNamesField(wrapper.querySelector("#artist_other_names_string"));
		}, { capture: true });
	}
	var style_default = ".artist-copy-btn,\n.other-names-toggle-btn {\n  font-size: var(--text-sm);\n  color: white;\n  cursor: pointer;\n  background-color: var(--link-color);\n  border: none;\n  transition: background-color 0.2s;\n}\n\n.artist-copy-btn:hover,\n.other-names-toggle-btn:hover {\n  background-color: var(--link-hover-color) !important;\n}\n\n.artist-copy-btn.copied {\n  background-color: var(--success-color);\n}\n\n#pending-bur-section {\n  display: grid;\n  gap: 0.5rem;\n}\n\n#pending-bur-section .pending-bur {\n  padding-inline-start: 0.625rem;\n  border-inline-start: 0.2rem solid var(--warning-color);\n}\n\n#pending-bur-section .pending-bur-header {\n  color: var(--warning-color);\n}\n\n#pending-bur-section .pending-bur-script {\n  padding: 0;\n  margin: 0.25rem 0 0;\n  list-style: none;\n}\n\n#pending-bur-section .pending-bur-script li + li {\n  margin-top: 0.125rem;\n}\n\n#pending-bur-section .pending-bur-script code {\n  display: block;\n  overflow-wrap: anywhere;\n  white-space: pre-wrap;\n}\n\n.other-names-wrapper {\n  display: flex;\n  gap: 0.5rem;\n}\n\n.other-names-wrapper > #artist_other_names_string {\n  flex: 1;\n}\n\n.other-names-toggle-btn {\n  flex-shrink: 0;\n  max-height: 2.25em;\n  padding: 0 0.75rem;\n}\n\nform.simple_form div.input .hint {\n  padding-left: 0 !important;\n}\n";
	var addStyles = () => {
		const style = document.createElement("style");
		style.textContent = style_default;
		document.head.append(style);
	};
	var getArtistIdFromUrl = () => {
		return new URLSearchParams(location.search).get("search[artist_id]");
	};
	var init = () => {
		addStyles();
		if (location.pathname.startsWith("/artist_versions")) {
			const artistId = getArtistIdFromUrl();
			if (artistId) initArtistVersionsPage(artistId);
			return;
		}
		if (document.querySelector("#artist_other_names_string")) {
			initOtherNamesEditor();
			return;
		}
		initArtistPage();
	};
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
	else init();
})();
