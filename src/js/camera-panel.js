/**
 * camera-panel.js — UI panel for camera actors
 * Camera list, capture settings, and recording controls.
 */
import { CameraManager } from './camera-manager.js';

export class CameraPanel {
    constructor(sceneManager) {
        this.sm = sceneManager;
        this.manager = new CameraManager(sceneManager);

        // Capture settings
        this._multiplier = 1;
        this._format = 'png';
        this._transparent = false;
        this._hideHelpers = false;

        // PiP elements
        this._pipCanvas = document.getElementById('pip-preview-canvas');
        this._pipContainer = document.getElementById('pip-preview');
        this._pipVisible = false;

        // Recording timer
        this._recordTimerRafId = null;

        this._bindElements();
        this._bindEvents();
        this._bindManagerCallbacks();
    }

    _bindElements() {
        this.btnAddCamera = document.getElementById('btn-add-camera');
        this.cameraList = document.getElementById('camera-list');
        this.emptyState = this.cameraList?.querySelector('.empty-state');

        // Capture settings
        this.selectMultiplier = document.getElementById('cam-resolution');
        this.selectFormat = document.getElementById('cam-format');
        this.toggleTransparent = document.getElementById('cam-transparent');
        this.toggleHideHelpers = document.getElementById('cam-hide-helpers');

        // Camera parameters
        this.paramsSection = document.getElementById('cam-params-section');
        this.sliderFov = document.getElementById('cam-fov');
        this.sliderNear = document.getElementById('cam-near');
        this.sliderFar = document.getElementById('cam-far');
        this.valueFov = document.getElementById('cam-fov-value');
        this.valueNear = document.getElementById('cam-near-value');
        this.valueFar = document.getElementById('cam-far-value');

        // Recording indicator
        this.recordIndicator = document.getElementById('record-indicator');
    }

    _bindEvents() {
        this.btnAddCamera?.addEventListener('click', () => {
            this.manager.addCamera();
            this._showToast('Camera placed at current position', 'info');
        });

        this.selectMultiplier?.addEventListener('change', (e) => {
            this._multiplier = parseInt(e.target.value);
        });

        this.selectFormat?.addEventListener('change', (e) => {
            this._format = e.target.value;
        });

        this.toggleTransparent?.addEventListener('change', (e) => {
            this._transparent = e.target.checked;
        });

        this.toggleHideHelpers?.addEventListener('change', (e) => {
            this._hideHelpers = e.target.checked;
        });

        // Camera parameter sliders
        this.sliderFov?.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.valueFov.textContent = `${val}°`;
            this.manager.setCameraParam(this.manager.selectedId, 'fov', val);
        });

        this.sliderNear?.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.valueNear.textContent = val;
            this.manager.setCameraParam(this.manager.selectedId, 'near', val);
        });

        this.sliderFar?.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.valueFar.textContent = val;
            this.manager.setCameraParam(this.manager.selectedId, 'far', val);
        });
    }

    _bindManagerCallbacks() {
        this.manager.onCamerasChanged = () => {
            this._renderList();
            this._syncParamsToSelected();
        };

        this.manager.onRecordingStateChanged = (recording, elapsed) => {
            if (this.recordIndicator) {
                if (recording) {
                    this.recordIndicator.style.display = 'flex';
                    const timeEl = this.recordIndicator.querySelector('.record-time');
                    if (timeEl) timeEl.textContent = this._formatRecordTime(elapsed);
                } else {
                    this.recordIndicator.style.display = 'none';
                    this._showToast(`Recorded video (${elapsed.toFixed(1)}s)`, 'success');
                }
            }
            this._renderList();
        };
    }

    // ─── LIST RENDERING ────────────────────────────────────────────

    _renderList() {
        if (!this.cameraList) return;

        const cameras = this.manager.getCameras();

        if (cameras.length === 0) {
            this.cameraList.innerHTML = '<div class="empty-state">No cameras placed</div>';
            if (this.paramsSection) this.paramsSection.style.display = 'none';
            return;
        }

        this.cameraList.innerHTML = '';

        cameras.forEach(entry => {
            const item = document.createElement('div');
            item.className = 'camera-item';
            if (entry.id === this.manager.selectedId) {
                item.classList.add('selected');
            }
            if (!entry.enabled) {
                item.classList.add('disabled');
            }

            const isRecording = this.manager.isRecording && this.manager._recordCameraId === entry.id;
            const hasAnimations = this.manager.hasAnimations();
            const isPreviewing = this.manager.previewCameraId === entry.id;

            item.innerHTML = `
                <div class="camera-item-header">
                    <span class="camera-name" data-id="${entry.id}" title="Double-click to rename">${entry.name}</span>
                    <button class="hud-btn-sm cam-action-btn cam-toggle-btn ${entry.enabled ? '' : 'toggled-off'}" data-action="toggle" data-id="${entry.id}" title="${entry.enabled ? 'Hide camera' : 'Show camera'}">${entry.enabled ? '👁' : '🚫'}</button>
                </div>
                <div class="camera-item-actions">
                    <button class="hud-btn-sm cam-action-btn ${isPreviewing ? 'active' : ''}" data-action="preview" data-id="${entry.id}" title="Toggle PiP preview">🔍</button>
                    <button class="hud-btn-sm cam-action-btn" data-action="snap" data-id="${entry.id}" title="Snap viewport to camera">🎯</button>
                    <button class="hud-btn-sm cam-action-btn" data-action="update" data-id="${entry.id}" title="Update camera from viewport">📌</button>
                    <button class="hud-btn-sm cam-action-btn" data-action="capture" data-id="${entry.id}" title="Capture still image">📸</button>
                    <button class="hud-btn-sm cam-action-btn ${isRecording ? 'recording' : ''}" data-action="record" data-id="${entry.id}" title="${isRecording ? 'Stop recording' : 'Record video'}" ${!hasAnimations && !isRecording ? 'disabled' : ''}>${isRecording ? '⏹' : '⏺'}</button>
                    <button class="hud-btn-sm cam-action-btn cam-delete-btn" data-action="delete" data-id="${entry.id}" title="Delete camera">✕</button>
                </div>
            `;

            // Click to select
            item.addEventListener('click', (e) => {
                if (e.target.closest('.cam-action-btn') || e.target.closest('.camera-name')) return;
                this.manager.selectCamera(entry.id);
            });

            // Bind toggle button in header (not caught by querySelectorAll below since it's in header)
            this.cameraList.appendChild(item);
        });

        // Bind action buttons
        this.cameraList.querySelectorAll('.cam-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const id = parseInt(btn.dataset.id);
                this._handleAction(action, id);
            });
        });

        // Bind inline rename
        this.cameraList.querySelectorAll('.camera-name').forEach(name => {
            name.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const id = parseInt(name.dataset.id);
                this._startInlineRename(name, id);
            });
        });
    }

    _handleAction(action, id) {
        switch (action) {
            case 'preview':
                if (this.manager.previewCameraId === id) {
                    this.manager.setPreviewCamera(null);
                    this._hidePiP();
                } else {
                    this.manager.setPreviewCamera(id);
                    this._showPiP();
                }
                this._renderList();
                break;

            case 'toggle':
                this.manager.toggleCamera(id);
                break;

            case 'snap':
                this.manager.snapToCamera(id);
                this._showToast('Viewport snapped to camera', 'info');
                break;

            case 'update':
                this.manager.updateCameraFromViewport(id);
                this._showToast('Camera updated from viewport', 'info');
                break;

            case 'capture': {
                this._flashCapture();
                const filename = this.manager.captureFromCamera(id, {
                    multiplier: this._multiplier,
                    format: this._format,
                    transparent: this._transparent,
                    hideHelpers: this._hideHelpers,
                });
                if (filename) {
                    this._showToast(`Captured: ${filename}`, 'success');
                }
                break;
            }

            case 'record':
                if (this.manager.isRecording) {
                    this.manager.stopRecording();
                } else {
                    this.manager.startRecording(id, {
                        hideHelpers: this._hideHelpers,
                    });
                    // Auto-start animation if not playing
                    this._autoPlayAnimation();
                    this._showToast('Recording started', 'info');
                }
                break;

            case 'delete':
                this.manager.removeCamera(id);
                if (this.manager.getCameras().length === 0) {
                    this._hidePiP();
                }
                break;
        }
    }

    // ─── PiP PREVIEW ───────────────────────────────────────────────

    _showPiP() {
        if (this._pipContainer) {
            this._pipContainer.style.display = 'block';
            this._pipVisible = true;
        }
    }

    _hidePiP() {
        if (this._pipContainer) {
            this._pipContainer.style.display = 'none';
            this._pipVisible = false;
        }
        this.manager.setPreviewCamera(null);
    }

    /** Called from the animate loop to render PiP */
    renderPreview() {
        if (!this._pipVisible || !this._pipCanvas) return;
        this.manager.renderPreview(this._pipCanvas);
    }

    // ─── INLINE RENAME ─────────────────────────────────────────────

    _startInlineRename(el, id) {
        const current = el.textContent;
        el.contentEditable = true;
        el.focus();

        // Select all text
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        const finish = () => {
            el.contentEditable = false;
            const newName = el.textContent.trim() || current;
            this.manager.renameCamera(id, newName);
        };

        el.addEventListener('blur', finish, { once: true });
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                el.blur();
            } else if (e.key === 'Escape') {
                el.textContent = current;
                el.blur();
            }
        });
    }

    // ─── CAMERA PARAMETER SYNC ─────────────────────────────────────

    /** Sync the FOV/near/far sliders to the currently selected camera */
    _syncParamsToSelected() {
        const entry = this.manager._getById(this.manager.selectedId);
        if (!entry) {
            if (this.paramsSection) this.paramsSection.style.display = 'none';
            return;
        }

        if (this.paramsSection) this.paramsSection.style.display = '';

        const cam = entry.camera;
        if (this.sliderFov) {
            this.sliderFov.value = cam.fov;
            this.valueFov.textContent = `${Math.round(cam.fov)}°`;
        }
        if (this.sliderNear) {
            this.sliderNear.value = cam.near;
            this.valueNear.textContent = cam.near;
        }
        if (this.sliderFar) {
            this.sliderFar.value = cam.far;
            this.valueFar.textContent = cam.far;
        }
    }

    // ─── VISUAL EFFECTS ────────────────────────────────────────────

    _flashCapture() {
        const flash = document.getElementById('capture-flash');
        if (!flash) return;
        flash.classList.add('active');
        setTimeout(() => flash.classList.remove('active'), 350);
    }

    // ─── KEYBOARD SHORTCUTS ────────────────────────────────────────

    /** Add camera at current viewport position (P key) */
    addCameraFromViewport() {
        this.manager.addCamera();
        this._showToast('Camera placed at current position', 'info');
    }

    /** Capture from selected camera (Shift+P) */
    captureSelected() {
        if (!this.manager.selectedId) {
            this._showToast('No camera selected', 'warning');
            return;
        }
        this._flashCapture();
        const filename = this.manager.captureFromCamera(this.manager.selectedId, {
            multiplier: this._multiplier,
            format: this._format,
            transparent: this._transparent,
            hideHelpers: this._hideHelpers,
        });
        if (filename) {
            this._showToast(`Captured: ${filename}`, 'success');
        }
    }

    // ─── AUTO-PLAY ANIMATION ───────────────────────────────────────

    _autoPlayAnimation() {
        // Click the play button to auto-start animation during recording
        const playBtn = document.getElementById('btn-anim-play');
        if (playBtn && !playBtn.disabled && playBtn.style.display !== 'none') {
            playBtn.click();
        }
    }

    // ─── MODEL EVENTS ──────────────────────────────────────────────

    /** Called when a new model is loaded */
    onModelLoaded() {
        this._renderList(); // Re-render to update record button disabled state
    }

    // ─── UTILITIES ─────────────────────────────────────────────────

    _formatRecordTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
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
