/**
 * comparison-mode.js — Dynamic multi-viewport comparison (1→4 models)
 * Starts with a single upload slot. As files are loaded, new slots appear.
 * SceneManagers are lazily initialized when slots become visible.
 */
import { SceneManager } from './scene-manager.js';
import { loadFile, isUSDFormat, getFormatType, formatFileSize } from './file-loader.js';

export class ComparisonMode {
    constructor() {
        this.active = false;
        this.slots = [null, null, null, null]; // SceneManager per slot (lazy)
        this.slotFiles = [null, null, null, null];
        this.grid = document.getElementById('viewport-comparison');
        this.slotElements = document.querySelectorAll('.comparison-slot');
        this._bindDropzones();
        this._updateLayout();
    }

    /**
     * Lazily init a SceneManager for a slot when it becomes visible.
     */
    _ensureSlotReady(index) {
        if (!this.slots[index]) {
            const canvas = this.slotElements[index].querySelector('.canvas-slot');
            this.slots[index] = new SceneManager(canvas);
        }
        return this.slots[index];
    }

    _bindDropzones() {
        document.querySelectorAll('.slot-dropzone').forEach(dropzone => {
            const slot = parseInt(dropzone.dataset.slot);

            dropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add('drag-over');
            });

            dropzone.addEventListener('dragleave', (e) => {
                e.stopPropagation();
                dropzone.classList.remove('drag-over');
            });

            dropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('drag-over');
                const files = Array.from(e.dataTransfer.files);
                if (files.length > 0) {
                    this.loadToSlot(slot, files);
                }
            });

            // Click-to-upload
            dropzone.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.gltf,.glb,.obj,.ply,.fbx,.stl,.3dm,.splat,.usdz,.usda,.usdc';
                input.multiple = true;
                input.addEventListener('change', () => {
                    if (input.files.length > 0) {
                        this.loadToSlot(slot, Array.from(input.files));
                    }
                });
                input.click();
            });
        });

        // Clear buttons
        document.querySelectorAll('.slot-clear-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const slot = parseInt(e.target.dataset.slot);
                this.clearSlot(slot);
            });
        });
    }

    _getLoadedCount() {
        return this.slotFiles.filter(f => f !== null).length;
    }

    _updateLayout() {
        const loadedCount = this._getLoadedCount();
        const visibleCount = Math.min(loadedCount + 1, 4);

        this.slotElements.forEach((el, i) => {
            if (i < visibleCount) {
                el.classList.remove('slot-hidden');
            } else {
                el.classList.add('slot-hidden');
            }
        });

        this.grid.setAttribute('data-visible-slots', visibleCount);

        // Resize visible slot renderers
        if (this.active) {
            setTimeout(() => {
                for (let i = 0; i < visibleCount; i++) {
                    if (this.slots[i]) this.slots[i]._resize();
                }
            }, 50);
        }
    }

    async loadToSlot(slotIndex, files) {
        const primaryFile = files.find(f => {
            const fmt = getFormatType(f.name);
            return fmt && fmt !== 'mtl';
        });

        if (!primaryFile) return;

        if (isUSDFormat(primaryFile.name)) {
            this._showToast('USD format support coming soon', 'warning');
            return;
        }

        // Ensure the slot element is visible before creating the renderer
        this.slotElements[slotIndex].classList.remove('slot-hidden');

        // Update the grid layout first so the CSS grid gives the slot proper dimensions
        this.grid.setAttribute('data-visible-slots', Math.min(this._getLoadedCount() + 1, 4));

        // Force a layout pass so the canvas has dimensions
        void this.slotElements[slotIndex].offsetHeight;

        const sm = this._ensureSlotReady(slotIndex);

        // Force an immediate resize to ensure the renderer matches slot dimensions
        sm._resize();

        const dropzone = document.querySelector(`.slot-dropzone[data-slot="${slotIndex}"]`);
        const clearBtn = document.querySelector(`.slot-clear-btn[data-slot="${slotIndex}"]`);
        const label = this.slotElements[slotIndex].querySelector('.viewport-label');

        try {
            const { object, clips } = await loadFile(primaryFile, files);
            sm.setModel(object, clips);

            // Force resize again after model load to recalculate dimensions
            sm._resize();

            dropzone.classList.add('hidden');
            clearBtn.classList.add('visible');
            label.textContent = primaryFile.name.length > 20
                ? primaryFile.name.substring(0, 20).toUpperCase() + '…'
                : primaryFile.name.toUpperCase();
            this.slotFiles[slotIndex] = primaryFile;
            this._updateLayout();
        } catch (err) {
            if (err.message === 'USD_COMING_SOON') {
                this._showToast('USD format support coming soon', 'warning');
            } else {
                this._showToast(`Error loading: ${err.message}`, 'error');
            }
        }
    }

    clearSlot(slotIndex) {
        if (this.slots[slotIndex]) {
            this.slots[slotIndex].clearModel();
        }
        const dropzone = document.querySelector(`.slot-dropzone[data-slot="${slotIndex}"]`);
        const clearBtn = document.querySelector(`.slot-clear-btn[data-slot="${slotIndex}"]`);
        const label = this.slotElements[slotIndex].querySelector('.viewport-label');

        dropzone.classList.remove('hidden');
        clearBtn.classList.remove('visible');
        label.textContent = `SLOT ${slotIndex + 1}`;
        this.slotFiles[slotIndex] = null;
        this._updateLayout();
    }

    activate() {
        this.active = true;
        document.getElementById('viewport-single').style.display = 'none';
        document.getElementById('viewport-comparison').style.display = '';
        this._updateLayout();
    }

    deactivate() {
        this.active = false;
        document.getElementById('viewport-single').style.display = '';
        document.getElementById('viewport-comparison').style.display = 'none';
    }

    _showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('toast-exit');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}
