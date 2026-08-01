'use strict';

/**
 * Transfer Engine v4 - 稳定版
 *
 * 核心策略：
 * 1. 纯 Node.js fs API，不依赖外部命令
 * 2. 删除用 fs.rm + 重试，失败则 spawn PowerShell
 * 3. 不用 rename 技巧（安全软件会拦截）
 * 4. 全部异步，不阻塞事件循环
 * 5. 每个错误都有清晰的中文消息
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { hasTraversal, formatSize } = require('../utils/path-helpers');
const logger = require('../utils/logger');

const tasks = new Map();
const TASK_TTL_MS = 5 * 60 * 1000;

// ─── Task cleanup ───────────────────────────────────────────────
function cleanupOldTasks() {
  const now = Date.now();
  for (const [id, task] of tasks) {
    if (['complete', 'error', 'cancelled'].includes(task.status)) {
      if (now - task.startTime > TASK_TTL_MS) {
        tasks.delete(id);
      }
    }
  }
}

// ─── Utilities ──────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * 验证路径在 JourneyMap data/mp 目录内
 */
function validateJmPath(targetPath) {
  if (!targetPath) return false;
  if (hasTraversal(targetPath)) return false;
  const normalized = path.resolve(targetPath).toLowerCase();
  const jmMarker = path.join('journeymap', 'data', 'mp').toLowerCase();
  return normalized.includes(jmMarker);
}

/**
 * 列出运行中的 Minecraft 进程
 */
function getRunningMinecraftPids() {
  const pids = [];
  try {
    const { execSync } = require('child_process');
    const names = ['javaw.exe', 'java.exe'];
    for (const name of names) {
      try {
        const out = execSync(`tasklist /FI "IMAGENAME eq ${name}" /FO CSV /NH`, {
          encoding: 'utf-8', timeout: 5000,
        });
        const lines = out.trim().split('\n').filter(l => l.trim() && !l.includes('INFO:'));
        for (const line of lines) {
          const m = line.match(/"[^"]+\","(\d+)"/);
          if (m) pids.push(m[1]);
        }
      } catch (_) { /* ignore */ }
    }
  } catch (_) { /* ignore */ }
  return pids;
}

/**
 * 删除目录 - 可靠版本
 * 策略：fs.rm 重试 → PowerShell 兜底
 * 不使用 rename 技巧（会被安全软件拦截）
 */
async function deleteDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    logger.info(`deleteDirectory: ${dirPath} 不存在，跳过`);
    return true;
  }

  // 策略 1: fs.rm 带重试
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      if (!fs.existsSync(dirPath)) {
        logger.info(`deleteDirectory: fs.rm 成功 (第${attempt}次)`);
        return true;
      }
    } catch (e) {
      logger.warn(`deleteDirectory: fs.rm 第${attempt}次失败 - ${e.message}`);
    }
    if (attempt < 5) {
      await sleep(500 * attempt); // 递增等待: 500ms, 1000ms, 1500ms, 2000ms
    }
  }

  // 策略 2: PowerShell 兜底
  if (fs.existsSync(dirPath)) {
    logger.info(`deleteDirectory: 尝试 PowerShell 删除`);
    try {
      await runPowerShellDelete(dirPath);
      if (!fs.existsSync(dirPath)) {
        logger.info(`deleteDirectory: PowerShell 删除成功`);
        return true;
      }
    } catch (e) {
      logger.warn(`deleteDirectory: PowerShell 失败 - ${e.message}`);
    }
  }

  // 最终检查
  if (fs.existsSync(dirPath)) {
    return false;
  }
  return true;
}

/**
 * 用 PowerShell 删除目录（Promise 包装）
 */
function runPowerShellDelete(dirPath) {
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Remove-Item -Path '${dirPath.replace(/'/g, "''")}' -Recurse -Force`,
    ], { stdio: 'pipe', windowsHide: true });

    let stderr = '';
    ps.stderr.on('data', (d) => { stderr += d.toString(); });
    ps.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`PowerShell exit ${code}: ${stderr.trim()}`));
    });
    ps.on('error', (e) => reject(e));

    // 超时 60 秒
    setTimeout(() => {
      ps.kill();
      reject(new Error('PowerShell 超时'));
    }, 60000);
  });
}

/**
 * 确保目录存在（带 fallback）
 */
async function ensureDir(dirPath) {
  // 先尝试 Node.js 原生方式
  try {
    await fs.promises.mkdir(dirPath, { recursive: true });
    return;
  } catch (e) {
    logger.warn(`ensureDir: fs.mkdir 失败 (${e.code}), 尝试 PowerShell...`);
  }

  // Fallback: PowerShell 创建目录
  try {
    await new Promise((resolve, reject) => {
      const ps = spawn('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command',
        `New-Item -Path '${dirPath.replace(/'/g, "''")}' -ItemType Directory -Force`,
      ], { stdio: 'pipe', windowsHide: true });
      ps.on('close', (code) => code === 0 ? resolve() : reject(new Error(`PowerShell mkdir exit ${code}`)));
      ps.on('error', reject);
      setTimeout(() => { ps.kill(); reject(new Error('PowerShell mkdir 超时')); }, 10000);
    });
  } catch (e2) {
    throw new Error(`无法创建目录 ${dirPath}: ${e2.message}`);
  }
}

/**
 * 复制单个文件（带重试）
 */
async function copyFileWithRetry(src, dst, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await new Promise((resolve, reject) => {
        const cb = (err) => err ? reject(err) : resolve();
        fs.copyFile(src, dst, cb);
      });
      return;
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      await sleep(200);
    }
  }
}

/**
 * 递归复制目录
 * @param {function} onFile - 每复制一个文件回调 (srcPath, dstPath)
 */
async function copyDirRecursive(src, dst, onFile) {
  await ensureDir(dst);

  const entries = await fs.promises.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);

    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, dstPath, onFile);
    } else if (entry.isFile()) {
      await copyFileWithRetry(srcPath, dstPath);
      if (onFile) onFile(srcPath, dstPath);
    } else if (entry.isSymbolicLink()) {
      try {
        const target = await fs.promises.readlink(srcPath);
        await fs.promises.symlink(target, dstPath);
      } catch (_) { /* 跳过无法处理的符号链接 */ }
    }
  }
}

/**
 * 异步统计文件数和总大小
 */
async function scanDir(src) {
  let count = 0;
  let size = 0;

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        count++;
        try {
          const stat = await fs.promises.stat(full);
          size += stat.size;
        } catch (_) { /* skip */ }
      }
    }
  }

  await walk(src);
  return { count, size };
}

// ─── Main Transfer API ──────────────────────────────────────────

/**
 * 启动转移任务
 * @returns {string} taskId
 */
function startTransfer(params, onProgress) {
  const { sourcePath, targetPath, mode, overwrite } = params;
  const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

  cleanupOldTasks();

  // ── 参数验证 ──
  if (!sourcePath || !targetPath) {
    throw new Error('缺少源路径或目标路径');
  }
  if (hasTraversal(sourcePath) || hasTraversal(targetPath)) {
    throw new Error('路径不安全：包含 .. 遍历');
  }
  if (!validateJmPath(sourcePath)) {
    throw new Error('源路径不在 JourneyMap data/mp 目录内');
  }
  if (!validateJmPath(targetPath)) {
    throw new Error('目标路径不在 JourneyMap data/mp 目录内');
  }
  if (!fs.existsSync(sourcePath)) {
    throw new Error('源路径不存在: ' + sourcePath);
  }
  if (fs.existsSync(targetPath) && !overwrite) {
    throw new Error('目标路径已存在，请确认覆盖');
  }
  const resolvedSrc = path.resolve(sourcePath);
  const resolvedDst = path.resolve(targetPath);
  if (resolvedSrc === resolvedDst) {
    throw new Error('源路径和目标路径不能相同');
  }

  // ── Minecraft 检测（仅警告）──
  const mcPids = getRunningMinecraftPids();
  if (mcPids.length > 0) {
    logger.warn(`检测到 Minecraft 运行中 (PID: ${mcPids.join(', ')}), 文件可能被锁定`);
  }

  // ── 创建任务 ──
  const task = {
    id: taskId,
    sourcePath: resolvedSrc,
    targetPath: resolvedDst,
    mode: mode || 'copy',
    overwrite: !!overwrite,
    status: 'pending',
    cancelled: false,
    onProgress,
    startTime: Date.now(),
    lastProgressTime: 0,
    totalFiles: 0,
    copiedFiles: 0,
    totalSize: 0,
    copiedSize: 0,
    errors: [],
  };

  tasks.set(taskId, task);

  // 异步执行
  runTransfer(task).catch((err) => {
    logger.error(`任务 ${taskId} 异常: ${err.message}`);
    task.status = 'error';
    task.error = err.message || '未知错误';
    safeSendProgress(task);
  });

  return taskId;
}

/**
 * 执行转移主流程
 */
async function runTransfer(task) {
  // ── Step 1: 扫描源目录 ──
  task.status = 'scanning';
  safeSendProgress(task);
  logger.info(`[${task.id}] 扫描源目录: ${task.sourcePath}`);

  let scan;
  try {
    scan = await scanDir(task.sourcePath);
    task.totalFiles = scan.count;
    task.totalSize = scan.size;
    logger.info(`[${task.id}] 源目录: ${scan.count} 个文件, ${formatSize(scan.size)}`);
  } catch (e) {
    task.errors.push({ file: task.sourcePath, error: '扫描源目录失败: ' + e.message });
    task.status = 'error';
    safeSendProgress(task);
    return;
  }

  if (task.totalFiles === 0) {
    task.errors.push({ file: task.sourcePath, error: '源目录为空，没有文件可转移' });
    task.status = 'error';
    safeSendProgress(task);
    return;
  }

  if (task.cancelled) {
    task.status = 'cancelled';
    safeSendProgress(task);
    return;
  }

  // ── Step 2: 覆盖模式 - 删除已有目标 ──
  if (task.overwrite && fs.existsSync(task.targetPath)) {
    task.status = 'preparing';
    safeSendProgress(task);
    logger.info(`[${task.id}] 删除已有目标: ${task.targetPath}`);

    const deleted = await deleteDirectory(task.targetPath);
    if (!deleted && fs.existsSync(task.targetPath)) {
      const folderName = path.basename(task.targetPath);
      task.errors.push({
        file: task.targetPath,
        error: `无法删除目标文件夹 "${folderName}"，请手动删除后重试，或关闭可能锁定文件的程序（如 Minecraft、文件管理器）`,
      });
      task.status = 'error';
      safeSendProgress(task);
      return;
    }
  }

  if (task.cancelled) {
    task.status = 'cancelled';
    safeSendProgress(task);
    return;
  }

  // ── Step 3: 复制文件 ──
  task.status = 'transferring';
  task.startTime = Date.now();
  safeSendProgress(task);
  await sleep(50); // 让 UI 更新

  logger.info(`[${task.id}] 开始复制: ${task.sourcePath} → ${task.targetPath}`);

  try {
    await copyDirRecursive(task.sourcePath, task.targetPath, (srcFile) => {
      if (task.cancelled) return;

      task.copiedFiles++;
      try {
        task.copiedSize += fs.statSync(srcFile).size;
      } catch (_) { /* ignore */ }

      // 每 10 个文件或 200ms 报告一次进度
      const now = Date.now();
      if (task.copiedFiles % 10 === 0 || now - task.lastProgressTime > 200) {
        safeSendProgress(task);
        task.lastProgressTime = now;
      }
    });
  } catch (e) {
    logger.error(`[${task.id}] 复制失败: ${e.message}`);
    task.errors.push({
      file: task.targetPath,
      error: `复制文件失败: ${e.message}`,
    });
    task.status = 'error';
    safeSendProgress(task);
    return;
  }

  if (task.cancelled) {
    // 清理已复制的部分
    logger.info(`[${task.id}] 取消，清理目标`);
    await deleteDirectory(task.targetPath);
    task.status = 'cancelled';
    safeSendProgress(task);
    return;
  }

  // ── Step 4: 验证结果 ──
  try {
    const targetScan = await scanDir(task.targetPath);
    logger.info(`[${task.id}] 验证: 源 ${task.totalFiles} 文件, 目标 ${targetScan.count} 文件`);
    if (targetScan.count < task.totalFiles) {
      task.errors.push({
        file: task.targetPath,
        error: `文件数不一致: 源 ${task.totalFiles} 个, 目标 ${targetScan.count} 个`,
      });
    }
    task.copiedFiles = targetScan.count;
    task.copiedSize = targetScan.size;
  } catch (e) {
    logger.warn(`[${task.id}] 验证失败: ${e.message}`);
    task.errors.push({ file: task.targetPath, error: '验证失败: ' + e.message });
  }

  // ── Step 5: 移动模式 - 删除源 ──
  if (task.mode === 'move' && task.errors.length === 0) {
    logger.info(`[${task.id}] 移动模式，删除源目录`);
    const deleted = await deleteDirectory(task.sourcePath);
    if (!deleted) {
      task.errors.push({
        file: task.sourcePath,
        error: '数据已复制成功，但无法删除源目录。你可以手动删除',
      });
    }
  }

  // ── 完成 ──
  task.status = task.errors.length > 0 ? 'error' : 'complete';
  safeSendProgress(task);
  logger.info(`[${task.id}] ${task.status}: ${task.copiedFiles}/${task.totalFiles} 文件`);
}

/**
 * 安全发送进度（不会因为 response 关闭而崩溃）
 */
function safeSendProgress(task) {
  if (!task.onProgress) return;
  try {
    const elapsed = (Date.now() - task.startTime) / 1000;
    const speed = elapsed > 0 ? task.copiedSize / elapsed : 0;
    const percent = task.totalFiles > 0 ? Math.round((task.copiedFiles / task.totalFiles) * 100) : 0;

    task.onProgress({
      type: task.status === 'complete' ? 'complete' :
            task.status === 'cancelled' ? 'cancelled' :
            task.status === 'error' ? 'error' : 'progress',
      current: Math.min(task.copiedFiles, task.totalFiles),
      total: task.totalFiles,
      percent: Math.min(percent, 100),
      copiedSize: task.copiedSize,
      totalSize: task.totalSize,
      copiedSizeFormatted: formatSize(task.copiedSize),
      totalSizeFormatted: formatSize(task.totalSize),
      speed,
      speedFormatted: formatSize(speed) + '/s',
      elapsed,
      errors: task.errors,
      mode: task.mode,
    });
  } catch (e) {
    logger.warn(`[${task.id}] 发送进度失败: ${e.message}`);
  }
}

function cancelTransfer(taskId) {
  const task = tasks.get(taskId);
  if (!task) return false;
  task.cancelled = true;
  task.status = 'cancelling';
  logger.info(`[${taskId}] 取消请求`);
  return true;
}

function getTask(taskId) {
  return tasks.get(taskId);
}

module.exports = {
  startTransfer,
  cancelTransfer,
  getTask,
};
