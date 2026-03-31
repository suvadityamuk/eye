/**
 * clipping-panel.js — Interactive clipping plane for cross-section visualization
 */
import * as THREE from 'three';

const AXIS_NORMALS = {
    x: new THREE.Vector3(1, 0, 0),
    y: new THREE.Vector3(0, 1, 0),
    z: new THREE.Vector3(0, 0, 1),
};

export class ClippingPanel {
    constructor(sceneManager) {
        this.sm = sceneManager;
        this.enabled = false;
        this.axis = 'x';
        this.flipped = false;
        this.showPlane = true;

        // Clipping plane (Three.js convention: plane.normal · point + plane.constant ≤ 0 → clipped)
        this.clipPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);

        // Bounding box range for the current model
        this.rangeMin = -5;
        this.rangeMax = 5;

        // Visual helper plane
        this.helperMesh = null;

        // Enable local clipping on the renderer
        this.sm.renderer.localClippingEnabled = true;

        this._initHelperMesh();
        this._bindElements();
        this._bindEvents();
        this._updateUI();
    }

    _initHelperMesh() {
        const geometry = new THREE.PlaneGeometry(1, 1);
        const material = new THREE.MeshBasicMaterial({
            color: 0xe63946,
            transparent: true,
            opacity: 0.12,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        this.helperMesh = new THREE.Mesh(geometry, material);
        this.helperMesh.visible = false;
        this.helperMesh.renderOrder = 999;
        this.sm.scene.add(this.helperMesh);
    }

    _bindElements() {
        this.enableToggle = document.getElementById('toggle-clipping');
        this.axisBtns = document.querySelectorAll('.clip-axis-btn');
        this.posSlider = document.getElementById('clip-position');
        this.posValue = document.getElementById('clip-position-value');
        this.flipToggle = document.getElementById('toggle-clip-flip');
        this.showPlaneToggle = document.getElementById('toggle-clip-plane');
    }

    _bindEvents() {
        this.enableToggle?.addEventListener('change', (e) => {
            this.enabled = e.target.checked;
            this._applyClipping();
            this._updateUI();
        });

        this.axisBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.axis = btn.dataset.axis;
                this.axisBtns.forEach(b => b.classList.toggle('active', b.dataset.axis === this.axis));
                this._updateRange();
                this._applyClipping();
            });
        });

        this.posSlider?.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            if (this.posValue) this.posValue.textContent = val.toFixed(2);
            this._applyClipping();
        });

        this.flipToggle?.addEventListener('change', () => {
            this.flipped = this.flipToggle.checked;
            this._applyClipping();
        });

        this.showPlaneToggle?.addEventListener('change', () => {
            this.showPlane = this.showPlaneToggle.checked;
            if (this.helperMesh) {
                this.helperMesh.visible = this.enabled && this.showPlane;
            }
        });
    }

    /** Called when a model is loaded */
    onModelLoaded() {
        this._updateRange();
        // Reset to defaults
        this.posSlider.value = (this.rangeMin + this.rangeMax) / 2;
        if (this.posValue) this.posValue.textContent = parseFloat(this.posSlider.value).toFixed(2);
        this._applyClipping();
    }

    /** Toggle clipping on/off (for keyboard shortcut) */
    toggle() {
        this.enabled = !this.enabled;
        if (this.enableToggle) this.enableToggle.checked = this.enabled;
        this._applyClipping();
        this._updateUI();
    }

    // ── Internal ──────────────────────────────────────────────

    _updateRange() {
        const box = this.sm.getModelBoundingBox();
        if (!box) {
            this.rangeMin = -5;
            this.rangeMax = 5;
        } else {
            const min = box.min;
            const max = box.max;
            switch (this.axis) {
                case 'x': this.rangeMin = min.x; this.rangeMax = max.x; break;
                case 'y': this.rangeMin = min.y; this.rangeMax = max.y; break;
                case 'z': this.rangeMin = min.z; this.rangeMax = max.z; break;
            }
            // Add a small margin
            const margin = (this.rangeMax - this.rangeMin) * 0.1;
            this.rangeMin -= margin;
            this.rangeMax += margin;
        }

        if (this.posSlider) {
            this.posSlider.min = this.rangeMin;
            this.posSlider.max = this.rangeMax;
            this.posSlider.step = (this.rangeMax - this.rangeMin) / 500;
        }
    }

    _applyClipping() {
        if (!this.enabled) {
            // Remove all clipping planes
            this.sm.renderer.clippingPlanes = [];
            if (this.helperMesh) this.helperMesh.visible = false;
            return;
        }

        const position = parseFloat(this.posSlider?.value || 0);
        const normal = AXIS_NORMALS[this.axis].clone();

        if (this.flipped) {
            normal.negate();
        }

        // THREE.Plane: normal · point + constant ≤ 0 → clipped
        // To clip everything on the positive side of the position, constant = -position
        this.clipPlane.normal.copy(normal);
        this.clipPlane.constant = this.flipped ? position : -position;

        this.sm.renderer.clippingPlanes = [this.clipPlane];

        // Update helper plane visualization
        this._updateHelper(position);
    }

    _updateHelper(position) {
        if (!this.helperMesh) return;
        this.helperMesh.visible = this.enabled && this.showPlane;

        if (!this.helperMesh.visible) return;

        // Scale helper to model bounding box
        const box = this.sm.getModelBoundingBox();
        let size = 10;
        let center = new THREE.Vector3();
        if (box) {
            const bSize = box.getSize(new THREE.Vector3());
            size = Math.max(bSize.x, bSize.y, bSize.z) * 1.5;
            box.getCenter(center);
        }

        this.helperMesh.scale.set(size, size, 1);

        // Reset rotation then orient to axis
        this.helperMesh.rotation.set(0, 0, 0);
        switch (this.axis) {
            case 'x':
                this.helperMesh.rotation.y = Math.PI / 2;
                this.helperMesh.position.set(position, center.y, center.z);
                break;
            case 'y':
                this.helperMesh.rotation.x = Math.PI / 2;
                this.helperMesh.position.set(center.x, position, center.z);
                break;
            case 'z':
                // PlaneGeometry faces +Z by default, no rotation needed
                this.helperMesh.position.set(center.x, center.y, position);
                break;
        }
    }

    _updateUI() {
        // Disable controls when clipping is off
        const disabled = !this.enabled;
        this.axisBtns.forEach(btn => btn.disabled = disabled);
        if (this.posSlider) this.posSlider.disabled = disabled;
        if (this.flipToggle) this.flipToggle.disabled = disabled;
        if (this.showPlaneToggle) this.showPlaneToggle.disabled = disabled;
    }

    dispose() {
        this.sm.renderer.clippingPlanes = [];
        if (this.helperMesh) {
            this.sm.scene.remove(this.helperMesh);
            this.helperMesh.geometry.dispose();
            this.helperMesh.material.dispose();
        }
    }
}
