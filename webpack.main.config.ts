import type { Configuration } from 'webpack';
import { rules } from './webpack.rules';
import path from 'path';
// eslint-disable-next-line import/default
import CopyPlugin from 'copy-webpack-plugin';

export const mainConfig: Configuration = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './src/main.ts',
  // Put your normal webpack config below here
  module: {
    rules,
  },
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, 'src', 'assets'),
          to: path.resolve(__dirname, '.webpack/main/assets')
        }
      ]
    })
  ]
};
