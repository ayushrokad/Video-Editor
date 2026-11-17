/**
 * FRAMEFLOW Intelligent Project Autosave & Dirty-State Manager (Phases 1–8)
 *
 * Strictly manages ONLY persistent Project Document saves (metadata, sequences, tracks,
 * clips, effects, transitions, audio/color settings, graphics, keyframes, markers, assets).
 *
 * Workspace preferences and temporary editor interactions NEVER enter this pipeline.
 *
 * Features:
 *  - Monotonic document revision tracking (currentRevision vs lastSavedRevision)
 *  - Content-fingerprint change detection (setting a value to its existing value is a no-op)
 *  - 1.5s debounced autosave with rapid-edit coalescing
 *  - Serialized async save queue (prevents concurrent write races & captures mid-save edits)
 *  - Manual Save (Ctrl+S / Cmd+S) cancelling debounce & skipping unchanged saves
 *  - Honest 6-state status machine: saved | unsaved | saving | failed | offline | recovering
 *  - Safe error handling preserving in-memory edits + Retry without duplicates
 *  - Live Save Diagnostics telemetry
 */

export const AUTOSAVE_DEBOUNCE_MS = 1500;

export class ProjectAutosaveManager {
  constructor({
    getDocumentFingerprint,
    persistDocument,
    debounceMs = AUTOSAVE_DEBOUNCE_MS,
    onStatusChange = () => {},
  }) {
    this._getFingerprint = getDocumentFingerprint;
    this._persistDocument = persistDocument;
    this.debounceMs = debounceMs;
    this.onStatusChange = onStatusChange;

    this.currentRevision = 0;
    this.lastSavedRevision = 0;
    this._lastCommittedFingerprint = this._getFingerprint();
    this._lastDirtyFingerprint = this._lastCommittedFingerprint;

    this.status = 'saved'; // 'saved' | 'unsaved' | 'saving' | 'failed' | 'offline' | 'recovering'
    this.lastSavedAt = null;
    this.lastSaveDurationMs = 0;
    this.lastError = null;
    this.isOffline = false;

    this._debounceTimer = null;
    this._inFlightPromise = null;
    this._inFlightRevision = null;
    this._pendingFollowUp = false;
    this._pendingReason = 'autosave';

    this.stats = {
      totalSaves: 0,
      skippedUnnecessarySaves: 0,
      failedSaves: 0,
      retries: 0,
      debouncedEdits: 0,
    };
  }

  /**
   * Resets baseline after loading or opening a persisted project (does NOT trigger a save).
   */
  resetBaseline({ savedAt = null, revision = 0 } = {}) {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = null;
    this._pendingFollowUp = false;
    this.currentRevision = revision;
    this.lastSavedRevision = revision;
    this._lastCommittedFingerprint = this._getFingerprint();
    this._lastDirtyFingerprint = this._lastCommittedFingerprint;
    this.lastSavedAt = savedAt;
    this.lastError = null;
    this._setStatus(this.isOffline ? 'offline' : 'saved');
  }

  hasPendingChanges() {
    if (this.currentRevision > this.lastSavedRevision) return true;
    const currFp = this._getFingerprint();
    return currFp !== this._lastCommittedFingerprint;
  }

  setOffline(offline) {
    this.isOffline = Boolean(offline);
    if (this.isOffline && this.status === 'saved') {
      this._setStatus('offline');
    } else if (!this.isOffline && this.status === 'offline') {
      this._setStatus(this.hasPendingChanges() ? 'unsaved' : 'saved');
    }
  }

  setRecovering(recovering) {
    if (recovering) {
      this._setStatus('recovering');
    } else {
      this._setStatus(this.hasPendingChanges() ? 'unsaved' : (this.isOffline ? 'offline' : 'saved'));
    }
  }

  /**
   * Marks the Project Document modified ONLY if persistent project content actually changed.
   * Setting a value to its existing value is ignored cleanly (no revision bump, no save).
   */
  markProjectModified(reason = 'edit', { scheduleAutosave = true } = {}) {
    const currFp = this._getFingerprint();

    // No-op if content equals the last committed state and no pending edits exist
    if (currFp === this._lastCommittedFingerprint && this.currentRevision === this.lastSavedRevision) {
      this.stats.skippedUnnecessarySaves++;
      return { changed: false, revision: this.currentRevision };
    }

    // No-op if content did not change since the last dirty check (value set to same value)
    if (currFp === this._lastDirtyFingerprint && this.currentRevision > this.lastSavedRevision) {
      return { changed: false, revision: this.currentRevision };
    }

    // If user undid back to exact last-saved state, clear dirty status cleanly
    if (currFp === this._lastCommittedFingerprint) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
      this._lastDirtyFingerprint = currFp;
      this.currentRevision = this.lastSavedRevision;
      this.lastError = null;
      this._setStatus(this.isOffline ? 'offline' : 'saved');
      return { changed: false, revision: this.currentRevision };
    }

    this._lastDirtyFingerprint = currFp;
    this.currentRevision++;
    this._pendingReason = reason;
    this.lastError = null;

    if (this._inFlightPromise) {
      // Edit occurred while a save is already running -> queue serialized follow-up!
      this._pendingFollowUp = true;
      this.stats.debouncedEdits++;
      return { changed: true, revision: this.currentRevision, queuedDuringSave: true };
    }

    this._setStatus('unsaved');

    if (scheduleAutosave) {
      if (this._debounceTimer) {
        clearTimeout(this._debounceTimer);
        this.stats.debouncedEdits++;
      }
      this._debounceTimer = setTimeout(() => {
        this._debounceTimer = null;
        this.saveNow({ reason: this._pendingReason, manual: false });
      }, this.debounceMs);
    }

    return { changed: true, revision: this.currentRevision };
  }

  /**
   * Executes a serialized save immediately (used by autosave timer, Ctrl+S, project switch, unload).
   * Skips completely with 0 DB writes if nothing changed.
   */
  async saveNow({ reason = 'manual-save', manual = false, isRetry = false } = {}) {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = null;

    // Detect any direct mutation that bypassed markProjectModified()
    const currFp = this._getFingerprint();
    if (currFp !== this._lastCommittedFingerprint && this.currentRevision === this.lastSavedRevision) {
      this.currentRevision++;
      this._lastDirtyFingerprint = currFp;
    }

    if (!this.hasPendingChanges()) {
      this.stats.skippedUnnecessarySaves++;
      if (this.status !== 'saving') {
        this._setStatus(this.isOffline ? 'offline' : 'saved');
      }
      return { saved: false, skipped: true, revision: this.lastSavedRevision };
    }

    if (isRetry) {
      this.stats.retries++;
    }

    // If a save is already in-flight, mark follow-up and await completion cleanly
    if (this._inFlightPromise) {
      this._pendingFollowUp = true;
      this._pendingReason = reason;
      return this._inFlightPromise;
    }

    return this._runSerializedSaveLoop(reason, manual);
  }

  async retrySave() {
    return this.saveNow({ reason: 'retry-save', manual: true, isRetry: true });
  }

  async _runSerializedSaveLoop(initialReason, manual) {
    let reason = initialReason;
    let lastResult = { saved: false, skipped: true, revision: this.lastSavedRevision };

    const loopPromise = (async () => {
      while (true) {
        this._pendingFollowUp = false;
        const targetRev = this.currentRevision;
        const targetFp = this._getFingerprint();

        if (targetRev <= this.lastSavedRevision && targetFp === this._lastCommittedFingerprint) {
          this.stats.skippedUnnecessarySaves++;
          this._setStatus(this.isOffline ? 'offline' : 'saved');
          return lastResult;
        }

        this._inFlightRevision = targetRev;
        this._setStatus('saving');
        const startMs = typeof performance !== 'undefined' ? performance.now() : Date.now();

        try {
          const ok = await this._persistDocument({
            revision: targetRev,
            reason,
            manual,
          });
          if (ok === false) {
            throw new Error('Database transaction did not complete');
          }

          const endMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
          this.lastSaveDurationMs = Math.max(0, Math.round((endMs - startMs) * 10) / 10);

          // Never regress saved revision if somehow out-of-order
          if (targetRev >= this.lastSavedRevision) {
            this.lastSavedRevision = targetRev;
            this._lastCommittedFingerprint = targetFp;
            this.lastSavedAt = Date.now();
          }

          this.stats.totalSaves++;
          this.lastError = null;
          lastResult = {
            saved: true,
            skipped: false,
            revision: this.lastSavedRevision,
            durationMs: this.lastSaveDurationMs,
          };

          // If new edits arrived while this save was running, immediately persist the latest revision!
          if (this._pendingFollowUp || this.currentRevision > this.lastSavedRevision || this._getFingerprint() !== this._lastCommittedFingerprint) {
            reason = this._pendingReason || 'follow-up-autosave';
            manual = false;
            continue;
          }

          this._setStatus(this.isOffline ? 'offline' : 'saved');
          return lastResult;
        } catch (err) {
          this.stats.failedSaves++;
          this.lastError = err instanceof Error ? err.message : String(err || 'Unknown storage error');
          // Keep currentRevision > lastSavedRevision so document remains dirty & in-memory edits stay safe!
          this._setStatus('failed');
          return {
            saved: false,
            failed: true,
            error: this.lastError,
            revision: this.lastSavedRevision,
          };
        }
      }
    })();

    this._inFlightPromise = loopPromise;
    try {
      return await loopPromise;
    } finally {
      this._inFlightPromise = null;
      this._inFlightRevision = null;
    }
  }

  getDiagnostics() {
    return {
      status: this.status,
      currentRevision: this.currentRevision,
      lastSavedRevision: this.lastSavedRevision,
      pendingChanges: this.hasPendingChanges(),
      lastSavedAt: this.lastSavedAt,
      lastSaveDurationMs: this.lastSaveDurationMs,
      lastError: this.lastError,
      totalSaves: this.stats.totalSaves,
      skippedUnnecessarySaves: this.stats.skippedUnnecessarySaves,
      failedSaves: this.stats.failedSaves,
      retries: this.stats.retries,
      debouncedEdits: this.stats.debouncedEdits,
    };
  }

  _setStatus(nextStatus) {
    this.status = nextStatus;
    this.onStatusChange(this.getDiagnostics());
  }
}

