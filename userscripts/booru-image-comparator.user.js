// ==UserScript==
// @name         Universal Booru Image Comparator
// @namespace    https://github.com/NekoAria/JavaScript-Tools
// @version      1.0.1
// @description  Compare images on Danbooru / Yande.re / Konachan with multiple modes and transformations
// @author       Neko_Aria
// @match        https://danbooru.donmai.us/posts/*
// @match        https://danbooru.donmai.us/uploads/*
// @match        https://danbooru.donmai.us/iqdb_queries*
// @match        https://yande.re/post/show/*
// @match        https://yande.re/post/similar*
// @match        https://konachan.com/post/show/*
// @match        https://konachan.com/post/similar*
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @resource     STYLE https://github.com/NekoAria/JavaScript-Tools/raw/refs/heads/main/userscripts/booru-image-comparator.css?t=202505260800
// @require      https://unpkg.com/@panzoom/panzoom@4.6.0/dist/panzoom.min.js
// @downloadURL  https://github.com/NekoAria/JavaScript-Tools/raw/refs/heads/main/userscripts/booru-image-comparator.user.js
// @updateURL    https://github.com/NekoAria/JavaScript-Tools/raw/refs/heads/main/userscripts/booru-image-comparator.user.js
// ==/UserScript==

(function () {
  "use strict";

  // Constants
  const COMPARISON_MODES = {
    SIDE_BY_SIDE: "side-by-side",
    SLIDER: "slider",
    FADE: "fade",
    DIFFERENCE: "difference",
  };

  const DIVIDER_WIDTH = 4;

  const FILTER_COLORS = {
    black: "#000000",
    grey: "#808080",
    white: "#ffffff",
  };

  const RELATIONSHIP_PRIORITY = {
    Similar: 0,
    Parent: 1,
    Sibling: 2,
    Child: 3,
  };

  const STORAGE_KEY = "universal_comparator_mode";

  const SITE_CONFIGS = {
    danbooru: {
      domain: "danbooru.donmai.us",
      selectors: {
        postId: 'meta[name="post-id"]',
        uploadImage: ".media-asset-image",
        originalLink: ".image-view-original-link",
        mainImage: "#image",
        relatedPosts: ".posts-container .post-preview",
        similarPosts: ".iqdb-posts .post-preview",
        parentPreview: "#has-parent-relationship-preview",
        childrenPreview: "#has-children-relationship-preview",
        mainMenu: "#main-menu",
      },
      apiEndpoint: (postId) => `/posts/${postId}.json`,
    },
    yandere: {
      domain: "yande.re",
      selectors: {
        highresLink: "a#highres",
        mainImage: "#image",
        mainMenu: "#main-menu > ul",
        urlInput: "#url",
        similarPosts: "#post-list-posts li:not(#psource)",
      },
      apiEndpoint: (tags) => `/post.json?tags=${tags}`,
    },
    konachan: {
      domain: "konachan.com",
      selectors: {
        highresLink: "a#highres",
        mainImage: "#image",
        mainMenu: "#main-menu > ul",
        urlInput: "#url",
        similarPosts: "#post-list-posts li:not(#psource)",
      },
      apiEndpoint: (tags) => `/post.json?tags=${tags}`,
    },
  };

  class BooruImageComparator {
    constructor() {
      if (!this.isValidPage()) {
        return;
      }

      GM_addStyle(GM_getResourceText("STYLE"));
      this.init();
    }

    // Initialization
    init() {
      this.initializeState();
      this.setupUI();
      this.observeChanges();
    }

    initializeState() {
      this.site = this.detectSite();
      this.config = SITE_CONFIGS[this.site];
      this.mode = null;

      this.initPageSpecificState();
      this.initTransforms();
      this.initZoomState();
      this.initEventCleanup();
    }

    initPageSpecificState() {
      const { pathname } = window.location;

      if (this.site === "danbooru") {
        this.isUpload = pathname.startsWith("/uploads");
        this.isIqdb = pathname.startsWith("/iqdb_queries");
        this.postId = this.getPostId();
        this.searchUrl = this.getSearchUrl();
      } else {
        this.isSimilar = /\/post\/similar/.test(pathname);
        this.postId = this.extractPostIdFromPath(pathname);
        this.searchUrl = this.isSimilar ? this.getCurrentSearchUrl() : null;
      }

      this.originalImageUrl = this.getOriginalImageUrl();
    }

    initTransforms() {
      this.transforms = {
        left: { flipH: false, flipV: false, rotation: 0 },
        right: { flipH: false, flipV: false, rotation: 0 },
      };
    }

    initZoomState() {
      this.panzoomInstances = {};
      this.zoomState = { scale: 1, x: 0, y: 0 };
    }

    initEventCleanup() {
      this.eventCleanup = [];
    }

    // Page validation and site detection
    isValidPage() {
      const { hostname, pathname } = window.location;

      if (hostname === "danbooru.donmai.us") {
        return (
          /\/(posts|uploads)\/\d+($|\?|\/assets\/\d+)/.test(location.href) ||
          /\/iqdb_queries/.test(location.href)
        );
      }

      return /\/post\/(show|similar)/.test(pathname);
    }

    detectSite() {
      const { hostname } = window.location;

      if (hostname === "danbooru.donmai.us") {
        return "danbooru";
      }
      if (hostname === "yande.re") {
        return "yandere";
      }
      if (hostname === "konachan.com") {
        return "konachan";
      }

      return null;
    }

    // DOM utilities
    select(selector) {
      return selector ? document.querySelector(selector) : null;
    }

    selectAll(selector) {
      return selector ? document.querySelectorAll(selector) : [];
    }

    createElement(tag, options = {}) {
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
    }

    // Data extraction
    getPostId() {
      if (this.isIqdb) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get("post_id") || this.select("#search_post_id")?.value?.trim();
      }

      return this.select(this.config.selectors.postId)?.content;
    }

    getSearchUrl() {
      if (!this.isIqdb) {
        return null;
      }

      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get("url") || this.select("#search_url")?.value?.trim();
    }

    extractPostIdFromPath(pathname) {
      const match = pathname.match(/\/(?:show|similar)\/(\d+)/);
      return match ? match[1] : null;
    }

    getCurrentSearchUrl() {
      const urlParams = new URLSearchParams(window.location.search);
      const urlParam = urlParams.get("url");

      if (urlParam) {
        return decodeURIComponent(urlParam);
      }

      const urlInput = this.select(this.config.selectors.urlInput);
      return urlInput?.value?.trim() || null;
    }

    // Image URL resolution
    getOriginalImageUrl() {
      if (this.site === "danbooru") {
        return this.getDanbooruImageUrl();
      }
      return this.getYandereKonachanImageUrl();
    }

    getDanbooruImageUrl() {
      if (this.isUpload) {
        return this.select(this.config.selectors.uploadImage)?.src;
      }

      if (this.isIqdb) {
        return this.searchUrl;
      }

      return (
        this.select(this.config.selectors.originalLink)?.href ||
        this.select(this.config.selectors.mainImage)?.src
      );
    }

    getYandereKonachanImageUrl() {
      if (this.isSimilar) {
        return this.getCurrentSearchUrl();
      }

      return (
        this.select(this.config.selectors.highresLink)?.href ||
        this.select(this.config.selectors.mainImage)?.src
      );
    }

    // UI setup
    setupUI() {
      this.addCompareLinks();
      this.addMainMenuLink();
    }

    addCompareLinks() {
      const posts = this.getComparablePosts();
      posts.forEach((post) => this.addCompareLinkToPost(post));
    }

    getComparablePosts() {
      const selector = this.getPostsSelector();
      return this.selectAll(selector);
    }

    getPostsSelector() {
      if (this.site === "danbooru") {
        return this.isIqdb || this.isUpload
          ? this.config.selectors.similarPosts
          : this.config.selectors.relatedPosts;
      }

      return this.isSimilar ? this.config.selectors.similarPosts : "";
    }

    addCompareLinkToPost(article) {
      const postId = this.extractPostIdFromArticle(article);

      if (!postId || postId === this.postId || article.querySelector(".compare-link")) {
        return;
      }

      const link = this.createCompareLink(postId);
      this.insertCompareLink(article, link);
    }

    extractPostIdFromArticle(article) {
      // Try data-id first
      let postId = article.getAttribute("data-id");

      // For Yandere/Konachan, try element ID
      if (!postId && article.id?.startsWith("p")) {
        postId = article.id.substring(1);
      }

      // Try extracting from thumb link
      if (!postId) {
        const thumbLink = article.querySelector("a.thumb");
        const match = thumbLink?.href?.match(/\/(?:post\/show|posts)\/(\d+)/);
        postId = match?.[1];
      }

      return postId;
    }

    createCompareLink(postId) {
      const container = this.createElement("div", {
        className: this.site === "danbooru" ? "text-xs text-center mt-1" : "",
      });

      if (this.site !== "danbooru") {
        container.style.cssText = "text-align: center; margin-top: 10px;";
      }

      const link = this.createElement("a", {
        className: "compare-link",
        textContent: "compare »",
      });

      link.href = "#";
      link.onclick = (e) => {
        e.preventDefault();
        this.openComparator(postId);
      };

      container.appendChild(link);
      return container;
    }

    insertCompareLink(article, link) {
      const scoreElement = article.querySelector(".post-preview-score");

      if (scoreElement) {
        article.insertBefore(link, scoreElement);
      } else {
        article.appendChild(link);
      }
    }

    addMainMenuLink() {
      const mainMenu = this.select(this.config.selectors.mainMenu);

      if (!mainMenu || mainMenu.querySelector("#nav-compare")) {
        return;
      }

      const menuItem = this.createElement("li", { id: "nav-compare" });
      const link = this.createElement("a", {
        textContent: "Compare",
      });

      link.href = "#";
      link.onclick = (e) => {
        e.preventDefault();
        this.openComparator();
      };

      menuItem.appendChild(link);
      mainMenu.appendChild(menuItem);
    }

    // Related posts fetching
    async getRelatedPosts() {
      if (this.site === "danbooru") {
        return this.getDanbooruRelatedPosts();
      }
      return this.getYandereKonachanRelatedPosts();
    }

    getDanbooruRelatedPosts() {
      if (this.isIqdb || this.isUpload) {
        return this.getDanbooruSimilarPosts();
      }

      const posts = [];
      this.extractFromPreviews(posts);
      this.extractFromNotices(posts);
      return posts;
    }

    getDanbooruSimilarPosts() {
      const posts = [];
      const articles = this.selectAll(this.config.selectors.similarPosts);

      articles.forEach((article) => {
        const postId = article.getAttribute("data-id");
        if (!postId || postId === this.postId) {
          return;
        }

        const similarity = this.extractSimilarity(article);
        posts.push({
          id: postId,
          relationshipType: "Similar",
          similarity,
        });
      });

      return posts;
    }

    extractSimilarity(article) {
      const similarityElement = article.querySelector(".iqdb-similarity-score");
      if (!similarityElement) {
        return null;
      }

      const match = similarityElement.textContent.match(/(\d+)%\s*similar/);
      return match ? parseInt(match[1]) : null;
    }

    extractFromPreviews(posts) {
      const previews = [
        { selector: this.config.selectors.parentPreview, isParent: true },
        { selector: this.config.selectors.childrenPreview, isParent: false },
      ];

      previews.forEach(({ selector, isParent }) => {
        const preview = this.select(selector);
        if (!preview) {
          return;
        }

        const articles = preview.querySelectorAll("article.post-preview");
        articles.forEach((article) => {
          const postData = this.extractPostData(article);
          if (this.isValidPostData(postData, posts)) {
            postData.relationshipType = this.getRelationshipType(article, isParent);
            posts.push(postData);
          }
        });
      });
    }

    extractPostData(article) {
      const postId = article.getAttribute("data-id");
      const imgElement = article.querySelector(".post-preview-image");

      return postId && imgElement ? { id: postId } : null;
    }

    isValidPostData(postData, existingPosts) {
      return (
        postData &&
        postData.id !== this.postId &&
        !existingPosts.some((post) => post.id === postData.id)
      );
    }

    getRelationshipType(article, isParentPreview) {
      if (!isParentPreview) {
        return "Child";
      }

      const parentId = document.body.getAttribute("data-post-parent-id");
      const articleId = article.getAttribute("data-id");

      return articleId === parentId ? "Parent" : "Sibling";
    }

    extractFromNotices(posts) {
      const notice = this.select(".post-notice-parent, .post-notice-child");
      if (!notice) {
        return;
      }

      const links = notice.querySelectorAll('a[href*="parent:"], a[href*="child:"]');
      links.forEach((link) => {
        const href = link.getAttribute("href");
        const postIdMatch = href.match(/[?&]tags=[^&]*[:%](\d+)/);
        const postId = postIdMatch?.[1];

        if (postId && !posts.some((post) => post.id === postId)) {
          posts.push({
            id: postId,
            relationshipType: href.includes("parent:") ? "Parent" : "Child",
          });
        }
      });
    }

    async getYandereKonachanRelatedPosts() {
      if (this.isSimilar) {
        return this.getYandereKonachanSimilarPosts();
      }

      const posts = [];

      try {
        if (this.postId) {
          await this.fetchParentSiblings(posts);
          await this.fetchChildren(posts);
        }
      } catch (error) {
        console.warn("Failed to fetch related posts:", error);
      }

      return this.sortPostsByRelationship(posts);
    }

    getYandereKonachanSimilarPosts() {
      const articles = this.selectAll(this.config.selectors.similarPosts);
      const posts = [];

      articles.forEach((article) => {
        const postId = this.extractPostIdFromArticle(article);
        if (postId) {
          posts.push({
            id: postId,
            relationshipType: "Similar",
          });
        }
      });

      return posts;
    }

    async fetchParentSiblings(posts) {
      const response = await this.fetchPostData(`id:${this.postId}`);
      if (!response?.length) {
        return;
      }

      const currentPost = response.find((p) => p.id.toString() === this.postId);
      if (!currentPost?.parent_id) {
        return;
      }

      const siblings = await this.fetchPostData(`parent:${currentPost.parent_id}`);
      if (siblings) {
        siblings.forEach((post) => {
          const relationshipType = post.id === currentPost.parent_id ? "Parent" : "Sibling";
          this.addPostToList(post, posts, relationshipType);
        });
      }
    }

    async fetchChildren(posts) {
      const children = await this.fetchPostData(`parent:${this.postId}`);
      if (children) {
        children.forEach((post) => this.addPostToList(post, posts, "Child"));
      }
    }

    addPostToList(post, posts, relationshipType) {
      if (post.id.toString() !== this.postId) {
        posts.push({
          id: post.id.toString(),
          relationshipType,
        });
      }
    }

    sortPostsByRelationship(posts) {
      return posts.sort((a, b) => {
        const priorityA = RELATIONSHIP_PRIORITY[a.relationshipType] || 5;
        const priorityB = RELATIONSHIP_PRIORITY[b.relationshipType] || 5;

        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        return parseInt(a.id) - parseInt(b.id);
      });
    }

    async fetchPostData(query) {
      try {
        const endpoint =
          this.site === "danbooru" ? `/posts/${query}.json` : this.config.apiEndpoint(query);

        const response = await fetch(endpoint);
        if (!response.ok) {
          return null;
        }

        const data = await response.json();
        if (this.site === "danbooru") {
          return data;
        }
        return Array.isArray(data) ? data : [data];
      } catch (error) {
        console.warn("Failed to fetch post data:", error);
        return null;
      }
    }

    // Comparator interface
    openComparator(postId) {
      this.createInterface().then(() => {
        if (postId) {
          setTimeout(() => this.loadImage(postId), 100);
        }
      });
    }

    async createInterface() {
      const container = this.createElement("div", {
        id: "image-comparison-container",
        innerHTML: this.getInterfaceHTML(),
      });

      container.setAttribute("tabindex", "0");
      container.style.outline = "none";
      document.body.appendChild(container);

      await this.setupInterface();
    }

    async setupInterface() {
      await this.createPostSelector();
      this.bindEvents();
      this.initPanZoom();
      this.restoreMode();

      if (this.shouldLoadSearchImage()) {
        await this.loadSearchImage();
      }

      this.updateMode();
    }

    shouldLoadSearchImage() {
      return this.isIqdb && this.postId && !this.originalImageUrl;
    }

    getInterfaceHTML() {
      const currentLabel = this.getCurrentLabel();
      const leftImageSrc = this.originalImageUrl || "";

      return `
        <div id="comparison-header">
          ${this.getHeaderHTML(currentLabel)}
          ${this.getModeControlsHTML()}
        </div>
        ${this.getComparisonContentHTML(leftImageSrc)}
      `;
    }

    getHeaderHTML(currentLabel) {
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
    }

    getModeControlsHTML() {
      return `
        <div id="all-controls-row" class="header-section mode-control-section">
          ${this.getTransformControlsHTML()}
          ${this.getFilterControlsHTML()}
          ${this.getFadeControlsHTML()}
          ${this.getDifferenceControlsHTML()}
        </div>
      `;
    }

    getTransformControlsHTML() {
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
    }

    getFilterControlsHTML() {
      return `
        <div id="filter-controls">
          <label>Brightness: <input type="range" id="brightness-slider" min="0" max="100" value="1"></label>
          <span id="brightness-value">1</span>
          <label>Saturate: <input type="range" id="saturate-slider" min="0" max="100" value="1"></label>
          <span id="saturate-value">1</span>
          <button id="reset-filters" class="control-btn">Reset Filters</button>
        </div>
      `;
    }

    getFadeControlsHTML() {
      return `
        <div id="fade-controls">
          <label>Opacity: <input type="range" id="opacity-slider" min="0" max="100" value="50"></label>
          <span id="opacity-value">50%</span>
        </div>
      `;
    }

    getDifferenceControlsHTML() {
      return `
        <div id="difference-controls">
          <label>Background:
            <select id="difference-background">
              <option value="black">Black</option>
              <option value="white">White</option>
              <option value="grey">Grey</option>
            </select>
          </label>
          <button id="invert-difference" class="control-btn">Invert</button>
        </div>
      `;
    }

    getComparisonContentHTML(leftImageSrc = "") {
      const leftImageId = this.getCurrentImageId();

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
    }

    getCurrentLabel() {
      if (this.site === "danbooru") {
        if (this.isIqdb) {
          return this.postId ? `Post #${this.postId}` : "IQDB";
        }
        if (this.isUpload) {
          return "Upload";
        }
        return this.postId ? `Post #${this.postId}` : "Custom";
      }

      if (this.isSimilar) {
        return "Similar";
      }
      return this.postId ? `Post #${this.postId}` : "Custom";
    }

    getCurrentImageId() {
      if (this.site === "danbooru") {
        if (this.isIqdb) {
          return this.postId || "iqdb";
        }
        if (this.isUpload) {
          return "upload";
        }
      } else if (this.isSimilar) {
        return "similar";
      }

      return this.postId || "unknown";
    }

    // Post selector creation
    async createPostSelector() {
      const posts = await this.getRelatedPosts();
      if (posts.length === 0) {
        return;
      }

      const input = this.select("#second-image-input");
      const selector = this.buildPostSelector(posts);
      input.parentElement.insertBefore(selector, input);
    }

    buildPostSelector(posts) {
      const container = this.createElement("div", { className: "post-selector" });
      const label = this.createElement("span", {
        textContent: this.getSelectorLabel(),
      });
      const select = this.createElement("select");

      this.populateSelector(select, posts);
      this.bindSelectorEvents(select);

      container.append(label, select);
      return container;
    }

    getSelectorLabel() {
      return this.isIqdb || this.isSimilar || this.isUpload ? "Similar: " : "Related: ";
    }

    populateSelector(select, posts) {
      select.appendChild(new Option("-- Select post --", ""));

      const currentRightImageId = this.getCurrentRightImageId();

      posts.forEach((post) => {
        const text = this.formatPostOptionText(post);
        const option = new Option(text, post.id);
        select.appendChild(option);
      });

      if (currentRightImageId && this.isPostInList(currentRightImageId, posts)) {
        select.value = currentRightImageId;
      }
    }

    formatPostOptionText(post) {
      let text = `#${post.id}`;

      if (post.similarity) {
        text += ` (${post.similarity}%)`;
      } else if (post.relationshipType && post.relationshipType !== "Similar") {
        text += ` (${post.relationshipType})`;
      }

      return text;
    }

    bindSelectorEvents(select) {
      select.onchange = () => {
        const selectedId = select.value;
        if (selectedId) {
          this.select("#second-image-input").value = selectedId;
          this.handleLoadImage();
        }
      };
    }

    getCurrentRightImageId() {
      return this.select("#right-image")?.getAttribute("data-id");
    }

    isPostInList(postId, posts) {
      return posts.some((post) => post.id === postId);
    }

    // Event binding
    bindEvents() {
      setTimeout(() => {
        this.bindControlEvents();
        this.bindTransformEvents();
        this.bindInputEvents();
        this.bindModeEvents();
        this.bindKeyboardEvents();
      }, 0);
    }

    bindControlEvents() {
      const controls = [
        ["close-comparison", () => this.closeInterface()],
        ["load-comparison", () => this.handleLoadImage()],
        ["swap-images", () => this.swapImages()],
        ["comparison-mode", () => this.onModeChange(), "change"],
      ];

      controls.forEach(([id, handler, event = "click"]) => {
        this.addEventHandler(id, event, handler);
      });
    }

    bindTransformEvents() {
      const transforms = [
        ["flip-h-left", () => this.toggleTransform("left", "flipH")],
        ["flip-v-left", () => this.toggleTransform("left", "flipV")],
        ["rotate-left", () => this.rotateImage("left")],
        ["flip-h-right", () => this.toggleTransform("right", "flipH")],
        ["flip-v-right", () => this.toggleTransform("right", "flipV")],
        ["rotate-right", () => this.rotateImage("right")],
        ["reset-transform", () => this.resetTransforms()],
      ];

      transforms.forEach(([id, handler]) => {
        this.addEventHandler(id, "click", handler);
      });
    }

    bindInputEvents() {
      this.addEventHandler("second-image-input", "keypress", (e) => {
        if (e.key === "Enter") {
          this.handleLoadImage();
        }
      });
    }

    bindModeEvents() {
      // Opacity slider
      const opacitySlider = this.select("#opacity-slider");
      if (opacitySlider) {
        opacitySlider.oninput = () => this.updateOpacity();
      }

      // Filter controls
      const brightnessSlider = this.select("#brightness-slider");
      const saturateSlider = this.select("#saturate-slider");

      if (brightnessSlider) {
        brightnessSlider.oninput = () => this.updateFilters();
      }
      if (saturateSlider) {
        saturateSlider.oninput = () => this.updateFilters();
      }

      // Other mode controls
      this.addEventHandler("difference-background", "change", () =>
        this.updateDifferenceBackground(),
      );
      this.addEventHandler("invert-difference", "click", () => this.toggleDifferenceInvert());
      this.addEventHandler("reset-filters", "click", () => this.resetFilters());
    }

    bindKeyboardEvents() {
      this.escKeyHandler = (e) => {
        if (e.key === "Escape") {
          this.closeInterface();
        }
      };

      document.addEventListener("keydown", this.escKeyHandler, true);
      this.eventCleanup.push(() => {
        document.removeEventListener("keydown", this.escKeyHandler, true);
      });
    }

    addEventHandler(elementId, event, handler) {
      const element = this.select(`#${elementId}`);
      if (!element) {
        console.warn(`Element with id "${elementId}" not found`);
        return;
      }

      element.addEventListener(event, handler);
      this.eventCleanup.push(() => element.removeEventListener(event, handler));
    }

    // Mode management
    restoreMode() {
      const savedMode = this.getSavedMode();
      this.mode = savedMode;
      const modeSelect = this.select("#comparison-mode");
      if (modeSelect) {
        modeSelect.value = savedMode;
      }
    }

    getSavedMode() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        return Object.values(COMPARISON_MODES).includes(saved)
          ? saved
          : COMPARISON_MODES.SIDE_BY_SIDE;
      } catch {
        return COMPARISON_MODES.SIDE_BY_SIDE;
      }
    }

    saveMode() {
      try {
        const modeSelect = this.select("#comparison-mode");
        if (modeSelect) {
          localStorage.setItem(STORAGE_KEY, modeSelect.value);
        }
      } catch (e) {
        console.warn("Failed to save mode:", e);
      }
    }

    onModeChange() {
      this.updateMode();
      this.saveMode();
    }

    updateMode() {
      this.saveZoomState();
      this.cleanupModeElements();
      this.cleanupWheelListeners();

      const modeSelect = this.select("#comparison-mode");
      if (!modeSelect) {
        return;
      }

      const newMode = modeSelect.value;
      const previousMode = this.mode;
      this.mode = newMode;

      if (
        previousMode !== newMode &&
        this.isOverlayMode(previousMode) !== this.isOverlayMode(newMode)
      ) {
        this.calculateZoomTransition(previousMode, newMode);
      }

      this.resetDisplay();
      this.setupModeSpecificUI();

      setTimeout(() => this.applyTransforms(), 0);
      this.focusContainer();
    }

    setupModeSpecificUI() {
      switch (this.mode) {
        case COMPARISON_MODES.SLIDER:
          this.setupSliderMode();
          break;
        case COMPARISON_MODES.FADE:
          this.setupFadeMode();
          break;
        case COMPARISON_MODES.DIFFERENCE:
          this.setupDifferenceMode();
          break;
        default:
          setTimeout(() => this.restoreZoomState(), 100);
          break;
      }
    }

    // Mode setup methods
    resetDisplay() {
      // Reset main elements
      ["left-side", "right-side", "comparison-divider"].forEach((id) => {
        const el = this.select(`#${id}`);
        if (el) {
          el.style.display = id === "comparison-divider" ? "block" : "flex";
        }
      });

      // Reset overlay container
      const overlayContainer = this.select("#comparison-overlay-container");
      if (overlayContainer) {
        overlayContainer.innerHTML = '<div class="sync-pan" id="overlay-pan"></div>';
        overlayContainer.style.display = "none";
        overlayContainer.style.backgroundColor = "";
        overlayContainer.classList.remove("difference-inverted");
      }

      // Reset overlay image
      const overlayImage = this.select("#overlay-image");
      if (overlayImage) {
        overlayImage.style.clipPath = "";
        overlayImage.style.mixBlendMode = "";
        overlayImage.style.opacity = "";
      }

      // Reset control visibility
      ["fade-controls", "difference-controls"].forEach((id) => {
        const el = this.select(`#${id}`);
        if (el) {
          el.style.display = "none";
        }
      });

      const filterControls = this.select("#filter-controls");
      if (filterControls) {
        filterControls.style.display = "flex";
      }
    }

    setupSliderMode() {
      this.hideMainElements();
      this.showOverlay();
      this.createOverlayImages();
      this.initOverlayPanZoom();
      setTimeout(() => this.initSlider(), 0);
    }

    setupFadeMode() {
      this.hideMainElements();
      this.showOverlay();
      this.createOverlayImages();
      this.initOverlayPanZoom();

      const overlayImage = this.select("#overlay-image");
      if (overlayImage?.src?.trim()) {
        overlayImage.style.opacity = "0.5";
        overlayImage.style.display = "block";
      }

      const fadeControls = this.select("#fade-controls");
      if (fadeControls) {
        fadeControls.style.display = "flex";
      }
    }

    setupDifferenceMode() {
      this.hideMainElements();
      this.showOverlay();
      this.createOverlayImages();
      this.initOverlayPanZoom();

      const overlayImage = this.select("#overlay-image");
      if (overlayImage?.src?.trim()) {
        overlayImage.style.mixBlendMode = "difference";
        overlayImage.style.opacity = "1";
        overlayImage.style.display = "block";
      }

      const overlayContainer = this.select("#comparison-overlay-container");
      if (overlayContainer) {
        overlayContainer.style.backgroundColor = FILTER_COLORS.black;
      }

      const differenceControls = this.select("#difference-controls");
      if (differenceControls) {
        differenceControls.style.display = "flex";
      }

      const backgroundSelect = this.select("#difference-background");
      if (backgroundSelect) {
        backgroundSelect.value = "black";
      }
    }

    hideMainElements() {
      ["left-side", "right-side", "comparison-divider"].forEach((id) => {
        const el = this.select(`#${id}`);
        if (el) {
          el.style.display = "none";
        }
      });
    }

    showOverlay() {
      const overlay = this.select("#comparison-overlay-container");
      if (overlay) {
        overlay.style.display = "block";
      }
    }

    // Overlay and slider functionality
    createOverlayImages() {
      const container = this.select("#overlay-pan");
      if (!container) {
        return;
      }

      const leftImage = this.select("#left-image");
      const rightImage = this.select("#right-image");

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
        : this.createElement("img");

      rightClone.id = "overlay-image";
      rightClone.style.cssText = `${overlayStyle} ${rightImage.src?.trim() ? "" : "display: none;"}`;
      container.appendChild(rightClone);
    }

    initSlider() {
      const container = this.select("#comparison-overlay-container");
      const rightImage = this.select("#overlay-image");

      if (!container || !rightImage?.src?.trim()) {
        return;
      }

      let slider = this.select("#comparison-slider");
      if (!slider) {
        slider = this.createElement("div", { id: "comparison-slider" });
        container.appendChild(slider);
      }

      const centerX = container.clientWidth / 2;
      this.updateSlider(slider, rightImage, centerX, container);
      this.bindSliderEvents(slider, rightImage, container);
    }

    updateSlider(slider, rightImage, containerX, container) {
      const containerWidth = container.clientWidth;
      containerX = Math.max(0, Math.min(containerX, containerWidth));

      slider.style.left = `${containerX}px`;

      const panzoomInstance = this.panzoomInstances.overlay;
      if (panzoomInstance) {
        const scale = panzoomInstance.getScale();
        const imageRect = rightImage.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const relativeX = containerX - (imageRect.left - containerRect.left);
        const imageCoordX = relativeX / scale;
        rightImage.style.clipPath = `inset(0 0 0 ${Math.max(0, imageCoordX)}px)`;
      } else {
        rightImage.style.clipPath = `inset(0 0 0 ${containerX}px)`;
      }
    }

    bindSliderEvents(slider, rightImage, container) {
      let isDragging = false;

      const updatePosition = (e) => {
        const containerX = e.clientX - container.getBoundingClientRect().left;
        this.updateSlider(slider, rightImage, containerX, container);
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
          if (e.target !== slider) {
            updatePosition(e);
            isDragging = true;
          }
        },
        mouseUp: () => {
          isDragging = false;
        },
        panzoomChange: () => {
          const currentPosition = parseInt(slider.style.left) || container.clientWidth / 2;
          this.updateSlider(slider, rightImage, currentPosition, container);
        },
      };

      // Bind events
      slider.addEventListener("mousedown", handlers.mouseDown);
      container.addEventListener("mousemove", handlers.mouseMove);
      container.addEventListener("mousedown", handlers.containerMouseDown);
      document.addEventListener("mouseup", handlers.mouseUp);

      // Bind panzoom events
      const overlayPan = this.select("#overlay-pan");
      if (overlayPan && this.panzoomInstances.overlay) {
        ["panzoomchange", "panzoomzoom", "panzoompan"].forEach((event) => {
          overlayPan.addEventListener(event, handlers.panzoomChange);
        });
      }

      // Add to cleanup
      this.eventCleanup.push(() => {
        slider.removeEventListener("mousedown", handlers.mouseDown);
        container.removeEventListener("mousemove", handlers.mouseMove);
        container.removeEventListener("mousedown", handlers.containerMouseDown);
        document.removeEventListener("mouseup", handlers.mouseUp);

        if (overlayPan) {
          ["panzoomchange", "panzoomzoom", "panzoompan"].forEach((event) => {
            overlayPan.removeEventListener(event, handlers.panzoomChange);
          });
        }
      });
    }

    // Filter and effect controls
    updateOpacity() {
      const slider = this.select("#opacity-slider");
      const overlayImage = this.select("#overlay-image");
      const opacityValue = this.select("#opacity-value");

      if (slider && overlayImage && opacityValue) {
        const opacity = slider.value / 100;
        overlayImage.style.opacity = opacity;
        opacityValue.textContent = `${slider.value}%`;
      }
    }

    updateFilters() {
      const brightnessSlider = this.select("#brightness-slider");
      const saturateSlider = this.select("#saturate-slider");
      const brightnessValue = this.select("#brightness-value");
      const saturateValue = this.select("#saturate-value");

      if (!brightnessSlider || !saturateSlider || !brightnessValue || !saturateValue) {
        return;
      }

      const brightness = brightnessSlider.value;
      const saturate = saturateSlider.value;

      brightnessValue.textContent = brightness;
      saturateValue.textContent = saturate;

      const overlayPan = this.select("#overlay-pan");
      if (overlayPan) {
        overlayPan.style.filter = `brightness(${brightness}) saturate(${saturate})`;
      }
    }

    resetFilters() {
      const brightnessSlider = this.select("#brightness-slider");
      const saturateSlider = this.select("#saturate-slider");

      if (brightnessSlider) {
        brightnessSlider.value = 1;
      }
      if (saturateSlider) {
        saturateSlider.value = 1;
      }

      this.updateFilters();
    }

    updateDifferenceBackground() {
      const backgroundSelect = this.select("#difference-background");
      const overlayContainer = this.select("#comparison-overlay-container");

      if (backgroundSelect && overlayContainer) {
        const background = backgroundSelect.value;
        overlayContainer.style.backgroundColor = FILTER_COLORS[background] || FILTER_COLORS.black;
      }
    }

    toggleDifferenceInvert() {
      const container = this.select("#comparison-overlay-container");
      const button = this.select("#invert-difference");

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
    }

    // Image loading and management
    handleLoadImage() {
      const input = this.select("#second-image-input");
      if (!input) {
        return;
      }

      const inputValue = input.value.trim();
      if (!inputValue) {
        this.showError("Please enter a valid post ID or URL");
        return;
      }
      this.loadImage(inputValue);
    }

    loadImage(input) {
      this.clearRightImage();

      if (/^\d+$/.test(input)) {
        this.loadPostById(input);
      } else if (this.isValidPostUrl(input)) {
        const postId = this.extractPostIdFromUrl(input);
        if (postId) {
          this.loadPostById(postId);
        } else {
          this.showError("Could not extract post ID from URL");
        }
      } else {
        this.loadDirectUrl(input);
      }
    }

    async loadPostById(postId) {
      try {
        const data = await this.fetchSinglePost(postId);
        const rightImage = this.select("#right-image");

        if (!rightImage) {
          return;
        }

        const imageUrl = this.extractImageUrl(data);
        rightImage.src = imageUrl;
        rightImage.setAttribute("data-id", postId);

        this.displayLoadedImage(imageUrl, postId);
      } catch (error) {
        this.showError(`Failed to load post: ${error.message}`);
      }
    }

    async fetchSinglePost(postId) {
      const endpoint =
        this.site === "danbooru"
          ? `/posts/${postId}.json`
          : this.config.apiEndpoint(`id:${postId}`);

      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error("Post not found");
      }

      const data = await response.json();
      if (this.site === "danbooru") {
        return data;
      }
      return data.length > 0 ? data[0] : null;
    }

    extractImageUrl(data) {
      return this.site === "danbooru" ? data.file_url || data.large_file_url : data.file_url;
    }

    loadDirectUrl(url) {
      try {
        new URL(url); // Validate URL

        const rightImage = this.select("#right-image");
        if (!rightImage) {
          return;
        }

        rightImage.onerror = () => {
          this.showError(`Failed to load image: ${url}`);
          rightImage.onerror = null;
          this.clearRightImage();
        };

        rightImage.onload = () => {
          rightImage.setAttribute("data-id", "custom");
          this.displayLoadedImage(url, "custom");
          rightImage.onload = null;
        };

        rightImage.src = url;
      } catch {
        this.showError("Invalid URL format");
      }
    }

    displayLoadedImage(imageUrl, postId) {
      const overlayImage = this.select("#overlay-image");
      if (overlayImage) {
        overlayImage.src = imageUrl;
        overlayImage.style.display = "block";
      }

      this.updateUI(postId);
      this.resetZoom();
      this.updateMode();
    }

    clearRightImage() {
      const rightImage = this.select("#right-image");
      const overlayImage = this.select("#overlay-image");

      if (rightImage) {
        rightImage.src = "";
        rightImage.removeAttribute("data-id");
      }

      if (overlayImage) {
        overlayImage.src = "";
        overlayImage.style.display = "none";
      }

      this.updatePostInfo();
      this.transforms.right = { flipH: false, flipV: false, rotation: 0 };
      this.applyTransforms();
    }

    async loadSearchImage() {
      try {
        const leftImage = this.select("#left-image");
        if (!leftImage) {
          return;
        }

        if (this.site === "danbooru" && this.isIqdb && this.postId) {
          const data = await this.fetchSinglePost(this.postId);
          leftImage.src = this.extractImageUrl(data);
          leftImage.setAttribute("data-id", this.postId);
        } else if (this.isSimilar) {
          const searchUrl = this.getCurrentSearchUrl();
          if (searchUrl) {
            leftImage.src = searchUrl;
            leftImage.setAttribute("data-id", "similar");
          }
        }

        this.updatePostInfo();
      } catch (error) {
        console.warn(`Failed to load search image: ${error.message}`);
      }
    }

    // Image transformation
    toggleTransform(side, type) {
      this.transforms[side][type] = !this.transforms[side][type];
      this.applyTransforms();
    }

    rotateImage(side) {
      this.transforms[side].rotation = (this.transforms[side].rotation + 90) % 360;
      this.applyTransforms();
    }

    resetTransforms() {
      this.transforms.left = { flipH: false, flipV: false, rotation: 0 };
      this.transforms.right = { flipH: false, flipV: false, rotation: 0 };
      this.applyTransforms();
    }

    applyTransforms() {
      const imageMap = {
        left: ["left-image", "overlay-left-image", "slider-left-image"],
        right: ["right-image", "overlay-image", "slider-right-image"],
      };

      // Clear all transform classes
      Object.values(imageMap)
        .flat()
        .forEach((id) => {
          const img = this.select(`#${id}`);
          if (img) {
            img.classList.remove("flip-h", "flip-v", "rotate-90", "rotate-180", "rotate-270");
          }
        });

      // Apply transforms
      Object.entries(imageMap).forEach(([side, imageIds]) => {
        imageIds.forEach((id) => {
          const img = this.select(`#${id}`);
          if (img) {
            this.applyTransformToElement(img, this.transforms[side]);
          }
        });
      });
    }

    applyTransformToElement(element, state) {
      if (state.flipH) {
        element.classList.add("flip-h");
      }
      if (state.flipV) {
        element.classList.add("flip-v");
      }

      const rotationClasses = {
        90: "rotate-90",
        180: "rotate-180",
        270: "rotate-270",
      };

      const rotationClass = rotationClasses[state.rotation];
      if (rotationClass) {
        element.classList.add(rotationClass);
      }
    }

    // Image swapping
    swapImages() {
      const leftImg = this.select("#left-image");
      const rightImg = this.select("#right-image");

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
      [this.transforms.left, this.transforms.right] = [this.transforms.right, this.transforms.left];

      this.updatePostInfo();

      // Update display based on current mode
      if (this.mode !== COMPARISON_MODES.SIDE_BY_SIDE) {
        this.updateMode();
      } else {
        this.applyTransforms();
      }
    }

    // UI updates
    updateUI(postId) {
      this.updatePostInfo();

      const input = this.select("#second-image-input");
      if (input) {
        input.value = postId === "custom" ? "" : postId;
      }

      const selector = this.select(".post-selector select");
      if (selector && postId !== "custom") {
        selector.value = postId;
      }
    }

    updatePostInfo() {
      const leftImg = this.select("#left-image");
      const rightImg = this.select("#right-image");
      const infoDisplay = this.select("#post-info-display");

      if (!leftImg || !rightImg || !infoDisplay) {
        return;
      }

      const leftId = leftImg.getAttribute("data-id");
      const rightId = rightImg.getAttribute("data-id");

      let display = "";
      if (leftId && rightId) {
        const leftLabel = this.getImageLabel(leftId);
        const rightLabel = rightId === "custom" ? "Custom" : `#${rightId}`;
        display = `Compare: ${leftLabel} vs ${rightLabel}`;
      }

      infoDisplay.textContent = display;
    }

    getImageLabel(imageId) {
      const labels = {
        iqdb: "IQDB",
        upload: "Upload",
        similar: "Similar",
      };

      return labels[imageId] || `#${imageId}`;
    }

    // Pan and zoom functionality
    initPanZoom() {
      const leftPan = this.select("#left-pan");
      const rightPan = this.select("#right-pan");

      if (!leftPan || !rightPan) {
        return;
      }

      // Destroy existing instances
      if (this.panzoomInstances.left) {
        this.panzoomInstances.left.destroy();
      }
      if (this.panzoomInstances.right) {
        this.panzoomInstances.right.destroy();
      }

      // Create new instances
      const options = { maxScale: Infinity };
      this.panzoomInstances.left = Panzoom(leftPan, options);
      this.panzoomInstances.right = Panzoom(rightPan, options);

      setTimeout(() => this.restoreZoomState(), 0);

      this.syncPanZoom();
      this.bindPanZoomEvents();
    }

    syncPanZoom() {
      const leftPan = this.select("#left-pan");
      const rightPan = this.select("#right-pan");
      const leftPanzoom = this.panzoomInstances.left;
      const rightPanzoom = this.panzoomInstances.right;

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

      this.eventCleanup.push(() => {
        leftPan.removeEventListener("panzoomchange", leftHandler);
        rightPan.removeEventListener("panzoomchange", rightHandler);
      });
    }

    bindPanZoomEvents() {
      const leftSide = this.select("#left-side");
      const rightSide = this.select("#right-side");

      if (!leftSide || !rightSide) {
        return;
      }

      const createWheelHandler = (panzoom) => (event) => {
        event.preventDefault();
        panzoom.zoomWithWheel(event);
      };

      const leftWheelHandler = createWheelHandler(this.panzoomInstances.left);
      const rightWheelHandler = createWheelHandler(this.panzoomInstances.right);

      leftSide.addEventListener("wheel", leftWheelHandler);
      rightSide.addEventListener("wheel", rightWheelHandler);

      this.eventCleanup.push(() => {
        leftSide.removeEventListener("wheel", leftWheelHandler);
        rightSide.removeEventListener("wheel", rightWheelHandler);
      });

      this.addEventHandler("reset-zoom", "click", () => this.resetZoom());
    }

    initOverlayPanZoom() {
      const overlayPan = this.select("#overlay-pan");
      const overlayContainer = this.select("#comparison-overlay-container");

      if (!overlayPan || !overlayContainer) {
        return;
      }

      this.panzoomInstances.overlay = Panzoom(overlayPan, { maxScale: Infinity });

      if (this.zoomState) {
        this.panzoomInstances.overlay.zoom(this.zoomState.scale, { animate: false, silent: true });
        this.panzoomInstances.overlay.pan(this.zoomState.x, this.zoomState.y, {
          animate: false,
          silent: true,
        });
      }

      this.cleanWheelListenersFromElement(overlayContainer);

      const wheelHandler = (event) => {
        event.preventDefault();
        this.panzoomInstances.overlay.zoomWithWheel(event);
      };

      overlayContainer._wheelListener = wheelHandler;
      overlayContainer.addEventListener("wheel", wheelHandler);
    }

    resetZoom() {
      Object.values(this.panzoomInstances).forEach((instance) => {
        if (instance) {
          instance.reset();
        }
      });
    }

    // Zoom state management
    saveZoomState() {
      const activeInstance = this.getActivePanzoomInstance();
      if (activeInstance) {
        const pan = activeInstance.getPan();
        this.zoomState = {
          scale: activeInstance.getScale(),
          x: pan.x,
          y: pan.y,
          mode: this.mode || this.select("#comparison-mode")?.value,
        };
      }
    }

    restoreZoomState() {
      Object.values(this.panzoomInstances).forEach((instance) => {
        if (instance) {
          instance.zoom(this.zoomState.scale, { animate: false, silent: true });
          instance.pan(this.zoomState.x, this.zoomState.y, { animate: false, silent: true });
        }
      });
    }

    getActivePanzoomInstance() {
      return (
        this.panzoomInstances.overlay || this.panzoomInstances.left || this.panzoomInstances.right
      );
    }

    calculateZoomTransition(fromMode, toMode) {
      if (!this.zoomState) {
        return;
      }

      const isFromOverlay = this.isOverlayMode(fromMode);
      const isToOverlay = this.isOverlayMode(toMode);

      if (isFromOverlay === isToOverlay) {
        return;
      }

      const referenceImg = this.select("#left-image");
      const comparisonContent = this.select("#comparison-content");

      if (!referenceImg || !comparisonContent || !referenceImg.naturalWidth) {
        return;
      }

      const contentWidth = comparisonContent.clientWidth;
      const contentHeight = comparisonContent.clientHeight;
      const sideWidth = (contentWidth - DIVIDER_WIDTH) / 2;

      const sideBySideHeight = this.calculateImageDisplayHeight(
        referenceImg,
        sideWidth,
        contentHeight,
      );
      const overlayHeight = this.calculateImageDisplayHeight(
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
        this.zoomState.scale = Math.max(0.1, this.zoomState.scale * heightRatio);
        this.zoomState.y *= heightRatio;
      }
    }

    calculateImageDisplayHeight(img, containerWidth, containerHeight) {
      if (!img?.naturalWidth || !img?.naturalHeight) {
        return containerHeight;
      }

      const imageAspect = img.naturalWidth / img.naturalHeight;
      const containerAspect = containerWidth / containerHeight;

      return imageAspect > containerAspect ? containerWidth / imageAspect : containerHeight;
    }

    isOverlayMode(mode) {
      return [COMPARISON_MODES.SLIDER, COMPARISON_MODES.FADE, COMPARISON_MODES.DIFFERENCE].includes(
        mode,
      );
    }

    // Cleanup and utilities
    cleanupModeElements() {
      if (this.panzoomInstances.overlay) {
        this.panzoomInstances.overlay.destroy();
        this.panzoomInstances.overlay = null;
      }
    }

    cleanupWheelListeners() {
      ["left-side", "right-side", "comparison-overlay-container"].forEach((id) => {
        const element = this.select(`#${id}`);
        this.cleanWheelListenersFromElement(element);
      });
    }

    cleanWheelListenersFromElement(element) {
      if (!element) {
        return;
      }

      if (element._wheelListener) {
        element.removeEventListener("wheel", element._wheelListener);
        delete element._wheelListener;
      }
    }

    focusContainer() {
      requestAnimationFrame(() => {
        const container = this.select("#image-comparison-container");
        if (container) {
          container.focus();
        }
      });
    }

    // Validation utilities
    isValidPostUrl(url) {
      return /https:\/\/(danbooru\.donmai\.us\/posts|yande\.re\/post\/show|konachan\.com\/post\/show)\/\d+/.test(
        url,
      );
    }

    extractPostIdFromUrl(url) {
      const match = url.match(/\/(?:posts|show)\/(\d+)/);
      return match ? match[1] : null;
    }

    showError(message) {
      // Simple error display - could be enhanced with better UI
      alert(message);
    }

    // Observer for dynamic content
    observeChanges() {
      const observer = new MutationObserver(() => this.addCompareLinks());
      observer.observe(document.body, { childList: true, subtree: true });
    }

    // Cleanup and interface closing
    cleanupEvents() {
      this.eventCleanup.forEach((cleanup) => cleanup());
      this.eventCleanup = [];
    }

    destroyPanZoom() {
      Object.values(this.panzoomInstances).forEach((instance) => {
        if (instance) {
          instance.destroy();
        }
      });
      this.panzoomInstances = {};
    }

    closeInterface() {
      this.resetTransforms();
      this.destroyPanZoom();
      this.cleanupEvents();

      const container = this.select("#image-comparison-container");
      if (container) {
        document.body.removeChild(container);
      }
    }
  }

  // Initialize when ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => new BooruImageComparator());
  } else {
    new BooruImageComparator();
  }
})();
