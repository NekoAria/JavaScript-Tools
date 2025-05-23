// ==UserScript==
// @name         Danbooru Image Comparator
// @namespace    https://github.com/NekoAria/JavaScript-Tools
// @version      0.14
// @description  Compare images on Danbooru with multiple modes and transformations
// @author       Neko_Aria
// @match        https://danbooru.donmai.us/posts/*
// @match        https://danbooru.donmai.us/uploads/*
// @match        https://danbooru.donmai.us/iqdb_queries*
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @resource     STYLE https://github.com/NekoAria/JavaScript-Tools/raw/refs/heads/main/userscripts/danbooru-image-comparator.css?t=202505231805
// @require      https://unpkg.com/@panzoom/panzoom@4.6.0/dist/panzoom.min.js
// @downloadURL  https://github.com/NekoAria/JavaScript-Tools/raw/refs/heads/main/userscripts/danbooru-image-comparator.user.js
// @updateURL    https://github.com/NekoAria/JavaScript-Tools/raw/refs/heads/main/userscripts/danbooru-image-comparator.user.js
// ==/UserScript==

(function () {
  "use strict";

  class DanbooruImageComparator {
    static MODES = {
      SIDE_BY_SIDE: "side-by-side",
      SLIDER: "slider",
      FADE: "fade",
      DIFFERENCE: "difference",
    };

    static SELECTORS = {
      POST_ID: 'meta[name="post-id"]',
      UPLOAD_IMAGE: ".media-asset-image",
      ORIGINAL_LINK: ".image-view-original-link",
      MAIN_IMAGE: "#image",
      SIMILAR_POSTS: "#iqdb-similar .post-preview",
      RELATED_POSTS: "article.post-preview:not(.current-post)",
      IQDB_SIMILAR_POSTS: ".iqdb-posts .post-preview",
      PARENT_PREVIEW: "#has-parent-relationship-preview",
      CHILDREN_PREVIEW: "#has-children-relationship-preview",
      MAIN_MENU: "#main-menu",
    };

    static STORAGE_KEY = "danbooru_comparator_mode";

    // Page configuration for different contexts
    static PAGE_CONFIGS = {
      iqdb: {
        selector: "IQDB_SIMILAR_POSTS",
        getPostsMethod: "getIqdbPosts",
        labelPrefix: "IQDB",
        checkParams: (instance) => instance.searchPostId || instance.searchUrl,
      },
      upload: {
        selector: "SIMILAR_POSTS",
        getPostsMethod: "getSimilarPosts",
        labelPrefix: "upload",
        checkParams: () => true,
      },
      default: {
        selector: "RELATED_POSTS",
        getPostsMethod: "getRelatedPosts",
        labelPrefix: "Post",
        checkParams: () => true,
      },
    };

    constructor() {
      if (!this.isValidPage()) {
        return;
      }

      GM_addStyle(GM_getResourceText("STYLE"));

      this.initState();
      this.addCompareLinks();
      this.setupObserver();
    }

    isValidPage() {
      return (
        /\/(posts|uploads)\/\d+($|\?|\/assets\/\d+)/.test(location.href) ||
        /\/iqdb_queries/.test(location.href)
      );
    }

    initState() {
      this.isUploadPage = location.pathname.startsWith("/uploads");
      this.isIqdbPage = location.pathname.startsWith("/iqdb_queries");
      this.currentPostId = this.getElement(DanbooruImageComparator.SELECTORS.POST_ID)?.content;

      // Extract search parameters for IQDB pages
      if (this.isIqdbPage) {
        this.searchPostId = this.getElement("#search_post_id")?.value?.trim();
        this.searchUrl = this.getElement("#search_url")?.value?.trim();
      }

      this.originalImageUrl = this.getOriginalImageUrl();
      this.currentMode = null;

      // Initialize transform states for image manipulations
      this.transforms = {
        left: { flipH: false, flipV: false, rotation: 0 },
        right: { flipH: false, flipV: false, rotation: 0 },
      };

      this.panzoomInstances = {};
      this.zoomState = { scale: 1, x: 0, y: 0 };
      this.eventCleanup = [];
    }

    getCurrentPageConfig() {
      if (this.isIqdbPage) {
        return DanbooruImageComparator.PAGE_CONFIGS.iqdb;
      }
      if (this.isUploadPage) {
        return DanbooruImageComparator.PAGE_CONFIGS.upload;
      }
      return DanbooruImageComparator.PAGE_CONFIGS.default;
    }

    getCurrentLabel() {
      const config = this.getCurrentPageConfig();
      if (this.isIqdbPage) {
        return this.searchPostId ? `Post #${this.searchPostId}` : config.labelPrefix;
      }
      return this.currentPostId ? `Post #${this.currentPostId}` : config.labelPrefix;
    }

    getCurrentImageId() {
      if (this.isIqdbPage) {
        return this.searchPostId || "iqdb";
      }
      return this.currentPostId || "upload";
    }

    getElement(selector) {
      return document.querySelector(selector);
    }

    showError(message) {
      alert(message);
    }

    getOriginalImageUrl() {
      if (this.isUploadPage) {
        const uploadImage = this.getElement(DanbooruImageComparator.SELECTORS.UPLOAD_IMAGE);
        if (uploadImage) {
          return uploadImage.src;
        }
      }

      // For IQDB pages, return URL if available, null otherwise
      if (this.isIqdbPage) {
        return this.searchUrl || null;
      }

      return (
        this.getElement(DanbooruImageComparator.SELECTORS.ORIGINAL_LINK)?.href ||
        this.getElement(DanbooruImageComparator.SELECTORS.MAIN_IMAGE)?.src
      );
    }

    // Monitor DOM changes to add compare links to new content
    setupObserver() {
      const observer = new MutationObserver(() => this.addCompareLinks());
      observer.observe(document.body, { childList: true, subtree: true });
    }

    addCompareLinks() {
      const config = this.getCurrentPageConfig();

      if (!config.checkParams(this)) {
        return;
      }

      const selector = DanbooruImageComparator.SELECTORS[config.selector];
      document.querySelectorAll(selector).forEach((article) => {
        this.addCompareLinkToPost(article);
      });

      this.addCompareToMainMenu();
    }

    addCompareLinkToPost(article) {
      const postId = article.getAttribute("data-id");

      if (!postId || article.querySelector(".compare-link")) {
        return;
      }

      // Skip current post to avoid self-comparison
      if (
        postId === this.currentPostId ||
        (this.isIqdbPage && this.searchPostId && postId === this.searchPostId)
      ) {
        return;
      }

      const link = this.createCompareLink(postId);
      const scoreElement = article.querySelector(".post-preview-score");

      if (scoreElement) {
        article.insertBefore(link, scoreElement);
      } else {
        article.appendChild(link);
      }
    }

    addCompareToMainMenu() {
      const mainMenu = this.getElement(DanbooruImageComparator.SELECTORS.MAIN_MENU);
      if (!mainMenu || mainMenu.querySelector("#nav-compare")) {
        return;
      }

      const compareMenuItem = document.createElement("li");
      compareMenuItem.id = "nav-compare";

      const compareLink = document.createElement("a");
      compareLink.href = "#";
      compareLink.textContent = "Compare";
      compareLink.onclick = (e) => {
        e.preventDefault();
        this.openComparator(null);
      };

      compareMenuItem.appendChild(compareLink);
      mainMenu.appendChild(compareMenuItem);
    }

    createCompareLink(postId) {
      const container = document.createElement("div");
      container.className = "text-xs text-center mt-1";

      const link = document.createElement("a");
      link.href = "#";
      link.className = "compare-link";
      link.textContent = "compare »";
      link.onclick = (e) => {
        e.preventDefault();
        this.openComparator(postId);
      };

      container.appendChild(link);
      return container;
    }

    openComparator(postId) {
      this.createInterface();
      if (postId) {
        setTimeout(() => this.loadImage(postId), 100);
      }
    }

    // Extract posts with similarity scores from DOM
    extractPostsWithSimilarity(selector, additionalFilter = null) {
      return Array.from(document.querySelectorAll(selector))
        .map((article) => {
          const postData = this.extractPostData(article);
          if (!postData) {
            return null;
          }

          if (additionalFilter && !additionalFilter(postData)) {
            return null;
          }

          const similarityEl = article.querySelector(".iqdb-similarity-score");
          postData.similarity = similarityEl?.textContent || "";
          return postData;
        })
        .filter(Boolean);
    }

    getRelatedPosts() {
      const posts = [];
      this.extractFromPreviews(posts);
      this.extractFromNotices(posts);
      return posts;
    }

    getSimilarPosts() {
      return this.extractPostsWithSimilarity(DanbooruImageComparator.SELECTORS.SIMILAR_POSTS);
    }

    getIqdbPosts() {
      return this.extractPostsWithSimilarity(
        DanbooruImageComparator.SELECTORS.IQDB_SIMILAR_POSTS,
        (postData) => !(this.searchPostId && postData.id === this.searchPostId),
      );
    }

    extractFromPreviews(posts) {
      const selectors = [
        {
          selector: DanbooruImageComparator.SELECTORS.PARENT_PREVIEW,
          isParent: true,
        },
        {
          selector: DanbooruImageComparator.SELECTORS.CHILDREN_PREVIEW,
          isParent: false,
        },
      ];

      selectors.forEach(({ selector, isParent }) => {
        const preview = this.getElement(selector);
        if (!preview) {
          return;
        }

        preview.querySelectorAll("article.post-preview").forEach((article) => {
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

      if (!postId || !imgElement) {
        return null;
      }

      return {
        id: postId,
        thumbUrl: imgElement.src,
        title: imgElement.getAttribute("data-title") || `Post #${postId}`,
      };
    }

    isValidPostData(postData, existingPosts) {
      return (
        postData &&
        postData.id !== this.currentPostId &&
        !existingPosts.some((post) => post.id === postData.id)
      );
    }

    // Determine relationship type based on post hierarchy
    getRelationshipType(article, isParentPreview) {
      if (!isParentPreview) {
        return "Child";
      }

      const hasChildren = article.classList.contains("post-status-has-children");
      const hasParent = article.classList.contains("post-status-has-parent");

      if (hasChildren && !hasParent) {
        return "Parent";
      }
      if (hasParent && !hasChildren) {
        return "Sibling";
      }
      if (hasChildren && hasParent) {
        return "Parent";
      }
      return "Related";
    }

    extractFromNotices(posts) {
      const notice = this.getElement(".post-notice-parent, .post-notice-child");
      if (!notice) {
        return;
      }

      notice.querySelectorAll('a[href*="parent:"], a[href*="child:"]').forEach((link) => {
        const href = link.getAttribute("href");
        const postId = href.match(/[?&]tags=[^&]*[:%](\d+)/)?.[1];

        if (postId && !posts.some((post) => post.id === postId)) {
          posts.push({
            id: postId,
            thumbUrl: null,
            title: `Post #${postId}`,
            relationshipType: href.includes("parent:") ? "Parent" : "Child",
          });
        }
      });
    }

    async fetchPostData(postId) {
      const response = await fetch(`/posts/${postId}.json`);
      if (!response.ok) {
        throw new Error("Post not found");
      }
      return response.json();
    }

    async loadPostData(postId, targetElement, updateInfoCallback = null) {
      try {
        const data = await this.fetchPostData(postId);
        const imageUrl = data.file_url || data.large_file_url;

        targetElement.src = imageUrl;
        targetElement.setAttribute("data-id", postId);

        if (updateInfoCallback) {
          updateInfoCallback();
        }

        return data;
      } catch (error) {
        const errorMessage = `Failed to load post: ${error.message}`;
        console.warn(errorMessage);
        throw error;
      }
    }

    async loadSearchImage() {
      try {
        const leftImage = document.getElementById("left-image");
        await this.loadPostData(this.searchPostId, leftImage, () => this.updatePostInfo());
      } catch (error) {
        console.warn(`Failed to load search image: ${error.message}`);
      }
    }

    async loadPostById(postId) {
      try {
        const rightImage = document.getElementById("right-image");
        const data = await this.loadPostData(postId, rightImage);
        this.displayImage(data, postId);
      } catch (error) {
        this.showError(`Failed to load post: ${error.message}`);
      }
    }

    // Create the main comparison interface
    async createInterface() {
      const container = document.createElement("div");
      container.id = "image-comparison-container";
      container.innerHTML = this.getInterfaceHTML();

      container.setAttribute("tabindex", "0");
      container.style.outline = "none";

      document.body.appendChild(container);

      this.createPostSelector();
      this.bindAllEvents();
      this.initPanZoom();

      const savedMode = this.getSavedMode();
      this.currentMode = savedMode;
      document.getElementById("comparison-mode").value = savedMode;

      // Load search image for IQDB pages if available
      if (this.isIqdbPage && this.searchPostId && !this.originalImageUrl) {
        await this.loadSearchImage();
      }

      this.updateMode();
    }

    getInterfaceHTML() {
      const currentLabel = this.getCurrentLabel();
      const leftImageSrc = this.originalImageUrl || "";

      return `
        <div id="comparison-header">
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
          ${this.getModeControlsHTML()}
        </div>
        ${this.getComparisonContentHTML(leftImageSrc)}
      `;
    }

    getModeControlsHTML() {
      return `
        <div id="all-controls-row" class="header-section mode-control-section">
          <div id="transform-controls">
            <button id="flip-h-left" class="control-btn" title="Flip Left Horizontally">↔️ L</button>
            <button id="flip-v-left" class="control-btn" title="Flip Left Vertically">↕️ L</button>
            <button id="rotate-left" class="control-btn" title="Rotate Left">🔄 L</button>
            <button id="flip-h-right" class="control-btn" title="Flip Right Horizontally">↔️ R</button>
            <button id="flip-v-right" class="control-btn" title="Flip Right Vertically">↕️ R</button>
            <button id="rotate-right" class="control-btn" title="Rotate Right">🔄 R</button>
            <button id="reset-transform" class="control-btn" title="Reset Transforms">Reset</button>
          </div>
          <div id="filter-controls">
            <label>Brightness: <input type="range" id="brightness-slider" min="0" max="100" value="1"></label>
            <span id="brightness-value">1</span>
            <label>Saturate: <input type="range" id="saturate-slider" min="0" max="100" value="1"></label>
            <span id="saturate-value">1</span>
            <button id="reset-filters" class="control-btn">Reset Filters</button>
          </div>
          <div id="fade-controls">
            <label>Opacity: <input type="range" id="opacity-slider" min="0" max="100" value="50"></label>
            <span id="opacity-value">50%</span>
          </div>
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
        </div>
      `;
    }

    getComparisonContentHTML(leftImageSrc = "") {
      const leftImageId = this.getCurrentImageId();

      return `
        <div id="comparison-content">
          <div class="comparison-side" id="left-side">
            <div class="sync-pan" id="left-pan">
              <img id="left-image" src="${leftImageSrc}" data-id="${leftImageId}" />
            </div>
          </div>
          <div id="comparison-divider"></div>
          <div class="comparison-side" id="right-side">
            <div class="sync-pan" id="right-pan">
              <img id="right-image" />
            </div>
          </div>
          <div id="comparison-overlay-container">
            <div class="sync-pan" id="overlay-pan"></div>
          </div>
        </div>
      `;
    }

    createPostSelector() {
      const config = this.getCurrentPageConfig();
      const posts = this[config.getPostsMethod]();

      if (posts.length === 0) {
        return;
      }

      const input = document.getElementById("second-image-input");
      const selector = this.buildPostSelector(posts);
      input.parentElement.insertBefore(selector, input);
    }

    buildPostSelector(posts) {
      const container = document.createElement("div");
      container.className = "post-selector";

      const label = document.createElement("span");
      label.textContent = this.isIqdbPage || this.isUploadPage ? "Similar: " : "Related: ";

      const select = document.createElement("select");
      this.populateSelector(select, posts);

      select.onchange = () => {
        const selectedId = select.value;
        if (selectedId) {
          document.getElementById("second-image-input").value = selectedId;
          this.handleLoadImage();
        }
      };

      container.append(label, select);
      return container;
    }

    populateSelector(select, posts) {
      const defaultOption = new Option("-- Select post --", "");
      select.appendChild(defaultOption);

      posts.forEach((post) => {
        let text = `#${post.id}`;
        if ((this.isUploadPage || this.isIqdbPage) && post.similarity) {
          text += ` (${post.similarity})`;
        } else if (!(this.isUploadPage || this.isIqdbPage) && post.relationshipType) {
          text += ` (${post.relationshipType})`;
        }

        const option = new Option(text, post.id);
        select.appendChild(option);
      });
    }

    // Bind all event handlers with cleanup tracking
    bindAllEvents() {
      this.bindControlEvents();
      this.bindTransformEvents();
      this.bindInputEvents();
      this.bindModeEvents();
      this.bindKeyboardShortcuts();
    }

    bindKeyboardShortcuts() {
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

    bindControlEvents() {
      const controls = [
        ["close-comparison", () => this.closeInterface()],
        ["load-comparison", () => this.handleLoadImage()],
        ["swap-images", () => this.swapImages()],
        [
          "comparison-mode",
          () => {
            this.updateMode();
            this.saveMode();
          },
          "change",
        ],
      ];

      controls.forEach(([id, handler, event = "click"]) => {
        this.addEventListenerWithCleanup(id, event, handler);
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
        this.addEventListenerWithCleanup(id, "click", handler);
      });
    }

    bindInputEvents() {
      this.addEventListenerWithCleanup("second-image-input", "keypress", (e) => {
        if (e.key === "Enter") {
          this.handleLoadImage();
        }
      });
    }

    bindModeEvents() {
      // Fade mode opacity control
      const opacitySlider = document.getElementById("opacity-slider");
      if (opacitySlider) {
        opacitySlider.oninput = function () {
          const opacity = this.value / 100;
          const overlayImage = document.getElementById("overlay-image");
          if (overlayImage) {
            overlayImage.style.opacity = opacity;
            document.getElementById("opacity-value").textContent = `${this.value}%`;
          }
        };
      }

      // Difference mode controls
      this.addEventListenerWithCleanup("difference-background", "change", () => {
        this.updateDifferenceBackground();
      });

      this.addEventListenerWithCleanup("invert-difference", "click", () => {
        this.toggleDifferenceInvert();
      });

      // Filter controls
      const brightnessSlider = document.getElementById("brightness-slider");
      const saturateSlider = document.getElementById("saturate-slider");

      if (brightnessSlider && saturateSlider) {
        brightnessSlider.oninput = () => this.updateFilters();
        saturateSlider.oninput = () => this.updateFilters();

        this.addEventListenerWithCleanup("reset-filters", "click", () => {
          brightnessSlider.value = 1;
          saturateSlider.value = 1;
          this.updateFilters();
        });
      }
    }

    addEventListenerWithCleanup(elementId, event, handler) {
      const element = document.getElementById(elementId);
      if (!element) {
        return;
      }

      element.addEventListener(event, handler);
      this.eventCleanup.push(() => element.removeEventListener(event, handler));
    }

    closeInterface() {
      this.resetTransforms();
      this.destroyPanZoom();
      this.cleanupEvents();

      const container = document.getElementById("image-comparison-container");
      if (container) {
        document.body.removeChild(container);
      }
    }

    cleanupEvents() {
      this.eventCleanup.forEach((cleanup) => cleanup());
      this.eventCleanup = [];
    }

    handleLoadImage() {
      const input = document.getElementById("second-image-input").value.trim();
      if (!input) {
        this.showError("Please enter a valid post ID or URL");
        return;
      }
      this.loadImage(input);
    }

    // Handle different input types: post ID, URL, or direct image URL
    loadImage(input) {
      if (/^\d+$/.test(input)) {
        this.loadPostById(input);
      } else if (/https:\/\/danbooru\.donmai\.us\/posts\/\d+/.test(input)) {
        const postId = input.match(/\/posts\/(\d+)/)[1];
        this.loadPostById(postId);
      } else {
        this.loadDirectUrl(input);
      }
    }

    displayImage(data, postId) {
      const rightImage = document.getElementById("right-image");
      const imageUrl = data.file_url || data.large_file_url;

      rightImage.src = imageUrl;
      rightImage.setAttribute("data-id", postId);

      this.updateUI(postId);
      this.resetZoom();
      this.updateMode();
    }

    loadDirectUrl(url) {
      try {
        new URL(url);
        const rightImage = document.getElementById("right-image");

        rightImage.onerror = () => {
          this.showError(`Failed to load image: ${url}`);
          rightImage.onerror = null;
        };

        rightImage.onload = () => {
          rightImage.setAttribute("data-id", "custom");
          this.updateUI("custom");
          this.resetZoom();
          this.updateMode();
          rightImage.onload = null;
        };

        rightImage.src = url;
      } catch {
        this.showError("Invalid URL format");
      }
    }

    updateUI(postId) {
      this.updatePostInfo();
      document.getElementById("second-image-input").value = postId === "custom" ? "" : postId;

      const selector = document.querySelector(".post-selector select");
      if (selector && postId !== "custom") {
        selector.value = postId;
      }
    }

    updatePostInfo() {
      const leftId = document.getElementById("left-image").getAttribute("data-id");
      const rightId = document.getElementById("right-image").getAttribute("data-id");

      let display = "";
      if (leftId && rightId) {
        const leftLabel = leftId === "iqdb" ? "IQDB" : `#${leftId}`;
        const rightLabel = rightId === "custom" ? "Custom" : `#${rightId}`;
        display = `Compare: ${leftLabel} vs ${rightLabel}`;
      }

      document.getElementById("post-info-display").textContent = display;
    }

    // Swap left and right images including their transform states
    swapImages() {
      const leftImg = document.getElementById("left-image");
      const rightImg = document.getElementById("right-image");

      [leftImg.src, rightImg.src] = [rightImg.src, leftImg.src];

      const leftId = leftImg.getAttribute("data-id");
      const rightId = rightImg.getAttribute("data-id");
      leftImg.setAttribute("data-id", rightId);
      rightImg.setAttribute("data-id", leftId);

      [this.transforms.left, this.transforms.right] = [this.transforms.right, this.transforms.left];

      this.updatePostInfo();

      const currentMode = document.getElementById("comparison-mode").value;
      if (currentMode !== DanbooruImageComparator.MODES.SIDE_BY_SIDE) {
        this.updateMode();
      } else {
        this.applyTransforms();
      }
    }

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

    // Apply transforms to all relevant image elements
    applyTransforms() {
      const imageMap = {
        left: ["left-image", "overlay-left-image", "slider-left-image"],
        right: ["right-image", "overlay-image", "slider-right-image"],
      };

      // Clear all transform classes first
      Object.values(imageMap)
        .flat()
        .forEach((id) => {
          const img = document.getElementById(id);
          if (img) {
            img.classList.remove("flip-h", "flip-v", "rotate-90", "rotate-180", "rotate-270");
          }
        });

      // Apply current transforms
      Object.entries(imageMap).forEach(([side, imageIds]) => {
        imageIds.forEach((id) => {
          const img = document.getElementById(id);
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

      const rotationClass = {
        90: "rotate-90",
        180: "rotate-180",
        270: "rotate-270",
      }[state.rotation];

      if (rotationClass) {
        element.classList.add(rotationClass);
      }
    }

    // Main comparison mode switching with zoom state preservation
    updateMode() {
      this.saveZoomState();
      this.cleanupModeElements();
      this.cleanupWheelListeners();

      const mode = document.getElementById("comparison-mode").value;
      const previousMode = this.currentMode || mode;

      this.currentMode = mode;

      // Adjust zoom state when switching between overlay and side-by-side modes
      if (previousMode !== mode && this.isOverlayMode(previousMode) !== this.isOverlayMode(mode)) {
        this.calculateAndUpdateZoomState(previousMode, mode);
      }

      this.resetDisplay();

      switch (mode) {
        case DanbooruImageComparator.MODES.SLIDER:
          this.setupSliderMode();
          break;
        case DanbooruImageComparator.MODES.FADE:
          this.setupFadeMode();
          break;
        case DanbooruImageComparator.MODES.DIFFERENCE:
          this.setupDifferenceMode();
          break;
        default:
          setTimeout(() => this.restoreZoomState(), 100);
          break;
      }

      setTimeout(() => this.applyTransforms(), 0);

      requestAnimationFrame(() => {
        const container = document.getElementById("image-comparison-container");
        if (container) {
          container.focus();
        }
      });
    }

    // Calculate zoom adjustment for mode transitions
    calculateAndUpdateZoomState(fromMode, toMode) {
      if (!this.zoomState) {
        return;
      }

      const isFromOverlay = this.isOverlayMode(fromMode);
      const isToOverlay = this.isOverlayMode(toMode);

      if (isFromOverlay === isToOverlay) {
        return;
      }

      const referenceImg = document.getElementById("left-image");
      const comparisonContent = document.getElementById("comparison-content");

      if (!referenceImg || !comparisonContent || !referenceImg.naturalWidth) {
        return;
      }

      const contentWidth = comparisonContent.clientWidth;
      const contentHeight = comparisonContent.clientHeight;
      const dividerWidth = 4;
      const sideWidth = (contentWidth - dividerWidth) / 2;

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
        this.zoomState.scale *= heightRatio;
        this.zoomState.y *= heightRatio;

        this.zoomState.scale = Math.max(0.1, this.zoomState.scale);
      }
    }

    cleanupModeElements() {
      if (this.panzoomInstances.overlay) {
        this.panzoomInstances.overlay.destroy();
        this.panzoomInstances.overlay = null;
      }
    }

    // Clean up wheel event listeners to prevent conflicts
    cleanupWheelListeners() {
      ["left-side", "right-side", "comparison-overlay-container"].forEach((id) => {
        const element = document.getElementById(id);
        if (element?._wheelListener) {
          element.removeEventListener("wheel", element._wheelListener);
          delete element._wheelListener;
        }
      });

      const overlayContainer = document.getElementById("comparison-overlay-container");
      if (overlayContainer) {
        this.cleanWheelListenersFromElement(overlayContainer);
      }
    }

    cleanWheelListenersFromElement(element) {
      if (!element) {
        return;
      }

      if (element._wheelListener) {
        element.removeEventListener("wheel", element._wheelListener);
        delete element._wheelListener;
      }

      element.setAttribute("data-wheel-cleaned", "true");
    }

    saveZoomState() {
      const activeInstance = this.getActivePanzoomInstance();
      if (activeInstance) {
        const pan = activeInstance.getPan();
        this.zoomState = {
          scale: activeInstance.getScale(),
          x: pan.x,
          y: pan.y,
          mode: this.currentMode || document.getElementById("comparison-mode").value,
        };
      }
    }

    isOverlayMode(mode) {
      return [
        DanbooruImageComparator.MODES.SLIDER,
        DanbooruImageComparator.MODES.FADE,
        DanbooruImageComparator.MODES.DIFFERENCE,
      ].includes(mode);
    }

    getActivePanzoomInstance() {
      return (
        this.panzoomInstances.overlay || this.panzoomInstances.left || this.panzoomInstances.right
      );
    }

    calculateImageDisplayHeight(img, containerWidth, containerHeight) {
      if (!(img?.naturalWidth && img?.naturalHeight)) {
        return containerHeight;
      }

      const imageAspect = img.naturalWidth / img.naturalHeight;
      const containerAspect = containerWidth / containerHeight;

      if (imageAspect > containerAspect) {
        return containerWidth / imageAspect;
      } else {
        return containerHeight;
      }
    }

    restoreZoomState() {
      Object.values(this.panzoomInstances).forEach((instance) => {
        if (instance) {
          instance.zoom(this.zoomState.scale, { animate: false, silent: true });
          instance.pan(this.zoomState.x, this.zoomState.y, {
            animate: false,
            silent: true,
          });
        }
      });
    }

    resetDisplay() {
      const elements = ["left-side", "right-side", "comparison-divider"];
      elements.forEach((id) => {
        const el = document.getElementById(id);
        el.style.display = id === "comparison-divider" ? "block" : "flex";
      });

      const overlayContainer = document.getElementById("comparison-overlay-container");
      overlayContainer.innerHTML = '<div class="sync-pan" id="overlay-pan"></div>';
      overlayContainer.style.display = "none";
      overlayContainer.style.backgroundColor = "";
      overlayContainer.classList.remove("difference-inverted");

      ["fade-controls", "difference-controls"].forEach((id) => {
        document.getElementById(id).style.display = "none";
      });

      document.getElementById("filter-controls").style.display = "flex";
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

      document.getElementById("overlay-image").style.opacity = "0.5";
      document.getElementById("fade-controls").style.display = "flex";
    }

    setupDifferenceMode() {
      this.hideMainElements();
      this.showOverlay();
      this.createOverlayImages();
      this.initOverlayPanZoom();

      const overlayImage = document.getElementById("overlay-image");
      overlayImage.style.mixBlendMode = "difference";
      overlayImage.style.opacity = "1";

      document.getElementById("comparison-overlay-container").style.backgroundColor = "#000000";
      document.getElementById("difference-controls").style.display = "flex";
      document.getElementById("difference-background").value = "black";
    }

    hideMainElements() {
      ["left-side", "right-side", "comparison-divider"].forEach((id) => {
        document.getElementById(id).style.display = "none";
      });
    }

    showOverlay() {
      document.getElementById("comparison-overlay-container").style.display = "block";
    }

    createOverlayImages() {
      const container = document.getElementById("overlay-pan");
      const leftImage = document.getElementById("left-image");
      const rightImage = document.getElementById("right-image");

      const overlayStyle =
        "position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; margin: auto;";

      const leftClone = leftImage.cloneNode(true);
      leftClone.id = "overlay-left-image";
      leftClone.style.cssText = overlayStyle;

      const rightClone = rightImage.cloneNode(true);
      rightClone.id = "overlay-image";
      rightClone.style.cssText = overlayStyle;

      container.append(leftClone, rightClone);
    }

    initOverlayPanZoom() {
      const overlayPan = document.getElementById("overlay-pan");
      const overlayContainer = document.getElementById("comparison-overlay-container");

      this.panzoomInstances.overlay = Panzoom(overlayPan, {
        maxScale: Infinity,
      });

      if (this.zoomState) {
        this.panzoomInstances.overlay.zoom(this.zoomState.scale, {
          animate: false,
          silent: true,
        });
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

    // Initialize slider comparison with draggable divider
    initSlider() {
      const container = document.getElementById("comparison-overlay-container");
      const rightImage = document.getElementById("overlay-image");

      let slider = document.getElementById("comparison-slider");
      if (!slider) {
        slider = document.createElement("div");
        slider.id = "comparison-slider";
        container.appendChild(slider);
      }

      const centerX = container.clientWidth / 2;
      this.updateSlider(slider, rightImage, centerX, container);
      this.bindSliderEvents(slider, rightImage, container);
    }

    // Update slider position and clip path for comparison
    updateSlider(slider, rightImage, containerX, container) {
      const containerWidth = container.clientWidth;
      containerX = Math.max(0, Math.min(containerX, containerWidth));

      slider.style.left = `${containerX}px`;

      // Calculate clip path based on current zoom and pan state
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

    // Bind slider drag events with zoom coordination
    bindSliderEvents(slider, rightImage, container) {
      let isDragging = false;

      const updatePosition = (e) => {
        const containerX = e.clientX - container.getBoundingClientRect().left;
        this.updateSlider(slider, rightImage, containerX, container);
      };

      const mouseDownHandler = (e) => {
        e.preventDefault();
        isDragging = true;
      };

      const mouseMoveHandler = (e) => {
        if (isDragging) {
          updatePosition(e);
        }
      };

      const containerMouseDownHandler = (e) => {
        if (e.target !== slider) {
          updatePosition(e);
          isDragging = true;
        }
      };

      const mouseUpHandler = () => {
        isDragging = false;
      };

      const getCurrentSliderPosition = () => {
        return parseInt(slider.style.left) || container.clientWidth / 2;
      };

      // Update slider on zoom/pan changes
      const panzoomChangeHandler = () => {
        const currentPosition = getCurrentSliderPosition();
        this.updateSlider(slider, rightImage, currentPosition, container);
      };

      const overlayPan = document.getElementById("overlay-pan");
      if (overlayPan && this.panzoomInstances.overlay) {
        overlayPan.addEventListener("panzoomchange", panzoomChangeHandler);
        overlayPan.addEventListener("panzoomzoom", panzoomChangeHandler);
        overlayPan.addEventListener("panzoompan", panzoomChangeHandler);

        this.eventCleanup.push(() => {
          overlayPan.removeEventListener("panzoomchange", panzoomChangeHandler);
          overlayPan.removeEventListener("panzoomzoom", panzoomChangeHandler);
          overlayPan.removeEventListener("panzoompan", panzoomChangeHandler);
        });
      }

      slider.addEventListener("mousedown", mouseDownHandler);
      container.addEventListener("mousemove", mouseMoveHandler);
      container.addEventListener("mousedown", containerMouseDownHandler);
      document.addEventListener("mouseup", mouseUpHandler);

      this.eventCleanup.push(() => {
        slider.removeEventListener("mousedown", mouseDownHandler);
        container.removeEventListener("mousemove", mouseMoveHandler);
        container.removeEventListener("mousedown", containerMouseDownHandler);
        document.removeEventListener("mouseup", mouseUpHandler);
      });
    }

    updateDifferenceBackground() {
      const background = document.getElementById("difference-background").value;
      const colors = { black: "#000000", grey: "#808080", white: "#ffffff" };
      document.getElementById("comparison-overlay-container").style.backgroundColor =
        colors[background] || "#000000";
    }

    toggleDifferenceInvert() {
      const container = document.getElementById("comparison-overlay-container");
      const invertBtn = document.getElementById("invert-difference");

      if (container.classList.contains("difference-inverted")) {
        container.classList.remove("difference-inverted");
        invertBtn.textContent = "Invert";
      } else {
        container.classList.add("difference-inverted");
        invertBtn.textContent = "Normal";
      }
    }

    // Initialize synchronized pan and zoom for side-by-side mode
    initPanZoom() {
      const leftPan = document.getElementById("left-pan");
      const rightPan = document.getElementById("right-pan");

      if (this.panzoomInstances.left) {
        this.panzoomInstances.left.destroy();
      }
      if (this.panzoomInstances.right) {
        this.panzoomInstances.right.destroy();
      }

      const options = { maxScale: Infinity };
      this.panzoomInstances.left = Panzoom(leftPan, options);
      this.panzoomInstances.right = Panzoom(rightPan, options);

      setTimeout(() => this.restoreZoomState(), 0);

      this.syncPanZoom(leftPan, rightPan, this.panzoomInstances.left, this.panzoomInstances.right);
      this.bindPanZoomEvents();
    }

    // Synchronize pan and zoom between left and right panels
    syncPanZoom(leftPan, rightPan, leftPanzoom, rightPanzoom) {
      let isUpdating = false;

      const syncHandler = (targetPanzoom) => (event) => {
        if (isUpdating) {
          return;
        }
        isUpdating = true;
        const { x, y, scale } = event.detail;
        targetPanzoom.zoom(scale, { animate: false, silent: true });
        targetPanzoom.pan(x, y, { animate: false, silent: true });
        isUpdating = false;
      };

      const leftHandler = syncHandler(rightPanzoom);
      const rightHandler = syncHandler(leftPanzoom);

      leftPan.addEventListener("panzoomchange", leftHandler);
      rightPan.addEventListener("panzoomchange", rightHandler);

      this.eventCleanup.push(() => {
        leftPan.removeEventListener("panzoomchange", leftHandler);
        rightPan.removeEventListener("panzoomchange", rightHandler);
      });
    }

    bindPanZoomEvents() {
      const leftSide = document.getElementById("left-side");
      const rightSide = document.getElementById("right-side");

      const wheelHandler = (panzoom) => (event) => {
        event.preventDefault();
        panzoom.zoomWithWheel(event);
      };

      const leftWheelHandler = wheelHandler(this.panzoomInstances.left);
      const rightWheelHandler = wheelHandler(this.panzoomInstances.right);

      leftSide.addEventListener("wheel", leftWheelHandler);
      rightSide.addEventListener("wheel", rightWheelHandler);

      this.eventCleanup.push(() => {
        leftSide.removeEventListener("wheel", leftWheelHandler);
        rightSide.removeEventListener("wheel", rightWheelHandler);
      });

      this.addEventListenerWithCleanup("reset-zoom", "click", () => this.resetZoom());
    }

    resetZoom() {
      Object.values(this.panzoomInstances).forEach((instance) => {
        if (instance) {
          instance.reset();
        }
      });
    }

    destroyPanZoom() {
      Object.values(this.panzoomInstances).forEach((instance) => {
        if (instance) {
          instance.destroy();
        }
      });
      this.panzoomInstances = {};
    }

    // Persist user's preferred comparison mode
    saveMode() {
      const mode = document.getElementById("comparison-mode").value;
      try {
        localStorage.setItem(DanbooruImageComparator.STORAGE_KEY, mode);
      } catch (e) {
        console.warn("Failed to save mode:", e);
      }
    }

    getSavedMode() {
      try {
        const saved = localStorage.getItem(DanbooruImageComparator.STORAGE_KEY);
        if (saved && Object.values(DanbooruImageComparator.MODES).includes(saved)) {
          return saved;
        }
      } catch (e) {
        console.warn("Failed to load mode:", e);
      }
      return DanbooruImageComparator.MODES.SIDE_BY_SIDE;
    }

    updateFilters() {
      const brightnessValue = document.getElementById("brightness-slider").value;
      const saturateValue = document.getElementById("saturate-slider").value;

      document.getElementById("brightness-value").textContent = `${brightnessValue}`;
      document.getElementById("saturate-value").textContent = `${saturateValue}`;

      const overlayPan = document.getElementById("overlay-pan");
      if (overlayPan) {
        overlayPan.style.filter = `brightness(${brightnessValue}) saturate(${saturateValue})`;
      }
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => new DanbooruImageComparator());
  } else {
    new DanbooruImageComparator();
  }
})();
