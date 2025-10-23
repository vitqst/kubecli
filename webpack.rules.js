const rules = [
  {
    test: /native_modules[\\/].+\.node$/,
    use: 'node-loader',
  },
  {
    test: /\.node$/,
    use: 'node-loader',
  },
  {
    test: /.(m?js|node)$/,
    parser: { amd: false },
    use: {
      loader: '@vercel/webpack-asset-relocator-loader',
      options: {
        outputAssetBase: 'native_modules',
      },
    },
  },
  {
    test: /\.tsx?$/,
    exclude: /(node_modules|\.webpack)/,
    use: {
      loader: 'ts-loader',
      options: {
        transpileOnly: true,
      },
    },
  },
  {
    test: /\.css$/,
    use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
  },
  {
    test: /\.(png|jpg|jpeg|gif|svg)$/,
    use: 'file-loader',
  },
];

module.exports = { rules };
