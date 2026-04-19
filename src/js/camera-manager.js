/**
 * camera-manager.js — Unreal-style camera actors
 * Place virtual cameras in the scene, preview their POV, capture stills, record video.
 */
import * as THREE from 'three';

let _nextId = 1;

export class CameraManager {
    constructor(sceneManager) {
        this.sm = sceneManager;
        this.cameras = [];          // Array of { id, name, camera, helper }
        this.selectedId = null;     // Currently selected camera id
        this.previewCameraId = null; // Camera feeding the PiP preview

        // Recording state
        this._recording = false;
        this._mediaRecorder = null;
        this._recordChunks = [];
        this._recordCanvas = null;
        this._recordRenderer = null;
        this._recordRafId = null;
        this._recordStartTime = 0;

        // Callbacks
        this.onCamerasChanged = null;   // () => void — list add/remove/rename
        this.onRecordingStateChanged = null; // (recording, elapsed) => void
    }

    // ─── CRUD ──────────────────────────────────────────────────────

    /** Add a camera at the current viewport position */
    addCamera(name) {
        const id = _nextId++;
        const camName = name || `Camera ${id}`;

        // Clone current viewport camera state
        const cam = new THREE.PerspectiveCamera(
            this.sm.camera.fov,
            this.sm.camera.aspect,
            0.1,
            100
        );
        cam.position.copy(this.sm.camera.position);
        cam.quaternion.copy(this.sm.camera.quaternion);
        cam.updateMatrixWorld(true);

        // Frustum wireframe helper
        const helper = new THREE.CameraHelper(cam);
        this.sm.scene.add(helper);

        const entry = { id, name: camName, camera: cam, helper, enabled: true };
        this.cameras.push(entry);

        if (!this.selectedId) {
            this.selectedId = id;
        }

        this.onCamerasChanged?.();
        return entry;
    }

    /** Remove a camera by id */
    removeCamera(id) {
        const idx = this.cameras.findIndex(c => c.id === id);
        if (idx === -1) return;

        const entry = this.cameras[idx];
        this.sm.scene.remove(entry.helper);
        entry.helper.dispose();
        this.cameras.splice(idx, 1);

        if (this.selectedId === id) {
            this.selectedId = this.cameras.length > 0 ? this.cameras[0].id : null;
        }
        if (this.previewCameraId === id) {
            this.previewCameraId = null;
        }

        this.onCamerasChanged?.();
    }

    /** Select a camera by id */
    selectCamera(id) {
        this.selectedId = id;
        this.onCamerasChanged?.();
    }

    /** Rename a camera */
    renameCamera(id, newName) {
        const entry = this._getById(id);
        if (entry) {
            entry.name = newName;
            this.onCamerasChanged?.();
        }
    }

    /** Toggle a camera's visibility (frustum helper on/off) */
    toggleCamera(id) {
        const entry = this._getById(id);
        if (!entry) return;
        entry.enabled = !entry.enabled;
        entry.helper.visible = entry.enabled;
        this.onCamerasChanged?.();
    }

    /** Get all cameras */
    getCameras() {
        return this.cameras;
    }

    // ─── VIEWPORT INTERACTION ──────────────────────────────────────

    /** Jump viewport to a camera's position/orientation */
    snapToCamera(id) {
        const entry = this._getById(id);
        if (!entry) return;

        this.sm.camera.position.copy(entry.camera.position);
        this.sm.camera.quaternion.copy(entry.camera.quaternion);

        // Compute target from camera's forward direction
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyQuaternion(entry.camera.quaternion);
        const dist = this.sm.camera.position.distanceTo(this.sm.controls.target);
        const target = this.sm.camera.position.clone().add(forward.multiplyScalar(dist));

        this.sm.controls.target.copy(target);
        this.sm.controls.update();
    }

    /** Update a camera actor to match current viewport */
    updateCameraFromViewport(id) {
        const entry = this._getById(id);
        if (!entry) return;

        entry.camera.position.copy(this.sm.camera.position);
        entry.camera.quaternion.copy(this.sm.camera.quaternion);
        entry.camera.updateMatrixWorld(true);
        entry.helper.update();

        this.onCamerasChanged?.();
    }

    /** Update a camera parameter (fov, near, or far) */
    setCameraParam(id, param, value) {
        const entry = this._getById(id);
        if (!entry) return;

        entry.camera[param] = value;
        entry.camera.updateProjectionMatrix();
        entry.helper.update();
    }

    // ─── PiP PREVIEW ───────────────────────────────────────────────

    /** Set which camera feeds the PiP preview (null to disable) */
    setPreviewCamera(id) {
        this.previewCameraId = id;
    }

    /** Render the preview camera's view onto the PiP canvas.
     *  Called each frame from the SceneManager's _animate() loop. */
    renderPreview(targetCanvas) {
        if (!this.previewCameraId) return false;
        const entry = this._getById(this.previewCameraId);
        if (!entry) return false;

        // Update helper
        entry.camera.updateMatrixWorld(true);
        entry.helper.update();

        // Use a small offscreen renderer for the preview
        const w = targetCanvas.width || 240;
        const h = targetCanvas.height || 160;

        // Temporarily hide all camera helpers so they don't show in PiP
        const helperStates = this.cameras.map(c => {
            const vis = c.helper.visible;
            c.helper.visible = false;
            return vis;
        });

        entry.camera.aspect = w / h;
        entry.camera.updateProjectionMatrix();

        // Create/reuse a small renderer for PiP
        if (!this._pipRenderer) {
            this._pipRenderer = new THREE.WebGLRenderer({
                canvas: targetCanvas,
                antialias: false,
                alpha: false,
            });
            this._pipRenderer.setPixelRatio(1);
            this._pipRenderer.outputColorSpace = THREE.SRGBColorSpace;
            this._pipRenderer.toneMapping = THREE.ACESFilmicToneMapping;
            this._pipRenderer.toneMappingExposure = 1.0;
        }

        this._pipRenderer.setSize(w, h, false);
        this._pipRenderer.setClearColor(
            this.sm.renderer.getClearColor(new THREE.Color()),
            this.sm.renderer.getClearAlpha()
        );
        this._pipRenderer.render(this.sm.scene, entry.camera);

        // Restore helpers
        this.cameras.forEach((c, i) => { c.helper.visible = helperStates[i]; });

        return true;
    }

    // ─── STILL CAPTURE ─────────────────────────────────────────────

    /**
     * Capture a still image from a camera's perspective
     * @param {number} id - Camera id
     * @param {object} options - { multiplier: 1|2|4, format: 'png'|'jpeg'|'webp', transparent: bool, hideHelpers: bool }
     * @returns {string} filename of the downloaded file
     */
    captureFromCamera(id, options = {}) {
        const entry = this._getById(id);
        if (!entry) return null;

        const {
            multiplier = 1,
            format = 'png',
            transparent = false,
            hideHelpers = false,
        } = options;

        const baseW = this.sm.canvas.clientWidth || 800;
        const baseH = this.sm.canvas.clientHeight || 600;
        const w = Math.round(baseW * multiplier);
        const h = Math.round(baseH * multiplier);

        // Offscreen renderer
        const offCanvas = document.createElement('canvas');
        offCanvas.width = w;
        offCanvas.height = h;

        const offRenderer = new THREE.WebGLRenderer({
            canvas: offCanvas,
            antialias: true,
            alpha: transparent,
            preserveDrawingBuffer: true,
        });
        offRenderer.setPixelRatio(1);
        offRenderer.setSize(w, h, false);
        offRenderer.outputColorSpace = THREE.SRGBColorSpace;
        offRenderer.toneMapping = THREE.ACESFilmicToneMapping;
        offRenderer.toneMappingExposure = 1.0;


        if (transparent) {
            offRenderer.setClearColor(0x000000, 0);
        } else {
            offRenderer.setClearColor(
                this.sm.renderer.getClearColor(new THREE.Color()),
                this.sm.renderer.getClearAlpha()
            );
        }

        // Temporarily store visibility states
        const stateGrid = this.sm.gridHelper.visible;
        const stateAxes = this.sm.axesHelper.visible;
        const helperStates = this.cameras.map(c => c.helper.visible);

        if (hideHelpers) {
            this.sm.gridHelper.visible = false;
            this.sm.axesHelper.visible = false;
            this.cameras.forEach(c => { c.helper.visible = false; });
        }

        // Set camera aspect
        entry.camera.aspect = w / h;
        entry.camera.updateProjectionMatrix();
        entry.camera.updateMatrixWorld(true);

        // Render
        offRenderer.render(this.sm.scene, entry.camera);

        // Get data URL
        const mimeTypes = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
        const mimeType = mimeTypes[format] || 'image/png';
        const quality = format === 'png' ? undefined : 0.92;
        const dataUrl = offCanvas.toDataURL(mimeType, quality);

        // Restore visibility
        this.sm.gridHelper.visible = stateGrid;
        this.sm.axesHelper.visible = stateAxes;
        this.cameras.forEach((c, i) => { c.helper.visible = helperStates[i]; });

        // Cleanup
        offRenderer.dispose();

        // Trigger download
        const safeName = entry.name.replace(/[^a-zA-Z0-9_-]/g, '-');
        const filename = `${safeName}_${multiplier}x.${format}`;
        this._downloadDataUrl(dataUrl, filename);

        return filename;
    }

    // ─── VIDEO RECORDING ───────────────────────────────────────────

    /** Check if animations are available */
    hasAnimations() {
        return this.sm.animationClips && this.sm.animationClips.length > 0;
    }

    /** Check if currently recording */
    get isRecording() {
        return this._recording;
    }

    /**
     * Start recording video from a camera's perspective
     * @param {number} id - Camera id
     * @param {object} options - { hideHelpers: bool }
     */
    startRecording(id, options = {}) {
        if (this._recording) return;
        const entry = this._getById(id);
        if (!entry) return;

        const { hideHelpers = false } = options;

        const baseW = this.sm.canvas.clientWidth || 800;
        const baseH = this.sm.canvas.clientHeight || 600;

        // Create offscreen canvas for recording
        this._recordCanvas = document.createElement('canvas');
        this._recordCanvas.width = baseW;
        this._recordCanvas.height = baseH;

        this._recordRenderer = new THREE.WebGLRenderer({
            canvas: this._recordCanvas,
            antialias: true,
            alpha: false,
        });
        this._recordRenderer.setPixelRatio(1);
        this._recordRenderer.setSize(baseW, baseH, false);
        this._recordRenderer.outputColorSpace = THREE.SRGBColorSpace;
        this._recordRenderer.toneMapping = THREE.ACESFilmicToneMapping;
        this._recordRenderer.toneMappingExposure = 1.0;
        this._recordRenderer.setClearColor(
            this.sm.renderer.getClearColor(new THREE.Color()),
            this.sm.renderer.getClearAlpha()
        );

        // Setup MediaRecorder
        const stream = this._recordCanvas.captureStream(30);
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : 'video/webm';

        this._mediaRecorder = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: 5_000_000,
        });
        this._recordChunks = [];

        this._mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) this._recordChunks.push(e.data);
        };

        this._mediaRecorder.onstop = () => {
            const blob = new Blob(this._recordChunks, { type: 'video/webm' });
            const elapsed = ((performance.now() - this._recordStartTime) / 1000).toFixed(1);
            const safeName = entry.name.replace(/[^a-zA-Z0-9_-]/g, '-');
            const filename = `${safeName}.webm`;

            const url = URL.createObjectURL(blob);
            this._downloadUrl(url, filename);
            setTimeout(() => URL.revokeObjectURL(url), 10000);

            // Cleanup
            this._recordRenderer.dispose();
            this._recordRenderer = null;
            this._recordCanvas = null;
            this._recording = false;

            this.onRecordingStateChanged?.(false, parseFloat(elapsed));
        };

        // Start recording
        this._mediaRecorder.start(100); // 100ms timeslice for data chunks
        this._recording = true;
        this._recordStartTime = performance.now();
        this._recordCameraId = id;
        this._recordHideHelpers = hideHelpers;

        this.onRecordingStateChanged?.(true, 0);

        // Start the record render loop
        this._recordLoop(entry, hideHelpers);
    }

    /** Stop recording */
    stopRecording() {
        if (!this._recording || !this._mediaRecorder) return;
        if (this._recordRafId) {
            cancelAnimationFrame(this._recordRafId);
            this._recordRafId = null;
        }
        this._mediaRecorder.stop();
    }

    /** Get recording elapsed time in seconds */
    getRecordingElapsed() {
        if (!this._recording) return 0;
        return (performance.now() - this._recordStartTime) / 1000;
    }

    _recordLoop(entry, hideHelpers) {
        if (!this._recording) return;

        // Store and hide helpers if needed
        const stateGrid = this.sm.gridHelper.visible;
        const stateAxes = this.sm.axesHelper.visible;
        const helperStates = this.cameras.map(c => c.helper.visible);

        if (hideHelpers) {
            this.sm.gridHelper.visible = false;
            this.sm.axesHelper.visible = false;
            this.cameras.forEach(c => { c.helper.visible = false; });
        }

        // Set camera aspect
        entry.camera.aspect = this._recordCanvas.width / this._recordCanvas.height;
        entry.camera.updateProjectionMatrix();
        entry.camera.updateMatrixWorld(true);

        // Render
        this._recordRenderer.render(this.sm.scene, entry.camera);

        // Restore
        this.sm.gridHelper.visible = stateGrid;
        this.sm.axesHelper.visible = stateAxes;
        this.cameras.forEach((c, i) => { c.helper.visible = helperStates[i]; });

        // Notify elapsed
        const elapsed = (performance.now() - this._recordStartTime) / 1000;
        this.onRecordingStateChanged?.(true, elapsed);

        this._recordRafId = requestAnimationFrame(() => this._recordLoop(entry, hideHelpers));
    }

    // ─── HELPERS ───────────────────────────────────────────────────

    _getById(id) {
        return this.cameras.find(c => c.id === id) || null;
    }

    _downloadDataUrl(dataUrl, filename) {
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        link.click();
    }

    _downloadUrl(url, filename) {
        const link = document.createElement('a');
        link.download = filename;
        link.href = url;
        link.click();
    }

    /** Update all camera helpers (call in animate loop) */
    updateHelpers() {
        for (const entry of this.cameras) {
            if (entry.enabled && entry.helper.visible) {
                entry.helper.update();
            }
        }
    }

    /** Remove all cameras */
    clearAll() {
        if (this._recording) this.stopRecording();
        for (const entry of this.cameras) {
            this.sm.scene.remove(entry.helper);
            entry.helper.dispose();
        }
        this.cameras = [];
        this.selectedId = null;
        this.previewCameraId = null;
        if (this._pipRenderer) {
            this._pipRenderer.dispose();
            this._pipRenderer = null;
        }
        this.onCamerasChanged?.();
    }

    dispose() {
        this.clearAll();
    }
}
