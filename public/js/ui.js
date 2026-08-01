/**
 * UI Components - Toast, Modal, Background particles, Card builders
 */
const UI = {
  /**
   * Show a toast notification
   */
  toast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  /**
   * Show a modal dialog
   * @returns {Promise<boolean>} resolves to true if confirmed, false if cancelled
   */
  showModal(title, body) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('modalOverlay');
      const content = document.getElementById('modalContent');

      content.innerHTML = `
        <div class="modal-title">${this.escapeHtml(title)}</div>
        <div class="modal-body">${body}</div>
        <div class="modal-actions">
          <button class="pixel-btn pixel-btn-stone" id="modalCancel">取消</button>
          <button class="pixel-btn pixel-btn-green" id="modalConfirm">确认</button>
        </div>
      `;

      overlay.style.display = 'flex';

      document.getElementById('modalConfirm').onclick = () => {
        overlay.style.display = 'none';
        resolve(true);
      };

      document.getElementById('modalCancel').onclick = () => {
        overlay.style.display = 'none';
        resolve(false);
      };
    });
  },

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  /**
   * Create a pixel card element
   */
  createCard(options) {
    const card = document.createElement('div');
    card.className = 'pixel-card';
    if (options.disabled) card.classList.add('disabled');
    if (options.selected) card.classList.add('selected');
    if (options.onClick) card.addEventListener('click', options.onClick);

    const header = document.createElement('div');
    header.className = 'card-header';

    const nameWrap = document.createElement('div');
    nameWrap.className = 'card-name-wrap';

    const name = document.createElement('div');
    name.className = 'card-name';
    name.textContent = options.name;
    nameWrap.appendChild(name);

    if (options.subtitle) {
      const subtitle = document.createElement('div');
      subtitle.className = 'card-subtitle';
      subtitle.textContent = options.subtitle;
      nameWrap.appendChild(subtitle);
    }

    header.appendChild(nameWrap);

    if (options.badge) {
      const badge = document.createElement('div');
      badge.className = `card-badge ${options.badgeClass || 'badge-active'}`;
      badge.textContent = options.badge;
      header.appendChild(badge);
    }

    card.appendChild(header);

    if (options.info && options.info.length > 0) {
      const info = document.createElement('div');
      info.className = 'card-info';
      for (const line of options.info) {
        const row = document.createElement('div');
        row.className = 'card-info-row';

        if (line.icon) {
          const icon = document.createElement('span');
          icon.className = `card-info-icon ${line.icon}`;
          row.appendChild(icon);
        }

        const text = document.createElement('span');
        text.textContent = line.text;
        row.appendChild(text);

        info.appendChild(row);
      }
      card.appendChild(info);
    }

    if (options.dimensions && options.dimensions.length > 0) {
      const dimContainer = document.createElement('div');
      dimContainer.className = 'card-dimensions';
      for (const dim of options.dimensions) {
        const tag = document.createElement('span');
        tag.className = 'dim-tag';
        tag.textContent = `${dim.displayName || dim.name} (${dim.chunkCount}c)`;
        dimContainer.appendChild(tag);
      }
      card.appendChild(dimContainer);
    }

    return card;
  },

  /**
   * Show empty state
   */
  showEmpty(container, message) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">[ ]</div>
        <p>${this.escapeHtml(message)}</p>
      </div>
    `;
  },

  /**
   * Show loading spinner
   */
  showLoading(container) {
    container.innerHTML = '<div class="loading-spinner"></div>';
  },

  /**
   * Initialize background particles (floating clouds and leaves)
   */
  initParticles() {
    const container = document.getElementById('bgParticles');
    if (!container) return;

    // Create clouds
    for (let i = 0; i < 5; i++) {
      const cloud = document.createElement('div');
      cloud.className = 'pixel-cloud';
      const top = 5 + Math.random() * 40;
      const duration = 40 + Math.random() * 30;
      const delay = -Math.random() * duration;
      const direction = i % 2 === 0 ? 'float-cloud-1' : 'float-cloud-2';
      const scale = 0.5 + Math.random() * 0.8;

      cloud.style.top = top + '%';
      cloud.style.animation = `${direction} ${duration}s linear infinite`;
      cloud.style.animationDelay = delay + 's';
      cloud.style.transform = `scale(${scale})`;

      container.appendChild(cloud);
    }

    // Create leaves
    for (let i = 0; i < 8; i++) {
      const leaf = document.createElement('div');
      leaf.className = 'pixel-leaf';
      const left = Math.random() * 100;
      const duration = 15 + Math.random() * 15;
      const delay = -Math.random() * duration;

      leaf.style.left = left + '%';
      leaf.style.animation = `float-leaf ${duration}s linear infinite`;
      leaf.style.animationDelay = delay + 's';

      container.appendChild(leaf);
    }
  },
};
