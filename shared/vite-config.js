import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

import { USERSCRIPT_BASE_URL } from './constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const userscriptsDir = path.resolve(__dirname, '..', 'userscripts');

/**
 * Generate a shared vite config for userscript projects.
 *
 * @param {object} options
 * @param {string} options.name       - package name, used as the output .user.js file name
 * @param {string} options.entry      - entry file path, relative to the package root (default: 'src/main.js')
 * @param {import('vite-plugin-monkey').MonkeyUserScript} options.userscript - userscript metadata
 * @returns {import('vite').UserConfig}
 */
export function defineMonkeyConfig({ name, entry = 'src/main.js', userscript }) {
  return defineConfig({
    build: {
      outDir: userscriptsDir,
      emptyOutDir: false,
    },
    plugins: [
      monkey({
        entry,
        userscript: {
          downloadURL: `${USERSCRIPT_BASE_URL}/${name}.user.js`,
          updateURL: `${USERSCRIPT_BASE_URL}/${name}.user.js`,
          ...userscript,
        },
      }),
    ],
  });
}
