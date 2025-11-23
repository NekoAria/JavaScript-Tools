// ==UserScript==
// @name         Danbooru Artist Tweaks
// @namespace    https://github.com/NekoAria/JavaScript-Tools
// @version      0.2.0
// @description  Add Create wiki link for artist pages without wiki page, copy artist name button, and replace wiki links with bulk update request links for tag aliases
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
        const newHref = `/bulk_update_requests?commit=Search&search[status]=approved&search[tags_include_any]=${tagName}`;
        link.setAttribute("href", newHref);
      }
    });
  };

  // Add styles for the copy button
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
  };

  // Execute after page loads
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
