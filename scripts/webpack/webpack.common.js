const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  target: 'web',
  entry: './public/app/index.js',
  output: {
    path: path.resolve(__dirname, '../../dist'),
    filename: 'index.js',
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.es6', '.js', '.json', '.svg'],
    modules: ['node_modules', path.resolve('public')],
    alias: {
      '@pyroscope': path.resolve(__dirname, '../../public/app'),
      '@emotion/react': require.resolve('@emotion/react'),
    },
  },
  externals: {
    react: 'react',
    'react-dom': 'react-dom',
    'react-redux': 'react-redux',
    '@reduxjs/toolkit': '@reduxjs/toolkit',
  },
  ignoreWarnings: [/export .* was not found in/],
  stats: {
    children: false,
    source: false,
  },
  plugins: [
    new MiniCssExtractPlugin({
    //   filename: 'index.css',
      experimentalUseImportModule: false
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'node_modules/@grafana/ui/dist/public/img/icons',
          to: 'grafana/img/icons/',
        },
      ],
    }),
  ],
  module: {
    rules: [
      // CSS y SCSS
      {
        test: /\.(css|scss)$/,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader',
            options: {
              importLoaders: 2,
              url: true,
            },
          },
          {
            loader: 'sass-loader',
            options: {},
          },
        ],
      },
      {
        test: require.resolve('jquery'),
        loader: 'expose-loader',
        options: {
          exposes: ['$', 'jQuery'],
        },
      },
      {
        test: /\.(js|ts)x?$/,
        use: [
          {
            loader: 'esbuild-loader',
            options: {
              loader: 'tsx',
              target: 'es2015',
            },
          },
        ],
      },
      {
        test: /\.svg$/,
        use: [
          {
            loader: 'react-svg-loader',
            options: {
              svgo: {
                plugins: [
                  { convertPathData: { noSpaceAfterFlags: false } },
                  { removeViewBox: false },
                ],
              },
            },
          },
        ],
      },
    ],
  },
};
