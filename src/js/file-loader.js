/**
 * file-loader.js — Multi-format 3D file loading
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const SUPPORTED_FORMATS = {
    'gltf': 'gltf', 'glb': 'gltf',
    'obj': 'obj',
    'mtl': 'mtl',
    'ply': 'ply',
    'fbx': 'fbx',
    'stl': 'stl',
    '3dm': '3dm',
    'pdb': 'pdb',
    'splat': 'splat',
    'spz': 'spz',
    'sog': 'sog',
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
            case 'pdb': return await loadPDB(url);
            case 'splat': return await loadSplat(file);
            case 'spz': return await loadSPZ(file);
            case 'sog': return await loadSOG(file);
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

/** OBJ (+ optional MTL companion) — dynamic import since not always needed */
async function loadOBJ(url, file, companionFiles) {
    const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js');

    // Check for companion MTL file
    const mtlFile = companionFiles.find(f => f.name.toLowerCase().endsWith('.mtl'));

    let materials = null;
    if (mtlFile) {
        const { MTLLoader } = await import('three/addons/loaders/MTLLoader.js');
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

/** PLY — dynamic import since not always needed */
async function loadPLY(url) {
    const { PLYLoader } = await import('three/addons/loaders/PLYLoader.js');
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

/** FBX — dynamic import since not always needed */
async function loadFBX(url) {
    const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
    const loader = new FBXLoader();
    return new Promise((resolve, reject) => {
        loader.load(url, (fbx) => {
            prepareMaterials(fbx);
            resolve({ object: fbx, clips: fbx.animations || [] });
        }, undefined, reject);
    });
}

/** STL — dynamic import since not always needed */
async function loadSTL(url) {
    const { STLLoader } = await import('three/addons/loaders/STLLoader.js');
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

/** PDB (Protein Data Bank) — ball-and-stick molecular visualization */
async function loadPDB(url) {
    const { PDBLoader } = await import('three/addons/loaders/PDBLoader.js');
    const loader = new PDBLoader();

    return new Promise((resolve, reject) => {
        loader.load(url, (pdb) => {
            const { geometryAtoms, geometryBonds, json } = pdb;
            const group = new THREE.Group();

            // --- Atoms: render as instanced spheres ---
            const atomPositions = geometryAtoms.getAttribute('position');
            const atomColors = geometryAtoms.getAttribute('color');
            const numAtoms = atomPositions.count;

            if (numAtoms > 0) {
                const sphereGeo = new THREE.IcosahedronGeometry(0.3, 2);
                const sphereMat = new THREE.MeshStandardMaterial({
                    roughness: 0.4,
                    metalness: 0.1,
                });
                const instancedAtoms = new THREE.InstancedMesh(sphereGeo, sphereMat, numAtoms);

                const dummy = new THREE.Object3D();
                const color = new THREE.Color();

                for (let i = 0; i < numAtoms; i++) {
                    dummy.position.set(
                        atomPositions.getX(i),
                        atomPositions.getY(i),
                        atomPositions.getZ(i)
                    );
                    dummy.updateMatrix();
                    instancedAtoms.setMatrixAt(i, dummy.matrix);
                    color.setRGB(
                        atomColors.getX(i),
                        atomColors.getY(i),
                        atomColors.getZ(i)
                    );
                    instancedAtoms.setColorAt(i, color);
                }

                instancedAtoms.instanceMatrix.needsUpdate = true;
                instancedAtoms.instanceColor.needsUpdate = true;
                group.add(instancedAtoms);
            }

            // --- Bonds: render as line segments ---
            const bondPositions = geometryBonds.getAttribute('position');
            if (bondPositions && bondPositions.count > 0) {
                const bondMat = new THREE.LineBasicMaterial({
                    color: 0x888888,
                    linewidth: 1,
                });
                const bonds = new THREE.LineSegments(geometryBonds, bondMat);
                group.add(bonds);
            }

            resolve({ object: group, clips: [] });
        }, undefined, reject);
    });
}

/**
 * Create a THREE.Points object from Gaussian point cloud data.
 * Shared by .splat, .spz, and .sog loaders.
 */
function createGaussianPointCloud(positions, colors, sizes) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

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

    return new THREE.Points(geometry, material);
}

/** Gaussian Splat (.splat) — basic point cloud rendering */
async function loadSplat(file) {
    const buffer = await file.arrayBuffer();
    const data = new DataView(buffer);

    // .splat format: each splat = 32 bytes
    // [x, y, z] float32 (12 bytes)
    // [scale_x, scale_y, scale_z] float32 (12 bytes)
    // [r, g, b, a] uint8 (4 bytes)
    // [rot_x, rot_y, rot_z, rot_w] uint8 (4 bytes)
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

        positions[i * 3] = data.getFloat32(offset, true);
        positions[i * 3 + 1] = data.getFloat32(offset + 4, true);
        positions[i * 3 + 2] = data.getFloat32(offset + 8, true);

        const sx = data.getFloat32(offset + 12, true);
        const sy = data.getFloat32(offset + 16, true);
        const sz = data.getFloat32(offset + 20, true);
        sizes[i] = Math.max((Math.abs(sx) + Math.abs(sy) + Math.abs(sz)) / 3, 0.001);

        colors[i * 3] = data.getUint8(offset + 24) / 255;
        colors[i * 3 + 1] = data.getUint8(offset + 25) / 255;
        colors[i * 3 + 2] = data.getUint8(offset + 26) / 255;
    }

    const points = createGaussianPointCloud(positions, colors, sizes);
    return { object: points, clips: [] };
}

/** SPZ — Niantic's compressed Gaussian Splat format (WASM-decoded) */
async function loadSPZ(file) {
    const { loadSpz } = await import('@spz-loader/core');
    const buffer = await file.arrayBuffer();
    const cloud = await loadSpz(new Uint8Array(buffer));

    if (!cloud || cloud.numPoints === 0) {
        throw new Error('Invalid or empty .spz file');
    }

    const n = cloud.numPoints;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);

    // cloud.positions is Float32Array [x0,y0,z0, x1,y1,z1, ...]
    // cloud.colors is Float32Array [r0,g0,b0, r1,g1,b1, ...] (0-255 range)
    // cloud.scales is Float32Array [sx0,sy0,sz0, ...]
    // cloud.alphas is Float32Array [a0, a1, ...] (0-255 range)
    for (let i = 0; i < n; i++) {
        // SPZ coordinate system is RUB (Right, Up, Back)
        // Three.js is RUF (Right, Up, Forward) — negate Z
        positions[i * 3] = cloud.positions[i * 3];
        positions[i * 3 + 1] = cloud.positions[i * 3 + 1];
        positions[i * 3 + 2] = -cloud.positions[i * 3 + 2];

        colors[i * 3] = cloud.colors[i * 3] / 255;
        colors[i * 3 + 1] = cloud.colors[i * 3 + 1] / 255;
        colors[i * 3 + 2] = cloud.colors[i * 3 + 2] / 255;

        const sx = cloud.scales[i * 3];
        const sy = cloud.scales[i * 3 + 1];
        const sz = cloud.scales[i * 3 + 2];
        sizes[i] = Math.max((Math.abs(sx) + Math.abs(sy) + Math.abs(sz)) / 3, 0.001);
    }

    const points = createGaussianPointCloud(positions, colors, sizes);
    return { object: points, clips: [] };
}

/** SOG — PlayCanvas Spatially Ordered Gaussians (zip of meta.json + WebP images) */
async function loadSOG(file) {
    const { unzipSync } = await import('fflate');
    const buffer = await file.arrayBuffer();
    const unzipped = unzipSync(new Uint8Array(buffer));

    // Find and parse meta.json
    const metaEntry = Object.keys(unzipped).find(k => k.endsWith('meta.json'));
    if (!metaEntry) {
        throw new Error('Invalid .sog file: missing meta.json');
    }
    const meta = JSON.parse(new TextDecoder().decode(unzipped[metaEntry]));

    // Helper: decode a WebP image from the zip into raw RGBA pixel data
    async function decodeImage(filename) {
        const entry = Object.keys(unzipped).find(k => k.endsWith(filename));
        if (!entry) return null;
        const blob = new Blob([unzipped[entry]], { type: 'image/webp' });
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        return {
            data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data,
            width: bitmap.width,
            height: bitmap.height,
        };
    }

    // Decode required images
    const [meansL, meansU, sh0Img] = await Promise.all([
        decodeImage('means_l.webp'),
        decodeImage('means_u.webp'),
        decodeImage('sh0.webp'),
    ]);

    if (!meansL || !meansU || !sh0Img) {
        throw new Error('Invalid .sog file: missing required WebP images (means_l, means_u, sh0)');
    }

    const numGaussians = meansL.width * meansL.height;
    const positions = new Float32Array(numGaussians * 3);
    const colors = new Float32Array(numGaussians * 3);
    const sizes = new Float32Array(numGaussians);

    // Position reconstruction from quantized 16-bit values
    // means_l.webp stores lower 8 bits (RGB = x,y,z), means_u.webp stores upper 8 bits
    // meta.json contains min/max ranges for dequantization
    const posMin = meta.means?.min ?? [0, 0, 0];
    const posMax = meta.means?.max ?? [1, 1, 1];

    for (let i = 0; i < numGaussians; i++) {
        const px = i * 4; // RGBA pixel offset

        for (let axis = 0; axis < 3; axis++) {
            const lo = meansL.data[px + axis];
            const hi = meansU.data[px + axis];
            const quantized = (hi << 8) | lo;
            const t = quantized / 65535;
            positions[i * 3 + axis] = posMin[axis] + t * (posMax[axis] - posMin[axis]);
        }

        // sh0.webp: RGB = base color, A = opacity
        colors[i * 3] = sh0Img.data[px] / 255;
        colors[i * 3 + 1] = sh0Img.data[px + 1] / 255;
        colors[i * 3 + 2] = sh0Img.data[px + 2] / 255;

        // Default point size (SOG doesn't directly give us sizes in a simple way)
        sizes[i] = 0.01;
    }

    // Try to decode scales if available
    const scalesImg = await decodeImage('scales.webp');
    if (scalesImg) {
        for (let i = 0; i < numGaussians; i++) {
            const px = i * 4;
            const sx = scalesImg.data[px] / 255;
            const sy = scalesImg.data[px + 1] / 255;
            const sz = scalesImg.data[px + 2] / 255;
            sizes[i] = Math.max((sx + sy + sz) / 3, 0.001) * 0.1;
        }
    }

    const points = createGaussianPointCloud(positions, colors, sizes);
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
