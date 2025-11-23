// ==UserScript==
// @name         Universal Booru Image Comparator
// @namespace    https://github.com/NekoAria/JavaScript-Tools
// @version      1.1.6
// @description  Compare images on Danbooru / Yande.re / Konachan with multiple modes and transformations
// @author       Neko_Aria
// @match        *://*.donmai.us/iqdb_queries*
// @match        *://*.donmai.us/posts/*
// @match        *://*.donmai.us/uploads/*
// @match        https://konachan.com/post/show/*
// @match        https://konachan.com/post/similar*
// @match        https://yande.re/post/show/*
// @match        https://yande.re/post/similar*
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @resource     STYLE https://github.com/NekoAria/JavaScript-Tools/raw/refs/heads/main/userscripts/booru-image-comparator.css?t=202511231521
// @require      https://cdn.jsdelivr.net/npm/@panzoom/panzoom@4.6.0/dist/panzoom.min.js
// @downloadURL  https://github.com/NekoAria/JavaScript-Tools/raw/refs/heads/main/userscripts/booru-image-comparator.user.js
// @updateURL    https://github.com/NekoAria/JavaScript-Tools/raw/refs/heads/main/userscripts/booru-image-comparator.user.js
// ==/UserScript==

(function () {
  "use strict";

  // Configuration constants
  const DIVIDER_WIDTH = 4;
  const STORAGE_KEY = "universal_comparator_mode";

  const FILTER_COLORS = {
    black: "#000000",
    grey: "#808080",
    white: "#ffffff",
  };

  const MODES = {
    SIDE_BY_SIDE: "side-by-side",
    SLIDER: "slider",
    FADE: "fade",
    DIFFERENCE: "difference",
  };

  // Priority order for displaying related posts
  const RELATIONSHIP_PRIORITY = {
    Similar: 0,
    Parent: 1,
    Sibling: 2,
    Child: 3,
  };

  // Utility functions for DOM manipulation and validation
  const utils = {
    createElement: (tag, options = {}) => {
      const element = document.createElement(tag);
      if (options.id) {
        element.id = options.id;
      }
      if (options.className) {
        element.className = options.className;
      }
      if (options.innerHTML) {
        element.innerHTML = options.innerHTML;
      }
      if (options.textContent) {
        element.textContent = options.textContent;
      }
      return element;
    },

    isValidPage: () => {
      const { hostname, pathname } = window.location;
      if (hostname.endsWith(".donmai.us")) {
        return (
          /\/posts\/\d+/.test(location.href) ||
          /\/uploads\/\d+/.test(location.href) ||
          /\/iqdb_queries/.test(location.href)
        );
      }
      return /\/post\/(show|similar)/.test(pathname);
    },

    detectSiteFromHostname: (hostname) => {
      const siteMap = {
        "danbooru.donmai.us": "danbooru",
        "betabooru.donmai.us": "danbooru",
        "safebooru.donmai.us": "danbooru",
        "sonohara.donmai.us": "danbooru",
        "hijiribe.donmai.us": "danbooru",
        "yande.re": "yandere",
        "konachan.com": "konachan",
      };
      return siteMap[hostname] || null;
    },

    detectSite: () => {
      return utils.detectSiteFromHostname(window.location.hostname);
    },

    extractPostIdFromPath: (pathname) => {
      const match = pathname.match(/\/(?:show|similar)\/(\d+)/);
      return match ? match[1] : null;
    },

    isValidPostUrl: (url) => {
      return /https:\/\/(danbooru\.donmai\.us\/posts|yande\.re\/post\/show|konachan\.com\/post\/show)\/\d+/.test(
        url,
      );
    },

    extractPostIdFromUrl: (url) => {
      const match = url.match(/\/(?:posts|show)\/(\d+)/);
      return match ? match[1] : null;
    },
  };

  // Reactive state management with observer pattern
  const createReactiveState = (initialState) => {
    let state = { ...initialState };
    const listeners = new Set();

    return {
      get: () => ({ ...state }),
      update: (key, value) => {
        const oldState = { ...state };

        if (typeof key === "object") {
          state = { ...state, ...key };
        } else {
          state = { ...state, [key]: value };
        }

        if (JSON.stringify(oldState) !== JSON.stringify(state)) {
          listeners.forEach((listener) => listener(state, oldState));
        }
      },
      subscribe: (listener) => {
        if (typeof listener !== "function") {
          throw new Error("Listener must be a function");
        }
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  };

  // Updates slider when transforms or zoom state changes
  const sliderUpdater = {
    updateIfNeeded: (state) => {
      const { mode } = state.get();

      if (mode !== MODES.SLIDER) {
        return;
      }

      const sliderElement = document.querySelector("#comparison-slider");
      const rightImage = document.querySelector("#overlay-image");
      const container = document.querySelector("#comparison-overlay-container");

      if (sliderElement && rightImage && container) {
        const currentPosition = parseInt(sliderElement.style.left) || container.clientWidth / 2;
        slider.updateSlider(sliderElement, rightImage, currentPosition, container, state);
      }
    },
  };

  // Initialize application state based on current page and site
  const createAppState = () => {
    const site = utils.detectSite();
    const { pathname, search } = window.location;

    // Determine page-specific configuration
    const pageState = (() => {
      if (site === "danbooru") {
        const isUpload = pathname.startsWith("/uploads");
        const isIqdb = pathname.startsWith("/iqdb_queries");
        const urlParams = new URLSearchParams(search);

        return {
          isUpload,
          isIqdb,
          postId: isIqdb
            ? urlParams.get("post_id") ||
              document.querySelector("#search_post_id")?.getAttribute("value")?.trim()
            : document.querySelector('meta[name="post-id"]')?.getAttribute("content"),
          searchUrl: isIqdb
            ? urlParams.get("url") ||
              document.querySelector("#search_url")?.getAttribute("value")?.trim()
            : null,
        };
      } else {
        const isSimilar = /\/post\/similar/.test(pathname);
        const urlParams = new URLSearchParams(search);

        return {
          isSimilar,
          postId: utils.extractPostIdFromPath(pathname),
          searchUrl: isSimilar
            ? decodeURIComponent(urlParams.get("url") || "") ||
              document.querySelector("#url")?.getAttribute("value")?.trim()
            : null,
        };
      }
    })();

    const reactiveState = createReactiveState({
      site,
      ...pageState,
      mode: MODES.SIDE_BY_SIDE,
      transforms: {
        left: { flipH: false, flipV: false, rotation: 0 },
        right: { flipH: false, flipV: false, rotation: 0 },
      },
      zoomState: { scale: 1, x: 0, y: 0 },
      panzoomInstances: {},
      eventCleanup: [],
      originalImageUrl: null,
    });

    // Auto-update slider when relevant state changes
    reactiveState.subscribe((newState, oldState) => {
      const needsSliderUpdate =
        newState.mode === MODES.SLIDER &&
        (JSON.stringify(newState.transforms) !== JSON.stringify(oldState.transforms) ||
          (newState.mode !== oldState.mode && newState.mode === MODES.SLIDER) ||
          JSON.stringify(newState.zoomState) !== JSON.stringify(oldState.zoomState));

      if (needsSliderUpdate) {
        setTimeout(() => sliderUpdater.updateIfNeeded(reactiveState), 0);
      }
    });

    return reactiveState;
  };

  // Handle image URL resolution for different sites and contexts
  const imageUrlResolver = {
    getOriginalImageUrl: (state) => {
      const { site, isUpload, isIqdb, isSimilar, searchUrl } = state.get();

      if (site === "danbooru") {
        if (isUpload) {
          return document.querySelector(".media-asset-image")?.getAttribute("src");
        }
        if (isIqdb) {
          return searchUrl;
        }
        return (
          document.querySelector(".image-view-original-link")?.getAttribute("href") ||
          document.querySelector("#image")?.getAttribute("src")
        );
      } else {
        if (isSimilar) {
          return searchUrl;
        }
        return document.querySelector("a#highres")?.getAttribute("href");
      }
    },

    extractImageUrl: (data, site = "danbooru") => {
      return site === "danbooru"
        ? data.file_url || data.large_file_url
        : data.file_url || data.jpeg_url;
    },
  };

  // DOM manipulation for adding compare links and navigation elements
  const dom = {
    addCompareLinks: (state) => {
      const selector = dom.getPostsSelector(state.get());
      if (!selector) {
        return;
      }

      document.querySelectorAll(selector).forEach((post) => {
        const postId = dom.extractPostIdFromArticle(post);
        if (postId && postId !== state.get().postId && !post.querySelector(".compare-link")) {
          const link = dom.createCompareLink(postId, state);
          dom.insertCompareLink(post, link);
        }
      });
    },

    getPostsSelector: ({ site }) => {
      return site === "danbooru"
        ? ".posts-container .post-preview, .iqdb-posts .post-preview"
        : "#post-list-posts li";
    },

    extractPostIdFromArticle: (article) => {
      let postId = article.getAttribute("data-id");
      if (!postId) {
        const thumbLink = article.querySelector("a.thumb");
        const match = thumbLink?.getAttribute("href")?.match(/\/(?:post\/show|posts)\/(\d+)/);
        postId = match ? match[1] : null;
      }
      return postId;
    },

    createCompareLink: (postId, state) => {
      const { site } = state.get();
      const container = utils.createElement("div", {
        className: site === "danbooru" ? "text-xs text-center mt-1" : "",
      });

      if (site !== "danbooru") {
        container.style.cssText = "text-align: center; margin-top: 10px;";
      }

      const link = utils.createElement("a", {
        className: "compare-link",
        textContent: "compare »",
      });

      link.href = "#";
      link.onclick = (e) => {
        e.preventDefault();
        comparatorUI.open(postId, state);
      };

      container.appendChild(link);
      return container;
    },

    insertCompareLink: (article, link) => {
      const scoreElement = article.querySelector(".post-preview-score");
      if (scoreElement) {
        article.insertBefore(link, scoreElement);
      } else {
        article.appendChild(link);
      }
    },

    addMainMenuLink: (state) => {
      const { site } = state.get();

      const mainMenu =
        document.querySelector("#main-menu > ul") || document.querySelector("#main-menu");

      if (!mainMenu || mainMenu.querySelector("#nav-compare")) {
        return;
      }

      const link = utils.createElement("a", { id: "nav-compare", textContent: "Compare" });

      link.href = "#";
      link.onclick = (e) => {
        e.preventDefault();
        comparatorUI.open(null, state);
      };

      if (document.querySelector(".px-3")) {
        link.className = "py-1.5 px-3";
      }

      if (site === "danbooru") {
        mainMenu.appendChild(link);
      } else {
        const menuItem = utils.createElement("li");
        menuItem.appendChild(link);
        mainMenu.appendChild(menuItem);
      }
    },
  };

  // Retrieve related posts from different sources and contexts
  const relatedPosts = {
    getRelatedPosts: async (state) => {
      const { site } = state.get();
      return site === "danbooru"
        ? relatedPosts.getDanbooruRelatedPosts(state)
        : relatedPosts.getYandereKonachanRelatedPosts(state);
    },

    getDanbooruRelatedPosts: (state) => {
      const { isIqdb, isUpload } = state.get();
      if (isIqdb || isUpload) {
        return relatedPosts.getDanbooruSimilarPosts(state);
      }

      const posts = [];
      relatedPosts.extractFromPreviews(posts, state);
      relatedPosts.extractFromNotices(posts, state);
      return posts;
    },

    getDanbooruSimilarPosts: (state) => {
      const { postId } = state.get();
      const posts = [];
      const articles = document.querySelectorAll(".iqdb-posts .post-preview");

      articles.forEach((article) => {
        const articlePostId = article.getAttribute("data-id");
        if (!articlePostId || articlePostId === postId) {
          return;
        }

        const similarity = relatedPosts.extractSimilarity(article);
        posts.push({
          id: articlePostId,
          relationshipType: "Similar",
          similarity,
        });
      });

      return posts;
    },

    extractSimilarity: (article) => {
      const similarityElement = article.querySelector(".iqdb-similarity-score");
      if (!similarityElement) {
        return null;
      }

      const match = similarityElement.textContent.match(/(\d+)%\s*similar/);
      return match ? parseInt(match[1]) : null;
    },

    extractFromPreviews: (posts, state) => {
      const { postId } = state.get();
      const previews = [
        { selector: "#has-parent-relationship-preview", isParent: true },
        { selector: "#has-children-relationship-preview", isParent: false },
      ];

      previews.forEach(({ selector, isParent }) => {
        const preview = document.querySelector(selector);
        if (!preview) {
          return;
        }

        const articles = preview.querySelectorAll(".post-preview");
        articles.forEach((article) => {
          relatedPosts.processArticle(article, posts, postId, isParent);
        });
      });
    },

    processArticle: (article, posts, postId, isParent) => {
      const articlePostId = article.getAttribute("data-id");
      const imgElement = article.querySelector(".post-preview-image");

      if (
        !articlePostId ||
        !imgElement ||
        articlePostId === postId ||
        posts.some((post) => post.id === articlePostId)
      ) {
        return;
      }

      const relationshipType = relatedPosts.getRelationshipType(article, isParent);
      posts.push({ id: articlePostId, relationshipType });
    },

    getRelationshipType: (article, isParentPreview) => {
      if (!isParentPreview) {
        return "Child";
      }

      const parentId = document.body.getAttribute("data-post-parent-id");
      const articleId = article.getAttribute("data-id");
      return articleId === parentId ? "Parent" : "Sibling";
    },

    extractFromNotices: (posts) => {
      const notice = document.querySelector(".post-notice-parent, .post-notice-child");
      if (!notice) {
        return;
      }

      const links = notice.querySelectorAll("a[href*='parent:'], a[href*='child:']");
      links.forEach((link) => {
        const href = link.getAttribute("href");
        const postIdMatch = href.match(/[?&]tags=[^&]*[:%](\d+)/);
        const postId = postIdMatch ? postIdMatch[1] : null;

        if (postId && !posts.some((post) => post.id === postId)) {
          posts.push({
            id: postId,
            relationshipType: href.includes("parent:") ? "Parent" : "Child",
          });
        }
      });
    },

    getYandereKonachanRelatedPosts: async (state) => {
      const { isSimilar } = state.get();
      if (isSimilar) {
        return relatedPosts.getYandereKonachanSimilarPosts();
      }

      const posts = [];
      try {
        const { postId } = state.get();
        if (postId) {
          await relatedPosts.fetchParentSiblings(posts, state);
          await relatedPosts.fetchChildren(posts, state);
        }
      } catch (error) {
        console.warn("Failed to fetch related posts:", error);
      }

      return relatedPosts.sortPostsByRelationship(posts);
    },

    getYandereKonachanSimilarPosts: () => {
      const articles = document.querySelectorAll("#post-list-posts li");
      const posts = [];

      articles.forEach((article) => {
        const postId = dom.extractPostIdFromArticle(article);
        if (postId) {
          const sourceImg = article.querySelector(".similar-text img[alt]");
          const sourceHost = sourceImg?.alt;

          posts.push({
            id: postId,
            relationshipType: "Similar",
            sourceHost: sourceHost,
          });
        }
      });

      return posts;
    },

    fetchParentSiblings: async (posts, state) => {
      const { postId } = state.get();
      const response = await api.fetchPostData(`id:${postId}`, state);
      if (!response?.length) {
        return;
      }

      const currentPost = response.find((p) => p.id.toString() === postId);
      if (!currentPost?.parent_id) {
        return;
      }

      const endpoint = `/post.json?tags=parent:${currentPost.parent_id}`;
      const siblings = await fetch(`https://${document.location.hostname}${endpoint}`).then((res) =>
        res.json(),
      );

      if (siblings) {
        siblings.forEach((post) => {
          const relationshipType = post.id === currentPost.parent_id ? "Parent" : "Sibling";
          relatedPosts.addPostToList(post, posts, relationshipType, postId);
        });
      }
    },

    fetchChildren: async (posts, state) => {
      const { postId } = state.get();
      const children = await api.fetchPostData(`parent:${postId}`, state);
      if (children) {
        children.forEach((post) => relatedPosts.addPostToList(post, posts, "Child", postId));
      }
    },

    addPostToList: (post, posts, relationshipType, currentPostId) => {
      if (post.id.toString() !== currentPostId) {
        posts.push({
          id: post.id.toString(),
          relationshipType,
        });
      }
    },

    sortPostsByRelationship: (posts) => {
      return posts.sort((a, b) => {
        const priorityA = RELATIONSHIP_PRIORITY[a.relationshipType] || 5;
        const priorityB = RELATIONSHIP_PRIORITY[b.relationshipType] || 5;

        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        return parseInt(a.id) - parseInt(b.id);
      });
    },
  };

  // API calls for fetching post data from different booru sites
  const api = {
    fetchPostData: async (query, state, sourceHost = null) => {
      try {
        const { site } = state.get();
        let endpoint, targetHost;

        if (sourceHost && sourceHost !== document.location.hostname) {
          const sourceSite = utils.detectSiteFromHostname(sourceHost);
          targetHost = sourceHost;
          endpoint =
            sourceSite === "danbooru" ? `/posts/${query}.json` : `/post.json?tags=${query}`;
        } else {
          targetHost = document.location.hostname;
          endpoint = site === "danbooru" ? `/posts/${query}.json` : `/post.json?tags=${query}`;
        }

        const data = await fetch(`https://${targetHost}${endpoint}`).then((res) => res.json());
        return Array.isArray(data) ? data : [data];
      } catch (error) {
        console.warn("Failed to fetch post data:", error);
        return null;
      }
    },

    fetchSinglePost: async (postId, state, sourceHost = null) => {
      const { site } = state.get();
      const targetHost = sourceHost || document.location.hostname;
      const sourceSite = sourceHost ? utils.detectSiteFromHostname(sourceHost) : site;

      const endpoint =
        sourceSite === "danbooru" ? `/posts/${postId}.json` : `/post.json?tags=id:${postId}`;
      const data = await fetch(`https://${targetHost}${endpoint}`).then((res) => res.json());
      return Array.isArray(data) ? data[0] : data;
    },
  };

  // Generate HTML for the comparison interface
  const htmlGenerator = {
    generateInterfaceHTML: (state) => {
      const { originalImageUrl } = state.get();
      const currentLabel = htmlGenerator.getCurrentLabel(state);
      const leftImageSrc = originalImageUrl || "";

      return `
    <div id="comparison-header">
      ${htmlGenerator.getHeaderHTML(currentLabel)}
      ${htmlGenerator.getModeControlsHTML()}
    </div>
    ${htmlGenerator.getComparisonContentHTML(leftImageSrc, state)}
  `;
    },

    getHeaderHTML: (currentLabel) => {
      return `
    <div class="header-section header-row primary-controls">
      <span>Current: ${currentLabel}</span>
      <input id="second-image-input" type="text" placeholder="Enter ID or URL" />
      <button id="load-comparison" class="control-btn">Load</button>
      <span class="mode-label">Mode:</span>
      <select id="comparison-mode">
        <option value="side-by-side">Side by Side</option>
        <option value="slider">Slider</option>
        <option value="fade">Fade</option>
        <option value="difference">Difference</option>
      </select>
      <div id="post-info-display"></div>
      <div class="right-controls">
        <button id="swap-images" class="control-btn">Swap</button>
        <button id="reset-zoom" class="control-btn">Reset Zoom</button>
        <button id="close-comparison" class="control-btn">✕</button>
      </div>
    </div>
  `;
    },

    getModeControlsHTML: () => {
      return `
    <div id="all-controls-row" class="header-section mode-control-section">
      ${htmlGenerator.getTransformControlsHTML()}
      ${htmlGenerator.getFilterControlsHTML()}
      ${htmlGenerator.getFadeControlsHTML()}
      ${htmlGenerator.getDifferenceControlsHTML()}
    </div>
  `;
    },

    getTransformControlsHTML: () => {
      return `
    <div id="transform-controls">
      <button id="flip-h-left" class="control-btn" title="Flip Left Horizontally">↔️ L</button>
      <button id="flip-v-left" class="control-btn" title="Flip Left Vertically">↕️ L</button>
      <button id="rotate-left" class="control-btn" title="Rotate Left">🔄 L</button>
      <button id="flip-h-right" class="control-btn" title="Flip Right Horizontally">↔️ R</button>
      <button id="flip-v-right" class="control-btn" title="Flip Right Vertically">↕️ R</button>
      <button id="rotate-right" class="control-btn" title="Rotate Right">🔄 R</button>
      <button id="reset-transform" class="control-btn" title="Reset Transforms">Reset</button>
    </div>
  `;
    },

    getFilterControlsHTML: () => {
      return `
    <div id="filter-controls">
      <label>Brightness: <input type="range" id="brightness-slider" min="0" max="100" value="1"></label>
      <span id="brightness-value">1</span>
      <label>Saturate: <input type="range" id="saturate-slider" min="0" max="100" value="1"></label>
      <span id="saturate-value">1</span>
      <button id="reset-filters" class="control-btn">Reset Filters</button>
    </div>
  `;
    },

    getFadeControlsHTML: () => {
      return `
    <div id="fade-controls">
      <label>Opacity: <input type="range" id="opacity-slider" min="0" max="100" value="50"></label>
      <span id="opacity-value">50%</span>
    </div>
  `;
    },

    getDifferenceControlsHTML: () => {
      return `
    <div id="difference-controls">
      <label>Background:
        <select id="difference-background">
          <option value="black">Black</option>
          <option value="grey">Grey</option>
          <option value="white">White</option>
        </select>
      </label>
      <button id="invert-difference" class="control-btn">Invert</button>
    </div>
  `;
    },

    getComparisonContentHTML: (leftImageSrc, state) => {
      const leftImageId = htmlGenerator.getCurrentImageId(state);

      return `
    <div id="comparison-content">
      <div class="comparison-side" id="left-side">
        <div class="sync-pan" id="left-pan">
          <img id="left-image" src="${leftImageSrc}" data-id="${leftImageId}" alt="Left Image" />
        </div>
      </div>
      <div id="comparison-divider"></div>
      <div class="comparison-side" id="right-side">
        <div class="sync-pan" id="right-pan">
          <img id="right-image" alt="Right Image" />
        </div>
      </div>
      <div id="comparison-overlay-container">
        <div class="sync-pan" id="overlay-pan"></div>
      </div>
    </div>
  `;
    },

    getCurrentLabel: (state) => {
      const { site, isIqdb, isUpload, isSimilar, postId } = state.get();

      if (site === "danbooru") {
        if (isIqdb) {
          return postId ? `Post #${postId}` : "IQDB";
        }
        if (isUpload) {
          return "Upload";
        }
        return postId ? `Post #${postId}` : "Custom";
      }

      if (isSimilar) {
        return postId ? `Post #${postId}` : "Similar";
      }
      return postId ? `Post #${postId}` : "Custom";
    },

    getCurrentImageId: (state) => {
      const { site, isIqdb, isUpload, isSimilar, postId } = state.get();

      if (site === "danbooru") {
        if (isIqdb) {
          return postId || "iqdb";
        }
        if (isUpload) {
          return "upload";
        }
      } else if (isSimilar) {
        return "similar";
      }

      return postId || "unknown";
    },
  };

  // Event binding and management for user interactions
  const events = {
    bind: (state) => {
      const cleanup = [];

      // Primary control events
      const controlEvents = [
        ["close-comparison", () => comparatorUI.close(state)],
        ["load-comparison", () => imageLoader.handleLoadImage(state)],
        ["swap-images", () => imageActions.swapImages(state)],
        ["comparison-mode", () => modes.onModeChange(state), "change"],
        ["reset-zoom", () => zoom.reset(state)],
      ];

      controlEvents.forEach(([id, handler, event = "click"]) => {
        const element = document.querySelector(`#${id}`);
        if (element) {
          element.addEventListener(event, handler);
          cleanup.push(() => element.removeEventListener(event, handler));
        }
      });

      // Transform control events
      const transformEvents = [
        ["flip-h-left", () => transforms.toggle("left", "flipH", state)],
        ["flip-v-left", () => transforms.toggle("left", "flipV", state)],
        ["rotate-left", () => transforms.rotate("left", state)],
        ["flip-h-right", () => transforms.toggle("right", "flipH", state)],
        ["flip-v-right", () => transforms.toggle("right", "flipV", state)],
        ["rotate-right", () => transforms.rotate("right", state)],
        ["reset-transform", () => transforms.reset(state)],
      ];

      transformEvents.forEach(([id, handler]) => {
        const element = document.querySelector(`#${id}`);
        if (element) {
          element.addEventListener("click", handler);
          cleanup.push(() => element.removeEventListener("click", handler));
        }
      });

      // Input enter key handler
      const input = document.querySelector("#second-image-input");
      if (input) {
        const keyHandler = (e) => e.key === "Enter" && imageLoader.handleLoadImage(state);
        input.addEventListener("keypress", keyHandler);
        cleanup.push(() => input.removeEventListener("keypress", keyHandler));
      }

      events.bindModeEvents(cleanup);

      // ESC key to close
      const escHandler = (e) => e.key === "Escape" && comparatorUI.close(state);
      document.addEventListener("keydown", escHandler, true);
      cleanup.push(() => document.removeEventListener("keydown", escHandler, true));

      state.update("eventCleanup", cleanup);
    },

    bindModeEvents: (cleanup) => {
      // Opacity slider for fade mode
      const opacitySlider = document.querySelector("#opacity-slider");
      if (opacitySlider) {
        const handler = () => effects.updateOpacity();
        opacitySlider.addEventListener("input", handler);
        cleanup.push(() => opacitySlider.removeEventListener("input", handler));
      }

      // Filter controls
      const brightnessSlider = document.querySelector("#brightness-slider");
      const saturateSlider = document.querySelector("#saturate-slider");

      if (brightnessSlider) {
        const handler = () => effects.updateFilters();
        brightnessSlider.addEventListener("input", handler);
        cleanup.push(() => brightnessSlider.removeEventListener("input", handler));
      }

      if (saturateSlider) {
        const handler = () => effects.updateFilters();
        saturateSlider.addEventListener("input", handler);
        cleanup.push(() => saturateSlider.removeEventListener("input", handler));
      }

      // Difference mode controls
      const differenceBackground = document.querySelector("#difference-background");
      if (differenceBackground) {
        const handler = () => effects.updateDifferenceBackground();
        differenceBackground.addEventListener("change", handler);
        cleanup.push(() => differenceBackground.removeEventListener("change", handler));
      }

      const invertDifference = document.querySelector("#invert-difference");
      if (invertDifference) {
        const handler = () => effects.toggleDifferenceInvert();
        invertDifference.addEventListener("click", handler);
        cleanup.push(() => invertDifference.removeEventListener("click", handler));
      }

      const resetFilters = document.querySelector("#reset-filters");
      if (resetFilters) {
        const handler = () => effects.resetFilters();
        resetFilters.addEventListener("click", handler);
        cleanup.push(() => resetFilters.removeEventListener("click", handler));
      }
    },
  };

  // Image loading and URL handling
  const imageLoader = {
    handleLoadImage: (state) => {
      const input = document.querySelector("#second-image-input");
      if (!input) {
        return;
      }

      const inputValue = input.value.trim();
      if (!inputValue) {
        alert("Please enter a valid post ID or URL");
        return;
      }
      imageLoader.loadImage(inputValue, state);
    },

    loadImage: (input, state) => {
      imageLoader.clearRightImage();

      if (/^\d+$/.test(input)) {
        imageLoader.loadPostById(input, state);
      } else if (utils.isValidPostUrl(input)) {
        const postId = utils.extractPostIdFromUrl(input);
        if (postId) {
          imageLoader.loadPostById(postId, state);
        } else {
          alert("Could not extract post ID from URL");
        }
      } else {
        imageLoader.loadDirectUrl(input, state);
      }
    },

    loadPostById: async (postId, state) => {
      try {
        const posts = await relatedPosts.getRelatedPosts(state);
        const postData = posts.find((p) => p.id === postId);

        let data;
        if (postData?.sourceHost && postData.sourceHost !== document.location.hostname) {
          data = await api.fetchSinglePost(postId, state, postData.sourceHost);
        } else {
          data = await api.fetchSinglePost(postId, state);
        }

        const rightImage = document.querySelector("#right-image");
        if (!rightImage) {
          return;
        }

        const sourceSite = utils.detectSiteFromHostname(postData?.sourceHost) || state.get().site;
        const imageUrl = imageUrlResolver.extractImageUrl(data, sourceSite);
        rightImage.src = imageUrl;
        rightImage.setAttribute("data-id", postId);

        imageLoader.displayLoadedImage(imageUrl, postId, state);
      } catch (error) {
        alert(`Failed to load post: ${error.message}`);
      }
    },

    loadDirectUrl: (url, state) => {
      try {
        new URL(url); // Validate URL

        const rightImage = document.querySelector("#right-image");
        if (!rightImage) {
          return;
        }

        rightImage.onerror = () => {
          alert(`Failed to load image: ${url}`);
          rightImage.onerror = null;
          imageLoader.clearRightImage();
        };

        rightImage.onload = () => {
          rightImage.setAttribute("data-id", "custom");
          imageLoader.displayLoadedImage(url, "custom", state);
          rightImage.onload = null;
        };

        rightImage.src = url;
      } catch {
        alert("Invalid URL format");
      }
    },

    displayLoadedImage: (imageUrl, postId, state) => {
      const overlayImage = document.querySelector("#overlay-image");
      if (overlayImage) {
        overlayImage.src = imageUrl;
        overlayImage.style.display = "block";
      }

      ui.updateUI(postId);
      zoom.reset(state);
      modes.update(state);
    },

    clearRightImage: () => {
      const rightImage = document.querySelector("#right-image");
      const overlayImage = document.querySelector("#overlay-image");

      if (rightImage) {
        rightImage.src = "";
        rightImage.removeAttribute("data-id");
      }

      if (overlayImage) {
        overlayImage.src = "";
        overlayImage.style.display = "none";
      }

      ui.updatePostInfo();
    },

    loadSearchImage: async (state) => {
      try {
        const leftImage = document.querySelector("#left-image");
        if (!leftImage) {
          return;
        }

        const { postId, isSimilar, searchUrl } = state.get();

        if (postId) {
          const data = await api.fetchSinglePost(postId, state);
          leftImage.src = imageUrlResolver.extractImageUrl(data);
          leftImage.setAttribute("data-id", postId);
        } else if (isSimilar && searchUrl) {
          leftImage.src = searchUrl;
          leftImage.setAttribute("data-id", "similar");
        }

        ui.updatePostInfo();
      } catch (error) {
        console.warn(`Failed to load search image: ${error.message}`);
      }
    },
  };

  // Image operations like swapping
  const imageActions = {
    swapImages: (state) => {
      const leftImg = document.querySelector("#left-image");
      const rightImg = document.querySelector("#right-image");

      if (!leftImg || !rightImg) {
        return;
      }

      // Swap sources and IDs
      [leftImg.src, rightImg.src] = [rightImg.src, leftImg.src];

      const leftId = leftImg.getAttribute("data-id");
      const rightId = rightImg.getAttribute("data-id");
      leftImg.setAttribute("data-id", rightId);
      rightImg.setAttribute("data-id", leftId);

      // Swap transforms
      const currentState = state.get();
      const newTransforms = {
        left: currentState.transforms.right,
        right: currentState.transforms.left,
      };

      state.update("transforms", newTransforms);
      ui.updatePostInfo();

      // Update display based on current mode
      if (currentState.mode !== MODES.SIDE_BY_SIDE) {
        modes.update(state);
      } else {
        transforms.apply(state);
      }
    },
  };

  // Transform controls for flipping and rotating images
  const transforms = {
    toggle: (side, type, state) => {
      const currentState = state.get();
      const newTransforms = { ...currentState.transforms };
      newTransforms[side] = { ...newTransforms[side] };
      newTransforms[side][type] = !newTransforms[side][type];
      state.update("transforms", newTransforms);
      transforms.apply(state);
    },

    rotate: (side, state) => {
      const currentState = state.get();
      const newTransforms = { ...currentState.transforms };
      newTransforms[side] = { ...newTransforms[side] };
      newTransforms[side].rotation = (newTransforms[side].rotation + 90) % 360;
      state.update("transforms", newTransforms);
      transforms.apply(state);
    },

    reset: (state) => {
      const newTransforms = {
        left: { flipH: false, flipV: false, rotation: 0 },
        right: { flipH: false, flipV: false, rotation: 0 },
      };
      state.update("transforms", newTransforms);
      transforms.apply(state);
    },

    apply: (state) => {
      const { transforms: currentTransforms } = state.get();
      const imageMap = {
        left: ["left-image", "overlay-left-image", "slider-left-image"],
        right: ["right-image", "overlay-image", "slider-right-image"],
      };

      // Clear all transform classes
      Object.values(imageMap)
        .flat()
        .forEach((id) => {
          const img = document.querySelector(`#${id}`);
          if (img) {
            img.classList.remove("flip-h", "flip-v", "rotate-90", "rotate-180", "rotate-270");
          }
        });

      // Apply transforms
      Object.entries(imageMap).forEach(([side, imageIds]) => {
        imageIds.forEach((id) => {
          const img = document.querySelector(`#${id}`);
          if (img) {
            transforms.applyToElement(img, currentTransforms[side]);
          }
        });
      });
    },

    applyToElement: (element, transformState) => {
      if (transformState.flipH) {
        element.classList.add("flip-h");
      }
      if (transformState.flipV) {
        element.classList.add("flip-v");
      }

      const rotationClasses = {
        90: "rotate-90",
        180: "rotate-180",
        270: "rotate-270",
      };

      const rotationClass = rotationClasses[transformState.rotation];
      if (rotationClass) {
        element.classList.add(rotationClass);
      }
    },
  };

  // Comparison mode management and switching
  const modes = {
    restoreMode: (state) => {
      const savedMode = modes.getSavedMode();
      state.update("mode", savedMode);
      const modeSelect = document.querySelector("#comparison-mode");
      if (modeSelect) {
        modeSelect.value = savedMode;
      }
    },

    getSavedMode: () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        return Object.values(MODES).includes(saved) ? saved : MODES.SIDE_BY_SIDE;
      } catch {
        return MODES.SIDE_BY_SIDE;
      }
    },

    saveMode: () => {
      try {
        const modeSelect = document.querySelector("#comparison-mode");
        if (modeSelect) {
          localStorage.setItem(STORAGE_KEY, modeSelect.value);
        }
      } catch (e) {
        console.warn("Failed to save mode:", e);
      }
    },

    onModeChange: (state) => {
      modes.update(state);
      modes.saveMode();
    },

    update: (state) => {
      zoom.saveZoomState(state);
      modes.cleanupModeElements(state);
      modes.cleanupWheelListeners();

      const modeSelect = document.querySelector("#comparison-mode");
      if (!modeSelect) {
        return;
      }

      const newMode = modeSelect.value;
      const previousMode = state.get().mode;
      state.update("mode", newMode);

      // Calculate zoom transition if switching between overlay and non-overlay modes
      if (
        previousMode !== newMode &&
        modes.isOverlayMode(previousMode) !== modes.isOverlayMode(newMode)
      ) {
        zoom.calculateZoomTransition(previousMode, newMode, state);
      }

      modes.resetDisplay();
      modes.setupModeSpecificUI(newMode, state);

      setTimeout(() => transforms.apply(state), 0);
      setTimeout(() => {
        const container = document.querySelector("#image-comparison-container");
        if (container) {
          container.focus();
        }
      }, 0);
    },

    resetDisplay: () => {
      // Reset main elements
      ["left-side", "right-side", "comparison-divider"].forEach((id) => {
        const el = document.querySelector(`#${id}`);
        if (el) {
          el.style.display = id === "comparison-divider" ? "block" : "flex";
        }
      });

      // Reset overlay container
      const overlayContainer = document.querySelector("#comparison-overlay-container");
      if (overlayContainer) {
        overlayContainer.innerHTML = '<div class="sync-pan" id="overlay-pan"></div>';
        overlayContainer.style.display = "none";
        overlayContainer.style.backgroundColor = "";
        overlayContainer.classList.remove("difference-inverted");
      }

      // Reset overlay image
      const overlayImage = document.querySelector("#overlay-image");
      if (overlayImage) {
        overlayImage.style.clipPath = "";
        overlayImage.style.mixBlendMode = "";
        overlayImage.style.opacity = "";
      }

      // Reset control display
      ["fade-controls", "difference-controls"].forEach((id) => {
        const el = document.querySelector(`#${id}`);
        if (el) {
          el.style.display = "none";
        }
      });

      const filterControls = document.querySelector("#filter-controls");
      if (filterControls) {
        filterControls.style.display = "flex";
      }
    },

    setupModeSpecificUI: (mode, state) => {
      switch (mode) {
        case MODES.SLIDER:
          modes.setupSliderMode(state);
          break;
        case MODES.FADE:
          modes.setupFadeMode(state);
          break;
        case MODES.DIFFERENCE:
          modes.setupDifferenceMode(state);
          break;
        default:
          setTimeout(() => zoom.restoreZoomState(state), 100);
          break;
      }
    },

    setupSliderMode: (state) => {
      modes.hideMainElements();
      modes.showOverlay();
      modes.createOverlayImages();
      zoom.initOverlayPanZoom(state);
      setTimeout(() => slider.init(state), 0);
    },

    setupFadeMode: (state) => {
      modes.hideMainElements();
      modes.showOverlay();
      modes.createOverlayImages();
      zoom.initOverlayPanZoom(state);

      const overlayImage = document.querySelector("#overlay-image");
      if (overlayImage?.src?.trim()) {
        overlayImage.style.opacity = "0.5";
        overlayImage.style.display = "block";
      }

      const fadeControls = document.querySelector("#fade-controls");
      if (fadeControls) {
        fadeControls.style.display = "flex";
      }
    },

    setupDifferenceMode: (state) => {
      modes.hideMainElements();
      modes.showOverlay();
      modes.createOverlayImages();
      zoom.initOverlayPanZoom(state);

      const overlayImage = document.querySelector("#overlay-image");
      if (overlayImage?.src?.trim()) {
        overlayImage.style.mixBlendMode = "difference";
        overlayImage.style.opacity = "1";
        overlayImage.style.display = "block";
      }

      const overlayContainer = document.querySelector("#comparison-overlay-container");
      if (overlayContainer) {
        overlayContainer.style.backgroundColor = FILTER_COLORS.black;
      }

      const differenceControls = document.querySelector("#difference-controls");
      if (differenceControls) {
        differenceControls.style.display = "flex";
      }

      const backgroundSelect = document.querySelector("#difference-background");
      if (backgroundSelect) {
        backgroundSelect.value = "black";
      }
    },

    hideMainElements: () => {
      ["left-side", "right-side", "comparison-divider"].forEach((id) => {
        const el = document.querySelector(`#${id}`);
        if (el) {
          el.style.display = "none";
        }
      });
    },

    showOverlay: () => {
      const overlay = document.querySelector("#comparison-overlay-container");
      if (overlay) {
        overlay.style.display = "block";
      }
    },

    createOverlayImages: () => {
      const container = document.querySelector("#overlay-pan");
      if (!container) {
        return;
      }

      const leftImage = document.querySelector("#left-image");
      const rightImage = document.querySelector("#right-image");

      if (!leftImage || !rightImage) {
        return;
      }

      const overlayStyle =
        "position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; margin: auto;";

      // Create left image clone
      const leftClone = leftImage.cloneNode(true);
      leftClone.id = "overlay-left-image";
      leftClone.style.cssText = overlayStyle;
      container.appendChild(leftClone);

      // Create right image clone
      const rightClone = rightImage.src?.trim()
        ? rightImage.cloneNode(true)
        : utils.createElement("img");

      rightClone.id = "overlay-image";
      rightClone.style.cssText = `${overlayStyle} ${
        rightImage.src?.trim() ? "" : "display: none;"
      }`;
      container.appendChild(rightClone);
    },

    isOverlayMode: (mode) => {
      return [MODES.SLIDER, MODES.FADE, MODES.DIFFERENCE].includes(mode);
    },

    cleanupModeElements: (state) => {
      const currentState = state.get();
      if (currentState.panzoomInstances.overlay) {
        currentState.panzoomInstances.overlay.destroy();
        currentState.panzoomInstances.overlay = null;
        state.update("panzoomInstances", currentState.panzoomInstances);
      }
    },

    cleanupWheelListeners: () => {
      ["left-side", "right-side", "comparison-overlay-container"].forEach((id) => {
        const element = document.querySelector(`#${id}`);
        if (element && element._wheelListener) {
          element.removeEventListener("wheel", element._wheelListener);
          delete element._wheelListener;
        }
      });
    },
  };

  // Slider mode implementation with interactive dragging
  const slider = {
    init: (state) => {
      const container = document.querySelector("#comparison-overlay-container");
      const rightImage = document.querySelector("#overlay-image");

      if (!container || !rightImage?.src?.trim()) {
        return;
      }

      let sliderElement = document.querySelector("#comparison-slider");
      if (!sliderElement) {
        sliderElement = utils.createElement("div", { id: "comparison-slider" });
        container.appendChild(sliderElement);
      }

      const centerX = container.clientWidth / 2;
      slider.updateSlider(sliderElement, rightImage, centerX, container, state);
      slider.bindEvents(sliderElement, rightImage, container, state);
    },

    updateSlider: (sliderElement, rightImage, containerX, container, state) => {
      const containerWidth = container.clientWidth;
      const newContainerX = Math.max(0, Math.min(containerX, containerWidth));

      sliderElement.style.left = `${newContainerX}px`;

      const currentState = state.get();
      const panzoomInstance = currentState.panzoomInstances.overlay;
      const isRightFlippedH = currentState.transforms.right.flipH;

      if (panzoomInstance) {
        const scale = panzoomInstance.getScale();
        const imageRect = rightImage.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const relativeX = containerX - (imageRect.left - containerRect.left);
        const imageCoordX = relativeX / scale;
        const clipValue = Math.max(0, imageCoordX);

        if (isRightFlippedH) {
          rightImage.style.clipPath = `inset(0 ${clipValue}px 0 0)`;
        } else {
          rightImage.style.clipPath = `inset(0 0 0 ${clipValue}px)`;
        }
      } else if (isRightFlippedH) {
        rightImage.style.clipPath = `inset(0 ${containerX}px 0 0)`;
      } else {
        rightImage.style.clipPath = `inset(0 0 0 ${containerX}px)`;
      }
    },

    bindEvents: (sliderElement, rightImage, container, state) => {
      let isDragging = false;

      const updatePosition = (e) => {
        const containerX = e.clientX - container.getBoundingClientRect().left;
        slider.updateSlider(sliderElement, rightImage, containerX, container, state);
      };

      const handlers = {
        mouseDown: (e) => {
          e.preventDefault();
          isDragging = true;
        },
        mouseMove: (e) => {
          if (isDragging) {
            updatePosition(e);
          }
        },
        containerMouseDown: (e) => {
          if (e.target !== sliderElement) {
            updatePosition(e);
            isDragging = true;
          }
        },
        mouseUp: () => {
          isDragging = false;
        },
        panzoomChange: () => {
          const currentPosition = parseInt(sliderElement.style.left) || container.clientWidth / 2;
          slider.updateSlider(sliderElement, rightImage, currentPosition, container, state);
        },
      };

      // Bind events
      sliderElement.addEventListener("mousedown", handlers.mouseDown);
      container.addEventListener("mousemove", handlers.mouseMove);
      container.addEventListener("mousedown", handlers.containerMouseDown);
      document.addEventListener("mouseup", handlers.mouseUp);

      // Bind panzoom events
      const overlayPan = document.querySelector("#overlay-pan");
      const currentState = state.get();
      if (overlayPan && currentState.panzoomInstances.overlay) {
        ["panzoomchange", "panzoomzoom", "panzoompan"].forEach((event) => {
          overlayPan.addEventListener(event, handlers.panzoomChange);
        });
      }

      // Add to cleanup list
      const cleanup = state.get().eventCleanup;
      cleanup.push(
        () => sliderElement.removeEventListener("mousedown", handlers.mouseDown),
        () => container.removeEventListener("mousemove", handlers.mouseMove),
        () => container.removeEventListener("mousedown", handlers.containerMouseDown),
        () => document.removeEventListener("mouseup", handlers.mouseUp),
      );

      if (overlayPan) {
        ["panzoomchange", "panzoomzoom", "panzoompan"].forEach((event) => {
          cleanup.push(() => overlayPan.removeEventListener(event, handlers.panzoomChange));
        });
      }

      state.update("eventCleanup", cleanup);
    },
  };

  // Visual effects controls for fade and difference modes
  const effects = {
    updateOpacity: () => {
      const slider = document.querySelector("#opacity-slider");
      const overlayImage = document.querySelector("#overlay-image");
      const opacityValue = document.querySelector("#opacity-value");

      if (slider && overlayImage && opacityValue) {
        overlayImage.style.opacity = slider.value / 100;
        opacityValue.textContent = `${slider.value}%`;
      }
    },

    updateFilters: () => {
      const brightnessSlider = document.querySelector("#brightness-slider");
      const saturateSlider = document.querySelector("#saturate-slider");
      const brightnessValue = document.querySelector("#brightness-value");
      const saturateValue = document.querySelector("#saturate-value");

      if (!brightnessSlider || !saturateSlider || !brightnessValue || !saturateValue) {
        return;
      }

      const brightness = brightnessSlider.value;
      const saturate = saturateSlider.value;

      brightnessValue.textContent = brightness;
      saturateValue.textContent = saturate;

      const overlayPan = document.querySelector("#overlay-pan");
      if (overlayPan) {
        overlayPan.style.filter = `brightness(${brightness}) saturate(${saturate})`;
      }
    },

    resetFilters: () => {
      const brightnessSlider = document.querySelector("#brightness-slider");
      const saturateSlider = document.querySelector("#saturate-slider");

      if (brightnessSlider) {
        brightnessSlider.value = 1;
      }
      if (saturateSlider) {
        saturateSlider.value = 1;
      }

      effects.updateFilters();
    },

    updateDifferenceBackground: () => {
      const backgroundSelect = document.querySelector("#difference-background");
      const overlayContainer = document.querySelector("#comparison-overlay-container");

      if (backgroundSelect && overlayContainer) {
        const background = backgroundSelect.value;
        overlayContainer.style.backgroundColor = FILTER_COLORS[background] || FILTER_COLORS.black;
      }
    },

    toggleDifferenceInvert: () => {
      const container = document.querySelector("#comparison-overlay-container");
      const button = document.querySelector("#invert-difference");

      if (!container || !button) {
        return;
      }

      if (container.classList.contains("difference-inverted")) {
        container.classList.remove("difference-inverted");
        button.textContent = "Invert";
      } else {
        container.classList.add("difference-inverted");
        button.textContent = "Normal";
      }
    },
  };

  // Zoom and pan functionality with synchronized movement
  const zoom = {
    init: (state) => {
      const leftPan = document.querySelector("#left-pan");
      const rightPan = document.querySelector("#right-pan");

      if (!leftPan || !rightPan) {
        return;
      }

      // Destroy existing instances
      const currentState = state.get();
      if (currentState.panzoomInstances.left) {
        currentState.panzoomInstances.left.destroy();
      }
      if (currentState.panzoomInstances.right) {
        currentState.panzoomInstances.right.destroy();
      }

      // Create new instances
      const options = { maxScale: Infinity };
      const newInstances = {
        ...currentState.panzoomInstances,
        left: Panzoom(leftPan, options),
        right: Panzoom(rightPan, options),
      };

      state.update("panzoomInstances", newInstances);

      setTimeout(() => zoom.restoreZoomState(state), 0);

      zoom.syncPanZoom(state);
      zoom.bindEvents(state);
    },

    syncPanZoom: (state) => {
      const leftPan = document.querySelector("#left-pan");
      const rightPan = document.querySelector("#right-pan");
      const currentState = state.get();
      const leftPanzoom = currentState.panzoomInstances.left;
      const rightPanzoom = currentState.panzoomInstances.right;

      if (!leftPan || !rightPan || !leftPanzoom || !rightPanzoom) {
        return;
      }

      let isUpdating = false;

      const createSyncHandler = (targetPanzoom) => (event) => {
        if (isUpdating) {
          return;
        }

        isUpdating = true;
        const { x, y, scale } = event.detail;
        targetPanzoom.zoom(scale, { animate: false, silent: true });
        targetPanzoom.pan(x, y, { animate: false, silent: true });
        isUpdating = false;
      };

      const leftHandler = createSyncHandler(rightPanzoom);
      const rightHandler = createSyncHandler(leftPanzoom);

      leftPan.addEventListener("panzoomchange", leftHandler);
      rightPan.addEventListener("panzoomchange", rightHandler);

      const cleanup = state.get().eventCleanup;
      cleanup.push(
        () => leftPan.removeEventListener("panzoomchange", leftHandler),
        () => rightPan.removeEventListener("panzoomchange", rightHandler),
      );
      state.update("eventCleanup", cleanup);
    },

    bindEvents: (state) => {
      const leftSide = document.querySelector("#left-side");
      const rightSide = document.querySelector("#right-side");

      if (!leftSide || !rightSide) {
        return;
      }

      const currentState = state.get();
      const createWheelHandler = (panzoom) => (event) => {
        event.preventDefault();
        panzoom.zoomWithWheel(event);
      };

      const leftWheelHandler = createWheelHandler(currentState.panzoomInstances.left);
      const rightWheelHandler = createWheelHandler(currentState.panzoomInstances.right);

      leftSide.addEventListener("wheel", leftWheelHandler);
      rightSide.addEventListener("wheel", rightWheelHandler);

      const cleanup = state.get().eventCleanup;
      cleanup.push(
        () => leftSide.removeEventListener("wheel", leftWheelHandler),
        () => rightSide.removeEventListener("wheel", rightWheelHandler),
      );
      state.update("eventCleanup", cleanup);
    },

    initOverlayPanZoom: (state) => {
      const overlayPan = document.querySelector("#overlay-pan");
      const overlayContainer = document.querySelector("#comparison-overlay-container");

      if (!overlayPan || !overlayContainer) {
        return;
      }

      const currentState = state.get();
      const newInstances = {
        ...currentState.panzoomInstances,
        overlay: Panzoom(overlayPan, { maxScale: Infinity }),
      };

      state.update("panzoomInstances", newInstances);

      const { zoomState } = currentState;
      if (zoomState) {
        newInstances.overlay.zoom(zoomState.scale, {
          animate: false,
          silent: true,
        });
        newInstances.overlay.pan(zoomState.x, zoomState.y, {
          animate: false,
          silent: true,
        });
      }

      // Clean up old wheel listeners
      if (overlayContainer._wheelListener) {
        overlayContainer.removeEventListener("wheel", overlayContainer._wheelListener);
        delete overlayContainer._wheelListener;
      }

      const wheelHandler = (event) => {
        event.preventDefault();
        newInstances.overlay.zoomWithWheel(event);
      };

      overlayContainer._wheelListener = wheelHandler;
      overlayContainer.addEventListener("wheel", wheelHandler);
    },

    reset: (state) => {
      const currentState = state.get();
      Object.values(currentState.panzoomInstances).forEach((instance) => {
        if (instance) {
          instance.reset();
        }
      });
    },

    saveZoomState: (state) => {
      const currentState = state.get();
      const activeInstance = zoom.getActivePanzoomInstance(currentState);
      if (activeInstance) {
        const pan = activeInstance.getPan();
        const newZoomState = {
          scale: activeInstance.getScale(),
          x: pan.x,
          y: pan.y,
          mode: currentState.mode,
        };
        state.update("zoomState", newZoomState);
      }
    },

    restoreZoomState: (state) => {
      const currentState = state.get();
      Object.values(currentState.panzoomInstances).forEach((instance) => {
        if (instance) {
          instance.zoom(currentState.zoomState.scale, {
            animate: false,
            silent: true,
          });
          instance.pan(currentState.zoomState.x, currentState.zoomState.y, {
            animate: false,
            silent: true,
          });
        }
      });
    },

    getActivePanzoomInstance: (currentState) => {
      return (
        currentState.panzoomInstances.overlay ||
        currentState.panzoomInstances.left ||
        currentState.panzoomInstances.right
      );
    },

    calculateZoomTransition: (fromMode, toMode, state) => {
      const currentState = state.get();
      if (!currentState.zoomState) {
        return;
      }

      const isFromOverlay = modes.isOverlayMode(fromMode);
      const isToOverlay = modes.isOverlayMode(toMode);

      if (isFromOverlay === isToOverlay) {
        return;
      }

      const referenceImg = document.querySelector("#left-image");
      const comparisonContent = document.querySelector("#comparison-content");

      if (!referenceImg || !comparisonContent || !referenceImg.naturalWidth) {
        return;
      }

      const contentWidth = comparisonContent.clientWidth;
      const contentHeight = comparisonContent.clientHeight;
      const sideWidth = (contentWidth - DIVIDER_WIDTH) / 2;

      const sideBySideHeight = zoom.calculateImageDisplayHeight(
        referenceImg,
        sideWidth,
        contentHeight,
      );
      const overlayHeight = zoom.calculateImageDisplayHeight(
        referenceImg,
        contentWidth,
        contentHeight,
      );

      let heightRatio = 1;

      if (!isFromOverlay && isToOverlay) {
        heightRatio = sideBySideHeight / overlayHeight;
      } else if (isFromOverlay && !isToOverlay) {
        heightRatio = overlayHeight / sideBySideHeight;
      }

      if (heightRatio !== 1) {
        const newZoomState = {
          ...currentState.zoomState,
          scale: Math.max(0.1, currentState.zoomState.scale * heightRatio),
          y: currentState.zoomState.y * heightRatio,
        };
        state.update("zoomState", newZoomState);
      }
    },

    calculateImageDisplayHeight: (img, containerWidth, containerHeight) => {
      if (!img?.naturalWidth || !img?.naturalHeight) {
        return containerHeight;
      }

      const imageAspect = img.naturalWidth / img.naturalHeight;
      const containerAspect = containerWidth / containerHeight;

      return imageAspect > containerAspect ? containerWidth / imageAspect : containerHeight;
    },
  };

  // UI update helpers
  const ui = {
    updateUI: (postId) => {
      ui.updatePostInfo();

      const input = document.querySelector("#second-image-input");
      if (input) {
        input.value = postId === "custom" ? "" : postId;
      }

      const selector = document.querySelector(".post-selector select");
      if (selector && postId !== "custom") {
        selector.value = postId;
      }
    },

    updatePostInfo: () => {
      const leftImg = document.querySelector("#left-image");
      const rightImg = document.querySelector("#right-image");
      const infoDisplay = document.querySelector("#post-info-display");

      if (!leftImg || !rightImg || !infoDisplay) {
        return;
      }

      const leftId = leftImg.getAttribute("data-id");
      const rightId = rightImg.getAttribute("data-id");

      let display = "";
      if (leftId && rightId) {
        const leftLabel = ui.getImageLabel(leftId);
        const rightLabel = rightId === "custom" ? "Custom" : `#${rightId}`;
        display = `Compare: ${leftLabel} vs ${rightLabel}`;
      }

      infoDisplay.textContent = display;
    },

    getImageLabel: (imageId) => {
      const labels = {
        iqdb: "IQDB",
        upload: "Upload",
        similar: "Similar",
      };
      return labels[imageId] || `#${imageId}`;
    },
  };

  // Post selector dropdown for related posts
  const postSelector = {
    create: async (state) => {
      const posts = await relatedPosts.getRelatedPosts(state);
      if (posts.length === 0) {
        return;
      }

      const input = document.querySelector("#second-image-input");
      const selector = postSelector.build(posts, state);
      input.parentElement.insertBefore(selector, input);
    },

    build: (posts, state) => {
      const container = utils.createElement("div", {
        className: "post-selector",
      });
      const label = utils.createElement("span", {
        textContent: postSelector.getSelectorLabel(state),
      });
      const select = utils.createElement("select");

      postSelector.populate(select, posts);
      postSelector.bindEvents(select, state);

      container.append(label, select);
      return container;
    },

    getSelectorLabel: (state) => {
      const { isIqdb, isSimilar, isUpload } = state.get();
      return isIqdb || isSimilar || isUpload ? "Similar: " : "Related: ";
    },

    populate: (select, posts) => {
      select.appendChild(new Option("-- Select post --", ""));

      const currentRightImageId = postSelector.getCurrentRightImageId();

      posts.forEach((post) => {
        const text = postSelector.formatPostOptionText(post);
        const option = new Option(text, post.id);
        select.appendChild(option);
      });

      if (currentRightImageId && postSelector.isPostInList(currentRightImageId, posts)) {
        select.value = currentRightImageId;
      }
    },

    formatPostOptionText: (post) => {
      let text = `#${post.id}`;

      if (post.similarity) {
        text += ` (${post.similarity}%)`;
      } else if (post.relationshipType && post.relationshipType !== "Similar") {
        text += ` (${post.relationshipType})`;
      }

      if (post.sourceHost) {
        const sourceSite = utils.detectSiteFromHostname(post.sourceHost);
        if (sourceSite) {
          text += ` [${sourceSite}]`;
        }
      }

      return text;
    },

    bindEvents: (select, state) => {
      select.onchange = () => {
        const selectedId = select.value;
        if (selectedId) {
          document.querySelector("#second-image-input").value = selectedId;
          imageLoader.handleLoadImage(state);
        }
      };
    },

    getCurrentRightImageId: () => {
      return document.querySelector("#right-image")?.getAttribute("data-id");
    },

    isPostInList: (postId, posts) => {
      return posts.some((post) => post.id === postId);
    },
  };

  // Main comparator interface management
  const comparatorUI = {
    open: async (postId, state) => {
      const container = utils.createElement("div", {
        id: "image-comparison-container",
        innerHTML: htmlGenerator.generateInterfaceHTML(state),
      });

      container.setAttribute("tabindex", "0");
      container.style.outline = "none";
      document.body.appendChild(container);

      await comparatorUI.setup(state);

      if (postId) {
        setTimeout(() => imageLoader.loadImage(postId, state), 100);
      }
    },

    setup: async (state) => {
      await postSelector.create(state);
      events.bind(state);
      zoom.init(state);
      modes.restoreMode(state);

      const { isIqdb, isSimilar, postId, originalImageUrl } = state.get();
      if ((isIqdb && postId && !originalImageUrl) || (isSimilar && postId)) {
        await imageLoader.loadSearchImage(state);
      }

      modes.update(state);
    },

    close: (state) => {
      transforms.reset(state);
      comparatorUI.destroyPanZoom(state);
      comparatorUI.cleanupEvents(state);

      const container = document.querySelector("#image-comparison-container");
      if (container) {
        document.body.removeChild(container);
      }
    },

    cleanupEvents: (state) => {
      const cleanup = state.get().eventCleanup;
      cleanup.forEach((fn) => fn());
      state.update("eventCleanup", []);
    },

    destroyPanZoom: (state) => {
      const currentState = state.get();
      Object.values(currentState.panzoomInstances).forEach((instance) => {
        if (instance) {
          instance.destroy();
        }
      });
      state.update("panzoomInstances", {});
    },
  };

  // Initialize the application
  const init = () => {
    if (!utils.isValidPage()) {
      return;
    }

    GM_addStyle(GM_getResourceText("STYLE"));

    const state = createAppState();

    // Set original image URL
    const originalImageUrl = imageUrlResolver.getOriginalImageUrl(state);
    state.update("originalImageUrl", originalImageUrl);

    // Add compare links and navigation
    dom.addCompareLinks(state);
    dom.addMainMenuLink(state);

    // Observe DOM changes for dynamic content
    const observer = new MutationObserver(() => dom.addCompareLinks(state));
    observer.observe(document.body, { childList: true, subtree: true });
  };

  // Start the application
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
