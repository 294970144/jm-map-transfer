#!/usr/bin/env node
'use strict';

/**
 * esbuild 构建脚本（使用插件）
 */

const esbuild = require('esbuild');
const path = require('path');
const inlinePublicPlugin = require('./esbuild-plugin-inline-public');

const PROJECT_ROOT = __dirname;
const DIST = path.join(PROJECT_ROOT, 'dist');
const BUNDLE = path.join(DIST, 'bundle.js');

esbuild.build({
  entryPoints: [path.join(PROJECT_ROOT, 'src', 'sea-entry.js')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: BUNDLE,
  target: 'node22',
  minify: true,
  plugins: [inlinePublicPlugin],
  loader: {
    '.html': 'text',
    '.css': 'text',
  },
}).then(() => {
  console.log('esbuild 打包完成');
}).catch((err) => {
  console.error('esbuild 打包失败:', err);
  process.exit(1);
});
