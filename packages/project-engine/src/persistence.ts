/**
 * @frameflow/project-engine - IndexedDB Persistence & Recovery
 */

import type { ProjectModel } from '../../shared-types/src/index.ts';

const DB_NAME = 'frameflow_db';
const DB_VERSION = 1;
const STORE_NAME = 'projects';
const ACTIVE_PROJECT_KEY = 'active_project_id';

export class PersistenceManager {
  private db: IDBDatabase | null = null;

  async init(): Promise<boolean> {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return false;
    }

    return new Promise((resolve) => {
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
        console.warn('[FRAMEFLOW Persistence] IndexedDB open error');
        resolve(false);
      };
    });
  }

  async saveProject(project: ProjectModel): Promise<boolean> {
    if (!this.db) {
      // Fallback to localStorage if IndexedDB is not ready
      try {
        localStorage.setItem(`ff_project_${project.id}`, JSON.stringify(project));
        localStorage.setItem(ACTIVE_PROJECT_KEY, project.id);
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
        return data ? JSON.parse(data) : null;
      } catch {
        return null;
      }
    }

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(lastId);

        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
}
