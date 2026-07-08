// ==UserScript==
// @name         Universal Booru Image Comparator
// @namespace    https://github.com/NekoAria/JavaScript-Tools
// @version      2.0.2
// @author       Neko_Aria
// @description  Compare images on Danbooru / Yande.re / Konachan with multiple modes and transformations
// @homepageURL  https://github.com/NekoAria/JavaScript-Tools/tree/main/packages/booru-image-comparator
// @supportURL   https://github.com/NekoAria/JavaScript-Tools/issues
// @match        *://*.donmai.us/iqdb_queries*
// @match        *://*.donmai.us/posts/*
// @match        *://*.donmai.us/uploads/*
// @match        https://konachan.com/post/show/*
// @match        https://konachan.com/post/similar*
// @match        https://yande.re/post/show/*
// @match        https://yande.re/post/similar*
// @grant        none
// ==/UserScript==

(function() {
	"use strict";
	var STORAGE_KEY_MODE = "universal_comparator_mode";
	var STORAGE_KEY_BACKGROUND = "universal_comparator_background";
	var MODES = {
		SIDE_BY_SIDE: "side-by-side",
		SLIDER: "slider",
		FADE: "fade",
		DIFFERENCE: "difference"
	};
	var MODES_ARRAY = Object.freeze(Object.values(MODES));
	var VALID_BACKGROUNDS = new Set([
		"black",
		"grey",
		"white"
	]);
	var RELATIONSHIP_PRIORITY = {
		Similar: 0,
		Parent: 1,
		Sibling: 2,
		Child: 3
	};
	var style_default = "/* ============================================================\n   Design tokens\n   ============================================================ */\n.comparator {\n  --sp-0-5: 0.125rem;\n  --sp-1: 0.25rem;\n  --sp-1-5: 0.375rem;\n  --sp-2: 0.5rem;\n  --sp-3: 0.75rem;\n  --sp-4: 1rem;\n  --sp-5: 1.25rem;\n\n  --grey-0: oklch(98.5% 0 0);\n  --grey-1: oklch(97% 0 0);\n  --grey-2: oklch(92.2% 0 0);\n  --grey-3: oklch(87% 0 0);\n  --grey-4: oklch(70.8% 0 0);\n  --grey-5: oklch(55.6% 0 0);\n  --grey-6: oklch(43.9% 0 0);\n  --grey-7: oklch(37.1% 0 0);\n  --grey-8: oklch(26.9% 0 0);\n  --grey-9: oklch(20.5% 0 0);\n  --grey-10: oklch(14.5% 0 0);\n\n  --accent: oklch(62.3% 0.214 259.815);\n  --ring: oklch(62.3% 0.214 259.815 / 25%);\n  --text-muted: var(--grey-2);\n  --ease: 120ms ease-out;\n  --divider-width: var(--sp-1);\n  --radius: var(--sp-1);\n  --border: 1px solid var(--grey-7);\n  --border-in: 1px solid var(--grey-6);\n\n  --z-header: 10001;\n  --z-overlay: 10002;\n  --z-slider: 10003;\n  position: fixed;\n  inset: 0;\n  z-index: 10000;\n  box-sizing: border-box;\n\n  display: flex;\n  flex-direction: column;\n  overflow: hidden;\n  font:\n    0.875rem/1.5 Verdana,\n    system-ui,\n    -apple-system,\n    Helvetica,\n    sans-serif;\n  color: var(--grey-0);\n\n  outline: none;\n  background: var(--grey-10);\n\n  &,\n  & *,\n  & *::before,\n  & *::after {\n    box-sizing: border-box;\n  }\n\n  @media (prefers-reduced-motion: reduce) {\n    --ease: 0ms;\n  }\n}\n\n/* Header */\n.header {\n  z-index: var(--z-header);\n  display: flex;\n  flex-direction: column;\n  gap: var(--sp-2);\n  padding: var(--sp-2) var(--sp-3);\n  background: var(--grey-9);\n  border-bottom: var(--border);\n}\n\n.primary-controls {\n  display: flex;\n  flex-wrap: wrap;\n  gap: var(--sp-2);\n  align-items: center;\n  justify-content: space-between;\n  width: 100%;\n}\n\n.right-controls {\n  display: flex;\n  gap: var(--sp-2);\n  align-items: center;\n  margin-left: auto;\n}\n\n.mode-label {\n  color: var(--text-muted);\n}\n\n.post-info {\n  font-size: 0.75rem;\n  color: var(--text-muted);\n}\n\n/* Form control */\n.form-control {\n  padding: var(--sp-0-5) var(--sp-2);\n  font: inherit;\n  color: var(--grey-0);\n  appearance: none;\n  outline: none;\n  background: var(--grey-8);\n  border: var(--border-in);\n  border-radius: var(--radius);\n  transition:\n    border-color var(--ease),\n    box-shadow var(--ease);\n\n  @media (hover: hover) {\n    &:hover {\n      border-color: var(--grey-5);\n    }\n  }\n\n  &:focus-visible {\n    border-color: var(--accent);\n    box-shadow: 0 0 0 2px var(--ring);\n  }\n}\n\n.form-control::placeholder {\n  color: var(--grey-4);\n}\n\n.id-input {\n  width: 10rem;\n}\n\n/* Buttons */\n.btn {\n  display: inline-flex;\n  gap: var(--sp-1);\n  align-items: center;\n  justify-content: center;\n  padding: var(--sp-0-5) var(--sp-2);\n  font: inherit;\n  line-height: 1.25;\n  color: var(--grey-1);\n  white-space: nowrap;\n  appearance: none;\n  cursor: pointer;\n  outline: none;\n  background: var(--grey-8);\n  border: var(--border);\n  border-radius: var(--radius);\n  transition:\n    background var(--ease),\n    border-color var(--ease),\n    color var(--ease),\n    box-shadow var(--ease);\n\n  @media (hover: hover) {\n    &:hover {\n      color: var(--grey-0);\n      background: var(--grey-7);\n      border-color: var(--grey-6);\n    }\n  }\n\n  &:active {\n    background: var(--grey-6);\n  }\n  &:disabled {\n    pointer-events: none;\n    cursor: not-allowed;\n    opacity: 0.5;\n  }\n\n  &:focus-visible {\n    border-color: var(--accent);\n    box-shadow: 0 0 0 2px var(--ring);\n  }\n\n  &.btn-close {\n    padding: var(--sp-0-5) var(--sp-1);\n    font-size: 1.25rem;\n    line-height: 1;\n    background: var(--grey-9);\n\n    @media (hover: hover) {\n      &:hover {\n        color: var(--grey-0);\n        background: oklch(100% 0 0 / 8%);\n      }\n    }\n  }\n}\n\n/* Range */\n.comparator input[type='range'] {\n  height: var(--sp-1);\n  appearance: none;\n  cursor: pointer;\n  outline: none;\n  background: var(--grey-7);\n  border-radius: calc(var(--sp-1) / 2);\n\n  &::-webkit-slider-thumb {\n    width: var(--sp-4);\n    height: var(--sp-4);\n    appearance: none;\n    cursor: pointer;\n    background: var(--grey-1);\n    border: 2px solid var(--grey-6);\n    border-radius: 50%;\n    transition: border-color var(--ease);\n    @media (hover: hover) {\n      &:hover {\n        border-color: var(--accent);\n      }\n    }\n  }\n\n  &::-moz-range-track {\n    height: var(--sp-1);\n    background: var(--grey-7);\n    border-radius: calc(var(--sp-1) / 2);\n  }\n\n  &::-moz-range-thumb {\n    width: var(--sp-4);\n    height: var(--sp-4);\n    cursor: pointer;\n    background: var(--grey-1);\n    border: 2px solid var(--grey-6);\n    border-radius: 50%;\n    transition: border-color var(--ease);\n    @media (hover: hover) {\n      &:hover {\n        border-color: var(--accent);\n      }\n    }\n  }\n}\n\n.range-control {\n  width: 7.5rem;\n  margin-right: var(--sp-1-5);\n}\n\n.range-value {\n  width: 3em;\n  font-variant-numeric: tabular-nums;\n  color: var(--text-muted);\n  text-align: center;\n}\n\n.comparator label {\n  display: inline-flex;\n  gap: var(--sp-1);\n  align-items: center;\n  font-size: inherit;\n  font-weight: normal;\n  color: var(--text-muted);\n  cursor: default;\n}\n\n/* Controls row */\n.controls-row {\n  display: flex;\n  flex-wrap: wrap;\n  gap: var(--sp-4);\n  align-items: center;\n  width: 100%;\n}\n\n.transform-group {\n  display: flex;\n  gap: var(--sp-1-5);\n  align-items: center;\n  margin-left: auto;\n}\n\n.control-group {\n  display: flex;\n  gap: var(--sp-1-5);\n  align-items: center;\n}\n\n/* Select wrapper */\n.select-wrapper,\n.post-selector {\n  position: relative;\n  display: inline-flex;\n  align-items: center;\n\n  & > select {\n    padding-right: var(--sp-5);\n    cursor: pointer;\n  }\n\n  &::after {\n    position: absolute;\n    top: 50%;\n    right: var(--sp-2);\n    width: var(--sp-2);\n    height: var(--sp-2);\n    pointer-events: none;\n    content: '';\n    border-right: 1.5px solid var(--text-muted);\n    border-bottom: 1.5px solid var(--text-muted);\n    transform: translateY(-50%) rotate(45deg) translate(-1px, -1px);\n  }\n}\n\n/* Content area */\n.content {\n  position: relative;\n  display: flex;\n  flex: 1;\n  min-height: 0;\n  overflow: hidden;\n}\n\n.comparison-side {\n  position: relative;\n  display: flex;\n  flex: 1;\n  align-items: center;\n  justify-content: center;\n  min-height: 0;\n  overflow: hidden;\n\n  & .sync-pan {\n    position: relative;\n  }\n}\n\n.divider {\n  align-self: stretch;\n  width: var(--divider-width);\n  cursor: default;\n  background: var(--grey-6);\n  transition: background var(--ease);\n  @media (hover: hover) {\n    &:hover {\n      background: var(--accent);\n    }\n  }\n}\n\n/* Overlay */\n.overlay-container {\n  position: absolute;\n  inset: 0;\n  z-index: var(--z-overlay);\n  overflow: hidden;\n\n  &.is-inverted {\n    filter: invert(1);\n  }\n\n  & .sync-pan {\n    position: absolute;\n    top: 0;\n    left: 0;\n  }\n\n  &[data-bg='black'] {\n    background: var(--grey-10);\n  }\n  &[data-bg='grey'] {\n    background: var(--grey-5);\n  }\n  &[data-bg='white'] {\n    background: var(--grey-0);\n  }\n}\n\n#comparison-content[data-bg='black'] {\n  background: var(--grey-10);\n}\n#comparison-content[data-bg='grey'] {\n  background: var(--grey-5);\n}\n#comparison-content[data-bg='white'] {\n  background: var(--grey-0);\n}\n\n/* Slider */\n.comparison-slider {\n  position: absolute;\n  top: 0;\n  bottom: 0;\n  z-index: var(--z-slider);\n  width: var(--divider-width);\n  cursor: col-resize;\n  background: var(--grey-0);\n\n  &::after {\n    position: absolute;\n    top: 50%;\n    left: 50%;\n    width: 2rem;\n    height: 2rem;\n    content: '';\n    background: var(--grey-0);\n    border: 1px solid var(--grey-4);\n    border-radius: 50%;\n    box-shadow: 0 1px 4px oklch(0% 0 0 / 40%);\n    transform: translate(-50%, -50%);\n  }\n}\n\n/* Pan/zoom */\n.sync-pan {\n  position: relative;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: 100%;\n  height: 100%;\n  overflow: hidden;\n}\n\n/* Images */\n.compared-img {\n  display: block;\n  max-width: 100%;\n  max-height: 100%;\n  object-fit: contain;\n  image-rendering: pixelated;\n  transform: scale(var(--flip-x, 1), var(--flip-y, 1)) rotate(var(--rotate, 0deg));\n}\n\n/* Overlay images */\n.overlay-img {\n  position: absolute;\n  inset: 0;\n  display: block;\n  width: 100%;\n  height: 100%;\n\n  &.mode-fade {\n    opacity: var(--fade-opacity, 0.5);\n  }\n  &.mode-difference {\n    mix-blend-mode: difference;\n  }\n}\n\n/* Utility states */\n.is-overlay-hidden {\n  display: none !important;\n}\n.is-hidden {\n  display: none !important;\n}\n";
	var shadowState = { root: null };
	var $ = (selector) => shadowState.root?.querySelector(selector) ?? null;
	function createShadowHost() {
		const host = document.createElement("div");
		const shadow = host.attachShadow({ mode: "open" });
		shadowState.root = shadow;
		const style = document.createElement("style");
		style.textContent = style_default;
		shadow.append(style);
		return {
			host,
			shadow
		};
	}
	function destroyShadow() {
		if (!shadowState.root) return;
		shadowState.root.host.remove();
		shadowState.root = null;
	}
	function btn(id, label, title) {
		return createEl("button", {
			id,
			class: "btn",
			...title && { title }
		}, label);
	}
	function buildBackgroundControls() {
		return createEl("div", {
			id: "background-controls",
			class: "control-group"
		}, createEl("label", {}, "Background:", wrapSelect(createEl("select", {
			id: "comparison-background",
			class: "form-control"
		}, new Option("Black", "black"), new Option("Grey", "grey"), new Option("White", "white")))));
	}
	function buildContent() {
		const leftPan = createEl("div", {
			class: "sync-pan",
			id: "left-pan"
		});
		const rightPan = createEl("div", {
			class: "sync-pan",
			id: "right-pan"
		});
		leftPan.append(createEl("img", {
			id: "left-image",
			class: "compared-img",
			alt: "Left Image"
		}));
		rightPan.append(createEl("img", {
			id: "right-image",
			class: "compared-img",
			alt: "Right Image"
		}));
		return createEl("div", {
			id: "comparison-content",
			class: "content"
		}, createEl("div", {
			class: "comparison-side",
			id: "left-side"
		}, leftPan), createEl("div", {
			id: "comparison-divider",
			class: "divider"
		}), createEl("div", {
			class: "comparison-side",
			id: "right-side"
		}, rightPan), createEl("div", {
			id: "comparison-overlay-container",
			class: "overlay-container is-hidden"
		}, createEl("div", {
			class: "sync-pan",
			id: "overlay-pan"
		})));
	}
	function buildControlsRow() {
		return createEl("div", {
			id: "all-controls-row",
			class: "controls-row"
		}, buildFilterControls(), buildBackgroundControls(), buildFadeControls(), buildDifferenceControls(), buildTransformControls());
	}
	function buildDifferenceControls() {
		return createEl("div", {
			id: "difference-controls",
			class: "control-group is-hidden"
		}, createEl("label", {}, "Difference Invert:", btn("invert-difference", "Invert")));
	}
	function buildFadeControls() {
		return createEl("div", {
			id: "fade-controls",
			class: "control-group is-hidden"
		}, createEl("label", {}, "Opacity:", createEl("input", {
			id: "opacity-slider",
			class: "range-control",
			type: "range",
			min: "0",
			max: "100",
			value: "50"
		})), createEl("span", {
			id: "opacity-value",
			class: "range-value"
		}, "50%"));
	}
	function buildFilterControls() {
		return createEl("div", {
			id: "filter-controls",
			class: "control-group"
		}, createEl("label", {}, "Brightness:", createEl("input", {
			id: "brightness-slider",
			class: "range-control",
			type: "range",
			min: "0",
			max: "500",
			value: "100"
		})), createEl("span", {
			id: "brightness-value",
			class: "range-value"
		}, "100"), createEl("label", {}, "Saturate:", createEl("input", {
			id: "saturate-slider",
			class: "range-control",
			type: "range",
			min: "0",
			max: "500",
			value: "100"
		})), createEl("span", {
			id: "saturate-value",
			class: "range-value"
		}, "100"), btn("reset-filters", "Reset Filters"));
	}
	function buildHeader(state) {
		return createEl("div", {
			id: "comparison-header",
			class: "header"
		}, buildPrimaryControls(state), buildControlsRow());
	}
	function buildInterface(state) {
		const container = createEl("div", {
			id: "image-comparison-container",
			class: "comparator",
			tabindex: "0"
		});
		container.append(buildHeader(state), buildContent());
		return container;
	}
	function buildPrimaryControls(state) {
		const currentLabel = getCurrentLabel(state);
		const modeSelect = createEl("select", {
			id: "comparison-mode",
			class: "form-control"
		}, new Option("Side by Side", "side-by-side"), new Option("Slider", "slider"), new Option("Fade", "fade"), new Option("Difference", "difference"));
		return createEl("div", { class: "primary-controls" }, createEl("span", {}, `Current: ${currentLabel}`), createEl("input", {
			id: "second-image-input",
			class: "form-control id-input",
			type: "text",
			placeholder: "Enter ID or URL"
		}), btn("load-comparison", "Load"), createEl("span", { class: "mode-label" }, "Mode:"), wrapSelect(modeSelect), createEl("div", {
			id: "post-info-display",
			class: "post-info"
		}), createEl("div", { class: "right-controls" }, btn("swap-images", "Swap"), btn("reset-zoom", "Reset Zoom"), createEl("button", {
			id: "close-comparison",
			class: "btn btn-close"
		}, "✕")));
	}
	function buildTransformControls() {
		return createEl("div", {
			id: "transform-controls",
			class: "transform-group"
		}, btn("flip-h-left", "↔️ L", "Flip Left Horizontally"), btn("flip-v-left", "↕️ L", "Flip Left Vertically"), btn("rotate-left", "🔄 L", "Rotate Left"), btn("flip-h-right", "↔️ R", "Flip Right Horizontally"), btn("flip-v-right", "↕️ R", "Flip Right Vertically"), btn("rotate-right", "🔄 R", "Rotate Right"), btn("reset-transform", "Reset", "Reset Transforms"));
	}
	function createEl(tag, attrs = {}, ...children) {
		const el = document.createElement(tag);
		for (const [k, v] of Object.entries(attrs)) if (k === "id") el.id = v;
		else if (k === "class") el.className = v;
		else el.setAttribute(k, v);
		el.append(...children);
		return el;
	}
	function getCurrentImageId(state) {
		const { kind, postId } = resolvePageContext(state);
		switch (kind) {
			case "iqdb": return postId || "iqdb";
			case "upload": return "upload";
			case "similar": return "similar";
			default: return postId || "unknown";
		}
	}
	function getCurrentLabel(state) {
		const { kind, postId } = resolvePageContext(state);
		switch (kind) {
			case "iqdb": return postId ? `Post #${postId}` : "IQDB";
			case "upload": return "Upload";
			case "similar": return postId ? `Post #${postId}` : "Similar";
			default: return postId ? `Post #${postId}` : "Custom";
		}
	}
	function resolvePageContext(state) {
		const { site, isIqdb, isUpload, isSimilar, postId } = state.get();
		if (site === "danbooru") {
			if (isIqdb) return {
				kind: "iqdb",
				postId
			};
			if (isUpload) return {
				kind: "upload",
				postId: null
			};
		} else if (isSimilar) return {
			kind: "similar",
			postId: null
		};
		return {
			kind: "post",
			postId
		};
	}
	function wrapSelect(content) {
		const d = createEl("div", { class: "select-wrapper" });
		d.append(content);
		return d;
	}
	var ID_LABELS = {
		iqdb: "IQDB",
		upload: "Upload",
		similar: "Similar"
	};
	function updateInfoUI(postId) {
		updatePostInfo();
		const input = $("#second-image-input");
		if (input && postId !== "custom") input.value = postId;
		const selector = $(".post-selector select");
		if (selector) if (postId === "custom") selector.value = "";
		else selector.value = [...selector.options].some((opt) => opt.value === postId) ? postId : "";
	}
	function updatePostInfo() {
		const leftImg = $("#left-image");
		const rightImg = $("#right-image");
		const infoEl = $("#post-info-display");
		if (!leftImg || !rightImg || !infoEl) return;
		const leftId = leftImg.dataset.id;
		const rightId = rightImg.dataset.id;
		infoEl.textContent = leftId && rightId ? `Compare: ${ID_LABELS[leftId] ?? `#${leftId}`} vs ${rightId === "custom" ? "Custom" : `#${rightId}`}` : "";
	}
	var SITE_MAP = {
		"danbooru.donmai.us": "danbooru",
		"betabooru.donmai.us": "danbooru",
		"safebooru.donmai.us": "danbooru",
		"sonohara.donmai.us": "danbooru",
		"hijiribe.donmai.us": "danbooru",
		"yande.re": "yandere",
		"konachan.com": "konachan"
	};
	function detectSite() {
		return detectSiteFromHostname(location.hostname);
	}
	function detectSiteFromHostname(hostname) {
		return SITE_MAP[hostname] ?? null;
	}
	function extractPostIdFromArticle(el) {
		const direct = el.dataset.id;
		if (direct) return direct;
		return el.querySelector("a.thumb")?.getAttribute("href")?.match(/\/(?:post\/show|posts)\/(\d+)/)?.[1] ?? null;
	}
	function extractPostIdFromPath(pathname) {
		return pathname.match(/\/(?:show|similar)\/(\d+)/)?.[1] ?? null;
	}
	function extractPostIdFromUrl(url) {
		return url.match(/\/(?:posts|show)\/(\d+)/)?.[1] ?? null;
	}
	function isValidPage() {
		const { hostname, pathname, href } = location;
		if (hostname.endsWith(".donmai.us")) return /\/posts\/\d+/.test(href) || /\/uploads\/\d+/.test(href) || /\/iqdb_queries/.test(href);
		return /\/post\/(show|similar)/.test(pathname);
	}
	function isValidPostUrl(url) {
		return /https:\/\/([\w.-]+\.donmai\.us\/posts|yande\.re\/post\/show|konachan\.com\/post\/show)\/\d+/.test(url);
	}
	async function fetchPostsByTag(query) {
		const host = document.location.hostname;
		const endpoint = `/post.json?tags=${query}`;
		const res = await fetch(`https://${host}${endpoint}`);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = await res.json();
		return Array.isArray(data) ? data : [data];
	}
	async function fetchSinglePost(postId, state, sourceHost = null) {
		const targetHost = sourceHost ?? document.location.hostname;
		const endpoint = (sourceHost ? detectSiteFromHostname(sourceHost) : state.get().site) === "danbooru" ? `/posts/${postId}.json` : `/post.json?tags=id:${postId}`;
		const res = await fetch(`https://${targetHost}${endpoint}`);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = await res.json();
		return Array.isArray(data) ? data[0] : data;
	}
	if (typeof window !== "undefined") {
		if (window.NodeList && !NodeList.prototype.forEach) NodeList.prototype.forEach = Array.prototype.forEach;
		if (typeof window.CustomEvent !== "function") window.CustomEvent = function CustomEvent(event, params) {
			params = params || {
				bubbles: false,
				cancelable: false,
				detail: null
			};
			var evt = document.createEvent("CustomEvent");
			evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
			return evt;
		};
	}
	var isIE = typeof document !== "undefined" && !!document.documentMode;
	var divStyle;
	function createStyle() {
		if (divStyle) return divStyle;
		return divStyle = document.createElement("div").style;
	}
	var prefixes = [
		"webkit",
		"moz",
		"ms"
	];
	var prefixCache = {};
	function getPrefixedName(name) {
		if (prefixCache[name]) return prefixCache[name];
		const divStyle = createStyle();
		if (name in divStyle) return prefixCache[name] = name;
		const capName = name[0].toUpperCase() + name.slice(1);
		let i = prefixes.length;
		while (i--) {
			const prefixedName = `${prefixes[i]}${capName}`;
			if (prefixedName in divStyle) return prefixCache[name] = prefixedName;
		}
	}
	function getCSSNum(name, style) {
		return parseFloat(style[getPrefixedName(name)]) || 0;
	}
	function getBoxStyle(elem, name, style = window.getComputedStyle(elem)) {
		const suffix = name === "border" ? "Width" : "";
		return {
			left: getCSSNum(`${name}Left${suffix}`, style),
			right: getCSSNum(`${name}Right${suffix}`, style),
			top: getCSSNum(`${name}Top${suffix}`, style),
			bottom: getCSSNum(`${name}Bottom${suffix}`, style)
		};
	}
	function setStyle(elem, name, value) {
		elem.style[getPrefixedName(name)] = value;
	}
	function setTransition(elem, options) {
		setStyle(elem, "transition", `${getPrefixedName("transform")} ${options.duration}ms ${options.easing}`);
	}
	function setTransform(elem, { x, y, scale, isSVG }, _options) {
		setStyle(elem, "transform", `scale(${scale}) translate(${x}px, ${y}px)`);
		if (isSVG && isIE) {
			const matrixValue = window.getComputedStyle(elem).getPropertyValue("transform");
			elem.setAttribute("transform", matrixValue);
		}
	}
	function getDimensions(elem) {
		let parent = elem.parentNode;
		if (!parent || parent.nodeType !== 1) parent = document.documentElement;
		const style = window.getComputedStyle(elem);
		const parentStyle = window.getComputedStyle(parent);
		const rectElem = elem.getBoundingClientRect();
		const rectParent = parent.getBoundingClientRect();
		return {
			elem: {
				style,
				width: rectElem.width,
				height: rectElem.height,
				top: rectElem.top,
				bottom: rectElem.bottom,
				left: rectElem.left,
				right: rectElem.right,
				margin: getBoxStyle(elem, "margin", style),
				border: getBoxStyle(elem, "border", style)
			},
			parent: {
				style: parentStyle,
				width: rectParent.width,
				height: rectParent.height,
				top: rectParent.top,
				bottom: rectParent.bottom,
				left: rectParent.left,
				right: rectParent.right,
				padding: getBoxStyle(parent, "padding", parentStyle),
				border: getBoxStyle(parent, "border", parentStyle)
			}
		};
	}
	var events = {
		down: "mousedown",
		move: "mousemove",
		up: "mouseup mouseleave"
	};
	if (typeof window !== "undefined") {
		if (typeof window.PointerEvent === "function") events = {
			down: "pointerdown",
			move: "pointermove",
			up: "pointerup pointerleave pointercancel"
		};
		else if (typeof window.TouchEvent === "function") events = {
			down: "touchstart",
			move: "touchmove",
			up: "touchend touchcancel"
		};
	}
	function onPointer(event, elem, handler, eventOpts) {
		events[event].split(" ").forEach((name) => {
			elem.addEventListener(name, handler, eventOpts);
		});
	}
	function destroyPointer(event, elem, handler) {
		events[event].split(" ").forEach((name) => {
			elem.removeEventListener(name, handler);
		});
	}
	function findEventIndex(pointers, event) {
		let i = pointers.length;
		while (i--) if (pointers[i].pointerId === event.pointerId) return i;
		return -1;
	}
	function addPointer(pointers, event) {
		let i;
		if (event.touches) {
			i = 0;
			for (const touch of event.touches) {
				touch.pointerId = i++;
				addPointer(pointers, touch);
			}
			return;
		}
		i = findEventIndex(pointers, event);
		if (i > -1) pointers.splice(i, 1);
		pointers.push(event);
	}
	function removePointer(pointers, event) {
		if (event.touches) {
			while (pointers.length) pointers.pop();
			return;
		}
		const i = findEventIndex(pointers, event);
		if (i > -1) pointers.splice(i, 1);
	}
	function getMiddle(pointers) {
		pointers = pointers.slice(0);
		let event1 = pointers.pop();
		let event2;
		while (event2 = pointers.pop()) event1 = {
			clientX: (event2.clientX - event1.clientX) / 2 + event1.clientX,
			clientY: (event2.clientY - event1.clientY) / 2 + event1.clientY
		};
		return event1;
	}
	function getDistance(pointers) {
		if (pointers.length < 2) return 0;
		const event1 = pointers[0];
		const event2 = pointers[1];
		return Math.sqrt(Math.pow(Math.abs(event2.clientX - event1.clientX), 2) + Math.pow(Math.abs(event2.clientY - event1.clientY), 2));
	}
	function isAttached(node) {
		let currentNode = node;
		while (currentNode && currentNode.parentNode) {
			if (currentNode.parentNode === document) return true;
			currentNode = currentNode.parentNode instanceof ShadowRoot ? currentNode.parentNode.host : currentNode.parentNode;
		}
		return false;
	}
	function getClass(elem) {
		return (elem.getAttribute("class") || "").trim();
	}
	function hasClass(elem, className) {
		return elem.nodeType === 1 && ` ${getClass(elem)} `.indexOf(` ${className} `) > -1;
	}
	function isExcluded(elem, options) {
		for (let cur = elem; cur != null; cur = cur.parentNode) if (hasClass(cur, options.excludeClass) || options.exclude.indexOf(cur) > -1) return true;
		return false;
	}
	var rsvg = /^http:[\w\.\/]+svg$/;
	function isSVGElement(elem) {
		return rsvg.test(elem.namespaceURI) && elem.nodeName.toLowerCase() !== "svg";
	}
	function shallowClone(obj) {
		const clone = {};
		for (const key in obj) if (obj.hasOwnProperty(key)) clone[key] = obj[key];
		return clone;
	}
	var defaultOptions = {
		animate: false,
		canvas: false,
		cursor: "move",
		disablePan: false,
		disableZoom: false,
		disableXAxis: false,
		disableYAxis: false,
		duration: 200,
		easing: "ease-in-out",
		exclude: [],
		excludeClass: "panzoom-exclude",
		handleStartEvent: (e) => {
			e.preventDefault();
			e.stopPropagation();
		},
		maxScale: 4,
		minScale: .125,
		overflow: "hidden",
		panOnlyWhenZoomed: false,
		pinchAndPan: false,
		relative: false,
		setTransform,
		startX: 0,
		startY: 0,
		startScale: 1,
		step: .3,
		touchAction: "none"
	};
	function Panzoom(elem, options) {
		if (!elem) throw new Error("Panzoom requires an element as an argument");
		if (elem.nodeType !== 1) throw new Error("Panzoom requires an element with a nodeType of 1");
		if (!isAttached(elem)) throw new Error("Panzoom should be called on elements that have been attached to the DOM");
		options = {
			...defaultOptions,
			...options
		};
		const isSVG = isSVGElement(elem);
		const parent = elem.parentNode;
		parent.style.overflow = options.overflow;
		parent.style.userSelect = "none";
		parent.style.touchAction = options.touchAction;
		(options.canvas ? parent : elem).style.cursor = options.cursor;
		elem.style.userSelect = "none";
		elem.style.touchAction = options.touchAction;
		setStyle(elem, "transformOrigin", typeof options.origin === "string" ? options.origin : isSVG ? "0 0" : "50% 50%");
		function resetStyle() {
			parent.style.overflow = "";
			parent.style.userSelect = "";
			parent.style.touchAction = "";
			parent.style.cursor = "";
			elem.style.cursor = "";
			elem.style.userSelect = "";
			elem.style.touchAction = "";
			setStyle(elem, "transformOrigin", "");
		}
		function setOptions(opts = {}) {
			for (const key in opts) if (opts.hasOwnProperty(key)) options[key] = opts[key];
			if (opts.hasOwnProperty("cursor") || opts.hasOwnProperty("canvas")) {
				parent.style.cursor = elem.style.cursor = "";
				(options.canvas ? parent : elem).style.cursor = options.cursor;
			}
			if (opts.hasOwnProperty("overflow")) parent.style.overflow = opts.overflow;
			if (opts.hasOwnProperty("touchAction")) {
				parent.style.touchAction = opts.touchAction;
				elem.style.touchAction = opts.touchAction;
			}
		}
		let x = 0;
		let y = 0;
		let scale = 1;
		let isPanning = false;
		zoom(options.startScale, {
			animate: false,
			force: true
		});
		setTimeout(() => {
			pan(options.startX, options.startY, {
				animate: false,
				force: true
			});
		});
		function trigger(eventName, detail, opts) {
			if (opts.silent) return;
			const event = new CustomEvent(eventName, { detail });
			elem.dispatchEvent(event);
		}
		function setTransformWithEvent(eventName, opts, originalEvent) {
			const value = {
				x,
				y,
				scale,
				isSVG,
				originalEvent
			};
			requestAnimationFrame(() => {
				if (typeof opts.animate === "boolean") if (opts.animate) setTransition(elem, opts);
				else setStyle(elem, "transition", "none");
				opts.setTransform(elem, value, opts);
				trigger(eventName, value, opts);
				trigger("panzoomchange", value, opts);
			});
			return value;
		}
		function constrainXY(toX, toY, toScale, panOptions) {
			const opts = {
				...options,
				...panOptions
			};
			const result = {
				x,
				y,
				opts
			};
			if (!panOptions?.force && (opts.disablePan || opts.panOnlyWhenZoomed && scale === opts.startScale)) return result;
			toX = parseFloat(toX);
			toY = parseFloat(toY);
			if (!opts.disableXAxis) result.x = (opts.relative ? x : 0) + toX;
			if (!opts.disableYAxis) result.y = (opts.relative ? y : 0) + toY;
			if (opts.contain) {
				const dims = getDimensions(elem);
				const realWidth = dims.elem.width / scale;
				const realHeight = dims.elem.height / scale;
				const scaledWidth = realWidth * toScale;
				const scaledHeight = realHeight * toScale;
				const diffHorizontal = (scaledWidth - realWidth) / 2;
				const diffVertical = (scaledHeight - realHeight) / 2;
				if (opts.contain === "inside") {
					const minX = (-dims.elem.margin.left - dims.parent.padding.left + diffHorizontal) / toScale;
					const maxX = (dims.parent.width - scaledWidth - dims.parent.padding.left - dims.elem.margin.left - dims.parent.border.left - dims.parent.border.right + diffHorizontal) / toScale;
					result.x = Math.max(Math.min(result.x, maxX), minX);
					const minY = (-dims.elem.margin.top - dims.parent.padding.top + diffVertical) / toScale;
					const maxY = (dims.parent.height - scaledHeight - dims.parent.padding.top - dims.elem.margin.top - dims.parent.border.top - dims.parent.border.bottom + diffVertical) / toScale;
					result.y = Math.max(Math.min(result.y, maxY), minY);
				} else if (opts.contain === "outside") {
					const minX = (-(scaledWidth - dims.parent.width) - dims.parent.padding.left - dims.parent.border.left - dims.parent.border.right + diffHorizontal) / toScale;
					const maxX = (diffHorizontal - dims.parent.padding.left) / toScale;
					result.x = Math.max(Math.min(result.x, maxX), minX);
					const minY = (-(scaledHeight - dims.parent.height) - dims.parent.padding.top - dims.parent.border.top - dims.parent.border.bottom + diffVertical) / toScale;
					const maxY = (diffVertical - dims.parent.padding.top) / toScale;
					result.y = Math.max(Math.min(result.y, maxY), minY);
				}
			}
			if (opts.roundPixels) {
				result.x = Math.round(result.x);
				result.y = Math.round(result.y);
			}
			return result;
		}
		function constrainScale(toScale, zoomOptions) {
			const opts = {
				...options,
				...zoomOptions
			};
			const result = {
				scale,
				opts
			};
			if (!zoomOptions?.force && opts.disableZoom) return result;
			let minScale = options.minScale;
			let maxScale = options.maxScale;
			if (opts.contain) {
				const dims = getDimensions(elem);
				const elemWidth = dims.elem.width / scale;
				const elemHeight = dims.elem.height / scale;
				if (elemWidth > 1 && elemHeight > 1) {
					const parentWidth = dims.parent.width - dims.parent.border.left - dims.parent.border.right;
					const parentHeight = dims.parent.height - dims.parent.border.top - dims.parent.border.bottom;
					const elemScaledWidth = parentWidth / elemWidth;
					const elemScaledHeight = parentHeight / elemHeight;
					if (options.contain === "inside") maxScale = Math.min(maxScale, elemScaledWidth, elemScaledHeight);
					else if (options.contain === "outside") minScale = Math.max(minScale, elemScaledWidth, elemScaledHeight);
				}
			}
			result.scale = Math.min(Math.max(toScale, minScale), maxScale);
			return result;
		}
		function pan(toX, toY, panOptions, originalEvent) {
			const result = constrainXY(toX, toY, scale, panOptions);
			if (x !== result.x || y !== result.y) {
				x = result.x;
				y = result.y;
				return setTransformWithEvent("panzoompan", result.opts, originalEvent);
			}
			return {
				x,
				y,
				scale,
				isSVG,
				originalEvent
			};
		}
		function zoom(toScale, zoomOptions, originalEvent) {
			const result = constrainScale(toScale, zoomOptions);
			const opts = result.opts;
			if (!zoomOptions?.force && opts.disableZoom) return;
			toScale = result.scale;
			let toX = x;
			let toY = y;
			if (opts.focal) {
				const focal = opts.focal;
				toX = (focal.x / toScale - focal.x / scale + x * toScale) / toScale;
				toY = (focal.y / toScale - focal.y / scale + y * toScale) / toScale;
			}
			const panResult = constrainXY(toX, toY, toScale, {
				relative: false,
				force: true
			});
			x = panResult.x;
			y = panResult.y;
			scale = toScale;
			return setTransformWithEvent("panzoomzoom", opts, originalEvent);
		}
		function zoomInOut(isIn, zoomOptions) {
			const opts = {
				...options,
				animate: true,
				...zoomOptions
			};
			return zoom(scale * Math.exp((isIn ? 1 : -1) * opts.step), opts);
		}
		function zoomIn(zoomOptions) {
			return zoomInOut(true, zoomOptions);
		}
		function zoomOut(zoomOptions) {
			return zoomInOut(false, zoomOptions);
		}
		function zoomToPoint(toScale, point, zoomOptions, originalEvent) {
			const dims = getDimensions(elem);
			const effectiveArea = {
				width: dims.parent.width - dims.parent.padding.left - dims.parent.padding.right - dims.parent.border.left - dims.parent.border.right,
				height: dims.parent.height - dims.parent.padding.top - dims.parent.padding.bottom - dims.parent.border.top - dims.parent.border.bottom
			};
			let clientX = point.clientX - dims.parent.left - dims.parent.padding.left - dims.parent.border.left - dims.elem.margin.left;
			let clientY = point.clientY - dims.parent.top - dims.parent.padding.top - dims.parent.border.top - dims.elem.margin.top;
			if (!isSVG) {
				clientX -= dims.elem.width / scale / 2;
				clientY -= dims.elem.height / scale / 2;
			}
			const focal = {
				x: clientX / effectiveArea.width * (effectiveArea.width * toScale),
				y: clientY / effectiveArea.height * (effectiveArea.height * toScale)
			};
			return zoom(toScale, {
				...zoomOptions,
				animate: false,
				focal
			}, originalEvent);
		}
		function zoomWithWheel(event, zoomOptions) {
			event.preventDefault();
			const opts = {
				...options,
				...zoomOptions,
				animate: false
			};
			const wheel = (event.deltaY === 0 && event.deltaX ? event.deltaX : event.deltaY) < 0 ? 1 : -1;
			const toScale = constrainScale(scale * Math.exp(wheel * opts.step / 3), opts).scale;
			return zoomToPoint(toScale, event, opts, event);
		}
		function reset(resetOptions) {
			const opts = {
				...options,
				animate: true,
				force: true,
				...resetOptions
			};
			scale = constrainScale(opts.startScale, opts).scale;
			const panResult = constrainXY(opts.startX, opts.startY, scale, opts);
			x = panResult.x;
			y = panResult.y;
			return setTransformWithEvent("panzoomreset", opts);
		}
		let origX;
		let origY;
		let startClientX;
		let startClientY;
		let startScale;
		let startDistance;
		const pointers = [];
		function handleDown(event) {
			if (isExcluded(event.target, options)) return;
			addPointer(pointers, event);
			isPanning = true;
			options.handleStartEvent(event);
			origX = x;
			origY = y;
			trigger("panzoomstart", {
				x,
				y,
				scale,
				isSVG,
				originalEvent: event
			}, options);
			const point = getMiddle(pointers);
			startClientX = point.clientX;
			startClientY = point.clientY;
			startScale = scale;
			startDistance = getDistance(pointers);
		}
		function handleMove(event) {
			if (!isPanning || origX === void 0 || origY === void 0 || startClientX === void 0 || startClientY === void 0) return;
			addPointer(pointers, event);
			const current = getMiddle(pointers);
			const hasMultiple = pointers.length > 1;
			let toScale = scale;
			if (hasMultiple) {
				if (startDistance === 0) startDistance = getDistance(pointers);
				toScale = constrainScale((getDistance(pointers) - startDistance) * options.step / 80 + startScale).scale;
				zoomToPoint(toScale, current, { animate: false }, event);
			}
			if (!hasMultiple || options.pinchAndPan) pan(origX + (current.clientX - startClientX) / toScale, origY + (current.clientY - startClientY) / toScale, { animate: false }, event);
		}
		function handleUp(event) {
			if (pointers.length === 1) trigger("panzoomend", {
				x,
				y,
				scale,
				isSVG,
				originalEvent: event
			}, options);
			removePointer(pointers, event);
			if (!isPanning) return;
			isPanning = false;
			origX = origY = startClientX = startClientY = void 0;
		}
		let bound = false;
		function bind() {
			if (bound) return;
			bound = true;
			onPointer("down", options.canvas ? parent : elem, handleDown);
			onPointer("move", document, handleMove, { passive: true });
			onPointer("up", document, handleUp, { passive: true });
		}
		function destroy() {
			bound = false;
			destroyPointer("down", options.canvas ? parent : elem, handleDown);
			destroyPointer("move", document, handleMove);
			destroyPointer("up", document, handleUp);
		}
		if (!options.noBind) bind();
		return {
			bind,
			destroy,
			eventNames: events,
			getPan: () => ({
				x,
				y
			}),
			getScale: () => scale,
			getOptions: () => shallowClone(options),
			handleDown,
			handleMove,
			handleUp,
			pan,
			reset,
			resetStyle,
			setOptions,
			setStyle: (name, value) => setStyle(elem, name, value),
			zoom,
			zoomIn,
			zoomOut,
			zoomToPoint,
			zoomWithWheel
		};
	}
	Panzoom.defaultOptions = defaultOptions;
	var wheelListeners = new WeakMap();
	var OVERLAY_MODES = new Set([
		MODES.SLIDER,
		MODES.FADE,
		MODES.DIFFERENCE
	]);
	function activeZoomInstance(appState) {
		return appState.panzoomInstances.overlay ?? appState.panzoomInstances.left ?? appState.panzoomInstances.right ?? null;
	}
	function applyZoomTransition(state, fromMode, toMode) {
		const { zoomState } = state.get();
		const isFromOverlay = isOverlayMode(fromMode);
		const isToOverlay = isOverlayMode(toMode);
		if (isFromOverlay === isToOverlay) return;
		const refImg = $("#left-image");
		const content = $("#comparison-content");
		if (!refImg || !content || !refImg.naturalWidth) return;
		const divW = $("#comparison-divider")?.getBoundingClientRect().width || 4;
		const sideW = (content.clientWidth - divW) / 2;
		const computeImageHeight = (img, w) => {
			if (!img.naturalWidth || !img.naturalHeight) return content.clientHeight;
			return img.naturalWidth / img.naturalHeight > w / content.clientHeight ? w / (img.naturalWidth / img.naturalHeight) : content.clientHeight;
		};
		const sideBySideH = computeImageHeight(refImg, sideW);
		const overlayH = computeImageHeight(refImg, content.clientWidth);
		const ratio = isFromOverlay && !isToOverlay ? overlayH / sideBySideH : sideBySideH / overlayH;
		if (ratio !== 1) state.update("zoomState", {
			...zoomState,
			scale: Math.max(.1, zoomState.scale * ratio),
			y: zoomState.y * ratio
		});
	}
	function bindWheelEvents(state) {
		const leftSide = $("#left-side");
		const rightSide = $("#right-side");
		const { left, right } = state.get().panzoomInstances;
		if (!leftSide || !rightSide || !left || !right) return;
		const lw = makeWheelHandler(left);
		const rw = makeWheelHandler(right);
		leftSide.addEventListener("wheel", lw);
		rightSide.addEventListener("wheel", rw);
		state.update("eventCleanup", [
			...state.get().eventCleanup,
			() => leftSide.removeEventListener("wheel", lw),
			() => rightSide.removeEventListener("wheel", rw)
		]);
	}
	function cleanupOverlayWheelListeners() {
		const el = $("#comparison-overlay-container");
		if (!el) return;
		const h = wheelListeners.get(el);
		if (h) {
			el.removeEventListener("wheel", h);
			wheelListeners.delete(el);
		}
	}
	function commitZoomState(state) {
		const active = activeZoomInstance(state.get());
		if (!active) return;
		const pan = active.getPan();
		state.update("zoomState", {
			scale: active.getScale(),
			x: pan.x,
			y: pan.y
		});
	}
	function destroyAllZoom(state) {
		const { left, right, overlay } = state.get().panzoomInstances;
		for (const pz of [
			left,
			right,
			overlay
		]) pz?.destroy();
		cleanupOverlayWheelListeners();
		state.update("panzoomInstances", {});
	}
	function destroyOverlayZoom(state) {
		const { panzoomInstances } = state.get();
		if (panzoomInstances.overlay) {
			panzoomInstances.overlay.destroy();
			state.update("panzoomInstances", {
				...panzoomInstances,
				overlay: null
			});
		}
	}
	function initOverlayPanzoom(state) {
		const overlayPan = $("#overlay-pan");
		const container = $("#comparison-overlay-container");
		if (!overlayPan || !container) return;
		const instance = Panzoom(overlayPan, { maxScale: Infinity });
		state.update("panzoomInstances", {
			...state.get().panzoomInstances,
			overlay: instance
		});
		const { zoomState } = state.get();
		instance.zoom(zoomState.scale, {
			animate: false,
			silent: true
		});
		instance.pan(zoomState.x, zoomState.y, {
			animate: false,
			silent: true
		});
		const old = wheelListeners.get(container);
		if (old) {
			container.removeEventListener("wheel", old);
			wheelListeners.delete(container);
		}
		const wh = makeWheelHandler(instance);
		wheelListeners.set(container, wh);
		container.addEventListener("wheel", wh);
	}
	function initView(state) {
		const leftPan = $("#left-pan");
		const rightPan = $("#right-pan");
		if (!leftPan || !rightPan) return;
		const { panzoomInstances } = state.get();
		panzoomInstances.left?.destroy();
		panzoomInstances.right?.destroy();
		const opts = { maxScale: Infinity };
		state.update("panzoomInstances", {
			...panzoomInstances,
			left: Panzoom(leftPan, opts),
			right: Panzoom(rightPan, opts)
		});
		setTimeout(() => restoreZoomState(state), 0);
		syncPanzoom(state);
		bindWheelEvents(state);
	}
	function isOverlayMode(mode) {
		return OVERLAY_MODES.has(mode);
	}
	function makeWheelHandler(pz) {
		return (e) => {
			e.preventDefault();
			pz.zoomWithWheel(e);
		};
	}
	function resetZoom(state) {
		const { left, right, overlay } = state.get().panzoomInstances;
		for (const pz of [
			left,
			right,
			overlay
		]) pz?.reset();
	}
	function restoreZoomState(state) {
		const { zoomState, panzoomInstances } = state.get();
		const { left, right, overlay } = panzoomInstances;
		for (const pz of [
			left,
			right,
			overlay
		]) {
			if (!pz) continue;
			pz.zoom(zoomState.scale, {
				animate: false,
				silent: true
			});
			pz.pan(zoomState.x, zoomState.y, {
				animate: false,
				silent: true
			});
		}
	}
	function syncPanzoom(state) {
		const leftPan = $("#left-pan");
		const rightPan = $("#right-pan");
		const { left, right } = state.get().panzoomInstances;
		if (!leftPan || !rightPan || !left || !right) return;
		let isBusy = false;
		const sync = (target) => (e) => {
			if (isBusy) return;
			isBusy = true;
			try {
				const { x, y, scale } = e.detail;
				target.zoom(scale, {
					animate: false,
					silent: true
				});
				target.pan(x, y, {
					animate: false,
					silent: true
				});
			} catch (error) {
				console.warn("Panzoom sync failed:", error);
			} finally {
				isBusy = false;
			}
		};
		const leftHandler = sync(right);
		const rightHandler = sync(left);
		leftPan.addEventListener("panzoomchange", leftHandler);
		rightPan.addEventListener("panzoomchange", rightHandler);
		state.update("eventCleanup", [
			...state.get().eventCleanup,
			() => leftPan.removeEventListener("panzoomchange", leftHandler),
			() => rightPan.removeEventListener("panzoomchange", rightHandler)
		]);
	}
	function addPostFromPreview(el, isParent, postId, posts) {
		const { id } = el.dataset;
		if (!id || !el.querySelector(".post-preview-image") || id === postId || posts.some((p) => p.id === id)) return;
		const parentId = document.body.dataset.postParentId;
		const relationshipType = isParent ? id === parentId ? "Parent" : "Sibling" : "Child";
		posts.push({
			id,
			relationshipType
		});
	}
	function bindPostSelectorEvents(select, onSelect) {
		select.addEventListener("change", () => {
			if (!select.value) return;
			const input = $("#second-image-input");
			if (input) input.value = select.value;
			onSelect();
		});
	}
	function buildPostSelector(state, posts) {
		const { isIqdb, isSimilar, isUpload } = state.get();
		const label = isIqdb || isSimilar || isUpload ? "Similar: " : "Related: ";
		const container = document.createElement("div");
		container.className = "post-selector";
		const span = document.createElement("span");
		span.textContent = label;
		const select = document.createElement("select");
		select.className = "form-control";
		populatePostSelector(select, posts);
		container.append(span, select);
		return container;
	}
	async function createPostSelector(state, onSelect) {
		const posts = await getRelatedPosts(state);
		if (posts.length === 0) return;
		const input = $("#second-image-input");
		if (!input?.parentElement) return;
		const wrap = buildPostSelector(state, posts);
		input.parentElement.insertBefore(wrap, input);
		const select = wrap.querySelector("select");
		if (select) bindPostSelectorEvents(select, onSelect);
	}
	function extractFromNotices(state, posts) {
		const { postId } = state.get();
		const notice = document.querySelector(".post-notice-parent, .post-notice-child");
		if (!notice) return;
		for (const link of notice.querySelectorAll("a[href*='parent'], a[href*='child']")) {
			const href = link.getAttribute("href");
			if (!href) continue;
			const decoded = decodeURIComponent(href);
			const isParent = /parent:/.test(decoded);
			const id = decoded.match(/(?:parent|child):(\d+)/)?.[1];
			if (id && id !== postId && posts.every((p) => p.id !== id)) posts.push({
				id,
				relationshipType: isParent ? "Parent" : "Child"
			});
		}
	}
	function extractFromPreviews(state, posts) {
		const { postId } = state.get();
		for (const { selector, isParent } of [{
			selector: "#has-parent-relationship-preview",
			isParent: true
		}, {
			selector: "#has-children-relationship-preview",
			isParent: false
		}]) {
			const preview = document.querySelector(selector);
			if (!preview) continue;
			for (const el of preview.querySelectorAll(".post-preview")) addPostFromPreview(el, isParent, postId, posts);
		}
	}
	function extractImageUrl(data, site = "danbooru") {
		const url = site === "danbooru" ? data.file_url || data.large_file_url : data.file_url || data.jpeg_url;
		if (!url) throw new Error("No image URL found in post data");
		return url;
	}
	async function fetchChildren(state, posts) {
		const { postId } = state.get();
		const children = await fetchPostsByTag(`parent:${postId}`);
		for (const p of children) if (p.id.toString() !== postId) posts.push({
			id: p.id.toString(),
			relationshipType: "Child"
		});
	}
	async function fetchParentSiblings(state, posts) {
		const { postId } = state.get();
		const resp = await fetchPostsByTag(`id:${postId}`);
		if (resp.length === 0) return;
		const current = resp.find((p) => p.id.toString() === postId);
		if (!current?.parent_id) return;
		const siblings = await fetchPostsByTag(`parent:${current.parent_id}`);
		for (const p of siblings) {
			if (p.id.toString() === postId) continue;
			const rel = p.id.toString() === current.parent_id?.toString() ? "Parent" : "Sibling";
			posts.push({
				id: p.id.toString(),
				relationshipType: rel
			});
		}
	}
	function getDanbooru(state) {
		const { isIqdb, isUpload } = state.get();
		if (isIqdb || isUpload) return getDanbooruSimilar(state);
		const posts = [];
		extractFromPreviews(state, posts);
		extractFromNotices(state, posts);
		return posts;
	}
	function getDanbooruSimilar(state) {
		const { postId } = state.get();
		const posts = [];
		for (const el of document.querySelectorAll(".iqdb-posts .post-preview")) {
			const { id } = el.dataset;
			if (!id || id === postId) continue;
			const match = el.querySelector(".iqdb-similarity-score")?.textContent?.match(/(\d+)%\s*similar/);
			posts.push({
				id,
				relationshipType: "Similar",
				similarity: match ? +match[1] : null
			});
		}
		return posts;
	}
	function getOriginalImageUrl(state) {
		const { site, isUpload, isIqdb, isSimilar, searchUrl } = state.get();
		if (site === "danbooru") {
			if (isUpload) return document.querySelector(".media-asset-image")?.src || null;
			if (isIqdb) return searchUrl;
			return document.querySelector(".image-view-original-link")?.href || document.querySelector("#image")?.src || null;
		}
		if (isSimilar) return searchUrl;
		return document.querySelector("a#highres")?.href || null;
	}
	async function getRelatedPosts(state) {
		const { site } = state.get();
		return site === "danbooru" ? getDanbooru(state) : getYandereKonachan(state);
	}
	async function getYandereKonachan(state) {
		const { isSimilar } = state.get();
		if (isSimilar) return getYandereSimilar();
		const posts = [];
		if (state.get().postId) {
			try {
				await fetchParentSiblings(state, posts);
			} catch (error) {
				console.warn("Failed to fetch parent/siblings:", error);
			}
			try {
				await fetchChildren(state, posts);
			} catch (error) {
				console.warn("Failed to fetch children:", error);
			}
		}
		return sortPosts(posts);
	}
	function getYandereSimilar() {
		const posts = [];
		for (const el of document.querySelectorAll("#post-list-posts li")) {
			const id = extractPostIdFromArticle(el);
			if (!id) continue;
			const sourceHost = el.querySelector(":scope .similar-text img[alt]")?.alt;
			posts.push({
				id,
				relationshipType: "Similar",
				sourceHost: sourceHost || void 0
			});
		}
		return posts;
	}
	function populatePostSelector(select, posts) {
		select.append(new Option("-- Select post --", ""));
		const currentRightId = $("#right-image")?.dataset.id || null;
		for (const post of posts) {
			let text = `#${post.id}`;
			if (post.similarity) text += ` (${post.similarity}%)`;
			else if (post.relationshipType !== "Similar") text += ` (${post.relationshipType})`;
			if (post.sourceHost) {
				const site = detectSiteFromHostname(post.sourceHost);
				if (site) text += ` [${site}]`;
			}
			select.append(new Option(text, post.id));
		}
		if (currentRightId && posts.some((p) => p.id === currentRightId)) select.value = currentRightId;
	}
	function sortPosts(posts) {
		return posts.toSorted((a, b) => {
			const pa = RELATIONSHIP_PRIORITY[a.relationshipType] ?? 5;
			const pb = RELATIONSHIP_PRIORITY[b.relationshipType] ?? 5;
			return pa === pb ? +a.id - +b.id : pa - pb;
		});
	}
	function applyTransforms(state) {
		const { transforms: t } = state.get();
		const map = {
			left: ["left-image", "overlay-left-image"],
			right: ["right-image", "overlay-image"]
		};
		for (const side of ["left", "right"]) {
			const imageIds = map[side];
			for (const id of imageIds) {
				const el = $(`#${id}`);
				if (el) applyTransformTo(el, t[side]);
			}
		}
	}
	function applyTransformTo(el, t) {
		el.style.setProperty("--flip-x", t.flipH ? "-1" : "1");
		el.style.setProperty("--flip-y", t.flipV ? "-1" : "1");
		el.style.setProperty("--rotate", `${t.rotation}deg`);
	}
	function resetTransforms(state) {
		state.update("transforms", {
			left: {
				flipH: false,
				flipV: false,
				rotation: 0
			},
			right: {
				flipH: false,
				flipV: false,
				rotation: 0
			}
		});
		applyTransforms(state);
	}
	function rotateTransform(state, side) {
		const t = { ...state.get().transforms };
		t[side] = {
			...t[side],
			rotation: (t[side].rotation + 90) % 360
		};
		state.update("transforms", t);
		applyTransforms(state);
	}
	function toggleTransform(state, side, key) {
		const t = { ...state.get().transforms };
		t[side] = {
			...t[side],
			[key]: !t[side][key]
		};
		state.update("transforms", t);
		applyTransforms(state);
	}
	function applyFade(pct) {
		const overlayImg = $("#overlay-image");
		if (overlayImg) overlayImg.style.setProperty("--fade-opacity", String(pct / 100));
		const sl = $("#opacity-slider");
		if (sl) sl.value = String(pct);
		const vl = $("#opacity-value");
		if (vl) vl.textContent = `${pct}%`;
	}
	function resetFilters() {
		for (const id of ["brightness-slider", "saturate-slider"]) {
			const el = $(`#${id}`);
			if (el) el.value = "100";
		}
		updateFilters();
	}
	function toggleDifferenceInvert() {
		const cont = $("#comparison-overlay-container");
		const btn = $("#invert-difference");
		if (!cont || !btn) return;
		btn.textContent = cont.classList.toggle("is-inverted") ? "Normal" : "Invert";
	}
	function updateBackground() {
		const value = $("#comparison-background")?.value;
		if (!value) return;
		const cont = $("#comparison-overlay-container");
		if (cont) cont.dataset.bg = value;
		const content = $("#comparison-content");
		if (content) content.dataset.bg = value;
	}
	function updateFilters() {
		const brightSl = $("#brightness-slider");
		const satSl = $("#saturate-slider");
		const brightVl = $("#brightness-value");
		const satVl = $("#saturate-value");
		if (!brightSl || !satSl || !brightVl || !satVl) return;
		brightVl.textContent = brightSl.value;
		satVl.textContent = satSl.value;
		const filter = `brightness(${+brightSl.value / 100}) saturate(${+satSl.value / 100})`;
		for (const id of [
			"overlay-pan",
			"left-pan",
			"right-pan"
		]) {
			const pan = $(`#${id}`);
			if (pan) pan.style.filter = filter;
		}
	}
	function updateOpacity() {
		const sl = $("#opacity-slider");
		if (sl) applyFade(+sl.value);
	}
	var sliderState = { cleanup: [] };
	function bindSliderEvents(state, sliderEl, rightImg, container) {
		unbindSlider();
		let isDragging = false;
		const move = (e) => {
			updateSlider(state, sliderEl, rightImg, e.clientX - container.getBoundingClientRect().left, container);
		};
		const onPanzoomChange = () => {
			const raw = Number.parseInt(sliderEl.style.left);
			updateSlider(state, sliderEl, rightImg, Number.isNaN(raw) ? container.clientWidth / 2 : raw, container);
		};
		const onSliderMouseDown = (e) => {
			e.preventDefault();
			isDragging = true;
		};
		const onContainerMouseMove = (e) => {
			if (isDragging) move(e);
		};
		const onContainerMouseDown = (e) => {
			if (e.target === sliderEl) return;
			move(e);
			isDragging = true;
		};
		const onMouseUp = () => {
			isDragging = false;
		};
		sliderEl.addEventListener("mousedown", onSliderMouseDown);
		container.addEventListener("mousemove", onContainerMouseMove);
		container.addEventListener("mousedown", onContainerMouseDown);
		document.addEventListener("mouseup", onMouseUp);
		const newCleanup = [
			() => sliderEl.removeEventListener("mousedown", onSliderMouseDown),
			() => container.removeEventListener("mousemove", onContainerMouseMove),
			() => container.removeEventListener("mousedown", onContainerMouseDown),
			() => document.removeEventListener("mouseup", onMouseUp)
		];
		const overlayPan = $("#overlay-pan");
		if (overlayPan && state.get().panzoomInstances.overlay) for (const ev of [
			"panzoomchange",
			"panzoomzoom",
			"panzoompan"
		]) {
			overlayPan.addEventListener(ev, onPanzoomChange);
			newCleanup.push(() => overlayPan.removeEventListener(ev, onPanzoomChange));
		}
		sliderState.cleanup = newCleanup;
	}
	function initSlider(state) {
		const container = $("#comparison-overlay-container");
		const rightImg = $("#overlay-image");
		if (!container || !rightImg?.src?.trim()) return;
		let el = $("#comparison-slider");
		if (!el) {
			el = document.createElement("div");
			el.id = "comparison-slider";
			el.className = "comparison-slider";
			container.append(el);
		}
		updateSlider(state, el, rightImg, container.clientWidth / 2, container);
		bindSliderEvents(state, el, rightImg, container);
	}
	function subscribeSliderUpdater(state) {
		return state.subscribe((next, prev) => {
			if (next.mode === MODES.SLIDER && (JSON.stringify(next.transforms) !== JSON.stringify(prev.transforms) || prev.mode !== MODES.SLIDER || JSON.stringify(next.zoomState) !== JSON.stringify(prev.zoomState))) setTimeout(() => updateSliderIfNeeded(state), 0);
		});
	}
	function unbindSlider() {
		for (const fn of sliderState.cleanup) fn();
		sliderState.cleanup = [];
	}
	function updateSlider(state, sliderEl, rightImg, containerX, container) {
		const x = Math.max(0, Math.min(containerX, container.clientWidth));
		sliderEl.style.left = `${x}px`;
		const { panzoomInstances, transforms } = state.get();
		const pz = panzoomInstances.overlay;
		const isFlipped = transforms.right.flipH;
		if (pz) {
			const scale = pz.getScale();
			const imgRect = rightImg.getBoundingClientRect();
			const contRect = container.getBoundingClientRect();
			const relX = x - (imgRect.left - contRect.left);
			const clipX = Math.max(0, relX / scale);
			rightImg.style.clipPath = isFlipped ? `inset(0 ${clipX}px 0 0)` : `inset(0 0 0 ${clipX}px)`;
		} else rightImg.style.clipPath = isFlipped ? `inset(0 ${x}px 0 0)` : `inset(0 0 0 ${x}px)`;
	}
	function updateSliderIfNeeded(state) {
		if (state.get().mode !== MODES.SLIDER) return;
		const sliderEl = $("#comparison-slider");
		const rightImg = $("#overlay-image");
		const container = $("#comparison-overlay-container");
		if (sliderEl && rightImg && container) {
			const raw = Number.parseInt(sliderEl.style.left);
			updateSlider(state, sliderEl, rightImg, Number.isNaN(raw) ? container.clientWidth / 2 : raw, container);
		}
	}
	function createOverlayImages() {
		const pan = $("#overlay-pan");
		const leftImg = $("#left-image");
		const rightImg = $("#right-image");
		if (!pan || !leftImg || !rightImg) return;
		const leftClone = leftImg.cloneNode(true);
		leftClone.id = "overlay-left-image";
		leftClone.classList.add("compared-img", "overlay-img");
		const rightClone = rightImg.src?.trim() ? rightImg.cloneNode(true) : Object.assign(document.createElement("img"), { alt: rightImg.alt });
		rightClone.id = "overlay-image";
		rightClone.classList.add("compared-img", "overlay-img");
		if (!rightImg.src?.trim()) rightClone.classList.add("is-hidden");
		pan.append(leftClone, rightClone);
	}
	function hideMainElements() {
		for (const id of [
			"left-side",
			"right-side",
			"comparison-divider"
		]) $(`#${id}`)?.classList.add("is-overlay-hidden");
	}
	function resetModeDisplay() {
		for (const id of [
			"left-side",
			"right-side",
			"comparison-divider"
		]) $(`#${id}`)?.classList.remove("is-overlay-hidden");
		const overlay = $("#comparison-overlay-container");
		if (overlay) {
			overlay.innerHTML = "<div class=\"sync-pan\" id=\"overlay-pan\"></div>";
			overlay.classList.add("is-hidden");
			overlay.classList.remove("is-inverted");
		}
		$("#fade-controls")?.classList.add("is-hidden");
		$("#difference-controls")?.classList.add("is-hidden");
		$("#filter-controls")?.classList.remove("is-hidden");
	}
	function setupDifference(state) {
		hideMainElements();
		showOverlay();
		createOverlayImages();
		initOverlayPanzoom(state);
		const img = $("#overlay-image");
		if (img?.src?.trim()) {
			img.classList.remove("is-hidden");
			img.classList.add("mode-difference");
		}
		const invertBtn = $("#invert-difference");
		if (invertBtn) invertBtn.textContent = "Invert";
		$("#difference-controls")?.classList.remove("is-hidden");
	}
	function setupFade(state) {
		hideMainElements();
		showOverlay();
		createOverlayImages();
		initOverlayPanzoom(state);
		const img = $("#overlay-image");
		if (img?.src?.trim()) {
			img.classList.remove("is-hidden");
			img.classList.add("mode-fade");
			updateOpacity();
		}
		$("#fade-controls")?.classList.remove("is-hidden");
	}
	function setupMode(state, mode) {
		switch (mode) {
			case MODES.SLIDER:
				setupSlider(state);
				break;
			case MODES.FADE:
				setupFade(state);
				break;
			case MODES.DIFFERENCE:
				setupDifference(state);
				break;
			default:
				setTimeout(() => restoreZoomState(state), 100);
				break;
		}
	}
	function setupSlider(state) {
		hideMainElements();
		showOverlay();
		createOverlayImages();
		initOverlayPanzoom(state);
		setTimeout(() => initSlider(state), 0);
	}
	function showOverlay() {
		$("#comparison-overlay-container")?.classList.remove("is-hidden");
	}
	function getSavedBackground() {
		let s;
		try {
			s = localStorage.getItem(STORAGE_KEY_BACKGROUND);
		} catch {
			return "black";
		}
		return s && VALID_BACKGROUNDS.has(s) ? s : "black";
	}
	function getSavedMode() {
		let s;
		try {
			s = localStorage.getItem(STORAGE_KEY_MODE);
		} catch {
			return MODES.SIDE_BY_SIDE;
		}
		return s && MODES_ARRAY.includes(s) ? s : MODES.SIDE_BY_SIDE;
	}
	function persistBackground() {
		try {
			const sel = $("#comparison-background");
			if (sel) localStorage.setItem(STORAGE_KEY_BACKGROUND, sel.value);
		} catch (error) {
			console.warn("Failed to save background:", error);
		}
	}
	function persistMode() {
		try {
			const sel = $("#comparison-mode");
			if (sel) localStorage.setItem(STORAGE_KEY_MODE, sel.value);
		} catch (error) {
			console.warn("Failed to save mode:", error);
		}
	}
	function restoreBackground() {
		const saved = getSavedBackground();
		const sel = $("#comparison-background");
		if (sel) sel.value = saved;
		updateBackground();
	}
	function restoreMode(state) {
		const saved = getSavedMode();
		state.update("mode", saved);
		const sel = $("#comparison-mode");
		if (sel) sel.value = saved;
	}
	function bindEvents(state, deps) {
		const cleanup = [];
		const on = (id, handler, event = "click") => {
			const el = $(`#${id}`);
			if (!el) throw new Error(`Comparator UI element #${id} not found`);
			el.addEventListener(event, handler);
			cleanup.push(() => el.removeEventListener(event, handler));
		};
		bindNavigationEvents(on, deps, state);
		bindModeEvents(on, state);
		bindTransformEvents(on, state);
		bindFilterEvents(on);
		bindKeyboardEvents(deps, cleanup);
		state.update("eventCleanup", cleanup);
	}
	function bindFilterEvents(on) {
		on("opacity-slider", () => updateOpacity(), "input");
		on("brightness-slider", () => updateFilters(), "input");
		on("saturate-slider", () => updateFilters(), "input");
		on("comparison-background", () => {
			updateBackground();
			persistBackground();
		}, "change");
		on("invert-difference", () => toggleDifferenceInvert());
		on("reset-filters", () => resetFilters());
	}
	function bindKeyboardEvents(deps, cleanup) {
		const input = $("#second-image-input");
		if (input) {
			const handleKeyPress = (e) => {
				if (e.key === "Enter") deps.onLoadImage();
			};
			input.addEventListener("keydown", handleKeyPress);
			cleanup.push(() => input.removeEventListener("keydown", handleKeyPress));
		}
		const handleEscape = (e) => {
			if (e.key === "Escape") deps.onClose();
		};
		document.addEventListener("keydown", handleEscape);
		cleanup.push(() => document.removeEventListener("keydown", handleEscape));
	}
	function bindModeEvents(on, state) {
		on("comparison-mode", () => {
			updateMode(state);
			persistMode();
		}, "change");
	}
	function bindNavigationEvents(on, deps, state) {
		on("close-comparison", deps.onClose);
		on("load-comparison", deps.onLoadImage);
		on("swap-images", deps.onSwapImages);
		on("reset-zoom", () => resetZoom(state));
	}
	function bindTransformEvents(on, state) {
		on("flip-h-left", () => toggleTransform(state, "left", "flipH"));
		on("flip-v-left", () => toggleTransform(state, "left", "flipV"));
		on("rotate-left", () => rotateTransform(state, "left"));
		on("flip-h-right", () => toggleTransform(state, "right", "flipH"));
		on("flip-v-right", () => toggleTransform(state, "right", "flipV"));
		on("rotate-right", () => rotateTransform(state, "right"));
		on("reset-transform", () => resetTransforms(state));
	}
	function updateMode(state) {
		commitZoomState(state);
		destroyOverlayZoom(state);
		cleanupOverlayWheelListeners();
		if (state.get().mode === MODES.SLIDER) unbindSlider();
		const sel = $("#comparison-mode");
		if (!sel) return;
		const next = sel.value;
		const prev = state.get().mode;
		state.update("mode", next);
		if (prev !== next && isOverlayMode(prev) !== isOverlayMode(next)) applyZoomTransition(state, prev, next);
		resetModeDisplay();
		setupMode(state, next);
		setTimeout(() => {
			applyTransforms(state);
			updateFilters();
			$("#image-comparison-container")?.focus();
		}, 0);
	}
	var loadAbortMap = new WeakMap();
	var imageLoadState = { currentLoadToken: 0 };
	function clearRightImage() {
		const rightImg = $("#right-image");
		const overlayImg = $("#overlay-image");
		if (rightImg) {
			rightImg.src = "";
			delete rightImg.dataset.id;
		}
		if (overlayImg) {
			overlayImg.src = "";
			overlayImg.classList.remove("mode-difference", "mode-fade");
			overlayImg.classList.add("is-hidden");
			overlayImg.style.removeProperty("--fade-opacity");
			overlayImg.style.clipPath = "";
		}
		updatePostInfo();
	}
	function finalizeImageLoad(state, postId) {
		updateInfoUI(postId);
		resetZoom(state);
		updateMode(state);
	}
	function generateLoadToken() {
		return ++imageLoadState.currentLoadToken;
	}
	function handleLoadImage(state) {
		const value = $("#second-image-input")?.value.trim();
		if (!value) {
			alert("Please enter a valid post ID or URL");
			return;
		}
		loadImage(state, value);
	}
	function invalidatePendingLoads() {
		++imageLoadState.currentLoadToken;
		const rightImg = $("#right-image");
		if (rightImg) loadAbortMap.get(rightImg)?.abort();
	}
	function loadDirectUrl(state, url) {
		try {
			const parsed = new URL(url);
			if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Invalid URL format");
			const rightImg = $("#right-image");
			if (!rightImg) return;
			const ac = new AbortController();
			loadAbortMap.set(rightImg, ac);
			rightImg.addEventListener("error", () => {
				alert(`Failed to load image: ${url}`);
				clearRightImage();
			}, {
				once: true,
				signal: ac.signal
			});
			rightImg.addEventListener("load", () => {
				rightImg.dataset.id = "custom";
				finalizeImageLoad(state, "custom");
			}, {
				once: true,
				signal: ac.signal
			});
			rightImg.src = url;
		} catch {
			alert("Invalid URL format");
		}
	}
	function loadImage(state, input) {
		const rightImg = $("#right-image");
		if (rightImg) loadAbortMap.get(rightImg)?.abort();
		clearRightImage();
		const token = generateLoadToken();
		if (/^\d+$/.test(input)) loadPostById(state, input, token);
		else if (isValidPostUrl(input)) {
			const id = extractPostIdFromUrl(input);
			if (id) loadPostById(state, id, token);
			else alert("Could not extract post ID from URL");
		} else loadDirectUrl(state, input);
	}
	async function loadPostById(state, postId, token) {
		try {
			const posts = await getRelatedPosts(state);
			if (imageLoadState.currentLoadToken !== token) return;
			const postData = posts.find((p) => p.id === postId);
			const sourceHost = postData?.sourceHost;
			const data = await (sourceHost && sourceHost !== document.location.hostname ? fetchSinglePost(postId, state, sourceHost) : fetchSinglePost(postId, state));
			if (imageLoadState.currentLoadToken !== token) return;
			const rightImg = $("#right-image");
			if (!rightImg) return;
			rightImg.src = extractImageUrl(data, (postData?.sourceHost && detectSiteFromHostname(postData.sourceHost) || state.get().site) ?? "danbooru");
			rightImg.dataset.id = postId;
			finalizeImageLoad(state, postId);
		} catch (error) {
			if (imageLoadState.currentLoadToken !== token) return;
			alert(`Failed to load post: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	async function loadReferenceImage(state) {
		const leftImg = $("#left-image");
		if (!leftImg) return;
		const { postId, isSimilar, searchUrl } = state.get();
		try {
			if (postId) {
				leftImg.src = extractImageUrl(await fetchSinglePost(postId, state));
				leftImg.dataset.id = postId;
			} else if (isSimilar && searchUrl) {
				leftImg.src = searchUrl;
				leftImg.dataset.id = "similar";
			}
		} catch (error) {
			console.warn(`Failed to load search image: ${error.message}`);
		}
		updatePostInfo();
	}
	function swapDataAttr(a, b, key) {
		const av = a.dataset[key];
		const bv = b.dataset[key];
		if (bv === void 0) delete a.dataset[key];
		else a.dataset[key] = bv;
		if (av === void 0) delete b.dataset[key];
		else b.dataset[key] = av;
	}
	function swapImages(state) {
		const leftImg = $("#left-image");
		const rightImg = $("#right-image");
		if (!leftImg || !rightImg) return;
		if (!rightImg.src.trim()) return;
		[leftImg.src, rightImg.src] = [rightImg.src, leftImg.src];
		swapDataAttr(leftImg, rightImg, "id");
		const { transforms: t, mode } = state.get();
		state.update("transforms", {
			left: t.right,
			right: t.left
		});
		updatePostInfo();
		if (mode === MODES.SIDE_BY_SIDE) applyTransforms(state);
		else updateMode(state);
	}
	var comparatorState = {
		originalBodyOverflow: null,
		pendingLoadTimer: null
	};
	function closeComparator(state) {
		if (comparatorState.pendingLoadTimer) {
			clearTimeout(comparatorState.pendingLoadTimer);
			comparatorState.pendingLoadTimer = null;
		}
		invalidatePendingLoads();
		unbindSlider();
		resetTransforms(state);
		resetModeDisplay();
		destroyAllZoom(state);
		for (const fn of state.get().eventCleanup) fn();
		state.update("eventCleanup", []);
		if (comparatorState.originalBodyOverflow !== null) {
			document.body.style.overflow = comparatorState.originalBodyOverflow;
			comparatorState.originalBodyOverflow = null;
		}
		destroyShadow();
	}
	async function openComparator(postId, state) {
		const { host, shadow } = createShadowHost();
		const container = buildInterface(state);
		shadow.append(container);
		document.body.append(host);
		comparatorState.originalBodyOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		const { originalImageUrl } = state.get();
		const leftImg = container.querySelector("#left-image");
		if (leftImg) {
			if (originalImageUrl) leftImg.src = originalImageUrl;
			leftImg.dataset.id = getCurrentImageId(state);
		}
		await setupComparator(state);
		if (postId) comparatorState.pendingLoadTimer = setTimeout(() => loadImage(state, postId), 100);
	}
	async function setupComparator(state) {
		await createPostSelector(state, () => handleLoadImage(state));
		bindEvents(state, {
			onClose: () => closeComparator(state),
			onLoadImage: () => handleLoadImage(state),
			onSwapImages: () => swapImages(state)
		});
		initView(state);
		restoreMode(state);
		restoreBackground();
		const { isIqdb, isSimilar, postId, originalImageUrl } = state.get();
		if (isIqdb && postId && !originalImageUrl || isSimilar && postId) await loadReferenceImage(state);
		updateMode(state);
		updatePostInfo();
	}
	function addCompareLinks(state, onCompare) {
		const { site } = state.get();
		const selector = site === "danbooru" ? ".posts-container .post-preview, .iqdb-posts .post-preview" : "#post-list-posts li";
		for (const article of document.querySelectorAll(selector)) {
			const postId = extractPostIdFromArticle(article);
			if (!postId || postId === state.get().postId || article.querySelector(".compare-link")) continue;
			const container = document.createElement("div");
			if (site === "danbooru") container.className = "text-xs text-center mt-1";
			else container.style.cssText = "text-align:center;margin-top:0.625rem";
			const link = document.createElement("a");
			link.className = "compare-link";
			link.textContent = "compare »";
			link.href = "#";
			link.addEventListener("click", (e) => {
				e.preventDefault();
				onCompare(postId);
			});
			container.append(link);
			const score = article.querySelector(".post-preview-score");
			if (score) score.before(container);
			else article.append(container);
		}
	}
	function addMainMenuLink(state, onCompare) {
		const { site } = state.get();
		const mainMenu = document.querySelector("#main-menu > ul") ?? document.querySelector("#main-menu");
		if (!mainMenu || mainMenu.querySelector("#nav-compare")) return;
		const link = document.createElement("a");
		link.id = "nav-compare";
		link.textContent = "Compare";
		link.href = "#";
		if (document.querySelector(".px-3")) link.className = "py-1.5 px-3";
		link.addEventListener("click", (e) => {
			e.preventDefault();
			onCompare();
		});
		if (site === "danbooru") mainMenu.append(link);
		else {
			const li = document.createElement("li");
			li.append(link);
			mainMenu.append(li);
		}
	}
	function createAppState() {
		const site = detectSite();
		const { pathname, search } = location;
		let isUpload;
		let isIqdb;
		let isSimilar;
		let postId;
		let searchUrl;
		if (site === "danbooru") {
			isUpload = pathname.startsWith("/uploads");
			isIqdb = pathname.startsWith("/iqdb_queries");
			const params = new URLSearchParams(search);
			postId = isIqdb ? params.get("post_id") || document.querySelector("#search_post_id")?.value?.trim() || null : document.querySelector("meta[name=\"post-id\"]")?.content || null;
			searchUrl = isIqdb ? params.get("url") || document.querySelector("#search_url")?.value?.trim() || null : null;
		} else {
			isSimilar = /\/post\/similar/.test(pathname);
			const params = new URLSearchParams(search);
			postId = extractPostIdFromPath(pathname);
			searchUrl = isSimilar ? safeDecodeURIComponent(params.get("url")) || document.querySelector("#url")?.value?.trim() || null : null;
		}
		return createReactiveState({
			site,
			isUpload,
			isIqdb,
			isSimilar,
			postId,
			searchUrl,
			mode: MODES.SIDE_BY_SIDE,
			transforms: {
				left: {
					flipH: false,
					flipV: false,
					rotation: 0
				},
				right: {
					flipH: false,
					flipV: false,
					rotation: 0
				}
			},
			zoomState: {
				scale: 1,
				x: 0,
				y: 0
			},
			panzoomInstances: {},
			eventCleanup: [],
			originalImageUrl: null
		});
	}
	function createReactiveState(initial) {
		let state = { ...initial };
		const listeners = new Set();
		return {
			get: () => ({ ...state }),
			update(keyOrPartial, value) {
				const prev = { ...state };
				let hasChanged = false;
				if (typeof keyOrPartial === "object" && keyOrPartial !== null) {
					const partial = keyOrPartial;
					for (const [k, v] of Object.entries(partial)) if (JSON.stringify(prev[k]) !== JSON.stringify(v)) hasChanged = true;
					state = {
						...state,
						...partial
					};
				} else {
					const key = keyOrPartial;
					if (JSON.stringify(prev[key]) !== JSON.stringify(value)) hasChanged = true;
					state = {
						...state,
						[key]: value
					};
				}
				if (hasChanged) for (const fn of listeners) fn(state, prev);
			},
			subscribe(fn) {
				listeners.add(fn);
				return () => listeners.delete(fn);
			}
		};
	}
	function safeDecodeURIComponent(raw) {
		if (raw === null) return null;
		try {
			return decodeURIComponent(raw);
		} catch {
			return raw;
		}
	}
	var init = () => {
		if (!isValidPage()) return;
		const state = createAppState();
		state.update("originalImageUrl", getOriginalImageUrl(state));
		subscribeSliderUpdater(state);
		const onCompare = (postId) => openComparator(postId, state);
		addCompareLinks(state, (id) => void onCompare(id));
		addMainMenuLink(state, () => void onCompare(null));
		const target = document.querySelector(".posts-container, .iqdb-posts, #post-list-posts") ?? document.body;
		let pendingRaf = null;
		new MutationObserver(() => {
			if (pendingRaf) return;
			pendingRaf = requestAnimationFrame(() => {
				pendingRaf = null;
				addCompareLinks(state, (id) => void onCompare(id));
			});
		}).observe(target, {
			childList: true,
			subtree: true
		});
	};
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
	else init();
})();
