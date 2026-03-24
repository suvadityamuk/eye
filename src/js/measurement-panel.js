/**
 * measurement-panel.js — Sidebar panel UI controller for measurements
 */
import { MeasurementManager } from './measurement-manager.js';

export class MeasurementPanel {
    /**
     * @param {import('./scene-manager.js').SceneManager} sceneManager
     */
    constructor(sceneManager) {
        this.sm = sceneManager;
        this.manager = new MeasurementManager(sceneManager);

        this._bindElements();
        this._bindEvents();
        this._bindManagerCallbacks();
    }

    _bindElements() {
        this.toggleBtn = document.getElementById('btn-measure-toggle');
        this.unitSelect = document.getElementById('measure-unit');
        this.scaleInput = document.getElementById('measure-scale');
        this.scaleLabel = document.getElementById('measure-scale-label');
        this.precisionSelect = document.getElementById('measure-precision');
        this.bboxToggle = document.getElementById('toggle-bbox');
        this.bboxDimensions = document.getElementById('bbox-dimensions');
        this.measureList = document.getElementById('measurement-list');
        this.clearBtn = document.getElementById('btn-measure-clear');
    }

    _bindEvents() {
        // Measure toggle button
        this.toggleBtn.addEventListener('click', () => {
            this.manager.toggleActive();
        });

        // Unit select
        this.unitSelect.addEventListener('change', (e) => {
            this.manager.setUnit(e.target.value);
            this._updateScaleLabel();
            this._updateBBoxDimensions();
        });

        // Scale factor input
        this.scaleInput.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val) && val > 0) {
                this.manager.setScale(val);
                this._updateBBoxDimensions();
            }
        });

        // Precision
        this.precisionSelect.addEventListener('change', (e) => {
            this.manager.setPrecision(parseInt(e.target.value));
            this._updateBBoxDimensions();
        });

        // Bounding box toggle
        this.bboxToggle.addEventListener('change', (e) => {
            this.manager.toggleBBox(e.target.checked);
            this.bboxDimensions.style.display = e.target.checked ? '' : 'none';
            if (e.target.checked) {
                this._updateBBoxDimensions();
            }
        });

        // Clear all
        this.clearBtn.addEventListener('click', () => {
            this.manager.clearAll();
            this.bboxToggle.checked = false;
            this.bboxDimensions.style.display = 'none';
        });
    }

    _bindManagerCallbacks() {
        this.manager.onActiveChanged = (active) => {
            this.toggleBtn.classList.toggle('active', active);
            const label = this.toggleBtn.querySelector('span:last-child');
            label.textContent = active ? 'STOP MEASURING' : 'START MEASURING';
        };

        this.manager.onMeasurementAdded = (measurements) => {
            this._refreshList(measurements);
        };

        this.manager.onMeasurementRemoved = (measurements) => {
            this._refreshList(measurements);
        };
    }

    _refreshList(measurements) {
        this.measureList.innerHTML = '';

        if (measurements.length === 0) {
            this.measureList.innerHTML = '<div class="empty-state">No measurements</div>';
            return;
        }

        measurements.forEach((m, idx) => {
            const item = document.createElement('div');
            item.className = 'measurement-item';

            const info = document.createElement('div');
            info.className = 'measurement-info';

            const number = document.createElement('span');
            number.className = 'measurement-number';
            number.textContent = `#${idx + 1}`;

            const distance = document.createElement('span');
            distance.className = 'measurement-distance';
            distance.textContent = this.manager._formatDistance(m.rawDistance);

            info.appendChild(number);
            info.appendChild(distance);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'hud-btn-sm measurement-delete';
            deleteBtn.textContent = '✕';
            deleteBtn.title = 'Remove measurement';
            deleteBtn.addEventListener('click', () => {
                this.manager.removeMeasurement(m.id);
            });

            item.appendChild(info);
            item.appendChild(deleteBtn);
            this.measureList.appendChild(item);
        });
    }

    _updateScaleLabel() {
        const labels = {
            scene: 'su', mm: 'mm', cm: 'cm', m: 'm', in: 'in', ft: 'ft', yd: 'yd',
        };
        this.scaleLabel.textContent = labels[this.unitSelect.value] || 'su';
    }

    _updateBBoxDimensions() {
        const dims = this.manager.getBBoxDimensions();
        if (!dims) {
            this.bboxDimensions.innerHTML = '<div class="empty-state">No model loaded</div>';
            return;
        }

        this.bboxDimensions.innerHTML = `
            <div class="info-row">
                <span class="info-label">X</span>
                <span class="info-value">${dims.x}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Y</span>
                <span class="info-value">${dims.y}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Z</span>
                <span class="info-value">${dims.z}</span>
            </div>
        `;
    }

    // ─── PUBLIC API ───────────────────────────────────────────────

    /** Called when a new model is loaded in the main viewport */
    onModelLoaded() {
        this.manager.onModelLoaded();
        // Reset bbox toggle
        this.bboxToggle.checked = false;
        this.bboxDimensions.style.display = 'none';
        this._refreshList([]);
    }

    /** Switch which manager this panel controls (for comparison mode) */
    setManager(newManager) {
        // Deactivate old manager if active
        if (this.manager.active) {
            this.manager.setActive(false);
        }
        this.manager = newManager;
        this._bindManagerCallbacks();

        // Sync UI state
        this.toggleBtn.classList.toggle('active', newManager.active);
        const label = this.toggleBtn.querySelector('span:last-child');
        label.textContent = newManager.active ? 'STOP MEASURING' : 'START MEASURING';

        this.bboxToggle.checked = newManager.showBBox;
        this.bboxDimensions.style.display = newManager.showBBox ? '' : 'none';
        if (newManager.showBBox) {
            this._updateBBoxDimensions();
        }
        this._refreshList(newManager.measurements);

        // Sync unit/scale/precision from this panel to the new manager
        newManager.setUnit(this.unitSelect.value);
        newManager.setScale(parseFloat(this.scaleInput.value) || 1);
        newManager.setPrecision(parseInt(this.precisionSelect.value));
    }

    /** Toggle measurement mode (for keyboard shortcut) */
    toggleMeasureMode() {
        this.manager.toggleActive();
    }

    dispose() {
        this.manager.dispose();
    }
}
