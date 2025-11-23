# JavaScript Tools

A collection of useful JavaScript utilities including bookmarklets and userscripts.

## Bookmarklets

### Artist Profile URLs Extractor

- **File**: [artist-profile-urls-extractor.min.js](bookmarklets/artist-profile-urls-extractor.min.js)
- **Function**: Extract artist profile URLs from multiple websites

## Userscripts

### Universal Booru Image Comparator

- **File**: [booru-image-comparator.user.js](userscripts/booru-image-comparator.user.js)
- **Function**: Compare images on Danbooru / Yande.re / Konachan with multiple modes and transformations

### Danbooru Artist Tweaks

- **File**: [danbooru-artist-tweaks.user.js](userscripts/danbooru-artist-tweaks.user.js)
- **Function**: Add Create wiki link for artist pages without wiki page, copy artist name button, and replace wiki links with bulk update request links for tag aliases

### DeviantArt Base36 Auto Converter

- **File**: [deviantart-base36-auto-converter.user.js](userscripts/deviantart-base36-auto-converter.user.js)
- **Function**: Automatically convert DeviantArt /view/c/[base36] URLs to /view/[base10]

#### Description

DeviantArt filenames contain a base36-encoded post ID at the end (prefixed with `d`). For example, `15_vaati_icons_by_lavleyart_by_lavleyart_dix7cpg` contains `ix7cpg`, which converts to `1144161556` in base10. You can directly access posts via `https://deviantart.com/view/1144161556`.

This userscript automatically converts base36 IDs to base10 format URLs, allowing quick access to original posts from saved filenames.

Note: Everything from `-` onward in filenames (such as `-pre`) are sample image suffixes and can be ignored.
