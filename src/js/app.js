/**
 * app.js — Main application orchestrator
 */
import { SceneManager } from './scene-manager.js';
import { loadFile, isUSDFormat, getFormatType, formatFileSize } from './file-loader.js';
import { MaterialPanel } from './material-panel.js';
import { LightingPanel } from './lighting-panel.js';
import { AnimationPanel } from './animation-panel.js';
import { ComparisonMode } from './comparison-mode.js';
import { HistoryPanel } from './history-panel.js';
import { KeyboardControls } from './keyboard-controls.js';
import { MeasurementPanel } from './measurement-panel.js';
import { CameraPanel } from './camera-panel.js';

class App {
    constructor() {
        this.canvas = document.getElementById('canvas-main');
        this.sceneManager = new SceneManager(this.canvas);
        this.materialPanel = new MaterialPanel(this.sceneManager);
        this.lightingPanel = new LightingPanel(this.sceneManager);
        this.animationPanel = new AnimationPanel(this.sceneManager);
        this.comparisonMode = new ComparisonMode();
        this.isComparisonMode = false;
        this.historyPanel = new HistoryPanel((file) => this._handleFiles([file]));
        this.keyboardControls = new KeyboardControls();
        this.measurementPanel = new MeasurementPanel(this.sceneManager);
        this._mainMeasureManager = this.measurementPanel.manager;  // Store for comparison mode switching
        this.cameraPanel = new CameraPanel(this.sceneManager);
        this._mainCameraManager = this.cameraPanel.manager;  // Store for comparison mode switching

        // Wire PiP preview and camera helper updates into the render loop
        this.sceneManager.onAfterRender = () => {
            this.cameraPanel.renderPreview();
            this.cameraPanel.manager.updateHelpers();
        };
        // Also bind PiP close button
        document.getElementById('pip-close-btn')?.addEventListener('click', () => {
            this.cameraPanel._hidePiP();
            this.cameraPanel._renderList();
        });

        // Wire comparison mode slot changes to measurement panel
        this.comparisonMode.onActiveSlotChanged = (slotIndex, measureManager) => {
            this.measurementPanel.setManager(measureManager);
        };

        this._bindFileUpload();
        this._bindDropzone();
        this._bindSceneControls();
        this._bindPanelToggles();
        this._bindComparisonToggle();
        this._bindFullscreen();
        this._bindKeyboard();
        this._bindSidebarToggles();
        this._bindThemeToggle();
        this._bindHelpPane();
        this._startKeyboardLoop();

        this._showToast('Ready — drop a 3D file to begin', 'info');
    }

    // ─── FILE UPLOAD ───────────────────────────────────────────────
    _bindFileUpload() {
        const fileInput = document.getElementById('file-input');
        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            if (files.length > 0) this._handleFiles(files);
            fileInput.value = '';
        });
    }

    _bindDropzone() {
        const dropzone = document.getElementById('dropzone-main');
        const viewport = document.getElementById('viewport-single');

        // Prevent default drag behaviors on the viewport
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
            viewport.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); });
        });

        viewport.addEventListener('dragover', () => {
            dropzone.classList.add('drag-over');
        });

        viewport.addEventListener('dragleave', (e) => {
            // Only remove highlight if we're leaving the viewport
            if (!viewport.contains(e.relatedTarget)) {
                dropzone.classList.remove('drag-over');
            }
        });

        viewport.addEventListener('drop', (e) => {
            dropzone.classList.remove('drag-over');
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) this._handleFiles(files);
        });
    }

    async _handleFiles(files) {
        // Find the primary 3D file (not MTL)
        const primaryFile = files.find(f => {
            const fmt = getFormatType(f.name);
            return fmt && fmt !== 'mtl';
        });

        if (!primaryFile) {
            this._showToast('No supported 3D file found', 'warning');
            return;
        }

        // Check USD
        if (isUSDFormat(primaryFile.name)) {
            this._showToast('OpenUSD support coming soon — stay tuned!', 'warning');
            return;
        }

        // Route to comparison slot if in comparison mode
        if (this.isComparisonMode) {
            const firstAvailable = this.comparisonMode.slotFiles.findIndex(f => f === null);
            if (firstAvailable !== -1) {
                await this.comparisonMode.loadToSlot(firstAvailable, files);
                this.historyPanel.saveToHistory(primaryFile);
            } else {
                this._showToast('All comparison slots are full', 'warning');
            }
            return;
        }

        this._showLoading(true);

        try {
            const { object, clips } = await loadFile(primaryFile, files);
            this.sceneManager.setModel(object, clips);

            // Update UI
            this._updateFileInfo(primaryFile);
            this.materialPanel.refresh();
            this.animationPanel.refresh();
            this.measurementPanel.onModelLoaded();
            this.cameraPanel.onModelLoaded();

            // Save to local history
            this.historyPanel.saveToHistory(primaryFile);

            // Hide dropzone
            document.getElementById('dropzone-main').classList.add('hidden');

            const ext = primaryFile.name.split('.').pop().toUpperCase();
            this._showToast(`Loaded: ${primaryFile.name} (${ext})`, 'success');
        } catch (err) {
            console.error('Load error:', err);
            if (err.message === 'USD_COMING_SOON') {
                this._showToast('OpenUSD support coming soon — stay tuned!', 'warning');
            } else {
                this._showToast(`Error: ${err.message}`, 'error');
            }
        } finally {
            this._showLoading(false);
        }
    }

    _updateFileInfo(file) {
        const ext = file.name.split('.').pop().toUpperCase();
        document.getElementById('info-filename').textContent = file.name;
        document.getElementById('info-format').textContent = ext;
        document.getElementById('info-size').textContent = formatFileSize(file.size);

        const stats = this.sceneManager.getModelStats();
        if (stats) {
            document.getElementById('info-vertices').textContent = stats.vertices.toLocaleString();
            document.getElementById('info-triangles').textContent = stats.triangles.toLocaleString();
            document.getElementById('info-materials').textContent = stats.materials;
            document.getElementById('info-animations').textContent = stats.animations;
        }
    }

    // ─── SCENE CONTROLS ────────────────────────────────────────────
    _bindSceneControls() {
        document.getElementById('toggle-grid').addEventListener('change', (e) => {
            this.sceneManager.gridHelper.visible = e.target.checked;
        });

        document.getElementById('toggle-axes').addEventListener('change', (e) => {
            this.sceneManager.axesHelper.visible = e.target.checked;
        });

        document.getElementById('toggle-wireframe').addEventListener('change', (e) => {
            this.sceneManager.setWireframe(e.target.checked);
        });

        document.getElementById('scene-bg-color').addEventListener('input', (e) => {
            this.sceneManager.renderer.setClearColor(e.target.value);
        });

        document.getElementById('btn-reset-camera').addEventListener('click', () => {
            this.sceneManager.resetCamera();
        });
    }

    // ─── PANEL TOGGLES ─────────────────────────────────────────────
    _bindPanelToggles() {
        document.querySelectorAll('.panel-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const panelId = btn.dataset.panel;
                const body = document.getElementById(panelId);
                if (body) {
                    body.classList.toggle('collapsed');
                    btn.textContent = body.classList.contains('collapsed') ? '+' : '−';
                }
            });
        });
    }

    // ─── COMPARISON MODE ───────────────────────────────────────────
    _bindComparisonToggle() {
        const btn = document.getElementById('btn-comparison-toggle');
        btn.addEventListener('click', () => {
            this.isComparisonMode = !this.isComparisonMode;
            btn.classList.toggle('active', this.isComparisonMode);
            if (this.isComparisonMode) {
                this.comparisonMode.activate();
                // Deactivate measurement mode and switch to slot 0's manager
                this.measurementPanel.manager.setActive(false);
                const slotMgr = this.comparisonMode.measureManagers[this.comparisonMode.activeSlotIndex];
                if (slotMgr) {
                    this.measurementPanel.setManager(slotMgr);
                }
            } else {
                this.comparisonMode.deactivate();
                // Reconnect measurement panel to the main viewport's manager
                this.measurementPanel.setManager(this._mainMeasureManager);
            }
        });
    }

    // ─── FULLSCREEN ────────────────────────────────────────────────
    _bindFullscreen() {
        document.getElementById('btn-fullscreen').addEventListener('click', () => {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                document.documentElement.requestFullscreen();
            }
        });
    }

    // ─── THEME TOGGLE ─────────────────────────────────────────────
    _bindThemeToggle() {
        const btn = document.getElementById('btn-theme-toggle');
        const icon = btn.querySelector('.theme-icon');
        const html = document.documentElement;

        // Load saved theme
        const savedTheme = localStorage.getItem('eye-theme') || 'dark';
        this._applyTheme(savedTheme, html, icon);

        btn.addEventListener('click', () => {
            const current = html.getAttribute('data-theme') || 'dark';
            const next = current === 'dark' ? 'light' : 'dark';
            this._applyTheme(next, html, icon);
            localStorage.setItem('eye-theme', next);
        });
    }

    _applyTheme(theme, html, icon) {
        html.setAttribute('data-theme', theme);
        icon.textContent = theme === 'dark' ? '🌙' : '☀️';

        // Sync the 3D viewport background with theme
        const bgColor = theme === 'dark' ? 0x080808 : 0xe8e8e8;
        const bgHex = theme === 'dark' ? '#080808' : '#e8e8e8';
        this.sceneManager.renderer.setClearColor(bgColor);
        document.getElementById('scene-bg-color').value = bgHex;
    }

    // ─── KEYBOARD SHORTCUTS ────────────────────────────────────────
    _bindKeyboard() {
        // Keys that conflict with 6DOF movement (Shift+key)
        const MOVEMENT_CONFLICT_KEYS = new Set(['w','a','s','d','e','q','z','x']);

        document.addEventListener('keydown', (e) => {
            // Don't trigger if user is typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

            // Skip only the conflicting single-key shortcuts when Shift is held
            if (e.shiftKey && MOVEMENT_CONFLICT_KEYS.has(e.key.toLowerCase())) return;

            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    if (this.animationPanel.isPlaying) {
                        this.animationPanel.pause();
                    } else {
                        this.animationPanel.play();
                    }
                    break;
                case 'r':
                    this.sceneManager.resetCamera();
                    break;
                case 'g':
                    const gridToggle = document.getElementById('toggle-grid');
                    gridToggle.checked = !gridToggle.checked;
                    gridToggle.dispatchEvent(new Event('change'));
                    break;
                case 'w':
                    const wireToggle = document.getElementById('toggle-wireframe');
                    wireToggle.checked = !wireToggle.checked;
                    wireToggle.dispatchEvent(new Event('change'));
                    break;
                case 'c':
                    document.getElementById('btn-comparison-toggle').click();
                    break;
                case 'm':
                    this.measurementPanel.toggleMeasureMode();
                    break;
                case 'p':
                    this.cameraPanel.addCameraFromViewport();
                    break;
                case 'P':
                    this.cameraPanel.captureSelected();
                    break;
                case 't':
                    document.getElementById('btn-theme-toggle').click();
                    break;
                case '?':
                case 'h':
                    this._toggleHelpPane();
                    break;
                case 'Escape':
                    // Exit measure mode first, then close help
                    if (this.measurementPanel.manager.active) {
                        this.measurementPanel.manager.setActive(false);
                    } else {
                        this._hideHelpPane();
                    }
                    break;
            }
        });
    }

    // ─── HELP PANE ────────────────────────────────────────────────
    _bindHelpPane() {
        const overlay = document.getElementById('help-overlay');
        const closeBtn = document.getElementById('help-close-btn');
        const helpBtn = document.getElementById('btn-help');

        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._hideHelpPane();
            });
        }
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this._hideHelpPane();
            });
        }
        if (helpBtn) {
            helpBtn.addEventListener('click', () => this._toggleHelpPane());
        }
    }

    _toggleHelpPane() {
        const overlay = document.getElementById('help-overlay');
        if (!overlay) return;
        const isVisible = overlay.classList.contains('visible');
        if (isVisible) {
            this._hideHelpPane();
        } else {
            this._showHelpPane();
        }
    }

    _showHelpPane() {
        const overlay = document.getElementById('help-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            // Force reflow for animation
            void overlay.offsetHeight;
            overlay.classList.add('visible');
        }
    }

    _hideHelpPane() {
        const overlay = document.getElementById('help-overlay');
        if (overlay) {
            overlay.classList.remove('visible');
            // Hide after transition
            setTimeout(() => {
                if (!overlay.classList.contains('visible')) {
                    overlay.style.display = 'none';
                }
            }, 250);
        }
    }

    // ─── KEYBOARD MOVEMENT LOOP ───────────────────────────────────
    _startKeyboardLoop() {
        let lastTime = performance.now();

        const loop = () => {
            requestAnimationFrame(loop);
            const now = performance.now();
            const delta = (now - lastTime) / 1000;
            lastTime = now;

            const deltas = this.keyboardControls.update(delta);
            if (!deltas) return;

            if (this.isComparisonMode) {
                this.comparisonMode.applyKeyboardMove(deltas);
            } else {
                this.sceneManager.applyKeyboardMove(deltas);
            }
        };

        requestAnimationFrame(loop);
    }

    // ─── SIDEBAR TOGGLES (Responsive) ───────────────────────────────
    _bindSidebarToggles() {
        const leftBtn = document.getElementById('btn-sidebar-left');
        const rightBtn = document.getElementById('btn-sidebar-right');
        const leftSidebar = document.getElementById('sidebar-left');
        const rightSidebar = document.getElementById('sidebar-right');
        const backdrop = document.getElementById('sidebar-backdrop');

        const closeSidebars = () => {
            leftSidebar.classList.remove('open');
            rightSidebar.classList.remove('open');
            backdrop.classList.remove('visible');
        };

        leftBtn?.addEventListener('click', () => {
            const opening = !leftSidebar.classList.contains('open');
            closeSidebars();
            if (opening) {
                leftSidebar.classList.add('open');
                backdrop.classList.add('visible');
            }
        });

        rightBtn?.addEventListener('click', () => {
            const opening = !rightSidebar.classList.contains('open');
            closeSidebars();
            if (opening) {
                rightSidebar.classList.add('open');
                backdrop.classList.add('visible');
            }
        });

        backdrop?.addEventListener('click', closeSidebars);

        // Auto-close sidebars when resizing back to desktop
        window.addEventListener('resize', () => {
            if (window.innerWidth > 1024) {
                closeSidebars();
            }
        });
    }

    // ─── UTILITIES ─────────────────────────────────────────────────
    _showLoading(show) {
        document.getElementById('loading-overlay').style.display = show ? '' : 'none';
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

// ─── BOOT ──────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    new App();
});
