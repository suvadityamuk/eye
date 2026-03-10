/**
 * file-loader.js — Multi-format 3D file loading
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

const SUPPORTED_FORMATS = {
    'gltf': 'gltf', 'glb': 'gltf',
    'obj': 'obj',
    'mtl': 'mtl',
    'ply': 'ply',
    'fbx': 'fbx',
    'stl': 'stl',
    '3dm': '3dm',
    'splat': 'splat',
    'usd': 'usd', 'usda': 'usd', 'usdc': 'usd', 'usdz': 'usd',
};

const USD_EXTENSIONS = ['usd', 'usda', 'usdc', 'usdz'];

/**
 * Returns the format type for a filename.
 */
export function getFormatType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return SUPPORTED_FORMATS[ext] || null;
}

/**
 * Check if this is a USD file (coming soon)
 */
export function isUSDFormat(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return USD_EXTENSIONS.includes(ext);
}

/**
 * Load a file and return { object: THREE.Object3D, clips: AnimationClip[] }
 */
export async function loadFile(file, companionFiles = []) {
    const ext = file.name.split('.').pop().toLowerCase();
    const formatType = SUPPORTED_FORMATS[ext];

    if (!formatType) {
        throw new Error(`Unsupported format: .${ext}`);
    }

    if (formatType === 'usd') {
        throw new Error('USD_COMING_SOON');
    }

    const url = URL.createObjectURL(file);

    try {
        switch (formatType) {
            case 'gltf': return await loadGLTF(url, file);
            case 'obj': return await loadOBJ(url, file, companionFiles);
            case 'ply': return await loadPLY(url);
            case 'fbx': return await loadFBX(url);
            case 'stl': return await loadSTL(url);
            case '3dm': return await load3DM(url);
            case 'splat': return await loadSplat(file);
            default: throw new Error(`No loader for format: ${formatType}`);
        }
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** GLTF / GLB */
async function loadGLTF(url) {
    const loader = new GLTFLoader();

    // Setup DRACO decoder for compressed meshes
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    loader.setDRACOLoader(dracoLoader);

    return new Promise((resolve, reject) => {
        loader.load(url, (gltf) => {
            const model = gltf.scene || gltf.scenes[0];
            prepareMaterials(model);
            resolve({ object: model, clips: gltf.animations || [] });
        }, undefined, reject);
    });
}

/** OBJ (+ optional MTL companion) */
async function loadOBJ(url, file, companionFiles) {
    // Check for companion MTL file
    const mtlFile = companionFiles.find(f => f.name.toLowerCase().endsWith('.mtl'));

    let materials = null;
    if (mtlFile) {
        const mtlUrl = URL.createObjectURL(mtlFile);
        const mtlLoader = new MTLLoader();
        materials = await new Promise((resolve, reject) => {
            mtlLoader.load(mtlUrl, (mtl) => {
                mtl.preload();
                resolve(mtl);
            }, undefined, reject);
        });
        URL.revokeObjectURL(mtlUrl);
    }

    const objLoader = new OBJLoader();
    if (materials) objLoader.setMaterials(materials);

    return new Promise((resolve, reject) => {
        objLoader.load(url, (obj) => {
            // Assign default material if none
            obj.traverse(child => {
                if (child.isMesh && !child.material.isMeshStandardMaterial) {
                    child.material = new THREE.MeshStandardMaterial({
                        color: child.material.color || 0xcccccc,
                        roughness: 0.6,
                        metalness: 0.1,
                    });
                }
            });
            prepareMaterials(obj);
            resolve({ object: obj, clips: [] });
        }, undefined, reject);
    });
}

/** PLY */
async function loadPLY(url) {
    const loader = new PLYLoader();
    return new Promise((resolve, reject) => {
        loader.load(url, (geometry) => {
            geometry.computeVertexNormals();
            let object;

            if (geometry.attributes.color) {
                // Point cloud or colored mesh
                if (geometry.index) {
                    const material = new THREE.MeshStandardMaterial({
                        vertexColors: true,
                        roughness: 0.6,
                        metalness: 0.1,
                    });
                    object = new THREE.Mesh(geometry, material);
                } else {
                    const material = new THREE.PointsMaterial({
                        size: 0.01,
                        vertexColors: true,
                        sizeAttenuation: true,
                    });
                    object = new THREE.Points(geometry, material);
                }
            } else {
                const material = new THREE.MeshStandardMaterial({
                    color: 0xcccccc,
                    roughness: 0.5,
                    metalness: 0.2,
                });
                object = new THREE.Mesh(geometry, material);
            }

            resolve({ object, clips: [] });
        }, undefined, reject);
    });
}

/** FBX */
async function loadFBX(url) {
    const loader = new FBXLoader();
    return new Promise((resolve, reject) => {
        loader.load(url, (fbx) => {
            prepareMaterials(fbx);
            resolve({ object: fbx, clips: fbx.animations || [] });
        }, undefined, reject);
    });
}

/** STL */
async function loadSTL(url) {
    const loader = new STLLoader();
    return new Promise((resolve, reject) => {
        loader.load(url, (geometry) => {
            geometry.computeVertexNormals();
            const material = new THREE.MeshStandardMaterial({
                color: 0xcccccc,
                roughness: 0.4,
                metalness: 0.3,
            });
            const mesh = new THREE.Mesh(geometry, material);
            resolve({ object: mesh, clips: [] });
        }, undefined, reject);
    });
}

/** 3DM (Rhino) — dynamic import since it's less common */
async function load3DM(url) {
    const { Rhino3dmLoader } = await import('three/addons/loaders/3DMLoader.js');
    const loader = new Rhino3dmLoader();
    loader.setLibraryPath('https://cdn.jsdelivr.net/npm/rhino3dm@8.4.0/');

    return new Promise((resolve, reject) => {
        loader.load(url, (object) => {
            prepareMaterials(object);
            resolve({ object, clips: [] });
        }, undefined, reject);
    });
}

/** Gaussian Splat (.splat) — basic point cloud rendering */
async function loadSplat(file) {
    const buffer = await file.arrayBuffer();
    const data = new DataView(buffer);

    // .splat format: each splat = 32 bytes
    // [x, y, z] float32 (12 bytes)
    // [scale_x, scale_y, scale_z] float32 (12 bytes)  — we skip these for basic rendering
    // [r, g, b, a] uint8 (4 bytes)
    // [rot_x, rot_y, rot_z, rot_w] uint8 (4 bytes) — we skip these
    const splatSize = 32;
    const numSplats = Math.floor(buffer.byteLength / splatSize);

    if (numSplats === 0) {
        throw new Error('Invalid or empty .splat file');
    }

    const positions = new Float32Array(numSplats * 3);
    const colors = new Float32Array(numSplats * 3);
    const sizes = new Float32Array(numSplats);

    for (let i = 0; i < numSplats; i++) {
        const offset = i * splatSize;

        // Position
        positions[i * 3] = data.getFloat32(offset, true);
        positions[i * 3 + 1] = data.getFloat32(offset + 4, true);
        positions[i * 3 + 2] = data.getFloat32(offset + 8, true);

        // Scale (use average for point size)
        const sx = data.getFloat32(offset + 12, true);
        const sy = data.getFloat32(offset + 16, true);
        const sz = data.getFloat32(offset + 20, true);
        sizes[i] = Math.max((Math.abs(sx) + Math.abs(sy) + Math.abs(sz)) / 3, 0.001);

        // Color (RGBA uint8)
        colors[i * 3] = data.getUint8(offset + 24) / 255;
        colors[i * 3 + 1] = data.getUint8(offset + 25) / 255;
        colors[i * 3 + 2] = data.getUint8(offset + 26) / 255;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // Custom shader for variable-size points
    const material = new THREE.ShaderMaterial({
        uniforms: {
            pointScale: { value: 500.0 },
        },
        vertexShader: `
            attribute float size;
            varying vec3 vColor;
            uniform float pointScale;
            void main() {
                vColor = color;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = size * pointScale / -mvPosition.z;
                gl_PointSize = clamp(gl_PointSize, 1.0, 64.0);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            void main() {
                // Circular point with soft edge
                vec2 coord = gl_PointCoord - vec2(0.5);
                float dist = length(coord);
                if (dist > 0.5) discard;
                float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
                gl_FragColor = vec4(vColor, alpha);
            }
        `,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    return { object: points, clips: [] };
}

/**
 * Ensure all materials are MeshStandardMaterial for editing
 */
function prepareMaterials(object) {
    object.traverse(child => {
        if (child.isMesh && child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((m, i) => {
                if (!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial) {
                    const stdMat = new THREE.MeshStandardMaterial({
                        color: m.color || 0xcccccc,
                        roughness: 0.5,
                        metalness: 0.1,
                        name: m.name || `Material_${i}`,
                    });
                    if (m.map) stdMat.map = m.map;
                    if (m.normalMap) stdMat.normalMap = m.normalMap;
                    if (Array.isArray(child.material)) {
                        child.material[i] = stdMat;
                    } else {
                        child.material = stdMat;
                    }
                }
            });
        }
    });
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
