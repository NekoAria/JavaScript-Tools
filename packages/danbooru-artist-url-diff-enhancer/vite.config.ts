import { defineMonkeyConfig } from '../../shared/vite-config.js';

export default defineMonkeyConfig({
  name: 'danbooru-artist-url-diff-enhancer',
  entry: 'src/main.ts',
  userscript: {
    name: 'Danbooru Artist URL Diff Enhancer',
    namespace: 'https://github.com/NekoAria/JavaScript-Tools',
    version: '1.0.0',
    description:
      'Enhance artist version diff lists with smart URL matching and character-level diff highlighting',
    author: 'Neko_Aria',
    match: ['*://*.donmai.us/artist_versions*'],
    grant: 'none',
  },
});
