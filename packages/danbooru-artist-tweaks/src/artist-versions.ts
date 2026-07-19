interface ArtistRecord {
  isDeleted: boolean;
  name: string;
}

interface ArtistVersionRecord {
  name: string;
}

type JsonRecord = Record<string, unknown>;

interface PostRecord {
  artistTags: string;
}

interface TagAliasRecord {
  antecedentName: string;
  consequentName: string;
  status: string;
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const expectArray = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) {
    throw new TypeError(`Invalid ${label} response: expected an array`);
  }

  return value;
};

const fetchJson = async (url: string): Promise<unknown> => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
};

const parseTagAliases = (value: unknown): TagAliasRecord[] =>
  expectArray(value, 'tag aliases').map((item) => {
    if (!isRecord(item)) {
      throw new TypeError('Invalid tag alias response item');
    }

    const { antecedent_name: antecedentName, consequent_name: consequentName, status } = item;

    if (
      typeof antecedentName !== 'string' ||
      typeof consequentName !== 'string' ||
      typeof status !== 'string'
    ) {
      throw new TypeError('Invalid tag alias fields');
    }

    return { antecedentName, consequentName, status };
  });

const parseArtists = (value: unknown): ArtistRecord[] =>
  expectArray(value, 'artists').map((item) => {
    if (!isRecord(item) || typeof item.name !== 'string' || typeof item.is_deleted !== 'boolean') {
      throw new TypeError('Invalid artist response item');
    }

    return { isDeleted: item.is_deleted, name: item.name };
  });

const parseArtistVersions = (value: unknown): ArtistVersionRecord[] =>
  expectArray(value, 'artist versions').map((item) => {
    if (!isRecord(item) || typeof item.name !== 'string') {
      throw new TypeError('Invalid artist version response item');
    }

    return { name: item.name };
  });

const parsePosts = (value: unknown): PostRecord[] =>
  expectArray(value, 'posts').map((item) => {
    if (!isRecord(item)) {
      throw new TypeError('Invalid post response item');
    }

    const { tag_string_artist: artistTags } = item;

    if (artistTags !== undefined && artistTags !== null && typeof artistTags !== 'string') {
      throw new TypeError('Invalid post artist tags');
    }

    return { artistTags: artistTags ?? '' };
  });

const fetchArtistUnrecognizedHostnames = async (artistId: string): Promise<Set<string>> => {
  const { origin } = location;
  const url = `${origin}/artists/${artistId}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const hostnameSet = new Set<string>();

    for (const listItem of doc.querySelectorAll('li')) {
      // The globe icon marks an unrecognized external site.
      if (listItem.querySelector('.globe-icon')) {
        for (const anchor of listItem.querySelectorAll<HTMLAnchorElement>('a[href]')) {
          const href = anchor.getAttribute('href');

          if (href) {
            hostnameSet.add(new URL(href).hostname);
          }
        }
      }
    }

    return hostnameSet;
  } catch (error) {
    console.error('Failed to fetch artist URLs:', error);

    return new Set<string>();
  }
};

const prependGlobeIfUnrecognized = (
  element: Element,
  hostnameSet: ReadonlySet<string>,
  { inside = false }: { inside?: boolean } = {},
): void => {
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

const highlightUnrecognizedHostnamesInVersions = (hostnameSet: ReadonlySet<string>): void => {
  if (hostnameSet.size === 0) {
    return;
  }

  for (const listItem of document.querySelectorAll('#artist-versions-table .urls-column li')) {
    if (listItem.classList.contains('changed')) {
      // Changed rows wrap removed and added URLs in separate spans.
      for (const span of listItem.querySelectorAll('span.removed, span.added')) {
        prependGlobeIfUnrecognized(span, hostnameSet);
      }
    } else {
      prependGlobeIfUnrecognized(listItem, hostnameSet, { inside: true });
    }
  }
};

const fetchTagAliases = async (antecedentName: string): Promise<TagAliasRecord[]> => {
  const { origin } = location;
  const params = new URLSearchParams({
    'search[antecedent_name_matches]': antecedentName,
  });
  const url = `${origin}/tag_aliases.json?${params}`;

  return parseTagAliases(await fetchJson(url));
};

const hasActiveTagAlias = (
  aliases: TagAliasRecord[],
  antecedentName: string,
  consequentName: string,
): boolean =>
  aliases.some(
    (alias) =>
      alias.status === 'active' &&
      alias.antecedentName === antecedentName &&
      alias.consequentName === consequentName,
  );

const hasActiveTagAliasBetweenNames = async (
  oldName: string,
  newName: string,
): Promise<boolean> => {
  const oldNameAliases = await fetchTagAliases(oldName);

  if (hasActiveTagAlias(oldNameAliases, oldName, newName)) {
    return true;
  }

  const newNameAliases = await fetchTagAliases(newName);

  return hasActiveTagAlias(newNameAliases, newName, oldName);
};

const fetchActiveArtistByName = async (name: string): Promise<ArtistRecord[]> => {
  const { origin } = location;
  const params = new URLSearchParams({
    'search[name]': name,
    'search[is_deleted]': 'false',
    limit: '1',
    only: 'id,name,is_deleted',
  });
  const url = `${origin}/artists.json?${params}`;

  return parseArtists(await fetchJson(url));
};

const hasActiveArtistEntry = async (name: string): Promise<boolean> => {
  const artists = await fetchActiveArtistByName(name);

  return artists.some((artist) => artist.name === name && !artist.isDeleted);
};

const renderUnmigratedPostsWarning = (oldName: string): void => {
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
  document.querySelector('h1')?.before(section);
};

const checkUnmigratedPostsOnRename = async (artistId: string): Promise<void> => {
  const rows = document.querySelectorAll<HTMLTableRowElement>('#artist-versions-table tbody tr');

  if (rows.length < 2) {
    return;
  }

  let renameIndex = -1;

  for (const [index, row] of rows.entries()) {
    const nameColumn = row.querySelector('.name-column');

    // Danbooru marks renamed artist names with bold text in the name column.
    if (nameColumn?.querySelector('b')) {
      renameIndex = index;
      break;
    }
  }

  if (renameIndex === -1) {
    return;
  }

  const { origin } = location;
  const url = `${origin}/artist_versions.json?search[artist_id]=${artistId}`;

  try {
    const versions = parseArtistVersions(await fetchJson(url));
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
    const posts = parsePosts(await fetchJson(postsUrl));
    const hasUnmigratedPosts = posts.some((post) => post.artistTags.split(/\s+/).includes(oldName));

    if (hasUnmigratedPosts) {
      renderUnmigratedPostsWarning(oldName);
    }
  } catch (error) {
    console.error('Failed to check unmigrated posts:', error);
  }
};

export async function initArtistVersionsPage(artistId: string): Promise<void> {
  const unrecognizedHostnames = fetchArtistUnrecognizedHostnames(artistId);

  void checkUnmigratedPostsOnRename(artistId);
  highlightUnrecognizedHostnamesInVersions(await unrecognizedHostnames);
}
