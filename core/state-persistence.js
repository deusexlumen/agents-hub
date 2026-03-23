/**
 * State Persistence Layer v5.0
 * 
 * Refactored: Schema-basierte Zod-Validierung (kein Regex-Parsing)
 * - Deterministische State-Updates via validateAndApplyState()
 * - Strikte JSON-Schema-Validierung
 * - Rolling Memory Buffer für Context-Überlauf-Schutz
 * 
 * @module state-persistence
 * @version 5.0.0
 */

import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ============================================================================
// Zod Schemas für strikte Validierung
// ============================================================================

/**
 * StateUpdateSchema - Hauptschema für State-Updates
 * Pflichtfelder: memory (Array von Strings), status (Enum), next_step (String)
 */
export const StateUpdateSchema = z.object({
  memory: z.array(z.string().min(1).max(2000))
    .max(50, 'Maximum 50 memory entries allowed')
    .default([]),
  
  status: z.enum([
    'idle',
    'ready', 
    'planning',
    'executing',
    'reviewing',
    'completed',
    'error',
    'paused'
  ], {
    required_error: 'status is required and must be a valid enum value',
    invalid_type_error: 'status must be one of: idle, ready, planning, executing, reviewing, completed, error, paused'
  }),
  
  next_step: z.string()
    .min(1, 'next_step cannot be empty')
    .max(500, 'next_step exceeds 500 characters')
    .describe('The next action or step to be taken'),
  
  confidence: z.number()
    .min(0, 'confidence cannot be negative')
    .max(1, 'confidence cannot exceed 1.0')
    .default(0.5)
    .describe('Confidence level between 0 and 1'),
  
  metadata: z.object({
    timestamp: z.string().datetime().optional(),
    source: z.string().max(100).optional(),
    agentId: z.string().optional(),
    taskId: z.string().optional()
  }).optional()
});

/**
 * FullStateSchema - Vollständiger State für Persistierung
 */
export const FullStateSchema = z.object({
  session_id: z.string().uuid(),
  status: z.enum(['idle', 'ready', 'planning', 'executing', 'reviewing', 'completed', 'error', 'paused']),
  next_step: z.string(),
  confidence: z.number().min(0).max(1),
  memory: z.array(z.string()),
  metadata: z.object({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    version: z.string()
  })
});

// ============================================================================
// Custom Validation Error
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

  /**
   * Generiert einen Retry-Prompt für den Orchestrator
   */
  getRetryPrompt() {
    const issuesList = this.issues.map(i => 
      `- ${i.path}: ${i.message}`
    ).join('\n');
    
    return `Your previous state update was invalid. Please fix these issues and respond with valid JSON:\n\nValidation Errors:\n${issuesList}\n\nRequirements:\n- memory: Array of strings (max 50 entries, each max 2000 chars)\n- status: One of [idle, ready, planning, executing, reviewing, completed, error, paused]\n- next_step: String describing the next action (required, 1-500 chars)\n- confidence: Number between 0 and 1\n\nRespond ONLY with valid JSON matching the schema.`;
  }

  toJSON() {
    return {
      code: this.code,
      name: this.name,
      message: this.message,
      issues: this.issues,
      timestamp: this.timestamp,
      retryPrompt: this.getRetryPrompt()
    };
  }
}

// ============================================================================
// Default State Structure
// ============================================================================

export const DEFAULT_STATE = {
  metadata: {
    session_id: null,
    created_at: null,
    updated_at: null,
    version: '5.0.0',
    checkpoint_count: 0
  },
  context: {
    workflow_type: 'software-dev',
    current_phase: 'discovery',
    completed_phases: [],
    user_intent: null,
    session_duration_minutes: 0
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
    phases_completed: 0,
    validation_errors: 0,
    checkpoints_created: 0
  }
};

// ============================================================================
// State Persistence Class
// ============================================================================

export class StatePersistence {
  constructor(config = {}) {
    this.config = {
      stateDir: config.stateDir || './session_state',
      autosaveInterval: config.autosaveInterval || 5 * 60 * 1000,
      maxCheckpoints: config.maxCheckpoints || 50,
      ...config
    };
    
    this.currentState = null;
    this.sessionId = null;
    this.autosaveTimer = null;
    
    this._ensureDirectories();
  }

  // ============================================================================
  // Kernmethode: Zod-basierte Validierung und Anwendung
  // ============================================================================

  /**
   * Validiert und wendet einen State-Update an
   * Ersetzt die alte Regex-basierte parseTags-Logik
   * 
   * @param {Object} jsonOutput - Das zu validierende JSON-Objekt
   * @returns {Object} - Das angewendete, validierte State-Update
   * @throws {StateValidationError} - Bei Schema-Verletzungen
   */
  validateAndApplyState(jsonOutput) {
    this._ensureSession();

    try {
      // Strikte Zod-Validierung
      const validated = StateUpdateSchema.parse(jsonOutput);
      
      // Wende Update auf State an
      this._applyValidatedState(validated);
      
      // Persistiere
      this._persistState();
      
      console.log(`[StatePersistence] State validated and applied: status=${validated.status}, next_step="${validated.next_step}", memory_entries=${validated.memory.length}`);
      
      return {
        success: true,
        applied: validated,
        state: this.getCurrentState()
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
          `State validation failed: ${issues.map(i => `${i.path}: ${i.message}`).join('; ')}`,
          issues,
          jsonOutput
        );
        
        // Inkrementiere Fehler-Metrik
        if (this.currentState) {
          this.currentState.metrics.validation_errors++;
        }
        
        console.error(`[StatePersistence] Validation failed:`, validationError.toJSON());
        
        throw validationError;
      }
      
      // Unbekannter Fehler
      throw new StateValidationError(
        `Unexpected error during state validation: ${error.message}`,
        [{ path: 'unknown', message: error.message }],
        jsonOutput
      );
    }
  }

  /**
   * Pre-flight Validierung ohne Anwendung
   * 
   * @param {Object} jsonOutput - Das zu validierende Objekt
   * @returns {Object} - { valid: boolean, data?, errors?, retryPrompt? }
   */
  validateState(jsonOutput) {
    const result = StateUpdateSchema.safeParse(jsonOutput);
    
    if (result.success) {
      return {
        valid: true,
        data: result.data,
        canApply: this.currentState !== null
      };
    } else {
      const issues = result.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code
      }));
      
      const tempError = new StateValidationError('Validation failed', issues, jsonOutput);
      
      return {
        valid: false,
        errors: issues,
        retryPrompt: tempError.getRetryPrompt()
      };
    }
  }

  /**
   * Intern: Wendet validierten State an
   */
  _applyValidatedState(validated) {
    // Update Haupt-State
    this.currentState.state.status = validated.status;
    this.currentState.state.next_step = validated.next_step;
    this.currentState.state.confidence = validated.confidence;
    this.currentState.state.iteration_count++;
    
    // Merge Memory (append, nicht replace)
    if (validated.memory && validated.memory.length > 0) {
      this.currentState.state.memory = [
        ...this.currentState.state.memory,
        ...validated.memory
      ].slice(-50); // Keep last 50
    }
    
    // Update Metadata
    this.currentState.metadata.updated_at = new Date().toISOString();
    
    if (validated.metadata) {
      Object.assign(this.currentState.metadata, validated.metadata);
    }
    
    // Phase-Transition-Logik
    this._handlePhaseTransition(validated.status);
    
    this._updateTimestamp();
  }

  /**
   * Legacy-Wrapper für Rückwärtskompatibilität
   * @deprecated Nutze validateAndApplyState()
   */
  updateState(jsonPayload) {
    console.warn('[StatePersistence] updateState() is deprecated. Use validateAndApplyState().');
    return this.validateAndApplyState(jsonPayload);
  }

  // ============================================================================
  // Session Lifecycle
  // ============================================================================

  initSession(userIntent, workflowType = null) {
    this.sessionId = this._generateSessionId();
    const now = new Date().toISOString();
    
    this.currentState = JSON.parse(JSON.stringify(DEFAULT_STATE));
    this.currentState.metadata.session_id = this.sessionId;
    this.currentState.metadata.created_at = now;
    this.currentState.metadata.updated_at = now;
    this.currentState.context.user_intent = userIntent;
    this.currentState.context.workflow_type = workflowType || this._detectWorkflow(userIntent);
    
    this._persistState();
    this._startAutosave();
    
    console.log(`[StatePersistence] Session initialized: ${this.sessionId}`);
    return this.sessionId;
  }

  loadSession(sessionId) {
    const statePath = path.join(this.config.stateDir, 'active', `session_${sessionId}.json`);
    
    if (!fs.existsSync(statePath)) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    const rawState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    
    this.currentState = rawState;
    this.sessionId = this.currentState.metadata.session_id;
    
    this._startAutosave();
    
    console.log(`[StatePersistence] Session loaded: ${this.sessionId}`);
    return this.currentState;
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

  // ============================================================================
  // Checkpoints
  // ============================================================================

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

  // ============================================================================
  // Getters
  // ============================================================================

  getCurrentState() {
    return this.currentState;
  }

  getSessionId() {
    return this.sessionId;
  }

  getCurrentPhase() {
    return this.currentState?.context?.current_phase;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  _handlePhaseTransition(newStatus) {
    const phaseMap = {
      'planning': 'discovery',
      'executing': 'planning', 
      'reviewing': 'executing',
      'completed': 'reviewing'
    };

    const completedPhase = phaseMap[newStatus];
    if (completedPhase && !this.currentState.context.completed_phases.includes(completedPhase)) {
      this.currentState.context.completed_phases.push(completedPhase);
      this.currentState.metrics.phases_completed++;
    }
    
    // Update current phase based on status
    const statusToPhase = {
      'planning': 'discovery',
      'executing': 'planning',
      'reviewing': 'executing',
      'completed': 'reviewing'
    };
    
    if (statusToPhase[newStatus]) {
      this.currentState.context.current_phase = statusToPhase[newStatus];
    }
  }

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

  _generateSessionSummary() {
    return {
      session_id: this.sessionId,
      duration_minutes: this.currentState.context.session_duration_minutes,
      phases_completed: this.currentState.context.completed_phases,
      current_phase: this.currentState.context.current_phase,
      final_status: this.currentState.state.status,
      final_step: this.currentState.state.next_step,
      final_confidence: this.currentState.state.confidence,
      metrics: this.currentState.metrics,
      memory_entries: this.currentState.state.memory.length
    };
  }
}

// ============================================================================
// Exports
// ============================================================================

export default StatePersistence;