// ==UserScript==
// @name         Danbooru Image Comparator
// @namespace    https://github.com/NekoAria/JavaScript-Tools
// @version      0.6
// @description  Compare images on Danbooru to identify differences, with rotation, flipping and difference mode support
// @author       Neko_Aria
// @match        https://danbooru.donmai.us/posts/*
// @match        https://danbooru.donmai.us/uploads/*
// @require      https://unpkg.com/@panzoom/panzoom@4.6.0/dist/panzoom.min.js
// ==/UserScript==

(function () {
  "use strict";

  class DanbooruImageComparator {
    // Comparison display modes
    static MODES = {
      SIDE_BY_SIDE: "side-by-side",
      SLIDER: "slider",
      FADE: "fade",
      DIFFERENCE: "difference",
    };

    // Image rotation angles
    static ROTATION = {
      NORMAL: 0,
      RIGHT: 90,
      INVERTED: 180,
      LEFT: 270,
    };

    // CSS selectors for common elements
    static SELECTORS = {
      POST_ID_META: 'meta[name="post-id"]',
      UPLOAD_IMAGE: ".media-asset-image",
      ORIGINAL_LINK: ".image-view-original-link",
      MAIN_IMAGE: "#image",
      SIMILAR_POSTS: "#iqdb-similar .post-preview",
      RELATED_POSTS: "article.post-preview:not(.current-post)",
      PARENT_PREVIEW: "#has-parent-relationship-preview",
      CHILDREN_PREVIEW: "#has-children-relationship-preview",
    };

    // Storage keys
    static STORAGE_KEYS = {
      COMPARISON_MODE: "danbooru_comparator_mode",
    };

    constructor() {
      if (!this.isValidPage()) {
        return;
      }

      this.initializeState();
      this.setupInterface();
      this.zoomState = { scale: 1, x: 0, y: 0 };
    }

    // Check if current page supports the comparator
    isValidPage() {
      // Updated regex to support multi-asset uploads: /uploads/123/assets/456
      return /\/(posts|uploads)\/\d+($|\?|\/assets\/\d+)/.test(
        window.location.href
      );
    }

    // Initialize all state variables
    initializeState() {
      this.isUploadPage = window.location.href.includes("/uploads/");
      this.config = {
        currentPostId: document.querySelector(
          DanbooruImageComparator.SELECTORS.POST_ID_META
        )?.content,
        originalImageUrl: this.getOriginalImageUrl(),
      };

      // Track transformation state for both images
      this.transformState = {
        left: { flipH: false, flipV: false, rotation: 0 },
        right: { flipH: false, flipV: false, rotation: 0 },
      };

      // Store pan-zoom instances
      this.panzoomInstances = {
        left: null,
        right: null,
        overlay: null,
      };
    }

    // Get the original image URL based on page type
    getOriginalImageUrl() {
      if (this.isUploadPage) {
        const uploadImage = document.querySelector(
          DanbooruImageComparator.SELECTORS.UPLOAD_IMAGE
        );
        if (uploadImage) {
          return uploadImage.src;
        }
      }

      return (
        document.querySelector(DanbooruImageComparator.SELECTORS.ORIGINAL_LINK)
          ?.href ||
        document.querySelector(DanbooruImageComparator.SELECTORS.MAIN_IMAGE)
          ?.src
      );
    }

    // Setup the main interface and observers
    setupInterface() {
      this.injectStyles();
      this.addCompareLinks();
      this.setupPageObserver();
    }

    // Watch for dynamic content changes
    setupPageObserver() {
      const observer = new MutationObserver(() => this.addCompareLinks());
      observer.observe(document.body, { childList: true, subtree: true });
    }

    // Add compare links to related/similar posts
    addCompareLinks() {
      const articles = document.querySelectorAll(
        this.isUploadPage
          ? DanbooruImageComparator.SELECTORS.SIMILAR_POSTS
          : DanbooruImageComparator.SELECTORS.RELATED_POSTS
      );

      articles.forEach((article) => this.addCompareLinkToPost(article));
    }

    // Add compare link to individual post preview
    addCompareLinkToPost(article) {
      const postId = article.getAttribute("data-id");

      if (
        !postId ||
        postId === this.config.currentPostId ||
        article.querySelector(".compare-link")
      ) {
        return;
      }

      const compareLink = this.createCompareLink(postId);
      const scoreElement = article.querySelector(".post-preview-score");

      if (scoreElement) {
        article.insertBefore(compareLink, scoreElement);
      } else {
        article.appendChild(compareLink);
      }
    }

    // Create a clickable compare link
    createCompareLink(postId) {
      const container = document.createElement("div");
      container.className = "text-xs text-center mt-1";

      const link = document.createElement("a");
      link.href = "#";
      link.className = "compare-link";
      link.textContent = "compare »";
      link.addEventListener("click", (e) => {
        e.preventDefault();
        this.openComparison(postId);
      });

      container.appendChild(link);
      return container;
    }

    // Open comparison interface with specified post
    openComparison(postId) {
      this.createComparisonInterface();
      setTimeout(() => this.loadComparisonImage(postId), 100);
    }

    // === POST DATA RETRIEVAL ===

    // Get related posts data for current page
    getRelatedPosts() {
      const posts = [];
      this.extractFromRelationshipPreviews(posts);
      this.extractFromRelationshipNotices(posts);
      return posts;
    }

    // Extract posts from parent/children preview sections
    extractFromRelationshipPreviews(posts) {
      const parentPreview = document.querySelector(
        DanbooruImageComparator.SELECTORS.PARENT_PREVIEW
      );
      const childrenPreview = document.querySelector(
        DanbooruImageComparator.SELECTORS.CHILDREN_PREVIEW
      );

      if (parentPreview) {
        this.extractPostsFromPreview(parentPreview, posts, true);
      }
      if (childrenPreview) {
        this.extractPostsFromPreview(childrenPreview, posts, false);
      }
    }

    // Extract post data from preview section
    extractPostsFromPreview(preview, posts, isParentPreview) {
      const articles = preview.querySelectorAll("article.post-preview");

      articles.forEach((article) => {
        const postData = this.extractPostData(article);
        if (
          !postData ||
          postData.id === this.config.currentPostId ||
          posts.find((post) => post.id === postData.id)
        ) {
          return;
        }

        postData.relationshipType = this.determineRelationshipType(
          article,
          isParentPreview
        );
        posts.push(postData);
      });
    }

    // Extract basic post data from article element
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

    // Determine relationship type based on post status classes
    determineRelationshipType(article, isParentPreview) {
      if (!isParentPreview) {
        return "Child";
      }

      const hasChildren = article.classList.contains(
        "post-status-has-children"
      );
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

    // Extract posts from relationship notice links
    extractFromRelationshipNotices(posts) {
      const notice = document.querySelector(
        ".post-notice-parent, .post-notice-child"
      );
      if (!notice) {
        return;
      }

      const links = notice.querySelectorAll(
        'a[href*="parent:"], a[href*="child:"]'
      );
      links.forEach((link) => {
        const postId = this.extractPostIdFromHref(link.getAttribute("href"));
        if (postId && !posts.some((post) => post.id === postId)) {
          posts.push({
            id: postId,
            thumbUrl: null,
            title: `Post #${postId}`,
            relationshipType: link.href.includes("parent:")
              ? "Parent"
              : "Child",
          });
        }
      });
    }

    // Extract post ID from href parameter
    extractPostIdFromHref(href) {
      const match = href.match(/[?&]tags=[^&]*[:%](\d+)/);
      return match?.[1];
    }

    // Get similar posts for upload pages
    getSimilarPosts() {
      if (!this.isUploadPage) {
        return [];
      }

      const posts = [];
      const articles = document.querySelectorAll(
        DanbooruImageComparator.SELECTORS.SIMILAR_POSTS
      );

      articles.forEach((article) => {
        const postData = this.extractPostData(article);
        if (!postData) {
          return;
        }

        const similarityElement = article.querySelector(
          ".iqdb-similarity-score"
        );
        postData.similarity = similarityElement?.textContent || "";
        posts.push(postData);
      });

      return posts;
    }

    // === UI CREATION ===

    // Create main comparison interface
    createComparisonInterface() {
      const container = this.buildMainContainer();
      document.body.appendChild(container);

      this.createPostSelector();
      this.bindEvents();
      this.initializePanZoom();

      // Set saved comparison mode or default to side-by-side
      const savedMode = this.getSavedComparisonMode();
      this.getElementById("comparison-mode").value = savedMode;
      this.updateComparisonMode();
    }

    // Build the main container HTML structure
    buildMainContainer() {
      const container = document.createElement("div");
      container.id = "image-comparison-container";
      container.innerHTML = this.getMainHTML();
      return container;
    }

    // Generate main HTML structure
    getMainHTML() {
      return `
          <div id="comparison-header">
            <div class="header-section">
              <span>Current: ${this.config.currentPostId || "upload"}</span>
              <input id="second-image-input" type="text" placeholder="Enter ID or URL" />
              <button id="load-comparison" class="control-btn">Load</button>
              <span class="mode-label">Mode:</span>
              <select id="comparison-mode">
                <option value="side-by-side">Side by Side</option>
                <option value="slider">Slider</option>
                <option value="fade">Fade</option>
                <option value="difference">Difference</option>
              </select>
            </div>
            <div id="post-info-display"></div>
            ${this.getTransformControlsHTML()}
            <div class="header-section">
              <button id="swap-images" class="control-btn">Swap</button>
              <button id="reset-zoom" class="control-btn">Reset Zoom</button>
              <button id="close-comparison" class="control-btn">✕</button>
            </div>
            <div id="fade-controls" class="header-section" style="display: none;">
              <label>Opacity:
                <input type="range" id="opacity-slider" min="0" max="100" value="50">
              </label>
              <span id="opacity-value">50%</span>
            </div>
            <div id="difference-controls" class="header-section" style="display: none;">
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
          ${this.getComparisonContentHTML()}
        `;
    }

    // Generate transform controls HTML
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

    // Generate comparison content area HTML
    getComparisonContentHTML() {
      return `
          <div id="comparison-content">
            <div class="comparison-side" id="left-side">
              <div class="sync-pan" id="left-pan">
                <img id="left-image" src="${this.config.originalImageUrl}"
                     data-id="${this.config.currentPostId || "upload"}" />
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

    // Create post selector dropdown
    createPostSelector() {
      const posts = this.isUploadPage
        ? this.getSimilarPosts()
        : this.getRelatedPosts();
      if (posts.length === 0) {
        return;
      }

      const input = this.getElementById("second-image-input");
      const selector = this.buildPostSelector(posts);
      input.parentElement.insertBefore(selector, input);
    }

    // Build post selector element
    buildPostSelector(posts) {
      const container = document.createElement("div");
      container.className = "post-selector";

      const label = document.createElement("span");
      label.textContent = this.isUploadPage ? "Similar: " : "Related: ";

      const select = document.createElement("select");
      this.populatePostSelector(select, posts);
      this.bindPostSelectorEvents(select);

      container.append(label, select);
      return container;
    }

    // Populate selector with post options
    populatePostSelector(select, posts) {
      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = "-- Select post --";
      select.appendChild(defaultOption);

      posts.forEach((post) => {
        const option = document.createElement("option");
        option.value = post.id;

        let text = `#${post.id}`;
        if (this.isUploadPage && post.similarity) {
          text += ` (${post.similarity})`;
        } else if (!this.isUploadPage && post.relationshipType) {
          text += ` (${post.relationshipType})`;
        }

        option.textContent = text;
        select.appendChild(option);
      });
    }

    // Bind post selector change events
    bindPostSelectorEvents(select) {
      select.addEventListener("change", () => {
        const selectedId = select.value;
        if (selectedId) {
          this.getElementById("second-image-input").value = selectedId;
          this.handleLoadComparison();
        }
      });
    }

    // === EVENT BINDING ===

    // Bind all event handlers
    bindEvents() {
      this.bindControlEvents();
      this.bindTransformEvents();
      this.bindInputEvents();
      this.bindDifferenceEvents();
    }

    // Bind main control button events
    bindControlEvents() {
      const eventMap = [
        ["close-comparison", () => this.closeInterface()],
        ["load-comparison", () => this.handleLoadComparison()],
        ["swap-images", () => this.swapImages()],
      ];

      eventMap.forEach(([id, handler]) => {
        this.getElementById(id).addEventListener("click", handler);
      });

      // Use 'change' event instead of 'click' for mode selection to prevent triggering on just clicking the dropdown
      const modeSelector = this.getElementById("comparison-mode");
      modeSelector.addEventListener("change", () => {
        this.updateComparisonMode();
        this.saveComparisonMode();
      });
    }

    // Bind image transformation events
    bindTransformEvents() {
      const transformMap = [
        ["flip-h-left", () => this.toggleTransform("left", "flipH")],
        ["flip-v-left", () => this.toggleTransform("left", "flipV")],
        ["rotate-left", () => this.rotateImage("left")],
        ["flip-h-right", () => this.toggleTransform("right", "flipH")],
        ["flip-v-right", () => this.toggleTransform("right", "flipV")],
        ["rotate-right", () => this.rotateImage("right")],
        ["reset-transform", () => this.resetAllTransforms()],
      ];

      transformMap.forEach(([id, handler]) => {
        this.getElementById(id).addEventListener("click", handler);
      });
    }

    // Bind input field events
    bindInputEvents() {
      this.getElementById("second-image-input").addEventListener(
        "keypress",
        (e) => {
          if (e.key === "Enter") {
            this.handleLoadComparison();
          }
        }
      );
    }

    // Bind difference mode specific events
    bindDifferenceEvents() {
      // Background change event
      const backgroundSelect = this.getElementById("difference-background");
      if (backgroundSelect) {
        backgroundSelect.addEventListener("change", () => {
          this.updateDifferenceBackground();
        });
      }

      // Invert difference event
      const invertBtn = this.getElementById("invert-difference");
      if (invertBtn) {
        invertBtn.addEventListener("click", () => {
          this.toggleDifferenceInvert();
        });
      }
    }

    // Close comparison interface
    closeInterface() {
      this.resetAllTransforms();
      this.destroyPanZoom();
      const container = this.getElementById("image-comparison-container");
      if (container) {
        document.body.removeChild(container);
      }
    }

    // === IMAGE LOADING ===

    // Handle comparison loading request
    handleLoadComparison() {
      const input = this.getElementById("second-image-input").value.trim();
      if (!input) {
        this.showError("Please enter a valid post ID or URL");
        return;
      }
      this.loadComparisonImage(input);
    }

    // Load comparison image based on input type
    loadComparisonImage(input) {
      if (/^\d+$/.test(input)) {
        this.loadPostById(input);
      } else if (/https:\/\/danbooru\.donmai\.us\/posts\/\d+/.test(input)) {
        const postId = input.match(/\/posts\/(\d+)/)[1];
        this.loadPostById(postId);
      } else {
        this.loadDirectImageUrl(input);
      }
    }

    // Load post by ID via API
    loadPostById(postId) {
      fetch(`/posts/${postId}.json`)
        .then((response) => {
          if (!response.ok) {
            throw new Error("Post not found");
          }
          return response.json();
        })
        .then((data) => this.displayPostImage(data, postId))
        .catch((error) =>
          this.showError(`Failed to load post: ${error.message}`)
        );
    }

    // Display loaded post image
    displayPostImage(data, postId) {
      const rightImage = this.getElementById("right-image");
      const imageUrl = data.file_url || data.large_file_url;

      rightImage.src = imageUrl;
      rightImage.setAttribute("data-id", postId);

      this.updateUI(postId);
      this.resetZoom();
      this.updateComparisonMode();
    }

    // Load image from direct URL
    loadDirectImageUrl(url) {
      try {
        new URL(url); // Validate URL format
        const rightImage = this.getElementById("right-image");

        rightImage.onerror = () => {
          this.showError(`Failed to load image: ${url}`);
          rightImage.onerror = null;
        };

        rightImage.onload = () => {
          rightImage.setAttribute("data-id", "custom");
          this.updateUI("custom");
          this.resetZoom();
          this.updateComparisonMode();
          rightImage.onload = null;
        };

        rightImage.src = url;
      } catch (e) {
        this.showError(
          "Invalid URL format. Please enter a valid post ID, Danbooru URL, or image URL"
        );
      }
    }

    // Update UI elements after loading image
    updateUI(postId) {
      this.updatePostInfoDisplay();
      this.updateInputField(postId);
      this.updatePostSelector(postId);
    }

    // Update post info display
    updatePostInfoDisplay() {
      const leftId = this.getElementById("left-image").getAttribute("data-id");
      const rightId =
        this.getElementById("right-image").getAttribute("data-id");

      const displayText =
        leftId && rightId ? `Compare: #${leftId} vs #${rightId}` : "";
      this.getElementById("post-info-display").textContent = displayText;
    }

    // Update input field value
    updateInputField(postId) {
      const inputField = this.getElementById("second-image-input");
      if (inputField) {
        inputField.value = postId === "custom" ? "" : postId;
      }
    }

    // Update post selector dropdown
    updatePostSelector(postId) {
      const postSelector = document.querySelector(".post-selector select");
      if (postSelector && postId !== "custom") {
        const option = Array.from(postSelector.options).find(
          (opt) => opt.value === postId
        );
        if (option) {
          postSelector.value = postId;
        }
      }
    }

    // === IMAGE OPERATIONS ===

    // Swap left and right images
    swapImages() {
      const leftImg = this.getElementById("left-image");
      const rightImg = this.getElementById("right-image");

      // Swap sources and IDs
      [leftImg.src, rightImg.src] = [rightImg.src, leftImg.src];

      const leftId = leftImg.getAttribute("data-id");
      const rightId = rightImg.getAttribute("data-id");
      leftImg.setAttribute("data-id", rightId);
      rightImg.setAttribute("data-id", leftId);

      // Swap transform states
      [this.transformState.left, this.transformState.right] = [
        this.transformState.right,
        this.transformState.left,
      ];

      this.updatePostInfoDisplay();

      // Refresh current mode
      const currentMode = this.getElementById("comparison-mode").value;
      if (currentMode !== DanbooruImageComparator.MODES.SIDE_BY_SIDE) {
        this.updateComparisonMode();
      } else {
        this.applyTransforms();
      }
    }

    // === TRANSFORM OPERATIONS ===

    // Toggle transformation (flip horizontal/vertical)
    toggleTransform(side, type) {
      this.transformState[side][type] = !this.transformState[side][type];
      this.applyTransforms();
    }

    // Rotate image by 90 degrees
    rotateImage(side) {
      this.transformState[side].rotation =
        (this.transformState[side].rotation + 90) % 360;
      this.applyTransforms();
    }

    // Reset all transformations
    resetAllTransforms() {
      this.transformState.left = { flipH: false, flipV: false, rotation: 0 };
      this.transformState.right = { flipH: false, flipV: false, rotation: 0 };
      this.applyTransforms();
    }

    // Apply current transformations to images
    applyTransforms() {
      const imageElements = {
        left: [
          this.getElementById("left-image"),
          this.getElementById("overlay-left-image"),
        ],
        right: [
          this.getElementById("right-image"),
          this.getElementById("overlay-image"),
        ],
      };

      // Clear existing transform classes
      Object.values(imageElements)
        .flat()
        .filter(Boolean)
        .forEach((img) => {
          img.classList.remove(
            "flip-h",
            "flip-v",
            "rotate-90",
            "rotate-180",
            "rotate-270"
          );
        });

      // Apply current transformations
      Object.entries(imageElements).forEach(([side, elements]) => {
        elements.filter(Boolean).forEach((img) => {
          this.applyTransformToElement(img, this.transformState[side]);
        });
      });
    }

    // Apply specific transformation to element
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

    // === COMPARISON MODES ===

    // Update comparison display mode
    updateComparisonMode() {
      // Save current state
      this.saveZoomState();

      // First clean up any existing event listeners to prevent duplicates
      this.cleanupEventListeners();

      const mode = this.getElementById("comparison-mode").value;
      this.resetComparisonDisplay();

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
          // Side-by-side is the default mode, restore to standard pan-zoom
          setTimeout(() => {
            this.restoreZoomState();
          }, 100);
          break;
      }

      setTimeout(() => this.applyTransforms(), 0);
    }

    // Helper method to clean up event listeners before mode change
    cleanupEventListeners() {
      // Clean up wheel event listeners on main containers
      ["left-side", "right-side", "comparison-overlay-container"].forEach(
        (id) => {
          const element = this.getElementById(id);
          if (element && element._wheelListener) {
            element.removeEventListener("wheel", element._wheelListener);
            delete element._wheelListener;
          }
        }
      );

      // If we're using overlay mode, make sure to clean that up too
      if (this.panzoomInstances.overlay) {
        const overlayContainer = this.getElementById(
          "comparison-overlay-container"
        );
        if (overlayContainer) {
          this.cleanWheelListeners(overlayContainer);
        }
      }
    }

    // Save current zoom state
    saveZoomState() {
      // Get state from current active panzoom instance
      const activeInstance = this.getActiveInstance();
      if (activeInstance) {
        const pan = activeInstance.getPan();
        const scale = activeInstance.getScale();

        this.zoomState = {
          scale: scale,
          x: pan.x,
          y: pan.y,
        };
      }
    }

    // Get current active panzoom instance
    getActiveInstance() {
      // Check instances in priority order
      if (this.panzoomInstances.overlay) {
        return this.panzoomInstances.overlay;
      }
      if (this.panzoomInstances.left) {
        return this.panzoomInstances.left;
      }
      if (this.panzoomInstances.right) {
        return this.panzoomInstances.right;
      }
      return null;
    }

    // Restore zoom state to all active instances
    restoreZoomState() {
      // Restore to all active panzoom instances
      Object.values(this.panzoomInstances).forEach((instance) => {
        if (instance) {
          // Use silent option to avoid triggering events
          instance.zoom(this.zoomState.scale, { animate: false, silent: true });
          instance.pan(this.zoomState.x, this.zoomState.y, {
            animate: false,
            silent: true,
          });
        }
      });
    }

    // Reset comparison interface to default state
    resetComparisonDisplay() {
      const elements = {
        overlay: this.getElementById("comparison-overlay-container"),
        fadeControls: this.getElementById("fade-controls"),
        differenceControls: this.getElementById("difference-controls"),
      };

      // First clear the overlay container properly to remove any event listeners
      elements.overlay.innerHTML =
        '<div class="sync-pan" id="overlay-pan"></div>';
      elements.overlay.style.display = "none";
      elements.fadeControls.style.display = "none";
      elements.differenceControls.style.display = "none";

      // Show default side-by-side elements
      ["left-side", "right-side", "comparison-divider"].forEach((id) => {
        this.getElementById(id).style.display =
          id === "comparison-divider" ? "block" : "flex";
      });

      // Reset overlay container background
      elements.overlay.style.backgroundColor = "";
      elements.overlay.classList.remove("difference-inverted");

      // Destroy overlay panzoom if it exists
      if (this.panzoomInstances.overlay) {
        this.panzoomInstances.overlay.destroy();
        this.panzoomInstances.overlay = null;
      }
    }

    // Setup slider comparison mode
    setupSliderMode() {
      this.hideMainElements();
      this.showOverlayContainer();
      this.createOverlayImages();
      this.initializeOverlayPanZoom();
      setTimeout(() => this.initializeSlider(), 0);
    }

    // Setup fade comparison mode
    setupFadeMode() {
      this.hideMainElements();
      this.showOverlayContainer();
      this.createOverlayImages();
      this.initializeOverlayPanZoom();

      this.getElementById("overlay-image").style.opacity = "0.5";
      this.getElementById("fade-controls").style.display = "flex";
      this.initializeOpacitySlider();
    }

    // Setup difference comparison mode
    setupDifferenceMode() {
      this.hideMainElements();
      this.showOverlayContainer();
      this.createOverlayImages();
      this.initializeOverlayPanZoom();

      // Apply difference blend mode to the top image
      const overlayImage = this.getElementById("overlay-image");
      overlayImage.style.mixBlendMode = "difference";
      overlayImage.style.opacity = "1";

      // Set default background to grey for better difference visibility
      this.getElementById(
        "comparison-overlay-container"
      ).style.backgroundColor = "#808080";

      // Show difference controls
      this.getElementById("difference-controls").style.display = "flex";

      // Set default background selector value
      this.getElementById("difference-background").value = "grey";
    }

    // Update difference mode background color
    updateDifferenceBackground() {
      const background = this.getElementById("difference-background").value;
      const container = this.getElementById("comparison-overlay-container");

      const colors = {
        black: "#000000",
        white: "#ffffff",
        grey: "#808080",
      };

      container.style.backgroundColor = colors[background] || "#ffffff";
    }

    // Toggle difference invert effect
    toggleDifferenceInvert() {
      const container = this.getElementById("comparison-overlay-container");
      const invertBtn = this.getElementById("invert-difference");

      if (container.classList.contains("difference-inverted")) {
        container.classList.remove("difference-inverted");
        invertBtn.textContent = "Invert";
      } else {
        container.classList.add("difference-inverted");
        invertBtn.textContent = "Normal";
      }
    }

    // Hide main comparison elements
    hideMainElements() {
      ["left-side", "right-side", "comparison-divider"].forEach((id) => {
        this.getElementById(id).style.display = "none";
      });
    }

    // Show overlay container
    showOverlayContainer() {
      this.getElementById("comparison-overlay-container").style.display =
        "block";
    }

    // Create overlay images for slider/fade/difference modes
    createOverlayImages() {
      const container = this.getElementById("overlay-pan");
      const leftImage = this.getElementById("left-image");
      const rightImage = this.getElementById("right-image");

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

    // Initialize pan-zoom for overlay mode
    initializeOverlayPanZoom() {
      const overlayPan = this.getElementById("overlay-pan");
      const overlayContainer = this.getElementById(
        "comparison-overlay-container"
      );

      // First destroy existing overlay panzoom if it exists
      if (this.panzoomInstances.overlay) {
        this.panzoomInstances.overlay.destroy();

        // Remove existing wheel event listeners to prevent duplicates
        const oldListener = overlayContainer._wheelListener;
        if (oldListener) {
          overlayContainer.removeEventListener("wheel", oldListener);
          delete overlayContainer._wheelListener;
        }
      }

      const panzoomOptions = {
        maxScale: Infinity,
      };

      this.panzoomInstances.overlay = Panzoom(overlayPan, panzoomOptions);

      // Restore saved zoom state
      setTimeout(() => {
        this.panzoomInstances.overlay.zoom(this.zoomState.scale, {
          animate: false,
          silent: true,
        });
        this.panzoomInstances.overlay.pan(this.zoomState.x, this.zoomState.y, {
          animate: false,
          silent: true,
        });
      }, 0);

      // Clean up previous wheel listeners in a safer way
      this.cleanWheelListeners(overlayContainer);

      // Create and store the wheel event handler
      const wheelHandler = (event) => {
        event.preventDefault();
        this.panzoomInstances.overlay.zoomWithWheel(event);
      };

      // Store reference to listener for future cleanup
      overlayContainer._wheelListener = wheelHandler;

      // Bind wheel events for overlay
      overlayContainer.addEventListener("wheel", wheelHandler);
    }

    // Helper function to safely remove wheel listeners from an element
    cleanWheelListeners(element) {
      if (!element) {
        return;
      }

      // Remove our known wheel listener if it exists
      if (element._wheelListener) {
        element.removeEventListener("wheel", element._wheelListener);
        delete element._wheelListener;
      }

      // For safety, we can add a data attribute to track our event binding
      element.setAttribute("data-wheel-cleaned", "true");
    }

    // === SLIDER MODE ===

    // Initialize slider functionality
    initializeSlider() {
      const container = this.getElementById("comparison-overlay-container");
      const rightImage = this.getElementById("overlay-image");

      let slider = this.getElementById("comparison-slider");
      if (!slider) {
        slider = document.createElement("div");
        slider.id = "comparison-slider";
        container.appendChild(slider);
      }

      const centerX = container.clientWidth / 2;
      this.updateSliderPosition(slider, rightImage, centerX, container);
      this.bindSliderEvents(slider, rightImage, container);
    }

    // Update slider position and image clipping
    updateSliderPosition(slider, rightImage, x, container) {
      // Use the container as the width source, avoiding reliance on slider.parentElement
      const containerWidth = container.clientWidth;
      x = Math.max(0, Math.min(x, containerWidth));

      slider.style.left = x + "px";
      rightImage.style.clipPath = `inset(0 0 0 ${x}px)`;
    }

    // Bind slider interaction events
    bindSliderEvents(slider, rightImage, container) {
      let isDragging = false;

      const updatePosition = (e) => {
        const x = e.clientX - container.getBoundingClientRect().left;
        this.updateSliderPosition(slider, rightImage, x, container);
      };

      slider.addEventListener("mousedown", (e) => {
        e.preventDefault();
        isDragging = true;
      });

      container.addEventListener("mousemove", (e) => {
        if (isDragging) {
          updatePosition(e);
        }
      });

      container.addEventListener("mousedown", (e) => {
        if (e.target !== slider) {
          updatePosition(e);
          isDragging = true;
        }
      });

      document.addEventListener("mouseup", () => {
        isDragging = false;
      });
    }

    // === FADE MODE ===

    // Initialize opacity slider for fade mode
    initializeOpacitySlider() {
      const slider = this.getElementById("opacity-slider");
      const valueDisplay = this.getElementById("opacity-value");
      const overlayImage = this.getElementById("overlay-image");

      if (!slider || !valueDisplay || !overlayImage) {
        return;
      }

      slider.value = 50;
      valueDisplay.textContent = "50%";
      overlayImage.style.opacity = 0.5;

      slider.addEventListener("input", function () {
        const opacity = this.value / 100;
        overlayImage.style.opacity = opacity;
        valueDisplay.textContent = this.value + "%";
      });
    }

    // === PAN AND ZOOM ===

    // Initialize synchronized pan and zoom
    initializePanZoom() {
      const leftPan = this.getElementById("left-pan");
      const rightPan = this.getElementById("right-pan");

      // Destroy existing instances first
      if (this.panzoomInstances.left) {
        this.panzoomInstances.left.destroy();
      }
      if (this.panzoomInstances.right) {
        this.panzoomInstances.right.destroy();
      }

      const panzoomOptions = {
        maxScale: Infinity,
      };

      this.panzoomInstances.left = Panzoom(leftPan, panzoomOptions);
      this.panzoomInstances.right = Panzoom(rightPan, panzoomOptions);

      // Restore zoom state
      setTimeout(() => {
        this.restoreZoomState();
      }, 0);

      this.synchronizePanZoom(
        leftPan,
        rightPan,
        this.panzoomInstances.left,
        this.panzoomInstances.right
      );
      this.bindPanZoomEvents(
        this.panzoomInstances.left,
        this.panzoomInstances.right
      );
    }

    // Synchronize pan and zoom between images
    synchronizePanZoom(leftPan, rightPan, leftPanzoom, rightPanzoom) {
      // Remove existing event listeners if present
      if (leftPan._panzoomChangeListener) {
        leftPan.removeEventListener(
          "panzoomchange",
          leftPan._panzoomChangeListener
        );
      }
      if (rightPan._panzoomChangeListener) {
        rightPan.removeEventListener(
          "panzoomchange",
          rightPan._panzoomChangeListener
        );
      }

      // add flag to prevent infinite loop
      let isUpdating = false;

      // Create new listeners
      leftPan._panzoomChangeListener = (event) => {
        if (isUpdating) {
          return;
        }

        isUpdating = true;
        // use silent option to avoid triggering the other side's event
        const { x, y, scale } = event.detail;
        rightPanzoom.zoom(scale, { animate: false, silent: true });
        rightPanzoom.pan(x, y, { animate: false, silent: true });
        isUpdating = false;
      };

      rightPan._panzoomChangeListener = (event) => {
        if (isUpdating) {
          return;
        }

        isUpdating = true;
        // use silent option to avoid triggering the other side's event
        const { x, y, scale } = event.detail;
        leftPanzoom.zoom(scale, { animate: false, silent: true });
        leftPanzoom.pan(x, y, { animate: false, silent: true });
        isUpdating = false;
      };

      // Add new listeners
      leftPan.addEventListener("panzoomchange", leftPan._panzoomChangeListener);
      rightPan.addEventListener(
        "panzoomchange",
        rightPan._panzoomChangeListener
      );
    }

    // Bind pan and zoom events
    bindPanZoomEvents(leftPanzoom, rightPanzoom) {
      // fix wheel event binding - should bind to parent container instead of content area
      const leftSide = this.getElementById("left-side");
      const rightSide = this.getElementById("right-side");
      const resetZoomButton = this.getElementById("reset-zoom");

      // Remove existing wheel listeners if any
      if (leftSide._wheelListener) {
        leftSide.removeEventListener("wheel", leftSide._wheelListener);
      }
      if (rightSide._wheelListener) {
        rightSide.removeEventListener("wheel", rightSide._wheelListener);
      }
      if (resetZoomButton._clickListener) {
        resetZoomButton.removeEventListener(
          "click",
          resetZoomButton._clickListener
        );
      }

      // Create and store new listeners
      leftSide._wheelListener = (event) => {
        event.preventDefault();
        leftPanzoom.zoomWithWheel(event);
      };

      rightSide._wheelListener = (event) => {
        event.preventDefault();
        rightPanzoom.zoomWithWheel(event);
      };

      resetZoomButton._clickListener = () => {
        this.resetZoom();
      };

      // Add new listeners
      leftSide.addEventListener("wheel", leftSide._wheelListener);
      rightSide.addEventListener("wheel", rightSide._wheelListener);
      resetZoomButton.addEventListener("click", resetZoomButton._clickListener);
    }

    // Reset zoom to default
    resetZoom() {
      if (this.panzoomInstances.left) {
        this.panzoomInstances.left.reset();
      }
      if (this.panzoomInstances.right) {
        this.panzoomInstances.right.reset();
      }
      if (this.panzoomInstances.overlay) {
        this.panzoomInstances.overlay.reset();
      }
    }

    // Destroy all pan-zoom instances and clean up event listeners
    destroyPanZoom() {
      // Clean up PanZoom instances
      Object.values(this.panzoomInstances).forEach((instance) => {
        if (instance) {
          instance.destroy();
        }
      });
      this.panzoomInstances = { left: null, right: null, overlay: null };

      // Clean up event listeners
      const elementsToClean = [
        {
          id: "left-pan",
          property: "_panzoomChangeListener",
          event: "panzoomchange",
        },
        {
          id: "right-pan",
          property: "_panzoomChangeListener",
          event: "panzoomchange",
        },
        { id: "left-side", property: "_wheelListener", event: "wheel" },
        { id: "right-side", property: "_wheelListener", event: "wheel" },
        {
          id: "comparison-overlay-container",
          property: "_wheelListener",
          event: "wheel",
        },
        { id: "reset-zoom", property: "_clickListener", event: "click" },
      ];

      elementsToClean.forEach(({ id, property, event }) => {
        const element = this.getElementById(id);
        if (element && element[property]) {
          element.removeEventListener(event, element[property]);
          delete element[property];
        }
      });

      // Clean overlay container in a safer way
      const overlayContainer = this.getElementById(
        "comparison-overlay-container"
      );
      if (overlayContainer) {
        this.cleanWheelListeners(overlayContainer);
      }
    }

    // === UTILITY METHODS ===

    // Save comparison mode to localStorage
    saveComparisonMode() {
      const mode = this.getElementById("comparison-mode").value;
      try {
        localStorage.setItem(
          DanbooruImageComparator.STORAGE_KEYS.COMPARISON_MODE,
          mode
        );
      } catch (e) {
        console.warn("Failed to save comparison mode:", e);
      }
    }

    // Get saved comparison mode from localStorage
    getSavedComparisonMode() {
      try {
        const saved = localStorage.getItem(
          DanbooruImageComparator.STORAGE_KEYS.COMPARISON_MODE
        );
        // Return saved mode if valid, otherwise default to side-by-side
        if (
          saved &&
          Object.values(DanbooruImageComparator.MODES).includes(saved)
        ) {
          return saved;
        }
      } catch (e) {
        console.warn("Failed to load comparison mode:", e);
      }
      return DanbooruImageComparator.MODES.SIDE_BY_SIDE;
    }

    // Show error message to user
    showError(message) {
      alert(message);
    }

    // Get element by ID with error handling
    getElementById(id) {
      const element = document.getElementById(id);
      if (!element) {
        console.warn(`Element with ID '${id}' not found`);
      }
      return element;
    }

    // Inject CSS styles into page
    injectStyles() {
      const styleElement = document.createElement("style");
      styleElement.textContent = this.getCSS();
      document.head.appendChild(styleElement);
    }

    // Generate CSS styles
    getCSS() {
      return `
          #image-comparison-container {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.9); z-index: 10000;
            display: flex; flex-direction: column; color: white;
          }

          #image-comparison-container img {
            image-rendering: pixelated;
          }
  
          #comparison-header {
            padding: 10px; display: flex; justify-content: space-between; align-items: center;
            background-color: var(--grey-9); z-index: 10001; flex-wrap: wrap; gap: 10px;
          }
  
          .header-section { 
            display: flex; align-items: center; gap: 10px; 
          }

          #fade-controls, #difference-controls {
            flex-wrap: wrap;
            width: 100%;
            justify-content: center;
            order: 10;
            padding-top: 5px;
            margin-top: 5px;
            border-top: 1px solid var(--grey-7);
          }
  
          #comparison-content {
            flex: 1; display: flex; overflow: hidden; position: relative;
          }
  
          .comparison-side {
            flex: 1; display: flex; justify-content: center; align-items: center;
            overflow: hidden; position: relative;
          }
  
          .comparison-side img {
            max-width: 100%; max-height: 100%; object-fit: contain;
            margin: auto; display: block;
          }
  
          #comparison-divider {
            width: 4px; height: 100%; background-color: white; cursor: col-resize;
          }
  
          #comparison-overlay-container {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            overflow: hidden; display: none; z-index: 10002;
          }

          #comparison-overlay-container.difference-inverted {
            filter: invert(1);
          }
  
          #comparison-slider {
            position: absolute; top: 0; bottom: 0; width: 4px;
            background-color: white; cursor: col-resize; z-index: 10003;
          }
  
          #comparison-slider::after {
            content: ''; position: absolute; top: 50%; left: 50%;
            transform: translate(-50%, -50%); width: 30px; height: 30px;
            background-color: white; border-radius: 50%;
          }
  
          .post-selector {
            display: flex; align-items: center; margin-right: 10px;
          }
  
          .sync-pan {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden;
          }
  
          #opacity-slider { width: 200px; margin-right: 10px; }
  
          #transform-controls { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
  
          /* Transform classes */
          .flip-h { transform: scaleX(-1); }
          .flip-v { transform: scaleY(-1); }
          .rotate-90 { transform: rotate(90deg); }
          .rotate-180 { transform: rotate(180deg); }
          .rotate-270 { transform: rotate(270deg); }
  
          /* Combined transformations */
          .flip-h.flip-v { transform: scale(-1, -1); }
          .flip-h.rotate-90 { transform: scaleX(-1) rotate(90deg); }
          .flip-h.rotate-180 { transform: scaleX(-1) rotate(180deg); }
          .flip-h.rotate-270 { transform: scaleX(-1) rotate(270deg); }
          .flip-v.rotate-90 { transform: scaleY(-1) rotate(90deg); }
          .flip-v.rotate-180 { transform: scaleY(-1) rotate(180deg); }
          .flip-v.rotate-270 { transform: scaleY(-1) rotate(270deg); }
          .flip-h.flip-v.rotate-90 { transform: scale(-1, -1) rotate(90deg); }
          .flip-h.flip-v.rotate-180 { transform: scale(-1, -1) rotate(180deg); }
          .flip-h.flip-v.rotate-270 { transform: scale(-1, -1) rotate(270deg); }
        `;
    }
  }

  // Initialize when page loads
  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => new DanbooruImageComparator()
    );
  } else {
    new DanbooruImageComparator();
  }
})();
