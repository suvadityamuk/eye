/**
 * export-panel.js — Export/convert loaded 3D models to different formats
 */
import * as THREE from 'three';

// Format metadata: what each export format preserves
const EXPORT_FORMATS = {
    glb: {
        label: 'GLB',
        ext: '.glb',
        mime: 'model/gltf-binary',
        info: 'Preserves: geometry, materials, textures, animations',
    },
    obj: {
        label: 'OBJ',
        ext: '.obj',
        mime: 'text/plain',
        info: 'Preserves: geometry, basic material colors',
    },
    stl: {
        label: 'STL',
        ext: '.stl',
        mime: 'application/octet-stream',
        info: 'Preserves: geometry only (binary)',
    },
    ply: {
        label: 'PLY',
        ext: '.ply',
        mime: 'application/octet-stream',
        info: 'Preserves: geometry, vertex colors',
    },
};

// Formats that CANNOT be exported (non-mesh based)
const NON_EXPORTABLE_FORMATS = new Set(['splat', 'spz', 'sog', 'pdb']);

export class ExportPanel {
    constructor(sceneManager) {
        this.sm = sceneManager;
        this.sourceFormat = null;    // e.g. 'gltf', 'obj', 'stl'
        this.canExport = false;
        this._busy = false;

        this._bindElements();
        this._bindEvents();
        this._updateUI();
    }

    _bindElements() {
        this.formatSelect = document.getElementById('export-format');
        this.infoEl = document.getElementById('export-info');
        this.exportBtn = document.getElementById('btn-export');
        this.exportStatus = document.getElementById('export-status');
    }

    _bindEvents() {
        this.formatSelect.addEventListener('change', () => this._updateInfo());
        this.exportBtn.addEventListener('click', () => this._export());
    }

    /**
     * Called after a model is loaded.
     * @param {string} formatType — the source format key (e.g. 'gltf', 'obj', 'splat')
     */
    onModelLoaded(formatType) {
        this.sourceFormat = formatType;
        this.canExport = !NON_EXPORTABLE_FORMATS.has(formatType);
        this._updateUI();
    }

    onModelCleared() {
        this.sourceFormat = null;
        this.canExport = false;
        this._updateUI();
    }

    _updateUI() {
        if (!this.sourceFormat) {
            this.exportBtn.disabled = true;
            this.formatSelect.disabled = true;
            this.infoEl.textContent = 'Load a model to enable export';
            if (this.exportStatus) this.exportStatus.textContent = '';
            return;
        }

        if (!this.canExport) {
            this.exportBtn.disabled = true;
            this.formatSelect.disabled = true;
            this.infoEl.textContent = `${this.sourceFormat.toUpperCase()} format cannot be exported (point cloud / non-mesh)`;
            if (this.exportStatus) this.exportStatus.textContent = '';
            return;
        }

        this.formatSelect.disabled = false;
        this.exportBtn.disabled = false;
        this._updateInfo();
    }

    _updateInfo() {
        const fmt = this.formatSelect.value;
        const meta = EXPORT_FORMATS[fmt];
        if (meta) {
            this.infoEl.textContent = meta.info;
        }
    }

    async _export() {
        if (!this.sm.loadedModel || !this.canExport || this._busy) return;

        const fmt = this.formatSelect.value;
        const meta = EXPORT_FORMATS[fmt];
        if (!meta) return;

        this._busy = true;
        this.exportBtn.disabled = true;
        this.exportBtn.textContent = 'EXPORTING…';
        if (this.exportStatus) this.exportStatus.textContent = 'Preparing export…';

        try {
            let blob;
            switch (fmt) {
                case 'glb': blob = await this._exportGLB(); break;
                case 'obj': blob = await this._exportOBJ(); break;
                case 'stl': blob = await this._exportSTL(); break;
                case 'ply': blob = await this._exportPLY(); break;
                default: throw new Error(`Unknown export format: ${fmt}`);
            }

            // Generate filename
            const baseName = this._getBaseName();
            const filename = `${baseName}${meta.ext}`;

            // Trigger download
            this._download(blob, filename, meta.mime);
            if (this.exportStatus) this.exportStatus.textContent = `Exported: ${filename}`;
        } catch (err) {
            console.error('Export error:', err);
            if (this.exportStatus) this.exportStatus.textContent = `Error: ${err.message}`;
        } finally {
            this._busy = false;
            this.exportBtn.disabled = false;
            this.exportBtn.textContent = '⬇ EXPORT MODEL';
        }
    }

    async _exportGLB() {
        const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
        const exporter = new GLTFExporter();

        return new Promise((resolve, reject) => {
            exporter.parse(
                this.sm.loadedModel,
                (result) => {
                    // result is ArrayBuffer for binary
                    resolve(new Blob([result], { type: 'model/gltf-binary' }));
                },
                (error) => reject(error),
                {
                    binary: true,
                    animations: this.sm.animationClips || [],
                }
            );
        });
    }

    async _exportOBJ() {
        const { OBJExporter } = await import('three/addons/exporters/OBJExporter.js');
        const exporter = new OBJExporter();
        const result = exporter.parse(this.sm.loadedModel);
        return new Blob([result], { type: 'text/plain' });
    }

    async _exportSTL() {
        const { STLExporter } = await import('three/addons/exporters/STLExporter.js');
        const exporter = new STLExporter();
        const result = exporter.parse(this.sm.loadedModel, { binary: true });
        return new Blob([result], { type: 'application/octet-stream' });
    }

    async _exportPLY() {
        const { PLYExporter } = await import('three/addons/exporters/PLYExporter.js');
        const exporter = new PLYExporter();

        return new Promise((resolve, reject) => {
            exporter.parse(
                this.sm.loadedModel,
                (result) => {
                    resolve(new Blob([result], { type: 'application/octet-stream' }));
                },
                (error) => reject(error),
                { binary: true }
            );
        });
    }

    _getBaseName() {
        // Try to get from the loaded filename if available in the info panel
        const nameEl = document.getElementById('info-filename');
        if (nameEl && nameEl.textContent && nameEl.textContent !== '—') {
            // Strip extension
            return nameEl.textContent.replace(/\.[^.]+$/, '');
        }
        return 'model_export';
    }

    _download(blob, filename, mime) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }
}
