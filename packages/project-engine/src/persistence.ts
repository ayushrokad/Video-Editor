/**
 * @frameflow/project-engine - IndexedDB Persistence & Recovery
 * Hardened with idempotent DB initialization and change-based persistence.
 */

import type { ProjectModel } from '../../shared-types/src/index.ts';

const DB_NAME = 'frameflow_db';
const DB_VERSION = 1;
const STORE_NAME = 'projects';
const ACTIVE_PROJECT_KEY = 'active_project_id';

export class PersistenceManager {
  private db: IDBDatabase | null = null;
  private openPromise: Promise<boolean> | null = null;
  private lastSavedHashes = new Map<string, string>();

  async init(): Promise<boolean> {
    if (this.db) return true;
    if (typeof window === 'undefined' || !window.indexedDB) {
      return false;
    }
    if (this.openPromise) return this.openPromise;

    this.openPromise = new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = (e: any) => {
        this.db = e.target.result;
        resolve(true);
      };

      request.onerror = () => {
        this.openPromise = null;
        console.warn('[FRAMEFLOW Persistence] IndexedDB open error');
        resolve(false);
      };
    });

    return this.openPromise;
  }

  private computeHash(project: ProjectModel): string {
    return JSON.stringify(project, (k, v) => (k === 'modifiedAt' ? undefined : v));
  }

  async saveProject(project: ProjectModel, { force = false } = {}): Promise<boolean> {
    const hash = this.computeHash(project);
    if (!force && this.lastSavedHashes.get(project.id) === hash) {
      return true; // Skip unchanged write
    }

    if (!this.db) {
      try {
        localStorage.setItem(`ff_project_${project.id}`, JSON.stringify(project));
        localStorage.setItem(ACTIVE_PROJECT_KEY, project.id);
        this.lastSavedHashes.set(project.id, hash);
        return true;
      } catch {
        return false;
      }
    }

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(project);

        tx.oncomplete = () => {
          localStorage.setItem(ACTIVE_PROJECT_KEY, project.id);
          this.lastSavedHashes.set(project.id, hash);
          resolve(true);
        };
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  async loadLastActiveProject(): Promise<ProjectModel | null> {
    const lastId = typeof localStorage !== 'undefined' ? localStorage.getItem(ACTIVE_PROJECT_KEY) : null;
    if (!lastId) return null;

    if (!this.db) {
      try {
        const data = localStorage.getItem(`ff_project_${lastId}`);
        if (!data) return null;
        const parsed = JSON.parse(data);
        this.lastSavedHashes.set(parsed.id, this.computeHash(parsed));
        return parsed;
      } catch {
        return null;
      }
    }

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(lastId);

        req.onsuccess = () => {
          const result = req.result || null;
          if (result) this.lastSavedHashes.set(result.id, this.computeHash(result));
          resolve(result);
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
}
