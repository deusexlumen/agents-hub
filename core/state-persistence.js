/**
 * State Persistence Layer v4.0
 * 
 * Refactored: Tag-basiertes Parsing ersetzt durch strikt validiertes JSON-Handling
 * - Zod Schema-Validierung für State-Updates
 * - Typensicheres JSON statt Regex-Extraktion
 * - Präzise Exceptions für Orchestrator-Handling
 * 
 * @module state-persistence
 * @version 4.0.0
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { z } = require('zod');

// ============================================================================
// Zod Schemas für strikte Validierung
// ============================================================================

/**
 * Schema für Memory-Einträge
 */
const MemoryEntrySchema = z.object({
  description: z.string(),
  timestamp: z.string().datetime()
});

/**
 * Schema für gelernte Patterns
 */
const LearnedPatternSchema = z.object({
  name: z.string(),
  description: z.string(),
  learned_at: z.string().datetime()
});

/**
 * Schema für Memory-Updates
 */
const MemoryUpdateSchema = z.object({
  key_decisions: z.array(z.string()).optional(),
  user_preferences: z.record(z.any()).optional(),
  technical_constraints: z.array(z.string()).optional(),
  learned_patterns: z.array(
    z.object({
      name: z.string(),
      description: z.string()
    })
  ).optional()
});

/**
 * Schema für State-Updates
 * Ersetzt das alte <UPDATE_STATE> Tag-Parsing
 */
const StateUpdateSchema = z.object({
  memory: z.array(z.string()).optional(),
  state: z.object({}).catchall(z.any()).optional(),
  current_phase: z.enum(['discovery', 'planning', 'execution', 'review', 'delivery']).optional(),
  phase_data: z.object({}).catchall(z.any()).optional(),
  metrics: z.object({}).catchall(z.number()).optional()
});

/**
 * Schema für vollständige State-Updates (intern)
 */
const FullStateUpdateSchema = z.object({
  memory: MemoryUpdateSchema.optional(),
  state: z.object({
    current_phase: z.enum(['discovery', 'planning', 'execution', 'review', 'delivery']).optional(),
    phase_data: z.record(z.any()).optional(),
    metrics: z.record(z.number()).optional()
  }).optional()
});

// ============================================================================
// Default State Structure
// ============================================================================

const DEFAULT_STATE = {
  metadata: {
    session_id: null,
    created_at: null,
    updated_at: null,
    version: '4.0.0',
    checkpoint_count: 0
  },
  context: {
    workflow_type: 'software-dev',
    current_phase: 'discovery',
    completed_phases: [],
    user_intent: null,
    session_duration_minutes: 0
  },
  phases: {
    discovery: { status: 'pending', data: {}, started_at: null, completed_at: null },
    planning: { status: 'pending', data: {}, started_at: null, completed_at: null },
    execution: { status: 'pending', data: {}, started_at: null, completed_at: null },
    review: { status: 'pending', data: {}, started_at: null, completed_at: null },
    delivery: { status: 'pending', data: {}, started_at: null, completed_at: null }
  },
  memory: {
    key_decisions: [],
    user_preferences: {},
    technical_constraints: [],
    learned_patterns: [],
    phase_summaries: {}
  },
  templates: {
    loaded: [],
    relevant_sections: [],
    last_loaded: null
  },
  metrics: {
    total_tokens_used: 0,
    total_messages: 0,
    phases_completed: 0,
    context_pruning_events: 0,
    errors_encountered: 0,
    checkpoints_created: 0
  }
};

// ============================================================================
// Custom Exceptions für Orchestrator
// ============================================================================

class StateValidationError extends Error {
  constructor(message, issues) {
    super(message);
    this.name = 'StateValidationError';
    this.issues = issues;
    this.code = 'VALIDATION_FAILED';
  }
}

class StateUpdateError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'StateUpdateError';
    this.cause = cause;
    this.code = 'UPDATE_FAILED';
  }
}

// ============================================================================
// State Persistence Class
// ============================================================================

class StatePersistence {
  constructor(config = {}) {
    this.config = {
      stateDir: config.stateDir || './session_state',
      autosaveInterval: config.autosaveInterval || 5 * 60 * 1000,
      maxCheckpoints: config.maxCheckpoints || 50
    };
    
    this.currentState = null;
    this.sessionId = null;
    this.autosaveTimer = null;
    
    this._ensureDirectories();
  }

  // -------------------------------------------------------------------------
  // NEU: Schema-basierte State-Update-Verarbeitung
  // -------------------------------------------------------------------------

  /**
   * Verarbeitet State-Updates mit strikter Schema-Validierung
   * Ersetzt das alte Tag-basierte Parsing (<UPDATE_STATE>, <UPDATE_MEMORY>)
   * 
   * @param {Object} payload - Das zu validierende Update-Objekt
   * @returns {Object} - Das validierte und angewendete Update
   * @throws {StateValidationError} - Bei Schema-Verletzungen
   * @throws {StateUpdateError} - Bei Anwendungsfehlern
   */
  processStateUpdate(payload) {
    this._ensureSession();

    try {
      // Strikt validierung mit Zod
      const validated = StateUpdateSchema.parse(payload);
      
      // Memory-Updates verarbeiten (Array von Strings)
      if (validated.memory && Array.isArray(validated.memory)) {
        validated.memory.forEach(item => {
          this.currentState.memory.key_decisions.push({
            description: item,
            timestamp: new Date().toISOString()
          });
        });
      }

      // State-Updates verarbeiten (Schlüssel-Wert-Paare)
      if (validated.state && typeof validated.state === 'object') {
        this._applyStateChanges(validated.state);
      }

      // Phase-Updates
      if (validated.current_phase) {
        this._transitionPhase(validated.current_phase);
      }

      // Phase-Daten
      if (validated.phase_data) {
        this._updatePhaseData(validated.phase_data);
      }

      // Metrics
      if (validated.metrics) {
        this._updateMetrics(validated.metrics);
      }

      this._updateTimestamp();
      this._persistState();

      console.log(`[StatePersistence] State update processed successfully`);
      return validated;

    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code
        }));
        
        throw new StateValidationError(
          `State update validation failed: ${issues.map(i => `${i.path}: ${i.message}`).join(', ')}`,
          issues
        );
      }
      
      throw new StateUpdateError(
        `Failed to process state update: ${error.message}`,
        error
      );
    }
  }

  /**
   * Validiert ein State-Update ohne es anzuwenden
   * Nützlich für Pre-flight Checks
   * 
   * @param {Object} payload - Das zu validierende Objekt
   * @returns {Object} - Validation result { valid: boolean, errors?: Array }
   */
  validateStateUpdate(payload) {
    const result = StateUpdateSchema.safeParse(payload);
    
    if (result.success) {
      return { valid: true, data: result.data };
    } else {
      return {
        valid: false,
        errors: result.error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message
        }))
      };
    }
  }

  // -------------------------------------------------------------------------
  // State Modification Helpers
  // -------------------------------------------------------------------------

  _applyStateChanges(stateChanges) {
    Object.entries(stateChanges).forEach(([key, value]) => {
      // Nur erlaubte Top-Level-Keys aktualisieren
      const allowedKeys = ['context', 'templates', 'metrics'];
      
      if (allowedKeys.includes(key) && this.currentState[key]) {
        if (typeof value === 'object' && !Array.isArray(value)) {
          this.currentState[key] = {
            ...this.currentState[key],
            ...value
          };
        } else {
          this.currentState[key] = value;
        }
      }
    });
  }

  _transitionPhase(newPhase) {
    const oldPhase = this.currentState.context.current_phase;
    
    if (oldPhase === newPhase) return;
    
    if (!this.currentState.phases[newPhase]) {
      throw new StateUpdateError(`Invalid phase: ${newPhase}`);
    }
    
    // Alte Phase abschließen
    this.currentState.phases[oldPhase].status = 'completed';
    this.currentState.phases[oldPhase].completed_at = new Date().toISOString();
    this.currentState.context.completed_phases.push(oldPhase);
    
    // Neue Phase aktivieren
    this.currentState.phases[newPhase].status = 'active';
    this.currentState.phases[newPhase].started_at = new Date().toISOString();
    this.currentState.context.current_phase = newPhase;
    
    this.currentState.metrics.phases_completed++;
    
    console.log(`[StatePersistence] Phase transition: ${oldPhase} → ${newPhase}`);
  }

  _updatePhaseData(phaseData) {
    Object.entries(phaseData).forEach(([phase, data]) => {
      if (this.currentState.phases[phase]) {
        this.currentState.phases[phase].data = {
          ...this.currentState.phases[phase].data,
          ...data
        };
      }
    });
  }

  _updateMetrics(metrics) {
    Object.entries(metrics).forEach(([key, value]) => {
      if (typeof value === 'number' && this.currentState.metrics[key] !== undefined) {
        this.currentState.metrics[key] = value;
      }
    });
  }

  // -------------------------------------------------------------------------
  // Legacy Methods (für Rückwärtskompatibilität)
  // -------------------------------------------------------------------------

  /**
   * @deprecated Verwende stattdessen processStateUpdate()
   */
  updateMemory(updates) {
    console.warn('[StatePersistence] updateMemory() is deprecated. Use processStateUpdate() instead.');
    
    if (!updates || typeof updates !== 'object') {
      return;
    }

    const payload = {
      memory: updates.key_decisions || []
    };

    // Konvertiere altes Format zu neuem
    if (updates.user_preferences) {
      payload.state = { user_preferences: updates.user_preferences };
    }

    this.processStateUpdate(payload);
  }

  /**
   * @deprecated Verwende stattdessen processStateUpdate()
   */
  applyStateUpdates(updates) {
    console.warn('[StatePersistence] applyStateUpdates() is deprecated. Use processStateUpdate() instead.');
    
    if (!updates || typeof updates !== 'object') {
      return;
    }

    const payload = {
      current_phase: updates.current_phase,
      phase_data: updates.phase_data,
      metrics: updates.metrics
    };

    this.processStateUpdate(payload);
  }

  // -------------------------------------------------------------------------
  // Session Lifecycle (unverändert)
  // -------------------------------------------------------------------------

  initSession(userIntent, workflowType = null) {
    this.sessionId = this._generateSessionId();
    const now = new Date().toISOString();
    
    this.currentState = JSON.parse(JSON.stringify(DEFAULT_STATE));
    this.currentState.metadata.session_id = this.sessionId;
    this.currentState.metadata.created_at = now;
    this.currentState.metadata.updated_at = now;
    this.currentState.context.user_intent = userIntent;
    this.currentState.context.workflow_type = workflowType || this._detectWorkflow(userIntent);
    
    this.currentState.phases.discovery.status = 'active';
    this.currentState.phases.discovery.started_at = now;
    
    this._persistState();
    this._startAutosave();
    
    console.log(`[StatePersistence] Session initialized: ${this.sessionId}`);
    return this.sessionId;
  }

  loadSession(sessionId) {
    let statePath = path.join(this.config.stateDir, 'active', `session_${sessionId}.json`);
    
    if (!fs.existsSync(statePath)) {
      const candidates = this._findSessionByPartialId(sessionId);
      if (candidates.length === 1) {
        statePath = candidates[0];
      } else if (candidates.length > 1) {
        throw new Error(`Ambiguous session ID: ${sessionId} matches multiple sessions`);
      }
    }
    
    if (!fs.existsSync(statePath)) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    this.currentState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    this.sessionId = this.currentState.metadata.session_id;
    
    this._startAutosave();
    
    console.log(`[StatePersistence] Session loaded: ${this.sessionId}`);
    return this.currentState;
  }

  getRecoverableSessions() {
    const activeDir = path.join(this.config.stateDir, 'active');
    
    if (!fs.existsSync(activeDir)) {
      return [];
    }
    
    const files = fs.readdirSync(activeDir)
      .filter(f => f.startsWith('session_') && f.endsWith('.json'));
    
    return files.map(file => {
      const state = JSON.parse(fs.readFileSync(path.join(activeDir, file), 'utf8'));
      return {
        session_id: state.metadata.session_id,
        created_at: state.metadata.created_at,
        updated_at: state.metadata.updated_at,
        current_phase: state.context.current_phase,
        user_intent: state.context.user_intent,
        duration_minutes: state.context.session_duration_minutes
      };
    }).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }

  closeSession(finalStatus = 'completed') {
    this._ensureSession();
    
    this._stopAutosave();
    
    this.createCheckpoint('session_closed');
    this._archiveSession(finalStatus);
    
    const summary = this._generateSessionSummary();
    
    this.currentState = null;
    this.sessionId = null;
    
    console.log(`[StatePersistence] Session closed`);
    return summary;
  }

  // -------------------------------------------------------------------------
  // Checkpoints (unverändert)
  // -------------------------------------------------------------------------

  createCheckpoint(reason) {
    this._ensureSession();
    
    const checkpoint = {
      session_id: this.sessionId,
      timestamp: new Date().toISOString(),
      reason: reason,
      state: JSON.parse(JSON.stringify(this.currentState))
    };
    
    const checkpointId = `checkpoint_${this.sessionId}_${Date.now()}`;
    const checkpointPath = path.join(
      this.config.stateDir,
      'recovery',
      `${checkpointId}.json`
    );
    
    this._atomicWrite(checkpointPath, checkpoint);
    
    this.currentState.metadata.checkpoint_count++;
    this.currentState.metrics.checkpoints_created++;
    
    console.log(`[StatePersistence] Checkpoint created: ${reason}`);
    return checkpointId;
  }

  restoreCheckpoint(checkpointId) {
    const checkpointPath = path.join(
      this.config.stateDir,
      'recovery',
      `${checkpointId}.json`
    );
    
    if (!fs.existsSync(checkpointPath)) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }
    
    const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
    this.currentState = checkpoint.state;
    this.sessionId = checkpoint.session_id;
    
    this._updateTimestamp();
    this._persistState();
    
    console.log(`[StatePersistence] Restored from checkpoint: ${checkpointId}`);
    return this.currentState;
  }

  // -------------------------------------------------------------------------
  // Getters (unverändert)
  // -------------------------------------------------------------------------

  getCurrentState() {
    return this.currentState;
  }

  getSessionId() {
    return this.sessionId;
  }

  getCurrentPhase() {
    return this.currentState?.context?.current_phase;
  }

  incrementMessageCount() {
    this._ensureSession();
    this.currentState.metrics.total_messages++;
    this._updateTimestamp();
    this._persistState();
  }

  // -------------------------------------------------------------------------
  // Private Methods (unverändert)
  // -------------------------------------------------------------------------

  _ensureSession() {
    if (!this.currentState || !this.sessionId) {
      throw new Error('No active session. Call initSession() or loadSession() first.');
    }
  }

  _ensureDirectories() {
    const dirs = [
      path.join(this.config.stateDir, 'active'),
      path.join(this.config.stateDir, 'archived'),
      path.join(this.config.stateDir, 'recovery')
    ];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  _generateSessionId() {
    return crypto.randomUUID();
  }

  _detectWorkflow(intent) {
    const intentLower = intent.toLowerCase();
    
    if (intentLower.match(/\b(code|develop|program|build|app|api|software|debug)\b/)) {
      return 'software-dev';
    }
    if (intentLower.match(/\b(write|blog|article|content|copy|marketing|text)\b/)) {
      return 'content-creation';
    }
    if (intentLower.match(/\b(research|analyze|study|investigate|report|search)\b/)) {
      return 'research-analysis';
    }
    if (intentLower.match(/\b(strategy|business|plan|market|growth|startup)\b/)) {
      return 'business-strategy';
    }
    
    return 'software-dev';
  }

  _updateTimestamp() {
    if (this.currentState) {
      this.currentState.metadata.updated_at = new Date().toISOString();
      
      const created = new Date(this.currentState.metadata.created_at);
      const now = new Date();
      this.currentState.context.session_duration_minutes = 
        Math.floor((now - created) / 60000);
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

  _atomicWrite(filePath, data) {
    const tempPath = `${filePath}.tmp`;
    
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  }

  _startAutosave() {
    this._stopAutosave();
    
    if (this.config.autosaveInterval > 0) {
      this.autosaveTimer = setInterval(() => {
        this._persistState();
        console.log(`[StatePersistence] Autosaved`);
      }, this.config.autosaveInterval);
    }
  }

  _stopAutosave() {
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }

  _archiveSession(finalStatus) {
    const archiveDir = path.join(
      this.config.stateDir,
      'archived',
      new Date().toISOString().slice(0, 7)
    );
    
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }
    
    const archiveData = {
      ...this.currentState,
      metadata: {
        ...this.currentState.metadata,
        archived_at: new Date().toISOString(),
        final_status: finalStatus
      }
    };
    
    const archivePath = path.join(
      archiveDir,
      `session_${this.sessionId}.json`
    );
    
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

  _findSessionByPartialId(partialId) {
    const activeDir = path.join(this.config.stateDir, 'active');
    
    if (!fs.existsSync(activeDir)) {
      return [];
    }
    
    const files = fs.readdirSync(activeDir)
      .filter(f => f.startsWith('session_') && f.includes(partialId))
      .map(f => path.join(activeDir, f));
    
    return files;
  }

  _generateSessionSummary() {
    return {
      session_id: this.sessionId,
      duration_minutes: this.currentState.context.session_duration_minutes,
      phases_completed: this.currentState.context.completed_phases,
      current_phase: this.currentState.context.current_phase,
      metrics: this.currentState.metrics,
      key_decisions_count: this.currentState.memory.key_decisions.length
    };
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  StatePersistence,
  DEFAULT_STATE,
  StateUpdateSchema,
  MemoryUpdateSchema,
  StateValidationError,
  StateUpdateError,
  validateStateUpdate: (payload) => {
    const result = StateUpdateSchema.safeParse(payload);
    return result.success ? { valid: true, data: result.data } : { valid: false, errors: result.error.issues };
  }
};