/**
 * EYE — Local File History Store
 * Uses IndexedDB to store previously viewed 3D files entirely on the client.
 * No data is sent to or stored on any server.
 */

const DB_NAME = 'eye-3d-history';
const DB_VERSION = 1;
const STORE_NAME = 'files';
const MAX_HISTORY = 30;

class HistoryStore {
    constructor() {
        this.db = null;
        this._ready = this._open();
    }

    async _open() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('name', 'name', { unique: false });
                }
            };
            req.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };
            req.onerror = (e) => {
                console.warn('IndexedDB failed, history disabled', e);
                reject(e);
            };
        });
    }

    async ready() {
        await this._ready;
    }

    /**
     * Save a file to history. Stores the raw file blob + metadata.
     * @param {File} file — the original File object
     */
    async save(file) {
        await this.ready();
        const ext = file.name.split('.').pop().toLowerCase();

        // Check for existing entry with same name + size (dedup)
        const existing = await this._findByNameAndSize(file.name, file.size);
        if (existing) {
            // Move to top by updating timestamp
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                existing.timestamp = Date.now();
                const putReq = store.put(existing);
                putReq.onsuccess = () => resolve(putReq.result);
                putReq.onerror = () => reject(putReq.error);
            });
        }

        const blob = await file.arrayBuffer().then(buf => new Blob([buf], { type: file.type || 'application/octet-stream' }));
        const entry = {
            name: file.name,
            ext: ext,
            size: file.size,
            blob: blob,
            timestamp: Date.now(),
        };

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const addReq = store.add(entry);
            addReq.onsuccess = () => {
                resolve(addReq.result);
                this._trimOldEntries();
            };
            addReq.onerror = () => reject(addReq.error);
        });
    }

    /**
     * Find an existing entry by name and size (for dedup).
     */
    async _findByNameAndSize(name, size) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const idx = store.index('name');
            const req = idx.getAll(name);
            req.onsuccess = () => {
                const match = req.result.find(e => e.size === size);
                resolve(match || null);
            };
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Get all history entries (metadata only, no blob), newest first.
     */
    async getAll() {
        await this.ready();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();
            req.onsuccess = () => {
                const items = req.result.map(({ id, name, ext, size, timestamp }) => ({
                    id, name, ext, size, timestamp,
                }));
                items.sort((a, b) => b.timestamp - a.timestamp);
                resolve(items);
            };
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Get a full entry (including blob) by ID.
     */
    async getById(id) {
        await this.ready();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Remove a history entry by ID.
     */
    async remove(id) {
        await this.ready();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Clear all history.
     */
    async clearAll() {
        await this.ready();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Keep only the most recent MAX_HISTORY entries.
     */
    async _trimOldEntries() {
        const items = await this.getAll();
        if (items.length <= MAX_HISTORY) return;
        const toRemove = items.slice(MAX_HISTORY);
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const item of toRemove) {
            store.delete(item.id);
        }
    }
}

export const historyStore = new HistoryStore();
