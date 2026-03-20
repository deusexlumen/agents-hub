/**
 * State Persistence Layer v3.0
 * 
 * Strukturiertes State-Management mit:
 * - Tag-basiertem Parsing (<UPDATE_MEMORY>, <UPDATE_STATE>)
 * - Atomaren Write-Operationen (temp+rename)
 * - Session-Recovery
 * 
 * @module state-persistence
 * @version 3.0.0
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================================================
// Default State Structure
// ============================================================================

const DEFAULT_STATE = {
  metadata: {
    session_id: null,
    created_at: null,
    updated_at: null,
    version: '3.0.0',
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
// State Persistence Class
// ============================================================================

class StatePersistence {
  constructor(config = {}) {
    this.config = {
      stateDir: config.stateDir || './session_state',
      autosaveInterval: config.autosaveInterval || 5 * 60 * 1000, // 5 minutes
      maxCheckpoints: config.maxCheckpoints || 50
    };
    
    this.currentState = null;
    this.sessionId = null;
    this.autosaveTimer = null;
    
    this._ensureDirectories();
  }

  // -------------------------------------------------------------------------
  // Session Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Initialisiert eine neue Session
   */
  initSession(userIntent, workflowType = null) {
    this.sessionId = this._generateSessionId();
    const now = new Date().toISOString();
    
    this.currentState = JSON.parse(JSON.stringify(DEFAULT_STATE));
    this.currentState.metadata.session_id = this.sessionId;
    this.currentState.metadata.created_at = now;
    this.currentState.metadata.updated_at = now;
    this.currentState.context.user_intent = userIntent;
    this.currentState.context.workflow_type = workflowType || this._detectWorkflow(userIntent);
    
    // Set initial phase
    this.currentState.phases.discovery.status = 'active';
    this.currentState.phases.discovery.started_at = now;
    
    this._persistState();
    this._startAutosave();
    
    console.log(`[StatePersistence] Session initialized: ${this.sessionId}`);
    return this.sessionId;
  }

  /**
   * Lädt eine existierende Session
   */
  loadSession(sessionId) {
    // Try exact match first
    let statePath = path.join(this.config.stateDir, 'active', `session_${sessionId}.json`);
    
    // If not found, try partial match
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

  /**
   * Gibt die aktuellen wiederherstellbaren Sessions zurück
   */
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

  /**
   * Schließt die aktuelle Session
   */
  closeSession(finalStatus = 'completed') {
    this._ensureSession();
    
    this._stopAutosave();
    
    // Final checkpoint
    this.createCheckpoint('session_closed');
    
    // Archive
    this._archiveSession(finalStatus);
    
    const summary = this._generateSessionSummary();
    
    this.currentState = null;
    this.sessionId = null;
    
    console.log(`[StatePersistence] Session closed`);
    return summary;
  }

  // -------------------------------------------------------------------------
  // State Updates
  // -------------------------------------------------------------------------

  /**
   * Wendet Memory-Updates an (aus <UPDATE_MEMORY> Tags)
   */
  updateMemory(updates) {
    this._ensureSession();
    
    if (!updates || typeof updates !== 'object') {
      return;
    }
    
    // Update key_decisions
    if (Array.isArray(updates.key_decisions)) {
      updates.key_decisions.forEach(decision => {
        this.currentState.memory.key_decisions.push({
          description: decision,
          timestamp: new Date().toISOString()
        });
      });
    }
    
    // Update user_preferences
    if (updates.user_preferences && typeof updates.user_preferences === 'object') {
      this.currentState.memory.user_preferences = {
        ...this.currentState.memory.user_preferences,
        ...updates.user_preferences
      };
    }
    
    // Update technical_constraints
    if (Array.isArray(updates.technical_constraints)) {
      updates.technical_constraints.forEach(constraint => {
        if (!this.currentState.memory.technical_constraints.includes(constraint)) {
          this.currentState.memory.technical_constraints.push(constraint);
        }
      });
    }
    
    // Update learned_patterns
    if (Array.isArray(updates.learned_patterns)) {
      updates.learned_patterns.forEach(pattern => {
        this.currentState.memory.learned_patterns.push({
          ...pattern,
          learned_at: new Date().toISOString()
        });
      });
    }
    
    this._updateTimestamp();
    this._persistState();
  }

  /**
   * Wendet State-Updates an (aus <UPDATE_STATE> Tags)
   */
  applyStateUpdates(updates) {
    this._ensureSession();
    
    if (!updates || typeof updates !== 'object') {
      return;
    }
    
    // Update current_phase
    if (updates.current_phase && this.currentState.phases[updates.current_phase]) {
      const oldPhase = this.currentState.context.current_phase;
      const newPhase = updates.current_phase;
      
      if (oldPhase !== newPhase) {
        // Complete old phase
        this.currentState.phases[oldPhase].status = 'completed';
        this.currentState.phases[oldPhase].completed_at = new Date().toISOString();
        this.currentState.context.completed_phases.push(oldPhase);
        
        // Activate new phase
        this.currentState.phases[newPhase].status = 'active';
        this.currentState.phases[newPhase].started_at = new Date().toISOString();
        this.currentState.context.current_phase = newPhase;
        
        this.currentState.metrics.phases_completed++;
        
        console.log(`[StatePersistence] Phase transition: ${oldPhase} → ${newPhase}`);
      }
    }
    
    // Update phase_data
    if (updates.phase_data && typeof updates.phase_data === 'object') {
      Object.entries(updates.phase_data).forEach(([phase, data]) => {
        if (this.currentState.phases[phase]) {
          this.currentState.phases[phase].data = {
            ...this.currentState.phases[phase].data,
            ...data
          };
        }
      });
    }
    
    // Update metrics
    if (updates.metrics && typeof updates.metrics === 'object') {
      this.currentState.metrics = {
        ...this.currentState.metrics,
        ...updates.metrics
      };
    }
    
    this._updateTimestamp();
    this._persistState();
  }

  /**
   * Erhöht den Message-Counter
   */
  incrementMessageCount() {
    this._ensureSession();
    this.currentState.metrics.total_messages++;
    this._updateTimestamp();
    this._persistState();
  }

  // -------------------------------------------------------------------------
  // Checkpoints
  // -------------------------------------------------------------------------

  /**
   * Erstellt einen benannten Checkpoint
   */
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

  /**
   * Stellt aus einem Checkpoint wieder her
   */
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
  // Getters
  // -------------------------------------------------------------------------

  /**
   * Gibt den aktuellen State zurück
   */
  getCurrentState() {
    return this.currentState;
  }

  /**
   * Gibt die Session-ID zurück
   */
  getSessionId() {
    return this.sessionId;
  }

  /**
   * Gibt die aktuelle Phase zurück
   */
  getCurrentPhase() {
    return this.currentState?.context?.current_phase;
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

  /**
   * Atomarer Write: Schreibt in Temp-Datei, dann rename
   */
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
    
    // Write to temp file
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    
    // Atomic rename
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
      new Date().toISOString().slice(0, 7) // YYYY-MM
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
    
    // Remove from active
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

module.exports = {
  StatePersistence,
  DEFAULT_STATE
};
