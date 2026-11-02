const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
  const isDev = argv && argv.mode === 'development';
  return {
    entry: {
      main: './src/index.tsx',
      settings: './src/settings.tsx',
    },
    output: {
      path: path.resolve(__dirname),
      filename: 'dist/[name].bundle.js',
      clean: false,
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      // CEP opens every <Extension> in its own CEF process and loads over file://
      // (no gzip), so the raw bundle size is paid again for each window. Preact's
      // React-compatible layer keeps the component code unchanged and cuts the
      // runtime from ~140KB to ~10KB per bundle.
      alias: {
        react: 'preact/compat',
        'react-dom/client': 'preact/compat/client',
        'react-dom': 'preact/compat',
        'react/jsx-runtime': 'preact/jsx-runtime',
      },
    },
    module: {
      rules: [
        { test: /\.(ts|tsx)$/, use: 'ts-loader', exclude: /node_modules/ },
        { test: /\.css$/, use: [MiniCssExtractPlugin.loader, 'css-loader'] },
        { test: /\.svg$/, type: 'asset/source' },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './public/index.html',
        filename: 'index.html',
        chunks: ['main'],
        inject: 'body',
      }),
      new HtmlWebpackPlugin({
        template: './public/settings.html',
        filename: 'settings.html',
        chunks: ['settings'],
        inject: 'body',
      }),
      new MiniCssExtractPlugin({ filename: 'dist/styles.css' }),
    ],
    externals: {
      fs: 'commonjs fs',
      path: 'commonjs path',
      os: 'commonjs os',
      child_process: 'commonjs child_process',
    },
    devtool: isDev ? 'inline-source-map' : false,
    performance: { hints: false },
  };
};
