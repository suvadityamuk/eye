/**
 * measurement-manager.js — Core measurement logic for a single viewport
 * Handles raycasting, point placement, line drawing, labels, bounding box, and unit conversion.
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const MAX_MEASUREMENTS = 10;

// Unit conversion factors (how many of each unit per 1 scene unit)
const UNIT_FACTORS = {
    scene: 1,
    mm: 1,
    cm: 0.1,
    m: 0.001,
    in: 0.0393701,
    ft: 0.00328084,
    yd: 0.00109361,
};

const UNIT_LABELS = {
    scene: 'su',
    mm: 'mm',
    cm: 'cm',
    m: 'm',
    in: 'in',
    ft: 'ft',
    yd: 'yd',
};

export class MeasurementManager {
    /**
     * @param {import('./scene-manager.js').SceneManager} sceneManager
     */
    constructor(sceneManager) {
        this.sm = sceneManager;
        this.active = false;           // Measurement mode on/off
        this.pendingPoint = null;      // First click THREE.Vector3, waiting for second
        this.pendingMarker = null;     // First click marker sphere
        this.measurements = [];        // Array of measurement objects
        this.bboxHelper = null;
        this.bboxLabels = [];
        this.showBBox = false;

        // Unit configuration
        this.unitKey = 'scene';
        this.scaleFactor = 1;  // user-defined: 1 scene unit = scaleFactor * base unit
        this.precision = 2;

        // Raycaster
        this._raycaster = new THREE.Raycaster();
        this._mouse = new THREE.Vector2();

        // Marker geometry (reused)
        this._markerGeo = new THREE.SphereGeometry(1, 12, 8);
        this._markerMat = new THREE.MeshBasicMaterial({
            color: 0xe63946,
            depthTest: false,
            transparent: true,
            opacity: 0.85,
        });

        // Bound event handlers
        this._onPointerDown = this._handlePointerDown.bind(this);
        this._onPointerUp = this._handlePointerUp.bind(this);
        this._pointerDownPos = { x: 0, y: 0 };

        // Callbacks
        this.onMeasurementAdded = null;   // (measurements) => void
        this.onMeasurementRemoved = null; // (measurements) => void
        this.onActiveChanged = null;      // (active) => void
    }

    // ─── ACTIVATION ───────────────────────────────────────────────

    setActive(active) {
        this.active = active;
        const target = this.sm.canvas;
        if (active) {
            target.addEventListener('pointerdown', this._onPointerDown);
            target.addEventListener('pointerup', this._onPointerUp);
            target.style.cursor = 'crosshair';
            // Disable orbit controls
            this.sm.controls.enabled = false;
        } else {
            target.removeEventListener('pointerdown', this._onPointerDown);
            target.removeEventListener('pointerup', this._onPointerUp);
            target.style.cursor = '';
            this.sm.controls.enabled = true;
            // Clear pending point if any
            this._clearPending();
        }
        this.onActiveChanged?.(active);
    }

    toggleActive() {
        this.setActive(!this.active);
    }

    // ─── CLICK HANDLING ───────────────────────────────────────────

    _handlePointerDown(e) {
        this._pointerDownPos.x = e.clientX;
        this._pointerDownPos.y = e.clientY;
    }

    _handlePointerUp(e) {
        if (!this.active || !this.sm.loadedModel) return;

        // Ignore if pointer moved (drag/orbit), threshold 5px
        const dx = e.clientX - this._pointerDownPos.x;
        const dy = e.clientY - this._pointerDownPos.y;
        if (Math.sqrt(dx * dx + dy * dy) > 5) return;

        // Check if model is a point cloud (unsupported for raycasting)
        if (this._isPointCloud()) {
            this._showToast('Point-to-point measurement is not available for point clouds', 'warning');
            return;
        }

        // Get mouse position relative to canvas
        const rect = this.sm.canvas.getBoundingClientRect();
        this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        // Raycast into the scene
        this._raycaster.setFromCamera(this._mouse, this.sm.camera);

        // Collect all meshes from the model
        const meshes = [];
        this.sm.loadedModel.traverse(child => {
            if (child.isMesh) meshes.push(child);
        });

        const intersects = this._raycaster.intersectObjects(meshes, false);
        if (intersects.length === 0) return;

        const point = intersects[0].point.clone();

        if (!this.pendingPoint) {
            // First point
            this.pendingPoint = point;
            this.pendingMarker = this._createMarker(point);
            this.sm.scene.add(this.pendingMarker);
        } else {
            // Second point — complete measurement
            if (this.measurements.length >= MAX_MEASUREMENTS) {
                this._showToast(`Maximum ${MAX_MEASUREMENTS} measurements reached`, 'warning');
                this._clearPending();
                return;
            }
            this._createMeasurement(this.pendingPoint, point);
            this._clearPending();
        }
    }

    _isPointCloud() {
        if (!this.sm.loadedModel) return false;
        let hasPoints = false;
        let hasMesh = false;
        this.sm.loadedModel.traverse(child => {
            if (child.isPoints) hasPoints = true;
            if (child.isMesh) hasMesh = true;
        });
        return hasPoints && !hasMesh;
    }

    _clearPending() {
        if (this.pendingMarker) {
            this.sm.scene.remove(this.pendingMarker);
            this.pendingMarker.geometry?.dispose();
            this.pendingMarker = null;
        }
        this.pendingPoint = null;
    }

    // ─── MEASUREMENT CREATION ─────────────────────────────────────

    _createMeasurement(pointA, pointB) {
        const rawDistance = pointA.distanceTo(pointB);

        // Markers
        const markerA = this._createMarker(pointA);
        const markerB = this._createMarker(pointB);
        this.sm.scene.add(markerA);
        this.sm.scene.add(markerB);

        // Line
        const lineGeo = new THREE.BufferGeometry().setFromPoints([pointA, pointB]);
        const lineMat = new THREE.LineDashedMaterial({
            color: 0xe63946,
            dashSize: 0.05,
            gapSize: 0.03,
            depthTest: false,
            transparent: true,
            opacity: 0.8,
        });
        const line = new THREE.Line(lineGeo, lineMat);
        line.computeLineDistances();
        line.renderOrder = 999;
        this.sm.scene.add(line);

        // Label
        const midpoint = new THREE.Vector3().lerpVectors(pointA, pointB, 0.5);
        const label = this._createLabel(rawDistance);
        label.position.copy(midpoint);
        this.sm.scene.add(label);

        const measurement = {
            id: Date.now() + Math.random(),
            pointA: pointA.clone(),
            pointB: pointB.clone(),
            rawDistance,
            markerA,
            markerB,
            line,
            label,
        };

        this.measurements.push(measurement);
        this.onMeasurementAdded?.(this.measurements);
    }

    _createMarker(position) {
        // Scale marker relative to model size
        let scale = 0.02;
        if (this.sm.loadedModel) {
            const box = new THREE.Box3().setFromObject(this.sm.loadedModel);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            scale = maxDim * 0.008;
        }

        const marker = new THREE.Mesh(this._markerGeo, this._markerMat);
        marker.scale.setScalar(scale);
        marker.position.copy(position);
        marker.renderOrder = 1000;
        return marker;
    }

    _createLabel(rawDistance) {
        const div = document.createElement('div');
        div.className = 'measure-label-2d';
        div.textContent = this._formatDistance(rawDistance);

        const label = new CSS2DObject(div);
        label.layers.set(0);
        label._rawDistance = rawDistance; // Store for recalculation
        return label;
    }

    // ─── UNIT CONVERSION ──────────────────────────────────────────

    _formatDistance(rawDistance) {
        const converted = rawDistance * this.scaleFactor * (UNIT_FACTORS[this.unitKey] || 1);
        const label = UNIT_LABELS[this.unitKey] || 'su';
        return `${converted.toFixed(this.precision)} ${label}`;
    }

    setUnit(unitKey) {
        this.unitKey = unitKey;
        this._refreshLabels();
    }

    setScale(factor) {
        this.scaleFactor = factor;
        this._refreshLabels();
    }

    setPrecision(digits) {
        this.precision = digits;
        this._refreshLabels();
    }

    _refreshLabels() {
        for (const m of this.measurements) {
            const div = m.label.element;
            div.textContent = this._formatDistance(m.rawDistance);
        }
        this._refreshBBoxLabels();
    }

    // ─── BOUNDING BOX ─────────────────────────────────────────────

    toggleBBox(show) {
        this.showBBox = show;
        if (show) {
            this._showBoundingBox();
        } else {
            this._hideBoundingBox();
        }
    }

    _showBoundingBox() {
        this._hideBoundingBox(); // Clear old
        if (!this.sm.loadedModel) return;

        const box = new THREE.Box3().setFromObject(this.sm.loadedModel);
        const size = box.getSize(new THREE.Vector3());

        // Box helper
        this.bboxHelper = new THREE.Box3Helper(box, 0xe63946);
        this.bboxHelper.material.transparent = true;
        this.bboxHelper.material.opacity = 0.5;
        this.bboxHelper.material.depthTest = false;
        this.sm.scene.add(this.bboxHelper);

        // Dimension labels on each axis
        const center = box.getCenter(new THREE.Vector3());

        const axes = [
            { axis: 'X', value: size.x, pos: new THREE.Vector3(center.x, box.min.y - size.y * 0.08, center.z) },
            { axis: 'Y', value: size.y, pos: new THREE.Vector3(box.max.x + size.x * 0.08, center.y, center.z) },
            { axis: 'Z', value: size.z, pos: new THREE.Vector3(center.x, box.min.y - size.y * 0.08, box.max.z + size.z * 0.08) },
        ];

        for (const { axis, value, pos } of axes) {
            const div = document.createElement('div');
            div.className = 'measure-label-2d bbox-label';
            div.textContent = `${axis}: ${this._formatDistance(value)}`;

            const label = new CSS2DObject(div);
            label.position.copy(pos);
            label._rawDistance = value;
            label._axis = axis;
            this.sm.scene.add(label);
            this.bboxLabels.push(label);
        }
    }

    _hideBoundingBox() {
        if (this.bboxHelper) {
            this.sm.scene.remove(this.bboxHelper);
            this.bboxHelper.dispose?.();
            this.bboxHelper = null;
        }
        for (const label of this.bboxLabels) {
            this.sm.scene.remove(label);
        }
        this.bboxLabels = [];
    }

    _refreshBBoxLabels() {
        for (const label of this.bboxLabels) {
            const div = label.element;
            div.textContent = `${label._axis}: ${this._formatDistance(label._rawDistance)}`;
        }
    }

    /** Get bounding box dimensions (for panel display) */
    getBBoxDimensions() {
        if (!this.sm.loadedModel) return null;
        const box = new THREE.Box3().setFromObject(this.sm.loadedModel);
        const size = box.getSize(new THREE.Vector3());
        return {
            x: this._formatDistance(size.x),
            y: this._formatDistance(size.y),
            z: this._formatDistance(size.z),
        };
    }

    // ─── REMOVAL ──────────────────────────────────────────────────

    removeMeasurement(id) {
        const idx = this.measurements.findIndex(m => m.id === id);
        if (idx === -1) return;

        const m = this.measurements[idx];
        this.sm.scene.remove(m.markerA);
        this.sm.scene.remove(m.markerB);
        this.sm.scene.remove(m.line);
        this.sm.scene.remove(m.label);

        m.markerA.geometry?.dispose();
        m.markerB.geometry?.dispose();
        m.line.geometry?.dispose();
        m.line.material?.dispose();

        this.measurements.splice(idx, 1);
        this.onMeasurementRemoved?.(this.measurements);
    }

    clearAll() {
        for (const m of [...this.measurements]) {
            this.sm.scene.remove(m.markerA);
            this.sm.scene.remove(m.markerB);
            this.sm.scene.remove(m.line);
            this.sm.scene.remove(m.label);

            m.markerA.geometry?.dispose();
            m.markerB.geometry?.dispose();
            m.line.geometry?.dispose();
            m.line.material?.dispose();
        }
        this.measurements = [];
        this._clearPending();
        this._hideBoundingBox();
        this.onMeasurementRemoved?.(this.measurements);
    }

    // ─── LIFECYCLE ────────────────────────────────────────────────

    /** Called when a new model is loaded — clears measurements */
    onModelLoaded() {
        this.clearAll();
    }

    dispose() {
        this.setActive(false);
        this.clearAll();
        this._markerGeo.dispose();
        this._markerMat.dispose();
    }

    // ─── UTILITIES ────────────────────────────────────────────────

    _showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
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
