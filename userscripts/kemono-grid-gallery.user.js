// ==UserScript==
// @name         Kemono/Coomer/Pawchive Grid Gallery Layout
// @namespace    https://github.com/NekoAria/JavaScript-Tools
// @version      1.1.1
// @author       Neko_Aria
// @description  Add a responsive grid gallery layout for the Kemono/Coomer/Pawchive thumbnails, using the first attachment image file as the cover
// @license      MIT
// @icon         https://kemono.cr/static/favicon.ico
// @homepageURL  https://github.com/NekoAria/JavaScript-Tools/tree/main/packages/kemono-grid-gallery
// @supportURL   https://github.com/NekoAria/JavaScript-Tools/issues
// @match        https://coomer.st/*
// @match        https://kemono.cr/*
// @match        https://pawchive.st/*
// @grant        none
// ==/UserScript==

(function() {
	"use strict";
	var style_default = ":root {\n  --kemono-grid-gallery-gap: 16px;\n  --kemono-grid-gallery-min-column-width: 250px;\n}\n\n.card-list--legacy .card-list__items {\n  display: grid !important;\n  grid-template-columns: repeat(\n    auto-fill,\n    minmax(var(--kemono-grid-gallery-min-column-width), 1fr)\n  );\n  grid-auto-rows: auto;\n  gap: var(--kemono-grid-gallery-gap);\n  width: 100%;\n  padding: var(--kemono-grid-gallery-gap);\n  margin: 0 auto;\n}\n\n.post-card {\n  width: 100% !important;\n  height: auto !important;\n  margin: 0 !important;\n  overflow: hidden;\n  background: rgba(0, 0, 0, 0.5);\n  border-radius: 8px;\n  transition: transform 0.2s ease;\n  break-inside: avoid;\n}\n\n.post-card:hover {\n  transform: translateY(-2px);\n}\n\n.post-card__image-container {\n  position: relative;\n  width: 100%;\n  height: auto !important;\n}\n\n.post-card__image {\n  display: block;\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n}\n\n.loading-overlay {\n  position: fixed;\n  top: 50%;\n  left: 50%;\n  z-index: 9999;\n  display: flex;\n  align-items: center;\n  padding: 20px;\n  color: white;\n  background: rgba(0, 0, 0, 0.8);\n  border-radius: 8px;\n  transform: translate(-50%, -50%);\n}\n\n.loading-spinner {\n  width: 20px;\n  height: 20px;\n  margin-right: 10px;\n  border: 3px solid #fff;\n  border-top-color: transparent;\n  border-radius: 50%;\n  animation: spin 1s linear infinite;\n}\n\n@keyframes spin {\n  to {\n    transform: rotate(360deg);\n  }\n}\n";
	var CONFIG = {
		SELECTORS: {
			GRID: ".card-list__items",
			POST_CARD: ".post-card",
			POST_IMAGE: ".post-card__image"
		},
		SITES: {
			"coomer.st": {
				API_BASE_URL: "https://coomer.st/api/v1",
				IMAGE_BASE_URL: "https://img.coomer.st/thumbnail/data"
			},
			"kemono.cr": {
				API_BASE_URL: "https://kemono.cr/api/v1",
				IMAGE_BASE_URL: "https://img.kemono.cr/thumbnail/data"
			},
			"pawchive.st": {
				API_BASE_URL: "https://pawchive.st/api/v1",
				IMAGE_BASE_URL: "https://img.pawchive.st/thumbnail/data"
			}
		},
		SUPPORTED_IMAGES: new Set([
			".bmp",
			".gif",
			".jpeg",
			".jpg",
			".png",
			".webp"
		])
	};
	var URL_CHANGE_DEBOUNCE_MS = 200;
	var STYLE_ELEMENT_ID = "kemono-grid-gallery-style";
	var galleryState = {
		debounceTimer: null,
		isPendingInitialization: false,
		isProcessing: false,
		lastUrl: location.href
	};
	var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
	var getOptionalPath = (value) => {
		if (!isRecord(value)) return;
		const { path } = value;
		return typeof path === "string" || path === null ? path : void 0;
	};
	var parsePost = (value) => {
		if (!isRecord(value)) return null;
		const post = {};
		if (typeof value.id === "string" || typeof value.id === "number" || value.id === null) post.id = value.id;
		if (Array.isArray(value.attachments)) post.attachments = value.attachments.flatMap((attachment) => {
			if (!isRecord(attachment)) return [];
			return [{ path: getOptionalPath(attachment) }];
		});
		if (value.file === null) post.file = null;
		else if (isRecord(value.file)) post.file = { path: getOptionalPath(value.file) };
		return post;
	};
	var parsePosts = (value) => {
		if (!Array.isArray(value)) throw new TypeError("Invalid posts response: expected an array");
		return value.flatMap((post) => {
			const parsedPost = parsePost(post);
			return parsedPost ? [parsedPost] : [];
		});
	};
	function addStyles() {
		if (document.querySelector(`#${STYLE_ELEMENT_ID}`)) return;
		const style = document.createElement("style");
		style.id = STYLE_ELEMENT_ID;
		style.textContent = style_default;
		document.head.append(style);
	}
	function buildPostAttachmentMap(posts) {
		const postAttachments = new Map();
		for (const post of posts) {
			const imagePath = getFirstImagePath(post);
			if (post.id != null && imagePath && isImageFile(imagePath)) postAttachments.set(String(post.id), imagePath);
		}
		return postAttachments;
	}
	function createLoadingOverlay() {
		const overlay = document.createElement("div");
		overlay.className = "loading-overlay";
		overlay.innerHTML = `
      <div class="loading-spinner"></div>
      <span>Loading images...</span>
    `;
		document.body.append(overlay);
		return overlay;
	}
	async function fetchPosts(siteConfig, { service, userId }) {
		const url = new URL(`${siteConfig.API_BASE_URL}/${service}/user/${userId}/posts`);
		url.search = location.search;
		const response = await fetch(url.href);
		if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
		return parsePosts(await response.json());
	}
	function getCurrentSiteConfig() {
		return CONFIG.SITES[location.hostname] ?? null;
	}
	function getFirstImagePath(post) {
		return (post.attachments ?? []).find((attachment) => isImageFile(attachment.path))?.path || post.file?.path || null;
	}
	function getPostIdFromCard(card) {
		const link = card.querySelector("a[href*=\"/user/\"][href*=\"/post/\"]");
		if (!link) return null;
		return new URL(link.href).pathname.split("/").findLast(Boolean) || null;
	}
	function handleUrlChange() {
		if (location.href === galleryState.lastUrl) return;
		galleryState.lastUrl = location.href;
		scheduleInitializeGallery();
	}
	async function initializeGallery() {
		const siteConfig = getCurrentSiteConfig();
		const urlParams = parseUserPath();
		if (!siteConfig || !urlParams) return;
		const grid = await waitForElement(CONFIG.SELECTORS.GRID);
		grid.style.removeProperty("--card-size");
		const loadingOverlay = createLoadingOverlay();
		try {
			await processCards(grid, siteConfig, buildPostAttachmentMap(await fetchPosts(siteConfig, urlParams)));
		} catch (error) {
			console.error("Failed to initialize gallery:", error);
		} finally {
			loadingOverlay.remove();
		}
	}
	async function initializeGallerySafely() {
		if (galleryState.isProcessing) {
			galleryState.isPendingInitialization = true;
			return;
		}
		galleryState.isProcessing = true;
		try {
			do {
				galleryState.isPendingInitialization = false;
				await initializeGallery();
			} while (galleryState.isPendingInitialization);
		} catch (error) {
			console.error("Gallery initialization failed:", error);
		} finally {
			galleryState.isProcessing = false;
		}
	}
	function isImageFile(path) {
		if (!path) return false;
		const cleanPath = path.split(/[?#]/, 1)[0].toLowerCase();
		const extensionStart = cleanPath.lastIndexOf(".");
		if (extensionStart === -1) return false;
		return CONFIG.SUPPORTED_IMAGES.has(cleanPath.slice(extensionStart));
	}
	function parseUserPath() {
		const match = location.pathname.match(/^\/([^/]+)\/user\/([^/]+)\/?$/);
		if (!match) return null;
		const [, service, userId] = match;
		return {
			service,
			userId
		};
	}
	async function processCard(card, siteConfig, postAttachments) {
		const postId = getPostIdFromCard(card);
		if (!postId) return;
		const imagePath = postAttachments.get(postId);
		const imgElement = card.querySelector(CONFIG.SELECTORS.POST_IMAGE);
		if (!imgElement || !imagePath) return;
		await updateImageSource(imgElement, `${siteConfig.IMAGE_BASE_URL}${imagePath}`);
	}
	async function processCards(grid, siteConfig, postAttachments) {
		const cards = [...grid.querySelectorAll(CONFIG.SELECTORS.POST_CARD)];
		await Promise.all(cards.map((card) => processCard(card, siteConfig, postAttachments)));
	}
	function scheduleInitializeGallery() {
		if (galleryState.debounceTimer !== null) clearTimeout(galleryState.debounceTimer);
		galleryState.debounceTimer = setTimeout(() => {
			initializeGallerySafely();
		}, URL_CHANGE_DEBOUNCE_MS);
	}
	function setupHistoryListener(methodName) {
		const originalMethod = history[methodName];
		const wrappedMethod = function(...args) {
			const result = Reflect.apply(originalMethod, history, args);
			handleUrlChange();
			return result;
		};
		history[methodName] = wrappedMethod;
	}
	function setupUrlChangeListener() {
		new MutationObserver(() => handleUrlChange()).observe(document.body, {
			childList: true,
			subtree: true
		});
		addEventListener("popstate", handleUrlChange);
		setupHistoryListener("pushState");
		setupHistoryListener("replaceState");
	}
	function start() {
		if (!document.body) {
			addEventListener("DOMContentLoaded", start, { once: true });
			return;
		}
		addStyles();
		initializeGallerySafely();
		setupUrlChangeListener();
	}
	async function updateImageSource(imgElement, imageUrl) {
		if (imgElement.src === imageUrl && imgElement.complete) return;
		const loadPromise = waitForNextImageLoad(imgElement);
		imgElement.src = imageUrl;
		await loadPromise;
	}
	function waitForElement(selector) {
		return new Promise((resolve) => {
			const element = document.querySelector(selector);
			if (element) {
				resolve(element);
				return;
			}
			new MutationObserver((_, currentObserver) => {
				const nextElement = document.querySelector(selector);
				if (nextElement) {
					currentObserver.disconnect();
					resolve(nextElement);
				}
			}).observe(document.body, {
				childList: true,
				subtree: true
			});
		});
	}
	function waitForNextImageLoad(imgElement) {
		return new Promise((resolve) => {
			const finish = () => {
				imgElement.removeEventListener("load", finish);
				imgElement.removeEventListener("error", finish);
				resolve();
			};
			imgElement.addEventListener("load", finish);
			imgElement.addEventListener("error", finish);
		});
	}
	start();
})();
