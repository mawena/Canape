import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    // Application monopage : tout route rend index.html, le serveur Canapé sert le repli.
    adapter: adapter({ pages: 'build', assets: 'build', fallback: 'index.html', precompress: false, strict: false }),
  },
};
