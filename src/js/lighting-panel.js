/**
 * lighting-panel.js — Scene lighting controls
 */
export class LightingPanel {
    constructor(sceneManager) {
        this.sm = sceneManager;
        this._bindEvents();
    }

    _bindEvents() {
        // Ambient
        const ambInt = document.getElementById('light-ambient-intensity');
        const ambIntVal = document.getElementById('light-ambient-intensity-val');
        ambInt.addEventListener('input', (e) => {
            this.sm.ambientLight.intensity = parseFloat(e.target.value);
            ambIntVal.textContent = parseFloat(e.target.value).toFixed(2);
        });

        const ambColor = document.getElementById('light-ambient-color');
        ambColor.addEventListener('input', (e) => {
            this.sm.ambientLight.color.set(e.target.value);
        });

        // Directional
        const dirInt = document.getElementById('light-dir-intensity');
        const dirIntVal = document.getElementById('light-dir-intensity-val');
        dirInt.addEventListener('input', (e) => {
            this.sm.dirLight.intensity = parseFloat(e.target.value);
            dirIntVal.textContent = parseFloat(e.target.value).toFixed(2);
        });

        const dirColor = document.getElementById('light-dir-color');
        dirColor.addEventListener('input', (e) => {
            this.sm.dirLight.color.set(e.target.value);
        });

        const dirAzimuth = document.getElementById('light-dir-azimuth');
        const dirAzimuthVal = document.getElementById('light-dir-azimuth-val');
        const dirElevation = document.getElementById('light-dir-elevation');
        const dirElevationVal = document.getElementById('light-dir-elevation-val');

        const updateDirPosition = () => {
            const az = parseFloat(dirAzimuth.value);
            const el = parseFloat(dirElevation.value);
            this.sm.setDirLightDirection(az, el);
            dirAzimuthVal.textContent = az + '°';
            dirElevationVal.textContent = el + '°';
        };

        dirAzimuth.addEventListener('input', updateDirPosition);
        dirElevation.addEventListener('input', updateDirPosition);

        // Point Light
        const ptEnabled = document.getElementById('light-point-enabled');
        ptEnabled.addEventListener('change', (e) => {
            this.sm.pointLight.visible = e.target.checked;
            this.sm.pointLightHelper.visible = e.target.checked && document.getElementById('light-show-helpers').checked;
        });

        const ptInt = document.getElementById('light-point-intensity');
        const ptIntVal = document.getElementById('light-point-intensity-val');
        ptInt.addEventListener('input', (e) => {
            this.sm.pointLight.intensity = parseFloat(e.target.value);
            ptIntVal.textContent = parseFloat(e.target.value).toFixed(2);
        });

        const ptColor = document.getElementById('light-point-color');
        ptColor.addEventListener('input', (e) => {
            this.sm.pointLight.color.set(e.target.value);
        });

        // Show helpers
        const showHelpers = document.getElementById('light-show-helpers');
        showHelpers.addEventListener('change', (e) => {
            this.sm.dirLightHelper.visible = e.target.checked;
            this.sm.pointLightHelper.visible = e.target.checked && this.sm.pointLight.visible;
        });

        // Environment intensity
        const envInt = document.getElementById('light-env-intensity');
        const envIntVal = document.getElementById('light-env-intensity-val');
        envInt.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.sm.scene.environmentIntensity = val;
            envIntVal.textContent = val.toFixed(2);
        });
    }
}
