// ==UserScript==
// @name         DeviantArt Base36 Auto Converter
// @namespace    https://github.com/NekoAria/JavaScript-Tools
// @version      1.0.0
// @author       Neko_Aria
// @description  Automatically convert DeviantArt /view/c/[base36] URLs to /view/[base10]
// @downloadURL  https://github.com/NekoAria/JavaScript-Tools/raw/refs/heads/main/userscripts/deviantart-base36-auto-converter.user.js
// @updateURL    https://github.com/NekoAria/JavaScript-Tools/raw/refs/heads/main/userscripts/deviantart-base36-auto-converter.user.js
// @match        https://www.deviantart.com/view/c/*
// @match        https://deviantart.com/view/c/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const isValidBase36 = (str) => /^[0-9a-zA-Z]+$/.test(str);
  const base36ToBase10 = (str) => Number.parseInt(str, 36).toString(10);
  const pathname = globalThis.location.pathname.replace(/\/$/, "");
  const artId = pathname.split("/").pop();
  if (artId && isValidBase36(artId)) {
    const convertedId = base36ToBase10(artId);
    const newUrl = globalThis.location.href.replace(`/view/c/${artId}`, `/view/${convertedId}`);
    globalThis.location.replace(newUrl);
  }

})();