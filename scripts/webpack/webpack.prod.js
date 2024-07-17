const { merge } = require('webpack-merge');
const path = require('path');
const common = require('./webpack.common');

/* NodeSource changes:
  - export files to esm folder
*/

module.exports = merge(common, {
  mode: 'production',
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
