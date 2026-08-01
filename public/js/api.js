/**
 * API Client - handles all backend communication
 */
const API = {
  /**
   * Detect PCL2 launcher
   */
  async detectPcl2(rootPath) {
    const url = rootPath
      ? `/api/pcl2/detect?rootPath=${encodeURIComponent(rootPath)}`
      : '/api/pcl2/detect';
    const res = await fetch(url);
    return res.json();
  },

  /**
   * Manually select PCL2 root
   */
  async selectPcl2(rootPath) {
    const res = await fetch('/api/pcl2/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rootPath }),
    });
    return res.json();
  },

  /**
   * Scan clients (folders + versions)
   */
  async getClients(pcl2Root) {
    const res = await fetch(`/api/clients?pcl2Root=${encodeURIComponent(pcl2Root)}`);
    return res.json();
  },

  /**
   * Get JourneyMap server folders
   */
  async getJmServers(versionPath) {
    const res = await fetch(`/api/journeymap/servers?versionPath=${encodeURIComponent(versionPath)}`);
    return res.json();
  },

  /**
   * Get servers.dat data
   */
  async getServersDat(versionPath) {
    const res = await fetch(`/api/servers-dat?versionPath=${encodeURIComponent(versionPath)}`);
    return res.json();
  },

  /**
   * Check if Minecraft is running
   */
  async checkMinecraftRunning() {
    const res = await fetch('/api/minecraft/running');
    return res.json();
  },

  /**
   * Start transfer with SSE progress
   * @param {object} params - { sourcePath, targetPath, mode, overwrite }
   * @param {function} onProgress - callback for progress events
   * @returns {function} cancel function
   */
  startTransfer(params, onProgress) {
    const controller = new AbortController();
    let finished = false; // 标记是否已通过 SSE 收到终态事件

    fetch('/api/transfer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(params),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) {
        let errMsg = '服务器返回错误 (HTTP ' + response.status + ')';
        try {
          const errData = await response.json();
          if (errData.error && errData.error.message) {
            errMsg = errData.error.message;
          }
        } catch (_) { /* ignore */ }
        onProgress({ type: 'error', message: errMsg });
        finished = true;
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));
                if (!data.type) data.type = 'progress';
                onProgress(data);
                // 收到终态事件后标记完成
                if (data.type === 'complete' || data.type === 'error' || data.type === 'cancelled') {
                  finished = true;
                }
              } catch (e) {
                // skip invalid JSON
              }
            }
          }
        }
      } catch (readErr) {
        // 服务器关闭连接时 reader.read() 可能抛错
        // 如果已经收到终态事件，这是正常的，忽略即可
        if (!finished) {
          throw readErr;
        }
      }
    }).catch((err) => {
      // 已经通过 SSE 完成/出错/取消的，不再重复报告
      if (finished) return;
      if (err.name === 'AbortError') {
        onProgress({ type: 'cancelled', message: '用户取消' });
      } else {
        onProgress({ type: 'error', message: '连接失败: ' + (err.message || '网络错误') });
      }
    });

    return () => {
      controller.abort();
    };
  },

  /**
   * Cancel transfer
   */
  async cancelTransfer(taskId) {
    const res = await fetch('/api/transfer/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId }),
    });
    return res.json();
  },
};
