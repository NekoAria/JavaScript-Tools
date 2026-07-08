// Convert DeviantArt base-36 artwork IDs to base-10 for direct URL navigation
const isValidBase36 = (str) => /^[0-9a-zA-Z]+$/.test(str);
const base36ToBase10 = (str) => Number.parseInt(str, 36).toString(10);

// Strip the trailing slash before extracting the last path segment as the ID
const pathname = location.pathname.replace(/\/$/, '');
const artId = pathname.split('/').pop();

if (artId && isValidBase36(artId)) {
  const convertedId = base36ToBase10(artId);
  const newUrl = new URL(location.href);

  newUrl.pathname = newUrl.pathname.split(`/view/c/${artId}`).join(`/view/${convertedId}`);
  location.replace(newUrl.href);
}
