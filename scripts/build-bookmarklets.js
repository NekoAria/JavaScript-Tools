import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { transform } from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bookmarkletsDir = path.resolve(__dirname, '..', 'bookmarklets');

const JAVASCRIPT_PREFIX = 'javascript:';

async function buildBookmarklets() {
  const files = await readdir(bookmarkletsDir);
  const sourceFiles = files.filter((f) => f.endsWith('.js') && !f.endsWith('.min.js'));

  if (sourceFiles.length === 0) {
    console.log('No bookmarklet source files found.');

    return;
  }

  for (const file of sourceFiles) {
    const sourcePath = path.join(bookmarkletsDir, file);
    const outputPath = path.join(bookmarkletsDir, file.replace(/\.js$/, '.min.js'));
    const source = await readFile(sourcePath, 'utf8');

    // Strip javascript: prefix for esbuild (not valid JS)
    const stripped = source.startsWith(JAVASCRIPT_PREFIX)
      ? source.slice(JAVASCRIPT_PREFIX.length).trimStart()
      : source;

    const result = await transform(stripped, {
      minify: true,
    });

    // Re-add javascript: prefix
    const output = JAVASCRIPT_PREFIX + result.code;

    await writeFile(outputPath, output, 'utf8');

    const sourceSize = Buffer.byteLength(source);
    const outputSize = Buffer.byteLength(output);

    console.log(
      `${file} -> ${file.replace(/\.js$/, '.min.js')} (${sourceSize} -> ${outputSize} bytes, ${((1 - outputSize / sourceSize) * 100).toFixed(1)}% smaller)`,
    );
  }
}

async function watchMode() {
  console.log('Watching for changes in bookmarklets/...\n');

  const { watch } = await import('node:fs');

  let debounce = null;

  watch(bookmarkletsDir, (eventType, filename) => {
    if (!filename || !filename.endsWith('.js') || filename.endsWith('.min.js')) {
      return;
    }

    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      console.log(`\nChange detected: ${filename}`);
      await buildBookmarklets();
    }, 300);
  });
}

const isWatch = process.argv.includes('--watch');

await buildBookmarklets();

if (isWatch) {
  await watchMode();
}
