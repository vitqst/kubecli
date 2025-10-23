// Webpack rules for renderer process (without asset relocator)
const rules = [
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
