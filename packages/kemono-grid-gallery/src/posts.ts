import type { UserPath } from './navigation';

interface FileReference {
  path?: string | null;
}

type JsonRecord = Record<string, unknown>;

interface Post {
  attachments?: FileReference[];
  file?: FileReference | null;
  id?: number | string | null;
}

interface SiteConfig {
  API_BASE_URL: string;
  IMAGE_BASE_URL: string;
}

const SITES: Readonly<Record<string, SiteConfig>> = {
  'coomer.st': {
    API_BASE_URL: 'https://coomer.st/api/v1',
    IMAGE_BASE_URL: 'https://img.coomer.st/thumbnail/data',
  },
  'kemono.cr': {
    API_BASE_URL: 'https://kemono.cr/api/v1',
    IMAGE_BASE_URL: 'https://img.kemono.cr/thumbnail/data',
  },
  'pawchive.pw': {
    API_BASE_URL: 'https://pawchive.pw/api/v1',
    IMAGE_BASE_URL: 'https://img.pawchive.pw/thumbnail/data',
  },
};
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['.bmp', '.gif', '.jpeg', '.jpg', '.png', '.webp']);

function buildPostAttachmentMap(posts: Post[]): Map<string, string> {
  const postAttachments = new Map<string, string>();

  for (const post of posts) {
    const imagePath = getFirstImagePath(post);

    if (post.id != null && imagePath) {
      postAttachments.set(String(post.id), imagePath);
    }
  }

  return postAttachments;
}

export async function fetchPostAttachmentMap(
  siteConfig: SiteConfig,
  { service, userId }: UserPath,
): Promise<Map<string, string>> {
  const url = new URL(`${siteConfig.API_BASE_URL}/${service}/user/${userId}/posts`);

  url.search = location.search;

  const response = await fetch(url.href);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data: unknown = await response.json();

  return buildPostAttachmentMap(parsePosts(data));
}

export function getCurrentSiteConfig(): SiteConfig | null {
  return SITES[location.hostname] ?? null;
}

function getFirstImagePath(post: Post): string | null {
  const attachmentPath = post.attachments?.find((attachment) => isImageFile(attachment.path))?.path;

  if (attachmentPath) {
    return attachmentPath;
  }

  const filePath = post.file?.path;

  return isImageFile(filePath) ? filePath : null;
}

function getOptionalPath(value: JsonRecord): string | null | undefined {
  const { path } = value;

  return typeof path === 'string' || path === null ? path : undefined;
}

function isImageFile(path: string | null | undefined): path is string {
  if (!path) {
    return false;
  }

  const cleanPath = path.split(/[?#]/, 1)[0].toLowerCase();
  const extensionStart = cleanPath.lastIndexOf('.');

  if (extensionStart === -1) {
    return false;
  }

  return SUPPORTED_IMAGE_EXTENSIONS.has(cleanPath.slice(extensionStart));
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePost(value: JsonRecord): Post {
  const post: Post = {};

  if (typeof value.id === 'string' || typeof value.id === 'number' || value.id === null) {
    post.id = value.id;
  }

  if (Array.isArray(value.attachments)) {
    post.attachments = value.attachments
      .filter(isRecord)
      .map((attachment) => ({ path: getOptionalPath(attachment) }));
  }

  if (value.file === null) {
    post.file = null;
  } else if (isRecord(value.file)) {
    post.file = { path: getOptionalPath(value.file) };
  }

  return post;
}

function parsePosts(value: unknown): Post[] {
  if (!Array.isArray(value)) {
    throw new TypeError('Invalid posts response: expected an array');
  }

  return value.filter((post) => isRecord(post)).map((post) => parsePost(post));
}
