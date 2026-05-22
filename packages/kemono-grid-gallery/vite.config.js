import { defineMonkeyConfig } from '../../shared/vite-config.js';

export default defineMonkeyConfig({
  name: 'kemono-grid-gallery',
  entry: 'src/main.js',
  userscript: {
    name: 'Kemono/Coomer Grid Gallery Layout',
    namespace: 'https://github.com/NekoAria/JavaScript-Tools',
    version: '1.0.0',
    description:
      'Add a responsive grid gallery layout for the Kemono/Coomer thumbnails, using the first attachment image file as the cover',
    author: 'Neko_Aria',
    license: 'MIT',
    icon: 'https://kemono.cr/static/favicon.ico',
    match: ['https://coomer.st/*', 'https://kemono.cr/*'],
    grant: 'none',
  },
});
