// ==UserScript==
// @name         Danbooru Artist URL Diff Enhancer
// @namespace    https://github.com/NekoAria/JavaScript-Tools
// @version      1.0.0
// @author       Neko_Aria
// @description  Enhance artist version diff lists with smart URL matching and character-level diff highlighting
// @homepageURL  https://github.com/NekoAria/JavaScript-Tools/tree/main/packages/danbooru-artist-url-diff-enhancer
// @supportURL   https://github.com/NekoAria/JavaScript-Tools/issues
// @match        *://*.donmai.us/artist_versions*
// @grant        none
// ==/UserScript==

(function() {
	"use strict";
	function calculateSimilarity(str1, str2) {
		if (str1 === str2) return 1;
		if (!str1 || !str2) return 0;
		const diffs = lcsCharDiff(str1, str2);
		let commonLength = 0;
		for (const [op, text] of diffs) if (op === 0) commonLength += text.length;
		return commonLength / Math.max(str1.length, str2.length);
	}
	function cleanupMerge(diffs) {
		const merged = [];
		for (const diff of diffs) {
			const last = merged.at(-1);
			if (last && last[0] === diff[0]) last[1] += diff[1];
			else if (diff[1]) merged.push([diff[0], diff[1]]);
		}
		return merged;
	}
	function computeDiff(text1, text2) {
		if (!text1) return [[1, text2]];
		if (!text2) return [[-1, text1]];
		const longText = text1.length > text2.length ? text1 : text2;
		const shortText = text1.length > text2.length ? text2 : text1;
		const i = longText.indexOf(shortText);
		if (i !== -1) {
			const outerType = text1.length > text2.length ? -1 : 1;
			return [
				[outerType, longText.slice(0, i)],
				[0, shortText],
				[outerType, longText.slice(i + shortText.length)]
			].filter((d) => d[1]);
		}
		if (shortText.length === 1) return [[-1, text1], [1, text2]];
		return lcsBasedDiff(text1, text2);
	}
	function decodeUrl(url) {
		try {
			return decodeURIComponent(url);
		} catch {
			return url;
		}
	}
	function extractSignificantIds(url) {
		return url.match(/\d{6,}/g) ?? [];
	}
	function lcsBasedDiff(text1, text2) {
		const m = text1.length;
		const n = text2.length;
		const DIAGONAL = 0;
		const UP = 1;
		const LEFT = 2;
		let prev = Array.from({ length: n + 1 }, () => 0);
		let curr = Array.from({ length: n + 1 }, () => 0);
		const paths = Array.from({ length: m + 1 }, () => Array.from({ length: n + 1 }, () => 0));
		for (let i = 1; i <= m; i++) {
			for (let j = 1; j <= n; j++) if (text1[i - 1] === text2[j - 1]) {
				curr[j] = prev[j - 1] + 1;
				paths[i][j] = DIAGONAL;
			} else if (prev[j] >= curr[j - 1]) {
				curr[j] = prev[j];
				paths[i][j] = UP;
			} else {
				curr[j] = curr[j - 1];
				paths[i][j] = LEFT;
			}
			[prev, curr] = [curr, prev];
		}
		const diffs = [];
		let i = m;
		let j = n;
		while (i > 0 || j > 0) if (i > 0 && j > 0 && text1[i - 1] === text2[j - 1]) {
			diffs.push([0, text1[i - 1]]);
			i--;
			j--;
		} else if (i > 0 && (j === 0 || paths[i][j] === UP)) {
			diffs.push([-1, text1[i - 1]]);
			i--;
		} else {
			diffs.push([1, text2[j - 1]]);
			j--;
		}
		return diffs.toReversed();
	}
	function lcsCharDiff(text1, text2) {
		if (text1 === text2) return text1 ? [[0, text1]] : [];
		if (!text1) return [[1, text2]];
		if (!text2) return [[-1, text1]];
		let commonPrefix = 0;
		const minLen = Math.min(text1.length, text2.length);
		while (commonPrefix < minLen && text1[commonPrefix] === text2[commonPrefix]) commonPrefix++;
		let commonSuffix = 0;
		while (commonSuffix < minLen - commonPrefix && text1[text1.length - 1 - commonSuffix] === text2[text2.length - 1 - commonSuffix]) commonSuffix++;
		const prefix = text1.slice(0, commonPrefix);
		const suffix = text1.slice(text1.length - commonSuffix);
		const diffs = computeDiff(text1.slice(commonPrefix, text1.length - commonSuffix), text2.slice(commonPrefix, text2.length - commonSuffix));
		if (prefix) diffs.unshift([0, prefix]);
		if (suffix) diffs.push([0, suffix]);
		return cleanupMerge(diffs);
	}
	function longestCommonPrefix(a, b) {
		const len = Math.min(a.length, b.length);
		let i = 0;
		while (i < len && a[i] === b[i]) i++;
		return i;
	}
	function normalizeUrlForComparison(url) {
		const parsed = tryParseUrl(url);
		if (!parsed) return {
			host: "",
			path: "",
			normalized: url.toLowerCase(),
			original: url
		};
		const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
		const path = parsed.pathname.split("/").filter(Boolean).join("/").toLowerCase();
		return {
			host,
			path,
			normalized: path ? `${host}/${path}` : host,
			original: url
		};
	}
	function optimizedDiff(removedUrls, addedUrls) {
		const pairs = [];
		const usedAdded = new Set();
		const usedRemoved = new Set();
		const normalizedRemoved = removedUrls.map((url) => normalizeUrlForComparison(url));
		const normalizedAdded = addedUrls.map((url) => normalizeUrlForComparison(url));
		for (const [i, removedUrl] of removedUrls.entries()) {
			if (usedRemoved.has(i)) continue;
			for (const [j, addedUrl] of addedUrls.entries()) {
				if (usedAdded.has(j)) continue;
				if (addedUrl === `-${removedUrl}` || removedUrl === `-${addedUrl}`) {
					pairs.push({
						removed: removedUrl,
						added: addedUrl,
						type: "changed"
					});
					usedRemoved.add(i);
					usedAdded.add(j);
					break;
				}
			}
		}
		for (const [i, removedUrl] of removedUrls.entries()) {
			if (usedRemoved.has(i)) continue;
			for (const [j, addedUrl] of addedUrls.entries()) {
				if (usedAdded.has(j)) continue;
				if (normalizedRemoved[i].normalized === normalizedAdded[j].normalized) {
					pairs.push({
						removed: removedUrl,
						added: addedUrl,
						type: "changed"
					});
					usedRemoved.add(i);
					usedAdded.add(j);
					break;
				}
			}
		}
		for (const [i, removedUrl] of removedUrls.entries()) {
			if (usedRemoved.has(i)) continue;
			const removedPath = normalizedRemoved[i].path;
			if (!removedPath) continue;
			for (const [j, addedUrl] of addedUrls.entries()) {
				if (usedAdded.has(j)) continue;
				if (removedPath === normalizedAdded[j].path) {
					pairs.push({
						removed: removedUrl,
						added: addedUrl,
						type: "changed"
					});
					usedRemoved.add(i);
					usedAdded.add(j);
					break;
				}
			}
		}
		const removedIds = removedUrls.map((url) => extractSignificantIds(url));
		const addedIds = addedUrls.map((url) => extractSignificantIds(url));
		for (const [i, removedUrl] of removedUrls.entries()) {
			if (usedRemoved.has(i) || removedIds[i].length === 0) continue;
			for (const [j, addedUrl] of addedUrls.entries()) {
				if (usedAdded.has(j) || addedIds[j].length === 0) continue;
				if (removedIds[i].some((id) => addedIds[j].includes(id))) {
					pairs.push({
						removed: removedUrl,
						added: addedUrl,
						type: "changed"
					});
					usedRemoved.add(i);
					usedAdded.add(j);
					break;
				}
			}
		}
		const candidates = [];
		for (let i = 0; i < removedUrls.length; i++) {
			if (usedRemoved.has(i)) continue;
			for (let j = 0; j < addedUrls.length; j++) {
				if (usedAdded.has(j)) continue;
				const sameDomain = normalizedRemoved[i].host === normalizedAdded[j].host;
				const pathPrefixLen = longestCommonPrefix(normalizedRemoved[i].path, normalizedAdded[j].path);
				if (!sameDomain && pathPrefixLen < 3) continue;
				const similarity = calculateSimilarity(normalizedRemoved[i].normalized, normalizedAdded[j].normalized);
				if (similarity > (sameDomain ? .5 : .6)) candidates.push({
					i,
					j,
					similarity
				});
			}
		}
		candidates.sort((a, b) => b.similarity - a.similarity);
		for (const { i, j } of candidates) if (!usedRemoved.has(i) && !usedAdded.has(j)) {
			pairs.push({
				removed: removedUrls[i],
				added: addedUrls[j],
				type: "changed"
			});
			usedRemoved.add(i);
			usedAdded.add(j);
		}
		for (const [i, removedUrl] of removedUrls.entries()) if (!usedRemoved.has(i)) pairs.push({
			removed: removedUrl,
			added: null,
			type: "removed"
		});
		for (const [j, addedUrl] of addedUrls.entries()) if (!usedAdded.has(j)) pairs.push({
			removed: null,
			added: addedUrl,
			type: "added"
		});
		return pairs;
	}
	function tryParseUrl(url) {
		try {
			const decoded = decodeUrl(url);
			const clean = decoded.startsWith("-") ? decoded.slice(1) : decoded;
			return new URL(clean);
		} catch {
			return null;
		}
	}
	function escapeHtml(text) {
		const escapeMap = {
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			"\"": "&quot;",
			"'": "&#039;"
		};
		return text.replaceAll(/[&<>"']/g, (m) => escapeMap[m]);
	}
	function generateCharDiffHTML(oldUrl, newUrl) {
		const diffs = lcsCharDiff(oldUrl, newUrl);
		let removedHTML = "";
		let addedHTML = "";
		for (const [type, text] of diffs) {
			const escaped = escapeHtml(text);
			if (type === -1) removedHTML += `<span class="char-removed">${escaped}</span>`;
			else if (type === 1) addedHTML += `<span class="char-added">${escaped}</span>`;
			else {
				removedHTML += `<span class="char-common">${escaped}</span>`;
				addedHTML += `<span class="char-common">${escaped}</span>`;
			}
		}
		return {
			removedHTML,
			addedHTML
		};
	}
	function generateDiffHTML(pairs) {
		let html = "";
		for (const pair of pairs) switch (pair.type) {
			case "changed": {
				const charDiff = generateCharDiffHTML(pair.removed, pair.added);
				html += `
          <li class="changed">
            <div class="char-diff-container">
              <div class="char-diff-removed">${charDiff.removedHTML}</div>
              <div class="char-diff-arrow">→</div>
              <div class="char-diff-added">${charDiff.addedHTML}</div>
            </div>
          </li>`;
				break;
			}
			case "removed":
				html += `<li class="removed">${escapeHtml(pair.removed)}</li>`;
				break;
			case "added":
				html += `<li class="added">${escapeHtml(pair.added)}</li>`;
				break;
		}
		return html;
	}
	var style_default = "/* Styles for the Danbooru artist URL diff enhancer. Supports light and dark themes via data attribute. */\nbody {\n  --color-red-50: oklch(97.1% 0.013 17.38);\n  --color-red-100: oklch(93.6% 0.032 17.717);\n  --color-red-200: oklch(88.5% 0.062 18.334);\n  --color-red-300: oklch(80.8% 0.114 19.571);\n  --color-red-400: oklch(70.4% 0.191 22.216);\n  --color-red-500: oklch(63.7% 0.237 25.331);\n  --color-red-600: oklch(57.7% 0.245 27.325);\n  --color-red-700: oklch(50.5% 0.213 27.518);\n  --color-red-800: oklch(44.4% 0.177 26.899);\n  --color-red-900: oklch(39.6% 0.141 25.723);\n  --color-red-950: oklch(25.8% 0.092 26.042);\n\n  --color-amber-50: oklch(98.7% 0.022 95.277);\n  --color-amber-100: oklch(96.2% 0.059 95.617);\n  --color-amber-200: oklch(92.4% 0.12 95.746);\n  --color-amber-300: oklch(87.9% 0.169 91.605);\n  --color-amber-400: oklch(82.8% 0.189 84.429);\n  --color-amber-500: oklch(76.9% 0.188 70.08);\n  --color-amber-600: oklch(66.6% 0.179 58.318);\n  --color-amber-700: oklch(55.5% 0.163 48.998);\n  --color-amber-800: oklch(47.3% 0.137 46.201);\n  --color-amber-900: oklch(41.4% 0.112 45.904);\n  --color-amber-950: oklch(27.9% 0.077 45.635);\n\n  --color-green-50: oklch(98.2% 0.018 155.826);\n  --color-green-100: oklch(96.2% 0.044 156.743);\n  --color-green-200: oklch(92.5% 0.084 155.995);\n  --color-green-300: oklch(87.1% 0.15 154.449);\n  --color-green-400: oklch(79.2% 0.209 151.711);\n  --color-green-500: oklch(72.3% 0.219 149.579);\n  --color-green-600: oklch(62.7% 0.194 149.214);\n  --color-green-700: oklch(52.7% 0.154 150.069);\n  --color-green-800: oklch(44.8% 0.119 151.328);\n  --color-green-900: oklch(39.3% 0.095 152.535);\n  --color-green-950: oklch(26.6% 0.065 152.934);\n\n  --diff-bg-removed: var(--color-red-100);\n  --diff-border-removed: var(--color-red-500);\n  --diff-bg-added: var(--color-green-100);\n  --diff-border-added: var(--color-green-500);\n  --diff-bg-changed: var(--color-amber-100);\n  --diff-border-changed: var(--color-amber-500);\n  --diff-char-removed-bg: var(--color-red-500);\n  --diff-char-added-bg: var(--color-green-500);\n}\n\n/* Dark theme overrides */\nbody[data-current-user-theme='dark'] {\n  --diff-bg-removed: var(--color-red-900);\n  --diff-border-removed: var(--color-red-700);\n  --diff-bg-added: var(--color-green-900);\n  --diff-border-added: var(--color-green-700);\n  --diff-bg-changed: var(--color-amber-900);\n  --diff-border-changed: var(--color-amber-700);\n  --diff-char-removed-bg: var(--color-red-700);\n  --diff-char-added-bg: var(--color-green-700);\n}\n\ntd.urls-column .diff-list li {\n  padding: 5px;\n  margin: 2px 0;\n  color: unset;\n  word-break: break-all;\n  border-left: 3px solid transparent;\n  border-radius: 4px;\n}\n\ntd.urls-column .diff-list li.removed {\n  background-color: var(--diff-bg-removed);\n  border-left-color: var(--diff-border-removed);\n}\n\ntd.urls-column .diff-list li.added {\n  background-color: var(--diff-bg-added);\n  border-left-color: var(--diff-border-added);\n}\n\ntd.urls-column .diff-list li.changed {\n  background-color: var(--diff-bg-changed);\n  border-left-color: var(--diff-border-changed);\n}\n\n.char-diff-container {\n  display: flex;\n  flex-direction: column;\n  gap: 3px;\n  line-height: 1.4;\n}\n\n.char-diff-removed,\n.char-diff-added {\n  padding: 2px 0;\n  word-break: break-all;\n}\n\n.char-diff-arrow {\n  align-self: flex-start;\n  margin: 2px 0;\n  font-weight: bold;\n  color: unset;\n}\n\n.char-common {\n  background-color: transparent;\n}\n\n.char-removed {\n  padding: 1px 2px;\n  color: white;\n  background-color: var(--diff-char-removed-bg);\n  border-radius: 2px;\n}\n\n.char-added {\n  padding: 1px 2px;\n  font-weight: bold;\n  color: white;\n  background-color: var(--diff-char-added-bg);\n  border-radius: 2px;\n}\n\n@media (min-width: 768px) {\n  .char-diff-container {\n    flex-direction: row;\n    gap: 8px;\n    align-items: center;\n  }\n\n  .char-diff-arrow {\n    margin: 0 5px;\n  }\n}\n";
	function addCustomStyles() {
		const style = document.createElement("style");
		style.textContent = style_default;
		document.head.append(style);
	}
	function init() {
		addCustomStyles();
		processDiffLists();
		let debounceTimer = null;
		new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (mutation.type !== "childList") continue;
				for (const node of mutation.addedNodes) {
					if (node.nodeType !== Node.ELEMENT_NODE) continue;
					if (node.querySelectorAll("td.urls-column ul.diff-list:not([data-enhanced])").length > 0) {
						if (debounceTimer !== null) clearTimeout(debounceTimer);
						debounceTimer = globalThis.setTimeout(() => {
							debounceTimer = null;
							processDiffLists();
						}, 100);
					}
				}
			}
		}).observe(document.body, {
			childList: true,
			subtree: true
		});
	}
	function processDiffLists() {
		const diffLists = document.querySelectorAll("td.urls-column ul.diff-list:not([data-enhanced])");
		for (const diffList of diffLists) {
			const allItems = diffList.querySelectorAll("li");
			if (allItems.length === 0) continue;
			const removedUrls = [];
			const addedUrls = [];
			for (const li of allItems) if (li.classList.contains("changed")) {
				const removedSpan = li.querySelector(".removed");
				const addedSpan = li.querySelector(".added");
				const removedUrl = removedSpan?.textContent?.trim();
				const addedUrl = addedSpan?.textContent?.trim();
				if (removedUrl) removedUrls.push(removedUrl);
				if (addedUrl) addedUrls.push(addedUrl);
			} else if (li.classList.contains("removed")) {
				const url = li.textContent?.trim();
				if (url) removedUrls.push(url);
			} else if (li.classList.contains("added")) {
				const url = li.textContent?.trim();
				if (url) addedUrls.push(url);
			}
			if (removedUrls.length === 0 && addedUrls.length === 0) continue;
			const listEl = diffList;
			const optimizedPairs = optimizedDiff(removedUrls, addedUrls);
			listEl.dataset.enhanced = "true";
			listEl.innerHTML = generateDiffHTML(optimizedPairs);
		}
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
	else init();
})();
