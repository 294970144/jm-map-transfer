'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Check if a path is safe (no directory traversal outside base)
 */
function isPathSafe(targetPath, basePath) {
  const resolved = path.resolve(targetPath);
  const base = path.resolve(basePath);
  return resolved.startsWith(base + path.sep) || resolved === base;
}

/**
 * Check if a path contains .. traversal
 */
function hasTraversal(inputPath) {
  return inputPath.includes('..');
}

/**
 * Recursively calculate directory size
 */
function getDirSize(dirPath) {
  let totalSize = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        totalSize += getDirSize(fullPath);
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          totalSize += stat.size;
        } catch (e) {
          // skip files we can't stat
        }
      }
    }
  } catch (e) {
    // return 0 if we can't read
  }
  return totalSize;
}

/**
 * Count files in a directory recursively
 */
function countFiles(dirPath) {
  let count = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        count += countFiles(fullPath);
      } else if (entry.isFile()) {
        count++;
      }
    }
  } catch (e) {
    // return 0
  }
  return count;
}

/**
 * Format bytes to human readable
 */
function formatSize(bytes) {
  if (bytes === 0 || isNaN(bytes)) return '0 B';
  if (bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const clampedI = Math.min(i, units.length - 1);
  return (bytes / Math.pow(1024, clampedI)).toFixed(1) + ' ' + units[clampedI];
}

/**
 * Format date to readable string
 */
function formatDate(date) {
  if (!date) return 'Unknown';
  const d = new Date(date);
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get latest modification time in a directory tree
 */
function getLatestMtime(dirPath) {
  let latest = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const subLatest = getLatestMtime(fullPath);
        if (subLatest > latest) latest = subLatest;
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          if (stat.mtimeMs > latest) latest = stat.mtimeMs;
        } catch (e) {
          // skip
        }
      }
    }
    const dirStat = fs.statSync(dirPath);
    if (dirStat.mtimeMs > latest) latest = dirStat.mtimeMs;
  } catch (e) {
    // return 0
  }
  return latest;
}

module.exports = {
  isPathSafe,
  hasTraversal,
  getDirSize,
  countFiles,
  formatSize,
  formatDate,
  getLatestMtime,
};
