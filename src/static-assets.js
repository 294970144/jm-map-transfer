'use strict';

/**
 * Static Assets - 通过 esbuild text loader 内联静态文件
 *
 * esbuild 会在打包时将这些 require 替换为文件的实际内容字符串。
 * 这样在 SEA 模式下，所有静态文件都从内存中读取，不需要文件系统。
 */

// esbuild text loader 语法：require 返回文件内容字符串
const indexHtml = require('../public/index.html');
const pixelThemeCss = require('../public/css/pixel-theme.css');
const componentsCss = require('../public/css/components.css');
const animationsCss = require('../public/css/animations.css');
const appJs = require('../public/js/app.js');
const apiJs = require('../public/js/api.js');
const uiJs = require('../public/js/ui.js');

const STATIC_ASSETS = {
  '/index.html': indexHtml,
  '/': indexHtml,
  '/css/pixel-theme.css': pixelThemeCss,
  '/css/components.css': componentsCss,
  '/css/animations.css': animationsCss,
  '/js/app.js': appJs,
  '/js/api.js': apiJs,
  '/js/ui.js': uiJs,
};

module.exports = { STATIC_ASSETS };
