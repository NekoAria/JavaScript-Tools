// ==UserScript==
// @name         DeviantArt Base36 Auto Converter
// @namespace    https://github.com/NekoAria/JavaScript-Tools
// @version      1.0.0
// @author       Neko_Aria
// @description  Automatically convert DeviantArt /view/c/[base36] URLs to /view/[base10]
// @homepageURL  https://github.com/NekoAria/JavaScript-Tools/tree/main/packages/deviantart-base36-auto-converter
// @supportURL   https://github.com/NekoAria/JavaScript-Tools/issues
// @match        https://www.deviantart.com/view/c/*
// @match        https://deviantart.com/view/c/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
  'use strict';
	var isValidBase36 = (str) => /^[0-9a-zA-Z]+$/.test(str);
	var base36ToBase10 = (str) => Number.parseInt(str, 36).toString(10);
	var artId = globalThis.location.pathname.replace(/\/$/, "").split("/").pop();
	if (artId && isValidBase36(artId)) {
		const convertedId = base36ToBase10(artId);
		const newUrl = globalThis.location.href.replace(`/view/c/${artId}`, `/view/${convertedId}`);
		globalThis.location.replace(newUrl);
	}
})();
