import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

import {
  createContentHash,
  fileExists,
  hashFiles,
  readCache,
  writeCache,
} from './lib/build-cache.js';
import { getArgValue } from './lib/cli-args.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const bookmarkletsDir = path.resolve(rootDir, 'bookmarklets');
const cacheFile = path.resolve(rootDir, '.cache', 'build-bookmarklets.json');

const JAVASCRIPT_PREFIX = 'javascript:';

const args = process.argv.slice(2);
const isWatch = args.includes('--watch');
const isForce = args.includes('--force');
const isVerbose = args.includes('--verbose');
const { hasError: hasArgError, value: fileFilter } = getArgValue(args, '--file');

/** Base input files shared by all bookmarklets (resolved to absolute paths). */
const sharedInputs = [
  path.join(rootDir, 'scripts', 'build-bookmarklets.js'),
  path.join(rootDir, 'scripts', 'lib', 'build-cache.js'),
  path.join(rootDir, 'scripts', 'lib', 'cli-args.js'),
  path.join(rootDir, 'package.json'),
  path.join(rootDir, 'pnpm-lock.yaml'),
];

/**
 * Mapping from bookmarklet source file names to extra dependency files
 * that should be included in cache hash computation. This ensures that
 * changes to imported modules trigger a rebuild.
 */
const bookmarkletImportMap = {
  'artist-profile-urls-extractor.js': [
    path.join(rootDir, 'packages/artist-profile-urls-extractor/src/extractor.ts'),
  ],
};

const getExtraFilesForSource = (file) => bookmarkletImportMap[file] || [];

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

/** Serialized esbuild options used in hash computation. */
const esbuildOptionsHash = createContentHash(JSON.stringify(esbuildOptions));

const getMinifiedFileName = (file) => file.replace(/\.js$/, '.min.js');

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
  let isAnyBuilt = false;

  for (const file of sourceFiles) {
    const sourcePath = path.join(bookmarkletsDir, file);
    const outputPath = path.join(bookmarkletsDir, getMinifiedFileName(file));
    const extraFiles = getExtraFilesForSource(file);
    const hash = await computeHash(sourcePath, extraFiles);

    newCache[file] = hash;

    if (!isForce && (await fileExists(outputPath)) && cache[file] === hash) {
      if (isVerbose) {
        console.log(`${file} is up to date`);
      }

      continue;
    }

    await buildSingle(file);
    isAnyBuilt = true;
  }

  // Prune stale entries (source files that no longer exist)
  for (const key of Object.keys(newCache)) {
    if (!allSourceFiles.includes(key)) {
      delete newCache[key];
    }
  }

  await writeCache(cacheFile, newCache);

  if (isVerbose && !isAnyBuilt) {
    console.log('All bookmarklets are up to date.');
  }

  return isAnyBuilt;
}

/**
 * Build a single bookmarklet source file.
 *
 * @param {string} file - Source file name (e.g. "foo.js")
 * @returns {Promise<void>}
 */
async function buildSingle(file) {
  const sourcePath = path.join(bookmarkletsDir, file);
  const outputPath = path.join(bookmarkletsDir, getMinifiedFileName(file));
  const source = await readFile(sourcePath, 'utf8');

  // Strip javascript: because it is a URL scheme, not valid JavaScript syntax.
  const stripped = source.startsWith(JAVASCRIPT_PREFIX)
    ? source.slice(JAVASCRIPT_PREFIX.length).trimStart()
    : source;

  const result = await build({
    stdin: {
      contents: stripped,
      sourcefile: file,
      resolveDir: bookmarkletsDir,
    },
    bundle: true,
    write: false,
    ...esbuildOptions,
  });

  const bundledCode = result.outputFiles[0].text.trimEnd();

  const output = JAVASCRIPT_PREFIX + bundledCode;

  await writeFile(outputPath, output, 'utf8');

  const sourceSize = Buffer.byteLength(source);
  const outputSize = Buffer.byteLength(output);

  const sizeChangePercent = Math.abs((1 - outputSize / sourceSize) * 100).toFixed(1);
  const sizeChangeLabel = outputSize <= sourceSize ? 'smaller' : 'larger';

  console.log(
    `${file} -> ${getMinifiedFileName(file)} (${sourceSize} -> ${outputSize} bytes, ${sizeChangePercent}% ${sizeChangeLabel})`,
  );
}

/**
 * Compute the combined hash for a single bookmarklet source file.
 *
 * The hash includes:
 * - The bookmarklet source file (path + content)
 * - All shared input files (build scripts and helpers, package.json, lockfile)
 * - Extra dependency files such as imported modules
 * - The serialized esbuild options
 *
 * @param {string} sourceFile - Absolute path to the source file
 * @param {string[]} extraFiles - Additional files to include in the hash (e.g. imported modules)
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
async function computeHash(sourceFile, extraFiles = []) {
  const allFiles = [...sharedInputs, sourceFile, ...extraFiles];
  const fileHash = await hashFiles(allFiles, rootDir);

  return createContentHash(esbuildOptionsHash + fileHash);
}

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

async function watchMode(sourceFiles) {
  if (isVerbose) {
    console.log('Watching for changes in bookmarklets/...\n');
  }

  const initialSourceFiles = await getSourceFiles();

  await buildBookmarklets(sourceFiles, initialSourceFiles);

  const { watch } = await import('node:fs');

  let debounce = null;

  const scheduleRebuild = (changedFiles, label) => {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      try {
        if (isVerbose) {
          console.log(`\nChange detected: ${label}`);
        }

        const currentSourceFiles = await getSourceFiles();
        const existingChangedFiles = changedFiles.filter((file) =>
          currentSourceFiles.includes(file),
        );

        if (existingChangedFiles.length === 0) {
          await buildBookmarklets([], currentSourceFiles);

          return;
        }

        await buildBookmarklets(existingChangedFiles, currentSourceFiles);
      } catch (error) {
        console.error(`Failed to rebuild after change in ${label}:`);
        console.error(error);
      }
    }, 300);
  };

  watch(bookmarkletsDir, (eventType, filename) => {
    if (!filename || !filename.endsWith('.js') || filename.endsWith('.min.js')) {
      return;
    }

    if (fileFilter && !sourceFiles.includes(filename)) {
      return;
    }

    scheduleRebuild([filename], filename);
  });

  for (const dependencyFile of getDependencyFilesForSources(sourceFiles)) {
    if (!(await fileExists(dependencyFile))) {
      continue;
    }

    watch(dependencyFile, () => {
      const affectedSourceFiles = sourceFiles.filter((file) =>
        getExtraFilesForSource(file).includes(dependencyFile),
      );

      scheduleRebuild(affectedSourceFiles, path.relative(rootDir, dependencyFile));
    });
  }
}

await main();

function getDependencyFilesForSources(sourceFiles) {
  return [...new Set(sourceFiles.flatMap((file) => getExtraFilesForSource(file)))];
}

async function getSourceFiles() {
  const entries = await readdir(bookmarkletsDir, { withFileTypes: true });

  return entries
    .filter(
      (entry) => entry.isFile() && entry.name.endsWith('.js') && !entry.name.endsWith('.min.js'),
    )
    .map((entry) => entry.name);
}
