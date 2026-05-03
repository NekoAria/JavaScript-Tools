import { defineMonkeyConfig } from '../../shared/vite-config.js';

export default defineMonkeyConfig({
  name: 'danbooru-artist-tweaks',
  entry: 'src/main.js',
  userscript: {
    name: 'Danbooru Artist Tweaks',
    namespace: 'https://github.com/NekoAria/JavaScript-Tools',
    version: '1.0.0',
    description:
      'Add Create wiki link for artist pages without wiki page, copy artist name button, replace wiki links with bulk update request links for tag aliases, show pending BURs, and warn about unmigrated posts on artist rename',
    author: 'Neko_Aria',
    match: ['*://*.donmai.us/artists/*', '*://*.donmai.us/artist_versions*'],
    grant: 'none',
  },
});
