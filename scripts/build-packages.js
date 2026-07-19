import { spawn } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectFiles, fileExists, hashFiles, readCache, writeCache } from './lib/build-cache.js';
import { getArgValue } from './lib/cli-args.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const packagesDir = path.resolve(rootDir, 'packages');
const sharedDir = path.resolve(rootDir, 'shared');
const userscriptsDir = path.resolve(rootDir, 'userscripts');
const cacheFile = path.resolve(rootDir, '.cache', 'build-packages.json');

const args = process.argv.slice(2);
const isForce = args.includes('--force');
const isVerbose = args.includes('--verbose');
const { hasError: hasArgError, value: packageFilter } = getArgValue(args, '--package');

/**
 * Discover package directories that have a build script.
 *
 * @returns {Promise<Array<{name: string, dir: string}>>}
 */
async function discoverPackages() {
  const entries = await readdir(packagesDir, { withFileTypes: true });
  const packages = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const packageDir = path.join(packagesDir, entry.name);
    const packageJsonPath = path.join(packageDir, 'package.json');

    try {
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

      if (packageJson.scripts?.build) {
        packages.push({ name: entry.name, dir: packageDir });
      }
    } catch {
      // Skip directories without a readable package.json.
    }
  }

  return packages;
}

/** Global input files shared by all packages. */
const globalInputs = [
  path.join(rootDir, 'package.json'),
  path.join(rootDir, 'pnpm-lock.yaml'),
  path.join(rootDir, 'pnpm-workspace.yaml'),
  path.join(rootDir, 'scripts', 'build-packages.js'),
  path.join(rootDir, 'scripts', 'lib', 'build-cache.js'),
  path.join(rootDir, 'scripts', 'lib', 'cli-args.js'),
];

/**
 * Build a single package by running `pnpm build` in its directory.
 *
 * @param {{ name: string, dir: string }} pkg
 * @param {string} expectedOutput
 * @returns {Promise<boolean>} True when the package build succeeds
 */
async function buildPackage(pkg, expectedOutput) {
  const label = `[${pkg.name}]`;
  const previousOutputMtime = await getFileMtime(expectedOutput);

  try {
    console.log(`${label} building...`);

    await run('pnpm', ['build'], pkg.dir);

    const currentOutputMtime = await getFileMtime(expectedOutput);

    const isOutputStale =
      currentOutputMtime === null ||
      (previousOutputMtime !== null && currentOutputMtime <= previousOutputMtime);

    if (isOutputStale) {
      console.error(`${label} failed`);
      console.error(
        `${label} expected output was not updated: ${path.relative(rootDir, expectedOutput)}`,
      );
      process.exitCode = 1;

      return false;
    }

    console.log(`${label} done`);

    return true;
  } catch (error) {
    console.error(`${label} failed`);

    if (error.stderr) {
      console.error(error.stderr);
    }

    process.exitCode = 1;

    return false;
  }
}

/**
 * Compute a deterministic hash for a package's build inputs.
 *
 * The hash includes:
 * - All files under the package directory
 * - All files under shared/
 * - Root config files (package.json, pnpm-lock.yaml, pnpm-workspace.yaml)
 * - Build script and helper files (build-packages.js, build-cache.js, cli-args.js)
 *
 * @param {string} pkgDir - Absolute path to the package directory
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
async function computePackageHash(pkgDir) {
  const packageFiles = await collectFiles(pkgDir);
  const sharedFiles = await collectFiles(sharedDir);

  return hashFiles([...packageFiles, ...sharedFiles, ...globalInputs], rootDir);
}

/**
 * Get a file's modification time in milliseconds, or null if it is missing.
 *
 * @param {string} file
 * @returns {Promise<number | null>}
 */
async function getFileMtime(file) {
  try {
    const fileStats = await stat(file);

    return fileStats.isFile() ? fileStats.mtimeMs : null;
  } catch {
    return null;
  }
}

async function main() {
  if (hasArgError) {
    return;
  }

  const packages = await discoverPackages();

  if (packages.length === 0) {
    console.log('No packages with build scripts found.');

    return;
  }

  let selected = packages;

  if (packageFilter) {
    selected = packages.filter((p) => p.name === packageFilter);

    if (selected.length === 0) {
      console.error(`Package not found or has no build script: ${packageFilter}`);
      process.exitCode = 1;

      return;
    }
  }

  if (isVerbose) {
    console.log(`Evaluating ${selected.length} package(s):\n`);
  }

  const cache = await readCache(cacheFile);
  const newCache = { ...cache };
  let isAnyBuilt = false;
  let isAnyFailed = false;

  for (const pkg of selected) {
    const expectedOutputPath = outputPath(pkg.name);
    const hash = await computePackageHash(pkg.dir);

    if (!isForce && (await fileExists(expectedOutputPath)) && cache[pkg.name] === hash) {
      if (isVerbose) {
        console.log(`[${pkg.name}] up to date`);
      }

      continue;
    }

    if (await buildPackage(pkg, expectedOutputPath)) {
      newCache[pkg.name] = hash;
      isAnyBuilt = true;
    } else {
      delete newCache[pkg.name];
      isAnyFailed = true;
    }
  }

  // Prune stale entries (packages that no longer exist)
  for (const key of Object.keys(newCache)) {
    if (packages.every((p) => p.name !== key)) {
      delete newCache[key];
    }
  }

  await writeCache(cacheFile, newCache);

  if (isVerbose && !isAnyBuilt && !isAnyFailed) {
    console.log('All packages are up to date.');
  }
}

await main();

function outputPath(name) {
  return path.join(userscriptsDir, `${name}.user.js`);
}

function run(cmd, cmdArgs, cwd) {
  return new Promise((resolve, reject) => {
    let stderr = '';

    const child = spawn(cmd, cmdArgs, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });

    child.stdout.on('data', () => {});
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        const error = new Error(`${cmd} ${cmdArgs.join(' ')} exited with code ${code}`);

        error.stderr = stderr;
        reject(error);
      }
    });
  });
}
