import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const IGNORED_DIRS = new Set(['.git', '.cache', 'dist', 'node_modules']);

/**
 * Recursively collect all file paths under a directory, skipping ignored
 * directories. Paths are returned sorted alphabetically.
 *
 * @param {string} dir - Directory to scan
 * @returns {Promise<string[]>} Sorted file paths; absolute when dir is absolute
 */
export async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files.toSorted();
}

/**
 * Create a SHA-256 content hash from a string or Buffer.
 *
 * @param {string | Buffer} content
 * @returns {string} Hex-encoded SHA-256 digest
 */
export function createContentHash(content) {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Check whether a file exists and is a regular file.
 *
 * @param {string} file
 * @returns {Promise<boolean>}
 */
export async function fileExists(file) {
  try {
    const fileStats = await stat(file);

    return fileStats.isFile();
  } catch {
    return false;
  }
}

/**
 * Compute a deterministic SHA-256 hash over a sorted list of files. Each
 * file's relative path (normalised to forward slashes) and content are
 * included, so the same content in different paths produces a different hash.
 *
 * @param {string[]} files - Absolute file paths
 * @param {string} rootDir - Root directory for computing relative paths
 * @returns {Promise<string>} Hex-encoded hash
 */
export async function hashFiles(files, rootDir) {
  const hash = createHash('sha256');

  for (const file of files.toSorted()) {
    if (!(await fileExists(file))) {
      continue;
    }

    const relativePath = path.relative(rootDir, file).replaceAll(path.sep, '/');
    const content = await readFile(file);

    hash.update(relativePath);
    hash.update('\0');
    hash.update(content);
    hash.update('\0');
  }

  return hash.digest('hex');
}

/**
 * Read a JSON cache file. Returns an empty object if the file cannot be read
 * or is malformed.
 *
 * @param {string} cachePath
 * @returns {Promise<Record<string, string>>}
 */
export async function readCache(cachePath) {
  try {
    const cache = JSON.parse(await readFile(cachePath, 'utf8'));

    return cache && typeof cache === 'object' && !Array.isArray(cache) ? cache : {};
  } catch {
    return {};
  }
}

/**
 * Write a cache object to a JSON file. Automatically creates the parent
 * directory if it does not exist.
 *
 * @param {string} cachePath
 * @param {object} cache
 */
export async function writeCache(cachePath, cache) {
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
}
