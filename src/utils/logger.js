'use strict';

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

function timestamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

module.exports = {
  info(msg) {
    console.log(`${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.blue}[INFO]${COLORS.reset} ${msg}`);
  },
  success(msg) {
    console.log(`${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.green}[OK]${COLORS.reset} ${msg}`);
  },
  warn(msg) {
    console.log(`${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.yellow}[WARN]${COLORS.reset} ${msg}`);
  },
  error(msg) {
    console.log(`${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.red}[ERROR]${COLORS.reset} ${msg}`);
  },
};
