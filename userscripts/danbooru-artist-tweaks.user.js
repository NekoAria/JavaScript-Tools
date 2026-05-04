// ==UserScript==
// @name         Danbooru Artist Tweaks
// @namespace    https://github.com/NekoAria/JavaScript-Tools
// @version      1.0.1
// @author       Neko_Aria
// @description  Add Create wiki link for artist pages without wiki page, copy artist name button, replace wiki links with bulk update request links for tag aliases, show pending BURs, highlight unrecognized external hostnames in artist versions, and warn about unmigrated posts on artist rename
// @downloadURL  https://github.com/NekoAria/JavaScript-Tools/raw/refs/heads/main/userscripts/danbooru-artist-tweaks.user.js
// @updateURL    https://github.com/NekoAria/JavaScript-Tools/raw/refs/heads/main/userscripts/danbooru-artist-tweaks.user.js
// @match        *://*.donmai.us/artists/*
// @match        *://*.donmai.us/artist_versions*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const getArtistTagName = () => {
    const tagElement = document.querySelector(".tag-type-1.heading.text-xl");
    if (tagElement) {
      return tagElement.textContent.trim().replaceAll(/\s+/g, "_");
    }
    return null;
  };
  const createCopyButton = (tagName) => {
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
  const createWikiLinkElement = (tagName) => {
    const { hostname } = globalThis.location;
    const link = document.createElement("a");
    link.id = "create-wiki-link";
    link.href = `https://${hostname}/wiki_pages/new?wiki_page[title]=${tagName}`;
    link.textContent = "Create wiki";
    return link;
  };
  const replaceWikiLinksWithBulkUpdateRequests = () => {
    const fineprintLinks = document.querySelectorAll("p.fineprint a");
    for (const link of fineprintLinks) {
      const href = link.getAttribute("href");
      if (href && href.startsWith("/wiki_pages/") && href !== "/wiki_pages/help:tag_aliases") {
        const tagName = href.replace("/wiki_pages/", "");
        const newHref = `/bulk_update_requests?commit=search[status]=approved&search[tags_include_any]=${tagName}`;
        link.setAttribute("href", newHref);
      }
    }
  };
  const fetchPendingBURs = async (tagName) => {
    const { origin } = globalThis.location;
    const url = `${origin}/bulk_update_requests.json?search[status]=pending&search[tags_include_any]=${tagName}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Failed to fetch pending BURs:", error);
      return [];
    }
  };
  const renderPendingBURs = (burs) => {
    document.querySelector("#pending-bur-section")?.remove();
    if (burs.length === 0) {
      return;
    }
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
    const insertAfter = fineprintParagraphs.length > 0 ? fineprintParagraphs.at(-1) : document.querySelector("#view-artist-link")?.closest("p");
    insertAfter?.insertAdjacentElement("afterend", section);
  };
  const addPendingBURs = async (tagName) => {
    const burs = await fetchPendingBURs(tagName);
    renderPendingBURs(burs);
  };
  const addStyles = () => {
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
  const addCopyButton = () => {
    if (document.querySelector(".artist-copy-btn")) {
      return;
    }
    const tagName = getArtistTagName();
    const copyButton = createCopyButton(tagName);
    const artistContainer = document.querySelector(".flex.items-center.gap-2");
    artistContainer.append(copyButton);
  };
  const addCreateWikiLink = () => {
    const existingWikiLink = document.querySelector("#view-wiki-link");
    if (existingWikiLink) {
      return;
    }
    const editArtistLink = document.querySelector("#view-artist-link");
    const tagName = getArtistTagName();
    const wikiLink = createWikiLinkElement(tagName);
    const separator = document.createTextNode(" | ");
    editArtistLink.before(wikiLink);
    editArtistLink.before(separator);
  };
  const getArtistIdFromURL = () => {
    const params = new URLSearchParams(globalThis.location.search);
    return params.get("search[artist_id]");
  };
  const fetchArtistUnrecognizedHostnames = async (artistId) => {
    const { origin } = globalThis.location;
    const url = `${origin}/artists/${artistId}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const hostnameSet = new Set();
      for (const li of doc.querySelectorAll("li")) {
        if (li.querySelector(".globe-icon")) {
          for (const a of li.querySelectorAll("a[href]")) {
            const href = a.getAttribute("href");
            hostnameSet.add(new URL(href).hostname);
          }
        }
      }
      return hostnameSet;
    } catch (error) {
      console.error("Failed to fetch artist URLs:", error);
      return new Set();
    }
  };
  const prependGlobeIfUnrecognized = (element, hostnameSet, { inside = false } = {}) => {
    const urlText = element.textContent.trim().replace(/^-/, "");
    const { hostname } = new URL(urlText);
    if (!hostnameSet.has(hostname)) {
      return;
    }
    const markerText = "🌐 ";
    const existingText = inside ? element.firstChild?.textContent : element.previousSibling?.textContent;
    if (existingText === markerText) {
      return;
    }
    const markerNode = document.createTextNode(markerText);
    if (inside) {
      element.prepend(markerNode);
    } else {
      element.before(markerNode);
    }
  };
  const highlightUnrecognizedHostnamesInVersions = (hostnameSet) => {
    if (hostnameSet.size === 0) {
      return;
    }
    for (const li of document.querySelectorAll("#artist-versions-table .urls-column li")) {
      if (li.classList.contains("changed")) {
        for (const span of li.querySelectorAll("span.removed, span.added")) {
          prependGlobeIfUnrecognized(span, hostnameSet);
        }
      } else {
        prependGlobeIfUnrecognized(li, hostnameSet, { inside: true });
      }
    }
  };
  const checkUnmigratedPostsOnRename = async (artistId) => {
    const rows = document.querySelectorAll("#artist-versions-table tbody tr");
    if (rows.length < 2) {
      return;
    }
    const nameColumn = rows[0].querySelector(".name-column");
    if (!nameColumn || !nameColumn.querySelector("b")) {
      return;
    }
    const { origin } = globalThis.location;
    const url = `${origin}/artist_versions.json?search[artist_id]=${artistId}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const versions = await response.json();
      const oldName = versions[1].name;
      const postsUrl = `${origin}/posts.json?tags=${oldName}&limit=1`;
      const postsResponse = await fetch(postsUrl);
      if (!postsResponse.ok) {
        throw new Error(`HTTP ${postsResponse.status}`);
      }
      const posts = await postsResponse.json();
      const hasUnmigratedPosts = posts.some(
        (post) => post.tag_string_artist && post.tag_string_artist.includes(oldName)
      );
      if (hasUnmigratedPosts) {
        renderUnmigratedPostsWarning(oldName);
      }
    } catch (error) {
      console.error("Failed to check unmigrated posts:", error);
    }
  };
  const renderUnmigratedPostsWarning = (oldName) => {
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
    if (h1) {
      h1.before(section);
    }
  };
  const init = () => {
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
    if (tagName) {
      addPendingBURs(tagName);
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();