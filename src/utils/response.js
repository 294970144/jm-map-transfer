'use strict';

function success(data) {
  return {
    success: true,
    data: data,
    timestamp: new Date().toISOString(),
  };
}

function error(code, message) {
  return {
    success: false,
    error: { code, message },
    timestamp: new Date().toISOString(),
  };
}

function sendJson(res, statusCode, body) {
  const json = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

function sendSseHeaders(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
}

function sendSseData(res, data) {
  if (res.writableEnded || res.destroyed) return false;
  try {
    return res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (e) {
    return false;
  }
}

module.exports = {
  success,
  error,
  sendJson,
  sendSseHeaders,
  sendSseData,
};
