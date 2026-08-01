'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { resolvePcl2Path } = require('./pcl2-detector');
const logger = require('../utils/logger');

/**
 * Scan all Minecraft folders (first layer of PCL2 version selection)
 * @param {string} pcl2Root - PCL2 root path
 * @param {Array} knownFolders - Folders parsed from PCL2 logs
 * @param {object} setupConfig - Parsed Setup.ini config
 * @returns {Array} - List of folders with versions
 */
function scanFolders(pcl2Root, knownFolders, setupConfig) {
  const folders = [];
  const seenPaths = new Set();

  // Get the selected folder from Setup.ini
  let selectedFolderPath = null;
  if (setupConfig && setupConfig.LaunchFolderSelect) {
    selectedFolderPath = resolvePcl2Path(pcl2Root, setupConfig.LaunchFolderSelect);
    // Normalize: remove trailing backslash for comparison
    if (selectedFolderPath) {
      selectedFolderPath = path.resolve(selectedFolderPath);
    }
  }

  // 1. Add folders from PCL2 logs (most reliable)
  for (const f of knownFolders) {
    const folderPath = path.resolve(f.path);
    if (!fs.existsSync(folderPath)) continue;
    const key = folderPath.toLowerCase();
    if (seenPaths.has(key)) continue;
    seenPaths.add(key);

    folders.push({
      folderName: f.name,
      folderPath: folderPath,
      isSelected: selectedFolderPath ? folderPath.toLowerCase() === selectedFolderPath.toLowerCase() : false,
      versions: [],
    });
  }

  // 2. Supplement with filesystem scan: PCL2 root .minecraft
  const rootMinecraft = path.join(pcl2Root, '.minecraft');
  if (fs.existsSync(rootMinecraft)) {
    const key = path.resolve(rootMinecraft).toLowerCase();
    if (!seenPaths.has(key)) {
      seenPaths.add(key);
      folders.push({
        folderName: '当前文件夹',
        folderPath: path.resolve(rootMinecraft),
        isSelected: selectedFolderPath ? path.resolve(rootMinecraft).toLowerCase() === selectedFolderPath.toLowerCase() : false,
        versions: [],
      });
    }
  }

  // 3. Scan subdirectories of PCL2 root for .minecraft folders
  try {
    const entries = fs.readdirSync(pcl2Root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const subMinecraft = path.join(pcl2Root, entry.name, '.minecraft');
      if (fs.existsSync(subMinecraft)) {
        const key = path.resolve(subMinecraft).toLowerCase();
        if (!seenPaths.has(key)) {
          seenPaths.add(key);
          folders.push({
            folderName: entry.name,
            folderPath: path.resolve(subMinecraft),
            isSelected: false,
            versions: [],
          });
        }
      }
    }
  } catch (e) {
    // skip
  }

  // 4. Add Setup.ini LaunchFolderSelect if not already included
  if (selectedFolderPath && fs.existsSync(selectedFolderPath)) {
    const key = path.resolve(selectedFolderPath).toLowerCase();
    if (!seenPaths.has(key)) {
      seenPaths.add(key);
      // Try to extract folder name from path
      const parentDir = path.basename(path.dirname(selectedFolderPath));
      folders.push({
        folderName: parentDir || 'Custom',
        folderPath: path.resolve(selectedFolderPath),
        isSelected: true,
        versions: [],
      });
    }
  }

  // Scan versions for each folder
  for (const folder of folders) {
    folder.versions = scanVersions(folder.folderPath);
  }

  logger.info(`Scanned ${folders.length} folders`);
  return folders;
}

/**
 * Scan versions in a .minecraft folder (second layer)
 * @param {string} folderPath - Path to .minecraft folder
 * @returns {Array} - List of versions
 */
function scanVersions(folderPath) {
  const versions = [];
  const versionsDir = path.join(folderPath, config.MC_VERSIONS_DIR);

  if (!fs.existsSync(versionsDir)) {
    return versions;
  }

  // Read PCL.ini for selected version
  const pclIniPath = path.join(folderPath, config.MC_PCL_INI);
  let selectedVersion = null;
  try {
    const content = fs.readFileSync(pclIniPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('Version:')) {
        selectedVersion = trimmed.substring('Version:'.length).trim();
        break;
      }
    }
  } catch (e) {
    // PCL.ini not found
  }

  // Scan versions directory
  try {
    const entries = fs.readdirSync(versionsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const versionName = entry.name;
      const versionPath = path.join(versionsDir, versionName);

      // Check if it's a valid version (has <name>.json)
      const jsonFile = path.join(versionPath, versionName + '.json');
      if (!fs.existsSync(jsonFile)) continue;

      // Check for JourneyMap data
      const jmDataPath = path.join(versionPath, config.JM_DATA_PATH);
      const hasJourneyMap = fs.existsSync(jmDataPath);

      // Check for servers.dat
      const serversDatPath = path.join(versionPath, config.MC_SERVERS_DAT);
      const hasServersDat = fs.existsSync(serversDatPath);

      versions.push({
        name: versionName,
        path: versionPath,
        isSelected: selectedVersion === versionName,
        hasJourneyMap: hasJourneyMap,
        hasServersDat: hasServersDat,
      });
    }
  } catch (e) {
    // versions dir not readable
  }

  // Sort: selected first, then hasJourneyMap, then alphabetical
  versions.sort((a, b) => {
    if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1;
    if (a.hasJourneyMap !== b.hasJourneyMap) return a.hasJourneyMap ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return versions;
}

module.exports = {
  scanFolders,
  scanVersions,
};
