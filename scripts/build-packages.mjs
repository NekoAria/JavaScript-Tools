import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packagesDir = path.resolve(__dirname, '..', 'packages');

async function buildPackages() {
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
      // no package.json or invalid JSON, skip
    }
  }

  if (packages.length === 0) {
    console.log('No packages with build scripts found.');

    return;
  }

  console.log(`Building ${packages.length} package(s):\n`);

  for (const pkg of packages) {
    const label = `[${pkg.name}]`;

    try {
      console.log(`${label} building...`);

      await run('pnpm', ['build'], pkg.dir);

      console.log(`${label} done`);
    } catch (error) {
      console.error(`${label} failed`);

      if (error.stderr) {
        console.error(error.stderr);
      }

      process.exitCode = 1;
    }
  }
}

/**
 * Run a command in a given directory and return a promise.
 */
function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    let stderr = '';

    const child = spawn(cmd, args, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });

    child.stdout.on('data', () => {});
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        const error = new Error(`${cmd} ${args.join(' ')} exited with code ${code}`);

        error.stderr = stderr;
        reject(error);
      }
    });
  });
}

await buildPackages();
