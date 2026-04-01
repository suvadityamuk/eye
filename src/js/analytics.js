/**
 * analytics.js — Google Analytics 4 integration for EYE
 *
 * Wraps gtag.js with helper methods for tracking key user interactions.
 * Replace the MEASUREMENT_ID below with your GA4 Measurement ID (G-XXXXXXXXXX).
 */

// ─── CONFIGURATION ─────────────────────────────────────────────────
const MEASUREMENT_ID = 'G-YN62X3EDQV';  // ← Replace with your GA4 ID

// ─── INITIALISATION ────────────────────────────────────────────────
let _initialised = false;

function _initGA() {
    if (_initialised) return;
    if (MEASUREMENT_ID === 'G-XXXXXXXXXX') {
        console.warn('[Analytics] Using placeholder Measurement ID — analytics will not send data. Replace MEASUREMENT_ID in analytics.js.');
    }

    // Inject the gtag.js script
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
    document.head.appendChild(script);

    // Initialise the dataLayer and gtag function
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', MEASUREMENT_ID, {
        send_page_view: true,
    });

    _initialised = true;
}

// Boot GA on module load
_initGA();

// ─── CORE TRACKING ─────────────────────────────────────────────────

/**
 * Send a custom event to GA4.
 * @param {string} eventName  — GA4 event name (snake_case, max 40 chars)
 * @param {Object} [params]   — Optional event parameters
 */
export function trackEvent(eventName, params = {}) {
    if (typeof window.gtag !== 'function') return;
    window.gtag('event', eventName, params);
}

// ─── DOMAIN-SPECIFIC HELPERS ───────────────────────────────────────

/**
 * Track a 3D file being loaded.
 * @param {string} format  — File format (e.g. 'glb', 'obj')
 * @param {number} sizeBytes — File size in bytes
 * @param {string} method  — 'upload', 'drop', or 'history'
 */
export function trackFileLoad(format, sizeBytes, method = 'upload') {
    trackEvent('file_load', {
        file_format: format.toLowerCase(),
        file_size_kb: Math.round(sizeBytes / 1024),
        load_method: method,
    });
}

/**
 * Track a model export.
 * @param {string} sourceFormat — Original format
 * @param {string} exportFormat — Exported-to format
 */
export function trackExport(sourceFormat, exportFormat) {
    trackEvent('model_export', {
        source_format: sourceFormat.toLowerCase(),
        export_format: exportFormat.toLowerCase(),
    });
}

/**
 * Track a feature being toggled or used.
 * @param {string} feature — Feature name (e.g. 'comparison_mode', 'wireframe')
 * @param {Object} [extra] — Additional parameters
 */
export function trackFeatureUsed(feature, extra = {}) {
    trackEvent('feature_used', {
        feature_name: feature,
        ...extra,
    });
}

/**
 * Track a render mode change.
 * @param {string} mode — The render mode selected (e.g. 'pbr', 'normals')
 */
export function trackRenderMode(mode) {
    trackEvent('render_mode_change', {
        render_mode: mode,
    });
}

/**
 * Track theme toggle.
 * @param {string} theme — 'dark' or 'light'
 */
export function trackThemeToggle(theme) {
    trackEvent('theme_toggle', {
        theme: theme,
    });
}

/**
 * Track a camera capture.
 * @param {string} format — Image format (png, jpeg, webp)
 * @param {number} resolution — Resolution multiplier (1, 2, 4)
 */
export function trackCameraCapture(format, resolution) {
    trackEvent('camera_capture', {
        image_format: format,
        resolution_scale: resolution,
    });
}

/**
 * Track measurement usage.
 * @param {string} unit — Unit system used
 */
export function trackMeasurement(unit) {
    trackEvent('measurement_taken', {
        unit: unit,
    });
}

/**
 * Track keyboard shortcut usage.
 * @param {string} shortcut — Key combo (e.g. 'r', 'shift+p')
 */
export function trackShortcut(shortcut) {
    trackEvent('keyboard_shortcut', {
        shortcut: shortcut,
    });
}
