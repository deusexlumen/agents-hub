/**
 * State Persistence Layer v7.0
 * 
 * Thread-safe State Management mit async-mutex
 * - Atomic State Transitions
 * - Session-scoped Locking
 * - Append-Only Log für Recovery
 * 
 * @module state-persistence
 * @version 7.0.0
 */

import { Mutex } from 'async-mutex';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Logger } from './logger.js';

// ============================================================================
// Schemas
// ============================================================================

export const StateUpdateSchema = z.object({
  memory: z.array(z.string().min(1).max(2000)).max(50).default([]),
  status: z.enum([
    'idle', 'ready', 'planning', 'executing', 'reviewing', 'completed', 'error', 'paused'
  ]),
  next_step: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1).default(0.5),
  metadata: z.object({
    timestamp: z.string().datetime().optional(),
    source: z.string().max(100).optional(),
    agentId: z.string().optional(),
    taskId: z.string().optional()
  }).optional()
});

// ============================================================================
// Lock Manager - Thread-safe Session Locking
// ============================================================================

/**
 * @typedef {Object} LockAcquireResult
 * @property {Function} release - Funktion zum Freigeben des Locks
 * @property {string} lockId - Eindeutige Lock-ID
 * @property {number} acquiredAt - Timestamp des Lock-Erwerbs
 */

/**
 * LockManager - Verwaltet Mutex-Locks pro Session
 */
export class LockManager {
  constructor() {
    /** @type {Map<string, Mutex>} */
    this.locks = new Map();
    /** @type {Map<string, Array<{lockId: string, acquiredAt: number}>>} */
    this.lockHistory = new Map();
    this.logger = new Logger({ context: { component: 'LockManager' } });
  }

  /**
   * Erhält oder erstellt einen Mutex für eine Session
   * @param {string} sessionId - Session-ID
   * @returns {Mutex} Mutex-Instanz
   */
  getMutex(sessionId) {
    if (!this.locks.has(sessionId)) {
      this.locks.set(sessionId, new Mutex());
      this.lockHistory.set(sessionId, []);
      this.logger.debug(`Created new mutex for session: ${sessionId}`);
    }
    return this.locks.get(sessionId);
  }

  /**
   * Erwirb einen Lock für eine Session
   * @param {string} sessionId - Session-ID
   * @param {number} timeoutMs - Timeout in Millisekunden (default: 30000)
   * @returns {Promise<LockAcquireResult>}
   * @throws {Error} Bei Lock-Timeout
   */
  async acquire(sessionId, timeoutMs = 30000) {
    const mutex = this.getMutex(sessionId);
    const lockId = crypto.randomUUID();
    
    const acquirePromise = mutex.acquire();
    
    // Timeout-Handling
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(
          `Lock acquisition timeout for session ${sessionId} after ${timeoutMs}ms. ` +
          `Possible deadlock or long-running operation.`
        ));
      }, timeoutMs);
    });

    try {
      const release = await Promise.race([acquirePromise, timeoutPromise]);
      const acquiredAt = Date.now();
      
      // Track lock
      const history = this.lockHistory.get(sessionId) || [];
      history.push({ lockId, acquiredAt });
      this.lockHistory.set(sessionId, history);

      this.logger.debug(`Lock acquired: ${lockId} for session ${sessionId}`);

      return {
        release: () => {
          release();
          this.logger.debug(`Lock released: ${lockId} for session ${sessionId}`);
        },
        lockId,
        acquiredAt
      };
    } catch (error) {
      this.logger.error(`Lock acquisition failed: ${error.message}`, { sessionId });
      throw error;
    }
  }

  /**
   * Führt eine Funktion mit Lock aus
   * @param {string} sessionId - Session-ID
   * @param {Function} fn - Auszuführende Funktion
   * @param {number} timeoutMs - Lock-Timeout
   * @returns {Promise<any>}
   */
  async withLock(sessionId, fn, timeoutMs = 30000) {
    const lock = await this.acquire(sessionId, timeoutMs);
    try {
      return await fn();
    } finally {
      lock.release();
    }
  }

  /**
   * Prüft ob eine Session gelockt ist
   * @param {string} sessionId - Session-ID
   * @returns {boolean}
   */
  isLocked(sessionId) {
    const mutex = this.locks.get(sessionId);
    return mutex ? mutex.isLocked() : false;
  }

  /**
   * Gibt Statistiken zurück
   * @returns {Object}
   */
  getStats() {
    const stats = {
      totalSessions: this.locks.size,
      lockedSessions: 0,
      lockHistory: {}
    };

    for (const [sessionId, mutex] of this.locks) {
      if (mutex.isLocked()) {
        stats.lockedSessions++;
      }
      const history = this.lockHistory.get(sessionId) || [];
      stats.lockHistory[sessionId] = history.length;
    }

    return stats;
  }

  /**
   * Bereinigt Locks für eine Session
   * @param {string} sessionId - Session-ID
   */
  cleanup(sessionId) {
    this.locks.delete(sessionId);
    this.lockHistory.delete(sessionId);
    this.logger.debug(`Cleaned up locks for session: ${sessionId}`);
  }
}

// Globaler LockManager-Instance
export const globalLockManager = new LockManager();

// ============================================================================
// Transaction - Atomic State Updates
// ============================================================================

/**
 * @typedef {Object} TransactionResult
 * @property {boolean} success - Ob die Transaktion erfolgreich war
 * @property {Object} [data] - Die geschriebenen Daten bei Erfolg
 * @property {Error} [error] - Fehler bei Misserfolg
 * @property {string} transactionId - Eindeutige Transaktions-ID
 */

/**
 * Transaction - Kapselt atomare State-Updates
 */
export class Transaction {
  constructor(sessionId, persistence) {
    this.sessionId = sessionId;
    this.persistence = persistence;
    this.transactionId = crypto.randomUUID();
    this.operations = [];
    this.committed = false;
    this.rolledBack = false;
  }

  /**
   * Fügt eine Write-Operation hinzu
   * @param {string} filePath - Zieldatei
   * @param {Object} data - Zu schreibende Daten
   */
  addWrite(filePath, data) {
    if (this.committed || this.rolledBack) {
      throw new Error('Transaction already finalized');
    }
    this.operations.push({ type: 'write', filePath, data });
  }

  /**
   * Führt die Transaktion aus
   * @returns {Promise<TransactionResult>}
   */
  async commit() {
    if (this.committed || this.rolledBack) {
      throw new Error('Transaction already finalized');
    }

    const lock = await globalLockManager.acquire(this.sessionId, 30000);
    
    try {
      // Write-Ahead-Log Eintrag
      const walEntry = {
        transactionId: this.transactionId,
        timestamp: Date.now(),
        operations: this.operations,
        status: 'pending'
      };

      // WAL schreiben
      const walPath = path.join(
        this.persistence.config.stateDir,
        'wal',
        `${this.transactionId}.json`
      );
      
      this.persistence._ensureDir(path.dirname(walPath));
      fs.writeFileSync(walPath, JSON.stringify(walEntry, null, 2));

      // Atomare Operationen ausführen
      for (const op of this.operations) {
        if (op.type === 'write') {
          this.persistence._atomicWrite(op.filePath, op.data);
        }
      }

      // WAL als committed markieren
      walEntry.status = 'committed';
      fs.writeFileSync(walPath, JSON.stringify(walEntry, null, 2));

      this.committed = true;

      return {
        success: true,
        data: { operations: this.operations.length },
        transactionId: this.transactionId
      };

    } catch (error) {
      await this.rollback();
      return {
        success: false,
        error,
        transactionId: this.transactionId
      };
    } finally {
      lock.release();
    }
  }

  /**
   * Rollback der Transaktion
   * @returns {Promise<boolean>}
   */
  async rollback() {
    this.rolledBack = true;
    
    // Cleanup WAL
    const walPath = path.join(
      this.persistence.config.stateDir,
      'wal',
      `${this.transactionId}.json`
    );
    
    if (fs.existsSync(walPath)) {
      const walEntry = JSON.parse(fs.readFileSync(walPath, 'utf8'));
      walEntry.status = 'rolled_back';
      fs.writeFileSync(walPath, JSON.stringify(walEntry, null, 2));
    }

    return true;
  }
}

// ============================================================================
// State Persistence
// ============================================================================

/**
 * @typedef {Object} StatePersistenceConfig
 * @property {string} stateDir - Verzeichnis für State-Dateien
 * @property {number} autosaveInterval - Autosave-Intervall in ms
 * @property {number} maxCheckpoints - Maximale Anzahl Checkpoints
 * @property {boolean} useTransactions - Transaktionen aktivieren
 */

export class StatePersistence {
  /**
   * @param {StatePersistenceConfig} config 
   */
  constructor(config = {}) {
    /** @type {StatePersistenceConfig} */
    this.config = {
      stateDir: config.stateDir || './session_state',
      autosaveInterval: config.autosaveInterval || 5 * 60 * 1000,
      maxCheckpoints: config.maxCheckpoints || 50,
      useTransactions: config.useTransactions !== false,
      ...config
    };
    
    this.currentState = null;
    this.sessionId = null;
    this.autosaveTimer = null;
    this.lockManager = globalLockManager;
    this.logger = new Logger({ context: { component: 'StatePersistence' } });
    
    this._ensureDirectories();
  }

  // -------------------------------------------------------------------------
  // Atomic State Operations
  // -------------------------------------------------------------------------

  /**
   * Validiert und wendet State-Update atomar an
   * @param {Object} jsonOutput - Das zu validierende JSON
   * @returns {Promise<Object>} - Ergebnis der Operation
   * @throws {StateValidationError} Bei Validierungsfehlern
   */
  async validateAndApplyState(jsonOutput) {
    this._ensureSession();

    return this.lockManager.withLock(this.sessionId, async () => {
      try {
        // Validierung
        const validated = StateUpdateSchema.parse(jsonOutput);
        
        // Atomares Update
        await this._applyStateAtomically(validated);
        
        this.logger.info('State updated atomically', {
          sessionId: this.sessionId,
          status: validated.status,
          memoryEntries: validated.memory.length
        });

        return {
          success: true,
          applied: validated,
          state: this.getCurrentState(),
          timestamp: Date.now()
        };

      } catch (error) {
        if (error instanceof z.ZodError) {
          const issues = error.issues.map(issue => ({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code
          }));
          
          this.logger.error('State validation failed', { issues });
          
          throw new StateValidationError(
            `Validation failed: ${issues.map(i => `${i.path}: ${i.message}`).join('; ')}`,
            issues,
            jsonOutput
          );
        }
        throw error;
      }
    }, 30000);
  }

  /**
   * Speichert State mit Lock
   * @param {Object} stateUpdate - Zu speichernder State
   * @returns {Promise<Object>}
   */
  async saveState(stateUpdate) {
    return this.lockManager.withLock(this.sessionId, async () => {
      const stateHash = this._generateStateHash(stateUpdate);
      
      const persistedState = {
        ...stateUpdate,
        sessionId: this.sessionId,
        persistedAt: Date.now(),
        stateHash
      };

      if (this.config.useTransactions) {
        const tx = new Transaction(this.sessionId, this);
        const statePath = path.join(
          this.config.stateDir,
          'active',
          `session_${this.sessionId}.json`
        );
        tx.addWrite(statePath, persistedState);
        await tx.commit();
      } else {
        const statePath = path.join(
          this.config.stateDir,
          'active',
          `session_${this.sessionId}.json`
        );
        this._atomicWrite(statePath, persistedState);
      }

      this.logger.debug('State saved atomically', { sessionId: this.sessionId, stateHash });
      
      return persistedState;
    }, 30000);
  }

  /**
   * Liest State mit Lock
   * @returns {Promise<Object|null>}
   */
  async readState() {
    if (!this.sessionId) return null;
    
    return this.lockManager.withLock(this.sessionId, async () => {
      const statePath = path.join(
        this.config.stateDir,
        'active',
        `session_${this.sessionId}.json`
      );
      
      if (!fs.existsSync(statePath)) {
        return null;
      }
      
      return JSON.parse(fs.readFileSync(statePath, 'utf8'));
    }, 10000);
  }

  // -------------------------------------------------------------------------
  // Session Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Initialisiert eine neue Session
   * @param {string} userIntent - User-Intent für die Session
   * @param {string} workflowType - Typ des Workflows
   * @returns {string} Session-ID
   */
  initSession(userIntent, workflowType = 'generic') {
    this.sessionId = crypto.randomUUID();
    const now = new Date().toISOString();
    
    this.currentState = {
      metadata: {
        session_id: this.sessionId,
        created_at: now,
        updated_at: now,
        version: '7.0.0',
        user_intent: userIntent,
        workflow_type: workflowType
      },
      state: {
        status: 'idle',
        next_step: 'initialize',
        confidence: 1.0,
        memory: [],
        iteration_count: 0
      },
      metrics: {
        total_tokens_used: 0,
        total_messages: 0,
        validation_errors: 0,
        checkpoints_created: 0,
        lock_acquisitions: 0
      }
    };
    
    this._persistState();
    this._startAutosave();
    
    this.logger.info('Session initialized', { sessionId: this.sessionId, workflowType });
    
    return this.sessionId;
  }

  /**
   * Schließt Session und bereinigt Locks
   * @param {string} finalStatus - Finaler Status
   * @returns {Object} Session-Summary
   */
  closeSession(finalStatus = 'completed') {
    this._ensureSession();
    this._stopAutosave();
    
    // Finalen Checkpoint erstellen
    this.createCheckpoint('session_closed');
    
    // Archivieren
    this._archiveSession(finalStatus);
    
    // Locks bereinigen
    this.lockManager.cleanup(this.sessionId);
    
    const summary = this._generateSessionSummary();
    
    this.logger.info('Session closed', { sessionId: this.sessionId, finalStatus });
    
    this.currentState = null;
    this.sessionId = null;
    
    return summary;
  }

  // -------------------------------------------------------------------------
  // Checkpoints
  // -------------------------------------------------------------------------

  /**
   * Erstellt einen Checkpoint
   * @param {string} reason - Grund für den Checkpoint
   * @returns {string} Checkpoint-ID
   */
  createCheckpoint(reason) {
    this._ensureSession();
    
    const checkpointId = `checkpoint_${this.sessionId}_${Date.now()}`;
    const checkpointPath = path.join(
      this.config.stateDir,
      'recovery',
      `${checkpointId}.json`
    );
    
    const checkpoint = {
      checkpointId,
      sessionId: this.sessionId,
      timestamp: Date.now(),
      reason,
      state: JSON.parse(JSON.stringify(this.currentState))
    };
    
    this._atomicWrite(checkpointPath, checkpoint);
    
    this.currentState.metrics.checkpoints_created++;
    
    this.logger.debug('Checkpoint created', { checkpointId, reason });
    
    return checkpointId;
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------

  async _applyStateAtomically(validated) {
    this.currentState.state.status = validated.status;
    this.currentState.state.next_step = validated.next_step;
    this.currentState.state.confidence = validated.confidence;
    this.currentState.state.iteration_count++;
    
    if (validated.memory?.length > 0) {
      this.currentState.state.memory = [
        ...this.currentState.state.memory,
        ...validated.memory
      ].slice(-50);
    }
    
    this.currentState.metadata.updated_at = new Date().toISOString();
    this.currentState.metrics.lock_acquisitions++;
    
    await this._persistState();
  }

  _atomicWrite(filePath, data) {
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    this._ensureDir(path.dirname(filePath));
    
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  }

  _ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  _ensureDirectories() {
    const dirs = [
      path.join(this.config.stateDir, 'active'),
      path.join(this.config.stateDir, 'archived'),
      path.join(this.config.stateDir, 'recovery'),
      path.join(this.config.stateDir, 'wal')
    ];
    
    dirs.forEach(dir => this._ensureDir(dir));
  }

  _ensureSession() {
    if (!this.currentState || !this.sessionId) {
      throw new Error('No active session. Call initSession() first.');
    }
  }

  _persistState() {
    if (!this.currentState) return;
    
    const statePath = path.join(
      this.config.stateDir,
      'active',
      `session_${this.sessionId}.json`
    );
    
    this._atomicWrite(statePath, this.currentState);
  }

  _startAutosave() {
    this._stopAutosave();
    
    if (this.config.autosaveInterval > 0) {
      this.autosaveTimer = setInterval(() => {
        this._persistState();
        this.logger.debug('Autosaved state', { sessionId: this.sessionId });
      }, this.config.autosaveInterval);
    }
  }

  _stopAutosave() {
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }

  _generateStateHash(state) {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(state))
      .digest('hex')
      .substring(0, 16);
  }

  _generateSessionSummary() {
    return {
      session_id: this.sessionId,
      duration_minutes: this.currentState?.context?.session_duration_minutes || 0,
      final_status: this.currentState?.state?.status,
      metrics: this.currentState?.metrics || {},
      memory_entries: this.currentState?.state?.memory?.length || 0
    };
  }

  _archiveSession(finalStatus) {
    const archiveDir = path.join(
      this.config.stateDir,
      'archived',
      new Date().toISOString().slice(0, 7)
    );
    
    this._ensureDir(archiveDir);
    
    const archiveData = {
      ...this.currentState,
      metadata: {
        ...this.currentState.metadata,
        archived_at: new Date().toISOString(),
        final_status: finalStatus
      }
    };
    
    const archivePath = path.join(archiveDir, `session_${this.sessionId}.json`);
    this._atomicWrite(archivePath, archiveData);
    
    const activePath = path.join(
      this.config.stateDir,
      'active',
      `session_${this.sessionId}.json`
    );
    
    if (fs.existsSync(activePath)) {
      fs.unlinkSync(activePath);
    }
  }

  getCurrentState() {
    return this.currentState;
  }

  getSessionId() {
    return this.sessionId;
  }
}

// ============================================================================
// State Validation Error
// ============================================================================

export class StateValidationError extends Error {
  constructor(message, issues, rawPayload) {
    super(message);
    this.name = 'StateValidationError';
    this.code = 'STATE_VALIDATION_FAILED';
    this.issues = issues;
    this.rawPayload = rawPayload;
    this.timestamp = new Date().toISOString();
  }

  getRetryPrompt() {
    const issuesList = this.issues.map(i => `- ${i.path}: ${i.message}`).join('\n');
    return `Your previous state update was invalid. Please fix these issues:\n\n${issuesList}\n\nRespond ONLY with valid JSON.`;
  }
}

// ============================================================================
// Exports
// ============================================================================

export { StatePersistence, LockManager, Transaction, globalLockManager };
export default StatePersistence;