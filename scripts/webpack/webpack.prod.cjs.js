const { merge } = require('webpack-merge');
const path = require('path');
const common = require('./webpack.common');

module.exports = merge(common, {
  mode: 'production',
  devtool: 'source-map',
  output: {
    clean: true,
    path: path.resolve(__dirname, '../../dist/cjs'),
    filename: 'index.js',
    library: 'NS-Pyroscope',
    libraryTarget: 'commonjs2',
  },
});
