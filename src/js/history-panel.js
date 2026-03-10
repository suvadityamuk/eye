/**
 * EYE — History Panel
 * Displays previously viewed files in the left sidebar.
 * Clicking an item reloads it from local IndexedDB storage.
 */

import { historyStore } from './history-store.js';
import { loadFile } from './file-loader.js';

export class HistoryPanel {
    constructor(onLoadFile) {
        this.onLoadFile = onLoadFile;
        this.listEl = document.getElementById('history-list');
        this.clearBtn = document.getElementById('btn-history-clear');
        this._bindEvents();
        this.refresh();
    }

    _bindEvents() {
        this.clearBtn?.addEventListener('click', async () => {
            await historyStore.clearAll();
            this.refresh();
        });
    }

    /**
     * Save a file to history after it's been loaded successfully.
     */
    async saveToHistory(file) {
        try {
            await historyStore.save(file);
            this.refresh();
        } catch (err) {
            console.warn('Failed to save to history:', err);
        }
    }

    /**
     * Refresh the history list UI.
     */
    async refresh() {
        if (!this.listEl) return;
        try {
            const items = await historyStore.getAll();
            this._render(items);
        } catch (err) {
            this.listEl.innerHTML = '<div class="empty-state">History unavailable</div>';
        }
    }

    _render(items) {
        if (items.length === 0) {
            this.listEl.innerHTML = '<div class="empty-state">No history yet</div>';
            this.clearBtn.style.display = 'none';
            return;
        }

        this.clearBtn.style.display = '';
        this.listEl.innerHTML = '';

        for (const item of items) {
            const el = document.createElement('div');
            el.className = 'history-item';
            el.dataset.id = item.id;
            el.title = `Click to load ${item.name}`;

            const extBadge = item.ext.toUpperCase();
            const sizeStr = this._formatSize(item.size);
            const timeStr = this._formatTime(item.timestamp);

            el.innerHTML = `
                <div class="history-item-info">
                    <span class="history-item-name">${this._escapeHtml(item.name)}</span>
                    <span class="history-item-meta">
                        <span class="badge history-badge">${extBadge}</span>
                        ${sizeStr} · ${timeStr}
                    </span>
                </div>
                <button class="history-item-delete" data-id="${item.id}" title="Remove from history">✕</button>
            `;

            // Click to reload
            el.addEventListener('click', (e) => {
                if (e.target.classList.contains('history-item-delete')) return;
                this._loadFromHistory(item.id);
            });

            // Delete button
            el.querySelector('.history-item-delete').addEventListener('click', async (e) => {
                e.stopPropagation();
                await historyStore.remove(item.id);
                this.refresh();
            });

            this.listEl.appendChild(el);
        }
    }

    async _loadFromHistory(id) {
        try {
            const entry = await historyStore.getById(id);
            if (!entry) return;

            // Reconstruct a File object from the stored blob
            const file = new File([entry.blob], entry.name, {
                type: entry.blob.type,
                lastModified: entry.timestamp,
            });

            this.onLoadFile(file);
        } catch (err) {
            console.error('Failed to load from history:', err);
        }
    }

    _formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    _formatTime(ts) {
        const now = Date.now();
        const diff = now - ts;
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return mins + 'm ago';
        const hours = Math.floor(mins / 60);
        if (hours < 24) return hours + 'h ago';
        const days = Math.floor(hours / 24);
        if (days < 7) return days + 'd ago';
        return new Date(ts).toLocaleDateString();
    }

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
