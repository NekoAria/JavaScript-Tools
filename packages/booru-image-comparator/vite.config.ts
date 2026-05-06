import { defineMonkeyConfig } from '../../shared/vite-config.js';

export default defineMonkeyConfig({
  name: 'booru-image-comparator',
  entry: 'src/main.ts',
  userscript: {
    name: 'Universal Booru Image Comparator',
    namespace: 'https://github.com/NekoAria/JavaScript-Tools',
    version: '2.0.1',
    description:
      'Compare images on Danbooru / Yande.re / Konachan with multiple modes and transformations',
    author: 'Neko_Aria',
    match: [
      '*://*.donmai.us/iqdb_queries*',
      '*://*.donmai.us/posts/*',
      '*://*.donmai.us/uploads/*',
      'https://konachan.com/post/show/*',
      'https://konachan.com/post/similar*',
      'https://yande.re/post/show/*',
      'https://yande.re/post/similar*',
    ],
    grant: 'none',
  },
});
