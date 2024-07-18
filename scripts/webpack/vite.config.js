import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import libCss from 'vite-plugin-libcss';
import svgr from 'vite-plugin-svgr';

// Vite configuration
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^~(.*)$/,
        replacement: '$1'
      },
      {
        find: '@pyroscope',
        replacement: path.resolve(__dirname, '../../public/app')
      },
    ],
    extensions: ['.ts', '.tsx', '.es6', '.js', '.json', '.svg'],
  },
  build: {
    outDir: path.resolve(__dirname, '../../dist/esm'),
    // assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, "../../public/app/index.tsx"),
      fileName: "index.js",
      formats: ['es']
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
  },
  plugins: [
    react(),
    libCss(),
    svgr({
      // svgr options: https://react-svgr.com/docs/options/
      svgrOptions: { exportType: "default", ref: true, svgo: false, titleProp: true },
      include: "**/*.svg",
    }),
  ],
  css: {
    // modules: {
    //   scopeBehaviour: 'local', // Ensure CSS Modules are used
    // },
    preprocessorOptions: {
      scss: {},
    },
  },
});
