'use strict';

const fs = require('fs');
const path = require('path');
const url = require('url');
const config = require('./config');
const logger = require('./utils/logger');
const { success, error, sendJson, sendSseHeaders, sendSseData } = require('./utils/response');
const { hasTraversal } = require('./utils/path-helpers');

// Static assets (inlined via esbuild text loader in SEA mode)
const { STATIC_ASSETS } = require('./static-assets');

// Services
const pcl2Detector = require('./services/pcl2-detector');
const clientScanner = require('./services/client-scanner');
const jmScanner = require('./services/jm-scanner');
const nbtReader = require('./services/nbt-reader');
const transferEngine = require('./services/transfer-engine');

// SSE connections for transfer progress
const sseConnections = new Map();

/**
 * Parse request body as JSON
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Get query parameter from URL
 */
function getQuery(req, name) {
  const parsed = url.parse(req.url, true);
  return parsed.query[name];
}

/**
 * Route handler
 */
async function route(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API routes
  if (pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, pathname, method);
    } catch (e) {
      logger.error(`API error: ${e.message}`);
      sendJson(res, 500, error('INTERNAL_ERROR', e.message));
    }
    return;
  }

  // Static files
  await handleStatic(req, res, pathname);
}

/**
 * Handle API requests
 */
async function handleApi(req, res, pathname, method) {
  // GET /api/pcl2/detect
  if (pathname === '/api/pcl2/detect' && method === 'GET') {
    const customRoot = getQuery(req, 'rootPath');
    const result = pcl2Detector.detect(customRoot);
    sendJson(res, 200, success(result));
    return;
  }

  // POST /api/pcl2/select
  if (pathname === '/api/pcl2/select' && method === 'POST') {
    const body = await parseBody(req);
    if (!body.rootPath) {
      sendJson(res, 400, error('MISSING_PARAM', 'rootPath is required'));
      return;
    }
    const result = pcl2Detector.detect(body.rootPath);
    sendJson(res, 200, success(result));
    return;
  }

  // GET /api/clients
  if (pathname === '/api/clients' && method === 'GET') {
    const pcl2Root = getQuery(req, 'pcl2Root');
    if (!pcl2Root) {
      sendJson(res, 400, error('MISSING_PARAM', 'pcl2Root is required'));
      return;
    }
    const detectResult = pcl2Detector.detect(pcl2Root);
    const folders = clientScanner.scanFolders(pcl2Root, detectResult.knownFolders, detectResult.setupConfig);
    sendJson(res, 200, success({ folders }));
    return;
  }

  // GET /api/journeymap/servers
  if (pathname === '/api/journeymap/servers' && method === 'GET') {
    const versionPath = getQuery(req, 'versionPath');
    if (!versionPath) {
      sendJson(res, 400, error('MISSING_PARAM', 'versionPath is required'));
      return;
    }
    if (hasTraversal(versionPath)) {
      sendJson(res, 400, error('INVALID_PATH', 'Path traversal detected'));
      return;
    }
    const servers = jmScanner.listServers(versionPath);
    sendJson(res, 200, success(servers));
    return;
  }

  // GET /api/servers-dat
  if (pathname === '/api/servers-dat' && method === 'GET') {
    const versionPath = getQuery(req, 'versionPath');
    if (!versionPath) {
      sendJson(res, 400, error('MISSING_PARAM', 'versionPath is required'));
      return;
    }
    if (hasTraversal(versionPath)) {
      sendJson(res, 400, error('INVALID_PATH', 'Path traversal detected'));
      return;
    }
    const servers = await nbtReader.readServersDat(versionPath);
    sendJson(res, 200, success(servers));
    return;
  }

  // GET /api/minecraft/running
  if (pathname === '/api/minecraft/running' && method === 'GET') {
    const { execSync } = require('child_process');
    let running = false;
    let pids = [];
    try {
      const output = execSync('tasklist /FI "IMAGENAME eq javaw.exe" /FO CSV /NH', {
        encoding: 'utf-8',
        timeout: 5000,
      });
      const lines = output.trim().split('\n').filter(l => l.trim() && !l.includes('INFO:'));
      for (const line of lines) {
        const match = line.match(/"javaw\.exe","(\d+)"/i);
        if (match) pids.push(match[1]);
      }
    } catch (e) { /* ignore */ }
    try {
      const output = execSync('tasklist /FI "IMAGENAME eq java.exe" /FO CSV /NH', {
        encoding: 'utf-8',
        timeout: 5000,
      });
      const lines = output.trim().split('\n').filter(l => l.trim() && !l.includes('INFO:'));
      for (const line of lines) {
        const match = line.match(/"java\.exe","(\d+)"/i);
        if (match) pids.push(match[1]);
      }
    } catch (e) { /* ignore */ }
    running = pids.length > 0;
    sendJson(res, 200, success({ running, pids }));
    return;
  }

  // POST /api/transfer
  if (pathname === '/api/transfer' && method === 'POST') {
    let body;
    try {
      body = await parseBody(req);
    } catch (e) {
      sendJson(res, 400, error('INVALID_BODY', '请求数据格式错误'));
      return;
    }
    if (!body.sourcePath || !body.targetPath) {
      sendJson(res, 400, error('MISSING_PARAM', '缺少 sourcePath 或 targetPath'));
      return;
    }

    // SSE response
    sendSseHeaders(res);
    const connectionId = 'conn_' + Date.now();
    sseConnections.set(connectionId, res);

    let ended = false;
    const safeEnd = () => {
      if (ended) return;
      ended = true;
      setTimeout(() => {
        try {
          if (!res.writableEnded) res.end();
        } catch (_) { /* ignore */ }
        sseConnections.delete(connectionId);
      }, 300);
    };

    try {
      const taskId = transferEngine.startTransfer(body, (progress) => {
        // 确保 progress 有 type 字段
        if (!progress || !progress.type) {
          progress = { type: 'progress', ...progress };
        }
        const ok = sendSseData(res, progress);
        if (!ok) {
          logger.warn(`SSE 写入失败 (conn ${connectionId})，客户端可能已断开`);
        }
        if (progress.type === 'complete' || progress.type === 'error' || progress.type === 'cancelled') {
          safeEnd();
        }
      });

      sendSseData(res, { type: 'started', taskId });
    } catch (e) {
      logger.error(`转移启动失败: ${e.message}`);
      const errMsg = e.message || '转移启动失败，请检查路径是否正确';
      sendSseData(res, { type: 'error', message: errMsg });
      safeEnd();
    }

    req.on('close', () => {
      sseConnections.delete(connectionId);
    });
    req.on('error', (e) => {
      logger.warn(`请求错误: ${e.message}`);
      safeEnd();
    });
    return;
  }

  // POST /api/transfer/cancel
  if (pathname === '/api/transfer/cancel' && method === 'POST') {
    const body = await parseBody(req);
    if (!body.taskId) {
      sendJson(res, 400, error('MISSING_PARAM', 'taskId is required'));
      return;
    }
    const cancelled = transferEngine.cancelTransfer(body.taskId);
    sendJson(res, 200, success({ cancelled }));
    return;
  }

  // 404
  sendJson(res, 404, error('NOT_FOUND', `API endpoint not found: ${pathname}`));
}

/**
 * Serve static files
 */
async function handleStatic(req, res, pathname) {
  // 1. 优先从内存中的 STATIC_ASSETS 查找（SEA 模式 / esbuild 打包后）
  const normalizedPath = pathname === '/' ? '/index.html' : pathname;
  if (STATIC_ASSETS[normalizedPath] !== undefined) {
    serveInlineContent(res, normalizedPath, STATIC_ASSETS[normalizedPath]);
    return;
  }

  // 2. Fallback 到文件系统（开发模式）
  let filePath = path.join(config.PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Prevent path traversal
  if (!filePath.startsWith(config.PUBLIC_DIR)) {
    sendJson(res, 403, error('FORBIDDEN', 'Access denied'));
    return;
  }

  // Check if file exists
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Try index.html for SPA-like behavior
      filePath = path.join(config.PUBLIC_DIR, 'index.html');
      fs.stat(filePath, (err2, stats2) => {
        if (err2 || !stats2.isFile()) {
          sendJson(res, 404, error('NOT_FOUND', 'File not found'));
          return;
        }
        serveFile(res, filePath);
      });
      return;
    }
    serveFile(res, filePath);
  });
}

/**
 * Serve in-memory static content (from esbuild bundle)
 */
function serveInlineContent(res, urlPath, content) {
  const ext = path.extname(urlPath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
  };
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  const buf = Buffer.from(content, 'utf-8');
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': buf.length,
    'Cache-Control': 'no-cache',
  });
  res.end(buf);
}

/**
 * Serve a file with correct MIME type (filesystem fallback)
 */
function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 500, error('READ_ERROR', 'Failed to read file'));
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

module.exports = { route };
