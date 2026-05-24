# JavaScript Tools

A collection of useful JavaScript utilities including bookmarklets and userscripts.

## Source Layout

This repository contains both source files and generated installable outputs.

| Type         | Source                 | Installable output      | Build command             |
| ------------ | ---------------------- | ----------------------- | ------------------------- |
| Bookmarklets | `bookmarklets/*.js`    | `bookmarklets/*.min.js` | `pnpm build:bookmarklets` |
| Userscripts  | `packages/<name>/src/` | `userscripts/*.user.js` | `pnpm build:packages`     |

Do not edit generated outputs directly. Update the corresponding source files and rebuild instead.

## Bookmarklets

> Use the `*.min.js` files as installable bookmarklets. The non-minified `bookmarklets/*.js` files are source entries used by the build process and may import shared package code.

### Artist Profile URLs Extractor

- **File**: [artist-profile-urls-extractor.min.js](bookmarklets/artist-profile-urls-extractor.min.js)
- **Function**: Extract canonical artist profile URLs from supported artist profile pages

## Userscripts

> The files in `userscripts/` are generated installable userscripts. Their source code lives under `packages/<name>/src/`.

### Artist Profile URLs Extractor

- **File**: [artist-profile-urls-extractor.user.js](userscripts/artist-profile-urls-extractor.user.js)
- **Function**: Add a draggable floating button on supported artist profile pages that opens a modal with canonical profile URLs and copy actions

#### Description

Unlike the bookmarklet version, this userscript stays active on supported artist profile pages. When profile URLs can be detected, it shows a small draggable floating button. Clicking the button opens a modal with the extracted primary and secondary URLs, plus Copy and Copy All actions.

### Universal Booru Image Comparator

- **File**: [booru-image-comparator.user.js](userscripts/booru-image-comparator.user.js)
- **Function**: Compare images on Danbooru / Yande.re / Konachan with multiple modes and transformations

### Danbooru Artist Tweaks

- **File**: [danbooru-artist-tweaks.user.js](userscripts/danbooru-artist-tweaks.user.js)
- **Function**: Add Create wiki link for artist pages without wiki page, copy artist name button, replace wiki links with bulk update request links for tag aliases, show pending BURs, highlight unrecognized external hostnames in artist versions, provide an expandable multi-line editor for the artist "Other Names" field, and warn about unmigrated posts on artist rename

### Danbooru Artist URL Diff Enhancer

- **File**: [danbooru-artist-url-diff-enhancer.user.js](userscripts/danbooru-artist-url-diff-enhancer.user.js)
- **Function**: Enhance artist version diff lists with smart URL matching and character-level diff highlighting

### DeviantArt Base36 Auto Converter

- **File**: [deviantart-base36-auto-converter.user.js](userscripts/deviantart-base36-auto-converter.user.js)
- **Function**: Automatically convert DeviantArt /view/c/[base36] URLs to /view/[base10]

#### Description

DeviantArt filenames contain a base36-encoded post ID at the end (prefixed with `d`). For example, `15_vaati_icons_by_lavleyart_by_lavleyart_dix7cpg` contains `ix7cpg`, which converts to `1144161556` in base10. You can directly access posts via `https://deviantart.com/view/1144161556`.

This userscript automatically converts base36 IDs to base10 format URLs, allowing quick access to original posts from saved filenames.

Note: Everything from `-` onward in filenames (such as `-pre`) are sample image suffixes and can be ignored.

### Kemono/Coomer Grid Gallery Layout

- **File**: [kemono-grid-gallery.user.js](userscripts/kemono-grid-gallery.user.js)
- **Function**: Add a responsive grid gallery layout for the Kemono/Coomer thumbnails, using the first attachment image file as the cover
