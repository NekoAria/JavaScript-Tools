import { spawn } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectFiles, fileExists, hashFiles, readCache, writeCache } from './lib/build-cache.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const packagesDir = path.resolve(rootDir, 'packages');
const sharedDir = path.resolve(rootDir, 'shared');
const userscriptsDir = path.resolve(rootDir, 'userscripts');
const cacheFile = path.resolve(rootDir, '.cache', 'build-packages.json');

const args = process.argv.slice(2);
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

const packageFilter = getArgValue('--package');

/**
 * Discover package directories that have a build script.
 *
 * @returns {Promise<Array<{name: string, dir: string}>>}
 */
async function discoverPackages() {
  const entries = await readdir(packagesDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  const packages = [];

  for (const dir of dirs) {
    const pkgPath = path.join(packagesDir, dir.name, 'package.json');

    try {
      const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));

      if (pkg.scripts?.build) {
        packages.push({ name: dir.name, dir: path.join(packagesDir, dir.name) });
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

    const outputWasNotUpdated =
      currentOutputMtime === null ||
      (previousOutputMtime !== null && currentOutputMtime <= previousOutputMtime);

    if (outputWasNotUpdated) {
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
 * - Build script files (build-packages.js, build-cache.js)
 *
 * @param {string} pkgDir - Absolute path to the package directory
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
async function computePackageHash(pkgDir) {
  const packageFiles = await collectFiles(pkgDir);
  const sharedFiles = await collectFiles(sharedDir);
  const allFiles = [...packageFiles, ...sharedFiles, ...globalInputs];

  return await hashFiles(allFiles, rootDir);
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
  let anyBuilt = false;
  let anyFailed = false;

  for (const pkg of selected) {
    const expectedOutputPath = outputPath(pkg.name);
    const hash = await computePackageHash(pkg.dir);

    if (!isForce && (await fileExists(expectedOutputPath)) && cache[pkg.name] === hash) {
      newCache[pkg.name] = hash;

      if (isVerbose) {
        console.log(`[${pkg.name}] up to date`);
      }

      continue;
    }

    if (await buildPackage(pkg, expectedOutputPath)) {
      newCache[pkg.name] = hash;
      anyBuilt = true;
    } else {
      delete newCache[pkg.name];
      anyFailed = true;
    }
  }

  // Prune stale entries (packages that no longer exist)
  for (const key of Object.keys(newCache)) {
    if (!packages.some((p) => p.name === key)) {
      delete newCache[key];
    }
  }

  await writeCache(cacheFile, newCache);

  if (isVerbose && !anyBuilt && !anyFailed) {
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
