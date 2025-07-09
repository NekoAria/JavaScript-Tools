// ==UserScript==
// @name         DeviantArt Base36 Auto Converter
// @namespace    https://github.com/NekoAria/JavaScript-Tools
// @version      0.1.0
// @description  Automatically convert DeviantArt /view/c/[base36] URLs to /view/[base10]
// @author       Neko_Aria
// @match        https://www.deviantart.com/view/c/*
// @match        https://deviantart.com/view/c/*
// @run-at       document-start
// @grant        none
// @downloadURL  https://github.com/NekoAria/JavaScript-Tools/raw/refs/heads/main/userscripts/deviantart-base36-auto-converter.user.js
// @updateURL    https://github.com/NekoAria/JavaScript-Tools/raw/refs/heads/main/userscripts/deviantart-base36-auto-converter.user.js
// ==/UserScript==

(function () {
  "use strict";

  const isValidBase36 = (str) => /^[0-9a-zA-Z]+$/.test(str);
  const base36ToBase10 = (base36String) => parseInt(base36String, 36).toString(10);

  // Get current URL and extract the base36 ID (last part of URL)
  const urlParts = window.location.pathname.split("/");
  const artId = urlParts[urlParts.length - 1];

  if (artId && isValidBase36(artId)) {
    const convertedId = base36ToBase10(artId);
    const newUrl = window.location.href.replace(`/view/c/${artId}`, `/view/${convertedId}`);
    window.location.replace(newUrl);
  }
})();
