#!/usr/bin/env node
'use strict';

/**
 * Build Script - 将 jm-map-transfer 打包为 Windows .exe
 *
 * 流程:
 * 1. esbuild 打包所有 JS + 静态文件为单个 bundle.js
 * 2. 生成 Node.js SEA blob
 * 3. 复制 node.exe 并注入 blob，生成最终 exe
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = __dirname;
const DIST = path.join(PROJECT_ROOT, 'dist');
const OUT_EXE = path.join(DIST, 'jm-map-transfer.exe');
const BUNDLE = path.join(DIST, 'bundle.js');
const BLOB = path.join(DIST, 'sea-prep.blob');
const SEA_CONFIG = path.join(PROJECT_ROOT, 'sea-config.json');

function log(msg) {
  console.log(`\x1b[36m[build]\x1b[0m ${msg}`);
}

function cleanup() {
  // 清理临时文件，保留最终 exe
  try { if (fs.existsSync(SEA_CONFIG)) fs.unlinkSync(SEA_CONFIG); } catch (_) {}
  try { if (fs.existsSync(BLOB)) fs.unlinkSync(BLOB); } catch (_) {}
  try { if (fs.existsSync(BUNDLE)) fs.unlinkSync(BUNDLE); } catch (_) {}
}

try {
  // ── Step 0: 清理并创建 dist 目录 ──
  log('清理 dist 目录...');
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST, { recursive: true });

  // ── Step 1: esbuild 打包 ──
  log('使用 esbuild 打包...');
  
  // 使用 esbuild API 而不是 CLI，以便加载插件
  const esbuild = require('esbuild');
  const inlinePublicPlugin = require('./esbuild-plugin-inline-public');
  
  execSync('node esbuild-build.js', { cwd: PROJECT_ROOT, stdio: 'inherit' });

  const bundleSize = (fs.statSync(BUNDLE).size / 1024).toFixed(1);
  log(`Bundle 大小: ${bundleSize} KB`);

  // ── Step 2: 生成 SEA 配置 ──
  log('生成 SEA 配置...');
  const seaConfig = {
    main: BUNDLE,
    output: BLOB,
    disableExperimentalSEAWarning: true,
    useCodeCache: true,
  };
  fs.writeFileSync(SEA_CONFIG, JSON.stringify(seaConfig, null, 2));

  // ── Step 3: 生成 SEA blob ──
  log('生成 SEA blob...');
  execSync(`node --experimental-sea-config "${SEA_CONFIG}"`, {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
  });

  const blobSize = (fs.statSync(BLOB).size / 1024 / 1024).toFixed(1);
  log(`Blob 大小: ${blobSize} MB`);

  // ── Step 4: 复制 node.exe 并注入 blob ──
  log('创建可执行文件...');
  const nodePath = process.execPath;
  log(`使用 Node.js: ${nodePath}`);
  fs.copyFileSync(nodePath, OUT_EXE);

  const postjectCmd = `npx postject "${OUT_EXE}" NODE_SEA_BLOB "${BLOB}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`;
  execSync(postjectCmd, { cwd: PROJECT_ROOT, stdio: 'inherit' });

  // ── Step 5: 清理临时文件 ──
  cleanup();

  // ── 完成 ──
  const exeSize = (fs.statSync(OUT_EXE).size / 1024 / 1024).toFixed(1);
  console.log('');
  log('========================================');
  log('  打包完成!');
  log('========================================');
  log(`输出文件: ${OUT_EXE}`);
  log(`文件大小: ${exeSize} MB`);
  log('');
  log('使用方法: 双击 jm-map-transfer.exe 即可运行');
  log('程序会自动打开浏览器访问 http://127.0.0.1:8090');

} catch (err) {
  console.error(`\n\x1b[31m[build] 打包失败: ${err.message}\x1b[0m`);
  cleanup();
  process.exit(1);
}
