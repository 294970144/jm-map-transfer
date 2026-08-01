/**
 * App Controller - 4-step wizard state machine
 */
const App = {
  // State
  state: {
    currentStep: 1,
    pcl2Root: null,
    pcl2Data: null,
    folders: [],
    selectedFolder: null,
    selectedVersion: null,
    jmServers: [],
    serversDat: [],
    selectedSource: null,
    selectedTarget: null,
    transferMode: 'copy',
    cancelFn: null,
  },

  /**
   * Initialize the app
   */
  init() {
    UI.initParticles();
    this.bindEvents();
    this.runStep1();
  },

  /**
   * Bind all event listeners
   */
  bindEvents() {
    // Step 1
    document.getElementById('step1Next').addEventListener('click', () => this.goToStep(2));
    document.getElementById('manualDetectBtn').addEventListener('click', () => this.manualDetect());

    // Step 2
    document.getElementById('step2Back').addEventListener('click', () => this.goToStep(1));
    document.getElementById('step2Next').addEventListener('click', () => this.goToStep(3));

    // Step 3
    document.getElementById('step3Back').addEventListener('click', () => this.goToStep(2));
    document.getElementById('step3Next').addEventListener('click', () => this.goToStep(4));

    // Step 4
    document.getElementById('step4Back').addEventListener('click', () => this.goToStep(3));
    document.getElementById('startTransferBtn').addEventListener('click', () => this.executeTransfer());
    document.getElementById('cancelTransferBtn').addEventListener('click', () => this.cancelTransfer());

    // Target tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
    });

    // Custom target
    document.getElementById('customTargetBtn').addEventListener('click', () => this.confirmCustomTarget());
  },

  // ==================== Step Navigation ====================

  goToStep(step) {
    // Update step indicator
    document.querySelectorAll('.step-item').forEach(item => {
      const s = parseInt(item.dataset.step);
      item.classList.remove('active', 'completed');
      if (s === step) item.classList.add('active');
      else if (s < step) item.classList.add('completed');
    });

    // Show step section
    document.querySelectorAll('.step-section').forEach(section => {
      section.classList.remove('active');
    });
    document.getElementById(`step${step}`).classList.add('active');

    this.state.currentStep = step;

    // Run step logic (skip step1 re-detection if already detected)
    if (step === 2) this.runStep2();
    else if (step === 3) this.runStep3();
    else if (step === 4) this.runStep4();

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  // ==================== Step 1: PCL2 Detection ====================

  async runStep1() {
    const statusEl = document.getElementById('detectStatus');
    const infoEl = document.getElementById('detectInfo');
    const manualEl = document.getElementById('manualInputGroup');
    const nextBtn = document.getElementById('step1Next');

    statusEl.style.display = 'block';
    infoEl.style.display = 'none';
    manualEl.style.display = 'none';
    nextBtn.disabled = true;

    try {
      const result = await API.detectPcl2();
      if (result.success && result.data.found) {
        this.state.pcl2Root = result.data.rootPath;
        this.state.pcl2Data = result.data;
        this.showDetectInfo(result.data);
        statusEl.style.display = 'none';
        infoEl.style.display = 'block';
        nextBtn.disabled = false;
        UI.toast('PCL2 检测成功', 'success');
      } else {
        statusEl.innerHTML = '<p class="loading-text">未检测到 PCL2，请手动输入路径</p>';
        manualEl.style.display = 'block';
        document.getElementById('pcl2RootInput').value = 'E:\\mc\\pcl2';
      }
    } catch (e) {
      statusEl.innerHTML = '<p class="loading-text">检测失败，请手动输入路径</p>';
      manualEl.style.display = 'block';
      document.getElementById('pcl2RootInput').value = 'E:\\mc\\pcl2';
    }
  },

  showDetectInfo(data) {
    const infoEl = document.getElementById('detectInfo');
    const runningHtml = data.running
      ? '<span class="status-light on"></span><span class="detect-value">运行中</span>'
      : '<span class="status-light off"></span><span class="detect-value">未运行</span>';

    infoEl.innerHTML = `
      <div class="detect-row">
        <span class="detect-label">运行状态:</span>
        ${runningHtml}
      </div>
      <div class="detect-row">
        <span class="detect-label">根路径:</span>
        <span class="detect-value">${UI.escapeHtml(data.rootPath)}</span>
      </div>
      <div class="detect-row">
        <span class="detect-label">已知文件夹:</span>
        <span class="detect-value">${data.knownFolders.length} 个</span>
      </div>
      <div class="detect-row">
        <span class="detect-label">选中文件夹:</span>
        <span class="detect-value">${UI.escapeHtml(data.setupConfig.LaunchFolderSelect || '未设置')}</span>
      </div>
    `;
  },

  async manualDetect() {
    const input = document.getElementById('pcl2RootInput').value.trim();
    if (!input) {
      UI.toast('请输入 PCL2 路径', 'error');
      return;
    }

    const result = await API.detectPcl2(input);
    if (result.success && result.data.found) {
      this.state.pcl2Root = result.data.rootPath;
      this.state.pcl2Data = result.data;
      this.showDetectInfo(result.data);
      document.getElementById('detectStatus').style.display = 'none';
      document.getElementById('detectInfo').style.display = 'block';
      document.getElementById('manualInputGroup').style.display = 'none';
      document.getElementById('step1Next').disabled = false;
      UI.toast('PCL2 检测成功', 'success');
    } else {
      UI.toast('路径无效或未找到 PCL2', 'error');
    }
  },

  // ==================== Step 2: Folder + Version Selection ====================

  async runStep2() {
    const folderGrid = document.getElementById('folderGrid');
    const versionLayer = document.getElementById('versionLayer');
    versionLayer.style.display = 'none';

    UI.showLoading(folderGrid);

    try {
      const result = await API.getClients(this.state.pcl2Root);
      if (result.success) {
        this.state.folders = result.data.folders;
        this.renderFolders(result.data.folders);
      } else {
        UI.showEmpty(folderGrid, '未找到任何客户端文件夹');
      }
    } catch (e) {
      UI.showEmpty(folderGrid, '加载失败: ' + e.message);
    }
  },

  renderFolders(folders) {
    const grid = document.getElementById('folderGrid');
    grid.innerHTML = '';

    if (folders.length === 0) {
      UI.showEmpty(grid, '未找到任何客户端文件夹');
      return;
    }

    folders.forEach((folder, idx) => {
      const hasJm = folder.versions.some(v => v.hasJourneyMap);
      const versionCount = folder.versions.length;

      const card = UI.createCard({
        name: folder.folderName,
        badge: folder.isSelected ? 'PCL2 选中' : null,
        badgeClass: 'badge-active',
        selected: this.state.selectedFolder && this.state.selectedFolder.folderPath === folder.folderPath,
        info: [
          { text: folder.folderPath },
          { icon: hasJm ? 'icon-check' : 'icon-cross', text: `旅行地图: ${hasJm ? '有' : '无'}` },
          { text: `版本数: ${versionCount}` },
        ],
        onClick: () => this.selectFolder(folder),
      });

      card.setAttribute('data-folder-path', folder.folderPath);
      grid.appendChild(card);
    });
  },

  selectFolder(folder) {
    this.state.selectedFolder = folder;
    this.state.selectedVersion = null;

    // Update folder card selection state (without full re-render)
    const grid = document.getElementById('folderGrid');
    Array.from(grid.children).forEach(card => {
      card.classList.remove('selected');
    });
    // Find the clicked card by data attribute (avoid CSS selector issues with backslashes)
    const clickedCard = Array.from(grid.children).find(card => 
      card.getAttribute('data-folder-path') === folder.folderPath
    );
    if (clickedCard) {
      clickedCard.classList.add('selected');
    }

    // Show version layer
    document.getElementById('versionLayer').style.display = 'block';
    this.renderVersions(folder.versions);

    // Disable next button until version is selected
    document.getElementById('step2Next').disabled = true;
  },

  renderVersions(versions) {
    const grid = document.getElementById('versionGrid');
    grid.innerHTML = '';

    if (versions.length === 0) {
      UI.showEmpty(grid, '该文件夹下没有游戏版本');
      return;
    }

    versions.forEach(version => {
      const card = UI.createCard({
        name: version.name,
        badge: version.isSelected ? 'PCL2 选中' : (version.hasJourneyMap ? '有 JM' : null),
        badgeClass: version.isSelected ? 'badge-active' : (version.hasJourneyMap ? 'badge-warning' : 'badge-danger'),
        selected: this.state.selectedVersion && this.state.selectedVersion.path === version.path,
        disabled: !version.hasJourneyMap,
        info: [
          { text: version.path },
          { icon: version.hasJourneyMap ? 'icon-check' : 'icon-cross', text: `旅行地图: ${version.hasJourneyMap ? '有' : '无'}` },
          { icon: version.hasServersDat ? 'icon-check' : 'icon-cross', text: `servers.dat: ${version.hasServersDat ? '有' : '无'}` },
        ],
        onClick: version.hasJourneyMap ? () => this.selectVersion(version) : null,
      });

      card.setAttribute('data-version-path', version.path);
      grid.appendChild(card);
    });
  },

  selectVersion(version) {
    this.state.selectedVersion = version;

    // Update version card selection state (without full re-render)
    const grid = document.getElementById('versionGrid');
    Array.from(grid.children).forEach(card => {
      card.classList.remove('selected');
    });
    const clickedCard = Array.from(grid.children).find(card => 
      card.getAttribute('data-version-path') === version.path
    );
    if (clickedCard) {
      clickedCard.classList.add('selected');
    }

    document.getElementById('step2Next').disabled = false;
  },

  // ==================== Step 3: Source Server Data ====================

  /**
   * Match a JM folder name to a servers.dat entry
   * Returns { serverName, serverAddress } or null
   */
  matchJmFolder(folderName) {
    if (!this.state.serversDat || this.state.serversDat.length === 0) return null;

    // 1. Direct match: folder name === server name
    let match = this.state.serversDat.find(s => s.name === folderName);
    if (match) return { serverName: match.name, serverAddress: match.address };

    // 2. Sanitized match: remove non-alphanumeric ASCII and compare
    const sanitize = (str) => str.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const sanitizedFolder = sanitize(folderName);
    if (sanitizedFolder) {
      match = this.state.serversDat.find(s => sanitize(s.name) === sanitizedFolder);
      if (match) return { serverName: match.name, serverAddress: match.address };
    }

    // 3. Prefix match: sanitized folder starts with sanitized server name (e.g. "Minecraft~" vs "Minecraft服务器")
    if (sanitizedFolder) {
      match = this.state.serversDat.find(s => {
        const sn = sanitize(s.name);
        return sn && (sanitizedFolder.startsWith(sn) || sn.startsWith(sanitizedFolder));
      });
      if (match) return { serverName: match.name, serverAddress: match.address };
    }

    // 4. Address-based match: check if folder name relates to address
    match = this.state.serversDat.find(s => {
      if (!s.address) return false;
      const addrPart = s.address.split(':')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      return addrPart && sanitizedFolder === addrPart;
    });
    if (match) return { serverName: match.name, serverAddress: match.address };

    return null;
  },

  async runStep3() {
    const versionPath = this.state.selectedVersion.path;

    // Load servers.dat first (needed for JM folder matching)
    try {
      const result = await API.getServersDat(versionPath);
      if (result.success && result.data.length > 0) {
        this.state.serversDat = result.data;
        this.renderServerList(result.data);
        document.getElementById('serversDatPanel').style.display = 'block';
      } else {
        this.state.serversDat = [];
        document.getElementById('serversDatPanel').style.display = 'none';
      }
    } catch (e) {
      this.state.serversDat = [];
      document.getElementById('serversDatPanel').style.display = 'none';
    }

    // Load JourneyMap servers
    const jmGrid = document.getElementById('jmServerGrid');
    UI.showLoading(jmGrid);

    try {
      const result = await API.getJmServers(versionPath);
      if (result.success) {
        // Enrich JM servers with matched server info
        this.state.jmServers = result.data.map(s => {
          s.serverMatch = this.matchJmFolder(s.folderName);
          return s;
        });
        this.renderJmServers(this.state.jmServers);
      } else {
        UI.showEmpty(jmGrid, '未找到 JourneyMap 数据');
      }
    } catch (e) {
      UI.showEmpty(jmGrid, '加载失败: ' + e.message);
    }
  },

  renderServerList(servers) {
    const list = document.getElementById('serverList');
    list.innerHTML = '';

    servers.forEach((server, idx) => {
      const item = document.createElement('div');
      item.className = 'server-item';

      // Address as primary, name as secondary
      const addressHtml = server.address
        ? `<span class="server-name">${UI.escapeHtml(server.address)}</span><span class="server-address">${UI.escapeHtml(server.name)}</span>`
        : `<span class="server-name">${UI.escapeHtml(server.name)}</span>`;

      item.innerHTML = `
        <div class="server-icon">${idx + 1}</div>
        ${addressHtml}
      `;
      list.appendChild(item);
    });
  },

  renderJmServers(servers) {
    const grid = document.getElementById('jmServerGrid');
    grid.innerHTML = '';

    if (servers.length === 0) {
      UI.showEmpty(grid, '未找到 JourneyMap 服务器数据文件夹');
      return;
    }

    servers.forEach(server => {
      // Use matched server address as title, server name as subtitle
      const match = server.serverMatch;
      const title = match ? match.serverAddress : server.folderName;
      const subtitle = match ? match.serverName : '未匹配到服务器列表';

      const card = UI.createCard({
        name: title,
        subtitle: subtitle,
        badge: `${server.totalSizeFormatted}`,
        badgeClass: 'badge-warning',
        selected: this.state.selectedSource && this.state.selectedSource.fullPath === server.fullPath,
        info: [
          { text: `文件夹: ${server.folderName}` },
          { text: `文件数: ${server.fileCount}` },
          { text: `路径点: ${server.waypointCount}` },
          { text: `修改时间: ${server.lastModifiedFormatted}` },
        ],
        dimensions: server.dimensions,
        onClick: () => this.selectSource(server),
      });

      card.setAttribute('data-server-path', server.fullPath);
      grid.appendChild(card);
    });
  },

  selectSource(server) {
    this.state.selectedSource = server;

    // Update source card selection state (without full re-render)
    const grid = document.getElementById('jmServerGrid');
    Array.from(grid.children).forEach(card => {
      card.classList.remove('selected');
    });
    const clickedCard = Array.from(grid.children).find(card => 
      card.getAttribute('data-server-path') === server.fullPath
    );
    if (clickedCard) {
      clickedCard.classList.add('selected');
    }

    document.getElementById('step3Next').disabled = false;
  },

  // ==================== Step 4: Target + Transfer ====================

  runStep4() {
    // Show source summary
    const summary = document.getElementById('sourceSummary');
    const src = this.state.selectedSource;
    const match = src.serverMatch;
    const srcTitle = match ? match.serverAddress : src.folderName;
    const srcSubtitle = match ? match.serverName : '未匹配到服务器列表';
    summary.innerHTML = `
      <div class="panel-title">源数据</div>
      <div class="detect-row">
        <span class="detect-label">服务器:</span>
        <span class="detect-value">${UI.escapeHtml(srcTitle)}</span>
      </div>
      <div class="detect-row">
        <span class="detect-label">名称:</span>
        <span class="detect-value">${UI.escapeHtml(srcSubtitle)}</span>
      </div>
      <div class="detect-row">
        <span class="detect-label">文件夹:</span>
        <span class="detect-value">${UI.escapeHtml(src.folderName)}</span>
      </div>
      <div class="detect-row">
        <span class="detect-label">大小:</span>
        <span class="detect-value">${src.totalSizeFormatted} (${src.fileCount} 个文件)</span>
      </div>
      <div class="detect-row">
        <span class="detect-label">路径:</span>
        <span class="detect-value">${UI.escapeHtml(src.fullPath)}</span>
      </div>
    `;

    // Render target options
    this.renderTargetExisting();
    this.renderTargetServers();

    // Reset state
    this.state.selectedTarget = null;
    document.getElementById('progressArea').style.display = 'none';
    document.getElementById('startTransferBtn').style.display = '';
    document.getElementById('cancelTransferBtn').style.display = 'none';
  },

  renderTargetExisting() {
    const grid = document.getElementById('targetExistingGrid');
    grid.innerHTML = '';

    // Show all JM folders except the selected source
    const targets = this.state.jmServers.filter(s => s.fullPath !== this.state.selectedSource.fullPath);

    if (targets.length === 0) {
      UI.showEmpty(grid, '没有其他现有文件夹');
      return;
    }

    targets.forEach(server => {
      const match = server.serverMatch;
      const title = match ? match.serverAddress : server.folderName;
      const subtitle = match ? match.serverName : '未匹配到服务器列表';

      const card = UI.createCard({
        name: title,
        subtitle: subtitle,
        badge: server.totalSizeFormatted,
        badgeClass: 'badge-warning',
        selected: this.state.selectedTarget === server.fullPath,
        info: [
          { text: `文件夹: ${server.folderName}` },
          { text: `文件数: ${server.fileCount}` },
          { text: `修改时间: ${server.lastModifiedFormatted}` },
        ],
        onClick: () => this.selectTarget(server.fullPath),
      });
      grid.appendChild(card);
    });
  },

  renderTargetServers() {
    const list = document.getElementById('targetServerList');
    list.innerHTML = '';

    if (this.state.serversDat.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>没有服务器数据</p></div>';
      return;
    }

    this.state.serversDat.forEach((server, idx) => {
      const item = document.createElement('div');
      item.className = 'server-item selectable';

      // Address as primary, name as secondary
      const displayHtml = server.address
        ? `<span class="server-name">${UI.escapeHtml(server.address)}</span><span class="server-address">${UI.escapeHtml(server.name)}</span>`
        : `<span class="server-name">${UI.escapeHtml(server.name)}</span>`;

      // Use address as the target folder name (since names can be duplicated)
      const targetFolderName = server.address || server.name;

      item.innerHTML = `
        <div class="server-icon">${idx + 1}</div>
        ${displayHtml}
      `;

      if (this.state.selectedTarget && this.state.selectedTarget.endsWith(targetFolderName)) {
        item.classList.add('selected');
      }

      item.addEventListener('click', () => this.selectTarget(targetFolderName));
      list.appendChild(item);
    });
  },

  selectTarget(targetPath) {
    // Check if it's a full path (from existing folder selection) or a folder name (from server list)
    const isFullPath = targetPath.includes('\\') || targetPath.includes('/');

    if (isFullPath) {
      this.state.selectedTarget = targetPath;
    } else {
      // Construct full path under data/mp
      const sourceFull = this.state.selectedSource.fullPath;
      const mpPath = sourceFull.substring(0, sourceFull.lastIndexOf('\\'));
      this.state.selectedTarget = mpPath + '\\' + targetPath;
    }

    // Update UI
    this.renderTargetExisting();
    this.renderTargetServers();

    // Update custom input
    document.getElementById('customTargetInput').value = this.state.selectedTarget.split('\\').pop();

    UI.toast('已选择目标: ' + this.state.selectedTarget.split('\\').pop(), 'info');
  },

  confirmCustomTarget() {
    const input = document.getElementById('customTargetInput').value.trim();
    if (!input) {
      UI.toast('请输入文件夹名称', 'error');
      return;
    }

    // Validate: no path separators or traversal characters
    if (input.includes('\\') || input.includes('/') || input.includes('..') || input.includes(':')) {
      UI.toast('文件夹名称不能包含路径分隔符或特殊字符', 'error');
      return;
    }

    // Construct full path
    const mpPath = this.state.selectedSource.fullPath.substring(0, this.state.selectedSource.fullPath.lastIndexOf('\\'));
    this.state.selectedTarget = mpPath + '\\' + input;

    UI.toast('已设置目标: ' + input, 'success');
  },

  switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`tab-${tabName}`).classList.add('active');
  },

  // ==================== Transfer Execution ====================

  async executeTransfer() {
    if (!this.state.selectedTarget) {
      UI.toast('请先选择目标文件夹', 'error');
      return;
    }

    // Check if Minecraft is running
    try {
      const mcResult = await API.checkMinecraftRunning();
      if (mcResult.success && mcResult.data.running) {
        const confirmed = await UI.showModal(
          'Minecraft 正在运行',
          '检测到 Minecraft 正在运行，JourneyMap 可能锁定了文件。<br><br>' +
          '<strong style="color:var(--color-wheat);">建议先关闭游戏再进行转移操作。</strong><br><br>' +
          '仍然继续转移吗？(遇到被锁定的文件将自动跳过)'
        );
        if (!confirmed) return;
      }
    } catch (e) {
      // If check fails, proceed anyway
    }

    // Backend will check if target exists and return an error for us to handle
    const mode = document.querySelector('input[name="transferMode"]:checked').value;
    this.state.transferMode = mode;

    // Show progress area
    document.getElementById('progressArea').style.display = 'block';
    document.getElementById('startTransferBtn').style.display = 'none';
    document.getElementById('cancelTransferBtn').style.display = '';

    // Reset progress
    this.updateProgress({ percent: 0, current: 0, total: 0, copiedSizeFormatted: '0 B', totalSizeFormatted: '0 B', speedFormatted: '0 B/s' });

    const params = {
      sourcePath: this.state.selectedSource.fullPath,
      targetPath: this.state.selectedTarget,
      mode: mode,
      overwrite: false, // Will retry with true if needed
    };

    this.state.cancelFn = API.startTransfer(params, (data) => {
      if (data.type === 'started') {
        UI.toast('转移任务已启动', 'info');
      } else if (data.type === 'progress') {
        this.updateProgress(data);
      } else if (data.type === 'complete') {
        this.onTransferComplete(data);
      } else if (data.type === 'cancelled') {
        this.onTransferCancelled(data);
      } else if (data.type === 'error') {
        this.onTransferError(data);
      }
    });
  },

  onTransferCancelled(data) {
    document.getElementById('cancelTransferBtn').style.display = 'none';
    document.getElementById('startTransferBtn').style.display = '';
    UI.toast('转移已取消，源数据未受影响', 'info', 4000);

    const details = document.getElementById('progressDetails');
    details.innerHTML += `
      <div style="margin-top:12px; padding:12px; background:rgba(244,208,63,0.15); border:2px solid var(--color-wheat);">
        <strong style="color:var(--color-wheat);">转移已取消</strong><br>
        已复制: ${data.current || 0} / ${data.total || 0} 文件<br>
        源数据完整保留，目标已清理
      </div>
    `;
  },

  updateProgress(data) {
    const bar = document.getElementById('progressBar');
    const text = document.getElementById('progressText');
    const details = document.getElementById('progressDetails');

    bar.style.width = (data.percent || 0) + '%';
    text.textContent = (data.percent || 0) + '%';

    details.innerHTML = `
      <div class="progress-detail-row">
        <span>进度: ${data.current || 0} / ${data.total || 0} 文件</span>
        <span>${data.copiedSizeFormatted || '0 B'} / ${data.totalSizeFormatted || '0 B'}</span>
      </div>
      <div class="progress-detail-row">
        <span>速度: ${data.speedFormatted || '0 B/s'}</span>
        <span>用时: ${(data.elapsed || 0).toFixed(1)}s</span>
      </div>
    `;
  },

  onTransferComplete(data) {
    document.getElementById('cancelTransferBtn').style.display = 'none';
    document.getElementById('startTransferBtn').style.display = '';
    document.getElementById('startTransferBtn').textContent = '再次转移';

    const hasErrors = data.errors && data.errors.length > 0;
    if (hasErrors) {
      // Check if errors are file-lock related
      const lockErrors = data.errors.filter(e => e.error && (e.error.includes('被占用') || e.error.includes('EPERM')));
      if (lockErrors.length > 0) {
        UI.toast(`转移完成，${lockErrors.length} 个文件被占用已跳过 (请关闭 Minecraft 后重试)`, 'error', 6000);
      } else {
        UI.toast(`转移完成，但有 ${data.errors.length} 个错误`, 'error', 5000);
      }
    } else {
      UI.toast(`转移完成! ${data.current} 个文件已${this.state.transferMode === 'move' ? '移动' : '复制'}`, 'success', 5000);
    }

    // Show summary
    const details = document.getElementById('progressDetails');
    const errorList = hasErrors ? data.errors.slice(0, 10).map(e =>
      `<div style="font-size:14px; color:var(--color-red); margin-top:4px;">${UI.escapeHtml(e.error)}</div>`
    ).join('') : '';
    const moreErrors = hasErrors && data.errors.length > 10 ? `<div style="font-size:14px; color:var(--color-text-dim);">...还有 ${data.errors.length - 10} 个错误</div>` : '';

    details.innerHTML += `
      <div style="margin-top:12px; padding:12px; background:rgba(124,179,66,0.15); border:2px solid var(--color-grass);">
        <strong style="color:var(--color-grass-light);">转移完成</strong><br>
        文件数: ${data.current} / ${data.total}<br>
        总大小: ${data.copiedSizeFormatted}<br>
        耗时: ${data.elapsed.toFixed(1)}s<br>
        平均速度: ${data.speedFormatted}
        ${hasErrors ? `<br><br><span style="color:var(--color-red);">错误: ${data.errors.length} 个</span>` : ''}
        ${errorList}
        ${moreErrors}
      </div>
    `;
  },

  onTransferError(data) {
    // Check if it's an overwrite error
    if (data.message && data.message.includes('已存在')) {
      this.handleOverwriteConfirm();
      return;
    }

    document.getElementById('cancelTransferBtn').style.display = 'none';
    document.getElementById('startTransferBtn').style.display = '';
    
    // 确保有错误消息
    const errMsg = data.message || '转移过程中发生错误，请检查控制台日志';
    UI.toast('转移失败: ' + errMsg, 'error', 6000);

    const details = document.getElementById('progressDetails');
    details.innerHTML += `
      <div style="margin-top:12px; padding:12px; background:rgba(231,76,60,0.15); border:2px solid var(--color-red);">
        <strong style="color:var(--color-red);">转移失败</strong><br>
        ${UI.escapeHtml(errMsg)}
        ${data.errors && data.errors.length > 0 ? '<br><br>' + data.errors.map(e => UI.escapeHtml(e.error)).join('<br>') : ''}
      </div>
    `;
  },

  async handleOverwriteConfirm() {
    const targetName = this.state.selectedTarget.split('\\').pop();
    const confirmed = await UI.showModal(
      '目标已存在',
      `目标文件夹 "${UI.escapeHtml(targetName)}" 已存在。<br>是否覆盖现有数据？<br><br><strong style="color:var(--color-red);">警告: 覆盖将删除目标文件夹中的现有数据！</strong>`
    );

    if (confirmed) {
      // Retry with overwrite
      const params = {
        sourcePath: this.state.selectedSource.fullPath,
        targetPath: this.state.selectedTarget,
        mode: this.state.transferMode,
        overwrite: true,
      };

      this.state.cancelFn = API.startTransfer(params, (data) => {
        if (data.type === 'started') {
          UI.toast('覆盖转移已启动', 'info');
        } else if (data.type === 'progress') {
          this.updateProgress(data);
        } else if (data.type === 'complete') {
          this.onTransferComplete(data);
        } else if (data.type === 'cancelled') {
          this.onTransferCancelled(data);
        } else if (data.type === 'error') {
          this.onTransferError(data);
        }
      });
    } else {
      document.getElementById('cancelTransferBtn').style.display = 'none';
      document.getElementById('startTransferBtn').style.display = '';
      document.getElementById('progressArea').style.display = 'none';
    }
  },

  cancelTransfer() {
    if (this.state.cancelFn) {
      this.state.cancelFn();
      this.state.cancelFn = null;
    }
    document.getElementById('cancelTransferBtn').style.display = 'none';
    document.getElementById('startTransferBtn').style.display = '';
    UI.toast('转移已取消', 'info');
  },
};

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => App.init());
