const { merge } = require('webpack-merge');
const path = require('path');
const common = require('./webpack.common');

module.exports = merge(common, {
  mode: 'development', // No minificación
  devtool: 'source-map', // Agregar sourcemaps
  output: {
    clean: true,
    path: path.resolve(__dirname, '../../dist/esm'),
    filename: 'index.js',
    libraryTarget: 'module',
    module: true,
    environment: {
      module: true,
    },
  },
  experiments: {
    outputModule: true,
  },
});
