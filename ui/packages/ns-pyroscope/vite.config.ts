import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

type CssRule = {
  selectors: string[];
  parent?: { type: string; name?: string };
};

const scopeCss = {
  postcssPlugin: 'scope-ns-pyroscope',
  Rule(rule: CssRule) {
    if (
      rule.parent?.type === 'atrule' &&
      rule.parent.name?.endsWith('keyframes')
    ) {
      return;
    }
    rule.selectors = rule.selectors.map((selector) =>
      selector.startsWith('.ns-pyroscope')
        ? selector
        : `.ns-pyroscope ${selector}`,
    );
  },
};

const injectCss = (): Plugin => ({
  name: 'inject-library-css',
  apply: 'build',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const cssAsset = Object.values(bundle).find(
      (entry) => entry.type === 'asset' && entry.fileName.endsWith('.css'),
    );
    if (!cssAsset) return;

    for (const entry of Object.values(bundle)) {
      if (entry.type !== 'chunk' || !entry.isEntry) continue;
      entry.code = `import './${cssAsset.fileName}';\n${entry.code}`;
    }
  },
});

export default defineConfig({
  plugins: [react(), injectCss()],
  resolve: {
    alias: {
      '@components': fileURLToPath(
        new URL('../../src/components', import.meta.url),
      ),
      '@lib': fileURLToPath(new URL('../../src/lib', import.meta.url)),
      '@public': fileURLToPath(new URL('../../public', import.meta.url)),
    },
  },
  css: {
    postcss: {
      plugins: [scopeCss],
    },
  },
  build: {
    copyPublicDir: false,
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: fileURLToPath(new URL('./src/index.tsx', import.meta.url)),
      formats: ['es'],
      fileName: () => 'index.js',
      cssFileName: 'style',
    },
    rollupOptions: {
      external: [/^react($|\/)/, /^react-dom($|\/)/],
      output: {
        assetFileNames: (asset) =>
          asset.names?.some((name) => name.endsWith('.css'))
            ? 'style.css'
            : 'assets/[name]-[hash][extname]',
      },
    },
  },
});
