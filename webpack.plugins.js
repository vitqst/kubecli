const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

const plugins = [new ForkTsCheckerWebpackPlugin()];

module.exports = { plugins };
