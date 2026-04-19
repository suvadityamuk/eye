/**
 * keyboard-controls.js — 6DOF keyboard input handler
 * Tracks pressed keys and produces per-frame movement deltas.
 * Movement keys require Shift held down to avoid conflicts with existing shortcuts.
 */
import * as THREE from 'three';

// Key → action mapping (all lowercase)
const MOVEMENT_KEYS = {
    // Shift + key → translate
    'w': 'translateForward',
    's': 'translateBackward',
    'a': 'translateLeft',
    'd': 'translateRight',
    'e': 'translateUp',
    'q': 'translateDown',
    // Roll (also requires Shift)
    'z': 'rollCCW',
    'x': 'rollCW',
};

const ROTATION_KEYS = {
    'arrowleft': 'yawLeft',
    'arrowright': 'yawRight',
    'arrowup': 'pitchUp',
    'arrowdown': 'pitchDown',
};

// Opposing rotation keys — pressing one cancels the other
const OPPOSING_ROTATION = {
    'arrowleft': 'arrowright',
    'arrowright': 'arrowleft',
    'arrowup': 'arrowdown',
    'arrowdown': 'arrowup',
};

const ZOOM_KEYS = {
    '=': 'zoomIn',
    '+': 'zoomIn',
    '-': 'zoomOut',
};

export class KeyboardControls {
    constructor() {
        this.pressedKeys = new Set();
        this.enabled = true;

        // Speeds (units per second)
        this.translateSpeed = 3.0;
        this.rotateSpeed = 1.5;   // radians per second
        this.zoomSpeed = 4.0;

        // Pre-allocated scratch vectors for update() (avoids per-frame allocations)
        this._translate = new THREE.Vector3();
        this._rotate = new THREE.Vector3();

        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        this._onBlur = this._onBlur.bind(this);

        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('keyup', this._onKeyUp);
        window.addEventListener('blur', this._onBlur);
    }

    _shouldIgnore(e) {
        const tag = e.target.tagName;
        return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    }

    _onKeyDown(e) {
        if (this._shouldIgnore(e)) return;
        const key = e.key.toLowerCase();

        // Movement keys require Shift
        if (e.shiftKey && MOVEMENT_KEYS[key]) {
            e.preventDefault();
            this.pressedKeys.add('shift+' + key);
        }
        // Rotation keys (no shift needed)
        if (ROTATION_KEYS[key]) {
            e.preventDefault();
            // Cancel the opposing direction if it was stuck
            const opposing = OPPOSING_ROTATION[key];
            if (opposing) this.pressedKeys.delete(opposing);
            this.pressedKeys.add(key);
        }
        // Zoom keys (no shift needed)
        if (ZOOM_KEYS[key]) {
            e.preventDefault();
            this.pressedKeys.add(key);
        }
    }

    _onKeyUp(e) {
        const key = e.key.toLowerCase();

        // Remove both shifted and unshifted versions
        this.pressedKeys.delete('shift+' + key);
        this.pressedKeys.delete(key);

        // When shift is released, clear all shift+ keys
        if (key === 'shift') {
            for (const k of [...this.pressedKeys]) {
                if (k.startsWith('shift+')) {
                    this.pressedKeys.delete(k);
                }
            }
        }
    }

    /**
     * Compute per-frame deltas. Call once per animation frame.
     * @param {number} delta — seconds since last frame
     * @returns {{ translate: THREE.Vector3, rotate: THREE.Vector3, zoom: number } | null}
     *   null if no keys pressed
     */
    update(delta) {
        if (!this.enabled || this.pressedKeys.size === 0) return null;

        const translate = this._translate.set(0, 0, 0);
        const rotate = this._rotate.set(0, 0, 0);
        let zoom = 0;

        const tSpeed = this.translateSpeed * delta;
        const rSpeed = this.rotateSpeed * delta;
        const zSpeed = this.zoomSpeed * delta;

        for (const key of this.pressedKeys) {
            switch (key) {
                // Translation (Shift + key)
                case 'shift+w': translate.z -= tSpeed; break;
                case 'shift+s': translate.z += tSpeed; break;
                case 'shift+a': translate.x -= tSpeed; break;
                case 'shift+d': translate.x += tSpeed; break;
                case 'shift+e': translate.y += tSpeed; break;
                case 'shift+q': translate.y -= tSpeed; break;

                // Rotation
                case 'arrowleft':  rotate.y += rSpeed; break;
                case 'arrowright': rotate.y -= rSpeed; break;
                case 'arrowup':    rotate.x += rSpeed; break;
                case 'arrowdown':  rotate.x -= rSpeed; break;

                // Roll (Shift + key)
                case 'shift+z': rotate.z += rSpeed; break;
                case 'shift+x': rotate.z -= rSpeed; break;

                // Zoom
                case '=': case '+': zoom += zSpeed; break;
                case '-': zoom -= zSpeed; break;
            }
        }

        // Return null if nothing happened
        if (translate.lengthSq() === 0 && rotate.lengthSq() === 0 && zoom === 0) {
            return null;
        }

        return { translate, rotate, zoom };
    }

    _onBlur() {
        // Clear all keys when window loses focus to prevent stuck keys
        this.pressedKeys.clear();
    }

    dispose() {
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('keyup', this._onKeyUp);
        window.removeEventListener('blur', this._onBlur);
        this.pressedKeys.clear();
    }
}
