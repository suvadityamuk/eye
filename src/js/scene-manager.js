/**
 * scene-manager.js — Three.js scene lifecycle, cameras, controls, rendering
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class SceneManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.scene = new THREE.Scene();
        this.clock = new THREE.Clock();
        this.loadedModel = null;
        this.animationMixer = null;
        this.animationClips = [];

        this._initRenderer();
        this._initCamera();
        this._initControls();
        this._initLights();
        this._initHelpers();
        this._initEnvironment();

        this._boundAnimate = this._animate.bind(this);
        this._boundAnimate();
    }

    _initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false,
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.setClearColor(0x080808);
        this._resize();
    }

    _initCamera() {
        const w = this.canvas.clientWidth || 1;
        const h = this.canvas.clientHeight || 1;
        const aspect = w / h;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.01, 1000);
        this.camera.position.set(3, 2, 5);
    }

    _initControls() {
        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.screenSpacePanning = true;
        this.controls.minDistance = 0.1;
        this.controls.maxDistance = 500;
    }

    _initLights() {
        // Ambient
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(this.ambientLight);

        // Directional
        this.dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        this.dirLight.position.set(5, 8, 5);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.set(1024, 1024);
        this.scene.add(this.dirLight);

        // Point (off by default)
        this.pointLight = new THREE.PointLight(0xe63946, 1.0, 50);
        this.pointLight.position.set(0, 3, 0);
        this.pointLight.visible = false;
        this.scene.add(this.pointLight);
    }

    _initHelpers() {
        // Grid
        this.gridHelper = new THREE.GridHelper(20, 40, 0x222222, 0x151515);
        this.gridHelper.material.transparent = true;
        this.gridHelper.material.opacity = 0.6;
        this.scene.add(this.gridHelper);

        // Axes
        this.axesHelper = new THREE.AxesHelper(2);
        this.axesHelper.material.transparent = true;
        this.axesHelper.material.opacity = 0.5;
        this.scene.add(this.axesHelper);

        // Light helpers (off by default)
        this.dirLightHelper = new THREE.DirectionalLightHelper(this.dirLight, 1, 0xe63946);
        this.dirLightHelper.visible = false;
        this.scene.add(this.dirLightHelper);

        this.pointLightHelper = new THREE.PointLightHelper(this.pointLight, 0.5, 0xe63946);
        this.pointLightHelper.visible = false;
        this.scene.add(this.pointLightHelper);
    }

    _initEnvironment() {
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        pmremGenerator.compileEquirectangularShader();

        // Create a simple procedural environment
        const envScene = new THREE.Scene();
        const envGeo = new THREE.SphereGeometry(10, 32, 16);
        const envMat = new THREE.MeshBasicMaterial({
            side: THREE.BackSide,
            color: 0x111111,
        });

        // Add subtle gradient
        const envColors = envGeo.attributes.position.array;
        const colors = new Float32Array(envColors.length);
        for (let i = 0; i < envColors.length; i += 3) {
            const y = envColors[i + 1];
            const t = (y + 10) / 20;
            colors[i] = 0.02 + t * 0.05;
            colors[i + 1] = 0.02 + t * 0.04;
            colors[i + 2] = 0.03 + t * 0.06;
        }
        envGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        envMat.vertexColors = true;

        const envMesh = new THREE.Mesh(envGeo, envMat);
        envScene.add(envMesh);

        this.envMap = pmremGenerator.fromScene(envScene, 0.04).texture;
        this.scene.environment = this.envMap;
        pmremGenerator.dispose();
        envScene.clear();
    }

    _resize() {
        const parent = this.canvas.parentElement;
        if (!parent) return;
        const w = parent.clientWidth;
        const h = parent.clientHeight;
        // Skip if parent has no dimensions (hidden or not laid out yet)
        if (w === 0 || h === 0) return;
        const pixelRatio = this.renderer.getPixelRatio();
        const needsResize = this.canvas.width !== Math.floor(w * pixelRatio) ||
            this.canvas.height !== Math.floor(h * pixelRatio);
        if (needsResize) {
            this.renderer.setSize(w, h, false);
            if (this.camera) {
                this.camera.aspect = w / h;
                this.camera.updateProjectionMatrix();
            }
        }
    }

    _animate() {
        requestAnimationFrame(this._boundAnimate);
        this._resize();
        const delta = this.clock.getDelta();
        if (this.controls) this.controls.update();
        if (this.animationMixer) this.animationMixer.update(delta);
        if (this.dirLightHelper && this.dirLightHelper.visible) this.dirLightHelper.update();
        this.renderer.render(this.scene, this.camera);
    }

    /** Set the loaded object */
    setModel(object, clips = []) {
        this.clearModel();
        this.loadedModel = object;
        this.scene.add(object);
        this.animationClips = clips;

        if (clips.length > 0) {
            this.animationMixer = new THREE.AnimationMixer(object);
        }

        this.fitCameraToModel(object);
    }

    clearModel() {
        if (this.loadedModel) {
            this.scene.remove(this.loadedModel);
            this.loadedModel.traverse?.(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(m => {
                        Object.values(m).forEach(v => {
                            if (v instanceof THREE.Texture) v.dispose();
                        });
                        m.dispose();
                    });
                }
            });
            this.loadedModel = null;
        }
        if (this.animationMixer) {
            this.animationMixer.stopAllAction();
            this.animationMixer = null;
        }
        this.animationClips = [];
    }

    fitCameraToModel(object) {
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const distance = maxDim * 2;

        this.camera.position.set(
            center.x + distance * 0.5,
            center.y + distance * 0.4,
            center.z + distance * 0.7
        );
        this.controls.target.copy(center);
        this.controls.update();

        // Adjust near/far
        this.camera.near = maxDim * 0.001;
        this.camera.far = maxDim * 100;
        this.camera.updateProjectionMatrix();

        // Scale grid to model
        const gridSize = Math.max(maxDim * 3, 20);
        this.gridHelper.scale.setScalar(gridSize / 20);
    }

    resetCamera() {
        if (this.loadedModel) {
            this.fitCameraToModel(this.loadedModel);
        } else {
            this.camera.position.set(3, 2, 5);
            this.controls.target.set(0, 0, 0);
            this.controls.update();
        }
    }

    /** Get model stats */
    getModelStats() {
        if (!this.loadedModel) return null;
        let vertices = 0, triangles = 0, materialSet = new Set();
        this.loadedModel.traverse(child => {
            if (child.isMesh) {
                const geo = child.geometry;
                vertices += geo.attributes.position?.count || 0;
                if (geo.index) {
                    triangles += geo.index.count / 3;
                } else {
                    triangles += (geo.attributes.position?.count || 0) / 3;
                }
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(m => materialSet.add(m.name || m.uuid));
            }
            if (child.isPoints) {
                vertices += child.geometry.attributes.position?.count || 0;
            }
        });
        return {
            vertices: Math.round(vertices),
            triangles: Math.round(triangles),
            materials: materialSet.size,
            animations: this.animationClips.length,
        };
    }

    /** Get all materials in the model */
    getMaterials() {
        const materials = [];
        if (!this.loadedModel) return materials;
        const seen = new Set();
        this.loadedModel.traverse(child => {
            if (child.isMesh && child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(m => {
                    if (!seen.has(m.uuid)) {
                        seen.add(m.uuid);
                        materials.push(m);
                    }
                });
            }
        });
        return materials;
    }

    /** Toggle wireframe on all meshes */
    setWireframe(enabled) {
        if (!this.loadedModel) return;
        this.loadedModel.traverse(child => {
            if (child.isMesh && child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(m => { m.wireframe = enabled; });
            }
        });
    }

    /** Update directional light from azimuth/elevation */
    setDirLightDirection(azimuthDeg, elevationDeg) {
        const azimuth = THREE.MathUtils.degToRad(azimuthDeg);
        const elevation = THREE.MathUtils.degToRad(elevationDeg);
        const dist = 10;
        this.dirLight.position.set(
            dist * Math.cos(elevation) * Math.sin(azimuth),
            dist * Math.sin(elevation),
            dist * Math.cos(elevation) * Math.cos(azimuth)
        );
    }

    dispose() {
        this.clearModel();
        this.renderer.dispose();
        this.controls.dispose();
        if (this.envMap) this.envMap.dispose();
    }
}
