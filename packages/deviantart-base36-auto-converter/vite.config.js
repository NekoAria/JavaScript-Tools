import { defineMonkeyConfig } from '../../shared/vite-config.js';

export default defineMonkeyConfig({
  name: 'deviantart-base36-auto-converter',
  entry: 'src/main.js',
  userscript: {
    name: 'DeviantArt Base36 Auto Converter',
    namespace: 'https://github.com/NekoAria/JavaScript-Tools',
    version: '1.0.0',
    description: 'Automatically convert DeviantArt /view/c/[base36] URLs to /view/[base10]',
    author: 'Neko_Aria',
    match: ['https://www.deviantart.com/view/c/*', 'https://deviantart.com/view/c/*'],
    'run-at': 'document-start',
    grant: 'none',
  },
});
