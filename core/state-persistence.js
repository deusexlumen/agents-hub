/**
 * State Persistence Layer v4.1
 * 
 * Refactored: Typsichere JSON-Schema-Validierung mit Zod
 * - Kein Regex-basiertes Tag-Parsing
 - Strikt validierte State-Updates
 - Rolling Memory Buffer (max 10 Einträge)
 * 
 * @module state-persistence
 * @version 4.1.0
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { z } = require('zod');

// ============================================================================
// Zod Schemas für strikte Validierung
// ============================================================================

/**
 * Custom Error für State Validation
 */
class StateValidationError extends Error {
  constructor(message, issues, rawPayload) {
    super(message);
    this.name = 'StateValidationError';
    this.issues = issues;
    this.rawPayload = rawPayload;
    this.code = 'STATE_VALIDATION_FAILED';
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      issues: this.issues,
      suggestion: 'Check schema requirements and retry with valid payload'
    };
  }
}

/**
 * Schema für Memory-Updates
 * - Array aus maximal 10 Strings
 * - Jeder String max 1000 Zeichen
 */
const MemoryUpdateSchema = z.object({
  entries: z.array(
    z.string()
      .min(1, 'Memory entry cannot be empty')
      .max(1000, 'Memory entry exceeds 1000 characters')
  )
    .max(10, 'Maximum 10 memory entries allowed per update')
    .optional(),
  
  metadata: z.object({
    timestamp: z.string().datetime().optional(),
    source: z.string().max(100).optional()
  }).optional()
});

/**
 * Schema für State-Transitions
 * Pflichtfelder: status, next_action, confidence
 */
const StateTransitionSchema = z.object({
  status: z.enum([
    'idle',
    'ready',
    'assigning',
    'executing',
    'handoff',
    'error',
    'escalation',
    'completed',
    'pending'
  ], {
    required_error: 'status is required',
    invalid_type_error: 'status must be a valid state enum'
  }),
  
  next_action: z.string()
    .min(1, 'next_action cannot be empty')
    .max(200, 'next_action exceeds 200 characters'),
  
  confidence: z.number()
    .min(0, 'confidence cannot be negative')
    .max(1, 'confidence cannot exceed 1.0')
    .refine((val) => val >= 0 && val <= 1, {
      message: 'confidence must be between 0 and 1'
    }),
  
  memory: MemoryUpdateSchema.optional(),
  
  metadata: z.object({
    agentId: z.string().optional(),
    taskId: z.string().optional(),
    timestamp: z.string().datetime().optional(),
    version: z.string().default('4.1.0')
  }).optional()
});

/**
 * Schema für vollständigen State
 */
const FullStateSchema = z.object({
  session_id: z.string().uuid(),
  status: z.enum(['idle', 'ready', 'assigning', 'executing', 'handoff', 'error', 'escalation', 'completed']),
  next_action: z.string(),
  confidence: z.number().min(0).max(1),
  memory: z.object({
    entries: z.array(z.string()).max(10),
    maxSize: z.literal(10),
    currentIndex: z.number().min(0).max(9)
  }),
  metadata: z.object({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    version: z.string()
  })
});

// ============================================================================
// Rolling Memory Buffer Implementation
// ============================================================================

class RollingMemoryBuffer {
  constructor(maxSize = 10) {
    this.maxSize = maxSize;
    this.entries = [];
    this.currentIndex = 0;
  }

  /**
   * Fügt neue Einträge hinzu, verwirft älteste bei Überlauf
   */
  add(newEntries) {
    if (!Array.isArray(newEntries)) {
      newEntries = [newEntries];
    }

    for (const entry of newEntries) {
      if (this.entries.length < this.maxSize) {
        this.entries.push(entry);
      } else {
        // Rolling: Überschreibe ältesten Eintrag
        this.entries[this.currentIndex] = entry;
        this.currentIndex = (this.currentIndex + 1) % this.maxSize;
      }
    }

    return this.getEntries();
  }

  /**
   * Gibt alle Einträge in chronologischer Reihenfolge zurück
   * (neueste zuletzt)
   */
  getEntries() {
    if (this.entries.length < this.maxSize) {
      return [...this.entries];
    }
    
    // Reordere für chronologische Reihenfolge
    const ordered = [];
    for (let i = 0; i < this.maxSize; i++) {
      const idx = (this.currentIndex + i) % this.maxSize;
      if (this.entries[idx] !== undefined) {
        ordered.push(this.entries[idx]);
      }
    }
    return ordered;
  }

  /**
   * Gibt aktuellsten Eintrag zurück
   */
  getLatest() {
    if (this.entries.length === 0) return null;
    
    if (this.entries.length < this.maxSize) {
      return this.entries[this.entries.length - 1];
    }
    
    const latestIndex = (this.currentIndex - 1 + this.maxSize) % this.maxSize;
    return this.entries[latestIndex];
  }

  /**
   * Löscht alle Einträge
   */
  clear() {
    this.entries = [];
    this.currentIndex = 0;
  }

  /**
   * Gibt aktuelle Größe zurück
   */
  size() {
    return this.entries.length;
  }

  /**
   * Serialisiert für State-Speicherung
   */
  toJSON() {
    return {
      entries: this.getEntries(),
      maxSize: this.maxSize,
      currentIndex: this.currentIndex
    };
  }

  /**
   * Lädt aus JSON
   */
  static fromJSON(data) {
    const buffer = new RollingMemoryBuffer(data.maxSize || 10);
    if (Array.isArray(data.entries)) {
      buffer.entries = data.entries;
      buffer.currentIndex = data.currentIndex || 0;
    }
    return buffer;
  }
}

// ============================================================================
// Default State Structure
// ============================================================================

const DEFAULT_STATE = {
  metadata: {
    session_id: null,
    created_at: null,
    updated_at: null,
    version: '4.1.0',
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
  rolling_buffer: null, // Wird in initSession initialisiert
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
// State Persistence Class
// ============================================================================

class StatePersistence {
  constructor(config = {}) {
    this.config = {
      stateDir: config.stateDir || './session_state',
      autosaveInterval: config.autosaveInterval || 5 * 60 * 1000,
      maxCheckpoints: config.maxCheckpoints || 50,
      rollingBufferSize: config.rollingBufferSize || 10
    };
    
    this.currentState = null;
    this.sessionId = null;
    this.autosaveTimer = null;
    this.rollingBuffer = null;
    
    this._ensureDirectories();
  }

  // -------------------------------------------------------------------------
  // NEU: Zod-basierte State-Update-Verarbeitung mit Rolling Buffer
  // -------------------------------------------------------------------------

  /**
   * Hauptmethode für State-Updates
   * Validiert JSON-Payload strikt über Zod Schema
   * Implementiert Rolling Memory Buffer für Context-Überlauf-Schutz
   * 
   * @param {Object} jsonPayload - Das zu validierende Update-Objekt
   * @returns {Object} - Das validierte und angewendete Update
   * @throws {StateValidationError} - Bei Schema-Verletzungen mit Details
   */
  updateState(jsonPayload) {
    this._ensureSession();

    try {
      // Strikt validierung mit Zod
      const validated = StateTransitionSchema.parse(jsonPayload);
      
      // Update State-Felder
      this.currentState.status = validated.status;
      this.currentState.next_action = validated.next_action;
      this.currentState.confidence = validated.confidence;
      
      // Update Metadata wenn vorhanden
      if (validated.metadata) {
        this.currentState.metadata = {
          ...this.currentState.metadata,
          ...validated.metadata,
          updated_at: new Date().toISOString()
        };
      }

      // Rolling Memory Buffer Update
      if (validated.memory && validated.memory.entries) {
        if (!this.rollingBuffer) {
          this.rollingBuffer = new RollingMemoryBuffer(this.config.rollingBufferSize);
        }
        
        // Füge neue Einträge hinzu (Rolling Buffer verwirft älteste)
        const added = this.rollingBuffer.add(validated.memory.entries);
        
        // Speichere im State
        this.currentState.rolling_buffer = this.rollingBuffer.toJSON();
        
        // Auch in legacy memory übernehmen für Kompatibilität
        this.currentState.memory.key_decisions = added.map(entry => ({
          description: entry,
          timestamp: new Date().toISOString()
        }));
      }

      // Phase-Transition wenn status sich ändert
      this._handlePhaseTransition(validated.status);
      
      this._updateTimestamp();
      this._persistState();

      console.log(`[StatePersistence] State updated: ${validated.status} → ${validated.next_action} (confidence: ${validated.confidence})`);
      
      return {
        success: true,
        status: validated.status,
        next_action: validated.next_action,
        confidence: validated.confidence,
        memorySize: this.rollingBuffer ? this.rollingBuffer.size() : 0
      };

    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
          received: issue.received,
          expected: issue.expected
        }));
        
        const validationError = new StateValidationError(
          `State transition validation failed: ${issues.map(i => `${i.path}: ${i.message}`).join('; ')}`,
          issues,
          jsonPayload
        );
        
        console.error(`[StatePersistence] Validation failed:`, validationError.toJSON());
        
        throw validationError;
      }
      
      // Unbekannter Fehler
      throw new StateValidationError(
        `Unexpected error during state update: ${error.message}`,
        [{ path: 'unknown', message: error.message }],
        jsonPayload
      );
    }
  }

  /**
   * Validiert ein State-Update ohne es anzuwenden (Pre-flight Check)
   * 
   * @param {Object} jsonPayload - Das zu validierende Objekt
   * @returns {Object} - Validation result { valid: boolean, data?: Object, errors?: Array }
   */
  validateStateUpdate(jsonPayload) {
    const result = StateTransitionSchema.safeParse(jsonPayload);
    
    if (result.success) {
      return { 
        valid: true, 
        data: result.data,
        canApply: this.currentState !== null
      };
    } else {
      return {
        valid: false,
        errors: result.error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code
        })),
        suggestion: 'Fix validation errors before retrying'
      };
    }
  }

  /**
   * Gibt aktuelle Memory-Einträge zurück
   */
  getMemoryEntries() {
    if (!this.rollingBuffer) return [];
    return this.rollingBuffer.getEntries();
  }

  /**
   * Gibt aktuellsten Memory-Eintrag zurück
   */
  getLatestMemory() {
    if (!this.rollingBuffer) return null;
    return this.rollingBuffer.getLatest();
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  _handlePhaseTransition(newStatus) {
    const phaseMap = {
      'discovery': 'discovery',
      'planning': 'planning',
      'executing': 'execution',
      'handoff': 'execution',
      'completed': 'delivery',
      'error': 'review',
      'escalation': 'review'
    };

    const targetPhase = phaseMap[newStatus];
    if (!targetPhase) return;

    const currentPhase = this.currentState.context.current_phase;
    
    if (currentPhase !== targetPhase && this.currentState.phases[targetPhase]) {
      // Alte Phase abschließen
      this.currentState.phases[currentPhase].status = 'completed';
      this.currentState.phases[currentPhase].completed_at = new Date().toISOString();
      this.currentState.context.completed_phases.push(currentPhase);
      
      // Neue Phase aktivieren
      this.currentState.phases[targetPhase].status = 'active';
      this.currentState.phases[targetPhase].started_at = new Date().toISOString();
      this.currentState.context.current_phase = targetPhase;
      
      this.currentState.metrics.phases_completed++;
      
      console.log(`[StatePersistence] Phase transition: ${currentPhase} → ${targetPhase}`);
    }
  }

  // -------------------------------------------------------------------------
  // Legacy Methoden (für Rückwärtskompatibilität)
  // -------------------------------------------------------------------------

  /**
   * @deprecated Verwende stattdessen updateState()
   */
  updateMemory(updates) {
    console.warn('[StatePersistence] updateMemory() is deprecated. Use updateState() with Zod schema.');
    
    if (!updates || typeof updates !== 'object') {
      return;
    }

    const entries = updates.key_decisions || [];
    
    return this.updateState({
      status: this.currentState?.status || 'idle',
      next_action: 'memory_update',
      confidence: 1.0,
      memory: {
        entries: entries.map(e => typeof e === 'string' ? e : e.description || String(e))
      }
    });
  }

  /**
   * @deprecated Verwende stattdessen updateState()
   */
  applyStateUpdates(updates) {
    console.warn('[StatePersistence] applyStateUpdates() is deprecated. Use updateState() with Zod schema.');
    
    if (!updates || typeof updates !== 'object') {
      return;
    }

    return this.updateState({
      status: updates.current_phase || 'idle',
      next_action: 'state_update',
      confidence: 0.9,
      metadata: {
        phase_data: updates.phase_data,
        metrics: updates.metrics
      }
    });
  }

  /**
   * @deprecated Verwende stattdessen updateState()
   */
  processStateUpdate(payload) {
    console.warn('[StatePersistence] processStateUpdate() is deprecated. Use updateState() with Zod schema.');
    return this.updateState(payload);
  }

  // -------------------------------------------------------------------------
  // Session Lifecycle
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
    
    // Initialisiere Rolling Buffer
    this.rollingBuffer = new RollingMemoryBuffer(this.config.rollingBufferSize);
    this.currentState.rolling_buffer = this.rollingBuffer.toJSON();
    
    // Initial State
    this.currentState.status = 'idle';
    this.currentState.next_action = 'initialize';
    this.currentState.confidence = 1.0;
    
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
    
    const rawState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    
    // Validiere geladenen State
    try {
      FullStateSchema.parse({
        session_id: rawState.metadata?.session_id,
        status: rawState.status || 'idle',
        next_action: rawState.next_action || 'unknown',
        confidence: rawState.confidence || 0,
        memory: rawState.memory || { entries: [], maxSize: 10, currentIndex: 0 },
        metadata: rawState.metadata
      });
    } catch (e) {
      console.warn('[StatePersistence] Loaded state has validation issues, attempting recovery');
    }
    
    this.currentState = rawState;
    this.sessionId = this.currentState.metadata.session_id;
    
    // Restore Rolling Buffer
    if (this.currentState.rolling_buffer) {
      this.rollingBuffer = RollingMemoryBuffer.fromJSON(this.currentState.rolling_buffer);
    } else {
      this.rollingBuffer = new RollingMemoryBuffer(this.config.rollingBufferSize);
    }
    
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
        duration_minutes: state.context.session_duration_minutes,
        status: state.status,
        next_action: state.next_action,
        confidence: state.confidence
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
    this.rollingBuffer = null;
    
    console.log(`[StatePersistence] Session closed`);
    return summary;
  }

  // -------------------------------------------------------------------------
  // Checkpoints
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
    
    // Restore Rolling Buffer
    if (this.currentState.rolling_buffer) {
      this.rollingBuffer = RollingMemoryBuffer.fromJSON(this.currentState.rolling_buffer);
    }
    
    this._updateTimestamp();
    this._persistState();
    
    console.log(`[StatePersistence] Restored from checkpoint: ${checkpointId}`);
    return this.currentState;
  }

  // -------------------------------------------------------------------------
  // Getters
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

  getRollingBufferStatus() {
    if (!this.rollingBuffer) {
      return { size: 0, maxSize: this.config.rollingBufferSize, full: false };
    }
    
    const size = this.rollingBuffer.size();
    return {
      size,
      maxSize: this.rollingBuffer.maxSize,
      full: size >= this.rollingBuffer.maxSize,
      entries: this.rollingBuffer.getEntries()
    };
  }

  incrementMessageCount() {
    this._ensureSession();
    this.currentState.metrics.total_messages++;
    this._updateTimestamp();
    this._persistState();
  }

  // -------------------------------------------------------------------------
  // Private Methods
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
    
    // Update rolling_buffer vor dem Speichern
    if (this.rollingBuffer) {
      this.currentState.rolling_buffer = this.rollingBuffer.toJSON();
    }
    
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
      final_status: this.currentState.status,
      final_action: this.currentState.next_action,
      final_confidence: this.currentState.confidence,
      metrics: this.currentState.metrics,
      key_decisions_count: this.currentState.memory.key_decisions.length,
      rolling_buffer_size: this.rollingBuffer ? this.rollingBuffer.size() : 0
    };
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  StatePersistence,
  RollingMemoryBuffer,
  StateValidationError,
  MemoryUpdateSchema,
  StateTransitionSchema,
  FullStateSchema,
  DEFAULT_STATE
};