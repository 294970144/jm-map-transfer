'use strict';

const http = require('http');
const { exec } = require('child_process');
const config = require('./config');
const logger = require('./utils/logger');
const { route } = require('./router');

const server = http.createServer((req, res) => {
  route(req, res);
});

server.listen(config.PORT, config.HOST, () => {
  logger.success('========================================');
  logger.success('  JourneyMap Map Transfer Tool');
  logger.success('========================================');
  logger.success(`Server running at http://${config.HOST}:${config.PORT}`);
  logger.info(`PCL2 default root: ${config.PCL2_DEFAULT_ROOT}`);
  logger.info('Press Ctrl+C to stop');
  logger.success('========================================');

  // 自动打开浏览器（SEA/exe 模式或 --open 参数）
  const shouldOpen = process.env.JM_SEA_MODE === '1' ||
    process.argv.includes('--open') || process.argv.includes('-o');
  if (shouldOpen) {
    const url = `http://${config.HOST}:${config.PORT}`;
    exec(`start ${url}`, (err) => {
      if (err) logger.warn(`无法打开浏览器: ${err.message}`);
      else logger.info(`浏览器已打开: ${url}`);
    });
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${config.PORT} is already in use!`);
    logger.info('Please close the other application or change the port in src/config.js');
  } else {
    logger.error(`Server error: ${err.message}`);
  }
  process.exit(1);
});

process.on('SIGINT', () => {
  logger.info('Shutting down server...');
  server.close(() => {
    logger.success('Server stopped.');
    process.exit(0);
  });
});
