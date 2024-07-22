import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import libCss from 'vite-plugin-libcss';
// import svgr from 'vite-plugin-svgr';

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
    // esto es un intento para configurar los inlines de los svgs
    // assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    emptyOutDir: true,
    assetsInlineLimit: (file) => {
      return !file.endsWith('.svg');
    },
    lib: {
      entry: path.resolve(__dirname, "../../public/app/index.tsx"),
      fileName: "index.js",
      name: 'a-ns-pyroscope',
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
    // estaba experimentando con este plugin pero no me ha funcionado
    // svgr({
    //   svgrOptions: {
    //     plugins: ["@svgr/plugin-svgo", "@svgr/plugin-jsx"],
    //     svgoConfig: {
    //       floatPrecision: 2,
    //       removeViewBox: false,
    //       convertPathData: {
    //         noSpaceAfterFlags: false
    //       }
    //     },
    //   }
    // })
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
