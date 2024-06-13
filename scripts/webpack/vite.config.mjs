import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import libCss from 'vite-plugin-libcss';
import svgr from 'vite-plugin-svgr';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  resolve: {
    alias: [
      { find: /^~(.*)$/, replacement: '$1' },
      { find: '@pyroscope', replacement: path.resolve(__dirname, '../../public/app') },
      { find: '@emotion/react', replacement: path.resolve(__dirname, '../../node_modules/@emotion/react') },
    ],
    extensions: ['.ts', '.tsx', '.es6', '.js', '.json', '.svg'],
  },
  build: {
    copyPublicDir: false,
    sourcemap: true,
    outDir: path.resolve(__dirname, '../../dist/esm/'),
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, "../../public/app/index.tsx"),
      fileName: "index.js",
      name: '@ns-private/pyroscope',
      formats: ['es']
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: { globals: { react: 'React', 'react-dom': 'ReactDOM' } },
    },
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/@grafana/ui/dist/public/img/icons',
          dest: 'assets/grafana/img/icons/',
        },
      ],
    }),
    libCss(),
    svgr({
      svgrOptions: {
        plugins: ["@svgr/plugin-svgo"],
        svgoConfig: {
          plugins: [{ removeViewBox: false }, { convertPathData: { noSpaceAfterFlags: false } }],
        },
      }
    })
  ],
  optimizeDeps: {
    include: ['jquery'],
  },
  css: {
    preprocessorOptions: { scss: {} }
  },
});
