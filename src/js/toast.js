/**
 * toast.js — Shared toast notification utility
 */

/**
 * Show a toast notification.
 * @param {string} message — Text to display
 * @param {'info'|'success'|'warning'|'error'} type — Toast type
 */
export function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
