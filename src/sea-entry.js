'use strict';

/**
 * SEA Entry Point - 打包为 exe 时的入口
 * 设置环境变量让服务器自动打开浏览器
 */
process.env.JM_SEA_MODE = '1';
process.argv.push('--open');

// 加载主服务器
require('./server');
