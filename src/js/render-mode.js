/**
 * render-mode.js — Shader / render mode switcher
 * Modes: PBR, Unlit, Normals, Matcap, Depth, UV Checker
 */
import * as THREE from 'three';
import { trackRenderMode } from './analytics.js';

const MODES = ['pbr', 'unlit', 'normals', 'matcap', 'depth', 'uvchecker'];

export class RenderMode {
    constructor(sceneManager) {
        this.sm = sceneManager;
        this.currentMode = 'pbr';
        this.originalMaterials = new Map(); // mesh.uuid → material | material[]

        // Lazily-generated shared materials
        this._matcapTexture = null;
        this._checkerTexture = null;

        this._bindElements();
        this._bindEvents();
    }

    _bindElements() {
        this.toolbar = document.getElementById('render-mode-bar');
        this.buttons = document.querySelectorAll('.render-mode-btn');
    }

    _bindEvents() {
        this.buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                if (mode && MODES.includes(mode)) {
                    this.setMode(mode);
                }
            });
        });
    }

    /** Switch render mode */
    setMode(mode) {
        if (mode === this.currentMode) return;
        if (!this.sm.loadedModel) return;

        // Store originals on first switch away from PBR
        if (this.currentMode === 'pbr') {
            this._storeOriginals();
        }

        this.currentMode = mode;
        trackRenderMode(mode);

        // Update toolbar UI
        this.buttons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        if (mode === 'pbr') {
            this._restoreOriginals();
        } else {
            this._applyMode(mode);
        }
    }

    /** Called when a new model is loaded — reset to PBR */
    onModelLoaded() {
        this.originalMaterials.clear();
        this.currentMode = 'pbr';
        this.buttons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === 'pbr');
        });
    }

    // ── Internal ──────────────────────────────────────────────

    _storeOriginals() {
        if (!this.sm.loadedModel) return;
        this.originalMaterials.clear();
        this.sm.loadedModel.traverse(child => {
            if (child.isMesh && child.material) {
                // Clone the reference (not the material itself)
                this.originalMaterials.set(child.uuid, child.material);
            }
        });
    }

    _restoreOriginals() {
        if (!this.sm.loadedModel) return;
        this.sm.loadedModel.traverse(child => {
            if (child.isMesh && this.originalMaterials.has(child.uuid)) {
                child.material = this.originalMaterials.get(child.uuid);
            }
        });
    }

    _applyMode(mode) {
        if (!this.sm.loadedModel) return;

        this.sm.loadedModel.traverse(child => {
            // Skip non-mesh objects (Points, Lines, etc.)
            if (!child.isMesh) return;

            const origMat = this.originalMaterials.get(child.uuid);
            if (!origMat) return;

            switch (mode) {
                case 'unlit':
                    child.material = this._createUnlitMaterial(origMat);
                    break;
                case 'normals':
                    child.material = this._createNormalsMaterial(origMat);
                    break;
                case 'matcap':
                    child.material = this._createMatcapMaterial(origMat);
                    break;
                case 'depth':
                    child.material = this._createDepthMaterial(origMat);
                    break;
                case 'uvchecker':
                    child.material = this._createUVCheckerMaterial(origMat);
                    break;
            }
        });
    }

    _createUnlitMaterial(orig) {
        const mats = Array.isArray(orig) ? orig : [orig];
        const results = mats.map(m => {
            const mat = new THREE.MeshBasicMaterial({
                color: m.color ? m.color.clone() : new THREE.Color(0xcccccc),
                map: m.map || null,
                transparent: m.transparent,
                opacity: m.opacity,
                side: m.side,
            });
            return mat;
        });
        return results.length === 1 ? results[0] : results;
    }

    _createNormalsMaterial(orig) {
        const mats = Array.isArray(orig) ? orig : [orig];
        const results = mats.map(m => {
            return new THREE.MeshNormalMaterial({
                flatShading: false,
                side: m.side,
                transparent: m.transparent,
                opacity: m.opacity,
            });
        });
        return results.length === 1 ? results[0] : results;
    }

    _createMatcapMaterial(orig) {
        if (!this._matcapTexture) {
            this._matcapTexture = this._generateMatcapTexture();
        }
        const mats = Array.isArray(orig) ? orig : [orig];
        const results = mats.map(m => {
            return new THREE.MeshMatcapMaterial({
                matcap: this._matcapTexture,
                side: m.side,
                transparent: m.transparent,
                opacity: m.opacity,
            });
        });
        return results.length === 1 ? results[0] : results;
    }

    _createDepthMaterial(orig) {
        // Compute model bounding box for near/far range
        const box = this.sm.getModelBoundingBox();
        let nearVal = 0.1, farVal = 50;
        if (box) {
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            nearVal = maxDim * 0.01;
            farVal = maxDim * 5;
        }

        const mats = Array.isArray(orig) ? orig : [orig];
        const results = mats.map(m => {
            return new THREE.ShaderMaterial({
                uniforms: {
                    cameraNear: { value: this.sm.camera.near },
                    cameraFar: { value: this.sm.camera.far },
                },
                vertexShader: `
                    varying float vDepth;
                    void main() {
                        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                        vDepth = -mvPosition.z;
                        gl_Position = projectionMatrix * mvPosition;
                    }
                `,
                fragmentShader: `
                    uniform float cameraNear;
                    uniform float cameraFar;
                    varying float vDepth;
                    void main() {
                        float depth = (vDepth - cameraNear) / (cameraFar - cameraNear);
                        depth = clamp(1.0 - depth, 0.0, 1.0);
                        gl_FragColor = vec4(vec3(depth), 1.0);
                    }
                `,
                side: m.side,
            });
        });
        return results.length === 1 ? results[0] : results;
    }

    _createUVCheckerMaterial(orig) {
        if (!this._checkerTexture) {
            this._checkerTexture = this._generateCheckerTexture();
        }
        const mats = Array.isArray(orig) ? orig : [orig];
        const results = mats.map(m => {
            return new THREE.MeshBasicMaterial({
                map: this._checkerTexture,
                side: m.side,
                transparent: m.transparent,
                opacity: m.opacity,
            });
        });
        return results.length === 1 ? results[0] : results;
    }

    // ── Procedural texture generators ─────────────────────────

    _generateMatcapTexture() {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Create a nice studio-style matcap
        const cx = size / 2;
        const cy = size / 2;
        const r = size / 2;

        // Background
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, size, size);

        // Main sphere gradient
        const grad = ctx.createRadialGradient(cx * 0.7, cy * 0.6, 0, cx, cy, r);
        grad.addColorStop(0, '#f8f8ff');
        grad.addColorStop(0.15, '#e8e0e0');
        grad.addColorStop(0.4, '#b8a0a0');
        grad.addColorStop(0.65, '#6a4c4c');
        grad.addColorStop(0.85, '#2a1a1a');
        grad.addColorStop(1.0, '#0a0505');

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Rim highlight
        const rimGrad = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, r);
        rimGrad.addColorStop(0, 'rgba(0,0,0,0)');
        rimGrad.addColorStop(0.6, 'rgba(230,57,70,0.0)');
        rimGrad.addColorStop(0.85, 'rgba(230,57,70,0.15)');
        rimGrad.addColorStop(1.0, 'rgba(230,57,70,0.0)');

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = rimGrad;
        ctx.fill();

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    _generateCheckerTexture() {
        const size = 1024;
        const cells = 16;
        const cellSize = size / cells;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        for (let y = 0; y < cells; y++) {
            for (let x = 0; x < cells; x++) {
                const isEven = (x + y) % 2 === 0;
                ctx.fillStyle = isEven ? '#555555' : '#cccccc';
                ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
            }
        }

        // Draw UV coordinate labels
        ctx.fillStyle = '#e63946';
        ctx.font = `bold ${cellSize * 0.35}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Label corners
        ctx.fillText('(0,0)', cellSize * 0.5, size - cellSize * 0.5);
        ctx.fillText('(1,0)', size - cellSize * 0.5, size - cellSize * 0.5);
        ctx.fillText('(0,1)', cellSize * 0.5, cellSize * 0.5);
        ctx.fillText('(1,1)', size - cellSize * 0.5, cellSize * 0.5);

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true;
        return texture;
    }

    /** Clean up textures */
    dispose() {
        if (this._matcapTexture) this._matcapTexture.dispose();
        if (this._checkerTexture) this._checkerTexture.dispose();
    }
}
