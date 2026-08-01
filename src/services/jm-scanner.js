'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { getDirSize, countFiles, getLatestMtime, formatSize, formatDate } = require('../utils/path-helpers');
const logger = require('../utils/logger');

/**
 * Scan dimension info within a server folder
 */
function scanDimensions(serverPath) {
  const dimensions = [];
  const knownDims = ['overworld', 'nether', 'the_nether', 'the_end', 'the_end'];

  try {
    const entries = fs.readdirSync(serverPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!knownDims.includes(entry.name)) continue;

      const dimPath = path.join(serverPath, entry.name);
      const dimInfo = {
        name: entry.name,
        displayName: config.JM_DIMENSION_DISPLAY[entry.name] || entry.name,
        chunkCount: 0,
        hasDay: false,
        hasNight: false,
        hasBiome: false,
        hasCache: false,
        size: 0,
      };

      // Check for day/night/biome subdirs
      try {
        const subEntries = fs.readdirSync(dimPath, { withFileTypes: true });
        for (const sub of subEntries) {
          if (sub.isDirectory()) {
            if (sub.name === 'day') {
              dimInfo.hasDay = true;
              dimInfo.chunkCount += countFiles(path.join(dimPath, sub.name));
            } else if (sub.name === 'night') {
              dimInfo.hasNight = true;
            } else if (sub.name === 'biome') {
              dimInfo.hasBiome = true;
            } else if (sub.name === 'chunk_cache') {
              dimInfo.hasCache = true;
            }
          }
        }
      } catch (e) {
        // skip
      }

      dimInfo.size = getDirSize(dimPath);
      dimensions.push(dimInfo);
    }
  } catch (e) {
    // skip
  }

  return dimensions;
}

/**
 * Count waypoints in a server folder
 */
function countWaypoints(serverPath) {
  const waypointPath = path.join(serverPath, 'waypoints');
  if (!fs.existsSync(waypointPath)) return 0;
  return countFiles(waypointPath);
}

/**
 * List all server data folders in JourneyMap data/mp
 * @param {string} versionPath - Path to the Minecraft version folder
 * @returns {Array} - List of server data folders
 */
function listServers(versionPath) {
  const servers = [];
  const jmDataPath = path.join(versionPath, config.JM_DATA_PATH);

  if (!fs.existsSync(jmDataPath)) {
    logger.warn(`JourneyMap data path not found: ${jmDataPath}`);
    return servers;
  }

  try {
    const entries = fs.readdirSync(jmDataPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const serverPath = path.join(jmDataPath, entry.name);
      const totalSize = getDirSize(serverPath);
      const lastModified = getLatestMtime(serverPath);
      const dimensions = scanDimensions(serverPath);
      const waypointCount = countWaypoints(serverPath);
      const fileCount = countFiles(serverPath);

      servers.push({
        folderName: entry.name,
        fullPath: serverPath,
        lastModified: lastModified,
        lastModifiedFormatted: formatDate(lastModified),
        totalSize: totalSize,
        totalSizeFormatted: formatSize(totalSize),
        fileCount: fileCount,
        dimensions: dimensions,
        waypointCount: waypointCount,
      });
    }
  } catch (e) {
    logger.error(`Failed to scan JourneyMap servers: ${e.message}`);
  }

  // Sort by last modified (newest first)
  servers.sort((a, b) => b.lastModified - a.lastModified);

  logger.info(`Found ${servers.length} JourneyMap server folders`);
  return servers;
}

module.exports = {
  listServers,
  scanDimensions,
};
