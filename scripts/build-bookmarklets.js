import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { transform } from 'esbuild';

import {
  createContentHash,
  fileExists,
  hashFiles,
  readCache,
  writeCache,
} from './lib/build-cache.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const bookmarkletsDir = path.resolve(rootDir, 'bookmarklets');
const cacheFile = path.resolve(rootDir, '.cache', 'build-bookmarklets.json');

const JAVASCRIPT_PREFIX = 'javascript:';

// CLI argument parsing

const args = process.argv.slice(2);
const isWatch = args.includes('--watch');
const isForce = args.includes('--force');
const isVerbose = args.includes('--verbose');
let hasArgError = false;

function getArgValue(flag) {
  const index = args.indexOf(flag);

  if (index === -1) {
    return null;
  }

  const value = args[index + 1];

  if (!value || value.startsWith('--')) {
    console.error(`${flag} requires a value.`);
    process.exitCode = 1;
    hasArgError = true;

    return null;
  }

  return value;
}

const fileFilter = getArgValue('--file');

// Build input tracking

/** Base input files shared by all bookmarklets (resolved to absolute paths). */
const sharedInputs = [
  path.join(rootDir, 'scripts', 'build-bookmarklets.js'),
  path.join(rootDir, 'scripts', 'lib', 'build-cache.js'),
  path.join(rootDir, 'package.json'),
  path.join(rootDir, 'pnpm-lock.yaml'),
];

/** Esbuild options used for minification. */
const esbuildOptions = {
  minify: true,
  supported: {
    // Bookmarklet URLs cannot safely contain raw line breaks. Without this,
    // esbuild may shorten "\n" strings into template literals with literal
    // newlines, and browsers can normalize them to spaces when saved/run.
    'template-literal': false,
  },
};

/** Serialised esbuild options used in hash computation. */
const esbuildOptionsHash = createContentHash(JSON.stringify(esbuildOptions));

/**
 * Build bookmarklets incrementally.
 *
 * @param {string[]} sourceFiles - List of source file names to consider
 * @param {string[]} allSourceFiles - Complete current source file list for pruning stale cache entries
 * @returns {Promise<boolean>} True if any bookmarklet was actually rebuilt
 */
async function buildBookmarklets(sourceFiles, allSourceFiles = sourceFiles) {
  const cache = await readCache(cacheFile);
  const newCache = { ...cache };
  let anyBuilt = false;

  for (const file of sourceFiles) {
    const sourcePath = path.join(bookmarkletsDir, file);
    const outputPath = path.join(bookmarkletsDir, file.replace(/\.js$/, '.min.js'));
    const hash = await computeHash(sourcePath);

    newCache[file] = hash;

    if (!isForce && (await fileExists(outputPath)) && cache[file] === hash) {
      if (isVerbose) {
        console.log(`${file} is up to date`);
      }

      continue;
    }

    await buildSingle(file);
    anyBuilt = true;
  }

  // Prune stale entries (source files that no longer exist)
  for (const key of Object.keys(newCache)) {
    if (!allSourceFiles.includes(key)) {
      delete newCache[key];
    }
  }

  await writeCache(cacheFile, newCache);

  if (isVerbose && !anyBuilt) {
    console.log('All bookmarklets are up to date.');
  }

  return anyBuilt;
}

/**
 * Build a single bookmarklet source file.
 *
 * @param {string} file - Source file name (e.g. "foo.js")
 * @returns {Promise<void>}
 */
async function buildSingle(file) {
  const sourcePath = path.join(bookmarkletsDir, file);
  const outputPath = path.join(bookmarkletsDir, file.replace(/\.js$/, '.min.js'));
  const source = await readFile(sourcePath, 'utf8');

  // Strip javascript: prefix for esbuild (not valid JS)
  const stripped = source.startsWith(JAVASCRIPT_PREFIX)
    ? source.slice(JAVASCRIPT_PREFIX.length).trimStart()
    : source;

  const result = await transform(stripped, esbuildOptions);

  // Re-add javascript: prefix and remove esbuild's trailing newline.
  const output = JAVASCRIPT_PREFIX + result.code.trimEnd();

  await writeFile(outputPath, output, 'utf8');

  const sourceSize = Buffer.byteLength(source);
  const outputSize = Buffer.byteLength(output);

  console.log(
    `${file} -> ${file.replace(/\.js$/, '.min.js')} (${sourceSize} -> ${outputSize} bytes, ${((1 - outputSize / sourceSize) * 100).toFixed(1)}% smaller)`,
  );
}

/**
 * Compute the combined hash for a single bookmarklet source file.
 *
 * The hash includes:
 * - The bookmarklet source file (path + content)
 * - All shared input files (build script, cache lib, package.json, lockfile)
 * - The serialised esbuild options
 *
 * @param {string} sourceFile - Absolute path to the source file
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
async function computeHash(sourceFile) {
  const allFiles = [...sharedInputs, sourceFile];
  const fileHash = await hashFiles(allFiles, rootDir);

  return createContentHash(esbuildOptionsHash + fileHash);
}

// Main

async function main() {
  if (hasArgError) {
    return;
  }

  const allSourceFiles = await getSourceFiles();
  let sourceFiles = allSourceFiles;

  if (fileFilter) {
    // --file <name> can be full name or without extension / .min.js suffix
    const matchName = fileFilter.endsWith('.js')
      ? fileFilter.replace(/\.min\.js$/, '.js')
      : `${fileFilter}.js`;

    if (sourceFiles.includes(matchName)) {
      sourceFiles = [matchName];
    } else {
      console.error(`Bookmarklet source file not found: ${matchName}`);
      process.exitCode = 1;

      return;
    }
  }

  if (sourceFiles.length === 0) {
    console.log('No bookmarklet source files found.');

    return;
  }

  await (isWatch ? watchMode(sourceFiles) : buildBookmarklets(sourceFiles, allSourceFiles));
}

// Watch mode

async function watchMode(sourceFiles) {
  if (isVerbose) {
    console.log('Watching for changes in bookmarklets/...\n');
  }

  // Do an initial build with incremental logic
  const initialSourceFiles = await getSourceFiles();

  await buildBookmarklets(sourceFiles, initialSourceFiles);

  // Set up file watcher for live rebuilding
  const { watch } = await import('node:fs');

  let debounce = null;

  watch(bookmarkletsDir, (eventType, filename) => {
    if (!filename || !filename.endsWith('.js') || filename.endsWith('.min.js')) {
      return;
    }

    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      try {
        if (isVerbose) {
          console.log(`\nChange detected: ${filename}`);
        }

        const currentSourceFiles = await getSourceFiles();

        if (fileFilter && !sourceFiles.includes(filename)) {
          return;
        }

        if (!currentSourceFiles.includes(filename)) {
          await buildBookmarklets([], currentSourceFiles);

          return;
        }

        await buildBookmarklets([filename], currentSourceFiles);
      } catch (error) {
        console.error(`Failed to rebuild ${filename}:`);
        console.error(error);
      }
    }, 300);
  });
}

await main();

// Helpers

/**
 * Get all source file names from the bookmarklets directory.
 */
async function getSourceFiles() {
  const entries = await readdir(bookmarkletsDir, { withFileTypes: true });

  return entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((f) => f.endsWith('.js') && !f.endsWith('.min.js'));
}
