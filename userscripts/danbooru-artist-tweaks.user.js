// ==UserScript==
// @name         Danbooru Artist Tweaks
// @namespace    https://github.com/NekoAria/JavaScript-Tools
// @version      0.3.0
// @description  Add Create wiki link for artist pages without wiki page, copy artist name button, replace wiki links with bulk update request links for tag aliases, and show pending BURs
// @author       Neko_Aria
// @match        *://*.donmai.us/artists/*
// @grant        none
// @downloadURL  https://github.com/NekoAria/JavaScript-Tools/raw/refs/heads/main/userscripts/danbooru-artist-tweaks.user.js
// @updateURL    https://github.com/NekoAria/JavaScript-Tools/raw/refs/heads/main/userscripts/danbooru-artist-tweaks.user.js
// ==/UserScript==

(function () {
  "use strict";

  // Extract artist tag name from page
  const getArtistTagName = () => {
    const tagElement = document.querySelector(".tag-type-1.heading.text-xl");
    if (tagElement) {
      // Get text content and replace spaces with underscores
      return tagElement.textContent.trim().replace(/\s+/g, "_");
    }
    return null;
  };

  // Create copy button element
  const createCopyButton = (tagName) => {
    const button = document.createElement("button");
    button.className = "artist-copy-btn";
    button.textContent = "copy";
    button.title = `Copy artist name: ${tagName}`;

    button.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await navigator.clipboard.writeText(tagName);

        // Show "copied" feedback for 500ms
        const originalText = button.textContent;

        button.textContent = "copied!";
        button.classList.add("copied");

        setTimeout(() => {
          button.textContent = originalText;
          button.classList.remove("copied");
        }, 500);
      } catch (err) {
        console.error("Failed to copy artist name:", err);
      }
    });

    return button;
  };

  // Create Create wiki link element
  const createWikiLinkElement = (tagName) => {
    const { hostname } = window.location;
    const link = document.createElement("a");
    link.id = "create-wiki-link";
    link.href = `https://${hostname}/wiki_pages/new?wiki_page[title]=${tagName}`;
    link.textContent = "Create wiki";
    return link;
  };

  // Replace wiki links with bulk update request links for tag aliases
  const replaceWikiLinksWithBulkUpdateRequests = () => {
    const fineprintLinks = document.querySelectorAll("p.fineprint a");

    fineprintLinks.forEach((link) => {
      const href = link.getAttribute("href");
      if (href && href.startsWith("/wiki_pages/") && href !== "/wiki_pages/help:tag_aliases") {
        // Extract the tag name after /wiki_pages/
        const tagName = href.replace("/wiki_pages/", "");
        const newHref = `/bulk_update_requests?commit=search[status]=approved&search[tags_include_any]=${tagName}`;
        link.setAttribute("href", newHref);
      }
    });
  };

  // Fetch pending BURs for the given tag name
  const fetchPendingBURs = async (tagName) => {
    const { origin } = window.location;
    const url = `${origin}/bulk_update_requests.json?search[status]=pending&search[tags_include_any]=${tagName}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      console.error("Failed to fetch pending BURs:", err);
      return [];
    }
  };

  // Render pending BURs below existing fineprint paragraphs
  const renderPendingBURs = (burs) => {
    // Remove any previously rendered pending BUR section to avoid duplicates
    document.getElementById("pending-bur-section")?.remove();

    if (burs.length === 0) {
      return;
    }

    const { origin } = window.location;

    const section = document.createElement("div");
    section.id = "pending-bur-section";

    burs.forEach((bur) => {
      const p = document.createElement("p");
      p.className = "fineprint pending-bur";

      // BUR detail link
      const burLink = document.createElement("a");
      burLink.className = "wiki-link";
      burLink.href = `${origin}/bulk_update_requests/${bur.id}`;
      burLink.textContent = `BUR #${bur.id}`;

      // Forum post link (if available)
      const forumLink = bur.forum_post_id
        ? (() => {
            const a = document.createElement("a");
            a.className = "wiki-link";
            a.href = `${origin}/forum_posts/${bur.forum_post_id}`;
            a.textContent = `forum #${bur.forum_post_id}`;
            return a;
          })()
        : null;

      // Build: ⏳ Pending BUR #N: <script> (forum topic #N)
      p.appendChild(document.createTextNode("⏳ Pending "));
      p.appendChild(burLink);
      p.appendChild(document.createTextNode(`: ${bur.script}`));
      if (forumLink) {
        p.appendChild(document.createTextNode(" ("));
        p.appendChild(forumLink);
        p.appendChild(document.createTextNode(")"));
      }

      section.appendChild(p);
    });

    // Insert after the last fineprint paragraph, or after the artist info block
    const fineprintParagraphs = document.querySelectorAll("p.fineprint");
    const insertAfter =
      fineprintParagraphs.length > 0
        ? fineprintParagraphs[fineprintParagraphs.length - 1]
        : document.querySelector("#view-artist-link")?.closest("p");

    insertAfter?.insertAdjacentElement("afterend", section);
  };

  // Fetch and display pending BURs
  const addPendingBURs = async (tagName) => {
    const burs = await fetchPendingBURs(tagName);
    renderPendingBURs(burs);
  };

  // Add styles for the copy button and pending BURs
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
    document.head.appendChild(style);
  };

  // Add copy button to artist name section
  const addCopyButton = () => {
    // Check if copy button already exists
    if (document.querySelector(".artist-copy-btn")) {
      return;
    }

    const tagName = getArtistTagName();
    const copyButton = createCopyButton(tagName);
    const artistContainer = document.querySelector(".flex.items-center.gap-2");
    artistContainer.appendChild(copyButton);
  };

  // Main function to add Create wiki link
  const addCreateWikiLink = () => {
    // Check if Edit wiki link already exists
    const existingWikiLink = document.querySelector("#view-wiki-link");
    if (existingWikiLink) {
      return;
    }

    const editArtistLink = document.querySelector("#view-artist-link");
    const tagName = getArtistTagName();

    // Create and insert Create wiki link
    const wikiLink = createWikiLinkElement(tagName);
    const { parentElement } = editArtistLink;
    const separator = document.createTextNode(" | ");

    parentElement.insertBefore(wikiLink, editArtistLink);
    parentElement.insertBefore(separator, editArtistLink);
  };

  // Initialize the script
  const init = () => {
    addStyles();
    addCopyButton();
    addCreateWikiLink();
    replaceWikiLinksWithBulkUpdateRequests();

    const tagName = getArtistTagName();
    if (tagName) {
      addPendingBURs(tagName);
    }
  };

  // Execute after page loads
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
