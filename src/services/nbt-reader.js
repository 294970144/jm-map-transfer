'use strict';

const fs = require('fs');
const path = require('path');
const nbt = require('prismarine-nbt');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Read and parse servers.dat (NBT format) to extract server list
 * @param {string} versionPath - Path to the Minecraft version folder
 * @returns {Array} - List of servers with name, address, and index
 */
async function readServersDat(versionPath) {
  const serversDatPath = path.join(versionPath, config.MC_SERVERS_DAT);

  if (!fs.existsSync(serversDatPath)) {
    logger.warn(`servers.dat not found: ${serversDatPath}`);
    return [];
  }

  try {
    const data = fs.readFileSync(serversDatPath);

    const parsed = await nbt.parse(data, 'big');
    const root = parsed.parsed;

    // Navigate NBT structure: root -> servers (list) -> entries with name/ip
    let servers = [];

    // Try to get the servers list from the NBT data
    const serversList = nbt.simplify(root).servers;

    if (serversList && Array.isArray(serversList)) {
      servers = serversList.map((server, index) => ({
        name: server.name || `Server ${index + 1}`,
        address: server.ip || '',
        index: index,
      }));
    }

    logger.info(`Parsed ${servers.length} servers from servers.dat`);
    return servers;
  } catch (e) {
    logger.error(`Failed to parse servers.dat: ${e.message}`);

    // Fallback: try to extract server info with basic NBT parsing
    try {
      const servers = fallbackParseServersDat(serversDatPath);
      logger.info(`Fallback parsed ${servers.length} servers from servers.dat`);
      return servers;
    } catch (e2) {
      logger.error(`Fallback parse also failed: ${e2.message}`);
      return [];
    }
  }
}

/**
 * Fallback NBT parser for servers.dat
 * Extracts server names and IPs by scanning for NBT string patterns
 */
function fallbackParseServersDat(filePath) {
  const data = fs.readFileSync(filePath);
  const servers = [];

  // NBT format: strings are stored as 2-byte length + UTF-8 bytes
  // We look for patterns: "name" followed by a string, "ip" followed by a string
  const namePattern = Buffer.from([0x04, 0x6e, 0x61, 0x6d, 0x65]); // "name" tag
  const ipPattern = Buffer.from([0x02, 0x69, 0x70]); // "ip" tag

  let offset = 0;
  while (offset < data.length) {
    // Find next "name" tag
    const nameIdx = findPattern(data, namePattern, offset);
    if (nameIdx === -1) break;

    // Read the name string (2-byte length + string)
    const nameLen = data.readUInt16BE(nameIdx + namePattern.length);
    const name = data.toString('utf-8', nameIdx + namePattern.length + 2, nameIdx + namePattern.length + 2 + nameLen);

    // Find "ip" tag after name
    const ipIdx = findPattern(data, ipPattern, nameIdx + namePattern.length);
    if (ipIdx === -1 || ipIdx > nameIdx + 200) {
      // No IP found, just add name
      servers.push({ name: name, address: '', index: servers.length });
      offset = nameIdx + namePattern.length;
      continue;
    }

    const ipLen = data.readUInt16BE(ipIdx + ipPattern.length);
    const ip = data.toString('utf-8', ipIdx + ipPattern.length + 2, ipIdx + ipPattern.length + 2 + ipLen);

    servers.push({ name: name, address: ip, index: servers.length });
    offset = ipIdx + ipPattern.length + 2 + ipLen;
  }

  return servers;
}

function findPattern(data, pattern, start) {
  for (let i = start; i <= data.length - pattern.length; i++) {
    let found = true;
    for (let j = 0; j < pattern.length; j++) {
      if (data[i + j] !== pattern[j]) {
        found = false;
        break;
      }
    }
    if (found) return i;
  }
  return -1;
}

module.exports = {
  readServersDat,
};
