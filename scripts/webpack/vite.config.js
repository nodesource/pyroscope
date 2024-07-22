import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import libCss from 'vite-plugin-libcss';
import svgr from 'vite-plugin-svgr';
import macrosPlugin from "vite-plugin-babel-macros"

export default defineConfig({
  resolve: {
    alias: [
      { find: /^~(.*)$/, replacement: '$1' },
      { find: '@pyroscope', replacement: path.resolve(__dirname, '../../public/app') },
    ],
    extensions: ['.ts', '.tsx', '.es6', '.js', '.json', '.svg'],
  },
  build: {
    copyPublicDir: false,
    outDir: path.resolve(__dirname, '../../dist/esm'),
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, "../../public/app/index.tsx"),
      fileName: "index.js",
      formats: ['es']
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: { globals: { react: 'React', 'react-dom': 'ReactDOM' } },
    },
  },
  plugins: [
    react(),
    // macrosPlugin(),
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
  css: {
    preprocessorOptions: { scss: {} }
  },
});
