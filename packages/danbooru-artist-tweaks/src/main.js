import cssText from './style.css?raw';

const getArtistTagName = () => {
  const tagElement = document.querySelector('.tag-type-1.heading.text-xl');

  if (tagElement) {
    return tagElement.textContent.trim().replaceAll(/\s+/g, '_');
  }

  return null;
};

const createCopyButton = (tagName) => {
  const button = document.createElement('button');

  button.className = 'artist-copy-btn';
  button.textContent = 'copy';
  button.title = `Copy artist name: ${tagName}`;

  button.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(tagName);

      const originalText = button.textContent;

      button.textContent = 'copied!';
      button.classList.add('copied');

      setTimeout(() => {
        button.textContent = originalText;
        button.classList.remove('copied');
      }, 500);
    } catch (error) {
      console.error('Failed to copy artist name:', error);
    }
  });

  return button;
};

const createWikiLinkElement = (tagName) => {
  const { hostname } = location;
  const link = document.createElement('a');

  link.id = 'create-wiki-link';
  link.href = `https://${hostname}/wiki_pages/new?wiki_page[title]=${tagName}`;
  link.textContent = 'Create wiki';

  return link;
};

const replaceWikiLinksWithBulkUpdateRequests = () => {
  const fineprintLinks = document.querySelectorAll('p.fineprint a');

  for (const link of fineprintLinks) {
    const href = link.getAttribute('href');

    if (href && href.startsWith('/wiki_pages/') && href !== '/wiki_pages/help:tag_aliases') {
      // Keep the tag alias help page intact; other wiki links point to alias targets.
      const tagName = href.replace('/wiki_pages/', '');
      const newHref = `/bulk_update_requests?commit=search[status]=approved&search[tags_include_any]=${tagName}`;

      link.setAttribute('href', newHref);
    }
  }
};

const fetchPendingBURs = async (tagName) => {
  const { origin } = location;
  const url = `${origin}/bulk_update_requests.json?search[status]=pending&search[tags_include_any]=${tagName}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch pending BURs:', error);

    return [];
  }
};

const renderPendingBURs = (burs) => {
  document.querySelector('#pending-bur-section')?.remove();

  if (burs.length === 0) {
    return;
  }

  const { origin } = location;

  const section = document.createElement('div');

  section.id = 'pending-bur-section';

  for (const bur of burs) {
    const p = document.createElement('p');

    p.className = 'fineprint pending-bur';

    const burLink = document.createElement('a');

    burLink.className = 'wiki-link';
    burLink.href = `${origin}/bulk_update_requests/${bur.id}`;
    burLink.textContent = `BUR #${bur.id}`;

    const forumLink = bur.forum_post_id
      ? (() => {
          const a = document.createElement('a');

          a.className = 'wiki-link';
          a.href = `${origin}/forum_posts/${bur.forum_post_id}`;
          a.textContent = `forum #${bur.forum_post_id}`;

          return a;
        })()
      : null;

    p.append(document.createTextNode('⏳ Pending '));
    p.append(burLink);
    p.append(document.createTextNode(`: ${bur.script}`));
    if (forumLink) {
      p.append(document.createTextNode(' ('));
      p.append(forumLink);
      p.append(document.createTextNode(')'));
    }

    section.append(p);
  }

  const fineprintParagraphs = document.querySelectorAll('p.fineprint');
  const insertAfter =
    fineprintParagraphs.length > 0
      ? fineprintParagraphs.at(-1)
      : document.querySelector('#view-artist-link')?.closest('p');

  insertAfter?.after(section);
};

const addPendingBURs = async (tagName) => {
  const burs = await fetchPendingBURs(tagName);

  renderPendingBURs(burs);
};

const addStyles = () => {
  const style = document.createElement('style');

  style.textContent = cssText;
  document.head.append(style);
};

const addCopyButton = () => {
  if (document.querySelector('.artist-copy-btn')) {
    return;
  }

  const tagName = getArtistTagName();
  const copyButton = createCopyButton(tagName);
  const artistContainer = document.querySelector('.flex.items-center.gap-2');

  artistContainer.append(copyButton);
};

const addCreateWikiLink = () => {
  const existingWikiLink = document.querySelector('#view-wiki-link');

  if (existingWikiLink) {
    return;
  }

  const editArtistLink = document.querySelector('#view-artist-link');
  const tagName = getArtistTagName();

  const wikiLink = createWikiLinkElement(tagName);
  const separator = document.createTextNode(' | ');

  editArtistLink.before(wikiLink);
  editArtistLink.before(separator);
};

const getArtistIdFromURL = () => {
  const params = new URLSearchParams(location.search);

  return params.get('search[artist_id]');
};

const fetchArtistUnrecognizedHostnames = async (artistId) => {
  const { origin } = location;
  const url = `${origin}/artists/${artistId}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const hostnameSet = new Set();

    for (const li of doc.querySelectorAll('li')) {
      // The globe icon marks an unrecognized external site.
      if (li.querySelector('.globe-icon')) {
        for (const a of li.querySelectorAll('a[href]')) {
          const href = a.getAttribute('href');

          hostnameSet.add(new URL(href).hostname);
        }
      }
    }

    return hostnameSet;
  } catch (error) {
    console.error('Failed to fetch artist URLs:', error);

    return new Set();
  }
};

const prependGlobeIfUnrecognized = (element, hostnameSet, { inside = false } = {}) => {
  const urlText = element.textContent.trim().replace(/^-/, '');
  const { hostname } = new URL(urlText);

  if (!hostnameSet.has(hostname)) {
    return;
  }

  const markerText = '🌐 ';
  const existingText = inside
    ? element.firstChild?.textContent
    : element.previousSibling?.textContent;

  if (existingText === markerText) {
    return;
  }

  const markerNode = document.createTextNode(markerText);

  if (inside) {
    element.prepend(markerNode);
  } else {
    element.before(markerNode);
  }
};

const highlightUnrecognizedHostnamesInVersions = (hostnameSet) => {
  if (hostnameSet.size === 0) {
    return;
  }

  for (const li of document.querySelectorAll('#artist-versions-table .urls-column li')) {
    if (li.classList.contains('changed')) {
      // Changed rows wrap removed and added URLs in separate spans.
      for (const span of li.querySelectorAll('span.removed, span.added')) {
        prependGlobeIfUnrecognized(span, hostnameSet);
      }
    } else {
      prependGlobeIfUnrecognized(li, hostnameSet, { inside: true });
    }
  }
};

const fetchTagAliases = async (antecedentName) => {
  const { origin } = location;
  const params = new URLSearchParams({
    'search[antecedent_name_matches]': antecedentName,
  });
  const url = `${origin}/tag_aliases.json?${params}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return await response.json();
};

const hasActiveTagAlias = (aliases, antecedentName, consequentName) =>
  aliases.some(
    (alias) =>
      alias.status === 'active' &&
      alias.antecedent_name === antecedentName &&
      alias.consequent_name === consequentName,
  );

const hasActiveTagAliasBetweenNames = async (oldName, newName) => {
  const oldNameAliases = await fetchTagAliases(oldName);

  if (hasActiveTagAlias(oldNameAliases, oldName, newName)) {
    return true;
  }

  const newNameAliases = await fetchTagAliases(newName);

  return hasActiveTagAlias(newNameAliases, newName, oldName);
};

const fetchActiveArtistByName = async (name) => {
  const { origin } = location;
  const params = new URLSearchParams({
    'search[name]': name,
    'search[is_deleted]': 'false',
    limit: '1',
    only: 'id,name,is_deleted',
  });
  const url = `${origin}/artists.json?${params}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return await response.json();
};

const hasActiveArtistEntry = async (name) => {
  const artists = await fetchActiveArtistByName(name);

  return artists.some((artist) => artist.name === name && !artist.is_deleted);
};

const checkUnmigratedPostsOnRename = async (artistId) => {
  const rows = document.querySelectorAll('#artist-versions-table tbody tr');

  if (rows.length < 2) {
    return;
  }

  let renameIndex = -1;

  for (const [i, row] of rows.entries()) {
    const nameColumn = row.querySelector('.name-column');

    // Danbooru marks renamed artist names with bold text in the name column.
    if (nameColumn?.querySelector('b')) {
      renameIndex = i;
      break;
    }
  }

  if (renameIndex === -1) {
    return;
  }

  const { origin } = location;
  const url = `${origin}/artist_versions.json?search[artist_id]=${artistId}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const versions = await response.json();

    const newName = versions[renameIndex]?.name;

    // In the API response, the version after the rename row contains the old name.
    const oldName = versions[renameIndex + 1]?.name;

    if (!oldName || !newName) {
      return;
    }

    // Active aliases can make old-name posts expected, especially after a later
    // reverse BUR supersedes this rename.
    if (await hasActiveTagAliasBetweenNames(oldName, newName)) {
      return;
    }

    // If the old name now has its own active artist entry, posts under that tag
    // are expected and should not be treated as unmigrated rename leftovers.
    if (await hasActiveArtistEntry(oldName)) {
      return;
    }

    const postsParams = new URLSearchParams({
      limit: '1',
      tags: oldName,
    });
    const postsUrl = `${origin}/posts.json?${postsParams}`;
    const postsResponse = await fetch(postsUrl);

    if (!postsResponse.ok) {
      throw new Error(`HTTP ${postsResponse.status}`);
    }
    const posts = await postsResponse.json();

    const hasUnmigratedPosts = posts.some((post) =>
      (post.tag_string_artist ?? '').split(/\s+/).includes(oldName),
    );

    if (hasUnmigratedPosts) {
      renderUnmigratedPostsWarning(oldName);
    }
  } catch (error) {
    console.error('Failed to check unmigrated posts:', error);
  }
};

const renderUnmigratedPostsWarning = (oldName) => {
  document.querySelector('#unmigrated-posts-warning')?.remove();

  const { origin } = location;

  const section = document.createElement('div');

  section.id = 'unmigrated-posts-warning';
  section.className = 'notice notice-info flex text-center items-center justify-center gap-2';

  const span = document.createElement('span');

  span.append(document.createTextNode('⚠️ There may still be posts tagged with the old name: '));

  const postLink = document.createElement('a');

  postLink.href = `${origin}/posts?tags=${encodeURIComponent(oldName)}`;
  postLink.textContent = oldName;

  span.append(postLink);
  section.append(span);

  const h1 = document.querySelector('h1');

  if (h1) {
    h1.before(section);
  }
};

const otherNamesAttrsToCopy = ['name', 'id', 'placeholder', 'required'];

const normalizeOtherNamesValue = (value) => value.replaceAll(/\s+/g, ' ').trim();

const getOtherNamesLines = (value) => value.trim().split(/\s+/).filter(Boolean);

const copyOtherNamesAttrs = (from, to) => {
  // Keep form binding attributes when switching between input and textarea.
  for (const attrName of otherNamesAttrsToCopy) {
    const value = from.getAttribute(attrName);

    if (value !== null) {
      to.setAttribute(attrName, value);
    }
  }
};

const normalizeOtherNamesField = (field) => {
  if (field?.tagName === 'TEXTAREA') {
    field.value = normalizeOtherNamesValue(field.value);
  }
};

const createOtherNamesInput = (current) => {
  const input = document.createElement('input');

  copyOtherNamesAttrs(current, input);
  input.type = 'text';
  input.className = 'w-full max-w-360px string optional iac-autocomplete';
  input.value = normalizeOtherNamesValue(current.value);

  return input;
};

const createOtherNamesTextarea = (current, form) => {
  const textarea = document.createElement('textarea');

  copyOtherNamesAttrs(current, textarea);
  textarea.className = 'text optional iac-autocomplete';

  const lines = getOtherNamesLines(current.value);

  textarea.value = lines.join('\n');
  textarea.rows = Math.min(20, Math.max(4, lines.length + 1));
  textarea.addEventListener('keydown', (e) => {
    if (!((e.ctrlKey || e.metaKey) && e.key === 'Enter')) {
      return;
    }

    e.preventDefault();
    form?.requestSubmit();
  });

  return textarea;
};

const addOtherNamesToggleButton = () => {
  const field = document.querySelector('#artist_other_names_string');

  if (!field || document.querySelector('#other-names-toggle-btn')) {
    return;
  }

  const form = field.closest('form');

  // Wrap the field so the toggle button stays aligned to the right.
  const wrapper = document.createElement('div');

  wrapper.className = 'other-names-wrapper';
  field.before(wrapper);
  wrapper.append(field);

  const button = document.createElement('button');

  button.id = 'other-names-toggle-btn';
  button.type = 'button';
  button.className = 'other-names-toggle-btn';
  button.textContent = 'expand';
  button.title = 'Toggle multi-line view';
  wrapper.append(button);

  button.addEventListener('click', (e) => {
    e.preventDefault();

    const current = wrapper.querySelector('#artist_other_names_string');

    if (!current) {
      console.warn('Other names field not found inside wrapper.');
      button.disabled = true;

      return;
    }

    const isTextarea = current.tagName === 'TEXTAREA';

    const nextField = isTextarea
      ? createOtherNamesInput(current)
      : createOtherNamesTextarea(current, form);

    current.replaceWith(nextField);
    button.textContent = isTextarea ? 'expand' : 'collapse';
  });

  // Safety net: normalize back to space-separated on form submit,
  // in case the user submits while still in textarea mode.
  form?.addEventListener(
    'submit',
    () => {
      normalizeOtherNamesField(wrapper.querySelector('#artist_other_names_string'));
    },
    { capture: true },
  );
};

const init = async () => {
  addStyles();

  // Artist versions page
  if (location.pathname.startsWith('/artist_versions')) {
    const artistId = getArtistIdFromURL();

    if (artistId) {
      const unrecognizedHostnames = fetchArtistUnrecognizedHostnames(artistId);

      checkUnmigratedPostsOnRename(artistId);
      highlightUnrecognizedHostnamesInVersions(await unrecognizedHostnames);
    }

    return;
  }

  // Artist new/edit page: expose a multi-line editor for other names.
  if (document.querySelector('#artist_other_names_string')) {
    addOtherNamesToggleButton();

    return;
  }

  // Artist page
  addCopyButton();
  addCreateWikiLink();
  replaceWikiLinksWithBulkUpdateRequests();

  const tagName = getArtistTagName();

  if (tagName) {
    addPendingBURs(tagName);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
