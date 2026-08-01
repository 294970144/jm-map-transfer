'use strict';

const path = require('path');

module.exports = {
  // Server
  PORT: 8090,
  HOST: '127.0.0.1',

  // PCL2
  PCL2_DEFAULT_ROOT: 'E:\\mc\\pcl2',
  PCL2_EXE_NAMES: ['Plain Craft Launcher 2.exe', 'Plain Craft Launcher.exe', 'PCL2.exe'],
  PCL2_SETUP_INI: 'PCL\\Setup.ini',
  PCL2_LOG_DIR: 'PCL',
  PCL2_LOG_FILES: ['Log1.txt', 'Log2.txt', 'Log3.txt', 'Log4.txt', 'Log5.txt'],
  PCL2_LOG_FOLDER_PATTERN: /有效的 Minecraft 文件夹：(.+?) > (.+)/,

  // Minecraft
  MC_PCL_INI: 'PCL.ini',
  MC_VERSIONS_DIR: 'versions',
  MC_SERVERS_DAT: 'servers.dat',

  // JourneyMap
  JM_DATA_PATH: path.join('journeymap', 'data', 'mp'),
  JM_DIMENSIONS: ['overworld', 'nether', 'the_nether', 'the_end'],
  JM_DIMENSION_DISPLAY: {
    'overworld': 'Overworld',
    'nether': 'Nether',
    'the_nether': 'Nether',
    'the_end': 'The End',
  },

  // Transfer
  TRANSFER_CONCURRENCY: 4,
  MAX_FILE_SIZE: 500 * 1024 * 1024, // 500MB

  // Paths
  PUBLIC_DIR: path.join(__dirname, '..', 'public'),
};
