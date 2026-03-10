/**
 * material-panel.js — Material and texture editing
 */
import * as THREE from 'three';

export class MaterialPanel {
    constructor(sceneManager) {
        this.sm = sceneManager;
        this.materials = [];
        this.selectedMaterial = null;
        this.originalValues = new Map();

        this._bindElements();
        this._bindEvents();
    }

    _bindElements() {
        this.listEl = document.getElementById('material-list');
        this.editorEl = document.getElementById('material-editor');
        this.nameEl = document.getElementById('material-name');

        this.colorInput = document.getElementById('mat-color');
        this.roughnessInput = document.getElementById('mat-roughness');
        this.roughnessVal = document.getElementById('mat-roughness-val');
        this.metalnessInput = document.getElementById('mat-metalness');
        this.metalnessVal = document.getElementById('mat-metalness-val');
        this.opacityInput = document.getElementById('mat-opacity');
        this.opacityVal = document.getElementById('mat-opacity-val');
        this.emissiveInput = document.getElementById('mat-emissive');

        this.btnBack = document.getElementById('btn-material-back');
        this.btnReset = document.getElementById('btn-material-reset');
    }

    _bindEvents() {
        this.btnBack.addEventListener('click', () => this._showList());
        this.btnReset.addEventListener('click', () => this._resetMaterial());

        this.colorInput.addEventListener('input', (e) => {
            if (this.selectedMaterial) {
                this.selectedMaterial.color.set(e.target.value);
            }
        });

        this.roughnessInput.addEventListener('input', (e) => {
            if (this.selectedMaterial) {
                this.selectedMaterial.roughness = parseFloat(e.target.value);
                this.roughnessVal.textContent = parseFloat(e.target.value).toFixed(2);
            }
        });

        this.metalnessInput.addEventListener('input', (e) => {
            if (this.selectedMaterial) {
                this.selectedMaterial.metalness = parseFloat(e.target.value);
                this.metalnessVal.textContent = parseFloat(e.target.value).toFixed(2);
            }
        });

        this.opacityInput.addEventListener('input', (e) => {
            if (this.selectedMaterial) {
                const val = parseFloat(e.target.value);
                this.selectedMaterial.opacity = val;
                this.selectedMaterial.transparent = val < 1.0;
                this.opacityVal.textContent = val.toFixed(2);
            }
        });

        this.emissiveInput.addEventListener('input', (e) => {
            if (this.selectedMaterial && this.selectedMaterial.emissive) {
                this.selectedMaterial.emissive.set(e.target.value);
            }
        });

        // Texture uploads
        document.querySelectorAll('.tex-upload-btn input').forEach(input => {
            input.addEventListener('change', (e) => {
                const texType = e.target.dataset.tex;
                if (e.target.files[0] && this.selectedMaterial) {
                    this._loadTexture(e.target.files[0], texType);
                }
            });
        });

        document.querySelectorAll('.tex-clear-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const texType = e.target.dataset.tex;
                if (this.selectedMaterial) {
                    if (this.selectedMaterial[texType]) {
                        this.selectedMaterial[texType].dispose();
                    }
                    this.selectedMaterial[texType] = null;
                    this.selectedMaterial.needsUpdate = true;
                }
            });
        });
    }

    /** Refresh material list after a model is loaded */
    refresh() {
        this.materials = this.sm.getMaterials();
        this.selectedMaterial = null;
        this._showList();
        this._buildList();
    }

    _buildList() {
        this.listEl.innerHTML = '';

        if (this.materials.length === 0) {
            this.listEl.innerHTML = '<div class="empty-state">No materials found</div>';
            return;
        }

        this.materials.forEach((mat, idx) => {
            const item = document.createElement('div');
            item.className = 'material-item';

            const swatch = document.createElement('div');
            swatch.className = 'material-swatch';
            if (mat.color) {
                swatch.style.backgroundColor = '#' + mat.color.getHexString();
            }

            const name = document.createElement('span');
            name.className = 'material-item-name';
            name.textContent = mat.name || `Material ${idx + 1}`;

            item.appendChild(swatch);
            item.appendChild(name);

            item.addEventListener('click', () => this._selectMaterial(mat));
            this.listEl.appendChild(item);
        });
    }

    _selectMaterial(mat) {
        this.selectedMaterial = mat;

        // Store original values
        if (!this.originalValues.has(mat.uuid)) {
            this.originalValues.set(mat.uuid, {
                color: mat.color ? mat.color.getHex() : 0xffffff,
                roughness: mat.roughness ?? 0.5,
                metalness: mat.metalness ?? 0,
                opacity: mat.opacity ?? 1,
                emissive: mat.emissive ? mat.emissive.getHex() : 0x000000,
            });
        }

        // Populate editor
        this.nameEl.textContent = mat.name || 'Unnamed';
        this.colorInput.value = mat.color ? '#' + mat.color.getHexString() : '#ffffff';
        this.roughnessInput.value = mat.roughness ?? 0.5;
        this.roughnessVal.textContent = (mat.roughness ?? 0.5).toFixed(2);
        this.metalnessInput.value = mat.metalness ?? 0;
        this.metalnessVal.textContent = (mat.metalness ?? 0).toFixed(2);
        this.opacityInput.value = mat.opacity ?? 1;
        this.opacityVal.textContent = (mat.opacity ?? 1).toFixed(2);
        this.emissiveInput.value = mat.emissive ? '#' + mat.emissive.getHexString() : '#000000';

        this._showEditor();
    }

    _showList() {
        this.listEl.style.display = '';
        this.editorEl.style.display = 'none';
    }

    _showEditor() {
        this.listEl.style.display = 'none';
        this.editorEl.style.display = '';
    }

    _resetMaterial() {
        if (!this.selectedMaterial) return;
        const orig = this.originalValues.get(this.selectedMaterial.uuid);
        if (!orig) return;

        this.selectedMaterial.color?.setHex(orig.color);
        this.selectedMaterial.roughness = orig.roughness;
        this.selectedMaterial.metalness = orig.metalness;
        this.selectedMaterial.opacity = orig.opacity;
        this.selectedMaterial.transparent = orig.opacity < 1;
        this.selectedMaterial.emissive?.setHex(orig.emissive);

        this._selectMaterial(this.selectedMaterial);
    }

    _loadTexture(file, texType) {
        const url = URL.createObjectURL(file);
        const loader = new THREE.TextureLoader();
        loader.load(url, (texture) => {
            texture.colorSpace = texType === 'map' ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
            if (this.selectedMaterial[texType]) {
                this.selectedMaterial[texType].dispose();
            }
            this.selectedMaterial[texType] = texture;
            this.selectedMaterial.needsUpdate = true;
            URL.revokeObjectURL(url);
        });
    }

    clear() {
        this.materials = [];
        this.selectedMaterial = null;
        this.originalValues.clear();
        this.listEl.innerHTML = '<div class="empty-state">No model loaded</div>';
        this._showList();
    }
}
