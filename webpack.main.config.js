const path = require('path');
const { rules } = require('./webpack.rules');
const { plugins } = require('./webpack.plugins');

module.exports = {
  entry: './src/main.ts',
  module: {
    rules,
  },
  plugins,
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
  },
  target: 'electron-main',
  output: {
    path: path.resolve(__dirname, '.webpack/main'),
  },
};
