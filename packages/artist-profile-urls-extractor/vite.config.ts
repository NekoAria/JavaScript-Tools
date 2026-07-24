import { defineMonkeyConfig } from '../../shared/vite-config.js';

export default defineMonkeyConfig({
  name: 'artist-profile-urls-extractor',
  entry: 'src/main.ts',
  userscript: {
    name: 'Artist Profile URLs Extractor',
    namespace: 'https://github.com/NekoAria/JavaScript-Tools',
    version: '1.0.9',
    description:
      'Add a draggable floating button on supported artist profile pages that opens a modal with canonical profile URLs and copy actions',
    author: 'Neko_Aria',
    match: ['https://*/*'],
    noframes: true,
    'run-at': 'document-start',
    grant: 'none',
  },
});
