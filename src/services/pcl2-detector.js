'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Parse PCL2 Setup.ini file (Key:Value format)
 */
function parseSetupIni(iniPath) {
  const result = {};
  try {
    const content = fs.readFileSync(iniPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) continue;
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) continue;
      const key = trimmed.substring(0, colonIdx).trim();
      const value = trimmed.substring(colonIdx + 1).trim();
      result[key] = value;
    }
  } catch (e) {
    // file not found or unreadable
  }
  return result;
}

/**
 * Resolve PCL2 path with $ prefix (relative to PCL2 root)
 */
function resolvePcl2Path(pcl2Root, pclPath) {
  if (!pclPath) return null;
  if (pclPath.startsWith('$')) {
    return path.join(pcl2Root, pclPath.substring(1));
  }
  return pclPath;
}

/**
 * Parse known folders from PCL2 log files
 * Pattern: "有效的 Minecraft 文件夹：{name} > {path}"
 */
function parseFoldersFromLogs(pcl2Root) {
  const folders = [];
  const seen = new Set();
  const logDir = path.join(pcl2Root, config.PCL2_LOG_DIR);

  for (const logFile of config.PCL2_LOG_FILES) {
    const logPath = path.join(logDir, logFile);
    try {
      if (!fs.existsSync(logPath)) continue;
      const content = fs.readFileSync(logPath, 'utf-8');
      for (const line of content.split('\n')) {
        const match = line.match(config.PCL2_LOG_FOLDER_PATTERN);
        if (match) {
          const name = match[1].trim();
          const folderPath = match[2].trim();
          const key = folderPath.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            folders.push({ name, path: folderPath });
          }
        }
      }
    } catch (e) {
      // skip unreadable logs
    }
  }

  return folders;
}

/**
 * Check if PCL2 is running and get its process path
 */
function checkRunning() {
  try {
    const output = execSync('tasklist /FI "IMAGENAME eq Plain Craft Launcher 2.exe" /FO CSV /NH', {
      encoding: 'utf-8',
      timeout: 5000,
    });
    if (output.includes('Plain Craft Launcher 2.exe') || output.includes('Plain Craft Launcher')) {
      // Try to get process path via wmic
      try {
        const wmicOutput = execSync(
          'wmic process where "name like \'%Plain Craft Launcher%\'" get ExecutablePath /FORMAT:CSV',
          { encoding: 'utf-8', timeout: 5000 }
        );
        const lines = wmicOutput.trim().split('\n').filter(l => l.trim() && !l.includes('ExecutablePath'));
        if (lines.length > 0) {
          const procPath = lines[0].split(',').pop().trim();
          if (procPath) {
            return { running: true, processPath: procPath };
          }
        }
      } catch (e) {
        // wmic might fail, continue
      }
      return { running: true, processPath: null };
    }
  } catch (e) {
    // tasklist might fail
  }
  return { running: false, processPath: null };
}

/**
 * Detect PCL2 launcher
 */
function detect(customRoot) {
  const rootPath = customRoot || config.PCL2_DEFAULT_ROOT;
  logger.info(`Detecting PCL2 at: ${rootPath}`);

  // Check if root exists
  if (!fs.existsSync(rootPath)) {
    logger.warn(`PCL2 root not found: ${rootPath}`);
    return {
      running: false,
      processPath: null,
      rootPath: rootPath,
      setupConfig: {},
      knownFolders: [],
      found: false,
    };
  }

  // Check running process
  const running = checkRunning();

  // Parse Setup.ini
  const setupIniPath = path.join(rootPath, config.PCL2_SETUP_INI);
  const setupConfig = parseSetupIni(setupIniPath);

  // Parse known folders from logs
  const knownFolders = parseFoldersFromLogs(rootPath);

  logger.info(`PCL2 detected: running=${running.running}, folders=${knownFolders.length}`);

  return {
    running: running.running,
    processPath: running.processPath,
    rootPath: rootPath,
    setupConfig: setupConfig,
    knownFolders: knownFolders,
    found: true,
  };
}

module.exports = {
  detect,
  parseSetupIni,
  resolvePcl2Path,
  parseFoldersFromLogs,
};
