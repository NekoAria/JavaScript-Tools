type JsonRecord = Record<string, unknown>;

interface PendingBulkUpdateRequest {
  forumPostId: number | string | null;
  id: number | string;
  script: string;
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parsePendingBulkUpdateRequests = (value: unknown): PendingBulkUpdateRequest[] => {
  if (!Array.isArray(value)) {
    throw new TypeError('Invalid pending BUR response: expected an array');
  }

  return value.map((item) => {
    if (!isRecord(item)) {
      throw new TypeError('Invalid pending BUR response item');
    }

    const { forum_post_id: forumPostId, id, script } = item;

    if ((typeof id !== 'number' && typeof id !== 'string') || typeof script !== 'string') {
      throw new TypeError('Invalid pending BUR fields');
    }
    if (
      forumPostId !== undefined &&
      forumPostId !== null &&
      typeof forumPostId !== 'number' &&
      typeof forumPostId !== 'string'
    ) {
      throw new TypeError('Invalid pending BUR forum post ID');
    }

    return { forumPostId: forumPostId ?? null, id, script };
  });
};

const getArtistTagName = (): string | null => {
  const tagElement = document.querySelector('.tag-type-1.heading.text-xl');
  const text = tagElement?.textContent.trim();

  return text ? text.replaceAll(/\s+/g, '_') : null;
};

const createCopyButton = (tagName: string): HTMLButtonElement => {
  const button = document.createElement('button');

  button.className = 'artist-copy-btn';
  button.textContent = 'copy';
  button.title = `Copy artist name: ${tagName}`;

  const copyArtistName = async (): Promise<void> => {
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
  };

  button.addEventListener('click', (event: MouseEvent) => {
    event.preventDefault();
    void copyArtistName();
  });

  return button;
};

const createWikiLinkElement = (tagName: string): HTMLAnchorElement => {
  const { hostname } = location;
  const link = document.createElement('a');

  link.id = 'create-wiki-link';
  link.href = `https://${hostname}/wiki_pages/new?wiki_page[title]=${tagName}`;
  link.textContent = 'Create wiki';

  return link;
};

const replaceWikiLinksWithBulkUpdateRequests = (): void => {
  const fineprintLinks = document.querySelectorAll<HTMLAnchorElement>('p.fineprint a');

  for (const link of fineprintLinks) {
    const href = link.getAttribute('href');

    if (href?.startsWith('/wiki_pages/') && href !== '/wiki_pages/help:tag_aliases') {
      // Keep the tag alias help page intact; other wiki links point to alias targets.
      const tagName = href.replace('/wiki_pages/', '');
      const newHref = `/bulk_update_requests?commit=search[status]=approved&search[tags_include_any]=${tagName}`;

      link.setAttribute('href', newHref);
    }
  }
};

const fetchPendingBulkUpdateRequests = async (
  tagName: string,
): Promise<PendingBulkUpdateRequest[]> => {
  const { origin } = location;
  const url = `${origin}/bulk_update_requests.json?search[status]=pending&search[tags_include_any]=${tagName}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data: unknown = await response.json();

    return parsePendingBulkUpdateRequests(data);
  } catch (error) {
    console.error('Failed to fetch pending BURs:', error);

    return [];
  }
};

const getBulkUpdateRequestScriptLines = (script: string): string[] =>
  script.split(/\r?\n/).filter((line) => line.trim());

const artistTagPairPattern =
  /^(\s*)((?:(?:create|remove)\s+)?alias|rename)(\s+)(\S+)(\s+->\s+)(\S+)(\s*)$/;

const createArtistTagLink = (tagName: string): HTMLAnchorElement => {
  const link = document.createElement('a');

  link.className = 'wiki-link artist-tag-link';
  link.href = `${location.origin}/artists/show_or_new?${new URLSearchParams({ name: tagName })}`;
  link.textContent = tagName;

  return link;
};

const createArtistTagNode = (tagName: string, currentTagName: string): Node =>
  tagName === currentTagName ? document.createTextNode(tagName) : createArtistTagLink(tagName);

const createBulkUpdateRequestScriptCode = (line: string, currentTagName: string): HTMLElement => {
  const code = document.createElement('code');
  const match = line.match(artistTagPairPattern);

  if (!match) {
    code.textContent = line;

    return code;
  }

  const [
    ,
    leadingSpacing,
    command,
    commandSpacing,
    sourceTag,
    arrowSpacing,
    targetTag,
    trailingSpacing,
  ] = match;

  code.append(
    `${leadingSpacing}${command}${commandSpacing}`,
    createArtistTagNode(sourceTag, currentTagName),
    arrowSpacing,
    createArtistTagNode(targetTag, currentTagName),
    trailingSpacing,
  );

  return code;
};

const renderPendingBulkUpdateRequests = (
  requests: PendingBulkUpdateRequest[],
  currentTagName: string,
): void => {
  document.querySelector('#pending-bur-section')?.remove();

  if (requests.length === 0) {
    return;
  }

  const { origin } = location;
  const section = document.createElement('div');

  section.id = 'pending-bur-section';

  for (const request of requests) {
    const pendingBur = document.createElement('div');

    pendingBur.className = 'fineprint pending-bur';

    const header = document.createElement('div');

    header.className = 'pending-bur-header';

    const icon = document.createElement('span');

    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '⏳';

    const burLink = document.createElement('a');

    burLink.className = 'wiki-link';
    burLink.href = `${origin}/bulk_update_requests/${request.id}`;
    burLink.textContent = `BUR #${request.id}`;

    header.append(icon, ' Pending ', burLink);

    if (request.forumPostId) {
      const forumLink = document.createElement('a');

      forumLink.className = 'wiki-link';
      forumLink.href = `${origin}/forum_posts/${request.forumPostId}`;
      forumLink.textContent = `forum #${request.forumPostId}`;
      header.append(' (', forumLink, ')');
    }

    pendingBur.append(header);

    const scriptLines = getBulkUpdateRequestScriptLines(request.script);

    if (scriptLines.length > 0) {
      const scriptList = document.createElement('ul');

      scriptList.className = 'pending-bur-script';

      for (const line of scriptLines) {
        const listItem = document.createElement('li');

        listItem.append(createBulkUpdateRequestScriptCode(line, currentTagName));
        scriptList.append(listItem);
      }

      pendingBur.append(scriptList);
    }

    section.append(pendingBur);
  }

  const fineprintParagraphs = document.querySelectorAll<HTMLParagraphElement>('p.fineprint');
  const insertAfter =
    fineprintParagraphs.length > 0
      ? fineprintParagraphs.item(fineprintParagraphs.length - 1)
      : document.querySelector('#view-artist-link')?.closest('p');

  insertAfter?.after(section);
};

const addPendingBulkUpdateRequests = async (tagName: string): Promise<void> => {
  const requests = await fetchPendingBulkUpdateRequests(tagName);

  renderPendingBulkUpdateRequests(requests, tagName);
};

const addCopyButton = (tagName: string): void => {
  if (document.querySelector('.artist-copy-btn')) {
    return;
  }

  const artistContainer = document.querySelector<HTMLElement>('.flex.items-center.gap-2');

  artistContainer?.append(createCopyButton(tagName));
};

const addCreateWikiLink = (tagName: string): void => {
  if (document.querySelector('#view-wiki-link')) {
    return;
  }

  const editArtistLink = document.querySelector<HTMLAnchorElement>('#view-artist-link');

  if (!editArtistLink) {
    return;
  }

  const wikiLink = createWikiLinkElement(tagName);
  const separator = document.createTextNode(' | ');

  editArtistLink.before(wikiLink);
  editArtistLink.before(separator);
};

export function initArtistPage(): void {
  const tagName = getArtistTagName();

  if (tagName) {
    addCopyButton(tagName);
    addCreateWikiLink(tagName);
  }

  replaceWikiLinksWithBulkUpdateRequests();

  if (tagName) {
    void addPendingBulkUpdateRequests(tagName);
  }
}
