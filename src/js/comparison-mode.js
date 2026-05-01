/**
 * comparison-mode.js — Dynamic multi-viewport comparison (1→4 models)
 * Starts with a single upload slot. As files are loaded, new slots appear.
 * SceneManagers are lazily initialized when slots become visible.
 */
import { SceneManager } from './scene-manager.js';
import { loadFile, getFormatType, formatFileSize } from './file-loader.js';
import { MeasurementManager } from './measurement-manager.js';
import { showToast } from './toast.js';

export class ComparisonMode {
    constructor() {
        this.active = false;
        this.slots = [null, null, null, null]; // SceneManager per slot (lazy)
        this.slotFiles = [null, null, null, null];
        this.measureManagers = [null, null, null, null]; // MeasurementManager per slot (lazy)
        this.grid = document.getElementById('viewport-comparison');
        this.slotElements = document.querySelectorAll('.comparison-slot');

        // Camera lock state
        this.cameraLocked = false;
        this._syncingCamera = false; // Guard flag to prevent infinite recursion
        this._changeListeners = [null, null, null, null]; // Per-slot change listeners

        // Active slot for keyboard controls (when cameras unlocked)
        this.activeSlotIndex = 0;

        // Callback when active slot changes (for measurement panel context switching)
        this.onActiveSlotChanged = null; // (slotIndex, measurementManager) => void

        this._bindDropzones();
        this._bindCameraLock();
        this._bindSlotSelection();
        this._updateLayout();
    }

    /**
     * Lazily init a SceneManager for a slot when it becomes visible.
     */
    _ensureSlotReady(index) {
        if (!this.slots[index]) {
            const canvas = this.slotElements[index].querySelector('.canvas-slot');
            this.slots[index] = new SceneManager(canvas);
            this.measureManagers[index] = new MeasurementManager(this.slots[index]);
            // If camera lock is active, set up sync for the new slot
            if (this.cameraLocked) {
                this._setupCameraSyncForSlot(index);
            }
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

    // ─── SLOT SELECTION ───────────────────────────────────────────
    _bindSlotSelection() {
        this.slotElements.forEach((el, i) => {
            el.addEventListener('click', (e) => {
                // Don't steal click from dropzone or clear button
                if (e.target.closest('.slot-dropzone') || e.target.closest('.slot-clear-btn')) return;
                this._setActiveSlot(i);
            });
        });
    }

    _setActiveSlot(index) {
        this.activeSlotIndex = index;
        this.slotElements.forEach((el, i) => {
            el.classList.toggle('active-slot', i === index);
        });
        // Notify listeners (e.g. measurement panel) 
        if (this.measureManagers[index]) {
            this.onActiveSlotChanged?.(index, this.measureManagers[index]);
        }
    }

    // ─── KEYBOARD MOVEMENT ROUTING ────────────────────────────────
    /**
     * Apply keyboard movement deltas.
     * If cameras locked → apply to ALL loaded slots.
     * If unlocked → apply to active slot only.
     */
    applyKeyboardMove(deltas) {
        if (this.cameraLocked) {
            for (let i = 0; i < 4; i++) {
                if (this.slots[i] && this.slotFiles[i]) {
                    this.slots[i].applyKeyboardMove(deltas);
                }
            }
        } else {
            const sm = this.slots[this.activeSlotIndex];
            if (sm && this.slotFiles[this.activeSlotIndex]) {
                sm.applyKeyboardMove(deltas);
            }
        }
    }

    // ─── CAMERA LOCK ──────────────────────────────────────────────
    _bindCameraLock() {
        const btn = document.getElementById('btn-camera-lock');
        btn.addEventListener('click', () => {
            this.cameraLocked = !this.cameraLocked;
            btn.classList.toggle('active', this.cameraLocked);

            const icon = btn.querySelector('.lock-icon');
            const label = btn.querySelector('span:last-child');

            if (this.cameraLocked) {
                icon.textContent = '🔗';
                label.textContent = 'CAMERAS LOCKED';
                this._setupCameraSync();
            } else {
                icon.textContent = '🔓';
                label.textContent = 'LOCK CAMERAS';
                this._removeCameraSync();
            }
        });
    }

    _setupCameraSync() {
        for (let i = 0; i < 4; i++) {
            this._setupCameraSyncForSlot(i);
        }
    }

    _setupCameraSyncForSlot(index) {
        const sm = this.slots[index];
        if (!sm) return;

        // Remove any existing listener first
        if (this._changeListeners[index]) {
            sm.controls.removeEventListener('change', this._changeListeners[index]);
        }

        const listener = () => this._syncCamerasFrom(index);
        this._changeListeners[index] = listener;
        sm.controls.addEventListener('change', listener);
    }

    _removeCameraSync() {
        for (let i = 0; i < 4; i++) {
            if (this.slots[i] && this._changeListeners[i]) {
                this.slots[i].controls.removeEventListener('change', this._changeListeners[i]);
                this._changeListeners[i] = null;
            }
        }
    }

    _syncCamerasFrom(sourceIndex) {
        // Guard against infinite recursion: setting camera state triggers 'change' events
        if (this._syncingCamera) return;
        this._syncingCamera = true;

        const sourceSM = this.slots[sourceIndex];
        if (!sourceSM) { this._syncingCamera = false; return; }

        const state = sourceSM.getCameraState();

        for (let i = 0; i < 4; i++) {
            if (i === sourceIndex) continue;
            if (this.slots[i] && this.slotFiles[i]) {
                this.slots[i].setCameraState(state);
            }
        }

        this._syncingCamera = false;
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
            showToast(`Error loading: ${err.message}`, 'error');
        }
    }

    clearSlot(slotIndex) {
        if (this.slots[slotIndex]) {
            this.slots[slotIndex].clearModel();
        }
        if (this.measureManagers[slotIndex]) {
            this.measureManagers[slotIndex].clearAll();
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
        document.getElementById('comparison-toolbar').style.display = '';
        this._updateLayout();
    }

    deactivate() {
        this.active = false;
        document.getElementById('viewport-single').style.display = '';
        document.getElementById('viewport-comparison').style.display = 'none';
        document.getElementById('comparison-toolbar').style.display = 'none';
    }


}

